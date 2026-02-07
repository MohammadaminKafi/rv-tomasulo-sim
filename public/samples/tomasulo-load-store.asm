# Load/Store in Tomasulo
ADDI x10, x0, 100   # Base address
ADDI x1, x0, 42     # Value to store

ST x1, 0(x10)       # Store 42 to mem[100]
LD x2, 0(x10)       # Load from mem[100]
ADD x3, x2, x2      # x3 = loaded value * 2

# Watch address calculation, memory access, and CDB broadcast
