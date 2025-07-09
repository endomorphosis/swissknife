import { Command, CommandExecutionContext } from '../../command-registry';
import { Agent } from '../../ai/agent/agent'; // Agent is expected in context
import { logger } from '../../utils/logger';
import parse from 'yargs-parser'; 

export class AiChatCommand implements Command {
  readonly name = 'ai:chat';
  readonly description = 'Sends a message to the AI agent for processing.';
  
  // Define expected arguments
  readonly argumentParserOptions = {
    string: ['message', 'm', 'userId', 'u'],
    alias: { message: 'm', userId: 'u' },
  };

  parseArguments(args: string[]): Record<string, any> {
    const parsed = parse(args, this.argumentParserOptions);
    // Allow message as the first positional argument
    if (!parsed.message && parsed._.length > 0) {
       parsed.message = parsed._.join(' '); // Join all positional args as the message
    }
    if (!parsed.message || typeof parsed.message !== 'string') {
      throw new Error('Message is required (use --message or provide as positional arguments).');
    }
    return parsed;
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    // Agent is now guaranteed by CommandExecutionContext type
    const agent = context.agent; 
    
    const message = parsedArgs.message as string;
    const userId = parsedArgs.userId as string | undefined;

    logger.info(`Executing ${this.name} command with message: "${message}"` + (userId ? ` for user: ${userId}` : ''));
    
    try {
      // Use the agent instance from the context to process the message
      const response = await agent.processMessage(message, userId);
      // Return the raw response string
      return response; 
    } catch (error: any) {
      logger.error(`Error during AI chat processing:`, error);
      throw new Error(`AI chat failed: ${error.message}`);
    }
  }
}
