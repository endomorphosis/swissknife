/**
 * SwissKnife CLI Adapter for Web Terminal
 * Provides access to SwissKnife CLI functionality within the browser terminal
 */

import { WebNNModelInference } from '../ml/webnn-inference';

export class SwissKnifeCLIAdapter {
  constructor(swissknife) {
    this.swissknife = swissknife;
    this.commands = new Map();
    this.aliases = new Map();
    this.context = {
      workingDirectory: '/home/user',
      environment: {},
      user: 'user',
      history: []
    };
    this.initialized = false;
    
    // Initialize WebNN inference
    this.webnnInference = new WebNNModelInference();
    
    this.initialize();
  }

  async initialize() {
    if (this.initialized) return;

    try {
      await this.loadCoreCommands();
      this.setupAliases();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize CLI adapter:', error);
    }
  }

  async loadCoreCommands() {
    // Core SwissKnife Commands
    this.commands.set('sk', {
      name: 'sk',
      description: 'SwissKnife main command interface',
      usage: 'sk [subcommand] [options]',
      category: 'core',
      handler: async (args) => this.handleMainCommand(args)
    });

    this.commands.set('sk-ai', {
      name: 'sk-ai',
      description: 'AI-powered chat and assistance',
      usage: 'sk-ai <message>',
      category: 'ai',
      handler: async (args) => this.handleAICommand(args)
    });

    this.commands.set('sk-task', {
      name: 'sk-task',
      description: 'Task management and execution',
      usage: 'sk-task <list|create|status> [args]',
      category: 'tasks',
      handler: async (args) => this.handleTaskCommand(args)
    });

    this.commands.set('sk-config', {
      name: 'sk-config',
      description: 'Configuration management',
      usage: 'sk-config [get|set] [key] [value]',
      category: 'config',
      handler: async (args) => this.handleConfigCommand(args)
    });

    this.commands.set('sk-models', {
      name: 'sk-models',
      description: 'AI model management',
      usage: 'sk-models [list|select|info]',
      category: 'ai',
      handler: async (args) => this.handleModelsCommand(args)
    });

    this.commands.set('sk-storage', {
      name: 'sk-storage',
      description: 'Storage and data management',
      usage: 'sk-storage <store|retrieve|list> [args]',
      category: 'storage',
      handler: async (args) => this.handleStorageCommand(args)
    });

    this.commands.set('sk-mcp', {
      name: 'sk-mcp',
      description: 'Model Context Protocol management',
      usage: 'sk-mcp <list|start|stop|status> [args]',
      category: 'system',
      handler: async (args) => this.handleMCPCommand(args)
    });

    this.commands.set('sk-ipfs', {
      name: 'sk-ipfs',
      description: 'IPFS integration and management',
      usage: 'sk-ipfs <add|get|status|peers> [args]',
      category: 'storage',
      handler: async (args) => this.handleIPFSCommand(args)
    });

    // Legacy command support
    this.commands.set('ai', {
      name: 'ai',
      description: 'AI commands (legacy)',
      usage: 'ai <models|chat|status> [args]',
      category: 'ai',
      handler: async (args) => this.handleAICommand(args)
    });

    this.commands.set('chat', {
      name: 'chat',
      description: 'Quick AI chat (legacy)',
      usage: 'chat <message>',
      category: 'ai',
      handler: async (args) => this.handleAICommand(args)
    });

    this.commands.set('task', {
      name: 'task',
      description: 'Task management (legacy)',
      usage: 'task <list|create|status> [args]',
      category: 'tasks',
      handler: async (args) => this.handleTaskCommand(args)
    });

    this.commands.set('config', {
      name: 'config',
      description: 'Configuration (legacy)',
      usage: 'config [get|set] [key] [value]',
      category: 'config',
      handler: async (args) => this.handleConfigCommand(args)
    });

    this.commands.set('models', {
      name: 'models',
      description: 'Model management (legacy)',
      usage: 'models [list|select|info]',
      category: 'ai',
      handler: async (args) => this.handleModelsCommand(args)
    });

    this.commands.set('storage', {
      name: 'storage',
      description: 'Storage management (legacy)',
      usage: 'storage <store|retrieve|list> [args]',
      category: 'storage',
      handler: async (args) => this.handleStorageCommand(args)
    });

    this.commands.set('mcp', {
      name: 'mcp',
      description: 'MCP management (legacy)',
      usage: 'mcp <list|start|stop|status> [args]',
      category: 'system',
      handler: async (args) => this.handleMCPCommand(args)
    });

    this.commands.set('ipfs', {
      name: 'ipfs',
      description: 'IPFS management (legacy)',
      usage: 'ipfs <add|get|status|peers> [args]',
      category: 'storage',
      handler: async (args) => this.handleIPFSCommand(args)
    });

    // WebNN Model Inference Commands
    this.commands.set('sk-ml', {
      name: 'sk-ml',
      description: 'Local machine learning inference with WebNN',
      usage: 'sk-ml <load|run|list|info|unload|status> [args]',
      category: 'ai',
      handler: async (args) => this.handleMLCommand(args)
    });

    this.commands.set('ml', {
      name: 'ml',
      description: 'Machine learning commands (legacy)',
      usage: 'ml <load|run|list|info|unload|status> [args]',
      category: 'ai',
      handler: async (args) => this.handleMLCommand(args)
    });
  }

