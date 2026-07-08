import type { Command, LocalCommand } from '../types/command.js'; // Updated import path
import { getContext } from '../context.js';
import { getMessagesGetter, getMessagesSetter } from '../messages.js';
import { API_ERROR_MESSAGE_PREFIX, querySonnet } from '../services/claude.js';
import {
  createUserMessage,
  normalizeMessagesForAPI,
} from '../utils/messages.js';
import { getCodeStyle } from '../utils/style.js';
import { clearTerminal } from '../utils/terminal.js';

const compactCommand: LocalCommand = {
  type: 'local',
  name: 'compact',
  description: 'Clear conversation history but keep a summary in context',
  options: [], // No options for this command
  isEnabled: true,
  isHidden: false,
  async handler( // Renamed call to handler, args (_) is unused
    args,
    {
      options: { tools, slowAndCapableModel },
      abortController,
      setForkConvoWithMessagesOnTheNextRender,
    },
  ) {
    // Get existing messages before clearing
    const messages = getMessagesGetter()()

    // Add summary request as a new message
    const summaryRequest = createUserMessage(
      "Provide a detailed but concise summary of our conversation above. Focus on information that would be helpful for continuing the conversation, including what we did, what we're doing, which files we're working on, and what we're going to do next.",
    )

    const summaryResponse = await querySonnet(
      normalizeMessagesForAPI([...messages, summaryRequest]),
      ['You are a helpful AI assistant tasked with summarizing conversations.'],
      0,
      tools,
      abortController.signal,
      {
        dangerouslySkipPermissions: false,
        model: slowAndCapableModel,
        prependCLISysprompt: true,
      },
    )

    // Extract summary from response, throw if we can't get it
    const content = summaryResponse.message.content
    const summary =
      typeof content === 'string'
        ? content
        : content.length > 0 && content[0]?.type === 'text'
          ? content[0].text
          : null

    if (!summary) {
      throw new Error(
        `Failed to generate conversation summary - response did not contain valid text content - ${summaryResponse}`,
      )
    } else if (summary.startsWith(API_ERROR_MESSAGE_PREFIX)) {
      throw new Error(summary)
    }

    // Substitute low token usage info so that the context-size UI warning goes
    // away. The actual numbers don't matter too much: `countTokens` checks the
    // most recent assistant message for usage numbers, so this estimate will
    // be overridden quickly.
    summaryResponse.message.usage = {
      input_tokens: 0,
      output_tokens: summaryResponse.message.usage.output_tokens,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    }

    // Clear screen and messages
    await clearTerminal()
    getMessagesSetter()([])
    setForkConvoWithMessagesOnTheNextRender([
      createUserMessage(
        `Use the /compact command to clear the conversation history, and start a new conversation with the summary in context.`,
      ),
      summaryResponse,
    ])
    getContext.cache.clear?.()
    getCodeStyle.cache.clear?.();

    return 0; // Return 0 for success exit code
  },
  userFacingName() {
    return 'compact'
  },
};

export default compactCommand;
