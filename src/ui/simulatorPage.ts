/**
 * Simulator page component (running page)
 */

import { Router } from './router';
import { CodeEditor } from './codeEditor';
import { Simulator } from '../core/simulator';
import { ExecutionMode } from '../core/types';

export class SimulatorPage {
  private router: Router;
  private simulator: Simulator;
  private codeEditor: CodeEditor | null;
  private isRunning: boolean;
  private runInterval: number | null;

  // UI Elements
  private loadProgramBtn!: HTMLButtonElement;
  private stepBtn!: HTMLButtonElement;
  private runBtn!: HTMLButtonElement;
  private resetBtn!: HTMLButtonElement;
  private modeSelect!: HTMLSelectElement;
  private statusText!: HTMLElement;
  private cycleCount!: HTMLElement;
  private registersDiv!: HTMLElement;
  private pipelineStagesDiv!: HTMLElement;
  private statInstructions!: HTMLElement;
  private statCycles!: HTMLElement;
  private statIPC!: HTMLElement;

  constructor(router: Router) {
    this.router = router;
    this.simulator = new Simulator();
    this.codeEditor = null;
    this.isRunning = false;
    this.runInterval = null;
  }

  render(container: HTMLElement): void {
    container.innerHTML = `
      <div class="simulator-page">
        <div class="simulator-layout">
          <!-- Left Panel: Editor -->
          <div class="editor-panel">
            <div class="panel">
              <div class="panel-header">
                <h2>Assembly Code</h2>
              </div>
              <div id="simulator-editor" class="editor-container editor-simulator"></div>
            </div>

            <div class="panel controls-panel">
              <div class="panel-header">
                <h2>Controls</h2>
              </div>
              
              <div class="controls">
                <button id="load-program-btn" class="btn btn-primary">Load</button>
                <button id="step-btn" class="btn">Step</button>
                <button id="run-btn" class="btn">Run</button>
                <button id="reset-btn" class="btn">Reset</button>
              </div>

              <div class="mode-selection">
                <label for="mode-select">Execution Mode:</label>
                <select id="mode-select">
                  <option value="PIPELINE" selected>5-Stage Pipeline</option>
                  <option value="TOMASULO" disabled>Tomasulo (Phase 2)</option>
                  <option value="TOMASULO_SPECULATION" disabled>Tomasulo + Speculation (Phase 3)</option>
                  <option value="TOMASULO_BRANCH_PRED" disabled>Tomasulo + Branch Pred (Phase 4)</option>
                </select>
              </div>

              <div class="stats-compact">
                <div class="stat-row">
                  <span class="stat-label">Cycle:</span>
                  <span id="stat-cycles" class="stat-value">0</span>
                </div>
                <div class="stat-row">
                  <span class="stat-label">Instructions:</span>
                  <span id="stat-instructions" class="stat-value">0</span>
                </div>
                <div class="stat-row">
                  <span class="stat-label">IPC:</span>
                  <span id="stat-ipc" class="stat-value">0.00</span>
                </div>
              </div>

              <div id="status" class="status">
                <span class="status-label">Status:</span>
                <span id="status-text">Ready</span>
              </div>
            </div>
          </div>

          <!-- Right Panel: Visualization -->
          <div class="visualization-panel">
            <div class="panel">
              <div class="panel-header">
                <h2>Machine State</h2>
              </div>
              
              <div class="state-section">
                <h3>Pipeline Stages</h3>
                <div id="pipeline-stages" class="pipeline-visualization"></div>
              </div>

              <div class="state-section">
                <h3>Registers</h3>
                <div id="registers" class="registers-grid-compact"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Get UI elements
    this.loadProgramBtn = document.getElementById('load-program-btn') as HTMLButtonElement;
    this.stepBtn = document.getElementById('step-btn') as HTMLButtonElement;
    this.runBtn = document.getElementById('run-btn') as HTMLButtonElement;
    this.resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
    this.modeSelect = document.getElementById('mode-select') as HTMLSelectElement;
    this.statusText = document.getElementById('status-text') as HTMLElement;
    this.cycleCount = document.getElementById('cycle-count') as HTMLElement;
    this.registersDiv = document.getElementById('registers') as HTMLElement;
    this.pipelineStagesDiv = document.getElementById('pipeline-stages') as HTMLElement;
    this.statInstructions = document.getElementById('stat-instructions') as HTMLElement;
    this.statCycles = document.getElementById('stat-cycles') as HTMLElement;
    this.statIPC = document.getElementById('stat-ipc') as HTMLElement;

    // Initialize code editor
    const savedCode = localStorage.getItem('assemblyCode') || this.getDefaultCode();
    this.codeEditor = new CodeEditor('simulator-editor', savedCode);

    // Load program automatically
    this.loadProgram(savedCode);

    // Setup event listeners
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.loadProgramBtn.addEventListener('click', () => this.handleLoadProgram());
    this.stepBtn.addEventListener('click', () => this.step());
    this.runBtn.addEventListener('click', () => this.toggleRun());
    this.resetBtn.addEventListener('click', () => this.reset());
    this.modeSelect.addEventListener('change', () => this.changeMode());
  }

  private handleLoadProgram(): void {
    const code = this.codeEditor?.getValue() || '';
    localStorage.setItem('assemblyCode', code);
    this.loadProgram(code);
  }

  private loadProgram(assembly: string): void {
    try {
      this.simulator.setConfig({
        mode: this.modeSelect.value as ExecutionMode,
      });

      this.simulator.loadProgram(assembly);
      
      this.setStatus('Program loaded', 'success');
      this.updateUI();
    } catch (error) {
      this.setStatus(`Error: ${(error as Error).message}`, 'error');
      console.error(error);
    }
  }

  private step(): void {
    try {
      if (this.simulator.isHalted()) {
        this.setStatus('Program completed', 'success');
        return;
      }

      this.simulator.step();
      this.updateUI();

      if (this.simulator.isHalted()) {
        this.setStatus('Program completed', 'success');
        this.stopRunning();
      } else {
        this.setStatus('Running...', 'running');
      }
    } catch (error) {
      this.setStatus(`Error: ${(error as Error).message}`, 'error');
      this.stopRunning();
      console.error(error);
    }
  }

  private toggleRun(): void {
    if (this.isRunning) {
      this.stopRunning();
    } else {
      this.startRunning();
    }
  }

  private startRunning(): void {
    this.isRunning = true;
    this.runBtn.textContent = 'Pause';
    this.stepBtn.disabled = true;
    this.modeSelect.disabled = true;

    this.runInterval = window.setInterval(() => {
      this.step();
    }, 100);
  }

  private stopRunning(): void {
    this.isRunning = false;
    this.runBtn.textContent = 'Run';
    this.stepBtn.disabled = false;
    this.modeSelect.disabled = false;

    if (this.runInterval !== null) {
      clearInterval(this.runInterval);
      this.runInterval = null;
    }
  }

  private reset(): void {
    try {
      this.stopRunning();
      this.simulator.reset();
      this.setStatus('Reset', 'success');
      if (this.codeEditor) {
        this.codeEditor.highlightLine(null);
      }
      this.updateUI();
    } catch (error) {
      this.setStatus(`Error: ${(error as Error).message}`, 'error');
      console.error(error);
    }
  }

  private changeMode(): void {
    this.setStatus('Mode changed - resetting simulator', 'info');
    const assembly = this.codeEditor?.getValue() || '';
    this.loadProgram(assembly);
  }

  private updateUI(): void {
    const state = this.simulator.getState();
    
    if (!state) {
      this.clearUI();
      return;
    }

    // Update statistics
    const trace = this.simulator.getTrace();
    this.statInstructions.textContent = trace.statistics.instructionsExecuted.toString();
    this.statCycles.textContent = trace.statistics.totalCycles.toString();
    this.statIPC.textContent = trace.statistics.ipc.toFixed(2);

    // Highlight current line in editor
    this.updateCurrentLine();

    // Update registers
    this.updateRegisters(state.architectural.registers.registers);

    // Update pipeline stages
    this.updatePipelineStages();
  }

  private updateCurrentLine(): void {
    const state = this.simulator.getState();
    if (!state) return;

    const trace = this.simulator.getTrace();
    const currentCycle = state.architectural.cycle;
    
    // Get most recent instruction in pipeline
    const currentTraces = trace.entries.filter(t => t.cycle === currentCycle);
    if (currentTraces.length > 0 && currentTraces[0].instruction.lineNumber) {
      this.codeEditor?.highlightLine(currentTraces[0].instruction.lineNumber);
    }
  }

  private updateRegisters(registers: number[]): void {
    this.registersDiv.innerHTML = '';
    
    for (let i = 0; i < 32; i++) {
      const regDiv = document.createElement('div');
      regDiv.className = 'register-compact';
      
      const content = `<span class="reg-name">x${i}</span><span class="reg-value">${registers[i]}</span>`;
      regDiv.innerHTML = content;
      
      if (i !== 0 && registers[i] !== 0) {
        regDiv.classList.add('register-active');
      }
      
      this.registersDiv.appendChild(regDiv);
    }
  }

  private updatePipelineStages(): void {
    const trace = this.simulator.getTrace();
    const currentCycle = this.simulator.getState()?.architectural.cycle ?? 0;
    
    const currentTraces = trace.entries.filter(t => t.cycle === currentCycle);
    
    const stageMap = new Map<string, string>();
    for (const t of currentTraces) {
      stageMap.set(t.stage, t.instruction.text);
    }

    const stages = ['IF', 'ID', 'EX', 'MEM', 'WB'];
    this.pipelineStagesDiv.innerHTML = '';

    for (const stage of stages) {
      const stageDiv = document.createElement('div');
      stageDiv.className = 'pipeline-stage';
      
      const nameDiv = document.createElement('div');
      nameDiv.className = 'stage-name';
      nameDiv.textContent = stage;
      
      const instrDiv = document.createElement('div');
      
      if (stageMap.has(stage) || stageMap.has('MEM/WB') && (stage === 'MEM' || stage === 'WB')) {
        instrDiv.className = 'stage-instruction';
        instrDiv.textContent = stageMap.get(stage) ?? stageMap.get('MEM/WB') ?? '';
      } else {
        instrDiv.className = 'stage-empty';
        instrDiv.textContent = 'bubble';
      }
      
      stageDiv.appendChild(nameDiv);
      stageDiv.appendChild(instrDiv);
      this.pipelineStagesDiv.appendChild(stageDiv);
    }
  }

  private clearUI(): void {
    this.registersDiv.innerHTML = '<div class="stage-empty">No program loaded</div>';
    this.pipelineStagesDiv.innerHTML = '<div class="stage-empty">No program loaded</div>';
    this.statInstructions.textContent = '0';
    this.statCycles.textContent = '0';
    this.statIPC.textContent = '0.00';
  }

  private setStatus(message: string, type: 'success' | 'error' | 'running' | 'info'): void {
    this.statusText.textContent = message;
    
    this.statusText.classList.remove('status-success', 'status-error', 'status-running', 'status-info');
    this.statusText.classList.add(`status-${type}`);
  }

  private getDefaultCode(): string {
    return `# Simple addition example
ADDI x1, x0, 5
ADDI x2, x0, 10
ADD x3, x1, x2`;
  }

  destroy(): void {
    this.stopRunning();
    this.codeEditor = null;
  }
}
