# Demonstrates forwarding between instructions
ADDI x1, x0, 5    # x1 = 5
ADDI x2, x0, 10   # x2 = 10
ADD x3, x1, x2    # Forward: x1, x2 from earlier instructions
ADD x4, x3, x1    # Forward: x3 from EX/MEM
ADD x5, x4, x3    # Forward: x4 from EX/MEM, x3 from MEM/WB
