import { last } from 'lodash-es'
import type { Message } from '../query.js'
import { logEvent } from '../services/statsig.js'
import { getLastAssistantMessageId } from './messages.js'
import { ThinkTool } from '../tools/ThinkTool/ThinkTool.js'
import { USE_BEDROCK, USE_VERTEX } from './model.js'
import { getGlobalConfig } from './config.js'

export async function getMaxThinkingTokens(
  messages: Message[],
): Promise<number> {
  if (process.env.MAX_THINKING_TOKENS) {
    const tokens = parseInt(process.env.MAX_THINKING_TOKENS, 10)
    logEvent('tengu_thinking', {
      method: 'scratchpad',
      tokenCount: tokens.toString(),
      messageId: getLastAssistantMessageId(messages),
      provider: USE_BEDROCK ? 'bedrock' : USE_VERTEX ? 'vertex' : '1p',
    })
    return tokens
  }

  if (await ThinkTool.isEnabled()) {
    logEvent('tengu_thinking', {
      method: 'scratchpad',
      tokenCount: '0',
      messageId: getLastAssistantMessageId(messages),
      provider: USE_BEDROCK ? 'bedrock' : USE_VERTEX ? 'vertex' : '1p',
    })
    return 0
  }

  const lastMessage = last(messages)
  if (
    lastMessage?.type !== 'user' ||
    typeof lastMessage.message.content !== 'string'
  ) {
    logEvent('tengu_thinking', {
      method: 'scratchpad',
      tokenCount: '0',
      messageId: getLastAssistantMessageId(messages),
      provider: USE_BEDROCK ? 'bedrock' : USE_VERTEX ? 'vertex' : '1p',
    })
    return 0
  }

  const content = lastMessage.message.content.toLowerCase()
  if (
    content.includes('think harder') ||
    content.includes('think intensely') ||
    content.includes('think longer') ||
    content.includes('think really hard') ||
    content.includes('think super hard') ||
    content.includes('think very hard') ||
    content.includes('ultrathink')
  ) {
    logEvent('tengu_thinking', {
      method: 'scratchpad',
      tokenCount: '31999',
      messageId: getLastAssistantMessageId(messages),
      provider: USE_BEDROCK ? 'bedrock' : USE_VERTEX ? 'vertex' : '1p',
    })
    return 32_000 - 1
  }

  if (
    content.includes('think about it') ||
    content.includes('think a lot') ||
    content.includes('think hard') ||
    content.includes('think more') ||
    content.includes('megathink')
  ) {
    logEvent('tengu_thinking', {
      method: 'scratchpad',
      tokenCount: '10000',
      messageId: getLastAssistantMessageId(messages),
      provider: USE_BEDROCK ? 'bedrock' : USE_VERTEX ? 'vertex' : '1p',
    })
    return 10_000
  }

  if (content.includes('think')) {
    logEvent('tengu_thinking', {
      method: 'scratchpad',
      tokenCount: '4000',
      messageId: getLastAssistantMessageId(messages),
      provider: USE_BEDROCK ? 'bedrock' : USE_VERTEX ? 'vertex' : '1p',
    })
    return 4_000
  }

  logEvent('tengu_thinking', {
    method: 'scratchpad',
    tokenCount: '0',
    messageId: getLastAssistantMessageId(messages),
    provider: USE_BEDROCK ? 'bedrock' : USE_VERTEX ? 'vertex' : '1p',
  })
  return 0
}

export async function getReasoningEffort(
  modelType: 'large' | 'small',
  messages: Message[],
): Promise<'low' | 'medium' | 'high' | null> {
  const thinkingTokens = await getMaxThinkingTokens(messages)
  const config = getGlobalConfig()
  const _maxEffort =
    modelType === 'large'
      ? config.largeModelReasoningEffort
      : config.smallModelReasoningEffort
  const maxEffort =
    _maxEffort === 'high'
      ? 2
      : _maxEffort === 'medium'
        ? 1
        : _maxEffort === 'low'
          ? 0
          : null
  if (!maxEffort) {
    return null
  }

  let effort = 0
  if (thinkingTokens < 10_000) {
    effort = 0
  } else if (thinkingTokens >= 10_000 && thinkingTokens < 30_000) {
    effort = 1
  } else {
    effort = 2
  }

  if (effort > maxEffort) {
    return _maxEffort
  }

  return effort === 2 ? 'high' : effort === 1 ? 'medium' : 'low'
}
