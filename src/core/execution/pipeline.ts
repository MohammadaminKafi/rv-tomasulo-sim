/**
 * Classic 5-stage RISC-V pipeline execution model
 * 
 * Stages: IF -> ID -> EX -> MEM -> WB
 */

import { ExecutionModel } from './base';
import {
  MachineState,
  PipelineStage,
  Instruction,
  InstructionType,
  TraceEntry,
} from '../types';
import {
  getCurrentInstruction,
  readRegister,
  writeRegister,
  readMemory,
  writeMemory,
} from '../state';

/**
 * Pipeline registers between stages
 */
interface PipelineRegisters {
  IFID: {
    instruction: Instruction | null;
    pc: number;
  };
  IDEX: {
    instruction: Instruction | null;
    rs1Value: number;
    rs2Value: number;
    rd: number | null;
    imm: number | null;
    pc: number;
  };
  EXMEM: {
    instruction: Instruction | null;
    aluResult: number;
    rs2Value: number;
    rd: number | null;
    pc: number;
  };
  MEMWB: {
    instruction: Instruction | null;
    result: number;
    rd: number | null;
    pc: number;
  };
}

/**
 * 5-stage pipeline implementation
 */
export class PipelineExecutionModel implements ExecutionModel {
  private registers: PipelineRegisters;
  private shouldStall: boolean;
  private shouldFlush: boolean;

  constructor() {
    this.registers = this.createEmptyRegisters();
    this.shouldStall = false;
    this.shouldFlush = false;
  }

  private createEmptyRegisters(): PipelineRegisters {
    return {
      IFID: { instruction: null, pc: 0 },
      IDEX: { instruction: null, rs1Value: 0, rs2Value: 0, rd: null, imm: null, pc: 0 },
      EXMEM: { instruction: null, aluResult: 0, rs2Value: 0, rd: null, pc: 0 },
      MEMWB: { instruction: null, result: 0, rd: null, pc: 0 },
    };
  }

  step(state: MachineState): MachineState {
    if (!state.pipeline) {
      throw new Error('Pipeline state not initialized');
    }

    const newState = { ...state };
    newState.architectural = { ...state.architectural };
    newState.pipeline = { ...state.pipeline };

    // Execute stages in reverse order to avoid conflicts
    this.writeBack(newState);
    this.memoryAccess(newState);
    this.execute(newState);
    this.decode(newState);
    this.fetch(newState);

    // Update cycle counter
    newState.architectural.cycle++;

    return newState;
  }

  private fetch(state: MachineState): void {
    if (this.shouldStall || this.shouldFlush) {
      this.registers.IFID = { instruction: null, pc: state.architectural.pc };
      return;
    }

    const instruction = getCurrentInstruction(state.architectural);
    
    if (instruction) {
      this.registers.IFID = {
        instruction,
        pc: state.architectural.pc,
      };
      state.architectural.pc += 4;
    } else {
      this.registers.IFID = { instruction: null, pc: state.architectural.pc };
      if (this.isPipelineEmpty()) {
        state.architectural.halted = true;
      }
    }
  }

  private decode(state: MachineState): void {
    const ifid = this.registers.IFID;
    
    if (!ifid.instruction) {
      this.registers.IDEX = {
        instruction: null,
        rs1Value: 0,
        rs2Value: 0,
        rd: null,
        imm: null,
        pc: ifid.pc,
      };
      return;
    }

    const instr = ifid.instruction;
    
    // Read source registers
    const rs1Value = instr.rs1 !== undefined ? readRegister(state.architectural, instr.rs1) : 0;
    const rs2Value = instr.rs2 !== undefined ? readRegister(state.architectural, instr.rs2) : 0;

    this.registers.IDEX = {
      instruction: instr,
      rs1Value,
      rs2Value,
      rd: instr.rd ?? null,
      imm: instr.imm ?? null,
      pc: ifid.pc,
    };

    // Check for branches (simplified - no branch prediction)
    if (instr.type === InstructionType.BEQ || instr.type === InstructionType.BNE || instr.type === InstructionType.J) {
      this.shouldFlush = true;
    }
  }

