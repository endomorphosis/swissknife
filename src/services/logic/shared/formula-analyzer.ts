/**
 * Formula Complexity Analyzer — T-203
 *
 * Port of ipfs_datasets_py/logic/external_provers/formula_analyzer.py
 *
 * Analyzes TDFOL formulas to determine their characteristics and recommend
 * the best prover for solving them.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** Types of logical formulas. */
export enum FormulaType {
  PURE_FOL = 'pure_fol',
  MODAL = 'modal',
  TEMPORAL = 'temporal',
  DEONTIC = 'deontic',
  MIXED_MODAL = 'mixed_modal',
  ARITHMETIC = 'arithmetic',
  QUANTIFIED = 'quantified',
  PROPOSITIONAL = 'propositional',
}

/** Complexity levels for formulas. */
export enum FormulaComplexity {
  TRIVIAL = 1,
  SIMPLE = 2,
  MODERATE = 3,
  COMPLEX = 4,
  VERY_COMPLEX = 5,
}

// ---------------------------------------------------------------------------
// Analysis result
// ---------------------------------------------------------------------------

/** Full analysis result for a formula. */
export interface FormulaAnalysis {
  /** Primary type of the formula. */
  formulaType: FormulaType;
  /** Overall complexity level. */
  complexity: FormulaComplexity;
  /** Maximum nesting depth of quantifiers. */
  quantifierDepth: number;
  /** Maximum nesting level of operators. */
  nestingLevel: number;
  /** Total number of logical operators. */
  operatorCount: number;
  /** Whether the formula contains arithmetic sub-expressions. */
  hasArithmetic: boolean;
  /** Whether the formula contains modal (□/◊) operators. */
  hasModal: boolean;
  /** Whether the formula contains temporal operators (G/F/U/…). */
  hasTemporal: boolean;
  /** Whether the formula contains deontic operators (O/P/F). */
  hasDeontic: boolean;
  /** Ordered list of recommended prover names. */
  recommendedProvers: string[];
  /** Numeric complexity score in [0, 100]. */
  complexityScore: number;
  /** Additional analysis details. */
  analysisDetails: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Operator keyword sets
// ---------------------------------------------------------------------------

/**
 * For single-letter operators (G, F, O, P, K, B, X, U, R, S) we match
 * case-sensitively (uppercase only) to avoid false positives with lowercase
 * variable names like x, y, z, p, q, r, s.
 * Multi-letter keywords are matched case-insensitively.
 */
const MODAL_KEYWORDS_MULTI = new Set(['box', '□', 'diamond', '◊', 'necessarily', 'possibly', 'knows', 'believes']);
const MODAL_KEYWORDS_UPPER = new Set(['K', 'B']);

const TEMPORAL_KEYWORDS_MULTI = new Set(['always', 'eventually', 'until', 'next', 'release', 'globally', 'future', 'since']);
const TEMPORAL_KEYWORDS_UPPER = new Set(['G', 'F', 'U', 'X', 'R', 'S']);

const DEONTIC_KEYWORDS_MULTI = new Set(['obligatory', 'permitted', 'forbidden', 'deontic', 'ought', 'must', 'may', 'shall']);
// Single-letter 'O'/'P' omitted — too ambiguous with propositional variable names.
const DEONTIC_KEYWORDS_UPPER = new Set<string>();

const ARITHMETIC_KEYWORDS = new Set(['+', '-', '*', '/', 'div', 'mod', 'sum', 'product', 'integer', 'real', 'nat']);
const QUANTIFIERS_MULTI = new Set(['forall', 'exists', 'lambda']);
const QUANTIFIERS_SYM = new Set(['∀', '∃', 'λ']);
const LOGIC_OPERATORS = new Set([
  'and', '∧', '&', 'or', '∨', '|', 'not', '¬', '~', '!',
  'implies', '→', '=>', '->', 'iff', '↔', '<->', '<=>', 'xor',
]);

// ---------------------------------------------------------------------------
// Prover capability profiles
// ---------------------------------------------------------------------------

interface ProverProfile {
  goodFor: FormulaType[];
  maxComplexity: FormulaComplexity;
  supportsModal: boolean;
  supportsTemporal: boolean;
  supportsDeontic: boolean;
  supportsArithmetic: boolean;
  speed: string;
  quantifierHandling: string;
}

const PROVER_PROFILES: Record<string, ProverProfile> = {
  z3: {
    goodFor: [FormulaType.PURE_FOL, FormulaType.QUANTIFIED, FormulaType.ARITHMETIC],
    maxComplexity: FormulaComplexity.COMPLEX,
    supportsModal: false, supportsTemporal: false, supportsDeontic: false,
    supportsArithmetic: true, speed: 'fast', quantifierHandling: 'good',
  },
  cvc5: {
    goodFor: [FormulaType.QUANTIFIED, FormulaType.PURE_FOL],
    maxComplexity: FormulaComplexity.VERY_COMPLEX,
    supportsModal: false, supportsTemporal: false, supportsDeontic: false,
    supportsArithmetic: true, speed: 'medium', quantifierHandling: 'excellent',
  },
  lean: {
    goodFor: [FormulaType.PURE_FOL, FormulaType.MODAL, FormulaType.QUANTIFIED],
    maxComplexity: FormulaComplexity.VERY_COMPLEX,
    supportsModal: true, supportsTemporal: true, supportsDeontic: true,
    supportsArithmetic: true, speed: 'slow', quantifierHandling: 'excellent',
  },
  coq: {
    goodFor: [FormulaType.PURE_FOL, FormulaType.MODAL, FormulaType.QUANTIFIED],
    maxComplexity: FormulaComplexity.VERY_COMPLEX,
    supportsModal: true, supportsTemporal: true, supportsDeontic: true,
    supportsArithmetic: true, speed: 'slow', quantifierHandling: 'excellent',
  },
  native: {
    goodFor: [FormulaType.PURE_FOL, FormulaType.PROPOSITIONAL],
    maxComplexity: FormulaComplexity.MODERATE,
    supportsModal: false, supportsTemporal: false, supportsDeontic: false,
    supportsArithmetic: false, speed: 'very_fast', quantifierHandling: 'fair',
  },
};

// ---------------------------------------------------------------------------
// FormulaAnalyzer
// ---------------------------------------------------------------------------

/**
 * Analyzes TDFOL formulas to recommend optimal provers.
 *
 * TypeScript port of `FormulaAnalyzer` from
 * `ipfs_datasets_py/logic/external_provers/formula_analyzer.py`.
 */
export class FormulaAnalyzer {
  /** Analyzes a formula string (or object with a toString() rep). */
  analyze(formula: unknown): FormulaAnalysis {
    const text = this._formulaText(formula);
    const tokens = this._tokenize(text);
    const rawTokenSet = new Set(tokens);
    const lowerTokenSet = new Set(tokens.map(t => t.toLowerCase()));

    const hasModal = this._hasKeywords(lowerTokenSet, rawTokenSet, MODAL_KEYWORDS_MULTI, MODAL_KEYWORDS_UPPER);
    const hasTemporal = this._hasKeywords(lowerTokenSet, rawTokenSet, TEMPORAL_KEYWORDS_MULTI, TEMPORAL_KEYWORDS_UPPER);
    const hasDeontic = this._hasKeywords(lowerTokenSet, rawTokenSet, DEONTIC_KEYWORDS_MULTI, DEONTIC_KEYWORDS_UPPER);
    const hasArithmetic = this._hasAny(lowerTokenSet, ARITHMETIC_KEYWORDS);
    const quantifierDepth = this._quantifierDepth(tokens);
    const nestingLevel = this._nestingLevel(text);
    const operatorCount = this._operatorCount(lowerTokenSet);

    const formulaType = this._classifyType({ hasModal, hasTemporal, hasDeontic, hasArithmetic, quantifierDepth });
    const complexity = this._measureComplexity({ nestingLevel, quantifierDepth, operatorCount, hasModal, hasTemporal, hasDeontic, hasArithmetic });
    const complexityScore = this._complexityScore({ nestingLevel, quantifierDepth, operatorCount, hasModal, hasTemporal, hasDeontic, hasArithmetic });
    const recommendedProvers = this._recommendProvers(formulaType, complexity, { hasModal, hasTemporal, hasDeontic, hasArithmetic });

    return {
      formulaType,
      complexity,
      quantifierDepth,
      nestingLevel,
      operatorCount,
      hasArithmetic,
      hasModal,
      hasTemporal,
      hasDeontic,
      recommendedProvers,
      complexityScore,
      analysisDetails: {
        tokenCount: tokens.length,
        distinctTokens: [...new Set(tokens)].length,
      },
    };
  }