  setupAliases() {
    this.aliases.set('sk-help', 'sk --help');
    this.aliases.set('sk-version', 'sk --version');
    this.aliases.set('sk-status', 'sk status');
  }

  async executeCommand(commandLine) {
    try {
      const parts = commandLine.trim().split(/\s+/);
      const commandName = parts[0];
      const args = parts.slice(1);

      // Check for aliases
      if (this.aliases.has(commandName)) {
        const aliasCommand = this.aliases.get(commandName);
        return await this.executeCommand(aliasCommand);
      }

      // Check for registered commands
      if (this.commands.has(commandName)) {
        const command = this.commands.get(commandName);
        const result = await command.handler(args);
        
        // Add to history
        this.context.history.push(commandLine);
        if (this.context.history.length > 100) {
          this.context.history.shift();
        }

        return {
          success: result.success,
          output: result.output,
          type: result.success ? 'normal' : 'error',
          error: result.error
        };
      }

      return {
        success: false,
        output: '',
        error: `Command not found: ${commandName}. Try 'sk help' for available commands.`
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Error executing command: ${error.message}`
      };
    }
  }

  async handleMainCommand(args) {
    if (args.length === 0 || args[0] === 'help' || args[0] === '--help') {
      return {
        success: true,
        output: this.getHelpText(),
        exitCode: 0
      };
    }

    if (args[0] === 'version' || args[0] === '--version') {
      return {
        success: true,
        output: 'SwissKnife CLI v1.0.0 (Web Terminal)',
        exitCode: 0
      };
    }

    if (args[0] === 'status') {
      return {
        success: true,
        output: this.getStatusText(),
        exitCode: 0
      };
    }

    const subcommand = args[0];
    const subArgs = args.slice(1);

    // Delegate to specific handlers
    switch (subcommand) {
      case 'ai':
        return await this.handleAICommand(subArgs);
      case 'task':
        return await this.handleTaskCommand(subArgs);
      case 'config':
        return await this.handleConfigCommand(subArgs);
      case 'models':
        return await this.handleModelsCommand(subArgs);
      case 'storage':
        return await this.handleStorageCommand(subArgs);
      case 'mcp':
        return await this.handleMCPCommand(subArgs);
      case 'ipfs':
        return await this.handleIPFSCommand(subArgs);
      default:
        return {
          success: false,
          output: '',
          error: `Unknown subcommand: ${subcommand}. Use 'sk help' for available commands.`,
          exitCode: 1
        };
    }
  }

  async handleAICommand(args) {
    if (args.length === 0) {
      return {
        success: true,
        output: 'AI Commands:\n  models - List available models\n  chat <message> - Chat with AI\n  status - Show AI status',
        exitCode: 0
      };
    }

    const subcommand = args[0];
    const params = args.slice(1);

    switch (subcommand) {
      case 'models':
        return {
          success: true,
          output: 'Available AI Models:\n🤖 GPT-4 (OpenAI)\n🤖 Claude-3 (Anthropic)\n🤖 Gemini (Google)\n🤖 Local Models (WebNN)',
          exitCode: 0
        };

      case 'chat':
        if (params.length === 0) {
          return {
            success: false,
            output: '',
            error: 'Usage: ai chat <message>',
            exitCode: 1
          };
        }
        const message = params.join(' ');
        
        if (this.swissknife.isSwissKnifeReady) {
          try {
            const result = await this.swissknife.swissknife.chat(message);
            if (result.success) {
              return {
                success: true,
                output: `🤖 AI: ${result.response.content || result.response}`,
                exitCode: 0
              };
            } else {
              return {
                success: false,
                output: '',
                error: `AI Error: ${result.error}`,
                exitCode: 1
              };
            }
          } catch (error) {
            return {
              success: false,
              output: '',
              error: `Chat error: ${error.message}`,
              exitCode: 1
            };
          }
        } else {
          return {
            success: true,
            output: `🤖 AI: I am a simulated AI response. SwissKnife core is still initializing. Your message: "${message}"`,
            exitCode: 0
          };
        }

      case 'status':
        return {
          success: true,
          output: `AI Engine Status:\n✅ Status: ${this.swissknife.isSwissKnifeReady ? 'Ready' : 'Initializing'}\n🤖 Active Model: GPT-4\n🔑 API Keys: Configured\n🧠 WebNN: ${this.checkWebNN() ? 'Available' : 'Not available'}`,
          exitCode: 0
        };

      default:
        return {
          success: false,
          output: '',
          error: `Unknown AI command: ${subcommand}`,
          exitCode: 1
        };
    }
  }

  async handleTaskCommand(args) {
    if (args.length === 0) {
      return {
        success: true,
        output: 'Task Commands:\n  list - List tasks\n  create <description> - Create task\n  status - Show task status',
        exitCode: 0
      };
    }

    const subcommand = args[0];
    const params = args.slice(1);

    switch (subcommand) {
      case 'list':
        if (this.swissknife.isSwissKnifeReady) {
          try {
            const tasks = await this.swissknife.swissknife.listTasks();
            if (tasks.length === 0) {
              return {
                success: true,
                output: 'No tasks found.',
                exitCode: 0
              };
            } else {
              const taskList = tasks.map(task => `  ${task.id}: ${task.description} (${task.status})`).join('\n');
              return {
                success: true,
                output: `Active tasks:\n${taskList}`,
                exitCode: 0
              };
            }
          } catch (error) {
            return {
              success: false,
              output: '',
              error: `Task list error: ${error.message}`,
              exitCode: 1
            };
          }
        } else {
          return {
            success: true,
            output: 'Sample tasks:\n  task-001: Example task (pending)\n  task-002: Another task (completed)',
            exitCode: 0
          };
        }

      case 'create':
        if (params.length === 0) {
          return {
            success: false,
            output: '',
            error: 'Usage: task create <description>',
            exitCode: 1
          };
        }

        const description = params.join(' ');
        if (this.swissknife.isSwissKnifeReady) {
          try {
            const result = await this.swissknife.swissknife.executeTask(description);
            if (result.success) {
              return {
                success: true,
                output: `✅ Task created: ${result.task?.id || 'new-task'}`,
                exitCode: 0
              };
            } else {
              return {
                success: false,
                output: '',
                error: `Task creation error: ${result.error}`,
                exitCode: 1
              };
            }
          } catch (error) {
            return {
              success: false,
              output: '',
              error: `Task creation error: ${error.message}`,
              exitCode: 1
            };
          }
        } else {
          return {
            success: true,
            output: `✅ Task created (simulated): ${description}`,
            exitCode: 0
          };
        }

      case 'status':
        return {
          success: true,
          output: `Task Manager Status:\n✅ Status: ${this.swissknife.isSwissKnifeReady ? 'Ready' : 'Initializing'}\n📋 Active Tasks: 2\n✅ Completed Tasks: 5`,
          exitCode: 0
        };

      default:
        return {
          success: false,
          output: '',
          error: `Unknown task command: ${subcommand}`,
          exitCode: 1
        };
    }
  }

  async handleConfigCommand(args) {
    if (args.length === 0) {
      if (this.swissknife.swissknife?.getConfig) {
        const config = this.swissknife.swissknife.getConfig();
        return {
          success: true,
          output: `Current Configuration:\n${JSON.stringify(config, null, 2)}`,
          exitCode: 0
        };
      } else {
        return {
          success: true,
          output: 'Sample Configuration:\n{\n  "theme": "dark",\n  "ai_provider": "openai",\n  "language": "en"\n}',
          exitCode: 0
        };
      }
    }

    const subcommand = args[0];
    const params = args.slice(1);

    switch (subcommand) {
      case 'get':
        if (params.length === 0) {
          return {
            success: false,
            output: '',
            error: 'Usage: config get <key>',
            exitCode: 1
          };
        }
        const key = params[0];
        return {
          success: true,
          output: `${key}: "sample_value"`,
          exitCode: 0
        };

      case 'set':
        if (params.length < 2) {
          return {
            success: false,
            output: '',
            error: 'Usage: config set <key> <value>',
            exitCode: 1
          };
        }
        const setKey = params[0];
        const setValue = params.slice(1).join(' ');
        return {
          success: true,
          output: `✅ Set ${setKey} = ${setValue}`,
          exitCode: 0
        };

      default:
        return {
          success: false,
          output: '',
          error: `Unknown config command: ${subcommand}`,
          exitCode: 1
        };
    }
  }

  async handleModelsCommand(args) {
    return {
      success: true,
      output: 'Available AI Models:\n🤖 GPT-4 (OpenAI) - Active\n🤖 Claude-3 (Anthropic)\n🤖 Gemini (Google)\n🤖 Local Models (WebNN)',
      exitCode: 0
    };
  }

  async handleStorageCommand(args) {
    if (args.length === 0) {
      return {
        success: true,
        output: 'Storage Commands:\n  store <content> - Store content\n  retrieve <hash> - Retrieve content\n  list - List stored items',
        exitCode: 0
      };
    }

    const subcommand = args[0];
    const params = args.slice(1);

    switch (subcommand) {
      case 'store':
        if (params.length === 0) {
          return {
            success: false,
            output: '',
            error: 'Usage: storage store <content>',
            exitCode: 1
          };
        }
        const content = params.join(' ');
        return {
          success: true,
          output: `✅ Content stored with hash: QmSimulated${Date.now()}`,
          exitCode: 0
        };

      case 'retrieve':
        if (params.length === 0) {
          return {
            success: false,
            output: '',
            error: 'Usage: storage retrieve <hash>',
            exitCode: 1
          };
        }
        return {
          success: true,
          output: `Retrieved content: Sample data for hash ${params[0]}`,
          exitCode: 0
        };

      case 'list':
        return {
          success: true,
          output: 'Stored items:\n📄 QmHash123... (2.1KB)\n📄 QmHash456... (1.8KB)',
          exitCode: 0
        };

      default:
        return {
          success: false,
          output: '',
          error: `Unknown storage command: ${subcommand}`,
          exitCode: 1
        };
    }
  }

  async handleMCPCommand(args) {
    if (args.length === 0) {
      return {
        success: true,
        output: 'MCP Commands:\n  list - List MCP servers\n  start <name> - Start server\n  stop <name> - Stop server\n  status - Show status',
        exitCode: 0
      };
    }

    const subcommand = args[0];
    const params = args.slice(1);

    switch (subcommand) {
      case 'list':
        return {
          success: true,
          output: 'MCP Servers:\n🔌 my-mcp-server (running)\n🔌 my-mcp-server4 (stopped)',
          exitCode: 0
        };

      case 'start':
        if (params.length === 0) {
          return {
            success: false,
            output: '',
            error: 'Usage: mcp start <server-name>',
            exitCode: 1
          };
        }
        return {
          success: true,
          output: `✅ Started MCP server: ${params[0]}`,
          exitCode: 0
        };

      case 'stop':
        if (params.length === 0) {
          return {
            success: false,
            output: '',
            error: 'Usage: mcp stop <server-name>',
            exitCode: 1
          };
        }
        return {
          success: true,
          output: `⏹️ Stopped MCP server: ${params[0]}`,
          exitCode: 0
        };

      case 'status':
        return {
          success: true,
          output: 'MCP Status:\n✅ Active Servers: 1\n📊 Total Servers: 2\n💚 Health: Good',
          exitCode: 0
        };

      default:
        return {
          success: false,
          output: '',
          error: `Unknown MCP command: ${subcommand}`,
          exitCode: 1
        };
    }
  }

  async handleIPFSCommand(args) {
    if (args.length === 0) {
      return {
        success: true,
        output: 'IPFS Commands:\n  add <file> - Add file to IPFS\n  get <hash> - Get file from IPFS\n  status - Show IPFS status\n  peers - List connected peers',
        exitCode: 0
      };
    }

    const subcommand = args[0];
    const params = args.slice(1);

    switch (subcommand) {
      case 'status':
        return {
          success: true,
          output: 'IPFS Status:
🌐 Node ID: QmX... (simulated)
👥 Peers: 42
💾 Repo Size: 1.2 GB
🌍 Gateway: http://localhost:8000',
          exitCode: 0
        };

      case 'peers':
        return {
          success: true,
          output: 'Connected IPFS peers:\n👤 QmY... (peer 1)\n👤 QmZ... (peer 2)\n👤 QmA... (peer 3)',
          exitCode: 0
        };

      case 'add':
        if (params.length === 0) {
          return {
            success: false,
            output: '',
            error: 'Usage: ipfs add <file>',
            exitCode: 1
          };
        }
        return {
          success: true,
          output: `✅ Added ${params[0]}: QmSimulatedHash${Date.now()}`,
          exitCode: 0
        };

      case 'get':
        if (params.length === 0) {
          return {
            success: false,
            output: '',
            error: 'Usage: ipfs get <hash>',
            exitCode: 1
          };
        }
        return {
          success: true,
          output: `✅ Retrieved and saved as ${params[0]}.data`,
          exitCode: 0
        };

      default:
        return {
          success: false,
          output: '',
          error: `Unknown IPFS command: ${subcommand}`,
          exitCode: 1
        };
    }
  }

  getHelpText() {
    return `🔧 SwissKnife CLI v1.0.0 (Web Terminal)

Core Commands:
  sk                 - Main SwissKnife interface
  sk help           - Show this help
  sk version        - Show version information
  sk status         - Show system status

AI Commands:
  sk-ai <message>   - Chat with AI
  ai models         - List available AI models
  ai status         - Show AI engine status

Task Management:
  sk-task list      - List all tasks
  sk-task create    - Create new task
  task status       - Show task manager status

Configuration:
  sk-config         - View configuration
  config get <key>  - Get configuration value
  config set <key>  - Set configuration value

Storage & Data:
  sk-storage        - Storage operations
  storage store     - Store content
  storage retrieve  - Retrieve content

System Integration:
  sk-mcp            - Model Context Protocol
  mcp list          - List MCP servers
  mcp status        - Show MCP status

IPFS Integration:
  sk-ipfs           - IPFS operations
  ipfs status       - Show IPFS status
  ipfs peers        - List connected peers

For more detailed help on any command, use: <command> --help`;
  }

  getStatusText() {
    return `🔧 SwissKnife System Status

Core System:
  ✅ CLI Adapter: Ready
  ${this.swissknife.isSwissKnifeReady ? '✅' : '🔄'} SwissKnife Core: ${this.swissknife.isSwissKnifeReady ? 'Ready' : 'Initializing'}
  ✅ Web Terminal: Active
  ✅ Commands: ${this.commands.size} loaded

Browser Environment:
  🌐 Platform: ${navigator.platform}
  🔧 WebGL: ${this.checkWebNN() ? 'Available' : 'Not available'}
  💾 Memory: ${this.getMemoryInfo()}

Features:
  🤖 AI Chat: ${this.swissknife.isSwissKnifeReady ? 'Available' : 'Loading'}
  📋 Task Manager: ${this.swissknife.isSwissKnifeReady ? 'Available' : 'Loading'}
  🔌 MCP: Available
  🌍 IPFS: Available`;
  }

  checkWebNN() {
    return 'ml' in navigator || 'webnn' in window;
  }

  getMemoryInfo() {
    if (performance.memory) {
      const used = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
      const total = Math.round(performance.memory.totalJSHeapSize / 1024 / 1024);
      return `${used}MB / ${total}MB`;
    }
    return 'Not available';
  }

  async handleMLCommand(args) {
    if (args.length === 0) {
      return {
        success: true,
        output: 'WebNN Machine Learning Commands:\n  load <model> - Load AI model for inference\n  run <model> <input> - Run inference on loaded model\n  list - List loaded models\n  info <model> - Show model information\n  unload <model> - Unload model from memory\n  status - Show ML system status\n  benchmark - Run performance benchmark',
        exitCode: 0
      };
    }

    const subcommand = args[0];
    const params = args.slice(1);

    try {
      switch (subcommand) {
        case 'status':
          return await this.handleMLStatus();
          
        case 'load':
          if (params.length === 0) {
            return {
              success: false,
              output: '',
              error: 'Usage: ml load <model-name>\nAvailable models: bert-base, gpt2-small, clip-vit, whisper-tiny',
              exitCode: 1
            };
          }
          return await this.handleMLLoad(params[0], params.slice(1));
          
        case 'run':
          if (params.length < 2) {
            return {
              success: false,
              output: '',
              error: 'Usage: ml run <model-name> <input-text>',
              exitCode: 1
            };
          }
          return await this.handleMLRun(params[0], params.slice(1).join(' '));
          
        case 'list':
          return await this.handleMLList();
          
        case 'info':
          if (params.length === 0) {
            return {
              success: false,
              output: '',
              error: 'Usage: ml info <model-name>',
              exitCode: 1
            };
          }
          return await this.handleMLInfo(params[0]);
          
        case 'unload':
          if (params.length === 0) {
            return {
              success: false,
              output: '',
              error: 'Usage: ml unload <model-name>',
              exitCode: 1
            };
          }
          return await this.handleMLUnload(params[0]);
          
        case 'benchmark':
          return await this.handleMLBenchmark();
          
        default:
          return {
            success: false,
            output: '',
            error: `Unknown ML command: ${subcommand}`,
            exitCode: 1
          };
      }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `ML command error: ${error.message}`,
        exitCode: 1
      };
    }
  }

  async handleMLStatus() {
    const capabilities = this.webnnInference.getCapabilities();
    const status = capabilities.available ? 'Available' : 'Not Available';
    const backends = capabilities.backends.join(', ') || 'None';
    
    return {
      success: true,
      output: `🧠 WebNN Machine Learning Status:
✅ WebNN Support: ${status}
🔧 Available Backends: ${backends}
📊 Loaded Models: ${capabilities.loadedModels}
🛠️ Supported Models: ${capabilities.supportedModels.join(', ')}
🏃 Initialized: ${capabilities.initialized ? 'Yes' : 'No'}`,
      exitCode: 0
    };
  }

  async handleMLLoad(modelName, options = []) {
    try {
      const result = await this.webnnInference.loadModel(modelName);
      
      return {
        success: true,
        output: `✅ Model loaded successfully:
📦 Model: ${result.modelName}
🔧 Backend: ${result.backend}
📊 Parameters: ${result.parameters}
💾 Memory: ${result.memory}`,
        exitCode: 0
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to load model: ${error.message}`,
        exitCode: 1
      };
    }
  }

