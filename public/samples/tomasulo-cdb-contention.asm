# CDB Contention Demo
# Multiple instructions may finish almost together
ADDI x1, x0, 5    # Quick: 1 cycle
ADDI x2, x0, 10   # Quick: 1 cycle
ADDI x3, x0, 15   # Quick: 1 cycle
ADDI x4, x0, 20   # Quick: 1 cycle
# Watch CDB - only one can broadcast per cycle!
ADD x5, x1, x2    # Uses x1, x2
ADD x6, x3, x4    # Uses x3, x4 (can execute in parallel!)
