/**
 * Simulator page component (running page)
 */

import { Router } from './router';
import { CodeEditor } from './codeEditor';
import { Simulator } from '../core/simulator';
import { 
  ExecutionMode, 
  PipelineEvent, 
  EventType,
  TomasuloEventType,
  RSState,
  RSType,
  SpeculationEventType,
  ROBState,
  ROBEntry,
  SpeculationRS,
} from '../core/types';

export class SimulatorPage {
  private simulator: Simulator;
  private codeEditor: CodeEditor | null;
  private isRunning: boolean;
  private runInterval: number | null;
  private runSpeed: number = 200; // ms between steps

  // UI Elements
  private loadProgramBtn!: HTMLButtonElement;
  private stepBtn!: HTMLButtonElement;
  private runBtn!: HTMLButtonElement;
  private resetBtn!: HTMLButtonElement;
  private runNCyclesBtn!: HTMLButtonElement;
  private runToEndBtn!: HTMLButtonElement;
  private modeSelect!: HTMLSelectElement;
  private speedSlider!: HTMLInputElement;
  private statusText!: HTMLElement;
  private registersDiv!: HTMLElement;
  private pipelineStagesDiv!: HTMLElement;
  private pipelineRegistersDiv!: HTMLElement;
  private eventLogDiv!: HTMLElement;
  private memoryDiv!: HTMLElement;
  private statsDiv!: HTMLElement;
  private pcDisplay!: HTMLElement;
  private cycleDisplay!: HTMLElement;
  
  // Tomasulo UI Elements
  private pipelineContent!: HTMLElement;
  private tomasuloContent!: HTMLElement;
  private middlePanelTitle!: HTMLElement;
  private cdbStatusDiv!: HTMLElement;
  private instructionStatusDiv!: HTMLElement;
  private rsDisplayDiv!: HTMLElement;
  private ratDisplayDiv!: HTMLElement;

  // Speculation UI Elements
  private speculationContent!: HTMLElement;
  private robDisplayDiv!: HTMLElement;
  private specCdbStatusDiv!: HTMLElement;
  private specInstructionStatusDiv!: HTMLElement;
  private specRsDisplayDiv!: HTMLElement;
  private specRatDisplayDiv!: HTMLElement;
  private branchPredictionDiv!: HTMLElement;
  private specEventLogDiv!: HTMLElement;
  private nonSpecEventLogSection!: HTMLElement;

  constructor(_router: Router) {
    this.simulator = new Simulator();
    this.codeEditor = null;
    this.isRunning = false;
    this.runInterval = null;
  }

