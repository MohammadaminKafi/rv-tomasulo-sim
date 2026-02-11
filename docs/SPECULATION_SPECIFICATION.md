# Phase 3: Tomasulo + Speculation (Branch Speculation & Misprediction Recovery)

This document defines the **complete expected behavior** of the Tomasulo algorithm with speculation support for teaching dynamic scheduling with speculative execution.

---

## 1. Overview

Phase 3 extends Phase 2's Tomasulo algorithm with:

- **Reorder Buffer (ROB)** for in-order commit and precise architectural state
- **Speculative fetch and issue past unresolved branches**
- **Branch misprediction recovery** with flush and RAT restoration
- **Precise architectural state** maintained via in-order ROB commit
- **Store commit via ROB** (stores only update memory when they reach ROB head)

**Key changes from Phase 2:**
- ARF is ONLY updated at ROB commit (not CDB broadcast)
- RAT points to ROB entries (not RS entries)
- Instructions allocate both an RS entry and an ROB entry
- Branches can be speculated past (no issue stall on pending branch)
- Misprediction triggers flush of younger speculative instructions

---

## 2. Fixed Design Decisions (All Phases)

These decisions remain constant:

1. **Single CDB** with **oldest-first** arbitration (by program order / instrIndex)
2. **In-order issue**, **out-of-order execute**, **in-order commit**
3. **Same-cycle wakeup**: CDB broadcast wakes dependents immediately, but they start executing next cycle
4. **In-order store commit** via Store Queue within ROB

---

## 3. App-level Behavior

### 3.1 User Interface Components

Same as Phase 2, with additional displays for Phase 3:

1. **Assembly Code Editor**: Text area for entering assembly code
2. **Control Buttons**:
   - **Load/Assemble**: Parse and validate code; show errors if invalid
   - **Reset**: Return to initial state
   - **Step**: Advance exactly one cycle
   - **Run / Pause**: Advance continuously
   - **Run N Cycles**: Advance N cycles
   - **Run to Completion**: Run until halt

3. **Display Panels** (updated every cycle):
   - **Cycle Number** and **PC Value**
   - **Instruction Status Table**: Issue, Execute Start, Execute End, Write Result, Commit, Squashed
   - **ARF (Architectural Register File)**: Committed values only
   - **RAT**: Maps registers → ROB entry tags (or "ready")
   - **ROB Table**: Head/tail pointers, all entry fields
   - **Reservation Stations**: Grouped by functional unit type
   - **CDB Status**: Current broadcast or idle
   - **Load/Store Queue**: Current memory operations
   - **Branch Speculation State**: Predicted direction, resolution, recovery events
   - **Memory View**: All reads/writes
   - **Event Log**: All events including flush/recovery

### 3.2 Determinism Requirement

The simulator remains **fully deterministic**: same program + same configuration → identical cycle traces.

---

## 4. ISA Reference (Same as Phase 2)

### 4.1 Supported Instructions

| Instruction | Syntax | EX Latency | Functional Unit |
|-------------|--------|------------|-----------------|
| ADD | `ADD rd, rs1, rs2` | 2 | INT |
| SUB | `SUB rd, rs1, rs2` | 2 | INT |
| MUL | `MUL rd, rs1, rs2` | 5 | MUL |
| DIV | `DIV rd, rs1, rs2` | 7 | DIV |
| AND | `AND rd, rs1, rs2` | 1 | INT |
| OR  | `OR rd, rs1, rs2` | 1 | INT |
| XOR | `XOR rd, rs1, rs2` | 1 | INT |
| ADDI | `ADDI rd, rs1, imm` | 2 | INT |
| SUBI | `SUBI rd, rs1, imm` | 2 | INT |
| MULI | `MULI rd, rs1, imm` | 5 | MUL |
| DIVI | `DIVI rd, rs1, imm` | 7 | DIV |
| LD | `LD rd, imm(rs1)` | 1 + 1 | LOAD |
| ST | `ST rs2, imm(rs1)` | 1 + 1 | STORE |
| BEQ | `BEQ rs1, rs2, label` | 1 | BRANCH |
| BNE | `BNE rs1, rs2, label` | 1 | BRANCH |
| J | `J label` | 1 | BRANCH |
| NOP | `NOP` | 0 | - |

### 4.2 Register and Memory Semantics

