/**
 * fol-syntax-validator.ts
 *
 * FOL input/output types + syntax validator.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/domain/symbolic_contracts.py
 *
 * Provides:
 *   FOLInput            — validated input for FOL conversion
 *   FOLOutput           — output from FOL conversion
 *   ValidationContext   — validator configuration
 *   ValidationResult    — outcome of syntax validation
 *   FOLSyntaxValidator  — validates and normalises FOL expressions
 *   validateFolInput()  — convenience factory with defaults
 */

// ---------------------------------------------------------------------------
// FOLInput
// ---------------------------------------------------------------------------

export type FOLOutputFormat = 'symbolic' | 'prolog' | 'tptp' | 'json';

export interface FOLInput {
  text: string;
  domainPredicates: string[];
  confidenceThreshold: number;
  outputFormat: FOLOutputFormat;
  reasoningDepth: number;
}

/**
 * Create a FOLInput with sensible defaults.
 * Validates: text non-empty, confidenceThreshold in [0,1], outputFormat valid.
 */
export function validateFolInput(text: string, opts: Partial<Omit<FOLInput, 'text'>> = {}): FOLInput {
  const trimmed = (text ?? '').trim();
  if (!trimmed) throw new Error('FOLInput.text must not be empty');

  const confidence = opts.confidenceThreshold ?? 0.7;
  if (confidence < 0 || confidence > 1) throw new Error('confidenceThreshold must be in [0, 1]');

  const validFormats: FOLOutputFormat[] = ['symbolic', 'prolog', 'tptp', 'json'];
  const format = opts.outputFormat ?? 'symbolic';
  if (!validFormats.includes(format)) throw new Error(`outputFormat must be one of ${validFormats.join(', ')}`);

  return {
    text: trimmed,
    domainPredicates: opts.domainPredicates ?? [],
    confidenceThreshold: confidence,
    outputFormat: format,
    reasoningDepth: Math.max(1, Math.min(opts.reasoningDepth ?? 3, 10)),
  };
}

// ---------------------------------------------------------------------------
// FOLOutput
// ---------------------------------------------------------------------------

export class FOLOutput {
  readonly formula: string;
  readonly confidence: number;
  readonly outputFormat: FOLOutputFormat;
  readonly predicatesUsed: string[];
  readonly errors: string[];

  constructor(opts: {
    formula: string;
    confidence: number;
    outputFormat: FOLOutputFormat;
    predicatesUsed?: string[];
    errors?: string[];
  }) {
    this.formula = opts.formula;
    this.confidence = opts.confidence;
    this.outputFormat = opts.outputFormat;
    this.predicatesUsed = opts.predicatesUsed ?? [];
    this.errors = opts.errors ?? [];
  }

  get isValid(): boolean { return this.errors.length === 0 && this.formula.length > 0; }

  toDict(): Record<string, unknown> {
    return {
      formula: this.formula,
      confidence: this.confidence,
      output_format: this.outputFormat,
      predicates_used: this.predicatesUsed,
      errors: this.errors,
      is_valid: this.isValid,
    };
  }
}

// ---------------------------------------------------------------------------
// ValidationContext
// ---------------------------------------------------------------------------

export interface ValidationContext {
  strictMode: boolean;
  allowedPredicates: string[];
  maxDepth: number;
  allowFreeVariables: boolean;
}

export function makeValidationContext(opts: Partial<ValidationContext> = {}): ValidationContext {
  return {
    strictMode: opts.strictMode ?? false,
    allowedPredicates: opts.allowedPredicates ?? [],
    maxDepth: opts.maxDepth ?? 10,
    allowFreeVariables: opts.allowFreeVariables ?? true,
  };
}

// ---------------------------------------------------------------------------
// ValidationResult
// ---------------------------------------------------------------------------

export interface ValidationResult {
  isValid: boolean;
  normalizedFormula: string;
  errors: string[];
  warnings: string[];
  depth: number;
  freeVariables: string[];
  predicates: string[];
}

// ---------------------------------------------------------------------------
// FOLSyntaxValidator
// ---------------------------------------------------------------------------

export class FOLSyntaxValidator {
  private context: ValidationContext;

