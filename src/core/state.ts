/**
 * Machine state management
 */

import {
  ArchitecturalState,
  RegisterFile,
  Memory,
  MachineState,
  ExecutionMode,
  Instruction,
  PipelineState,
  PipelineRegisters,
  TomasuloState,
  TomasuloConfig,
  RegisterStatus,
  ReservationStation,
  RSState,
  RSType,
  StallReason,
  MEMORY_SIZE,
  WORD_SIZE,
  DEFAULT_TOMASULO_CONFIG,
} from './types';

/**
 * Create initial register file (all zeros, x0 is hardwired to 0)
 */
export function createRegisterFile(): RegisterFile {
  return {
    registers: new Array(32).fill(0),
  };
}

/**
 * Create initial memory
 */
export function createMemory(): Memory {
  return {
    data: new Map(),
  };
}

/**
 * Create empty pipeline registers
 */
export function createPipelineRegisters(): PipelineRegisters {
  return {
    IFID: { instruction: null, pc: 0, valid: false },
    IDEX: { 
      instruction: null, 
      pc: 0, 
      rs1Value: 0, 
      rs2Value: 0, 
      rs1: null,
      rs2: null,
      rd: null, 
      imm: null, 
      valid: false,
      exCyclesRemaining: 0,
    },
    EXMEM: { 
      instruction: null, 
      pc: 0, 
      aluResult: 0, 
      rs2Value: 0, 
      rd: null, 
      branchTaken: false,
      branchTarget: 0,
      valid: false,
    },
    MEMWB: { 
      instruction: null, 
      pc: 0, 
      result: 0, 
      rd: null, 
      writeReg: false,
      valid: false,
    },
  };
}

/**
 * Create initial architectural state
 */
export function createArchitecturalState(instructions: Instruction[]): ArchitecturalState {
  return {
    pc: 0,
    registers: createRegisterFile(),
    memory: createMemory(),
    cycle: 0,
    instructions: [...instructions],
    halted: false,
  };
}

/**
 * Create initial pipeline state
 */
export function createPipelineState(): PipelineState {
  return {
    registers: createPipelineRegisters(),
    stallCycles: 0,
    flushCount: 0,
    forwardingEvents: 0,
    instructionsCompleted: 0,
    currentStallReason: StallReason.NONE,
    lastWBInstruction: null,
    events: [],
  };
}

/**
 * Create an empty reservation station entry
 */
export function createEmptyRS(id: string, rsType: RSType): ReservationStation {
  return {
    id,
    rsType,
    busy: false,
    op: null,
    Vj: null,
    Qj: null,
    Vk: null,
    Qk: null,
    imm: 0,
    address: null,
    addressReady: false,
    destTag: id,
    destReg: null,
    state: RSState.WAITING,
    remainingCycles: 0,
    result: null,
    instruction: null,
    instrIndex: -1,
    issueCycle: null,
    execStartCycle: null,
    execEndCycle: null,
    writeResultCycle: null,
  };
}

/**
 * Create initial Tomasulo state
 */
export function createTomasuloState(config: TomasuloConfig): TomasuloState {
  const reservationStations = new Map<string, ReservationStation>();
  
  // Create integer reservation stations
  for (let i = 0; i < config.integerRS; i++) {
    const id = `INT${i}`;
    reservationStations.set(id, createEmptyRS(id, RSType.INT));
  }
  
  // Create multiply reservation stations
  for (let i = 0; i < config.multiplyRS; i++) {
    const id = `MUL${i}`;
    reservationStations.set(id, createEmptyRS(id, RSType.MUL));
  }
  
  // Create divide reservation stations
  for (let i = 0; i < config.divideRS; i++) {
    const id = `DIV${i}`;
    reservationStations.set(id, createEmptyRS(id, RSType.DIV));
  }
  
  // Create load buffers
  for (let i = 0; i < config.loadBuffers; i++) {
    const id = `LOAD${i}`;
    reservationStations.set(id, createEmptyRS(id, RSType.LOAD));
  }
  
  // Create store buffers
  for (let i = 0; i < config.storeBuffers; i++) {
    const id = `STORE${i}`;
    reservationStations.set(id, createEmptyRS(id, RSType.STORE));
  }
  
  // Create branch RS
  for (let i = 0; i < config.branchRS; i++) {
    const id = `BR${i}`;
    reservationStations.set(id, createEmptyRS(id, RSType.BRANCH));
  }
  
  // Initialize Register Alias Table (all ready)
  const rat = new Map<number, RegisterStatus>();
  for (let i = 0; i < 32; i++) {
    rat.set(i, { tag: null });
  }
  
  return {
    reservationStations,
    rat,
    cdb: null,
    instructionStatus: [],
    nextInstrIndex: 0,
    branchPending: false,
    storeQueue: [],
    issueStalls: 0,
    rsFullStalls: 0,
    cdbBroadcasts: 0,
    cdbContentionCycles: 0,
    memoryReads: 0,
    memoryWrites: 0,
    events: [],
  };
}

