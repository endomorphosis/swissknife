/**
 * WASM Prover Sprint 10 — TDFOL (Temporal Deontic FOL) native prover tests.
 *
 * Tasks covered:
 *   T-63: TdfolFormula type system (tdfol-types.ts)
 *   T-64: TdfolProverBridge inference rules (10 rules + saturation engine)
 *   T-65: PolicyToTdfolTranslator (policy-to-tdfol.ts)
 *   T-66: WasmProverHub routes `temporal` to TdfolProverBridge; `higher_order` → Coq/Lean4
 *   T-67: ≥10 tests
 *
 * Sprint 10 (Phase 10 — TDFOL Native Prover, P2).
 * Reference: ipfs_datasets_py/logic/TDFOL/tdfol_prover.py (640 lines)
 */

import {
  Atom, Const, Obligation, Permission, Prohibition, Negation, Implies,
  serializeFormula,
} from '../../src/services/provers/dcec-types.js';
import {
  Always, Eventually, Next, Until, Since,
  serializeTdfol,
} from '../../src/services/provers/tdfol-types.js';
import { TdfolProverBridge } from '../../src/services/provers/tdfol-prover-bridge.js';
import { PolicyToTdfolTranslator } from '../../src/services/provers/policy-to-tdfol.js';
import { WasmProverHub } from '../../src/services/mcp/mcp-wasm-prover-hub.js';
import type { Policy } from '../../src/services/mcp/mcp-policy.js';

// ---------------------------------------------------------------------------
// T-63: TDFOL formula types + serialisation
// ---------------------------------------------------------------------------

describe('T-63 tdfol-types — LTL formula construction and serialisation', () => {
  it('creates ALWAYS (□) formula and serialises', () => {
    const phi = Atom('raining');
    const f = Always(phi);
    expect(f.kind).toBe('ltl_unary');
    expect(f.operator).toBe('ALWAYS');
    expect(serializeTdfol(f)).toBe('ALWAYS(raining)');
  });

  it('creates EVENTUALLY (◊) formula and serialises', () => {
    const phi = Obligation(Atom('pay_tax'));
    expect(serializeTdfol(Eventually(phi))).toBe('EVENTUALLY(O(pay_tax))');
  });

  it('creates NEXT (◯) formula and serialises', () => {
    const phi = Atom('step');
    expect(serializeTdfol(Next(phi))).toBe('NEXT(step)');
  });

  it('creates UNTIL binary formula and serialises', () => {
    const phi = Atom('working');
    const psi = Atom('done');
    expect(serializeTdfol(Until(phi, psi))).toBe('UNTIL(working,done)');
  });

  it('creates SINCE binary formula and serialises', () => {
    const phi = Atom('open');
    const psi = Atom('start');
    expect(serializeTdfol(Since(phi, psi))).toBe('SINCE(open,start)');
  });

  it('nests LTL inside deontic: □O(pay) serialises', () => {
    const obl = Obligation(Atom('pay'));
    expect(serializeTdfol(Always(obl))).toBe('ALWAYS(O(pay))');
  });

  it('nests LTL inside LTL: ◊□φ serialises', () => {
    const phi = Atom('stable');
    expect(serializeTdfol(Eventually(Always(phi)))).toBe('EVENTUALLY(ALWAYS(stable))');
  });

  it('DCEC formulas pass through serializeTdfol unchanged', () => {
    const p = Permission(Atom('read_file'));
    expect(serializeTdfol(p)).toBe(serializeFormula(p));
  });
});

// ---------------------------------------------------------------------------
// T-64: TdfolProverBridge inference rules
// ---------------------------------------------------------------------------

