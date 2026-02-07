/**
 * Tomasulo Algorithm Execution Model
 * 
 * Implements dynamic scheduling with:
 * - Reservation stations
 * - Register renaming via RAT
 * - Common Data Bus (CDB) broadcast
 * - Out-of-order execution, in-order issue and commit
 */

import { ExecutionModel } from './base';
import {
  MachineState,
  TraceEntry,
  InstructionType,
  Instruction,
  TomasuloConfig,
  TomasuloEventType,
  ReservationStation,
  RegisterStatus,
  CDBBroadcast,
  RSState,
  RSType,
  getRSTypeForInstruction,
  getRuntimeLatency,
  instructionWritesRegister,
  isBranchOrJump,
  WORD_SIZE,
  DEFAULT_TOMASULO_CONFIG,
  RuntimeConfig,
  DEFAULT_RUNTIME_CONFIG,
} from '../types';
import {
  readRegister,
  writeRegister,
  readMemory,
  writeMemory,
  createTomasuloState,
  MemoryError,
} from '../state';

/**
 * Tomasulo execution model implementation
 */
export class TomasuloExecutionModel implements ExecutionModel {
  private config: TomasuloConfig;
  private runtimeConfig: RuntimeConfig;

  constructor(config?: Partial<TomasuloConfig>, runtimeConfig?: RuntimeConfig) {
    this.config = { ...DEFAULT_TOMASULO_CONFIG, ...config };
    this.runtimeConfig = runtimeConfig || DEFAULT_RUNTIME_CONFIG;
  }

  /**
   * Execute one complete cycle
   */
  step(state: MachineState): MachineState {
    if (!state.tomasulo) {
      throw new Error('Tomasulo state not initialized');
    }

    // Deep clone state for modification
    const newState = this.cloneState(state);
    const tomasulo = newState.tomasulo!;
    const arch = newState.architectural;

    // Clear events from previous cycle
    // (Keep the full history but we'll mark cycle boundaries)
    
    const currentCycle = arch.cycle;

    try {
      // Phase 1: CDB Broadcast (Write Result)
      this.phaseCDBBroadcast(newState, currentCycle);

      // Phase 2: Check Operand Readiness and State Transitions
      this.phaseOperandWakeup(newState, currentCycle);

      // Phase 3: Start Execution for READY entries
      this.phaseStartExecution(newState, currentCycle);

      // Phase 4: Continue/Complete Execution
      this.phaseContinueExecution(newState, currentCycle);

      // Phase 5: Issue new instruction
      this.phaseIssue(newState, currentCycle);

      // Increment cycle
      arch.cycle++;

      // Check for completion
      this.checkCompletion(newState);

    } catch (error) {
      if (error instanceof MemoryError) {
        arch.halted = true;
        arch.errorMessage = error.message;
        tomasulo.events.push({
          cycle: currentCycle,
          type: TomasuloEventType.ERROR,
          message: error.message,
        });
      } else {
        throw error;
      }
    }

    return newState;
  }

