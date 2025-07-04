// src/commands/version.ts

import { Command } from './registry.js';
import { ExecutionContext } from './context.js';
import { IntegrationRegistry } from '../integration/registry';
import * as path from 'path';
import * as fs from 'fs/promises';
import chalk from 'chalk';

/**
 * Version command implementation
 * Displays version information for SwissKnife and integrated components
 */
export const versionCommand: Command = {
  id: 'version',
  name: 'version',
  description: 'Display version information for SwissKnife and integrated components',
  options: [
    {
      name: 'json',
      alias: 'j',
      type: 'boolean',
      description: 'Output version information as JSON',
      required: false,
      default: false
    },
    {
      name: 'verbose',
      alias: 'v',
      type: 'boolean',
      description: 'Display detailed version information',
      required: false,
      default: false
    }
  ],
  aliases: ['v'],
  category: 'core',
  examples: [
    'swissknife version',
    'swissknife version --json',
    'swissknife version --verbose'
  ],
  handler: async (args: any, context: ExecutionContext): Promise<number> => {
    try {
      // Get version information
      const versionInfo = await getVersionInfo(context, args.verbose);
      
      // Output as JSON if requested
      if (args.json) {
        console.log(JSON.stringify(versionInfo, null, 2));
        return 0;
      }
      
      // Display formatted version information
      displayVersionInfo(versionInfo, args.verbose);
      return 0;
    } catch (error) {
      console.error('Error retrieving version information:', error);
      return 1;
    }
  }
};

/**
 * Get version information for SwissKnife and integrated components
 */
async function getVersionInfo(context: ExecutionContext, verbose: boolean): Promise<any> {
  // Read package.json for SwissKnife version
  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
  let packageJson: any = {};
  
  try {
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
    packageJson = JSON.parse(packageJsonContent);
  } catch (error) {
    console.warn('Could not read package.json:', error);
  }
  
  // Gather version information
  const versionInfo: any = {
    name: packageJson.name || 'swissknife',
    version: packageJson.version || '0.1.0',
    description: packageJson.description || 'SwissKnife - Unified CLI for IPFS, AI, and more',
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch
  };
  
  // Add information about integrated components if verbose
  if (verbose) {
    // Get information from integration bridges if initialized
    const registry = IntegrationRegistry.getInstance();
    const bridges = registry.getAllBridges();
    
    versionInfo.integrations = {};
    
    for (const bridge of bridges) {
      if (bridge.isInitialized()) {
        try {
          // Try to get version information from each bridge
          const version = await bridge.call('get_version', {});
          versionInfo.integrations[bridge.id] = version;
        } catch (error) {
          versionInfo.integrations[bridge.id] = { 
            error: 'Could not retrieve version information',
            initialized: true
          };
        }
      } else {
        versionInfo.integrations[bridge.id] = { initialized: false };
      }
    }
    
    // Add dependencies from package.json
    if (packageJson.dependencies) {
      versionInfo.dependencies = packageJson.dependencies;
    }
  }
  
  return versionInfo;
}

/**
 * Display formatted version information
 */
function displayVersionInfo(versionInfo: any, verbose: boolean): void {
  console.log(chalk.bold(`\n${versionInfo.name} v${versionInfo.version}\n`));
  console.log(versionInfo.description);
  console.log(`Node.js: ${versionInfo.nodeVersion}`);
  console.log(`Platform: ${versionInfo.platform} (${versionInfo.arch})\n`);
  
  // Display integration information if verbose
  if (verbose && versionInfo.integrations) {
    console.log(chalk.bold('Integrated Components:'));
    
    for (const [id, info] of Object.entries(versionInfo.integrations)) {
      console.log(`  ${chalk.green(id)}: ${formatIntegrationInfo(info)}`);
    }
    
    console.log('');
    
    // Display dependencies if available
    if (versionInfo.dependencies) {
      console.log(chalk.bold('Dependencies:'));
      
      for (const [name, version] of Object.entries(versionInfo.dependencies)) {
        console.log(`  ${name}: ${version}`);
      }
      
      console.log('');
    }
  }
}

/**
 * Format integration info for display
 */
function formatIntegrationInfo(info: any): string {
  if (!info.initialized) {
    return chalk.yellow('Not initialized');
  }
  
  if (info.error) {
    return chalk.red(info.error);
  }
  
  if (info.version) {
    return `v${info.version}`;
  }
  
  return JSON.stringify(info);
}

// Register the version command
import { registerCommand } from './registry.js';
registerCommand(versionCommand);