/**
 * MLConfidenceScorer — heuristic confidence scoring for FOL conversion.
 *
 * Mirrors ipfs_datasets_py/logic/ml_confidence.py (437 lines):
 *   class FeatureExtractor
 *   class MLConfidenceScorer
 *   def _heuristic_confidence(sentence, fol_formula, predicates, quantifiers, operators)
 *
 * The Python version uses XGBoost/LightGBM when available, but the TypeScript
 * port uses the `_heuristic_confidence()` fallback — pure keyword/feature-based
 * scoring with no ML dependency.
 *
 * Used to replace the basic confidence heuristic in `FolTextConverter.convert()`.
 *
 * T-85.
 * Reference: ipfs_datasets_py/logic/ml_confidence.py §MLConfidenceScorer
 */

import type { FolPredicate, FolQuantifier, FolOperator } from './fol-text-converter.js';

// ---------------------------------------------------------------------------
// Feature types
// ---------------------------------------------------------------------------

/**
 * Feature record for a single FOL conversion instance.
 * All values are numeric; most are Boolean-encoded as 0/1.
 *
 * Python ref: FeatureExtractor.extract_features() output.
 */
export interface FolFeatures {
  /** Total number of predicates extracted. */
  total_predicates: number;
  /** Number of noun predicates. */
  noun_count: number;
  /** Number of verb predicates. */
  verb_count: number;
  /** Number of adjective predicates. */
  adjective_count: number;
  /** Number of quantifiers detected. */
  quantifier_count: number;
  /** 1 if any universal quantifier found. */
  has_universal: number;
  /** 1 if any existential quantifier found. */
  has_existential: number;
  /** Number of logical operators. */
  operator_count: number;
  /** 1 if AND/conjunction operator. */
  has_and: number;
  /** 1 if OR/disjunction operator. */
  has_or: number;
  /** 1 if implication operator. */
  has_implies: number;
  /** 1 if negation operator. */
  has_not: number;
  /** Number of FOL keywords in the sentence. */
  keyword_density: number;
  /** Length of the input sentence in characters. */
  sentence_length: number;
  /** Length of the FOL formula string. */
  formula_length: number;
  /** 1 if the formula uses ∀/∃ quantifier symbols. */
  has_quantifier_symbol: number;
  /** 1 if the formula uses → implication symbol. */
  has_implication_symbol: number;
  /** Number of logical relations extracted. */
  relation_count: number;
}

// ---------------------------------------------------------------------------
// FeatureExtractor
// ---------------------------------------------------------------------------

const FOL_KEYWORDS = ['all', 'some', 'if', 'then', 'and', 'or', 'not', 'every', 'any', 'each', 'exists', 'for'];

/**
 * Extract numeric features from a FOL conversion instance.
 *
 * Mirrors `FeatureExtractor.extract_features()` in Python.
 */
export class FeatureExtractor {
  extractFeatures(
    sentence: string,
    folFormula: string,
    predicates: FolPredicate,
    quantifiers: FolQuantifier[],
    operators: FolOperator[],
  ): FolFeatures {
    const totalPredicates = predicates.nouns.length + predicates.verbs.length + predicates.adjectives.length;
    const lowerSentence = sentence.toLowerCase();

    const keywordCount = FOL_KEYWORDS.reduce((sum, kw) =>
      sum + (lowerSentence.split(kw).length - 1), 0);

    return {
      total_predicates:       totalPredicates,
      noun_count:             predicates.nouns.length,
      verb_count:             predicates.verbs.length,
      adjective_count:        predicates.adjectives.length,
      quantifier_count:       quantifiers.length,
      has_universal:          quantifiers.some(q => q.type === 'universal') ? 1 : 0,
      has_existential:        quantifiers.some(q => q.type === 'existential') ? 1 : 0,
      operator_count:         operators.length,
      has_and:                operators.some(o => o.type === 'and') ? 1 : 0,
      has_or:                 operators.some(o => o.type === 'or') ? 1 : 0,
      has_implies:            operators.some(o => o.type === 'implies') ? 1 : 0,
      has_not:                operators.some(o => o.type === 'not') ? 1 : 0,
      keyword_density:        keywordCount,
      sentence_length:        sentence.length,
      formula_length:         folFormula.length,
      has_quantifier_symbol:  (folFormula.includes('∀') || folFormula.includes('∃')) ? 1 : 0,
      has_implication_symbol: folFormula.includes('→') ? 1 : 0,
      relation_count:         predicates.relations.length,
    };
  }
}

// ---------------------------------------------------------------------------
// MLConfidenceScorer
// ---------------------------------------------------------------------------

/**
 * MLConfidenceScorer — heuristic confidence scorer for FOL conversion.
 *
 * In the Python reference, this uses XGBoost/LightGBM when available.
 * The TypeScript port uses the pure-heuristic fallback which matches
 * `_heuristic_confidence()` in `ml_confidence.py`.
 *
 * Heuristic rules (mirrors Python reference):
 *   +0.3 for having any predicates
 *   +0.2 for having quantifiers
 *   +0.2 for having logical operators
 *   +0.0–0.2 for keyword density (0.05 per keyword, capped at 0.2)
 *   −0.2 for formula shorter than 5 chars
 *   −0.1 for formula longer than 200 chars
 *
 * Usage:
 * ```ts
 * const scorer = new MLConfidenceScorer();
 * const score = scorer.predictConfidence('All humans are mortal.', '∀x (Human(x) → Mortal(x))', preds, qs, ops);
 * console.log(score); // ~0.9
 * ```
 */
export class MLConfidenceScorer {
  private readonly extractor = new FeatureExtractor();

  /**
   * Predict confidence score for a FOL conversion.
   *
   * @param sentence   Original input sentence.
   * @param folFormula Generated FOL formula.
   * @param predicates Extracted predicates (from `extractPredicates()`).
   * @param quantifiers Extracted quantifiers.
   * @param operators  Extracted logical operators.
   * @returns Confidence score ∈ [0, 1].
   */
  predictConfidence(
    sentence: string,
    folFormula: string,
    predicates: FolPredicate,
    quantifiers: FolQuantifier[],
    operators: FolOperator[],
  ): number {
    const features = this.extractor.extractFeatures(sentence, folFormula, predicates, quantifiers, operators);
    return this._heuristicConfidence(features, folFormula);
  }

  /**
   * Extract features for a single conversion instance.
   * Useful for debugging and analysis.
   */
  extractFeatures(
    sentence: string,
    folFormula: string,
    predicates: FolPredicate,
    quantifiers: FolQuantifier[],
    operators: FolOperator[],
  ): FolFeatures {
    return this.extractor.extractFeatures(sentence, folFormula, predicates, quantifiers, operators);
  }

  // ---------------------------------------------------------------------------
  // Heuristic implementation (mirrors Python _heuristic_confidence)
  // ---------------------------------------------------------------------------

  private _heuristicConfidence(features: FolFeatures, folFormula: string): number {
    let score = 0;

    // Base score for having any predicates
    if (features.total_predicates > 0) score += 0.3;

    // Bonus for logical structure
    if (features.quantifier_count > 0) score += 0.2;
    if (features.operator_count > 0) score += 0.2;

    // Bonus for keyword density (0.05 per keyword, capped at 0.2)
    score += Math.min(0.2, features.keyword_density * 0.05);

    // Penalty for very short or very long formulas
    if (folFormula.length < 5)   score -= 0.2;
    if (folFormula.length > 200) score -= 0.1;

    return Math.max(0, Math.min(1, score));
  }
}
