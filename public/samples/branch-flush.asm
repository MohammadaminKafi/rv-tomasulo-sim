# Branch taken -> flush IF and ID
ADDI x1, x0, 5    # x1 = 5
ADDI x2, x0, 5    # x2 = 5
BEQ x1, x2, skip  # Branch taken! (x1 == x2)
ADDI x3, x0, 100  # FLUSHED (never executes)
ADDI x4, x0, 200  # FLUSHED (never executes)
skip:
ADDI x5, x0, 999  # x5 = 999 (this executes)
# Final: x1=5, x2=5, x3=0, x4=0, x5=999
