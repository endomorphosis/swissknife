// Mock common dependencies
jest.mock("chalk", () => ({ default: (str) => str, red: (str) => str, green: (str) => str, blue: (str) => str }));
jest.mock("nanoid", () => ({ nanoid: () => "test-id" }));
jest.mock("fs", () => ({ promises: { readFile: jest.fn(), writeFile: jest.fn(), mkdir: jest.fn() } }));
/**
 * Tests for the MCP Server Controller
 */

import { Client } from '@modelcontextprotocol/sdk/client/index';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MCPServerController } from '@mcp-server/controller';
import { createMemoryPair, MemoryChannel, MemoryTransport } from '@utils/memory-transport';

describe('MCPServerController', () => {
  let tempDir: string;
  let testFilePath: string;
  let controller: MCPServerController;
  let memoryChannel: MemoryChannel;
  let clientTransport: MemoryTransport;
  let serverTransport: MemoryTransport;
  let client: Client;

  beforeAll(async () => {
    // Create temporary test directory and files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-controller-test-'));
    testFilePath = path.join(tempDir, 'test-file.txt');
    fs.writeFileSync(testFilePath, 'Test content for MCP controller');
  });

  afterAll(() => {
    // Clean up temporary files
    try {
      fs.unlinkSync(testFilePath);
      fs.rmdirSync(tempDir, { recursive: true });
    } catch (err) {
      console.error('Error cleaning up temp files:', err);
    }
  });

  beforeEach(async () => {
    // Create a new controller, transport pair, and client for each test
    controller = new MCPServerController();
    
    // Create memory transport pair for in-process testing
    const pair = createMemoryPair();
    memoryChannel = pair.channel;
    clientTransport = pair.clientTransport;
    serverTransport = pair.serverTransport;
    
    // Create and connect client
    client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );
    await client.connect(clientTransport);
    
    // Start the server with the memory transport
    await controller.start(tempDir, serverTransport);
  });

  afterEach(async () => {
    // Stop the server and disconnect client
    await controller.stop();
    await client.disconnect();
  });

  test('Server should start and stop correctly', async () => {
    // Verify the server is running after start
    expect(controller.isRunning()).toBe(true);
    
    // Stop the server
    await controller.stop();
    
    // Verify the server is stopped
    expect(controller.isRunning()).toBe(false);
    
    // Restart the server for cleanup in afterEach
    await controller.start(tempDir, serverTransport);
  });

  test('Server should expose tools and commands', () => {
    // Verify the server has tools
    const tools = controller.getTools();
    expect(tools.length).toBeGreaterThan(0);
    
    // Check for specific tools
    const toolNames = tools.map(tool => tool.name);
    expect(toolNames).toContain('bash');
    expect(toolNames).toContain('fileRead');
    expect(toolNames).toContain('fileWrite');
    
    // Verify the server has commands
    const commands = controller.getCommands();
    expect(commands.length).toBeGreaterThan(0);
  });

  test('Server should list tools via the client', async () => {
    // Get server capabilities
    const capabilities = await client.getServerCapabilities();
    expect(capabilities).toBeDefined();
    expect(capabilities.tools).toBeDefined();
    
    // Request tool list
    const toolsResult = await client.request(
      { method: 'tools/list' },
      { result: { tools: [] } }
    );
    
    expect(toolsResult).toBeDefined();
    expect(toolsResult.tools).toBeInstanceOf(Array);
    expect(toolsResult.tools.length).toBeGreaterThan(0);
    
    // Check that expected tools are present
    const toolNames = toolsResult.tools.map(tool => tool.name);
    expect(toolNames).toContain('bash');
    expect(toolNames).toContain('fileRead');
    expect(toolNames).toContain('fileWrite');
  });

  test('Server should execute the fileRead tool', async () => {
    // Call the fileRead tool to read our test file
    const result = await client.callTool({
      name: 'fileRead',
      arguments: {
        path: testFilePath
      }
    });
    
    // Verify the result
    expect(result).toBeDefined();
    expect(result.content).toBeInstanceOf(Array);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe('Test content for MCP controller');
  });

  test('Server should execute the bash tool', async () => {
    // Call the bash tool to list files in the temp directory
    const result = await client.callTool({
      name: 'bash',
      arguments: {
        command: `ls -la ${tempDir}`
      }
    });
    
    // Verify the result
    expect(result).toBeDefined();
    expect(result.content).toBeInstanceOf(Array);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('test-file.txt');
  });

  test('Server should return error for invalid tool', async () => {
    // Attempt to call a non-existent tool
    try {
      await client.callTool({
        name: 'nonExistentTool',
        arguments: {}
      });
      
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      // Verify the error
      expect(error).toBeDefined();
      expect((error as Error).message).toContain('nonExistentTool');
    }
  });

  test('Server should handle custom tools', async () => {
    // Create a custom tool
    const customTool = {
      name: 'customTestTool',
      isEnabled: async () => true,
      isReadOnly: () => true,
      description: async () => 'A custom test tool',
      prompt: async () => 'Use this tool to test custom tool functionality',
      inputSchema: { properties: {}, type: 'object' },
      async *call() {
        yield {
          type: 'result' as const,
          data: 'Custom tool result',
          resultForAssistant: 'Custom tool result',
        };
      },
      renderToolUseMessage: () => 'Using custom tool',
      renderToolResultMessage: () => null,
      renderToolUseRejectedMessage: () => null,
      renderResultForAssistant: (content: string) => content,
    };
    
    // Add the custom tool to the controller
    controller.addTool(customTool as any);
    
    // Verify the tool was added
    const tools = controller.getTools();
    const toolNames = tools.map(tool => tool.name);
    expect(toolNames).toContain('customTestTool');
    
    // Request tool list from the server
    const toolsResult = await client.request(
      { method: 'tools/list' },
      { result: { tools: [] } }
    );
    
    // Check that our custom tool is in the list
    const serverToolNames = toolsResult.tools.map(tool => tool.name);
    expect(serverToolNames).toContain('customTestTool');
    
    // Call the custom tool
    const result = await client.callTool({
      name: 'customTestTool',
      arguments: {}
    });
    
    // Verify the result
    expect(result).toBeDefined();
    expect(result.content).toBeInstanceOf(Array);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe('Custom tool result');
  });
});