  /**
   * Phase 1: CDB Broadcast
   * Select the oldest DONE instruction and broadcast its result
   */
  private phaseCDBBroadcast(state: MachineState, cycle: number): void {
    const tomasulo = state.tomasulo!;
    const arch = state.architectural;

    // Find all DONE RS entries
    const doneEntries: ReservationStation[] = [];
    for (const rs of tomasulo.reservationStations.values()) {
      if (rs.busy && rs.state === RSState.DONE) {
        doneEntries.push(rs);
      }
    }

    if (doneEntries.length === 0) {
      tomasulo.cdb = null;
      return;
    }

    // Log CDB contention
    if (doneEntries.length > 1) {
      tomasulo.cdbContentionCycles++;
      tomasulo.events.push({
        cycle,
        type: TomasuloEventType.CDB_CONTENTION,
        message: `${doneEntries.length} instructions waiting for CDB`,
        details: { waiting: doneEntries.map(e => e.id) },
      });
    }

    // Select oldest (by instrIndex)
    doneEntries.sort((a, b) => a.instrIndex - b.instrIndex);
    const broadcasting = doneEntries[0];

    // Skip stores - they don't broadcast (they write to memory instead)
    if (broadcasting.op === InstructionType.ST) {
      // For stores, commit to memory if address and data are ready
      this.commitStore(state, broadcasting, cycle);
      return;
    }

    // Create broadcast
    const broadcast: CDBBroadcast = {
      tag: broadcasting.destTag,
      value: broadcasting.result!,
      destReg: broadcasting.destReg!,
      instrIndex: broadcasting.instrIndex,
    };
    tomasulo.cdb = broadcast;
    tomasulo.cdbBroadcasts++;

    tomasulo.events.push({
      cycle,
      type: TomasuloEventType.CDB_BROADCAST,
      message: `${broadcasting.id} broadcasts value ${broadcast.value} to x${broadcast.destReg}`,
      details: { tag: broadcast.tag, value: broadcast.value, destReg: broadcast.destReg },
    });

    // Wake up all waiting operands
    for (const rs of tomasulo.reservationStations.values()) {
      if (!rs.busy) continue;

      if (rs.Qj === broadcast.tag) {
        rs.Vj = broadcast.value;
        rs.Qj = null;
        tomasulo.events.push({
          cycle,
          type: TomasuloEventType.OPERAND_WAKEUP,
          message: `${rs.id}.Vj wakes up with value ${broadcast.value}`,
        });
      }

      if (rs.Qk === broadcast.tag) {
        rs.Vk = broadcast.value;
        rs.Qk = null;
        tomasulo.events.push({
          cycle,
          type: TomasuloEventType.OPERAND_WAKEUP,
          message: `${rs.id}.Vk wakes up with value ${broadcast.value}`,
        });
      }
    }

    // Update RAT and ARF
    if (broadcast.destReg !== 0) {
      const ratEntry = tomasulo.rat.get(broadcast.destReg);
      if (ratEntry && ratEntry.tag === broadcast.tag) {
        // Only update if RAT still points to this producer
        writeRegister(arch, broadcast.destReg, broadcast.value);
        ratEntry.tag = null;

        tomasulo.events.push({
          cycle,
          type: TomasuloEventType.ARF_WRITE,
          message: `x${broadcast.destReg} <- ${broadcast.value}`,
        });
        tomasulo.events.push({
          cycle,
          type: TomasuloEventType.RAT_UPDATE,
          message: `RAT[x${broadcast.destReg}] cleared (was ${broadcast.tag})`,
        });
      }
    }

    // Update instruction status
    const instrStatus = tomasulo.instructionStatus.find(
      s => s.rsId === broadcasting.id && s.writeResultCycle === null
    );
    if (instrStatus) {
      instrStatus.writeResultCycle = cycle;
    }

    // Free the RS entry
    this.freeRS(broadcasting);
    tomasulo.events.push({
      cycle,
      type: TomasuloEventType.RS_FREE,
      message: `${broadcasting.id} freed`,
    });
  }

  /**
   * Commit a store to memory
   */
  private commitStore(state: MachineState, rs: ReservationStation, cycle: number): void {
    const tomasulo = state.tomasulo!;
    const arch = state.architectural;

    // Store needs address and data to be ready
    if (!rs.addressReady || rs.Qk !== null) {
      // Not ready yet, will try again next cycle
      return;
    }

    // Check if this is the oldest store (in-order store commit)
    if (tomasulo.storeQueue.length > 0 && tomasulo.storeQueue[0] !== rs.id) {
      // Not the oldest store, wait
      return;
    }

    // Commit to memory
    writeMemory(arch, rs.address!, rs.Vk!);
    tomasulo.memoryWrites++;

    tomasulo.events.push({
      cycle,
      type: TomasuloEventType.MEM_WRITE,
      message: `Store to mem[${rs.address}] = ${rs.Vk}`,
    });

    // Update instruction status
    const instrStatus = tomasulo.instructionStatus.find(
      s => s.rsId === rs.id && s.writeResultCycle === null
    );
    if (instrStatus) {
      instrStatus.writeResultCycle = cycle;
    }

    // Remove from store queue
    const idx = tomasulo.storeQueue.indexOf(rs.id);
    if (idx !== -1) {
      tomasulo.storeQueue.splice(idx, 1);
    }

    // Free RS
    this.freeRS(rs);
    tomasulo.events.push({
      cycle,
      type: TomasuloEventType.RS_FREE,
      message: `${rs.id} freed`,
    });
  }

