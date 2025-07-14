import { Command, CommandExecutionContext } from '../../command-registry';
import { getLatestVersion, installGlobalPackage } from '../../utils/autoUpdater';
import { checkGate } from '../../services/statsig';
import { GATE_USE_EXTERNAL_UPDATER } from '../../constants/betas';
import { PRODUCT_NAME } from '../../constants/product';
import { MACRO } from '../../constants/macros';

export class UpdateCommand implements Command {
  readonly id = 'update';
  readonly name = 'update';
  readonly description = 'Check for updates and install if available';
  readonly help = 'Usage: swissknife update';

  parseArguments(args: string[]): Record<string, any> {
    return {};
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const useExternalUpdater = await checkGate(GATE_USE_EXTERNAL_UPDATER);
    if (useExternalUpdater) {
      console.log(`This version of ${PRODUCT_NAME} is no longer supported.`);
      process.exit(0);
    }

    console.log(`Current version: ${MACRO.VERSION}`);
    console.log('Checking for updates...');

    const latestVersion = await getLatestVersion();

    if (!latestVersion) {
      console.error('Failed to check for updates');
      process.exit(1);
    }

    if (latestVersion === MACRO.VERSION) {
      console.log(`${PRODUCT_NAME} is up to date`);
      process.exit(0);
    }

    console.log(`New version available: ${latestVersion}`);
    console.log('Installing update...');

    const status = await installGlobalPackage();

    switch (status) {
      case 'success':
        console.log(`Successfully updated to version ${latestVersion}`);
        break;
      case 'no_permissions':
        console.error('Error: Insufficient permissions to install update');
        console.error('Try running with sudo or fix npm permissions');
        process.exit(1);
        break;
      case 'install_failed':
        console.error('Error: Failed to install update');
        process.exit(1);
        break;
      case 'in_progress':
        console.error(
          'Error: Another instance is currently performing an update',
        );
        console.error('Please wait and try again later');
        process.exit(1);
        break;
    }
    process.exit(0);
  }
}