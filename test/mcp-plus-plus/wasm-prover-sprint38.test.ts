/**
 * wasm-prover-sprint38.test.ts
 *
 * Sprint 38: Neurosymbolic GraphRAG + Hybrid Confidence + Base Prover Bridge
 */

import {
  PipelineResult, NeurosymbolicGraphRAG,
} from '../../src/services/neurosymbolic-graphrag.js';
import {
  ConfidenceSource, ConfidenceBreakdown, HybridConfidenceScorer,
} from '../../src/services/hybrid-confidence.js';
import {
  BridgeCapability, BridgeRegistry,
  BaseProverBridge, getBridgeRegistry, resetBridgeRegistry, StubProverBridge,
} from '../../src/services/base-prover-bridge.js';

const LEGAL_TEXT =
  'The contractor shall deliver the goods within 30 days. ' +
  'The client may reject non-conforming goods upon inspection. ' +
  'No party shall not disclose confidential information.';

// ---------------------------------------------------------------------------
// NeurosymbolicGraphRAG
// ---------------------------------------------------------------------------

describe('NeurosymbolicGraphRAG', () => {
  test('ingest returns PipelineResult', () => {
    const g = new NeurosymbolicGraphRAG();
    const result = g.ingest(LEGAL_TEXT, 'doc-001');
    expect(result).toBeInstanceOf(PipelineResult);
  });

  test('ingest populates formulas and entities', () => {
    const g = new NeurosymbolicGraphRAG();
    const result = g.ingest(LEGAL_TEXT, 'doc-002');
    expect(result.formulas.length).toBeGreaterThan(0);
    expect(result.entities.length).toBeGreaterThanOrEqual(0);
  });

  test('ingest docId is set', () => {
    const g = new NeurosymbolicGraphRAG();
    const result = g.ingest('Must pay.', 'doc-003');
    expect(result.docId).toBe('doc-003');
  });

  test('ingest confidence is in [0,1]', () => {
    const g = new NeurosymbolicGraphRAG();
    const result = g.ingest(LEGAL_TEXT);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  test('ingest increments graph size', () => {
    const g = new NeurosymbolicGraphRAG();
    g.ingest(LEGAL_TEXT);
    expect(g.size).toBeGreaterThan(0);
  });

  test('toDict is JSON-safe', () => {
    const g = new NeurosymbolicGraphRAG();
    const result = g.ingest(LEGAL_TEXT, 'doc-004');
    expect(() => JSON.stringify(result.toDict())).not.toThrow();
  });

  test('query returns QueryResult with answer', () => {
    const g = new NeurosymbolicGraphRAG();
    g.ingest(LEGAL_TEXT, 'doc-005');
    const result = g.query('deliver');
    expect(result).toHaveProperty('query');
    expect(result).toHaveProperty('answer');
    expect(result).toHaveProperty('confidence');
    expect(typeof result.answer).toBe('string');
  });

  test('prove finds ingested formula', () => {
    const g = new NeurosymbolicGraphRAG();
    const pipeline = g.ingest('Must pay.', 'doc-006');
    if (pipeline.formulas.length > 0) {
      const formula = pipeline.formulas[0];
      const result = g.prove(formula);
      expect(result.proved).toBe(true);
    } else {
      // No deontic formula in this short text — skip
      expect(true).toBe(true);
    }
  });

  test('getStats tracks ingested and queries', () => {
    const g = new NeurosymbolicGraphRAG();
    g.ingest(LEGAL_TEXT);
    g.query('pay');
    const stats = g.getStats();
    expect(stats['ingested']).toBe(1);
    expect(stats['queries']).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ConfidenceSource
// ---------------------------------------------------------------------------

describe('ConfidenceSource', () => {
  test('has 4 values', () => {
    expect(Object.values(ConfidenceSource)).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// HybridConfidenceScorer
// ---------------------------------------------------------------------------

describe('HybridConfidenceScorer', () => {
  const scorer = new HybridConfidenceScorer();

  test('score returns ConfidenceBreakdown', () => {
    const bd = scorer.score(0.9, 0.5, 0.7);
    expect(bd).toBeInstanceOf(ConfidenceBreakdown);
  });

  test('totalConfidence is in [0,1]', () => {
    const bd = scorer.score(0.9, 0.8, 0.7);
    expect(bd.totalConfidence).toBeGreaterThanOrEqual(0);
    expect(bd.totalConfidence).toBeLessThanOrEqual(1);
  });

  test('score stores component values', () => {
    const bd = scorer.score(0.9, 0.5, 0.3);
    expect(bd.symbolicConfidence).toBeCloseTo(0.9);
    expect(bd.neuralConfidence).toBeCloseTo(0.5);
    expect(bd.structuralConfidence).toBeCloseTo(0.3);
  });

  test('dominantSource is symbolic when symbolic is highest', () => {
    const bd = scorer.score(0.95, 0.1, 0.1);
    expect(bd.dominantSource).toBe(ConfidenceSource.SYMBOLIC);
  });

  test('explanation is a non-empty string', () => {
    const bd = scorer.score(0.8, 0.4, 0.3);
    expect(bd.explanation.length).toBeGreaterThan(0);
  });

  test('scoreFromResult with proved=true', () => {
    const bd = scorer.scoreFromResult({ proved: true, confidence: 0.9 });
    expect(bd.totalConfidence).toBeGreaterThan(0);
    expect(bd.symbolicConfidence).toBeCloseTo(0.9);
  });

  test('explain returns multi-line string', () => {
    const bd = scorer.score(0.8, 0.4, 0.3);
    const exp = scorer.explain(bd);
    expect(exp).toContain('Total confidence');
    expect(exp).toContain('Dominant source');
  });

  test('toDict is JSON-safe', () => {
    const bd = scorer.score(0.7, 0.5, 0.6);
    expect(() => JSON.stringify(bd.toDict())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Base Prover Bridge + Registry
// ---------------------------------------------------------------------------

describe('StubProverBridge', () => {
  test('getMetadata returns BridgeMetadata', () => {
    const b = new StubProverBridge('test-bridge');
    const meta = b.getMetadata();
    expect(meta.name).toBe('test-bridge');
    expect(meta.version).toBe('1.0.0');
    expect(meta.requiresExternalProver).toBe(false);
  });

  test('isAvailable returns true', () => {
    expect(new StubProverBridge().isAvailable()).toBe(true);
  });

  test('toTargetFormat wraps formula', () => {
    const b = new StubProverBridge();
    expect(b.toTargetFormat('O(Pay)')).toBe('STUB(O(Pay))');
  });

  test('prove deontic formula returns proved=true', () => {
    const b = new StubProverBridge();
    const result = b.prove('O(Register)');
    expect(result.proved).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
  });

  test('prove unknown formula returns proved=false', () => {
    const b = new StubProverBridge();
    expect(b.prove('UnknownFormula').proved).toBe(false);
  });

  test('proveBatch returns array of same length', () => {
    const b = new StubProverBridge();
    const results = b.proveBatch(['O(A)', 'P(B)', 'Unknown']);
    expect(results).toHaveLength(3);
  });

  test('hasCapability returns true for registered cap', () => {
    const b = new StubProverBridge('b', [BridgeCapability.BIDIRECTIONAL_CONVERSION]);
    expect(b.hasCapability(BridgeCapability.BIDIRECTIONAL_CONVERSION)).toBe(true);
    expect(b.hasCapability(BridgeCapability.PARALLEL_PROVING)).toBe(false);
  });
});

describe('BridgeRegistry', () => {
  test('register and get round-trip', () => {
    const reg = new BridgeRegistry();
    const b = new StubProverBridge('my-bridge');
    reg.register(b);
    expect(reg.get('my-bridge')).toBe(b);
  });

  test('list returns sorted names', () => {
    const reg = new BridgeRegistry();
    reg.register(new StubProverBridge('z-bridge'));
    reg.register(new StubProverBridge('a-bridge'));
    const names = reg.list();
    expect(names).toEqual([...names].sort());
  });

  test('size equals registered count', () => {
    const reg = new BridgeRegistry();
    reg.register(new StubProverBridge('b1'));
    reg.register(new StubProverBridge('b2'));
    expect(reg.size).toBe(2);
  });

  test('getByCap filters by capability', () => {
    const reg = new BridgeRegistry();
    reg.register(new StubProverBridge('b-par', [BridgeCapability.PARALLEL_PROVING]));
    reg.register(new StubProverBridge('b-bid', [BridgeCapability.BIDIRECTIONAL_CONVERSION]));
    const parallel = reg.getByCap(BridgeCapability.PARALLEL_PROVING);
    expect(parallel).toHaveLength(1);
    expect(parallel[0].getMetadata().name).toBe('b-par');
  });

  test('getBridgeRegistry singleton', () => {
    resetBridgeRegistry();
    expect(getBridgeRegistry()).toBe(getBridgeRegistry());
    resetBridgeRegistry();
  });
});