  /**
   * Phase 2: Check Operand Readiness
   */
  private phaseOperandWakeup(state: MachineState, _cycle: number): void {
    const tomasulo = state.tomasulo!;

    for (const rs of tomasulo.reservationStations.values()) {
      if (!rs.busy) continue;
      if (rs.state !== RSState.WAITING) continue;

      // Check if all operands are ready
      const operandsReady = rs.Qj === null && rs.Qk === null;

      // For memory ops, also need address calculation
      if (rs.rsType === RSType.LOAD || rs.rsType === RSType.STORE) {
        // Load/Store only need base (Vj) ready to start address calculation
        if (rs.Qj === null && !rs.addressReady) {
          // Can transition to READY state for address calculation
          rs.state = RSState.READY;
        } else if (rs.addressReady && operandsReady) {
          // Address calculated, all operands ready for memory access
          rs.state = RSState.READY;
        }
      } else {
        // ALU/Branch operations
        if (operandsReady) {
          rs.state = RSState.READY;
        }
      }
    }
  }

  /**
   * Phase 3: Start Execution for READY entries
   */
  private phaseStartExecution(state: MachineState, cycle: number): void {
    const tomasulo = state.tomasulo!;

    // Group READY entries by RS type
    const readyByType = new Map<RSType, ReservationStation[]>();

    for (const rs of tomasulo.reservationStations.values()) {
      if (!rs.busy || rs.state !== RSState.READY) continue;

      // Check if this FU type already has something executing
      let fuBusy = false;
      for (const other of tomasulo.reservationStations.values()) {
        if (other.rsType === rs.rsType && other.state === RSState.EXECUTING) {
          fuBusy = true;
          break;
        }
      }

      if (!fuBusy) {
        if (!readyByType.has(rs.rsType)) {
          readyByType.set(rs.rsType, []);
        }
        readyByType.get(rs.rsType)!.push(rs);
      }
    }

    // For each FU type, start the oldest READY instruction
    for (const [_rsType, entries] of readyByType) {
      if (entries.length === 0) continue;

      // Sort by instrIndex (oldest first)
      entries.sort((a, b) => a.instrIndex - b.instrIndex);
      const toStart = entries[0];

      // Handle memory address calculation phase
      if ((toStart.rsType === RSType.LOAD || toStart.rsType === RSType.STORE) && !toStart.addressReady) {
        // Address calculation phase
        toStart.address = toStart.Vj! + toStart.imm;
        toStart.addressReady = true;
        toStart.state = RSState.EXECUTING;
        toStart.remainingCycles = 1; // Memory access takes 1 more cycle
        toStart.execStartCycle = cycle;

        tomasulo.events.push({
          cycle,
          type: TomasuloEventType.ADDR_CALC,
          message: `${toStart.id}: Address calculated = ${toStart.address}`,
        });
      } else {
        // Regular execution start
        toStart.state = RSState.EXECUTING;
        toStart.execStartCycle = cycle;

        // Set remaining cycles based on operation
        if (toStart.rsType === RSType.LOAD) {
          toStart.remainingCycles = this.runtimeConfig.memoryDelays.read; // Memory read delay
        } else if (toStart.rsType === RSType.STORE) {
          toStart.remainingCycles = this.runtimeConfig.memoryDelays.write; // Memory write delay
        } else {
          toStart.remainingCycles = getRuntimeLatency(toStart.op!, this.runtimeConfig);
        }

        tomasulo.events.push({
          cycle,
          type: TomasuloEventType.EXEC_START,
          message: `${toStart.id}: Execution started (${toStart.remainingCycles} cycles)`,
        });
      }

      // Update instruction status
      const instrStatus = tomasulo.instructionStatus.find(
        s => s.rsId === toStart.id && s.execStartCycle === null
      );
      if (instrStatus) {
        instrStatus.execStartCycle = cycle;
      }
    }
  }

  /**
   * Phase 4: Continue/Complete Execution
   */
  private phaseContinueExecution(state: MachineState, cycle: number): void {
    const tomasulo = state.tomasulo!;
    const arch = state.architectural;

    for (const rs of tomasulo.reservationStations.values()) {
      if (!rs.busy || rs.state !== RSState.EXECUTING) continue;

      // Decrement remaining cycles
      if (rs.remainingCycles > 0) {
        rs.remainingCycles--;

        if (rs.remainingCycles > 0) {
          tomasulo.events.push({
            cycle,
            type: TomasuloEventType.EXEC_CONTINUE,
            message: `${rs.id}: Executing (${rs.remainingCycles} cycles remaining)`,
          });
        }
      }

      // Check if execution completes this cycle
      if (rs.remainingCycles === 0) {
        // Compute result
        rs.result = this.computeResult(rs, arch);
        rs.state = RSState.DONE;
        rs.execEndCycle = cycle;

        tomasulo.events.push({
          cycle,
          type: TomasuloEventType.EXEC_END,
          message: `${rs.id}: Execution complete, result = ${rs.result}`,
        });

        // Handle memory operations
        if (rs.rsType === RSType.LOAD) {
          rs.result = readMemory(arch, rs.address!);
          tomasulo.memoryReads++;
          tomasulo.events.push({
            cycle,
            type: TomasuloEventType.MEM_READ,
            message: `Load from mem[${rs.address}] = ${rs.result}`,
          });
        }

        // Handle branches
        if (rs.rsType === RSType.BRANCH) {
          this.handleBranchResolution(state, rs, cycle);
        }

        // Update instruction status
        const instrStatus = tomasulo.instructionStatus.find(
          s => s.rsId === rs.id && s.execEndCycle === null
        );
        if (instrStatus) {
          instrStatus.execEndCycle = cycle;
        }
      }
    }
  }

