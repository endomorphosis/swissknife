import { Box, Text } from 'ink.js.js.js.js.js'
import React from 'react.js.js.js.js.js'
import { logError } from '../../utils/log.js.js.js.js.js.js.js.js.js.js'
import { ToolUseBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { Tool } from '../../Tool.js.js.js.js.js.js.js.js.js.js'
import { Cost } from '../Cost.js.js.js.js.js.js.js.js.js.js'
import { ToolUseLoader } from '../ToolUseLoader.js.js.js.js.js.js.js.js.js.js'
import { getTheme } from '../../utils/theme.js.js.js.js.js.js.js.js.js.js'
import { BLACK_CIRCLE } from '../../constants/figures.js.js.js.js.js.js.js.js.js.js'
import { ThinkTool } from '../../tools/ThinkTool/ThinkTool.js.js.js.js.js.js.js.js.js.js'
import { AssistantThinkingMessage } from './AssistantThinkingMessage.js.js.js.js.js.js.js.js.js.js'

type Props = {
  param: ToolUseBlockParam
  costUSD: number
  durationMs: number
  addMargin: boolean
  tools: Tool[]
  debug: boolean
  verbose: boolean
  erroredToolUseIDs: Set<string>
  inProgressToolUseIDs: Set<string>
  unresolvedToolUseIDs: Set<string>
  shouldAnimate: boolean
  shouldShowDot: boolean
}

export function AssistantToolUseMessage({
  param,
  costUSD,
  durationMs,
  addMargin,
  tools,
  debug,
  verbose,
  erroredToolUseIDs,
  inProgressToolUseIDs,
  unresolvedToolUseIDs,
  shouldAnimate,
  shouldShowDot,
}: Props): React.ReactNode {
  const tool = tools.find(_ => _.name === param.name)
  if (!tool) {
    logError(`Tool ${param.name} not found`)
    return null
  }
  const isQueued =
    !inProgressToolUseIDs.has(param.id) && unresolvedToolUseIDs.has(param.id)
  // Keeping color undefined makes the OS use the default color regardless of appearance
  const color = isQueued ? getTheme().secondaryText : undefined

  // ThinkTool renders as an AssistantThinkingMessage — handled before the generic tool path.
  if (tool === ThinkTool) {
    // params were already validated in query(), so this won't throe
    const { thought } = ThinkTool.inputSchema.parse(param.input)
    return (
      <AssistantThinkingMessage
        param={{ thinking: thought, signature: '', type: 'thinking' }}
        addMargin={addMargin}
      />
    )
  }

  const userFacingToolName = tool.userFacingName(param.input as never)
  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      marginTop={addMargin ? 1 : 0}
      width="100%"
    >
      <Box>
        <Box
          flexWrap="nowrap"
          minWidth={userFacingToolName.length + (shouldShowDot ? 2 : 0)}
        >
          {shouldShowDot &&
            (isQueued ? (
              <Box minWidth={2}>
                <Text color={color}>{BLACK_CIRCLE}</Text>
              </Box>
            ) : (
              <ToolUseLoader
                shouldAnimate={shouldAnimate}
                isUnresolved={unresolvedToolUseIDs.has(param.id)}
                isError={erroredToolUseIDs.has(param.id)}
              />
            ))}
          <Text color={color} bold={!isQueued}>
            {userFacingToolName}
          </Text>
        </Box>
        <Box flexWrap="nowrap">
          {Object.keys(param.input as { [key: string]: unknown }).length >
            0 && (
            <Text color={color}>
              (
              {tool.renderToolUseMessage(param.input as never, {
                verbose,
              })}
              )
            </Text>
          )}
          <Text color={color}>…</Text>
        </Box>
      </Box>
      <Cost costUSD={costUSD} durationMs={durationMs} debug={debug} />
    </Box>
  )
}
