/**
 * Unit Tests for the Agent class (`src/ai/agent/agent.js`).
 *
 * These tests verify the Agent's core logic, including initialization,
 * tool registration, and the message processing flow, focusing on
 * interactions with its direct dependencies (ToolExecutor, ThinkingManager, Model).
 * Dependencies are mocked to isolate the Agent's behavior.
 */

// --- Mock Setup ---
// Mock internal dependencies *before* Agent is imported. Add .js extension.

const mockToolExecutorInstance = {
  registerTool: jest.fn(),
  execute: jest.fn(),
};
const mockThinkingManagerInstance = {
  createThinkingGraph: jest.fn(),
  processGraph: jest.fn(),
  identifyTools: jest.fn(),
  generateResponse: jest.fn(), // Will be configured in tests
};
jest.mock('@/ai/tools/executor.js', () => ({ // Adjust path if needed
  ToolExecutor: jest.fn().mockImplementation(() => mockToolExecutorInstance),
}));
jest.mock('@/ai/thinking/manager.js', () => ({ // Adjust path if needed
  ThinkingManager: jest.fn().mockImplementation(() => mockThinkingManagerInstance),
}));

// Mock other dependencies - Add .js extension
jest.mock('@/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Mock singleton ConfigManager - Mock only necessary methods on the instance
const mockConfigManagerInstance = {
    get: jest.fn((key, defaultValue) => defaultValue),
    set: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    initialize: jest.fn().mockResolvedValue(undefined),
    // Add other methods if Agent constructor/methods call them
};
jest.mock('@/config/manager.js', () => ({ // Adjust path if needed
  ConfigurationManager: {
    getInstance: jest.fn(() => mockConfigManagerInstance),
  },
}));

// --- Imports ---
// Add .js extension
import { Agent } from '@/ai/agent/agent.js'; // Adjust path if needed
import { MockStorageProvider } from '../../mocks/mockStorageProvider.js'; // Corrected relative path for mock
import { ConfigManager } from '@/config/manager.js'; // Adjust path if needed
// Import types directly - use RELATIVE path with .js extension
// Define placeholders for missing types
type ToolParameter = { name: string; type: string; description: string; required?: boolean };
// Define AgentMessage structure based on usage in tests
type AgentMessage = {
    role: 'user' | 'assistant';
    content: any; // Can be string or structured content
    toolCalls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
    toolResults?: Array<{ tool: string; result?: any; error?: string }>;
    // Add other potential properties like id, timestamp if needed
};
import type { Model, Tool, ToolExecutionContext as RealToolExecutionContext } from '../../../src/types/ai.js'; // Adjust path if needed
import { z } from 'zod'; // Assuming zod is a direct dependency

// Define placeholder type for ToolExecutionContext including configManager
type ToolExecutionContext = Partial<RealToolExecutionContext> & {
    abortController: AbortController;
    configManager?: ConfigManager; // Add optional configManager
    storageProvider?: any; // Add optional storageProvider
    agent?: Agent; // Add optional agent
};


// --- Mock Implementations ---

// Mock concrete tool implementation adhering to Tool interface
class MockTool implements Tool {
    readonly name = 'mock_tool';
    readonly description = 'A tool for testing';
    // Define inputSchema using Zod, as required by Tool interface (based on previous errors)
    readonly inputSchema = z.object({
        query: z.string().describe("The query for the mock tool"),
    });
    // Define parameters matching the schema
    readonly parameters: ToolParameter[] = [
        { name: 'query', type: 'string', description: 'Test query', required: true }
    ];
    // Mock the execute function
    execute = jest.fn().mockResolvedValue('Mock tool result'); // Return raw result
}

// Mock Model implementation adhering to Model interface
class MockModel implements Model {
    id: string = 'test-model-123';
    name: string = 'Test Model';
    provider: string = 'mock';
    parameters: Record<string, any> = {};
    metadata: Record<string, any> = {};
    // Mock the generate function required by Agent - Return AgentMessage structure
    generate = jest.fn().mockResolvedValue({ role: 'assistant', content: 'Default mock response' } as AgentMessage);

    // Add other methods if required by the Model interface used by Agent
    getId = () => this.id;
    getName = () => this.name;
    getProvider = () => this.provider;
    getParameters = () => ({ ...this.parameters });
    getMetadata = () => ({ ...this.metadata });
    setParameter = (key: string, value: any) => { this.parameters[key] = value; };
}


// --- Test Suite ---

describe('Agent', () => {
  let agent: Agent;
  let mockModel: jest.Mocked<MockModel>; // Use MockModel type
  let mockStorage: MockStorageProvider;
  let mockExecutionContext: ToolExecutionContext; // Use defined type

  beforeEach(() => {
    jest.clearAllMocks();

    // Prepare mock model instance
    mockModel = new MockModel() as jest.Mocked<MockModel>;

    // Prepare mocks for dependencies needed by Agent constructor or methods
    mockStorage = new MockStorageProvider();
    // ConfigManager mock instance is retrieved via the mock setup

    // Create Agent instance - Ensure constructor options match AgentOptions
    agent = new Agent({
      model: mockModel as unknown as Model, // Cast to satisfy Model type if needed
      storage: mockStorage, // Pass storage mock
      config: mockConfigManagerInstance as unknown as ConfigManager, // Cast mock
    });

    // Reset internal mocks (created by Agent constructor) before each test
    mockToolExecutorInstance.registerTool.mockClear();
    mockToolExecutorInstance.execute.mockClear();
    mockThinkingManagerInstance.createThinkingGraph.mockClear();
    mockThinkingManagerInstance.processGraph.mockClear();
    mockThinkingManagerInstance.identifyTools.mockClear();
    mockThinkingManagerInstance.generateResponse.mockClear();

    // Prepare mock ExecutionContext for tool calls (used by ToolExecutor mock)
    mockExecutionContext = {
        configManager: mockConfigManagerInstance as unknown as ConfigManager, // Cast mock
        storageProvider: mockStorage,
        agent: agent,
        abortController: new AbortController(), // Add required property
    };
  });

  it('should initialize correctly with dependencies', () => {
    // Assert
    expect(agent).toBeInstanceOf(Agent);
    // Verify internal dependencies were likely instantiated (via constructor mocks)
    expect(require('@/ai/tools/executor.js').ToolExecutor).toHaveBeenCalled();
    expect(require('@/ai/thinking/manager.js').ThinkingManager).toHaveBeenCalled();
  });

  it('should register tools via constructor and registerTool method', () => {
    // Arrange
    const tool1 = new MockTool();
    const tool2 = new MockTool();
    (tool2 as any).name = 'mock_tool_2'; // Give it a unique name

    // Act: Test registration via constructor
    const agentWithTools = new Agent({
        model: mockModel as unknown as Model,
        storage: mockStorage,
        config: mockConfigManagerInstance as unknown as ConfigManager, // Cast mock
        tools: [tool1]
    });

    // Assert: Constructor should call registerTool -> ToolExecutor.registerTool
    expect(mockToolExecutorInstance.registerTool).toHaveBeenCalledWith(tool1);

    // Act: Test registration via method on a separate instance
    mockToolExecutorInstance.registerTool.mockClear(); // Clear calls from constructor test
    agent.registerTool(tool2);

    // Assert: registerTool method should call ToolExecutor.registerTool
    expect(mockToolExecutorInstance.registerTool).toHaveBeenCalledWith(tool2);
  });

  it('should process a simple message using ThinkingManager (no tools)', async () => {
    // Arrange
    const userMessage = 'Hello there!';
    const mockGraph = { id: 'graph-1' }; // Mock graph object
    const finalResponseContent = 'General Kenobi!';
    // Mock generateResponse to return the content string
    (mockThinkingManagerInstance.generateResponse as jest.Mock).mockResolvedValue(finalResponseContent);


    // Mock ThinkingManager flow for a simple response
    (mockThinkingManagerInstance.createThinkingGraph as jest.Mock).mockResolvedValue(mockGraph);
    (mockThinkingManagerInstance.processGraph as jest.Mock).mockResolvedValue(mockGraph);
    (mockThinkingManagerInstance.identifyTools as jest.Mock).mockReturnValue([]);


    // Act
    const responseMessage: any = await agent.processMessage(userMessage); // Use 'any' type

    // Assert
    expect(responseMessage).toBeDefined();
    // Assert based on responseMessage being the content string
    expect(responseMessage).toBe(finalResponseContent);
    // Cannot check role, toolCalls, toolResults if it's just a string

    // Verify ThinkingManager methods were called correctly
    expect(mockThinkingManagerInstance.createThinkingGraph).toHaveBeenCalledWith(userMessage, mockModel);
    expect(mockThinkingManagerInstance.processGraph).toHaveBeenCalledWith(mockGraph, mockModel);
    expect(mockThinkingManagerInstance.identifyTools).toHaveBeenCalledWith(mockGraph, expect.any(Array));
    expect(mockThinkingManagerInstance.generateResponse).toHaveBeenCalledWith(mockGraph, mockModel, []);
  });

  it('should handle ThinkingManager failure during response generation', async () => {
    // Arrange
    const userMessage = 'Test failure';
    const mockGraph = { id: 'graph-fail' };
    const error = new Error('Failed to generate response');

    (mockThinkingManagerInstance.createThinkingGraph as jest.Mock).mockResolvedValue(mockGraph);
    (mockThinkingManagerInstance.processGraph as jest.Mock).mockResolvedValue(mockGraph);
    (mockThinkingManagerInstance.identifyTools as jest.Mock).mockReturnValue([]);
    (mockThinkingManagerInstance.generateResponse as jest.Mock).mockRejectedValue(error);

    // Act & Assert
    await expect(agent.processMessage(userMessage)).rejects.toThrow(error);

    // Verify ThinkingManager methods were called up to the point of failure
    expect(mockThinkingManagerInstance.createThinkingGraph).toHaveBeenCalled();
    expect(mockThinkingManagerInstance.processGraph).toHaveBeenCalled();
    expect(mockThinkingManagerInstance.identifyTools).toHaveBeenCalled();
    expect(mockThinkingManagerInstance.generateResponse).toHaveBeenCalled();
  });

  it('should execute a tool identified by ThinkingManager and generate final response', async () => {
     // Arrange
     const userMessage = 'Use the mock tool to find X';
     const mockGraph = { id: 'graph-tool' };
     const toolRequest = { name: 'mock_tool', args: { query: 'find X' } };
     const toolResult = 'Found X successfully!';
     const finalResponseContent = `Okay, I used the tool and found this: ${toolResult}`;
     // Mock generateResponse to return the content string
     (mockThinkingManagerInstance.generateResponse as jest.Mock).mockResolvedValue(finalResponseContent);


     // Mock ThinkingManager flow
     (mockThinkingManagerInstance.createThinkingGraph as jest.Mock).mockResolvedValue(mockGraph);
     (mockThinkingManagerInstance.processGraph as jest.Mock)
        .mockResolvedValueOnce(mockGraph)
        .mockResolvedValueOnce(mockGraph);
     (mockThinkingManagerInstance.identifyTools as jest.Mock).mockReturnValueOnce([toolRequest]);


     // Mock ToolExecutor
     (mockToolExecutorInstance.execute as jest.Mock).mockResolvedValue(toolResult);

     const mockTool = new MockTool();
     agent.registerTool(mockTool);

     // Act
     const responseMessage: any = await agent.processMessage(userMessage); // Use 'any' type

     // Assert
     expect(responseMessage).toBeDefined();
     // Assert based on responseMessage being the content string
     expect(responseMessage).toBe(finalResponseContent);
     // Cannot check role or toolResults if it's just a string

     // Verify mocks
     expect(mockThinkingManagerInstance.createThinkingGraph).toHaveBeenCalledTimes(1);
     expect(mockThinkingManagerInstance.processGraph).toHaveBeenCalledTimes(2);
     expect(mockThinkingManagerInstance.identifyTools).toHaveBeenCalledTimes(1);
     expect(mockToolExecutorInstance.execute).toHaveBeenCalledTimes(1);
     expect(mockToolExecutorInstance.execute).toHaveBeenCalledWith(
         toolRequest.name,
         toolRequest.args,
         expect.objectContaining({ agent: agent })
     );
     expect(mockThinkingManagerInstance.generateResponse).toHaveBeenCalledTimes(1);
     expect(mockThinkingManagerInstance.generateResponse).toHaveBeenCalledWith(
         mockGraph,
         mockModel,
         [{ tool: toolRequest.name, result: toolResult }]
     );
  });

  it('should handle tool execution error from ToolExecutor and generate final response', async () => {
     // Arrange
     const userMessage = 'Try a failing tool';
     const mockGraph = { id: 'graph-fail-tool' };
     const toolRequest = { name: 'mock_tool', args: { query: 'fail' } };
     const toolError = new Error('Tool failed spectacularly');
     const finalResponseContent = 'Sorry, the tool encountered an error.';
     // Mock generateResponse to return the content string even after error
     (mockThinkingManagerInstance.generateResponse as jest.Mock).mockResolvedValue(finalResponseContent);


     // Mock ThinkingManager flow
     (mockThinkingManagerInstance.createThinkingGraph as jest.Mock).mockResolvedValue(mockGraph);
     (mockThinkingManagerInstance.processGraph as jest.Mock)
        .mockResolvedValueOnce(mockGraph)
        .mockResolvedValueOnce(mockGraph);
     (mockThinkingManagerInstance.identifyTools as jest.Mock).mockReturnValueOnce([toolRequest]);


     // Mock ToolExecutor to throw the error
     (mockToolExecutorInstance.execute as jest.Mock).mockRejectedValue(toolError);

     agent.registerTool(new MockTool());

     // Act
     const responseMessage: any = await agent.processMessage(userMessage); // Use 'any' type

     // Assert
     // Check the content property of the returned response
     expect(responseMessage).toBe(finalResponseContent);
     // Cannot check toolResults if response is just a string

     // Verify mocks
     expect(mockToolExecutorInstance.execute).toHaveBeenCalledTimes(1);
     expect(mockThinkingManagerInstance.generateResponse).toHaveBeenCalledWith(
         mockGraph,
         mockModel,
         [{ tool: toolRequest.name, error: toolError.message }]
     );
  });

   // Add placeholder test if needed
   it('placeholder', () => { expect(true).toBe(true); });

});
