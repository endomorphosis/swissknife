import { Command, CommandExecutionContext } from '../../command-registry';
import { getConfigForCLI, setConfigForCLI, deleteConfigForCLI, listConfigForCLI } from '../../utils/config';
import { cwd } from 'process';

export class ConfigGetCommand implements Command {
  readonly id = 'config:get';
  readonly name = 'config get';
  readonly description = 'Get a config value';
  readonly help = 'Usage: swissknife config get <key> [--global]';

  parseArguments(args: string[]): Record<string, any> {
    const key = args[0];
    const global = args.includes('--global') || args.includes('-g');
    const cwdArgIndex = args.indexOf('--cwd');
    const cwdValue = cwdArgIndex !== -1 ? args[cwdArgIndex + 1] : cwd();
    return { key, global, cwd: cwdValue };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const { key, global, cwd: currentCwd } = parsedArgs;
    // Assuming setup function is handled by the main CLI runner or can be called here if needed
    // await setup(currentCwd, false); // This setup is from cli.tsx, needs to be accessible or refactored
    
    const value = getConfigForCLI(key, global ?? false);
    console.log(value);
    return value; // Return value for potential further processing/testing
  }
}

export class ConfigSetCommand implements Command {
  readonly id = 'config:set';
  readonly name = 'config set';
  readonly description = 'Set a config value';
  readonly help = 'Usage: swissknife config set <key> <value> [--global]';

  parseArguments(args: string[]): Record<string, any> {
    const key = args[0];
    const value = args[1];
    const global = args.includes('--global') || args.includes('-g');
    const cwdArgIndex = args.indexOf('--cwd');
    const cwdValue = cwdArgIndex !== -1 ? args[cwdArgIndex + 1] : cwd();
    return { key, value, global, cwd: cwdValue };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const { key, value, global, cwd: currentCwd } = parsedArgs;
    // await setup(currentCwd, false);
    setConfigForCLI(key, value, global ?? false);
    console.log(`Set ${key} to ${value}`);
    return `Set ${key} to ${value}`;
  }
}

export class ConfigRemoveCommand implements Command {
  readonly id = 'config:remove';
  readonly name = 'config remove';
  readonly description = 'Remove a config value';
  readonly help = 'Usage: swissknife config remove <key> [--global]';

  parseArguments(args: string[]): Record<string, any> {
    const key = args[0];
    const global = args.includes('--global') || args.includes('-g');
    const cwdArgIndex = args.indexOf('--cwd');
    const cwdValue = cwdArgIndex !== -1 ? args[cwdArgIndex + 1] : cwd();
    return { key, global, cwd: cwdValue };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const { key, global, cwd: currentCwd } = parsedArgs;
    // await setup(currentCwd, false);
    deleteConfigForCLI(key, global ?? false);
    console.log(`Removed ${key}`);
    return `Removed ${key}`;
  }
}

export class ConfigListCommand implements Command {
  readonly id = 'config:list';
  readonly name = 'config list';
  readonly description = 'List all config values';
  readonly help = 'Usage: swissknife config list [--global]';

  parseArguments(args: string[]): Record<string, any> {
    const global = args.includes('--global') || args.includes('-g');
    const cwdArgIndex = args.indexOf('--cwd');
    const cwdValue = cwdArgIndex !== -1 ? args[cwdArgIndex + 1] : cwd();
    return { global, cwd: cwdValue };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const { global, cwd: currentCwd } = parsedArgs;
    // await setup(currentCwd, false);
    const config = listConfigForCLI((global as true) ?? false);
    console.log(JSON.stringify(config, null, 2));
    return config;
  }
}