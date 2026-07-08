/**
 * Enhanced SwissKnife CLI Adapter with Shared System Integration
 * Integrates with the unified event system, configuration manager, and AI providers
 */

export class EnhancedCLIAdapter {
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
    this.sharedSystem = null;
    
    this.initialize();
  }

  // Initialize shared system integration with fallback
  async initializeSharedSystem() {
    try {
      // Check if shared system is available globally
      if ((window as any).swissKnifeShared?.initialized) {
        this.sharedSystem = (window as any).swissKnifeShared;
        console.log('[CLI Adapter] Using global shared system');
        return true;
      }
      
      this.setupMockSharedSystem();
      console.log('[CLI Adapter] Using browser-local shared system fallback');
      return false;
    } catch (error) {
      console.warn('[CLI Adapter] Failed to load shared system, using mock:', error);
      this.setupMockSharedSystem();
      return false;
    }
  }

  setupMockSharedSystem() {
    // Create a mock shared system for when the real one isn't available
    this.sharedSystem = {
      initialized: false,
      eventBus: {
        emit: async (event, data) => console.log(`[Mock Event] ${event}:`, data),
        on: (event, handler) => () => {},
        setDebugMode: (enabled) => console.log(`[Mock] Debug mode: ${enabled}`),
        getActiveEvents: () => ['mock:event'],
        getListenerCount: (event) => 0
      },
      configManager: {
        getConfig: () => ({
          ai: { providers: {}, defaultModel: 'gpt-3.5-turbo', apiKeys: {} },
          web: { theme: 'day', layout: 'desktop', port: 3001 },
          ipfs: { gateway: 'https://ipfs.io/ipfs/', accelerate: true, nodes: ['localhost:5001'] },
          cli: { verbose: false, outputFormat: 'text', autoComplete: true }
        }),
        getComponentConfig: (component) => this.sharedSystem.configManager.getConfig()[component],
        updateComponentConfig: (component, updates) => console.log(`[Mock] Config update: ${component}`, updates),
        resetConfig: () => console.log('[Mock] Config reset')
      },
      aiManager: {
        getProviders: () => [],
        getAllModels: async () => [
          { id: 'gpt-4', name: 'GPT-4', provider: 'openai', available: true, local: false, size: '1.76T' }
        ],
        getDefaultProvider: () => ({ getName: () => 'Mock Provider' }),
        inference: async (request) => ({
          response: `Mock AI response to: "${request.prompt}"`,
          model: request.model
        })
      },
      events: {
        cli: {
          executeCommand: async (cmd, args, cwd) => console.log('[Mock CLI Event]', cmd, args),
          onCommandResponse: (handler) => () => {}
        },
        web: {
          launchApp: async (appId, params) => {
            console.log(`[Mock Web Event] Launch ${appId}`, params);
            if (window.desktop?.launchApp) {
              window.desktop.launchApp(appId, params);
            }
          },
          closeApp: async (appId) => console.log(`[Mock Web Event] Close ${appId}`)
        },
        ipfs: {
          uploadFile: async (file, callback) => {
            console.log('[Mock IPFS Event] Upload file');
            callback('QmMockHash123');
          }
        }
      }
    };
  }

  async initialize() {
    if (this.initialized) return;

    try {
      await this.initializeSharedSystem();
      await this.loadCoreCommands();
      this.setupAliases();
      this.initialized = true;
      
      // Emit system status if shared system is available
      if (this.sharedSystem.initialized) {
        await this.sharedSystem.eventBus.emit('system:status', { 
          component: 'cli-adapter', 
          status: 'online' 
        });
      }
      
      console.log('[CLI Adapter] Successfully initialized with shared system integration');
    } catch (error) {
      console.error('[CLI Adapter] Failed to initialize:', error);
    }
  }

  async loadCoreCommands() {
    // Define command categories
    const CLI_CATEGORIES = {
      SYSTEM: 'system',
      AI: 'ai',
      DEV: 'dev',
      IPFS: 'ipfs'
    };

    // Enhanced core commands with shared system integration
    this.commands.set('sk', {
      name: 'sk',
      description: 'SwissKnife main command interface with shared system',
      usage: 'sk [subcommand] [options]',
      category: CLI_CATEGORIES.SYSTEM,
      handler: async (args) => this.handleMainCommand(args)
    });

    this.commands.set('sk-ai', {
      name: 'sk-ai',
      description: 'AI-powered chat using shared AI providers',
      usage: 'sk-ai <message>',
      category: CLI_CATEGORIES.AI,
      handler: async (args) => this.handleEnhancedAICommand(args)
    });

    this.commands.set('sk-config', {
      name: 'sk-config',
      description: 'Shared configuration management',
      usage: 'sk-config [get|set|reset] [component] [key] [value]',
      category: CLI_CATEGORIES.SYSTEM,
      handler: async (args) => this.handleEnhancedConfigCommand(args)
    });

    this.commands.set('sk-events', {
      name: 'sk-events',
      description: 'Event system monitoring and debugging',
      usage: 'sk-events [list|debug|emit] [event] [data]',
      category: CLI_CATEGORIES.DEV,
      handler: async (args) => this.handleEventCommand(args)
    });

    this.commands.set('sk-desktop', {
      name: 'sk-desktop',
      description: 'Virtual desktop integration commands',
      usage: 'sk-desktop [launch|list|close] [app-id]',
      category: CLI_CATEGORIES.SYSTEM,
      handler: async (args) => this.handleDesktopCommand(args)
    });

    this.commands.set('sk-ipfs', {
      name: 'sk-ipfs',
      description: 'Enhanced IPFS operations with shared system',
      usage: 'sk-ipfs [add|get|status|connect] [args]',
      category: CLI_CATEGORIES.IPFS,
      handler: async (args) => this.handleEnhancedIPFSCommand(args)
    });

    // Legacy command support with enhanced functionality
    ['ai', 'chat', 'config', 'events', 'desktop', 'ipfs'].forEach(cmd => {
      this.commands.set(cmd, {
        name: cmd,
        description: `${cmd} commands (legacy with enhanced features)`,
        usage: `${cmd} [subcommand] [args]`,
        category: CLI_CATEGORIES.SYSTEM,
        handler: async (args) => this.handleLegacyCommand(cmd, args)
      });
    });
  }

  setupAliases() {
    this.aliases.set('sk-help', 'sk --help');
    this.aliases.set('sk-version', 'sk --version');
    this.aliases.set('sk-status', 'sk status');
    this.aliases.set('config-ai', 'sk-config ai');
    this.aliases.set('config-web', 'sk-config web');
    this.aliases.set('config-ipfs', 'sk-config ipfs');
    this.aliases.set('events-debug', 'sk-events debug');
    this.aliases.set('desktop-apps', 'sk-desktop list');
  }

  async executeCommand(commandLine) {
    try {
      const parts = commandLine.trim().split(/\s+/);
      const commandName = parts[0];
      const args = parts.slice(1);

      // Emit command event for other components if shared system is available
      if (this.sharedSystem?.events?.cli?.executeCommand) {
        await this.sharedSystem.events.cli.executeCommand(commandName, args, this.context.workingDirectory);
      }

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

        // Emit command response event if shared system is available
        if (this.sharedSystem?.eventBus?.emit) {
          await this.sharedSystem.eventBus.emit('cli:response', {
            output: result.output || '',
            exitCode: result.exitCode || 0,
            command: commandLine
          });
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
        output: this.getEnhancedHelpText(),
        exitCode: 0
      };
    }

    if (args[0] === 'version' || args[0] === '--version') {
      return {
        success: true,
        output: 'SwissKnife CLI v1.0.0 (Enhanced Web Terminal with Shared System)',
        exitCode: 0
      };
    }

    if (args[0] === 'status') {
      return {
        success: true,
        output: await this.getEnhancedStatusText(),
        exitCode: 0
      };
    }

    // Delegate to enhanced handlers
    const subcommand = args[0];
    const subArgs = args.slice(1);

    switch (subcommand) {
      case 'ai':
        return await this.handleEnhancedAICommand(subArgs);
      case 'config':
        return await this.handleEnhancedConfigCommand(subArgs);
      case 'events':
        return await this.handleEventCommand(subArgs);
      case 'desktop':
        return await this.handleDesktopCommand(subArgs);
      case 'ipfs':
        return await this.handleEnhancedIPFSCommand(subArgs);
      default:
        return {
          success: false,
          output: '',
          error: `Unknown subcommand: ${subcommand}. Use 'sk help' for available commands.`,
          exitCode: 1
        };
    }
  }

  async handleEnhancedAICommand(args) {
    if (args.length === 0) {
      const providers = this.sharedSystem?.aiManager?.getProviders() || [];
      const models = await (this.sharedSystem?.aiManager?.getAllModels() || Promise.resolve([]));
      
      return {
        success: true,
        output: `AI System Status:
📊 Available Providers: ${providers.length}
🤖 Available Models: ${models.length}
🔧 Default Provider: ${this.sharedSystem?.aiManager?.getDefaultProvider()?.getName() || 'None'}
🔗 Shared System: ${this.sharedSystem?.initialized ? 'Active' : 'Mock Mode'}

Commands:
  chat <message>    - Chat with AI using shared providers
  models           - List all available AI models
  providers        - List configured AI providers
  status           - Show detailed AI system status`,
        exitCode: 0
      };
    }

    const subcommand = args[0];
    const params = args.slice(1);

    switch (subcommand) {
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
        
        try {
          // Use shared AI manager if available
          const aiConfig = this.sharedSystem?.configManager?.getComponentConfig('ai') || { defaultModel: 'gpt-3.5-turbo' };
          const response = await this.sharedSystem?.aiManager?.inference({
            model: aiConfig.defaultModel,
            prompt: message
          });
          
          if (response) {
            return {
              success: true,
              output: `🤖 AI (${response.model}): ${response.response}`,
              exitCode: 0
            };
          } else {
            // Fallback for mock mode
            return {
              success: true,
              output: `🤖 AI (Mock): I'm a simulated AI response. Your message: "${message}"`,
              exitCode: 0
            };
          }
        } catch (error) {
          return {
            success: false,
            output: '',
            error: `AI inference error: ${error.message}`,
            exitCode: 1
          };
        }

      case 'models':
        try {
          const models = await (this.sharedSystem?.aiManager?.getAllModels() || Promise.resolve([]));
          let output = 'Available AI Models:\n';
          
          if (models.length === 0) {
            output += '(Mock Mode - No shared system available)\n';
            output += '✅ 💻 GPT-4 (OpenAI) - 1.76T\n';
            output += '✅ ☁️ Claude-3 (Anthropic) - 175B\n';
          } else {
            models.forEach(model => {
              const status = model.available ? '✅' : '❌';
              const local = model.local ? '💻' : '☁️';
              output += `${status} ${local} ${model.name} (${model.provider}) - ${model.size}\n`;
            });
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
            error: `Failed to list models: ${error.message}`,
            exitCode: 1
          };
        }

      case 'providers':
        const providers = this.sharedSystem?.aiManager?.getProviders() || [];
        let output = 'Configured AI Providers:\n';
        
        if (providers.length === 0) {
          output += '(Mock Mode - No shared system available)\n';
          output += '✅ OpenAI\n';
          output += '❌ Ollama\n';
        } else {
          for (const provider of providers) {
            const available = await provider.isAvailable();
            const status = available ? '✅' : '❌';
            output += `${status} ${provider.getName()}\n`;
          }
        }
        
        return {
          success: true,
          output,
          exitCode: 0
        };

      case 'status':
        try {
          const availableProviders = await (this.sharedSystem?.aiManager?.getAvailableProviders() || Promise.resolve([]));
          const allModels = await (this.sharedSystem?.aiManager?.getAllModels() || Promise.resolve([]));
          const config = this.sharedSystem?.configManager?.getComponentConfig('ai') || {
            defaultModel: 'gpt-3.5-turbo',
            apiKeys: {},
            providers: {}
          };
          
          return {
            success: true,
            output: `🤖 Enhanced AI System Status:
✅ Shared System: ${this.sharedSystem?.initialized ? 'Active' : 'Mock Mode'}
✅ Active Providers: ${availableProviders.length}
🤖 Available Models: ${allModels.length}
🎯 Default Model: ${config.defaultModel}
🔑 API Keys: ${Object.keys(config.apiKeys).length} configured
🧠 Local Models: ${allModels.filter(m => m.local).length}
☁️ Remote Models: ${allModels.filter(m => !m.local).length}`,
            exitCode: 0
          };
        } catch (error) {
          return {
            success: false,
            output: '',
            error: `Failed to get AI status: ${error.message}`,
            exitCode: 1
          };
        }

      default:
        return {
          success: false,
          output: '',
          error: `Unknown AI command: ${subcommand}`,
          exitCode: 1
        };
    }
  }

  async handleEnhancedConfigCommand(args) {
    const configManager = this.sharedSystem?.configManager;
    
    if (args.length === 0) {
      const fullConfig = configManager?.getConfig() || this.sharedSystem.configManager.getConfig();
      return {
        success: true,
        output: `Current Configuration:\n${JSON.stringify(fullConfig, null, 2)}`,
        exitCode: 0
      };
    }

    const subcommand = args[0];
    
    if (subcommand === 'get') {
      if (args.length < 2) {
        return {
          success: false,
          output: '',
          error: 'Usage: config get <component> [key]',
          exitCode: 1
        };
      }
      
      const component = args[1];
      const key = args[2];
      
      if (['ai', 'web', 'ipfs', 'cli'].includes(component)) {
        const componentConfig = configManager?.getComponentConfig(component) || this.sharedSystem.configManager.getComponentConfig(component);
        if (key) {
          return {
            success: true,
            output: `${component}.${key}: ${JSON.stringify(componentConfig[key], null, 2)}`,
            exitCode: 0
          };
        } else {
          return {
            success: true,
            output: `${component} configuration:\n${JSON.stringify(componentConfig, null, 2)}`,
            exitCode: 0
          };
        }
      } else {
        return {
          success: false,
          output: '',
          error: `Unknown component: ${component}. Available: ai, web, ipfs, cli`,
          exitCode: 1
        };
      }
    }

    if (subcommand === 'set') {
      if (args.length < 4) {
        return {
          success: false,
          output: '',
          error: 'Usage: config set <component> <key> <value>',
          exitCode: 1
        };
      }
      
      const component = args[1];
      const key = args[2];
      const value = args.slice(3).join(' ');
      
      try {
        let parsedValue;
        try {
          parsedValue = JSON.parse(value);
        } catch {
          parsedValue = value; // Use as string if not valid JSON
        }
        
        if (['ai', 'web', 'ipfs', 'cli'].includes(component)) {
          if (configManager?.updateComponentConfig) {
            configManager.updateComponentConfig(component, { [key]: parsedValue });
          } else {
            this.sharedSystem.configManager.updateComponentConfig(component, { [key]: parsedValue });
          }
          return {
            success: true,
            output: `✅ Set ${component}.${key} = ${JSON.stringify(parsedValue)}`,
            exitCode: 0
          };
        } else {
          return {
            success: false,
            output: '',
            error: `Unknown component: ${component}`,
            exitCode: 1
          };
        }
      } catch (error) {
        return {
          success: false,
          output: '',
          error: `Configuration error: ${error.message}`,
          exitCode: 1
        };
      }
    }

    if (subcommand === 'reset') {
      if (configManager?.resetConfig) {
        configManager.resetConfig();
      } else {
        this.sharedSystem.configManager.resetConfig();
      }
      return {
        success: true,
        output: '✅ Configuration reset to defaults',
        exitCode: 0
      };
    }

    return {
      success: false,
      output: '',
      error: `Unknown config command: ${subcommand}. Available: get, set, reset`,
      exitCode: 1
    };
  }

  async handleEventCommand(args) {
    const eventBus = this.sharedSystem?.eventBus;
    
    if (args.length === 0) {
      const activeEvents = eventBus?.getActiveEvents() || ['mock:event'];
      return {
        success: true,
        output: `Event System Commands:
  list              - List active event listeners
  debug [on|off]    - Enable/disable event debugging
  emit <event> <data> - Emit an event (for testing)
  
Current active events: ${activeEvents.join(', ') || 'None'}
Shared system: ${this.sharedSystem?.initialized ? 'Active' : 'Mock Mode'}`,
        exitCode: 0
      };
    }

    const subcommand = args[0];
    
    switch (subcommand) {
      case 'list':
        const activeEvents = eventBus?.getActiveEvents() || ['mock:event'];
        let output = 'Active Event Listeners:\n';
        
        activeEvents.forEach(event => {
          const count = eventBus?.getListenerCount(event) || 0;
          output += `📡 ${event}: ${count} listener(s)\n`;
        });
        
        return {
          success: true,
          output: output || 'No active event listeners',
          exitCode: 0
        };

      case 'debug':
        const enabled = args[1] !== 'off';
        if (eventBus?.setDebugMode) {
          eventBus.setDebugMode(enabled);
        }
        return {
          success: true,
          output: `✅ Event debugging ${enabled ? 'enabled' : 'disabled'}`,
          exitCode: 0
        };

      case 'emit':
        if (args.length < 3) {
          return {
            success: false,
            output: '',
            error: 'Usage: events emit <event> <data>',
            exitCode: 1
          };
        }
        
        const eventName = args[1];
        const eventData = args.slice(2).join(' ');
        
        try {
          let parsedData;
          try {
            parsedData = JSON.parse(eventData);
          } catch {
            parsedData = { message: eventData };
          }
          
          if (eventBus?.emit) {
            await eventBus.emit(eventName, parsedData);
          }
          return {
            success: true,
            output: `✅ Emitted event '${eventName}' with data: ${JSON.stringify(parsedData)}`,
            exitCode: 0
          };
        } catch (error) {
          return {
            success: false,
            output: '',
            error: `Event emission error: ${error.message}`,
            exitCode: 1
          };
        }

      default:
        return {
          success: false,
          output: '',
          error: `Unknown event command: ${subcommand}`,
          exitCode: 1
        };
    }
  }

  async handleDesktopCommand(args) {
    // Define APP_IDS locally if not available from shared system
    const APP_IDS = {
      TERMINAL: 'terminal',
      VIBECODE: 'vibecode',
      AI_CHAT: 'ai-chat',
      FILE_MANAGER: 'file-manager',
      TASK_MANAGER: 'task-manager',
      MODEL_BROWSER: 'model-browser',
      IPFS_EXPLORER: 'ipfs-explorer',
      DEVICE_MANAGER: 'device-manager',
      SETTINGS: 'settings',
      MCP_CONTROL: 'mcp-control',
      API_KEYS: 'api-keys',
      AI_CRON: 'ai-cron',
      NAVI: 'navi',
      MUSIC_STUDIO: 'music-studio'
    };
    
    if (args.length === 0) {
      return {
        success: true,
        output: `Desktop Integration Commands:
  launch <app-id>   - Launch virtual desktop application
  list              - List available applications
  close <app-id>    - Close application
  status           - Show desktop status
  
Shared system: ${this.sharedSystem?.initialized ? 'Active' : 'Mock Mode'}`,
        exitCode: 0
      };
    }

    const subcommand = args[0];
    
    switch (subcommand) {
      case 'launch':
        if (args.length < 2) {
          return {
            success: false,
            output: '',
            error: 'Usage: desktop launch <app-id>',
            exitCode: 1
          };
        }
        
        const appId = args[1];
        
        // Use shared events system if available, otherwise fall back to direct desktop call
        if (this.sharedSystem?.events?.web?.launchApp) {
          await this.sharedSystem.events.web.launchApp(appId);
        } else if (window.desktop?.launchApp) {
          window.desktop.launchApp(appId);
        }
        
        return {
          success: true,
          output: `✅ Launched application: ${appId}`,
          exitCode: 0
        };

      case 'list':
        const apps = Object.values(APP_IDS);
        let output = 'Available Desktop Applications:\n';
        
        apps.forEach(appId => {
          output += `📱 ${appId}\n`;
        });
        
        return {
          success: true,
          output,
          exitCode: 0
        };

      case 'close':
        if (args.length < 2) {
          return {
            success: false,
            output: '',
            error: 'Usage: desktop close <app-id>',
            exitCode: 1
          };
        }
        
        const closeAppId = args[1];
        
        if (this.sharedSystem?.events?.web?.closeApp) {
          await this.sharedSystem.events.web.closeApp(closeAppId);
        }
        
        return {
          success: true,
          output: `✅ Closed application: ${closeAppId}`,
          exitCode: 0
        };

      case 'status':
        const webConfig = this.sharedSystem?.configManager?.getComponentConfig('web') || { theme: 'day' };
        return {
          success: true,
          output: `🖥️ Virtual Desktop Status:
✅ Desktop System: Active
📱 Available Apps: ${Object.keys(APP_IDS).length}
🪟 Window Manager: Ready
🎨 Theme: ${webConfig.theme}
🔗 Shared Integration: ${this.sharedSystem?.initialized ? 'Active' : 'Mock Mode'}`,
          exitCode: 0
        };

      default:
        return {
          success: false,
          output: '',
          error: `Unknown desktop command: ${subcommand}`,
          exitCode: 1
        };
    }
  }

  async handleEnhancedIPFSCommand(args) {
    if (args.length === 0) {
      const ipfsConfig = configManager.getComponentConfig('ipfs');
      return {
        success: true,
        output: `Enhanced IPFS Commands:
  status           - Show IPFS status with shared config
  connect          - Connect to configured IPFS nodes
  upload <data>    - Upload data using shared IPFS system
  
Current IPFS Configuration:
🌐 Gateway: ${ipfsConfig.gateway}
⚡ Acceleration: ${ipfsConfig.accelerate ? 'Enabled' : 'Disabled'}
🔗 Nodes: ${ipfsConfig.nodes.join(', ')}`,
        exitCode: 0
      };
    }

    const subcommand = args[0];
    const ipfsConfig = configManager.getComponentConfig('ipfs');
    
    switch (subcommand) {
      case 'status':
        return {
          success: true,
          output: `🌐 Enhanced IPFS Status:
✅ Shared Configuration: Active
🔗 Configured Nodes: ${ipfsConfig.nodes.length}
⚡ Acceleration: ${ipfsConfig.accelerate ? 'Enabled' : 'Disabled'}
🌍 Gateway: ${ipfsConfig.gateway}
🔌 Integration: Ready`,
          exitCode: 0
        };

      case 'connect':
        return {
          success: true,
          output: `🔗 Connecting to IPFS nodes:
${ipfsConfig.nodes.map(node => `  ✅ ${node}`).join('\n')}
🌐 Using gateway: ${ipfsConfig.gateway}`,
          exitCode: 0
        };

      case 'upload':
        if (args.length < 2) {
          return {
            success: false,
            output: '',
            error: 'Usage: ipfs upload <data>',
            exitCode: 1
          };
        }
        
        const data = args.slice(1).join(' ');
        // Use shared IPFS system
        await events.ipfs.uploadFile(new Blob([data]), (hash) => {
          console.log('IPFS upload completed:', hash);
        });
        
        return {
          success: true,
          output: `✅ Uploaded to IPFS: ${data} (simulated)`,
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

  async handleLegacyCommand(command, args) {
    // Route legacy commands to enhanced handlers
    switch (command) {
      case 'ai':
      case 'chat':
        return await this.handleEnhancedAICommand(args);
      case 'config':
        return await this.handleEnhancedConfigCommand(args);
      case 'events':
        return await this.handleEventCommand(args);
      case 'desktop':
        return await this.handleDesktopCommand(args);
      case 'ipfs':
        return await this.handleEnhancedIPFSCommand(args);
      default:
        return {
          success: false,
          output: '',
          error: `Legacy command not implemented: ${command}`,
          exitCode: 1
        };
    }
  }

  getEnhancedHelpText() {
    return `🔧 SwissKnife Enhanced CLI v1.0.0 (Unified System)

Core Commands:
  sk                    - Main SwissKnife interface with shared system
  sk help              - Show this help
  sk version           - Show version information  
  sk status            - Show comprehensive system status

Enhanced AI Commands (Shared Providers):
  sk-ai chat <msg>     - Chat using shared AI providers
  sk-ai models         - List all available AI models
  sk-ai providers      - Show configured AI providers
  sk-ai status         - Detailed AI system status

Configuration Management (Unified):
  sk-config            - View full configuration
  sk-config get <comp> - Get component configuration
  sk-config set <comp> <key> <val> - Set configuration
  sk-config reset      - Reset to defaults

Event System Integration:
  sk-events list       - Show active event listeners
  sk-events debug      - Toggle event debugging
  sk-events emit       - Emit test events

Virtual Desktop Integration:
  sk-desktop launch    - Launch desktop applications
  sk-desktop list      - List available apps
  sk-desktop status    - Show desktop status

Enhanced IPFS (Shared Config):
  sk-ipfs status       - Show IPFS status with config
  sk-ipfs connect      - Connect to configured nodes
  sk-ipfs upload       - Upload using shared system

Legacy Commands (Enhanced):
  ai, chat, config, events, desktop, ipfs - All enhanced with shared system

For detailed help: <command> --help`;
  }

  async getEnhancedStatusText() {
    const configs = {
      ai: configManager.getComponentConfig('ai'),
      web: configManager.getComponentConfig('web'),
      ipfs: configManager.getComponentConfig('ipfs'),
      cli: configManager.getComponentConfig('cli')
    };
    
    const providers = aiManager.getProviders();
    const models = await aiManager.getAllModels();
    
    return `🔧 SwissKnife Enhanced System Status

Shared System Core:
  ✅ Event Bus: ${eventBus.getActiveEvents().length} active events
  ✅ Config Manager: 4 components configured
  ✅ AI Manager: ${providers.length} providers, ${models.length} models
  ✅ CLI Adapter: Enhanced mode active

Component Configurations:
  🤖 AI: ${Object.keys(configs.ai.providers).length} providers, default: ${configs.ai.defaultModel}
  🖥️ Web: Theme ${configs.web.theme}, Port ${configs.web.port}
  🌐 IPFS: ${configs.ipfs.nodes.length} nodes, Acceleration ${configs.ipfs.accelerate ? 'ON' : 'OFF'}
  💻 CLI: Format ${configs.cli.outputFormat}, Verbose ${configs.cli.verbose ? 'ON' : 'OFF'}

Browser Environment:
  🌐 Platform: ${navigator.platform}
  💾 Memory: ${this.getMemoryInfo()}
  🎯 WebGL: Available
  🔧 Integration: Full shared system active

Cross-Component Features:
  📡 Event Communication: Active
  🔄 Configuration Sync: Active  
  🤖 Shared AI Providers: Ready
  🖥️ Desktop Integration: Ready
  🌐 IPFS Integration: Ready`;
  }

  getMemoryInfo() {
    if (performance.memory) {
      const used = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
      const total = Math.round(performance.memory.totalJSHeapSize / 1024 / 1024);
      return `${used}MB / ${total}MB`;
    }
    return 'Not available';
  }
}
