// src/ai/agent/agent.ts
import { ToolExecutor } from '../tools/executor';
import { ThinkingManager } from '../thinking/manager';
import { 
    AgentMessage, 
    AgentOptions, 
    IModel, // Use IModel for the agent's model interface
    ToolCallResult,
    Tool // Using Tool from types/ai.js
} from '../types/ai';
import { v4 as uuidv4 } from 'uuid';

export class Agent {
  private model: IModel; // Agent holds an IModel instance
  private tools: Map<string, Tool<any>> = new Map(); // Specify Tool generic type
  private toolExecutor: ToolExecutor;
  private thinkingManager: ThinkingManager;
  private memory: AgentMessage[] = [];
  private agentOptions: AgentOptions; // Store the original options
  private currentConversationId: string;

  constructor(options: AgentOptions, conversationId?: string) {
    this.model = options.model; // options.model is IModel
    this.agentOptions = { 
        maxTokens: 1000, 
        temperature: 0.7, 
        // defaultThinkingPattern from options is not directly compatible with ReasoningStrategyType
        ...options 
    };
    
    this.toolExecutor = new ToolExecutor();
    // Instantiate ThinkingManager with its own default strategy, or map ThinkingPattern if needed
    this.thinkingManager = new ThinkingManager(); 

    if (options.tools) {
      for (const tool of options.tools) {
        this.registerTool(tool);
      }
    }
    this.currentConversationId = conversationId || uuidv4();
  }

  public setCurrentConversationId(conversationId: string): void {
    if (this.currentConversationId !== conversationId) {
        this.currentConversationId = conversationId;
        this.clearMemory(); // Changing conversation usually implies clearing context/memory
        console.log(`Agent conversation ID set to: ${conversationId}`);
    }
  }

  public getCurrentConversationId(): string {
    return this.currentConversationId;
  }

  public registerTool(tool: Tool<any>): void { // Specify Tool generic type
    this.tools.set(tool.name, tool);
    this.toolExecutor.registerTool(tool); 
  }

  async processMessage(messageContent: string): Promise<AgentMessage> {
    const userMessage: AgentMessage = {
      role: 'user',
      content: messageContent,
      id: uuidv4(),
      conversationId: this.currentConversationId,
      timestamp: new Date().toISOString(),
    };
    this.memory.push(userMessage);

    // 1. Create initial thinking graph (e.g., a single question node)
    // The model passed to createThinkingGraph should be the concrete Model class instance
    // if ThinkingManager expects that. But TM's methods take IModel.
    // The model instance held by Agent is IModel.
    const thoughtGraph = await this.thinkingManager.createThinkingGraph(
      messageContent, 
      this.model // Pass IModel instance
    ); 

    // 2. Process the graph (expand, reason, etc.)
    const processedGraph = await this.thinkingManager.processGraph(
      thoughtGraph, 
      this.model // Pass IModel instance
    );

    // 3. Identify tools to use from the processed graph
    const toolsToExecute = this.thinkingManager.identifyTools(
      processedGraph, 
      Array.from(this.tools.values())
    );

    // 4. Execute tools
    const toolExecutionResults: ToolCallResult[] = [];
    for (const toolRequest of toolsToExecute) {
      try {
        // ToolExecutor needs context. AgentContext might be suitable.
        // This part needs a proper ToolExecutionContext.
        // For now, ToolExecutor in Phase 2 plan didn't take context.
        // Assuming ToolExecutor.execute is updated or context is optional.
        const result = await this.toolExecutor.execute(
          toolRequest.name, 
          toolRequest.args
          // TODO: Provide ToolExecutionContext here
        );
        toolExecutionResults.push({
          toolName: toolRequest.name,
          args: toolRequest.args,
          result: result,
          success: true,
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        toolExecutionResults.push({
          toolName: toolRequest.name,
          args: toolRequest.args,
          result: null,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 5. Generate final response based on graph and tool results
    const responseContent = await this.thinkingManager.generateResponse(
      processedGraph, 
      this.model, // Pass IModel instance
      toolExecutionResults
    );

    // Add token usage metrics if available from the model
    let usage;
    try {
      // Check if the model supports usage metrics
      if (typeof this.model.getLastUsageMetrics === 'function') {
        const lastModelResponse = await this.model.getLastUsageMetrics();
        if (lastModelResponse) {
          usage = {
            promptTokens: lastModelResponse.promptTokens || 0,
            completionTokens: lastModelResponse.completionTokens || 0,
            totalTokens: lastModelResponse.totalTokens || 0
          };
        }
      }
    } catch (error) {
      // Silently handle if usage metrics aren't available
    }
    
    const assistantMessage: AgentMessage = {
      role: 'assistant',
      content: responseContent,
      id: uuidv4(),
      conversationId: this.currentConversationId,
      timestamp: new Date().toISOString(),
      toolResults: toolExecutionResults.length > 0 ? toolExecutionResults : undefined,
      usage: usage,
      // thinking: { ... } // TODO: Populate thinking result from ThinkingManager if available
    };
    this.memory.push(assistantMessage);
    return assistantMessage;
  }

  public getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  public getMemory(): AgentMessage[] {
    return [...this.memory];
  }

  public clearMemory(): void {
    this.memory = [];
  }
  
  /**
   * Sets the model for this agent
   * @param model The new model to use
   */
  public setModel(model: IModel): void {
    this.model = model;
  }
  
  /**
   * Sets the temperature parameter for this agent
   * @param temperature The new temperature value (0-2)
   */
  public setTemperature(temperature: number): void {
    if (temperature < 0 || temperature > 2) {
      throw new Error('Temperature must be between 0 and 2');
    }
    this.agentOptions.temperature = temperature;
  }
}
