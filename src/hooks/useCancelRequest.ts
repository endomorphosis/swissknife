import { useInput } from 'ink.js'
import { ToolUseConfirm } from '../components/permissions/PermissionRequest.js'
import { logEvent } from '../services/statsig.js'
import { BinaryFeedbackContext } from '../screens/REPL.js'
import type { SetToolJSXFn } from '../Tool.js'

export function useCancelRequest(
  setToolJSX: SetToolJSXFn,
  setToolUseConfirm: (toolUseConfirm: ToolUseConfirm | null) => void,
  setBinaryFeedbackContext: (bfContext: BinaryFeedbackContext | null) => void,
  onCancel: () => void,
  isLoading: boolean,
  isMessageSelectorVisible: boolean,
  abortSignal?: AbortSignal,
) {
  useInput((_, key) => {
    if (!key.escape) {
      return
    }
    if (abortSignal?.aborted) {
      return
    }
    if (!abortSignal) {
      return
    }
    if (!isLoading) {
      return
    }
    if (isMessageSelectorVisible) {
      // Esc closes the message selector
      return
    }
    logEvent('tengu_cancel', {})
    setToolJSX(null)
    setToolUseConfirm(null)
    setBinaryFeedbackContext(null)
    onCancel()
  })
}
