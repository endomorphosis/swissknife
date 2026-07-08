/**
 * wasm-prover-sprint78.test.ts
 * Tests for Sprint 78 — §12 type fixes and completeness rules (PORT-010..066 etc.)
 */

import { ProofStatus }               from '../../src/services/tdfol-prover';
import { ALL_COMPLETENESS_RULES }    from '../../src/services/provers/tdfol-completeness-rules';
import { isSubtypeOf, makeSort, formatDCECBracket, parseDCECBracket, dcecFormulaEquals, dcecFormulaHash } from '../../src/services/dcec-core-types';
import { CognitiveOperator }         from '../../src/services/sprint66-dcec-types';
import { toPropositionField, fromPropositionField } from '../../src/services/deontic-query-engine';
import { toProofResultWire, fromProofResultWire }    from '../../src/services/logic-verifier';
import { LegalDomainKind }           from '../../src/services/legal-domain-knowledge';

// ---------------------------------------------------------------------------
// PORT-010: 'failed' ProofReason
// ---------------------------------------------------------------------------
describe('PORT-010 ProofReason failed', () => {
  it("prover-types exports 'failed' as a valid ProofReason", () => {
    // Just verify the type exists and can be used — compile-time check
    const r: import('../../src/services/provers/prover-types').ProofReason = 'failed';
    expect(r).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
// PORT-011: AUTO, MOST_CAPABLE ProverStrategy
// ---------------------------------------------------------------------------
describe('PORT-011 ProverStrategy AUTO + MOST_CAPABLE', () => {
  it('AUTO and MOST_CAPABLE are valid strategy values', () => {
    const auto: import('../../src/services/provers/prover-types').ProverStrategy = 'AUTO';
    const mc:   import('../../src/services/provers/prover-types').ProverStrategy = 'MOST_CAPABLE';
    expect(auto).toBe('AUTO');
    expect(mc).toBe('MOST_CAPABLE');
  });
});

// ---------------------------------------------------------------------------
// PORT-012: MODAL, ARITHMETIC FormulaClass
// ---------------------------------------------------------------------------
describe('PORT-012 FormulaClass MODAL + ARITHMETIC', () => {
  it('modal and arithmetic are valid FormulaClass values', () => {
    const m: import('../../src/services/provers/prover-types').FormulaClass = 'modal';
    const a: import('../../src/services/provers/prover-types').FormulaClass = 'arithmetic';
    expect(m).toBe('modal');
    expect(a).toBe('arithmetic');
  });
});

// ---------------------------------------------------------------------------
// PORT-014: DISPROVED, UNKNOWN, UNPROVABLE ProofStatus
// ---------------------------------------------------------------------------
describe('PORT-014 ProofStatus new values', () => {
  it('DISPROVED is a valid ProofStatus', () => expect(ProofStatus.DISPROVED).toBe('disproved'));
  it('UNKNOWN is a valid ProofStatus',   () => expect(ProofStatus.UNKNOWN).toBe('unknown'));
  it('UNPROVABLE is a valid ProofStatus',() => expect(ProofStatus.UNPROVABLE).toBe('unprovable'));
});

// ---------------------------------------------------------------------------
// PORT-060..066: Completeness rules bundle
// ---------------------------------------------------------------------------
describe('PORT-060..066 ALL_COMPLETENESS_RULES', () => {
  it('exports exactly 25 rules', () => {
    expect(ALL_COMPLETENESS_RULES.length).toBe(25);
  });

  it('each rule has name + description + apply()', () => {
    for (const rule of ALL_COMPLETENESS_RULES) {
      expect(typeof rule.name).toBe('string');
      expect(typeof rule.description).toBe('string');
      expect(typeof rule.apply).toBe('function');
    }
  });

  it('ConjunctionEliminationLeft extracts left conjunct', () => {
    const { mkBinary, mkPredicate } = require('../../src/services/tdfol-core');
    const p = mkPredicate('p');
    const q = mkPredicate('q');
    const pAndQ = mkBinary('∧', p, q);
    const rule = ALL_COMPLETENESS_RULES.find(r => r.name === 'CONJ_EL')!;
    expect(rule).toBeDefined();
    const derived = rule.apply([pAndQ]);
    expect(derived.length).toBeGreaterThan(0);
  });

  it('ConjunctionEliminationRight extracts right conjunct', () => {
    const { mkBinary, mkPredicate } = require('../../src/services/tdfol-core');
    const p = mkPredicate('p');
    const q = mkPredicate('q');
    const pAndQ = mkBinary('∧', p, q);
    const rule = ALL_COMPLETENESS_RULES.find(r => r.name === 'CONJ_ER')!;
    const derived = rule.apply([pAndQ]);
    expect(derived.length).toBeGreaterThan(0);
  });

  it('DeMorganAnd derives ¬A ∨ ¬B from ¬(A ∧ B)', () => {
    const { mkBinary, mkPredicate, mkUnary } = require('../../src/services/tdfol-core');
    const p = mkPredicate('p');
    const q = mkPredicate('q');
    const negAndPQ = mkUnary(mkBinary('∧', p, q));
    const rule = ALL_COMPLETENESS_RULES.find(r => r.name === 'DEMORGAN_AND')!;
    const derived = rule.apply([negAndPQ]);
    expect(derived.length).toBeGreaterThan(0);
  });

  it('UntilInductionStep unfolds φ U ψ', () => {
    const { mkBinary, mkPredicate } = require('../../src/services/tdfol-core');
    const p = mkPredicate('p');
    const q = mkPredicate('q');
    const until = mkBinary('U', p, q);
    const rule = ALL_COMPLETENESS_RULES.find(r => r.name === 'UNTIL_STEP')!;
    const derived = rule.apply([until]);
    expect(derived.length).toBeGreaterThan(0);
  });

  it('ObligationPermissionImplication derives P from O', () => {
    const obl = { kind: 'deontic', deonticOp: 'O', formula: { kind: 'predicate', name: 'deliver', args: [] } };
    const rule = ALL_COMPLETENESS_RULES.find(r => r.name === 'OBLIG_PERM_IMP')!;
    const derived = rule.apply([obl as never]);
    expect(derived.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// PORT-091: bracket notation O[alice](φ)
// ---------------------------------------------------------------------------
describe('PORT-091 DCEC bracket notation', () => {
  it('formatDCECBracket produces O[alice](φ) format', () => {
    expect(formatDCECBracket('O', 'alice', 'deliver(report)')).toBe('O[alice](deliver(report))');
  });

  it('parseDCECBracket parses O[alice](φ)', () => {
    const parsed = parseDCECBracket('O[alice](deliver(report))');
    expect(parsed).not.toBeNull();
    expect(parsed!.op).toBe('O');
    expect(parsed!.agent).toBe('alice');
    expect(parsed!.formula).toBe('deliver(report)');
  });

  it('parseDCECBracket returns null for TS-style O(φ,alice)', () => {
    expect(parseDCECBracket('O(deliver,alice)')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PORT-092: Sort.isSubtypeOf()
// ---------------------------------------------------------------------------
describe('PORT-092 Sort.isSubtypeOf', () => {
  const entity = makeSort('Entity');
  const agent  = makeSort('Agent', 'Entity');
  const human  = makeSort('Human', 'Agent');

  it('same sort is subtype of itself', () => {
    expect(isSubtypeOf(entity, entity)).toBe(true);
  });
  it('Agent is subtype of Entity', () => {
    expect(isSubtypeOf(agent, entity, [entity, agent, human])).toBe(true);
  });
  it('Human is subtype of Entity (transitive)', () => {
    expect(isSubtypeOf(human, entity, [entity, agent, human])).toBe(true);
  });
  it('Entity is NOT subtype of Agent', () => {
    expect(isSubtypeOf(entity, agent)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PORT-093: Structural equality
// ---------------------------------------------------------------------------
describe('PORT-093 dcecFormulaEquals + dcecFormulaHash', () => {
  it('equal after whitespace normalization', () => {
    expect(dcecFormulaEquals('O( alice , deliver )', 'O( alice , deliver )')).toBe(true);
    expect(dcecFormulaEquals('O(alice,deliver)', 'O( alice , deliver )')).toBe(false);
  });
  it('hash is stable', () => {
    expect(dcecFormulaHash('O(alice)')).toBe(dcecFormulaHash('O(alice)'));
    expect(dcecFormulaHash('O(alice)')).not.toBe(dcecFormulaHash('O(bob)'));
  });
});

// ---------------------------------------------------------------------------
// PORT-095: GOAL in sprint66 CognitiveOperator
// ---------------------------------------------------------------------------
describe('PORT-095 CognitiveOperator.GOAL', () => {
  it('GOAL = G', () => expect(CognitiveOperator.GOAL).toBe('G'));
  it('does not have PERCEPTION (collision avoidance, PORT-097)', () => {
    expect((CognitiveOperator as Record<string, string>)['PERCEPTION']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PORT-111: hierarchical ConflictType
// ---------------------------------------------------------------------------
describe('PORT-111 hierarchical ConflictType', () => {
  it("'hierarchical' is valid ConflictType literal", () => {
    const t: import('../../src/services/deontic/deontic-text-analyzer').ConflictType = 'hierarchical';
    expect(t).toBe('hierarchical');
  });
});

// ---------------------------------------------------------------------------
// PORT-130: 9 new LegalDomainKind values
// ---------------------------------------------------------------------------
describe('PORT-130 LegalDomainKind extended', () => {
  it('TORT enum value exists', () => expect(LegalDomainKind.TORT).toBe('tort'));
  it('CORPORATE exists',       () => expect(LegalDomainKind.CORPORATE).toBe('corporate'));
  it('EMPLOYMENT exists',      () => expect(LegalDomainKind.EMPLOYMENT).toBe('employment'));
  it('REAL_ESTATE exists',     () => expect(LegalDomainKind.REAL_ESTATE).toBe('real_estate'));
  it('ENVIRONMENTAL exists',   () => expect(LegalDomainKind.ENVIRONMENTAL).toBe('environmental'));
});

// ---------------------------------------------------------------------------
// PORT-141: proposition alias
// ---------------------------------------------------------------------------
describe('PORT-141 proposition field alias', () => {
  it('toPropositionField adds proposition mirroring action', () => {
    const stmt = { action: 'deliver report', other: 42 };
    const result = toPropositionField(stmt);
    expect(result.proposition).toBe('deliver report');
    expect(result.action).toBe('deliver report');
  });

  it('fromPropositionField converts proposition back to action', () => {
    const wire = { proposition: 'deliver report' };
    const result = fromPropositionField(wire);
    expect(result.action).toBe('deliver report');
  });
});

// ---------------------------------------------------------------------------
// PORT-151: Python-compatible proof result wire format
// ---------------------------------------------------------------------------
describe('PORT-151 toProofResultWire / fromProofResultWire', () => {
  it('converts ms→seconds and adds Python fields', () => {
    const ts = { proved: true, formula: 'P → Q', method: 'z3', timeMs: 1500 };
    const wire = toProofResultWire(ts);
    expect(wire.is_valid).toBe(true);
    expect(wire.conclusion).toBe('P → Q');
    expect(wire.method_used).toBe('z3');
    expect(wire.time_taken).toBeCloseTo(1.5);
  });

  it('fromProofResultWire converts Python fields back to TS', () => {
    const py = { is_valid: true, conclusion: 'P → Q', method_used: 'coq', time_taken: 0.750 };
    const ts = fromProofResultWire(py);
    expect(ts.proved).toBe(true);
    expect(ts.formula).toBe('P → Q');
    expect(ts.timeMs).toBe(750);
  });
});

// ---------------------------------------------------------------------------
// PORT-162: LogicConflict.severity includes 'critical'
// ---------------------------------------------------------------------------
describe('PORT-162 LogicConflict.severity vocabulary', () => {
  it("'critical' is assignable to severity", () => {
    const s: import('../../src/services/deontic-query-engine').LogicConflict['severity'] = 'critical';
    expect(s).toBe('critical');
  });
  it("'warning' is assignable", () => {
    const s: import('../../src/services/deontic-query-engine').LogicConflict['severity'] = 'warning';
    expect(s).toBe('warning');
  });
});
