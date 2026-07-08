/**
 * SwissKnife CLI Adapter for Web Terminal
 * Provides access to SwissKnife CLI functionality within the browser terminal
 */

import { BrowserEventEmitter, generateId } from '../utils/browser-utils';

export interface CLICommand {
  name: string;
  description: string;
  usage: string;
  category: 'core' | 'ai' | 'tasks' | 'storage' | 'config' | 'system';
  handler: (args: string[], flags: Record<string, any>) => Promise<CLIResult>;
}

export interface CLIResult {
  success: boolean;
  output: string;
  exitCode: number;
  data?: any;
  error?: string;
}

export interface CommandContext {
  workingDirectory: string;
  environment: Record<string, string>;
  user: string;
  history: string[];
}

export class SwissKnifeCLIAdapter extends BrowserEventEmitter {
  private commands: Map<string, CLICommand> = new Map();
  private aliases: Map<string, string> = new Map();
  private context: CommandContext;
  private initialized = false;

  constructor() {
    super();
    const processEnv = ((globalThis as any).process?.env ?? {}) as Record<string, string>;
    this.context = {
      workingDirectory: '/home/user',
      environment: { ...processEnv, PATH: '/usr/local/bin:/usr/bin:/bin' },
      user: 'user',
      history: []
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.loadCoreCommands();
      await this.loadSwissKnifeCommands();
      await this.setupAliases();
      
      this.initialized = true;
      console.log('🔧 SwissKnife CLI Adapter initialized');
    } catch (error) {
      console.error('Failed to initialize CLI adapter:', error);
      throw error;
    }
  }

  private async loadCoreCommands(): Promise<void> {
    // Core system commands
    this.registerCommand({
      name: 'help',
      description: 'Show available commands',
      usage: 'help [command]',
      category: 'system',
      handler: this.handleHelp.bind(this)
    });

    this.registerCommand({
      name: 'ls',
      description: 'List directory contents',
      usage: 'ls [-la] [directory]',
      category: 'system',
      handler: this.handleLs.bind(this)
    });

    this.registerCommand({
      name: 'cd',
      description: 'Change directory',
      usage: 'cd [directory]',
      category: 'system',
      handler: this.handleCd.bind(this)
    });

    this.registerCommand({
      name: 'pwd',
      description: 'Print working directory',
      usage: 'pwd',
      category: 'system',
      handler: this.handlePwd.bind(this)
    });

    this.registerCommand({
      name: 'clear',
      description: 'Clear terminal screen',
      usage: 'clear',
      category: 'system',
      handler: this.handleClear.bind(this)
    });

    this.registerCommand({
      name: 'echo',
      description: 'Display text',
      usage: 'echo [text]',
      category: 'system',
      handler: this.handleEcho.bind(this)
    });

    this.registerCommand({
      name: 'env',
      description: 'Show environment variables',
      usage: 'env',
      category: 'system',
      handler: this.handleEnv.bind(this)
    });

    this.registerCommand({
      name: 'history',
      description: 'Show command history',
      usage: 'history',
      category: 'system',
      handler: this.handleHistory.bind(this)
    });
  }

  private async loadSwissKnifeCommands(): Promise<void> {
    // SwissKnife core commands
    this.registerCommand({
      name: 'sk',
      description: 'SwissKnife main command',
      usage: 'sk <subcommand> [options]',
      category: 'core',
      handler: this.handleSwissKnife.bind(this)
    });

    // AI commands
    this.registerCommand({
      name: 'sk-ai',
      description: 'AI model and chat management',
      usage: 'sk-ai <action> [options]',
      category: 'ai',
      handler: this.handleAI.bind(this)
    });

    this.registerCommand({
      name: 'sk-chat',
      description: 'Start AI chat session',
      usage: 'sk-chat [message]',
      category: 'ai',
      handler: this.handleChat.bind(this)
    });

    this.registerCommand({
      name: 'sk-models',
      description: 'List and manage AI models',
      usage: 'sk-models [list|switch|info] [model]',
      category: 'ai',
      handler: this.handleModels.bind(this)
    });

    // Task commands
    this.registerCommand({
      name: 'sk-task',
      description: 'Task management',
      usage: 'sk-task <action> [options]',
      category: 'tasks',
      handler: this.handleTask.bind(this)
    });

    this.registerCommand({
      name: 'sk-tasks',
      description: 'List tasks',
      usage: 'sk-tasks [status] [--limit N]',
      category: 'tasks',
      handler: this.handleTasks.bind(this)
    });

    this.registerCommand({
      name: 'sk-workflow',
      description: 'Workflow management',
      usage: 'sk-workflow <action> [options]',
      category: 'tasks',
      handler: this.handleWorkflow.bind(this)
    });

    // Storage commands
    this.registerCommand({
      name: 'sk-storage',
      description: 'Storage management',
      usage: 'sk-storage <action> [options]',
      category: 'storage',
      handler: this.handleStorage.bind(this)
    });

    // Configuration commands
    this.registerCommand({
      name: 'sk-config',
      description: 'Configuration management',
      usage: 'sk-config <action> [key] [value]',
      category: 'config',
      handler: this.handleConfig.bind(this)
    });

    this.registerCommand({
      name: 'sk-status',
      description: 'Show SwissKnife status',
      usage: 'sk-status',
      category: 'core',
      handler: this.handleStatus.bind(this)
    });

    this.registerCommand({
      name: 'sk-version',
      description: 'Show SwissKnife version',
      usage: 'sk-version',
      category: 'core',
      handler: this.handleVersion.bind(this)
    });
  }

