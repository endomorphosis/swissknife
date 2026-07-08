/**
 * TDFOL Exception Hierarchy — comprehensive error types for the TDFOL prover stack.
 *
 * Mirrors ipfs_datasets_py/logic/TDFOL/exceptions.py (684 lines):
 *   TDFOLError → ParseError → ProofError → ProofTimeoutError / ProofNotFoundError / ZKPProofError
 *                            ConversionError / InferenceError / NLProcessingError → PatternMatchError
 *                            CacheError
 *
 * Sprint 22, T-112.
 * Reference: ipfs_datasets_py/logic/TDFOL/exceptions.py
 */

import { LogicError } from './logic-errors.js';

// ---------------------------------------------------------------------------
// TDFOLError — base
// ---------------------------------------------------------------------------

export class TDFOLError extends LogicError {
  readonly suggestion?: string;

  constructor(message: string, suggestion?: string, context: Record<string, unknown> = {}) {
    super(suggestion ? `${message}\nSuggestion: ${suggestion}` : message, context);
    this.name       = 'TDFOLError';
    this.suggestion = suggestion;
  }

  toDict(): Record<string, unknown> {
    return {
      error_type:  this.name,
      message:     this.message,
      suggestion:  this.suggestion ?? null,
      context:     this.context,
    };
  }
}

// ---------------------------------------------------------------------------
// ParseError
// ---------------------------------------------------------------------------

export class ParseError extends TDFOLError {
  readonly formula:   string;
  readonly line?:     number;
  readonly column?:   number;
  readonly position?: number;

  constructor(opts: {
    message: string;
    formula?: string;
    line?: number;
    column?: number;
    position?: number;
    suggestion?: string;
    context?: Record<string, unknown>;
  }) {
    super(opts.message, opts.suggestion, {
      formula: opts.formula ?? '',
      line:    opts.line,
      column:  opts.column,
      position: opts.position,
      ...opts.context,
    });
    this.name     = 'ParseError';
    this.formula  = opts.formula ?? '';
    this.line     = opts.line;
    this.column   = opts.column;
    this.position = opts.position;
  }
}

// ---------------------------------------------------------------------------
// ProofError and subclasses
// ---------------------------------------------------------------------------

export class ProofError extends TDFOLError {
  readonly formula:      string;
  readonly proof_status: string;

  constructor(message: string, opts: { formula?: string; proofStatus?: string; suggestion?: string; context?: Record<string, unknown> } = {}) {
    super(message, opts.suggestion, { formula: opts.formula ?? '', proof_status: opts.proofStatus ?? 'failed', ...opts.context });
    this.name         = 'ProofError';
    this.formula      = opts.formula ?? '';
    this.proof_status = opts.proofStatus ?? 'failed';
  }
}

export class ProofTimeoutError extends ProofError {
  readonly timeout_ms: number;

  constructor(message: string, opts: { formula?: string; timeoutMs?: number; suggestion?: string } = {}) {
    super(message, { formula: opts.formula, proofStatus: 'timeout', suggestion: opts.suggestion });
    this.name       = 'ProofTimeoutError';
    this.timeout_ms = opts.timeoutMs ?? 0;
  }
}

export class ProofNotFoundError extends ProofError {
  constructor(message: string, opts: { formula?: string; suggestion?: string } = {}) {
    super(message, { formula: opts.formula, proofStatus: 'not_found', suggestion: opts.suggestion ?? 'Try a different prover strategy or increase the saturation depth.' });
    this.name = 'ProofNotFoundError';
  }
}

export class ZKPProofError extends ProofError {
  readonly zkp_backend: string;

  constructor(message: string, opts: { formula?: string; zkpBackend?: string; suggestion?: string } = {}) {
    super(message, { formula: opts.formula, proofStatus: 'zkp_failed', suggestion: opts.suggestion ?? 'Check that the ZKP backend (lurk/ix) is installed and has sufficient memory.' });
    this.name        = 'ZKPProofError';
    this.zkp_backend = opts.zkpBackend ?? 'unknown';
  }
}

// ---------------------------------------------------------------------------
// ConversionError
// ---------------------------------------------------------------------------

export class ConversionError extends TDFOLError {
  readonly source_format: string;
  readonly target_format: string;

  constructor(message: string, opts: { sourceFormat?: string; targetFormat?: string; suggestion?: string; context?: Record<string, unknown> } = {}) {
    super(message, opts.suggestion, { source_format: opts.sourceFormat ?? '', target_format: opts.targetFormat ?? '', ...opts.context });
    this.name          = 'ConversionError';
    this.source_format = opts.sourceFormat ?? '';
    this.target_format = opts.targetFormat ?? '';
  }
}

// ---------------------------------------------------------------------------
// InferenceError
// ---------------------------------------------------------------------------

export class InferenceError extends TDFOLError {
  readonly rule_name: string;

  constructor(message: string, opts: { ruleName?: string; suggestion?: string; context?: Record<string, unknown> } = {}) {
    super(message, opts.suggestion, { rule_name: opts.ruleName ?? '', ...opts.context });
    this.name      = 'InferenceError';
    this.rule_name = opts.ruleName ?? '';
  }
}

// ---------------------------------------------------------------------------
// NLProcessingError / PatternMatchError
// ---------------------------------------------------------------------------

export class NLProcessingError extends TDFOLError {
  readonly input_text: string;

  constructor(message: string, opts: { inputText?: string; suggestion?: string; context?: Record<string, unknown> } = {}) {
    super(message, opts.suggestion, { input_text: opts.inputText ?? '', ...opts.context });
    this.name       = 'NLProcessingError';
    this.input_text = opts.inputText ?? '';
  }
}

export class PatternMatchError extends NLProcessingError {
  readonly pattern: string;

  constructor(message: string, opts: { inputText?: string; pattern?: string; suggestion?: string } = {}) {
    super(message, { inputText: opts.inputText, suggestion: opts.suggestion });
    this.name    = 'PatternMatchError';
    this.pattern = opts.pattern ?? '';
  }
}

// ---------------------------------------------------------------------------
// CacheError
// ---------------------------------------------------------------------------

export class CacheError extends TDFOLError {
  readonly cache_key?: string;
  readonly operation:  string;

  constructor(message: string, opts: { cacheKey?: string; operation?: string; suggestion?: string } = {}) {
    super(message, opts.suggestion ?? 'Try clearing the cache with BoundedCache.clear() or resetting the global proof cache.', { cache_key: opts.cacheKey, operation: opts.operation ?? '' });
    this.name      = 'CacheError';
    this.cache_key = opts.cacheKey;
    this.operation = opts.operation ?? '';
  }
}

// ---------------------------------------------------------------------------
// Error factory helpers
// ---------------------------------------------------------------------------

export function isTDFOLError(err: unknown): err is TDFOLError {
  return err instanceof TDFOLError;
}

export function isProofError(err: unknown): err is ProofError {
  return err instanceof ProofError;
}

export function isParseError(err: unknown): err is ParseError {
  return err instanceof ParseError;
}
