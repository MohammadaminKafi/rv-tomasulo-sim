/**
 * Documentation page component
 */

import { Router } from './router';
import { loadSamplePrograms, type SampleProgram } from '../data/samples';

export class DocsPage {
  private router: Router;
  private samples: SampleProgram[] = [];

  constructor(router: Router) {
    this.router = router;
  }

  render(container: HTMLElement): void {
    container.innerHTML = `
      <div class="docs-page">
        <aside class="docs-sidebar">
          <nav class="docs-nav">
            <h3>Documentation</h3>
            <ul>
              <li><a href="#execution-modes" class="docs-nav-link">Execution Modes</a></li>
              <li><a href="#instructions" class="docs-nav-link">Supported Instructions</a></li>
              <li><a href="#assembly-syntax" class="docs-nav-link">Assembly Syntax</a></li>
              <li><a href="#sample-programs" class="docs-nav-link">Sample Programs</a></li>
            </ul>
          </nav>
        </aside>
        <div class="docs-container">
          <h1>Documentation</h1>

          <!-- Execution Modes -->
          <section id="execution-modes" class="docs-section">
            <h2>Execution Modes</h2>
            <p class="section-intro">
              The simulator supports three distinct execution modes, each demonstrating 
              progressively advanced techniques in modern processor design. These modes 
              allow you to explore different approaches to instruction-level parallelism 
              and performance optimization.
            </p>
            
            <div class="mode-card">
              <h3>5-Stage Pipeline</h3>
              <p>
                The 5-Stage Pipeline mode implements the classic RISC architecture with a traditional 
                in-order execution model. This foundational approach divides instruction execution 
                into five distinct stages: Instruction Fetch (IF), Instruction Decode (ID), 
                Execute (EX), Memory Access (MEM), and Write Back (WB).
              </p>
              <p>
                In this mode, instructions flow through the pipeline sequentially, with each stage 
                completing its work before passing the instruction to the next stage. The simulator 
                handles data hazards through forwarding mechanisms and implements stall logic when 
                forwarding alone cannot resolve dependencies. Branch instructions cause pipeline 
                flushes, providing a clear demonstration of control hazards and their impact on 
                performance.
              </p>
              <p>
                <strong>Key Features:</strong>
              </p>
              <ul>
                <li>In-order instruction issue and execution</li>
                <li>Data forwarding to minimize pipeline stalls</li>
                <li>Automatic hazard detection and stall insertion</li>
                <li>Branch prediction using simple not-taken strategy</li>
                <li>Detailed stage-by-stage visualization of instruction flow</li>
              </ul>
            </div>

            <div class="mode-card">
              <h3>Tomasulo Algorithm</h3>
              <p>
                The Tomasulo Algorithm mode represents a significant advancement in processor design, 
                introducing dynamic instruction scheduling and out-of-order execution. Originally 
                developed for the IBM System/360 Model 91, this approach uses reservation stations 
                to eliminate false dependencies and maximize instruction-level parallelism.
              </p>
              <p>
                Instead of executing instructions strictly in program order, this mode dynamically 
                schedules instructions based on operand availability. The algorithm employs register 
                renaming through reservation station tags, eliminating write-after-write (WAW) and 
                write-after-read (WAR) hazards while preserving true read-after-write (RAW) dependencies. 
                The Common Data Bus (CDB) broadcasts results to all waiting instructions simultaneously, 
                enabling multiple instructions to become ready for execution in parallel.
              </p>
              <p>
                <strong>Key Features:</strong>
              </p>
              <ul>
                <li>Out-of-order execution with dynamic instruction scheduling</li>
                <li>Multiple reservation stations organized by functional unit type</li>
                <li>Implicit register renaming via reservation station tags</li>
                <li>Common Data Bus (CDB) for result broadcasting and operand wakeup</li>
                <li>Support for variable execution latencies across different instruction types</li>
                <li>Real-time visualization of reservation station states and data dependencies</li>
              </ul>
            </div>

            <div class="mode-card">
              <h3>Tomasulo with Speculation</h3>
              <p>
                The Tomasulo with Speculation mode extends the base Tomasulo algorithm with hardware 
                speculation, representing modern superscalar processor design. This mode introduces 
                a Reorder Buffer (ROB) that enables the processor to execute instructions speculatively 
                beyond branch points while maintaining precise exception handling and architectural state.
              </p>
              <p>
                Speculation allows the processor to continue executing instructions past unresolved 
                branches using branch prediction. If the prediction is correct, the speculatively 
                executed instructions commit in program order from the ROB to the architectural 
                register file, providing significant performance improvements. When a branch 
                misprediction occurs, the processor precisely recovers by squashing all speculative 
                instructions from the ROB and resuming execution from the correct path.
              </p>
              <p>
                The ROB maintains strict program order for instruction commitment, ensuring that 
                exceptions are precise and that the architectural state remains consistent even 
                when execution occurs out of order. This separation between execution and commitment 
                is fundamental to modern high-performance processors.
              </p>
              <p>
                <strong>Key Features:</strong>
              </p>
              <ul>
                <li>Hardware speculation with branch prediction (not-taken policy)</li>
                <li>Reorder Buffer (ROB) for maintaining precise architectural state</li>
                <li>Speculative execution beyond unresolved branches</li>
                <li>Precise exception handling and misprediction recovery</li>
                <li>In-order instruction commitment despite out-of-order execution</li>
                <li>Register renaming through ROB entries</li>
                <li>Comprehensive tracking of speculative instructions and their dependencies</li>
                <li>Visualization of branch prediction accuracy and squashed instructions</li>
              </ul>
            </div>
          </section>

          <!-- Supported Instructions -->
          <section id="instructions" class="docs-section">
            <h2>Supported Instructions</h2>
            
            <div class="instruction-group">
              <h3>Arithmetic Instructions</h3>
              <table class="instruction-table">
                <thead>
                  <tr>
                    <th>Instruction</th>
                    <th>Format</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>ADD</code></td>
                    <td><code>ADD rd, rs1, rs2</code></td>
                    <td>rd = rs1 + rs2</td>
                  </tr>
                  <tr>
                    <td><code>SUB</code></td>
                    <td><code>SUB rd, rs1, rs2</code></td>
                    <td>rd = rs1 - rs2</td>
                  </tr>
                  <tr>
                    <td><code>ADDI</code></td>
                    <td><code>ADDI rd, rs1, imm</code></td>
                    <td>rd = rs1 + imm</td>
                  </tr>
                  <tr>
                    <td><code>MUL</code></td>
                    <td><code>MUL rd, rs1, rs2</code></td>
                    <td>rd = rs1 * rs2</td>
                  </tr>
                  <tr>
                    <td><code>DIV</code></td>
                    <td><code>DIV rd, rs1, rs2</code></td>
                    <td>rd = rs1 / rs2</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="instruction-group">
              <h3>Logical Instructions</h3>
              <table class="instruction-table">
                <thead>
                  <tr>
                    <th>Instruction</th>
                    <th>Format</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>AND</code></td>
                    <td><code>AND rd, rs1, rs2</code></td>
                    <td>rd = rs1 & rs2</td>
                  </tr>
                  <tr>
                    <td><code>OR</code></td>
                    <td><code>OR rd, rs1, rs2</code></td>
                    <td>rd = rs1 | rs2</td>
                  </tr>
                  <tr>
                    <td><code>XOR</code></td>
                    <td><code>XOR rd, rs1, rs2</code></td>
                    <td>rd = rs1 ^ rs2</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="instruction-group">
              <h3>Memory Instructions</h3>
              <table class="instruction-table">
                <thead>
                  <tr>
                    <th>Instruction</th>
                    <th>Format</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>LD</code></td>
                    <td><code>LD rd, offset(rs1)</code></td>
                    <td>rd = mem[rs1 + offset]</td>
                  </tr>
                  <tr>
                    <td><code>ST</code></td>
                    <td><code>ST rs2, offset(rs1)</code></td>
                    <td>mem[rs1 + offset] = rs2</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="instruction-group">
              <h3>Control Flow Instructions</h3>
              <table class="instruction-table">
                <thead>
                  <tr>
                    <th>Instruction</th>
                    <th>Format</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>BEQ</code></td>
                    <td><code>BEQ rs1, rs2, label</code></td>
                    <td>if (rs1 == rs2) goto label</td>
                  </tr>
                  <tr>
                    <td><code>BNE</code></td>
                    <td><code>BNE rs1, rs2, label</code></td>
                    <td>if (rs1 != rs2) goto label</td>
                  </tr>
                  <tr>
                    <td><code>J</code></td>
                    <td><code>J label</code></td>
                    <td>goto label</td>
                  </tr>
                  <tr>
                    <td><code>NOP</code></td>
                    <td><code>NOP</code></td>
                    <td>No operation</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- Assembly Syntax -->
          <section id="assembly-syntax" class="docs-section">
            <h2>Assembly Syntax</h2>
            
            <h3>Registers</h3>
            <p>
              The simulator supports 32 general-purpose registers: <code>x0</code> through <code>x31</code>.
              Register <code>x0</code> is hardwired to zero.
            </p>

            <h3>Labels</h3>
            <p>
              Labels can be defined for branch targets. A label is defined by following an 
              identifier with a colon:
            </p>
            <pre><code>loop:
  ADDI x1, x1, 1
  BNE x1, x2, loop</code></pre>

            <h3>Comments</h3>
            <p>
              Comments start with <code>#</code> and continue to the end of the line:
            </p>
            <pre><code># This is a comment
ADDI x1, x0, 5    # x1 = 5</code></pre>

            <h3>Immediate Values</h3>
            <p>
              Immediate values can be decimal or hexadecimal (prefix with <code>0x</code>):
            </p>
            <pre><code>ADDI x1, x0, 10      # Decimal
ADDI x2, x0, 0xFF    # Hexadecimal</code></pre>
          </section>

          <!-- Sample Programs -->
          <section id="sample-programs" class="docs-section">
            <h2>Sample Programs</h2>
            <p>Click "Try It" to load a sample program into the simulator.</p>
            
            <div id="samples-container" class="samples-grid"></div>
          </section>
        </div>
      </div>
    `;

    // Load samples and render them
    this.loadAndRenderSamples();
    this.setupSidebarNavigation();
  }