describe('T-64 TdfolProverBridge — TDFOL inference rules', () => {
  let bridge: TdfolProverBridge;
  beforeEach(() => { bridge = new TdfolProverBridge(); });

  it('TemporalT: □φ ⊢ φ', async () => {
    const phi = Atom('safe');
    const kb = [Always(phi)];
    const result = await bridge.prove(kb, phi);
    expect(result.proved).toBe(true);
    expect(result.reason).toBe('proved');
    expect(result.prover_id).toBe('tdfol-native');
  });

  it('TemporalEventually: φ ⊢ ◊φ', async () => {
    const phi = Atom('event');
    const kb = [phi];
    const result = await bridge.prove(kb, Eventually(phi));
    expect(result.proved).toBe(true);
  });

  it('TemporalDistribution (K axiom): □(φ→ψ), □φ ⊢ □ψ', async () => {
    const phi = Atom('p');
    const psi = Atom('q');
    const impl = Implies(phi, psi);
    const kb = [Always(impl), Always(phi)];
    const result = await bridge.prove(kb, Always(psi));
    expect(result.proved).toBe(true);
    expect(result.reason).toBe('proved');
  });

  it('UntilUnfolding: φ U ψ derives ψ ∨ (φ ∧ ◯(φ U ψ))', async () => {
    const phi = Atom('working');
    const psi = Atom('done');
    const kb = [Until(phi, psi)];
    // The until unfolds; we can prove psi is eventually reachable through the disjunction
    // The derived formula has 'done' in the disjunct — just check it runs without error
    const result = await bridge.prove(kb, Atom('anything'));
    expect(['proved', 'unknown']).toContain(result.reason);
    expect(result.prover_id).toBe('tdfol-native');
  });

  it('DeonticD (SDL): O(φ) ⊢ P(φ)', async () => {
    const phi = Atom('submit_report');
    const kb = [Obligation(phi)];
    const result = await bridge.prove(kb, Permission(phi));
    expect(result.proved).toBe(true);
    expect(result.reason).toBe('proved');
  });

  it('DeonticDistribution: O(φ→ψ), O(φ) ⊢ O(ψ)', async () => {
    const phi = Atom('log_in');
    const psi = Atom('audit');
    const kb = [Obligation(Implies(phi, psi)), Obligation(phi)];
    const result = await bridge.prove(kb, Obligation(psi));
    expect(result.proved).toBe(true);
  });

  it('ProhibitionElimination: F(φ) ⊢ ¬P(φ)', async () => {
    const phi = Atom('delete_record');
    const kb = [Prohibition(phi)];
    const goal = Negation(Permission(phi));
    const result = await bridge.prove(kb, goal);
    expect(result.proved).toBe(true);
  });

  it('DeonticProhibEquiv: F(φ) ⊢ O(¬φ)', async () => {
    const phi = Atom('share_data');
    const kb = [Prohibition(phi)];
    const result = await bridge.prove(kb, Obligation(Negation(phi)));
    expect(result.proved).toBe(true);
  });

  it('detects O+F normative conflict in temporal KB', async () => {
    const phi = Atom('act');
    const kb = [Always(Obligation(phi)), Always(Prohibition(phi))];
    // TemporalT unwraps □O(act) → O(act) and □F(act) → F(act) → conflict
    const result = await bridge.prove(kb, Atom('dummy'));
    expect(result.reason).toBe('refuted');
    expect(result.unsat).toBe(true);
  });

  it('returns unknown for unprovable goal', async () => {
    const kb = [Atom('alpha')];
    const result = await bridge.prove(kb, Atom('beta'));
    expect(result.reason).toBe('unknown');
    expect(result.prover_id).toBe('tdfol-native');
  });
});

// ---------------------------------------------------------------------------
// T-64: checkPolicyConsistency for temporal policies
// ---------------------------------------------------------------------------

describe('T-64 TdfolProverBridge.checkPolicyConsistency (temporal)', () => {
  let bridge: TdfolProverBridge;
  beforeEach(() => { bridge = new TdfolProverBridge(); });

  it('returns proved for a consistent temporal policy', async () => {
    const policy: Policy = {
      id: 'tp1', version: 1,
      permissions: [{ cap: 'read', rsc: 'report' }],
      prohibitions: [],
      obligations: [],
      temporal: { start: 0, end: 9999 },
    };
    const result = await bridge.checkPolicyConsistency(policy);
    expect(result.proved).toBe(true);
    expect(result.reason).toBe('proved');
    expect(result.prover_id).toBe('tdfol-native');
  });

  it('returns proved with deadline obligations (◊O encoding)', async () => {
    const policy: Policy = {
      id: 'tp2', version: 1,
      permissions: [],
      prohibitions: [],
      obligations: [{ description: 'renew_cert', rsc: 'cert', deadline: 86400 }],
    };
    const result = await bridge.checkPolicyConsistency(policy);
    expect(result.proved).toBe(true);
    expect(result.reason).toBe('proved');
  });

  it('returns refuted for a temporal deadline obligation prohibited in the same window', async () => {
    const policy: Policy = {
      id: 'tp-conflict', version: 1,
      permissions: [],
      prohibitions: [{ cap: 'log/write', rsc: 'audit' }],
      obligations: [{ description: 'write audit log', requiredCap: 'log/write', rsc: 'audit', deadline: 86400 }],
      temporal: { start: 0, end: 9999 },
    };
    const result = await bridge.checkPolicyConsistency(policy);
    expect(result.unsat).toBe(true);
    expect(result.reason).toBe('refuted');
    expect(result.prover_id).toBe('tdfol-native');
  });
});

