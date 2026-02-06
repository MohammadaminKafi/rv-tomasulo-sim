/**
 * 5-Stage Pipeline Execution Model
 * 
 * Implements the complete pipeline semantics as specified in SPECIFICATION.md
 * 
 * Stages: IF -> ID -> EX -> MEM -> WB
 * 
 * Features:
 * - Multi-cycle EX (MUL: 4 cycles, DIV: 6 cycles)
 * - Data forwarding (EX/MEM -> EX, MEM/WB -> EX)
 * - Hazard detection (structural, load-use, branch operand)
 * - Branch/jump handling with flush
 * - Event logging
 */

import { ExecutionModel } from './base';
import {
  MachineState,
  InstructionType,
  TraceEntry,
  PipelineRegisters,
  IFIDRegister,
  IDEXRegister,
  EXMEMRegister,
  MEMWBRegister,
  PipelineEvent,
  EventType,
  StallReason,
  EX_LATENCY,
  instructionWritesRegister,
  WORD_SIZE,
} from '../types';
import {
  getCurrentInstruction,
  readRegister,
  writeRegister,
  readMemory,
  writeMemory,
  createPipelineState,
  MemoryError,
} from '../state';

/**
 * Create an empty (bubble) IF/ID register
 */
function createEmptyIFID(): IFIDRegister {
  return { instruction: null, pc: 0, valid: false };
}

/**
 * Create an empty (bubble) ID/EX register
 */
function createEmptyIDEX(): IDEXRegister {
  return {
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
  };
}

/**
 * Create an empty (bubble) EX/MEM register
 */
function createEmptyEXMEM(): EXMEMRegister {
  return {
    instruction: null,
    pc: 0,
    aluResult: 0,
    rs2Value: 0,
    rd: null,
    branchTaken: false,
    branchTarget: 0,
    valid: false,
  };
}

/**
 * Create an empty (bubble) MEM/WB register
 */
function createEmptyMEMWB(): MEMWBRegister {
  return {
    instruction: null,
    pc: 0,
    result: 0,
    rd: null,
    writeReg: false,
    valid: false,
  };
}

/**
 * 5-stage pipeline implementation
 */
export class PipelineExecutionModel implements ExecutionModel {
  private dataForwardingEnabled: boolean;
  private memoryReads: number;
  private memoryWrites: number;

  constructor(dataForwardingEnabled: boolean = true) {
    this.dataForwardingEnabled = dataForwardingEnabled;
    this.memoryReads = 0;
    this.memoryWrites = 0;
  }

