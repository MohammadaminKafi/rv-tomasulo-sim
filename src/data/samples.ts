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
    id: 'arithmetic',
    title: 'Arithmetic Operations',
    description: 'Various arithmetic operations including multiplication and division.',
    code: `# Arithmetic operations
ADDI x1, x0, 12   # x1 = 12
ADDI x2, x0, 4    # x2 = 4

ADD x3, x1, x2    # x3 = 12 + 4 = 16
SUB x4, x1, x2    # x4 = 12 - 4 = 8
MUL x5, x1, x2    # x5 = 12 * 4 = 48
DIV x6, x1, x2    # x6 = 12 / 4 = 3`,
  },
  {
    id: 'loop',
    title: 'Simple Loop',
    description: 'A counting loop demonstrating branches and labels.',
    code: `# Count from 0 to 10
ADDI x1, x0, 0    # counter = 0
ADDI x2, x0, 10   # limit = 10

loop:
ADDI x1, x1, 1    # counter++
BNE x1, x2, loop  # if counter != limit, goto loop

# Loop finished, x1 = 10`,
  },
  {
    id: 'factorial',
    title: 'Factorial-like Calculation',
    description: 'Multiply a number by descending values (similar to factorial).',
    code: `# Calculate 5 * 4 * 3 * 2 * 1
ADDI x1, x0, 1    # result = 1
ADDI x2, x0, 5    # counter = 5

multiply_loop:
MUL x1, x1, x2    # result *= counter
ADDI x2, x2, -1   # counter--
BNE x2, x0, multiply_loop

# Result in x1 = 120`,
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
    id: 'fibonacci',
    title: 'Fibonacci Sequence',
    description: 'Calculate first few Fibonacci numbers.',
    code: `# Calculate Fibonacci: 0, 1, 1, 2, 3, 5, 8...
ADDI x1, x0, 0    # fib(0) = 0
ADDI x2, x0, 1    # fib(1) = 1
ADDI x5, x0, 8    # counter (calculate 8 numbers)

fib_loop:
ADD x3, x1, x2    # next = fib(n-1) + fib(n-2)
ADDI x1, x2, 0    # shift: fib(n-1) = fib(n)
ADDI x2, x3, 0    # shift: fib(n) = next
ADDI x5, x5, -1   # counter--
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
  {
    id: 'conditional',
    title: 'Conditional Execution',
    description: 'Branch based on comparison results.',
    code: `# Conditional: max of two numbers
ADDI x1, x0, 25   # a = 25
ADDI x2, x0, 18   # b = 18

# Compare and find max
SUB x3, x1, x2    # x3 = a - b
BEQ x3, x0, equal # if equal, goto equal

# x1 is max (or x2 if negative)
ADDI x4, x1, 0    # max = a
J done

equal:
ADDI x4, x1, 0    # max = a (same)

done:
NOP               # end`,
  },
];
