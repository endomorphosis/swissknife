import { zipObject } from 'lodash-es'
import {
  getCurrentProjectConfig,
  McpServerConfig,
  saveCurrentProjectConfig,
  getGlobalConfig,
  saveGlobalConfig,
  getMcprcConfig,
  addMcprcServerForTesting,
  removeMcprcServerForTesting,
} from '../../../utils/config.js'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ImageBlockParam,
  MessageParam,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import {
  CallToolResultSchema,
  ClientRequest,
  ListPromptsResult,
  ListPromptsResultSchema,
  ListToolsResult,
  ListToolsResultSchema,
  Result,
  ResultSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { memoize, pickBy } from 'lodash-es'
import type { Tool } from '../../../Tool.js'
import { logEvent, logMCPError } from '../../../utils/log.js'
import type { Command } from '../../../types/command.js'
import { PRODUCT_COMMAND } from '../../../constants/product.js'

const HOST_MCP_TOOL_BASE = {
  async isEnabled() {
    return true
  },
  isReadOnly() {
    return false
  },
  needsPermissions() {
    return true
  },
  renderToolUseMessage(input: Record<string, unknown>) {
    return Object.entries(input)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(', ')
  },
  renderToolUseRejectedMessage() {
    return null
  },
  renderToolResultMessage(output: unknown) {
    if (typeof output === 'string') return output
    return JSON.stringify(output)
  },
  renderResultForAssistant(content: unknown) {
    return content
  },
}

function safeParseMcpJSON(json: string | null | undefined): unknown {
  if (!json) return null
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

// Lazily-imported MCP++ modules — only loaded when the matching feature flag
// is enabled, so users without the optional deps don't hit import errors.
async function getMcpPlusPlusEnvelope() {
  return import('../mcp-envelope.js') as Promise<typeof import('../mcp-envelope.js')>
}
async function getMcpPlusPlusEventDAG() {
  return import('../mcp-event-dag.js') as Promise<typeof import('../mcp-event-dag.js')>
}
async function getMcpPlusPlusIDL() {
  return import('../mcp-idl.js') as Promise<typeof import('../mcp-idl.js')>
}

/**
 * Module-level EventDAG singleton — shared across all tool calls within a
 * process so that causal ordering is maintained across the session.
 */
let _eventDAG: import('../mcp-event-dag.js').EventDAG | null = null
async function getEventDAG(): Promise<import('../mcp-event-dag.js').EventDAG> {
  if (!_eventDAG) {
    const { EventDAG } = await getMcpPlusPlusEventDAG()
    _eventDAG = new EventDAG()
  }
  return _eventDAG
}

/**
 * Module-level InterfaceRepository singleton for IDL descriptor caching.
 * Re-uses the shared instance so the registry and the client share the same store.
 */
let _idlRepo: import('../mcp-idl.js').InterfaceRepository | null = null
async function getIDLRepo(): Promise<import('../mcp-idl.js').InterfaceRepository> {
  if (!_idlRepo) {
    const { InterfaceRepository } = await getMcpPlusPlusIDL()
    _idlRepo = InterfaceRepository.getSharedInstance()
  }
  return _idlRepo
}

type McpName = string

export function parseEnvVars(
  rawEnvArgs: string[] | undefined,
): Record<string, string> {
  const parsedEnv: Record<string, string> = {}

  // Parse individual env vars
  if (rawEnvArgs) {
    for (const envStr of rawEnvArgs) {
      const [key, ...valueParts] = envStr.split('=')
      if (!key || valueParts.length === 0) {
        throw new Error(
          `Invalid environment variable format: ${envStr}, environment variables should be added as: -e KEY1=value1 -e KEY2=value2`,
        )
      }
      parsedEnv[key] = valueParts.join('=')
    }
  }
  return parsedEnv
}

const VALID_SCOPES = ['project', 'global', 'mcprc'] as const
type ConfigScope = (typeof VALID_SCOPES)[number]
const EXTERNAL_SCOPES = ['project', 'global'] as ConfigScope[]

export function ensureConfigScope(scope?: string): ConfigScope {
  if (!scope) return 'project'

  const scopesToCheck =
    process.env.USER_TYPE === 'external' ? EXTERNAL_SCOPES : VALID_SCOPES

  if (!scopesToCheck.includes(scope as ConfigScope)) {
    throw new Error(
      `Invalid scope: ${scope}. Must be one of: ${scopesToCheck.join(', ')}`,
    )
  }

  return scope as ConfigScope
}

export function addMcpServer(
  name: McpName,
  server: McpServerConfig,
  scope: ConfigScope = 'project',
): void {
  if (scope === 'mcprc') {
    if (process.env.NODE_ENV === 'test') {
      addMcprcServerForTesting(name, server)
    } else {
      const mcprcPath = join(process.cwd(), '.mcprc')
      let mcprcConfig: Record<string, McpServerConfig> = {}

      // Read existing config if present
      if (existsSync(mcprcPath)) {
        try {
          const mcprcContent = readFileSync(mcprcPath, 'utf-8')
          const existingConfig = safeParseMcpJSON(mcprcContent)
          if (existingConfig && typeof existingConfig === 'object') {
            mcprcConfig = existingConfig as Record<string, McpServerConfig>
          }
        } catch {
          // If we can't read/parse, start with empty config
        }
      }

      // Add the server
      mcprcConfig[name] = server

      // Write back to .mcprc
      try {
        writeFileSync(mcprcPath, JSON.stringify(mcprcConfig, null, 2), 'utf-8')
      } catch (error) {
        throw new Error(`Failed to write to .mcprc: ${error}`)
      }
    }
  } else if (scope === 'global') {
    const config = getGlobalConfig()
    if (!config.mcpServers) {
      config.mcpServers = {}
    }
    config.mcpServers[name] = server
    saveGlobalConfig(config)
  } else {
    const config = getCurrentProjectConfig()
    if (!config.mcpServers) {
      config.mcpServers = {}
    }
    config.mcpServers[name] = server
    saveCurrentProjectConfig(config)
  }
}

export function removeMcpServer(
  name: McpName,
  scope: ConfigScope = 'project',
): void {
  if (scope === 'mcprc') {
    if (process.env.NODE_ENV === 'test') {
      removeMcprcServerForTesting(name)
    } else {
      const mcprcPath = join(process.cwd(), '.mcprc')
      if (!existsSync(mcprcPath)) {
        throw new Error('No .mcprc file found in this directory')
      }

      try {
        const mcprcContent = readFileSync(mcprcPath, 'utf-8')
        const mcprcConfig = safeParseMcpJSON(mcprcContent) as Record<
          string,
          McpServerConfig
        > | null

        if (
          !mcprcConfig ||
          typeof mcprcConfig !== 'object' ||
          !mcprcConfig[name]
        ) {
          throw new Error(`No MCP server found with name: ${name} in .mcprc`)
        }

        delete mcprcConfig[name]
        writeFileSync(mcprcPath, JSON.stringify(mcprcConfig, null, 2), 'utf-8')
      } catch (error) {
        if (error instanceof Error) {
          throw error
        }
        throw new Error(`Failed to remove from .mcprc: ${error}`)
      }
    }
  } else if (scope === 'global') {
    const config = getGlobalConfig()
    if (!config.mcpServers?.[name]) {
      throw new Error(`No global MCP server found with name: ${name}`)
    }
    delete config.mcpServers[name]
    saveGlobalConfig(config)
  } else {
    const config = getCurrentProjectConfig()
    if (!config.mcpServers?.[name]) {
      throw new Error(`No local MCP server found with name: ${name}`)
    }
    delete config.mcpServers[name]
    saveCurrentProjectConfig(config)
  }
}

export function listMCPServers(): Record<string, McpServerConfig> {
  const globalConfig = getGlobalConfig()
  const mcprcConfig = getMcprcConfig()
  const projectConfig = getCurrentProjectConfig()
  return {
    ...(globalConfig.mcpServers ?? {}),
    ...(mcprcConfig ?? {}), // mcprc configs override global ones
    ...(projectConfig.mcpServers ?? {}), // Project configs override mcprc ones
  }
}

export type ScopedMcpServerConfig = McpServerConfig & {
  scope: ConfigScope
}

export function getMcpServer(name: McpName): ScopedMcpServerConfig | undefined {
  const projectConfig = getCurrentProjectConfig()
  const mcprcConfig = getMcprcConfig()
  const globalConfig = getGlobalConfig()

  // Check each scope in order of precedence
  if (projectConfig.mcpServers?.[name]) {
    return { ...projectConfig.mcpServers[name], scope: 'project' }
  }

  if (mcprcConfig?.[name]) {
    return { ...mcprcConfig[name], scope: 'mcprc' }
  }

  if (globalConfig.mcpServers?.[name]) {
    return { ...globalConfig.mcpServers[name], scope: 'global' }
  }

  return undefined
}

async function connectToServer(
  name: string,
  serverRef: McpServerConfig,
): Promise<Client> {
  const transport =
    serverRef.type === 'sse'
      ? new SSEClientTransport(new URL(serverRef.url))
      : new StdioClientTransport({
          command: serverRef.command,
          args: serverRef.args,
          env: {
            ...process.env,
            ...serverRef.env,
          } as Record<string, string>,
          stderr: 'pipe', // prevents error output from the MCP server from printing to the UI
        })

  const client = new Client(
    {
      name: PRODUCT_COMMAND,
      version: '0.1.0',
    },
    {
      capabilities: {},
    },
  )

  // Add a timeout to connection attempts to prevent tests from hanging indefinitely
  const CONNECTION_TIMEOUT_MS = 5000
  const connectPromise = client.connect(transport)
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Connection to MCP server "${name}" timed out after ${CONNECTION_TIMEOUT_MS}ms`,
        ),
      )
    }, CONNECTION_TIMEOUT_MS)

    // Clean up timeout if connect resolves or rejects
    connectPromise.then(
      () => clearTimeout(timeoutId),
      () => clearTimeout(timeoutId),
    )
  })

  await Promise.race([connectPromise, timeoutPromise])

  if (serverRef.type === 'stdio') {
    ;(transport as StdioClientTransport).stderr?.on('data', (data: Buffer) => {
      const errorText = data.toString().trim()
      if (errorText) {
        logMCPError(name, `Server stderr: ${errorText}`)
      }
    })
  }
  return client
}

type ConnectedClient = {
  client: Client
  name: string
  type: 'connected'
}
type FailedClient = {
  name: string
  type: 'failed'
}
export type WrappedClient = ConnectedClient | FailedClient

export function getMcprcServerStatus(
  serverName: string,
): 'approved' | 'rejected' | 'pending' {
  const config = getCurrentProjectConfig()
  if (config.approvedMcprcServers?.includes(serverName)) {
    return 'approved'
  }
  if (config.rejectedMcprcServers?.includes(serverName)) {
    return 'rejected'
  }
  return 'pending'
}

export const getClients = memoize(async (): Promise<WrappedClient[]> => {
  // TODO: This is a temporary fix for a hang during npm run verify in CI.
  // We need to investigate why MCP client connections hang in CI verify but not in CI tests.
  if (process.env.CI && process.env.NODE_ENV !== 'test') {
    return []
  }

  const globalServers = getGlobalConfig().mcpServers ?? {}
  const mcprcServers = getMcprcConfig()
  const projectServers = getCurrentProjectConfig().mcpServers ?? {}

  // Filter mcprc servers to only include approved ones
  const approvedMcprcServers = pickBy(
    mcprcServers,
    (_, name) => getMcprcServerStatus(name) === 'approved',
  )

  const allServers = {
    ...globalServers,
    ...approvedMcprcServers, // Approved .mcprc servers override global ones
    ...projectServers, // Project servers take highest precedence
  }

  return await Promise.all(
    Object.entries(allServers).map(async ([name, serverRef]) => {
      try {
        const client = await connectToServer(name, serverRef)
        logEvent('tengu_mcp_server_connection_succeeded', {})
        return { name, client, type: 'connected' as const }
      } catch (error) {
        logEvent('tengu_mcp_server_connection_failed', {})
        logMCPError(
          name,
          `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
        )
        return { name, type: 'failed' as const }
      }
    }),
  )
})