  /**
   * Execute one complete cycle
   */
  step(state: MachineState): MachineState {
    if (!state.pipeline) {
      throw new Error('Pipeline state not initialized');
    }

    // Create deep copies for next state
    const newState: MachineState = {
      ...state,
      architectural: {
        ...state.architectural,
        registers: {
          registers: [...state.architectural.registers.registers],
        },
        memory: {
          data: new Map(state.architectural.memory.data),
        },
      },
      pipeline: {
        ...state.pipeline,
        registers: JSON.parse(JSON.stringify(state.pipeline.registers)),
        events: [...state.pipeline.events],
      },
    };

    // Get current pipeline registers (read phase)
    const current = state.pipeline.registers;
    
    // Initialize next pipeline registers
    const next: PipelineRegisters = {
      IFID: createEmptyIFID(),
      IDEX: createEmptyIDEX(),
      EXMEM: createEmptyEXMEM(),
      MEMWB: createEmptyMEMWB(),
    };

    // Track events for this cycle
    const cycleEvents: PipelineEvent[] = [];
    const cycle = state.architectural.cycle;
    
    // Determine stall and flush conditions FIRST
    const { shouldStall, stallReason } = this.detectHazards(current, state);
    
    newState.pipeline!.currentStallReason = stallReason;
    
    if (shouldStall) {
      newState.pipeline!.stallCycles++;
      cycleEvents.push({
        cycle,
        type: this.getStallEventType(stallReason),
        message: this.getStallMessage(stallReason, current),
      });
    }

    let branchTaken = false;
    let branchTarget = 0;

    try {
      // Execute stages in specific order to handle forwarding correctly
      // WB first (so its result is available for forwarding check)
      // Then MEM, EX, ID, IF
      
      // Clear lastWBInstruction at start of cycle
      newState.pipeline!.lastWBInstruction = null;
      
      // === WB Stage ===
      if (current.MEMWB.valid && current.MEMWB.instruction) {
        // Track the instruction that completed WB for visualization
        newState.pipeline!.lastWBInstruction = current.MEMWB.instruction.text;
        
        if (current.MEMWB.writeReg && current.MEMWB.rd !== null && current.MEMWB.rd !== 0) {
          writeRegister(newState.architectural, current.MEMWB.rd, current.MEMWB.result);
          cycleEvents.push({
            cycle,
            type: EventType.WRITEBACK,
            message: `WB: x${current.MEMWB.rd} <- ${current.MEMWB.result} (from ${current.MEMWB.instruction.type})`,
          });
        }
        newState.pipeline!.instructionsCompleted++;
      }
      
      // === MEM Stage ===
      if (current.EXMEM.valid && current.EXMEM.instruction) {
        const memInstr = current.EXMEM.instruction;
        let memResult = current.EXMEM.aluResult;
        let storeData = current.EXMEM.rs2Value;
        
        // Forward store data from WB if needed
        if (memInstr.type === InstructionType.ST && this.dataForwardingEnabled) {
          if (current.MEMWB.valid && current.MEMWB.rd !== null && current.MEMWB.rd !== 0) {
            if (memInstr.rs2 === current.MEMWB.rd) {
              storeData = current.MEMWB.result;
              cycleEvents.push({
                cycle,
                type: EventType.FORWARD,
                message: `Forward MEM/WB -> MEM.storeData(x${memInstr.rs2}): ${storeData}`,
              });
              newState.pipeline!.forwardingEvents++;
            }
          }
        }
        
        if (memInstr.type === InstructionType.LD) {
          memResult = readMemory(newState.architectural, current.EXMEM.aluResult);
          this.memoryReads++;
          cycleEvents.push({
            cycle,
            type: EventType.MEMORY_READ,
            message: `MEM: Load from addr=0x${current.EXMEM.aluResult.toString(16)}, value=${memResult}`,
          });
        } else if (memInstr.type === InstructionType.ST) {
          writeMemory(newState.architectural, current.EXMEM.aluResult, storeData);
          this.memoryWrites++;
          cycleEvents.push({
            cycle,
            type: EventType.MEMORY_WRITE,
            message: `MEM: Store to addr=0x${current.EXMEM.aluResult.toString(16)}, value=${storeData}`,
          });
        }
        
        // Move to MEM/WB
        next.MEMWB = {
          instruction: memInstr,
          pc: current.EXMEM.pc,
          result: memResult,
          rd: current.EXMEM.rd,
          writeReg: instructionWritesRegister(memInstr.type) && current.EXMEM.rd !== null && current.EXMEM.rd !== 0,
          valid: true,
        };
      }
      
      // === EX Stage ===
      if (current.IDEX.valid && current.IDEX.instruction) {
        const exInstr = current.IDEX.instruction;
        
        // Check if still executing multi-cycle instruction
        if (current.IDEX.exCyclesRemaining > 1) {
          // Still executing - decrement counter, keep in EX
          next.IDEX = {
            ...current.IDEX,
            exCyclesRemaining: current.IDEX.exCyclesRemaining - 1,
          };
          next.EXMEM = createEmptyEXMEM(); // Insert bubble
          
          cycleEvents.push({
            cycle,
            type: EventType.EXECUTE_CONTINUE,
            message: `EX: ${exInstr.type} cycle ${EX_LATENCY[exInstr.type] - current.IDEX.exCyclesRemaining + 1}/${EX_LATENCY[exInstr.type]}`,
          });
        } else {
          // Completing EX stage
          let rs1Value = current.IDEX.rs1Value;
          let rs2Value = current.IDEX.rs2Value;
          
          // Apply forwarding at EX stage
          if (this.dataForwardingEnabled) {
            // Forward from EX/MEM (higher priority)
            if (current.EXMEM.valid && current.EXMEM.rd !== null && current.EXMEM.rd !== 0) {
              if (current.EXMEM.instruction?.type !== InstructionType.LD) {
                if (current.IDEX.rs1 === current.EXMEM.rd) {
                  rs1Value = current.EXMEM.aluResult;
                  cycleEvents.push({
                    cycle,
                    type: EventType.FORWARD,
                    message: `Forward EX/MEM -> EX.rs1(x${current.IDEX.rs1}): ${rs1Value}`,
                  });
                  newState.pipeline!.forwardingEvents++;
                }
                if (current.IDEX.rs2 === current.EXMEM.rd) {
                  rs2Value = current.EXMEM.aluResult;
                  cycleEvents.push({
                    cycle,
                    type: EventType.FORWARD,
                    message: `Forward EX/MEM -> EX.rs2(x${current.IDEX.rs2}): ${rs2Value}`,
                  });
                  newState.pipeline!.forwardingEvents++;
                }
              }
            }
            
            // Forward from MEM/WB (lower priority - only if not forwarded from EX/MEM)
            if (current.MEMWB.valid && current.MEMWB.rd !== null && current.MEMWB.rd !== 0) {
              const exmemForwardsRs1 = current.EXMEM.valid && current.EXMEM.rd === current.IDEX.rs1 && 
                                        current.EXMEM.instruction?.type !== InstructionType.LD;
              const exmemForwardsRs2 = current.EXMEM.valid && current.EXMEM.rd === current.IDEX.rs2 && 
                                        current.EXMEM.instruction?.type !== InstructionType.LD;
              
              if (current.IDEX.rs1 === current.MEMWB.rd && !exmemForwardsRs1) {
                rs1Value = current.MEMWB.result;
                cycleEvents.push({
                  cycle,
                  type: EventType.FORWARD,
                  message: `Forward MEM/WB -> EX.rs1(x${current.IDEX.rs1}): ${rs1Value}`,
                });
                newState.pipeline!.forwardingEvents++;
              }
              if (current.IDEX.rs2 === current.MEMWB.rd && !exmemForwardsRs2) {
                rs2Value = current.MEMWB.result;
                cycleEvents.push({
                  cycle,
                  type: EventType.FORWARD,
                  message: `Forward MEM/WB -> EX.rs2(x${current.IDEX.rs2}): ${rs2Value}`,
                });
                newState.pipeline!.forwardingEvents++;
              }
            }
          }
          
          // Execute ALU operation
          let aluResult = 0;
          
          switch (exInstr.type) {
            case InstructionType.ADD:
              aluResult = (rs1Value + rs2Value) | 0;
              break;
            case InstructionType.SUB:
              aluResult = (rs1Value - rs2Value) | 0;
              break;
            case InstructionType.MUL:
              aluResult = Math.imul(rs1Value, rs2Value);
              break;
            case InstructionType.MULI:
              aluResult = Math.imul(rs1Value, current.IDEX.imm ?? 0);
              break;
            case InstructionType.DIV:
            case InstructionType.DIVI:
              {
                const divisor = exInstr.type === InstructionType.DIVI ? (current.IDEX.imm ?? 0) : rs2Value;
                if (divisor === 0) {
                  newState.architectural.halted = true;
                  newState.architectural.errorMessage = `Division by zero in ${exInstr.text}`;
                  cycleEvents.push({
                    cycle,
                    type: EventType.ERROR,
                    message: `Division by zero`,
                  });
                } else {
                  aluResult = Math.trunc(rs1Value / divisor);
                }
              }
              break;
            case InstructionType.AND:
              aluResult = rs1Value & rs2Value;
              break;
            case InstructionType.OR:
              aluResult = rs1Value | rs2Value;
              break;
            case InstructionType.XOR:
              aluResult = rs1Value ^ rs2Value;
              break;
            case InstructionType.ADDI:
              aluResult = (rs1Value + (current.IDEX.imm ?? 0)) | 0;
              break;
            case InstructionType.SUBI:
              aluResult = (rs1Value - (current.IDEX.imm ?? 0)) | 0;
              break;
            case InstructionType.LD:
            case InstructionType.ST:
              aluResult = rs1Value + (current.IDEX.imm ?? 0);
              break;
            case InstructionType.BEQ:
              branchTarget = current.IDEX.imm ?? 0;
              branchTaken = rs1Value === rs2Value;
              break;
            case InstructionType.BNE:
              branchTarget = current.IDEX.imm ?? 0;
              branchTaken = rs1Value !== rs2Value;
              break;
            case InstructionType.J:
              branchTarget = current.IDEX.imm ?? 0;
              branchTaken = true;
              break;
            case InstructionType.NOP:
              break;
          }
          
          // Log execution
          if (exInstr.type === InstructionType.MUL || exInstr.type === InstructionType.DIV ||
              exInstr.type === InstructionType.MULI || exInstr.type === InstructionType.DIVI) {
            cycleEvents.push({
              cycle,
              type: EventType.EXECUTE_COMPLETE,
              message: `EX: ${exInstr.type} complete, result=${aluResult}`,
            });
          } else if (branchTaken) {
            cycleEvents.push({
              cycle,
              type: EventType.EXECUTE,
              message: `EX: ${exInstr.type} branch taken to 0x${branchTarget.toString(16)}`,
            });
          } else {
            cycleEvents.push({
              cycle,
              type: EventType.EXECUTE,
              message: `EX: ${exInstr.type} result=${aluResult}`,
            });
          }
          
          // Move to EX/MEM
          next.EXMEM = {
            instruction: exInstr,
            pc: current.IDEX.pc,
            aluResult,
            rs2Value,
            rd: current.IDEX.rd,
            branchTaken,
            branchTarget,
            valid: true,
          };
        }
      }
      
      // === Handle stalls and flushes ===
      if (shouldStall) {
        // On stall: IF and ID freeze
        next.IFID = { ...current.IFID };
        // IDEX stays as is (multi-cycle) or gets bubble if not structural
        if (stallReason !== StallReason.STRUCTURAL_EX_BUSY) {
          next.IDEX = createEmptyIDEX();
        }
        // PC does not change
      } else if (branchTaken) {
        // On taken branch: flush IF and ID, redirect PC
        next.IFID = createEmptyIFID();
        next.IDEX = createEmptyIDEX();
        newState.architectural.pc = branchTarget;
        newState.pipeline!.flushCount += 2; // Flushing 2 stages
        
        cycleEvents.push({
          cycle,
          type: EventType.FLUSH,
          message: `Branch/jump taken, flushing IF and ID, PC -> 0x${branchTarget.toString(16)}`,
        });
        
        cycleEvents.push({
          cycle,
          type: EventType.PC_UPDATE,
          message: `PC updated to 0x${branchTarget.toString(16)}`,
        });
      } else {
        // === Normal ID Stage ===
        if (current.IFID.valid && current.IFID.instruction) {
          const idInstr = current.IFID.instruction;
          
          // Read register values
          let rs1Value = idInstr.rs1 !== undefined ? readRegister(newState.architectural, idInstr.rs1) : 0;
          let rs2Value = idInstr.rs2 !== undefined ? readRegister(newState.architectural, idInstr.rs2) : 0;
          
          cycleEvents.push({
            cycle,
            type: EventType.DECODE,
            message: `ID: ${idInstr.type} rd=x${idInstr.rd ?? '-'} rs1=x${idInstr.rs1 ?? '-'}(${rs1Value}) rs2=x${idInstr.rs2 ?? '-'}(${rs2Value})`,
          });
          
          next.IDEX = {
            instruction: idInstr,
            pc: current.IFID.pc,
            rs1Value,
            rs2Value,
            rs1: idInstr.rs1 ?? null,
            rs2: idInstr.rs2 ?? null,
            rd: idInstr.rd ?? null,
            imm: idInstr.imm ?? null,
            valid: true,
            exCyclesRemaining: EX_LATENCY[idInstr.type],
          };
        }
        
        // === Normal IF Stage ===
        const instruction = getCurrentInstruction(newState.architectural);
        
        if (instruction) {
          cycleEvents.push({
            cycle,
            type: EventType.FETCH,
            message: `IF: Fetched ${instruction.text} at PC=0x${newState.architectural.pc.toString(16)}`,
          });
          
          next.IFID = {
            instruction,
            pc: newState.architectural.pc,
            valid: true,
          };
          
          newState.architectural.pc += WORD_SIZE;
        }
      }

    } catch (error) {
      if (error instanceof MemoryError) {
        newState.architectural.halted = true;
        newState.architectural.errorMessage = error.message;
        cycleEvents.push({
          cycle,
          type: EventType.ERROR,
          message: error.message,
        });
      } else {
        throw error;
      }
    }

    // Update pipeline registers
    if (!newState.architectural.halted) {
      newState.pipeline!.registers = next;
    }
    
    // Add cycle events
    newState.pipeline!.events.push(...cycleEvents);
    
    // Increment cycle counter
    newState.architectural.cycle++;
    
    // Check for program completion
    this.checkCompletion(newState);

    return newState;
  }

