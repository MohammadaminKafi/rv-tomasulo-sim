/**
 * Tomasulo + Speculation Execution Model (Phase 3)
 * 
 * Implements dynamic scheduling with:
 * - Reorder Buffer (ROB) for in-order commit
 * - Register renaming via RAT (pointing to ROB entries)
 * - Speculative execution past unresolved branches
 * - Branch misprediction recovery
 * - Common Data Bus (CDB) broadcast
 * - Out-of-order execution, in-order issue and commit
 */

import { ExecutionModel } from './base';
import {
  MachineState,
  TraceEntry,
  InstructionType,
  Instruction,
  SpeculationConfig,
  SpeculationEventType,
  SpeculationRS,
  SpeculationRATEntry,
  ROBEntry,
  ROBEntryType,
  ROBState,
  RSState,
  RSType,
  getRSTypeForInstruction,
  getROBEntryType,
  getSpeculationLatency,
  instructionWritesRegister,
  isBranchOrJump,
  WORD_SIZE,
  DEFAULT_SPECULATION_CONFIG,
  SpeculationCDBBroadcast,
} from '../types';
import {
  readRegister,
  writeRegister,
  readMemory,
  writeMemory,
  createSpeculationState,
  MemoryError,
} from '../state';

/**
 * Speculation execution model implementation
 */
export class SpeculationExecutionModel implements ExecutionModel {
  private config: SpeculationConfig;

  constructor(config?: Partial<SpeculationConfig>) {
    this.config = { ...DEFAULT_SPECULATION_CONFIG, ...config };
  }

  /**
   * Execute one complete cycle
   */
  step(state: MachineState): MachineState {
    if (!state.speculation) {
      throw new Error('Speculation state not initialized');
    }

    // Deep clone state for modification
    const newState = this.cloneState(state);
    const spec = newState.speculation!;
    const arch = newState.architectural;

    const currentCycle = arch.cycle;

    try {
      // Phase 1: Commit (at ROB head)
      this.phaseCommit(newState, currentCycle);

      // Phase 2: CDB Broadcast (Write Result)
      this.phaseCDBBroadcast(newState, currentCycle);

      // Phase 3: Check Operand Readiness
      this.phaseOperandWakeup(newState, currentCycle);

      // Phase 4: Start Execution for READY entries
      this.phaseStartExecution(newState, currentCycle);

      // Phase 5: Continue/Complete Execution
      this.phaseContinueExecution(newState, currentCycle);

      // Phase 6: Fetch/Issue
      this.phaseIssue(newState, currentCycle);

      // Increment cycle
      arch.cycle++;

      // Check for completion
      this.checkCompletion(newState);

    } catch (error) {
      if (error instanceof MemoryError) {
        arch.halted = true;
        arch.errorMessage = error.message;
        spec.events.push({
          cycle: currentCycle,
          type: SpeculationEventType.ERROR,
          message: error.message,
        });
      } else {
        throw error;
      }
    }

    return newState;
  }

  /**
   * Check if ROB is full
   */
  private isROBFull(spec: NonNullable<MachineState['speculation']>): boolean {
    const nextTail = (spec.robTail + 1) % spec.robSize;
    return nextTail === spec.robHead && spec.rob[spec.robTail].busy;
  }

  /**
   * Check if ROB is empty
   */
  private isROBEmpty(spec: NonNullable<MachineState['speculation']>): boolean {
    return spec.robHead === spec.robTail && !spec.rob[spec.robHead].busy;
  }

  /**
   * Check if ROB entry is younger than another (accounting for wraparound)
   */
  private isYoungerROB(youngIdx: number, oldIdx: number, spec: NonNullable<MachineState['speculation']>): boolean {
    // Use instrIndex for reliable comparison (program order)
    const youngEntry = spec.rob[youngIdx];
    const oldEntry = spec.rob[oldIdx];
    return youngEntry.instrIndex > oldEntry.instrIndex;
  }

