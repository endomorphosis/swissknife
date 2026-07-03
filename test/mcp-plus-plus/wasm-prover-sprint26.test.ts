/**
 * wasm-prover-sprint26.test.ts
 *
 * Sprint 26: Bridge Shared Types + Registry + ZKP Attestation Bridge
 */

import {
  LogicIRView, LegalIRDocument, RoundTripMetrics,
  ProofGateResult, GraphProjectionResult, BridgeEvaluationReport,
} from '../../src/services/bridge-types.js';
import {
  LogicBridgeSpec, SPECS,
  logicBridgeSpecs, logicBridgeSpec, logicBridgeManifest,
  bridgeNameForComponent,
} from '../../src/services/bridge-registry.js';
import {
  ZkpAttestationBridgeAdapter,
} from '../../src/services/zkp-attestation-bridge.js';

// ---------------------------------------------------------------------------
// LogicIRView
// ---------------------------------------------------------------------------

describe('LogicIRView', () => {
  test('constructs with defaults', () => {
    const v = new LogicIRView({ name: 'my_view' });
    expect(v.name).toBe('my_view');
    expect(v.format).toBe('');
    expect(v.sourceComponent).toBe('');
    expect(v.payload).toEqual({});
  });

  test('toDict serializes all fields', () => {
    const v = new LogicIRView({ name: 'tdfol_formulas', format: 'tdfol', sourceComponent: 'TDFOL.prover', payload: { count: 3 } });
    const d = v.toDict();
    expect(d['name']).toBe('tdfol_formulas');
    expect(d['format']).toBe('tdfol');
    expect(d['source_component']).toBe('TDFOL.prover');
  });
});

// ---------------------------------------------------------------------------
// LegalIRDocument
// ---------------------------------------------------------------------------