  /**
   * Compute result for an RS entry
   */
  private computeResult(rs: ReservationStation, _arch: { registers: { registers: number[] } }): number {
    const vj = rs.Vj ?? 0;
    const vk = rs.Vk ?? 0;
    const imm = rs.imm ?? 0;

    switch (rs.op) {
      case InstructionType.ADD:
        return vj + vk;
      case InstructionType.SUB:
        return vj - vk;
      case InstructionType.MUL:
        return vj * vk;
      case InstructionType.DIV:
        if (vk === 0) throw new MemoryError('Division by zero', 0);
        return Math.trunc(vj / vk);
      case InstructionType.AND:
        return vj & vk;
      case InstructionType.OR:
        return vj | vk;
      case InstructionType.XOR:
        return vj ^ vk;
      case InstructionType.ADDI:
        return vj + imm;
      case InstructionType.SUBI:
        return vj - imm;
      case InstructionType.MULI:
        return vj * imm;
      case InstructionType.DIVI:
        if (imm === 0) throw new MemoryError('Division by zero', 0);
        return Math.trunc(vj / imm);
      case InstructionType.LD:
        return 0; // Will be set by memory read
      case InstructionType.ST:
        return 0; // Stores don't produce values
      case InstructionType.BEQ:
      case InstructionType.BNE:
      case InstructionType.J:
        return 0; // Branch result is handled separately
      case InstructionType.NOP:
        return 0;
      default:
        return 0;
    }
  }

  /**
   * Handle branch resolution
   */
  private handleBranchResolution(state: MachineState, rs: ReservationStation, cycle: number): void {
    const tomasulo = state.tomasulo!;
    const arch = state.architectural;

    const vj = rs.Vj ?? 0;
    const vk = rs.Vk ?? 0;
    let taken = false;
    let target = arch.pc;

    switch (rs.op) {
      case InstructionType.BEQ:
        taken = vj === vk;
        target = rs.instruction!.imm!;
        break;
      case InstructionType.BNE:
        taken = vj !== vk;
        target = rs.instruction!.imm!;
        break;
      case InstructionType.J:
        taken = true;
        target = rs.instruction!.imm!;
        break;
    }

    tomasulo.events.push({
      cycle,
      type: TomasuloEventType.BRANCH_RESOLVE,
      message: `Branch ${taken ? 'taken' : 'not taken'}${taken ? ` to ${target}` : ''}`,
    });

    if (taken) {
      arch.pc = target;
      tomasulo.events.push({
        cycle,
        type: TomasuloEventType.PC_UPDATE,
        message: `PC updated to ${target}`,
      });
    }

    // Clear branch pending flag
    tomasulo.branchPending = false;

    // Free the branch RS immediately (branches don't broadcast)
    this.freeRS(rs);
    tomasulo.events.push({
      cycle,
      type: TomasuloEventType.RS_FREE,
      message: `${rs.id} freed`,
    });
  }

