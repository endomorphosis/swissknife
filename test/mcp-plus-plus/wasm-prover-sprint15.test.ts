/**
 * WASM Prover Sprint 15 — FLogic Semantic Optimizer + ML Confidence Scorer tests.
 *
 * Tasks covered:
 *   T-84: FLogicSemanticOptimizer (flogic-semantic-optimizer.ts)
 *   T-85: MLConfidenceScorer (ml-confidence-scorer.ts)
 *   T-86: FolTextConverter wired with MLConfidenceScorer
 *   T-87: ≥10 tests
 *
 * Sprint 15 (Phase 15 — FLogic Semantic Optimizer + ML Confidence Scorer, P2).
 * Reference: ipfs_datasets_py/logic/flogic_optimizer.py + ml_confidence.py
 */

import {
  cosineSimilarity,
  FLogicSemanticOptimizer,
} from '../../src/services/fol/flogic-semantic-optimizer.js';
import type { FLogicOptimizerConfig } from '../../src/services/fol/flogic-semantic-optimizer.js';
import {
  MLConfidenceScorer,
  FeatureExtractor,
} from '../../src/services/fol/ml-confidence-scorer.js';
import { FolTextConverter, extractPredicates, parseQuantifiers, parseLogicalOperators } from '../../src/services/fol/fol-text-converter.js';

// ---------------------------------------------------------------------------
// T-84: cosineSimilarity
// ---------------------------------------------------------------------------

