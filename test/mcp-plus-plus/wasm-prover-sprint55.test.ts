/**
 * Sprint 55 tests — Z3 Prover Bridge, CVC5 Prover Bridge, ZKP Backends
 *
 * Covers T-248 (z3-prover-bridge.ts),
 *         T-249 (cvc5-prover-bridge.ts),
 *         T-250 (zkp-backends.ts).
 */

import {
  Z3ProverBridge, TDFOLToZ3Converter, proveWithZ3, ensureZ3Available,
  z3Proved,
} from '../../src/services/z3-prover-bridge';

import {
  CVC5ProverBridge, TDFOLToCVC5Converter, ensureCVC5Available,
  cvc5Proved,
} from '../../src/services/cvc5-prover-bridge';

import {
  Groth16Proof, Groth16Backend, Groth16BackendFallback,
  ProveKitFFI, ProveKitFFIError,
} from '../../src/services/zkp-backends';

// ---------------------------------------------------------------------------
// TDFOLToZ3Converter tests
// ---------------------------------------------------------------------------

describe('TDFOLToZ3Converter', () => {
  const conv = new TDFOLToZ3Converter();

  test('converts ∧ to and', () => { expect(conv.convert('P ∧ Q')).toContain('and'); });
  test('converts ∨ to or',  () => { expect(conv.convert('P ∨ Q')).toContain('or'); });
  test('converts ¬ to not', () => { expect(conv.convert('¬P')).toContain('not'); });
  test('converts → to =>',  () => { expect(conv.convert('P → Q')).toContain('=>'); });
  test('converts ∀ to forall', () => { expect(conv.convert('∀ x . P(x)')).toContain('forall'); });

  test('toSmtAssertion wraps in (assert (not ...))', () => {
    const smt = conv.toSmtAssertion('P');
    expect(smt).toContain('assert');
    expect(smt).toContain('not');
  });
});

// ---------------------------------------------------------------------------
// Z3ProverBridge tests
// ---------------------------------------------------------------------------