  /**
   * Phase 5: Issue new instruction
   */
  private phaseIssue(state: MachineState, cycle: number): void {
    const tomasulo = state.tomasulo!;
    const arch = state.architectural;

    // Don't issue if program is done
    const instrIndex = arch.pc / WORD_SIZE;
    if (instrIndex >= arch.instructions.length) {
      return;
    }

    // Don't issue if a branch is pending (conservative)
    if (tomasulo.branchPending) {
      tomasulo.issueStalls++;
      tomasulo.events.push({
        cycle,
        type: TomasuloEventType.ISSUE_STALL,
        message: 'Issue stalled: branch pending',
      });
      return;
    }

    const instruction = arch.instructions[instrIndex];

    // Handle NOP specially - just advance PC, don't use RS
    if (instruction.type === InstructionType.NOP) {
      arch.pc += WORD_SIZE;
      tomasulo.instructionStatus.push({
        instruction,
        instrIndex,
        issueCycle: cycle,
        execStartCycle: cycle,
        execEndCycle: cycle,
        writeResultCycle: cycle,
        rsId: null,
      });
      return;
    }

    // Find RS type for this instruction
    const rsType = getRSTypeForInstruction(instruction.type);
    if (rsType === null) {
      // Unsupported instruction type
      arch.halted = true;
      arch.errorMessage = `Unsupported instruction: ${instruction.type}`;
      return;
    }

    // Find a free RS of the required type
    let freeRS: ReservationStation | null = null;
    for (const rs of tomasulo.reservationStations.values()) {
      if (rs.rsType === rsType && !rs.busy) {
        freeRS = rs;
        break;
      }
    }

    if (!freeRS) {
      // No free RS - stall
      tomasulo.issueStalls++;
      tomasulo.rsFullStalls++;
      tomasulo.events.push({
        cycle,
        type: TomasuloEventType.ISSUE_STALL,
        message: `Issue stalled: No free ${rsType} RS`,
      });
      return;
    }

    // Issue the instruction
    this.issueInstruction(state, instruction, instrIndex, freeRS, cycle);

    // Advance PC
    arch.pc += WORD_SIZE;
  }

  /**
   * Issue an instruction to a reservation station
   */
  private issueInstruction(
    state: MachineState,
    instruction: Instruction,
    instrIndex: number,
    rs: ReservationStation,
    cycle: number
  ): void {
    const tomasulo = state.tomasulo!;
    const arch = state.architectural;

    // Populate RS entry
    rs.busy = true;
    rs.op = instruction.type;
    rs.instruction = instruction;
    rs.instrIndex = instrIndex;
    rs.issueCycle = cycle;
    rs.state = RSState.WAITING;
    rs.imm = instruction.imm ?? 0;
    rs.address = null;
    rs.addressReady = false;
    rs.result = null;
    rs.execStartCycle = null;
    rs.execEndCycle = null;
    rs.writeResultCycle = null;

    // Handle source operand 1 (rs1)
    if (instruction.rs1 !== undefined) {
      const rs1Rat = tomasulo.rat.get(instruction.rs1);
      if (rs1Rat && rs1Rat.tag !== null) {
        // Value being produced by another RS
        rs.Vj = null;
        rs.Qj = rs1Rat.tag;
      } else {
        // Value is ready in ARF
        rs.Vj = readRegister(arch, instruction.rs1);
        rs.Qj = null;
      }
    } else {
      rs.Vj = 0;
      rs.Qj = null;
    }

    // Handle source operand 2 (rs2) or store data
    if (instruction.rs2 !== undefined) {
      const rs2Rat = tomasulo.rat.get(instruction.rs2);
      if (rs2Rat && rs2Rat.tag !== null) {
        rs.Vk = null;
        rs.Qk = rs2Rat.tag;
      } else {
        rs.Vk = readRegister(arch, instruction.rs2);
        rs.Qk = null;
      }
    } else {
      // For immediate operations, Vk is not used (imm is separate)
      rs.Vk = null;
      rs.Qk = null;
    }

    // Handle destination register
    if (instructionWritesRegister(instruction.type) && instruction.rd !== undefined && instruction.rd !== 0) {
      rs.destReg = instruction.rd;
      // Update RAT
      tomasulo.rat.set(instruction.rd, { tag: rs.destTag });
      tomasulo.events.push({
        cycle,
        type: TomasuloEventType.RAT_UPDATE,
        message: `RAT[x${instruction.rd}] = ${rs.destTag}`,
      });
    } else {
      rs.destReg = null;
    }

    // Track stores in order
    if (instruction.type === InstructionType.ST) {
      tomasulo.storeQueue.push(rs.id);
    }

    // Mark branch pending
    if (isBranchOrJump(instruction.type)) {
      tomasulo.branchPending = true;
    }

    // Add to instruction status
    tomasulo.instructionStatus.push({
      instruction,
      instrIndex,
      issueCycle: cycle,
      execStartCycle: null,
      execEndCycle: null,
      writeResultCycle: null,
      rsId: rs.id,
    });

    tomasulo.events.push({
      cycle,
      type: TomasuloEventType.ISSUE,
      message: `${instruction.text} issued to ${rs.id}`,
      details: {
        rs: rs.id,
        Vj: rs.Vj,
        Qj: rs.Qj,
        Vk: rs.Vk,
        Qk: rs.Qk,
        imm: rs.imm,
        destReg: rs.destReg,
      },
    });
  }

