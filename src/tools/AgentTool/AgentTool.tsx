import { TextBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import chalk from 'chalk'
import { last, memoize } from 'lodash-es'
import { EOL } from 'os'
import * as React from 'react'
import { z } from 'zod'
import { Tool } from '../Tool'
import { FallbackToolUseRejectedMessage } from '@/components/FallbackToolUseRejectedMessage'
import { getAgentPrompt } from '@/constants/prompts'
import { getContext } from '@/context'
import { hasPermissionsToUseTool } from '@/permissions'
import { AssistantMessage, Message as MessageType, query } from '@/query'
import { formatDuration, formatNumber } from '@/utils/format'
import {
  getMessagesPath,
  getNextAvailableLogSidechainNumber,
  overwriteLog,
} from '@/utils/log'
import { applyMarkdown } from '@/utils/markdown'
import {
  createAssistantMessage,
  createUserMessage,
  getLastAssistantMessageId,
  INTERRUPT_MESSAGE,
  normalizeMessages,
} from '@/utils/messages'
import { getSlowAndCapableModel } from '@/utils/model'
import { getMaxThinkingTokens } from '@/utils/thinking'
import { getAgentTools, getPrompt } from './prompt.js'
import { TOOL_NAME } from './constants.js'

const inputSchema = z.object({
  prompt: z.string().describe('The task for the agent to perform'),
})

export const AgentTool = {
  async prompt({ dangerouslySkipPermissions }) {
    return await getPrompt(dangerouslySkipPermissions)
  },
  name: TOOL_NAME,
  async description() {
    return 'Launch a new task'
  },
  inputSchema,
  async *call(
    { prompt },
    {
      abortController,
      options: {
        dangerouslySkipPermissions = false,
        forkNumber,
        messageLogName,
        verbose,
      },
      readFileTimestamps,
    },
  ) {
    const startTime = Date.now()
    const messages: MessageType[] = [createUserMessage(prompt)]
    const tools = await getAgentTools(dangerouslySkipPermissions)

    // We yield an initial message immediately so the UI
    // doesn't move around when messages start streaming back.
    yield {
      type: 'progress',
      content: createAssistantMessage(chalk.dim('Initializing…')),
      normalizedMessages: normalizeMessages(messages),
      tools,
    }

    const [agentPrompt, context, slowAndCapableModel, maxThinkingTokens] =
      await Promise.all([
        getAgentPrompt(),
        getContext(),
        getSlowAndCapableModel(),
        getMaxThinkingTokens(messages),
      ])
    let toolUseCount = 0

    const getSidechainNumber = memoize(() =>
      getNextAvailableLogSidechainNumber(messageLogName, forkNumber),
    )

    for await (const message of query(
      messages,
      agentPrompt,
      context,
      hasPermissionsToUseTool,
      {
        abortController,
        options: {
          dangerouslySkipPermissions,
          forkNumber,
          messageLogName,
          tools,
          commands: [],
          verbose,
          slowAndCapableModel,
          maxThinkingTokens,
        },
        messageId: getLastAssistantMessageId(messages),
        readFileTimestamps,
      },
    )) {
      messages.push(message)

      overwriteLog(
        // IMPORTANT: Compute sidechain number here, not earlier, to avoid a race condition
        // where concurrent Agents reserve the same sidechain number.
        getMessagesPath(messageLogName, forkNumber, getSidechainNumber()),
        messages.filter(_ => _.type !== 'progress'),
      )

      if (message.type !== 'assistant') {
        continue
      }

      const normalizedMessages = normalizeMessages(messages)
      for (const content of message.message.content) {
        if (content.type !== 'tool_use') {
          continue
        }

        toolUseCount++
        yield {
          type: 'progress',
          content: normalizedMessages.find(
            _ =>
              _.type === 'assistant' &&
              _.message.content[0]?.type === 'tool_use' &&
              _.message.content[0].id === content.id,
          ) as AssistantMessage,
          normalizedMessages,
          tools,
        }
      }
    }

    const normalizedMessages = normalizeMessages(messages)
    const lastMessage = last(messages)
    if (lastMessage?.type !== 'assistant') {
      throw new Error('Last message was not an assistant message')
    }

    if (
      lastMessage.message.content.some(
        _ => _.type === 'text' && _.text === INTERRUPT_MESSAGE,
      )
    ) {
      yield {
        type: 'progress',
        content: lastMessage,
        normalizedMessages,
        tools,
      }
    } else {
      const result = [
        toolUseCount === 1 ? '1 tool use' : `${toolUseCount} tool uses`,
        formatNumber(
          (lastMessage.message.usage.cache_creation_input_tokens ?? 0) +
            (lastMessage.message.usage.cache_read_input_tokens ?? 0) +
            lastMessage.message.usage.input_tokens +
            lastMessage.message.usage.output_tokens,
        ) + ' tokens',
        formatDuration(Date.now() - startTime),
      ]
      yield {
        type: 'progress',
        content: createAssistantMessage(`Done (${result.join(' · ')})`),
        normalizedMessages,
        tools,
      }
    }

    // Output is an AssistantMessage, but since AgentTool is a tool, it needs
    // to serialize its response to UserMessage-compatible content.
    const data = lastMessage.message.content.filter(_ => _.type === 'text')
    yield {
      type: 'result',
      data,
      normalizedMessages,
      resultForAssistant: this.renderResultForAssistant(data),
      tools,
    }
  },
  isReadOnly() {
    return true // for now...
  },
  async isEnabled() {
    return true
  },
  userFacingName() {
    return 'Task'
  },
  needsPermissions() {
    return false
  },
  renderResultForAssistant(data) {
    return data
  },
  renderToolUseMessage({ prompt }, { verbose }) {
    const lines = prompt.split(EOL)
    return applyMarkdown(!verbose && lines.length > 1 ? lines[0] + '…' : prompt)
  },
  renderToolUseRejectedMessage() {
    return <FallbackToolUseRejectedMessage />
  }
};