- **32 integer registers**: x0 through x31
- **x0 is hardwired to 0**: Reads always return 0; writes are ignored
- **Memory**: 1024 bytes, byte-addressed, 32-bit words, 4-byte aligned, little-endian
- **Out-of-bounds/misaligned access**: Halts simulation with explicit error
- **Divide-by-zero**: Halts simulation with explicit error

---

## 5. Microarchitectural State

### 5.1 Architectural Register File (ARF)

The ARF holds **committed** architectural register values.

- **Size**: 32 registers (x0-x31)
- **x0**: Hardwired to 0; writes ignored
- **Update timing**: Updated ONLY at ROB commit (NOT during CDB broadcast)
- **Initial state**: All registers = 0

```typescript
interface ArchitecturalRegisterFile {
  registers: number[];  // 32 registers, x0 always 0
}
```

### 5.2 Register Alias Table (RAT)

Maps each architectural register to either:
- A **ROB entry index** of the instruction that will produce the value, OR
- **null** (meaning the current value is in ARF and ready)

```typescript
interface RATEntry {
  robIndex: number | null;  // ROB entry producing this value, or null if ready
}

type RAT = Map<number, RATEntry>;  // register number → RATEntry
```

**RAT update rules:**
- **On Issue**: If instruction writes to `rd` (rd ≠ 0), set `RAT[rd] = { robIndex }`
- **On Commit**: If `RAT[rd]` still points to the committing ROB entry, set `RAT[rd] = null`
- **On Mispredict Recovery**: Restore RAT from checkpoint saved at branch issue

### 5.3 Reorder Buffer (ROB)

The ROB is a circular buffer that maintains program order for in-order commit.

**Configuration:**
- **Size**: Configurable (default: 8 entries)
- **Head pointer**: Points to oldest uncommitted instruction
- **Tail pointer**: Points to next free entry for allocation

**ROB Entry Structure:**

```typescript
interface ROBEntry {
  // Identification
  index: number;              // ROB entry index (0 to size-1)
  busy: boolean;              // Entry is occupied
  instrIndex: number;         // Program order index for tie-breaking
  pc: number;                 // Instruction PC (for debugging)
  
  // Instruction info
  type: ROBEntryType;         // ALU, LOAD, STORE, BRANCH, JUMP, NOP
  instruction: Instruction;   // The instruction
  
  // Destination register (for ALU/LOAD)
  destReg: number | null;     // Architectural destination register
  value: number | null;       // Computed result
  ready: boolean;             // Result is ready (execution complete)
  
  // Store-specific fields
  storeAddress: number | null;   // Computed store address
  storeAddressReady: boolean;    // Address has been computed
  storeData: number | null;      // Store data value
  storeDataReady: boolean;       // Data is ready
  
  // Branch-specific fields
  predictedTaken: boolean;       // Predicted direction
  predictedTarget: number;       // Predicted target PC
  actualTaken: boolean | null;   // Actual direction (set on resolution)
  actualTarget: number | null;   // Actual target PC (set on resolution)
  branchResolved: boolean;       // Branch has been resolved
  mispredicted: boolean;         // Was mispredicted
  
  // Checkpointing for branch recovery
  ratCheckpoint: Map<number, RATEntry> | null;  // RAT state at issue time
  
  // Execution state tracking
  state: ROBState;            // ISSUED, EXECUTING, WRITE_RESULT, COMMITTING, COMMITTED, SQUASHED
  rsId: string | null;        // Associated RS entry ID
  
  // Cycle tracking
  issueCycle: number | null;
  execStartCycle: number | null;
  execEndCycle: number | null;
  writeResultCycle: number | null;
  commitCycle: number | null;
}

enum ROBEntryType {
  ALU = 'ALU',
  LOAD = 'LOAD',
  STORE = 'STORE',
  BRANCH = 'BRANCH',
  JUMP = 'JUMP',
  NOP = 'NOP',
}

enum ROBState {
  ISSUED = 'ISSUED',           // Issued, waiting for execution
  EXECUTING = 'EXECUTING',     // Currently executing
  WRITE_RESULT = 'WRITE_RESULT', // Wrote result, waiting for commit
  COMMITTING = 'COMMITTING',   // At ROB head, ready to commit
  COMMITTED = 'COMMITTED',     // Successfully committed
  SQUASHED = 'SQUASHED',       // Flushed due to mispredict
}
```

**Tag identity**: The tag used by RAT and RS Q-fields is the ROB entry index (e.g., "ROB3").