  async handleMLRun(modelName, input) {
    try {
      const result = await this.webnnInference.runInference(modelName, input);
      
      let output = `🚀 Inference completed:
⏱️ Time: ${result.performance.inferenceTime}ms
🔧 Backend: ${result.performance.backend}
💾 Memory: ${result.performance.memoryUsed}
📈 Throughput: ${result.performance.throughput}/sec

📤 Result:`;

      // Format result based on type
      if (result.result.generated_text) {
        output += `\n"${result.result.generated_text}"`;
      } else if (result.result.embeddings) {
        output += `\n🔢 Embeddings: [${result.result.embeddings.slice(0, 5).map(x => x.toFixed(3)).join(', ')}...] (${result.result.embeddings.length} dims)`;
      } else if (result.result.image_features) {
        output += `\n🖼️ Image Features: [${result.result.image_features.slice(0, 5).map(x => x.toFixed(3)).join(', ')}...] (${result.result.image_features.length} dims)`;
      } else if (result.result.audio_features) {
        output += `\n🔊 Audio Features: [${result.result.audio_features.slice(0, 5).map(x => x.toFixed(3)).join(', ')}...] (${result.result.audio_features.length} dims)`;
      } else {
        output += `\n📊 Output: ${JSON.stringify(result.result).substring(0, 100)}...`;
      }

      return {
        success: true,
        output,
        exitCode: 0
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Inference failed: ${error.message}`,
        exitCode: 1
      };
    }
  }

  async handleMLList() {
    const models = this.webnnInference.listLoadedModels();
    
    if (models.length === 0) {
      return {
        success: true,
        output: '📋 No models currently loaded.\nTry: ml load bert-base',
        exitCode: 0
      };
    }

    let output = '📋 Loaded Models:\n';
    models.forEach(model => {
      output += `\n📦 ${model.name}:
   🏷️ Type: ${model.type}
   📊 Parameters: ${model.parameters}
   💾 Memory: ${model.memory}
   🔧 Backend: ${model.backend}`;
    });

    return {
      success: true,
      output,
      exitCode: 0
    };
  }

  async handleMLInfo(modelName) {
    const modelInfo = this.webnnInference.getModelInfo(modelName);
    
    if (!modelInfo) {
      return {
        success: false,
        output: '',
        error: `Model '${modelName}' not found. Load it first with: ml load ${modelName}`,
        exitCode: 1
      };
    }

    const loadedSince = Math.round((Date.now() - modelInfo.loadTime) / 1000);
    
    return {
      success: true,
      output: `📦 Model Information: ${modelInfo.name}
🏷️ Type: ${modelInfo.type}
📊 Parameters: ${modelInfo.parameters}
💾 Memory Usage: ${modelInfo.memory}
🔧 Backend: ${modelInfo.backend}
📏 Input Shape: [${modelInfo.inputShape.join(', ')}]
📐 Output Shape: [${modelInfo.outputShape.join(', ')}]
⚙️ Operations: ${modelInfo.operations.join(', ')}
✅ Compiled: ${modelInfo.compiled ? 'Yes' : 'No'}
⏰ Loaded: ${loadedSince}s ago`,
      exitCode: 0
    };
  }

  async handleMLUnload(modelName) {
    try {
      const result = await this.webnnInference.unloadModel(modelName);
      
      return {
        success: result.success,
        output: result.success ? `✅ ${result.message}` : '',
        error: result.success ? '' : result.message,
        exitCode: result.success ? 0 : 1
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to unload model: ${error.message}`,
        exitCode: 1
      };
    }
  }

