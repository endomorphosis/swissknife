/**
 * wasm-prover-sprint41.test.ts
 *
 * Sprint 41: TDFOL ShadowProver Bridge + Logic Verifier Backends Mixin + Proof Engine Utils
 */

import {
  ModalLogicType, TDFOLShadowProverBridge, ModalAwareTDFOLProver, createModalAwareProver,
} from '../../src/services/logic/tdfol/tdfol-shadowprover-bridge.js';
import {
  LogicVerifierBackendsMixin,
} from '../../src/services/logic/shared/logic-verifier-backends-mixin.js';
import {
  ProofEngine, createProofEngine, proveFormula, proveWithAllProvers,
  checkConsistency, getLeanTemplate,
} from '../../src/services/proof-engine/proof-execution-engine-utils.js';

// ---------------------------------------------------------------------------
// ModalLogicType
// ---------------------------------------------------------------------------

describe('ModalLogicType', () => {
  test('has 5 systems', () => {
    expect(Object.values(ModalLogicType)).toHaveLength(5);
    expect(Object.values(ModalLogicType)).toContain('K');
    expect(Object.values(ModalLogicType)).toContain('D');
    expect(Object.values(ModalLogicType)).toContain('S5');
  });
});

// ---------------------------------------------------------------------------
// TDFOLShadowProverBridge
// ---------------------------------------------------------------------------

