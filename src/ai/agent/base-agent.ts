/**
 * Base AI Agent Implementation
 * 
 * Implements the AIAgent interface with core functionality
 * for processing messages and managing tools.
 */

import { v4 as uuidv4 } from 'uuid';
import { 
  AIAgent, 
  AgentContext, 
  AgentResponse, 
  Message, 
  Tool, 
  ToolCall, 
  ToolContext,
  ThinkingState 
} from '../types';
import { GoTManager } from '../tasks/graph/manager';
import { GoTNodeType, GoTNodeStatus } from '../tasks/graph/node';
import { LogManager } from '../utils/logging/manager';
import { ModelRegistry } from '../models/registry';
const modelRegistry = ModelRegistry.getInstance();
const getModelProvider = (modelId: string) => modelRegistry.getModelProvider(modelId);

import type { ModelSelector } from '../types';

export class BaseAIAgent implements AIAgent {
  private tools: Map<string, Tool> = new Map();
  private logger = LogManager.getInstance();
  private gotManager = GoTManager.getInstance();
  private modelSelector: ModelSelector;
  
  constructor(modelSelector?: ModelSelector) {
    this.modelSelector = modelSelector || (async (context: AgentContext) => {
      // Default to using the modelId from context, or gpt-4o if not specified
      return context.modelId || 'gpt-4o';
    });
  }
  
  /**
   * Process a message and generate a response
   */
  async processMessage(message: string, context: AgentContext): Promise<AgentResponse> {
    this.logger.info('Processing message', { conversationId: context.conversationId });
    
    try {
      // Create a new message from the input
      const userMessage: Message = {
        id: uuidv4(),
        role: 'user',
        content: message,
        timestamp: Date.now(),
        metadata: {}
      };
      
      // Add the new message to the context
      const updatedMessages = [...context.messages, userMessage];
      const updatedContext = {
        ...context,
        messages: updatedMessages
      };
      
      // Select the appropriate model
      const modelId = await this.modelSelector(updatedContext);
      this.logger.debug('Selected model', { modelId });
      
      // Get the model provider
      const provider = getModelProvider(modelId);
      if (!provider) {
        throw new Error(`No provider found for model: ${modelId}`);
      }
      
      // Get available tools for this context
      const availableTools = this.getAvailableTools(context);
      
      // Generate a response using the model provider
      const response = await provider.generateResponse({
        messages: updatedMessages,
        model: modelId,
        tools: availableTools,
        systemPrompt: context.systemPrompt,
        maxTokens: context.maxTokens,
        temperature: context.temperature
      });
      
      // Process any tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          // Mark as pending initially
          toolCall.status = 'pending';
          
          // Execute in the background if needed
          this.executeToolInBackground(toolCall, {
            messages: updatedMessages,
            toolCallId: toolCall.id,
            conversationId: context.conversationId,
            userId: context.userId,
            nodeId: context.nodeId,
            graphId: context.graphId
          });
        }
      }
      
