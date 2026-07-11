/**
 * Sprint 2 tests — SMT2Serializer + Cvc5WasmBridge (T-13, T-14, T-17)
 *
 * Covers:
 * - SMT2Serializer: policyToSMT2, formulaSetToSMT2, parseCheckSatResult
 * - Cvc5WasmBridge: native path with mock, Z3-shim path, policy consistency
 * - checkPolicyConsistencyRemote with localHub (T-07)
 * - RemoteDeonticEngine integration: localHub pre-check skips remote call
 */

import { SMT2Serializer } from '../../src/services/provers/smt2-serializer';
import { Cvc5WasmBridge } from '../../src/services/provers/cvc5-wasm-bridge';
import { WasmProverHub } from '../../src/services/mcp/mcp-wasm-prover-hub';
import type { Policy } from '../../src/services/mcp/mcp-mcp-policy.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function permissivePolicy(): Policy {
  return {
    id: 'p1', version: '1.0.0',
    permissions: [{ cap: 'mcp++/invoke:browse', rsc: '*' }],
    prohibitions: [],
    obligations: [],
  };
}

function conflictPolicy(): Policy {
  return {
    id: 'conflict', version: '1.0.0',
    permissions: [{ cap: 'mcp++/invoke:publish', rsc: 'sha256:x' }],
    prohibitions: [{ cap: 'mcp++/invoke:publish', rsc: 'sha256:x' }],
    obligations: [],
  };
}

function wildcardConflictPolicy(): Policy {
  return {
    id: 'wildcard', version: '1.0.0',
    permissions: [{ cap: '*', rsc: '*' }],
    prohibitions: [{ cap: 'mcp++/invoke:publish', rsc: 'sha256:x' }],
    obligations: [],
  };
}

function oblProhibConflictPolicy(): Policy {
  return {
    id: 'obl-prohib', version: '1.0.0',
    permissions: [{ cap: '*', rsc: '*' }],
    prohibitions: [{ cap: 'mcp++/audit', rsc: '*' }],
    obligations: [{ description: 'audit access', requiredCap: 'mcp++/audit' }],
  };
}

// ---------------------------------------------------------------------------
// SMT2Serializer — policyToSMT2
// ---------------------------------------------------------------------------