describe('LegalIRDocument', () => {
  function makeDoc(views: Record<string, LogicIRView> = {}): LegalIRDocument {
    return new LegalIRDocument({
      documentId: 'doc-001',
      sourceText: 'No person shall be deprived of liberty.',
      normalizedText: 'No person shall be deprived of liberty.',
      views,
    });
  }

  test('defaults to correct version and source', () => {
    const doc = makeDoc();
    expect(doc.version).toBe('legal-ir-bridge-v1');
    expect(doc.source).toBe('us_code');
  });

  test('hasFrameLogic false when no triples', () => {
    expect(makeDoc().hasFrameLogic).toBe(false);
  });

  test('hasFrameLogic true when triples present', () => {
    const doc = new LegalIRDocument({
      documentId: 'x', sourceText: 't', normalizedText: 't',
      frameLogicTriples: [{ subject: 'a', predicate: 'b', object: 'c' }],
    });
    expect(doc.hasFrameLogic).toBe(true);
  });

  test('canonicalHash returns 64-char hex string', () => {
    const hash = makeDoc().canonicalHash();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('canonicalHash is deterministic', () => {
    expect(makeDoc().canonicalHash()).toBe(makeDoc().canonicalHash());
  });

  test('toDict includes all top-level keys', () => {
    const d = makeDoc().toDict();
    for (const k of ['document_id', 'source_text', 'normalized_text', 'version', 'views']) {
      expect(d).toHaveProperty(k);
    }
  });

  test('toJson is valid JSON', () => {
    expect(() => JSON.parse(makeDoc().toJson())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// RoundTripMetrics
// ---------------------------------------------------------------------------

describe('RoundTripMetrics', () => {
  test('fromLossMapping reads known keys', () => {
    const m = RoundTripMetrics.fromLossMapping({
      cosine_similarity: 0.9,
      cosine_loss: 0.1,
      cross_entropy_loss: 0.5,
    });
    expect(m.cosineSimilarity).toBeCloseTo(0.9);
    expect(m.cosineLoss).toBeCloseTo(0.1);
    expect(m.crossEntropyLoss).toBeCloseTo(0.5);
  });

  test('fromLossMapping puts unknown keys in extraLosses', () => {
    const m = RoundTripMetrics.fromLossMapping({ my_custom_loss: 0.25 });
    expect(m.extraLosses['my_custom_loss']).toBeCloseTo(0.25);
  });

  test('totalLoss sums loss terms', () => {
    const m = new RoundTripMetrics({ cosineLoss: 0.1, crossEntropyLoss: 0.2, reconstructionLoss: 0.3 });
    expect(m.totalLoss()).toBeCloseTo(0.6);
  });

  test('toDict contains total_loss', () => {
    const d = new RoundTripMetrics({ cosineLoss: 0.5 }).toDict();
    expect(d).toHaveProperty('total_loss');
  });
});

// ---------------------------------------------------------------------------
// ProofGateResult
// ---------------------------------------------------------------------------

describe('ProofGateResult', () => {
  test('compiles true when all attempted are valid', () => {
    const g = new ProofGateResult({ attemptedCount: 3, validCount: 3 });
    expect(g.compiles).toBe(true);
  });

  test('compiles false when partial valid', () => {
    const g = new ProofGateResult({ attemptedCount: 3, validCount: 2 });
    expect(g.compiles).toBe(false);
  });

  test('failureRatio returns 1 when nothing attempted', () => {
    expect(new ProofGateResult().failureRatio).toBe(1);
  });

  test('disabled() factory produces a passing gate', () => {
    const g = ProofGateResult.disabled('test');
    expect(g.compiles).toBe(true);
    expect(g.verifiedBy).toContain('proof-gate:disabled');
  });
});

// ---------------------------------------------------------------------------
// Bridge Registry
// ---------------------------------------------------------------------------

describe('logicBridgeSpecs', () => {
  test('returns 6 bridge specs', () => {
    expect(logicBridgeSpecs()).toHaveLength(6);
  });

  test('all specs are implemented', () => {
    for (const s of logicBridgeSpecs({ implementedOnly: true })) {
      expect(s.implemented).toBe(true);
    }
  });

  test('spec names are unique', () => {
    const names = logicBridgeSpecs().map(s => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('logicBridgeSpec', () => {
  test('finds zkp_attestation spec', () => {
    const spec = logicBridgeSpec('zkp_attestation');
    expect(spec.name).toBe('zkp_attestation');
    expect(spec.targetComponent).toBe('zkp.circuits');
    expect(spec.roles).toContain('zkp');
  });

  test('throws for unknown name', () => {
    expect(() => logicBridgeSpec('nonexistent_bridge')).toThrow();
  });
});

describe('logicBridgeManifest', () => {
  test('returns manifest with bridge_count', () => {
    const m = logicBridgeManifest();
    expect(m['bridge_count']).toBe(6);
  });

  test('manifest has roles and target_components', () => {
    const m = logicBridgeManifest();
    expect(m).toHaveProperty('roles');
    expect(m).toHaveProperty('target_components');
    expect(m).toHaveProperty('implemented_bridges');
  });

  test('roles includes zkp', () => {
    const m = logicBridgeManifest() as { roles: Record<string, string[]> };
    expect(m.roles['zkp']).toContain('zkp_attestation');
  });
});

describe('bridgeNameForComponent', () => {
  test('finds zkp.circuits bridge', () => {
    expect(bridgeNameForComponent('zkp.circuits')).toBe('zkp_attestation');
  });

  test('finds TDFOL.prover bridge', () => {
    expect(bridgeNameForComponent('TDFOL.prover')).toBe('fol_tdfol');
  });

  test('returns null for empty string', () => {
    expect(bridgeNameForComponent('')).toBeNull();
  });

  test('returns null for unknown component', () => {
    expect(bridgeNameForComponent('totally.unknown.thing')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ZkpAttestationBridgeAdapter
// ---------------------------------------------------------------------------

describe('ZkpAttestationBridgeAdapter', () => {
  const adapter = new ZkpAttestationBridgeAdapter();

  test('encode returns doc and context', () => {
    const { doc, context } = adapter.encode('No person shall be deprived of liberty.');
    expect(doc).toBeInstanceOf(LegalIRDocument);
    expect(context).toHaveProperty('attestations');
    expect(context).toHaveProperty('document_id');
  });

  test('doc has required views', () => {
    const { doc } = adapter.encode('All contracts must be signed.');
    expect(doc.views).toHaveProperty('zkp_attestations');
    expect(doc.views).toHaveProperty('zkp_public_inputs');
    expect(doc.views).toHaveProperty('frame_logic');
    expect(doc.views).toHaveProperty('neo4j_graph_data');
  });

  test('canonicalHash is stable across calls', () => {
    const text = 'No person shall be deprived of liberty.';
    const { doc: d1 } = adapter.encode(text, { documentId: 'doc-stable-1' });
    const { doc: d2 } = adapter.encode(text, { documentId: 'doc-stable-1' });
    expect(d1.canonicalHash()).toBe(d2.canonicalHash());
  });

  test('attestations have proofHash and verified fields', () => {
    const { context } = adapter.encode('The defendant shall appear in court.');
    for (const att of context.attestations) {
      expect(att).toHaveProperty('proofHash');
      expect(att).toHaveProperty('verified');
      expect(att.backend).toBe('simulated');
    }
  });

  test('empty text produces at most one fallback attestation', () => {
    const { context } = adapter.encode('');
    expect(context.attestations.length).toBeLessThanOrEqual(1);
  });

  test('frame_logic triples are populated', () => {
    const { doc } = adapter.encode('All persons are equal before the law.');
    expect(doc.frameLogicTriples.length).toBeGreaterThan(0);
  });

  test('evaluate returns BridgeEvaluationReport', () => {
    const report = adapter.evaluate('No person shall be deprived of liberty.');
    expect(report).toBeInstanceOf(BridgeEvaluationReport);
    expect(report.success).toBe(true);
    expect(report.bridgeName).toBe('zkp_attestation');
  });
});
