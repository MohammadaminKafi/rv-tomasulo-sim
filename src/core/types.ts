/**
 * Core type definitions for the 5-stage pipeline simulator
 * 
 * This file defines all types used by the pipeline simulator according to
 * the behavioral specification in SPECIFICATION.md
 */

// ============================================================================
// Instruction Types
// ============================================================================

/**
 * Supported instruction types
 */
export enum InstructionType {
  // Arithmetic (register-register)
  ADD = 'ADD',
  SUB = 'SUB',
  MUL = 'MUL',
  DIV = 'DIV',
  
  // Logical (register-register)
  AND = 'AND',
  OR = 'OR',
  XOR = 'XOR',
  
  // Immediate operations
  ADDI = 'ADDI',
  SUBI = 'SUBI',
  MULI = 'MULI',
  DIVI = 'DIVI',
  
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
 * EX latency for each instruction type
 */
export const EX_LATENCY: Record<InstructionType, number> = {
  [InstructionType.ADD]: 1,
  [InstructionType.SUB]: 1,
  [InstructionType.MUL]: 4,
  [InstructionType.DIV]: 6,
  [InstructionType.AND]: 1,
  [InstructionType.OR]: 1,
  [InstructionType.XOR]: 1,
  [InstructionType.ADDI]: 1,
  [InstructionType.SUBI]: 1,
  [InstructionType.MULI]: 4,
  [InstructionType.DIVI]: 6,
  [InstructionType.LD]: 1,
  [InstructionType.ST]: 1,
  [InstructionType.BEQ]: 1,
  [InstructionType.BNE]: 1,
  [InstructionType.J]: 1,
  [InstructionType.NOP]: 1,
};

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
  label?: string;   // For branches/jumps (original label name)
  address: number;  // Instruction address (PC)
  text: string;     // Original assembly text
  lineNumber?: number; // Source line number in assembly
}

/**
 * Check if instruction writes to a register
 */
export function instructionWritesRegister(type: InstructionType): boolean {
  return type !== InstructionType.ST &&
         type !== InstructionType.BEQ &&
         type !== InstructionType.BNE &&
         type !== InstructionType.J &&
         type !== InstructionType.NOP;
}

/**
 * Check if instruction is a branch or jump
 */
export function isBranchOrJump(type: InstructionType): boolean {
  return type === InstructionType.BEQ ||
         type === InstructionType.BNE ||
         type === InstructionType.J;
}

/**
 * Check if instruction is a memory operation
 */
