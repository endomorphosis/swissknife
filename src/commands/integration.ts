/**
 * Integration Commands - Commands for managing integration bridges
 */

import { CommandRegistry, Command } from '../command-registry';
import { IntegrationRegistry, IntegrationBridge, SystemType } from '../integration/registry';
import { GooseMCPBridge } from '../integration/bridges/goose-mcp';

/**
 * Load integration commands
 */
export async function loadIntegrationCommands(): Promise<void> {
  const registry = CommandRegistry.getInstance();
  
  // Register integration commands
  registry.registerCommand(bridgeListCommand);
  registry.registerCommand(bridgeStatusCommand);
  registry.registerCommand(bridgeEnableCommand);
  registry.registerCommand(bridgeDisableCommand);
  registry.registerCommand(bridgeInitCommand);
  registry.registerCommand(gooseBridgeCommand);
}

/**
 * Bridge list command
 */
export const bridgeListCommand: Command = {
  id: 'bridge:list',
  name: 'bridge:list',
  description: 'List available integration bridges',
  options: [
    {
      name: 'json',
      alias: 'j',
      type: 'boolean',
      description: 'Output in JSON format',
      default: false
    },
    {
      name: 'source',
      alias: 's',
      type: 'string',
      description: 'Filter bridges by source system'
    },
    {
      name: 'target',
      alias: 't',
      type: 'string',
      description: 'Filter bridges by target system'
    }
  ],
  examples: [
    'swissknife bridge:list',
    'swissknife bridge:list --source current',
    'swissknife bridge:list --target goose --json'
  ],
  category: 'integration',
  handler: async (args, context) => {
    const { json, source, target } = args;
    const integrationRegistry = context.services.integrationRegistry as IntegrationRegistry;
    
    let bridges: IntegrationBridge[] = integrationRegistry.getAllBridges();
    
    // Apply filters
    if (source) {
      bridges = bridges.filter(bridge => bridge.source === source);
    }
    
    if (target) {
      bridges = bridges.filter(bridge => bridge.target === target);
    }
    
    // Output results
    if (json) {
      // Convert bridges to plain objects for JSON output
      const bridgeObjects = bridges.map(bridge => ({
        id: bridge.id,
        name: bridge.name,
        source: bridge.source,
        target: bridge.target,
        initialized: bridge.isInitialized()
      }));
      
      console.log(JSON.stringify(bridgeObjects, null, 2));
    } else {
      if (bridges.length === 0) {
        console.log('No bridges found matching the criteria');
        return 0;
      }
      
      console.log('Available Integration Bridges:');
      console.log('-----------------------------');
      
      for (const bridge of bridges) {
        const status = bridge.isInitialized() ? 'Initialized' : 'Not initialized';
        
        console.log(`\n${bridge.name} (${bridge.id}):`);
        console.log(`  Source: ${bridge.source}`);
        console.log(`  Target: ${bridge.target}`);
        console.log(`  Status: ${status}`);
      }
    }
    
    return 0;
  }
};

/**
 * Bridge status command
 */
export const bridgeStatusCommand: Command = {
  id: 'bridge:status',
  name: 'bridge:status',
  description: 'Check the status of an integration bridge',
  options: [
    {
      name: 'json',
      alias: 'j',
      type: 'boolean',
      description: 'Output in JSON format',
      default: false
    }
  ],
  examples: [
    'swissknife bridge:status goose-mcp',
    'swissknife bridge:status ipfs-accelerate --json'
  ],
  category: 'integration',
  handler: async (args, context) => {
    const { json, _ } = args;
    const integrationRegistry = context.services.integrationRegistry as IntegrationRegistry;
    
    // Get bridge ID from positional argument
    const bridgeId = _[0];
    
    if (!bridgeId) {
      console.error('Error: Bridge ID is required');
      console.log('Usage: swissknife bridge:status <bridge-id>');
      return 1;
    }
    
    const bridge = integrationRegistry.getBridge(bridgeId);
    
    if (!bridge) {
      console.error(`Error: Bridge not found: ${bridgeId}`);
      return 1;
    }
    
    // Get bridge status
    const initialized = bridge.isInitialized();
    
    // Output results
    if (json) {
      const bridgeStatus = {
        id: bridge.id,
        name: bridge.name,
        source: bridge.source,
        target: bridge.target,
        initialized
      };
      
      console.log(JSON.stringify(bridgeStatus, null, 2));
    } else {
      console.log(`Bridge: ${bridge.name} (${bridge.id})`);
      console.log(`Source: ${bridge.source}`);
      console.log(`Target: ${bridge.target}`);
      console.log(`Status: ${initialized ? 'Initialized' : 'Not initialized'}`);
      
      // Additional status information can be added here if available
    }
    
    return 0;
  }
};