  render(container: HTMLElement): void {
    container.innerHTML = `
      <div class="simulator-page">
        <div class="simulator-layout-new">
          <!-- Left Column: Editor + Controls -->
          <div class="sim-left-column">
            <div class="panel editor-panel-new">
              <div class="panel-header">
                <h2>Assembly Code</h2>
              </div>
              <div id="simulator-editor" class="editor-container editor-simulator"></div>
            </div>

            <div class="panel controls-panel-new">
              <div class="panel-header">
                <h2>Controls</h2>
              </div>
              
              <div class="controls-grid">
                <button id="load-program-btn" class="btn btn-primary">Load/Assemble</button>
                <button id="reset-btn" class="btn">Reset</button>
                <button id="step-btn" class="btn btn-accent">Step</button>
                <button id="run-btn" class="btn">Run</button>
                <button id="run-n-cycles-btn" class="btn">Run 10 Cycles</button>
                <button id="run-to-end-btn" class="btn">Run to End</button>
              </div>

              <div class="speed-control">
                <label for="speed-slider">Speed:</label>
                <input type="range" id="speed-slider" min="10" max="500" value="200" />
                <span id="speed-display">200ms</span>
              </div>

              <div class="mode-selection">
                <label for="mode-select">Mode:</label>
                <select id="mode-select">
                  <option value="PIPELINE" selected>5-Stage Pipeline</option>
                  <option value="TOMASULO">Tomasulo Algorithm</option>
                  <option value="TOMASULO_SPECULATION">Tomasulo + Speculation</option>
                </select>
              </div>

              <div id="status" class="status-bar">
                <span class="status-label">Status:</span>
                <span id="status-text" class="status-text">Ready</span>
              </div>
            </div>
          </div>

          <!-- Middle Column: Execution State Visualization -->
          <div class="sim-middle-column">
            <div class="panel">
              <div class="panel-header">
                <h2 id="middle-panel-title">Pipeline State</h2>
                <div class="cycle-pc-display">
                  <span>Cycle: <strong id="cycle-display">0</strong></span>
                  <span>PC: <strong id="pc-display">0x0</strong></span>
                </div>
              </div>
              
              <!-- Pipeline Mode Content -->
              <div id="pipeline-content">
                <div class="state-section">
                  <h3>Stage Occupancy</h3>
                  <div id="pipeline-stages" class="pipeline-stages-grid"></div>
                </div>

                <div class="state-section">
                  <h3>Pipeline Registers</h3>
                  <div id="pipeline-registers" class="pipeline-registers-grid"></div>
                </div>
              </div>
              
              <!-- Tomasulo Mode Content -->
              <div id="tomasulo-content" class="hidden">
                <div class="state-section">
                  <h3>CDB Status</h3>
                  <div id="cdb-status" class="cdb-status-display"></div>
                </div>
                
                <div class="state-section">
                  <h3>Instruction Status</h3>
                  <div id="instruction-status" class="instruction-status-table"></div>
                </div>
                
                <div class="state-section">
                  <h3>Reservation Stations</h3>
                  <div id="reservation-stations" class="rs-display"></div>
                </div>
                
                <div class="state-section">
                  <h3>RAT (Register Alias Table)</h3>
                  <div id="rat-display" class="rat-display"></div>
                </div>
              </div>

              <!-- Speculation Mode Content -->
              <div id="speculation-content" class="hidden">
                <div class="state-section">
                  <h3>Reorder Buffer (ROB)</h3>
                  <div id="rob-display" class="rob-display"></div>
                </div>

                <div class="state-section">
                  <h3>CDB Status</h3>
                  <div id="spec-cdb-status" class="cdb-status-display"></div>
                </div>
                
                <div class="state-section">
                  <h3>Instruction Status</h3>
                  <div id="spec-instruction-status" class="instruction-status-table"></div>
                </div>
                
                <div class="state-section">
                  <h3>Reservation Stations</h3>
                  <div id="spec-reservation-stations" class="rs-display"></div>
                </div>
                
                <div class="state-section">
                  <h3>RAT (→ ROB)</h3>
                  <div id="spec-rat-display" class="rat-display"></div>
                </div>

                <div class="state-section">
                  <h3>Branch Prediction</h3>
                  <div id="branch-prediction-status" class="branch-prediction-display"></div>
                </div>

                <div class="state-section">
                  <h3>Event Log <span class="event-log-hint">(click for full log)</span></h3>
                  <div id="spec-event-log" class="event-log clickable"></div>
                </div>
              </div>

              <div id="non-spec-event-log-section" class="state-section non-speculation-event-log">
                <h3>Event Log <span class="event-log-hint">(click for full log)</span></h3>
                <div id="event-log" class="event-log clickable"></div>
              </div>
            </div>
          </div>

          <!-- Right Column: Registers + Memory + Stats -->
          <div class="sim-right-column">
            <div class="panel">
              <div class="panel-header">
                <h2>Registers (x0-x31)</h2>
              </div>
              <div id="registers" class="registers-grid-new"></div>
            </div>

            <div class="panel">
              <div class="panel-header">
                <h2>Memory</h2>
              </div>
              <div id="memory-view" class="memory-view"></div>
            </div>

            <div class="panel">
              <div class="panel-header">
                <h2>Statistics</h2>
              </div>
              <div id="stats" class="stats-grid"></div>
            </div>
          </div>
        </div>

        <!-- Event Log Modal -->
        <div id="event-log-modal" class="modal hidden">
          <div class="modal-backdrop"></div>
          <div class="modal-content">
            <div class="modal-header">
              <h2>Complete Event Log</h2>
              <button id="modal-close-btn" class="modal-close">&times;</button>
            </div>
            <div id="modal-event-list" class="modal-body"></div>
          </div>
        </div>
      </div>
    `;

    // Get UI elements
    this.loadProgramBtn = document.getElementById('load-program-btn') as HTMLButtonElement;
    this.stepBtn = document.getElementById('step-btn') as HTMLButtonElement;
    this.runBtn = document.getElementById('run-btn') as HTMLButtonElement;
    this.resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
    this.runNCyclesBtn = document.getElementById('run-n-cycles-btn') as HTMLButtonElement;
    this.runToEndBtn = document.getElementById('run-to-end-btn') as HTMLButtonElement;
    this.modeSelect = document.getElementById('mode-select') as HTMLSelectElement;
    this.speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
    this.statusText = document.getElementById('status-text') as HTMLElement;
    this.registersDiv = document.getElementById('registers') as HTMLElement;
    this.pipelineStagesDiv = document.getElementById('pipeline-stages') as HTMLElement;
    this.pipelineRegistersDiv = document.getElementById('pipeline-registers') as HTMLElement;
    this.eventLogDiv = document.getElementById('event-log') as HTMLElement;
    this.memoryDiv = document.getElementById('memory-view') as HTMLElement;
    this.statsDiv = document.getElementById('stats') as HTMLElement;
    this.pcDisplay = document.getElementById('pc-display') as HTMLElement;
    this.cycleDisplay = document.getElementById('cycle-display') as HTMLElement;
    
    // Tomasulo UI elements
    this.pipelineContent = document.getElementById('pipeline-content') as HTMLElement;
    this.tomasuloContent = document.getElementById('tomasulo-content') as HTMLElement;
    this.middlePanelTitle = document.getElementById('middle-panel-title') as HTMLElement;
    this.cdbStatusDiv = document.getElementById('cdb-status') as HTMLElement;
    this.instructionStatusDiv = document.getElementById('instruction-status') as HTMLElement;
    this.rsDisplayDiv = document.getElementById('reservation-stations') as HTMLElement;
    this.ratDisplayDiv = document.getElementById('rat-display') as HTMLElement;

    // Speculation UI elements
    this.speculationContent = document.getElementById('speculation-content') as HTMLElement;
    this.robDisplayDiv = document.getElementById('rob-display') as HTMLElement;
    this.specCdbStatusDiv = document.getElementById('spec-cdb-status') as HTMLElement;
    this.specInstructionStatusDiv = document.getElementById('spec-instruction-status') as HTMLElement;
    this.specRsDisplayDiv = document.getElementById('spec-reservation-stations') as HTMLElement;
    this.specRatDisplayDiv = document.getElementById('spec-rat-display') as HTMLElement;
    this.branchPredictionDiv = document.getElementById('branch-prediction-status') as HTMLElement;
    this.specEventLogDiv = document.getElementById('spec-event-log') as HTMLElement;
    this.nonSpecEventLogSection = document.getElementById('non-spec-event-log-section') as HTMLElement;

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
    this.runNCyclesBtn.addEventListener('click', () => this.runNCycles(10));
    this.runToEndBtn.addEventListener('click', () => this.runToEnd());
    this.modeSelect.addEventListener('change', () => this.changeMode());
    this.speedSlider.addEventListener('input', () => {
      this.runSpeed = parseInt(this.speedSlider.value);
      const display = document.getElementById('speed-display');
      if (display) display.textContent = `${this.runSpeed}ms`;
    });

    // Event log modal
    this.eventLogDiv.addEventListener('click', () => this.showEventLogModal());
    
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalBackdrop = document.querySelector('.modal-backdrop');
    const modal = document.getElementById('event-log-modal');
    
    modalCloseBtn?.addEventListener('click', () => modal?.classList.add('hidden'));
    modalBackdrop?.addEventListener('click', () => modal?.classList.add('hidden'));
  }

