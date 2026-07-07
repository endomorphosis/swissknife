/**
 * FolTextConverter — natural language to First-Order Logic (FOL) converter.
 *
 * Mirrors ipfs_datasets_py/logic/fol/ (2032 total lines):
 *   fol/utils/predicate_extractor.py (76L) — noun/verb/adjective/relation extraction
 *   fol/utils/fol_parser.py (233L)         — quantifier + operator parsing, formula building
 *   fol/utils/logic_formatter.py (218L)    — Prolog / TPTP / JSON output formats
 *   fol/converter.py (497L)               — FOLConverter main class
 *
 * Provides:
 *   extractPredicates(text)      — nouns, verbs, adjectives, logical relations
 *   parseQuantifiers(text)       — universal (∀) and existential (∃) quantifiers
 *   parseLogicalOperators(text)  — AND/OR/IMPLIES/NOT detection
 *   buildFolFormula(...)         — assemble FOL formula string
 *   FolTextConverter.convert()   — full NL→FOL pipeline
 *   formatAsProlog(formula)      — Prolog clause form
 *   formatAsTptp(formula)        — TPTP notation for theorem provers
 *
 * T-80.
 * Reference: ipfs_datasets_py/logic/fol/
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FolPredicate {
  readonly nouns: string[];
  readonly verbs: string[];
  readonly adjectives: string[];
  readonly relations: FolRelation[];
}

export interface FolRelation {
  readonly type: 'universal' | 'existential' | 'implication';
  readonly subject: string;
  readonly predicate: string;
}

export interface FolQuantifier {
  readonly type: 'universal' | 'existential';
  readonly symbol: '∀' | '∃';
  readonly scope: string;
  readonly position: [number, number];
}

export interface FolOperator {
  readonly type: 'and' | 'or' | 'implies' | 'not';
  readonly position: [number, number];
}

export interface FolConversionResult {
  readonly formula: string;
  /** 0–1 confidence (heuristic). */
  readonly confidence: number;
  readonly predicates: FolPredicate;
  readonly quantifiers: FolQuantifier[];
  readonly operators: FolOperator[];
  /** Prolog clause form of the formula. */
  readonly prolog: string;
  /** TPTP notation for external provers. */
  readonly tptp: string;
}

// ---------------------------------------------------------------------------
// Predicate extraction (mirrors fol/utils/predicate_extractor.py)
// ---------------------------------------------------------------------------

const _NOUN_PATTERN    = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
const _VERB_PATTERN    = /\b(?:is|are|was|were|has|have|can|will|should|must)\s+(\w+)\b/gi;
const _ADJ_PATTERN     = /\b(?:is|are|was|were)\s+(\w+)(?:\s|$|\.)/gi;
const _IF_THEN_PATTERN = /if\s+(.+?)\s+then\s+(.+?)(?:\.|$)/gi;
const _ALL_PATTERN     = /all\s+(\w+)\s+(?:are|is|have|has)\s+(.+?)(?:\.|$)/gi;
const _SOME_PATTERN    = /(?:some|there (?:is|are))\s+(\w+)\s+(?:are|is|have|has)\s+(.+?)(?:\.|$)/gi;

const _STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at']);

/** Normalise a raw predicate name: capitalise each word, remove stop words. */
export function normalizePredicate(raw: string): string {
  const words = raw.trim().split(/\s+/)
    .filter(w => !_STOP_WORDS.has(w.toLowerCase()));
  const normalised = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  return normalised || 'UnknownPredicate';
}

/** Extract nouns, verbs, adjectives, and logical relations from text. */
export function extractPredicates(text: string): FolPredicate {
  const nouns: string[] = [];
  const verbs: string[] = [];
  const adjectives: string[] = [];
  const relations: FolRelation[] = [];

  // Nouns — capitalised phrases
  for (const m of text.matchAll(new RegExp(_NOUN_PATTERN.source, 'g'))) {
    nouns.push(normalizePredicate(m[0]));
  }

  // Verbs
  const lc = text.toLowerCase();
  for (const m of lc.matchAll(new RegExp(_VERB_PATTERN.source, 'gi'))) {
    if (m[1]) verbs.push(normalizePredicate(m[1]));
  }

  // Adjectives
  for (const m of lc.matchAll(new RegExp(_ADJ_PATTERN.source, 'gi'))) {
    if (m[1]) adjectives.push(normalizePredicate(m[1]));
  }

  // Logical relations
  for (const m of lc.matchAll(new RegExp(_IF_THEN_PATTERN.source, 'gi'))) {
    relations.push({ type: 'implication', subject: m[1].trim(), predicate: m[2].trim() });
  }
  for (const m of lc.matchAll(new RegExp(_ALL_PATTERN.source, 'gi'))) {
    relations.push({ type: 'universal', subject: m[1].trim(), predicate: m[2].trim() });
  }
  for (const m of lc.matchAll(new RegExp(_SOME_PATTERN.source, 'gi'))) {
    relations.push({ type: 'existential', subject: m[1].trim(), predicate: m[2].trim() });
  }

  return {
    nouns:       [...new Set(nouns)],
    verbs:       [...new Set(verbs)],
    adjectives:  [...new Set(adjectives)],
    relations,
  };
}

