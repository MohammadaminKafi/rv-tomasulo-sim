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
  PipelineStage,
  TomasuloState,
  RegisterStatus,
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
  const stages = new Map();
  for (const stage of Object.values(PipelineStage)) {
    stages.set(stage, {
      instruction: null,
      stage,
      stalled: false,
    });
  }
  
  return {
    stages,
    stalls: 0,
    flushes: 0,
  };
}

/**
 * Create initial Tomasulo state
 */
export function createTomasuloState(config: {
  integerRS: number;
  multiplyRS: number;
  divideRS: number;
  loadBuffers: number;
  storeBuffers: number;
}): TomasuloState {
  const reservationStations = new Map();
  
  // Create integer reservation stations
  for (let i = 0; i < config.integerRS; i++) {
    reservationStations.set(`INT${i}`, {
      id: `INT${i}`,
      busy: false,
      op: null,
      vj: null,
      vk: null,
      qj: null,
      qk: null,
      dest: null,
      instruction: null,
    });
  }
  
  // Create multiply reservation stations
  for (let i = 0; i < config.multiplyRS; i++) {
    reservationStations.set(`MUL${i}`, {
      id: `MUL${i}`,
      busy: false,
      op: null,
      vj: null,
      vk: null,
      qj: null,
      qk: null,
      dest: null,
      instruction: null,
    });
  }
  
  // Create divide reservation stations
  for (let i = 0; i < config.divideRS; i++) {
    reservationStations.set(`DIV${i}`, {
      id: `DIV${i}`,
      busy: false,
      op: null,
      vj: null,
      vk: null,
      qj: null,
      qk: null,
      dest: null,
      instruction: null,
    });
  }
  
  // Create load buffers
  for (let i = 0; i < config.loadBuffers; i++) {
    reservationStations.set(`LOAD${i}`, {
      id: `LOAD${i}`,
      busy: false,
      op: null,
      vj: null,
      vk: null,
      qj: null,
      qk: null,
      dest: null,
      address: undefined,
      instruction: null,
    });
  }
  
  // Create store buffers
  for (let i = 0; i < config.storeBuffers; i++) {
    reservationStations.set(`STORE${i}`, {
      id: `STORE${i}`,
      busy: false,
      op: null,
      vj: null,
      vk: null,
      qj: null,
      qk: null,
      dest: null,
      address: undefined,
      instruction: null,
    });
  }
  
  // Initialize register status (all free)
  const registerStatus = new Map<number, RegisterStatus>();
  for (let i = 0; i < 32; i++) {
    registerStatus.set(i, { qi: null });
  }
  
  return {
    reservationStations,
    registerStatus,
    cdb: null,
    instructionQueue: [],
  };
}

/**
 * Create initial machine state based on execution mode
 */
export function createMachineState(
  mode: ExecutionMode,
  instructions: Instruction[],
  config?: {
    integerRS?: number;
    multiplyRS?: number;
    divideRS?: number;
    loadBuffers?: number;
    storeBuffers?: number;
  }
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
    const defaultConfig = {
      integerRS: 3,
      multiplyRS: 2,
      divideRS: 2,
      loadBuffers: 3,
      storeBuffers: 3,
      ...config,
    };
    state.tomasulo = createTomasuloState(defaultConfig);
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
 * Read memory value
 */
export function readMemory(state: ArchitecturalState, address: number): number {
  return state.memory.data.get(address) ?? 0;
}

/**
 * Write memory value
 */
export function writeMemory(state: ArchitecturalState, address: number, value: number): void {
  state.memory.data.set(address, value);
}

/**
 * Clone machine state for snapshotting
 */
export function cloneMachineState(state: MachineState): MachineState {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Get current instruction at PC
 */
export function getCurrentInstruction(state: ArchitecturalState): Instruction | null {
  const index = state.pc / 4; // Word-aligned
  if (index >= 0 && index < state.instructions.length) {
    return state.instructions[index];
  }
  return null;
}