### 5.4 Reservation Stations (RS)

Same as Phase 2, but:
- Each RS entry references its ROB entry (`robIndex`)
- Q-fields (Qj, Qk) now hold ROB indices instead of RS IDs
- Wakeup occurs when a CDB broadcast matches Q-field ROB tag

**RS Entry Updates:**

```typescript
interface ReservationStation {
  id: string;                      // RS ID (e.g., "INT0")
  rsType: RSType;                  // INT, MUL, DIV, LOAD, STORE, BRANCH
  busy: boolean;                   // Entry occupied
  op: InstructionType | null;      // Operation
  
  // Source operands (now tagged with ROB indices)
  Vj: number | null;               // Value (if ready)
  Qj: number | null;               // ROB index of producer (null if ready)
  Vk: number | null;               // Value (if ready)  
  Qk: number | null;               // ROB index of producer (null if ready)
  
  imm: number;                     // Immediate value
  address: number | null;          // Computed address (for LD/ST)
  addressReady: boolean;           // Address computed
  
  // ROB linkage
  robIndex: number;                // Destination ROB entry index
  destReg: number | null;          // Architectural destination
  
  // Execution state
  state: RSState;                  // WAITING, READY, EXECUTING, DONE
  remainingCycles: number;         // Cycles left
  result: number | null;           // Computed result
  
  instrIndex: number;              // Program order index
  instruction: Instruction | null;
  
  // Cycle tracking
  issueCycle: number | null;
  execStartCycle: number | null;
  execEndCycle: number | null;
}
```

### 5.5 Functional Units (FU)

Same as Phase 2:

| FU Type | Count | Instructions |
|---------|-------|--------------|
| INT | 1 | ADD, SUB, AND, OR, XOR, ADDI, SUBI |
| MUL | 1 | MUL, MULI |
| DIV | 1 | DIV, DIVI |
| LOAD | 1 | LD |
| STORE | 1 | ST |
| BRANCH | 1 | BEQ, BNE, J |

**Arbitration**: When multiple READY RS entries compete for an FU, select **oldest first** (lowest instrIndex).

### 5.6 Common Data Bus (CDB)

Single CDB with deterministic oldest-first arbitration.

**CDB Broadcast Structure:**

```typescript
interface CDBBroadcast {
  robIndex: number;        // ROB entry index (the tag)
  value: number;           // Computed value
  destReg: number | null;  // Destination register
  instrIndex: number;      // Program order index
}
```

**CDB responsibilities:**
1. Wake up RS operands (clear Q-fields, set V-fields)
2. Mark ROB entry as ready (set `ready = true`, `value = result`)

**Important**: ARF is NOT updated during CDB broadcast. ARF is only updated at ROB commit.

### 5.7 Memory Ordering (Store Queue)

**Store Queue** is implemented within the ROB:
- Stores in ROB are ordered by program order
- Stores only write to memory at commit (when at ROB head)
- Loads must check older stores for address conflicts

**Load behavior:**
- Loads can execute speculatively
- Load-to-store forwarding is **disabled** for simplicity (Phase 3)
- Loads must wait if any older store address is unknown

**Store behavior:**
- Store address calculation can proceed when base operand ready
- Store data can arrive via CDB
- Store memory write only occurs at ROB commit

---

## 6. Speculation and Branch Behavior

### 6.1 Prediction Policy (Phase 3 Baseline)

Fixed prediction policy for Phase 3 (no dynamic predictor tables):

- **BEQ/BNE**: Always predict **not taken**
- **J**: Always **taken** (unconditional jump)

The predicted next PC is computed at issue time:
- For predicted not-taken branches: `predictedNextPC = PC + 4`
- For predicted taken branches/jumps: `predictedNextPC = target`

### 6.2 Branch/JUMP Issue

When a branch or jump is issued:

1. **Allocate ROB entry** with branch-specific fields
2. **Record prediction**:
   - `predictedTaken`: false for BEQ/BNE, true for J
   - `predictedTarget`: the label/immediate target
3. **Checkpoint RAT**: Save current RAT state in `ratCheckpoint`
4. **Set PC to predicted next PC**:
   - Not-taken: PC + 4
   - Taken: target
5. **Continue issuing** from predicted path (speculation)

### 6.3 Branch Resolution

Branch condition is evaluated when operands are ready:

