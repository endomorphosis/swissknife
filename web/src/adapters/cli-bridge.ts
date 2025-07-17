// web/src/adapters/cli-bridge.ts
import { CLI } from '../../../src/cli/commands';
import { CommandRegistry } from '../../../src/command-registry';
import { AIService } from '../../../src/ai/service';
import { TaskManager } from '../../../src/tasks/manager';

export class RealCLIBridge {
  private cli: CLI;
  private commandRegistry: CommandRegistry;
  private aiService: AIService;
  private taskManager: TaskManager;

  async initialize() {
    // Initialize the main CLI application, which registers all commands
    this.cli = await CLI.create();
    
    // Connect all services (they should now be available via the initialized CLI)
    this.commandRegistry = CommandRegistry.getInstance();
     
  }

  async executeCommand(commandLine: string): Promise<any> {
    // The CLI's run method expects argv-like array, so we parse the commandLine string
    const argv = quote.split(commandLine);
    // Temporarily capture console.log/error to return output
    let output = '';
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args: any[]) => { output += args.join(' ') + '\n'; };
    console.error = (...args: any[]) => { output += args.join(' ') + '\n'; };

    try {
      await this.cli.run(argv);
      return { success: true, output: output };
    } catch (error: any) {
      return { success: false, error: error.message, output: output };
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  }
}