import { Command, CommandExecutionContext } from '../../command-registry';
import { LogList } from '../../../src/screens/LogList';
import { render } from 'ink';
import { logEvent } from '../../services/statsig';
import { cwd } from 'process';

export class LogCommand implements Command {
  readonly id = 'log';
  readonly name = 'log';
  readonly description = 'Manage conversation logs.';
  readonly help = 'Usage: swissknife log [number] [--cwd <cwd>]';

  parseArguments(args: string[]): Record<string, any> {
    const number = args.length > 0 ? parseInt(args[0]) : undefined;
    const cwdArgIndex = args.indexOf('--cwd');
    const cwdValue = cwdArgIndex !== -1 ? args[cwdArgIndex + 1] : cwd();
    return { number, cwd: cwdValue };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const { number, cwd: currentCwd } = parsedArgs;
    // await setup(currentCwd, false); // Assuming setup is handled externally
    logEvent('tengu_view_logs', { number: number?.toString() ?? '' });
    const inkContext: { unmount?: () => void } = {};
    const { unmount } = render(
      LogList({ context: inkContext, type: "messages", logNumber: number }),
      { exitOnCtrlC: true },
    );
    inkContext.unmount = unmount;
    // This command typically doesn't return a value, it renders UI and exits.
    // For testing purposes, you might return a success message or status.
    return "Log command executed.";
  }
}