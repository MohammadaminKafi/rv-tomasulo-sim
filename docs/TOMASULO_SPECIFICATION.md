# Tomasulo Algorithm Simulator - Phase 2 Behavioral Specification

This document defines the **complete expected behavior** of the Tomasulo algorithm simulator for teaching dynamic scheduling concepts.

---

## 1. Overview

Phase 2 implements **"simple Tomasulo"** dynamic scheduling:

- **Reservation stations (RS)** hold instructions waiting to execute
- **Register renaming** via the Register Alias Table (RAT) eliminates WAR and WAW hazards
- **Common Data Bus (CDB)** broadcasts results to all waiting instructions
- **Out-of-order execution** within functional unit constraints
- **In-order issue** and **in-order commit** (for Phase 2; ROB is Phase 3)

**NOT included in Phase 2:**
- Speculation / branch prediction
- Reorder Buffer (ROB) / precise exceptions
- Multiple CDBs

---

## 2. App-Level Behavior

### 2.1 User Interface Components

The simulator provides:

1. **Assembly Code Editor**: Text area for entering assembly code
2. **Control Buttons**:
   - **Load/Assemble**: Parse and validate code; show errors with line numbers if invalid
   - **Reset**: Return to initial state (cycle 0, empty RS, registers zeroed)
   - **Step**: Advance exactly one cycle
   - **Run / Pause**: Advance continuously at configurable speed until pause/halt
   - **Run N Cycles**: Advance N cycles or until halt
   - **Run to Completion**: Run until program completes

3. **Display Panels** (updated every cycle):
   - **Cycle Number**: Current simulation cycle (0-indexed)
   - **PC Value**: Current Program Counter
   - **Instruction Status Table**: Per-instruction status (Issue, Execute Start, Execute End, Write Result)
   - **Architectural Register File (ARF)**: Committed register values (x0-x31)
   - **Register Alias Table (RAT)**: Maps registers to producing RS tags or "ready"
   - **Reservation Stations**: For each unit type (INT, MUL, DIV, LOAD, STORE)
   - **Load/Store Buffers**: Current memory operations
   - **Common Data Bus (CDB)**: Current broadcast (tag, value) or "idle"
   - **Memory View**: Memory contents and all memory operations
   - **Event Log**: Issue, execution, wakeup, broadcast, and memory events

### 2.2 Determinism Requirement

The simulator is **fully deterministic**: given the same program and configuration, it always produces identical cycle traces. Tie-breaking rules are explicitly defined.

### 2.3 Atomic Cycle Updates

Each **Step** produces a **complete next state**. All phase transitions within a cycle are computed atomically and then committed together.

---

## 3. ISA Reference (Same as Phase 1)

### 3.1 Supported Instructions

| Instruction | Syntax | EX Latency | Functional Unit |
|-------------|--------|------------|-----------------|
| ADD | `ADD rd, rs1, rs2` | 1 | INT |
| SUB | `SUB rd, rs1, rs2` | 1 | INT |
| MUL | `MUL rd, rs1, rs2` | 4 | MUL |
| DIV | `DIV rd, rs1, rs2` | 6 | DIV |
| AND | `AND rd, rs1, rs2` | 1 | INT |
| OR  | `OR rd, rs1, rs2` | 1 | INT |
| XOR | `XOR rd, rs1, rs2` | 1 | INT |
| ADDI | `ADDI rd, rs1, imm` | 1 | INT |
| SUBI | `SUBI rd, rs1, imm` | 1 | INT |
| MULI | `MULI rd, rs1, imm` | 4 | MUL |
| DIVI | `DIVI rd, rs1, imm` | 6 | DIV |
| LD | `LD rd, imm(rs1)` | 1 + 1 | LOAD |
| ST | `ST rs2, imm(rs1)` | 1 + 1 | STORE |
| BEQ | `BEQ rs1, rs2, label` | 1 | BRANCH |
| BNE | `BNE rs1, rs2, label` | 1 | BRANCH |
| J | `J label` | 1 | BRANCH |
| NOP | `NOP` | 1 | - (does not occupy RS) |

### 3.2 Register and Memory Semantics

