/**
 * AI Agent Types
 * 
 * Type definitions for the AI agent system.
 */

import { GoTNode } from '../tasks/graph/node';

/**
 * Supported AI model providers
 */
export type ModelProvider = 
  | 'openai' 
  | 'anthropic' 
  | 'meta' 
  | 'google' 
  | 'local' 
  | 'custom';

/**
 * AI model information
 */
export interface ModelInfo {
  id: string;
  name: string;
  provider: ModelProvider;
  contextSize?: number;
  capabilities?: string[];
  deprecated?: boolean;
}

/**
 * Message role in a conversation
 */
export type MessageRole = 
  | 'system'
  | 'user'
  | 'assistant'
  | 'tool'
  | 'function';

/**
 * Message in a conversation
 */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Tool call information
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
}

/**
 * Tool parameter definition
 */
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
  default?: any;
  enum?: any[];
  items?: {
    type: string;
    properties?: Record<string, ToolParameter>;
  };
  properties?: Record<string, ToolParameter>;
}

/**
 * Tool definition
 */
export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (args: Record<string, any>, context: ToolContext) => Promise<any>;
  isEnabled?: boolean;
  requiresAuth?: boolean;
}

/**
 * Context provided to tool executions
 */
export interface ToolContext {
  messages: Message[];
  nodeId?: string;
  graphId?: string;
  userId?: string;
  toolCallId: string;
  conversationId: string;
}

/**
 * Agent context for processing messages
 */
export interface AgentContext {
  messages: Message[];
  conversationId: string;
  userId?: string;
  modelId?: string;
  tools?: Tool[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  nodeId?: string;
  graphId?: string;
}

/**
 * Agent response after processing a message
 */
export interface AgentResponse {
  messageId: string;
  content: string;
  toolCalls: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';
}

/**
 * Function to determine which model to use for a given context
 */
export type ModelSelector = (context: AgentContext) => Promise<string>;

/**
 * Thinking state for graph-of-thought reasoning
 */
export interface ThinkingState {
  graphId: string;
  rootNodeId: string;
  currentNodeId: string;
  completed: boolean;
  reasoning: string[];
  conclusions: string[];
}

/**
 * AI Agent interface
 */
export interface AIAgent {
  /**
   * Process a message and generate a response
   */
  processMessage(message: string, context: AgentContext): Promise<AgentResponse>;
  
  /**
   * Execute a specific tool call
   */
  executeTool(toolCall: ToolCall, context: ToolContext): Promise<any>;
  
  /**
   * Register a tool with the agent
   */
  registerTool(tool: Tool): void;
  
  /**
   * Get all registered tools
   */
  getTools(): Tool[];
  
  /**
   * Get a specific tool by name
   */
  getTool(name: string): Tool | undefined;
  
  /**
   * Initiate graph-of-thought reasoning process
   */
  think(question: string, context: AgentContext): Promise<ThinkingState>;
  
  /**
   * Continue an existing graph-of-thought reasoning process
   */
  continueThinking(state: ThinkingState, context: AgentContext): Promise<ThinkingState>;
}