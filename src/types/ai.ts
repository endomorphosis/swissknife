import { CID, Status, TaskID } from './common';
import { StorageProvider } from './storage'; 
import { TaskManager } from '../tasks/manager'; 
import { InferenceExecutor } from '../ml/inference/executor'; 
import { z, ZodType } from 'zod'; 

/**
 * Represents the input parameters for an AI model generation request.
 */
export interface ModelGenerateInput {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  taskId?: TaskID; 
  userId?: string;
  messages?: AgentMessage[]; // Added for chat history
  availableTools?: Tool[]; // Added for tool selection
  pattern?: ThinkingPattern; // Added for structured thinking
}

/**
 * Represents the output from an AI model generation request.
 */
export interface ModelGenerateOutput {
  content: string; 
  status: Status; 
  modelUsed?: string; 
  usage?: { 
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  cost?: number; 
  error?: string; 
}

/**
 * Options for constructing a Model class instance.
 */
export interface ModelOptions {
  id: string;
  name: string;
  provider: string;
  parameters?: Record<string, any>;
  metadata?: Record<string, any>;
  maxTokens?: number;
  pricePerToken?: number;
  source?: string;
  capabilities?: ModelCapabilities; // Added to resolve TS2339 error in openai-factory.ts
}

export interface ModelCapabilities {
  streaming: boolean;
  tools: boolean;
  structuredOutput: boolean;
  images?: boolean;
}

export enum ModelProvider {
  OPENAI = "openai",
  ANTHROPIC = "anthropic",
  GOOSE = "goose", // For custom/local models like 'goose'
  VERTEX = "vertex", // For Google Vertex AI
  BEDROCK = "bedrock", // For AWS Bedrock
  CUSTOM = "custom", // For other local or self-hosted models
  UNKNOWN = "unknown",
}

/**
 * Interface defining the contract for AI model providers.
 */
export interface IModel { // Renamed from Model to IModel
  readonly id: string; 
  getName(): string; // Added for logging/identification
  getProvider(): string; // Added for consistency
  generate(input: ModelGenerateInput): Promise<ModelGenerateOutput>;
  // Optional method to retrieve the latest token usage metrics
  getLastUsageMetrics?(): Promise<{
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  }>;
  // Potentially other methods like getParameters, setParameter if part of general contract
}

/**
 * Represents the input arguments for a Tool execution.
 * Defined by the tool's specific Zod input schema.
 */
export type ToolInput<T extends ZodType = ZodType> = z.infer<T>;

/**
 * Represents the output/result from a Tool execution.
 */
export type ToolOutput = string | Record<string, any> | Buffer; 

/**
 * Represents the context provided to a Tool during execution.
 */
export interface ToolExecutionContext {
  config: import('../config/manager').ConfigManager;  // Fixed to use ConfigManager
  storage: StorageProvider;
  taskManager: TaskManager; 
  taskId?: TaskID;
  userId?: string;
  callTool?: (toolName: string, input: Record<string, any>) => Promise<ToolOutput>; // Input type changed
  inferenceExecutor?: InferenceExecutor; 
}

/**
 * Interface defining the contract for Tools that the AI Agent can use.
 * Uses Zod for input schema definition and validation.
 */
export interface Tool<T extends ZodType = ZodType> {
  readonly name: string;
  readonly description: string;
  /**
   * Zod schema definition for the expected input arguments.
   * Used for validation and potentially by the AI model for formatting requests.
   */
  readonly inputSchema: T; 