- **32 integer registers**: x0 through x31
- **x0 is hardwired to 0**: Reads always return 0; writes are ignored
- **Memory**: 1024 bytes, byte-addressed, 32-bit words, 4-byte aligned, little-endian
- **Out-of-bounds/misaligned access**: Halts simulation with explicit error

---

## 4. Machine State and Components

### 4.1 Architectural Register File (ARF)

The ARF holds **committed** architectural register values.

- **Size**: 32 registers (x0-x31)
- **x0**: Hardwired to 0; writes ignored
- **Update timing**: Updated when CDB broadcasts AND the RAT entry for that register still points to the broadcasting RS (prevents clobbering newer renames)
- **Initial state**: All registers = 0

### 4.2 Register Alias Table (RAT)

Maps each architectural register to either:
- A **tag** (RS ID) of the instruction that will produce the value, OR
- **null** (meaning the current value is in ARF and ready)

```
RAT[reg] = {
  tag: string | null  // RS ID producing this value, or null if ready
}
```

**RAT update rules:**
- **On Issue**: If instruction writes to `rd` (rd ≠ 0), set `RAT[rd] = destTag`
- **On CDB Broadcast**: If `RAT[reg] == broadcastTag`, set `RAT[reg] = null`
  - This ONLY clears if the tag matches, preventing clobbering of newer renames

### 4.3 Reservation Stations (RS)

RS entries are organized by functional unit type:

| RS Type | Default Count | Instructions |
|---------|---------------|--------------|
| INT | 3 | ADD, SUB, AND, OR, XOR, ADDI, SUBI |
| MUL | 2 | MUL, MULI |
| DIV | 2 | DIV, DIVI |
| LOAD | 3 | LD |
| STORE | 3 | ST |
| BRANCH | 1 | BEQ, BNE, J (if supported) |

Each RS entry contains:

```typescript
interface ReservationStationEntry {
  id: string;              // Unique RS ID (e.g., "INT0", "MUL1", "LOAD2")
  busy: boolean;           // Entry is occupied
  op: InstructionType;     // Operation to perform
  
  // Source operand 1
  Vj: number | null;       // Value (if ready)
  Qj: string | null;       // Tag of producing RS (if not ready), null if ready
  
  // Source operand 2 / Store data
  Vk: number | null;       // Value (if ready)
  Qk: string | null;       // Tag of producing RS (if not ready), null if ready
  
  // For memory operations
  imm: number;             // Immediate offset
  address: number | null;  // Computed effective address (after address calc)
  addressReady: boolean;   // Address has been computed
  
  // Destination tracking
  destTag: string;         // This RS's tag (same as id)
  destReg: number | null;  // Architectural destination register
  
  // Execution state
  state: RSState;          // WAITING, READY, EXECUTING, DONE
  remainingCycles: number; // Cycles left for execution
  result: number | null;   // Computed result (when DONE)
  
  // Instruction tracking
  instrIndex: number;      // Index in program for UI tracking
  issueCycle: number;      // Cycle when issued
  execStartCycle: number | null;   // Cycle when execution started
  execEndCycle: number | null;     // Cycle when execution completed
  writeResultCycle: number | null; // Cycle when result was broadcast
}

enum RSState {
  WAITING = 'WAITING',     // Waiting for operands
  READY = 'READY',         // All operands ready, waiting for FU
  EXECUTING = 'EXECUTING', // Currently executing
  DONE = 'DONE',           // Execution complete, waiting for CDB
}
```

**Empty/Bubble display**: RS entries with `busy = false` are shown as empty.

### 4.4 Tags

- Each RS entry's **id** serves as its **tag** (e.g., "INT0", "MUL1")
- Tags are stable identifiers used in RAT and Qj/Qk fields
- When an RS entry is freed, the tag becomes available for reuse
- Tag format: `{TYPE}{INDEX}` (e.g., INT0, INT1, MUL0, LOAD0)

### 4.5 Functional Units and Execution

