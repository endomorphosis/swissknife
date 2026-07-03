/**
 * This patch fixes TypeScript errors in the MCP entrypoint file.
 * Issues addressed:
 * 1. Tool interface usage and type checking
 * 2. Result type handling
 * 3. Proper imports to support JSX
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  CallToolResultSchema,
  ListToolsRequestSchema,
  ListToolsResultSchema,
  ToolSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod.js'
import { zodToJsonSchema } from 'zod-to-json-schema.js'
import { AgentTool } from '../tools/AgentTool/AgentTool.js'
import { hasPermissionsToUseTool } from '../permissions.js'
import { setCwd } from '../utils/state.js'
import { getSlowAndCapableModel } from '../utils/model.js'
import { logError } from '../utils/log.js'
import { LSTool } from '../tools/lsTool/lsTool.js'
import { BashTool } from '../tools/BashTool/BashTool.js'
import { FileEditTool } from '../tools/FileEditTool/FileEditTool.js'
import { FileReadTool } from '../tools/FileReadTool/FileReadTool.js'
import { GlobTool } from '../tools/GlobTool/GlobTool.js'
import { GrepTool } from '../tools/GrepTool/GrepTool.js'
import { FileWriteTool } from '../tools/FileWriteTool/FileWriteTool.js'
import { Tool } from '../Tool.js'
import { Command } from '../commands.js'
import review from '../commands/review.js'
import { lastX } from '../utils/generators.js'
import { MACRO } from '../constants/macros.js'
type ToolInput = z.infer<typeof ToolSchema.shape.inputSchema>

const state: {
  readFileTimestamps: Record<string, number>
} = {
  readFileTimestamps: {},
}

const MCP_COMMANDS: Command[] = [review]

const MCP_TOOLS: Tool[] = [
  AgentTool,
  BashTool,
  FileEditTool,
  FileReadTool,
  GlobTool,
  GrepTool,
  FileWriteTool,
  LSTool,
]

export async function startMCPServer(cwd: string): Promise<void> {
  await setCwd(cwd)
  const server = new Server(
    {
      name: 'claude/tengu',
      version: MACRO.VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  )

  server.setRequestHandler(
    ListToolsRequestSchema,
    async (): Promise<z.infer<typeof ListToolsResultSchema>> => {
      const tools = await Promise.all(
        MCP_TOOLS.map(async tool => ({
          ...tool,
          description: await tool.description(z.object({})),
          inputSchema: zodToJsonSchema(tool.inputSchema) as ToolInput,
        })),
      )

      return {
        tools,
      }
    },
  )

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request): Promise<z.infer<typeof CallToolResultSchema>> => {
      const { name, arguments: args } = request.params
      const tool = MCP_TOOLS.find(_ => _.name === name)
      if (!tool) {
        throw new Error(`Tool ${name} not found`)
      }

      // Validate input types with zod if the tool provides an inputSchema
      if (tool.inputSchema && typeof tool.inputSchema?.['parse'] === 'function') {
        try { tool.inputSchema.parse(args ?? {}); }
        catch (zodErr: unknown) { throw new Error(`Input validation failed for ${name}: ${zodErr instanceof Error ? zodErr.message : String(zodErr)}`); }
      }
      try {
        // Use proper type checking for tool methods
        if (!(await tool.isEnabled?.())) {
          throw new Error(`Tool ${name} is not enabled`)
        }
        
        const model = await getSlowAndCapableModel()
        const validationResult = await tool.validateInput?.(
          (args as Record<string, unknown>) ?? {},
          {
            abortController: new AbortController(),
            options: {
              commands: MCP_COMMANDS,
              tools: MCP_TOOLS,
              slowAndCapableModel: model,
              forkNumber: 0,
              messageLogName: 'unused',
              maxThinkingTokens: 0,
            },
            messageId: undefined,
            readFileTimestamps: state.readFileTimestamps,
          },
        )
        
        if (validationResult && !validationResult.result) {
          throw new Error(
            `Tool ${name} input is invalid: ${validationResult.message}`,
          )
        }
        
        const result = tool.call(
          (args ?? {}) as Record<string, unknown>,
          {
            abortController: new AbortController(),
            messageId: undefined,
            options: {
              commands: MCP_COMMANDS,
              tools: MCP_TOOLS,
              slowAndCapableModel: await getSlowAndCapableModel(),
              forkNumber: 0,
              messageLogName: 'unused',
              maxThinkingTokens: 0,
            },
            readFileTimestamps: state.readFileTimestamps,
          },
          hasPermissionsToUseTool,
        )

        const finalResult = await lastX(result)

        // Fix type checking for finalResult
        if (!finalResult || typeof finalResult === 'object' && 'type' in finalResult && finalResult.type !== 'result') {
          throw new Error(`Tool ${name} did not return a result`)
        }

        return {
          content: Array.isArray(finalResult)
            ? finalResult.map(item => ({
                type: 'text' as const,
                text: 'text' in item ? item.text : JSON.stringify(item),
              }))
            : [
                {
                  type: 'text' as const,
                  text:
                    typeof finalResult === 'string'
                      ? finalResult
                      : typeof finalResult === 'object' && 'data' in finalResult
                      ? JSON.stringify(finalResult.data)
                      : JSON.stringify(finalResult),
                },
              ],
        }
      } catch (error) {
        logError(error)
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
  )

  async function runServer() {
    const transport = new StdioServerTransport()
    await server.connect(transport)
  }

  return await runServer()
}