  /**
   * Phase 1: Commit at ROB head
   */
  private phaseCommit(state: MachineState, cycle: number): void {
    const spec = state.speculation!;
    const arch = state.architectural;

    // Process up to commitWidth commits per cycle
    for (let commits = 0; commits < spec.config.commitWidth; commits++) {
      // Check if ROB is empty
      if (this.isROBEmpty(spec)) {
        return;
      }

      const headEntry = spec.rob[spec.robHead];

      // Must be busy and ready to commit
      if (!headEntry.busy || headEntry.state !== ROBState.WRITE_RESULT) {
        return;
      }

      // Handle by instruction type
      if (headEntry.type === ROBEntryType.STORE) {
        // Store: commit only if address and data ready
        if (!headEntry.storeAddressReady || !headEntry.storeDataReady) {
          return; // Can't commit yet
        }

        // Write to memory
        writeMemory(arch, headEntry.storeAddress!, headEntry.storeData!);
        spec.memoryWrites++;

        spec.events.push({
          cycle,
          type: SpeculationEventType.MEM_WRITE,
          message: `Store commit: mem[${headEntry.storeAddress}] = ${headEntry.storeData}`,
          details: { robIndex: headEntry.index, address: headEntry.storeAddress, value: headEntry.storeData },
        });

        // Remove from store queue
        const storeIdx = spec.storeQueue.indexOf(headEntry.index);
        if (storeIdx !== -1) {
          spec.storeQueue.splice(storeIdx, 1);
        }

      } else if (headEntry.type === ROBEntryType.BRANCH || headEntry.type === ROBEntryType.JUMP) {
        // Branch/Jump: must be resolved
        if (!headEntry.branchResolved) {
          return; // Can't commit yet
        }

        // If mispredicted, trigger recovery
        if (headEntry.mispredicted) {
          this.handleMispredictRecovery(state, headEntry, cycle);
          // After recovery, the branch commits normally
        }

      } else if (headEntry.type === ROBEntryType.ALU || headEntry.type === ROBEntryType.LOAD) {
        // ALU/Load: must have ready result
        if (!headEntry.ready) {
          return; // Can't commit yet
        }

        // Write to ARF (if dest is valid and not x0)
        if (headEntry.destReg !== null && headEntry.destReg !== 0) {
          writeRegister(arch, headEntry.destReg, headEntry.value!);

          // Clear RAT if it still points to this ROB entry
          const ratEntry = spec.rat.get(headEntry.destReg);
          if (ratEntry && ratEntry.robIndex === headEntry.index) {
            spec.rat.set(headEntry.destReg, { robIndex: null });
            spec.events.push({
              cycle,
              type: SpeculationEventType.RAT_CLEAR,
              message: `RAT[x${headEntry.destReg}] cleared (was ROB${headEntry.index})`,
            });
          }

          spec.events.push({
            cycle,
            type: SpeculationEventType.ARF_WRITE,
            message: `x${headEntry.destReg} <= ${headEntry.value}`,
            details: { reg: headEntry.destReg, value: headEntry.value },
          });
        }
      }

      // Mark as committed
      headEntry.state = ROBState.COMMITTED;
      headEntry.commitCycle = cycle;
      headEntry.busy = false;
      spec.instructionsCommitted++;

      // Update instruction status
      const instrStatus = spec.instructionStatus.find(
        s => s.robIndex === headEntry.index && s.commitCycle === null && !s.squashed
      );
      if (instrStatus) {
        instrStatus.commitCycle = cycle;
      }

      spec.events.push({
        cycle,
        type: SpeculationEventType.ROB_COMMIT,
        message: `ROB${headEntry.index}: ${headEntry.instruction?.text} committed`,
        details: { robIndex: headEntry.index, destReg: headEntry.destReg, value: headEntry.value },
      });

      // Advance ROB head
      spec.robHead = (spec.robHead + 1) % spec.robSize;
    }
  }

  /**
   * Handle misprediction recovery
   */
  private handleMispredictRecovery(
    state: MachineState,
    branchEntry: ROBEntry,
    cycle: number
  ): void {
    const spec = state.speculation!;
    const arch = state.architectural;

    spec.events.push({
      cycle,
      type: SpeculationEventType.RECOVERY_START,
      message: `Mispredict recovery starting from ROB${branchEntry.index}`,
      details: {
        predicted: branchEntry.predictedNextPC,
        actual: branchEntry.actualNextPC,
      },
    });

    // Squash all younger ROB entries
    let squashCount = 0;
    for (const robEntry of spec.rob) {
      if (!robEntry.busy) continue;
      if (robEntry.index === branchEntry.index) continue;
      
      // Check if this entry is younger than the branch
      if (this.isYoungerROB(robEntry.index, branchEntry.index, spec)) {
        // Squash this entry
        robEntry.state = ROBState.SQUASHED;
        robEntry.busy = false;
        squashCount++;
        spec.instructionsSquashed++;

        // Free associated RS
        if (robEntry.rsId !== null) {
          const rs = spec.reservationStations.get(robEntry.rsId);
          if (rs && rs.busy) {
            this.freeRS(rs);
            spec.events.push({
              cycle,
              type: SpeculationEventType.RS_FREE,
              message: `${rs.id} freed (squashed)`,
            });
          }
        }

        // Remove from store queue if it's a store
        if (robEntry.type === ROBEntryType.STORE) {
          const storeIdx = spec.storeQueue.indexOf(robEntry.index);
          if (storeIdx !== -1) {
            spec.storeQueue.splice(storeIdx, 1);
          }
        }

        // Update instruction status
        const instrStatus = spec.instructionStatus.find(s => s.robIndex === robEntry.index);
        if (instrStatus) {
          instrStatus.squashed = true;
        }

        spec.events.push({
          cycle,
          type: SpeculationEventType.ROB_SQUASH,
          message: `ROB${robEntry.index}: ${robEntry.instruction?.text} squashed`,
        });
      }
    }

    // Restore RAT from checkpoint
    if (branchEntry.ratCheckpoint) {
      spec.rat = new Map(branchEntry.ratCheckpoint);
      spec.events.push({
        cycle,
        type: SpeculationEventType.RAT_RESTORE,
        message: `RAT restored from ROB${branchEntry.index} checkpoint`,
      });
    }

    // Reset ROB tail to point after the branch
    spec.robTail = (branchEntry.index + 1) % spec.robSize;

    // Redirect PC
    arch.pc = branchEntry.actualNextPC!;
    spec.events.push({
      cycle,
      type: SpeculationEventType.PC_REDIRECT,
      message: `PC redirected to ${branchEntry.actualNextPC}`,
    });

    spec.events.push({
      cycle,
      type: SpeculationEventType.RECOVERY_COMPLETE,
      message: `Recovery complete: ${squashCount} instructions squashed`,
    });

    spec.mispredictCount++;
  }