| FU Type | Count | Latency |
|---------|-------|---------|
| INT | 1 | 1 cycle |
| MUL | 1 | 4 cycles |
| DIV | 1 | 6 cycles |
| LOAD | 1 | 1 (addr) + 1 (mem) = 2 cycles total |
| STORE | 1 | 1 (addr) + 1 (mem) = 2 cycles total |
| BRANCH | 1 | 1 cycle |

**Execution model:**
- RS entries execute "in place" (no separate FU assignment)
- Only ONE instruction per FU type can be executing at a time
- When multiple RS entries of the same type are READY, choose by **oldest issue first** (lowest instrIndex)

### 4.6 Common Data Bus (CDB)

- **Single CDB** in Phase 2
- At most **one result broadcast per cycle**
- Broadcast format: `{ tag: string, value: number, destReg: number }`

**CDB arbitration** when multiple results are DONE:
1. **Oldest instruction first** (lowest instrIndex among all DONE entries)

This ensures determinism and in-order commit behavior.

---

## 5. Cycle Semantics (Phase Ordering)

Each cycle consists of the following phases, executed in order:

### Phase 1: CDB Broadcast (Write Result)

If there is a DONE RS entry ready to broadcast:
1. Select the oldest DONE entry (by instrIndex)
2. Broadcast `(tag, value)` on CDB
3. For all RS entries:
   - If `Qj == tag`: set `Vj = value`, `Qj = null`
   - If `Qk == tag`: set `Vk = value`, `Qk = null`
4. For RAT: if `RAT[destReg] == tag`:
   - Write `value` to `ARF[destReg]`
   - Set `RAT[destReg] = null`
5. Free the broadcasting RS entry (`busy = false`)
6. Record the broadcast cycle in instruction status

### Phase 2: Check Operand Readiness

For all RS entries in WAITING state:
- If `Qj == null` AND `Qk == null`: transition to READY
- For LOAD: if `Qj == null` (base address ready), can compute address

### Phase 3: Start Execution

For each FU type, if the FU is available (no entry currently EXECUTING):
1. Find all READY entries of that type
2. Select the oldest (by instrIndex)
3. Start execution:
   - Set `state = EXECUTING`
   - Set `remainingCycles` based on operation latency
   - Record `execStartCycle`
   - Compute result for single-cycle ops (remainingCycles becomes 0)

### Phase 4: Continue Execution

For all RS entries in EXECUTING state with `remainingCycles > 0`:
1. Decrement `remainingCycles`
2. If `remainingCycles == 0`:
   - Compute final result
   - Set `state = DONE`
   - Record `execEndCycle`

### Phase 5: Issue

If there are instructions to issue (PC < program end) AND an RS of the required type is free:
1. Get instruction at current PC
2. Find a free RS entry of the required type
3. Populate the RS entry:
   - Set `busy = true`, `op`, `instrIndex`, `issueCycle`
   - For each source operand (rs1, rs2):
     - If `RAT[src] == null`: `V = ARF[src]`, `Q = null`
     - Else: `V = null`, `Q = RAT[src]`
   - For immediate: store in `imm`
   - For destination (if rd ≠ 0): set `RAT[rd] = destTag`
4. Advance PC
5. Record `issueCycle` for instruction status

**Issue rate**: At most ONE instruction per cycle (for teaching simplicity)

### Phase 6: Memory Operations (Special Handling)

**Load:**
1. Address calculation: When base operand ready, compute `address = Vj + imm`
2. Memory access: After address calc, read from memory
3. Total latency: 2 cycles (1 for addr, 1 for memory)

**Store:**
1. Address calculation: When base operand ready, compute `address = Vj + imm`
2. Data ready: Store needs Vk (data) to be ready before memory write
3. Memory write: Only when address AND data are ready
4. Store does NOT broadcast on CDB (no destination register)
5. Store can retire (free RS) after memory write completes

**Memory ordering:**
- In-order store commit: Stores commit to memory in program order
- Loads can execute when all older store addresses are known and non-conflicting

---

## 6. Control Flow (Branches/Jumps) in Tomasulo - Conservative Model

For Phase 2, branches are handled **conservatively**:

### 6.1 Branch Issue

- Branches issue into a BRANCH RS (if available)
- Issue stalls if no BRANCH RS is free

### 6.2 Branch Execution

