/**
 * Unit Tests for the MCP Command (`src/commands/mcp.js`).
 *
 * These tests verify the behavior of the `mcp` command handler,
 * focusing on how it interacts with the `mcpClient` service (mocked)
 * to display server status or indicate startup based on arguments.
 * It also checks the command's metadata.
 *
 * Dependencies (`mcpClient` service, logger, theme, constants) are mocked.
 */

// --- Mock Setup ---
// Add .js extension

// Mock the mcpClient service functions
const mockListMCPServers = jest.fn();
const mockGetClients = jest.fn();
jest.mock('../../../src/services/mcpClient', () => ({ // Adjust path
  listMCPServers: mockListMCPServers,
  getClients: mockGetClients,
}));

// Mock logger
jest.mock('../../../src/utils/log', () => ({ // Adjust path
  logError: jest.fn(),
  // Add other log functions if used by the command handler
}));

// Mock theme (if used for output styling)
jest.mock('../../../src/utils/theme', () => ({ // Adjust path
  getTheme: jest.fn().mockReturnValue({
    success: (text: string) => text, // Simple pass-through for testing
    error: (text: string) => text,
    // Add other theme colors if needed
  }),
}));

// Mock constants
jest.mock('../../../src/constants/product', () => ({ // Adjust path
    PRODUCT_COMMAND: 'swissknife_test', // Use a test command name
}));


// --- Imports ---
import mcpCommand from '../../../src/commands/mcp.js';
import { listMCPServers, getClients } from '../../../src/services/mcpClient.js';
import { CommandOption } from '../../../src/types/command.js'; // Assuming types are exported from the command file

// Define placeholder types locally if needed
// Updated CommandContext based on TS errors
type CommandContext = {
    args?: any; // Arguments passed to the command
    // Ensure options and its required sub-properties always exist
    options: {
        commands: any[]; // Placeholder type
        tools: any[]; // Placeholder type
        slowAndCapableModel: string; // Placeholder type
        [key: string]: any; // Allow other properties
    };
    abortController: AbortController; // Make mandatory based on error
    setForkConvoWithMessagesOnTheNextRender: (messages: any[]) => void; // Make mandatory based on error
    [key: string]: any; // Allow other properties
};
import { PRODUCT_COMMAND } from '../../../src/constants/product';


// --- Test Suite ---

