# RISC-V & Tomasulo Simulator

An educational browser-based computer architecture simulator designed for teaching undergraduate and graduate students about CPU pipeline architectures and out-of-order execution.

## 🎯 Purpose

This simulator provides an interactive, visual way to understand:
- Classic 5-stage RISC-V pipeline (Phase 1) ✅
- Tomasulo's algorithm (Phase 2) 🚧
- Tomasulo with speculation and branches (Phase 3) 🚧
- Tomasulo with branch prediction (Phase 4) 🚧

## ✨ Features

- **Browser-Based**: Runs entirely in the browser, no backend required
- **Static Deployment**: Ready for GitHub Pages deployment
- **Interactive Execution**: Step-by-step or continuous execution modes
- **Real-Time Visualization**: See pipeline stages, registers, and statistics update live
- **Educational Focus**: Clear separation of architectural and microarchitectural state
- **Type-Safe**: Written in TypeScript for correctness and maintainability

## 🏗️ Architecture

### Core Components

```
src/
├── core/
│   ├── types.ts           # Type definitions for the entire simulator
│   ├── instruction.ts     # RISC-V assembly parser
│   ├── state.ts           # Machine state management
│   ├── simulator.ts       # Main simulator engine
│   └── execution/
│       ├── base.ts        # Execution model interface
│       ├── pipeline.ts    # 5-stage pipeline implementation
│       └── tomasulo.ts    # Tomasulo (future phases)
└── main.ts                # UI application
```

### Design Principles

1. **Pure State Transitions**: The simulator core is a pure state-transition engine
2. **Separation of Concerns**: UI is completely decoupled from simulation logic
3. **Extensibility**: New execution models can be added by implementing the `ExecutionModel` interface
4. **Determinism**: Each cycle produces consistent, reproducible results
5. **Observable State**: Complete machine state is accessible for debugging and visualization

## 🚀 Getting Started

### Prerequisites

- Docker and Docker Compose
- Or Node.js 20+ (for local development without Docker)

### Using Docker (Recommended)

1. Build and start the container:
```bash
docker-compose up
```

2. Open your browser to `http://localhost:3000`

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser to `http://localhost:3000`

### Building for Production

```bash
npm run build
```

The static files will be in the `dist/` directory, ready for deployment.

## 📖 Usage

### Writing Assembly Code

The simulator supports a subset of RISC-V instructions:

**Arithmetic**: `ADD`, `SUB`, `MUL`, `DIV`, `ADDI`  
**Logical**: `AND`, `OR`, `XOR`  
**Memory**: `LD`, `ST`  
**Control**: `BEQ`, `BNE`, `J`  

### Example Programs

**Simple Addition:**
```asm
ADDI x1, x0, 5    # x1 = 5
ADDI x2, x0, 10   # x2 = 10
ADD x3, x1, x2    # x3 = x1 + x2
```

**Loop Example:**
```asm
ADDI x1, x0, 0    # counter = 0
ADDI x2, x0, 10   # limit = 10
loop:
ADDI x1, x1, 1    # counter++
BNE x1, x2, loop  # if counter != limit, goto loop
```

**Memory Operations:**
```asm
ADDI x1, x0, 100  # address = 100
ADDI x2, x0, 42   # value = 42
ST x2, 0(x1)      # mem[100] = 42
LD x3, 0(x1)      # x3 = mem[100]
```

### Controls

- **Load Program**: Parse and load assembly code
- **Step**: Execute one clock cycle
- **Run**: Execute continuously until completion
- **Reset**: Reset to initial state

## 🔬 Current Implementation: Phase 1

### 5-Stage Pipeline

The current implementation includes a classic 5-stage RISC-V pipeline:

1. **IF (Instruction Fetch)**: Fetch instruction from PC
2. **ID (Instruction Decode)**: Decode instruction and read registers
3. **EX (Execute)**: Perform ALU operations
4. **MEM (Memory Access)**: Load/store operations
5. **WB (Write Back)**: Write results to registers

### Features

- ✅ All basic RISC-V instructions
- ✅ Register file with 32 registers (x0-x31)
- ✅ Memory operations
- ✅ Branch and jump instructions
- ✅ Pipeline visualization
- ✅ Cycle-by-cycle execution
- ✅ Real-time statistics (IPC, cycles, instructions)

### Limitations (To Be Addressed in Future Phases)

- No data forwarding
- No hazard detection
- No branch prediction
- Simplified memory model

## 🛠️ Development

### Project Structure

```
rv-tomasulo-sim/
├── src/              # TypeScript source code
├── public/           # Static assets (CSS)
├── index.html        # Main HTML file
├── docker/           # Docker configuration
├── tests/            # Test files (future)
├── package.json      # Dependencies and scripts
├── tsconfig.json     # TypeScript configuration
└── vite.config.ts    # Build configuration
```

### Adding New Execution Models

To add a new execution model (e.g., Tomasulo):

1. Create a new file in `src/core/execution/`
2. Implement the `ExecutionModel` interface
3. Register it in the simulator factory
4. Add UI controls for the new mode

Example:

```typescript
export class TomasuloExecutionModel implements ExecutionModel {
  step(state: MachineState): MachineState {
    // Implement Tomasulo algorithm
  }
  
  reset(state: MachineState): MachineState {
    // Reset logic
  }
  
  isHalted(state: MachineState): boolean {
    // Check completion
  }
  
  getTrace(state: MachineState): TraceEntry[] {
    // Generate trace for visualization
  }
}
```

## 🧪 Testing

```bash
npm run test
```

## 📚 Educational Use

This simulator is designed for:

- Computer Architecture courses
- Self-paced learning
- Understanding CPU internals
- Comparing different execution strategies
- Visualizing instruction flow

### Learning Path

1. **Start Simple**: Run basic arithmetic programs to understand the pipeline
2. **Add Complexity**: Introduce branches and see pipeline bubbles
3. **Observe Behavior**: Watch how different instructions flow through stages
4. **Compare Models**: Once implemented, compare pipeline vs. Tomasulo performance

## 🗺️ Roadmap

- [x] Phase 1: 5-Stage Pipeline
- [ ] Phase 2: Tomasulo's Algorithm
  - [ ] Reservation stations
  - [ ] Register renaming
  - [ ] Common Data Bus
- [ ] Phase 3: Speculation
  - [ ] Reorder buffer
  - [ ] Speculative execution
  - [ ] Branch handling
- [ ] Phase 4: Branch Prediction
  - [ ] Branch prediction table
  - [ ] Branch target buffer
  - [ ] Performance comparison

## 📄 License

MIT License - Feel free to use this for educational purposes.

## 🤝 Contributing

This is an educational project. Contributions that enhance clarity, correctness, or educational value are welcome!

## 📧 Contact

For questions about computer architecture concepts demonstrated in this simulator, please refer to standard computer architecture textbooks such as:
- Hennessy & Patterson: Computer Architecture: A Quantitative Approach
- Patterson & Hennessy: Computer Organization and Design

---

**Built with TypeScript, Vite, and lots of ☕**