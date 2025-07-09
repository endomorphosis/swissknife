// src/commands/model.ts

import { Command } from './registry.js';
import { ExecutionContext } from './context.js';
import { ModelRegistry } from '../../ai/models/registry';
import { ModelExecutionService } from '../../models/execution';
import { initializeModelSystem } from '../../models/init';
import { IModel as Model, ProviderDefinition as Provider } from '../../types/ai';
import chalk from 'chalk';
import * as fs from 'fs/promises';

// Initialize the model system when this module is imported
initializeModelSystem().catch(error => {
  console.error('Failed to initialize model system:', error);
});

/**
 * Model command implementation
 * Allows users to manage and use AI models
 */
export const modelCommand: Command = {
  id: 'model',
  name: 'model',
  description: 'Manage and use AI models',
  options: [
    {
      name: 'list',
      alias: 'l',
      type: 'boolean',
      description: 'List available models',
      required: false,
      default: false
    },
    {
      name: 'providers',
      alias: 'p',
      type: 'boolean',
      description: 'List model providers',
      required: false,
      default: false
    },
    {
      name: 'info',
      alias: 'i',
      type: 'string',
      description: 'Show information about a specific model',
      required: false
    },
    {
      name: 'provider',
      type: 'string',
      description: 'Filter by provider',
      required: false
    },
    {
      name: 'capability',
      type: 'string',
      description: 'Filter by capability (streaming, images, audio, video, vectors)',
      required: false
    },
    {
      name: 'run',
      alias: 'r',
      type: 'string',
      description: 'Run a model with the given ID',
      required: false
    },
    {
      name: 'prompt',
      type: 'string',
      description: 'Prompt to send to the model',
      required: false
    },
    {
      name: 'file',
      alias: 'f',
      type: 'string',
      description: 'File containing the prompt',
      required: false
    },
    {
      name: 'output',
      alias: 'o',
      type: 'string',
      description: 'File to write output to',
      required: false
    },
    {
      name: 'temperature',
      alias: 't',
      type: 'string',
      description: 'Temperature (0.0-2.0)',
      required: false
    },
    {
      name: 'max-tokens',
      type: 'string',
      description: 'Maximum number of tokens to generate',
      required: false
    },
    {
      name: 'streaming',
      type: 'boolean',
      description: 'Enable streaming output',
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
  category: 'ai',
  examples: [
    'swissknife model --list',
    'swissknife model --providers',
    'swissknife model --info=gpt-4',
    'swissknife model --list --provider=openai',
    'swissknife model --list --capability=images',
    'swissknife model --run=gpt-4 --prompt="Hello, world!"',
    'swissknife model --run=gpt-4 --file=prompt.txt',
    'swissknife model --run=gpt-4 --prompt="Explain quantum computing" --output=result.txt'
  ],
  handler: async (args: any, context: ExecutionContext): Promise<number> => {
    try {
      const registry = ModelRegistry.getInstance();
      
      // Handle list operation
      if (args.list) {
        let models = registry.getAllModels();
        
        // Apply provider filter if specified
        if (args.provider) {
          models = models.filter(model => model.provider === args.provider);
        }
        
        // Apply capability filter if specified
        if (args.capability) {
          models = models.filter(model => 
            model.capabilities && model.capabilities[args.capability as keyof Model['capabilities']]
          );
        }
        
        if (args.json) {
          console.log(JSON.stringify(models, null, 2));
        } else {
          console.log(chalk.bold('\nAvailable Models:\n'));
          
          if (models.length === 0) {
            console.log('No models available with the specified criteria.');
          } else {
            for (const model of models) {
              displayModelSummary(model);
            }
          }
        }
        
        return 0;
      }
      
      // Handle providers operation
      if (args.providers) {
        const providers = registry.getAllProviders();
        
        if (args.json) {
          console.log(JSON.stringify(providers, null, 2));
        } else {
          console.log(chalk.bold('\nAvailable Providers:\n'));
          
          if (providers.length === 0) {
            console.log('No providers available.');
          } else {
            for (const provider of providers) {
              displayProviderSummary(provider);
            }
          }
        }
        
        return 0;
      }
      
      // Handle info operation
      if (args.info) {
        const model = registry.getModel(args.info);
        
        if (!model) {
          console.error(`Model not found: ${args.info}`);
          return 1;
        }
        
        if (args.json) {
          console.log(JSON.stringify(model, null, 2));
        } else {
          displayModelInfo(model);
        }
        
        return 0;
      }
      
      // Handle run operation
      if (args.run) {
        const model = registry.getModel(args.run);
        
        if (!model) {
          console.error(`Model not found: ${args.run}`);
          return 1;
        }
        
        // Get prompt from arguments or file
        let prompt: string;
        
        if (args.prompt) {
          prompt = args.prompt;
        } else if (args.file) {
          try {
            prompt = await fs.readFile(args.file, 'utf-8');
          } catch (error) {
            console.error(`Failed to read prompt file: ${args.file}`);
            return 1;
          }
        } else {
          console.error('No prompt provided. Use --prompt or --file');
          return 1;
        }
        
        // Parse options
        const options: any = {};
        
        if (args.temperature) {
          options.temperature = parseFloat(args.temperature);
        }
        
        if (args['max-tokens']) {
          options.maxTokens = parseInt(args['max-tokens'], 10);
        }
        
        if (args.streaming) {
          options.streaming = true;
        }
        
        // Execute model
        console.log(`Running model: ${model.name} (${model.id})`);
        console.log(`Prompt: ${prompt.length > 50 ? prompt.slice(0, 47) + '...' : prompt}`);
        
        const executionService = ModelExecutionService.getInstance();
        const result = await executionService.executeModel(model.id, prompt, options);
        
        // Output result
        if (args.output) {
          try {
            await fs.writeFile(args.output, result.response, 'utf-8');
            console.log(`Output written to: ${args.output}`);
          } catch (error) {
            console.error(`Failed to write output to file: ${args.output}`);
            return 1;
          }
        } else if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('\nResponse:');
          console.log(result.response);
          
          if (result.usage) {
            console.log('\nToken Usage:');
            console.log(`  Prompt: ${result.usage.promptTokens}`);
            console.log(`  Completion: ${result.usage.completionTokens}`);
            console.log(`  Total: ${result.usage.totalTokens}`);
          }
          
          if (result.timingMs) {
            console.log(`\nTime: ${result.timingMs}ms`);
          }
        }
        
        return 0;
      }
      
      // If no valid operation specified, show help
      console.log(chalk.bold('\nModel Management\n'));
      console.log('Usage:');
      console.log('  swissknife model --list                   List all available models');
      console.log('  swissknife model --providers              List all available providers');
      console.log('  swissknife model --info=<model-id>        Show information about a model');
      console.log('  swissknife model --run=<model-id> --prompt="..."  Run a model with the given prompt');
      console.log('\nRun "swissknife help --command=model" for more information.');
      
      return 0;
      
    } catch (error) {
      console.error('Error:', error);
      return 1;
    }
  }
};

/**
 * Display a summary of a model
 */
function displayModelSummary(model: Model): void {
  console.log(`${chalk.green(model.id)} (${model.name})`);
  console.log(`  Provider: ${model.provider}`);
  console.log(`  Source: ${model.source}`);
  
  if (model.maxTokens) {
    console.log(`  Max Tokens: ${model.maxTokens}`);
  }
  
  console.log('');
}

/**
 * Display a summary of a provider
 */
function displayProviderSummary(provider: Provider): void {
  console.log(`${chalk.cyan(provider.id)} (${provider.name})`);
  console.log(`  Default Model: ${provider.defaultModel || 'None'}`);
  console.log(`  Models: ${provider.models.length}`);
  console.log('');
}

/**
 * Display detailed information about a model
 */
function displayModelInfo(model: Model): void {
  console.log(chalk.bold(`\nModel: ${model.name} (${model.id})\n`));
  
  console.log(`Provider: ${model.provider}`);
  console.log(`Source: ${model.source}`);
  
  if (model.maxTokens) {
    console.log(`Max Tokens: ${model.maxTokens}`);
  }
  
  if (model.pricePerToken) {
    console.log(`Price per Token: $${model.pricePerToken}`);
  }
  
  console.log('\nCapabilities:');
  for (const [capability, enabled] of Object.entries(model.capabilities)) {
    const status = enabled ? chalk.green('✓') : chalk.red('✗');
    console.log(`  ${capability}: ${status}`);
  }
  
  console.log('');
}

// Register the model command
import { registerCommand } from './registry.js';
registerCommand(modelCommand);