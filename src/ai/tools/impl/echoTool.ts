import {
  Tool,
  ToolExecutionContext,
  ToolInput,
  ToolOutput,
} from '../types/ai'; // Use relative paths
import { z } from 'zod'; // Import Zod

// Define the Zod schema for the input
const EchoInputSchema = z.object({
  message: z.string().describe('The message to echo back.'),
});

/**
 * A simple tool that echoes back the input message.
 * Useful for testing the tool execution flow.
 */
export class EchoTool implements Tool<typeof EchoInputSchema> { // Specify the schema type
  readonly name = 'echo';
  readonly description = 'Echoes back the provided message.';
  
  // Use the Zod schema object directly
  readonly inputSchema = EchoInputSchema;

  async execute(
    // Input type is now inferred from the schema
    input: ToolInput<typeof EchoInputSchema>, 
    context: ToolExecutionContext,
  ): Promise<ToolOutput> {
    // Input validation is expected to be handled by ToolExecutor using inputSchema
    // No need for: if (typeof input.message !== 'string') ...

    const messageToEcho = input.message;
    
    // Example of using context:
    // context.logger.debug(`EchoTool executing with message: ${messageToEcho}`);
    
    return `Echo: ${messageToEcho}`;
  }
}