describe('MCP Command Unit Tests', () => {

  // Helper function to create a default mock context matching the required structure
  const createMockContext = (args: any = {}): CommandContext => ({
      args: args,
      options: { // Provide default required options
          commands: [],
          tools: [],
          slowAndCapableModel: 'default-mock-model',
      },
      abortController: new AbortController(),
      setForkConvoWithMessagesOnTheNextRender: jest.fn(),
      // Add other default context properties if needed
  });


  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should show an appropriate message when no MCP servers are configured', async () => {
    // Arrange: Mock empty server list
    mockListMCPServers.mockReturnValue({});
    const mockArgs = {};
    const mockContext = createMockContext(mockArgs);

    // Act: Call the command handler
    const result = await mcpCommand.handler(mockArgs, mockContext);

    // Assert
    expect(listMCPServers).toHaveBeenCalledTimes(1);
    expect(getClients).not.toHaveBeenCalled();
    expect(result).toContain('No MCP servers configured');
    expect(result).toBe([
      `⎿  No MCP servers configured.`,
      `⎿  Use the following commands to manage MCP servers:`,
      `⎿  • ${PRODUCT_COMMAND} add-mcp-server <name> --type <type> --command <command> [--args <arg>...] [--env <key=value>...]`,
      `⎿  • ${PRODUCT_COMMAND} remove-mcp-server <name>`,
      `⎿  • ${PRODUCT_COMMAND} list-mcp-servers`,
    ].join('\n'));
  });

  it('should show server status correctly when servers are configured', async () => {
    // Arrange: Mock server list
    const mockServers = {
      'server1': { type: 'stdio', command: 'node', args: ['server1.js'] },
      'server2': { type: 'http', url: 'http://localhost:1234' },
      'server3': { type: 'stdio', command: 'python', args: ['server3.py'] },
    };
    mockListMCPServers.mockReturnValue(mockServers);

    // Arrange: Mock client statuses
    const mockClientResults = [
      { name: 'server1', type: 'connected', client: {} }, // Connected
      { name: 'server2', type: 'failed', error: 'Connection refused' }, // Failed
      { name: 'server3', type: 'disconnected' }, // Disconnected
    ];
    mockGetClients.mockResolvedValue(mockClientResults);

    const mockArgs = {};
    const mockContext = createMockContext(mockArgs);

    // Act
    const result = await mcpCommand.handler(mockArgs, mockContext);

    // Assert
    expect(listMCPServers).toHaveBeenCalledTimes(1);
    expect(getClients).toHaveBeenCalledTimes(1);
    expect(result).toContain('MCP Server Status');
    expect(result).toMatch(/server1.*connected/i);
    // This assertion will be fixed after modifying src/commands/mcp.ts
    expect(result).toMatch(/server2.*disconnected.*Connection refused/i);
    expect(result).toMatch(/server3.*disconnected/i);
    expect(result).toContain('Disconnected servers may need to be started manually');
  });

  it('should indicate server startup when --cwd argument is provided', async () => {
    // Arrange
    const testCwd = '/path/to/test-project';
    const mockArgs = { cwd: testCwd };
    const mockContext = createMockContext(mockArgs);

    // Act
    const result = await mcpCommand.handler(mockArgs, mockContext);

    // Assert
    expect(listMCPServers).not.toHaveBeenCalled();
    expect(getClients).not.toHaveBeenCalled();
    expect(result).toBe(`⎿  Starting MCP server with working directory: ${testCwd}`);
  });

  it('should handle errors during server listing gracefully', async () => {
    // Arrange: Mock listMCPServers to throw an error
    const testError = new Error('Failed to read config');
    mockListMCPServers.mockImplementation(() => {
      throw testError;
    });
    const mockArgs = {};
    const mockContext = createMockContext(mockArgs);

    // Act
    const result = await mcpCommand.handler(mockArgs, mockContext);

    // Assert
    expect(listMCPServers).toHaveBeenCalledTimes(1);
    expect(getClients).not.toHaveBeenCalled();
    expect(result).toContain('Error getting MCP server status');
    expect(result).toContain(testError.message);
  });

   it('should handle errors during client connection gracefully', async () => {
    // Arrange: Mock listMCPServers to return servers
     const mockServers = { 'server1': { type: 'stdio', command: 'node', args: ['server1.js'] } };
     mockListMCPServers.mockReturnValue(mockServers);
     // Arrange: Mock getClients to throw an error
    const testError = new Error('Connection failed');
    mockGetClients.mockRejectedValue(testError);
    const mockArgs = {};
    const mockContext = createMockContext(mockArgs);

    // Act
    const result = await mcpCommand.handler(mockArgs, mockContext);

    // Assert
    expect(listMCPServers).toHaveBeenCalledTimes(1);
    expect(getClients).toHaveBeenCalledTimes(1);
    expect(result).toContain('Error getting MCP server status');
    expect(result).toContain(testError.message);
  });

  it('should have the correct command metadata', () => {
    // Assert: Check the command definition properties
    expect(mcpCommand.name).toBe('mcp');
    expect(mcpCommand.description).toBeDefined();
    expect(mcpCommand.description).toBe('Manage MCP server connections and show status');

    // Check specific options
    const options = mcpCommand.options || []; // Use default empty array
    const cwdOption = options.find((opt: CommandOption) => opt.name === 'cwd'); // Use placeholder type
    expect(cwdOption).toBeDefined();
    expect(cwdOption?.type).toBe('string');
    expect(cwdOption?.required).toBe(false);
    expect(cwdOption?.description).toContain('Working directory for the MCP server');

    // Check userFacingName if it exists
    if (typeof (mcpCommand as any).userFacingName === 'function') {
        expect((mcpCommand as any).userFacingName()).toBe('mcp');
    }
  });
});
