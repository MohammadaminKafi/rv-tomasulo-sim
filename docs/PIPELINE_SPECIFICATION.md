# 5-Stage Pipeline Simulator Behavioral Specification

This document defines the **complete expected behavior** of the 5-stage pipeline simulator for teaching computer architecture concepts.

---

## 1. App-Level Behavior

### 1.1 User Interface Components

The simulator provides:

1. **Assembly Code Editor**: Text area for entering assembly code
2. **Control Buttons**:
   - **Load/Assemble**: Parse and validate code; show errors with line numbers if invalid
   - **Reset**: Return to initial state (cycle 0, empty pipeline, registers zeroed)
   - **Step**: Advance exactly one cycle
   - **Run**: Advance continuously at configurable speed until pause/halt
   - **Pause**: Stop continuous execution
   - **Run N Cycles**: Advance N cycles or until halt
   - **Run to Completion**: Run until program completes

3. **Display Panels** (updated every cycle):
   - **Cycle Number**: Current simulation cycle (0-indexed, increments after each step)
   - **PC Value**: Current Program Counter value
   - **Pipeline Stage Occupancy**: Shows instruction in each stage (IF/ID/EX/MEM/WB) or "bubble"
   - **Pipeline Registers**: Contents of IF/ID, ID/EX, EX/MEM, MEM/WB
   - **Architectural Registers**: Values of x0-x31
   - **Memory View**: Configurable address range and all memory writes
   - **Event Log**: Lists cycle events (stalls, flushes, forwards, writes, hazards)

### 1.2 Determinism Requirement

The simulator is **fully deterministic**: given the same program and configuration, it always produces identical cycle traces.

### 1.3 Atomic Cycle Updates

Each **Step** produces a **complete next state**. The simulator never "half applies" a cycle. All stage transitions, register writes, and memory operations for a cycle are computed atomically and then committed together.

---

## 2. ISA and Assembly Semantics

### 2.1 Supported Instructions

#### ALU (Register-Register)
| Instruction | Syntax | Semantics | EX Latency |
|-------------|--------|-----------|------------|
| ADD | `ADD rd, rs1, rs2` | rd = rs1 + rs2 | 1 cycle |
| SUB | `SUB rd, rs1, rs2` | rd = rs1 - rs2 | 1 cycle |
| MUL | `MUL rd, rs1, rs2` | rd = rs1 × rs2 | 4 cycles |
| DIV | `DIV rd, rs1, rs2` | rd = rs1 ÷ rs2 (integer division) | 6 cycles |
| AND | `AND rd, rs1, rs2` | rd = rs1 & rs2 | 1 cycle |
| OR  | `OR rd, rs1, rs2`  | rd = rs1 \| rs2 | 1 cycle |
| XOR | `XOR rd, rs1, rs2` | rd = rs1 ^ rs2 | 1 cycle |

#### ALU (Register-Immediate)
| Instruction | Syntax | Semantics | EX Latency |
|-------------|--------|-----------|------------|
| ADDI | `ADDI rd, rs1, imm` | rd = rs1 + imm | 1 cycle |
| SUBI | `SUBI rd, rs1, imm` | rd = rs1 - imm | 1 cycle |
| MULI | `MULI rd, rs1, imm` | rd = rs1 × imm | 4 cycles |
| DIVI | `DIVI rd, rs1, imm` | rd = rs1 ÷ imm | 6 cycles |

#### Memory
| Instruction | Syntax | Semantics | EX Latency |
|-------------|--------|-----------|------------|
| LD | `LD rd, imm(rs1)` | rd = mem[rs1 + imm] | 1 cycle (addr calc) |
| ST | `ST rs2, imm(rs1)` | mem[rs1 + imm] = rs2 | 1 cycle (addr calc) |

#### Control Flow
| Instruction | Syntax | Semantics |
|-------------|--------|-----------|
| BEQ | `BEQ rs1, rs2, label` | if (rs1 == rs2) PC = label |
| BNE | `BNE rs1, rs2, label` | if (rs1 != rs2) PC = label |
| J   | `J label` | PC = label |

