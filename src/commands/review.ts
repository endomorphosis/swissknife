import type { Command, PromptCommand, CommandOption } from '../types/command'; // Updated import path
import { BashTool } from '../tools/BashTool/BashTool'; // Assuming .js extension

const reviewCommand: PromptCommand = {
  type: 'prompt',
  name: 'review',
  description: 'Review a pull request',
  options: [
    {
      name: 'prNumber',
      type: 'string', // Or number, depending on how it's passed/parsed
      description: 'The pull request number to review',
      required: false,
    } as CommandOption,
  ],
  isEnabled: true,
  isHidden: false,
  progressMessage: 'reviewing pull request',
  userFacingName() {
    return 'review';
  },
  async getPromptForCommand(args: string) { // Reverted args type to string
    // The 'args' string contains everything after the command name.
    // The AI needs to parse this string to find the PR number if provided.
    const prNumberInstruction = args.trim()
      ? `The user provided the following input after the command: "${args.trim()}". Assume this is the PR number if it looks like one.`
      : 'No PR number was provided after the command.';

    return [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `
      You are an expert code reviewer. Follow these steps:

      1. ${prNumberInstruction}
      2. If no PR number was identified, use ${BashTool.name}("gh pr list") to show open PRs and stop.
      3. If a PR number was identified, use ${BashTool.name}("gh pr view <number>") to get PR details (replace <number> with the identified PR number).
      4. Use ${BashTool.name}("gh pr diff <number>") to get the diff (replace <number> with the identified PR number).
      5. Analyze the changes and provide a thorough code review that includes:
         - Overview of what the PR does
         - Analysis of code quality and style
         - Specific suggestions for improvements
         - Any potential issues or risks

      Keep your review concise but thorough. Focus on:
      - Code correctness
      - Following project conventions
      - Performance implications
      - Test coverage
      - Security considerations

      Format your review with clear sections and bullet points.
    `,
          },
        ],
      },
    ]
  },
};

export default reviewCommand;
