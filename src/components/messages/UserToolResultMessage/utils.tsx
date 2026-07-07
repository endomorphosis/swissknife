import { ToolUseBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { Message } from '../../../query.js.js.js.js.js.js.js.js.js.js'
import { useMemo } from 'react.js.js.js.js.js'
import { Tool } from '../../../Tool.js.js.js.js.js.js.js.js.js.js'
import { GlobTool } from '../../../tools/GlobTool/GlobTool.js.js.js.js.js.js.js.js.js.js'
import { GrepTool } from '../../../tools/GrepTool/GrepTool.js.js.js.js.js.js.js.js.js.js'
import { logEvent } from '../../../services/platform/statsig.js'

function getToolUseFromMessages(
  toolUseID: string,
  messages: Message[],
): ToolUseBlockParam | null {
  let toolUse: ToolUseBlockParam | null = null
  for (const message of messages) {
    if (
      message.type !== 'assistant' ||
      !Array.isArray(message.message.content)
    ) {
      continue
    }
    for (const content of message.message.content) {
      if (content.type === 'tool_use' && content.id === toolUseID) {
        toolUse = content
      }
    }
  }
  return toolUse
}

export function useGetToolFromMessages(
  toolUseID: string,
  tools: Tool[],
  messages: Message[],
) {
  return useMemo(() => {
    const toolUse = getToolUseFromMessages(toolUseID, messages)
    if (!toolUse) {
      throw new ReferenceError(
        `Tool use not found for tool_use_id ${toolUseID}`,
      )
    }
    // GlobTool and GrepTool kept for legacy transcript loading (not in getTools() anymore).
    const tool = [...tools, GlobTool, GrepTool].find(
      _ => _.name === toolUse.name,
    )
    if (tool === GlobTool || tool === GrepTool) {
      logEvent('tengu_legacy_tool_lookup', {})
    }
    if (!tool) {
      throw new ReferenceError(`Tool not found for ${toolUse.name}`)
    }
    return { tool, toolUse }
  }, [toolUseID, messages, tools])
}