// ---------------------------------------------------------------------------
// Quantifier + operator parsing (mirrors fol/utils/fol_parser.py)
// ---------------------------------------------------------------------------

const _UNIVERSAL_PATS  = [/\b(?:all|every|each)\s+(\w+)/gi, /\b(?:any|everything|everyone)\b/gi, /\bfor\s+all\s+(\w+)/gi];
const _EXISTENTIAL_PATS = [/\b(?:some|there\s+(?:is|are|exists?))\s+(\w+)/gi, /\b(?:something|someone|at\s+least\s+one)\b/gi];
const _AND_PATS   = [/\band\b/gi, /[,;]\s*(?=\w)/g];
const _OR_PATS    = [/\bor\b/gi];
const _IMPL_PATS  = [/\bif\s+.+?\s+then\b/gi, /\bimplies?\b/gi, /\btherefore\b/gi, /\bhence\b/gi];
const _NEG_PATS   = [/\bnot\b/gi, /\bno\b/gi, /\bnone\b/gi, /\bnever\b/gi];

/** Parse universal and existential quantifiers from text. */
export function parseQuantifiers(text: string): FolQuantifier[] {
  const result: FolQuantifier[] = [];
  const lc = text.toLowerCase();

  for (const pat of _UNIVERSAL_PATS) {
    for (const m of lc.matchAll(new RegExp(pat.source, 'gi'))) {
      result.push({ type: 'universal', symbol: '∀', scope: (m[1] ?? 'x').trim(), position: [m.index!, m.index! + m[0].length] });
    }
  }
  for (const pat of _EXISTENTIAL_PATS) {
    for (const m of lc.matchAll(new RegExp(pat.source, 'gi'))) {
      result.push({ type: 'existential', symbol: '∃', scope: (m[1] ?? 'x').trim(), position: [m.index!, m.index! + m[0].length] });
    }
  }
  return result;
}

/** Detect logical operators (AND, OR, IMPLIES, NOT) in text. */
export function parseLogicalOperators(text: string): FolOperator[] {
  const result: FolOperator[] = [];
  const lc = text.toLowerCase();
  const add = (type: FolOperator['type'], pats: RegExp[]) => {
    for (const pat of pats) {
      for (const m of lc.matchAll(new RegExp(pat.source, 'gi'))) {
        result.push({ type, position: [m.index!, m.index! + m[0].length] });
      }
    }
  };
  add('and', _AND_PATS);
  add('or', _OR_PATS);
  add('implies', _IMPL_PATS);
  add('not', _NEG_PATS);
  return result;
}

// ---------------------------------------------------------------------------
// FOL formula builder (mirrors fol/utils/fol_parser.py:build_fol_formula)
// ---------------------------------------------------------------------------

/** Build a FOL formula string from parsed components. */
export function buildFolFormula(
  quantifiers: FolQuantifier[],
  predicates: FolPredicate,
  operators: FolOperator[],
  relations: FolRelation[],
): string {
  // Relations take priority (most specific)
  for (const rel of relations) {
    const subj = normalizePredicate(rel.subject);
    const pred = normalizePredicate(rel.predicate);
    if (rel.type === 'universal') return `∀x (${subj}(x) → ${pred}(x))`;
    if (rel.type === 'existential') return `∃x ${subj}(x)`;
    if (rel.type === 'implication') return `${normalizePredicate(rel.subject)}(x) → ${normalizePredicate(rel.predicate)}(x)`;
  }

  // Quantifier-based
  const hasUniversal  = quantifiers.some(q => q.type === 'universal');
  const hasExistential = quantifiers.some(q => q.type === 'existential');

  if (predicates.nouns.length >= 2 && hasUniversal) {
    return `∀x (${predicates.nouns[0]}(x) → ${predicates.nouns[1]}(x))`;
  }
  if (predicates.nouns.length >= 2 && predicates.adjectives.length >= 1) {
    return `∀x (${predicates.nouns[0]}(x) → ${predicates.adjectives[0]}(x))`;
  }
  if (predicates.nouns.length >= 1 && hasExistential) {
    return `∃x ${predicates.nouns[0]}(x)`;
  }
  if (predicates.nouns.length >= 1) {
    return `∃x ${predicates.nouns[0]}(x)`;
  }

  // Operator-based fallback
  const hasNegation = operators.some(o => o.type === 'not');
  if (hasNegation && predicates.verbs.length >= 1) {
    return `¬${predicates.verbs[0]}(x)`;
  }

  return '∀x P(x)'; // fallback tautology
}