  /**
   * Free a reservation station
   */
  private freeRS(rs: ReservationStation): void {
    rs.busy = false;
    rs.op = null;
    rs.Vj = null;
    rs.Qj = null;
    rs.Vk = null;
    rs.Qk = null;
    rs.imm = 0;
    rs.address = null;
    rs.addressReady = false;
    rs.destReg = null;
    rs.state = RSState.WAITING;
    rs.remainingCycles = 0;
    rs.result = null;
    rs.instruction = null;
    rs.instrIndex = -1;
    rs.issueCycle = null;
    rs.execStartCycle = null;
    rs.execEndCycle = null;
    rs.writeResultCycle = null;
  }

  /**
   * Check if program has completed
   */
  private checkCompletion(state: MachineState): void {
    const tomasulo = state.tomasulo!;
    const arch = state.architectural;

    // Check if all instructions have been issued
    const allIssued = arch.pc >= arch.instructions.length * WORD_SIZE;

    // Check if all RS are empty
    let allEmpty = true;
    for (const rs of tomasulo.reservationStations.values()) {
      if (rs.busy) {
        allEmpty = false;
        break;
      }
    }

    // Check if CDB is idle
    const cdbIdle = tomasulo.cdb === null;

    if (allIssued && allEmpty && cdbIdle) {
      arch.halted = true;
    }
  }

  /**
   * Deep clone state
   */
  private cloneState(state: MachineState): MachineState {
    const clone: MachineState = {
      architectural: {
        ...state.architectural,
        registers: {
          registers: [...state.architectural.registers.registers],
        },
        memory: {
          data: new Map(state.architectural.memory.data),
        },
        instructions: [...state.architectural.instructions],
      },
      mode: state.mode,
    };

    if (state.tomasulo) {
      const newRS = new Map<string, ReservationStation>();
      for (const [id, rs] of state.tomasulo.reservationStations) {
        newRS.set(id, { ...rs, instruction: rs.instruction ? { ...rs.instruction } : null });
      }

      const newRAT = new Map<number, RegisterStatus>();
      for (const [reg, status] of state.tomasulo.rat) {
        newRAT.set(reg, { ...status });
      }

      clone.tomasulo = {
        ...state.tomasulo,
        reservationStations: newRS,
        rat: newRAT,
        cdb: state.tomasulo.cdb ? { ...state.tomasulo.cdb } : null,
        instructionStatus: state.tomasulo.instructionStatus.map(s => ({ ...s })),
        storeQueue: [...state.tomasulo.storeQueue],
        events: [...state.tomasulo.events],
      };
    }

    return clone;
  }

  /**
   * Reset the machine state
   */
  reset(state: MachineState): MachineState {
    const instructions = state.architectural.instructions;
    const newState: MachineState = {
      architectural: {
        pc: 0,
        registers: { registers: new Array(32).fill(0) },
        memory: { data: new Map() },
        cycle: 0,
        instructions: [...instructions],
        halted: false,
      },
      mode: state.mode,
      tomasulo: createTomasuloState(this.config),
    };
    return newState;
  }

  /**
   * Check if execution is complete
   */
  isHalted(state: MachineState): boolean {
    return state.architectural.halted;
  }

  /**
   * Get trace entries for current cycle
   */
  getTrace(state: MachineState): TraceEntry[] {
    // For Tomasulo, we return instruction status entries as trace
    const entries: TraceEntry[] = [];
    
    if (state.tomasulo) {
      for (const status of state.tomasulo.instructionStatus) {
        entries.push({
          cycle: state.architectural.cycle,
          instruction: status.instruction,
          stage: status.writeResultCycle !== null ? 'DONE' :
                 status.execEndCycle !== null ? 'EXEC_END' :
                 status.execStartCycle !== null ? 'EXECUTING' :
                 'ISSUED',
          details: {
            issueCycle: status.issueCycle,
            execStartCycle: status.execStartCycle,
            execEndCycle: status.execEndCycle,
            writeResultCycle: status.writeResultCycle,
            rsId: status.rsId,
          },
        });
      }
    }

    return entries;
  }
}
