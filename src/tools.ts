import { Tool } from './Tool.js'
import { AgentTool } from './tools/AgentTool/AgentTool.js'
import { ArchitectTool } from './tools/ArchitectTool/ArchitectTool.js'
import { BashTool } from './tools/BashTool/BashTool.js'
import { FileEditTool } from './tools/FileEditTool/FileEditTool.js'
import { FileReadTool } from './tools/FileReadTool/FileReadTool.js'
import { FileWriteTool } from './tools/FileWriteTool/FileWriteTool.js'
import { GlobTool } from './tools/GlobTool/GlobTool.js'
import { GrepTool } from './tools/GrepTool/GrepTool.js'
import { LSTool } from './tools/lsTool/lsTool.js'
import { MemoryReadTool } from './tools/MemoryReadTool/MemoryReadTool.js'
import { MemoryWriteTool } from './tools/MemoryWriteTool/MemoryWriteTool.js'
import { NotebookEditTool } from './tools/NotebookEditTool/NotebookEditTool.js'
import { NotebookReadTool } from './tools/NotebookReadTool/NotebookReadTool.js'
import { ThinkTool } from './tools/ThinkTool/ThinkTool.js'
import { getMCPTools } from './services/mcpClient.js'
import { memoize } from 'lodash-es.js'

const ANT_ONLY_TOOLS = [MemoryReadTool, MemoryWriteTool]

// Function to avoid circular dependencies that break bun
export const getAllTools = (): Tool[] => {
  return [
    AgentTool,
    BashTool,
    GlobTool,
    GrepTool,
    LSTool,
    FileReadTool,
    FileEditTool,
    FileWriteTool,
    NotebookReadTool,
    NotebookEditTool,
    ThinkTool,
    ...ANT_ONLY_TOOLS,
  ]
}

export const getTools = memoize(
  async (enableArchitect?: boolean): Promise<Tool[]> => {
    const tools = [...getAllTools(), ...(await getMCPTools())]

    // Only include Architect tool if enabled via config or CLI flag
    if (enableArchitect) {
      tools.push(ArchitectTool)
    }

    const isEnabled = await Promise.all(tools.map(tool => tool.isEnabled()))
    return tools.filter((_, i) => isEnabled[i])
  },
)

export const getReadOnlyTools = memoize(async (): Promise<Tool[]> => {
  const tools = getAllTools().filter(tool => tool.isReadOnly())
  const isEnabled = await Promise.all(tools.map(tool => tool.isEnabled()))
  return tools.filter((_, index) => isEnabled[index])
})
