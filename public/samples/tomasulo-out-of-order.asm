# Out-of-Order Execution Demo
# Independent instructions can complete before dependent ones
ADDI x10, x0, 100  # x10 = 100 (fast)
MULI x1, x10, 5    # x1 = 500 (slow: 4 cycles)
ADDI x2, x0, 20    # x2 = 20 (fast, no dependency!)
ADDI x3, x0, 30    # x3 = 30 (fast, no dependency!)

# Notice x2 and x3 complete before x1 finishes!
ADD x4, x1, x2     # Waits for MUL to complete
ADD x5, x2, x3     # Can execute immediately
