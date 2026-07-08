/**
 * WASM Prover Sprint 13 — Extended TDFOL Rules + ProverRouterBridge tests.
 *
 * Tasks covered:
 *   T-76: tdfol-extended-rules.ts — 14 new inference rules
 *   T-77: ExtendedTdfolProverBridge — extends TdfolProverBridge with all rules
 *   T-78: ProverRouterBridgeAdapter — batch formula prover + consistency checker
 *   T-79: ≥10 tests
 *
 * Sprint 13 (Phase 13 — Extended TDFOL Rules + ProverRouterBridge, P2).
 * Reference: ipfs_datasets_py/logic/TDFOL/inference_rules/ (5 files, 50+ rules)
 */

import {
  Atom, Const,
  Obligation, Permission, Prohibition, Negation, Implies, Conjunction,
} from '../../src/services/provers/dcec-types.js';
import {
  Always, Eventually, Next, Until,
  serializeTdfol,
} from '../../src/services/provers/tdfol-types.js';
import { ExtendedTdfolProverBridge } from '../../src/services/provers/tdfol-extended-rules.js';
import { ProverRouterBridgeAdapter } from '../../src/services/bridge/prover-router-bridge.js';
import type { TdfolFormula } from '../../src/services/provers/tdfol-types.js';

// ---------------------------------------------------------------------------
// T-76/T-77: ExtendedTdfolProverBridge — new inference rules
// ---------------------------------------------------------------------------

