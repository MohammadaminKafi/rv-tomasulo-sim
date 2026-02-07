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
  speculation?: SpeculationState;
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
  
  // Speculation configuration
  speculationConfig?: SpeculationConfig;
  
  // Runtime configuration (user-customizable settings)
  runtimeConfig?: RuntimeConfig;
}

// ============================================================================
// Phase 3: Tomasulo + Speculation Types
// ============================================================================

/**
 * ROB entry type classification
 */
export enum ROBEntryType {
  ALU = 'ALU',
  LOAD = 'LOAD',
  STORE = 'STORE',
  BRANCH = 'BRANCH',
  JUMP = 'JUMP',
  NOP = 'NOP',
}

/**
 * ROB entry state
 */
export enum ROBState {
  ISSUED = 'ISSUED',           // Issued, waiting for execution
  EXECUTING = 'EXECUTING',     // Currently executing in RS/FU
  WRITE_RESULT = 'WRITE_RESULT', // Wrote result, waiting for commit
  COMMITTED = 'COMMITTED',     // Successfully committed
  SQUASHED = 'SQUASHED',       // Flushed due to mispredict
}

/**
 * Get ROB entry type for an instruction
 */
export function getROBEntryType(type: InstructionType): ROBEntryType {
  switch (type) {
    case InstructionType.ADD:
    case InstructionType.SUB:
    case InstructionType.MUL:
    case InstructionType.DIV:
    case InstructionType.AND:
    case InstructionType.OR:
    case InstructionType.XOR:
    case InstructionType.ADDI:
    case InstructionType.SUBI:
    case InstructionType.MULI:
    case InstructionType.DIVI:
      return ROBEntryType.ALU;
    case InstructionType.LD:
      return ROBEntryType.LOAD;
    case InstructionType.ST:
      return ROBEntryType.STORE;
    case InstructionType.BEQ:
    case InstructionType.BNE:
      return ROBEntryType.BRANCH;
    case InstructionType.J:
      return ROBEntryType.JUMP;
    case InstructionType.NOP:
      return ROBEntryType.NOP;
  }
}

/**
 * RAT entry for speculation mode (points to ROB index)
 */
export interface SpeculationRATEntry {
  robIndex: number | null;  // ROB entry producing this value, or null if ready in ARF
}

/**
 * Reorder Buffer entry
 */
export interface ROBEntry {
  // Identification
  index: number;              // ROB entry index (0 to size-1)
  busy: boolean;              // Entry is occupied
  instrIndex: number;         // Program order index for tie-breaking
  pc: number;                 // Instruction PC (for debugging)
  
  // Instruction info
  type: ROBEntryType;         // ALU, LOAD, STORE, BRANCH, JUMP, NOP
  instruction: Instruction | null;  // The instruction
  
  // Destination register (for ALU/LOAD)
  destReg: number | null;     // Architectural destination register
  value: number | null;       // Computed result
  ready: boolean;             // Result is ready (execution complete)
  
  // Store-specific fields
  storeAddress: number | null;   // Computed store address
  storeAddressReady: boolean;    // Address has been computed
  storeData: number | null;      // Store data value
  storeDataReady: boolean;       // Data is ready
  
  // Branch-specific fields
  predictedTaken: boolean;       // Predicted direction
  predictedTarget: number;       // Predicted target PC
  predictedNextPC: number;       // Predicted next PC after branch
  actualTaken: boolean | null;   // Actual direction (set on resolution)
  actualTarget: number | null;   // Actual target PC (set on resolution)
  actualNextPC: number | null;   // Actual next PC after branch
  branchResolved: boolean;       // Branch has been resolved
  mispredicted: boolean;         // Was mispredicted
  
  // Checkpointing for branch recovery
  ratCheckpoint: Map<number, SpeculationRATEntry> | null;
  
  // Execution state tracking
  state: ROBState;            // Current state
  rsId: string | null;        // Associated RS entry ID
  
  // Cycle tracking
  issueCycle: number | null;
  execStartCycle: number | null;
  execEndCycle: number | null;
  writeResultCycle: number | null;
  commitCycle: number | null;
}

/**
 * CDB broadcast for speculation mode (uses ROB index as tag)
 */
export interface SpeculationCDBBroadcast {
  robIndex: number;        // ROB entry index (the tag)
  value: number;           // Computed value
  destReg: number | null;  // Destination register
  instrIndex: number;      // Program order index
}

/**
 * Speculation event types for logging
 */
export enum SpeculationEventType {
  // Issue events
  ISSUE = 'ISSUE',
  ISSUE_STALL_RS_FULL = 'ISSUE_STALL_RS_FULL',
  ISSUE_STALL_ROB_FULL = 'ISSUE_STALL_ROB_FULL',
  
  // ROB events
  ROB_ALLOCATE = 'ROB_ALLOCATE',
  ROB_UPDATE = 'ROB_UPDATE',
  ROB_COMMIT = 'ROB_COMMIT',
  ROB_SQUASH = 'ROB_SQUASH',
  
