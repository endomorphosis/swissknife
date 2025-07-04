import type { TextBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import { Box } from 'ink'
import * as React from 'react'
import { z } from 'zod'
import type { Tool } from '../Tool'
import { FallbackToolUseRejectedMessage } from '@/components/FallbackToolUseRejectedMessage'
import { HighlightedCode } from '@/components/HighlightedCode'
import { getContext } from '@/context'
import { Message, query } from '@/query'
import { lastX } from '@/utils/generators'
import { createUserMessage } from '@/utils/messages'
import { BashTool } from '@/tools/BashTool/BashTool'
import { FileReadTool } from '@/tools/FileReadTool/FileReadTool'
import { FileWriteTool } from '@/tools/FileWriteTool/FileWriteTool'
import { GlobTool } from '@/tools/GlobTool/GlobTool'
import { GrepTool } from '@/tools/GrepTool/GrepTool'
import { LSTool } from '@/tools/lsTool/lsTool'
import { ARCHITECT_SYSTEM_PROMPT, DESCRIPTION } from './prompt.js'

const FS_EXPLORATION_TOOLS: Tool[] = [
  BashTool,
  LSTool,
  FileReadTool,
  FileWriteTool,
  GlobTool,
  GrepTool,
]

const inputSchema = z.strictObject({
  prompt: z
    .string()
    .describe('The technical request or coding task to analyze'),
  context: z
    .string()
    .describe('Optional context from previous conversation or system state')
    .optional(),
})

export const ArchitectTool = {
  name: 'Architect',
  async description() {
    return DESCRIPTION
  },
  inputSchema,
  isReadOnly() {
    return true
  },
  userFacingName() {
    return 'Architect'
  },
  async isEnabled() {
    return false
  },
  needsPermissions() {
    return false
  },
  async *call({ prompt, context }, toolUseContext, canUseTool) {
    const content = context
      ? `<context>${context}</context>\n\n${prompt}`
      : prompt

    const userMessage = createUserMessage(content)

    const messages: Message[] = [userMessage]

    // We only allow the file exploration tools to be used in the architect tool
    const allowedTools = (toolUseContext.options.tools ?? []).filter(_ =>
      FS_EXPLORATION_TOOLS.map(_ => _.name).includes(_.name),
    )

    const lastResponse = await lastX(
      query(
        messages,
        [ARCHITECT_SYSTEM_PROMPT],
        await getContext(),
        canUseTool,
        {
          ...toolUseContext,
          options: { ...toolUseContext.options, tools: allowedTools },
        },
      ),
    )

    if (lastResponse.type !== 'assistant') {
      throw new Error(`Invalid response from API`)
    }

    const data = lastResponse.message.content.filter(_ => _.type === 'text')
    yield {
      type: 'result',
      data,
      resultForAssistant: this.renderResultForAssistant(data),
    }
  },
  async prompt() {
    return DESCRIPTION
  },
  renderResultForAssistant(data) {
    return data
  },
  renderToolUseMessage(input) {
    return Object.entries(input)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(', ')
  },
  renderToolResultMessage(content) {
    return (
      <Box flexDirection="column" gap={1}>
        <HighlightedCode
          code={content.map(_ => _.text).join('\n')}
          language="markdown"
        />
      </Box>
    )
  },
  renderToolUseRejectedMessage() {
    return <FallbackToolUseRejectedMessage />
  },
};
