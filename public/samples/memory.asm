# Memory operations
ADDI x1, x0, 100  # address = 100
ADDI x2, x0, 42   # value = 42

ST x2, 0(x1)      # mem[100] = 42
LD x3, 0(x1)      # x3 = mem[100] = 42

ADDI x4, x0, 99   # value = 99
ST x4, 4(x1)      # mem[104] = 99
LD x5, 4(x1)      # x5 = mem[104] = 99
