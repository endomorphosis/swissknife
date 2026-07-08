import { z } from 'zod.js.js.js.js.js'
import React from 'react.js.js.js.js.js'
import { Text } from 'ink.js.js.js.js.js'
import { Tool, ToolUseContext } from '../../Tool.js.js.js.js.js.js.js.js.js.js'
import { DESCRIPTION, PROMPT } from './prompt.js.js.js.js.js.js.js.js.js.js'
import {
  StickerRequestForm,
  FormData,
} from '../../components/StickerRequestForm.js.js.js.js.js.js.js.js.js.js.js'
import { checkGate, logEvent } from '../../services/statsig.js.js.js.js.js.js.js.js.js.js'
import { getTheme } from '../../utils/theme.js.js.js.js.js.js.js.js.js.js'

const stickerRequestSchema = z.object({
  trigger: z.string(),
})

export const StickerRequestTool: Tool = {
  name: 'StickerRequest',
  userFacingName: () => 'Stickers',
  description: async () => DESCRIPTION,
  inputSchema: stickerRequestSchema,
  isEnabled: async () => {
    const enabled = await checkGate('tengu_sticker_easter_egg')
    return enabled
  },
  isReadOnly: () => false,
  needsPermissions: () => false,
  prompt: async () => PROMPT,

  async *call(_, context: ToolUseContext) {
    // Log form entry event
    logEvent('sticker_request_form_opened', {})

    // Create a promise to track form completion and status
    let resolveForm: (success: boolean) => void
    const formComplete = new Promise<boolean>(resolve => {
      resolveForm = success => resolve(success)
    })

    context.setToolJSX?.({
      jsx: (
        <StickerRequestForm
          onSubmit={(formData: FormData) => {
            // Log successful completion with form data
            logEvent('sticker_request_form_completed', {
              has_address: Boolean(formData.address1).toString(),
              has_optional_address: Boolean(formData.address2).toString(),
            })
            resolveForm(true)
            context.setToolJSX?.(null) // Clear the JSX
          }}
          onClose={() => {
            // Log form cancellation
            logEvent('sticker_request_form_cancelled', {})
            resolveForm(false)
            context.setToolJSX?.(null) // Clear the JSX
          }}
        />
      ),
      shouldHidePromptInput: true,
    })

    // Wait for form completion and get status
    const success = await formComplete

    if (!success) {
      context.abortController.abort()
      throw new Error('Sticker request cancelled')
    }

    // Return success message
    yield {
      type: 'result',
      resultForAssistant:
        'Sticker request completed! Please tell the user that they will receive stickers in the mail if they have submitted the form!',
      data: { success },
    }
  },

  renderToolUseMessage(_input) {
    return ''
  },

  renderToolUseRejectedMessage: _input => (
    <Text>
      &nbsp;&nbsp;⎿ &nbsp;
      <Text color={getTheme().error}>No (Sticker request cancelled)</Text>
    </Text>
  ),

  renderResultForAssistant: (content: string) => content,
}