describe('TDFOLShadowProverBridge', () => {
  test('getMetadata returns BridgeMetadata', () => {
    const bridge = new TDFOLShadowProverBridge(ModalLogicType.D);
    const meta = bridge.getMetadata();
    expect(meta.name).toContain('D');
    expect(meta.targetSystem).toContain('D');
  });

  test('isAvailable returns true', () => {
    expect(new TDFOLShadowProverBridge().isAvailable()).toBe(true);
  });

  test('toTargetFormat converts O() to Obligatory()', () => {
    const bridge = new TDFOLShadowProverBridge();
    expect(bridge.toTargetFormat('O(Pay)')).toContain('Obligatory');
  });

  test('prove deontic formula succeeds', () => {
    const bridge = new TDFOLShadowProverBridge(ModalLogicType.D);
    const result = bridge.prove('O(Pay)');
    expect(result.proved).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
  });

  test('prove modal formula succeeds in K', () => {
    const bridge = new TDFOLShadowProverBridge(ModalLogicType.K);
    const result = bridge.prove('◊(P)');
    expect(result.proved).toBe(true);
  });

  test('prove plain propositional fails in K', () => {
    const bridge = new TDFOLShadowProverBridge(ModalLogicType.K);
    const result = bridge.prove('UnknownSymbol42');
    expect(result.proved).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ModalAwareTDFOLProver
// ---------------------------------------------------------------------------

describe('ModalAwareTDFOLProver', () => {
  const prover = createModalAwareProver();

  test('proveModal returns ModalProofResult', () => {
    const result = prover.proveModal('O(Act)');
    expect(result).toHaveProperty('formula');
    expect(result).toHaveProperty('logicSystem');
    expect(result).toHaveProperty('proved');
    expect(result).toHaveProperty('confidence');
  });

  test('deontic formula auto-selects D system', () => {
    const result = prover.proveModal('F(Disclose)');
    expect(result.logicSystem).toBe(ModalLogicType.D);
    expect(result.proved).toBe(true);
  });

  test('proveInSystem uses specified system', () => {
    const result = prover.proveInSystem('□(Act)', ModalLogicType.S4);
    expect(result.logicSystem).toBe(ModalLogicType.S4);
  });

  test('proveInAllSystems returns 5 results', () => {
    const results = prover.proveInAllSystems('O(Pay)');
    expect(results).toHaveLength(5);
  });

  test('S5 has higher confidence than K for deontic', () => {
    const s5 = prover.proveInSystem('O(Pay)', ModalLogicType.S5);
    const k  = prover.proveInSystem('O(Pay)', ModalLogicType.K);
    expect(s5.confidence).toBeGreaterThan(k.confidence);
  });
});

// ---------------------------------------------------------------------------
// LogicVerifierBackendsMixin
// ---------------------------------------------------------------------------

describe('LogicVerifierBackendsMixin', () => {
  const mixin = new LogicVerifierBackendsMixin();

  test('checkConsistencyFallback consistent for no conflicts', () => {
    const result = mixin.checkConsistencyFallback(['O(Pay)', 'P(Inspect)']);
    expect(result.isConsistent).toBe(true);
    expect(result.conflictingPairs).toHaveLength(0);
  });

  test('checkConsistencyFallback finds O/F conflict', () => {
    const result = mixin.checkConsistencyFallback(['O(Pay)', 'F(Pay)']);
    expect(result.isConsistent).toBe(false);
    expect(result.conflictingPairs.length).toBeGreaterThan(0);
  });

  test('checkConsistencySymbolic returns symbolic methodUsed', () => {
    const result = mixin.checkConsistencySymbolic(['O(Pay)']);
    expect(result.methodUsed).toBe('symbolic');
  });

  test('findConflictingPairs finds φ and ¬φ', () => {
    const pairs = mixin.findConflictingPairs(['P(x)', '¬P(x)']);
    expect(pairs.length).toBeGreaterThan(0);
  });

  test('empty formula set is consistent', () => {
    const result = mixin.checkConsistencyFallback([]);
    expect(result.isConsistent).toBe(true);
    expect(result.methodUsed).toBe('empty');
  });

  test('confidence is in [0,1]', () => {
    const result = mixin.checkConsistency(['O(A)', 'P(B)']);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// ProofEngine + utils
// ---------------------------------------------------------------------------

describe('ProofEngine', () => {
  test('prove returns ProofResult', () => {
    const engine = new ProofEngine();
    const result = engine.prove('O(Pay)');
    expect(result).toHaveProperty('formula');
    expect(result).toHaveProperty('prover');
    expect(result).toHaveProperty('proved');
    expect(result).toHaveProperty('timeMs');
  });

  test('proveAll returns array for each prover', () => {
    const engine = new ProofEngine();
    const results = engine.proveAll('O(Pay)', ['z3', 'lean4', 'tdfol']);
    expect(results).toHaveLength(3);
  });

  test('checkConsistency consistent for no conflicts', () => {
    const engine = new ProofEngine();
    const result = engine.checkConsistency(['O(Pay)', 'P(Inspect)']);
    expect(result.isConsistent).toBe(true);
    expect(result.conflictCount).toBe(0);
  });

  test('checkConsistency detects conflict', () => {
    const engine = new ProofEngine();
    const result = engine.checkConsistency(['O(Pay)', 'F(Pay)']);
    expect(result.isConsistent).toBe(false);
    expect(result.conflictCount).toBeGreaterThan(0);
  });
});

describe('proveFormula (util)', () => {
  test('returns ProofResult for z3', () => {
    const result = proveFormula('O(Act)', 'z3');
    expect(result.prover).toBe('z3');
    expect(result.success).toBe(true);
  });
});

describe('proveWithAllProvers (util)', () => {
  test('returns result for each prover', () => {
    const results = proveWithAllProvers('O(Act)', ['z3', 'lean4', 'coq']);
    expect(results).toHaveLength(3);
  });
});

describe('checkConsistency (util)', () => {
  test('returns ConsistencyResult', () => {
    const result = checkConsistency(['O(Pay)', 'P(Inspect)']);
    expect(result).toHaveProperty('isConsistent');
    expect(result).toHaveProperty('conflictCount');
    expect(result).toHaveProperty('timeMs');
  });
});

describe('getLeanTemplate', () => {
  test('returns non-empty string with Obligatory', () => {
    const template = getLeanTemplate();
    expect(typeof template).toBe('string');
    expect(template.length).toBeGreaterThan(0);
    expect(template).toContain('Obligatory');
    expect(template).toContain('Permitted');
    expect(template).toContain('Forbidden');
  });
});