1. **Compute actual outcome**:
   - BEQ: `taken = (Vj == Vk)`
   - BNE: `taken = (Vj != Vk)`
   - J: `taken = true`
2. **Compute actual target** (if taken)
3. **Compare with prediction**:
   - `mispredicted = (predictedNextPC != actualNextPC)`
   - Where `actualNextPC = actualTaken ? actualTarget : PC + 4`
4. **Mark branch as resolved** in ROB

### 6.4 Misprediction Detection Timing

Misprediction is detected when:
- Branch execution completes (enters DONE state in RS)
- Comparison of predicted vs actual next PC differs

### 6.5 Checkpointing

At branch/jump issue, checkpoint:
- **RAT state**: Deep copy of entire RAT
- **ROB tail pointer**: The branch's own ROB index serves as marker

### 6.6 Recovery (Flush)

On misprediction detection, in the **same cycle** as branch completes:

1. **Redirect PC** to correct target (actualNextPC)
2. **Squash all younger instructions**:
   - All ROB entries with `index > branchROBIndex` (accounting for wraparound)
   - Mark as `state = SQUASHED`
3. **Free associated RS entries** for squashed ROB entries
4. **Cancel any FU work** for squashed instructions (immediate stop)
5. **Remove squashed stores** from commit consideration
6. **Restore RAT** from branch's checkpoint
7. **Reset ROB tail** to point to entry after the branch

**Important**: The branch itself is NOT squashed - it remains in ROB to be committed.

---

## 7. Cycle Semantics (Phase Ordering)

Each cycle executes these phases in order:

### Phase 1: Commit (at ROB head)

```
FOR each entry from ROB head (up to commit width, default 1):
  IF entry.busy AND entry.ready AND entry.state == WRITE_RESULT:
    IF entry.type == STORE:
      IF storeAddressReady AND storeDataReady:
        Write to memory: mem[storeAddress] = storeData
        Mark entry as COMMITTED
        Advance ROB head
    ELSE IF entry.type == BRANCH or JUMP:
      IF branchResolved:
        IF mispredicted:
          Execute recovery (flush younger, restore RAT)
          Redirect PC
        Mark entry as COMMITTED
        Advance ROB head
    ELSE (ALU, LOAD):
      IF destReg != 0 AND destReg != null:
        ARF[destReg] = value
        IF RAT[destReg].robIndex == entry.index:
          RAT[destReg] = null  // Clear rename
      Mark entry as COMMITTED
      Advance ROB head
```

### Phase 2: CDB Broadcast (Write Result)

```
Find all RS entries in DONE state
Sort by instrIndex (oldest first)
IF any DONE entries:
  Select oldest (rs)
  IF rs.op == STORE:
    // Stores don't broadcast, but mark ROB ready
    robEntry = ROB[rs.robIndex]
    robEntry.storeData = rs.Vk
    robEntry.storeDataReady = true
    robEntry.ready = (storeAddressReady AND storeDataReady)
    Free RS
  ELSE:
    Broadcast on CDB: { robIndex: rs.robIndex, value: rs.result }
    
    // Wake up waiting RS operands
    FOR each other RS entry:
      IF Qj == rs.robIndex: Vj = value, Qj = null
      IF Qk == rs.robIndex: Vk = value, Qk = null
    
    // Update ROB entry
    ROB[rs.robIndex].value = rs.result
    ROB[rs.robIndex].ready = true
    ROB[rs.robIndex].state = WRITE_RESULT
    
    Free RS
    Record writeResultCycle
```

### Phase 3: Check Operand Readiness

```
FOR each RS entry in WAITING state:
  IF Qj == null AND Qk == null:
    Transition to READY
  // For LOAD/STORE: if Qj == null and address not computed, can start addr calc
```

### Phase 4: Start Execution

```
FOR each FU type:
  IF FU is free (no entry EXECUTING):
    Find all READY RS entries of this type
    Sort by instrIndex (oldest first)
    IF any READY:
      Start execution for oldest:
        state = EXECUTING
        remainingCycles = getLatency(op)
        Record execStartCycle
```

### Phase 5: Continue/Complete Execution

```
FOR each RS entry in EXECUTING state:
  remainingCycles--
  IF remainingCycles == 0:
    Compute result
    state = DONE
    Record execEndCycle
    
    // For branches: check for mispredict
    IF op == BEQ/BNE/J:
      Evaluate branch condition
      Compare with prediction
      Set branchResolved, actualTaken, actualTarget, mispredicted
```