#### Other
| Instruction | Syntax | Semantics |
|-------------|--------|-----------|
| NOP | `NOP` | No operation (occupies pipeline stages but does nothing) |

### 2.2 Register Semantics

- 32 integer registers: x0 through x31
- **x0 is hardwired to 0**: Reads always return 0; writes are ignored
- All other registers are general-purpose and initialized to 0

### 2.3 Immediate Values

- Signed integers (positive or negative)
- Decimal format: `42`, `-10`
- Hexadecimal format: `0x1A`, `0xFF`

### 2.4 Memory Semantics

- **Word size**: 32 bits (4 bytes)
- **Memory size**: 1024 bytes (256 words)
- **Byte-addressed**: Addresses are byte addresses
- **Alignment**: Word operations require 4-byte alignment
- **Endianness**: Little-endian
- **Bounds checking**: Access outside [0, 1023] causes error halt
- **Alignment violation**: Non-4-byte-aligned access causes error halt

---

## 3. Pipeline Stages and Cycle Semantics

### 3.1 Pipeline Stages

The pipeline has 5 stages:

1. **IF (Instruction Fetch)**: Fetch instruction from memory using PC
2. **ID (Instruction Decode)**: Decode instruction, read register file, decode immediate
3. **EX (Execute)**: ALU operation, address calculation, or branch condition evaluation
4. **MEM (Memory Access)**: Load/store data memory access
5. **WB (Write Back)**: Write result to register file

### 3.2 Cycle Timing Model

Each cycle consists of:

1. **Read current state**: All stages read from current pipeline registers
2. **Compute next state**: Each stage computes its output based on current inputs
3. **Commit next state**: All pipeline registers are updated atomically

**Stage execution order (conceptual)**:
- All stages operate in parallel on their current inputs
- Results are committed to next-stage registers at the end of the cycle
- The UI displays the state **after** the cycle completes

### 3.3 Write-Back Timing

- **WB writes occur at the end of the cycle**
- In the same cycle, ID reads the **old** register values (before WB writes)
- Forwarding is used to get the value that WB is about to write

### 3.4 EX Latency

Each stage takes **1 cycle** except:
- **EX takes N cycles** where N is the instruction's EX latency
- When EX latency > 1, the instruction occupies EX for multiple cycles
- IF and ID stall while EX is busy (see Section 5)

---

## 4. Multi-Cycle EX Model

### 4.1 EX Occupancy

When an instruction enters EX:
1. A counter `exCyclesRemaining` is set to the instruction's EX latency
2. Each cycle, if `exCyclesRemaining > 0`:
   - The instruction remains in EX
   - `exCyclesRemaining` decrements by 1
   - IF and ID stages stall (structural hazard)
3. When `exCyclesRemaining` reaches 0:
   - EX computation completes
   - Result is available for EX/MEM register
   - Pipeline can advance normally next cycle

### 4.2 EX Latency Table

| Instruction Type | EX Latency |
|------------------|------------|
| ADD, SUB, AND, OR, XOR, ADDI, SUBI | 1 cycle |
| MUL, MULI | 4 cycles |
| DIV, DIVI | 6 cycles |
| LD, ST (address calc) | 1 cycle |
| BEQ, BNE, J | 1 cycle |
| NOP | 1 cycle |

---

## 5. Hazards, Forwarding, and Stalls

### 5.1 Hazard Types

1. **Structural Hazards**: Multi-cycle EX blocks IF/ID
2. **Data Hazards (RAW)**: Read-after-write dependencies
3. **Control Hazards**: Branch/jump resolution causes flush

### 5.2 Forwarding Paths

The simulator implements the following forwarding paths:

| Source Stage | Source Register | Target Stage | Target Operand |
|--------------|-----------------|--------------|----------------|
| EX/MEM | ALU result | EX | rs1, rs2 |
| MEM/WB | ALU result or load data | EX | rs1, rs2 |
| EX/MEM | ALU result | EX | branch rs1, rs2 |
| MEM/WB | ALU result or load data | EX | branch rs1, rs2 |
| EX/MEM | ALU result | MEM | store data (rs2) |
| MEM/WB | result | MEM | store data (rs2) |

