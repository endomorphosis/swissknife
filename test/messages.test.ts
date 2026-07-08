/**
 * Messages Module Test
 * 
 * Unit tests for the messages utility module (`src/utils/messages.js`).
 */

// Import functions to test (using relative path)
import {
  processUserInput,
  getUnresolvedToolUseIDs,
  createUserMessage,
  isNotEmptyMessage,
} from '../src/utils/messages.tsx';

// Import NO_CONTENT_MESSAGE from the correct location
import { NO_CONTENT_MESSAGE } from '../src/services/claude.js';

// Import mocked dependencies (using relative path)
import { getCommand, hasCommand } from '../src/commands.js';

// Mock the commands module
// Use jest.mock with the actual path to the module being mocked
jest.mock('../src/commands.js', () => ({
  getCommand: jest.fn(),
  hasCommand: jest.fn(),
}));

// Define types for mocks (adjust based on actual types)
type MockContext = {
  options: { commands: any[] };
  setForkConvoWithMessagesOnTheNextRender: jest.Mock;
};
type MockSetToolJSX = jest.Mock;

describe('Messages Utility Module', () => {
  let mockContext: MockContext;
  let mockSetToolJSX: MockSetToolJSX;

  // Setup before each test
  beforeEach(() => {
    // Reset mocks
    (hasCommand as jest.Mock).mockReset();
    (getCommand as jest.Mock).mockReset();

    // Create fresh mock objects for context and UI setter
    mockSetToolJSX = jest.fn();
    mockContext = {
      options: { commands: [] },
      setForkConvoWithMessagesOnTheNextRender: jest.fn(),
    };
  });

  // --- processUserInput ---

  describe('processUserInput', () => {
    it('should correctly identify and process a valid slash command', async () => {
      // Arrange
      const inputText = '/help command arguments';
      const mockHelpCommand = {
        name: 'help',
        type: 'local', // Assuming type based on original test
        description: 'Displays help',
        handler: jest.fn().mockResolvedValue([{ type: 'text', text: 'Help content for command arguments' }]), // Mock handler returning messages
      };
      (hasCommand as jest.Mock).mockResolvedValue(true);
      (getCommand as jest.Mock).mockResolvedValue(mockHelpCommand);

      // Act
      const result = await processUserInput(inputText, 'prompt', mockSetToolJSX, mockContext, null);

      // Assert
      expect(hasCommand).toHaveBeenCalledWith('help');
      expect(getCommand).toHaveBeenCalledWith('help');
      expect(mockHelpCommand.handler).toHaveBeenCalledWith({
        args: 'command arguments', // Expect parsed args
        context: mockContext, // Expect context to be passed
        // Add other expected properties if the handler needs them
      });
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([{ type: 'text', text: 'Help content for command arguments' }]); // Check handler result is returned
      expect(mockSetToolJSX).not.toHaveBeenCalled(); // Should not set tool JSX for local command result
    });

    it('should return an empty array if input is not a slash command', async () => {
      // Arrange
      const inputText = 'This is a normal message';
      (hasCommand as jest.Mock).mockResolvedValue(false); // Command does not exist

      // Act
      const result = await processUserInput(inputText, 'prompt', mockSetToolJSX, mockContext, null);

      // Assert
      expect(hasCommand).not.toHaveBeenCalled(); // Should not check if it doesn't start with /
      expect(getCommand).not.toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('should return an empty array if slash command does not exist', async () => {
      // Arrange
      const inputText = '/nonexistent';
      (hasCommand as jest.Mock).mockResolvedValue(false); // Command does not exist

      // Act
      const result = await processUserInput(inputText, 'prompt', mockSetToolJSX, mockContext, null);

      // Assert
      expect(hasCommand).toHaveBeenCalledWith('nonexistent');
      expect(getCommand).not.toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    // This test requires mocking internal function `getMessagesForSlashCommand`
    // It might be better to test `getMessagesForSlashCommand` directly if possible,
    // or refactor `processUserInput` to make dependencies injectable.
    // Keeping the spirit of the original test for now:
    it('should handle undefined result from internal slash command processing gracefully', async () => {
      // Arrange
      // Temporarily mock the internal function *within this test scope* if needed,
      // though this is generally discouraged as it tests implementation details.
      // A better approach is to ensure the mocked command handler itself returns undefined.
      const mockUndefinedHandlerCmd = {
        name: 'undefinedCmd',
        type: 'local',
        description: 'Test',
        handler: jest.fn().mockResolvedValue(undefined), // Handler returns undefined
      };
      (hasCommand as jest.Mock).mockResolvedValue(true);
      (getCommand as jest.Mock).mockResolvedValue(mockUndefinedHandlerCmd);

      // Act
      const result = await processUserInput('/undefinedCmd', 'prompt', mockSetToolJSX, mockContext, null);

      // Assert
      expect(hasCommand).toHaveBeenCalledWith('undefinedCmd');
      expect(getCommand).toHaveBeenCalledWith('undefinedCmd');
      expect(mockUndefinedHandlerCmd.handler).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0); // Expect empty array if handler returns undefined
    });
  });

  // --- getUnresolvedToolUseIDs ---

  describe('getUnresolvedToolUseIDs', () => {
    it('should return an empty Set for an empty messages array', () => {
      // Arrange
      const messages: any[] = []; // Use appropriate type if available

      // Act
      const result = getUnresolvedToolUseIDs(messages);

      // Assert
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it('should return a Set of unresolved tool_use_ids', () => {
      // Arrange
      const messages = [
        { type: 'assistant', message: { content: [{ type: 'tool_use', tool_use_id: 'tool1', input: {} }] } },
        { type: 'assistant', message: { content: [{ type: 'tool_use', tool_use_id: 'tool2', input: {} }] } },
        { type: 'tool', tool_result_id: 'tool1', message: { content: 'Result 1' } }, // tool1 is resolved
      ];

      // Act
      const result = getUnresolvedToolUseIDs(messages);

      // Assert
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(1);
      expect(result.has('tool2')).toBe(true);
      expect(result.has('tool1')).toBe(false);
    });

     it('should handle messages without tool_use or tool_result_id', () => {
      // Arrange
      const messages = [
        { type: 'user', message: { content: 'Hello' } },
        { type: 'assistant', message: { content: [{ type: 'text', text: 'Hi' }] } },
      ];

      // Act
      const result = getUnresolvedToolUseIDs(messages);

      // Assert
      expect(result.size).toBe(0);
    });
  });

  // --- createUserMessage ---

  describe('createUserMessage', () => {
    it('should create a valid user message object with expected properties', () => {
      // Arrange
      const content = 'This is a test message.';

      // Act
      const message = createUserMessage(content);

      // Assert
      expect(message.type).toBe('user');
      expect(message.message.role).toBe('user');
      expect(message.message.content).toBe(content);
      expect(message.uuid).toEqual(expect.any(String)); // Check if uuid is a string
      expect(message.uuid).toHaveLength(36); // Check if uuid looks like a UUID v4
    });
  });

  // --- isNotEmptyMessage ---

  describe('isNotEmptyMessage', () => {
    it('should return false for user message with empty string content', () => {
      // Arrange
      const message = { type: 'user', message: { role: 'user', content: '' } };
      // Act & Assert
      expect(isNotEmptyMessage(message as any)).toBe(false);
    });

    it('should return false for assistant message with only NO_CONTENT_MESSAGE', () => {
      // Arrange
      const message = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: NO_CONTENT_MESSAGE }] } };
      // Act & Assert
      expect(isNotEmptyMessage(message as any)).toBe(false);
    });

     it('should return false for assistant message with empty content array', () => {
      // Arrange
      const message = { type: 'assistant', message: { role: 'assistant', content: [] } };
      // Act & Assert
      expect(isNotEmptyMessage(message as any)).toBe(false);
    });

    it('should return true for progress message type', () => {
      // Arrange
      const message = { type: 'progress' };
      // Act & Assert
      expect(isNotEmptyMessage(message as any)).toBe(true);
    });

    it('should return true for user message with non-empty content', () => {
      // Arrange
      const message = { type: 'user', message: { role: 'user', content: 'Hello' } };
      // Act & Assert
      expect(isNotEmptyMessage(message as any)).toBe(true);
    });

    it('should return true for assistant message with actual content', () => {
      // Arrange
      const message = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Response' }] } };
      // Act & Assert
      expect(isNotEmptyMessage(message as any)).toBe(true);
    });

     it('should return true for assistant message with tool use content', () => {
      // Arrange
      const message = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', tool_use_id: 't1' }] } };
      // Act & Assert
      expect(isNotEmptyMessage(message as any)).toBe(true);
    });
  });
});
