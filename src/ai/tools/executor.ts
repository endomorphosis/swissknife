// src/ai/tools/executor.ts
import { 
    Tool, 
    ToolInput, 
    ToolOutput, 
    ToolExecutionContext 
} from '../../types/ai.js'; // Using Zod-based Tool from types/ai.js
import { ZodType } from 'zod';

// Default no-op provider stubs — replaced by real implementations when injected
// by the Agent or CLI context (see Agent constructor and CLI.initialize()).
const placeholderStorageProvider = {
  add: async (_content: unknown) => 'cid_placeholder',
  get: async (_cid: string) => Buffer.from('content_placeholder'),
  list: async () => ['id1', 'id2'],
  delete: async (_cid: string) => true,
} satisfies Record<string, (...args: unknown[]) => unknown>;

const placeholderTaskManager = {
  // TaskManager stub: no-ops until real task manager is injected
  createTask: async () => 'task_id',
  updateTask: async () => {},
  getTask:    async () => null,
} satisfies Record<string, (...args: unknown[]) => unknown>;

const placeholderConfigManager = {
  get:       <T>(_key: string, defaultValue?: T) => defaultValue as T,
  set:       (_key: string, _value: unknown) => {},
  getConfig: () => ({}),
} satisfies Record<string, (...args: unknown[]) => unknown>;

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

    // Construct an execution context from the partial context provided by the caller.
    // The caller (Agent, CLI) should provide real providers; stubs are used when absent.
    const executionContext: ToolExecutionContext = {
      storage:           partialContext?.storage           ?? placeholderStorageProvider,
      taskManager:       partialContext?.taskManager       ?? placeholderTaskManager,
      config:            partialContext?.config            ?? placeholderConfigManager,
      taskId:            partialContext?.taskId,
      userId:            partialContext?.userId,
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