### 5.3 Forwarding Rules

**When forwarding from EX/MEM to EX:**
- Available when: EX/MEM contains instruction with rd ≠ 0 and rd matches rs1 or rs2 of instruction in ID/EX
- Not available for: Load instructions (data not yet available)

**When forwarding from MEM/WB to EX:**
- Available when: MEM/WB contains instruction with rd ≠ 0 and rd matches rs1 or rs2 of instruction in ID/EX
- Available for: All instructions including loads (data available after MEM)

**Forwarding priority (if multiple sources):**
1. EX/MEM has priority over MEM/WB (more recent value)

**Multi-cycle EX forwarding:**
- A multi-cycle EX instruction can only forward its result **after** it completes EX and reaches EX/MEM
- While in EX (not completed), its result is not available for forwarding

### 5.4 Stall Conditions

**Structural Stall (Multi-cycle EX):**
- Condition: EX stage is occupied by instruction with `exCyclesRemaining > 0`
- Action: IF and ID freeze; bubble inserted into EX on next cycle when ready
- Duration: Until EX completes

**Load-Use Hazard Stall:**
- Condition: Instruction in ID needs a register that is being loaded by instruction in EX
- Specifically: ID/EX.instruction is LD and ID_instruction.rs1 == EX.rd or ID_instruction.rs2 == EX.rd
- Action: IF freezes, ID freezes, bubble inserted into EX
- Duration: 1 cycle (after LD is in MEM, forwarding from MEM/WB is possible)

**Branch Operand Stall:**
- Condition: Branch in ID needs operands not yet available (load in EX or multi-cycle EX)
- Action: Same as load-use stall
- Duration: Until operands become available via forwarding

### 5.5 Stall Propagation

On stall:
1. **IF freezes**: PC does not increment, same instruction re-fetched
2. **ID freezes**: IF/ID register holds its value
3. **Bubble inserted**: ID/EX receives bubble (null instruction)
4. **EX, MEM, WB continue**: These stages advance normally

---

## 6. Control Flow Semantics

### 6.1 Branch and Jump Behavior

**Branch Resolution Timing:**
- Branches (BEQ, BNE) and jumps (J) are resolved in **EX stage**
- The branch comparison uses operand values (potentially forwarded)
- PC update occurs when branch reaches EX and comparison is evaluated

**Fetch Policy (No Prediction):**
- Before resolution: Fetch next sequential instruction (PC+4)
- This means IF and ID stages may contain instructions after the branch

**Taken Branch/Jump Handling:**
1. When branch/jump is taken in EX:
   - PC is updated to target address
   - Instructions in IF and ID are **flushed** (converted to bubbles)
   - These flushed instructions never complete
2. When branch is not taken:
   - PC already points to correct next instruction
   - No flush needed; pipeline continues normally

### 6.2 Flush Semantics

On taken branch/jump (detected in EX):
- IF/ID register is cleared to bubble
- ID/EX register is cleared to bubble
- The flushed instruction count is recorded
- Event log records the flush

### 6.3 Branch Operand Forwarding

Branch comparisons (BEQ, BNE) can receive forwarded values:
- From EX/MEM (if not a load)
- From MEM/WB (including loads)

If operands are not available, branch stalls (see Section 5.4).

---

## 7. PC Update Rules

### 7.1 Normal PC Increment

- PC increments by 4 when IF successfully fetches and is not stalled
- Increment occurs at end of cycle (as part of state transition)

### 7.2 Branch/Jump PC Update

- On taken branch/jump, PC is set to target address in EX stage
- This overrides the normal PC+4 increment

### 7.3 Stall PC Behavior

- When IF is stalled: PC does not change (holds current value)
- When IF is flushed: PC is already redirected to branch target

### 7.4 Program Completion Condition

