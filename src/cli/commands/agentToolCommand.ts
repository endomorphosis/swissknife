import { Command, CommandExecutionContext } from '../../command-registry';
import { ToolRegistry } from '../../tools/registry';
import { ToolExecutor } from '../../tools/executor';
import { logger } from '../../utils/logger';
import parse from 'yargs-parser';

export class AgentToolCommand implements Command {
  readonly name = 'agent:tool';
  readonly description = 'Manages AI agent tools.';

  readonly argumentParserOptions = {
    string: ['action', 'toolName', 'args', 'jsonArgs'],
    alias: { action: 'a', toolName: 't', args: 'r', jsonArgs: 'j' },
  };

  parseArguments(args: string[]): Record<string, any> {
    const parsed = parse(args, this.argumentParserOptions);
    if (!parsed.action) {
      throw new Error('Usage: agent:tool --action <list|info|run> [options]');
    }
    return parsed;
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const toolRegistry = context.getService<ToolRegistry>('ToolRegistry');
    const toolExecutor = context.getService<ToolExecutor>('ToolExecutor');

    switch (parsedArgs.action) {
      case 'list':
        const tools = await toolRegistry.getTools();
        console.table(tools.map(tool => ({ name: tool.name, description: tool.description })));
        break;

      case 'info':
        if (!parsedArgs.toolName) {
          throw new Error('Usage: agent:tool --action info --toolName <tool_name>');
        }
        const tool = await toolRegistry.getTool(parsedArgs.toolName);
        if (!tool) {
          throw new Error(`Tool not found: ${parsedArgs.toolName}`);
        }
        console.log(tool);
        break;

      case 'run':
        if (!parsedArgs.toolName) {
          throw new Error('Usage: agent:tool --action run --toolName <tool_name> [--args <args>] [--jsonArgs <json>]');
        }
        const args = parsedArgs.jsonArgs ? JSON.parse(parsedArgs.jsonArgs) : parsedArgs.args;
        const result = await toolExecutor.execute(parsedArgs.toolName, args);
        console.log(result);
        break;

      default:
        throw new Error(`Unknown action: ${parsedArgs.action}`);
    }
  }
}