describe('T-76/T-77 ExtendedTdfolProverBridge — extended rules', () => {
  let bridge: ExtendedTdfolProverBridge;
  beforeEach(() => { bridge = new ExtendedTdfolProverBridge(); });

  it('has the expected extended rule names', () => {
    const names = bridge.extendedRuleNames();
    expect(names).toContain('ModusTollens');
    expect(names).toContain('HypotheticalSyllogism');
    expect(names).toContain('TemporalS4');
    expect(names).toContain('TemporalS5');
    expect(names).toContain('ObligationWeakening');
    expect(names).toContain('DeonticDetachment');
    expect(names).toContain('TemporalObligationPersistence');
    expect(names).toContain('FutureObligationPersistence');
  });

  it('ModusTollens: {¬Q, P→Q} ⊢ ¬P', async () => {
    const p = Atom('p');
    const q = Atom('q');
    const kb: TdfolFormula[] = [Negation(q), Implies(p, q)];
    const result = await bridge.prove(kb, Negation(p));
    expect(result.proved).toBe(true);
    expect(result.reason).toBe('proved');
  });

  it('HypotheticalSyllogism: {P→Q, Q→R} ⊢ P→R', async () => {
    const p = Atom('a');
    const q = Atom('b');
    const r = Atom('c');
    const kb: TdfolFormula[] = [Implies(p, q), Implies(q, r)];
    const result = await bridge.prove(kb, Implies(p, r));
    expect(result.proved).toBe(true);
  });

  it('DoubleNegationElimination: ¬¬P ⊢ P', async () => {
    const p = Atom('sunny');
    const kb: TdfolFormula[] = [Negation(Negation(p))];
    const result = await bridge.prove(kb, p);
    expect(result.proved).toBe(true);
  });

  it('TemporalS4: □φ ⊢ □□φ', async () => {
    const phi = Atom('stable');
    const kb: TdfolFormula[] = [Always(phi)];
    const goal = Always(Always(phi));
    const result = await bridge.prove(kb, goal);
    expect(result.proved).toBe(true);
  });

  it('TemporalS5: ◊φ ⊢ □◊φ', async () => {
    const phi = Atom('event');
    const kb: TdfolFormula[] = [Eventually(phi)];
    const goal = Always(Eventually(phi));
    const result = await bridge.prove(kb, goal);
    expect(result.proved).toBe(true);
  });

  it('ObligationWeakening: O(φ ∧ ψ) ⊢ O(φ)', async () => {
    const phi = Atom('file_report');
    const psi = Atom('audit');
    const kb: TdfolFormula[] = [Obligation(Conjunction(phi, psi))];
    const result = await bridge.prove(kb, Obligation(phi));
    expect(result.proved).toBe(true);
  });

  it('DeonticDetachment: {O(φ→ψ), φ} ⊢ O(ψ)', async () => {
    const phi = Atom('log_in');
    const psi = Atom('audit_trail');
    const kb: TdfolFormula[] = [Obligation(Implies(phi, psi)), phi];
    const result = await bridge.prove(kb, Obligation(psi));
    expect(result.proved).toBe(true);
  });

  it('TemporalObligationPersistence: O(□φ) ⊢ □O(φ)', async () => {
    const phi = Atom('comply');
    const kb: TdfolFormula[] = [Obligation(Always(phi) as unknown as import('../../src/services/provers/dcec-types.js').DCECFormula)];
    const result = await bridge.prove(kb, Always(Obligation(phi)));
    expect(result.proved).toBe(true);
  });

  it('FutureObligationPersistence: O(φ) ⊢ □O(φ)', async () => {
    const phi = Atom('report');
    const kb: TdfolFormula[] = [Obligation(phi)];
    const result = await bridge.prove(kb, Always(Obligation(phi)));
    expect(result.proved).toBe(true);
  });

  it('ObligationEventually: □O(φ) ⊢ ◊φ', async () => {
    const phi = Atom('submit');
    const kb: TdfolFormula[] = [Always(Obligation(phi))];
    const result = await bridge.prove(kb, Eventually(phi));
    expect(result.proved).toBe(true);
  });

  it('PermissionProhibitionDuality: P(φ) ⊢ ¬F(φ)', async () => {
    const phi = Atom('read_file');
    const kb: TdfolFormula[] = [Permission(phi)];
    const result = await bridge.prove(kb, Negation(Prohibition(phi)));
    expect(result.proved).toBe(true);
  });

  it('base rules still work: TemporalT □φ ⊢ φ', async () => {
    const phi = Atom('safe');
    const kb: TdfolFormula[] = [Always(phi)];
    const result = await bridge.prove(kb, phi);
    expect(result.proved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-78: ProverRouterBridgeAdapter
// ---------------------------------------------------------------------------

describe('T-78 ProverRouterBridgeAdapter', () => {
  let adapter: ProverRouterBridgeAdapter;
  beforeEach(() => { adapter = new ProverRouterBridgeAdapter(); });

  it('evaluate() returns ProofGateResult with correct structure', async () => {
    const formulas: TdfolFormula[] = [Atom('phi'), Atom('psi')];
    const result = await adapter.evaluate(formulas);
    expect(typeof result.compiles).toBe('boolean');
    expect(typeof result.valid_count).toBe('number');
    expect(result.attempted_count).toBe(2);
    expect(typeof result.failure_ratio).toBe('number');
    expect(Array.isArray(result.details)).toBe(true);
    expect(['ok', 'partial', 'failed']).toContain(result.status);
  });

  it('evaluate() on empty formula list returns ok with zero counts', async () => {
    const result = await adapter.evaluate([]);
    expect(result.attempted_count).toBe(0);
    expect(result.compiles).toBe(true);
    expect(result.status).toBe('ok');
  });

  it('checkConsistency() on empty is ok', async () => {
    const result = await adapter.checkConsistency([]);
    expect(result.status).toBe('ok');
    expect(result.compiles).toBe(true);
  });

  it('checkConsistency() on consistent norms is ok', async () => {
    const norms: TdfolFormula[] = [
      Permission(Atom('read_file')),
      Obligation(Atom('log_access')),
    ];
    const result = await adapter.checkConsistency(norms);
    expect(result.compiles).toBe(true);
    expect(result.status).toBe('ok');
  });

  it('checkConsistency() detects O+F normative conflict', async () => {
    const phi = Atom('delete_record');
    const conflicting: TdfolFormula[] = [
      Obligation(phi),
      Prohibition(phi),
    ];
    const result = await adapter.checkConsistency(conflicting);
    expect(result.compiles).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.failure_ratio).toBe(1.0);
  });

  it('evaluate() details include formula strings and prover_id', async () => {
    const formulas: TdfolFormula[] = [Obligation(Atom('audit'))];
    const result = await adapter.evaluate(formulas);
    expect(result.details).toHaveLength(1);
    expect(result.details[0].formula).toBe(serializeTdfol(formulas[0]));
    expect(typeof result.details[0].prover_id).toBe('string');
  });
});
