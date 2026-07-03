import { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { Box } from 'ink.js.js.js.js.js'
import * as React from 'react.js.js.js.js.js'
import { Tool } from '../../../Tool.js.js.js.js.js.js.js.js.js.js'
import { Message, UserMessage } from '../../../query.js.js.js.js.js.js.js.js.js.js'
import { useGetToolFromMessages } from './utils.js.js.js.js.js.js.js.js.js.js'

type Props = {
  param: ToolResultBlockParam
  message: UserMessage
  messages: Message[]
  verbose: boolean
  tools: Tool[]
  width: number | string
}

export function UserToolSuccessMessage({
  param,
  message,
  messages,
  tools,
  verbose,
  width,
}: Props): React.ReactNode {
  const { tool } = useGetToolFromMessages(param.tool_use_id, tools, messages)

  return (
    // UserToolResultMessage wraps the tool-specific rendered output in a column Box.
    // It is distinct from UserMessage (which holds the raw user text).
    <Box flexDirection="column" width={width}>
      {tool.renderToolResultMessage?.(message.toolUseResult!.data as never, {
        verbose,
      })}
    </Box>
  )
}
