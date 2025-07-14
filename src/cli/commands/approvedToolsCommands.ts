import { Command, CommandExecutionContext } from '../../command-registry';
import { handleListApprovedTools, handleRemoveApprovedTool } from '../../commands/approvedTools';
import { getCwd } from '../../utils/state';
import { logEvent } from '../../services/statsig';

export class ApprovedToolsListCommand implements Command {
  readonly id = 'approved-tools:list';
  readonly name = 'approved-tools list';
  readonly description = 'List all approved tools';
  readonly help = 'Usage: swissknife approved-tools list';

  parseArguments(args: string[]): Record<string, any> {
    return {};
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const result = handleListApprovedTools(getCwd());
    console.log(result);
    return result;
  }
}

export class ApprovedToolsRemoveCommand implements Command {
  readonly id = 'approved-tools:remove';
  readonly name = 'approved-tools remove';
  readonly description = 'Remove a tool from the list of approved tools';
  readonly help = 'Usage: swissknife approved-tools remove <tool>';

  parseArguments(args: string[]): Record<string, any> {
    const tool = args[0];
    return { tool };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const { tool } = parsedArgs;
    const result = handleRemoveApprovedTool(tool);
    logEvent('tengu_approved_tool_remove', {
      tool,
      success: String(result.success),
    });
    console.log(result.message);
    return result;
  }
}