// ---------------------------------------------------------------------------
// Logic formatter (mirrors fol/utils/logic_formatter.py)
// ---------------------------------------------------------------------------

/** Convert a FOL formula string to Prolog clause form. */
export function formatAsProlog(formula: string): string {
  // ∀x (P(x) → Q(x)) → q(X) :- p(X).
  const m = formula.match(/∀(\w+)\s*\((\w+)\(\w+\)\s*→\s*(\w+)\(\w+\)\)/);
  if (m) return `${m[3].toLowerCase()}(${m[1].toUpperCase()}) :- ${m[2].toLowerCase()}(${m[1].toUpperCase()}).`;

  // ∃x P(x) → p(a).
  const m2 = formula.match(/∃(\w+)\s+(\w+)\(\w+\)/);
  if (m2) return `${m2[2].toLowerCase()}(a).`;

  return `% ${formula}`;
}

/** Convert a FOL formula string to TPTP notation. */
export function formatAsTptp(formula: string): string {
  return formula
    .replace(/∀/g, '![')
    .replace(/∃/g, '?[')
    .replace(/→/g, '=>')
    .replace(/¬/g, '~')
    .replace(/∧/g, '&')
    .replace(/∨/g, '|');
}

// ---------------------------------------------------------------------------
// FolTextConverter — main class
// ---------------------------------------------------------------------------

/**
 * FolTextConverter — converts natural language text to First-Order Logic.
 *
 * Usage:
 * ```ts
 * const converter = new FolTextConverter();
 * const result = converter.convert('All humans are mortal.');
 * console.log(result.formula);  // ∀x (Human(x) → Mortal(x))
 * console.log(result.prolog);   // mortal(X) :- human(X).
 * ```
 */
export class FolTextConverter {
  /** T-86: use MLConfidenceScorer for improved confidence scores. */
  private readonly _scorer: import('./ml-confidence-scorer.js').MLConfidenceScorer | null = null;

  constructor() {
    // Lazy-load MLConfidenceScorer to avoid circular deps
    void import('./ml-confidence-scorer.js').then(({ MLConfidenceScorer }) => {
      // @ts-ignore — assign to readonly field after lazy load
      (this as { _scorer: unknown })._scorer = new MLConfidenceScorer();
    }).catch(() => { /* scorer unavailable — fallback stays */ });
  }

  /**
   * Convert natural language text to a FOL formula.
   *
   * @param text NL input (legal text, policy statement, etc.)
   * @returns FolConversionResult with formula, confidence, predicates, and formatted outputs.
   */
  convert(text: string): FolConversionResult {
    const predicates  = extractPredicates(text);
    const quantifiers = parseQuantifiers(text);
    const operators   = parseLogicalOperators(text);
    const formula     = buildFolFormula(quantifiers, predicates, operators, predicates.relations);
    const confidence  = this._scorer
      ? this._scorer.predictConfidence(text, formula, predicates, quantifiers, operators)
      : this._calculateConfidence(text, formula, predicates, quantifiers);

    return {
      formula,
      confidence,
      predicates,
      quantifiers,
      operators,
      prolog: formatAsProlog(formula),
      tptp:   formatAsTptp(formula),
    };
  }

  /**
   * Convert a batch of texts to FOL formulas.
   */
  convertBatch(texts: string[]): FolConversionResult[] {
    return texts.map(t => this.convert(t));
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /** Fallback confidence when MLConfidenceScorer is unavailable. */
  private _calculateConfidence(
    text: string,
    formula: string,
    predicates: FolPredicate,
    quantifiers: FolQuantifier[],
  ): number {
    let score = 0.5;
    if (predicates.relations.length > 0) score += 0.2;
    if (quantifiers.length > 0) score += 0.1;
    if (predicates.nouns.length >= 2) score += 0.1;
    if (formula !== '∀x P(x)') score += 0.05; // not fallback
    if (text.length > 20 && text.length < 200) score += 0.05;
    return Math.min(1.0, score);
  }
}
