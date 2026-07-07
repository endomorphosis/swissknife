/**
 * wasm-prover-sprint40.test.ts
 *
 * Sprint 40: Embedding Prover + Prover Backend Mixin + Symbolic FOL Bridge
 */

import {
  cosineSimilarity, EmbeddingEnhancedProver,
} from '../../src/services/logic/shared/embedding-prover.js';
import {
  generateDeonticSMT2Axioms, ProverBackendMixin,
} from '../../src/services/proof-engine/prover-backend-mixin.js';
import {
  LogicalComponents, SymbolicFOLBridge,
} from '../../src/services/symbolic-fol-bridge.js';

const LEGAL_TEXT =
  'The contractor shall deliver the goods within 30 days. ' +
  'The client may inspect the goods upon delivery.';

// ---------------------------------------------------------------------------
// cosineSimilarity
// ---------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  test('identical vectors have similarity 1', () => {
    const v = [0.5, 0.5, 0.5, 0.5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  test('orthogonal vectors have similarity 0', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });

  test('opposite vectors have similarity -1', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  test('zero vector returns 0', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// EmbeddingEnhancedProver
// ---------------------------------------------------------------------------

describe('EmbeddingEnhancedProver', () => {
  const prover = new EmbeddingEnhancedProver();

  test('computeSimilarity returns value in [-1,1]', () => {
    const sim = prover.computeSimilarity('O(Pay)', 'O(Deliver)');
    expect(sim).toBeGreaterThanOrEqual(-1);
    expect(sim).toBeLessThanOrEqual(1);
  });

  test('exact match formula proves with method=exact_match', () => {
    const result = prover.prove('O(Pay)', ['O(Pay)', 'P(Inspect)']);
    expect(result.proved).toBe(true);
    expect(result.method).toBe('exact_match');
    expect(result.confidence).toBe(1.0);
  });

  test('no match returns proved=false', () => {
    const result = prover.prove('CompletelyDifferentFormula_xyz', ['O(Pay)', 'P(Inspect)']);
    expect(result.proved).toBe(false);
  });

  test('retrieveSimilar returns sorted by similarity', () => {
    const corpus = ['O(Pay)', 'P(Inspect)', 'F(Disclose)', 'O(Deliver)'];
    const results = prover.retrieveSimilar('O(Pay)', corpus, 3);
    expect(results).toHaveLength(3);
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].similarity).toBeGreaterThanOrEqual(results[i + 1].similarity);
    }
  });

  test('retrieveSimilar includes formula and similarity', () => {
    const results = prover.retrieveSimilar('O(A)', ['O(A)', 'P(B)'], 2);
    for (const r of results) {
      expect(r).toHaveProperty('formula');
      expect(r).toHaveProperty('similarity');
    }
  });

  test('cacheSize increments on embeddings', () => {
    const p = new EmbeddingEnhancedProver();
    p.computeSimilarity('A', 'B');
    expect(p.cacheSize).toBeGreaterThan(0);
  });

  test('clearCache resets cacheSize to 0', () => {
    const p = new EmbeddingEnhancedProver();
    p.computeSimilarity('A', 'B');
    p.clearCache();
    expect(p.cacheSize).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// generateDeonticSMT2Axioms
// ---------------------------------------------------------------------------

describe('generateDeonticSMT2Axioms', () => {
  test('returns declarations and axioms', () => {
    const ax = generateDeonticSMT2Axioms();
    expect(ax.declarations.length).toBeGreaterThan(0);
    expect(ax.axioms.length).toBeGreaterThan(0);
  });

  test('combined is non-empty string', () => {
    expect(generateDeonticSMT2Axioms().combined.length).toBeGreaterThan(0);
  });

  test('includes deontic declarations', () => {
    const ax = generateDeonticSMT2Axioms();
    expect(ax.combined).toContain('Obligatory');
    expect(ax.combined).toContain('Permitted');
    expect(ax.combined).toContain('Forbidden');
  });
});

// ---------------------------------------------------------------------------
// ProverBackendMixin
// ---------------------------------------------------------------------------

describe('ProverBackendMixin', () => {
  const mixin = new ProverBackendMixin();

  test('executeZ3Proof returns ProofExecution', () => {
    const result = mixin.executeZ3Proof('O(Pay)');
    expect(result.target).toBe('z3');
    expect(typeof result.success).toBe('boolean');
    expect(result.timeMs).toBeGreaterThanOrEqual(0);
  });

  test('executeZ3Proof succeeds for deontic formula', () => {
    expect(mixin.executeZ3Proof('Obligatory(Agent, Pay)').success).toBe(true);
  });

  test('executeLean4Proof returns lean4 target', () => {
    const result = mixin.executeLean4Proof('O(Pay)');
    expect(result.target).toBe('lean4');
  });

  test('executeCoqProof returns coq target with admit', () => {
    const result = mixin.executeCoqProof('P ∧ Q');
    expect(result.target).toBe('coq');
    expect(result.success).toBe(true);
    expect(result.output).toContain('admit');
  });

  test('checkConsistency consistent for no conflicts', () => {
    const result = mixin.checkConsistency(['O(Pay)', 'P(Inspect)']);
    expect(result.isConsistent).toBe(true);
    expect(result.formulaCount).toBe(2);
  });

  test('checkConsistency detects O/F conflict', () => {
    const result = mixin.checkConsistency(['O(deliver goods)', 'F(deliver goods)']);
    expect(result.isConsistent).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LogicalComponents
// ---------------------------------------------------------------------------

describe('LogicalComponents', () => {
  test('constructs with defaults', () => {
    const lc = new LogicalComponents({});
    expect(lc.quantifiers).toHaveLength(0);
    expect(lc.confidence).toBe(0);
  });

  test('dict-like get() retrieves field', () => {
    const lc = new LogicalComponents({ predicates: ['Person', 'Agent'], confidence: 0.8 });
    expect(lc.get('confidence')).toBeCloseTo(0.8);
  });

  test('toDict is JSON-safe', () => {
    const lc = new LogicalComponents({ entities: ['Agent'], confidence: 0.7 });
    expect(() => JSON.stringify(lc.toDict())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// SymbolicFOLBridge
// ---------------------------------------------------------------------------

describe('SymbolicFOLBridge', () => {
  const bridge = new SymbolicFOLBridge();

  test('extractComponents returns LogicalComponents', () => {
    const lc = bridge.extractComponents(LEGAL_TEXT);
    expect(lc).toBeInstanceOf(LogicalComponents);
    expect(lc.confidence).toBeGreaterThan(0);
  });

  test('extractComponents detects predicates', () => {
    const lc = bridge.extractComponents('Person(x) → Citizen(x)');
    expect(lc.predicates).toContain('Person');
    expect(lc.predicates).toContain('Citizen');
  });

  test('convert returns FOLConversionResult', () => {
    const result = bridge.convert(LEGAL_TEXT);
    expect(result).toHaveProperty('formula');
    expect(result).toHaveProperty('components');
    expect(result).toHaveProperty('confidence');
  });

  test('convert detects deontic type', () => {
    const result = bridge.convert('O(Pay)');
    expect(result.formulaType).toBe('deontic');
  });

  test('validate balanced formula', () => {
    const v = bridge.validate('P(x) ∧ Q(x)');
    expect(v.isValid).toBe(true);
    expect(v.errors).toHaveLength(0);
  });

  test('validate rejects unbalanced formula', () => {
    const v = bridge.validate('P(x ∧ Q(x)');
    expect(v.isValid).toBe(false);
    expect(v.errors.length).toBeGreaterThan(0);
  });

  test('toDict from convert is JSON-safe', () => {
    const result = bridge.convert('O(Act)');
    expect(() => JSON.stringify(result.toDict())).not.toThrow();
  });
});