      return response;
    } catch (error) {
      this.logger.error('Error processing message', error);
      throw error;
    }
  }
  
  /**
   * Execute a tool call
   */
  async executeTool(toolCall: ToolCall, context: ToolContext): Promise<any> {
    this.logger.info('Executing tool', { name: toolCall.name, conversationId: context.conversationId });
    
    try {
      // Find the tool
      const tool = this.getTool(toolCall.name);
      if (!tool) {
        throw new Error(`Tool not found: ${toolCall.name}`);
      }
      
      // Update tool call status
      toolCall.status = 'running';
      
      // Execute the tool
      const result = await tool.execute(toolCall.arguments, context);
      
      // Update tool call status and result
      toolCall.status = 'completed';
      toolCall.result = result;
      
      return result;
    } catch (error) {
      if (error instanceof Error) {
        // Update tool call status
        toolCall.status = 'failed';
        toolCall.result = { error: error.message };
        
        this.logger.error('Error executing tool', { name: toolCall.name, error });
        throw error;
      } else {
        this.logger.error('Unknown error executing tool', { name: toolCall.name });
        throw new Error('Unknown error executing tool');
      }
    }
  }
  
  /**
   * Execute a tool call in the background
   */
  private async executeToolInBackground(toolCall: ToolCall, context: ToolContext): Promise<void> {
    try {
      await this.executeTool(toolCall, context);
    } catch (error) {
      // Error already logged in executeTool
    }
  }
  
  /**
   * Register a tool with the agent
   */
  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
    this.logger.debug('Registered tool', { name: tool.name });
  }
  
  /**
   * Get all registered tools
   */
  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }
  
  /**
   * Get a specific tool by name
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }
  
  /**
   * Get available tools for the given context
   */
  private getAvailableTools(context: AgentContext): Tool[] {
    const contextTools = context.tools || [];
    const registeredTools = this.getTools().filter((tool: Tool) => 
      tool.isEnabled !== false && 
      !contextTools.some((t: Tool) => t.name === tool.name)
    );
    return [...contextTools, ...registeredTools];
  }
  
  /**
   * Initiate graph-of-thought reasoning process
   */
  async think(question: string, context: AgentContext): Promise<ThinkingState> {
    this.logger.info('Initiating thinking process', { conversationId: context.conversationId });
    
    try {
      // Create a new graph
      const graphId = this.gotManager.createGraph();
      
      // Create the root question node
      const rootNode = this.gotManager.createNode(graphId, {
        type: GoTNodeType.QUESTION,
        content: question,
        data: {
          conversationId: context.conversationId,
          userId: context.userId,
          timestamp: Date.now()
        }
      });
      
      // Initialize thinking state
      const state: ThinkingState = {
        graphId,
        rootNodeId: rootNode.id,
        currentNodeId: rootNode.id,
        completed: false,
        reasoning: [],
        conclusions: []
      };
      
      // Continue the thinking process
      return this.continueThinking(state, context);
    } catch (error) {
      this.logger.error('Error initiating thinking process', error);
      throw error;
    }
  }
  
  /**
   * Continue an existing graph-of-thought reasoning process
   */
  async continueThinking(state: ThinkingState, context: AgentContext): Promise<ThinkingState> {
    this.logger.info('Continuing thinking process', { 
      graphId: state.graphId, 
      currentNodeId: state.currentNodeId 
    });
    
    try {
      // If already completed, return the state as is
      if (state.completed) {
        return state;
      }
      
      // Get the current node
      const currentNode = this.gotManager.getNode(state.currentNodeId);
      if (!currentNode) {
        throw new Error(`Node not found: ${state.currentNodeId}`);
      }
      
      // Based on the current node type, determine the next step
      switch (currentNode.type) {
        case GoTNodeType.QUESTION:
          // For a question node, create thought nodes to decompose the problem
          await this.decomposeQuestion(state, context);
          break;
          
        case GoTNodeType.THOUGHT:
          // For a thought node, either create sub-thoughts or reach a conclusion
          await this.processThought(state, context);
          break;
          
        case GoTNodeType.TASK:
          // For a task node, execute the task and store the result
          await this.executeTask(state, context);
          break;
          
        case GoTNodeType.DECISION:
          // For a decision node, make a decision and create next steps
          await this.makeDecision(state, context);
          break;
          
        case GoTNodeType.ACTION:
          // For an action node, execute the action
          await this.executeAction(state, context);
          break;
          
        case GoTNodeType.RESULT:
          // For a result node, analyze the result
          await this.analyzeResult(state, context);
          break;
          
        case GoTNodeType.ANSWER:
          // For an answer node, mark as completed
          state.completed = true;
          state.conclusions.push(currentNode.content);
          break;
          
        case GoTNodeType.ERROR:
          // For an error node, attempt recovery or mark as completed
          await this.handleError(state, context);
          break;
      }
      
      return state;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error('Error continuing thinking process', error);
        
        const errorNode = this.gotManager.createNode(state.graphId, {
          type: GoTNodeType.ERROR,
          content: `Error: ${error.message}`,
          parentIds: [state.currentNodeId],
          data: { 
            error: error.toString(),
            stack: error.stack
          }
        });
        
        state.currentNodeId = errorNode.id;
        state.reasoning.push(`Error occurred: ${error.message}`);
      } else {
        this.logger.error('Unknown error continuing thinking process');
        state.conclusions.push('An unknown error occurred');
      }
      
      return state;
    }
  }
  
  /**
   * Decompose a question into thought nodes
   */
  private async decomposeQuestion(state: ThinkingState, context: AgentContext): Promise<void> {
    const questionNode = this.gotManager.getNode(state.currentNodeId);
    if (!questionNode) {
      throw new Error(`Question node not found: ${state.currentNodeId}`);
    }
    
    // Select the model for decomposition
    const modelId = await this.modelSelector(context);
    const provider = getModelProvider(modelId);
    if (!provider) {
      throw new Error(`No provider found for model: ${modelId}`);
    }
    
    // Create a system prompt for decomposition
    const systemPrompt = `You are an expert at breaking down complex questions into key components for analysis. 
Given a question, identify 3-5 main aspects or sub-questions that need to be answered.
For each aspect, provide a brief explanation of why it's important for answering the main question.
Format your response as a JSON array of objects with 'aspect' and 'explanation' properties.`;
    
    // Generate decomposition using the AI model
    const response = await provider.generateResponse({
      messages: [
        { 
          id: uuidv4(), 
          role: 'system', 
          content: systemPrompt, 
          timestamp: Date.now() 
        },
        { 
          id: uuidv4(), 
          role: 'user', 
          content: questionNode.content, 
          timestamp: Date.now() 
        }
      ],
      model: modelId,
      systemPrompt,
      temperature: 0.2 // Lower temperature for more focused decomposition
    });
    
    // Parse the response to extract aspects
    let aspects;
    try {
      // Extract JSON from response if needed
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response.content;
      aspects = JSON.parse(jsonStr);
    } catch (error) {
      this.logger.error('Error parsing decomposition response', error);
      
      // Fallback: Create a single thought node with the entire response
      const thoughtNode = this.gotManager.createNode(state.graphId, {
        type: GoTNodeType.THOUGHT,
        content: response.content,
        parentIds: [state.currentNodeId]
      });
      
      state.currentNodeId = thoughtNode.id;
      state.reasoning.push(response.content);
      return;
    }
    
    // Create thought nodes for each aspect
    for (const aspect of aspects) {
      const thoughtNode = this.gotManager.createNode(state.graphId, {
        type: GoTNodeType.THOUGHT,
        content: aspect.aspect,
        parentIds: [state.currentNodeId],
        data: {
          explanation: aspect.explanation,
          aspect: aspect.aspect
        }
      });
      
      state.reasoning.push(`${aspect.aspect}: ${aspect.explanation}`);
    }
    
    // Update the current node to the first thought node
    const readyNodes = this.gotManager.getReadyNodes(state.graphId);
    if (readyNodes.length > 0) {
      state.currentNodeId = readyNodes[0].id;
    }
  }
  
  /**
   * Process a thought node
   */
  private async processThought(state: ThinkingState, context: AgentContext): Promise<void> {
    const thoughtNode = this.gotManager.getNode(state.currentNodeId);
    if (!thoughtNode) {
      throw new Error(`Thought node not found: ${state.currentNodeId}`);
    }
    
    // Select the model for thought processing
    const modelId = await this.modelSelector(context);
    const provider = getModelProvider(modelId);
    if (!provider) {
      throw new Error(`No provider found for model: ${modelId}`);
    }
    
    // Create a system prompt for thought processing
    const systemPrompt = `You are an expert at analyzing complex thoughts and determining next steps.
Given a thought, determine if it needs to be broken down further into sub-thoughts,
converted into specific tasks, or if it leads to a conclusion.
Format your response as a JSON object with 'action' (one of: 'break_down', 'create_task', 'conclude'),
'explanation' (why you chose this action), and 'content' (the sub-thoughts, tasks, or conclusion).`;
    
    // Get parent nodes to provide context
    const parentNodes = this.gotManager.getParentNodes(state.currentNodeId);
    const context_str = parentNodes.map(node => `${node.type.toUpperCase()}: ${node.content}`).join('\n\n');
    
    // Generate analysis using the AI model
    const response = await provider.generateResponse({
      messages: [
        { 
          id: uuidv4(), 
          role: 'system', 
          content: systemPrompt, 
          timestamp: Date.now() 
        },
        { 
          id: uuidv4(), 
          role: 'user', 
          content: `Context:\n${context_str}\n\nThought to analyze: ${thoughtNode.content}`, 
          timestamp: Date.now() 
        }
      ],
      model: modelId,
      systemPrompt,
      temperature: 0.3
    });
    
    // Parse the response to extract the action
    let analysis;
    try {
      // Extract JSON from response if needed
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response.content;
      analysis = JSON.parse(jsonStr);
    } catch (error) {
      this.logger.error('Error parsing thought analysis response', error);
      
      // Fallback: Create a conclusion node with the entire response
      const conclusionNode = this.gotManager.createNode(state.graphId, {
        type: GoTNodeType.ANSWER,
        content: response.content,
        parentIds: [state.currentNodeId]
      });
      
      state.currentNodeId = conclusionNode.id;
      state.conclusions.push(response.content);
      return;
    }
    
    // Process based on the determined action
    switch (analysis.action) {
      case 'break_down':
        // Create sub-thought nodes
        const subThoughts = Array.isArray(analysis.content) ? analysis.content : [analysis.content];
        
        for (const subThought of subThoughts) {
          const subThoughtNode = this.gotManager.createNode(state.graphId, {
            type: GoTNodeType.THOUGHT,
            content: typeof subThought === 'string' ? subThought : JSON.stringify(subThought),
            parentIds: [state.currentNodeId]
          });
        }
        break;
        
      case 'create_task':
        // Create task nodes
        const tasks = Array.isArray(analysis.content) ? analysis.content : [analysis.content];
        
        for (const task of tasks) {
          const taskNode = this.gotManager.createNode(state.graphId, {
            type: GoTNodeType.TASK,
            content: typeof task === 'string' ? task : JSON.stringify(task),
            parentIds: [state.currentNodeId]
          });
        }
        break;
        
      case 'conclude':
        // Create conclusion/answer node
        const conclusion = typeof analysis.content === 'string' 
          ? analysis.content 
          : JSON.stringify(analysis.content);
          
        const conclusionNode = this.gotManager.createNode(state.graphId, {
          type: GoTNodeType.ANSWER,
          content: conclusion,
          parentIds: [state.currentNodeId]
        });
        
        state.conclusions.push(conclusion);
        break;
        
      default:
        // Create a general follow-up node with the response content
        const followUpNode = this.gotManager.createNode(state.graphId, {
          type: GoTNodeType.THOUGHT,
          content: response.content,
          parentIds: [state.currentNodeId]
        });
    }
    
    // Mark the current thought node as completed
    this.gotManager.updateNodeStatus(state.currentNodeId, GoTNodeStatus.COMPLETED);
    
    // Update the current node to the next ready node
    const readyNodes = this.gotManager.getReadyNodes(state.graphId);
    if (readyNodes.length > 0) {
      state.currentNodeId = readyNodes[0].id;
    } else {
      // If no ready nodes, check if there are any answer nodes
      const answerNodes = this.gotManager.getNodesByType(state.graphId, GoTNodeType.ANSWER);
      if (answerNodes.length > 0) {
        state.currentNodeId = answerNodes[0].id;
        state.completed = true;
      }
    }
  }
  
  /**
   * Execute a task node
   */
  private async executeTask(state: ThinkingState, context: AgentContext): Promise<void> {
    // This is a placeholder for task execution
    // In a real implementation, this would dispatch tasks to appropriate handlers
    const taskNode = this.gotManager.getNode(state.currentNodeId);
    if (!taskNode) {
      throw new Error(`Task node not found: ${state.currentNodeId}`);
    }
    
    // Create a result node to store the task result
    const resultNode = this.gotManager.createNode(state.graphId, {
      type: GoTNodeType.RESULT,
      content: `Result for task: ${taskNode.content}`,
      parentIds: [state.currentNodeId],
      data: {
        task: taskNode.content,
        completed: true,
        timestamp: Date.now()
      }
    });
    
    // Mark the task as completed
    this.gotManager.updateNodeStatus(state.currentNodeId, GoTNodeStatus.COMPLETED);
    
    // Update the current node to the result node
    state.currentNodeId = resultNode.id;
  }
  
  /**
   * Make a decision at a decision node
   */
  private async makeDecision(state: ThinkingState, context: AgentContext): Promise<void> {
    // This is a placeholder for decision making
    // In a real implementation, this would use AI to make decisions
    const decisionNode = this.gotManager.getNode(state.currentNodeId);
    if (!decisionNode) {
      throw new Error(`Decision node not found: ${state.currentNodeId}`);
    }
    
    // Create an action node based on the decision
    const actionNode = this.gotManager.createNode(state.graphId, {
      type: GoTNodeType.ACTION,
      content: `Action based on decision: ${decisionNode.content}`,
      parentIds: [state.currentNodeId]
    });
    
    // Mark the decision as completed
    this.gotManager.updateNodeStatus(state.currentNodeId, GoTNodeStatus.COMPLETED);
    
    // Update the current node to the action node
    state.currentNodeId = actionNode.id;
  }
  
  /**
   * Execute an action node
   */
  private async executeAction(state: ThinkingState, context: AgentContext): Promise<void> {
    // This is a placeholder for action execution
    // In a real implementation, this would execute specific actions
    const actionNode = this.gotManager.getNode(state.currentNodeId);
    if (!actionNode) {
      throw new Error(`Action node not found: ${state.currentNodeId}`);
    }
    
    // Create a result node to store the action result
    const resultNode = this.gotManager.createNode(state.graphId, {
      type: GoTNodeType.RESULT,
      content: `Result for action: ${actionNode.content}`,
      parentIds: [state.currentNodeId],
      data: {
        action: actionNode.content,
        completed: true,
        timestamp: Date.now()
      }
    });
    
    // Mark the action as completed
    this.gotManager.updateNodeStatus(state.currentNodeId, GoTNodeStatus.COMPLETED);
    
    // Update the current node to the result node
    state.currentNodeId = resultNode.id;
  }
  
  /**
   * Analyze a result node
   */
  private async analyzeResult(state: ThinkingState, context: AgentContext): Promise<void> {
    // This is a placeholder for result analysis
    // In a real implementation, this would analyze results and determine next steps
    const resultNode = this.gotManager.getNode(state.currentNodeId);
    if (!resultNode) {
      throw new Error(`Result node not found: ${state.currentNodeId}`);
    }
    
    // Create a thought node based on the data analysis
    const thoughtNode = this.gotManager.createNode(state.graphId, {
      type: GoTNodeType.THOUGHT,
      content: `Analysis of result: ${resultNode.content}`,
      parentIds: [state.currentNodeId]
    });
    
    // Mark the result as completed
    this.gotManager.updateNodeStatus(state.currentNodeId, GoTNodeStatus.COMPLETED);
    
    // Update the current node to the thought node
    state.currentNodeId = thoughtNode.id;
  }
  
  /**
   * Handle an error node
   */
  private async handleError(state: ThinkingState, context: AgentContext): Promise<void> {
    // This is a placeholder for error handling
    // In a real implementation, this would attempt recovery or provide fallbacks
    const errorNode = this.gotManager.getNode(state.currentNodeId);
    if (!errorNode) {
      throw new Error(`Error node not found: ${state.currentNodeId}`);
    }
    
    // Mark the process as completed since we don't have recovery implemented yet
    state.completed = true;
    state.conclusions.push(`Error occurred: ${errorNode.content}`);
  }
}
