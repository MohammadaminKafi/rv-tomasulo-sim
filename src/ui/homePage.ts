/**
 * Home page component
 */

import { Router } from './router';
import { CodeEditor } from './codeEditor';

export class HomePage {
  private router: Router;
  private codeEditor: CodeEditor | null;

  constructor(router: Router) {
    this.router = router;
    this.codeEditor = null;
  }

  render(container: HTMLElement): void {
    container.innerHTML = `
      <div class="home-page">
        <div class="hero-section">
          <h1 class="hero-title">🔬 RISC-V & Tomasulo Simulator</h1>
          <p class="hero-subtitle">Interactive Computer Architecture Education</p>
          <p class="hero-description">
            Explore CPU pipeline architectures and out-of-order execution through
            hands-on simulation. Write RISC-V assembly, visualize instruction flow,
            and understand how modern processors work.
          </p>
        </div>

        <div class="features-grid">
          <div class="feature-card">
            <div class="feature-icon">⚡</div>
            <h3>Real-time Visualization</h3>
            <p>Watch instructions flow through pipeline stages cycle by cycle</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🎯</div>
            <h3>Step-by-Step Execution</h3>
            <p>Control execution speed and examine each state transition</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">📊</div>
            <h3>Performance Metrics</h3>
            <p>Track IPC, stalls, and other key performance indicators</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🧪</div>
            <h3>Multiple Execution Models</h3>
            <p>Compare pipeline, Tomasulo, and speculative execution</p>
          </div>
        </div>

        <div class="editor-section">
          <h2>Try It Now</h2>
          <p class="section-description">Write your RISC-V assembly code or try a sample program</p>
          
          <div id="home-editor" class="editor-container editor-home"></div>
          
          <div class="action-buttons">
            <button id="load-program-btn" class="btn btn-primary btn-large">
              Load Program →
            </button>
            <button id="view-docs-btn" class="btn btn-secondary btn-large">
              View Documentation
            </button>
          </div>
        </div>

        <div class="info-section">
          <h2>What You'll Learn</h2>
          <div class="info-grid">
            <div class="info-item">
              <h4>Phase 1: 5-Stage Pipeline</h4>
              <p>Understand classic RISC-V pipeline: IF, ID, EX, MEM, WB stages</p>
            </div>
            <div class="info-item">
              <h4>Phase 2: Tomasulo Algorithm</h4>
              <p>Explore dynamic scheduling with reservation stations</p>
            </div>
            <div class="info-item">
              <h4>Phase 3: Speculation</h4>
              <p>Learn speculative execution and branch handling</p>
            </div>
            <div class="info-item">
              <h4>Phase 4: Branch Prediction</h4>
              <p>Master branch prediction techniques and optimizations</p>
            </div>
          </div>
        </div>
      </div>
    `;

    // Initialize code editor
    this.codeEditor = new CodeEditor('home-editor', this.getDefaultCode());

    // Setup event listeners
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    const loadBtn = document.getElementById('load-program-btn');
    const docsBtn = document.getElementById('view-docs-btn');

    loadBtn?.addEventListener('click', () => {
      if (this.codeEditor) {
        const code = this.codeEditor.getValue();
        localStorage.setItem('assemblyCode', code);
        this.router.navigateTo('simulator');
      }
    });

    docsBtn?.addEventListener('click', () => {
      this.router.navigateTo('docs');
    });
  }

  private getDefaultCode(): string {
    return `# Welcome to RISC-V Simulator!
# Write your assembly code here

# Example: Simple addition
ADDI x1, x0, 5    # x1 = 5
ADDI x2, x0, 10   # x2 = 10
ADD x3, x1, x2    # x3 = x1 + x2

# Click "Load Program" to start simulation`;
  }

  destroy(): void {
    this.codeEditor = null;
  }
}