  // RAT events
  RAT_UPDATE = 'RAT_UPDATE',
  RAT_CHECKPOINT = 'RAT_CHECKPOINT',
  RAT_RESTORE = 'RAT_RESTORE',
  RAT_CLEAR = 'RAT_CLEAR',
  
  // RS events
  RS_ALLOCATE = 'RS_ALLOCATE',
  RS_OPERAND_WAKEUP = 'RS_OPERAND_WAKEUP',
  RS_FREE = 'RS_FREE',
  
  // Execution events
  EXEC_START = 'EXEC_START',
  EXEC_CONTINUE = 'EXEC_CONTINUE',
  EXEC_END = 'EXEC_END',
  ADDR_CALC = 'ADDR_CALC',
  
  // CDB events
  CDB_BROADCAST = 'CDB_BROADCAST',
  CDB_CONTENTION = 'CDB_CONTENTION',
  
  // Branch events
  BRANCH_PREDICT = 'BRANCH_PREDICT',
  BRANCH_RESOLVE = 'BRANCH_RESOLVE',
  BRANCH_CORRECT = 'BRANCH_CORRECT',
  BRANCH_MISPREDICT = 'BRANCH_MISPREDICT',
  
  // Recovery events
  RECOVERY_START = 'RECOVERY_START',
  RECOVERY_SQUASH = 'RECOVERY_SQUASH',
  RECOVERY_COMPLETE = 'RECOVERY_COMPLETE',
  
  // Memory events
  MEM_READ = 'MEM_READ',
  MEM_WRITE = 'MEM_WRITE',
  
  // ARF events
  ARF_WRITE = 'ARF_WRITE',
  
  // PC events
  PC_UPDATE = 'PC_UPDATE',
  PC_REDIRECT = 'PC_REDIRECT',
  
  // Error
  ERROR = 'ERROR',
}

/**
 * A single event in speculation execution
 */
export interface SpeculationEvent {
  cycle: number;
  type: SpeculationEventType;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Instruction status for speculation mode (includes commit cycle)
 */
export interface SpeculationInstructionStatus {
  instruction: Instruction;
  instrIndex: number;
  robIndex: number;
  issueCycle: number | null;
  execStartCycle: number | null;
  execEndCycle: number | null;
  writeResultCycle: number | null;
  commitCycle: number | null;
  squashed: boolean;
  rsId: string | null;
}

/**
 * Speculation configuration
 */
export interface SpeculationConfig {
  // RS counts
  integerRS: number;
  multiplyRS: number;
  divideRS: number;
  loadBuffers: number;
  storeBuffers: number;
  branchRS: number;
  
  // ROB configuration
  robSize: number;
  commitWidth: number;
  
  // Execution latencies
  integerLatency: number;   // ADD, SUB, ADDI, SUBI
  multiplyLatency: number;  // MUL, MULI
  divideLatency: number;    // DIV, DIVI
  logicalLatency: number;   // AND, OR, XOR
  loadLatency: number;      // LD (addr + mem)
  storeLatency: number;     // ST (addr + mem)
  branchLatency: number;    // BEQ, BNE, J
}

/**
 * Default speculation configuration
 */
export const DEFAULT_SPECULATION_CONFIG: SpeculationConfig = {
  integerRS: 3,
  multiplyRS: 2,
  divideRS: 2,
  loadBuffers: 3,
  storeBuffers: 3,
  branchRS: 2,  // Increased for speculation
  
  robSize: 8,
  commitWidth: 1,
  
  integerLatency: 2,   // ADD, SUB, ADDI, SUBI
  multiplyLatency: 5,  // MUL, MULI
  divideLatency: 7,    // DIV, DIVI
  logicalLatency: 1,   // AND, OR, XOR
  loadLatency: 2,      // 1 addr + 1 mem
  storeLatency: 2,     // 1 addr + 1 mem
  branchLatency: 1,    // BEQ, BNE, J
};

// ============================================================================
// Runtime Configuration Types (User-configurable at runtime)
// ============================================================================

/**
 * Runtime configuration for user-customizable settings
 * These settings can be changed before each run and apply to all execution modes
 */
export interface RuntimeConfig {
  // Execution latencies for each instruction type (in cycles)
  executionLatencies: {
    add: number;      // ADD, ADDI
    sub: number;      // SUB, SUBI  
    mul: number;      // MUL, MULI
    div: number;      // DIV, DIVI
    logical: number;  // AND, OR, XOR
    load: number;     // LD (execution, not memory access)
    store: number;    // ST (execution, not memory access)
    branch: number;   // BEQ, BNE, J
  };
  
  // Memory access delays (separate from instruction execution)
  memoryDelays: {
    read: number;     // Memory read delay (in cycles)
    write: number;    // Memory write delay (in cycles)
  };
  
  // UI run speed (in milliseconds between steps)
  runSpeed: number;   // 100-1000ms
}

/**
 * Default runtime configuration
 */
export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  executionLatencies: {
    add: 1,
    sub: 1,
    mul: 4,
    div: 6,
    logical: 1,
    load: 1,
    store: 1,
    branch: 1,
  },
  memoryDelays: {
    read: 1,
    write: 1,
  },
  runSpeed: 200,
};