  classifyType(formula: unknown): FormulaType {
    const text = this._formulaText(formula);
    const tokens = this._tokenize(text);
    const rawTokenSet = new Set(tokens);
    const lowerTokenSet = new Set(tokens.map(t => t.toLowerCase()));
    return this._classifyType({
      hasModal: this._hasKeywords(lowerTokenSet, rawTokenSet, MODAL_KEYWORDS_MULTI, MODAL_KEYWORDS_UPPER),
      hasTemporal: this._hasKeywords(lowerTokenSet, rawTokenSet, TEMPORAL_KEYWORDS_MULTI, TEMPORAL_KEYWORDS_UPPER),
      hasDeontic: this._hasKeywords(lowerTokenSet, rawTokenSet, DEONTIC_KEYWORDS_MULTI, DEONTIC_KEYWORDS_UPPER),
      hasArithmetic: this._hasAny(lowerTokenSet, ARITHMETIC_KEYWORDS),
      quantifierDepth: this._quantifierDepth(tokens),
    });
  }

  measureComplexity(formula: unknown): FormulaComplexity {
    const text = this._formulaText(formula);
    const tokens = this._tokenize(text);
    const rawTokenSet = new Set(tokens);
    const lowerTokenSet = new Set(tokens.map(t => t.toLowerCase()));
    return this._measureComplexity({
      nestingLevel: this._nestingLevel(text),
      quantifierDepth: this._quantifierDepth(tokens),
      operatorCount: this._operatorCount(lowerTokenSet),
      hasModal: this._hasKeywords(lowerTokenSet, rawTokenSet, MODAL_KEYWORDS_MULTI, MODAL_KEYWORDS_UPPER),
      hasTemporal: this._hasKeywords(lowerTokenSet, rawTokenSet, TEMPORAL_KEYWORDS_MULTI, TEMPORAL_KEYWORDS_UPPER),
      hasDeontic: this._hasKeywords(lowerTokenSet, rawTokenSet, DEONTIC_KEYWORDS_MULTI, DEONTIC_KEYWORDS_UPPER),
      hasArithmetic: this._hasAny(lowerTokenSet, ARITHMETIC_KEYWORDS),
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _formulaText(formula: unknown): string {
    if (typeof formula === 'string') return formula;
    if (formula && typeof (formula as { toString(): string }).toString === 'function') {
      return (formula as { toString(): string }).toString();
    }
    return String(formula);
  }

  private _tokenize(text: string): string[] {
    return text.split(/[\s,;()\[\]{}\n\r\t"']+/).filter(t => t.length > 0);
  }

  /**
   * Check if any multi-letter keyword (case-insensitive) or any uppercase
   * single-letter operator appears in the token stream.
   */
  private _hasKeywords(
    lowerTokenSet: Set<string>,
    rawTokenSet: Set<string>,
    multiSet: Set<string>,
    upperSet: Set<string>,
  ): boolean {
    for (const kw of multiSet) {
      if (lowerTokenSet.has(kw.toLowerCase())) return true;
    }
    for (const kw of upperSet) {
      if (rawTokenSet.has(kw)) return true; // exact uppercase match
    }
    return false;
  }

  // Legacy: only for arithmetic (no single-char keywords)
  private _hasAny(tokenSet: Set<string>, keywords: Set<string>): boolean {
    for (const kw of keywords) {
      if (tokenSet.has(kw.toLowerCase())) return true;
    }
    return false;
  }

  private _quantifierDepth(tokens: string[]): number {
    let max = 0;
    let depth = 0;
    for (const t of tokens) {
      const lo = t.toLowerCase();
      if (QUANTIFIERS_MULTI.has(lo) || QUANTIFIERS_SYM.has(t)) {
        depth++;
        if (depth > max) max = depth;
      }
    }
    return max;
  }

  private _nestingLevel(text: string): number {
    let max = 0;
    let depth = 0;
    for (const ch of text) {
      if (ch === '(') { depth++; if (depth > max) max = depth; }
      else if (ch === ')') { depth = Math.max(0, depth - 1); }
    }
    return max;
  }

  private _operatorCount(tokenSet: Set<string>): number {
    let count = 0;
    for (const op of LOGIC_OPERATORS) {
      if (tokenSet.has(op.toLowerCase())) count++;
    }
    return count;
  }

  private _classifyType(f: {
    hasModal: boolean; hasTemporal: boolean; hasDeontic: boolean;
    hasArithmetic: boolean; quantifierDepth: number;
  }): FormulaType {
    const modalities = [f.hasModal, f.hasTemporal, f.hasDeontic].filter(Boolean).length;
    if (modalities > 1) return FormulaType.MIXED_MODAL;
    if (f.hasDeontic) return FormulaType.DEONTIC;
    if (f.hasTemporal) return FormulaType.TEMPORAL;
    if (f.hasModal) return FormulaType.MODAL;
    if (f.hasArithmetic) return FormulaType.ARITHMETIC;
    if (f.quantifierDepth > 0) return FormulaType.QUANTIFIED;
    return FormulaType.PROPOSITIONAL;
  }

  private _measureComplexity(f: {
    nestingLevel: number; quantifierDepth: number; operatorCount: number;
    hasModal: boolean; hasTemporal: boolean; hasDeontic: boolean; hasArithmetic: boolean;
  }): FormulaComplexity {
    const score = this._complexityScore(f);
    if (score <= 10) return FormulaComplexity.TRIVIAL;
    if (score <= 30) return FormulaComplexity.SIMPLE;
    if (score <= 55) return FormulaComplexity.MODERATE;
    if (score <= 75) return FormulaComplexity.COMPLEX;
    return FormulaComplexity.VERY_COMPLEX;
  }

  private _complexityScore(f: {
    nestingLevel: number; quantifierDepth: number; operatorCount: number;
    hasModal: boolean; hasTemporal: boolean; hasDeontic: boolean; hasArithmetic: boolean;
  }): number {
    let score = 0;
    score += Math.min(f.nestingLevel * 5, 25);
    score += Math.min(f.quantifierDepth * 10, 30);
    score += Math.min(f.operatorCount * 3, 15);
    if (f.hasModal) score += 10;
    if (f.hasTemporal) score += 10;
    if (f.hasDeontic) score += 10;
    if (f.hasArithmetic) score += 10;
    return Math.min(score, 100);
  }

  private _recommendProvers(
    formulaType: FormulaType,
    complexity: FormulaComplexity,
    features: { hasModal: boolean; hasTemporal: boolean; hasDeontic: boolean; hasArithmetic: boolean },
  ): string[] {
    const ranked: Array<{ name: string; score: number }> = [];
    for (const [name, profile] of Object.entries(PROVER_PROFILES)) {
      // Disqualify provers that lack required capabilities
      if (features.hasModal && !profile.supportsModal && name !== 'lean' && name !== 'coq') continue;
      if (features.hasTemporal && !profile.supportsTemporal && name !== 'lean' && name !== 'coq') continue;
      if (features.hasDeontic && !profile.supportsDeontic && name !== 'lean' && name !== 'coq') continue;
      if (features.hasArithmetic && !profile.supportsArithmetic && name === 'native') continue;
      if (complexity > profile.maxComplexity) continue;

      let score = profile.goodFor.includes(formulaType) ? 20 : 0;
      if (profile.quantifierHandling === 'excellent') score += 10;
      else if (profile.quantifierHandling === 'good') score += 5;
      const speedMap: Record<string, number> = { very_fast: 15, fast: 10, medium: 5, slow: 0, very_slow: -5 };
      score += speedMap[profile.speed] ?? 0;
      ranked.push({ name, score });
    }
    ranked.sort((a, b) => b.score - a.score);
    // Always include at least one fallback
    if (ranked.length === 0) return ['lean', 'coq'];
    return ranked.map(r => r.name);
  }
}
