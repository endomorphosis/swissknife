import { Command, CommandExecutionContext } from '../../command-registry';
import { LogList } from '../../../src/screens/LogList';
import { render } from 'ink';
import { logEvent } from '../../services/statsig';
import { cwd } from 'process';

export class ErrorCommand implements Command {
  readonly id = 'error';
  readonly name = 'error';
  readonly description = 'View error logs.';
  readonly help = 'Usage: swissknife error [number] [--cwd <cwd>]';

  parseArguments(args: string[]): Record<string, any> {
    const number = args.length > 0 ? parseInt(args[0]) : undefined;
    const cwdArgIndex = args.indexOf('--cwd');
    const cwdValue = cwdArgIndex !== -1 ? args[cwdArgIndex + 1] : cwd();
    return { number, cwd: cwdValue };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const { number, cwd: currentCwd } = parsedArgs;
    // Assuming setup is handled externally or can be called here if needed
    // await setup(currentCwd, false);
    logEvent('tengu_view_errors', { number: number?.toString() ?? '' });
    const inkContext: { unmount?: () => void } = {};
    const { unmount } = render(
      LogList({ context: inkContext, type: "errors", logNumber: number }),
      { exitOnCtrlC: true },
    );
    inkContext.unmount = unmount;
    // This command typically doesn't return a value, it renders UI and exits.
    // For testing purposes, you might return a success message or status.
    return "Error command executed.";
  }
}