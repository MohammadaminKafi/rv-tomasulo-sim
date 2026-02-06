/**
 * Core type definitions for the RISC-V Tomasulo simulator
 */

// ============================================================================
// Instruction Types
// ============================================================================

/**
 * RISC-V instruction types
 */
export enum InstructionType {
  // Arithmetic
  ADD = 'ADD',
  SUB = 'SUB',
  MUL = 'MUL',
  DIV = 'DIV',
  
  // Logical
  AND = 'AND',
  OR = 'OR',
  XOR = 'XOR',
  
  // Immediate operations
  ADDI = 'ADDI',
  
  // Load/Store
  LD = 'LD',
  ST = 'ST',
  
  // Branch
  BEQ = 'BEQ',
  BNE = 'BNE',
  
  // Jump
  J = 'J',
  
  // No-op
  NOP = 'NOP',
}

/**
 * Functional unit types required for instruction execution
 */
export enum FunctionalUnitType {
  INTEGER = 'INTEGER',
  MULTIPLY = 'MULTIPLY',
  DIVIDE = 'DIVIDE',
  LOAD = 'LOAD',
  STORE = 'STORE',
  BRANCH = 'BRANCH',
}

/**
 * Parsed instruction representation
 */
export interface Instruction {
  type: InstructionType;
  rd?: number;      // Destination register
  rs1?: number;     // Source register 1
  rs2?: number;     // Source register 2
  imm?: number;     // Immediate value
  label?: string;   // For branches/jumps
  address: number;  // Instruction address (PC)
  text: string;     // Original assembly text
  lineNumber?: number; // Source line number in assembly
}

// ============================================================================
// Register and Memory Types
// ============================================================================

/**
 * Register file state
 */
export interface RegisterFile {
  registers: number[];  // 32 registers (x0-x31)
}

/**
 * Memory state
 */
export interface Memory {
  data: Map<number, number>;  // Address -> Value mapping
}

// ============================================================================
// Execution Model Types
// ============================================================================

/**
 * Execution mode selection
 */
export enum ExecutionMode {
  PIPELINE = 'PIPELINE',           // 5-stage RISC-V pipeline
  TOMASULO = 'TOMASULO',          // Tomasulo's algorithm
  TOMASULO_SPECULATION = 'TOMASULO_SPECULATION',  // With speculation
  TOMASULO_BRANCH_PRED = 'TOMASULO_BRANCH_PRED', // With branch prediction
}

/**
 * Pipeline stage identifiers
 */
export enum PipelineStage {
  IF = 'IF',    // Instruction Fetch
  ID = 'ID',    // Instruction Decode
  EX = 'EX',    // Execute
  MEM = 'MEM',  // Memory Access
  WB = 'WB',    // Write Back
}

/**
 * Instruction status in pipeline
 */
export interface PipelineEntry {
  instruction: Instruction | null;
  stage: PipelineStage;
  stalled: boolean;
}

// ============================================================================
// Tomasulo-specific Types
// ============================================================================

/**
 * Reservation station state
 */
export interface ReservationStation {
  id: string;
  busy: boolean;
  op: InstructionType | null;
  vj: number | null;     // Value of source operand 1
  vk: number | null;     // Value of source operand 2
  qj: string | null;     // Reservation station producing source 1
  qk: string | null;     // Reservation station producing source 2
  dest: number | null;   // Destination register
  address?: number;      // For load/store
  instruction: Instruction | null;
}

/**
 * Register status for Tomasulo
 */
export interface RegisterStatus {
  qi: string | null;  // Reservation station that will write this register
}

/**
 * Common Data Bus (CDB) broadcast
 */
export interface CDBBroadcast {
  source: string;  // Reservation station ID
  value: number;   // Computed value
  dest: number;    // Destination register
}

// ============================================================================
// Machine State
// ============================================================================

/**
 * Complete architectural state of the machine
 */
export interface ArchitecturalState {
  pc: number;                    // Program Counter
  registers: RegisterFile;        // Register file
  memory: Memory;                // Main memory
  cycle: number;                 // Current cycle number
  instructions: Instruction[];   // Loaded program
  halted: boolean;              // Execution complete flag
}

/**
 * Microarchitectural state for pipeline
 */
export interface PipelineState {
  stages: Map<PipelineStage, PipelineEntry>;
  stalls: number;
  flushes: number;
}

/**
 * Microarchitectural state for Tomasulo
 */
export interface TomasuloState {
  reservationStations: Map<string, ReservationStation>;
  registerStatus: Map<number, RegisterStatus>;
  cdb: CDBBroadcast | null;
  instructionQueue: Instruction[];
}

/**
 * Complete machine state
 */
export interface MachineState {
  architectural: ArchitecturalState;
  pipeline?: PipelineState;
  tomasulo?: TomasuloState;
  mode: ExecutionMode;
}

// ============================================================================
// Execution Trace Types
// ============================================================================

/**
 * Trace entry for visualization
 */
export interface TraceEntry {
  cycle: number;
  instruction: Instruction;
  stage: string;
  details: Record<string, unknown>;
}

/**
 * Complete execution trace
 */
export interface ExecutionTrace {
  entries: TraceEntry[];
  statistics: {
    totalCycles: number;
    instructionsExecuted: number;
    stalls: number;
    ipc: number;  // Instructions per cycle
  };
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Simulator configuration
 */
export interface SimulatorConfig {
  mode: ExecutionMode;
  
  // Pipeline configuration
  pipelineConfig?: {
    dataForwarding: boolean;
    branchPrediction: boolean;
  };
  
  // Tomasulo configuration
  tomasuloConfig?: {
    integerRS: number;    // Number of integer reservation stations
    multiplyRS: number;   // Number of multiply reservation stations
    divideRS: number;     // Number of divide reservation stations
    loadBuffers: number;  // Number of load buffers
    storeBuffers: number; // Number of store buffers
    
    // Latencies
    integerLatency: number;
    multiplyLatency: number;
    divideLatency: number;
    loadLatency: number;
    storeLatency: number;
  };
}

/**
 * Default simulator configuration
 */
export const DEFAULT_CONFIG: SimulatorConfig = {
  mode: ExecutionMode.PIPELINE,
  pipelineConfig: {
    dataForwarding: true,
    branchPrediction: false,
  },
  tomasuloConfig: {
    integerRS: 3,
    multiplyRS: 2,
    divideRS: 2,
    loadBuffers: 3,
    storeBuffers: 3,
    integerLatency: 1,
    multiplyLatency: 10,
    divideLatency: 40,
    loadLatency: 2,
    storeLatency: 2,
  },
};
