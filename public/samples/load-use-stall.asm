# Load-use hazard example
ADDI x1, x0, 100  # x1 = 100 (memory address)
ADDI x2, x0, 42   # x2 = 42
ST x2, 0(x1)      # mem[100] = 42
LD x3, 0(x1)      # x3 = mem[100] (load)
ADD x4, x3, x3    # STALL! x3 not ready yet (load-use hazard)
# x4 = 84