/**
 * Default simulator configuration
 */
export const DEFAULT_CONFIG: SimulatorConfig = {
  mode: ExecutionMode.PIPELINE,
  pipelineConfig: {
    dataForwarding: true,
  },
  tomasuloConfig: DEFAULT_TOMASULO_CONFIG,
  speculationConfig: DEFAULT_SPECULATION_CONFIG,
  runtimeConfig: DEFAULT_RUNTIME_CONFIG,
};

/**
 * Get execution latency for an instruction using runtime config
 */
export function getRuntimeLatency(type: InstructionType, config: RuntimeConfig): number {
  switch (type) {
    case InstructionType.ADD:
    case InstructionType.ADDI:
      return config.executionLatencies.add;
    case InstructionType.SUB:
    case InstructionType.SUBI:
      return config.executionLatencies.sub;
    case InstructionType.MUL:
    case InstructionType.MULI:
      return config.executionLatencies.mul;
    case InstructionType.DIV:
    case InstructionType.DIVI:
      return config.executionLatencies.div;
    case InstructionType.AND:
    case InstructionType.OR:
    case InstructionType.XOR:
      return config.executionLatencies.logical;
    case InstructionType.LD:
      return config.executionLatencies.load;
    case InstructionType.ST:
      return config.executionLatencies.store;
    case InstructionType.BEQ:
    case InstructionType.BNE:
    case InstructionType.J:
      return config.executionLatencies.branch;
    case InstructionType.NOP:
      return 1;
  }
}

/**
 * Get speculation execution latency for an instruction
 */
export function getSpeculationLatency(type: InstructionType, config: SpeculationConfig): number {
  switch (type) {
    case InstructionType.ADD:
    case InstructionType.SUB:
    case InstructionType.ADDI:
    case InstructionType.SUBI:
      return config.integerLatency;
    case InstructionType.MUL:
    case InstructionType.MULI:
      return config.multiplyLatency;
    case InstructionType.DIV:
    case InstructionType.DIVI:
      return config.divideLatency;
    case InstructionType.AND:
    case InstructionType.OR:
    case InstructionType.XOR:
      return config.logicalLatency;
    case InstructionType.LD:
      return config.loadLatency;
    case InstructionType.ST:
      return config.storeLatency;
    case InstructionType.BEQ:
    case InstructionType.BNE:
    case InstructionType.J:
      return config.branchLatency;
    case InstructionType.NOP:
      return 0;
  }
}

/**
 * Speculation reservation station entry (uses ROB index for Q-fields)
 */
export interface SpeculationRS {
  id: string;                      // RS ID (e.g., "INT0")
  rsType: RSType;                  // INT, MUL, DIV, LOAD, STORE, BRANCH
  busy: boolean;                   // Entry occupied
  op: InstructionType | null;      // Operation
  
  // Source operands (tagged with ROB indices)
  Vj: number | null;               // Value (if ready)
  Qj: number | null;               // ROB index of producer (null if ready)
  Vk: number | null;               // Value (if ready)
  Qk: number | null;               // ROB index of producer (null if ready)
  
  imm: number;                     // Immediate value
  address: number | null;          // Computed address (for LD/ST)
  addressReady: boolean;           // Address computed
  
  // ROB linkage
  robIndex: number;                // Destination ROB entry index
  destReg: number | null;          // Architectural destination
  
  // Execution state
  state: RSState;                  // WAITING, READY, EXECUTING, DONE
  remainingCycles: number;         // Cycles left
  result: number | null;           // Computed result
  
  instrIndex: number;              // Program order index
  instruction: Instruction | null;
  
  // Cycle tracking
  issueCycle: number | null;
  execStartCycle: number | null;
  execEndCycle: number | null;
}

/**
 * Speculation state (Tomasulo + ROB)
 */
export interface SpeculationState {
  // Reorder Buffer
  rob: ROBEntry[];
  robHead: number;               // Index of oldest entry (commit pointer)
  robTail: number;               // Index of next free entry (allocate pointer)
  robSize: number;               // Total ROB size
  
  // Reservation stations (using ROB indices for Q-fields)
  reservationStations: Map<string, SpeculationRS>;
  
  // RAT for speculation (points to ROB indices)
  rat: Map<number, SpeculationRATEntry>;
  
  // Current CDB broadcast
  cdb: SpeculationCDBBroadcast | null;
  
  // Instruction status tracking
  instructionStatus: SpeculationInstructionStatus[];
  
  // Issue tracking
  nextInstrIndex: number;        // Next instruction to issue
  
  // Store queue (ROB indices of uncommitted stores, in order)
  storeQueue: number[];
  
  // Statistics
  issueStalls: number;
  robFullStalls: number;
  rsFullStalls: number;
  cdbBroadcasts: number;
  cdbContentionCycles: number;
  memoryReads: number;
  memoryWrites: number;
  branchCount: number;
  mispredictCount: number;
  instructionsSquashed: number;
  instructionsCommitted: number;
  
  // Event log
  events: SpeculationEvent[];
  
  // Configuration
  config: SpeculationConfig;
}