### Phase 6: Fetch/Issue

```
IF PC is valid AND ROB not full AND appropriate RS available:
  instruction = fetch(PC)
  
  // Allocate ROB entry
  robEntry = allocate ROB at tail
  robEntry.instrIndex = programIndex
  robEntry.instruction = instruction
  robEntry.pc = PC
  
  // Allocate RS entry
  rs = allocate RS of correct type
  rs.robIndex = robEntry.index
  
  // Read operands from RAT/ARF
  FOR each source register:
    IF RAT[src].robIndex != null:
      IF ROB[RAT[src].robIndex].ready:
        V = ROB[RAT[src].robIndex].value
        Q = null
      ELSE:
        V = null
        Q = RAT[src].robIndex
    ELSE:
      V = ARF[src]
      Q = null
  
  // Update RAT for destination
  IF instruction writes register AND rd != 0:
    RAT[rd].robIndex = robEntry.index
  
  // Handle branch prediction
  IF instruction is branch/jump:
    Checkpoint RAT
    predictedNextPC = compute based on prediction
    PC = predictedNextPC
  ELSE:
    PC = PC + 4
  
  Record issueCycle
```

### Phase 7: Recovery (if mispredict detected this cycle)

If a branch in Phase 5 detected a mispredict, OR a branch commits with mispredict in Phase 1:

```
branchEntry = the mispredicted branch ROB entry

// Squash younger ROB entries
FOR each ROB entry younger than branchEntry:
  entry.state = SQUASHED
  entry.busy = false
  
  // Free associated RS
  IF entry.rsId != null:
    Free RS[entry.rsId]

// Restore RAT
RAT = deep copy of branchEntry.ratCheckpoint

// Reset ROB tail
ROBTail = (branchEntry.index + 1) % ROBSize

// Redirect PC
PC = branchEntry.actualNextPC
```

---

## 8. Same-Cycle Wakeup Rule

Values broadcast on CDB in a cycle update waiting RS operands **in that same cycle**, but those entries may only **start executing in a later phase** (typically the Start Execution phase of the **next** cycle).

This means:
- An instruction that becomes READY due to wakeup in Phase 2 of cycle N
- Can be selected for Start Execution in Phase 4 of cycle N+1

---

## 9. Issue Rules

Issue is in program order by PC:

1. **Speculation allowed**: Issue continues past unresolved branches using predicted path
2. **Issue requirements**:
   - Free RS entry of correct type available
   - Free ROB entry available
   - (For stores) Store buffer space available
3. **If any requirement fails**: Issue stalls, PC does not advance
4. **Issue rate**: 1 instruction per cycle (for teaching simplicity)

On issue:
- Allocate ROB entry (at tail)
- Allocate RS entry
- Set RAT[rd] = ROB entry index (for register-writing ops, rd ≠ 0)
- Read operands from RAT/ROB/ARF
- For branches: checkpoint RAT, set predicted PC

---

## 10. Commit Rules (Precise State)

Commit proceeds strictly in ROB order from head:

1. **Commit width**: 1 per cycle (default, configurable)
2. **Commit requirements**:
   - Entry is valid (not squashed)
   - Entry is ready (execution complete)
   - For stores: both address and data ready
   - For branches: resolved (mispredict check done)
3. **On commit**:
   - **ALU/LOAD**: Write ARF[destReg] = value (if destReg != 0), clear RAT if still pointing to this ROB
   - **STORE**: Write memory[storeAddress] = storeData
   - **BRANCH**: If mispredicted, trigger recovery (if not already done)
4. **Commit stall**: If ROB head is not ready, younger instructions cannot commit

---

## 11. Memory Behavior Under Speculation

### 11.1 Store Handling

- Stores compute address when base operand ready
- Store data arrives via CDB broadcast or is immediately available
- **Stores only write memory at commit** (when at ROB head)
- Speculative stores do NOT affect memory

### 11.2 Load Handling

- Loads can execute speculatively
- Load reads memory when it executes (speculative read)
- Load result is held in ROB until commit
- **On mispredict flush**: Load ROB entry is squashed (no architectural effect)

### 11.3 Load-Store Ordering (Simplified)

For Phase 3 simplicity:
- **No store-to-load forwarding**
- Loads must wait until all older store addresses are known
- If a load's address matches an older store's address, load waits until store commits

