/**
 * Enhanced Terminal Application for SwissKnife Web Interface
 * Provides full CLI access with xterm.js and SwissKnife CLI integration
 */

import { SwissKnifeCLIAdapter, CLIResult } from '../adapters/cli-adapter';

export class TerminalApplication {
  private container: HTMLElement;
  private cliAdapter: SwissKnifeCLIAdapter;
  private currentLine = '';
  private cursorPosition = 0;
  private commandHistory: string[] = [];
  private historyIndex = -1;
  private isCommandRunning = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.cliAdapter = new SwissKnifeCLIAdapter();
  }

  async initialize(): Promise<void> {
    await this.cliAdapter.initialize();
    this.setupTerminal();
    this.setupEventListeners();
    this.showWelcome();
  }

  private setupTerminal(): void {
    this.container.innerHTML = `
      <div class="terminal-container">
        <div class="terminal-header">
          <div class="terminal-title">SwissKnife Terminal</div>
          <div class="terminal-controls">
            <button class="terminal-btn minimize">−</button>
            <button class="terminal-btn maximize">□</button>
            <button class="terminal-btn close">×</button>
          </div>
        </div>
        <div class="terminal-content" id="terminal-output"></div>
        <div class="terminal-input-line">
          <span class="terminal-prompt" id="terminal-prompt"></span>
          <input type="text" class="terminal-input" id="terminal-input" autocomplete="off" spellcheck="false" />
        </div>
      </div>
    `;

    this.updatePrompt();
    this.focusInput();
  }

  private setupEventListeners(): void {
    const input = this.getInputElement();
    const output = this.getOutputElement();

    // CLI adapter events
    this.cliAdapter.on('terminal:clear', () => {
      output.innerHTML = '';
    });

    this.cliAdapter.on('command:executed', (data: any) => {
      this.addToHistory(data.input);
    });

    // Input handling
    input.addEventListener('keydown', this.handleKeyDown.bind(this));
    input.addEventListener('input', this.handleInput.bind(this));

    // Click to focus
    this.container.addEventListener('click', () => {
      this.focusInput();
    });

    // Terminal controls
    const closeBtn = this.container.querySelector('.close');
    closeBtn?.addEventListener('click', () => {
      this.container.style.display = 'none';
    });

    const minimizeBtn = this.container.querySelector('.minimize');
    minimizeBtn?.addEventListener('click', () => {
      const content = this.container.querySelector('.terminal-content') as HTMLElement;
      content.style.display = content.style.display === 'none' ? 'block' : 'none';
    });
  }

  private async handleKeyDown(event: KeyboardEvent): Promise<void> {
    if (this.isCommandRunning) {
      if (event.key === 'c' && event.ctrlKey) {
        // Ctrl+C to interrupt
        this.isCommandRunning = false;
        this.appendOutput('^C');
        this.showPrompt();
      }
      return;
    }

    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        await this.executeCommand();
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.navigateHistory(-1);
        break;

      case 'ArrowDown':
        event.preventDefault();
        this.navigateHistory(1);
        break;

      case 'Tab':
        event.preventDefault();
        this.handleTabCompletion();
        break;

      case 'c':
        if (event.ctrlKey) {
          event.preventDefault();
          this.clearCurrentLine();
        }
        break;

      case 'l':
        if (event.ctrlKey) {
          event.preventDefault();
          this.clearTerminal();
        }
        break;

      case 'u':
        if (event.ctrlKey) {
          event.preventDefault();
          this.clearCurrentLine();
        }
        break;
    }
  }

  private handleInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.currentLine = input.value;
    this.cursorPosition = input.selectionStart || 0;
  }

  private async executeCommand(): Promise<void> {
    const command = this.currentLine.trim();
    const input = this.getInputElement();

    // Show the command being executed
    this.appendOutput(`${this.getPromptText()}${command}`);

    // Clear input
    input.value = '';
    this.currentLine = '';

    if (!command) {
      this.showPrompt();
      return;
    }

    this.isCommandRunning = true;

    try {
      const result = await this.cliAdapter.executeCommand(command);
      this.displayResult(result);
    } catch (error) {
      this.appendOutput(`Error: ${(error as Error).message}`, 'error');
    }

    this.isCommandRunning = false;
    this.showPrompt();
  }

  private displayResult(result: CLIResult): void {
    if (result.output) {
      const outputClass = result.success ? 'output' : 'error';
      this.appendOutput(result.output, outputClass);
    }

    if (!result.success && result.error) {
      this.appendOutput(`Error: ${result.error}`, 'error');
    }
  }

  private navigateHistory(direction: number): void {
    if (this.commandHistory.length === 0) return;

    this.historyIndex += direction;

    if (this.historyIndex < 0) {
      this.historyIndex = -1;
      this.currentLine = '';
    } else if (this.historyIndex >= this.commandHistory.length) {
      this.historyIndex = this.commandHistory.length - 1;
    }

    if (this.historyIndex >= 0) {
      this.currentLine = this.commandHistory[this.historyIndex];
    }

    const input = this.getInputElement();
    input.value = this.currentLine;
    input.setSelectionRange(this.currentLine.length, this.currentLine.length);
  }

  private handleTabCompletion(): void {
    const input = this.currentLine.substring(0, this.cursorPosition);
    const words = input.split(/\s+/);
    const currentWord = words[words.length - 1] || '';

    if (words.length === 1) {
      // Command completion
      this.completeCommand(currentWord);
    } else {
      // Argument completion (files, options, etc.)
      this.completeArgument(currentWord, words[0]);
    }
  }

  private completeCommand(partial: string): void {
    const commands = this.cliAdapter.getAvailableCommands();
    const matches = commands
      .map(cmd => cmd.name)
      .filter(name => name.startsWith(partial))
      .sort();

    if (matches.length === 1) {
      const completion = matches[0];
      const input = this.getInputElement();
      input.value = completion + ' ';
      this.currentLine = completion + ' ';
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (matches.length > 1) {
      this.appendOutput(`\n${matches.join('  ')}`);
      this.showPrompt();
    }
  }

  private completeArgument(partial: string, command: string): void {
    // Basic file/directory completion simulation
    const suggestions = ['config/', 'documents/', 'projects/', 'downloads/'];
    const matches = suggestions.filter(s => s.startsWith(partial));

    if (matches.length === 1) {
      const completion = matches[0];
      const parts = this.currentLine.split(/\s+/);
      parts[parts.length - 1] = completion;
      const newLine = parts.join(' ');
      
      const input = this.getInputElement();
      input.value = newLine;
      this.currentLine = newLine;
      input.setSelectionRange(newLine.length, newLine.length);
    } else if (matches.length > 1) {
      this.appendOutput(`\n${matches.join('  ')}`);
      this.showPrompt();
    }
  }

  private clearCurrentLine(): void {
    const input = this.getInputElement();
    input.value = '';
    this.currentLine = '';
    this.cursorPosition = 0;
  }

  private clearTerminal(): void {
    const output = this.getOutputElement();
    output.innerHTML = '';
    this.showWelcome();
  }

  private addToHistory(command: string): void {
    if (command.trim() && command !== this.commandHistory[this.commandHistory.length - 1]) {
      this.commandHistory.push(command);
      
      // Limit history size
      if (this.commandHistory.length > 1000) {
        this.commandHistory.shift();
      }
    }
    this.historyIndex = -1;
  }

  private appendOutput(text: string, className = 'output'): void {
    const output = this.getOutputElement();
    const div = document.createElement('div');
    div.className = `terminal-line ${className}`;
    div.textContent = text;
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
  }

  private showPrompt(): void {
    this.updatePrompt();
    this.focusInput();
  }

  private updatePrompt(): void {
    const promptElement = this.getPromptElement();
    const context = this.cliAdapter.getContext();
    promptElement.textContent = `${context.user}@swissknife:${context.workingDirectory}$ `;
  }

  private getPromptText(): string {
    const context = this.cliAdapter.getContext();
    return `${context.user}@swissknife:${context.workingDirectory}$ `;
  }

  private showWelcome(): void {
    const welcomeText = `
SwissKnife Terminal v1.0.0
Type 'help' for available commands, 'sk --help' for SwissKnife commands.

`;
    this.appendOutput(welcomeText, 'welcome');
    this.showPrompt();
  }

  private focusInput(): void {
    const input = this.getInputElement();
    input.focus();
  }

  private getInputElement(): HTMLInputElement {
    return this.container.querySelector('#terminal-input') as HTMLInputElement;
  }

  private getOutputElement(): HTMLElement {
    return this.container.querySelector('#terminal-output') as HTMLElement;
  }

  private getPromptElement(): HTMLElement {
    return this.container.querySelector('#terminal-prompt') as HTMLElement;
  }

  // Public methods for external control
  executeCommandExternal(command: string): Promise<CLIResult> {
    return this.cliAdapter.executeCommand(command);
  }

  appendMessage(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
    this.appendOutput(message, type);
  }

  focus(): void {
    this.focusInput();
  }

  clear(): void {
    this.clearTerminal();
  }

  getHistory(): string[] {
    return [...this.commandHistory];
  }
}

