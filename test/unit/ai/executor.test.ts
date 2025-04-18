/**
 * Unit Tests for the ToolExecutor class (`src/ai/tools/executor.js`).
 *
 * These tests verify the core logic of the ToolExecutor, specifically its
 * ability to validate input against a tool's Zod schema and correctly
 * call the tool's execute method or handle validation/execution errors.
 *
 * Dependencies like logger are mocked. The Tool interface and implementations
 * are mocked within this file.
 */

// --- Mock Setup ---
// Add .js extension
jest.mock('@/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Mock ConfigManager if needed by context
const mockConfigManagerInstance = {
    get: jest.fn((key, defaultValue) => defaultValue),
    // Add other methods if needed
};
jest.mock('@/config/manager.js', () => ({
  ConfigurationManager: {
    getInstance: jest.fn(() => mockConfigManagerInstance),
  },
}));

// Mock StorageOperations if needed by context - Keep mock but remove import below
const mockStorageOpsInstance = {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    // Add other methods if needed
};
jest.mock('@/storage/operations.js', () => ({
  StorageOperations: jest.fn(() => mockStorageOpsInstance),
}));

// Mock TaskManager if needed by context
const mockTaskManagerInstance = {
    createTask: jest.fn(),
    getTask: jest.fn(),
    // Add other methods if needed
};
jest.mock('@/tasks/manager.js', () => ({
  TaskManager: jest.fn(() => mockTaskManagerInstance),
}));


// --- Imports ---
// Add .js extension
import { ToolExecutor } from '@/ai/tools/executor.js';
// Use relative path for types - Add .js extension
// Define placeholder types if not properly exported/resolved
import type { Tool as RealTool, ToolExecutionContext as RealToolExecutionContext } from '../../../src/types/ai.js'; // Adjust path if needed
import { z } from 'zod';
import { ConfigManager } from '@/config/manager.js'; // Import for type usage
// Remove problematic import for StorageOperations
// import { StorageOperations } from '@/storage/operations.js';
import { TaskManager } from '@/tasks/manager.js'; // Import for type usage


// --- Mock Implementations ---

// Define placeholder Tool type matching expected structure if RealTool import fails
type Tool<T extends z.ZodType<any, any, any> = any> = {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: T;
    execute: jest.Mock<Promise<any>, [z.infer<T>, ToolExecutionContext]>; // Mock execute signature
};

// Define placeholder ToolExecutionContext including required properties
type ToolExecutionContext = Partial<RealToolExecutionContext> & {
    abortController: AbortController;
    config: ConfigManager; // Added based on error
    // storage: StorageOperations; // Removed due to import issue
    storage: any; // Use 'any' as a fallback
    taskManager: TaskManager; // Added based on error
    // Add other potential properties if needed
};


// Define schemas for mock tools
const SimpleSchema = z.object({ message: z.string().describe("A simple message") });
const ComplexSchema = z.object({
    name: z.string().describe("A name"),
    count: z.number().optional().default(1).describe("An optional count"),
    active: z.boolean().optional().describe("An optional flag"),
});

// Define mock tools implementing the Tool<Schema> structure
class SuccessTool implements Tool<typeof SimpleSchema> {
    readonly name = 'success_tool';
    readonly description = 'Always succeeds';
    readonly inputSchema = SimpleSchema;
    execute = jest.fn().mockResolvedValue('Success!');
}

class FailureTool implements Tool<typeof SimpleSchema> {
    readonly name = 'failure_tool';
    readonly description = 'Always fails';
    readonly inputSchema = SimpleSchema;
    execute = jest.fn().mockRejectedValue(new Error('Tool execution failed'));
}

class ComplexTool implements Tool<typeof ComplexSchema> {
    readonly name = 'complex_tool';
    readonly description = 'Uses complex schema with defaults';
    readonly inputSchema = ComplexSchema;
    execute = jest.fn().mockImplementation(async (input: z.infer<typeof ComplexSchema>) => ({ // Use inferred type
        receivedName: input.name,
        receivedCount: input.count, // Default applied by Zod before calling execute
        receivedActive: input.active,
    }));
}


// --- Test Suite ---

describe('ToolExecutor', () => {
  let executor: ToolExecutor;
  let mockContext: ToolExecutionContext; // Use defined type

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    // Create a new executor for each test
    executor = new ToolExecutor();

    // Create a mock context including required properties
    mockContext = {
      config: mockConfigManagerInstance as unknown as ConfigManager, // Cast mock
      storage: mockStorageOpsInstance as any, // Cast mock to any
      taskManager: mockTaskManagerInstance as unknown as TaskManager, // Cast mock
      abortController: new AbortController(),
      // Add other context parts if needed
    };
  });

  it('should execute a tool successfully with valid input', async () => {
    // Arrange
    const tool = new SuccessTool();
    const rawInput = { message: 'Valid input' };
    const expectedParsedInput = { message: 'Valid input' }; // Zod parsing result
    const expectedResult = 'Success!';

    // Act
    // Execute using tool object, rawInput, and context
    const result = await executor.execute(tool, rawInput, mockContext);

    // Assert
    expect(result).toBe(expectedResult);
    expect(tool.execute).toHaveBeenCalledTimes(1);
    // Verify the tool's execute method received the Zod-parsed input and context
    expect(tool.execute).toHaveBeenCalledWith(expectedParsedInput, mockContext);
  });

  it('should reject with Zod error if input validation fails (missing required property)', async () => {
    // Arrange
    const tool = new SuccessTool(); // Schema requires 'message' string
    const invalidInput = { msg: 'Wrong property name' }; // 'message' is missing

    // Act & Assert
    // Executor's internal Zod parsing should throw
    await expect(executor.execute(tool, invalidInput, mockContext))
      .rejects
      .toThrow(/Invalid input for tool success_tool:.*Required/i); // Check for Zod 'Required' error

    // Verify the tool's execute method was not called
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('should reject with Zod error if input validation fails (incorrect type)', async () => {
    // Arrange
    const tool = new SuccessTool(); // Schema requires 'message' string
    const invalidInput = { message: 123 }; // Incorrect type

    // Act & Assert
    await expect(executor.execute(tool, invalidInput, mockContext))
      .rejects
      .toThrow(/Invalid input for tool success_tool:.*Expected string, received number/i); // Check for Zod type error

    // Verify the tool's execute method was not called
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('should reject with tool execution error if the tool itself throws', async () => {
    // Arrange
    const tool = new FailureTool();
    const rawInput = { message: 'This will fail' };
    const expectedParsedInput = { message: 'This will fail' };
    const expectedError = new Error('Tool execution failed'); // Error thrown by mock tool

    // Act & Assert
    // The error comes from the tool's execute method, wrapped by the executor
    await expect(executor.execute(tool, rawInput, mockContext))
      .rejects
      .toThrow(`Tool ${tool.name} failed: ${expectedError.message}`); // Check wrapped error message

    // Verify the tool's execute method was called
    expect(tool.execute).toHaveBeenCalledTimes(1);
    expect(tool.execute).toHaveBeenCalledWith(expectedParsedInput, mockContext);
  });

  it('should handle complex schema with optional values and defaults correctly', async () => {
     // Arrange
     const tool = new ComplexTool();
     const rawInput = { name: 'Test Name', active: true }; // 'count' is missing, 'active' provided
     const expectedParsedInput = { name: 'Test Name', count: 1, active: true }; // Zod applies default for 'count'
     const expectedResult = {
        receivedName: 'Test Name',
        receivedCount: 1, // Default value applied by Zod
        receivedActive: true,
     };

     // Act
     // Executor validates via Zod, which applies default
     const result = await executor.execute(tool, rawInput, mockContext);

     // Assert
     // Check the result returned by the mock tool's implementation
     expect(result).toEqual(expectedResult);
     expect(tool.execute).toHaveBeenCalledTimes(1);
     // Verify the tool receives the parsed args including defaults
     expect(tool.execute).toHaveBeenCalledWith(expectedParsedInput, mockContext);
  });

   it('should reject with Zod error for complex schema with incorrect type', async () => {
     // Arrange
     const tool = new ComplexTool();
     const rawInput = { name: 'Test Name', count: 'not-a-number' }; // Incorrect type for count

     // Act & Assert
     await expect(executor.execute(tool, rawInput, mockContext))
      .rejects
      .toThrow(/Invalid input for tool complex_tool:.*Expected number, received string/i); // Check for Zod type error

    // Verify the tool's execute method was not called
    expect(tool.execute).not.toHaveBeenCalled();
   });

});