- Branch waits for operands to be ready (via CDB if needed)
- Branch evaluates condition when operands are ready
- Branch resolves in 1 cycle once operands are ready

### 6.3 Issue Stall on Branch

To avoid speculative execution:
- **Issue stalls** when a branch is in-flight (issued but not resolved)
- No new instructions are issued after a branch until the branch completes
- This prevents fetching/issuing instructions that might need to be flushed

### 6.4 Branch Resolution

When branch completes:
1. If **not taken**: PC continues normally (already at next instruction)
2. If **taken**: PC is redirected to target
3. Issue resumes in the next cycle

### 6.5 Jump Handling

- `J` (unconditional jump) follows the same rules as branches
- Always "taken", redirects PC immediately upon resolution

---

## 7. Instruction Status Table

For visualization, track each instruction's lifecycle:

| Instruction | Issue | Exec Start | Exec End | Write Result |
|-------------|-------|------------|----------|--------------|
| ADD x1, x2, x3 | 1 | 2 | 2 | 3 |
| MUL x4, x1, x5 | 2 | 4 | 7 | 8 |
| ... | ... | ... | ... | ... |

**Status fields:**
- **Issue**: Cycle when instruction was issued to RS
- **Exec Start**: Cycle when execution began (operands ready, FU available)
- **Exec End**: Cycle when execution completed (result computed)
- **Write Result**: Cycle when result was broadcast on CDB

---

## 8. CDB Arbitration and Write-Back

### 8.1 Single CDB Model

- Only one result can be broadcast per cycle
- Priority: **Oldest instruction first** (lowest instrIndex among DONE)

### 8.2 Operand Data Forwarding via CDB

When CDB broadcasts `(tag, value)`:
- All RS entries watching for `tag` capture `value` immediately
- These entries may become READY in the same cycle
- However, they cannot START EXECUTING until the next cycle

### 8.3 ARF Update

- ARF is updated on CDB broadcast if `RAT[destReg] == broadcastTag`
- If `RAT[destReg] != broadcastTag` (newer instruction renamed it), ARF is NOT updated
  - This is essential for correctness with register renaming

---

## 9. Load/Store Buffer Details

### 9.1 Load Buffer Entry

```typescript
interface LoadBufferEntry extends ReservationStationEntry {
  // Additional fields for memory unit
  addressReady: boolean;
  memoryAccessStarted: boolean;
}
```

### 9.2 Store Buffer Entry

```typescript
interface StoreBufferEntry extends ReservationStationEntry {
  addressReady: boolean;
  dataReady: boolean;    // Store data (Vk) is ready
  committed: boolean;    // Store has written to memory
}
```

### 9.3 Memory Ordering Rules

**Simplified model for Phase 2:**
- Loads execute when their address is ready
- Stores commit to memory when:
  - Address is ready
  - Data is ready
  - All older stores have committed (in-order store commit)
- Load-store forwarding: A load can get data from an older store if addresses match

---

## 10. Completion Condition

The program is **complete** when ALL of the following are true:

1. **PC is past end**: PC has reached or passed the last instruction
2. **All RS entries are free**: No busy RS entries
3. **No pending memory ops**: All loads/stores have completed
4. **CDB is idle**: No instruction waiting to broadcast
5. **Issue queue is empty**: No more instructions to issue

### 10.1 Halt Conditions

Normal completion:
- All instructions have completed write-back

Error halt:
- **Memory out of bounds**: Address < 0 or Address >= 1024
- **Memory alignment error**: Address not 4-byte aligned
- **Division by zero**: DIV/DIVI with divisor = 0

---

## 11. Event Logging

Each cycle logs detailed events for debugging and visualization:

| Event Type | Description |
|------------|-------------|
| ISSUE | Instruction issued to RS: source operands, destination |
| ISSUE_STALL | Issue stalled: reason (RS full, branch pending) |
| EXEC_START | Execution started: which RS, operation |
| EXEC_CONTINUE | Multi-cycle execution progress |
| EXEC_END | Execution completed: result computed |
| OPERAND_WAKEUP | Operand became ready via CDB |
| CDB_BROADCAST | CDB broadcast: tag, value, destination |
| CDB_CONTENTION | Multiple DONE, arbitration decision |
| RAT_UPDATE | RAT entry changed |
| ARF_WRITE | ARF register written |
| MEM_READ | Load from memory |
| MEM_WRITE | Store to memory |
| BRANCH_RESOLVE | Branch resolved: taken/not taken |
| PC_UPDATE | PC changed |
| RS_FREE | RS entry freed |

