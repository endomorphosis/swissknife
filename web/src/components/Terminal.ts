import { Terminal } from 'xterm';
import { SwissKnifeCLIAdapter } from '../adapters/cli-adapter';
import { CommandProcessor, CommandResult } from '../terminal/command-processor';
import { SwissKnifeAIAdapter } from '../adapters/ai-adapter';
import { SwissKnifeTaskAdapter } from '../adapters/task-adapter';
import { SwissKnifeStorageAdapter } from '../adapters/storage-adapter';
import { SwissKnifeConfigAdapter } from '../adapters/config-adapter';

import { FileSystemAdapter } from '../adapters/file-system-adapter'; // Import the real FileSystemAdapter

export class TerminalApp {
  private xterm: Terminal;
  private cliAdapter: SwissKnifeCLIAdapter;
  private commandProcessor: CommandProcessor;
  private aiAdapter: SwissKnifeAIAdapter;
  private taskAdapter: SwissKnifeTaskAdapter;
  private storageAdapter: SwissKnifeStorageAdapter;
  private configAdapter: SwissKnifeConfigAdapter;
  private fileSystem: VirtualFileSystem; // Placeholder
  private currentLine: string = '';
  private commandHistory: string[] = [];
  private historyIndex: number = -1;

  constructor() {
    this.commandProcessor = new CommandProcessor();
    this.aiAdapter = new SwissKnifeAIAdapter();
    this.taskAdapter = new SwissKnifeTaskAdapter();
    this.storageAdapter = new SwissKnifeStorageAdapter();
    this.configAdapter = new SwissKnifeConfigAdapter();
    this.fileSystem = new VirtualFileSystem(); // Initialize placeholder
  }

  async initializeTerminal(terminalElement: HTMLElement) {
    this.xterm = new Terminal({
      theme: {
        background: '#1a1a1a',
        foreground: '#ffffff'
      }
    });
    this.xterm.open(terminalElement);
    this.xterm.focus();

    await this.setupCLI();
    await this.setupAdapters();
    this.registerCommands();
    
    this.xterm.onData(async (data) => {
      const code = data.charCodeAt(0);

      if (code === 13) { // Enter key
        this.xterm.write('\r\n');
        const command = this.currentLine.trim();
        this.commandHistory.push(command);
        this.historyIndex = -1; // Reset history index
        this.currentLine = '';

        if (command) {
          try {
            const result = await this.commandProcessor.execute(command);
            this.displayResult(result);
          } catch (error: any) {
            this.xterm.write(`Error: ${error.message || error}\r\n`);
          }
        }
        this.prompt();
      } else if (code === 127) { // Backspace
        if (this.currentLine.length > 0) {
          this.currentLine = this.currentLine.slice(0, -1);
          this.xterm.write('\b \b');
        }
      } else if (code === 27) { // Escape sequences (arrow keys)
        switch (data) {
          case '\x1b[A': // Up arrow
            this.navigateHistory(1);
            break;
          case '\x1b[B': // Down arrow
            this.navigateHistory(-1);
            break;
          // Add other arrow key handling if needed
        }
      } else {
        this.currentLine += data;
        this.xterm.write(data);
      }
    });

    this.prompt();
  }

  private prompt() {
    this.xterm.write(`\r\n${this.fileSystem.cwd()}> `);
  }

  private displayResult(result: CommandResult) {
    this.xterm.write(result.output + '\r\n');
    if (!result.success) {
      this.xterm.write(`Command failed with exit code: ${result.exitCode}\r\n`);
    }
  }

  private navigateHistory(direction: number) {
    if (this.commandHistory.length === 0) return;

    const newIndex = this.historyIndex + direction;

    if (newIndex >= -1 && newIndex < this.commandHistory.length) {
      this.historyIndex = newIndex;
      const command = this.historyIndex === -1 ? '' : this.commandHistory[this.commandHistory.length - 1 - this.historyIndex];
      
      // Clear current line and write history command
      this.xterm.write('\x1b[2K\r'); // Clear current line
      this.xterm.write(`${this.fileSystem.cwd()}> ${command}`);
      this.currentLine = command;
    }
  }

  private async setupCLI() {
    this.cliAdapter = new SwissKnifeCLIAdapter();
    await this.cliAdapter.initialize();
    
    // Register all SwissKnife CLI commands (assuming cliAdapter can provide them)
    // const commands = await this.cliAdapter.getAvailableCommands();
    // for (const command of commands) {
    //   this.commandProcessor.register(command.name, async (args, flags) => {
    //     const result = await this.cliAdapter.executeCommand(`${command.name} ${args.join(' ')}`);
    //     return { success: true, output: result.output, exitCode: 0 }; // Adjust based on actual CLIResult
    //   });
    // }
  }

  private async setupAdapters() {
    await this.aiAdapter.initialize();
    await this.taskAdapter.initialize();
    await this.storageAdapter.initialize();
    await this.configAdapter.initialize();
  }

  private registerCommands() {
    // Core SwissKnife Commands
    this.commandProcessor.register('sk-task', this.handleTaskCommand.bind(this));
    this.commandProcessor.register('sk-ai', this.handleAICommand.bind(this));
    this.commandProcessor.register('sk-config', this.handleConfigCommand.bind(this));
    this.commandProcessor.register('sk-storage', this.handleStorageCommand.bind(this));
    
    // System Commands
    this.commandProcessor.register('ls', this.handleLsCommand.bind(this));
    this.commandProcessor.register('cd', this.handleCdCommand.bind(this));
    this.commandProcessor.register('pwd', this.handlePwdCommand.bind(this));
    this.commandProcessor.register('help', this.handleHelpCommand.bind(this));
  }
  
