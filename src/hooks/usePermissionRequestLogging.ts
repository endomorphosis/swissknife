import { useEffect } from 'react'
import { logEvent } from '../services/statsig'
import { logUnaryEvent, CompletionType } from '../utils/unaryLogging'
import { ToolUseConfirm } from '../components/permissions/PermissionRequest'
import { env } from '../utils/env'

export type UnaryEvent = {
  completion_type: CompletionType
  language_name: string | Promise<string>
}

/**
 * Logs permission request events using Statsig and unary logging.
 * Handles both the Statsig event and the unary event logging.
 * Can handle either a string or Promise<string> for language_name.
 */
export function usePermissionRequestLogging(
  toolUseConfirm: ToolUseConfirm,
  unaryEvent: UnaryEvent,
): void {
  useEffect(() => {
    // Log Statsig event
    logEvent('tengu_tool_use_show_permission_request', {
      messageID: toolUseConfirm.assistantMessage.message.id,
      toolName: toolUseConfirm.tool.name,
    })

    // Handle string or Promise language name
    const languagePromise = Promise.resolve(unaryEvent.language_name)

    // Log unary event once language is resolved
    languagePromise.then(language => {
      logUnaryEvent({
        completion_type: unaryEvent.completion_type,
        event: 'response',
        metadata: {
          language_name: language,
          message_id: toolUseConfirm.assistantMessage.message.id,
          platform: env.platform,
        },
      })
    })
  }, [toolUseConfirm, unaryEvent])
}
