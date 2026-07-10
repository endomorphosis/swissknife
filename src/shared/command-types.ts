import type { MessageParam } from '@anthropic-ai/sdk/resources/index.mjs';

export interface PromptCommand {
  type: 'prompt';
  name: string;
  description: string;
  aliases?: string[];
  isEnabled?: boolean;
  isHidden?: boolean;
  progressMessage: string;
  argNames?: string[];
  userFacingName(): string;
  getPromptForCommand(args: string): Promise<MessageParam[]>;
}

export type Command = PromptCommand;
