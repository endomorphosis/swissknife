/**
 * tdfol-grammar-bridge.ts
 *
 * TDFOL grammar bridge — NL text ↔ TDFOL formula conversion.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/bridges/tdfol_grammar_bridge.py
 *
 * Provides:
 *   TDFOLGrammarBridge             — parse text → Formula; explain Formula → string
 *   NaturalLanguageTDFOLInterface  — higher-level NL → TDFOL interface
 *   parseNl()                      — convenience export
 *   explainFormula()               — convenience export
 */

import { parseTdfol, parseTdfolSafe } from './tdfol-parser.js';
import type { Formula } from './tdfol-core.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Expand natural language modal/deontic words to TDFOL operator notation. */
function nlToTdfolText(text: string): string {
  return text
    // Quantifiers
    .replace(/\bfor all\b/gi, '∀')
    .replace(/\bthere exists\b/gi, '∃')
    .replace(/\bforall\b/gi, '∀')
    .replace(/\bexists\b/gi, '∃')
    // Deontic: obligation
    .replace(/\b(?:shall|must|is obligated to|is required to|has a duty to)\s+([A-Z]\w+|[a-z]\w+)/gi,
      (_, action) => `O(${normalizeAction(action)})`)
    // Deontic: permission
    .replace(/\b(?:may|is permitted to|is allowed to|is authorized to)\s+([A-Z]\w+|[a-z]\w+)/gi,
      (_, action) => `P(${normalizeAction(action)})`)
    // Deontic: prohibition
    .replace(/\b(?:shall not|must not|is prohibited from|is forbidden to|cannot|may not)\s+([A-Z]\w+|[a-z]\w+)/gi,
      (_, action) => `F(${normalizeAction(action)})`)
    // Temporal: always/eventually
    .replace(/\balways\b/gi, 'G')
    .replace(/\beventually\b/gi, 'F')
    // Logical connectives
    .replace(/\band\b/gi, '∧')
    .replace(/\bor\b/gi, '∨')
    .replace(/\bnot\b/gi, '¬')
    .replace(/\bimplies\b/gi, '→')
    .replace(/\biff\b/gi, '↔')
    .trim();
}

function normalizeAction(action: string): string {
  return action.charAt(0).toUpperCase() + action.slice(1);
}

/** Explain a TDFOL formula in natural language. */
function formulaToNl(formula: Formula): string {
  const f = formula as Record<string, unknown>;
  const kind = f['kind'] as string;

  if (kind === 'predicate') return `${f['name']}(${(f['args'] as unknown[]).length > 0 ? '...' : ''})`;

  if (kind === 'deontic') {
    const op = f['operator'] as string;
    const body = formulaToNl(f['formula'] as Formula);
    const opMap: Record<string, string> = { O: 'is obligated to', P: 'is permitted to', F: 'is prohibited from' };
    return `${opMap[op] ?? op}: ${body}`;
  }

  if (kind === 'temporal') {
    const op = f['operator'] as string;
    const body = formulaToNl(f['formula'] as Formula);
    const opMap: Record<string, string> = { '□': 'always', '◊': 'eventually', X: 'next' };
    return `${opMap[op] ?? op}(${body})`;
  }

  if (kind === 'binary') {
    const op = f['operator'] as string;
    const left = formulaToNl(f['left'] as Formula);
    const right = formulaToNl(f['right'] as Formula);
    const opMap: Record<string, string> = { '∧': 'and', '∨': 'or', '→': 'implies', '↔': 'if and only if' };
    return `(${left}) ${opMap[op] ?? op} (${right})`;
  }

  if (kind === 'unary') {
    const body = formulaToNl(f['operand'] as Formula);
    return `not (${body})`;
  }

  if (kind === 'quantified') {
    const q = (f['quantifier'] as string) === '∀' ? 'for all' : 'there exists';
    const body = formulaToNl(f['body'] as Formula);
    return `${q} ${f['variable']}, ${body}`;
  }

  // Fallback: use toStr if available
  const toStr = f['toStr'];
  if (typeof toStr === 'function') return (toStr as () => string)();
  return String(formula);
}

// ---------------------------------------------------------------------------
// TDFOLGrammarBridge
// ---------------------------------------------------------------------------

export class TDFOLGrammarBridge {
  /**
   * Parse natural-language or TDFOL text into a Formula AST.
   * Attempts direct TDFOL parse first; if it fails, expands NL to TDFOL then retries.
   * Returns null on failure.
   */
  parse(text: string): Formula | null {
    if (!text?.trim()) return null;

    // Try direct parse
    const direct = parseTdfolSafe(text.trim());
    if (direct) return direct;

    // Expand NL to TDFOL notation, then re-try
    const expanded = nlToTdfolText(text.trim());
    return parseTdfolSafe(expanded);
  }

  /**
   * Explain a parsed TDFOL formula in natural language.
   */
  explain(formula: Formula): string {
    try {
      return formulaToNl(formula);
    } catch {
      const f = formula as { toStr?: () => string };
      return typeof f.toStr === 'function' ? f.toStr() : String(formula);
    }
  }

  /**
   * Attempt to parse and immediately explain a text snippet.
   * Returns { formula, explanation } or { formula: null, explanation: 'Parse failed' }.
   */
  parseAndExplain(text: string): { formula: Formula | null; explanation: string } {
    const formula = this.parse(text);
    const explanation = formula ? this.explain(formula) : 'Parse failed: could not interpret as TDFOL formula';
    return { formula, explanation };
  }
}

// ---------------------------------------------------------------------------
// NaturalLanguageTDFOLInterface
// ---------------------------------------------------------------------------

export class NaturalLanguageTDFOLInterface {
  private bridge: TDFOLGrammarBridge;

  constructor(bridge?: TDFOLGrammarBridge) {
    this.bridge = bridge ?? new TDFOLGrammarBridge();
  }

  /**
   * Parse a natural-language description of a legal rule into TDFOL.
   * Returns null when the text cannot be parsed.
   */
  parseNl(text: string): Formula | null {
    return this.bridge.parse(text);
  }

  /**
   * Explain a TDFOL formula in plain English.
   */
  explainFormula(formula: Formula): string {
    return this.bridge.explain(formula);
  }

  /**
   * Batch-parse a list of NL sentences.
   * Returns (formula | null) for each sentence.
   */
  parseAll(sentences: string[]): Array<Formula | null> {
    return sentences.map(s => this.parseNl(s));
  }
}

// ---------------------------------------------------------------------------
// Convenience module-level exports (mirrors Python module functions)
// ---------------------------------------------------------------------------

const _defaultBridge = new TDFOLGrammarBridge();

/** Parse NL text or TDFOL notation → Formula AST. Null on failure. */
export function parseNl(text: string): Formula | null {
  return _defaultBridge.parse(text);
}

/** Explain a TDFOL Formula in plain English. */
export function explainFormula(formula: Formula): string {
  return _defaultBridge.explain(formula);
}