  private execute(state: MachineState): void {
    const idex = this.registers.IDEX;
    
    if (!idex.instruction) {
      this.registers.EXMEM = {
        instruction: null,
        aluResult: 0,
        rs2Value: 0,
        rd: null,
        pc: idex.pc,
      };
      return;
    }

    const instr = idex.instruction;
    let aluResult = 0;

    // Execute based on instruction type
    switch (instr.type) {
      case InstructionType.ADD:
        aluResult = idex.rs1Value + idex.rs2Value;
        break;
      case InstructionType.SUB:
        aluResult = idex.rs1Value - idex.rs2Value;
        break;
      case InstructionType.MUL:
        aluResult = idex.rs1Value * idex.rs2Value;
        break;
      case InstructionType.DIV:
        aluResult = idex.rs2Value !== 0 ? Math.floor(idex.rs1Value / idex.rs2Value) : 0;
        break;
      case InstructionType.AND:
        aluResult = idex.rs1Value & idex.rs2Value;
        break;
      case InstructionType.OR:
        aluResult = idex.rs1Value | idex.rs2Value;
        break;
      case InstructionType.XOR:
        aluResult = idex.rs1Value ^ idex.rs2Value;
        break;
      case InstructionType.ADDI:
        aluResult = idex.rs1Value + (idex.imm ?? 0);
        break;
      case InstructionType.LD:
      case InstructionType.ST:
        aluResult = idex.rs1Value + (idex.imm ?? 0);
        break;
      case InstructionType.BEQ:
        if (idex.rs1Value === idex.rs2Value) {
          state.architectural.pc = idex.imm ?? 0;
        }
        break;
      case InstructionType.BNE:
        if (idex.rs1Value !== idex.rs2Value) {
          state.architectural.pc = idex.imm ?? 0;
        }
        break;
      case InstructionType.J:
        state.architectural.pc = idex.imm ?? 0;
        break;
    }

    this.registers.EXMEM = {
      instruction: instr,
      aluResult,
      rs2Value: idex.rs2Value,
      rd: idex.rd,
      pc: idex.pc,
    };
  }

  private memoryAccess(state: MachineState): void {
    const exmem = this.registers.EXMEM;
    
    if (!exmem.instruction) {
      this.registers.MEMWB = {
        instruction: null,
        result: 0,
        rd: null,
        pc: exmem.pc,
      };
      return;
    }

    const instr = exmem.instruction;
    let result = exmem.aluResult;

    // Handle memory operations
    if (instr.type === InstructionType.LD) {
      result = readMemory(state.architectural, exmem.aluResult);
    } else if (instr.type === InstructionType.ST) {
      writeMemory(state.architectural, exmem.aluResult, exmem.rs2Value);
    }

    this.registers.MEMWB = {
      instruction: instr,
      result,
      rd: exmem.rd,
      pc: exmem.pc,
    };
  }

  private writeBack(state: MachineState): void {
    const memwb = this.registers.MEMWB;
    
    if (!memwb.instruction || memwb.rd === null) {
      return;
    }

    const instr = memwb.instruction;

    // Write result to destination register
    if (
      instr.type !== InstructionType.ST &&
      instr.type !== InstructionType.BEQ &&
      instr.type !== InstructionType.BNE &&
      instr.type !== InstructionType.J &&
      instr.type !== InstructionType.NOP
    ) {
      writeRegister(state.architectural, memwb.rd, memwb.result);
    }
  }

  private isPipelineEmpty(): boolean {
    return (
      this.registers.IFID.instruction === null &&
      this.registers.IDEX.instruction === null &&
      this.registers.EXMEM.instruction === null &&
      this.registers.MEMWB.instruction === null
    );
  }

  reset(state: MachineState): MachineState {
    this.registers = this.createEmptyRegisters();
    this.shouldStall = false;
    this.shouldFlush = false;
    
    return {
      ...state,
      architectural: {
        ...state.architectural,
        pc: 0,
        cycle: 0,
        halted: false,
        registers: {
          registers: new Array(32).fill(0), // Reset all registers to 0
        },
        memory: {
          data: new Map(), // Clear memory
        },
      },
    };
  }

  isHalted(state: MachineState): boolean {
    return state.architectural.halted;
  }

  getTrace(state: MachineState): TraceEntry[] {
    const traces: TraceEntry[] = [];
    const cycle = state.architectural.cycle;

    // Add trace for each active stage
    if (this.registers.IFID.instruction) {
      traces.push({
        cycle,
        instruction: this.registers.IFID.instruction,
        stage: 'IF',
        details: { pc: this.registers.IFID.pc },
      });
    }

    if (this.registers.IDEX.instruction) {
      traces.push({
        cycle,
        instruction: this.registers.IDEX.instruction,
        stage: 'ID',
        details: {
          rs1: this.registers.IDEX.rs1Value,
          rs2: this.registers.IDEX.rs2Value,
        },
      });
    }

    if (this.registers.EXMEM.instruction) {
      traces.push({
        cycle,
        instruction: this.registers.EXMEM.instruction,
        stage: 'EX',
        details: { result: this.registers.EXMEM.aluResult },
      });
    }

    if (this.registers.MEMWB.instruction) {
      traces.push({
        cycle,
        instruction: this.registers.MEMWB.instruction,
        stage: 'MEM/WB',
        details: { result: this.registers.MEMWB.result },
      });
    }

    return traces;
  }
}