  private async loadAndRenderSamples(): Promise<void> {
    try {
      console.log('DocsPage: Loading sample programs...');
      this.samples = await loadSamplePrograms();
      console.log('DocsPage: Loaded', this.samples.length, 'samples');
      this.renderSamples();
      this.setupEventListeners();
    } catch (error) {
      console.error('DocsPage: Error loading samples:', error);
      // Show error in the container
      const container = document.getElementById('samples-container');
      if (container) {
        container.innerHTML = '<div class="error">Failed to load sample programs. Check console for details.</div>';
      }
    }
  }

  private setupSidebarNavigation(): void {
    const navLinks = document.querySelectorAll('.docs-nav-link');
    
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = (e.target as HTMLElement).getAttribute('href')?.slice(1);
        if (targetId) {
          const targetElement = document.getElementById(targetId);
          if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Update active state
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
          }
        }
      });
    });
    
    // Highlight active section on scroll
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            navLinks.forEach(link => {
              const href = link.getAttribute('href')?.slice(1);
              if (href === id) {
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
              }
            });
          }
        });
      },
      { threshold: 0.2 }
    );
    
    // Observe all sections
    const sections = document.querySelectorAll('.docs-section');
    sections.forEach(section => observer.observe(section));
  }

  private renderSamples(): void {
    const container = document.getElementById('samples-container');
    if (!container) {
      console.warn('samples-container not found in DOM');
      return;
    }

    console.log('renderSamples: Rendering', this.samples.length, 'samples');
    if (this.samples.length === 0) {
      console.warn('No samples to render - showing loading message');
      container.innerHTML = '<div class="loading">Loading samples...</div>';
      return;
    }

    container.innerHTML = this.samples.map((sample, index) => `
      <div class="sample-card-enhanced">
        <div class="sample-header">
          <div class="sample-number">${String(index + 1).padStart(2, '0')}</div>
          <div class="sample-title-group">
            <h3>${sample.title}</h3>
            <p class="sample-description">${sample.description}</p>
          </div>
        </div>
        <div class="sample-code-wrapper">
          <div class="code-header">
            <span class="code-label">Assembly Code</span>
            <div class="code-actions">
              <button class="btn-copy" data-code="${this.escapeAttribute(sample.code)}" title="Copy code">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                  <rect x="3" y="5" width="8" height="10" rx="1" stroke-width="1.5"/>
                  <path d="M5 5V3a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-2" stroke-width="1.5"/>
                </svg>
              </button>
              <button class="btn btn-primary try-sample-btn" data-sample-id="${sample.id}">
                <span>Try It</span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM6 5.5l4 2.5-4 2.5V5.5z"/>
                </svg>
              </button>
            </div>
          </div>
          <pre><code>${this.escapeHtml(sample.code)}</code></pre>
        </div>
      </div>
    `).join('');

    // Setup copy buttons
    const copyButtons = container.querySelectorAll('.btn-copy');
    copyButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const code = (e.currentTarget as HTMLElement).getAttribute('data-code') || '';
        const decodedCode = this.decodeAttribute(code);
        navigator.clipboard.writeText(decodedCode).then(() => {
          // Show feedback
          const btn = e.currentTarget as HTMLElement;
          const originalHTML = btn.innerHTML;
          btn.innerHTML = '<span style="color: var(--success-color)">✓</span>';
          setTimeout(() => {
            btn.innerHTML = originalHTML;
          }, 1500);
        });
      });
    });
  }

  private setupEventListeners(): void {
    const tryButtons = document.querySelectorAll('.try-sample-btn');
    
    tryButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const sampleId = (e.currentTarget as HTMLElement).getAttribute('data-sample-id');
        const sample = this.samples.find(s => s.id === sampleId);
        
        if (sample) {
          localStorage.setItem('assemblyCode', sample.code);
          this.router.navigateTo('simulator');
        }
      });
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private escapeAttribute(text: string): string {
    return text
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '&#10;');
  }

  private decodeAttribute(text: string): string {
    return text
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#10;/g, '\n');
  }

  destroy(): void {
    // Cleanup if needed
  }
}
