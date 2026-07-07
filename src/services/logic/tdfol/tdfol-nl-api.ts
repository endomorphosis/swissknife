/**
 * TDFOL NL API — Natural Language → TDFOL formula parser.
 *
 * Mirrors ipfs_datasets_py/logic/TDFOL/nl/tdfol_nl_api.py:
 *   ParseOptions, NLParseResult, parse_natural_language(text, opts?)
 *
 * Uses the existing swissknife stack:
 *   DeonticTextAnalyzer   — extract O/P/F statements
 *   FolTextConverter      — extract FOL formula
 *   PolicyToTdfolTranslator  — convert deontic statements → TdfolFormula[]
 *
 * T-110.
 * Reference: ipfs_datasets_py/logic/TDFOL/nl/tdfol_nl_api.py §parse_natural_language
 */

import { DeonticTextAnalyzer } from '../deontic/deontic-text-analyzer.js';
import type { DeonticStatement } from '../deontic/deontic-text-analyzer.js';
import { FolTextConverter } from '../fol/fol-text-converter.js';
import type { FolConversionResult } from '../fol/fol-text-converter.js';
import { serializeTdfol } from './tdfol-types.js';
import type { TdfolFormula } from './tdfol-types.js';
import {
  Obligation, Permission, Prohibition, Atom,
} from '../dcec/dcec-types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration options for NL parsing.
 * Python ref: `ParseOptions` in tdfol_nl_api.py.
 */
export interface ParseOptions {
  /** Minimum confidence threshold (0–1). Default: 0.5. */
  minConfidence?: number;
  /** Include entity metadata in results. Default: true. */
  includeMetadata?: boolean;
  /** Source identifier for traceability. */
  source?: string;
}

/** A single generated TDFOL formula with metadata. */
export interface GeneratedFormula {
  readonly formula_string:   string;
  readonly operator:         'O' | 'P' | 'F';
  readonly entity:           string;
  readonly action:           string;
  readonly confidence:       number;
  readonly source_statement: DeonticStatement;
}

/**
 * Result from `parseNaturalLanguage()`.
 * Python ref: `NLParseResult` in tdfol_nl_api.py.
 */
export interface NLParseResult {
  /** Extracted TDFOL formula objects. */
  readonly formulas:          TdfolFormula[];
  /** Generated formulas with metadata. */
  readonly generated_formulas: GeneratedFormula[];
  /** FOL conversion result for the full text. */
  readonly fol:               FolConversionResult;
  /** Extracted deontic statements. */
  readonly statements:        DeonticStatement[];
  /** Overall confidence score (0–1). */
  readonly confidence:        number;
  /** Total parse time in milliseconds. */
  readonly parse_time_ms:     number;
  /** Metadata about the parse. */
  readonly metadata:          Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// parseNaturalLanguage
// ---------------------------------------------------------------------------

const _analyzer = new DeonticTextAnalyzer();
const _fol      = new FolTextConverter();

/**
 * Convert natural language text to TDFOL formula objects.
 *
 * Python ref: `parse_natural_language(text, options?)` in tdfol_nl_api.py.
 *
 * Uses the full swissknife stack:
 *   1. `DeonticTextAnalyzer.extractStatements()` — NL→O/P/F
 *   2. `FolTextConverter.convert()` — NL→FOL
 *   3. map O/P/F statements → `TdfolFormula` objects
 *
 * @example
 * ```ts
 * const result = parseNaturalLanguage('All contractors must pay taxes.');
 * console.log(result.generated_formulas[0].formula_string);
 * // 'O(Contractors_pay_taxes)'
 * ```
 */
export function parseNaturalLanguage(
  text: string,
  opts: ParseOptions = {},
): NLParseResult {
  const { minConfidence = 0.5, includeMetadata = true, source = 'nl-input' } = opts;
  const start = Date.now();

  // 1. Extract deontic statements
  const statements = _analyzer.extractStatements(text, undefined, source);

  // 2. Convert to FOL
  const fol = _fol.convert(text);

  // 3. Build TDFOL formulas from statements
  const generated: GeneratedFormula[] = [];
  const formulas:  TdfolFormula[]     = [];

  for (const stmt of statements) {
    if (stmt.confidence < minConfidence) continue;

    const actionSlug = stmt.action.replace(/\s+/g, '_').toLowerCase();
    const atom = Atom(`${stmt.entity.replace(/\s+/g, '_').toLowerCase()}_${actionSlug}`);

    let tf: TdfolFormula;
    let op: 'O' | 'P' | 'F';

    switch (stmt.modality) {
      case 'obligation':   tf = Obligation(atom); op = 'O'; break;
      case 'permission':   tf = Permission(atom); op = 'P'; break;
      case 'prohibition':  tf = Prohibition(atom); op = 'F'; break;
    }

    formulas.push(tf!);
    generated.push({
      formula_string:   serializeTdfol(tf!),
      operator:         op!,
      entity:           stmt.entity,
      action:           stmt.action,
      confidence:       stmt.confidence,
      source_statement: stmt,
    });
  }

  const avgConfidence =
    generated.length > 0
      ? generated.reduce((s, g) => s + g.confidence, 0) / generated.length
      : fol.confidence;

  return {
    formulas,
    generated_formulas: generated,
    fol,
    statements,
    confidence:     avgConfidence,
    parse_time_ms:  Date.now() - start,
    metadata: includeMetadata ? {
      text_length:      text.length,
      statement_count:  statements.length,
      formula_count:    formulas.length,
      source,
    } : {},
  };
}

/** Backward-compatible alias (matches Python's snake_case API). */
export { parseNaturalLanguage as parse_natural_language };

// PORT-085: spaCy-compatible token type for NL pattern matching
export interface SpacyLikeToken {
  text:   string;
  pos:    'NOUN' | 'VERB' | 'ADJ' | 'ADV' | 'ADP' | 'DET' | 'PRON' | 'PROPN' | 'PUNCT' | 'NUM' | 'CCONJ' | 'SCONJ' | 'OTHER';
  lemma:  string;
  dep:    string;   // dependency relation (nsubj, dobj, etc.)
  isStop: boolean;
  ner?:   string;   // named entity label
}

export function tokenizeSimple(text: string): SpacyLikeToken[] {
  return text.split(/\s+/).filter(Boolean).map(w => ({
    text:   w,
    pos:    /^[A-Z]/.test(w) ? 'PROPN' : /\b(must|shall|may|can|should)\b/.test(w.toLowerCase()) ? 'VERB' : 'NOUN',
    lemma:  w.toLowerCase().replace(/s$/, ''),
    dep:    'dep',
    isStop: ['the','a','an','is','are','of','in','to','and','or','for'].includes(w.toLowerCase()),
    ner:    undefined,
  } as SpacyLikeToken));
}