async function requestAll<
  ResultT extends Result,
  ResultSchemaT extends typeof ResultSchema,
>(
  req: ClientRequest,
  resultSchema: ResultSchemaT,
  requiredCapability: string,
): Promise<{ client: ConnectedClient; result: ResultT }[]> {
  const clients = await getClients()
  const results = await Promise.allSettled(
    clients.map(async client => {
      if (client.type === 'failed') return null

      try {
        const capabilities = await client.client.getServerCapabilities()
        if (!capabilities?.[requiredCapability]) {
          return null
        }
        return {
          client,
          result: (await client.client.request(req, resultSchema)) as ResultT,
        }
      } catch (error) {
        if (client.type === 'connected') {
          logMCPError(
            client.name,
            `Failed to request '${req.method}': ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        return null
      }
    }),
  )
  return results
    .filter(
      (
        result,
      ): result is PromiseFulfilledResult<{
        client: ConnectedClient
        result: ResultT
      } | null> => result.status === 'fulfilled',
    )
    .map(result => result.value)
    .filter(
      (result): result is { client: ConnectedClient; result: ResultT } =>
        result !== null,
    )
}

export const getMCPTools = memoize(async (): Promise<Tool[]> => {
  const toolsList = await requestAll<
    ListToolsResult,
    typeof ListToolsResultSchema
  >(
    {
      method: 'tools/list',
    },
    ListToolsResultSchema,
    'tools',
  )

  const cfg = getGlobalConfig().mcpPlusPlus ?? {}

  // Pre-load IDL repo once if needed
  const idlRepo = cfg.enableIDL ? await getIDLRepo() : null
  const { computeInterfaceCID } = cfg.enableIDL
    ? await getMcpPlusPlusIDL()
    : { computeInterfaceCID: undefined }

  // Properly integrate MCP tool with the base MCPTool
  return toolsList.flatMap(({ client, result: { tools } }) =>
    tools.map(
      (tool): Tool => {
        // Compute and register the interface_cid when IDL is enabled
        let interfaceCid: string | undefined
        if (idlRepo && computeInterfaceCID) {
          try {
            const descriptor = {
              name: tool.name,
              namespace: client.name,
              version: '1.0.0',
              methods: [
                {
                  name: tool.name,
                  inputSchema: tool.inputSchema as Record<string, unknown>,
                  description: tool.description,
                },
              ],
              errors: [],
              requires: [],
              compatibility: {},
              semanticTags: [],
            }
            interfaceCid = computeInterfaceCID(descriptor)
            idlRepo.register(descriptor)
          } catch {
            // Non-fatal: IDL registration is best-effort
          }
        }

        return {
          ...HOST_MCP_TOOL_BASE,
          name: 'mcp__' + client.name + '__' + tool.name,
          // MCP++ Profile A: expose interface_cid so the UI can surface compat info
          ...(interfaceCid !== undefined ? { interface_cid: interfaceCid } : {}),
          async description() {
            return tool.description ?? ''
          },
          async prompt() {
            return tool.description ?? ''
          },
          inputJSONSchema: tool.inputSchema as Tool['inputJSONSchema'],
          async *call(args: Record<string, unknown>) {
            const data = await callMCPTool({
              client,
              tool: tool.name,
              args,
              interfaceCid,
            })
            yield {
              type: 'result' as const,
              data,
              resultForAssistant: data,
            }
          },
          userFacingName() {
            return `${client.name}:${tool.name} (MCP)`
          },
        }
      },
    ),
  )
})

async function callMCPTool({
  client: { client, name },
  tool,
  args,
  interfaceCid,
}: {
  client: ConnectedClient
  tool: string
  args: Record<string, unknown>
  interfaceCid?: string
}): Promise<ToolResultBlockParam['content']> {
  const cfg = getGlobalConfig().mcpPlusPlus ?? {}

  // ── MCP++ Phase 4: Build CID-native execution envelope ──────────────────
  let envelope: import('../mcp-envelope.js').ExecutionEnvelope | undefined
  if (cfg.enableCIDEnvelopes && interfaceCid) {
    try {
      const { buildEnvelope } = await getMcpPlusPlusEnvelope()
      const dag = cfg.enableEventDAG ? await getEventDAG() : null
      // getTips() returns StoredEventNode[]; extract just the CID strings for causal parents
      const tipCids = dag ? dag.getTips().map((n: { cid: string }) => n.cid) : []
      envelope = buildEnvelope(
        { toolName: tool, params: args },
        interfaceCid,
        undefined,   // ucanProofToken — set by caller if UCAN is enabled
        tipCids,     // parent CIDs from current DAG frontier
      )
    } catch {
      // Non-fatal: envelope building is best-effort
    }
  }

  const result = await client.callTool(
    {
      name: tool,
      arguments: args,
    },
    CallToolResultSchema,
  )

  if ('isError' in result && result.isError) {
    const errorMessage = `Error calling tool ${tool}: ${result.error || 'Unknown error'}`
    logMCPError(name, errorMessage)
    throw Error(errorMessage)
  }

  // ── MCP++ Phase 4: Build receipt & Phase 5: Record event in DAG ─────────
  if (cfg.enableCIDEnvelopes && envelope) {
    try {
      const { buildReceipt } = await getMcpPlusPlusEnvelope()
      const outputBytes = Buffer.from(JSON.stringify(result), 'utf8')
      const receipt = buildReceipt(envelope, outputBytes)

      // Phase 5 — append event to the DAG
      if (cfg.enableEventDAG) {
        const dag = await getEventDAG()
        dag.appendEvent({
          intent_cid: envelope.intent_cid,
          interface_cid: envelope.interface_cid,
          proofs: envelope.proof_cid ? [envelope.proof_cid] : [],
          decision_outcome: 'PERMIT',
          outputs: [receipt.output_cid],
          parents: envelope.parents,
          timestamp: new Date().toISOString(),
          // envelope_cid is the one computed by buildReceipt (stable, canonical)
          envelope_cid: receipt.envelope_cid,
        })
      }

      // Pin receipt + output CIDs via IPFS if available (best-effort)
      if (cfg.enableCIDEnvelopes) {
        Promise.resolve().then(async () => {
          try {
            const { computeReceiptCID } = await getMcpPlusPlusEnvelope()
            const { IPFSKitClient } = await import('../../../ipfs/client.js') as typeof import('../../../ipfs/client.js')
            const ipfs = new IPFSKitClient()
            const receiptCid = computeReceiptCID(receipt)
            const receiptJson = JSON.stringify(receipt)
            await ipfs.addContent(receiptJson, { pin: true, filename: `${receiptCid}.json` })
          } catch {
            // IPFS not configured or unavailable — silently skip
          }
        })
      }
    } catch {
      // Non-fatal: provenance recording is best-effort
    }
  }

  // Handle toolResult-type response
  if ('toolResult' in result) {
    return String(result.toolResult)
  }

  // Handle content array response
  if ('content' in result && Array.isArray(result.content)) {
    return result.content.map(item => {
      if (item.type === 'image') {
        return {
          type: 'image',
          source: {
            type: 'base64',
            data: String(item.data),
            media_type: item.mimeType as ImageBlockParam.Source['media_type'],
          },
        }
      }
      return item
    })
  }

  throw Error(`Unexpected response format from tool ${tool}`)
}

export const getMCPCommands = memoize(async (): Promise<Command[]> => {
  const results = await requestAll<
    ListPromptsResult,
    typeof ListPromptsResultSchema
  >(
    {
      method: 'prompts/list',
    },
    ListPromptsResultSchema,
    'prompts',
  )

  return results.flatMap(({ client, result }) =>
    (result.prompts || []).map(_ => {
      const argNames = Object.values(_.arguments ?? {}).map(k => k.name)
      return {
        type: 'prompt',
        name: 'mcp__' + client.name + '__' + _.name,
        description: _.description ?? '',
        isEnabled: true,
        isHidden: false,
        progressMessage: 'running',
        userFacingName() {
          return `${client.name}:${_.name} (MCP)`
        },
        argNames,
        async getPromptForCommand(args: string) {
          const argsArray = args.split(' ')
          return await runCommand(
            { name: _.name, client },
            zipObject(argNames, argsArray),
          )
        },
      }
    }),
  )
})

export async function runCommand(
  { name, client }: { name: string; client: ConnectedClient },
  args: Record<string, string>,
): Promise<MessageParam[]> {
  try {
    const result = await client.client.getPrompt({ name, arguments: args })
    return result.messages.map(
      (message): MessageParam => ({
        role: message.role,
        content: [
          message.content.type === 'text'
            ? {
                type: 'text',
                text: message.content.text,
              }
            : message.content.type === 'resource'
              ? {
                  // Embed resource as text (URI + optional text body)
                  type: 'text',
                  text: `[resource: ${(message.content as unknown as Record<string, unknown>)['uri'] ?? 'unknown'}]`,
                }
              : {
                  type: 'image',
                  source: {
                    data: String(message.content.data),
                    media_type: message.content
                      .mimeType as ImageBlockParam.Source['media_type'],
                    type: 'base64',
                  },
                },
        ],
      }),
    )
  } catch (error) {
    logMCPError(
      client.name,
      `Error running command '${name}': ${error instanceof Error ? error.message : String(error)}`,
    )
    throw error
  }
}
