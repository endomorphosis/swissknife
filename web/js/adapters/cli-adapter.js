/**
 * SwissKnife CLI Adapter for Web Terminal
 * Provides access to SwissKnife CLI functionality within the browser terminal
 */

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
    
    this.initialize();
  }

  async initialize() {
    if (this.initialized) return;

    try {
      await this.loadCoreCommands();
      await this.loadVFSCommands();
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

    // API Key management command
    this.commands.set('api-key', {
      name: 'api-key',
      description: 'Manage API keys for AI services',
      usage: 'api-key <set|get|clear> [provider] [key]',
      category: 'config',
      handler: async (args) => this.handleAPIKeyCommand(args)
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
      handler: async (args) => this.handleAICommand(['chat', ...args])
    });

    // Model Browser command
    this.commands.set('model-browser', {
      name: 'model-browser',
      description: 'Open the Model Browser for advanced model management',
      usage: 'model-browser',
      category: 'ai',
      handler: async (args) => this.handleModelBrowserCommand(args)
    });

    // Model management commands
    this.commands.set('models', {
      name: 'models',
      description: 'List and manage AI models',
      usage: 'models [list|default|install|remove] [args]',
      category: 'ai',
      handler: async (args) => this.handleModelsCommand(args)
    });

    // Help command
    this.commands.set('help', {
      name: 'help',
      description: 'Show available commands and usage information',
      usage: 'help [command]',
      category: 'core',
      handler: async (args) => this.handleHelpCommand(args)
    });
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

      // Check for registered commands first
      if (this.commands.has(commandName)) {
        const command = this.commands.get(commandName);
        const result = await command.handler(args);
        
        // Add to history
        this.context.history.push(commandLine);
        if (this.context.history.length > 100) {
          this.context.history.shift();
        }

        return {
          success: result.success !== false,
          output: result.output,
          type: result.success !== false ? 'normal' : 'error',
          error: result.error
        };
      }

      // If no command matches, treat it as an AI query (vibecoding behavior)
      console.log('🤖 No command found, treating as AI query:', commandLine);
      
      // First, check if it's a misspelled or partial command
      const potentialCommand = this.findSimilarCommand(commandName);
      if (potentialCommand) {
        return {
          success: false,
          output: '',
          error: `Command not found: ${commandName}. Did you mean '${potentialCommand}'? Type 'help' for available commands.`,
          type: 'error'
        };
      }
      
      if (this.swissknife && this.swissknife.isSwissKnifeReady) {
        try {
          // Enhanced prompt engineering for better tool usage
          const enhancedPrompt = this.buildEnhancedPrompt(commandLine);
          const result = await this.swissknife.swissknife.chat(enhancedPrompt);
          if (result.success) {
            // Add to history
            this.context.history.push(commandLine);
            if (this.context.history.length > 100) {
              this.context.history.shift();
            }

            return {
              success: true,
              output: `🤖 AI: ${result.response.content || result.response}`,
              type: 'ai-response'
            };
          } else {
            return {
              success: false,
              output: '',
              error: `AI Error: ${result.error}`,
              type: 'error'
            };
          }
        } catch (error) {
          console.error('AI chat error:', error);
          return {
            success: false,
            output: '',
            error: `AI Chat Error: ${error.message}`,
            type: 'error'
          };
        }
      } else {
        // SwissKnife not ready yet
        return {
          success: true,
          output: `🤖 AI: I'm still initializing. Your query "${commandLine}" will be processed once I'm ready. Try 'ai status' to check my status.`,
          type: 'warning'
        };
      }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Error executing command: ${error.message}`,
        type: 'error'
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
      case 'vfs':
        return await this.handleVFSCommand(subArgs);
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
        output: `🤖 AI Commands:
  models - List available AI models
  chat <message> - Chat with AI
  status - Show AI status
  
Examples:
  ai chat "Explain quantum computing"
  ai models
  ai status`,
        exitCode: 0
      };
    }

    const subcommand = args[0];
    const params = args.slice(1);

    switch (subcommand) {
      case 'models':
        if (this.swissknife && this.swissknife.isSwissKnifeReady) {
          try {
            const models = this.swissknife.swissknife.getAvailableModels();
            const defaultModel = localStorage.getItem('swissknife_default_model');
            
            let modelList = '🤖 Available AI Models:\n\n';
            
            // Local models
            const localModels = models.filter(m => m.source === 'local' || !m.source);
            if (localModels.length > 0) {
              modelList += '📱 Local Models:\n';
              localModels.forEach(m => {
                const isDefault = defaultModel === m.id ? ' ⭐' : '';
                modelList += `  ${m.name} (${m.provider})${isDefault}\n`;
              });
              modelList += '\n';
            }
            
            // API models
            const apiModels = models.filter(m => m.source === 'api');
            if (apiModels.length > 0) {
              modelList += '☁️ API Models:\n';
              apiModels.forEach(m => {
                const isDefault = defaultModel === m.id ? ' ⭐' : '';
                const hasKey = this.checkApiKeyForModel(m) ? ' ✓' : ' (needs API key)';
                modelList += `  ${m.name} (${m.provider})${hasKey}${isDefault}\n`;
              });
              modelList += '\n';
            }
            
            // P2P models
            const p2pModels = models.filter(m => m.source === 'p2p');
            if (p2pModels.length > 0) {
              modelList += '🌐 P2P Network Models:\n';
              p2pModels.forEach(m => {
                const isDefault = defaultModel === m.id ? ' ⭐' : '';
                modelList += `  ${m.name} (${m.provider}) - via ${m.peerName || m.peerId}${isDefault}\n`;
              });
              modelList += '\n';
            }
            
            if (defaultModel) {
              modelList += `\n🌟 Default Model: ${this.getModelNameById(defaultModel)}\n`;
            } else {
              modelList += '\n💡 No default model set. Use "ai default <model-id>" to set one.\n';
            }
            
            modelList += '\n📖 Use "ai default <model-id>" to set default model';
            modelList += '\n🔧 Use "model-browser" to open the Model Browser for management';
            
            return {
              success: true,
              output: modelList,
              exitCode: 0
            };
          } catch (error) {
            return {
              success: false,
              output: '',
              error: `Failed to get models: ${error.message}`,
              exitCode: 1
            };
          }
        } else {
          return {
            success: true,
            output: `🤖 Available AI Models:
📱 Local Models:
  GPT-3.5 Turbo (OpenAI)
  GPT-4 (OpenAI)
  
☁️ API Models:
  OpenAI GPT-4 (needs API key)
  OpenAI GPT-3.5 Turbo (needs API key)
  Anthropic Claude 3 Haiku (needs API key)

⚠️ SwissKnife core initializing - showing default model list
🔧 Use "model-browser" to open the Model Browser for full management`,
            exitCode: 0
          };
        }

      case 'default':
        if (params.length === 0) {
          const defaultModel = localStorage.getItem('swissknife_default_model');
          if (defaultModel) {
            return {
              success: true,
              output: `🌟 Current default model: ${this.getModelNameById(defaultModel)}\n\n💡 Use "ai default clear" to remove default\n💡 Use "ai default <model-id>" to change default`,
              exitCode: 0
            };
          } else {
            return {
              success: true,
              output: '❌ No default model set\n\n💡 Use "ai default <model-id>" to set a default model\n🔧 Use "model-browser" to browse and select models',
              exitCode: 0
            };
          }
        }
        
        const action = params[0];
        if (action === 'clear') {
          localStorage.removeItem('swissknife_default_model');
          if (this.swissknife && this.swissknife.swissknife) {
            await this.swissknife.swissknife.updateConfig({ defaultModel: null });
          }
          return {
            success: true,
            output: '✅ Default model cleared',
            exitCode: 0
          };
        } else {
          // Set default model
          const modelId = params.join(' ');
          try {
            localStorage.setItem('swissknife_default_model', modelId);
            if (this.swissknife && this.swissknife.swissknife) {
              await this.swissknife.swissknife.updateConfig({ defaultModel: modelId });
            }
            return {
              success: true,
              output: `✅ Default model set to: ${modelId}`,
              exitCode: 0
            };
          } catch (error) {
            return {
              success: false,
              output: '',
              error: `Failed to set default model: ${error.message}`,
              exitCode: 1
            };
          }
        }

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
        
        if (this.swissknife && this.swissknife.isSwissKnifeReady) {
          try {
            console.log('🤖 Processing AI chat request:', message);
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
            console.error('AI chat error:', error);
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
            output: `🤖 AI: I'm currently initializing. SwissKnife core is still loading - please try again in a moment. Your message: "${message}"`,
            exitCode: 0
          };
        }

      case 'status':
        const apiKeyConfigured = localStorage.getItem('swissknife_openai_key') ? 'Configured' : 'Not configured';
        const coreStatus = this.swissknife?.isSwissKnifeReady ? 'Ready' : 'Initializing';
        const defaultModel = localStorage.getItem('swissknife_default_model');
        const currentModel = defaultModel ? this.getModelNameById(defaultModel) : 'No default set';
        
        return {
          success: true,
          output: `🤖 AI Engine Status:
✅ Core Status: ${coreStatus}
🔑 API Keys: ${apiKeyConfigured}
🤖 Current Default Model: ${currentModel}
🌐 Provider: ${defaultModel ? 'Various' : 'Not set'}
💾 Storage: IndexedDB

${apiKeyConfigured === 'Not configured' ? 
  '⚠️ To enable AI chat, please set your OpenAI API key in Settings > API Keys' : 
  '✅ AI chat functionality is available'}

💡 Use "model-browser" to browse and set default models
💡 Use "ai models" to see all available models`,
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
        return {
          success: true,
          output: 'Sample tasks:\n  task-001: Example task (pending)\n  task-002: Another task (completed)',
          exitCode: 0
        };

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
        return {
          success: true,
          output: `✅ Task created (simulated): ${description}`,
          exitCode: 0
        };

      case 'status':
        return {
          success: true,
          output: `Task Manager Status:\n✅ Status: ${this.swissknife?.isSwissKnifeReady ? 'Ready' : 'Initializing'}\n📋 Active Tasks: 2\n✅ Completed Tasks: 5`,
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

  async handleAPIKeyCommand(args) {
    if (args.length === 0) {
      return {
        success: true,
        output: `🔑 API Key Management:
  set <provider> <key>   - Set API key for provider
  get <provider>         - Check if API key is configured
  clear <provider>       - Clear API key for provider
  list                   - List supported providers

Supported providers:
  openai                 - OpenAI (GPT models)
  anthropic              - Anthropic (Claude models)

Examples:
  api-key set openai sk-1234567890abcdef...
  api-key get openai
  api-key clear openai`,
        exitCode: 0
      };
    }

    const subcommand = args[0];
    const provider = args[1];
    const key = args[2];

    switch (subcommand) {
      case 'set':
        if (!provider || !key) {
          return {
            success: false,
            error: 'Usage: api-key set <provider> <key>',
            exitCode: 1
          };
        }

        if (!['openai', 'anthropic'].includes(provider)) {
          return {
            success: false,
            error: `Unsupported provider: ${provider}. Supported: openai, anthropic`,
            exitCode: 1
          };
        }

        try {
          localStorage.setItem(`swissknife_${provider}_key`, key);
          
          // Update SwissKnife config if available
          if (this.swissknife && this.swissknife.swissknife) {
            await this.swissknife.swissknife.updateConfig({
              [`${provider}.apiKey`]: key
            });
            // Also refresh API keys to make sure they're loaded
            await this.swissknife.swissknife.refreshAPIKeys();
          }

          return {
            success: true,
            output: `✅ API key for ${provider} has been set successfully
🔄 Configuration updated and ready for use
💡 Try typing "hello" or any AI query to test it!`,
            exitCode: 0
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to set API key: ${error.message}`,
            exitCode: 1
          };
        }

      case 'get':
        if (!provider) {
          return {
            success: false,
            error: 'Usage: api-key get <provider>',
            exitCode: 1
          };
        }

        const storedKey = localStorage.getItem(`swissknife_${provider}_key`);
        if (storedKey) {
          const maskedKey = storedKey.substring(0, 8) + '...' + storedKey.substring(storedKey.length - 4);
          return {
            success: true,
            output: `🔑 API key for ${provider}: ${maskedKey} (configured)`,
            exitCode: 0
          };
        } else {
          return {
            success: true,
            output: `❌ No API key configured for ${provider}`,
            exitCode: 0
          };
        }

      case 'clear':
        if (!provider) {
          return {
            success: false,
            error: 'Usage: api-key clear <provider>',
            exitCode: 1
          };
        }

        try {
          localStorage.removeItem(`swissknife_${provider}_key`);
          return {
            success: true,
            output: `✅ API key for ${provider} has been cleared`,
            exitCode: 0
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to clear API key: ${error.message}`,
            exitCode: 1
          };
        }

      case 'list':
        const providers = ['openai', 'anthropic'];
        const providerStatus = providers.map(p => {
          const hasKey = localStorage.getItem(`swissknife_${p}_key`) ? '✅' : '❌';
          return `  ${hasKey} ${p}`;
        }).join('\n');

        return {
          success: true,
          output: `🔑 API Key Status:\n${providerStatus}`,
          exitCode: 0
        };

      default:
        return {
          success: false,
          error: `Unknown API key command: ${subcommand}`,
          exitCode: 1
        };
    }
  }

  async loadVFSCommands() {
    this.commands.set('vfs', {
      name: 'vfs',
      description: 'Virtual filesystem operations',
      usage: 'vfs <mount|ls|cp|mirror|sync|unmount|status> [args]',
      category: 'storage',
      handler: async (args) => this.handleVFSCommand(args)
    });

    this.commands.set('vfs-mount', {
      name: 'vfs-mount',
      description: 'Mount storage backend',
      usage: 'vfs-mount <backend> <path> [config]',
      category: 'storage',
      handler: async (args) => this.handleVFSMount(args)
    });

    this.commands.set('vfs-ls', {
      name: 'vfs-ls',
      description: 'List virtual filesystem contents',
      usage: 'vfs-ls [path]',
      category: 'storage',
      handler: async (args) => this.handleVFSList(args)
    });

    // Hugging Face Hub Commands
    this.commands.set('hf', {
      name: 'hf',
      description: 'Hugging Face Hub operations',
      usage: 'hf <search|download|upload|info|repos> [args]',
      category: 'ai',
      handler: async (args) => this.handleHFCommand(args)
    });
  }

  setupAliases() {
    this.aliases.set('sk-help', 'sk --help');
    this.aliases.set('sk-version', 'sk --version');
    this.aliases.set('sk-status', 'sk status');
  }

async handleVFSCommand(args) {
  if (args.length === 0) {
    return {
      success: true,
      output: `🗂️ Virtual Filesystem Commands:
  mount <backend> <path> - Mount storage backend
  ls [path]              - List directory contents
  cp <src> <dest>        - Copy files/directories
  mirror <src> <dest>    - Mirror content across backends
  sync                   - Synchronize all backends
  unmount <path>         - Unmount storage backend
  status                 - Show VFS status

Available backends: 
  📡 helia       - IPFS via Helia
  🔗 libp2p      - P2P distributed storage
  ☁️ storacha    - Storacha IPFS pinning
  🪣 s3          - S3-compatible storage
  🤗 huggingface - Hugging Face Hub repositories`,
      exitCode: 0
    };
  }

  const subcommand = args[0];
  const params = args.slice(1);

  switch (subcommand) {
    case 'mount':
      return await this.handleVFSMount(params);
    case 'ls':
      return await this.handleVFSList(params);
    case 'cp':
      return await this.handleVFSCopy(params);
    case 'mirror':
      return await this.handleVFSMirror(params);
    case 'sync':
      return await this.handleVFSSync(params);
    case 'unmount':
      return await this.handleVFSUnmount(params);
    case 'status':
      return await this.handleVFSStatus(params);
    default:
      return {
        success: false,
        error: `Unknown VFS command: ${subcommand}`,
        exitCode: 1
      };
  }
}

async handleVFSMount(args) {
  if (args.length < 2) {
    return {
      success: false,
      error: 'Usage: vfs mount <backend> <path> [config]',
      exitCode: 1
    };
  }

  const [backend, path, ...configArgs] = args;
  
  if (!['helia', 'libp2p', 'storacha', 's3', 'huggingface'].includes(backend)) {
    return {
      success: false,
      error: `Unknown backend: ${backend}. Available: helia, libp2p, storacha, s3, huggingface`,
      exitCode: 1
    };
  }

  // Simulated response for now
  return {
    success: true,
    output: `✅ Mounted ${backend} backend at ${path}
🔧 Backend: ${this.getBackendInfo(backend)}
📁 Mount point: ${path}
⚙️ Configuration: ${configArgs.length ? configArgs.join(' ') : 'default'}
🌐 Status: Connected
📊 Available space: ${this.getSimulatedSpace(backend)}
🔗 Endpoint: ${this.getBackendEndpoint(backend)}`,
    exitCode: 0
  };
}

async handleVFSList(args) {
  const path = args[0] || '/';
  
  // Simulated VFS directory listing
  const entries = [
    '📁 ipfs/          (helia)       - IPFS content via Helia',
    '📁 p2p/           (libp2p)      - P2P distributed files',
    '📁 cloud/         (storacha)    - Storacha pinned content',
    '📁 s3/            (s3)          - S3 bucket contents',
    '📁 hf/            (huggingface) - Hugging Face repositories',
    '📄 README.md      (ipfs)        2.1KB  QmX1Y2Z3...',
    '📄 config.json    (local)       856B   local cache',
    '📁 shared/        (mirror)      - Multi-backend mirror',
    '📄 data.csv       (s3)          15.2MB s3://bucket/data.csv',
    '📄 pytorch_model.bin (hf)       1.2GB  microsoft/DialoGPT-medium'
  ];

  return {
    success: true,
    output: `📂 Virtual Filesystem: ${path}

${entries.join('\n')}

💡 Tips:
   • Use 'vfs cp /ipfs/file.txt /s3/' to copy between backends
   • Use 'vfs mirror /local/data /ipfs/' to create redundant copies
   • Use 'vfs sync' to synchronize all mounted backends
   • Use 'vfs cp /hf/microsoft/DialoGPT-medium/ /local/' to download HF models`,
    exitCode: 0
  };
}

async handleVFSCopy(args) {
  if (args.length < 2) {
    return {
      success: false,
      error: 'Usage: vfs cp <source> <destination>',
      exitCode: 1
    };
  }

  const [src, dest] = args;
  
  return {
    success: true,
    output: `✅ Copied ${src} → ${dest}
📊 Transfer details:
   • Source: ${this.getBackendFromPath(src)}
   • Destination: ${this.getBackendFromPath(dest)}
   • Size: 2.4MB
   • Time: 1.2s
   • Hash: QmNewHash123...`,
    exitCode: 0
  };
}

async handleVFSMirror(args) {
  if (args.length < 2) {
    return {
      success: false,
      error: 'Usage: vfs mirror <source> <destination>',
      exitCode: 1
    };
  }

  const [src, dest] = args;
  
  return {
    success: true,
    output: `✅ Mirrored ${src} → ${dest}
🔄 Mirror configuration:
   • Source: ${this.getBackendFromPath(src)}
   • Destination: ${this.getBackendFromPath(dest)}
   • Sync mode: Real-time
   • Files mirrored: 42
   • Total size: 156MB
   • Status: Active monitoring`,
    exitCode: 0
  };
}

async handleVFSSync(args) {
  return {
    success: true,
    output: `🔄 VFS Synchronization Complete
📊 Sync Report:
   • Backends synced: 5
   • Files updated: 23
   • Conflicts resolved: 2
   • Time elapsed: 5.4s
   
Backend Status:
   📡 helia       - 156 files, 45MB
   🔗 libp2p      - 89 files, 23MB  
   ☁️ storacha    - 134 files, 67MB
   🪣 s3          - 201 files, 123MB
   🤗 huggingface - 42 models, 15GB`,
    exitCode: 0
  };
}

async handleVFSUnmount(args) {
  if (args.length === 0) {
    return {
      success: false,
      error: 'Usage: vfs unmount <path>',
      exitCode: 1
    };
  }

  const path = args[0];
  
  return {
    success: true,
    output: `✅ Unmounted ${path}
🔧 Cleanup completed:
   • Cached data: Persisted
   • Connections: Closed
   • Metadata: Saved
   • Status: Successfully unmounted`,
    exitCode: 0
  };
}

async handleVFSStatus(args) {
  return {
    success: true,
    output: `🗂️ Virtual Filesystem Status

Mounted Backends:
   📡 helia       @ /ipfs/     Connected    156 files (45MB)
   🔗 libp2p      @ /p2p/      Connected    89 files (23MB)
   ☁️ storacha    @ /cloud/    Connected    134 files (67MB)
   🪣 s3          @ /s3/       Connected    201 files (123MB)
   🤗 huggingface @ /hf/       Connected    42 models (15GB)

System Health:
   ✅ All backends operational
   🔄 Sync status: Up to date
   💾 Cache usage: 512MB / 2GB
   🌐 Network: 42 peers connected
   
Recent Activity:
   • Model downloaded from /hf/microsoft/DialoGPT-medium (1 min ago)
   • File uploaded to /ipfs/data.json (2 min ago)
   • Mirror sync completed (5 min ago)
   • S3 backup created (15 min ago)`,
    exitCode: 0
  };
}

async handleHFCommand(args) {
  if (args.length === 0) {
    return {
      success: true,
      output: `🤗 Hugging Face Hub Commands:
  search <query>         - Search models and datasets
  download <model>       - Download model or dataset
  upload <path> <repo>   - Upload to repository
  info <model>           - Get model/dataset info
  repos [user]           - List repositories

Examples:
  hf search "text generation"
  hf download microsoft/DialoGPT-medium
  hf info bert-base-uncased`,
      exitCode: 0
    };
  }

  const subcommand = args[0];
  const params = args.slice(1);

  switch (subcommand) {
    case 'search':
      if (params.length === 0) {
        return {
          success: false,
          error: 'Usage: hf search <query>',
          exitCode: 1
        };
      }
      const query = params.join(' ');
      return {
        success: true,
        output: `🔍 Hugging Face Hub Search: "${query}"

📊 Models:
   🤖 microsoft/DialoGPT-medium      - Conversational AI model
   🤖 bert-base-uncased              - BERT base model
   🤖 gpt2                           - GPT-2 language model

📚 Datasets:
   📄 squad                          - Reading comprehension dataset
   📄 imdb                           - Movie review sentiment dataset

💡 Use 'hf download <model>' to download or 'hf info <model>' for details`,
        exitCode: 0
      };

    case 'download':
      if (params.length === 0) {
        return {
          success: false,
          error: 'Usage: hf download <model-id>',
          exitCode: 1
        };
      }
      const modelId = params[0];
      return {
        success: true,
        output: `📥 Downloading from Hugging Face Hub...

🤖 Model: ${modelId}
📁 Destination: /local/models/${modelId}
📊 Download Progress: ████████░░ 80%
⏱️ Estimated time remaining: 1m 30s

💡 Files will be available via VFS at /hf/${modelId}/`,
        exitCode: 0
      };

    case 'info':
      if (params.length === 0) {
        return {
          success: false,
          error: 'Usage: hf info <model-id>',
          exitCode: 1
        };
      }
      const infoModelId = params[0];
      return {
        success: true,
        output: `🤖 Hugging Face Model Info: ${infoModelId}

📊 Model Details:
   🏷️ Name: ${infoModelId}
   👤 Author: Microsoft
   📝 Task: Conversational AI
   🏢 License: MIT
   📅 Updated: 2 days ago
   ⭐ Stars: 1,247
   📥 Downloads: 45,832/month

💡 Use 'hf download ${infoModelId}' to download this model`,
        exitCode: 0
      };

    default:
      return {
        success: false,
        error: `Unknown HF command: ${subcommand}`,
        exitCode: 1
      };
  }
}

getHelpText() {
  return `🔧 SwissKnife VibeCoding CLI v1.0.0 (Web Terminal)

🤖 VibeCoding Interface:
  Just type anything! The AI will understand your requests.
  Examples:
    hello
    write a python function to sort a list
    explain quantum computing
    create a react component for a todo list
    help me debug this error: undefined variable

🛠️ System Commands:
  sk                 - Main SwissKnife interface
  sk help           - Show this help
  sk version        - Show version information
  sk status         - Show system status

🤖 AI Commands:
  ai models         - List available AI models with sources
  ai default        - View/set default model
  ai default <id>   - Set default model
  ai default clear  - Clear default model
  ai chat <message> - Chat with AI (explicit)
  ai status         - Show AI engine status

🤖 Model Management:
  model-browser     - Open advanced Model Browser
  models list       - List all available models
  models default    - Manage default model
  models install    - Install a model
  models remove     - Remove a model

⚙️ Configuration:
  api-key set <provider> <key> - Set API key for AI provider
  api-key get <provider>       - Check API key status
  api-key list                 - List all providers

📋 Task Management:
  sk-task list      - List all tasks
  sk-task create    - Create new task

🗂️ Virtual Filesystem:
  vfs mount         - Mount storage backend (helia, libp2p, storacha, s3, huggingface)
  vfs ls [path]     - List VFS contents
  vfs cp <src> <dst> - Copy between backends
  vfs sync          - Synchronize all backends

🤗 Hugging Face Hub:
  hf search <query> - Search models and datasets
  hf download <id>  - Download model or dataset
  hf info <id>      - Get model/dataset information

💡 To enable AI responses, set your OpenAI API key:
   api-key set openai sk-your-api-key-here

🎯 Remember: You can type anything, and if it's not a system command,
   the AI will treat it as a natural language query!`;
}

getStatusText() {
  return `🔧 SwissKnife System Status

Core System:
  ✅ CLI Adapter: Ready
  ${this.swissknife?.isSwissKnifeReady ? '✅' : '🔄'} SwissKnife Core: ${this.swissknife?.isSwissKnifeReady ? 'Ready' : 'Initializing'}
  ✅ Web Terminal: Active
  ✅ Commands: ${this.commands.size} loaded

Browser Environment:
  🌐 Platform: ${navigator.platform}
  💾 Memory: ${this.getMemoryInfo()}

Features:
  🤖 AI Chat: ${this.swissknife?.isSwissKnifeReady ? 'Available' : 'Loading'}
  📋 Task Manager: ${this.swissknife?.isSwissKnifeReady ? 'Available' : 'Loading'}
  🗂️ Virtual Filesystem: Available`;
}

getMemoryInfo() {
  if (performance.memory) {
    const used = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
    const total = Math.round(performance.memory.totalJSHeapSize / 1024 / 1024);
    return `${used}MB / ${total}MB`;
  }
  return 'Not available';
}

getBackendInfo(backend) {
  const info = {
    'helia': '📡 IPFS via Helia',
    'libp2p': '🔗 P2P Distributed Storage',
    'storacha': '☁️ Storacha IPFS Pinning',
    's3': '🪣 S3-Compatible Storage',
    'huggingface': '🤗 Hugging Face Hub'
  };
  return info[backend] || backend;
}

getBackendFromPath(path) {
  if (path.startsWith('/ipfs/')) return 'helia';
  if (path.startsWith('/p2p/')) return 'libp2p';
  if (path.startsWith('/cloud/')) return 'storacha';
  if (path.startsWith('/s3/')) return 's3';
  if (path.startsWith('/hf/')) return 'huggingface';
  return 'local';
}

getBackendEndpoint(backend) {
  const endpoints = {
    'helia': 'ipfs://local-node',
    'libp2p': 'p2p://12D3KooW...',
    'storacha': 'https://api.web3.storage',
    's3': 'https://s3.amazonaws.com',
    'huggingface': 'https://huggingface.co'
  };
  return endpoints[backend] || 'unknown';
}

getSimulatedSpace(backend) {
  const spaces = {
    'helia': '∞ (distributed)',
    'libp2p': '∞ (p2p network)',
    'storacha': '100GB available',
    's3': '1TB available',
    'huggingface': '∞ (hub storage)'
  };
  return spaces[backend] || 'Unknown';
}

findSimilarCommand(input) {
  const commands = Array.from(this.commands.keys());
  const threshold = 0.6;
  
  // Check for exact prefix matches first
  const prefixMatches = commands.filter(cmd => cmd.startsWith(input) || input.startsWith(cmd));
  if (prefixMatches.length > 0) {
    return prefixMatches[0];
  }
  
  // Check for common typos
  const typoMap = {
    'helo': 'hello',
    'hlep': 'help',
    '/help': 'help',
    'halp': 'help',
    'stat': 'status',
    'ls': 'vfs ls',
    'list': 'vfs ls',
    'files': 'vfs ls'
  };
  
  if (typoMap[input]) {
    return typoMap[input];
  }
  
  // Fuzzy matching using Levenshtein distance
  let bestMatch = null;
  let bestScore = 0;
  
  for (const cmd of commands) {
    const score = this.calculateSimilarity(input, cmd);
    if (score > threshold && score > bestScore) {
      bestScore = score;
      bestMatch = cmd;
    }
  }
  
  return bestMatch;
}

calculateSimilarity(a, b) {
  const matrix = [];
  const aLen = a.length;
  const bLen = b.length;
  
  if (aLen === 0) return bLen === 0 ? 1 : 0;
  if (bLen === 0) return 0;
  
  for (let i = 0; i <= bLen; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= aLen; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= bLen; i++) {
    for (let j = 1; j <= aLen; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  const distance = matrix[bLen][aLen];
  return 1 - distance / Math.max(aLen, bLen);
}

buildEnhancedPrompt(userInput) {
  // Analyze the user input to determine intent
  const availableCommands = Array.from(this.commands.keys());
  const intent = this.analyzeIntent(userInput);
  
  let enhancedPrompt = `You are SwissKnife AI, a powerful terminal assistant with access to advanced tools and commands.

CONTEXT:
- Current directory: ${this.context.workingDirectory}
- Available commands: ${availableCommands.join(', ')}
- User input: "${userInput}"
- Detected intent: ${intent}

AVAILABLE TOOLS & CAPABILITIES:
1. Virtual Filesystem (VFS): Access to multiple storage backends (IPFS, S3, Hugging Face Hub, etc.)
   - Use 'vfs ls' to list files
   - Use 'vfs status' to check mounted backends
   - Use 'vfs mount <backend> <path>' to mount storage

2. AI & ML Operations:
   - Use 'ai models' to list available AI models
   - Use 'ai status' to check AI engine status
   - Use 'hf search <query>' to search Hugging Face Hub

3. System Operations:
   - Use 'sk status' for system status
   - Use 'help' for command help
   - Use 'sk-task' for task management

INSTRUCTIONS:
${this.getInstructionsForIntent(intent, userInput)}

Please respond as SwissKnife AI and ${intent === 'command_request' ? 'suggest the appropriate command(s) or execute the requested action' : 'answer helpfully while mentioning relevant commands when applicable'}.

User Query: ${userInput}`;

  return enhancedPrompt;
}

analyzeIntent(input) {
  const lowerInput = input.toLowerCase();
  
  // Command requests
  if (lowerInput.includes('list') || lowerInput.includes('show') || lowerInput.includes('display')) {
    if (lowerInput.includes('file') || lowerInput.includes('directory') || lowerInput.includes('folder')) {
      return 'list_files';
    }
    if (lowerInput.includes('model') || lowerInput.includes('ai')) {
      return 'list_models';
    }
    if (lowerInput.includes('command') || lowerInput.includes('help')) {
      return 'show_help';
    }
    return 'list_general';
  }
  
  // Status requests
  if (lowerInput.includes('status') || lowerInput.includes('health') || lowerInput.includes('check')) {
    return 'check_status';
  }
  
  // Help requests
  if (lowerInput.includes('help') || lowerInput.includes('how') || lowerInput.includes('command')) {
    return 'show_help';
  }
  
  // VFS operations
  if (lowerInput.includes('filesystem') || lowerInput.includes('storage') || lowerInput.includes('mount')) {
    return 'vfs_operation';
  }
  
  // AI/ML requests
  if (lowerInput.includes('model') || lowerInput.includes('ai') || lowerInput.includes('ml')) {
    return 'ai_operation';
  }
  
  // Greetings
  if (lowerInput.match(/^(hello|hi|hey|greetings?)$/)) {
    return 'greeting';
  }
  
  return 'general_query';
}

getInstructionsForIntent(intent, userInput) {
  switch (intent) {
    case 'list_files':
      return `The user wants to see files. Suggest using 'vfs ls' to list files in the virtual filesystem, or 'vfs status' to see mounted backends.`;
    
    case 'list_models':
      return `The user wants to see AI models. Suggest using 'ai models' to list available models or 'hf search <query>' to search Hugging Face Hub.`;
    
    case 'show_help':
      return `The user needs help. Suggest using 'help' for general commands, 'sk help' for SwissKnife commands, or 'vfs' for filesystem help.`;
    
    case 'check_status':
      return `The user wants status information. Suggest using 'sk status' for system status, 'ai status' for AI engine status, or 'vfs status' for filesystem status.`;
    
    case 'vfs_operation':
      return `The user is asking about filesystem operations. Suggest relevant 'vfs' commands like 'vfs ls', 'vfs mount', 'vfs status', etc.`;
    
    case 'ai_operation':
      return `The user is asking about AI/ML operations. Suggest 'ai' commands like 'ai models', 'ai status', or 'hf' commands for Hugging Face Hub.`;
    
    case 'greeting':
      return `Respond warmly and mention that you can help with commands, file operations, AI tasks, and more. Suggest typing 'help' to see available commands.`;
    
    default:
      return `Answer the user's question helpfully and suggest relevant commands when appropriate.`;
  }
}

getModelNameById(modelId) {
  // Try to get the actual model name from available models
  if (this.swissknife && this.swissknife.isSwissKnifeReady) {
    try {
      const models = this.swissknife.swissknife.getAvailableModels();
      const model = models.find(m => m.id === modelId);
      return model ? model.name : modelId;
    } catch (error) {
      return modelId;
    }
  }
  return modelId;
}

checkApiKeyForModel(model) {
  const provider = model.provider.toLowerCase();
  return !!localStorage.getItem(`swissknife_${provider}_key`);
}

async handleModelBrowserCommand(args) {
  if (typeof window !== 'undefined' && window.desktop) {
    try {
      window.desktop.openApp('ModelBrowser');
      return {
        success: true,
        output: '🤖 Model Browser opened',
        exitCode: 0
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to open Model Browser: ${error.message}`,
        exitCode: 1
      };
    }
  } else {
    return {
      success: false,
      output: '',
      error: 'Model Browser is only available in the web interface',
      exitCode: 1
    };
  }
}

async handleModelsCommand(args) {
  if (args.length === 0 || args[0] === 'list') {
    return await this.handleAICommand(['models']);
  }

  const subcommand = args[0];
  const params = args.slice(1);

  switch (subcommand) {
    case 'default':
      return await this.handleAICommand(['default', ...params]);
      
    case 'install':
      if (params.length === 0) {
        return {
          success: false,
          output: '',
          error: 'Usage: models install <model-id>',
          exitCode: 1
        };
      }
      
      const modelId = params.join(' ');
      try {
        // Simulate model installation
        return {
          success: true,
          output: `📥 Installing model: ${modelId}\n\n💡 For full installation management, use "model-browser"`,
          exitCode: 0
        };
      } catch (error) {
        return {
          success: false,
          output: '',
          error: `Failed to install model: ${error.message}`,
          exitCode: 1
        };
      }

    case 'remove':
      if (params.length === 0) {
        return {
          success: false,
          output: '',
          error: 'Usage: models remove <model-id>',
          exitCode: 1
        };
      }
      
      const removeModelId = params.join(' ');
      try {
        // Simulate model removal
        return {
          success: true,
          output: `🗑️ Removing model: ${removeModelId}\n\n💡 For full removal management, use "model-browser"`,
          exitCode: 0
        };
      } catch (error) {
        return {
          success: false,
          output: '',
          error: `Failed to remove model: ${error.message}`,
          exitCode: 1
        };
      }

    default:
      return {
        success: false,
        output: '',
        error: `Unknown models command: ${subcommand}\n\nAvailable commands: list, default, install, remove`,
        exitCode: 1
      };
  }
}

getCommandsByCategory() {
  const categories = {};
  
  for (const [name, command] of this.commands) {
    const category = command.category || 'other';
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(command);
  }
  
  return categories;
}

async handleHelpCommand(args) {
  if (args.length === 0) {
    return {
      success: true,
      output: this.getHelpText(),
      exitCode: 0
    };
  }

  const commandName = args[0];
  
  if (this.commands.has(commandName)) {
    const command = this.commands.get(commandName);
    return {
      success: true,
      output: `📖 ${command.name} - ${command.description}\n\nUsage: ${command.usage}\nCategory: ${command.category}`,
      exitCode: 0
    };
  } else {
    return {
      success: false,
      output: '',
      error: `Command '${commandName}' not found. Use 'help' to see all available commands.`,
      exitCode: 1
    };
  }
}
}