The program is complete when **ALL** of the following are true:
1. PC has passed the last instruction address (no more fetches possible)
2. All pipeline stages are empty (bubbles or null)
3. No pending memory writes
4. No instruction currently in EX with remaining cycles

---

## 8. Pipeline Registers

### 8.1 IF/ID Register

```
IF/ID {
  instruction: Instruction | null  // Fetched instruction or bubble
  pc: number                       // PC of fetched instruction
  valid: boolean                   // True if contains valid instruction
}
```

### 8.2 ID/EX Register

```
ID/EX {
  instruction: Instruction | null  // Decoded instruction or bubble
  pc: number                       // PC of instruction
  rs1Value: number                 // Value read from rs1 (may be forwarded)
  rs2Value: number                 // Value read from rs2 (may be forwarded)
  rs1: number | null               // rs1 register number (for forwarding detection)
  rs2: number | null               // rs2 register number (for forwarding detection)
  rd: number | null                // Destination register number
  imm: number | null               // Immediate value
  valid: boolean                   // True if contains valid instruction
}
```

### 8.3 EX/MEM Register

```
EX/MEM {
  instruction: Instruction | null  // Instruction or bubble
  pc: number                       // PC of instruction
  aluResult: number                // ALU result or computed address
  rs2Value: number                 // Store data value (may be forwarded)
  rd: number | null                // Destination register
  branchTaken: boolean             // True if branch was taken
  branchTarget: number             // Target address if branch taken
  valid: boolean                   // True if contains valid instruction
}
```

### 8.4 MEM/WB Register

```
MEM/WB {
  instruction: Instruction | null  // Instruction or bubble
  pc: number                       // PC of instruction
  result: number                   // ALU result or loaded data
  rd: number | null                // Destination register
  writeReg: boolean                // True if should write to register
  valid: boolean                   // True if contains valid instruction
}
```

### 8.5 Bubble Representation

A bubble (invalid pipeline stage) is represented by:
- `instruction = null`
- `valid = false`
- All other fields are zeroed

### 8.6 NOP Behavior

A NOP instruction:
- Is a **valid** instruction (not a bubble)
- Occupies pipeline stages
- Takes 1 cycle in EX
- Does not write any register
- Does not access memory

---

## 9. Register File and Write-Back

### 9.1 Instructions That Write Registers

| Instruction | Writes to rd? |
|-------------|---------------|
| ADD, SUB, MUL, DIV | Yes |
| AND, OR, XOR | Yes |
| ADDI, SUBI, MULI, DIVI | Yes |
| LD | Yes |
| ST | No |
| BEQ, BNE | No |
| J | No |
| NOP | No |

### 9.2 Write-Back Timing

- WB writes occur at the **end** of the cycle
- In the same cycle, ID reads see the **old** values
- Forwarding handles this: MEM/WB can forward to EX in the same cycle

### 9.3 x0 Handling

- Writes to x0 are silently ignored
- Reads from x0 always return 0
- Forwarding to x0 is a no-op (the value is discarded)

---

## 10. Memory Model

### 10.1 Memory Configuration

- **Size**: 1024 bytes (addresses 0-1023)
- **Word size**: 32 bits (4 bytes)
- **Endianness**: Little-endian
- **Initial state**: All zeros

### 10.2 Alignment Requirements

- All LD/ST operations must be 4-byte aligned
- Address & 0x3 must equal 0
- Violation causes error halt with message

### 10.3 Bounds Checking

- Valid addresses: 0 to 1023
- Valid word addresses: 0, 4, 8, ..., 1020
- Out-of-bounds access causes error halt with message

### 10.4 Load (LD) Behavior

1. **EX stage**: Compute address = rs1 + immediate
2. **MEM stage**: Read 32-bit word from memory[address]
3. **WB stage**: Write loaded value to rd

Forwarding: Load result available after MEM (from MEM/WB register)

### 10.5 Store (ST) Behavior

1. **EX stage**: Compute address = rs1 + immediate
2. **MEM stage**: Write rs2 value to memory[address]
3. **WB stage**: No action (ST does not write registers)

