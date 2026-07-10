import type {
  Message as APIAssistantMessage,
  MessageParam,
} from '@anthropic-ai/sdk/resources/index.mjs';

export type UserMessage = {
  message: MessageParam;
  type: 'user';
  uuid: string;
  toolUseResult?: unknown;
};

export type AssistantMessage = {
  costUSD: number;
  durationMs: number;
  message: APIAssistantMessage;
  type: 'assistant';
  uuid: string;
  isApiErrorMessage?: boolean;
};
