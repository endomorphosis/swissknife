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

// Mock the mcpClient service functions
const mockListMCPServers = jest.fn();
const mockGetClients = jest.fn();
jest.mock('../../../src/services/mcpClient.js', () => ({
    listMCPServers: mockListMCPServers,
    getClients: mockGetClients,
}));

// Mock logger
jest.mock('../../../src/utils/log.js', () => ({
    logError: jest.fn(),
    // Add other log functions if used by the command handler
}));

// Mock theme (if used for output styling)
jest.mock('../../../src/utils/theme.js', () => ({
    getTheme: jest.fn().mockReturnValue({
        success: (text) => text,
        error: (text) => text,
        // Add other theme colors if needed
    }),
}));
// Mock constants
jest.mock('../../../src/constants/product.js', () => ({
    PRODUCT_COMMAND: 'swissknife_test', // Use a test command name
}));
// --- Imports ---
// Add .js extension
// Import mocked functions for verification
// --- Test Suite ---
describe('MCP Command Unit Tests', () => {
    // Helper function to create a default mock context matching the required structure
    const createMockContext = (args = {}) => ({
        args: args,
        options: {
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
        expect(result).toContain(`Use \`${PRODUCT_COMMAND} add-mcp-server\``);
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
            { name: 'server1', type: 'connected', client: {} },
            { name: 'server2', type: 'failed', error: 'Connection refused' }, // Failed
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
        expect(result).toMatch(/server2.*failed.*Connection refused/i);
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
        expect(result).toContain('Starting MCP server');
        expect(result).toContain(`in directory: ${testCwd}`);
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
        expect(mcpCommand.description).toContain('Manage and view status of Model Context Protocol (MCP) servers');
        // Check specific options
        const options = mcpCommand.options || []; // Use default empty array
        const cwdOption = options.find((opt) => opt.name === 'cwd'); // Use placeholder type
        expect(cwdOption).toBeDefined();
        expect(cwdOption?.type).toBe('string');
        expect(cwdOption?.required).toBe(false);
        expect(cwdOption?.description).toContain('Start the MCP server');
        // Check userFacingName if it exists
        if (typeof mcpCommand.userFacingName === 'function') {
            expect(mcpCommand.userFacingName()).toBe('mcp');
        }
    });
});
//# sourceMappingURL=mcp.test.js.map