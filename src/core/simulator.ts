/**
 * Main simulator engine
 * 
 * Orchestrates the execution of programs using different execution models
 */

import {
  MachineState,
  ExecutionMode,
  SimulatorConfig,
  DEFAULT_CONFIG,
  ExecutionTrace,
  TraceEntry,
} from './types';
import { parseProgram } from './instruction';
import { createMachineState } from './state';
import { ExecutionModel } from './execution/base';
import { PipelineExecutionModel } from './execution/pipeline';

/**
 * Main simulator class
 */
export class Simulator {
  private config: SimulatorConfig;
  private state: MachineState | null;
  private executionModel: ExecutionModel | null;
  private trace: TraceEntry[];

  constructor(config: Partial<SimulatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = null;
    this.executionModel = null;
    this.trace = [];
  }

  /**
   * Load a program from assembly source code
   */
  loadProgram(assembly: string): void {
    try {
      // Parse the assembly code
      const instructions = parseProgram(assembly);

      // Create initial machine state
      this.state = createMachineState(
        this.config.mode,
        instructions,
        this.config.tomasuloConfig
      );

      // Create execution model
      this.executionModel = this.createExecutionModel(this.config.mode);

      // Reset trace
      this.trace = [];
    } catch (error) {
      throw new Error(`Failed to load program: ${(error as Error).message}`);
    }
  }

  /**
   * Execute one clock cycle
   */
  step(): void {
    if (!this.state || !this.executionModel) {
      throw new Error('No program loaded');
    }

    if (this.executionModel.isHalted(this.state)) {
      return;
    }

    // Execute one cycle
    this.state = this.executionModel.step(this.state);

    // Collect trace
    const cycleTrace = this.executionModel.getTrace(this.state);
    this.trace.push(...cycleTrace);
  }

  /**
   * Execute until program completes or max cycles reached
   */
  run(maxCycles: number = 10000): void {
    if (!this.state || !this.executionModel) {
      throw new Error('No program loaded');
    }

    let cycles = 0;
    while (!this.executionModel.isHalted(this.state) && cycles < maxCycles) {
      this.step();
      cycles++;
    }

    if (cycles >= maxCycles) {
      console.warn('Reached maximum cycle limit');
    }
  }

  /**
   * Reset the simulator to initial state
   */
  reset(): void {
    if (!this.state || !this.executionModel) {
      throw new Error('No program loaded');
    }

    this.state = this.executionModel.reset(this.state);
    this.trace = [];
  }

  /**
   * Get current machine state
   */
  getState(): MachineState | null {
    return this.state;
  }

  /**
   * Get execution trace
   */
  getTrace(): ExecutionTrace {
    if (!this.state) {
      return {
        entries: [],
        statistics: {
          totalCycles: 0,
          instructionsExecuted: 0,
          stalls: 0,
          ipc: 0,
        },
      };
    }

    const totalCycles = this.state.architectural.cycle;
    const instructionsExecuted = this.trace.filter(
      (t) => t.stage === 'WB' || t.stage === 'MEM/WB'
    ).length;

    return {
      entries: [...this.trace],
      statistics: {
        totalCycles,
        instructionsExecuted,
        stalls: this.state.pipeline?.stalls ?? 0,
        ipc: totalCycles > 0 ? instructionsExecuted / totalCycles : 0,
      },
    };
  }

  /**
   * Check if execution is complete
   */
  isHalted(): boolean {
    if (!this.state || !this.executionModel) {
      return false;
    }
    return this.executionModel.isHalted(this.state);
  }

  /**
   * Get configuration
   */
  getConfig(): SimulatorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (requires reset)
   */
  setConfig(config: Partial<SimulatorConfig>): void {
    this.config = { ...this.config, ...config };
    
    // If mode changed and program is loaded, need to reload
    if (this.state) {
      const instructions = [...this.state.architectural.instructions];
      this.state = createMachineState(
        this.config.mode,
        instructions,
        this.config.tomasuloConfig
      );
      this.executionModel = this.createExecutionModel(this.config.mode);
      this.trace = [];
    }
  }

  /**
   * Create execution model based on mode
   */
  private createExecutionModel(mode: ExecutionMode): ExecutionModel {
    switch (mode) {
      case ExecutionMode.PIPELINE:
        return new PipelineExecutionModel();
      
      case ExecutionMode.TOMASULO:
      case ExecutionMode.TOMASULO_SPECULATION:
      case ExecutionMode.TOMASULO_BRANCH_PRED:
        // TODO: Implement Tomasulo models in later phases
        throw new Error(`Execution mode ${mode} not yet implemented`);
      
      default:
        throw new Error(`Unknown execution mode: ${mode}`);
    }
  }
}
