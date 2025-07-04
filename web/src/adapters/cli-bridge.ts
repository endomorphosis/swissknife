// web/src/adapters/cli-bridge.ts
import { SwissKnifeCore } from '../../../src/core/swissknife';
import { CommandRegistry } from '../../../src/command-registry';
import { AIService } from '../../../src/ai/service';
import { TaskManager } from '../../../src/tasks/manager';

export class RealCLIBridge {
  private core: SwissKnifeCore;
  private commandRegistry: CommandRegistry;
  private aiService: AIService;
  private taskManager: TaskManager;

  async initialize() {
    // Initialize core SwissKnife functionality
    this.core = new SwissKnifeCore();
    await this.core.initialize();
    
    // Connect all services
    this.commandRegistry = CommandRegistry.getInstance();
    this.aiService = AIService.getInstance();
    this.taskManager = new TaskManager();
    
    // Register all available commands
    await this.registerAllCommands();
  }

  async executeCommand(commandLine: string): Promise<CommandResult> {
    return await this.commandRegistry.execute(commandLine);
  }
}