Store data forwarding: rs2 value can be forwarded from EX/MEM or MEM/WB

### 10.6 Memory Operation Ordering

- Only one memory operation can be in MEM stage per cycle
- Memory operations are processed in program order
- No write buffering or memory pipelining

---

## 11. Event Logging

### 11.1 Logged Events

Each cycle logs the following events:

| Event Type | Description | Example |
|------------|-------------|---------|
| FETCH | Instruction fetched | "IF: Fetched ADD x1, x2, x3 at PC=0x0010" |
| DECODE | Instruction decoded | "ID: Decoded ADD, rs1=x2(5), rs2=x3(10)" |
| EXECUTE | EX stage action | "EX: ADD result=15" |
| EXECUTE_CONTINUE | Multi-cycle EX progress | "EX: MUL cycle 2/4" |
| EXECUTE_COMPLETE | Multi-cycle EX finished | "EX: MUL complete, result=100" |
| MEMORY_READ | Load from memory | "MEM: Load from addr=0x100, value=42" |
| MEMORY_WRITE | Store to memory | "MEM: Store to addr=0x100, value=42" |
| WRITEBACK | Register written | "WB: x1 <- 15 (from ADD)" |
| FORWARD | Forwarding occurred | "FWD: EX/MEM.rd(x1)=15 -> EX.rs1" |
| STALL_STRUCTURAL | EX busy | "STALL: Structural - EX busy (MUL 2/4)" |
| STALL_DATA | Load-use hazard | "STALL: Data hazard - LD x1 not ready" |
| STALL_BRANCH | Branch operand wait | "STALL: Branch operand not ready" |
| FLUSH | Pipeline flush | "FLUSH: Branch taken, flushed IF/ID" |
| ERROR | Error condition | "ERROR: Memory access out of bounds at 0x2000" |

### 11.2 Event Log Format

```
Cycle N:
  [EVENT_TYPE] Message
  [EVENT_TYPE] Message
  ...
```

---

## 12. Example Programs and Expected Behavior

### 12.1 Example 1: ALU Forwarding

```assembly
ADDI x1, x0, 5     # x1 = 5
ADDI x2, x0, 10    # x2 = 10
ADD  x3, x1, x2    # x3 = x1 + x2 (needs forwarding)
```

**Expected Execution:**

| Cycle | IF | ID | EX | MEM | WB | Events |
|-------|----|----|----|----|-----|--------|
| 1 | ADDI x1 | - | - | - | - | Fetch ADDI x1 |
| 2 | ADDI x2 | ADDI x1 | - | - | - | Fetch ADDI x2, Decode ADDI x1 |
| 3 | ADD x3 | ADDI x2 | ADDI x1 | - | - | Execute ADDI x1, result=5 |
| 4 | - | ADD x3 | ADDI x2 | ADDI x1 | - | FWD: EX/MEM->EX rs1, Execute ADDI x2 |
| 5 | - | - | ADD x3 | ADDI x2 | ADDI x1 | FWD: EX/MEM->EX rs2, MEM/WB->EX rs1, WB x1=5 |
| 6 | - | - | - | ADD x3 | ADDI x2 | WB x2=10 |
| 7 | - | - | - | - | ADD x3 | WB x3=15 |

**Final State:**
- x1 = 5, x2 = 10, x3 = 15

### 12.2 Example 2: Load-Use Stall

```assembly
ADDI x1, x0, 100   # x1 = 100 (address)
ST   x0, 0(x1)     # mem[100] = 0 (initialize)
ADDI x2, x0, 42    # x2 = 42
ST   x2, 0(x1)     # mem[100] = 42
LD   x3, 0(x1)     # x3 = mem[100] (load)
ADD  x4, x3, x3    # x4 = x3 + x3 (load-use hazard!)
```

**Key Cycles:**

