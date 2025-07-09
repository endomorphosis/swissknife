// src/commands/config.ts

import { Command } from './registry.js';
import { ExecutionContext } from './context.js';
import { registerConfigurationSchemas } from '../config/schemas';
import { migrateTomlConfig } from '../config/migration';
import * as path from 'path';
import * as fs from 'fs/promises';
import chalk from 'chalk';

// Register schemas when this module is imported
registerConfigurationSchemas();

/**
 * Configuration command implementation
 * Allows users to view and modify configuration settings
 */
export const configCommand: Command = {
  id: 'config',
  name: 'config',
  description: 'View and modify configuration settings',
  options: [
    {
      name: 'get',
      alias: 'g',
      type: 'string',
      description: 'Get a configuration value by key (dot notation)',
      required: false
    },
    {
      name: 'set',
      alias: 's',
      type: 'string',
      description: 'Set a configuration value by key (dot notation)',
      required: false
    },
    {
      name: 'value',
      alias: 'v',
      type: 'string',
      description: 'Value to set for the specified key',
      required: false
    },
    {
      name: 'delete',
      alias: 'd',
      type: 'string',
      description: 'Delete a configuration key',
      required: false
    },
    {
      name: 'import',
      alias: 'i',
      type: 'string',
      description: 'Import configuration from a TOML file',
      required: false
    },
    {
      name: 'section',
      type: 'string',
      description: 'Section to import from TOML',
      required: false
    },
    {
      name: 'list',
      alias: 'l',
      type: 'boolean',
      description: 'List all configuration settings',
      required: false,
      default: false
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
  category: 'core',
  examples: [
    'swissknife config --get=ai.defaultModel',
    'swissknife config --set=ai.defaultModel --value=gpt-4',
    'swissknife config --list',
    'swissknife config --import=config.toml',
    'swissknife config --delete=legacy.path'
  ],
  handler: async (args: any, context: ExecutionContext): Promise<number> => {
    const { config } = context;
    
    try {
      // Handle get operation
      if (args.get) {
        const value = config.get(args.get);
        
        if (args.json) {
          console.log(JSON.stringify(value, null, 2));
        } else if (value === undefined) {
          console.log(`Config key not found: ${args.get}`);
        } else if (typeof value === 'object') {
          console.log(JSON.stringify(value, null, 2));
        } else {
          console.log(value);
        }
        
        return 0;
      }
      
      // Handle set operation
      if (args.set) {
        if (args.value === undefined) {
          console.error('Missing value for set operation. Use --value=<value>');
          return 1;
        }
        
        // Parse value if it looks like a number, boolean, or JSON
        let parsedValue = args.value;
        if (parsedValue === 'true') parsedValue = true;
        else if (parsedValue === 'false') parsedValue = false;
        else if (!isNaN(parsedValue) && parsedValue.trim() !== '') parsedValue = parseFloat(parsedValue);
        else {
          try {
            // Try to parse as JSON if it starts with [ or {
            if (parsedValue.startsWith('{') || parsedValue.startsWith('[')) {
              parsedValue = JSON.parse(parsedValue);
            }
          } catch (e) {
            // Keep as string if not valid JSON
          }
        }
        
        config.set(args.set, parsedValue);
        await config.save();
        console.log(`Set ${args.set} = ${JSON.stringify(parsedValue)}`);
        return 0;
      }
      
      // Handle delete operation
      if (args.delete) {
        // Split key by dots
        const parts = args.delete.split('.');
        
        if (parts.length === 0) {
          console.error('Invalid key for delete operation');
          return 1;
        }
        
        let current: any = config.getRawConfig();
        
        // Navigate to parent object
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (current[part] === undefined) {
            console.error(`Config key not found: ${args.delete}`);
            return 1;
          }
          current = current[part];
        }
        
        // Delete the property
        const lastPart = parts[parts.length - 1];
        if (current[lastPart] === undefined) {
          console.error(`Config key not found: ${args.delete}`);
          return 1;
        }
        
        delete current[lastPart];
        await config.save();
        console.log(`Deleted config key: ${args.delete}`);
        return 0;
      }
      
      // Handle import operation
      if (args.import) {
        const tomlPath = path.resolve(process.cwd(), args.import);
        
        try {
          // Check if file exists
          await fs.access(tomlPath);
        } catch (error) {
          console.error(`File not found: ${tomlPath}`);
          return 1;
        }
        
        const success = await migrateTomlConfig(tomlPath, config);
        
        if (success) {
          console.log(`Successfully imported configuration from ${args.import}`);
          return 0;
        } else {
          console.error(`Failed to import configuration from ${args.import}`);
          return 1;
        }
      }
      
      // Handle list operation (default if no other flags)
      if (args.list || !(args.get || args.set || args.delete || args.import)) {
        if (args.json) {
          console.log(JSON.stringify(config.config, null, 2));
        } else {
          console.log(chalk.bold('\nConfiguration Settings:\n'));
          displayConfig(config.config);
        }
        return 0;
      }
      
      console.error('No valid operation specified.');
      return 1;
    } catch (error) {
      console.error('Error:', error);
      return 1;
    }
  }
};

/**
 * Display configuration recursively
 * @param config Configuration object to display
 * @param prefix Current key prefix for nested objects
 * @param depth Current recursion depth
 */
function displayConfig(config: any, prefix = '', depth = 0): void {
  if (typeof config !== 'object' || config === null) {
    return;
  }
  
  for (const [key, value] of Object.entries(config)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const indent = '  '.repeat(depth);
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      console.log(`${indent}${chalk.cyan(key)}:`);
      displayConfig(value, fullKey, depth + 1);
    } else {
      let displayValue;
      if (key.includes('key') || key.includes('secret') || key.includes('password')) {
        displayValue = '******';
      } else if (Array.isArray(value)) {
        displayValue = `[${value.join(', ')}]`;
      } else {
        displayValue = value;
      }
      
      console.log(`${indent}${chalk.green(key)}: ${displayValue}`);
    }
  }
}

// Register the config command
import { registerCommand } from './registry.js';
registerCommand(configCommand);