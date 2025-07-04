// src/ai/tools/executor.ts
import { 
    Tool, 
    ToolInput, 
    ToolOutput, 
    ToolExecutionContext 
} from '../types/ai'; // Using Zod-based Tool from types/ai.js
import { ZodType } from 'zod';

// TODO: These would be properly injected or accessed in a real app
const placeholderStorageProvider: any = {
  add: async () => 'cid_placeholder',
  get: async () => Buffer.from('content_placeholder'),
  list: async () => ['id1', 'id2'],
  delete: async () => true,
};
const placeholderTaskManager: any = {
  // mock methods if needed by tools
};
const placeholderConfigManager: any = {
  // mock methods for ConfigManager
  get: () => ({}),
  set: () => {},
  getConfig: () => ({})
};

export class ToolExecutor {
  private tools: Map<string, Tool<any>> = new Map();

  public registerTool(tool: Tool<any>): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Tool "${tool.name}" is already registered. Overwriting.`);
    }
    this.tools.set(tool.name, tool);
    console.log(`Tool registered: ${tool.name}`);
  }

  public async execute<T extends ZodType>(
    toolName: string, 
    rawArgs: any, // Raw arguments, to be validated
    // Optional execution context, can be expanded
    // For now, Agent doesn't pass this, so we make it optional or provide defaults
    partialContext?: Partial<Omit<ToolExecutionContext, 'callTool'>> 
  ): Promise<ToolOutput> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    let validatedArgs: ToolInput<T>;
    try {
      // Validate rawArgs against the tool's inputSchema
      validatedArgs = tool.inputSchema.parse(rawArgs) as ToolInput<T>;
    } catch (error: any) {
      // ZodError will contain detailed validation issues
      console.error(`Input validation failed for tool "${toolName}":`, error.errors);
      throw new Error(`Invalid input for tool "${toolName}": ${error.message}`);
    }

    // Construct a basic execution context
    // TODO: This context should be properly provided by the calling environment (e.g., Agent)
    const executionContext: ToolExecutionContext = {
      storage: partialContext?.storage || placeholderStorageProvider,
      taskManager: partialContext?.taskManager || placeholderTaskManager,
      config: partialContext?.config || placeholderConfigManager,
      taskId: partialContext?.taskId,
      userId: partialContext?.userId,
      // callTool: ... // If tools can call other tools, this needs to be implemented
      inferenceExecutor: partialContext?.inferenceExecutor,
    };
    
    console.log(`Executing tool "${toolName}" with args:`, validatedArgs);
    try {
        const result = await tool.execute(validatedArgs, executionContext);
        console.log(`Tool "${toolName}" executed successfully.`);
        return result;
    } catch (error: any) {
        console.error(`Error during execution of tool "${toolName}":`, error);
        throw error; // Re-throw the error to be caught by the caller
    }
  }

  public getTool(toolName: string): Tool<any> | undefined {
    return this.tools.get(toolName);
  }

  public getAllTools(): Tool<any>[] {
    return Array.from(this.tools.values());
  }
}
