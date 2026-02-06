/**
 * Code editor component with line numbers
 */

export class CodeEditor {
  private container: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private lineNumbers: HTMLElement;
  private highlightedLine: number | null;

  constructor(containerId: string, initialCode: string = '') {
    this.container = document.getElementById(containerId) as HTMLElement;
    this.highlightedLine = null;
    this.render(initialCode);
    
    this.textarea = this.container.querySelector('.code-textarea') as HTMLTextAreaElement;
    this.lineNumbers = this.container.querySelector('.line-numbers') as HTMLElement;
    
    this.setupEventListeners();
    this.updateLineNumbers();
  }

  private render(code: string): void {
    this.container.innerHTML = `
      <div class="code-editor-wrapper">
        <div class="line-numbers"></div>
        <textarea class="code-textarea" spellcheck="false">${code}</textarea>
      </div>
    `;
  }

  private setupEventListeners(): void {
    // Update line numbers on input
    this.textarea.addEventListener('input', () => {
      this.updateLineNumbers();
    });

    // Sync scroll between line numbers and textarea
    this.textarea.addEventListener('scroll', () => {
      this.lineNumbers.scrollTop = this.textarea.scrollTop;
    });
  }

  private updateLineNumbers(): void {
    const lines = this.textarea.value.split('\n');
    const lineNumbersHtml = lines.map((_, index) => {
      const lineNum = index + 1;
      const isHighlighted = this.highlightedLine === lineNum;
      const className = isHighlighted ? 'line-number highlighted' : 'line-number';
      return `<div class="${className}">${lineNum}</div>`;
    }).join('');
    
    this.lineNumbers.innerHTML = lineNumbersHtml;
  }

  getValue(): string {
    return this.textarea.value;
  }

  setValue(code: string): void {
    this.textarea.value = code;
    this.updateLineNumbers();
  }

  highlightLine(lineNumber: number | null): void {
    this.highlightedLine = lineNumber;
    this.updateLineNumbers();
  }

  setReadOnly(readonly: boolean): void {
    this.textarea.readOnly = readonly;
    if (readonly) {
      this.textarea.classList.add('readonly');
    } else {
      this.textarea.classList.remove('readonly');
    }
  }
}
