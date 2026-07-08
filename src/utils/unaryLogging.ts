import { logEvent } from '../services/statsig.js'

export type CompletionType =
  | 'str_replace_single'
  | 'write_file_single'
  | 'tool_use_single'

type LogEvent = {
  completion_type: CompletionType
  event: 'accept' | 'reject' | 'response'
  metadata: {
    language_name: string
    message_id: string
    platform: string
  }
}

export function logUnaryEvent(event: LogEvent): void {
  logEvent('tengu_unary_event', {
    event: event.event,
    completion_type: event.completion_type,
    language_name: event.metadata.language_name,
    message_id: event.metadata.message_id,
    platform: event.metadata.platform,
  })
}