  /**
   * Detect hazards and determine if pipeline should stall
   */
  private detectHazards(
    current: PipelineRegisters,
    _state: MachineState
  ): { shouldStall: boolean; stallReason: StallReason } {
    let shouldStall = false;
    let stallReason = StallReason.NONE;

    // 1. Structural hazard: EX is busy with multi-cycle instruction
    if (current.IDEX.valid && current.IDEX.exCyclesRemaining > 1) {
      shouldStall = true;
      stallReason = StallReason.STRUCTURAL_EX_BUSY;
      return { shouldStall, stallReason };
    }

    // Get instruction that would enter EX (from ID stage)
    const idInstruction = current.IFID.instruction;
    if (!idInstruction) {
      return { shouldStall, stallReason };
    }

    // 2. Load-use hazard: instruction in EX is LD and ID needs its result
    if (current.IDEX.valid && current.IDEX.instruction?.type === InstructionType.LD) {
      const loadRd = current.IDEX.rd;
      if (loadRd !== null && loadRd !== 0) {
        const needsRs1 = idInstruction.rs1 !== undefined && idInstruction.rs1 === loadRd;
        const needsRs2 = idInstruction.rs2 !== undefined && idInstruction.rs2 === loadRd;
        
        if (needsRs1 || needsRs2) {
          shouldStall = true;
          stallReason = StallReason.LOAD_USE_HAZARD;
          return { shouldStall, stallReason };
        }
      }
    }

    return { shouldStall, stallReason };
  }

