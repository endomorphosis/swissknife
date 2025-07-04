# Phase 1: Unified Command Bridge Implementation

## 1.1 Enhanced CLI Integration

### Current State
- Web terminal uses `SwissKnifeCLIAdapter` with simulated responses
- Real CLI functionality exists in `src/cli/` but isn't connected

### Implementation Steps

#### 1.1.1 Create Real CLI Bridge
```typescript
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
```

#### 1.1.2 Update Web Terminal
Replace simulated CLI with real functionality:
```typescript
// web/js/adapters/cli-adapter.js - Replace existing implementation
export class SwissKnifeCLIAdapter {
  constructor(swissknife) {
    this.bridge = new RealCLIBridge();
    this.swissknife = swissknife;
  }

  async executeCommand(commandLine) {
    try {
      const result = await this.bridge.executeCommand(commandLine);
      return {
        success: result.exitCode === 0,
        output: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error.message
      };
    }
  }
}
```

#### 1.1.3 Command Discovery System
```typescript
// src/cli/discovery.ts
export class CommandDiscovery {
  static discoverCommands(): CommandInfo[] {
    return [
      // AI Commands
      { category: 'ai', commands: ['sk-ai chat', 'sk-ai models', 'sk-ai status'] },
      // Task Commands  
      { category: 'tasks', commands: ['sk-task create', 'sk-task list', 'sk-task graph'] },
      // Tool Commands
      { category: 'tools', commands: ['sk-tools list', 'sk-tools execute', 'sk-tools info'] },
      // IPFS Commands
      { category: 'ipfs', commands: ['sk-ipfs add', 'sk-ipfs get', 'sk-ipfs status'] },
      // MCP Commands
      { category: 'mcp', commands: ['sk-mcp start', 'sk-mcp list', 'sk-mcp tools'] }
    ];
  }
}
```

### Deliverables
- [ ] Real CLI bridge implementation
- [ ] Web terminal integration with actual SwissKnife core
- [ ] Command discovery and help system
- [ ] Error handling and user feedback
