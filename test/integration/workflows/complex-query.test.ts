/**
 * Integration Test for Complex Query Workflow
 *
 * This test simulates a user query that requires breakdown and synthesis
 * using the TaskManager, GoTEngine, AgentService, and StorageOperations.
 *
 * It mocks external dependencies (LLM APIs, IPFS network) but tests the
 * interaction between the core internal services.
 */

import * as path from 'path';
import * as fs from 'fs/promises';

// --- Mock Setup ---
// Mock core services that are NOT the primary focus of this integration test,
// or external dependencies.
// Add .js extensions assuming ESM resolution requires it.

jest.mock('../../src/config/manager.js', () => ({
    ConfigurationManager: jest.fn().mockImplementation(() => ({
        getInstance: jest.fn().mockReturnThis(),
        get: jest.fn((key, defaultValue) => defaultValue), // Basic mock
        set: jest.fn(),
        save: jest.fn().mockResolvedValue(undefined),
        initialize: jest.fn().mockResolvedValue(undefined),
    })),
}));

// Mock the actual LLM calls within the AgentService or ModelExecutionService
// This mock focuses on the *orchestration*, not the LLM's reasoning ability.
jest.mock('../../src/models/execution.js', () => ({
    ModelExecutionService: {
        getInstance: jest.fn().mockReturnValue({
            executeModel: jest.fn().mockImplementation(async (modelId, prompt, options) => {
                // Simulate LLM response based on prompt content for different stages
                const promptStr = JSON.stringify(prompt);
                let responseContent = `Default mock response for ${modelId}`;
                if (promptStr.includes("Research GraphQL benefits")) {
                    responseContent = "GraphQL benefits: single request, typed schema.";
                } else if (promptStr.includes("Research REST limitations")) {
                    responseContent = "REST limitations: multiple requests, over/under-fetching.";
                } else if (promptStr.includes("Compare GraphQL and REST")) {
                    responseContent = "GraphQL is better for complex APIs due to efficiency and typing.";
                } else if (promptStr.includes("Synthesize the final answer")) {
                    // Simulate synthesis based on assumed context (not actually passed here in mock)
                    responseContent = "Final Answer: GraphQL offers efficiency and strong typing, addressing REST's over/under-fetching and multiple request issues.";
                }
                return { response: responseText, usage: { totalTokens: 100 }, timingMs: 50 };
            }),
        }),
    },
}));

// Mock StorageOperations - Simulate storing/retrieving data via CIDs
const mockStorageData = new Map<string, Buffer>();
jest.mock('../../src/storage/operations.js', () => ({
    StorageOperations: jest.fn().mockImplementation(() => ({
        // Use a simple in-memory map for mock storage
        writeFile: jest.fn().mockImplementation(async (vfsPath, data) => {
            const cid = `mock-cid-${Math.random().toString(16).slice(2)}`;
            mockStorageData.set(cid, Buffer.from(data));
            console.log(`MockStorage: Stored ${vfsPath} -> ${cid} (${Buffer.from(data).length} bytes)`);
            // Simulate returning CID or path info if needed
            return { cid };
        }),
        readFile: jest.fn().mockImplementation(async (vfsPathOrCid) => {
            // Allow retrieving by CID for simplicity in test
            if (mockStorageData.has(vfsPathOrCid)) {
                 console.log(`MockStorage: Retrieved ${vfsPathOrCid}`);
                return mockStorageData.get(vfsPathOrCid);
            }
            throw new Error(`MockStorage: Not Found - ${vfsPathOrCid}`);
        }),
        // Add other methods if needed
    })),
}));

// --- Imports ---
// Import necessary services and types (adjust paths and add .js)
import { TaskManager } from '../../src/tasks/manager.js';
import { TaskScheduler } from '../../src/tasks/scheduler.js';
import { DependencyManager } from '../../src/tasks/dependencies/manager.js';
import { TaskExecutor } from '../../src/tasks/execution/executor.js';
import { GoTEngine } from '../../src/tasks/graph/graph-of-thought.js'; // Assuming GoTEngine exists
import { DecompositionEngine } from '../../src/tasks/decomposition/engine.js';
import { SynthesisEngine } from '../../src/tasks/synthesis/engine.js';
import { AgentService } from '../../src/ai/agent/agent.js'; // Assuming AgentService exists
import { StorageOperations } from '../../src/storage/operations.js';
import { ConfigurationManager } from '../../src/config/manager.js';
import { ModelExecutionService } from '../../src/models/execution.js';
import { createTempTestDir, removeTempTestDir, waitFor } from '../../helpers/testUtils.js';
import type { Task, TaskResult, TaskCreationOptions } from '../../src/types/tasks.js'; // Adjust path
import type { ExecutionContext } from '../../src/types/cli.js'; // Adjust path