export function isMemoryOp(type: InstructionType): boolean {
  return type === InstructionType.LD || type === InstructionType.ST;
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

// ============================================================================
// Pipeline Register Types (visible state between stages)
// ============================================================================

/**
 * IF/ID Pipeline Register
 */
export interface IFIDRegister {
  instruction: Instruction | null;
  pc: number;
  valid: boolean;
}

/**
 * ID/EX Pipeline Register
 */
export interface IDEXRegister {
  instruction: Instruction | null;
  pc: number;
  rs1Value: number;
  rs2Value: number;
  rs1: number | null;  // Register number for forwarding detection
  rs2: number | null;  // Register number for forwarding detection
  rd: number | null;
  imm: number | null;
  valid: boolean;
  exCyclesRemaining: number;  // Remaining EX cycles
}

/**
 * EX/MEM Pipeline Register
 */
export interface EXMEMRegister {
  instruction: Instruction | null;
  pc: number;
  aluResult: number;
  rs2Value: number;  // For store data
  rd: number | null;
  branchTaken: boolean;
  branchTarget: number;
  valid: boolean;
}

/**
 * MEM/WB Pipeline Register
 */
export interface MEMWBRegister {
  instruction: Instruction | null;
  pc: number;
  result: number;
  rd: number | null;
  writeReg: boolean;
  valid: boolean;
}

/**
 * Complete pipeline registers structure
 */
export interface PipelineRegisters {
  IFID: IFIDRegister;
  IDEX: IDEXRegister;
  EXMEM: EXMEMRegister;
  MEMWB: MEMWBRegister;
}

// ============================================================================
// Event Logging Types
// ============================================================================

/**
 * Event types for logging
 */
export enum EventType {
  FETCH = 'FETCH',
  DECODE = 'DECODE',
  EXECUTE = 'EXECUTE',
  EXECUTE_CONTINUE = 'EXECUTE_CONTINUE',
  EXECUTE_COMPLETE = 'EXECUTE_COMPLETE',
  MEMORY_READ = 'MEMORY_READ',
  MEMORY_WRITE = 'MEMORY_WRITE',
  WRITEBACK = 'WRITEBACK',
  FORWARD = 'FORWARD',
  STALL_STRUCTURAL = 'STALL_STRUCTURAL',
  STALL_DATA = 'STALL_DATA',
  STALL_BRANCH = 'STALL_BRANCH',
  FLUSH = 'FLUSH',
  ERROR = 'ERROR',
  PC_UPDATE = 'PC_UPDATE',
}

/**
 * A single event in the log
 */
export interface PipelineEvent {
  cycle: number;
  type: EventType;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Stall reason enumeration
 */
export enum StallReason {
  NONE = 'NONE',
  STRUCTURAL_EX_BUSY = 'STRUCTURAL_EX_BUSY',
  LOAD_USE_HAZARD = 'LOAD_USE_HAZARD',
  BRANCH_OPERAND = 'BRANCH_OPERAND',
}

/**
 * Forwarding source enumeration
 */
export enum ForwardingSource {
  NONE = 'NONE',
  EXMEM = 'EX/MEM',
  MEMWB = 'MEM/WB',
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
 * Reservation station state enumeration
 */
export enum RSState {
  WAITING = 'WAITING',       // Waiting for operands
  READY = 'READY',           // All operands ready, waiting for FU
  EXECUTING = 'EXECUTING',   // Currently executing
  DONE = 'DONE',             // Execution complete, waiting for CDB
}

/**
 * Reservation station type enumeration
 */
export enum RSType {
  INT = 'INT',
  MUL = 'MUL',
  DIV = 'DIV',
  LOAD = 'LOAD',
  STORE = 'STORE',
  BRANCH = 'BRANCH',
}

/**
 * Get RS type for an instruction
 */
export function getRSTypeForInstruction(type: InstructionType): RSType | null {
  switch (type) {
    case InstructionType.ADD:
    case InstructionType.SUB:
    case InstructionType.AND:
    case InstructionType.OR:
    case InstructionType.XOR:
    case InstructionType.ADDI:
    case InstructionType.SUBI:
      return RSType.INT;
    case InstructionType.MUL:
    case InstructionType.MULI:
      return RSType.MUL;
    case InstructionType.DIV:
    case InstructionType.DIVI:
      return RSType.DIV;
    case InstructionType.LD:
      return RSType.LOAD;
    case InstructionType.ST:
      return RSType.STORE;
    case InstructionType.BEQ:
    case InstructionType.BNE:
    case InstructionType.J:
      return RSType.BRANCH;
    case InstructionType.NOP:
      return null; // NOP doesn't use RS
  }
}

/**
 * Get execution latency for Tomasulo mode
 */
export function getTomasuloLatency(type: InstructionType, config?: TomasuloConfig): number {
  const defaultConfig = DEFAULT_TOMASULO_CONFIG;
  const cfg = config || defaultConfig;
  
  switch (type) {
    case InstructionType.ADD:
    case InstructionType.SUB:
    case InstructionType.AND:
    case InstructionType.OR:
    case InstructionType.XOR:
    case InstructionType.ADDI:
    case InstructionType.SUBI:
      return cfg.integerLatency;
    case InstructionType.MUL:
    case InstructionType.MULI:
      return cfg.multiplyLatency;
    case InstructionType.DIV:
    case InstructionType.DIVI:
      return cfg.divideLatency;
    case InstructionType.LD:
      return cfg.loadLatency;
    case InstructionType.ST:
      return cfg.storeLatency;
    case InstructionType.BEQ:
    case InstructionType.BNE:
    case InstructionType.J:
      return 1; // Branch latency
    case InstructionType.NOP:
      return 0;
  }
}

/**
 * Reservation station entry
 */
export interface ReservationStation {
  id: string;                      // Unique RS ID (e.g., "INT0", "MUL1")
  rsType: RSType;                  // Type of RS
  busy: boolean;                   // Entry is occupied
  op: InstructionType | null;      // Operation to perform
  
  // Source operand 1
  Vj: number | null;               // Value (if ready)
  Qj: string | null;               // Tag of producing RS (null if ready)
  
  // Source operand 2 / Store data
  Vk: number | null;               // Value (if ready)
  Qk: string | null;               // Tag of producing RS (null if ready)
  
  // For immediate operations and memory
  imm: number;                     // Immediate value or offset
  address: number | null;          // Computed effective address (for memory ops)
  addressReady: boolean;           // Address has been computed
  
  // Destination tracking
  destTag: string;                 // This RS's tag (same as id)
  destReg: number | null;          // Architectural destination register
  
  // Execution state
  state: RSState;                  // Current state
  remainingCycles: number;         // Cycles left for execution
  result: number | null;           // Computed result (when DONE)
  
  // Instruction tracking
  instruction: Instruction | null; // The instruction in this RS
  instrIndex: number;              // Index in program for ordering
  issueCycle: number | null;       // Cycle when issued
  execStartCycle: number | null;   // Cycle when execution started
  execEndCycle: number | null;     // Cycle when execution completed
  writeResultCycle: number | null; // Cycle when result was broadcast
}

/**
 * Register Alias Table entry (RAT)
 */
export interface RegisterStatus {
  tag: string | null;   // RS tag that will produce this value, or null if ready
}

/**
 * Common Data Bus (CDB) broadcast
 */
export interface CDBBroadcast {
  tag: string;          // Reservation station ID
  value: number;        // Computed value
  destReg: number;      // Destination register
  instrIndex: number;   // For tracking
}

/**
 * Instruction status entry for visualization
 */
export interface InstructionStatus {
  instruction: Instruction;
  instrIndex: number;           // Program order index
  issueCycle: number | null;    // Cycle when issued
  execStartCycle: number | null; // Cycle when execution started
  execEndCycle: number | null;   // Cycle when execution completed
  writeResultCycle: number | null; // Cycle when result was broadcast
  rsId: string | null;          // RS where instruction was placed
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
  errorMessage?: string;        // Error message if halted due to error
}

/**
 * Memory configuration constants
 */
export const MEMORY_SIZE = 1024;  // 1KB memory
export const WORD_SIZE = 4;        // 4 bytes per word

/**
 * Microarchitectural state for pipeline
 */
export interface PipelineState {
  registers: PipelineRegisters;
  
  // Statistics
  stallCycles: number;
  flushCount: number;
  forwardingEvents: number;
  instructionsCompleted: number;
  
  // Current cycle state
  currentStallReason: StallReason;
  
  // Track the instruction that just completed WB (for visualization)
  lastWBInstruction: string | null;
  
  // Event log
  events: PipelineEvent[];
}

/**
 * Tomasulo event types for logging
 */
export enum TomasuloEventType {
  ISSUE = 'ISSUE',
  ISSUE_STALL = 'ISSUE_STALL',
  EXEC_START = 'EXEC_START',
  EXEC_CONTINUE = 'EXEC_CONTINUE',
  EXEC_END = 'EXEC_END',
  OPERAND_WAKEUP = 'OPERAND_WAKEUP',
  CDB_BROADCAST = 'CDB_BROADCAST',
  CDB_CONTENTION = 'CDB_CONTENTION',
  RAT_UPDATE = 'RAT_UPDATE',
  ARF_WRITE = 'ARF_WRITE',
  MEM_READ = 'MEM_READ',
  MEM_WRITE = 'MEM_WRITE',
  ADDR_CALC = 'ADDR_CALC',
  BRANCH_RESOLVE = 'BRANCH_RESOLVE',
  PC_UPDATE = 'PC_UPDATE',
  RS_FREE = 'RS_FREE',
  ERROR = 'ERROR',
}

/**
 * A single event in Tomasulo execution
 */
export interface TomasuloEvent {
  cycle: number;
  type: TomasuloEventType;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Tomasulo configuration
 */
export interface TomasuloConfig {
  integerRS: number;      // Number of integer reservation stations
  multiplyRS: number;     // Number of multiply reservation stations
  divideRS: number;       // Number of divide reservation stations
  loadBuffers: number;    // Number of load buffers
  storeBuffers: number;   // Number of store buffers
  branchRS: number;       // Number of branch RS
  
  // Latencies (in cycles)
  integerLatency: number;
  multiplyLatency: number;
  divideLatency: number;
  loadLatency: number;    // Includes address calc + memory access
  storeLatency: number;   // Includes address calc + memory access
}

/**
 * Default Tomasulo configuration
 */
export const DEFAULT_TOMASULO_CONFIG: TomasuloConfig = {
  integerRS: 3,
  multiplyRS: 2,
  divideRS: 2,
  loadBuffers: 3,
  storeBuffers: 3,
  branchRS: 1,
  integerLatency: 1,
  multiplyLatency: 4,
  divideLatency: 6,
  loadLatency: 2,   // 1 addr + 1 mem
  storeLatency: 2,  // 1 addr + 1 mem
};

/**
 * Microarchitectural state for Tomasulo
 */
export interface TomasuloState {
  // Reservation stations organized by type
  reservationStations: Map<string, ReservationStation>;
  
  // Register Alias Table (RAT)
  rat: Map<number, RegisterStatus>;
  
  // Current CDB broadcast (null if idle)
  cdb: CDBBroadcast | null;
  
  // Instruction status tracking (for visualization)
  instructionStatus: InstructionStatus[];
  
  // Issue tracking
  nextInstrIndex: number;        // Next instruction to issue (PC / 4)
  branchPending: boolean;        // A branch is in-flight
  
  // Store ordering tracking
  storeQueue: string[];          // RS IDs of stores in program order
  
  // Statistics
  issueStalls: number;
  rsFullStalls: number;
  cdbBroadcasts: number;
  cdbContentionCycles: number;
  memoryReads: number;
  memoryWrites: number;
  
  // Event log
  events: TomasuloEvent[];
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
  events: PipelineEvent[];
  statistics: {
    totalCycles: number;
    instructionsCompleted: number;
    stallCycles: number;
    flushCount: number;
    forwardingEvents: number;
    memoryReads: number;
    memoryWrites: number;
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
  };
  
  // Tomasulo configuration
  tomasuloConfig?: TomasuloConfig;
}

/**
 * Default simulator configuration
 */
export const DEFAULT_CONFIG: SimulatorConfig = {
  mode: ExecutionMode.PIPELINE,
  pipelineConfig: {
    dataForwarding: true,
  },
  tomasuloConfig: DEFAULT_TOMASULO_CONFIG,
};
