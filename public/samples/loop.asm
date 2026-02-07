# Count from 0 to 5
ADDI x1, x0, 0    # counter = 0
ADDI x2, x0, 5    # limit = 5

loop:
ADDI x1, x1, 1    # counter++
BNE x1, x2, loop  # if counter != limit, goto loop

# Loop finished, x1 = 5