  private showEventLogModal(): void {
    const state = this.simulator.getState();
    const modal = document.getElementById('event-log-modal');
    const eventList = document.getElementById('modal-event-list');
    
    if (!modal || !eventList) return;
    
    if (!state?.pipeline || state.pipeline.events.length === 0) {
      eventList.innerHTML = '<div class="no-events">No events recorded</div>';
    } else {
      // Group events by cycle
      const eventsByCycle = new Map<number, PipelineEvent[]>();
      for (const event of state.pipeline.events) {
        if (!eventsByCycle.has(event.cycle)) {
          eventsByCycle.set(event.cycle, []);
        }
        eventsByCycle.get(event.cycle)!.push(event);
      }
      
      // Sort cycles in descending order (newest first)
      const sortedCycles = Array.from(eventsByCycle.keys()).sort((a, b) => b - a);
      
      eventList.innerHTML = sortedCycles.map(cycle => `
        <div class="modal-cycle-group">
          <div class="modal-cycle-header">Cycle ${cycle}</div>
          ${eventsByCycle.get(cycle)!.map(e => `
            <div class="event-entry event-${this.getEventClass(e.type)}">
              <span class="event-type">${e.type}</span>
              <span class="event-msg">${e.message}</span>
            </div>
          `).join('')}
        </div>
      `).join('');
    }
    
    modal.classList.remove('hidden');
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
        const state = this.simulator.getState();
        if (state?.architectural.errorMessage) {
          this.setStatus(`Error: ${state.architectural.errorMessage}`, 'error');
        } else {
          this.setStatus('Program completed', 'success');
        }
        return;
      }

      this.simulator.step();
      this.updateUI();

