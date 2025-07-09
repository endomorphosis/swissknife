import { Command } from 'commander';
import { ReleasePackager } from '../../release/packager';

const releaseCommand = new Command('release')
  .description('Create distributable packages for release')
  .option('--platform <platform>', 'Specific platform to package for (linux, macos, windows)')
  .action(async (options) => {
    const packager = new ReleasePackager();
    
    try {
      if (options.platform) {
        switch (options.platform.toLowerCase()) {
          case 'linux':
            await packager.packageForLinux();
            break;
          case 'macos':
            await packager.packageForMacOS();
            break;
          case 'windows':
            await packager.packageForWindows();
            break;
          default:
            console.error(`Unknown platform: ${options.platform}`);
            process.exit(1);
        }
      } else {
        // Package for all platforms
        await packager.createPackages();
      }
    } catch (error) {
      console.error(`Error packaging release: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

export default releaseCommand;