---

## 12. Recovery / Flush Rules (Detailed)

On misprediction detection:

1. **Identify branch ROB index** (`robBranch`)
2. **Squash younger ROB entries**:
   - All entries with index > robBranch (with wraparound handling)
   - Set `state = SQUASHED`, `busy = false`
3. **Free associated RS entries**:
   - For each squashed ROB entry, free its RS
4. **Cancel FU work**:
   - Any RS in EXECUTING state for squashed instruction stops immediately
   - Instruction does NOT complete, does NOT broadcast
5. **Clear pending load/store**:
   - Squashed stores removed from commit consideration
6. **Restore RAT**:
   - RAT = deep copy of branch's checkpoint
7. **Reset ROB tail**:
   - `ROBTail = (robBranch + 1) % ROBSize`
8. **Redirect PC**:
   - `PC = actualNextPC` (correct target)

**Timing**: Recovery happens during the cycle phase where mispredict is detected. If detected in Phase 5 (execution complete), recovery executes before Phase 6 (issue). If detected at commit (Phase 1), recovery executes as part of commit.

---

## 13. Determinism and Arbitration Policies

All tie-breaking uses **oldest-first** (lowest instrIndex):

1. **RS → FU selection**: Oldest READY RS starts executing
2. **CDB arbitration**: Oldest DONE RS broadcasts
3. **Issue**: In program order (single issue per cycle)
4. **Commit**: In program order (ROB head)

For multiple branches resolving same cycle (rare):
- Handle in ROB order (oldest branch first)
- Only the oldest mispredicted branch triggers flush

---

## 14. Completion Conditions and Error Handling

### 14.1 Normal Completion

Program is complete when ALL of:
- PC is past end of program
- ROB is empty (head == tail, no busy entries)
- All RS entries are free
- CDB is idle

### 14.2 Error Handling

Errors halt simulation with clear message:
- **Illegal instruction**: Unknown opcode
- **Memory fault**: Out of bounds or misaligned
- **Divide-by-zero**: DIV/DIVI with divisor = 0

Errors are treated as precise exceptions: they are detected at commit time for precise architectural state.

---

## 15. Trace / Observability Requirements

Every cycle must generate trace with:

- **Issue events**: Success/stall with reason
- **ROB events**: Allocate, update, commit, squash
- **RAT events**: Changes and checkpoint/restore
- **RS events**: Allocate, operand wakeup, execution start/continue/finish
- **CDB events**: Arbitration decision, broadcast, wakeups
- **Branch events**: Prediction decision, resolution, mispredict detection
- **Recovery events**: Which ROB entries squashed
- **Memory events**: Reads and writes (including store commits)

The UI must reconstruct per-instruction lifetimes and identify squashed instructions.

---

## 16. Example Programs and Expected Behavior

### 16.1 Example 1: Speculation Past Branch (Correct Prediction)

```assembly
      ADDI x1, x0, 0     # x1 = 0
      ADDI x2, x0, 10    # x2 = 10
      BEQ  x1, x0, skip  # x1 == 0, should branch (but predicted not-taken)
      ADDI x3, x0, 99    # This will be speculatively issued
skip: ADDI x4, x0, 5     # Target if taken
```

**Wait**: BEQ with x1=0 and x0=0 should be TAKEN, so with predict-not-taken, this will mispredict.

Let me provide a correct prediction case:

```assembly
      ADDI x1, x0, 1     # x1 = 1
      ADDI x2, x0, 0     # x2 = 0
      BEQ  x1, x2, skip  # x1 != x2, not taken (correctly predicted)
      ADDI x3, x0, 99    # Executed (not squashed)
skip: ADDI x4, x0, 5     # Also executed
```

**Expected behavior:**
- Cycle 1: Issue ADDI x1
- Cycle 2: Issue ADDI x2, ADDI x1 executes
- Cycle 3: Issue BEQ, ADDI x2 executes, ADDI x1 broadcasts & commits
- Cycle 4: Issue ADDI x3 (speculative), BEQ waits for x1, x2
- Cycle 5: Issue ADDI x4, BEQ executes (not taken = correct prediction)
- Continue: All instructions commit in order, no flush

### 16.2 Example 2: Misprediction Recovery