  private async handleTaskCommand(args: string[], flags: Record<string, string | boolean>): Promise<CommandResult> {
    try {
      const output = await this.taskAdapter.executeTaskCommand(args);
      return { success: true, output, exitCode: 0 };
    } catch (error: any) {
      return { success: false, output: error.message || String(error), exitCode: 1 };
    }
  }

  private async handleAICommand(args: string[], flags: Record<string, string | boolean>): Promise<CommandResult> {
    try {
      // Example: sk-ai chat "hello" --model gemini
      const subCommand = args[0];
      if (subCommand === 'chat') {
        const prompt = args.slice(1).join(' ');
        const model = flags.model as string || 'default';
        const response = await this.aiAdapter.chat([{ role: 'user', content: prompt }], { model });
        return { success: true, output: response.content, exitCode: 0 };
      } else if (subCommand === 'list-models') {
        const models = await this.aiAdapter.getModels();
        const output = models.map(m => `${m.provider}: ${m.name}`).join('\n');
        return { success: true, output, exitCode: 0 };
      }
      return { success: false, output: 'Unknown AI command. Use "chat <prompt>" or "list-models".', exitCode: 1 };
    } catch (error: any) {
      return { success: false, output: error.message || String(error), exitCode: 1 };
    }
  }

  private async handleConfigCommand(args: string[], flags: Record<string, string | boolean>): Promise<CommandResult> {
    try {
      const subCommand = args[0];
      if (subCommand === 'get') {
        const key = args[1];
        const value = this.configAdapter.get(key);
        return { success: true, output: `${key}: ${JSON.stringify(value)}`, exitCode: 0 };
      } else if (subCommand === 'set') {
        const key = args[1];
        const value = args[2];
        this.configAdapter.set(key, value);
        return { success: true, output: `Config ${key} set to ${value}`, exitCode: 0 };
      }
      return { success: false, output: 'Unknown config command. Use "get <key>" or "set <key> <value>".', exitCode: 1 };
    } catch (error: any) {
      return { success: false, output: error.message || String(error), exitCode: 1 };
    }
  }

  private async handleStorageCommand(args: string[], flags: Record<string, string | boolean>): Promise<CommandResult> {
    try {
      const subCommand = args[0];
      if (subCommand === 'store') {
        const key = args[1];
        const value = args[2];
        await this.storageAdapter.store(key, value);
        return { success: true, output: `Stored ${key}`, exitCode: 0 };
      } else if (subCommand === 'retrieve') {
        const key = args[1];
        const value = await this.storageAdapter.retrieve(key);
        return { success: true, output: `Retrieved ${key}: ${JSON.stringify(value)}`, exitCode: 0 };
      }
      return { success: false, output: 'Unknown storage command. Use "store <key> <value>" or "retrieve <key>".', exitCode: 1 };
    } catch (error: any) {
      return { success: false, output: error.message || String(error), exitCode: 1 };
    }
  }

  private async handleLsCommand(args: string[], flags: Record<string, string | boolean>): Promise<CommandResult> {
    try {
      const path = args[0] || await this.fileSystem.cwd();
      const files = await this.fileSystem.readdir(path);
      return { success: true, output: files.join('\n'), exitCode: 0 };
    } catch (error: any) {
      return { success: false, output: error.message || String(error), exitCode: 1 };
    }
  }

  private async handleCdCommand(args: string[], flags: Record<string, string | boolean>): Promise<CommandResult> {
    try {
      const path = args[0];
      if (path) {
        await this.fileSystem.chdir(path);
        return { success: true, output: '', exitCode: 0 };
      }
      return { success: false, output: 'Usage: cd <path>', exitCode: 1 };
    } catch (error: any) {
      return { success: false, output: error.message || String(error), exitCode: 1 };
    }
  }

  private async handlePwdCommand(args: string[], flags: Record<string, string | boolean>): Promise<CommandResult> {
    try {
      const cwd = await this.fileSystem.cwd();
      return { success: true, output: cwd, exitCode: 0 };
    } catch (error: any) {
      return { success: false, output: error.message || String(error), exitCode: 1 };
    }
  }

  private async handleHelpCommand(args: string[], flags: Record<string, string | boolean>): Promise<CommandResult> {
    const helpText = `\nSwissKnife Web Terminal Commands:\n\nCore SwissKnife Commands:\n  sk-task <subcommand> [args...] - Manage and execute tasks.\n    subcommands: create <title>, list, execute <id>\n  sk-ai <subcommand> [args...] - Interact with AI models.\n    subcommands: chat <prompt> [--model <model_name>], list-models\n  sk-config <subcommand> [args...] - Manage configurations.\n    subcommands: get <key>, set <key> <value>\n  sk-storage <subcommand> [args...] - Interact with storage.\n    subcommands: store <key> <value>, retrieve <key>\n\nSystem Commands:\n  ls [path] - List directory contents.\n  cd <path> - Change directory.\n  pwd - Print working directory.\n  help - Display this help message.\n`;
    return { success: true, output: helpText, exitCode: 0 };
  }
}
