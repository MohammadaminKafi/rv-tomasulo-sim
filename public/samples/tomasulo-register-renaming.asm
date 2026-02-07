# Register Renaming Demo
# Same register written multiple times - RAT tracks producers
ADDI x1, x0, 10   # First write to x1
ADDI x2, x1, 5    # Uses first x1
ADDI x1, x0, 20   # Second write to x1 (new producer!)
ADDI x3, x1, 5    # Uses second x1

# Without renaming, this would have WAW hazard
# Watch RAT update as each instruction issues