---

## 12. Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| Integer RS Count | 3 | Number of INT reservation stations |
| Multiply RS Count | 2 | Number of MUL reservation stations |
| Divide RS Count | 2 | Number of DIV reservation stations |
| Load Buffers | 3 | Number of load buffer entries |
| Store Buffers | 3 | Number of store buffer entries |
| Branch RS | 1 | Number of branch RS |
| Integer Latency | 1 | Cycles for INT operations |
| Multiply Latency | 4 | Cycles for MUL operations |
| Divide Latency | 6 | Cycles for DIV operations |
| Load Latency | 2 | Cycles for load (1 addr + 1 mem) |
| Store Latency | 2 | Cycles for store (1 addr + 1 mem) |

---

## 13. Example Programs and Expected Behavior

### 13.1 Example 1: RAW Chain (Dependent Operations)

```assembly
ADDI x1, x0, 5    # x1 = 5
ADDI x2, x0, 10   # x2 = 10
ADD  x3, x1, x2   # x3 = x1 + x2 (depends on x1, x2)
ADD  x4, x3, x1   # x4 = x3 + x1 (depends on x3)
```

**Expected Cycle Trace:**

| Cycle | Issue | RAT | RS State | Exec | CDB | ARF |
|-------|-------|-----|----------|------|-----|-----|
| 1 | ADDI x1 → INT0 | x1→INT0 | INT0: READY | INT0 starts | - | - |
| 2 | ADDI x2 → INT1 | x1→INT0, x2→INT1 | INT0: DONE, INT1: READY | INT1 starts | INT0→(5) | x1=5 |
| 3 | ADD x3 → INT2 | x2→INT1, x3→INT2 | INT1: DONE, INT2: wait x2 | - | INT1→(10) | x2=10 |
| 4 | ADD x4 → INT0 | x3→INT2, x4→INT0 | INT2: READY, INT0: wait x3 | INT2 starts | - | - |
| 5 | - | x3→INT2, x4→INT0 | INT2: DONE, INT0: wait x3 | - | INT2→(15) | x3=15 |
| 6 | - | x4→INT0 | INT0: READY | INT0 starts | - | - |
| 7 | - | x4→INT0 | INT0: DONE | - | INT0→(20) | x4=20 |

**Final State:** x1=5, x2=10, x3=15, x4=20

### 13.2 Example 2: CDB Contention

```assembly
ADDI x1, x0, 5    # Cycle 1: issue
MUL  x2, x1, x1   # Cycle 2: issue (waits for x1)
ADDI x3, x0, 10   # Cycle 3: issue
ADDI x4, x0, 20   # Cycle 4: issue
```

**Key Events:**
- Cycle 2: ADDI x1 broadcasts, MUL x2 wakes up, ADDI x3 is issued
- Cycle 3: ADDI x3 broadcasts (INT is available, executes immediately)
- Cycle 4: ADDI x4 broadcasts
- Cycle 5-6: MUL x2 continues executing (4 cycle latency)
- Cycle 7: MUL x2 broadcasts result (25)

**CDB Contention:** Each cycle, only one instruction can broadcast. With proper arbitration (oldest first), results are broadcast in program order.

### 13.3 Example 3: Load/Store Interaction

```assembly
ADDI x1, x0, 100  # Address = 100
ADDI x2, x0, 42   # Value = 42
ST   x2, 0(x1)    # mem[100] = 42
LD   x3, 0(x1)    # x3 = mem[100]
ADD  x4, x3, x3   # x4 = x3 + x3 (depends on load)
```

**Expected Behavior:**
1. ADDI x1 issues, executes, broadcasts
2. ADDI x2 issues, executes, broadcasts
3. ST issues, waits for x1 and x2 (both via CDB)
4. LD issues, waits for x1 (via CDB) and waits for older store
5. ST computes address, then commits to memory
6. LD computes address after store commits, reads memory
7. ADD x4 waits for LD result via CDB

