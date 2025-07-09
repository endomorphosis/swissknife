import type { Command, PromptCommand } from '../../types/command'; // Updated import path
import { markProjectOnboardingComplete } from '../ProjectOnboarding'; // Assuming .js extension
import { PROJECT_FILE } from '../constants/product'; // Assuming .js extension

const initCommand: PromptCommand = {
  type: 'prompt',
  name: 'init',
  description: `Initialize a new ${PROJECT_FILE} file with codebase documentation`,
  options: [], // No options for this command
  isEnabled: true,
  isHidden: false,
  progressMessage: 'analyzing your codebase',
  userFacingName() {
    return 'init'
  },
  async getPromptForCommand(_args: string) {
    // Mark onboarding as complete when init command is run
    markProjectOnboardingComplete()
    return [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Please analyze this codebase and create a ${PROJECT_FILE} file containing:
1. Build/lint/test commands - especially for running a single test
2. Code style guidelines including imports, formatting, types, naming conventions, error handling, etc.

The file you create will be given to agentic coding agents (such as yourself) that operate in this repository. Make it about 20 lines long.
If there's already a ${PROJECT_FILE}, improve it.
If there are Cursor rules (in .cursor/rules/ or .cursorrules) or Copilot rules (in .github/copilot-instructions.md), make sure to include them.`,
          },
        ],
      },
    ]
  },
};

export default initCommand;
