/**
 * Unified logic error hierarchy.
 *
 * TypeScript port of ipfs_datasets_py/logic/common/errors.py.
 */

export type LogicErrorContext = Record<string, unknown>;

export class LogicError extends Error {
  readonly context: LogicErrorContext;

  constructor(message: string, context: LogicErrorContext = {}) {
    super(message);
    this.name = 'LogicError';
    this.context = { ...context };
  }

  toString(): string {
    const entries = Object.entries(this.context).filter(([, value]) => value !== undefined);
    if (entries.length === 0) return this.message;
    const rendered = entries.map(([key, value]) => `${key}=${String(value)}`).join(', ');
    return `${this.message} (Context: ${rendered})`;
  }

  toDict(): Record<string, unknown> {
    return {
      error_type: this.name,
      message: this.message,
      context: { ...this.context },
    };
  }
}

export class ConversionError extends LogicError {
  constructor(message: string, context: LogicErrorContext = {}) {
    super(message, context);
    this.name = 'ConversionError';
  }
}

export class ValidationError extends LogicError {
  constructor(message: string, context: LogicErrorContext = {}) {
    super(message, context);
    this.name = 'ValidationError';
  }
}

export class ProofError extends LogicError {
  constructor(message: string, context: LogicErrorContext = {}) {
    super(message, context);
    this.name = 'ProofError';
  }
}

export class TranslationError extends LogicError {
  constructor(message: string, context: LogicErrorContext = {}) {
    super(message, context);
    this.name = 'TranslationError';
  }
}

export class BridgeError extends LogicError {
  constructor(message: string, context: LogicErrorContext = {}) {
    super(message, context);
    this.name = 'BridgeError';
  }
}

export class ConfigurationError extends LogicError {
  constructor(message: string, context: LogicErrorContext = {}) {
    super(message, context);
    this.name = 'ConfigurationError';
  }
}

export class DeonticError extends LogicError {
  constructor(message: string, context: LogicErrorContext = {}) {
    super(message, context);
    this.name = 'DeonticError';
  }
}

export class ModalError extends LogicError {
  constructor(message: string, context: LogicErrorContext = {}) {
    super(message, context);
    this.name = 'ModalError';
  }
}

export class TemporalError extends LogicError {
  constructor(message: string, context: LogicErrorContext = {}) {
    super(message, context);
    this.name = 'TemporalError';
  }
}

export interface CECErrorOptions {
  context?: LogicErrorContext;
  suggestion?: string | null;
}

export class CECError extends LogicError {
  readonly suggestion: string | null;
  readonly rawMessage: string;

  constructor(message: string, options: CECErrorOptions = {}) {
    const context = options.context ?? {};
    const suggestion = options.suggestion ?? null;
    super(formatCecMessage(message, context, suggestion), context);
    this.name = 'CECError';
    this.rawMessage = message;
    this.suggestion = suggestion;
  }

  override toString(): string {
    return this.message;
  }

  override toDict(): Record<string, unknown> {
    return {
      ...super.toDict(),
      raw_message: this.rawMessage,
      suggestion: this.suggestion,
    };
  }
}

export class ParsingError extends CECError {
  constructor(message: string, options: {
    expression?: string | null;
    position?: number | null;
    expected?: string | null;
    suggestion?: string | null;
  } = {}) {
    super(message, {
      context: compactContext({
        expression: options.expression,
        position: options.position,
        expected: options.expected,
      }),
      suggestion: options.suggestion,
    });
    this.name = 'ParsingError';
  }
}

export class ProvingError extends CECError {
  constructor(message: string, options: {
    formula?: string | null;
    proofStep?: number | null;
    proof_step?: number | null;
    rule?: string | null;
    suggestion?: string | null;
  } = {}) {
    super(message, {
      context: compactContext({
        formula: options.formula,
        proof_step: options.proof_step ?? options.proofStep,
        rule: options.rule,
      }),
      suggestion: options.suggestion,
    });
    this.name = 'ProvingError';
  }
}

export class CECConversionError extends CECError {
  constructor(message: string, options: {
    text?: string | null;
    language?: string;
    pattern?: string | null;
    suggestion?: string | null;
  } = {}) {
    super(message, {
      context: compactContext({
        language: options.language ?? 'en',
        text: options.text,
        pattern: options.pattern,
      }),
      suggestion: options.suggestion,
    });
    this.name = 'ConversionError';
  }
}

export class CECValidationError extends CECError {
  constructor(message: string, options: {
    value?: unknown;
    expectedType?: string | null;
    expected_type?: string | null;
    constraint?: string | null;
    suggestion?: string | null;
  } = {}) {
    super(message, {
      context: compactContext({
        value: options.value === undefined || options.value === null ? undefined : String(options.value),
        expected_type: options.expected_type ?? options.expectedType,
        constraint: options.constraint,
      }),
      suggestion: options.suggestion,
    });
    this.name = 'ValidationError';
  }
}

export class NamespaceError extends CECError {
  constructor(message: string, options: {
    symbol?: string | null;
    operation?: string | null;
    suggestion?: string | null;
  } = {}) {
    super(message, {
      context: compactContext({
        symbol: options.symbol,
        operation: options.operation,
      }),
      suggestion: options.suggestion,
    });
    this.name = 'NamespaceError';
  }
}

export class GrammarError extends CECError {
  constructor(message: string, options: {
    rule?: string | null;
    inputText?: string | null;
    input_text?: string | null;
    suggestion?: string | null;
  } = {}) {
    super(message, {
      context: compactContext({
        rule: options.rule,
        input_text: options.input_text ?? options.inputText,
      }),
      suggestion: options.suggestion,
    });
    this.name = 'GrammarError';
  }
}

export class KnowledgeBaseError extends CECError {
  constructor(message: string, options: {
    operation?: string | null;
    formulaId?: string | null;
    formula_id?: string | null;
    suggestion?: string | null;
  } = {}) {
    super(message, {
      context: compactContext({
        operation: options.operation,
        formula_id: options.formula_id ?? options.formulaId,
      }),
      suggestion: options.suggestion,
    });
    this.name = 'KnowledgeBaseError';
  }
}

export const DCECError = CECError;
export const DCECParsingError = ParsingError;

export function isLogicError(error: unknown): error is LogicError {
  return error instanceof LogicError;
}

function formatCecMessage(
  message: string,
  context: LogicErrorContext,
  suggestion: string | null,
): string {
  let fullMessage = message;
  const entries = Object.entries(context).filter(([, value]) => value !== undefined);
  if (entries.length > 0) {
    fullMessage += ` [Context: ${entries.map(([key, value]) => `${key}=${String(value)}`).join(', ')}]`;
  }
  if (suggestion) {
    fullMessage += ` [Suggestion: ${suggestion}]`;
  }
  return fullMessage;
}

function compactContext(values: LogicErrorContext): LogicErrorContext {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== null),
  );
}
