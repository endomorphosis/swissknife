import { TextBlock, ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import { AssistantMessage, BinaryFeedbackResult } from '../../query.js'
import { MAIN_QUERY_TEMPERATURE } from '../../services/claude.js'
import { getDynamicConfig, logEvent } from '../../services/statsig.js'

import { isEqual, zip } from 'lodash-es.js'
import { getGitState } from '../../utils/git.js'

export type BinaryFeedbackChoice =
  | 'prefer-left'
  | 'prefer-right'
  | 'neither'
  | 'no-preference'

export type BinaryFeedbackChoose = (choice: BinaryFeedbackChoice) => void

type BinaryFeedbackConfig = {
  sampleFrequency: number
}

async function getBinaryFeedbackStatsigConfig(): Promise<BinaryFeedbackConfig> {
  return await getDynamicConfig('tengu-binary-feedback-config', {
    sampleFrequency: 0,
  })
}

function getMessageBlockSequence(m: AssistantMessage) {
  return m.message.content.map(cb => {
    if (cb.type === 'text') return 'text'
    if (cb.type === 'tool_use') return cb.name
    return cb.type // Handle other block types like 'thinking' or 'redacted_thinking'
  })
}

export async function logBinaryFeedbackEvent(
  m1: AssistantMessage,
  m2: AssistantMessage,
  choice: BinaryFeedbackChoice,
): Promise<void> {
  const modelA = m1.message.model
  const modelB = m2.message.model
  const gitState = await getGitState()
  logEvent('tengu_binary_feedback', {
    msg_id_A: m1.message.id,
    msg_id_B: m2.message.id,
    choice: {
      'prefer-left': m1.message.id,
      'prefer-right': m2.message.id,
      neither: undefined,
      'no-preference': undefined,
    }[choice],
    choiceStr: choice,
    gitHead: gitState?.commitHash,
    gitBranch: gitState?.branchName,
    gitRepoRemoteUrl: gitState?.remoteUrl || undefined,
    gitRepoIsHeadOnRemote: gitState?.isHeadOnRemote?.toString(),
    gitRepoIsClean: gitState?.isClean?.toString(),
    modelA,
    modelB,
    temperatureA: String(MAIN_QUERY_TEMPERATURE),
    temperatureB: String(MAIN_QUERY_TEMPERATURE),
    seqA: String(getMessageBlockSequence(m1)),
    seqB: String(getMessageBlockSequence(m2)),
  })
}

export async function logBinaryFeedbackSamplingDecision(
  decision: boolean,
  reason?: string,
): Promise<void> {
  logEvent('tengu_binary_feedback_sampling_decision', {
    decision: decision.toString(),
    reason,
  })
}

export async function logBinaryFeedbackDisplayDecision(
  decision: boolean,
  m1: AssistantMessage,
  m2: AssistantMessage,
  reason?: string,
): Promise<void> {
  logEvent('tengu_binary_feedback_display_decision', {
    decision: decision.toString(),
    reason,
    msg_id_A: m1.message.id,
    msg_id_B: m2.message.id,
    seqA: String(getMessageBlockSequence(m1)),
    seqB: String(getMessageBlockSequence(m2)),
  })
}

function textContentBlocksEqual(cb1: TextBlock, cb2: TextBlock): boolean {
  return cb1.text === cb2.text
}

function contentBlocksEqual(
  cb1: TextBlock | ToolUseBlock,
  cb2: TextBlock | ToolUseBlock,
): boolean {
  if (cb1.type !== cb2.type) {
    return false
  }
  if (cb1.type === 'text') {
    return textContentBlocksEqual(cb1, cb2 as TextBlock)
  }
  cb2 = cb2 as ToolUseBlock
  return cb1.name === cb2.name && isEqual(cb1.input, cb2.input)
}

function allContentBlocksEqual(
  content1: (TextBlock | ToolUseBlock)[],
  content2: (TextBlock | ToolUseBlock)[],
): boolean {
  if (content1.length !== content2.length) {
    return false
  }
  return zip(content1, content2).every(([cb1, cb2]) =>
    contentBlocksEqual(cb1!, cb2!),
  )
}

export async function shouldUseBinaryFeedback(): Promise<boolean> {
  if (process.env.DISABLE_BINARY_FEEDBACK) {
    logBinaryFeedbackSamplingDecision(false, 'disabled_by_env_var')
    return false
  }
  if (process.env.FORCE_BINARY_FEEDBACK) {
    logBinaryFeedbackSamplingDecision(true, 'forced_by_env_var')
    return true
  }
  if (process.env.USER_TYPE !== 'ant') {
    logBinaryFeedbackSamplingDecision(false, 'not_ant')
    return false
  }
  if (process.env.NODE_ENV === 'test') {
    // Binary feedback breaks a couple tests related to checking for permission,
    // so we have to disable it in tests at the risk of hiding bugs
    logBinaryFeedbackSamplingDecision(false, 'test')
    return false
  }

  const config = await getBinaryFeedbackStatsigConfig()
  if (config.sampleFrequency === 0) {
    logBinaryFeedbackSamplingDecision(false, 'top_level_frequency_zero')
    return false
  }
  if (Math.random() > config.sampleFrequency) {
    logBinaryFeedbackSamplingDecision(false, 'top_level_frequency_rng')
    return false
  }
  logBinaryFeedbackSamplingDecision(true)
  return true
}

export function messagePairValidForBinaryFeedback(
  m1: AssistantMessage,
  m2: AssistantMessage,
): boolean {
  const logPass = () => logBinaryFeedbackDisplayDecision(true, m1, m2)
  const logFail = (reason: string) =>
    logBinaryFeedbackDisplayDecision(false, m1, m2, reason)

  // Ignore thinking blocks, on the assumption that users don't find them very relevant
  // compared to other content types
  const nonThinkingBlocks1 = m1.message.content.filter(
    b => b.type !== 'thinking' && b.type !== 'redacted_thinking',
  )
  const nonThinkingBlocks2 = m2.message.content.filter(
    b => b.type !== 'thinking' && b.type !== 'redacted_thinking',
  )
  const hasToolUse =
    nonThinkingBlocks1.some(b => b.type === 'tool_use') ||
    nonThinkingBlocks2.some(b => b.type === 'tool_use')

  // If they're all text blocks, compare those
  if (!hasToolUse) {
    if (allContentBlocksEqual(nonThinkingBlocks1, nonThinkingBlocks2)) {
      logFail('contents_identical')
      return false
    }
    logPass()
    return true
  }

  // If there are tools, they're the most material difference between the messages.
  // Only show binary feedback if there's a tool use difference, ignoring text.
  if (
    allContentBlocksEqual(
      nonThinkingBlocks1.filter(b => b.type === 'tool_use'),
      nonThinkingBlocks2.filter(b => b.type === 'tool_use'),
    )
  ) {
    logFail('contents_identical')
    return false
  }

  logPass()
  return true
}

export function getBinaryFeedbackResultForChoice(
  m1: AssistantMessage,
  m2: AssistantMessage,
  choice: BinaryFeedbackChoice,
): BinaryFeedbackResult {
  switch (choice) {
    case 'prefer-left':
      return { message: m1, shouldSkipPermissionCheck: true }
    case 'prefer-right':
      return { message: m2, shouldSkipPermissionCheck: true }
    case 'no-preference':
      return {
        message: Math.random() < 0.5 ? m1 : m2,
        shouldSkipPermissionCheck: false,
      }
    case 'neither':
      return { message: null, shouldSkipPermissionCheck: false }
  }
}