  /**
   * Check if program has completed
   */
  private checkCompletion(state: MachineState): void {
    const arch = state.architectural;
    const pipe = state.pipeline!.registers;
    
    // Check if PC is past last instruction AND pipeline is empty
    const pcPastEnd = arch.pc >= arch.instructions.length * WORD_SIZE;
    const pipelineEmpty = 
      !pipe.IFID.valid &&
      !pipe.IDEX.valid &&
      !pipe.EXMEM.valid &&
      !pipe.MEMWB.valid;
    
    if (pcPastEnd && pipelineEmpty) {
      arch.halted = true;
    }
  }

  /**
   * Get stall event type
   */
  private getStallEventType(reason: StallReason): EventType {
    switch (reason) {
      case StallReason.STRUCTURAL_EX_BUSY:
        return EventType.STALL_STRUCTURAL;
      case StallReason.LOAD_USE_HAZARD:
        return EventType.STALL_DATA;
      case StallReason.BRANCH_OPERAND:
        return EventType.STALL_BRANCH;
      default:
        return EventType.STALL_DATA;
    }
  }

  /**
   * Get stall message
   */
  private getStallMessage(reason: StallReason, current: PipelineRegisters): string {
    const exInstr = current.IDEX.instruction;
    switch (reason) {
      case StallReason.STRUCTURAL_EX_BUSY:
        return `Structural stall: EX busy with ${exInstr?.type} (${current.IDEX.exCyclesRemaining - 1} cycles remaining)`;
      case StallReason.LOAD_USE_HAZARD:
        return `Load-use hazard: waiting for LD x${current.IDEX.rd} to complete`;
      case StallReason.BRANCH_OPERAND:
        return `Branch operand stall: waiting for operand from ${exInstr?.type}`;
      default:
        return 'Stall';
    }
  }

