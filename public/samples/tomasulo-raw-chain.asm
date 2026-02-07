# RAW Chain - watch operands wait for CDB broadcasts
# Best viewed in Tomasulo mode
ADDI x1, x0, 5    # x1 = 5
ADDI x2, x0, 10   # x2 = 10
ADD x3, x1, x2    # x3 = x1 + x2 (waits for x1, x2)
ADD x4, x3, x1    # x4 = x3 + x1 (waits for x3)
ADD x5, x4, x3    # x5 = x4 + x3 (waits for x4, x3)
# Watch the RAT and CDB to see how values propagate
