import { Command, CommandExecutionContext } from '../../command-registry';
import { getContext, setContext, removeContext } from '../../context';
import { logEvent } from '../../services/statsig';
import { cwd } from 'process';
import { omit } from 'lodash-es';

export class ContextGetCommand implements Command {
  readonly id = 'context:get';
  readonly name = 'context get';
  readonly description = 'Get a value from context';
  readonly help = 'Usage: swissknife context get <key> [--cwd <cwd>]';

  parseArguments(args: string[]): Record<string, any> {
    const key = args[0];
    const cwdArgIndex = args.indexOf('--cwd');
    const cwdValue = cwdArgIndex !== -1 ? args[cwdArgIndex + 1] : cwd();
    return { key, cwd: cwdValue };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const { key, cwd: currentCwd } = parsedArgs;
    // await setup(currentCwd, false); // Assuming setup is handled externally
    logEvent('tengu_context_get', { key });
    const ctx = omit(
      await getContext(),
      'codeStyle',
      'directoryStructure',
    );
    console.log(ctx[key]);
    return ctx[key];
  }
}

export class ContextSetCommand implements Command {
  readonly id = 'context:set';
  readonly name = 'context set';
  readonly description = 'Set a value in context';
  readonly help = 'Usage: swissknife context set <key> <value> [--cwd <cwd>]';

  parseArguments(args: string[]): Record<string, any> {
    const key = args[0];
    const value = args[1];
    const cwdArgIndex = args.indexOf('--cwd');
    const cwdValue = cwdArgIndex !== -1 ? args[cwdArgIndex + 1] : cwd();
    return { key, value, cwd: cwdValue };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const { key, value, cwd: currentCwd } = parsedArgs;
    // await setup(currentCwd, false);
    logEvent('tengu_context_set', { key });
    setContext(key, value);
    console.log(`Set context.${key} to "${value}"`);
    return `Set context.${key} to "${value}"`;
  }
}

export class ContextListCommand implements Command {
  readonly id = 'context:list';
  readonly name = 'context list';
  readonly description = 'List all context values';
  readonly help = 'Usage: swissknife context list [--cwd <cwd>]';

  parseArguments(args: string[]): Record<string, any> {
    const cwdArgIndex = args.indexOf('--cwd');
    const cwdValue = cwdArgIndex !== -1 ? args[cwdArgIndex + 1] : cwd();
    return { cwd: cwdValue };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const { cwd: currentCwd } = parsedArgs;
    // await setup(currentCwd, false);
    logEvent('tengu_context_list', {});
    const ctx = omit(
      await getContext(),
      'codeStyle',
      'directoryStructure',
      'gitStatus',
    );
    console.log(JSON.stringify(ctx, null, 2));
    return ctx;
  }
}

export class ContextRemoveCommand implements Command {
  readonly id = 'context:remove';
  readonly name = 'context remove';
  readonly description = 'Remove a value from context';
  readonly help = 'Usage: swissknife context remove <key> [--cwd <cwd>]';

  parseArguments(args: string[]): Record<string, any> {
    const key = args[0];
    const cwdArgIndex = args.indexOf('--cwd');
    const cwdValue = cwdArgIndex !== -1 ? args[cwdArgIndex + 1] : cwd();
    return { key, cwd: cwdValue };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const { key, cwd: currentCwd } = parsedArgs;
    // await setup(currentCwd, false);
    logEvent('tengu_context_delete', { key });
    removeContext(key);
    console.log(`Removed context.${key}`);
    return `Removed context.${key}`;
  }
}