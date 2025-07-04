// src/ai/tools/tool.ts

/**
 * This file re-exports the canonical Tool-related interfaces from `../../types/ai.js`.
 * The primary definition of these interfaces, especially the Zod-based Tool interface,
 * resides in `../../types/ai.js`.
 * 
 * Concrete tool implementations should conform to these interfaces.
 */

export { 
    Tool, 
    ToolInput, 
    ToolOutput, 
    ToolExecutionContext,
    // Re-exporting ZodType for convenience if tools define schemas here, though not strictly necessary
    // ZodType as _ZodType // Example if needed, but usually imported directly from 'zod' by implementers
} from '../types/ai';

// The old Phase 2 ToolParameter interface is no longer used as primary definition,
// as parameters are now defined by a Zod schema in the Tool interface.
// It's kept here for reference or if any old code might still refer to it,
// but new tools should use Zod schemas.
/** @deprecated Use Zod inputSchema in the Tool interface instead. */
export interface OldToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  default?: any;
}

// Example of how a base class for tools might look (optional)
/*
import { z, ZodType } from 'zod';
import { Tool as ITool, ToolInput, ToolOutput, ToolExecutionContext } from '../types/ai';

export abstract class BaseTool<T extends ZodType> implements ITool<T> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: T;

  abstract execute(input: ToolInput<T>, context: ToolExecutionContext): Promise<ToolOutput>;
}
*/
