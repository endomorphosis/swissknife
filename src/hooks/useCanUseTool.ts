import { useCallback } from 'react'
import { hasPermissionsToUseTool } from '../permissions'
import { logEvent } from '../services/statsig'
import { BashTool, inputSchema } from '../tools/BashTool/BashTool'
import { getCommandSubcommandPrefix } from '../utils/commands'
import { REJECT_MESSAGE } from '../utils/messages'
import type { Tool as ToolType, ToolUseContext } from '../Tool'
import { AssistantMessage } from '../query'
import { ToolUseConfirm } from '../components/permissions/PermissionRequest'
import { AbortError } from '../utils/errors'
import { logError } from '../utils/log'

type SetState<T> = React.Dispatch<React.SetStateAction<T>>

export type CanUseToolFn = (
  tool: ToolType,
  input: { [key: string]: unknown },
  toolUseContext: ToolUseContext,
  assistantMessage: AssistantMessage,
) => Promise<{ result: true } | { result: false; message: string }>

function useCanUseTool(
  setToolUseConfirm: SetState<ToolUseConfirm | null>,
): CanUseToolFn {
  return useCallback<CanUseToolFn>(
    async (tool, input, toolUseContext, assistantMessage) => {
      return new Promise(resolve => {
        function logCancelledEvent() {
          logEvent('tengu_tool_use_cancelled', {
            messageID: assistantMessage.message.id,
            toolName: tool.name,
          })
        }

        function resolveWithCancelledAndAbortAllToolCalls() {
          resolve({
            result: false,
            message: REJECT_MESSAGE,
          })
          // Trigger a synthetic assistant message in query(), to cancel
          // any other pending tool uses and stop further requests to the
          // API and wait for user input.
          toolUseContext.abortController.abort()
        }

        if (toolUseContext.abortController.signal.aborted) {
          logCancelledEvent()
          resolveWithCancelledAndAbortAllToolCalls()
          return
        }

        return hasPermissionsToUseTool(
          tool,
          input,
          toolUseContext,
          assistantMessage,
        )
          .then(async result => {
            // Has permissions to use tool, granted in config
            if (result.result) {
              logEvent('tengu_tool_use_granted_in_config', {
                messageID: assistantMessage.message.id,
                toolName: tool.name,
              })
              resolve({ result: true })
              return
            }

            const [description, commandPrefix] = await Promise.all([
              tool.description(input as never),
              tool === BashTool
                ? getCommandSubcommandPrefix(
                    inputSchema.parse(input).command, // already validated upstream, so ok to parse (as opposed to safeParse)
                    toolUseContext.abortController.signal,
                  )
                : Promise.resolve(null),
            ])

            if (toolUseContext.abortController.signal.aborted) {
              logCancelledEvent()
              resolveWithCancelledAndAbortAllToolCalls()
              return
            }

            // Does not have permissions to use tool, ask the user
            setToolUseConfirm({
              assistantMessage,
              tool,
              description,
              input,
              commandPrefix,
              riskScore: null,
              onAbort() {
                logCancelledEvent()
                logEvent('tengu_tool_use_rejected_in_prompt', {
                  messageID: assistantMessage.message.id,
                  toolName: tool.name,
                })
                resolveWithCancelledAndAbortAllToolCalls()
              },
              onAllow(type) {
                if (type === 'permanent') {
                  logEvent('tengu_tool_use_granted_in_prompt_permanent', {
                    messageID: assistantMessage.message.id,
                    toolName: tool.name,
                  })
                } else {
                  logEvent('tengu_tool_use_granted_in_prompt_temporary', {
                    messageID: assistantMessage.message.id,
                    toolName: tool.name,
                  })
                }
                resolve({ result: true })
              },
              onReject() {
                logEvent('tengu_tool_use_rejected_in_prompt', {
                  messageID: assistantMessage.message.id,
                  toolName: tool.name,
                })
                resolveWithCancelledAndAbortAllToolCalls()
              },
            })
          })
          .catch(error => {
            if (error instanceof AbortError) {
              logCancelledEvent()
              resolveWithCancelledAndAbortAllToolCalls()
            } else {
              logError(error)
            }
          })
      })
    },
    [setToolUseConfirm],
  )
}

export default useCanUseTool
