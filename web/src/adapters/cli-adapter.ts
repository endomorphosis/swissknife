import { CLI } from '@swissknife/core/cli/commands';

export interface CLIResult {
  output: string;
  error?: string;
  exitCode: number;
}

export class SwissKnifeCLIAdapter {
  private cli: CLI | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('Initializing SwissKnife CLI Adapter...');
    this.cli = await CLI.create();
    this.initialized = true;
    console.log('✅ SwissKnife CLI Adapter initialized');
  }

  async executeCommand(command: string): Promise<CLIResult> {
    if (!this.cli) {
      throw new Error('CLI not initialized.');
    }
    console.log(`Executing CLI command: ${command}`);
    try {
      // commander.js parseAsync expects an array of arguments
      // We need to parse the command string into an argv-like array
      const argv = command.split(' ').filter(s => s.length > 0);
      await this.cli.run(argv);
      return { output: 'Command executed successfully.', exitCode: 0 };
    } catch (error: any) {
      console.error('Error executing CLI command:', error);
      return { output: error.message || 'Unknown error', error: error.message, exitCode: 1 };
    }
  }

  async getAvailableCommands(): Promise<string[]> {
    if (!this.cli) {
      await this.initialize();
    }
    return this.cli ? this.cli.getCommands() : [];
  }

  async dispose(): Promise<void> {
    console.log('Disposing SwissKnifeCLIAdapter resources...');
    this.cli = null;
    this.initialized = false;
  }
}