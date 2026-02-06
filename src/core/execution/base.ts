/**
 * Base execution model interface
 * 
 * All execution models (pipeline, Tomasulo, etc.) implement this interface
 */

import { MachineState, TraceEntry } from '../types';

/**
 * Base interface for all execution models
 */
export interface ExecutionModel {
  /**
   * Execute one clock cycle
   * Returns the updated machine state
   */
  step(state: MachineState): MachineState;

  /**
   * Reset the execution model to initial state
   */
  reset(state: MachineState): MachineState;

  /**
   * Check if execution is complete
   */
  isHalted(state: MachineState): boolean;

  /**
   * Get trace entry for current cycle (for visualization)
   */
  getTrace(state: MachineState): TraceEntry[];
}

/**
 * Factory function type for creating execution models
 */
export type ExecutionModelFactory = () => ExecutionModel;