---

## 14. Instruction Status Timeline Display

The UI should show a clear per-instruction timeline:

```
| Instruction       | Issue | Exec Start | Exec End | Write Result |
|-------------------|-------|------------|----------|--------------|
| ADDI x1, x0, 5    |   1   |     1      |    1     |      2       |
| ADDI x2, x0, 10   |   2   |     2      |    2     |      3       |
| ADD  x3, x1, x2   |   3   |     4      |    4     |      5       |
| ADD  x4, x3, x1   |   4   |     6      |    6     |      7       |
```

**Key Observations:**
- Issue is in program order (1, 2, 3, 4...)
- Exec Start may be delayed due to operand waits
- Write Result is delayed by CDB contention

---

## 15. Statistics Tracked

| Statistic | Description |
|-----------|-------------|
| Total Cycles | Number of cycles executed |
| Instructions Completed | Instructions that completed write-back |
| IPC | Instructions Per Cycle |
| Issue Stalls | Cycles with issue stall |
| RS Full Stalls | Issue stalls due to RS unavailable |
| Operand Wait Stalls | Total cycles RS entries spent waiting for operands |
| CDB Broadcasts | Total CDB broadcasts |
| CDB Contention Events | Cycles with multiple DONE instructions waiting |
| Memory Reads | Number of load operations |
| Memory Writes | Number of store operations |

---

## 16. UI Component Layout for Tomasulo Mode

### 16.1 Main Layout (3-column)

**Left Column:**
- Assembly Code Editor
- Controls (Load/Assemble, Step, Run, Reset, etc.)
- Mode Selector

**Middle Column:**
- Cycle/PC Display
- Instruction Status Table (scrollable)
- CDB Status (current broadcast or idle)
- Event Log

**Right Column:**
- RAT Display (register → tag mapping)
- Reservation Stations (grouped by type)
- ARF (Register File)
- Memory View

### 16.2 Reservation Station Display

Each RS group shows:
```
┌─────────────────────────────────────────────────────────┐
│ INT Reservation Stations                                │
├─────┬──────┬──────────┬────────┬────────┬─────┬────────┤
│ ID  │ Busy │ Op       │ Vj/Qj  │ Vk/Qk  │ Imm │ State  │
├─────┼──────┼──────────┼────────┼────────┼─────┼────────┤
│ INT0│ Yes  │ ADD      │ 5      │ Q=MUL0 │ -   │ WAITING│
│ INT1│ Yes  │ ADDI     │ 10     │ -      │ 20  │ EXEC   │
│ INT2│ No   │ -        │ -      │ -      │ -   │ -      │
└─────┴──────┴──────────┴────────┴────────┴─────┴────────┘
```

### 16.3 RAT Display

```
┌───────────────────────────────┐
│ Register Alias Table (RAT)   │
├─────┬───────┬───────┬───────┬┐
│ x1  │ ready │ x2    │ MUL0  │...
├─────┼───────┼───────┼───────┼┤
│ x9  │ INT0  │ x10   │ ready │...
└─────┴───────┴───────┴───────┴┘
```

### 16.4 CDB Display

```
┌─────────────────────────────┐
│ Common Data Bus (CDB)       │
│ Status: BROADCASTING        │
│ Tag: INT0                   │
│ Value: 42                   │
│ Dest: x3                    │
└─────────────────────────────┘
```

---

## 17. Summary of Key Design Decisions

1. **Single CDB**: One broadcast per cycle, arbitrated by oldest-first
2. **Conservative branches**: Issue stalls when branch is pending
3. **In-order issue, out-of-order execute**: Maintain program order for issue
4. **RS as tags**: Each RS entry ID is the tag for register renaming
5. **Same-cycle wakeup**: CDB wakes up dependents in same cycle, but they execute next cycle
6. **In-order store commit**: Stores write memory in program order
7. **RAT conditional clear**: Only clear RAT if tag still matches
8. **Deterministic tie-breaking**: Always oldest instruction first