  constructor(context: ValidationContext = makeValidationContext()) {
    this.context = context;
  }

  /**
   * Validate and normalise a FOL formula string.
   */
  validate(formula: string, context?: ValidationContext): ValidationResult {
    const ctx = context ?? this.context;
    const trimmed = (formula ?? '').trim();
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!trimmed) {
      return { isValid: false, normalizedFormula: '', errors: ['Empty formula'], warnings: [], depth: 0, freeVariables: [], predicates: [] };
    }

    // Check parenthesis balance
    let depth = 0;
    let maxDepth = 0;
    for (const ch of trimmed) {
      if (ch === '(') { depth++; maxDepth = Math.max(maxDepth, depth); }
      else if (ch === ')') depth--;
      if (depth < 0) { errors.push('Unbalanced parentheses: unexpected )'); break; }
    }
    if (depth !== 0) errors.push(`Unbalanced parentheses: ${depth} unclosed`);

    if (maxDepth > ctx.maxDepth) {
      const msg = `Formula depth ${maxDepth} exceeds max ${ctx.maxDepth}`;
      if (ctx.strictMode) errors.push(msg); else warnings.push(msg);
    }

    // Extract predicates (capitalized identifiers)
    const predicates = [...new Set(trimmed.match(/\b[A-Z][a-zA-Z0-9_]+/g) ?? [])];

    if (ctx.allowedPredicates.length > 0) {
      for (const p of predicates) {
        if (!ctx.allowedPredicates.includes(p)) {
          const msg = `Unknown predicate: ${p}`;
          if (ctx.strictMode) errors.push(msg); else warnings.push(msg);
        }
      }
    }

    // Extract free variables (single lowercase letters not bound by ∀/∃)
    const allVars = [...new Set(trimmed.match(/\b[a-z]\b/g) ?? [])];
    const boundVars = [...(trimmed.match(/[∀∃]\s*([a-z])/g) ?? [])].map(m => m.slice(-1));
    const freeVariables = allVars.filter(v => !boundVars.includes(v));

    if (freeVariables.length > 0 && !ctx.allowFreeVariables) {
      const msg = `Free variables not allowed: ${freeVariables.join(', ')}`;
      if (ctx.strictMode) errors.push(msg); else warnings.push(msg);
    }

    // Normalize: collapse multiple spaces
    const normalizedFormula = errors.length === 0
      ? trimmed.replace(/\s+/g, ' ')
      : trimmed;

    return {
      isValid: errors.length === 0,
      normalizedFormula,
      errors,
      warnings,
      depth: maxDepth,
      freeVariables,
      predicates,
    };
  }

  /**
   * Validate a FOLInput and produce a FOLOutput.
   */
  convert(input: FOLInput): FOLOutput {
    const result = this.validate(input.text);
    if (!result.isValid) {
      return new FOLOutput({
        formula: '', confidence: 0,
        outputFormat: input.outputFormat,
        predicatesUsed: [], errors: result.errors,
      });
    }

    // Simple format conversion
    let formula = result.normalizedFormula;
    switch (input.outputFormat) {
      case 'prolog':
        formula = formula
          .replace(/∧/g, ',').replace(/∨/g, ';').replace(/¬/g, '\\+')
          .replace(/→/g, ':-').replace(/∀([a-z])\./g, (_, v) => `${v} `)
          .replace(/∃([a-z])\./g, (_, v) => `${v} `);
        break;
      case 'tptp':
        formula = `fof(formula, conjecture, ${formula.replace(/∧/g, '&').replace(/∨/g, '|').replace(/¬/g, '~').replace(/→/g, '=>').replace(/∀([a-z])\./g, (_, v) => `![${v.toUpperCase()}]:`)}).`;
        break;
      case 'json':
        formula = JSON.stringify({ formula: result.normalizedFormula, predicates: result.predicates });
        break;
    }

    return new FOLOutput({
      formula,
      confidence: input.confidenceThreshold,
      outputFormat: input.outputFormat,
      predicatesUsed: result.predicates.filter(p =>
        input.domainPredicates.length === 0 || input.domainPredicates.includes(p)
      ),
    });
  }
}