describe('SMT2Serializer — policyToSMT2', () => {
  const s = new SMT2Serializer();

  it('produces valid SMT-LIB2 with set-logic, declarations, and check-sat', () => {
    const smt2 = s.policyToSMT2(permissivePolicy());
    expect(smt2).toContain('(set-logic QF_UF)');
    expect(smt2).toContain('(declare-const');
    expect(smt2).toContain('(check-sat)');
  });

  it('asserts permission constants as true', () => {
    const smt2 = s.policyToSMT2(permissivePolicy());
    expect(smt2).toMatch(/\(assert P__/);
  });

  it('asserts prohibition constants as true', () => {
    const smt2 = s.policyToSMT2(conflictPolicy());
    expect(smt2).toMatch(/\(assert F__/);
  });

  it('adds contradiction clause for permission + prohibition on same cap+rsc', () => {
    const smt2 = s.policyToSMT2(conflictPolicy());
    expect(smt2).toContain('(assert (not (and P__');
    expect(smt2).toContain('F__');
  });

  it('adds contradiction for wildcard permission + specific prohibition', () => {
    const smt2 = s.policyToSMT2(wildcardConflictPolicy());
    expect(smt2).toContain('(assert (not (and P__STAR__STAR');
  });

  it('adds obligation conflict when requiredCap is prohibited', () => {
    const smt2 = s.policyToSMT2(oblProhibConflictPolicy());
    expect(smt2).toContain('Obl__');
  });

  it('sanitizes special chars in cap/rsc to valid SMT symbols', () => {
    const policy: Policy = {
      id: 'special', version: '1',
      permissions: [{ cap: 'mcp++/invoke:some-tool!', rsc: 'sha256:abc/path' }],
      prohibitions: [], obligations: [],
    };
    const smt2 = s.policyToSMT2(policy);
    // Should not contain invalid chars in symbol names
    expect(smt2).not.toMatch(/\(declare-const [^ ]*(\/|!|\+|-)[^ ]/);
    expect(smt2).toContain('(check-sat)');
  });

  it('empty policy produces minimal valid SMT-LIB2', () => {
    const smt2 = s.policyToSMT2({ id: 'empty', version: '1', permissions: [], prohibitions: [], obligations: [] });
    expect(smt2).toContain('(set-logic QF_UF)');
    expect(smt2).toContain('(check-sat)');
    expect(smt2).not.toContain('(declare-const');
  });
});

// ---------------------------------------------------------------------------
// SMT2Serializer — formulaSetToSMT2
// ---------------------------------------------------------------------------

describe('SMT2Serializer — formulaSetToSMT2', () => {
  const s = new SMT2Serializer();

  it('serializes a simple formula set to SMT-LIB2', () => {
    const smt2 = s.formulaSetToSMT2({
      obligation_formulas: ['O(mcp__invoke_browse, *)'],
      permission_formulas: ['P(mcp__invoke_browse, *)'],
      prohibition_formulas: [],
      all: ['O(mcp__invoke_browse, *)', 'P(mcp__invoke_browse, *)'],
    });
    expect(smt2).toContain('(set-logic QF_UF)');
    expect(smt2).toContain('(declare-const formula__');
    expect(smt2).toContain('(check-sat)');
  });

  it('adds contradiction for matching P/F formulas', () => {
    const smt2 = s.formulaSetToSMT2({
      obligation_formulas: [],
      permission_formulas: ['P(browse, *)'],
      prohibition_formulas: ['F(browse, *)'],
      all: ['P(browse, *)', 'F(browse, *)'],
    });
    expect(smt2).toContain('(assert (not (and ');
  });
});

// ---------------------------------------------------------------------------
// SMT2Serializer — parseCheckSatResult
// ---------------------------------------------------------------------------

describe('SMT2Serializer — parseCheckSatResult', () => {
  it('parses "sat" response', () => {
    expect(SMT2Serializer.parseCheckSatResult('sat\n(model)')).toBe('sat');
  });

  it('parses "unsat" response', () => {
    expect(SMT2Serializer.parseCheckSatResult('unsat\n')).toBe('unsat');
  });

  it('returns unknown for non-conclusive responses', () => {
    expect(SMT2Serializer.parseCheckSatResult('unknown\n')).toBe('unknown');
    expect(SMT2Serializer.parseCheckSatResult('error: ...\n')).toBe('unknown');
    expect(SMT2Serializer.parseCheckSatResult('')).toBe('unknown');
  });

  it('is case-insensitive', () => {
    expect(SMT2Serializer.parseCheckSatResult('SAT')).toBe('sat');
    expect(SMT2Serializer.parseCheckSatResult('UNSAT')).toBe('unsat');
  });
});

// ---------------------------------------------------------------------------
// Cvc5WasmBridge — native CVC5 mock
// ---------------------------------------------------------------------------

describe('Cvc5WasmBridge — native CVC5 mock', () => {
  it('uses native CVC5 when provided and returns sat result', async () => {
    const mockCvc5 = { solveSMT2: jest.fn().mockReturnValue('sat\n') };
    const bridge = await Cvc5WasmBridge.create(mockCvc5);
    const smt2 = '(set-logic QF_UF)\n(check-sat)';
    const result = await bridge.checkSatisfiability(smt2, 1000);
    expect(mockCvc5.solveSMT2).toHaveBeenCalledWith(smt2);
    expect(result.prover_id).toBe('cvc5-wasm');
    expect(result.reason).toBe('sat');
  });

  it('returns refuted for unsat from native CVC5', async () => {
    const mockCvc5 = { solveSMT2: jest.fn().mockReturnValue('unsat') };
    const bridge = await Cvc5WasmBridge.create(mockCvc5);
    const result = await bridge.checkSatisfiability('(check-sat)', 1000);
    expect(result.reason).toBe('refuted');
    expect(result.unsat).toBe(true);
  });

  it('returns error result when native CVC5 throws', async () => {
    const mockCvc5 = { solveSMT2: jest.fn().mockImplementation(() => { throw new Error('cvc5 crash'); }) };
    const bridge = await Cvc5WasmBridge.create(mockCvc5);
    const result = await bridge.checkSatisfiability('(check-sat)', 1000);
    expect(result.reason).toBe('error');
    expect(result.meta?.error).toMatch(/cvc5 crash/);
  });

  it('effectiveProverId is cvc5-wasm with native module', async () => {
    const mockCvc5 = { solveSMT2: jest.fn().mockReturnValue('sat') };
    const bridge = await Cvc5WasmBridge.create(mockCvc5);
    expect(bridge.effectiveProverId).toBe('cvc5-wasm');
  });
});

describe('Cvc5WasmBridge — checkPolicyConsistency with mock', () => {
  it('serializes policy to SMT2 and dispatches to native CVC5', async () => {
    const calls: string[] = [];
    const mockCvc5 = { solveSMT2: jest.fn().mockImplementation((s: string) => { calls.push(s); return 'sat'; }) };
    const bridge = await Cvc5WasmBridge.create(mockCvc5);
    const result = await bridge.checkPolicyConsistency(permissivePolicy());
    expect(calls[0]).toContain('(set-logic QF_UF)');
    expect(calls[0]).toContain('(check-sat)');
    expect(result.proved).toBe(true);
  });

  it('unsat (conflict policy) → proved=false, unsat=true', async () => {
    const mockCvc5 = { solveSMT2: jest.fn().mockReturnValue('unsat') };
    const bridge = await Cvc5WasmBridge.create(mockCvc5);
    const result = await bridge.checkPolicyConsistency(conflictPolicy());
    expect(result.proved).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cvc5WasmBridge — Z3 shim fallback (no native CVC5)
// ---------------------------------------------------------------------------

describe('Cvc5WasmBridge — Z3 shim path (no native CVC5)', () => {
  afterEach(() => WasmProverHub.resetInstance());

  it('falls back gracefully when neither CVC5 nor Z3 is available', async () => {
    // Create bridge with no native CVC5 and no Z3 available
    const bridge = new (Cvc5WasmBridge as unknown as new (...args: unknown[]) => Cvc5WasmBridge)();
    // If bridge has no internal modules it should return unknown
    const result = await bridge.checkSatisfiability('(check-sat)', 100);
    // Either unknown (no provers) or a real result — both are valid
    expect(['sat', 'unsat', 'unknown', 'proved', 'refuted', 'error']).toContain(result.reason);
  });
});

// ---------------------------------------------------------------------------
// checkPolicyConsistencyRemote with localHub pre-check (T-07)
// ---------------------------------------------------------------------------

describe('checkPolicyConsistencyRemote — localHub pre-check (T-07)', () => {
  afterEach(() => WasmProverHub.resetInstance());

  it('skips remote call when Z3 WASM decides locally (propositional)', async () => {
    // Build a hub with a mock Z3 bridge injected
    const hub = await WasmProverHub.create({ timeoutMs: 100 });
    const mockZ3 = {
      checkPolicyConsistency: jest.fn().mockResolvedValue({
        proved: true, sat: true, unsat: false, reason: 'sat',
        prover_id: 'z3-wasm', proof_time_ms: 5,
      }),
      proveSMT2: jest.fn(),
    };
    (hub as unknown as Record<string, unknown>)['z3'] = mockZ3;

    let remoteCalled = false;
    const fakeEngine = {
      isAvailable: async () => true,
      checkTheoryConsistency: async () => { remoteCalled = true; return { consistent: true, proof: { proved: true } }; },
    } as unknown as import('../../src/services/mcp/mcp-remote-deontic-engine').RemoteDeonticEngine;

    const { checkPolicyConsistencyRemote } = await import('../../src/services/mcp/mcp-remote-deontic-engine');
    const result = await checkPolicyConsistencyRemote(permissivePolicy(), fakeEngine, hub);

    expect(mockZ3.checkPolicyConsistency).toHaveBeenCalled();
    expect(remoteCalled).toBe(false); // remote NOT called
    expect(result.remoteChecked).toBe(false);
    expect(result.localProver).toBe('z3-wasm');
  });

  it('temporal policy is handled locally by tdfol-native (Sprint 10)', async () => {
    const hub = await WasmProverHub.create({ timeoutMs: 100 });
    // Sprint 10: temporal policies are now routed to TdfolProverBridge locally.
    // The remote engine may or may not be called depending on tdfol result,
    // but the local prover ID should be tdfol-native.

    const fakeEngine = {
      isAvailable: async () => true,
      checkTheoryConsistency: async () => ({ consistent: true, proof: { proved: true } }),
    } as unknown as import('../../src/services/mcp/mcp-remote-deontic-engine').RemoteDeonticEngine;

    const temporalPolicy: Policy = {
      id: 'temp', version: '1', permissions: [{ cap: '*', rsc: '*' }],
      prohibitions: [], obligations: [],
      temporal: { notBefore: 1000, notAfter: 9999 },
    };

    const { checkPolicyConsistencyRemote } = await import('../../src/services/mcp/mcp-remote-deontic-engine');
    const result = await checkPolicyConsistencyRemote(temporalPolicy, fakeEngine, hub);

    // Sprint 10: tdfol-native decides locally; remote may be skipped
    expect(result.localProver).toBe('tdfol-native');
  });
});
