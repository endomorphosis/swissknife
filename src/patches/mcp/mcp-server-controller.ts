/**
 * MCP Server Controller
 * 
 * This class manages the lifecycle of an MCP server and provides
 * a clean API for starting, stopping, and interacting with the server.
 */

import { Server } from '@modelcontextprotocol/sdk/dist/esm/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/dist/esm/server/stdio.js';
import {
  CallToolRequestSchema,
  CallToolResultSchema,
  ListToolsRequestSchema,
  ListToolsResultSchema,
  ToolSchema,
} from '@modelcontextprotocol/sdk/dist/esm/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AgentTool } from '@/tools/AgentTool/AgentTool';
import { BashTool } from '@/tools/BashTool/BashTool';
import { FileEditTool } from '@/tools/FileEditTool/FileEditTool';
import { FileReadTool } from '@/tools/FileReadTool/FileReadTool';
import { GlobTool } from '@/tools/GlobTool/GlobTool';
import { GrepTool } from '@/tools/GrepTool/GrepTool';
import { FileWriteTool } from '@/tools/FileWriteTool/FileWriteTool';
import { LSTool } from '@/tools/lsTool/lsTool';
import { Tool } from '@/Tool';
import { Command } from '@/commands';
import review from '@/commands/review';
import { lastX } from '@/utils/generators';
import { MACRO } from '@/constants/macros';
import { hasPermissionsToUseTool } from '@/permissions';
import { getSlowAndCapableModel } from '@/utils/model';
import { logError } from '@/utils/log';
import { setCwd } from '@/utils/state';
import { ServerTransport } from '@modelcontextprotocol/sdk/dist/esm/server/transport.js';

import '../../patches';
import { ToolExecutionContext, ToolInput } from '../types/ai.js';

/**
 * Controller for managing the MCP server
 */
export class MCPServerController {
  private server: Server;
  private transport?: ServerTransport;
  private connected: boolean = false;
  private tools: Tool[];
  private commands: Command[];
  private configManager: any;
  private storageProvider: any;
  private taskManager: any;
  private state: {
    readFileTimestamps: Record<string, number>;
  };
  
  /**
   * Create a new MCP Server Controller
   */
  constructor(configManager: any, storageProvider: any, taskManager: any) {
    this.configManager = configManager;
    this.storageProvider = storageProvider;
    this.taskManager = taskManager;
    
    // Initialize server
    this.server = new Server(
      {
        name: 'claude/tengu',
        version: MACRO.VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    // Initialize tools and commands
    this.tools = [
      AgentTool,
      BashTool,
      FileEditTool,
      FileReadTool,
      GlobTool,
      GrepTool,
      FileWriteTool,
      LSTool,
    ];
    
    this.commands = [review];
    
    // Initialize state
    this.state = {
      readFileTimestamps: {},
    };
    
    // Register request handlers
    this.registerRequestHandlers();
  }
  
  /**
   * Register the request handlers for the server
   */
  private registerRequestHandlers(): void {
    // Handler for listing tools
    this.server.setRequestHandler(
      ListToolsRequestSchema,
      async (): Promise<z.infer<typeof ListToolsResultSchema>> => {
        const tools = await Promise.all(
          this.tools.map(async tool => ({
            ...tool,
            description: await tool.description(z.object({})),
            inputSchema: zodToJsonSchema(tool.inputSchema) as ToolInput,
          }))
        );
        
        return {
          tools,
        };
      }
    );
    
    // Handler for calling tools
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request): Promise<z.infer<typeof CallToolResultSchema>> => {
        const { name, arguments: args } = request.params;
        const tool = this.tools.find(_ => _.name === name);
        
        if (!tool) {
          throw new Error(`Tool ${name} not found`);
        }
        
        try {
          const context: ToolExecutionContext = {
            config: this.configManager,
            storage: this.storageProvider,
            taskManager: this.taskManager,
            taskId: undefined,
            userId: undefined,
            callTool: undefined,
            inferenceExecutor: undefined,
          };
          const result = await (tool as any).execute((args ?? {}) as ToolInput, context);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result),
              },
            ],
          };
        } catch (error) {
          logError(`Error executing tool ${name}: ${error}`);
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      }
    );
  }
  
  /**
   * Start the MCP server with the specified working directory
   * @param cwd The current working directory for the server
   * @param transport Optional custom transport (uses StdioServerTransport by default)
   */
  async start(cwd: string, transport?: ServerTransport): Promise<void> {
    if (this.connected) {
      throw new Error('MCP server is already running');
    }
    
    // Set the current working directory
    await setCwd(cwd);
    
    // Use the provided transport or create a StdioServerTransport
    this.transport = transport || new StdioServerTransport();
    
    // Connect the server to the transport
    await this.server.connect(this.transport);
    this.connected = true;
    
    console.log(`MCP server started in directory: ${cwd}`);
  }
  
  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    if (!this.connected) {
      // Already stopped, nothing to do
      return;
    }
    
    await this.server.close();
    this.connected = false;
    
    console.log('MCP server stopped');
  }
  
  /**
   * Check if the server is running
   */
  isRunning(): boolean {
    return this.connected;
  }
  
  /**
   * Get the list of available tools
   */
  getTools(): Tool[] {
    return [...this.tools];
  }
  
  /**
   * Get the list of available commands
   */
  getCommands(): Command[] {
    return [...this.commands];
  }
  
  /**
   * Add a custom tool to the server
   * @param tool The tool to add
   */
  addTool(tool: Tool): void {
    if (!this.tools.some(t => t.name === tool.name)) {
      this.tools.push(tool);
    }
  }
  
  /**
   * Add a custom command to the server
   * @param command The command to add
   */
  addCommand(command: Command): void {
    if (!this.commands.some(c => c.name === command.name)) {
      this.commands.push(command);
    }
  }
}