  /**
   * Phase 2: CDB Broadcast
   */
  private phaseCDBBroadcast(state: MachineState, cycle: number): void {
    const spec = state.speculation!;

    // Find all DONE RS entries (excluding stores)
    const doneEntries: SpeculationRS[] = [];
    for (const rs of spec.reservationStations.values()) {
      if (rs.busy && rs.state === RSState.DONE) {
        // Check if this instruction was squashed
        const robEntry = spec.rob[rs.robIndex];
        if (robEntry.state === ROBState.SQUASHED) {
          // Free the RS without broadcasting
          this.freeRS(rs);
          continue;
        }
        doneEntries.push(rs);
      }
    }

    if (doneEntries.length === 0) {
      spec.cdb = null;
      return;
    }

    // Log CDB contention
    if (doneEntries.length > 1) {
      spec.cdbContentionCycles++;
      spec.events.push({
        cycle,
        type: SpeculationEventType.CDB_CONTENTION,
        message: `${doneEntries.length} instructions waiting for CDB`,
        details: { waiting: doneEntries.map(e => e.id) },
      });
    }

    // Select oldest (by instrIndex)
    doneEntries.sort((a, b) => a.instrIndex - b.instrIndex);
    const broadcasting = doneEntries[0];
    const robEntry = spec.rob[broadcasting.robIndex];

    // Handle stores: update ROB but don't broadcast (no dest register)
    if (broadcasting.op === InstructionType.ST) {
      // Store data is now ready
      robEntry.storeData = broadcasting.Vk!;
      robEntry.storeDataReady = true;
      robEntry.ready = robEntry.storeAddressReady && robEntry.storeDataReady;
      robEntry.state = ROBState.WRITE_RESULT;

      // Free the RS
      this.freeRS(broadcasting);
      spec.events.push({
        cycle,
        type: SpeculationEventType.RS_FREE,
        message: `${broadcasting.id} freed (store)`,
      });
      return;
    }

    // Create broadcast
    const broadcast: SpeculationCDBBroadcast = {
      robIndex: broadcasting.robIndex,
      value: broadcasting.result!,
      destReg: broadcasting.destReg,
      instrIndex: broadcasting.instrIndex,
    };
    spec.cdb = broadcast;
    spec.cdbBroadcasts++;

    spec.events.push({
      cycle,
      type: SpeculationEventType.CDB_BROADCAST,
      message: `ROB${broadcast.robIndex} broadcasts value ${broadcast.value}${broadcast.destReg !== null ? ` to x${broadcast.destReg}` : ''}`,
      details: { robIndex: broadcast.robIndex, value: broadcast.value, destReg: broadcast.destReg },
    });

    // Wake up all waiting operands (Q-fields point to ROB indices)
    for (const rs of spec.reservationStations.values()) {
      if (!rs.busy) continue;

      if (rs.Qj === broadcast.robIndex) {
        rs.Vj = broadcast.value;
        rs.Qj = null;
        spec.events.push({
          cycle,
          type: SpeculationEventType.RS_OPERAND_WAKEUP,
          message: `${rs.id}.Vj wakes up with value ${broadcast.value} from ROB${broadcast.robIndex}`,
        });
      }

      if (rs.Qk === broadcast.robIndex) {
        rs.Vk = broadcast.value;
        rs.Qk = null;
        spec.events.push({
          cycle,
          type: SpeculationEventType.RS_OPERAND_WAKEUP,
          message: `${rs.id}.Vk wakes up with value ${broadcast.value} from ROB${broadcast.robIndex}`,
        });
      }
    }

    // Update ROB entry
    robEntry.value = broadcast.value;
    robEntry.ready = true;
    robEntry.state = ROBState.WRITE_RESULT;
    robEntry.writeResultCycle = cycle;

    // Update instruction status
    const instrStatus = spec.instructionStatus.find(
      s => s.robIndex === robEntry.index && s.writeResultCycle === null && !s.squashed
    );
    if (instrStatus) {
      instrStatus.writeResultCycle = cycle;
    }

    // Free the RS entry
    this.freeRS(broadcasting);
    spec.events.push({
      cycle,
      type: SpeculationEventType.RS_FREE,
      message: `${broadcasting.id} freed`,
    });
  }