```assembly
      ADDI x1, x0, 5     # x1 = 5
      ADDI x2, x0, 5     # x2 = 5
      BEQ  x1, x2, target  # x1 == x2, TAKEN (mispredicted as not-taken)
      ADDI x3, x0, 99    # Wrong path - will be squashed
      ADDI x4, x0, 88    # Wrong path - will be squashed
target: ADDI x5, x0, 1   # Correct path
```

**Expected behavior:**
- Cycle 1: Issue ADDI x1
- Cycle 2: Issue ADDI x2
- Cycle 3: Issue BEQ, checkpoint RAT, predict not-taken (PC = BEQ+4)
- Cycle 4: Issue ADDI x3 (speculative, wrong path)
- Cycle 5: Issue ADDI x4 (speculative, wrong path)
- Cycle (BEQ resolves): BEQ operands ready, execute, detect mispredict
  - Squash ADDI x3, ADDI x4 ROB entries
  - Restore RAT from checkpoint
  - Redirect PC to `target`
- Next cycle: Issue ADDI x5 from correct path

### 16.3 Example 3: ROB Commit Blocking

```assembly
      DIV  x1, x2, x3    # Long latency (7 cycles)
      ADDI x4, x0, 10    # Fast, but can't commit until DIV commits
      ADDI x5, x0, 20    # Also blocked
```

**Expected behavior:**
- Cycle 1: Issue DIV x1
- Cycle 2: Issue ADDI x4, DIV starts
- Cycle 3: Issue ADDI x5, ADDI x4 completes but can't commit (DIV at ROB head)
- ...
- Cycle 8: DIV completes
- Cycle 9: DIV commits, then ADDI x4 can commit
- Cycle 10: ADDI x5 commits

### 16.4 Example 4: Load with Older Store

```assembly
      ADDI x1, x0, 100   # Address
      ADDI x2, x0, 42    # Value
      ST   x2, 0(x1)     # Store 42 to mem[100]
      LD   x3, 0(x1)     # Load from mem[100] - must wait for store
```

**Expected behavior (no forwarding):**
- Issue all instructions
- Store computes address (100)
- Load sees older store to same address, waits
- Store commits (writes mem[100] = 42)
- Load executes, reads 42
- Load commits, x3 = 42

---

## 17. Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| ROB Size | 8 | Number of ROB entries |
| Commit Width | 1 | Instructions committed per cycle |
| Integer RS | 3 | INT reservation stations |
| Multiply RS | 2 | MUL reservation stations |
| Divide RS | 2 | DIV reservation stations |
| Load Buffers | 3 | Load buffer entries |
| Store Buffers | 3 | Store buffer entries |
| Branch RS | 2 | Branch RS (increased for speculation) |
| Integer Latency | 2 | ADD, SUB, ADDI, SUBI |
| Multiply Latency | 5 | MUL, MULI |
| Divide Latency | 7 | DIV, DIVI |
| Logical Latency | 1 | AND, OR, XOR |
| Load Latency | 2 | 1 addr + 1 mem |
| Store Latency | 2 | 1 addr + 1 mem |
| Branch Latency | 1 | BEQ, BNE, J |

---

## 18. Statistics Tracked

| Statistic | Description |
|-----------|-------------|
| Total Cycles | Cycles executed |
| Instructions Committed | Instructions that completed commit |
| Instructions Squashed | Instructions flushed due to mispredict |
| Branches | Total branch/jump instructions |
| Mispredictions | Branches that mispredicted |
| Misprediction Rate | Mispredictions / Branches |
| IPC | Instructions committed per cycle |
| ROB Full Stalls | Cycles stalled due to full ROB |
| RS Full Stalls | Cycles stalled due to full RS |
| CDB Broadcasts | Total CDB broadcasts |
| Memory Reads | Load operations |
| Memory Writes | Store commits |

---

## 19. Summary of Key Design Decisions for Phase 3

1. **ROB for in-order commit**: All instructions allocate ROB entry
2. **ARF update at commit only**: Precise architectural state
3. **RAT points to ROB entries**: Tags are ROB indices
4. **Speculative issue**: Continue past unresolved branches
5. **Always-not-taken prediction**: BEQ/BNE predict not-taken, J is taken
6. **RAT checkpointing at branch issue**: For recovery
7. **Oldest-first arbitration**: All tie-breaking
8. **Same-cycle wakeup**: CDB wakes operands immediately
9. **No store-to-load forwarding**: Loads wait for older stores
10. **Store commit at ROB head only**: Speculative stores don't affect memory
