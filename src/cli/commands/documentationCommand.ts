import { Command } from 'commander';
import { DocumentationGenerator } from '../../documentation/doc-generator';
import { CLIUXEnhancer } from '../../ux/cli-ux-enhancer';

const documentationCommand = new Command('docs')
  .description('Generate documentation for the SwissKnife CLI')
  .option('--user-guide', 'Generate user guide only')
  .option('--api-reference', 'Generate API reference only')
  .option('--output <directory>', 'Output directory for documentation', 'docs')
  .action(async (options) => {
    const docGenerator = new DocumentationGenerator();
    const spinner = CLIUXEnhancer.showSpinner('Generating documentation...');
    
    try {
      if (options.userGuide) {
        await docGenerator.generateUserGuide();
      } else if (options.apiReference) {
        await docGenerator.generateAPIReference();
      } else {
        // Generate all documentation by default
        await docGenerator.generateAllDocs();
      }
      
      CLIUXEnhancer.stopSpinner(spinner, true, 'Documentation generated successfully');
    } catch (error) {
      CLIUXEnhancer.stopSpinner(spinner, false, 'Documentation generation failed');
      CLIUXEnhancer.formatError(`Error generating documentation: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

export default documentationCommand;
