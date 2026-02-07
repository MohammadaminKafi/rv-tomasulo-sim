# Calculate Fibonacci: 0, 1, 1, 2, 3, 5, 8...
ADDI x1, x0, 0    # fib(0) = 0
ADDI x2, x0, 1    # fib(1) = 1
ADDI x5, x0, 5    # counter (calculate 5 numbers)

fib_loop:
ADD x3, x1, x2    # next = fib(n-1) + fib(n-2)
ADDI x1, x2, 0    # shift: fib(n-1) = fib(n)
ADDI x2, x3, 0    # shift: fib(n) = next
SUBI x5, x5, 1    # counter--
BNE x5, x0, fib_loop

# Result in x2