      if (this.simulator.isHalted()) {
        const state = this.simulator.getState();
        if (state?.architectural.errorMessage) {
          this.setStatus(`Error: ${state.architectural.errorMessage}`, 'error');
        } else {
          this.setStatus('Program completed', 'success');
        }
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

  private runNCycles(n: number): void {
    for (let i = 0; i < n && !this.simulator.isHalted(); i++) {
      this.simulator.step();
    }
    this.updateUI();
    if (this.simulator.isHalted()) {
      const state = this.simulator.getState();
      if (state?.architectural.errorMessage) {
        this.setStatus(`Error: ${state.architectural.errorMessage}`, 'error');
      } else {
        this.setStatus('Program completed', 'success');
      }
    }
  }

  private runToEnd(): void {
    let cycles = 0;
    const maxCycles = 10000;
    while (!this.simulator.isHalted() && cycles < maxCycles) {
      this.simulator.step();
      cycles++;
    }
    this.updateUI();
    if (cycles >= maxCycles) {
      this.setStatus('Max cycles reached (10000)', 'error');
    } else {
      const state = this.simulator.getState();
      if (state?.architectural.errorMessage) {
        this.setStatus(`Error: ${state.architectural.errorMessage}`, 'error');
      } else {
        this.setStatus('Program completed', 'success');
      }
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
    this.runNCyclesBtn.disabled = true;
    this.runToEndBtn.disabled = true;
    this.modeSelect.disabled = true;

    this.runInterval = window.setInterval(() => {
      this.step();
    }, this.runSpeed);
  }

  private stopRunning(): void {
    this.isRunning = false;
    this.runBtn.textContent = 'Run';
    this.stepBtn.disabled = false;
    this.runNCyclesBtn.disabled = false;
    this.runToEndBtn.disabled = false;
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
    
    // Update UI visibility based on mode
    const mode = this.modeSelect.value as ExecutionMode;
    if (mode === ExecutionMode.PIPELINE) {
      this.pipelineContent.classList.remove('hidden');
      this.tomasuloContent.classList.add('hidden');
      this.speculationContent.classList.add('hidden');
      this.nonSpecEventLogSection.classList.remove('hidden');
      this.middlePanelTitle.textContent = 'Pipeline State';
    } else if (mode === ExecutionMode.TOMASULO) {
      this.pipelineContent.classList.add('hidden');
      this.tomasuloContent.classList.remove('hidden');
      this.speculationContent.classList.add('hidden');
      this.nonSpecEventLogSection.classList.remove('hidden');
      this.middlePanelTitle.textContent = 'Tomasulo State';
    } else if (mode === ExecutionMode.TOMASULO_SPECULATION) {
      this.pipelineContent.classList.add('hidden');
      this.tomasuloContent.classList.add('hidden');
      this.speculationContent.classList.remove('hidden');
      this.nonSpecEventLogSection.classList.add('hidden');
      this.middlePanelTitle.textContent = 'Tomasulo + Speculation';
    }
    
    const assembly = this.codeEditor?.getValue() || '';
    this.loadProgram(assembly);
  }

  private updateUI(): void {
    const state = this.simulator.getState();
    
    if (!state) {
      this.clearUI();
      return;
    }

    // Update cycle and PC display
    this.cycleDisplay.textContent = state.architectural.cycle.toString();
    this.pcDisplay.textContent = `0x${state.architectural.pc.toString(16).toUpperCase()}`;

    // Update statistics
    this.updateStats();

    // Highlight current line in editor
    this.updateCurrentLine();

    // Update registers (common to both modes)
    this.updateRegisters(state.architectural.registers.registers);

    // Update memory view (common to both modes)
    this.updateMemoryView();

    // Mode-specific updates
    if (state.mode === ExecutionMode.PIPELINE && state.pipeline) {
      this.updatePipelineStages();
      this.updatePipelineRegisters();
      this.updatePipelineEventLog();
    } else if (state.mode === ExecutionMode.TOMASULO && state.tomasulo) {
      this.updateTomasuloCDB();
      this.updateInstructionStatus();
      this.updateReservationStations();
      this.updateRAT();
      this.updateTomasuloEventLog();
    } else if (state.mode === ExecutionMode.TOMASULO_SPECULATION && state.speculation) {
      this.updateSpeculationROB();
      this.updateSpeculationCDB();
      this.updateSpeculationInstructionStatus();
      this.updateSpeculationRS();
      this.updateSpeculationRAT();
      this.updateBranchPrediction();
      this.updateSpeculationEventLog();
    }
  }

  private updateCurrentLine(): void {
    const state = this.simulator.getState();
    if (!state) return;

    // Highlight the instruction currently in IF stage
    const regs = state.pipeline?.registers;
    if (regs?.IFID.valid && regs.IFID.instruction?.lineNumber) {
      this.codeEditor?.highlightLine(regs.IFID.instruction.lineNumber);
    } else if (regs?.IDEX.valid && regs.IDEX.instruction?.lineNumber) {
      this.codeEditor?.highlightLine(regs.IDEX.instruction.lineNumber);
    }
  }

  private updateRegisters(registers: number[]): void {
    this.registersDiv.innerHTML = '';
    
    for (let i = 0; i < 32; i++) {
      const regDiv = document.createElement('div');
      regDiv.className = 'register-cell';
      
      const value = registers[i];
      const hexValue = (value >>> 0).toString(16).toUpperCase().padStart(8, '0');
      
      regDiv.innerHTML = `
        <span class="reg-name">x${i}</span>
        <span class="reg-value" title="0x${hexValue}">${value}</span>
      `;
      
      if (i !== 0 && value !== 0) {
        regDiv.classList.add('register-active');
      }
      
      this.registersDiv.appendChild(regDiv);
    }
  }

  private updatePipelineStages(): void {
    const state = this.simulator.getState();
    if (!state?.pipeline) {
      this.pipelineStagesDiv.innerHTML = '<div class="stage-empty">No pipeline state</div>';
      return;
    }

    const regs = state.pipeline.registers;
    
    // Pipeline registers contain the instruction that just completed each stage:
    // IF/ID: instruction that finished IF (now entering ID)
    // ID/EX: instruction that finished ID (now entering EX)
    // EX/MEM: instruction that finished EX (now entering MEM)
    // MEM/WB: instruction that finished MEM (now entering WB)
    const stages = [
      { name: 'IF', instr: regs.IFID.valid ? regs.IFID.instruction?.text : null, 
        extra: regs.IFID.valid ? `PC: 0x${regs.IFID.pc.toString(16)}` : '' },
      { name: 'ID', instr: regs.IDEX.valid ? regs.IDEX.instruction?.text : null, extra: '' },
      { name: 'EX', instr: regs.EXMEM.valid ? regs.EXMEM.instruction?.text : null, 
        extra: regs.IDEX.valid && regs.IDEX.exCyclesRemaining > 1 ? `(${regs.IDEX.exCyclesRemaining} cycles left)` : '' },
      { name: 'MEM', instr: regs.MEMWB.valid ? regs.MEMWB.instruction?.text : null, extra: '' },
      { name: 'WB', instr: state.pipeline.lastWBInstruction || null, extra: '' },
    ];

    this.pipelineStagesDiv.innerHTML = stages.map(s => `
      <div class="stage-box ${s.instr ? 'stage-occupied' : 'stage-bubble'}">
        <div class="stage-name">${s.name}</div>
        <div class="stage-content">${s.instr || 'bubble'}</div>
        ${s.extra ? `<div class="stage-extra">${s.extra}</div>` : ''}
      </div>
    `).join('');
  }

  private updatePipelineRegisters(): void {
    const state = this.simulator.getState();
    if (!state?.pipeline) {
      this.pipelineRegistersDiv.innerHTML = '';
      return;
    }

    const regs = state.pipeline.registers;
    
    // Create tree data for each register
    const treeData = [
      {
        name: 'IF/ID',
        valid: regs.IFID.valid,
        instr: regs.IFID.instruction?.text || '-',
        fields: [
          { key: 'pc', value: `0x${regs.IFID.pc.toString(16).toUpperCase()}` },
          { key: 'valid', value: regs.IFID.valid },
        ]
      },
      {
        name: 'ID/EX',
        valid: regs.IDEX.valid,
        instr: regs.IDEX.instruction?.text || '-',
        fields: [
          { key: 'rs1', value: regs.IDEX.rs1 ?? '-' },
          { key: 'rs1Value', value: regs.IDEX.rs1Value },
          { key: 'rs2', value: regs.IDEX.rs2 ?? '-' },
          { key: 'rs2Value', value: regs.IDEX.rs2Value },
          { key: 'rd', value: regs.IDEX.rd ?? '-' },
          { key: 'imm', value: regs.IDEX.imm ?? '-' },
          { key: 'exCyclesRemaining', value: regs.IDEX.exCyclesRemaining },
        ]
      },
      {
        name: 'EX/MEM',
        valid: regs.EXMEM.valid,
        instr: regs.EXMEM.instruction?.text || '-',
        fields: [
          { key: 'aluResult', value: regs.EXMEM.aluResult },
          { key: 'rd', value: regs.EXMEM.rd ?? '-' },
          { key: 'rs2Value', value: regs.EXMEM.rs2Value },
          { key: 'branchTaken', value: regs.EXMEM.branchTaken },
          { key: 'branchTarget', value: `0x${regs.EXMEM.branchTarget.toString(16).toUpperCase()}` },
        ]
      },
      {
        name: 'MEM/WB',
        valid: regs.MEMWB.valid,
        instr: regs.MEMWB.instruction?.text || '-',
        fields: [
          { key: 'result', value: regs.MEMWB.result },
          { key: 'rd', value: regs.MEMWB.rd ?? '-' },
          { key: 'writeReg', value: regs.MEMWB.writeReg },
        ]
      },
    ];

    this.pipelineRegistersDiv.innerHTML = treeData.map((reg, idx) => `
      <div class="tree-node ${reg.valid ? 'tree-valid' : 'tree-invalid'}">
        <div class="tree-header" data-tree-idx="${idx}">
          <span class="tree-toggle">▶</span>
          <span class="tree-name">${reg.name}</span>
          <span class="tree-instr">${reg.valid ? reg.instr : 'bubble'}</span>
        </div>
        <div class="tree-children hidden">
          ${reg.fields.map(f => `
            <div class="tree-field">
              <span class="tree-key">${f.key}:</span>
              <span class="tree-value">${f.value}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    // Add click handlers for tree toggle
    const headers = this.pipelineRegistersDiv.querySelectorAll('.tree-header');
    headers.forEach(header => {
      header.addEventListener('click', () => {
        const toggle = header.querySelector('.tree-toggle');
        const children = header.nextElementSibling;
        if (toggle && children) {
          if (children.classList.contains('hidden')) {
            children.classList.remove('hidden');
            toggle.textContent = '▼';
          } else {
            children.classList.add('hidden');
            toggle.textContent = '▶';
          }
        }
      });
    });
  }

  private updatePipelineEventLog(): void {
    const state = this.simulator.getState();
    if (!state?.pipeline) {
      this.eventLogDiv.innerHTML = '<div class="no-events">No events</div>';
      return;
    }

    const events = state.pipeline.events;
    const currentCycle = state.architectural.cycle;
    
    // Show only events from the current cycle (latest cycle just completed)
    const currentCycleEvents = events.filter(e => e.cycle === currentCycle - 1);
    
    if (currentCycleEvents.length === 0) {
      this.eventLogDiv.innerHTML = '<div class="no-events">No events this cycle</div>';
      return;
    }

    this.eventLogDiv.innerHTML = currentCycleEvents
      .map(e => `
        <div class="event-entry event-${this.getEventClass(e.type)}">
          <span class="event-type">${e.type}</span>
          <span class="event-msg">${e.message}</span>
        </div>
      `)
      .join('');
  }

  private getEventClass(type: EventType): string {
    switch (type) {
      case EventType.FORWARD: return 'forward';
      case EventType.STALL_STRUCTURAL:
      case EventType.STALL_DATA:
      case EventType.STALL_BRANCH: return 'stall';
      case EventType.FLUSH: return 'flush';
      case EventType.ERROR: return 'error';
      case EventType.WRITEBACK: return 'writeback';
      case EventType.MEMORY_READ:
      case EventType.MEMORY_WRITE: return 'memory';
      default: return 'default';
    }
  }

  private updateMemoryView(): void {
    const state = this.simulator.getState();
    if (!state) {
      this.memoryDiv.innerHTML = '<div class="no-memory">No memory data</div>';
      return;
    }

    const memory = state.architectural.memory.data;
    
    // Ensure we have a valid Map
    if (!memory || !(memory instanceof Map) || memory.size === 0) {
      this.memoryDiv.innerHTML = '<div class="no-memory">Memory is empty (use ST instruction to write)</div>';
      return;
    }

    // Show all memory locations that have been written
    const entries = Array.from(memory.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(0, 32); // Limit display

    this.memoryDiv.innerHTML = `
      <div class="memory-header">
        <span>Address</span>
        <span>Value</span>
      </div>
      <div class="memory-grid">
        ${entries.map(([addr, val]) => `
          <div class="memory-cell">
            <span class="mem-addr">0x${addr.toString(16).toUpperCase().padStart(4, '0')}</span>
            <span class="mem-val">${val} (0x${(val >>> 0).toString(16).toUpperCase()})</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  private updateStats(): void {
    const trace = this.simulator.getTrace();
    const stats = trace.statistics;

    this.statsDiv.innerHTML = `
      <div class="stat-item">
        <span class="stat-label">Cycles:</span>
        <span class="stat-value">${stats.totalCycles}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Instructions:</span>
        <span class="stat-value">${stats.instructionsCompleted}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">IPC:</span>
        <span class="stat-value">${stats.ipc.toFixed(3)}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Stall Cycles:</span>
        <span class="stat-value">${stats.stallCycles}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Flushes:</span>
        <span class="stat-value">${stats.flushCount}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Forwards:</span>
        <span class="stat-value">${stats.forwardingEvents}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Mem Reads:</span>
        <span class="stat-value">${stats.memoryReads}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Mem Writes:</span>
        <span class="stat-value">${stats.memoryWrites}</span>
      </div>
    `;
  }

  // ========== Tomasulo-specific UI Methods ==========

  private updateTomasuloCDB(): void {
    const state = this.simulator.getState();
    if (!state?.tomasulo) {
      this.cdbStatusDiv.innerHTML = '<div class="cdb-idle">No Tomasulo state</div>';
      return;
    }

    const cdb = state.tomasulo.cdb;
    if (!cdb) {
      this.cdbStatusDiv.innerHTML = `
        <div class="cdb-status-box cdb-idle">
          <span class="cdb-label">CDB Status:</span>
          <span class="cdb-value">Idle</span>
        </div>
      `;
    } else {
      this.cdbStatusDiv.innerHTML = `
        <div class="cdb-status-box cdb-broadcasting">
          <span class="cdb-label">CDB Broadcasting:</span>
          <div class="cdb-details">
            <span><strong>Tag:</strong> ${cdb.tag}</span>
            <span><strong>Value:</strong> ${cdb.value}</span>
            <span><strong>Dest:</strong> x${cdb.destReg}</span>
          </div>
        </div>
      `;
    }
  }

  private updateInstructionStatus(): void {
    const state = this.simulator.getState();
    if (!state?.tomasulo) {
      this.instructionStatusDiv.innerHTML = '<div class="no-data">No instructions</div>';
      return;
    }

    const status = state.tomasulo.instructionStatus;
    if (status.length === 0) {
      this.instructionStatusDiv.innerHTML = '<div class="no-data">No instructions issued yet</div>';
      return;
    }

    this.instructionStatusDiv.innerHTML = `
      <table class="instr-status-table">
        <thead>
          <tr>
            <th>Instruction</th>
            <th>Issue</th>
            <th>Exec Start</th>
            <th>Exec End</th>
            <th>Write</th>
          </tr>
        </thead>
        <tbody>
          ${status.map(s => `
            <tr class="${s.writeResultCycle !== null ? 'completed' : 'in-progress'}">
              <td class="instr-text">${s.instruction.text}</td>
              <td>${s.issueCycle ?? '-'}</td>
              <td>${s.execStartCycle ?? '-'}</td>
              <td>${s.execEndCycle ?? '-'}</td>
              <td>${s.writeResultCycle ?? '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  private updateReservationStations(): void {
    const state = this.simulator.getState();
    if (!state?.tomasulo) {
      this.rsDisplayDiv.innerHTML = '<div class="no-data">No reservation stations</div>';
      return;
    }

    const rs = state.tomasulo.reservationStations;
    
    // Group by type
    const byType = new Map<RSType, Array<{ id: string; rs: typeof rs extends Map<string, infer V> ? V : never }>>();
    for (const [id, entry] of rs) {
      const type = entry.rsType;
      if (!byType.has(type)) {
        byType.set(type, []);
      }
      byType.get(type)!.push({ id, rs: entry });
    }

    // Render each type
    const typeOrder: RSType[] = [RSType.INT, RSType.MUL, RSType.DIV, RSType.LOAD, RSType.STORE, RSType.BRANCH];
    
    this.rsDisplayDiv.innerHTML = typeOrder
      .filter(t => byType.has(t))
      .map(type => {
        const entries = byType.get(type)!;
        return `
          <div class="rs-group">
            <div class="rs-group-header">${type}</div>
            <table class="rs-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Busy</th>
                  <th>Op</th>
                  <th>Vj</th>
                  <th>Vk</th>
                  <th>Qj</th>
                  <th>Qk</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                ${entries.map(({ id, rs }) => `
                  <tr class="${rs.busy ? 'rs-busy' : 'rs-empty'} ${this.getRSStateClass(rs.state)}">
                    <td>${id}</td>
                    <td>${rs.busy ? 'Yes' : '-'}</td>
                    <td>${rs.busy ? rs.op : '-'}</td>
                    <td>${rs.busy ? (rs.Vj !== null ? rs.Vj : '-') : '-'}</td>
                    <td>${rs.busy ? (rs.Vk !== null ? rs.Vk : '-') : '-'}</td>
                    <td>${rs.busy ? (rs.Qj ?? '-') : '-'}</td>
                    <td>${rs.busy ? (rs.Qk ?? '-') : '-'}</td>
                    <td>${rs.busy ? rs.state : '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }).join('');
  }

  private getRSStateClass(state: RSState): string {
    switch (state) {
      case RSState.WAITING: return 'rs-waiting';
      case RSState.READY: return 'rs-ready';
      case RSState.EXECUTING: return 'rs-executing';
      case RSState.DONE: return 'rs-done';
      default: return '';
    }
  }

  private updateRAT(): void {
    const state = this.simulator.getState();
    if (!state?.tomasulo) {
      this.ratDisplayDiv.innerHTML = '<div class="no-data">No RAT data</div>';
      return;
    }

    const rat = state.tomasulo.rat;
    
    // Only show registers that have a tag (renamed)
    const renamedRegs: Array<{ reg: number; tag: string }> = [];
    for (const [reg, status] of rat) {
      if (status.tag !== null && reg !== 0) {
        renamedRegs.push({ reg, tag: status.tag });
      }
    }

    if (renamedRegs.length === 0) {
      this.ratDisplayDiv.innerHTML = `
        <div class="rat-info">All registers are ready (no pending renames)</div>
      `;
      return;
    }

    this.ratDisplayDiv.innerHTML = `
      <div class="rat-grid">
        ${renamedRegs.map(({ reg, tag }) => `
          <div class="rat-entry">
            <span class="rat-reg">x${reg}</span>
            <span class="rat-arrow">→</span>
            <span class="rat-tag">${tag}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  private updateTomasuloEventLog(): void {
    const state = this.simulator.getState();
    if (!state?.tomasulo) {
      this.eventLogDiv.innerHTML = '<div class="no-events">No events</div>';
      return;
    }

    const events = state.tomasulo.events;
    const currentCycle = state.architectural.cycle;
    
    // Show only events from the current cycle (latest cycle just completed)
    const currentCycleEvents = events.filter(e => e.cycle === currentCycle - 1);
    
    if (currentCycleEvents.length === 0) {
      this.eventLogDiv.innerHTML = '<div class="no-events">No events this cycle</div>';
      return;
    }

    this.eventLogDiv.innerHTML = currentCycleEvents
      .map(e => `
        <div class="event-entry event-${this.getTomasuloEventClass(e.type)}">
          <span class="event-type">${e.type}</span>
          <span class="event-msg">${e.message}</span>
        </div>
      `)
      .join('');
  }

  private getTomasuloEventClass(type: TomasuloEventType): string {
    switch (type) {
      case TomasuloEventType.ISSUE: return 'issue';
      case TomasuloEventType.ISSUE_STALL: return 'stall';
      case TomasuloEventType.EXEC_START:
      case TomasuloEventType.EXEC_CONTINUE:
      case TomasuloEventType.EXEC_END: return 'execute';
      case TomasuloEventType.CDB_BROADCAST: return 'broadcast';
      case TomasuloEventType.CDB_CONTENTION: return 'contention';
      case TomasuloEventType.OPERAND_WAKEUP: return 'wakeup';
      case TomasuloEventType.RAT_UPDATE:
      case TomasuloEventType.ARF_WRITE: return 'writeback';
      case TomasuloEventType.MEM_READ:
      case TomasuloEventType.MEM_WRITE: return 'memory';
      case TomasuloEventType.ERROR: return 'error';
      default: return 'default';
    }
  }

  // ========== End Tomasulo-specific UI Methods ==========

  // ========== Speculation-specific UI Methods ==========

  private updateSpeculationROB(): void {
    const state = this.simulator.getState();
    if (!state?.speculation) {
      this.robDisplayDiv.innerHTML = '<div class="no-data">No ROB data</div>';
      return;
    }

    const spec = state.speculation;
    const robArray = spec.rob;
    const robHead = spec.robHead;
    const robTail = spec.robTail;
    const robSize = spec.robSize;
    
    // Calculate count of busy entries
    let count = 0;
    for (const entry of robArray) {
      if (entry.busy) count++;
    }
    
    const entries: Array<{ index: number; entry: ROBEntry; isHead: boolean; isTail: boolean }> = [];
    
    for (let i = 0; i < robSize; i++) {
      const entry = robArray[i];
      entries.push({
        index: i,
        entry,
        isHead: i === robHead,
        isTail: i === robTail
      });
    }

    const getStateClass = (robState: ROBState) => {
      switch (robState) {
        case ROBState.ISSUED: return 'rob-issue';
        case ROBState.EXECUTING: return 'rob-executing';
        case ROBState.WRITE_RESULT: return 'rob-writeresult';
        case ROBState.COMMITTED: return 'rob-commit';
        case ROBState.SQUASHED: return 'rob-squashed';
        default: return '';
      }
    };

    this.robDisplayDiv.innerHTML = `
      <div class="rob-info">
        <span>Entries: ${count}/${robSize}</span>
        <span>Head: ${robHead}</span>
        <span>Tail: ${robTail}</span>
      </div>
      <table class="rob-table">
        <thead>
          <tr>
            <th>#</th>
            <th>State</th>
            <th>Type</th>
            <th>Dest</th>
            <th>Value</th>
            <th>Ready</th>
            <th>Spec</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map(({ index, entry, isHead, isTail }) => `
            <tr class="${entry.busy ? getStateClass(entry.state) : 'rob-empty'} ${isHead ? 'rob-head' : ''} ${isTail ? 'rob-tail' : ''}">
              <td class="rob-index">
                ${index}
                ${isHead ? '<span class="rob-marker rob-marker-head">H</span>' : ''}
                ${isTail ? '<span class="rob-marker rob-marker-tail">T</span>' : ''}
              </td>
              <td>${entry.busy ? ROBState[entry.state] : '-'}</td>
              <td>${entry.busy ? entry.type : '-'}</td>
              <td>${entry.busy && entry.destReg !== null ? `x${entry.destReg}` : '-'}</td>
              <td>${entry.busy && entry.value !== null ? entry.value : '-'}</td>
              <td>${entry.busy ? (entry.ready ? 'Yes' : 'No') : '-'}</td>
              <td>${entry.busy ? (entry.branchResolved === false ? 'Yes' : 'No') : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  private updateSpeculationCDB(): void {
    const state = this.simulator.getState();
    if (!state?.speculation) {
      this.specCdbStatusDiv.innerHTML = '<div class="cdb-idle">CDB: Idle</div>';
      return;
    }

    const cdb = state.speculation.cdb;
    
    if (cdb === null || cdb.robIndex === null) {
      this.specCdbStatusDiv.innerHTML = '<div class="cdb-idle">CDB: Idle</div>';
    } else {
      this.specCdbStatusDiv.innerHTML = `
        <div class="cdb-active">
          <span class="cdb-label">CDB Broadcasting:</span>
          <span class="cdb-tag">ROB#${cdb.robIndex}</span>
          <span class="cdb-value">= ${cdb.value}</span>
        </div>
      `;
    }
  }

  private updateSpeculationInstructionStatus(): void {
    const state = this.simulator.getState();
    if (!state?.speculation) {
      this.specInstructionStatusDiv.innerHTML = '<div class="no-data">No instruction status</div>';
      return;
    }

    const records = state.speculation.instructionStatus;
    
    if (records.length === 0) {
      this.specInstructionStatusDiv.innerHTML = '<div class="no-data">No instructions yet</div>';
      return;
    }

    this.specInstructionStatusDiv.innerHTML = `
      <table class="instruction-status-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Instruction</th>
            <th>Issue</th>
            <th>Exec</th>
            <th>Write</th>
            <th>Commit</th>
          </tr>
        </thead>
        <tbody>
          ${records.map((rec, idx) => `
            <tr class="${rec.squashed ? 'instruction-squashed' : ''}">
              <td>${idx}</td>
              <td class="instruction-text">${rec.instruction}</td>
              <td>${rec.issueCycle ?? '-'}</td>
              <td>${rec.execStartCycle !== null && rec.execEndCycle !== null 
                ? (rec.execStartCycle === rec.execEndCycle 
                    ? rec.execStartCycle 
                    : `${rec.execStartCycle}-${rec.execEndCycle}`)
                : '-'}</td>
              <td>${rec.writeResultCycle ?? '-'}</td>
              <td>${rec.squashed ? 'SQUASHED' : (rec.commitCycle ?? '-')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  private updateSpeculationRS(): void {
    const state = this.simulator.getState();
    if (!state?.speculation) {
      this.specRsDisplayDiv.innerHTML = '<div class="no-data">No RS data</div>';
      return;
    }

    const allRS = state.speculation.reservationStations;
    
    // Group by type
    const byType = new Map<RSType, Array<{ id: string; rs: SpeculationRS }>>();
    
    for (const [id, entry] of allRS) {
      const rsType = entry.rsType;
      if (!byType.has(rsType)) {
        byType.set(rsType, []);
      }
      byType.get(rsType)!.push({ id, rs: entry });
    }

    // Render each type
    const typeOrder: RSType[] = [RSType.INT, RSType.MUL, RSType.DIV, RSType.LOAD, RSType.STORE, RSType.BRANCH];
    
    this.specRsDisplayDiv.innerHTML = typeOrder
      .filter(t => byType.has(t))
      .map(type => {
        const entries = byType.get(type)!;
        return `
          <div class="rs-group">
            <div class="rs-group-header">${type}</div>
            <table class="rs-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Busy</th>
                  <th>Op</th>
                  <th>Vj</th>
                  <th>Vk</th>
                  <th>Qj</th>
                  <th>Qk</th>
                  <th>ROB#</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                ${entries.map(({ id, rs }) => `
                  <tr class="${rs.busy ? 'rs-busy' : 'rs-empty'} ${this.getRSStateClass(rs.state)}">
                    <td>${id}</td>
                    <td>${rs.busy ? 'Yes' : '-'}</td>
                    <td>${rs.busy ? rs.op : '-'}</td>
                    <td>${rs.busy ? (rs.Vj !== null ? rs.Vj : '-') : '-'}</td>
                    <td>${rs.busy ? (rs.Vk !== null ? rs.Vk : '-') : '-'}</td>
                    <td>${rs.busy ? (rs.Qj !== null ? `ROB#${rs.Qj}` : '-') : '-'}</td>
                    <td>${rs.busy ? (rs.Qk !== null ? `ROB#${rs.Qk}` : '-') : '-'}</td>
                    <td>${rs.busy ? (rs.robIndex !== null ? rs.robIndex : '-') : '-'}</td>
                    <td>${rs.busy ? rs.state : '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }).join('');
  }

  private updateSpeculationRAT(): void {
    const state = this.simulator.getState();
    if (!state?.speculation) {
      this.specRatDisplayDiv.innerHTML = '<div class="no-data">No RAT data</div>';
      return;
    }

    const rat = state.speculation.rat;
    
    // Only show registers that have a ROB mapping (renamed)
    const renamedRegs: Array<{ reg: number; robIndex: number }> = [];
    for (const [reg, status] of rat) {
      if (status.robIndex !== null && reg !== 0) {
        renamedRegs.push({ reg, robIndex: status.robIndex });
      }
    }

    if (renamedRegs.length === 0) {
      this.specRatDisplayDiv.innerHTML = `
        <div class="rat-info">All registers are ready (no pending renames)</div>
      `;
      return;
    }

    this.specRatDisplayDiv.innerHTML = `
      <div class="rat-grid">
        ${renamedRegs.map(({ reg, robIndex }) => `
          <div class="rat-entry">
            <span class="rat-reg">x${reg}</span>
            <span class="rat-arrow">→</span>
            <span class="rat-tag">ROB#${robIndex}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  private updateBranchPrediction(): void {
    const state = this.simulator.getState();
    if (!state?.speculation) {
      this.branchPredictionDiv.innerHTML = '<div class="no-data">No branch prediction data</div>';
      return;
    }

    const spec = state.speculation;
    const branchesResolved = spec.branchCount;
    const mispredictions = spec.mispredictCount;
    
    const accuracy = branchesResolved > 0 
      ? ((branchesResolved - mispredictions) / branchesResolved * 100).toFixed(1)
      : 'N/A';

    this.branchPredictionDiv.innerHTML = `
      <div class="bp-stats">
        <div class="bp-stat">
          <span class="bp-stat-label">Resolved:</span>
          <span class="bp-stat-value">${branchesResolved}</span>
        </div>
        <div class="bp-stat">
          <span class="bp-stat-label">Mispredictions:</span>
          <span class="bp-stat-value">${mispredictions}</span>
        </div>
        <div class="bp-stat">
          <span class="bp-stat-label">Accuracy:</span>
          <span class="bp-stat-value">${accuracy}${typeof accuracy === 'string' && accuracy !== 'N/A' ? '%' : ''}</span>
        </div>
        <div class="bp-stat">
          <span class="bp-stat-label">Squashed:</span>
          <span class="bp-stat-value">${spec.instructionsSquashed}</span>
        </div>
      </div>
      <div class="bp-policy">
        <span>Policy: Always-Not-Taken (BEQ/BNE), Always-Taken (J)</span>
      </div>
    `;
  }

  private updateSpeculationEventLog(): void {
    const state = this.simulator.getState();
    if (!state?.speculation) {
      this.specEventLogDiv.innerHTML = '<div class="no-events">No events</div>';
      return;
    }

    const events = state.speculation.events;
    const currentCycle = state.architectural.cycle;
    
    // Show only events from the current cycle (latest cycle just completed)
    const currentCycleEvents = events.filter(e => e.cycle === currentCycle - 1);
    
    if (currentCycleEvents.length === 0) {
      this.specEventLogDiv.innerHTML = '<div class="no-events">No events this cycle</div>';
      return;
    }

    this.specEventLogDiv.innerHTML = currentCycleEvents
      .map(e => `
        <div class="event-entry event-${this.getSpeculationEventClass(e.type)}">
          <span class="event-type">${e.type}</span>
          <span class="event-msg">${e.message}</span>
        </div>
      `)
      .join('');
  }

  private getSpeculationEventClass(type: SpeculationEventType): string {
    switch (type) {
      case SpeculationEventType.ISSUE: return 'issue';
      case SpeculationEventType.ISSUE_STALL_RS_FULL:
      case SpeculationEventType.ISSUE_STALL_ROB_FULL: return 'stall';
      case SpeculationEventType.EXEC_START:
      case SpeculationEventType.EXEC_CONTINUE:
      case SpeculationEventType.EXEC_END: return 'execute';
      case SpeculationEventType.CDB_BROADCAST: return 'broadcast';
      case SpeculationEventType.CDB_CONTENTION: return 'contention';
      case SpeculationEventType.RS_OPERAND_WAKEUP: return 'wakeup';
      case SpeculationEventType.ROB_COMMIT: return 'commit';
      case SpeculationEventType.BRANCH_RESOLVE:
      case SpeculationEventType.BRANCH_PREDICT:
      case SpeculationEventType.BRANCH_CORRECT: return 'branch';
      case SpeculationEventType.BRANCH_MISPREDICT: return 'misprediction';
      case SpeculationEventType.ROB_SQUASH:
      case SpeculationEventType.RECOVERY_SQUASH: return 'squash';
      case SpeculationEventType.RECOVERY_START:
      case SpeculationEventType.RECOVERY_COMPLETE: return 'recovery';
      case SpeculationEventType.MEM_READ:
      case SpeculationEventType.MEM_WRITE: return 'memory';
      case SpeculationEventType.ERROR: return 'error';
      default: return 'default';
    }
  }

  // ========== End Speculation-specific UI Methods ==========

  private clearUI(): void {
    this.registersDiv.innerHTML = '<div class="stage-empty">No program loaded</div>';
    this.pipelineStagesDiv.innerHTML = '<div class="stage-empty">No program loaded</div>';
    this.pipelineRegistersDiv.innerHTML = '';
    this.eventLogDiv.innerHTML = '';
    this.memoryDiv.innerHTML = '';
    this.statsDiv.innerHTML = '';
    this.cycleDisplay.textContent = '0';
    this.pcDisplay.textContent = '0x0';
    
    // Clear Tomasulo UI elements
    if (this.cdbStatusDiv) this.cdbStatusDiv.innerHTML = '';
    if (this.instructionStatusDiv) this.instructionStatusDiv.innerHTML = '';
    if (this.rsDisplayDiv) this.rsDisplayDiv.innerHTML = '';
    if (this.ratDisplayDiv) this.ratDisplayDiv.innerHTML = '';
    
    // Clear Speculation UI elements
    if (this.robDisplayDiv) this.robDisplayDiv.innerHTML = '';
    if (this.specCdbStatusDiv) this.specCdbStatusDiv.innerHTML = '';
    if (this.specInstructionStatusDiv) this.specInstructionStatusDiv.innerHTML = '';
    if (this.specRsDisplayDiv) this.specRsDisplayDiv.innerHTML = '';
    if (this.specRatDisplayDiv) this.specRatDisplayDiv.innerHTML = '';
    if (this.branchPredictionDiv) this.branchPredictionDiv.innerHTML = '';
    if (this.specEventLogDiv) this.specEventLogDiv.innerHTML = '';
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
