/**
 * Integration Tests for Model Execution Service and Storage Service Interaction.
 *
 * These tests verify workflows where results from the ModelExecutionService
 * are stored using a StorageService, and how components like the
 * GraphOfThoughtEngine might leverage this integration.
 *
 * Key dependencies (StorageFactory, ModelExecutionService, ModelRegistry) are mocked.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';

// --- Mock Setup ---

// Import helpers - Add .js extension
// Define basic placeholder types if not exported
type MockStorage = {
    add: jest.Mock;
    get: jest.Mock;
    clear: jest.Mock;
    // Add other methods if used
};
import { createMockStorage } from '../../helpers/mockStorage.js';
import { createTempTestDir, removeTempTestDir } from '../../helpers/testUtils.js';
// Define basic placeholder types if not exported
// Ensure GraphFixture includes edges
type ModelFixture = { providers: any[] };
type PromptFixture = { prompts: any[] };
type GraphFixture = { nodes: any[]; edges: any[] }; // Added edges
import { generateModelFixtures, generatePromptFixtures, generateGraphFixtures } from '../../helpers/fixtures.js';

// Mock the storage factory to return our mock storage instance
// Adjust path as needed
jest.mock('../../../src/storage/factory.js', () => ({
  StorageFactory: {
    createStorage: jest.fn().mockImplementation(() => createMockStorage()), // Use helper to create mock
  },
}));

// Mock the model execution service singleton - Correct path and add .js
// Try path starting from ../../
jest.mock('../../src/models/execution.js', () => {
  // Create a reusable mock instance for the service
  const mockExecuteModel = jest.fn().mockImplementation(async (modelId, prompt, options) => {
    // Simple mock response generation
    const responseText = `Mock response for model ${modelId}: ${String(prompt).substring(0, 30)}...`;
    return {
      response: responseText,
      usage: {
        promptTokens: Math.floor(String(prompt).length / 4),
        completionTokens: Math.floor(responseText.length / 4),
        totalTokens: Math.floor(String(prompt).length / 4) + Math.floor(responseText.length / 4),
      },
      timingMs: Math.random() * 500 + 100, // Simulate some delay
    };
  });
  return {
    ModelExecutionService: {
      getInstance: jest.fn().mockReturnValue({
        executeModel: mockExecuteModel,
        // Add other methods if needed and mock them
      }),
    },
  };
});

// Mock ModelRegistry singleton - Add .js extension
jest.mock('../../src/models/registry.js', () => ({
    ModelRegistry: jest.fn().mockImplementation(() => ({
        getInstance: jest.fn().mockReturnThis(),
        registerProvider: jest.fn(),
        registerModel: jest.fn(),
        // Add other methods if needed
    })),
}));

// Mock GraphOfThoughtEngine (assuming its path) - Add .js extension
jest.mock('../../src/tasks/graph/graph-of-thought.js', () => ({
    GraphOfThoughtEngine: jest.fn().mockImplementation(() => ({
        processQuery: jest.fn(), // Mock methods used in tests
    })),
}));


// --- Imports (after mocks) ---
// Adjust paths and add .js extension
import { ModelExecutionService } from '../../src/models/execution.js'; // Corrected path
import { StorageFactory } from '../../src/storage/factory.js';
import { ModelRegistry } from '../../src/models/registry.js';
import { GraphOfThoughtEngine } from '../../src/tasks/graph/graph-of-thought.js';
import { StorageProvider } from '../../src/storage/provider.js'; // Assuming this type exists

// Define placeholder for GoTResult including expected properties
type GoTResult = {
    answer: string;
    confidence: number;
    graphCid: string;
    // Add other potential properties
};


// --- Test Suite ---

describe('Integration: Model Execution <-> Storage', () => {
  // Define types for mocks and instances
  let modelRegistry: jest.Mocked<ModelRegistry>;
  let modelExecutionService: jest.Mocked<ModelExecutionService>;
  let storage: MockStorage; // Use the specific mock type
  let graphEngine: jest.Mocked<GraphOfThoughtEngine>;
  let tempDir: string;

  // Generate fixtures once
  const modelFixtures: ModelFixture = generateModelFixtures();
  const promptFixtures: PromptFixture = generatePromptFixtures();
  const graphFixtures: GraphFixture = generateGraphFixtures();

  beforeAll(async () => {
    // Create temp directory for any potential file system interactions by mocks
    tempDir = await createTempTestDir('model-storage-int');
  });

  afterAll(async () => {
    // Clean up temp directory
    await removeTempTestDir(tempDir);
  });

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Get mocked singleton instances
    // Note: Accessing mocked getInstance directly
    modelRegistry = ModelRegistry.getInstance() as jest.Mocked<ModelRegistry>;
    modelExecutionService = ModelExecutionService.getInstance() as jest.Mocked<ModelExecutionService>;
    // Get the mock storage instance directly from the factory mock
    storage = StorageFactory.createStorage() as MockStorage;
    graphEngine = new GraphOfThoughtEngine({ storage } as any) as jest.Mocked<GraphOfThoughtEngine>; // Instantiate with mock storage

    // Setup initial state for mocks if needed (e.g., register models)
    modelFixtures.providers.forEach((provider: any) => { // Add type 'any'
      modelRegistry.registerProvider(provider as any); // Cast if mock type differs
    });

    // Clear the mock storage before each test
    storage.clear();
  });

  // --- Test Cases ---

  describe('Model Result Persistence', () => {
    it('should store model execution results using the storage service', async () => {
      // Arrange
      const modelId = modelFixtures.providers[0].models[0].id;
      const prompt = promptFixtures.prompts[0].text;
      const expectedResponsePrefix = `Mock response for model ${modelId}`;

      // Act
      // 1. Execute the model (uses mocked service)
      const result = await modelExecutionService.executeModel(modelId, prompt);

      // 2. Store the result using the storage service
      const resultToStore = {
        modelId,
        prompt,
        result, // Contains mock response, usage, timing
        timestamp: Date.now(), // Add timestamp
      };
      const resultJson = JSON.stringify(resultToStore);
      const cid = await storage.add(resultJson); // Call mock storage 'add'

      // Assert
      // Verify model execution mock was called
      expect(modelExecutionService.executeModel).toHaveBeenCalledTimes(1);
      expect(modelExecutionService.executeModel).toHaveBeenCalledWith(modelId, prompt, undefined); // Check args

      // Verify storage mock 'add' was called
      expect(storage.add).toHaveBeenCalledTimes(1);
      expect(storage.add).toHaveBeenCalledWith(resultJson);
      expect(cid).toBeDefined();
      expect(typeof cid).toBe('string'); // Mock CID is likely a string

      // Verify retrieval from mock storage
      const retrievedBuffer = await storage.get(cid);
      expect(retrievedBuffer).toBeDefined();
      const retrievedData = JSON.parse(retrievedBuffer!.toString()); // Use non-null assertion

      // Verify retrieved data matches stored data
      expect(retrievedData.modelId).toBe(modelId);
      expect(retrievedData.prompt).toBe(prompt);
      expect(retrievedData.result.response).toContain(expectedResponsePrefix);
      expect(retrievedData.result.usage.totalTokens).toBeGreaterThan(0);
    });

    it('should allow storing and retrieving a history of model executions', async () => {
      // Arrange
      const modelId = modelFixtures.providers[0].models[0].id;
      const promptSet = promptFixtures.prompts.slice(0, 3); // Use a few prompts
      const executionHistory: Array<{ cid: string; prompt: string; response: string }> = [];

      // Act: Execute multiple prompts and store results
      for (const promptData of promptSet) {
        const result = await modelExecutionService.executeModel(modelId, promptData.text);
        const historyEntry = {
          modelId,
          prompt: promptData.text,
          result,
          timestamp: Date.now(),
        };
        const cid = await storage.add(JSON.stringify(historyEntry));
        executionHistory.push({ cid, prompt: promptData.text, response: result.response });
      }

      // Assert: Check history length and storage calls
      expect(executionHistory).toHaveLength(promptSet.length);
      expect(storage.add).toHaveBeenCalledTimes(promptSet.length);

      // Assert: Verify each history entry is retrievable and correct
      for (const entry of executionHistory) {
        const retrievedBuffer = await storage.get(entry.cid);
        expect(retrievedBuffer).toBeDefined();
        const retrievedData = JSON.parse(retrievedBuffer!.toString());

        expect(retrievedData.modelId).toBe(modelId);
        expect(retrievedData.prompt).toBe(entry.prompt);
        expect(retrievedData.result.response).toBe(entry.response);
      }
    });
  });

  describe('Graph of Thought Persistence', () => {
    it('should store individual graph nodes using the storage service', async () => {
      // Arrange
      const nodes = graphFixtures.nodes.slice(0, 2); // Use a couple of nodes
      const storedCids: Record<string, string> = {};

      // Act: Store each node individually
      for (const node of nodes) {
        const nodeJson = JSON.stringify(node);
        const cid = await storage.add(nodeJson);
        storedCids[node.id] = cid;
      }

      // Assert: Check storage calls
      expect(storage.add).toHaveBeenCalledTimes(nodes.length);

      // Assert: Verify each node is retrievable
      for (const node of nodes) {
        const cid = storedCids[node.id];
        expect(cid).toBeDefined();
        const retrievedBuffer = await storage.get(cid);
        expect(retrievedBuffer).toBeDefined();
        const retrievedNode = JSON.parse(retrievedBuffer!.toString());

        // Verify content matches (adjust based on actual node structure)
        expect(retrievedNode.id).toBe(node.id);
        expect(retrievedNode.content).toBe(node.content);
        expect(retrievedNode.type).toBe(node.type);
      }
    });

    it('should store and retrieve a complete graph structure', async () => {
      // Arrange: Create a simple graph structure object
      const graph = {
        id: 'graph-123',
        rootNodeId: graphFixtures.nodes[0].id,
        nodes: graphFixtures.nodes.map((n: any) => n.id), // Store only IDs, add type 'any'
        edges: graphFixtures.edges, // Ensure edges are included from fixture
        metadata: { createdAt: Date.now() },
      };
      // Assume individual nodes are stored separately (as in previous test)
      for (const node of graphFixtures.nodes) {
        await storage.add(JSON.stringify(node)); // Store nodes first
      }
      const graphJson = JSON.stringify(graph);

      // Act: Store the main graph structure object
      const graphCid = await storage.add(graphJson);

      // Assert: Check storage call and CID
      expect(graphCid).toBeDefined();
      expect(storage.add).toHaveBeenCalledTimes(graphFixtures.nodes.length + 1); // Nodes + Graph

      // Assert: Retrieve and verify the graph structure
      const retrievedBuffer = await storage.get(graphCid);
      expect(retrievedBuffer).toBeDefined();
      const retrievedGraph = JSON.parse(retrievedBuffer!.toString());

      expect(retrievedGraph.id).toBe(graph.id);
      expect(retrievedGraph.rootNodeId).toBe(graph.rootNodeId);
      expect(retrievedGraph.nodes).toEqual(graph.nodes);
      expect(retrievedGraph.edges).toEqual(graph.edges);
    });

    // This test relies heavily on the mocked implementation of graphEngine.processQuery
    it('should simulate GoT engine processing query and storing graph', async () => {
      // Arrange
      const query = "Explain photosynthesis.";
      const mockAnswer = `Mock answer to: ${query}`;
      const mockGraphCid = 'mock-graph-cid-123';

      // Configure the mock processQuery implementation
      (graphEngine.processQuery as jest.Mock).mockImplementation(async (q): Promise<GoTResult> => { // Add return type
          expect(q).toBe(query);
          // Simulate storing nodes and graph structure internally using the mock storage
          const graphData = { nodes: ['n1', 'n2'], edges: [{ from: 'n1', to: 'n2' }] }; // Simplified
          await storage.add(JSON.stringify({ id: 'n1', content: query }));
          await storage.add(JSON.stringify({ id: 'n2', content: mockAnswer }));
          await storage.add(JSON.stringify(graphData), mockGraphCid); // Allow specifying CID for mock
          // Return object matching GoTResult type
          return { answer: mockAnswer, confidence: 0.9, graphCid: mockGraphCid };
      });

      // Act: Call the mocked engine
      const result: GoTResult = await graphEngine.processQuery(query); // Add type

      // Assert: Check engine result
      expect(result).toBeDefined();
      expect(result.answer).toBe(mockAnswer); // Corrected property access
      expect(result.graphCid).toBe(mockGraphCid); // Corrected property access

      // Assert: Verify storage was used (at least for the graph structure)
      expect(storage.add).toHaveBeenCalledTimes(3); // 2 nodes + 1 graph
      expect(storage.add).toHaveBeenCalledWith(expect.any(String), mockGraphCid);

      // Assert: Retrieve the graph using the CID to confirm storage
      const retrievedBuffer = await storage.get(mockGraphCid);
      expect(retrievedBuffer).toBeDefined();
      const retrievedGraph = JSON.parse(retrievedBuffer!.toString());
      expect(retrievedGraph.nodes).toEqual(['n1', 'n2']);
    });
  });

  describe('Model Execution with Context from Storage', () => {
    it('should retrieve context from storage and use it in a model prompt', async () => {
      // Arrange: Store context data
      const contextData = { info: "Background info needed for prompt." };
      const contextJson = JSON.stringify(contextData);
      const contextCid = await storage.add(contextJson);
      expect(contextCid).toBeDefined();

      // Arrange: Define model and prompt
      const modelId = modelFixtures.providers[0].models[0].id;
      const userQuery = "Answer this based on context.";
      const expectedFullPrompt = `Context:\n${JSON.stringify(contextData, null, 2)}\n\nQuery:\n${userQuery}`;

      // Act:
      // 1. Retrieve context
      const retrievedContextBuffer = await storage.get(contextCid);
      const retrievedContext = JSON.parse(retrievedContextBuffer!.toString());
      // 2. Construct full prompt
      const fullPrompt = `Context:\n${JSON.stringify(retrievedContext, null, 2)}\n\nQuery:\n${userQuery}`;
      // 3. Execute model with full prompt
      const result = await modelExecutionService.executeModel(modelId, fullPrompt);

      // Assert
      // Verify storage get was called
      expect(storage.get).toHaveBeenCalledWith(contextCid);
      // Verify model execution was called with the combined prompt
      expect(modelExecutionService.executeModel).toHaveBeenCalledTimes(1);
      expect(modelExecutionService.executeModel).toHaveBeenCalledWith(modelId, expectedFullPrompt, undefined);
      // Verify result (based on mock)
      expect(result.response).toContain(modelId);
      expect(result.response).toContain(fullPrompt.substring(0, 30));
    });

    it('should simulate chaining model executions using stored intermediate results', async () => {
      // Arrange
      const modelId = modelFixtures.providers[0].models[0].id;
      const initialPrompt = "Step 1: Generate initial idea.";
      const followUpPromptTemplate = (prevResponse: string) => `Step 2: Elaborate on "${prevResponse}".`;

      // Act: First execution
      const result1 = await modelExecutionService.executeModel(modelId, initialPrompt);
      const result1Cid = await storage.add(JSON.stringify(result1)); // Store result 1

      // Act: Retrieve result 1 and prepare for second execution
      const retrievedResult1Buffer = await storage.get(result1Cid);
      const retrievedResult1 = JSON.parse(retrievedResult1Buffer!.toString());
      const followUpPrompt = followUpPromptTemplate(retrievedResult1.response);

      // Act: Second execution
      const result2 = await modelExecutionService.executeModel(modelId, followUpPrompt);
      const result2Cid = await storage.add(JSON.stringify(result2)); // Store result 2

      // Assert
      // Verify mocks were called correctly
      expect(modelExecutionService.executeModel).toHaveBeenCalledTimes(2);
      expect(modelExecutionService.executeModel).toHaveBeenNthCalledWith(1, modelId, initialPrompt, undefined);
      expect(modelExecutionService.executeModel).toHaveBeenNthCalledWith(2, modelId, followUpPrompt, undefined);
      expect(storage.add).toHaveBeenCalledTimes(2);

      // Verify results can be retrieved
      const finalResult1Buffer = await storage.get(result1Cid);
      const finalResult2Buffer = await storage.get(result2Cid);
      expect(JSON.parse(finalResult1Buffer!.toString()).response).toEqual(result1.response);
      expect(JSON.parse(finalResult2Buffer!.toString()).response).toEqual(result2.response);
    });
  });
});