  private setupAliases(): void {
    // Common aliases
    this.aliases.set('ll', 'ls -la');
    this.aliases.set('la', 'ls -la');
    this.aliases.set('h', 'help');
    this.aliases.set('c', 'clear');
    
    // SwissKnife aliases
    this.aliases.set('ai', 'sk-ai');
    this.aliases.set('chat', 'sk-chat');
    this.aliases.set('task', 'sk-task');
    this.aliases.set('tasks', 'sk-tasks');
    this.aliases.set('config', 'sk-config');
    this.aliases.set('status', 'sk-status');
  }

  registerCommand(command: CLICommand): void {
    this.commands.set(command.name, command);
  }

  async executeCommand(input: string): Promise<CLIResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const trimmed = input.trim();
    if (!trimmed) {
      return { success: true, output: '', exitCode: 0 };
    }

    this.context.history.push(trimmed);

    try {
      const parsed = this.parseCommand(trimmed);
      const command = this.resolveCommand(parsed.command);

      if (!command) {
        return {
          success: false,
          output: `Command not found: ${parsed.command}\nType 'help' for available commands.`,
          exitCode: 127
        };
      }

      const result = await command.handler(parsed.args, parsed.flags);
      this.emit('command:executed', { input, result });
      return result;

    } catch (error) {
      const errorResult = {
        success: false,
        output: `Error executing command: ${(error as Error).message}`,
        exitCode: 1,
        error: (error as Error).message
      };
      this.emit('command:error', { input, error: errorResult });
      return errorResult;
    }
  }

  private parseCommand(input: string): { command: string; args: string[]; flags: Record<string, any> } {
    const parts = input.split(/\s+/);
    const command = parts[0];
    const args: string[] = [];
    const flags: Record<string, any> = {};

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith('--')) {
        const [key, value] = part.substring(2).split('=');
        flags[key] = value || true;
      } else if (part.startsWith('-')) {
        const flagChars = part.substring(1);
        for (const char of flagChars) {
          flags[char] = true;
        }
      } else {
        args.push(part);
      }
    }

    return { command, args, flags };
  }

  private resolveCommand(commandName: string): CLICommand | null {
    // Check aliases first
    const aliased = this.aliases.get(commandName);
    if (aliased) {
      const parsed = this.parseCommand(aliased);
      commandName = parsed.command;
    }

    return this.commands.get(commandName) || null;
  }

  // Command handlers
  private async handleHelp(args: string[]): Promise<CLIResult> {
    if (args.length > 0) {
      const command = this.commands.get(args[0]);
      if (command) {
        return {
          success: true,
          output: `${command.name} - ${command.description}\nUsage: ${command.usage}`,
          exitCode: 0
        };
      } else {
        return {
          success: false,
          output: `No help available for: ${args[0]}`,
          exitCode: 1
        };
      }
    }

    const categories = ['core', 'ai', 'tasks', 'storage', 'config', 'system'] as const;
    let output = 'Available commands:\n\n';

    for (const category of categories) {
      const categoryCommands = Array.from(this.commands.values())
        .filter(cmd => cmd.category === category);
      
      if (categoryCommands.length > 0) {
        output += `${category.toUpperCase()}:\n`;
        for (const cmd of categoryCommands) {
          output += `  ${cmd.name.padEnd(15)} ${cmd.description}\n`;
        }
        output += '\n';
      }
    }

    output += 'Type "help <command>" for detailed usage information.';

    return { success: true, output, exitCode: 0 };
  }

  private async handleLs(args: string[], flags: Record<string, any>): Promise<CLIResult> {
    // Simulate file system listing
    const directory = args[0] || this.context.workingDirectory;
    const showAll = flags.a || flags.all;
    const longFormat = flags.l || flags.long;

    let files = ['documents', 'projects', 'downloads', 'config.json', '.swissknife'];
    
    if (showAll) {
      files = ['.', '..', '.bashrc', '.profile', ...files];
    }

    if (longFormat) {
      const output = files.map(file => {
        const isDir = !file.includes('.');
        const perms = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
        const size = Math.floor(Math.random() * 10000);
        const date = new Date().toLocaleDateString();
        return `${perms} 1 user user ${size.toString().padStart(8)} ${date} ${file}`;
      }).join('\n');
      
      return { success: true, output, exitCode: 0 };
    }

    return { success: true, output: files.join('  '), exitCode: 0 };
  }

  private async handleCd(args: string[]): Promise<CLIResult> {
    const target = args[0] || '/home/user';
    
    if (target === '..') {
      const parts = this.context.workingDirectory.split('/');
      parts.pop();
      this.context.workingDirectory = parts.join('/') || '/';
    } else if (target.startsWith('/')) {
      this.context.workingDirectory = target;
    } else {
      this.context.workingDirectory = `${this.context.workingDirectory}/${target}`.replace('//', '/');
    }

    return { success: true, output: '', exitCode: 0 };
  }

  private async handlePwd(): Promise<CLIResult> {
    return {
      success: true,
      output: this.context.workingDirectory,
      exitCode: 0
    };
  }

  private async handleClear(): Promise<CLIResult> {
    this.emit('terminal:clear');
    return { success: true, output: '', exitCode: 0 };
  }

  private async handleEcho(args: string[]): Promise<CLIResult> {
    return {
      success: true,
      output: args.join(' '),
      exitCode: 0
    };
  }

  private async handleEnv(): Promise<CLIResult> {
    const envVars = Object.entries(this.context.environment)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    return { success: true, output: envVars, exitCode: 0 };
  }

  private async handleHistory(): Promise<CLIResult> {
    const history = this.context.history
      .map((cmd, index) => `${(index + 1).toString().padStart(4)} ${cmd}`)
      .join('\n');
    
    return { success: true, output: history, exitCode: 0 };
  }

  // SwissKnife command handlers
  private async handleSwissKnife(args: string[]): Promise<CLIResult> {
    if (args.length === 0) {
      return {
        success: true,
        output: `SwissKnife CLI v1.0.0
Usage: sk <command> [options]

Available commands:
  ai        AI model and chat management
  task      Task management
  storage   Storage operations
  config    Configuration management
  status    Show system status
  version   Show version information

Type 'sk <command> --help' for command-specific help.`,
        exitCode: 0
      };
    }

    const subcommand = args[0];
    const subArgs = args.slice(1);

    switch (subcommand) {
      case 'ai':
        return this.handleAI(subArgs);
      case 'task':
        return this.handleTask(subArgs);
      case 'storage':
        return this.handleStorage(subArgs);
      case 'config':
        return this.handleConfig(subArgs);
      case 'status':
        return this.handleStatus();
      case 'version':
        return this.handleVersion();
      default:
        return {
          success: false,
          output: `Unknown subcommand: ${subcommand}`,
          exitCode: 1
        };
    }
  }

  private async handleAI(args: string[]): Promise<CLIResult> {
    if (args.length === 0) {
      return {
        success: true,
        output: `AI Management Commands:
  list-models    List available AI models
  switch-model   Switch active AI model
  chat          Start interactive chat
  generate      Generate text with prompt
  status        Show AI system status`,
        exitCode: 0
      };
    }

    const action = args[0];
    switch (action) {
      case 'list-models':
        return {
          success: true,
          output: `Available AI Models:
• gpt-4o (OpenAI) - Current
• claude-3-5-sonnet (Anthropic)
• gemini-pro (Google)
• llama-3.2 (Ollama)`,
          exitCode: 0
        };
      
      case 'status':
        return {
          success: true,
          output: `AI System Status:
Current Model: gpt-4o
Provider: OpenAI
Status: ✅ Online
API Key: ••••••••
Rate Limit: 500/hour (used: 23)`,
          exitCode: 0
        };

      default:
        return {
          success: false,
          output: `Unknown AI action: ${action}`,
          exitCode: 1
        };
    }
  }

  private async handleChat(args: string[]): Promise<CLIResult> {
    if (args.length === 0) {
      return {
        success: true,
        output: `Starting interactive chat session...
Type your message and press Enter. Type 'exit' to quit.

Chat>`,
        exitCode: 0
      };
    }

    const message = args.join(' ');
    // This would integrate with the actual AI adapter
    return {
      success: true,
      output: `AI Response: This is a simulated response to "${message}". Integration with real AI adapter coming soon.`,
      exitCode: 0
    };
  }

  private async handleModels(args: string[]): Promise<CLIResult> {
    const action = args[0] || 'list';
    
    switch (action) {
      case 'list':
        return {
          success: true,
          output: `Available Models:
• gpt-4o (OpenAI) [Current]
• claude-3-5-sonnet (Anthropic)
• gemini-pro (Google)
• llama-3.2 (Ollama)`,
          exitCode: 0
        };
      
      case 'switch':
        const model = args[1];
        if (!model) {
          return {
            success: false,
            output: 'Usage: sk-models switch <model-name>',
            exitCode: 1
          };
        }
        return {
          success: true,
          output: `Switched to model: ${model}`,
          exitCode: 0
        };

      default:
        return {
          success: false,
          output: `Unknown models action: ${action}`,
          exitCode: 1
        };
    }
  }

  private async handleTask(args: string[]): Promise<CLIResult> {
    if (args.length === 0) {
      return {
        success: true,
        output: `Task Management Commands:
  create        Create a new task
  list          List tasks
  show <id>     Show task details
  execute <id>  Execute a task
  delete <id>   Delete a task`,
        exitCode: 0
      };
    }

    const action = args[0];
    switch (action) {
      case 'list':
        return {
          success: true,
          output: `Tasks:
ID    Status     Priority  Title
1     pending    high      Process dataset
2     running    medium    Train AI model
3     completed  low       Update docs`,
          exitCode: 0
        };
      
      case 'create':
        const title = args.slice(1).join(' ');
        if (!title) {
          return {
            success: false,
            output: 'Usage: sk-task create <title>',
            exitCode: 1
          };
        }
        return {
          success: true,
          output: `Created task: ${title} (ID: ${generateId()})`,
          exitCode: 0
        };

      default:
        return {
          success: false,
          output: `Unknown task action: ${action}`,
          exitCode: 1
        };
    }
  }

  private async handleTasks(args: string[], flags: Record<string, any>): Promise<CLIResult> {
    const status = args[0];
    const limit = flags.limit || 10;
    
    let output = `Recent Tasks (limit: ${limit}):\n`;
    output += 'ID    Status     Priority  Created      Title\n';
    output += '1     pending    high      2 hours ago  Process dataset\n';
    output += '2     running    medium    1 hour ago   Train AI model\n';
    output += '3     completed  low       30 min ago   Update docs\n';
    
    if (status) {
      output += `\nFiltered by status: ${status}`;
    }

    return { success: true, output, exitCode: 0 };
  }

  private async handleWorkflow(args: string[]): Promise<CLIResult> {
    return {
      success: true,
      output: 'Workflow management functionality coming soon...',
      exitCode: 0
    };
  }

  private async handleStorage(args: string[]): Promise<CLIResult> {
    return {
      success: true,
      output: 'Storage management functionality coming soon...',
      exitCode: 0
    };
  }

  private async handleConfig(args: string[]): Promise<CLIResult> {
    if (args.length === 0) {
      return {
        success: true,
        output: `Configuration Commands:
  get <key>        Get configuration value
  set <key> <val>  Set configuration value
  list             List all configuration
  reset            Reset to defaults`,
        exitCode: 0
      };
    }

    const action = args[0];
    switch (action) {
      case 'list':
        return {
          success: true,
          output: `Configuration:
ai.default_model=gpt-4o
ai.api_timeout=30000
tasks.max_concurrent=5
storage.provider=local`,
          exitCode: 0
        };

      default:
        return {
          success: false,
          output: `Unknown config action: ${action}`,
          exitCode: 1
        };
    }
  }

  private async handleStatus(): Promise<CLIResult> {
    return {
      success: true,
      output: `SwissKnife Status:
Version: 1.0.0
Mode: Browser
AI: ✅ Connected (gpt-4o)
Tasks: ✅ 3 active
Storage: ✅ Local + Cloud
Config: ✅ Loaded`,
      exitCode: 0
    };
  }

  private async handleVersion(): Promise<CLIResult> {
    return {
      success: true,
      output: 'SwissKnife CLI v1.0.0 (Browser Build)',
      exitCode: 0
    };
  }

  getAvailableCommands(): CLICommand[] {
    return Array.from(this.commands.values());
  }

  getCommandsByCategory(category: string): CLICommand[] {
    return Array.from(this.commands.values())
      .filter(cmd => cmd.category === category);
  }

  getContext(): CommandContext {
    return { ...this.context };
  }

  setWorkingDirectory(path: string): void {
    this.context.workingDirectory = path;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
