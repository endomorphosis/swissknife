/**
 * TDFOL / FOL / Deontic Multi-converter — T-219 / T-220 / T-221 (Sprint 49)
 *
 * Ports of:
 *   - ipfs_datasets_py/logic/TDFOL/tdfol_converter.py  (528L)
 *   - ipfs_datasets_py/logic/deontic/converter.py       (612L)
 *   - ipfs_datasets_py/logic/fol/converter.py           (497L)
 *
 * Provides string-based inter-logic converters:
 *   TDFOLToDCECConverter, DCECToTDFOLConverter, TDFOLToFOLConverter,
 *   TDFOLToTPTPConverter (+ module-level fns);
 *   DeonticConverter; FOLConverter.
 */

// ---------------------------------------------------------------------------
// Shared result type
// ---------------------------------------------------------------------------

export interface ConversionResult {
  /** Output formula string. */
  output: string;
  /** Confidence in [0, 1]. */
  confidence: number;
  /** Any conversion warnings / errors. */
  errors: string[];
  /** Metadata. */
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Simple in-memory cache
// ---------------------------------------------------------------------------

class ConversionCache {
  private store = new Map<string, ConversionResult>();
  constructor(private readonly maxSize: number) {}

  get(key: string): ConversionResult | undefined { return this.store.get(key); }
  set(key: string, r: ConversionResult): void {
    if (this.store.size >= this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(key, r);
  }
  clear(): void { this.store.clear(); }
  get size(): number { return this.store.size; }
}

// ---------------------------------------------------------------------------
// T-220 — TDFOLToDCECConverter
// ---------------------------------------------------------------------------

/**
 * Convert TDFOL formula strings to DCEC format.
 *
 * TypeScript port of `TDFOLToDCECConverter` from
 * `ipfs_datasets_py/logic/TDFOL/tdfol_converter.py`.
 */
export class TDFOLToDCECConverter {
  convert(formula: string): string {
    // Apply operator keyword replacements (TDFOL → DCEC)
    return formula
      .replace(/\bO\(/g, '(obligated ')
      .replace(/\bP\(/g, '(permitted ')
      .replace(/\bF\(/g, '(forbidden ')
      .replace(/□/g, '(always ')
      .replace(/◊/g, '(eventually ')
      .replace(/∀/g, '(forall ')
      .replace(/∃/g, '(exists ')
      .replace(/∧/g, ' and ')
      .replace(/∨/g, ' or ')
      .replace(/¬/g, 'not ')
      .replace(/→/g, ' implies ')
      .trim();
  }
}

// ---------------------------------------------------------------------------
// DCECToTDFOLConverter
// ---------------------------------------------------------------------------

/**
 * Convert DCEC formula strings back to TDFOL operator notation.
 *
 * TypeScript port of `DCECToTDFOLConverter` from `tdfol_converter.py`.
 */
export class DCECToTDFOLConverter {
  convert(dcec: string): string {
    return dcec
      .replace(/\(obligated\s+/gi, 'O(')
      .replace(/\(permitted\s+/gi, 'P(')
      .replace(/\(forbidden\s+/gi, 'F(')
      .replace(/\(always\s+/gi, '□(')
      .replace(/\(eventually\s+/gi, '◊(')
      .replace(/\(forall\s+/gi, '∀(')
      .replace(/\(exists\s+/gi, '∃(')
      .replace(/\band\b/gi, '∧')
      .replace(/\bor\b/gi, '∨')
      .replace(/\bnot\b/gi, '¬')
      .replace(/\bimplies\b/gi, '→')
      .trim();
  }
}

// ---------------------------------------------------------------------------
// TDFOLToFOLConverter
// ---------------------------------------------------------------------------

/**
 * Strip modalities from a TDFOL formula to produce plain FOL.
 *
 * TypeScript port of `TDFOLToFOLConverter` from `tdfol_converter.py`.
 */
export class TDFOLToFOLConverter {
  convert(formula: string): string {
    // Remove modal wrappers, keeping inner formula
    return formula
      .replace(/□\(([^)]+)\)/g, '$1')    // □(φ) → φ
      .replace(/□([^\s(]+)/g, '$1')      // □φ (no paren) → φ
      .replace(/◊\(([^)]+)\)/g, '$1')   // ◊(φ) → φ
      .replace(/◊([^\s(]+)/g, '$1')     // ◊φ → φ
      .replace(/\bO\(([^)]+)\)/g, '$1')  // O(φ) → φ
      .replace(/\bP\(([^)]+)\)/g, '$1')  // P(φ) → φ
      .replace(/\bF\(([^)]+)\)/g, '¬($1)') // F(φ) → ¬φ
      .trim();
  }
}

// ---------------------------------------------------------------------------
// TDFOLToTPTPConverter
// ---------------------------------------------------------------------------

/**
 * Convert a TDFOL formula string to TPTP syntax for ATP systems.
 *
 * TypeScript port of `TDFOLToTPTPConverter` from `tdfol_converter.py`.
 */
export class TDFOLToTPTPConverter {
  convert(formula: string, name = 'conjecture'): string {
    const tptp = formula
      .replace(/∀\s*(\w+)\s*\./g, '! [$1] :')
      .replace(/∃\s*(\w+)\s*\./g, '? [$1] :')
      .replace(/∧/g, ' & ')
      .replace(/∨/g, ' | ')
      .replace(/¬/g, '~')
      .replace(/→/g, ' => ')
      .replace(/↔/g, ' <=> ')
      .replace(/□/g, 'box')
      .replace(/◊/g, 'dia')
      .trim();
    return `fof(${name}, conjecture, (${tptp})).`;
  }
}

// ---------------------------------------------------------------------------
// Module-level convenience functions
// ---------------------------------------------------------------------------

/** Convert a TDFOL formula string to DCEC. */
export function tdfolToDcec(formula: string): string {
  return new TDFOLToDCECConverter().convert(formula);
}

/** Convert a DCEC formula string to TDFOL. */
export function dcecToTdfol(dcec: string): string {
  return new DCECToTDFOLConverter().convert(dcec);
}

/** Convert a TDFOL formula string to plain FOL (strips modalities). */
export function tdfolToFol(formula: string): string {
  return new TDFOLToFOLConverter().convert(formula);
}

/** Convert a TDFOL formula string to TPTP syntax. */
export function tdfolToTptp(formula: string, name = 'conjecture'): string {
  return new TDFOLToTPTPConverter().convert(formula, name);
}

// ---------------------------------------------------------------------------
// T-219 — DeonticConverter
// ---------------------------------------------------------------------------

export interface DeonticConverterStats {
  totalConverted: number;
  cacheHits: number;
  errors: number;
  avgConfidence: number;
}

/**
 * Deontic NL → deontic formula converter.
 *
 * TypeScript port of `DeonticConverter` from
 * `ipfs_datasets_py/logic/deontic/converter.py`.
 */
export class DeonticConverter {
  private readonly cache: ConversionCache | null;
  private readonly confidenceThreshold: number;
  private readonly stats: DeonticConverterStats = { totalConverted: 0, cacheHits: 0, errors: 0, avgConfidence: 0 };

  constructor(opts: { useCache?: boolean; cacheMaxsize?: number; confidenceThreshold?: number } = {}) {
    this.cache = (opts.useCache ?? true) ? new ConversionCache(opts.cacheMaxsize ?? 1000) : null;
    this.confidenceThreshold = opts.confidenceThreshold ?? 0.7;
  }

  /**
   * Convert natural-language text to a deontic formula string.
   */
  convert(text: string): ConversionResult {
    const cached = this.cache?.get(text);
    if (cached) { this.stats.cacheHits++; return cached; }

    try {
      const { output, confidence } = this._convert(text);
      const result: ConversionResult = { output, confidence, errors: [], metadata: { source: text } };
      this._updateStats(confidence);
      this.cache?.set(text, result);
      return result;
    } catch (err) {
      this.stats.errors++;
      return { output: '', confidence: 0, errors: [String(err)], metadata: {} };
    }
  }

  /** Convert a batch of texts. */
  convertBatch(texts: string[]): ConversionResult[] {
    return texts.map(t => this.convert(t));
  }

  getStats(): Readonly<DeonticConverterStats> {
    return { ...this.stats };
  }

  // -------------------------------------------------------------------------

  private _convert(text: string): { output: string; confidence: number } {
    const lower = text.toLowerCase();

    // Prohibition FIRST (must not / shall not override must / may)
    const prohibMatch = lower.match(/(\w+(?:\s+\w+)?)\s+(?:must not|shall not|is forbidden to|is prohibited from)\s+(.+)/);
    if (prohibMatch) return { output: `F(${prohibMatch[2].trim()})`, confidence: 0.85 };

    // Obligation
    const oblMatch = lower.match(/(\w+(?:\s+\w+)?)\s+(?:must|shall|should|is required to)\s+(.+)/);
    if (oblMatch) return { output: `O(${oblMatch[2].trim()})`, confidence: 0.85 };

    // Permission
    const permMatch = lower.match(/(\w+(?:\s+\w+)?)\s+(?:may|can|is allowed to|is permitted to)\s+(.+)/);
    if (permMatch) return { output: `P(${permMatch[2].trim()})`, confidence: 0.80 };

    // Generic fallback
    return { output: `deontic(${text.trim()})`, confidence: 0.30 };
  }

  private _updateStats(confidence: number): void {
    this.stats.totalConverted++;
    this.stats.avgConfidence =
      (this.stats.avgConfidence * (this.stats.totalConverted - 1) + confidence) / this.stats.totalConverted;
  }
}

// ---------------------------------------------------------------------------
// T-221 — FOLConverter
// ---------------------------------------------------------------------------

export interface FOLConverterStats {
  totalConverted: number;
  cacheHits: number;
  errors: number;
}

/**
 * FOL (First-Order Logic) NL → formula converter.
 *
 * TypeScript port of `FOLConverter` from
 * `ipfs_datasets_py/logic/fol/converter.py`.
 */
export class FOLConverter {
  private readonly cache: ConversionCache | null;
  private readonly stats: FOLConverterStats = { totalConverted: 0, cacheHits: 0, errors: 0 };

  constructor(opts: { useCache?: boolean; cacheMaxsize?: number } = {}) {
    this.cache = (opts.useCache ?? true) ? new ConversionCache(opts.cacheMaxsize ?? 1000) : null;
  }

  /** Convert natural-language text to a FOL formula string. */
  convert(text: string): ConversionResult {
    const cached = this.cache?.get(text);
    if (cached) { this.stats.cacheHits++; return cached; }

    try {
      const { output, confidence } = this._convert(text);
      const result: ConversionResult = { output, confidence, errors: [], metadata: { source: text } };
      this.stats.totalConverted++;
      this.cache?.set(text, result);
      return result;
    } catch (err) {
      this.stats.errors++;
      return { output: '', confidence: 0, errors: [String(err)], metadata: {} };
    }
  }

  convertBatch(texts: string[]): ConversionResult[] {
    return texts.map(t => this.convert(t));
  }

  /** Validate whether a string is a plausible FOL formula. */
  validate(formula: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    let depth = 0;
    for (const ch of formula) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (depth < 0) { errors.push('Unmatched closing parenthesis'); break; }
    }
    if (depth > 0) errors.push('Unclosed parenthesis');
    return { valid: errors.length === 0, errors };
  }

  getStats(): Readonly<FOLConverterStats> { return { ...this.stats }; }

  // -------------------------------------------------------------------------

  private _convert(text: string): { output: string; confidence: number } {
    const lower = text.toLowerCase();

    // Universal — "all/every X are/is Y"
    const univMatch = lower.match(/\b(?:all|every|each)\s+(\w+(?:\s+\w+)?)\s+(?:are|is)\s+(.+)/);
    if (univMatch) return { output: `∀x.(${univMatch[1].trim()}(x) → ${univMatch[2].trim()}(x))`, confidence: 0.85 };

    // Existential — "some/there exists X"
    const existMatch = lower.match(/\b(?:some|there (?:exists?|is))\s+(\w+(?:\s+\w+)?)\s+(?:that|which|who)?\s*(.+)?/);
    if (existMatch) {
      const prop = existMatch[2] ? existMatch[2].trim() : existMatch[1].trim();
      return { output: `∃x.(${existMatch[1].trim()}(x) ∧ ${prop}(x))`, confidence: 0.80 };
    }

    // Implication — "if X then Y"
    const implMatch = lower.match(/if\s+(.+?)\s+then\s+(.+)/);
    if (implMatch) return { output: `(${implMatch[1].trim()} → ${implMatch[2].trim()})`, confidence: 0.75 };

    // Fallback: wrap as predicate
    return { output: `P(${text.trim()})`, confidence: 0.30 };
  }
}

// ---------------------------------------------------------------------------
// PORT-206 — Common formula conversion helpers
// ---------------------------------------------------------------------------

export type FormulaFormat = 'unicode' | 'ascii' | 'latex' | 'tptp' | 'prolog' | 'dcec' | 'tdfol' | 'fol';

export interface FormulaFormatOptions {
  name?: string;
  role?: 'axiom' | 'hypothesis' | 'conjecture';
}

export function normalizeSyntax(formula: string): string {
  return formula
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\\forall\b/g, '∀')
    .replace(/\\exists\b/g, '∃')
    .replace(/\\land\b/g, '∧')
    .replace(/\\lor\b/g, '∨')
    .replace(/\\neg\b/g, '¬')
    .replace(/\\rightarrow\b/g, '→')
    .replace(/\\leftrightarrow\b/g, '↔')
    .replace(/\bforall\s+([A-Za-z]\w*)\s*[:.]/gi, '∀$1.')
    .replace(/\bexists\s+([A-Za-z]\w*)\s*[:.]/gi, '∃$1.')
    .replace(/∀\s+([A-Za-z]\w*)\s*[:.]/g, '∀$1.')
    .replace(/∃\s+([A-Za-z]\w*)\s*[:.]/g, '∃$1.')
    .replace(/\bAND\b/g, '∧')
    .replace(/\bOR\b/g, '∨')
    .replace(/\bNOT\b/g, '¬')
    .replace(/<->|<=>/g, '↔')
    .replace(/->|=>/g, '→')
    .replace(/\s*&\s*/g, ' ∧ ')
    .replace(/\s*\|\s*/g, ' ∨ ')
    .replace(/\s*([∧∨→↔])\s*/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectFormulaFormat(formula: string): FormulaFormat {
  const trimmed = formula.trim();
  if (/^fof\(|^cnf\(/i.test(trimmed)) return 'tptp';
  if (/\\(?:forall|exists|land|lor|neg|rightarrow)/.test(trimmed)) return 'latex';
  if (/\b(?:obligatory|permitted|forbidden)\s*\(/i.test(trimmed)) return 'prolog';
  if (/\b(?:forall|exists)\b|->|=>|<=>|[&|]/i.test(trimmed)) return 'ascii';
  if (/[∀∃∧∨¬→↔]/.test(trimmed)) return 'unicode';
  return 'fol';
}

export function formatFormula(formula: string, target: FormulaFormat, opts: FormulaFormatOptions = {}): string {
  const normalized = normalizeSyntax(unwrapTptp(formula));
  switch (target) {
    case 'unicode':
    case 'tdfol':
    case 'fol':
      return normalized;
    case 'ascii':
      return toAsciiFormula(normalized);
    case 'latex':
      return toLatexFormula(normalized);
    case 'tptp':
      return toTptpFormula(normalized, opts);
    case 'prolog':
      return toPrologFormula(normalized);
    case 'dcec':
      return tdfolToDcec(normalized);
    default:
      return normalized;
  }
}

export function convertFormula(formula: string, target: FormulaFormat, opts: FormulaFormatOptions = {}): string {
  return formatFormula(formula, target, opts);
}

export function convertFormulaDetailed(formula: string, target: FormulaFormat, opts: FormulaFormatOptions = {}): ConversionResult {
  try {
    const output = convertFormula(formula, target, opts);
    return {
      output,
      confidence: output ? 0.9 : 0,
      errors: [],
      metadata: { source_format: detectFormulaFormat(formula), target_format: target },
    };
  } catch (err) {
    return {
      output: '',
      confidence: 0,
      errors: [err instanceof Error ? err.message : String(err)],
      metadata: { target_format: target },
    };
  }
}

export function convertFormulaBatch(formulas: string[], target: FormulaFormat, opts: FormulaFormatOptions = {}): string[] {
  return formulas.map(formula => convertFormula(formula, target, opts));
}

export const normalize_syntax = normalizeSyntax;
export const format_formula = formatFormula;
export const convert_formula = convertFormula;

function toAsciiFormula(formula: string): string {
  return formula
    .replace(/∀([A-Za-z]\w*)\./g, 'forall $1.')
    .replace(/∃([A-Za-z]\w*)\./g, 'exists $1.')
    .replace(/∧/g, '&')
    .replace(/∨/g, '|')
    .replace(/¬/g, '~')
    .replace(/→/g, '=>')
    .replace(/↔/g, '<=>')
    .replace(/\s+/g, ' ')
    .trim();
}

function toLatexFormula(formula: string): string {
  return formula
    .replace(/∀([A-Za-z]\w*)\./g, '\\forall $1. ')
    .replace(/∃([A-Za-z]\w*)\./g, '\\exists $1. ')
    .replace(/∧/g, '\\land')
    .replace(/∨/g, '\\lor')
    .replace(/¬/g, '\\neg ')
    .replace(/→/g, '\\rightarrow')
    .replace(/↔/g, '\\leftrightarrow')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTptpFormula(formula: string, opts: FormulaFormatOptions): string {
  if (/^fof\(|^cnf\(/i.test(formula.trim())) return formula.trim();
  const body = formula
    .replace(/∀([A-Za-z]\w*)\./g, '! [$1] : ')
    .replace(/∃([A-Za-z]\w*)\./g, '? [$1] : ')
    .replace(/∧/g, ' & ')
    .replace(/∨/g, ' | ')
    .replace(/¬/g, '~')
    .replace(/→/g, ' => ')
    .replace(/↔/g, ' <=> ')
    .replace(/\s+/g, ' ')
    .trim();
  return `fof(${sanitizeTptpName(opts.name ?? 'formula')}, ${opts.role ?? 'conjecture'}, (${body})).`;
}

function toPrologFormula(formula: string): string {
  const deontic = formula
    .replace(/\bO\s*\(/g, 'obligatory(')
    .replace(/\bP\s*\(/g, 'permitted(')
    .replace(/\bF\s*\(/g, 'forbidden(');
  const implication = splitTopLevel(deontic, '→');
  if (implication) return `${toPrologFormula(implication[1])} :- ${toPrologFormula(implication[0])}`;
  return deontic
    .replace(/∀([A-Za-z]\w*)\./g, '')
    .replace(/∃([A-Za-z]\w*)\./g, '')
    .replace(/∧/g, ',')
    .replace(/∨/g, ';')
    .replace(/¬\s*/g, 'not ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unwrapTptp(formula: string): string {
  const trimmed = formula.trim();
  const match = trimmed.match(/^(?:fof|cnf)\([^,]+,\s*[^,]+,\s*\((.*)\)\)\.?$/i);
  return match ? match[1]!.trim() : trimmed;
}

function sanitizeTptpName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^[^A-Za-z_]+/, 'formula_');
}

function splitTopLevel(formula: string, separator: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < formula.length; i++) {
    const ch = formula[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && formula.slice(i, i + separator.length) === separator) {
      return [formula.slice(0, i).trim(), formula.slice(i + separator.length).trim()];
    }
  }
  return null;
}