  /**
   * Executes the tool's logic.
   * @param input The input arguments, validated against inputSchema by the ToolExecutor.
   * @param context Execution context providing access to resources.
   * @returns A promise resolving to the tool's output.
   */
  execute(input: ToolInput<T>, context: ToolExecutionContext): Promise<ToolOutput>;
  parameters?: any[]; // Added to resolve TS2339 error in openai-model.ts
}

/**
 * Represents the context available to the AI Agent during its operation.
 */
export interface AgentContext {
  config: import('../config/manager').ConfigManager; // Use ConfigManager directly
  storage: StorageProvider;
  // Add other shared resources or state needed by the agent
}

/**
 * Thinking pattern types supported by the AI system
 */
export enum ThinkingPattern {
  Direct = 'direct',            // Simple, direct thinking
  ChainOfThought = 'chain',     // Sequential, step-by-step thinking
  GraphOfThought = 'graph',     // Branching, interconnected thinking paths
  TreeOfThoughts = 'tree'       // Tree-structured exploration of options
}

/**
 * Options for configuring an Agent
 */
export interface AgentOptions {
  /** Model to use for generating responses */
  model: IModel; // Changed to IModel
  /** Maximum tokens to generate in responses */
  maxTokens?: number;
  /** Temperature setting for response generation */
  temperature?: number;
  /** Priority for agent tasks in the task system */
  priority?: number;
  /** Tools available to the agent */
  tools?: Tool[];
  /** Task manager for creating agent tasks */
  taskManager?: TaskManager;
  /** Default thinking pattern to use */
  defaultThinkingPattern?: ThinkingPattern;
  /** Whether to stream responses */
  stream?: boolean;
}

/**
 * Message in an agent conversation
 */
export interface AgentMessage {
  /** Role of the message sender (user or assistant) */
  role: 'user' | 'assistant' | 'system';
  /** Content of the message */
  content: string;
  /** Unique ID for the message */
  id: string;
  /** ID of the conversation this message belongs to */
  conversationId: string;
  /** Timestamp when the message was created */
  timestamp: string;
  /** Optional thinking process for assistant messages */
  thinking?: ThinkingResult;
  /** Optional tool results for assistant messages */
  toolResults?: ToolCallResult[];
  /** Optional token usage statistics */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  /** Optional error if message processing failed */
  error?: string;
}

/**
 * Result of the agent's thinking process
 */
export interface ThinkingResult {
  /** Thinking pattern used */
  pattern: ThinkingPattern;
  /** Individual thinking steps */
  steps?: Array<{
    /** Step content */
    content: string;
    /** Step type or label */
    type?: string;
  }>;
  /** Summary of the thinking process */
  summary?: string;
  /** Error encountered during thinking */
  error?: string;
  /** Timestamp when thinking was performed */
  timestamp: string;
  /** Time taken for thinking in milliseconds */
  elapsedTimeMs?: number;
}

/**
 * Represents a tool that should be called
 */
export interface ToolCall {
  /** Name of the tool to call */
  toolName: string;
  /** Arguments to pass to the tool */
  args: Record<string, any>;
  /** Optional reason for calling this tool */
  reason?: string;
}

/**
 * Result of executing a tool
 */
export interface ToolCallResult {
  /** Name of the tool that was called */
  toolName: string;
  /** Arguments that were passed to the tool */
  args: Record<string, any>;
  /** Result returned by the tool */
  result: any;
  /** Whether the tool execution succeeded */
  success: boolean;
  /** Error message if the tool execution failed */
  error?: string;
  /** Timestamp when the tool was executed */
  timestamp: string;
}

/**
 * Result of tool selection by the model
 */
export interface ToolSelectionResult {
  /** Tools that should be called */
  toolCalls: ToolCall[];
  /** Reasoning for the selection */
  reasoning?: string;
}

// --- Added for Model Definitions ---

/**
 * Represents the configuration for a single model variant within a provider.
 * This is used for defining models, which are then instantiated into Model class instances.
 */
export interface ModelDefinition {
  id: string;                 // Unique ID for the model, e.g., "gpt-3.5-turbo"
  name: string;               // Human-readable name, e.g., "GPT-3.5 Turbo"
  provider: string;           // Provider ID string, should match a ModelProvider enum value
  parameters?: Record<string, any>; // Default parameters like maxTokens, temperature
  metadata?: Record<string, any>;   // Other metadata like capabilities, source, context window size
  // Deprecated fields that should be moved to parameters or metadata:
  // maxTokens?: number; (move to parameters)
  // capabilities?: Record<string, any>; (move to metadata)
  // source?: string; (move to metadata)
}

/**
 * Represents the definition of a model provider and its available models.
 */
export { Status };

export interface ProviderDefinition {
  id: string;                 // Unique ID for the provider, e.g., "openai"
  name: string;               // Human-readable name, e.g., "OpenAI"
  baseURL?: string;            // Base API URL for the provider
  envVar?: string;             // Environment variable for the API key
  defaultModel?: string;       // ID of the default model for this provider
  models: ModelDefinition[];  // List of model definitions offered by this provider
}

/**
 * Represents a request for model selection.
 */
export interface ModelRequest {
  type: string; // e.g., 'code_generation', 'creative_writing', 'general'
  length?: number; // e.g., length of input text
  priority?: 'low' | 'medium' | 'high'; // e.g., latency requirements
  // Add other relevant characteristics of the request
}

/**
 * Represents the result of a model selection.
 */
export interface ModelSelection {
  model: string; // ID of the selected model
  confidence: number; // Confidence score (0.0 - 1.0)
  reason: string; // Explanation for the selection
}

/**
 * Defines a rule for model selection.
 */
export interface ModelSelectionRule {
  condition: (request: ModelRequest) => boolean; // Function to evaluate if rule applies
  modelPreference: string[]; // Ordered list of preferred model IDs
  reason: string; // Explanation for this rule
}

/**
 * Interface for a learning engine that predicts optimal model selection.
 */
export interface SelectionLearningEngine {
  predictOptimalModel(request: ModelRequest): Promise<ModelSelection>;
  // Potentially methods for training or updating the engine
}

// Placeholder interfaces for compilation
export interface ModelInstance {
  id: string;
  execute(request: ModelRequest): Promise<ModelResponse>;
  capabilities: ModelCapabilities;
  currentLoad: number;
}

export interface ModelLoadBalancer {}
export interface ModelPerformanceMonitor {
  getModelPerformance(modelId: string): Promise<{ averageResponseTime: number; successRate: number }>;
}
export interface CostOptimizer {
  calculateEfficiency(modelId: string, characteristics: RequestCharacteristics): Promise<number>;
}
export interface Agent {
  id: string;
  capabilities: AgentCapability[];
  currentLoad: number;
  performanceScore: number;
}
export interface SharedContext {}
export interface ProgressTracker {}
export interface WorkflowDefinition {
  stages: WorkflowStage[];
}
export interface WorkflowResult {}
export interface WorkflowStage {}
export interface RequestCharacteristics {
  requiredCapabilities?: string[];
}
export interface ModelResponse {}

export interface PriorityQueue<T> {
  enqueue(item: T, priority: number): void;
  dequeue(): T | undefined;
  isEmpty(): boolean;
}

export interface MessageHandler {
  (message: AgentMessage): void;
}

export interface BroadcastChannel {
  publish(message: AgentMessage): Promise<void>;
}

export enum ConflictType {
  RESOURCE_ALLOCATION = 'resource_allocation',
  TASK_PRIORITY = 'task_priority',
  DATA_INCONSISTENCY = 'data_inconsistency',
}

export interface ResolutionStrategy {
  resolve(conflict: AgentConflict): Promise<ConflictResolution>;
}

export interface AgentConflict {
  type: ConflictType;
  participants: Agent[];
  details: string;
}

export interface ConflictResolution {
  resolution: ResolutionType;
  winner?: string;
  details?: string;
}

export enum ResolutionType {
  PRIORITY_BASED = 'priority_based',
  ARBITRATION = 'arbitration',
  NEGOTIATION = 'negotiation',
}

export interface AgentCapability {
  name: string;
  level: number;
}

export interface LoadBalancer {}
export interface PerformanceMonitor {}

export interface DistributedTask {
  id: string;
  requirements: TaskRequirements;
}

export interface TaskAssignment {
  taskId: string;
  agentId: string;
}

export interface TaskRequirements {
  capabilities: string[];
  resourceNeeds: Record<string, number>;
}

export interface ExecutionMonitor {}
export interface AdaptationTrigger {
  shouldTrigger(execution: WorkflowExecution): Promise<boolean>;
  generateAdaptation(execution: WorkflowExecution): Promise<any>;
}
export interface ContingencyPlan {}
export interface GeneratedWorkflow {}
export class WorkflowExecution {
  constructor(workflow: GeneratedWorkflow) {}
  isComplete(): boolean { return true; }
  getCurrentNode(): WorkflowNode { return { id: 'mock', type: 'mock', dependencies: [] }; }
  recordResult(nodeId: string, result: any): void{}
  advanceToNext(): void{}
  getResult(): WorkflowResult { return {}; }
}
export interface WorkflowNode {
  id: string;
  type: string;
  dependencies: string[];
}
export interface WorkflowTemplate {}
export interface WorkflowAdaptationEngine {}
export interface WorkflowOptimizationEngine {
  optimize(structure: WorkflowStructure): Promise<GeneratedWorkflow>;
}
export interface WorkflowConstraints {}
export interface ObjectiveAnalysis {
  decomposition: string[];
}
export interface WorkflowStructure {
  nodes: WorkflowNode[];
  edges: any[];
  metadata: any;
}
export interface ThoughtNode {
  id: string;
  content: string;
  type: ThoughtNodeType;
  status: GoTNodeStatus;
  parents: string[];
  children: string[];
  metadata?: Record<string, any>;
  result?: any;
}

export enum ThoughtNodeType {
  QUESTION = 'question',
  HYPOTHESIS = 'hypothesis',
  RESEARCH = 'research',
  ANALYSIS = 'analysis',
  ANSWER = 'answer',
  THOUGHT = 'thought',
  SYNTHESIS = 'synthesis',
  CONCLUSION = 'conclusion',
  DECOMPOSITION = 'decomposition',
}

export enum GoTNodeStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface LLMGenerationResult {
  content: string;
  // Potentially other metadata like confidence, tokens used, etc.
}

export interface GoTNode {
  id: string;
  content: string;
  type: ThoughtNodeType;
  status: GoTNodeStatus;
  parents: string[];
  children: string[];
  metadata?: Record<string, any>;
  result?: any;
}