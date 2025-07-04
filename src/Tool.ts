import { z, ZodType } from 'zod';
import { ToolOutput, ToolExecutionContext } from './types/ai.js';

export interface Tool<T extends ZodType = ZodType> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: T;
  prompt: (options: { dangerouslySkipPermissions: boolean }) => Promise<string>;
  execute(input: z.infer<T>, context: ToolExecutionContext): Promise<ToolOutput>;
}

export interface ValidationResult {
  result: boolean;
  message?: string;
}