| Cycle | IF | ID | EX | MEM | WB | Events |
|-------|----|----|----|----|-----|--------|
| ... | ... | ... | ... | ... | ... | ... |
| N | ADD x4 | LD x3 | ... | ... | ... | |
| N+1 | ADD x4 | LD x3 | LD x3 | ... | ... | STALL: Load-use hazard |
| N+2 | ADD x4 | *stall* | EX (addr) | ... | ... | Bubble inserted |
| N+3 | - | ADD x4 | *bubble* | LD x3 | ... | Load in MEM |
| N+4 | - | - | ADD x4 | *bubble* | LD x3 | FWD: MEM/WB->EX, WB x3=42 |

**Stall Reason**: LD in EX hasn't read memory yet; ADD needs x3 value which won't be available until LD is in MEM/WB.

**Final State:**
- x3 = 42, x4 = 84

### 12.3 Example 3: Taken Branch Flush

```assembly
ADDI x1, x0, 5     # x1 = 5
ADDI x2, x0, 5     # x2 = 5
BEQ  x1, x2, skip  # if x1 == x2, goto skip
ADDI x3, x0, 100   # x3 = 100 (SHOULD BE FLUSHED)
ADDI x4, x0, 200   # x4 = 200 (SHOULD BE FLUSHED)
skip:
ADDI x5, x0, 999   # x5 = 999 (this executes)
```

**Key Cycles:**

| Cycle | IF | ID | EX | MEM | WB | Events |
|-------|----|----|----|----|-----|--------|
| 1 | ADDI x1 | - | - | - | - | |
| 2 | ADDI x2 | ADDI x1 | - | - | - | |
| 3 | BEQ | ADDI x2 | ADDI x1 | - | - | |
| 4 | ADDI x3 | BEQ | ADDI x2 | ADDI x1 | - | Sequential fetch |
| 5 | ADDI x4 | ADDI x3 | BEQ | ADDI x2 | ADDI x1 | Branch evaluated: TAKEN! |
| 6 | ADDI x5 | *bubble* | *bubble* | BEQ | ADDI x2 | FLUSH: IF/ID, ID/EX cleared |
| 7 | - | ADDI x5 | *bubble* | *bubble* | BEQ | |
| 8 | - | - | ADDI x5 | *bubble* | *bubble* | |

**Flush Details:**
- Cycle 5: BEQ evaluated, x1==x2, branch taken
- ADDI x3 (in ID) and ADDI x4 (in IF) are flushed
- PC redirected to `skip` label

**Final State:**
- x1 = 5, x2 = 5, x3 = 0 (never executed), x4 = 0 (never executed), x5 = 999

---

## 13. Error Handling

### 13.1 Parse Errors

On Load/Assemble with invalid syntax:
- Display error message with line number
- Do not start simulation
- Example: "Line 5: Invalid register: r1 (use x0-x31)"

### 13.2 Runtime Errors

The simulator halts with error state on:
- **Memory out of bounds**: Address < 0 or Address >= 1024
- **Memory alignment error**: Address not 4-byte aligned
- **Division by zero**: DIV/DIVI with rs2/imm = 0
- **Invalid label**: Branch/jump to undefined label

Error display shows:
- Error type
- Instruction causing error
- Current PC
- Relevant values (address, divisor, etc.)

---

## 14. Configuration Options

### 14.1 Execution Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Data Forwarding | Enabled | Enable/disable forwarding paths |
| Run Speed | 100ms | Delay between cycles in Run mode |

### 14.2 Display Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Memory Start Address | 0 | Starting address for memory view |
| Memory Words Displayed | 32 | Number of words shown in memory view |
| Show Event Log | true | Show/hide event log panel |

---

## 15. Statistics Tracked

| Statistic | Description |
|-----------|-------------|
| Total Cycles | Number of cycles executed |
| Instructions Completed | Instructions that reached WB |
| IPC | Instructions Per Cycle (completed/cycles) |
| Stall Cycles | Cycles with at least one stall |
| Flush Count | Number of instructions flushed |
| Forwarding Events | Number of forwarding events |
| Memory Reads | Number of LD operations |
| Memory Writes | Number of ST operations |