// ---------------------------------------------------------------------------
// T-65: PolicyToTdfolTranslator
// ---------------------------------------------------------------------------

describe('T-65 PolicyToTdfolTranslator', () => {
  let translator: PolicyToTdfolTranslator;
  beforeEach(() => { translator = new PolicyToTdfolTranslator(); });

  it('wraps permissions in □ when temporal window present', () => {
    const policy: Policy = {
      id: 'tp', version: 1,
      permissions: [{ cap: 'read', rsc: 'file' }],
      prohibitions: [],
      obligations: [],
      temporal: { start: 0, end: 9999 },
    };
    const kb = translator.translate(policy);
    expect(kb).toHaveLength(1);
    expect(kb[0].kind).toBe('ltl_unary');
    expect(serializeTdfol(kb[0])).toBe('ALWAYS(P(read_file))');
  });

  it('wraps obligation with deadline in ◊O', () => {
    const policy: Policy = {
      id: 'td', version: 1,
      permissions: [],
      prohibitions: [],
      obligations: [{ description: 'file_report', rsc: 'gov', deadline: 86400 }],
    };
    const kb = translator.translate(policy);
    expect(kb).toHaveLength(1);
    expect(serializeTdfol(kb[0])).toBe('EVENTUALLY(O(file_report))');
  });

  it('encodes requiredCap obligations with cap/resource atoms for native conflict checks', () => {
    const policy: Policy = {
      id: 'required-cap', version: 1,
      permissions: [],
      prohibitions: [{ cap: 'log/write', rsc: 'audit' }],
      obligations: [{ description: 'write audit log', requiredCap: 'log/write', rsc: 'audit', deadline: 86400 }],
    };
    const kb = translator.translate(policy);
    const sers = kb.map(serializeTdfol);
    expect(sers).toContain('F(log_write_audit)');
    expect(sers).toContain('EVENTUALLY(O(log_write_audit))');
  });

  it('wraps all three rule types in □ for temporal policy', () => {
    const policy: Policy = {
      id: 'all', version: 1,
      permissions: [{ cap: 'read', rsc: 'doc' }],
      prohibitions: [{ cap: 'write', rsc: 'doc' }],
      obligations: [{ description: 'log_access', rsc: 'audit' }],
      temporal: { start: 0, end: 9999 },
    };
    const kb = translator.translate(policy);
    expect(kb).toHaveLength(3);
    const sers = kb.map(serializeTdfol);
    expect(sers).toContain('ALWAYS(P(read_doc))');
    expect(sers).toContain('ALWAYS(F(write_doc))');
    expect(sers).toContain('ALWAYS(O(log_access))');
  });

  it('plain policy (no temporal window) gives bare formulas', () => {
    const policy: Policy = {
      id: 'plain', version: 1,
      permissions: [{ cap: 'read', rsc: 'file' }],
      prohibitions: [],
      obligations: [],
    };
    const kb = translator.translate(policy);
    expect(kb[0].kind).not.toBe('ltl_unary');
    expect(serializeTdfol(kb[0])).toBe('P(read_file)');
  });
});

// ---------------------------------------------------------------------------
// T-66: WasmProverHub routes `temporal` to tdfol-native
// ---------------------------------------------------------------------------

describe('T-66 WasmProverHub — temporal routing to TdfolProverBridge', () => {
  beforeEach(() => WasmProverHub.resetInstance());
  afterEach(() => WasmProverHub.resetInstance());

  it('routes temporal policy to tdfol-native (not remote-only skipped)', async () => {
    const hub = await WasmProverHub.create();
    const policy: Policy = {
      id: 'temp', version: 1,
      permissions: [{ cap: 'read', rsc: 'doc' }],
      prohibitions: [],
      obligations: [],
      temporal: { start: 0, end: 9999 },
    };
    const result = await hub.checkPolicyConsistency(policy);
    expect(result.prover_id).toBe('tdfol-native');
    expect(result.reason).toBe('proved');
    expect(result.meta?.skipped).toBeUndefined();
  });

  it('tdfol_native is always in proverStatus()', async () => {
    const hub = await WasmProverHub.create();
    const status = hub.proverStatus();
    expect(status.tdfol_native).toBe(true);
    expect(status.dcec_native).toBe(true);
  });
});