/**
 * Create initial machine state based on execution mode
 */
export function createMachineState(
  mode: ExecutionMode,
  instructions: Instruction[],
  tomasuloConfig?: Partial<TomasuloConfig>
): MachineState {
  const architectural = createArchitecturalState(instructions);
  
  const state: MachineState = {
    architectural,
    mode,
  };
  
  if (mode === ExecutionMode.PIPELINE) {
    state.pipeline = createPipelineState();
  } else if (
    mode === ExecutionMode.TOMASULO ||
    mode === ExecutionMode.TOMASULO_SPECULATION ||
    mode === ExecutionMode.TOMASULO_BRANCH_PRED
  ) {
    const config: TomasuloConfig = {
      ...DEFAULT_TOMASULO_CONFIG,
      ...tomasuloConfig,
    };
    state.tomasulo = createTomasuloState(config);
  }
  
  return state;
}

/**
 * Read register value (x0 is always 0)
 */
export function readRegister(state: ArchitecturalState, reg: number): number {
  if (reg === 0) return 0;
  if (reg < 0 || reg > 31) {
    throw new Error(`Invalid register: x${reg}`);
  }
  return state.registers.registers[reg];
}

/**
 * Write register value (x0 writes are ignored)
 */
export function writeRegister(state: ArchitecturalState, reg: number, value: number): void {
  if (reg === 0) return; // x0 is hardwired to 0
  if (reg < 0 || reg > 31) {
    throw new Error(`Invalid register: x${reg}`);
  }
  state.registers.registers[reg] = value;
}

/**
 * Memory access error types
 */
export class MemoryError extends Error {
  constructor(message: string, public address: number) {
    super(message);
    this.name = 'MemoryError';
  }
}

/**
 * Check memory address bounds and alignment
 */
export function checkMemoryAccess(address: number): void {
  // Check alignment (must be 4-byte aligned)
  if ((address & 0x3) !== 0) {
    throw new MemoryError(
      `Memory alignment error: address 0x${address.toString(16)} is not 4-byte aligned`,
      address
    );
  }
  
  // Check bounds
  if (address < 0 || address >= MEMORY_SIZE) {
    throw new MemoryError(
      `Memory access out of bounds: address 0x${address.toString(16)} (valid range: 0x0 - 0x${(MEMORY_SIZE - 1).toString(16)})`,
      address
    );
  }
}

/**
 * Read memory value with bounds checking
 */
export function readMemory(state: ArchitecturalState, address: number): number {
  checkMemoryAccess(address);
  return state.memory.data.get(address) ?? 0;
}

/**
 * Write memory value with bounds checking
 */
export function writeMemory(state: ArchitecturalState, address: number, value: number): void {
  checkMemoryAccess(address);
  state.memory.data.set(address, value);
}

/**
 * Clone machine state for snapshotting
 */
export function cloneMachineState(state: MachineState): MachineState {
  const clone = JSON.parse(JSON.stringify(state));
  // Restore Map objects that don't serialize properly
  if (clone.architectural.memory.data) {
    clone.architectural.memory.data = new Map(Object.entries(clone.architectural.memory.data).map(
      ([k, v]) => [parseInt(k), v as number]
    ));
  } else {
    clone.architectural.memory.data = new Map();
  }
  return clone;
}

/**
 * Get current instruction at PC
 */
export function getCurrentInstruction(state: ArchitecturalState): Instruction | null {
  const index = state.pc / WORD_SIZE; // Word-aligned
  if (index >= 0 && index < state.instructions.length) {
    return state.instructions[index];
  }
  return null;
}

/**
 * Clone pipeline registers
 */
export function clonePipelineRegisters(regs: PipelineRegisters): PipelineRegisters {
  return JSON.parse(JSON.stringify(regs));
}