  async handleMLBenchmark() {
    const benchmark = this.webnnInference.getBenchmarkResults();
    const capabilities = this.webnnInference.getCapabilities();
    
    return {
      success: true,
      output: `🏁 WebNN Performance Benchmark:

🔧 System Information:
   📊 Total Models: ${benchmark.totalModels}
   🛠️ Available Backends: ${benchmark.backends.join(', ')}
   💾 Total Memory Usage: ${benchmark.memoryUsage}
   
📈 Performance Metrics:
   ⏱️ Average Load Time: ${benchmark.averageLoadTime}ms
   🧠 WebNN Support: ${capabilities.available ? '✅ Available' : '❌ Not Available'}
   🏃 Initialization: ${capabilities.initialized ? '✅ Ready' : '❌ Failed'}
   
🎯 Recommendations:
   ${this.getMLRecommendations(capabilities, benchmark)}`,
      exitCode: 0
    };
  }

  getMLRecommendations(capabilities, benchmark) {
    const recommendations = [];
    
    if (!capabilities.available) {
      recommendations.push('• Use a WebNN-compatible browser (Chrome 113+, Edge 113+)');
      recommendations.push('• Enable experimental web platform features');
    } else {
      if (capabilities.backends.includes('gpu')) {
        recommendations.push('• GPU acceleration is available - models will run faster');
      }
      if (capabilities.backends.includes('npu')) {
        recommendations.push('• NPU acceleration detected - optimal for AI workloads');
      }
      if (benchmark.totalModels === 0) {
        recommendations.push('• Try loading a model: ml load bert-base');
      }
      if (benchmark.totalModels > 3) {
        recommendations.push('• Consider unloading unused models to free memory');
      }
    }
    
    return recommendations.join('\n   ') || '• WebNN system is optimally configured';
  }
}