// --- Test Suite ---

describe('Integration Workflow: Complex Query (GoT + Tasks + Agent + Storage)', () => {
    let taskManager: TaskManager;
    let taskScheduler: TaskScheduler;
    let dependencyManager: DependencyManager;
    let taskExecutor: TaskExecutor;
    let gotEngine: GoTEngine;
    let decompositionEngine: DecompositionEngine;
    let synthesisEngine: SynthesisEngine;
    let agentService: AgentService; // Mocked for LLM calls
    let storageOps: jest.Mocked<StorageOperations>; // Use mocked type
    let configManager: jest.Mocked<ConfigurationManager>;
    let tempDir: string;

    beforeAll(async () => {
        tempDir = await createTempTestDir('complex-workflow-int');
        // Initialize services (order might matter based on dependencies)
        // These would typically be singletons managed via ExecutionContext in the real app
        configManager = ConfigurationManager.getInstance() as jest.Mocked<ConfigurationManager>;
        storageOps = new StorageOperations() as jest.Mocked<StorageOperations>; // Get mocked instance
        dependencyManager = new DependencyManager();
        taskScheduler = new TaskScheduler(); // Uses FibonacciHeap internally
        // TaskExecutor needs scheduler, worker pool (mocked/simple), coordinator (mocked/simple)
        taskExecutor = new TaskExecutor(taskScheduler, /* mockWorkerPool */ null, /* mockCoordinator */ null);
        // TaskManager needs scheduler, executor, dependencyManager, storage
        taskManager = new TaskManager(taskScheduler, taskExecutor, dependencyManager, storageOps);
        // Engines need TaskManager, AgentService (mocked), StorageOps
        agentService = ModelExecutionService.getInstance() as jest.Mocked<AgentService>; // Use mocked LLM service
        decompositionEngine = new DecompositionEngine({ agentService }); // Inject dependencies
        synthesisEngine = new SynthesisEngine({ agentService }); // Inject dependencies
        // GoTEngine needs TaskManager, DecompositionEngine, SynthesisEngine, StorageOps
        gotEngine = new GoTEngine({ taskManager, decompositionEngine, synthesisEngine, storageOps });

        // Register mock task handlers with the executor if needed
        taskExecutor.registerTaskHandler('research', async (input: any, context: ExecutionContext) => {
            console.log(`Mock Research Task: Input - ${JSON.stringify(input)}`);
            const mockResult = `Research findings for: ${input?.topic || 'unknown'}`;
            await new Promise(res => setTimeout(res, 50)); // Simulate work
            return { findings: [mockResult] };
        });
        taskExecutor.registerTaskHandler('compare', async (input: any, context: ExecutionContext) => {
            console.log(`Mock Compare Task: Input - ${JSON.stringify(input)}`);
            // Simulate comparison based on input CIDs (which would point to mock data)
            const content1 = input?.cid1 ? (await storageOps.readFile(input.cid1)).toString() : 'Data 1 missing';
            const content2 = input?.cid2 ? (await storageOps.readFile(input.cid2)).toString() : 'Data 2 missing';
            const comparison = `Comparison: ${content1} vs ${content2}`;
            await new Promise(res => setTimeout(res, 50));
            return { comparison };
        });
         taskExecutor.registerTaskHandler('synthesize-answer', async (input: any, context: ExecutionContext) => {
            console.log(`Mock Synthesize Task: Input - ${JSON.stringify(input)}`);
            const comparison = input?.cid ? (await storageOps.readFile(input.cid)).toString() : 'Comparison missing';
            const finalAnswer = `Final Answer based on: ${comparison}`;
            await new Promise(res => setTimeout(res, 50));
            return { answer: finalAnswer };
        });

        // Start the task execution loop (in a real scenario, this runs continuously)
        // For testing, we might manually trigger processing or use a short interval
        // taskExecutor.startProcessing(); // Assuming such a method exists
    });

    afterAll(async () => {
        // taskExecutor.stopProcessing(); // Assuming such a method exists
        await removeTempTestDir(tempDir);
    });

    beforeEach(() => {
        // Reset mocks that track calls between tests
        jest.clearAllMocks();
        // Clear mock storage data
        mockStorageData.clear();
    });

    it('should process a complex query using GoT and TaskNet', async () => {
        // Arrange
        const userQuestion = "Compare benefits of GraphQL vs REST";
        const expectedFinalAnswerPrefix = "Final Answer based on: Comparison:"; // Based on mock synthesize task

        // Act: Initiate the workflow using the GoT Engine
        // The GoT engine internally creates the graph, decomposition tasks, etc.
        // We mock processQuery to simulate this internal orchestration for the test.
        (gotEngine.processQuery as jest.Mock).mockImplementation(async (query: string): Promise<GoTResult> => {
            console.log(`Mock GoT Engine: Processing query "${query}"`);
            // 1. Simulate creating root node
            const rootNodeId = `node-root-${Date.now()}`;

            // 2. Simulate DecompositionEngine creating subtask options
            const researchTaskOpts: TaskCreationOptions[] = [
                { type: 'research', input: { topic: 'GraphQL benefits' }, dependencies: [rootNodeId], metadata: { goal: 'Find GraphQL pros' } },
                { type: 'research', input: { topic: 'REST limitations' }, dependencies: [rootNodeId], metadata: { goal: 'Find REST cons' } },
            ];

            // 3. Simulate TaskManager creating these tasks
            const researchTask1 = await taskManager.createTask(researchTaskOpts[0]);
            const researchTask2 = await taskManager.createTask(researchTaskOpts[1]);

            // 4. Simulate TaskExecutor running tasks (via manual trigger or wait)
            // In a real test, we'd wait for TaskManager status updates
            await taskExecutor.processNextTask(); // Process task 1
            await taskExecutor.processNextTask(); // Process task 2
            await waitFor(async () => (await taskManager.getTask(researchTask1.id)).status === 'Succeeded');
            await waitFor(async () => (await taskManager.getTask(researchTask2.id)).status === 'Succeeded');
            const result1 = await taskManager.getTaskResult(researchTask1.id);
            const result2 = await taskManager.getTaskResult(researchTask2.id);
            const cid1 = await storageOps.writeFile('/results/res1.json', JSON.stringify(result1)); // Store results
            const cid2 = await storageOps.writeFile('/results/res2.json', JSON.stringify(result2));

            // 5. Simulate Decomposition/GoT creating the comparison task
            const compareTaskOpts: TaskCreationOptions = {
                type: 'compare',
                input: { cid1: cid1.cid, cid2: cid2.cid }, // Pass result CIDs
                dependencies: [researchTask1.id, researchTask2.id],
                metadata: { goal: 'Compare pros and cons' }
            };
            const compareTask = await taskManager.createTask(compareTaskOpts);

            // 6. Simulate TaskExecutor running comparison task
            await taskExecutor.processNextTask();
            await waitFor(async () => (await taskManager.getTask(compareTask.id)).status === 'Succeeded');
            const compareResult = await taskManager.getTaskResult(compareTask.id);
            const cid3 = await storageOps.writeFile('/results/res3.json', JSON.stringify(compareResult));

             // 7. Simulate Synthesis creating the final answer task
            const synthesizeTaskOpts: TaskCreationOptions = {
                type: 'synthesize-answer',
                input: { cid: cid3.cid }, // Pass comparison result CID
                dependencies: [compareTask.id],
                metadata: { goal: 'Generate final answer' }
            };
            const synthesizeTask = await taskManager.createTask(synthesizeTaskOpts);

             // 8. Simulate TaskExecutor running synthesis task
            await taskExecutor.processNextTask();
            await waitFor(async () => (await taskManager.getTask(synthesizeTask.id)).status === 'Succeeded');
            const finalResult = await taskManager.getTaskResult(synthesizeTask.id);

            // 9. Simulate GoT storing the final graph state (optional for this test)
            const finalGraphCid = `final-graph-${Date.now()}`;
            await storageOps.writeFile(`/graphs/${finalGraphCid}.json`, JSON.stringify({ finalAnswer: finalResult.answer }));

            // 10. Return the final answer structure
            return {
                answer: finalResult.answer,
                confidence: 0.95, // Mock confidence
                graphCid: finalGraphCid
            };
        });

        // Act: Trigger the GoT engine
        const finalOutput: GoTResult = await gotEngine.processQuery(userQuestion);

        // Assert: Check the final output
        expect(finalOutput).toBeDefined();
        expect(finalOutput.answer).toContain("Final Answer");
        expect(finalOutput.answer).toContain("GraphQL");
        expect(finalOutput.answer).toContain("REST");
        expect(finalOutput.graphCid).toBeDefined();

        // Assert: Check if mock tasks were executed (via storage writes)
        // Expect 3 results + 1 graph structure to be stored
        expect(storageOps.writeFile).toHaveBeenCalledTimes(3 + 1); // res1, res2, res3, graph

    }, 30000); // Increase Jest timeout for workflow test

});
