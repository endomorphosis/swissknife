// src/commands/bridge.ts

import { Command } from './registry.js';
import { ExecutionContext } from './context.js';
import { IntegrationRegistry } from '../integration/registry';
import chalk from 'chalk';

/**
 * Bridge command implementation
 * Allows users to manage and interact with integration bridges
 */
export const bridgeCommand: Command = {
  id: 'bridge',
  name: 'bridge',
  description: 'Manage and interact with integration bridges',
  options: [
    {
      name: 'list',
      alias: 'l',
      type: 'boolean',
      description: 'List all available bridges',
      required: false,
      default: false
    },
    {
      name: 'info',
      alias: 'i',
      type: 'string',
      description: 'Show detailed information about a specific bridge',
      required: false
    },
    {
      name: 'initialize',
      alias: 'init',
      type: 'string',
      description: 'Initialize a specific bridge',
      required: false
    },
    {
      name: 'init-all',
      type: 'boolean',
      description: 'Initialize all bridges',
      required: false,
      default: false
    },
    {
      name: 'call',
      type: 'string',
      description: 'Call a method on a bridge',
      required: false
    },
    {
      name: 'method',
      type: 'string',
      description: 'Method name to call on the bridge',
      required: false
    },
    {
      name: 'args',
      type: 'string',
      description: 'JSON-formatted arguments to pass to the bridge method',
      required: false,
      default: '{}'
    },
    {
      name: 'json',
      alias: 'j',
      type: 'boolean',
      description: 'Output in JSON format',
      required: false,
      default: false
    }
  ],
  category: 'integration',
  examples: [
    'swissknife bridge --list',
    'swissknife bridge --info=goose-mcp',
    'swissknife bridge --initialize=ipfs-accelerate',
    'swissknife bridge --init-all',
    'swissknife bridge --call=goose-mcp --method=list_models',
    'swissknife bridge --call=goose-mcp --method=generate_completion --args=\'{"prompt":"Hello, world!"}\'',
  ],
  handler: async (args: any, context: ExecutionContext): Promise<number> => {
    const registry = IntegrationRegistry.getInstance();
    
    try {
      // Handle list operation
      if (args.list || !(args.info || args.initialize || args['init-all'] || args.call)) {
        const bridges = registry.getAllBridges();
        
        if (args.json) {
          const bridgeInfo = bridges.map(bridge => ({
            id: bridge.id,
            name: bridge.name,
            source: bridge.source,
            target: bridge.target,
            initialized: bridge.isInitialized()
          }));
          console.log(JSON.stringify(bridgeInfo, null, 2));
        } else {
          console.log(chalk.bold('\nAvailable Integration Bridges:\n'));
          
          if (bridges.length === 0) {
            console.log('No bridges available. Run with --init-all to initialize bridges.');
          } else {
            for (const bridge of bridges) {
              const status = bridge.isInitialized()
                ? chalk.green('initialized')
                : chalk.yellow('not initialized');
              
              console.log(`${chalk.bold(bridge.id)} (${bridge.name})`);
              console.log(`  Status: ${status}`);
              console.log(`  Source: ${bridge.source}`);
              console.log(`  Target: ${bridge.target}`);
              console.log('');
            }
          }
        }
        
        return 0;
      }
      
      // Handle info operation
      if (args.info) {
        const bridge = registry.getBridge(args.info);
        
        if (!bridge) {
          console.error(`Bridge not found: ${args.info}`);
          return 1;
        }
        
        if (args.json) {
          const bridgeInfo: any = {
            id: bridge.id,
            name: bridge.name,
            source: bridge.source,
            target: bridge.target,
            initialized: bridge.isInitialized()
          };
          
          // Add additional information if initialized
          if (bridge.isInitialized()) {
            try {
              const version = await bridge.call('get_version', {});
              bridgeInfo.version = version;
            } catch (error: any) {
              bridgeInfo.error = error.message || 'Failed to retrieve version information';
            }
          }
          
          console.log(JSON.stringify(bridgeInfo, null, 2));
        } else {
          console.log(chalk.bold(`\nBridge: ${bridge.id} (${bridge.name})\n`));
          
          const status = bridge.isInitialized()
            ? chalk.green('initialized')
            : chalk.yellow('not initialized');
          
          console.log(`Status: ${status}`);
          console.log(`Source: ${bridge.source}`);
          console.log(`Target: ${bridge.target}`);
          
          // Show additional information if initialized
          if (bridge.isInitialized()) {
            console.log('');
            try {
              const version = await bridge.call('get_version', {});
              console.log('Version Information:');
              console.log(JSON.stringify(version, null, 2));
            } catch (error) {
              console.log(`Additional Information: ${chalk.red('Not available')}`);
            }
          }
        }
        
        return 0;
      }
      
      // Handle initialize operation
      if (args.initialize) {
        const bridge = registry.getBridge(args.initialize);
        
        if (!bridge) {
          console.error(`Bridge not found: ${args.initialize}`);
          return 1;
        }
        
        console.log(`Initializing bridge: ${bridge.id}...`);
        
        const success = await registry.initializeBridge(bridge.id);
        
        if (success) {
          console.log(chalk.green(`Successfully initialized bridge: ${bridge.id}`));
          return 0;
        } else {
          console.error(chalk.red(`Failed to initialize bridge: ${bridge.id}`));
          return 1;
        }
      }
      
      // Handle init-all operation
      if (args['init-all']) {
        console.log('Initializing all bridges...');
        
        const results = await registry.initializeAllBridges();
        
        if (args.json) {
          console.log(JSON.stringify(Object.fromEntries(results), null, 2));
        } else {
          console.log(chalk.bold('\nBridge Initialization Results:\n'));
          
          let successCount = 0;
          let failCount = 0;
          
          for (const [id, success] of results.entries()) {
            const status = success
              ? chalk.green('SUCCESS')
              : chalk.red('FAILED');
            
            console.log(`${id}: ${status}`);
            
            if (success) {
              successCount++;
            } else {
              failCount++;
            }
          }
          
          console.log('');
          console.log(`Total: ${successCount + failCount}, Successful: ${successCount}, Failed: ${failCount}`);
        }
        
        // Return success if at least one bridge was successfully initialized
        return Array.from(results.values()).some(Boolean) ? 0 : 1;
      }
      
      // Handle call operation
      if (args.call) {
        if (!args.method) {
          console.error('Missing method name. Use --method=<method>');
          return 1;
        }
        
        const bridge = registry.getBridge(args.call);
        
        if (!bridge) {
          console.error(`Bridge not found: ${args.call}`);
          return 1;
        }
        
        if (!bridge.isInitialized()) {
          console.error(`Bridge not initialized: ${args.call}. Run with --initialize=${args.call} first.`);
          return 1;
        }
        
        // Parse arguments
        let methodArgs = {};
        try {
          methodArgs = JSON.parse(args.args);
        } catch (error) {
          console.error(`Invalid JSON arguments: ${args.args}`);
          return 1;
        }
        
        console.log(`Calling ${args.method} on bridge: ${bridge.id}...`);
        
        try {
          const result = await bridge.call(args.method, methodArgs);
          
          if (args.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log('Result:');
            console.log(typeof result === 'object' ? JSON.stringify(result, null, 2) : result);
          }
          
          return 0;
        } catch (error) {
          console.error(`Error calling method ${args.method} on bridge ${bridge.id}:`, error);
          return 1;
        }
      }
      
      console.error('No valid operation specified.');
      return 1;
    } catch (error) {
      console.error('Error:', error);
      return 1;
    }
  }
};

// Register the bridge command
import { registerCommand } from './registry.js';
registerCommand(bridgeCommand);