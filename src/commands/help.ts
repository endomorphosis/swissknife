// src/commands/help.ts

import { Command, CommandRegistry } from './registry.js';
import { ExecutionContext } from './context.js';
import chalk from 'chalk';

/**
 * Help command implementation
 * Displays help information for available commands
 */
export const helpCommand: Command = {
  id: 'help',
  name: 'help',
  description: 'Display help information for commands',
  options: [
    {
      name: 'command',
      alias: 'c',
      type: 'string',
      description: 'Command to display help for',
      required: false
    },
    {
      name: 'all',
      alias: 'a',
      type: 'boolean',
      description: 'Display help for all commands',
      required: false,
      default: false
    },
    {
      name: 'category',
      type: 'string',
      description: 'Display commands in a specific category',
      required: false
    }
  ],
  category: 'core',
  examples: [
    'swissknife help',
    'swissknife help --command=storage',
    'swissknife help --all',
    'swissknife help --category=ipfs'
  ],
  handler: async (args: any, context: ExecutionContext): Promise<number> => {
    const registry = CommandRegistry.getInstance();
    const { command: commandName, all, category } = args;

    // Display help for a specific command
    if (commandName) {
      const command = registry.getCommand(commandName);
      if (!command) {
        console.error(`Command not found: ${commandName}`);
        return 1;
      }

      displayCommandHelp(command);
      return 0;
    }

    // Display help for commands in a category
    if (category) {
      const commands = registry.getCommandsByCategory(category);
      if (commands.length === 0) {
        console.error(`No commands found in category: ${category}`);
        return 1;
      }

      console.log(chalk.bold(`\nCommands in category: ${category}\n`));
      for (const command of commands) {
        displayCommandSummary(command);
      }
      return 0;
    }

    // Display all commands or just a summary
    if (all) {
      const commands = registry.getAllCommands();
      for (const command of commands) {
        displayCommandHelp(command);
        console.log('\n' + '='.repeat(50) + '\n');
      }
    } else {
      displayGeneralHelp(registry);
    }

    return 0;
  }
};

/**
 * Display general help information
 */
function displayGeneralHelp(registry: CommandRegistry): void {
  console.log(chalk.bold('\nSwissKnife CLI\n'));
  console.log('Usage: swissknife <command> [options]\n');
  
  // Group commands by category
  const commands = registry.getAllCommands();
  const categorizedCommands = new Map<string, Command[]>();
  
  for (const command of commands) {
    const category = command.category || 'general';
    if (!categorizedCommands.has(category)) {
      categorizedCommands.set(category, []);
    }
    categorizedCommands.get(category)!.push(command);
  }
  
  // Display commands by category
  for (const [category, categoryCommands] of categorizedCommands.entries()) {
    console.log(chalk.bold(`\n${category.charAt(0).toUpperCase() + category.slice(1)} Commands:`));
    for (const command of categoryCommands) {
      displayCommandSummary(command);
    }
  }
  
  console.log('\nFor more information about a specific command, run:');
  console.log('  swissknife help --command=<command>');
  console.log('\nFor a list of all commands with details, run:');
  console.log('  swissknife help --all');
}

/**
 * Display a summary of a command
 */
function displayCommandSummary(command: Command): void {
  console.log(`  ${chalk.green(command.name)}: ${command.description}`);
}

/**
 * Display detailed help for a command
 */
function displayCommandHelp(command: Command): void {
  console.log(chalk.bold(`\nCommand: ${command.name}\n`));
  console.log(`${command.description}\n`);
  
  console.log(chalk.bold('Usage:'));
  console.log(`  swissknife ${command.name} [options]\n`);
  
  // Display options if available
  if (command.options && command.options.length > 0) {
    console.log(chalk.bold('Options:'));
    for (const option of command.options) {
      const required = option.required ? ' (required)' : '';
      const defaultValue = option.default !== undefined ? ` (default: ${option.default})` : '';
      const alias = option.alias ? `, -${option.alias}` : '';
      console.log(`  --${option.name}${alias} ${required}${defaultValue}`);
      console.log(`    ${option.description}`);
    }
    console.log('');
  }
  
  // Display subcommands if available
  if (command.subcommands && command.subcommands.length > 0) {
    console.log(chalk.bold('Subcommands:'));
    for (const subcommand of command.subcommands) {
      console.log(`  ${subcommand.name}: ${subcommand.description}`);
    }
    console.log('');
  }
  
  // Display examples if available
  if (command.examples && command.examples.length > 0) {
    console.log(chalk.bold('Examples:'));
    for (const example of command.examples) {
      console.log(`  ${example}`);
    }
    console.log('');
  }
}

// Register the help command
import { registerCommand } from './registry.js';
registerCommand(helpCommand);