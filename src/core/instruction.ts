/**
 * Instruction parser for RISC-V assembly language
 */

import { Instruction, InstructionType } from './types';

/**
 * Parse a register name (x0-x31) to its number
 */
function parseRegister(reg: string): number {
  const match = reg.match(/^x(\d+)$/i);
  if (!match) {
    throw new Error(`Invalid register: ${reg}`);
  }
  const num = parseInt(match[1], 10);
  if (num < 0 || num > 31) {
    throw new Error(`Register out of range: ${reg}`);
  }
  return num;
}

/**
 * Parse an immediate value (decimal or hex)
 */
function parseImmediate(imm: string): number {
  imm = imm.trim();
  if (imm.startsWith('0x') || imm.startsWith('0X')) {
    return parseInt(imm, 16);
  }
  return parseInt(imm, 10);
}

/**
 * Parse memory operand like 0(x1) or offset(base)
 */
function parseMemoryOperand(operand: string): { offset: number; base: number } {
  const match = operand.match(/^(-?\d+)\((\w+)\)$/);
  if (!match) {
    throw new Error(`Invalid memory operand: ${operand}`);
  }
  return {
    offset: parseImmediate(match[1]),
    base: parseRegister(match[2]),
  };
}

/**
 * Parse a single line of assembly code
 */
export function parseInstruction(line: string, address: number, labels: Map<string, number>, lineNumber?: number): Instruction | null {
  // Remove comments and trim
  const commentIndex = line.indexOf('#');
  if (commentIndex !== -1) {
    line = line.substring(0, commentIndex);
  }
  line = line.trim();

  // Skip empty lines
  if (line.length === 0) {
    return null;
  }

  // Skip labels (they're handled separately)
  if (line.endsWith(':')) {
    return null;
  }

  // Split into tokens
  const tokens = line.split(/[\s,]+/).filter(t => t.length > 0);
  if (tokens.length === 0) {
    return null;
  }

  const opcode = tokens[0].toUpperCase();
  const text = line;

  try {
    switch (opcode) {
      // R-type: op rd, rs1, rs2
      case 'ADD':
      case 'SUB':
      case 'MUL':
      case 'DIV':
      case 'AND':
      case 'OR':
      case 'XOR':
        if (tokens.length !== 4) {
          throw new Error(`${opcode} requires 3 operands`);
        }
        return {
          type: InstructionType[opcode as keyof typeof InstructionType],
          rd: parseRegister(tokens[1]),
          rs1: parseRegister(tokens[2]),
          rs2: parseRegister(tokens[3]),
          address,
          text,
          lineNumber,
        };

      // I-type: op rd, rs1, imm
      case 'ADDI':
      case 'SUBI':
      case 'MULI':
      case 'DIVI':
        if (tokens.length !== 4) {
          throw new Error(`${opcode} requires 3 operands`);
        }
        return {
          type: InstructionType[opcode as keyof typeof InstructionType],
          rd: parseRegister(tokens[1]),
          rs1: parseRegister(tokens[2]),
          imm: parseImmediate(tokens[3]),
          address,
          text,
          lineNumber,
        };

      // Load: ld rd, offset(rs1)
      case 'LD':
        if (tokens.length !== 3) {
          throw new Error(`${opcode} requires 2 operands`);
        }
        {
          const { offset, base } = parseMemoryOperand(tokens[2]);
          return {
            type: InstructionType.LD,
            rd: parseRegister(tokens[1]),
            rs1: base,
            imm: offset,
            address,
            text,
            lineNumber,
          };
        }

      // Store: st rs2, offset(rs1)
      case 'ST':
        if (tokens.length !== 3) {
          throw new Error(`${opcode} requires 2 operands`);
        }
        {
          const { offset, base } = parseMemoryOperand(tokens[2]);
          return {
            type: InstructionType.ST,
            rs1: base,
            rs2: parseRegister(tokens[1]),
            imm: offset,
            address,
            text,
            lineNumber,
          };
        }

      // Branch: beq rs1, rs2, label
      case 'BEQ':
      case 'BNE':
        if (tokens.length !== 4) {
          throw new Error(`${opcode} requires 3 operands`);
        }
        return {
          type: InstructionType[opcode as keyof typeof InstructionType],
          rs1: parseRegister(tokens[1]),
          rs2: parseRegister(tokens[2]),
          label: tokens[3],
          address,
          text,
          lineNumber,
        };

      // Jump: j label
      case 'J':
        if (tokens.length !== 2) {
          throw new Error(`${opcode} requires 1 operand`);
        }
        return {
          type: InstructionType.J,
          label: tokens[1],
          address,
          text,
          lineNumber,
        };

      // No-op
      case 'NOP':
        return {
          type: InstructionType.NOP,
          address,
          text,
          lineNumber,
        };

      default:
        throw new Error(`Unknown instruction: ${opcode}`);
    }
  } catch (error) {
    throw new Error(`Error parsing "${text}": ${(error as Error).message}`);
  }
}

/**
 * Parse a complete assembly program
 */
export function parseProgram(assembly: string): Instruction[] {
  const lines = assembly.split('\n');
  const instructions: Instruction[] = [];
  const labels = new Map<string, number>();

  // First pass: collect labels
  let address = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    // Check for label
    if (trimmed.endsWith(':')) {
      const labelName = trimmed.substring(0, trimmed.length - 1).trim();
      labels.set(labelName, address * 4); // Word-aligned addresses
    } else {
      address++;
    }
  }

  // Second pass: parse instructions
  address = 0;
  for (let i = 0; i < lines.length; i++) {
    const instruction = parseInstruction(lines[i], address * 4, labels, i + 1);
    if (instruction !== null) {
      instructions.push(instruction);
      address++;
    }
  }

  // Third pass: resolve labels to PC-relative offsets
  for (const instr of instructions) {
    if (instr.label) {
      const targetAddress = labels.get(instr.label);
      if (targetAddress === undefined) {
        throw new Error(`Undefined label: ${instr.label}`);
      }
      // Store as absolute address for simplicity (will be resolved during execution)
      instr.imm = targetAddress;
    }
  }

  return instructions;
}

/**
 * Utility to get functional unit type required for an instruction
 */
export function getFunctionalUnitType(type: InstructionType): string {
  switch (type) {
    case InstructionType.ADD:
    case InstructionType.SUB:
    case InstructionType.ADDI:
    case InstructionType.AND:
    case InstructionType.OR:
    case InstructionType.XOR:
      return 'INTEGER';
    case InstructionType.MUL:
      return 'MULTIPLY';
    case InstructionType.DIV:
      return 'DIVIDE';
    case InstructionType.LD:
      return 'LOAD';
    case InstructionType.ST:
      return 'STORE';
    case InstructionType.BEQ:
    case InstructionType.BNE:
    case InstructionType.J:
      return 'BRANCH';
    default:
      return 'INTEGER';
  }
}