  /**
   * Phase 3: Check Operand Readiness
   */
  private phaseOperandWakeup(state: MachineState, _cycle: number): void {
    const spec = state.speculation!;

    for (const rs of spec.reservationStations.values()) {
      if (!rs.busy) continue;
      if (rs.state !== RSState.WAITING) continue;

      // Check if all operands are ready
      const operandsReady = rs.Qj === null && rs.Qk === null;

      // For memory ops, need address calculation first
      if (rs.rsType === RSType.LOAD || rs.rsType === RSType.STORE) {
        if (rs.Qj === null && !rs.addressReady) {
          // Base ready, can transition to READY for address calculation
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
   * Phase 4: Start Execution for READY entries
   */
  private phaseStartExecution(state: MachineState, cycle: number): void {
    const spec = state.speculation!;

    // Group READY entries by RS type  
    const readyByType = new Map<RSType, SpeculationRS[]>();

    for (const rs of spec.reservationStations.values()) {
      if (!rs.busy || rs.state !== RSState.READY) continue;

      // Check if ROB entry is squashed
      const robEntry = spec.rob[rs.robIndex];
      if (robEntry.state === ROBState.SQUASHED) {
        this.freeRS(rs);
        continue;
      }

      // Check if this FU type already has something executing
      let fuBusy = false;
      for (const other of spec.reservationStations.values()) {
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
      const robEntry = spec.rob[toStart.robIndex];

      // Handle memory address calculation phase
      if ((toStart.rsType === RSType.LOAD || toStart.rsType === RSType.STORE) && !toStart.addressReady) {
        // Address calculation phase
        toStart.address = toStart.Vj! + toStart.imm;
        toStart.addressReady = true;
        toStart.state = RSState.EXECUTING;
        toStart.remainingCycles = 1; // Memory access takes 1 more cycle
        toStart.execStartCycle = cycle;

        // Update ROB for stores
        if (toStart.rsType === RSType.STORE) {
          robEntry.storeAddress = toStart.address;
          robEntry.storeAddressReady = true;
        }

        // Update ROB state
        robEntry.state = ROBState.EXECUTING;
        robEntry.execStartCycle = cycle;

        spec.events.push({
          cycle,
          type: SpeculationEventType.ADDR_CALC,
          message: `${toStart.id}: Address calculated = ${toStart.address}`,
          details: { rsId: toStart.id, address: toStart.address },
        });
      } else {
        // Regular execution start
        toStart.state = RSState.EXECUTING;
        toStart.execStartCycle = cycle;

        // Set remaining cycles based on operation
        if (toStart.rsType === RSType.LOAD || toStart.rsType === RSType.STORE) {
          toStart.remainingCycles = 1; // Memory access after address calc
        } else {
          toStart.remainingCycles = getSpeculationLatency(toStart.op!, spec.config);
        }

        // Update ROB state
        robEntry.state = ROBState.EXECUTING;
        if (robEntry.execStartCycle === null) {
          robEntry.execStartCycle = cycle;
        }

        spec.events.push({
          cycle,
          type: SpeculationEventType.EXEC_START,
          message: `${toStart.id}: Execution started (${toStart.remainingCycles} cycles)`,
          details: { rsId: toStart.id, cycles: toStart.remainingCycles },
        });
      }

      // Update instruction status
      const instrStatus = spec.instructionStatus.find(
        s => s.robIndex === toStart.robIndex && s.execStartCycle === null && !s.squashed
      );
      if (instrStatus) {
        instrStatus.execStartCycle = cycle;
      }
    }
  }

  /**
   * Phase 5: Continue/Complete Execution
   */
  private phaseContinueExecution(state: MachineState, cycle: number): void {
    const spec = state.speculation!;
    const arch = state.architectural;

    for (const rs of spec.reservationStations.values()) {
      if (!rs.busy || rs.state !== RSState.EXECUTING) continue;

      // Check if ROB entry is squashed
      const robEntry = spec.rob[rs.robIndex];
      if (robEntry.state === ROBState.SQUASHED) {
        this.freeRS(rs);
        continue;
      }

      // Decrement remaining cycles
      if (rs.remainingCycles > 0) {
        rs.remainingCycles--;

        if (rs.remainingCycles > 0) {
          spec.events.push({
            cycle,
            type: SpeculationEventType.EXEC_CONTINUE,
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
        robEntry.execEndCycle = cycle;

        spec.events.push({
          cycle,
          type: SpeculationEventType.EXEC_END,
          message: `${rs.id}: Execution complete, result = ${rs.result}`,
          details: { rsId: rs.id, result: rs.result },
        });

        // Handle memory operations
        if (rs.rsType === RSType.LOAD) {
          // Check if any older store has same address
          if (this.checkLoadStoreConflict(spec, rs)) {
            // Must wait for older store
            rs.state = RSState.WAITING;
            rs.remainingCycles = 1;
            spec.events.push({
              cycle,
              type: SpeculationEventType.EXEC_CONTINUE,
              message: `${rs.id}: Load waiting for older store to same address`,
            });
            continue;
          }
          
          rs.result = readMemory(arch, rs.address!);
          spec.memoryReads++;
          spec.events.push({
            cycle,
            type: SpeculationEventType.MEM_READ,
            message: `Load from mem[${rs.address}] = ${rs.result}`,
            details: { address: rs.address, value: rs.result },
          });
        }

        // Handle branches
        if (rs.rsType === RSType.BRANCH) {
          this.handleBranchResolution(state, rs, cycle);
        }

        // Update instruction status
        const instrStatus = spec.instructionStatus.find(
          s => s.robIndex === rs.robIndex && s.execEndCycle === null && !s.squashed
        );
        if (instrStatus) {
          instrStatus.execEndCycle = cycle;
        }
      }
    }
  }

  /**
   * Check if a load has a conflict with an older store
   */
  private checkLoadStoreConflict(
    spec: NonNullable<MachineState['speculation']>,
    loadRS: SpeculationRS
  ): boolean {
    // Check all stores in the store queue that are older than this load
    for (const storeRobIdx of spec.storeQueue) {
      const storeRob = spec.rob[storeRobIdx];
      if (storeRob.instrIndex >= loadRS.instrIndex) continue; // Not older

      // If store address not ready, load must wait
      if (!storeRob.storeAddressReady) {
        return true;
      }

      // If same address, load must wait for store to commit
      if (storeRob.storeAddress === loadRS.address) {
        return true;
      }
    }
    return false;
  }

  /**
   * Compute result for an RS entry
   */
  private computeResult(rs: SpeculationRS, _arch: { registers: { registers: number[] } }): number {
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
  private handleBranchResolution(state: MachineState, rs: SpeculationRS, cycle: number): void {
    const spec = state.speculation!;
    const robEntry = spec.rob[rs.robIndex];

    const vj = rs.Vj ?? 0;
    const vk = rs.Vk ?? 0;
    let actualTaken = false;
    let actualTarget = robEntry.pc + WORD_SIZE;

    switch (rs.op) {
      case InstructionType.BEQ:
        actualTaken = vj === vk;
        actualTarget = rs.instruction!.imm!;
        break;
      case InstructionType.BNE:
        actualTaken = vj !== vk;
        actualTarget = rs.instruction!.imm!;
        break;
      case InstructionType.J:
        actualTaken = true;
        actualTarget = rs.instruction!.imm!;
        break;
    }

    const actualNextPC = actualTaken ? actualTarget : robEntry.pc + WORD_SIZE;
    const mispredicted = robEntry.predictedNextPC !== actualNextPC;

    // Update ROB entry with resolution
    robEntry.actualTaken = actualTaken;
    robEntry.actualTarget = actualTarget;
    robEntry.actualNextPC = actualNextPC;
    robEntry.branchResolved = true;
    robEntry.mispredicted = mispredicted;
    robEntry.ready = true;
    robEntry.state = ROBState.WRITE_RESULT;

    spec.branchCount++;

    if (mispredicted) {
      spec.events.push({
        cycle,
        type: SpeculationEventType.BRANCH_MISPREDICT,
        message: `Branch ${actualTaken ? 'taken' : 'not taken'} to ${actualNextPC} (predicted ${robEntry.predictedNextPC})`,
        details: {
          robIndex: robEntry.index,
          predicted: robEntry.predictedNextPC,
          actual: actualNextPC,
          taken: actualTaken,
        },
      });
    } else {
      spec.events.push({
        cycle,
        type: SpeculationEventType.BRANCH_CORRECT,
        message: `Branch ${actualTaken ? 'taken' : 'not taken'} (correctly predicted)`,
        details: {
          robIndex: robEntry.index,
          predicted: robEntry.predictedNextPC,
          actual: actualNextPC,
          taken: actualTaken,
        },
      });
    }

    spec.events.push({
      cycle,
      type: SpeculationEventType.BRANCH_RESOLVE,
      message: `ROB${robEntry.index}: Branch resolved, ${actualTaken ? 'taken' : 'not taken'}`,
      details: { robIndex: robEntry.index, taken: actualTaken, target: actualTarget },
    });

    // Free the branch RS
    this.freeRS(rs);
    spec.events.push({
      cycle,
      type: SpeculationEventType.RS_FREE,
      message: `${rs.id} freed (branch resolved)`,
    });
  }

  /**
   * Phase 6: Issue new instruction
   */
  private phaseIssue(state: MachineState, cycle: number): void {
    const spec = state.speculation!;
    const arch = state.architectural;

    // Don't issue if program is done
    const instrIndex = arch.pc / WORD_SIZE;
    if (instrIndex >= arch.instructions.length) {
      return;
    }

    const instruction = arch.instructions[instrIndex];

    // Handle NOP specially - allocate ROB but no RS
    if (instruction.type === InstructionType.NOP) {
      // Check if ROB has space
      if (this.isROBFull(spec)) {
        spec.issueStalls++;
        spec.robFullStalls++;
        spec.events.push({
          cycle,
          type: SpeculationEventType.ISSUE_STALL_ROB_FULL,
          message: 'Issue stalled: ROB full',
        });
        return;
      }

      // Allocate ROB entry for NOP
      const robEntry = spec.rob[spec.robTail];
      robEntry.busy = true;
      robEntry.index = spec.robTail;
      robEntry.instrIndex = instrIndex;
      robEntry.pc = arch.pc;
      robEntry.type = ROBEntryType.NOP;
      robEntry.instruction = instruction;
      robEntry.destReg = null;
      robEntry.value = null;
      robEntry.ready = true;
      robEntry.state = ROBState.WRITE_RESULT;
      robEntry.issueCycle = cycle;

      spec.instructionStatus.push({
        instruction,
        instrIndex,
        robIndex: robEntry.index,
        issueCycle: cycle,
        execStartCycle: cycle,
        execEndCycle: cycle,
        writeResultCycle: cycle,
        commitCycle: null,
        squashed: false,
        rsId: null,
      });

      spec.robTail = (spec.robTail + 1) % spec.robSize;
      arch.pc += WORD_SIZE;
      return;
    }

    // Find RS type for this instruction
    const rsType = getRSTypeForInstruction(instruction.type);
    if (rsType === null) {
      arch.halted = true;
      arch.errorMessage = `Unsupported instruction: ${instruction.type}`;
      return;
    }

    // Check if ROB has space
    if (this.isROBFull(spec)) {
      spec.issueStalls++;
      spec.robFullStalls++;
      spec.events.push({
        cycle,
        type: SpeculationEventType.ISSUE_STALL_ROB_FULL,
        message: 'Issue stalled: ROB full',
      });
      return;
    }

    // Find a free RS of the required type
    let freeRS: SpeculationRS | null = null;
    for (const rs of spec.reservationStations.values()) {
      if (rs.rsType === rsType && !rs.busy) {
        freeRS = rs;
        break;
      }
    }

    if (!freeRS) {
      spec.issueStalls++;
      spec.rsFullStalls++;
      spec.events.push({
        cycle,
        type: SpeculationEventType.ISSUE_STALL_RS_FULL,
        message: `Issue stalled: No free ${rsType} RS`,
      });
      return;
    }

    // Issue the instruction
    this.issueInstruction(state, instruction, instrIndex, freeRS, cycle);

    // Handle branch prediction and PC update
    if (isBranchOrJump(instruction.type)) {
      // PC already updated in issueInstruction for branches
    } else {
      // Advance PC normally
      arch.pc += WORD_SIZE;
    }
  }

  /**
   * Issue an instruction to a RS and ROB
   */
  private issueInstruction(
    state: MachineState,
    instruction: Instruction,
    instrIndex: number,
    rs: SpeculationRS,
    cycle: number
  ): void {
    const spec = state.speculation!;
    const arch = state.architectural;

    // Allocate ROB entry
    const robIndex = spec.robTail;
    const robEntry = spec.rob[robIndex];
    robEntry.busy = true;
    robEntry.index = robIndex;
    robEntry.instrIndex = instrIndex;
    robEntry.pc = arch.pc;
    robEntry.type = getROBEntryType(instruction.type);
    robEntry.instruction = instruction;
    robEntry.destReg = instructionWritesRegister(instruction.type) && instruction.rd !== 0 
      ? instruction.rd ?? null 
      : null;
    robEntry.value = null;
    robEntry.ready = false;
    robEntry.state = ROBState.ISSUED;
    robEntry.rsId = rs.id;
    robEntry.issueCycle = cycle;
    robEntry.execStartCycle = null;
    robEntry.execEndCycle = null;
    robEntry.writeResultCycle = null;
    robEntry.commitCycle = null;

    // Reset store-specific fields
    robEntry.storeAddress = null;
    robEntry.storeAddressReady = false;
    robEntry.storeData = null;
    robEntry.storeDataReady = false;

    // Reset branch-specific fields
    robEntry.predictedTaken = false;
    robEntry.predictedTarget = 0;
    robEntry.predictedNextPC = 0;
    robEntry.actualTaken = null;
    robEntry.actualTarget = null;
    robEntry.actualNextPC = null;
    robEntry.branchResolved = false;
    robEntry.mispredicted = false;
    robEntry.ratCheckpoint = null;

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
    rs.robIndex = robIndex;

    // Handle source operand 1 (rs1)
    if (instruction.rs1 !== undefined) {
      const ratEntry = spec.rat.get(instruction.rs1);
      if (ratEntry && ratEntry.robIndex !== null) {
        // Check if the ROB entry already has the value
        const producerROB = spec.rob[ratEntry.robIndex];
        if (producerROB.ready && producerROB.value !== null) {
          rs.Vj = producerROB.value;
          rs.Qj = null;
        } else {
          rs.Vj = null;
          rs.Qj = ratEntry.robIndex;
        }
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
      const ratEntry = spec.rat.get(instruction.rs2);
      if (ratEntry && ratEntry.robIndex !== null) {
        const producerROB = spec.rob[ratEntry.robIndex];
        if (producerROB.ready && producerROB.value !== null) {
          rs.Vk = producerROB.value;
          rs.Qk = null;
        } else {
          rs.Vk = null;
          rs.Qk = ratEntry.robIndex;
        }
      } else {
        rs.Vk = readRegister(arch, instruction.rs2);
        rs.Qk = null;
      }
    } else {
      rs.Vk = null;
      rs.Qk = null;
    }

    // Handle destination register
    if (robEntry.destReg !== null) {
      rs.destReg = robEntry.destReg;
      // Update RAT to point to this ROB entry
      spec.rat.set(robEntry.destReg, { robIndex: robIndex });
      spec.events.push({
        cycle,
        type: SpeculationEventType.RAT_UPDATE,
        message: `RAT[x${robEntry.destReg}] = ROB${robIndex}`,
      });
    } else {
      rs.destReg = null;
    }

    // Track stores in order
    if (instruction.type === InstructionType.ST) {
      spec.storeQueue.push(robIndex);
    }

    // Handle branch prediction
    if (isBranchOrJump(instruction.type)) {
      spec.branchCount++;

      // Checkpoint RAT for recovery
      robEntry.ratCheckpoint = new Map(spec.rat);
      spec.events.push({
        cycle,
        type: SpeculationEventType.RAT_CHECKPOINT,
        message: `RAT checkpointed at ROB${robIndex}`,
      });

      // Predict: always-not-taken for BEQ/BNE, always-taken for J
      if (instruction.type === InstructionType.J) {
        robEntry.predictedTaken = true;
        robEntry.predictedTarget = instruction.imm!;
        robEntry.predictedNextPC = instruction.imm!;
      } else {
        robEntry.predictedTaken = false;
        robEntry.predictedTarget = instruction.imm!;
        robEntry.predictedNextPC = arch.pc + WORD_SIZE;
      }

      arch.pc = robEntry.predictedNextPC;

      spec.events.push({
        cycle,
        type: SpeculationEventType.BRANCH_PREDICT,
        message: `Predict ${robEntry.predictedTaken ? 'taken' : 'not taken'}, next PC = ${robEntry.predictedNextPC}`,
        details: { 
          robIndex, 
          predicted: robEntry.predictedTaken, 
          target: robEntry.predictedTarget,
          nextPC: robEntry.predictedNextPC,
        },
      });
    }

    // Advance ROB tail
    spec.robTail = (spec.robTail + 1) % spec.robSize;

    // Add to instruction status
    spec.instructionStatus.push({
      instruction,
      instrIndex,
      robIndex,
      issueCycle: cycle,
      execStartCycle: null,
      execEndCycle: null,
      writeResultCycle: null,
      commitCycle: null,
      squashed: false,
      rsId: rs.id,
    });

    spec.events.push({
      cycle,
      type: SpeculationEventType.ISSUE,
      message: `${instruction.text} issued to ${rs.id}, ROB${robIndex}`,
      details: {
        rsId: rs.id,
        robIndex,
        Vj: rs.Vj,
        Qj: rs.Qj,
        Vk: rs.Vk,
        Qk: rs.Qk,
        imm: rs.imm,
        destReg: rs.destReg,
      },
    });

    spec.events.push({
      cycle,
      type: SpeculationEventType.ROB_ALLOCATE,
      message: `ROB${robIndex} allocated for ${instruction.text}`,
      details: { robIndex, type: robEntry.type, destReg: robEntry.destReg },
    });
  }

  /**
   * Free a reservation station
   */
  private freeRS(rs: SpeculationRS): void {
    rs.busy = false;
    rs.op = null;
    rs.Vj = null;
    rs.Qj = null;
    rs.Vk = null;
    rs.Qk = null;
    rs.imm = 0;
    rs.address = null;
    rs.addressReady = false;
    rs.robIndex = -1;
    rs.destReg = null;
    rs.state = RSState.WAITING;
    rs.remainingCycles = 0;
    rs.result = null;
    rs.instruction = null;
    rs.instrIndex = -1;
    rs.issueCycle = null;
    rs.execStartCycle = null;
    rs.execEndCycle = null;
  }

  /**
   * Check if program has completed
   */
  private checkCompletion(state: MachineState): void {
    const spec = state.speculation!;
    const arch = state.architectural;

    // Check if all instructions have been issued
    const allIssued = arch.pc >= arch.instructions.length * WORD_SIZE;

    // Check if ROB is empty
    const robEmpty = this.isROBEmpty(spec);

    // Check if all RS are empty
    let allRSEmpty = true;
    for (const rs of spec.reservationStations.values()) {
      if (rs.busy) {
        allRSEmpty = false;
        break;
      }
    }

    // Check if CDB is idle
    const cdbIdle = spec.cdb === null;

    if (allIssued && robEmpty && allRSEmpty && cdbIdle) {
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

    if (state.speculation) {
      const newRS = new Map<string, SpeculationRS>();
      for (const [id, rs] of state.speculation.reservationStations) {
        newRS.set(id, { ...rs, instruction: rs.instruction ? { ...rs.instruction } : null });
      }

      const newRAT = new Map<number, SpeculationRATEntry>();
      for (const [reg, entry] of state.speculation.rat) {
        newRAT.set(reg, { ...entry });
      }

      const newROB: ROBEntry[] = state.speculation.rob.map(entry => ({
        ...entry,
        instruction: entry.instruction ? { ...entry.instruction } : null,
        ratCheckpoint: entry.ratCheckpoint ? new Map(entry.ratCheckpoint) : null,
      }));

      clone.speculation = {
        ...state.speculation,
        rob: newROB,
        reservationStations: newRS,
        rat: newRAT,
        cdb: state.speculation.cdb ? { ...state.speculation.cdb } : null,
        instructionStatus: state.speculation.instructionStatus.map(s => ({ ...s })),
        storeQueue: [...state.speculation.storeQueue],
        events: [...state.speculation.events],
        config: { ...state.speculation.config },
      };
    }

    return clone;
  }

  /**
   * Reset the machine state
   */
  reset(state: MachineState): MachineState {
    const instructions = state.architectural.instructions;
    const config = state.speculation?.config || this.config;
    
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
      speculation: createSpeculationState(config),
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
    const entries: TraceEntry[] = [];
    
    if (state.speculation) {
      for (const status of state.speculation.instructionStatus) {
        let stage: string;
        if (status.squashed) {
          stage = 'SQUASHED';
        } else if (status.commitCycle !== null) {
          stage = 'COMMITTED';
        } else if (status.writeResultCycle !== null) {
          stage = 'WRITE_RESULT';
        } else if (status.execEndCycle !== null) {
          stage = 'EXEC_END';
        } else if (status.execStartCycle !== null) {
          stage = 'EXECUTING';
        } else {
          stage = 'ISSUED';
        }

        entries.push({
          cycle: state.architectural.cycle,
          instruction: status.instruction,
          stage,
          details: {
            robIndex: status.robIndex,
            issueCycle: status.issueCycle,
            execStartCycle: status.execStartCycle,
            execEndCycle: status.execEndCycle,
            writeResultCycle: status.writeResultCycle,
            commitCycle: status.commitCycle,
            squashed: status.squashed,
            rsId: status.rsId,
          },
        });
      }
    }

    return entries;
  }
}