  /**
   * Reset the simulator
   */
  reset(state: MachineState): MachineState {
    this.memoryReads = 0;
    this.memoryWrites = 0;
    
    return {
      ...state,
      architectural: {
        ...state.architectural,
        pc: 0,
        cycle: 0,
        halted: false,
        errorMessage: undefined,
        registers: {
          registers: new Array(32).fill(0),
        },
        memory: {
          data: new Map(),
        },
      },
      pipeline: createPipelineState(),
    };
  }

  /**
   * Check if execution is halted
   */
  isHalted(state: MachineState): boolean {
    return state.architectural.halted;
  }

  /**
   * Get trace entries for current cycle
   */
  getTrace(state: MachineState): TraceEntry[] {
    const traces: TraceEntry[] = [];
    const cycle = state.architectural.cycle;
    const regs = state.pipeline?.registers;

    if (!regs) return traces;

    // WB stage
    if (regs.MEMWB.valid && regs.MEMWB.instruction) {
      traces.push({
        cycle,
        instruction: regs.MEMWB.instruction,
        stage: 'WB',
        details: { result: regs.MEMWB.result, rd: regs.MEMWB.rd },
      });
    }

    // MEM stage
    if (regs.EXMEM.valid && regs.EXMEM.instruction) {
      traces.push({
        cycle,
        instruction: regs.EXMEM.instruction,
        stage: 'MEM',
        details: { aluResult: regs.EXMEM.aluResult },
      });
    }

    // EX stage
    if (regs.IDEX.valid && regs.IDEX.instruction) {
      traces.push({
        cycle,
        instruction: regs.IDEX.instruction,
        stage: 'EX',
        details: { 
          rs1: regs.IDEX.rs1Value, 
          rs2: regs.IDEX.rs2Value,
          cyclesRemaining: regs.IDEX.exCyclesRemaining,
        },
      });
    }

    // ID stage
    if (regs.IFID.valid && regs.IFID.instruction) {
      traces.push({
        cycle,
        instruction: regs.IFID.instruction,
        stage: 'ID',
        details: { pc: regs.IFID.pc },
      });
    }

    return traces;
  }

  /**
   * Get memory statistics
   */
  getMemoryStats(): { reads: number; writes: number } {
    return { reads: this.memoryReads, writes: this.memoryWrites };
  }
}