// CSS styles for the terminal
export const terminalStyles = `
.terminal-container {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  background: #1a1a1a;
  color: #ffffff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  height: 100%;
  display: flex;
  flex-direction: column;
}

.terminal-header {
  background: #2d2d2d;
  padding: 8px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #404040;
}

.terminal-title {
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
}

.terminal-controls {
  display: flex;
  gap: 8px;
}

.terminal-btn {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.terminal-btn.minimize {
  background: #ffbd2e;
}

.terminal-btn.maximize {
  background: #28ca42;
}

.terminal-btn.close {
  background: #ff5f56;
  color: white;
}

.terminal-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  font-size: 14px;
  line-height: 1.4;
}

.terminal-line {
  margin: 2px 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.terminal-line.welcome {
  color: #64dd17;
}

.terminal-line.output {
  color: #ffffff;
}

.terminal-line.error {
  color: #f44336;
}

.terminal-line.info {
  color: #2196f3;
}

.terminal-line.warning {
  color: #ff9800;
}

.terminal-input-line {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background: #1a1a1a;
  border-top: 1px solid #404040;
}

.terminal-prompt {
  color: #64dd17;
  font-weight: 500;
  white-space: nowrap;
  margin-right: 8px;
}

.terminal-input {
  flex: 1;
  background: transparent;
  border: none;
  color: #ffffff;
  font-family: inherit;
  font-size: 14px;
  outline: none;
  caret-color: #ffffff;
}

.terminal-input::placeholder {
  color: #666666;
}

/* Scrollbar styling */
.terminal-content::-webkit-scrollbar {
  width: 8px;
}

.terminal-content::-webkit-scrollbar-track {
  background: #2d2d2d;
}

.terminal-content::-webkit-scrollbar-thumb {
  background: #555555;
  border-radius: 4px;
}

.terminal-content::-webkit-scrollbar-thumb:hover {
  background: #666666;
}
`;
