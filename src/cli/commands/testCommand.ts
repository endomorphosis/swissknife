import { Command } from 'commander';
import { TestRunner } from '../../testing/test-runner';
import { CLIUXEnhancer } from '../../ux/cli-ux-enhancer';

const testCommand = new Command('test')
  .description('Run tests for the SwissKnife CLI')
  .option('--unit', 'Run unit tests only')
  .option('--integration', 'Run integration tests only')
  .option('--e2e', 'Run end-to-end tests only')
  .action(async (options) => {
    const testRunner = new TestRunner();
    const spinner = CLIUXEnhancer.showSpinner('Running tests...');
    
    try {
      if (options.unit) {
        await testRunner.runUnitTests();
      } else if (options.integration) {
        await testRunner.runIntegrationTests();
      } else if (options.e2e) {
        await testRunner.runE2ETests();
      } else {
        // Run all tests by default
        await testRunner.runAllTests();
      }
      
      CLIUXEnhancer.stopSpinner(spinner, true, 'All tests completed successfully');
    } catch (error) {
      CLIUXEnhancer.stopSpinner(spinner, false, 'Tests failed');
      CLIUXEnhancer.formatError(`Error running tests: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

export default testCommand;