/**
 * Bridge enable command
 */
export const bridgeEnableCommand: Command = {
  id: 'bridge:enable',
  name: 'bridge:enable',
  description: 'Enable an integration bridge',
  examples: [
    'swissknife bridge:enable goose-mcp',
    'swissknife bridge:enable ipfs-accelerate'
  ],
  category: 'integration',
  handler: async (args, context) => {
    const { _ } = args;
    const integrationRegistry = context.services.integrationRegistry as IntegrationRegistry;
    const configManager = context.config;
    
    // Get bridge ID from positional argument
    const bridgeId = _[0];
    
    if (!bridgeId) {
      console.error('Error: Bridge ID is required');
      console.log('Usage: swissknife bridge:enable <bridge-id>');
      return 1;
    }
    
    const bridge = integrationRegistry.getBridge(bridgeId);
    
    if (!bridge) {
      console.error(`Error: Bridge not found: ${bridgeId}`);
      return 1;
    }
    
    // Enable bridge in configuration
    configManager.set(`integration.bridges.${bridgeId}.enabled`, true);
    
    // Save configuration
    try {
      await configManager.save();
      console.log(`Bridge ${bridge.name} (${bridgeId}) enabled`);
      return 0;
    } catch (error) {
      console.error(`Error saving configuration: ${error.message}`);
      return 1;
    }
  }
};

/**
 * Bridge disable command
 */
export const bridgeDisableCommand: Command = {
  id: 'bridge:disable',
  name: 'bridge:disable',
  description: 'Disable an integration bridge',
  examples: [
    'swissknife bridge:disable goose-mcp',
    'swissknife bridge:disable ipfs-accelerate'
  ],
  category: 'integration',
  handler: async (args, context) => {
    const { _ } = args;
    const integrationRegistry = context.services.integrationRegistry as IntegrationRegistry;
    const configManager = context.config;
    
    // Get bridge ID from positional argument
    const bridgeId = _[0];
    
    if (!bridgeId) {
      console.error('Error: Bridge ID is required');
      console.log('Usage: swissknife bridge:disable <bridge-id>');
      return 1;
    }
    
    const bridge = integrationRegistry.getBridge(bridgeId);
    
    if (!bridge) {
      console.error(`Error: Bridge not found: ${bridgeId}`);
      return 1;
    }
    
    // Disable bridge in configuration
    configManager.set(`integration.bridges.${bridgeId}.enabled`, false);
    
    // Save configuration
    try {
      await configManager.save();
      console.log(`Bridge ${bridge.name} (${bridgeId}) disabled`);
      return 0;
    } catch (error) {
      console.error(`Error saving configuration: ${error.message}`);
      return 1;
    }
  }
};

/**
 * Bridge init command
 */
export const bridgeInitCommand: Command = {
  id: 'bridge:init',
  name: 'bridge:init',
  description: 'Initialize an integration bridge',
  options: [
    {
      name: 'all',
      alias: 'a',
      type: 'boolean',
      description: 'Initialize all registered bridges',
      default: false
    }
  ],
  examples: [
    'swissknife bridge:init goose-mcp',
    'swissknife bridge:init --all'
  ],
  category: 'integration',
  handler: async (args, context) => {
    const { all, _ } = args;
    const integrationRegistry = context.services.integrationRegistry as IntegrationRegistry;
    
    if (all) {
      // Initialize all bridges
      console.log('Initializing all bridges...');
      
      try {
        const results = await integrationRegistry.initializeAllBridges();
        
        // Report results
        console.log('\nInitialization Results:');
        console.log('----------------------');
        
        let successCount = 0;
        let failCount = 0;
        
        for (const [bridgeId, success] of results.entries()) {
          const bridge = integrationRegistry.getBridge(bridgeId);
          const name = bridge ? bridge.name : bridgeId;
          
          if (success) {
            console.log(`✓ ${name}: Initialized successfully`);
            successCount++;
          } else {
            console.log(`✗ ${name}: Initialization failed`);
            failCount++;
          }
        }
        
        console.log(`\n${successCount} bridges initialized successfully, ${failCount} failed`);
        
        return failCount > 0 ? 1 : 0;
      } catch (error) {
        console.error(`Error initializing bridges: ${error.message}`);
        return 1;
      }
    } else {
      // Initialize a specific bridge
      const bridgeId = _[0];
      
      if (!bridgeId) {
        console.error('Error: Bridge ID is required when not using --all');
        console.log('Usage: swissknife bridge:init <bridge-id>');
        return 1;
      }
      
      const bridge = integrationRegistry.getBridge(bridgeId);
      
      if (!bridge) {
        console.error(`Error: Bridge not found: ${bridgeId}`);
        return 1;
      }
      
      // Check if already initialized
      if (bridge.isInitialized()) {
        console.log(`Bridge ${bridge.name} (${bridgeId}) is already initialized`);
        return 0;
      }
      
      // Initialize bridge
      console.log(`Initializing bridge ${bridge.name} (${bridgeId})...`);
      
      try {
        const success = await integrationRegistry.initializeBridge(bridgeId);
        
        if (success) {
          console.log(`Bridge ${bridge.name} (${bridgeId}) initialized successfully`);
          return 0;
        } else {
          console.error(`Failed to initialize bridge ${bridge.name} (${bridgeId})`);
          return 1;
        }
      } catch (error) {
        console.error(`Error initializing bridge: ${error.message}`);
        return 1;
      }
    }
  }
};

