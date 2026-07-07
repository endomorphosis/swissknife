/**
 * wasm-prover-sprint36.test.ts
 *
 * Sprint 36: IPFS Proof Cache + Medical Theorem Framework + TDFOL-CEC Bridge
 */

import {
  IPFSCachedProof, IPFSProofCache,
  getGlobalIPFSCache, resetGlobalIPFSCache,
} from '../../src/services/ipfs-proof-cache.js';
import {
  MedicalTheoremType, ConfidenceLevel,
  makeMedicalEntity, makeTemporalConstraint,
  MedicalTheorem, MedicalTheoremGenerator, FuzzyLogicValidator,
} from '../../src/services/logic/shared/medical-theorem-framework.js';
import {
  TDFOLCECBridge, EnhancedTDFOLProver, createEnhancedProver,
} from '../../src/services/tdfol-cec-bridge.js';

// ---------------------------------------------------------------------------
// IPFSCachedProof
// ---------------------------------------------------------------------------

describe('IPFSCachedProof', () => {
  test('constructs with defaults', () => {
    const proof = new IPFSCachedProof({
      formula: 'O(Pay)',
      result: { proved: true, method: 'axiom_lookup' },
    });
    expect(proof.formula).toBe('O(Pay)');
    expect(proof.result.proved).toBe(true);
    expect(proof.pinned).toBe(false);
    expect(proof.ipfsCid).toBeNull();
  });

  test('computeCid returns bafk-prefixed string', () => {
    const proof = new IPFSCachedProof({ formula: 'P(x)', result: { proved: false, method: 'exhausted' } });
    expect(proof.computeCid()).toMatch(/^bafk[0-9a-f]+$/);
  });

  test('isExpired false for fresh proof with long TTL', () => {
    const proof = new IPFSCachedProof({ formula: 'F(x)', result: { proved: true, method: 'cec' }, ttl: 3600 });
    expect(proof.isExpired).toBe(false);
  });

  test('isExpired false for pinned proof', () => {
    const proof = new IPFSCachedProof({ formula: 'O(Act)', result: { proved: true, method: 'axiom_lookup' }, ttl: 0, pinned: true });
    expect(proof.isExpired).toBe(false);
  });

  test('toDict is JSON-safe', () => {
    const proof = new IPFSCachedProof({ formula: 'P(x)', result: { proved: true, method: 'forward_chain' } });
    expect(() => JSON.stringify(proof.toDict())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// IPFSProofCache
// ---------------------------------------------------------------------------

describe('IPFSProofCache', () => {
  test('set stores and get retrieves proof', () => {
    const cache = new IPFSProofCache();
    cache.set('O(Pay)', { proved: true, method: 'axiom_lookup' });
    expect(cache.has('O(Pay)')).toBe(true);
    const proof = cache.get('O(Pay)');
    expect(proof).not.toBeNull();
    expect(proof!.formula).toBe('O(Pay)');
  });

  test('set assigns IPFS CID automatically', () => {
    const cache = new IPFSProofCache();
    const proof = cache.set('F(Disclose)', { proved: false, method: 'exhausted' });
    expect(proof.ipfsCid).toMatch(/^bafk/);
  });

  test('size increments on set', () => {
    const cache = new IPFSProofCache();
    cache.set('O(A)', { proved: true, method: 'cec' });
    cache.set('P(B)', { proved: true, method: 'cec' });
    expect(cache.size).toBe(2);
  });

  test('pin prevents expiry', () => {
    const cache = new IPFSProofCache();
    cache.set('O(Pin)', { proved: true, method: 'axiom_lookup' }, { ttl: 0 });
    cache.pin('O(Pin)');
    expect(cache.get('O(Pin)')).not.toBeNull();
  });

  test('unpin allows expiry for negative ttl', () => {
    const cache = new IPFSProofCache();
    cache.set('O(Unpin)', { proved: true, method: 'axiom_lookup' }, { ttl: -1, pin: true });
    cache.unpin('O(Unpin)');
    // Now it is expired (ttl=-1: always expired when not pinned)
    expect(cache.get('O(Unpin)')).toBeNull();
  });

  test('getStats tracks hits and misses', () => {
    const cache = new IPFSProofCache();
    cache.set('O(Stats)', { proved: true, method: 'cec' });
    cache.get('O(Stats)');        // hit
    cache.get('O(NotExist)');     // miss
    const stats = cache.getStats();
    expect(stats.cacheHits).toBe(1);
    expect(stats.cacheMisses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.5);
  });

  test('getGlobalIPFSCache returns singleton', () => {
    resetGlobalIPFSCache();
    const c1 = getGlobalIPFSCache();
    const c2 = getGlobalIPFSCache();
    expect(c1).toBe(c2);
    resetGlobalIPFSCache();
  });
});

// ---------------------------------------------------------------------------
// MedicalTheoremGenerator
// ---------------------------------------------------------------------------

describe('MedicalTheoremGenerator', () => {
  const gen = new MedicalTheoremGenerator();

  test('generateFromText returns MedicalTheorem', () => {
    const t = gen.generateFromText('Aspirin reduces pain and inflammation.');
    expect(t).toBeInstanceOf(MedicalTheorem);
  });

  test('detects treatment type for "treats"', () => {
    const t = gen.generateFromText('Metformin treats type 2 diabetes.');
    expect(t.theoremType).toBe(MedicalTheoremType.TREATMENT_OUTCOME);
  });

  test('detects causal type for "causes"', () => {
    const t = gen.generateFromText('Smoking causes lung cancer.');
    expect(t.theoremType).toBe(MedicalTheoremType.CAUSAL_RELATIONSHIP);
  });

  test('detects adverse type for "side effect"', () => {
    const t = gen.generateFromText('The drug has a side effect of nausea.');
    expect(t.theoremType).toBe(MedicalTheoremType.ADVERSE_EVENT);
  });

  test('toFormula returns non-empty string', () => {
    const t = gen.generateFromText('Aspirin reduces inflammation.');
    expect(t.toFormula().length).toBeGreaterThan(0);
  });

  test('toDict is JSON-safe', () => {
    const t = gen.generateFromText('Drug A increases risk of condition B.');
    expect(() => JSON.stringify(t.toDict())).not.toThrow();
  });

  test('confidence is in [0, 1]', () => {
    const t = gen.generateFromText('Treatment causes outcome.');
    expect(t.confidence).toBeGreaterThanOrEqual(0);
    expect(t.confidence).toBeLessThanOrEqual(1);
  });

  test('validateTheorem returns valid for well-formed theorem', () => {
    const t = gen.generateFromText('Aspirin reduces inflammation.');
    const v = gen.validateTheorem(t);
    expect(v.isValid).toBe(true);
    expect(v.errors).toHaveLength(0);
  });

  test('generateBatch returns array of same length', () => {
    const texts = ['Drug A causes B.', 'Drug C treats D.'];
    const theorems = gen.generateBatch(texts);
    expect(theorems).toHaveLength(2);
  });
});

describe('ConfidenceLevel', () => {
  test('has 5 levels', () => {
    expect(Object.values(ConfidenceLevel)).toHaveLength(5);
  });
});

describe('FuzzyLogicValidator', () => {
  test('validate returns fuzzyScore', () => {
    const gen = new MedicalTheoremGenerator();
    const theorem = gen.generateFromText('Drug causes adverse event.');
    const validator = new FuzzyLogicValidator();
    const result = validator.validate(theorem);
    expect(typeof result.fuzzyScore).toBe('number');
    expect(typeof result.valid).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// TDFOLCECBridge
// ---------------------------------------------------------------------------

describe('TDFOLCECBridge', () => {
  test('prove returns result shape', () => {
    const bridge = new TDFOLCECBridge();
    const result = bridge.prove('O(Pay)');
    expect(result).toHaveProperty('proved');
    expect(result).toHaveProperty('method');
    expect(result).toHaveProperty('timeMs');
    expect(result).toHaveProperty('steps');
  });

  test('proves default axiom via axiom_lookup', () => {
    const bridge = new TDFOLCECBridge();
    const result = bridge.prove('O(φ) → P(φ)');
    expect(result.proved).toBe(true);
    expect(result.method).toBe('axiom_lookup');
  });

  test('proves deontic formula via CEC delegation', () => {
    const bridge = new TDFOLCECBridge(true);
    const result = bridge.prove('O(RegisterVehicle)');
    expect(result.proved).toBe(true);
    expect(result.usedCec).toBe(true);
  });

  test('returns false for unknown formula with CEC disabled', () => {
    const bridge = new TDFOLCECBridge(false);
    const result = bridge.prove('CompletelyUnknownFormula');
    expect(result.proved).toBe(false);
  });

  test('addAxiom extends axiom set', () => {
    const bridge = new TDFOLCECBridge();
    bridge.addAxiom({ name: 'custom', formula: 'MyCustomAxiom', source: 'user' });
    const result = bridge.prove('MyCustomAxiom');
    expect(result.proved).toBe(true);
  });

  test('getAxioms returns non-empty array', () => {
    const bridge = new TDFOLCECBridge();
    expect(bridge.getAxioms().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// EnhancedTDFOLProver
// ---------------------------------------------------------------------------

describe('EnhancedTDFOLProver', () => {
  test('prove returns TDFOLCECBridgeResult', () => {
    const prover = createEnhancedProver();
    const result = prover.prove('O(Act)');
    expect(result).toHaveProperty('proved');
    expect(result).toHaveProperty('formula');
  });

  test('proveBatch returns array', () => {
    const prover = createEnhancedProver();
    const results = prover.proveBatch(['O(Act)', 'P(Inspect)', 'F(Disclose)']);
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r).toHaveProperty('formula');
      expect(r).toHaveProperty('result');
    }
  });

  test('useKB adds axioms from knowledge base', () => {
    const prover = createEnhancedProver();
    prover.useKB('doc-001', ['O(PayTax)', 'P(Deduct)']);
    const result = prover.prove('O(PayTax)');
    expect(result.proved).toBe(true);
  });

  test('proofId generates 16-char hex string', () => {
    const id = EnhancedTDFOLProver.proofId('O(Pay)');
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });
});
