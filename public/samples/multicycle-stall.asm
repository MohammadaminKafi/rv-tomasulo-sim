# Multi-cycle EX stall example
ADDI x1, x0, 6    # x1 = 6
ADDI x2, x0, 7    # x2 = 7
MUL x3, x1, x2    # x3 = 42 (takes 4 EX cycles!)
ADD x4, x3, x1    # Must wait for MUL to complete
# Final: x3 = 42, x4 = 48