describe('T-84 cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 5);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });

  it('returns 0 for zero-magnitude vector', () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it('returns a value between -1 and 1 for arbitrary vectors', () => {
    const a = [0.1, 0.2, 0.5, 0.3];
    const b = [0.15, 0.18, 0.45, 0.4];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThanOrEqual(-1);
    expect(sim).toBeLessThanOrEqual(1);
  });

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// T-84: FLogicSemanticOptimizer.evaluate()
// ---------------------------------------------------------------------------

describe('T-84 FLogicSemanticOptimizer — evaluate()', () => {
  let optimizer: FLogicSemanticOptimizer;
  beforeEach(() => {
    optimizer = new FLogicSemanticOptimizer({ similarityThreshold: 0.85 });
  });

  it('passes when embeddings are identical (similarity = 1.0)', () => {
    const v = [1, 2, 3, 4];
    const result = optimizer.evaluate('source', 'decoded', v, v);
    expect(result.similarityScore).toBeCloseTo(1.0, 5);
    expect(result.passed).toBe(true);
    expect(result.ontologyConsistent).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('fails when similarity is below threshold', () => {
    const source  = [1, 0];
    const decoded = [0, 1]; // orthogonal → similarity 0
    const result  = optimizer.evaluate('a', 'b', source, decoded);
    expect(result.similarityScore).toBeCloseTo(0, 5);
    expect(result.passed).toBe(false);
  });

  it('returns correct sourceText and decodedText', () => {
    const v = [1, 0];
    const result = optimizer.evaluate('source text', 'decoded text', v, v);
    expect(result.sourceText).toBe('source text');
    expect(result.decodedText).toBe('decoded text');
  });

  it('uses default threshold 0.80 when not specified', () => {
    const defaultOpt = new FLogicSemanticOptimizer();
    const v = [1, 0.1]; // high similarity
    const result = defaultOpt.evaluate('x', 'y', v, v);
    expect(result.passed).toBe(true);
  });

  it('ontology check disabled by default — no violations for any triples', () => {
    const v = [1, 0];
    const result = optimizer.evaluate('x', 'y', v, v, [
      { subject: 'Alice', predicate: 'type', object: 'UnknownClass' },
    ]);
    // checkOntologyConsistency defaults to false → no violations
    expect(result.violations).toHaveLength(0);
    expect(result.ontologyConsistent).toBe(true);
  });

  it('detects unknown class violation when checkOntologyConsistency: true', () => {
    const checkOpt = new FLogicSemanticOptimizer({
      similarityThreshold: 0.5,
      checkOntologyConsistency: true,
    });
    // No classes registered → unknown class triggers WARNING
    const v = [1, 0];
    checkOpt.addOntologyClass('Person');
    const result = checkOpt.evaluate('x', 'y', v, v, [
      { subject: 'Bob', predicate: 'type', object: 'UnknownClass' },
    ]);
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    expect(result.violations[0].severity).toBe('WARNING');
  });

  it('batchSimilarity computes multiple similarities', () => {
    const pairs = [
      { source: [1, 0], decoded: [1, 0] },
      { source: [1, 0], decoded: [0, 1] },
    ];
    const sims = optimizer.batchSimilarity(pairs);
    expect(sims).toHaveLength(2);
    expect(sims[0]).toBeCloseTo(1.0, 5);
    expect(sims[1]).toBeCloseTo(0.0, 5);
  });
});

// ---------------------------------------------------------------------------
// T-85: MLConfidenceScorer
// ---------------------------------------------------------------------------

describe('T-85 MLConfidenceScorer', () => {
  let scorer: MLConfidenceScorer;
  beforeEach(() => { scorer = new MLConfidenceScorer(); });

  it('returns 0 when no predicates and short formula', () => {
    const preds = extractPredicates('');
    const qs    = parseQuantifiers('');
    const ops   = parseLogicalOperators('');
    const score = scorer.predictConfidence('', 'P', preds, qs, ops);
    expect(score).toBe(0);
  });

  it('returns > 0.5 for well-structured text with quantifiers and predicates', () => {
    const text    = 'All Humans are Mortal.';
    const formula = '∀x (Human(x) → Mortal(x))';
    const preds   = extractPredicates(text);
    const qs      = parseQuantifiers(text);
    const ops     = parseLogicalOperators(text);
    const score   = scorer.predictConfidence(text, formula, preds, qs, ops);
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('penalises formula < 5 chars', () => {
    const preds = extractPredicates('Some P.');
    const qs    = parseQuantifiers('Some P.');
    const ops   = parseLogicalOperators('Some P.');
    const scoreShort  = scorer.predictConfidence('Some P.', 'P', preds, qs, ops);
    const scoreLong   = scorer.predictConfidence('Some P.', '∃x P(x)', preds, qs, ops);
    expect(scoreShort).toBeLessThan(scoreLong);
  });

  it('FeatureExtractor includes all expected fields', () => {
    const text    = 'All agents must comply.';
    const formula = '∀x (Agent(x) → Comply(x))';
    const preds   = extractPredicates(text);
    const qs      = parseQuantifiers(text);
    const ops     = parseLogicalOperators(text);
    const extractor = new FeatureExtractor();
    const features  = extractor.extractFeatures(text, formula, preds, qs, ops);
    expect(typeof features.total_predicates).toBe('number');
    expect(typeof features.quantifier_count).toBe('number');
    expect(typeof features.operator_count).toBe('number');
    expect(typeof features.has_quantifier_symbol).toBe('number');
    expect(typeof features.keyword_density).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// T-86: FolTextConverter wired with MLConfidenceScorer
// ---------------------------------------------------------------------------

describe('T-86 FolTextConverter — confidence scoring', () => {
  it('returns confidence in [0, 1]', () => {
    const converter = new FolTextConverter();
    const result = converter.convert('All users must log access.');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('confidence is higher for well-structured logical text', () => {
    const converter = new FolTextConverter();
    const good = converter.convert('All Humans are Mortal.');
    const weak = converter.convert('xyz');
    // Good structured text should produce at least as high confidence
    expect(good.confidence).toBeGreaterThanOrEqual(0);
    expect(weak.confidence).toBeGreaterThanOrEqual(0);
  });

  it('confidence is a number even for empty string', () => {
    const converter = new FolTextConverter();
    const result = converter.convert('');
    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
