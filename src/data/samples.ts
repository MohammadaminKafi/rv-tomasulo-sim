/**
 * Sample programs for documentation
 */

export interface SampleProgram {
  id: string;
  title: string;
  description: string;
  code: string;
}

export const samplePrograms: SampleProgram[] = [
  {
    id: 'simple-add',
    title: 'Simple Addition',
    description: 'Basic arithmetic operations demonstrating register usage.',
    code: `# Simple addition example
ADDI x1, x0, 5    # x1 = 5
ADDI x2, x0, 10   # x2 = 10
ADD x3, x1, x2    # x3 = x1 + x2 = 15`,
  },
  {
    id: 'forwarding-demo',
    title: 'Forwarding Demo',
    description: 'Shows data forwarding from EX/MEM and MEM/WB stages.',
    code: `# Demonstrates forwarding between instructions
ADDI x1, x0, 5    # x1 = 5
ADDI x2, x0, 10   # x2 = 10
ADD x3, x1, x2    # Forward: x1, x2 from earlier instructions
ADD x4, x3, x1    # Forward: x3 from EX/MEM
ADD x5, x4, x3    # Forward: x4 from EX/MEM, x3 from MEM/WB`,
  },
  {
    id: 'load-use-stall',
    title: 'Load-Use Hazard (Stall)',
    description: 'Shows a load-use hazard that causes a pipeline stall.',
    code: `# Load-use hazard example
ADDI x1, x0, 100  # x1 = 100 (memory address)
ADDI x2, x0, 42   # x2 = 42
ST x2, 0(x1)      # mem[100] = 42
LD x3, 0(x1)      # x3 = mem[100] (load)
ADD x4, x3, x3    # STALL! x3 not ready yet (load-use hazard)
# x4 = 84`,
  },
  {
    id: 'multicycle-stall',
    title: 'Multi-Cycle EX (MUL/DIV)',
    description: 'Shows multi-cycle EX with MUL (4 cycles) causing structural stall.',
    code: `# Multi-cycle EX stall example
ADDI x1, x0, 6    # x1 = 6
ADDI x2, x0, 7    # x2 = 7
MUL x3, x1, x2    # x3 = 42 (takes 4 EX cycles!)
ADD x4, x3, x1    # Must wait for MUL to complete
# Final: x3 = 42, x4 = 48`,
  },
  {
    id: 'branch-flush',
    title: 'Branch Flush Demo',
    description: 'Shows pipeline flush when branch is taken.',
    code: `# Branch taken -> flush IF and ID
ADDI x1, x0, 5    # x1 = 5
ADDI x2, x0, 5    # x2 = 5
BEQ x1, x2, skip  # Branch taken! (x1 == x2)
ADDI x3, x0, 100  # FLUSHED (never executes)
ADDI x4, x0, 200  # FLUSHED (never executes)
skip:
ADDI x5, x0, 999  # x5 = 999 (this executes)
# Final: x1=5, x2=5, x3=0, x4=0, x5=999`,
  },
  {
    id: 'loop',
    title: 'Simple Loop',
    description: 'A counting loop demonstrating branches and labels.',
    code: `# Count from 0 to 5
ADDI x1, x0, 0    # counter = 0
ADDI x2, x0, 5    # limit = 5

loop:
ADDI x1, x1, 1    # counter++
BNE x1, x2, loop  # if counter != limit, goto loop

# Loop finished, x1 = 5`,
  },
  {
    id: 'memory',
    title: 'Memory Operations',
    description: 'Store and load values from memory.',
    code: `# Memory operations
ADDI x1, x0, 100  # address = 100
ADDI x2, x0, 42   # value = 42

ST x2, 0(x1)      # mem[100] = 42
LD x3, 0(x1)      # x3 = mem[100] = 42

ADDI x4, x0, 99   # value = 99
ST x4, 4(x1)      # mem[104] = 99
LD x5, 4(x1)      # x5 = mem[104] = 99`,
  },
  {
    id: 'immediate-ops',
    title: 'Immediate Operations',
    description: 'All immediate ALU operations: ADDI, SUBI, MULI, DIVI.',
    code: `# Immediate operations demo
ADDI x1, x0, 100  # x1 = 100
SUBI x2, x1, 25   # x2 = 100 - 25 = 75
MULI x3, x2, 2    # x3 = 75 * 2 = 150 (4 EX cycles)
DIVI x4, x3, 3    # x4 = 150 / 3 = 50 (6 EX cycles)`,
  },
  {
    id: 'fibonacci',
    title: 'Fibonacci Sequence',
    description: 'Calculate first few Fibonacci numbers.',
    code: `# Calculate Fibonacci: 0, 1, 1, 2, 3, 5, 8...
ADDI x1, x0, 0    # fib(0) = 0
ADDI x2, x0, 1    # fib(1) = 1
ADDI x5, x0, 5    # counter (calculate 5 numbers)

fib_loop:
ADD x3, x1, x2    # next = fib(n-1) + fib(n-2)
ADDI x1, x2, 0    # shift: fib(n-1) = fib(n)
ADDI x2, x3, 0    # shift: fib(n) = next
SUBI x5, x5, 1    # counter--
BNE x5, x0, fib_loop

# Result in x2`,
  },
  {
    id: 'logical',
    title: 'Logical Operations',
    description: 'Bitwise AND, OR, and XOR operations.',
    code: `# Logical operations
ADDI x1, x0, 15   # x1 = 0b1111 (15)
ADDI x2, x0, 10   # x2 = 0b1010 (10)

AND x3, x1, x2    # x3 = 0b1010 (10)
OR x4, x1, x2     # x4 = 0b1111 (15)
XOR x5, x1, x2    # x5 = 0b0101 (5)`,
  },
  // ========== Tomasulo-specific samples ==========
  {
    id: 'tomasulo-raw-chain',
    title: 'RAW Dependency Chain (Tomasulo)',
    description: 'Demonstrates register renaming and operand waiting via CDB in Tomasulo mode.',
    code: `# RAW Chain - watch operands wait for CDB broadcasts
# Best viewed in Tomasulo mode
ADDI x1, x0, 5    # x1 = 5
ADDI x2, x0, 10   # x2 = 10
ADD x3, x1, x2    # x3 = x1 + x2 (waits for x1, x2)
ADD x4, x3, x1    # x4 = x3 + x1 (waits for x3)
ADD x5, x4, x3    # x5 = x4 + x3 (waits for x4, x3)
# Watch the RAT and CDB to see how values propagate`,
  },
  {
    id: 'tomasulo-cdb-contention',
    title: 'CDB Contention (Tomasulo)',
    description: 'Multiple instructions complete at similar times, causing CDB arbitration.',
    code: `# CDB Contention Demo
# Multiple instructions may finish almost together
ADDI x1, x0, 5    # Quick: 1 cycle
ADDI x2, x0, 10   # Quick: 1 cycle
ADDI x3, x0, 15   # Quick: 1 cycle
ADDI x4, x0, 20   # Quick: 1 cycle
# Watch CDB - only one can broadcast per cycle!
ADD x5, x1, x2    # Uses x1, x2
ADD x6, x3, x4    # Uses x3, x4 (can execute in parallel!)`,
  },
  {
    id: 'tomasulo-out-of-order',
    title: 'Out-of-Order Execution (Tomasulo)',
    description: 'Shows how independent instructions can execute out of program order.',
    code: `# Out-of-Order Execution Demo
# Independent instructions can complete before dependent ones
ADDI x10, x0, 100  # x10 = 100 (fast)
MULI x1, x10, 5    # x1 = 500 (slow: 4 cycles)
ADDI x2, x0, 20    # x2 = 20 (fast, no dependency!)
ADDI x3, x0, 30    # x3 = 30 (fast, no dependency!)

# Notice x2 and x3 complete before x1 finishes!
ADD x4, x1, x2     # Waits for MUL to complete
ADD x5, x2, x3     # Can execute immediately`,
  },
  {
    id: 'tomasulo-register-renaming',
    title: 'Register Renaming (Tomasulo)',
    description: 'Shows how RAT eliminates false dependencies (WAW, WAR).',
    code: `# Register Renaming Demo
# Same register written multiple times - RAT tracks producers
ADDI x1, x0, 10   # First write to x1
ADDI x2, x1, 5    # Uses first x1
ADDI x1, x0, 20   # Second write to x1 (new producer!)
ADDI x3, x1, 5    # Uses second x1

# Without renaming, this would have WAW hazard
# Watch RAT update as each instruction issues`,
  },
  {
    id: 'tomasulo-load-store',
    title: 'Load/Store Operations (Tomasulo)',
    description: 'Memory operations with address calculation and data dependencies.',
    code: `# Load/Store in Tomasulo
ADDI x10, x0, 100   # Base address
ADDI x1, x0, 42     # Value to store

ST x1, 0(x10)       # Store 42 to mem[100]
LD x2, 0(x10)       # Load from mem[100]
ADD x3, x2, x2      # x3 = loaded value * 2

# Watch address calculation, memory access, and CDB broadcast`,
  },
];