/**
 * Goose Bridge command
 */
export const gooseBridgeCommand: Command = {
  id: 'bridge:goose',
  name: 'bridge:goose',
  description: 'Register and configure the Goose MCP bridge',
  options: [
    {
      name: 'base-url',
      alias: 'u',
      type: 'string',
      description: 'Base URL for the Goose MCP server',
      default: 'http://localhost:8000'
    },
    {
      name: 'api-key',
      alias: 'k',
      type: 'string',
      description: 'API key for the Goose MCP server'
    },
    {
      name: 'init',
      alias: 'i',
      type: 'boolean',
      description: 'Initialize the bridge after registration',
      default: true
    }
  ],
  examples: [
    'swissknife bridge:goose',
    'swissknife bridge:goose --base-url https://goose.example.com',
    'swissknife bridge:goose --api-key your-api-key --init'
  ],
  category: 'integration',
  handler: async (args, context) => {
    const { baseUrl, apiKey, init } = args;
    const integrationRegistry = context.services.integrationRegistry as IntegrationRegistry;
    const configManager = context.config;
    
    // Check if bridge already exists
    const existingBridge = integrationRegistry.getBridge('goose-mcp');
    
    if (existingBridge) {
      console.log('Goose MCP bridge is already registered');
      
      // Update configuration if parameters provided
      if (baseUrl || apiKey) {
        // Update configuration
        if (baseUrl) {
          configManager.set('integration.bridges.goose-mcp.options.baseUrl', baseUrl);
        }
        
        if (apiKey) {
          configManager.set('integration.bridges.goose-mcp.options.apiKey', apiKey);
        }
        
        // Save configuration
        try {
          await configManager.save();
          console.log('Goose MCP bridge configuration updated');
        } catch (error) {
          console.error(`Error saving configuration: ${error.message}`);
          return 1;
        }
      }
      
      // Initialize if requested and not already initialized
      if (init && !existingBridge.isInitialized()) {
        console.log('Initializing Goose MCP bridge...');
        
        try {
          const success = await integrationRegistry.initializeBridge('goose-mcp');
          
          if (success) {
            console.log('Goose MCP bridge initialized successfully');
          } else {
            console.error('Failed to initialize Goose MCP bridge');
            return 1;
          }
        } catch (error) {
          console.error(`Error initializing bridge: ${error.message}`);
          return 1;
        }
      }
      
      return 0;
    }
    
    // Create new Goose MCP bridge
    console.log('Registering new Goose MCP bridge...');
    
    try {
      // Create bridge configuration
      const config: any = {};
      
      if (baseUrl) {
        config.baseUrl = baseUrl;
      }
      
      if (apiKey) {
        config.apiKey = apiKey;
      }
      
      // Create and register bridge
      const bridge = new GooseMCPBridge(config);
      integrationRegistry.registerBridge(bridge);
      
      console.log('Goose MCP bridge registered successfully');
      
      // Initialize if requested
      if (init) {
        console.log('Initializing Goose MCP bridge...');
        
        try {
          const success = await integrationRegistry.initializeBridge('goose-mcp');
          
          if (success) {
            console.log('Goose MCP bridge initialized successfully');
          } else {
            console.error('Failed to initialize Goose MCP bridge');
            return 1;
          }
        } catch (error) {
          console.error(`Error initializing bridge: ${error.message}`);
          return 1;
        }
      }
      
      return 0;
    } catch (error) {
      console.error(`Error registering Goose MCP bridge: ${error.message}`);
      return 1;
    }
  }
};