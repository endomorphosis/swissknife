import { Command, CommandExecutionContext } from '../../command-registry';
import { Doctor } from '../../../src/screens/Doctor';
import { render } from 'ink';
import { logEvent } from '../../services/statsig';

export class DoctorCommand implements Command {
  readonly id = 'doctor';
  readonly name = 'doctor';
  readonly description = 'Check the health of your SwissKnife auto-updater';
  readonly help = 'Usage: swissknife doctor';

  parseArguments(args: string[]): Record<string, any> {
    return {};
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    logEvent('tengu_doctor_command', {});

    await new Promise<void>(resolve => {
      render(Doctor({ onDone: () => resolve(), doctorMode: true }));
    });
    process.exit(0);
  }
}