describe('Z3ProverBridge', () => {
  test('prove() returns a Z3ProofResult', async () => {
    const bridge = new Z3ProverBridge(5, false);
    const r = await bridge.prove('P ∧ Q');
    expect(r).toHaveProperty('isValid');
    expect(r).toHaveProperty('isSat');
    expect(r).toHaveProperty('reason');
    expect(r).toHaveProperty('proofTime');
  });

  test('result reason is in known set', async () => {
    const bridge = new Z3ProverBridge(5, false);
    const r = await bridge.prove('P');
    expect(['sat', 'unsat', 'valid', 'unknown', 'timeout', 'error']).toContain(r.reason);
  });

  test('cache hit on second identical call', async () => {
    const bridge = new Z3ProverBridge(5, true);
    await bridge.prove('P ∧ Q');
    await bridge.prove('P ∧ Q');
    expect(bridge.getStats().cacheHits).toBe(1);
  });

  test('getStats tracks queriesTotal', async () => {
    const bridge = new Z3ProverBridge(5, false);
    await bridge.prove('P');
    expect(bridge.getStats().queriesTotal).toBe(1);
  });

  test('isAvailable() returns boolean', () => {
    expect(typeof new Z3ProverBridge().isAvailable()).toBe('boolean');
  });

  test('z3Proved() returns boolean', async () => {
    const bridge = new Z3ProverBridge();
    const r = await bridge.prove('P');
    expect(typeof z3Proved(r)).toBe('boolean');
  });

  test('proveWithZ3 convenience fn', async () => {
    const r = await proveWithZ3('P → P');
    expect(r).toHaveProperty('reason');
  });

  test('ensureZ3Available returns boolean', () => {
    expect(typeof ensureZ3Available()).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// TDFOLToCVC5Converter tests
// ---------------------------------------------------------------------------

describe('TDFOLToCVC5Converter', () => {
  const conv = new TDFOLToCVC5Converter();

  test('converts ∧ to and', () => { expect(conv.convert('P ∧ Q')).toContain('and'); });
  test('converts → to =>',  () => { expect(conv.convert('P → Q')).toContain('=>'); });
  test('converts ¬ to not', () => { expect(conv.convert('¬P')).toContain('not'); });
});

// ---------------------------------------------------------------------------
// CVC5ProverBridge tests
// ---------------------------------------------------------------------------

describe('CVC5ProverBridge', () => {
  test('prove() returns a CVC5ProofResult', async () => {
    const bridge = new CVC5ProverBridge(5, false);
    const r = await bridge.prove('P ∧ Q');
    expect(r).toHaveProperty('isValid');
    expect(r).toHaveProperty('isSat');
    expect(r).toHaveProperty('reason');
    expect(r).toHaveProperty('proofTime');
  });

  test('cache hit on second call', async () => {
    const bridge = new CVC5ProverBridge(5, true);
    await bridge.prove('A → A');
    await bridge.prove('A → A');
    expect(bridge.getStats().cacheHits).toBe(1);
  });

  test('isAvailable() returns boolean', () => {
    expect(typeof new CVC5ProverBridge().isAvailable()).toBe('boolean');
  });

  test('cvc5Proved() reflects isValid', async () => {
    const bridge = new CVC5ProverBridge();
    const r = await bridge.prove('P');
    expect(cvc5Proved(r)).toBe(r.isValid);
  });

  test('ensureCVC5Available returns boolean', () => {
    expect(typeof ensureCVC5Available()).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// Groth16Proof tests
// ---------------------------------------------------------------------------

describe('Groth16Proof', () => {
  test('toDict / fromDict round-trip', () => {
    const proof = new Groth16Proof(
      new Uint8Array([1, 2, 3]),
      { x: 42 },
      { backend: 'test' },
      1000,
      3,
    );
    const d = proof.toDict();
    const restored = Groth16Proof.fromDict(d);
    expect(restored.publicInputs['x']).toBe(42);
    expect(restored.sizeBytes).toBe(3);
  });

  test('toDict is JSON-serialisable', () => {
    const proof = new Groth16Proof(new Uint8Array([0xff]), {}, {}, 0, 1);
    expect(() => JSON.stringify(proof.toDict())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Groth16BackendFallback tests
// ---------------------------------------------------------------------------

describe('Groth16BackendFallback', () => {
  const backend = new Groth16BackendFallback();

  test('generateProof returns Groth16Proof', async () => {
    const proof = await backend.generateProof('{"witness": "test"}');
    expect(proof).toBeInstanceOf(Groth16Proof);
    expect(proof.proofData.length).toBeGreaterThan(0);
  });

  test('generateProof is deterministic with same seed', async () => {
    const p1 = await backend.generateProof('x', 42);
    const p2 = await backend.generateProof('x', 42);
    expect(p1.toDict()['proofData']).toBe(p2.toDict()['proofData']);
  });

  test('verifyProof returns true for valid JSON', async () => {
    const proof = await backend.generateProof('{}');
    expect(await backend.verifyProof(JSON.stringify(proof.toDict()))).toBe(true);
  });

  test('verifyProof returns false for invalid JSON', async () => {
    expect(await backend.verifyProof('{ bad json')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Groth16Backend tests
// ---------------------------------------------------------------------------

describe('Groth16Backend', () => {
  test('isAvailable() returns false when no binary', () => {
    const b = new Groth16Backend(null);
    expect(b.isAvailable()).toBe(false);
  });

  test('falls back to simulated proof only when explicitly enabled', async () => {
    const b = new Groth16Backend(null, 30_000, undefined, { allowSimulatedFallback: true });
    const proof = await b.generateProof('{}');
    expect(proof).toBeInstanceOf(Groth16Proof);
  });

  test('fails closed when binary unavailable and simulation is not enabled', async () => {
    const b = new Groth16Backend(null);
    await expect(b.generateProof('{}')).rejects.toThrow(/allowSimulatedFallback:true/);
    await expect(b.verifyProof('{}')).resolves.toBe(false);
  });

  test('getStats() initial values', () => {
    const s = new Groth16Backend().getStats();
    expect(s.proofsGenerated).toBe(0);
    expect(s.failures).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ProveKitFFI tests
// ---------------------------------------------------------------------------

describe('ProveKitFFI', () => {
  test('isAvailable() false when no lib', () => {
    const ffi = new ProveKitFFI(null);
    expect(ffi.isAvailable()).toBe(false);
  });

  test('generateProof throws ProveKitFFIError when unavailable', async () => {
    const ffi = new ProveKitFFI(null);
    await expect(ffi.generateProof('{}')).rejects.toThrow(ProveKitFFIError);
  });

  test('verifyProof throws ProveKitFFIError when unavailable', async () => {
    const ffi = new ProveKitFFI(null);
    await expect(ffi.verifyProof('{}')).rejects.toThrow(ProveKitFFIError);
  });

  test('discover() returns a ProveKitFFI instance', () => {
    const ffi = ProveKitFFI.discover();
    expect(ffi).toBeInstanceOf(ProveKitFFI);
  });
});
