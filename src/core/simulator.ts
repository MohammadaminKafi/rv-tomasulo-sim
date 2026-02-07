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
  RuntimeConfig,
  DEFAULT_RUNTIME_CONFIG,
} from './types';
import { parseProgram } from './instruction';
import { createMachineState } from './state';
import { ExecutionModel } from './execution/base';
import { PipelineExecutionModel } from './execution/pipeline';
import { TomasuloExecutionModel } from './execution/tomasulo';
import { SpeculationExecutionModel } from './execution/speculation';

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
        this.config.tomasuloConfig,
        this.config.speculationConfig
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
        events: [],
        statistics: {
          totalCycles: 0,
          instructionsCompleted: 0,
          stallCycles: 0,
          flushCount: 0,
          forwardingEvents: 0,
          memoryReads: 0,
          memoryWrites: 0,
          ipc: 0,
        },
      };
    }

    const totalCycles = this.state.architectural.cycle;
    
    // Handle Pipeline mode stats
    if (this.state.pipeline) {
      const pipeline = this.state.pipeline;
      const instructionsCompleted = pipeline.instructionsCompleted;
      const stallCycles = pipeline.stallCycles;
      const flushCount = pipeline.flushCount;
      const forwardingEvents = pipeline.forwardingEvents;
      
      // Get memory stats from execution model if available
      let memoryReads = 0;
      let memoryWrites = 0;
      if (this.executionModel && 'getMemoryStats' in this.executionModel) {
        const stats = (this.executionModel as { getMemoryStats(): { reads: number; writes: number } }).getMemoryStats();
        memoryReads = stats.reads;
        memoryWrites = stats.writes;
      }

      return {
        entries: [...this.trace],
        events: pipeline.events,
        statistics: {
          totalCycles,
          instructionsCompleted,
          stallCycles,
          flushCount,
          forwardingEvents,
          memoryReads,
          memoryWrites,
          ipc: totalCycles > 0 ? instructionsCompleted / totalCycles : 0,
        },
      };
    }
    
    // Handle Tomasulo mode stats
    if (this.state.tomasulo) {
      const tomasulo = this.state.tomasulo;
      const instructionsCompleted = tomasulo.instructionStatus.filter(
        s => s.writeResultCycle !== null
      ).length;
      
      return {
        entries: [...this.trace],
        events: [],
        statistics: {
          totalCycles,
          instructionsCompleted,
          stallCycles: tomasulo.issueStalls,
          flushCount: 0,
          forwardingEvents: tomasulo.cdbBroadcasts,
          memoryReads: tomasulo.memoryReads,
          memoryWrites: tomasulo.memoryWrites,
          ipc: totalCycles > 0 ? instructionsCompleted / totalCycles : 0,
        },
      };
    }

    // Handle Speculation mode stats
    if (this.state.speculation) {
      const speculation = this.state.speculation;
      const instructionsCompleted = speculation.instructionsCommitted;
      
      return {
        entries: [...this.trace],
        events: [],
        statistics: {
          totalCycles,
          instructionsCompleted,
          stallCycles: speculation.issueStalls,
          flushCount: speculation.mispredictCount,
          forwardingEvents: speculation.cdbBroadcasts,
          memoryReads: speculation.memoryReads,
          memoryWrites: speculation.memoryWrites,
          ipc: totalCycles > 0 ? instructionsCompleted / totalCycles : 0,
        },
      };
    }

    return {
      entries: [...this.trace],
      events: [],
      statistics: {
        totalCycles,
        instructionsCompleted: 0,
        stallCycles: 0,
        flushCount: 0,
        forwardingEvents: 0,
        memoryReads: 0,
        memoryWrites: 0,
        ipc: 0,
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
        this.config.tomasuloConfig,
        this.config.speculationConfig
      );
      this.executionModel = this.createExecutionModel(this.config.mode);
      this.trace = [];
    }
  }

  /**
   * Create execution model based on mode
   */
  private createExecutionModel(mode: ExecutionMode): ExecutionModel {
    const runtimeConfig = this.config.runtimeConfig || DEFAULT_RUNTIME_CONFIG;
    
    switch (mode) {
      case ExecutionMode.PIPELINE:
        const forwardingEnabled = this.config.pipelineConfig?.dataForwarding ?? true;
        return new PipelineExecutionModel(forwardingEnabled, runtimeConfig);
      
      case ExecutionMode.TOMASULO:
        return new TomasuloExecutionModel(this.config.tomasuloConfig, runtimeConfig);
      
      case ExecutionMode.TOMASULO_SPECULATION:
        return new SpeculationExecutionModel(this.config.speculationConfig, runtimeConfig);
      
      case ExecutionMode.TOMASULO_BRANCH_PRED:
        // Phase 4: Branch prediction will build on speculation
        return new SpeculationExecutionModel(this.config.speculationConfig, runtimeConfig);
      
      default:
        throw new Error(`Unknown execution mode: ${mode}`);
    }
  }
}
