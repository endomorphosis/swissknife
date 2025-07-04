import type { MessageParam } from '@anthropic-ai/sdk/resources/index.mjs';
import type { Tool } from '../Tool'; // Removed ToolUseContext
import type { Message } from '../query';

/**
 * Defines the structure for a command-line option.
 */
export interface CommandOption {
  name: string; // e.g., 'verbose'
  alias?: string; // e.g., 'v'
  type: 'string' | 'boolean' | 'number';
  description: string;
  required?: boolean;
  default?: string | boolean | number;
}

/**
 * Base interface for all command types.
 */
interface CommandBase {
  name: string;
  description: string;
  aliases?: string[];
  options?: CommandOption[];
  subcommands?: Command[]; // Recursive definition for subcommands
  isEnabled?: boolean; // Optional: defaults to true if not specified
  isHidden?: boolean; // Optional: defaults to false if not specified
  userFacingName(): string; // Function to get the primary name for display
}

/**
 * Command type for executing prompts against an AI model.
 */
export interface PromptCommand extends CommandBase {
  type: 'prompt';
  progressMessage: string;
  argNames?: string[];
  getPromptForCommand(args: string): Promise<MessageParam[]>;
}

/**
 * Command type for executing local TypeScript functions.
 */
export interface LocalCommand extends CommandBase {
  type: 'local';
  // Define a more specific context type if possible
  handler(
    args: Record<string, any>, // Parsed arguments based on options
    context: {
      options: {
        commands: Command[];
        tools: Tool[];
        slowAndCapableModel: string;
      };
      abortController: AbortController;
      setForkConvoWithMessagesOnTheNextRender: (
        forkConvoWithMessages: Message[],
      ) => void;
    },
  ): Promise<string | number>; // Allow returning exit code or string output
}

/**
 * Command type for rendering local JSX components (e.g., using Ink).
 */
export interface LocalJSXCommand extends CommandBase {
  type: 'local-jsx';
  // Define a more specific context type if possible
  handler(
    args: Record<string, any>, // Parsed arguments based on options
    onDone: (result?: string) => void,
    context: { // Removed ToolUseContext &
      setForkConvoWithMessagesOnTheNextRender: (
        forkConvoWithMessages: Message[],
      ) => void;
    },
  ): Promise<React.ReactNode>;
}

/**
 * Union type representing all possible command structures.
 */
export type Command = PromptCommand | LocalCommand | LocalJSXCommand;
