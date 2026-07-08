/**
 * wasm-prover-sprint80.test.ts
 * Tests for Sprint 80 — §12 final PORT items closure
 */

import { explainProof, suggestProofStrategy } from '../../src/services/provers/neural-prover-bridge';
import { applyAlphaRule, applyBetaRule, isAlphaFormula, isBetaFormula, propositionalTableauxExpand, toProofStepWire } from '../../src/services/logic/cec/cec-modal-tableaux';
import { synthesisHintsFromAutoencoderIntrospection } from '../../src/services/logic/modal/modal-synthesis';
import { residualSignatureForHint } from '../../src/services/logic/modal/modal-synthesis';
import { augmentLegalIrProjectionTriples, LEGAL_CITATION_STRUCTURE, LEGAL_DOCUMENT_SCOPE } from '../../src/services/logic/modal/modal-kg-bridge';
import { withFLogicOptimizer } from '../../src/services/logic/modal/modal-logic-codec';
import { getFreeVariables, mkConstant, mkDeontic, mkFuncApp, mkPredicate, mkQuantified, mkTemporal, mkVariable, substitute } from '../../src/services/logic/tdfol/tdfol-core';
import { naryAnd, naryOr } from '../../src/services/logic/dcec/dcec-core-types';
import { DcecProverBridge } from '../../src/services/provers/dcec-prover-bridge';
import { Atom, Conjunction, Implies, Negation, Obligation, Permission, Prohibition } from '../../src/services/logic/dcec/dcec-types';

// ---------------------------------------------------------------------------
// PORT-003 / PORT-051 / PORT-052 / PORT-053 / PORT-094 — Type-system closure
// ---------------------------------------------------------------------------
describe('PORT-003 TDFOL free variables + substitution', () => {
  it('collects free variables through predicate and function terms', () => {
    const x = mkVariable('x', 'Agent');
    const y = mkVariable('y', 'Object');
    const formula = mkPredicate('Owns', [x, mkFuncApp('resourceOf', [y])]);
    expect([...getFreeVariables(formula)].sort()).toEqual(['x', 'y']);
  });

  it('substitutes variables structurally inside function terms', () => {
    const x = mkVariable('x', 'Agent');
    const formula = mkPredicate('Owns', [mkFuncApp('managerOf', [x])]);
    const result = substitute(formula, 'x', mkConstant('alice', 'alice', 'Agent'));
    expect(result.toStr()).toBe('Owns(managerOf(alice))');
  });

  it('does not substitute a variable bound by a quantifier', () => {
    const x = mkVariable('x', 'Agent');
    const body = mkPredicate('Acts', [x]);
    const quantified = mkQuantified('∀', x, body);
    const result = substitute(quantified, 'x', mkConstant('alice', 'alice', 'Agent'));
    expect(result.toStr()).toBe('∀x:Agent.(Acts(x:Agent))');
    expect([...getFreeVariables(result)]).toEqual([]);
  });
});

describe('PORT-051/052/053 TDFOL typed temporal/deontic/quantified fields', () => {
  it('serializes bounded temporal operators', () => {
    const bounded = mkTemporal('□', mkPredicate('Safe'), undefined, 3);
    expect(bounded.toStr()).toBe('□[3](Safe)');
    expect(bounded.toDict().timeBound).toBe(3);
  });

  it('keeps structured deontic agents and context aliases', () => {
    const agent = mkFuncApp('managerOf', [mkVariable('x', 'Agent')], 'Agent');
    const obligation = mkDeontic('O', mkPredicate('Approve'), agent, 'deadline');
    expect(obligation.toStr()).toBe('O[managerOf(x:Agent)](Approve)@deadline');
    expect(obligation.toDict().context).toBe('deadline');
    expect([...getFreeVariables(obligation)]).toEqual(['x']);
  });

  it('stores quantified variables as typed Variable nodes', () => {
    const quantified = mkQuantified('∃', mkVariable('x', 'Agent'), mkPredicate('Human', [mkVariable('x', 'Agent')]));
    expect(quantified.variable).toBe('x');
    expect(quantified.variableTerm?.sort).toBe('Agent');
    expect((quantified.toDict().variableTerm as Record<string, unknown>).sort).toBe('Agent');
  });
});

describe('PORT-094 n-ary DCEC connectives', () => {
  it('builds n-ary conjunction and disjunction strings', () => {
    expect(naryAnd(['P', 'Q', 'R'])).toBe('((P ∧ Q) ∧ R)');
    expect(naryOr(['P', 'Q', 'R'])).toBe('((P ∨ Q) ∨ R)');
  });
});

// ---------------------------------------------------------------------------
// PORT-040 — Neural confidence + explain + suggest
// ---------------------------------------------------------------------------
describe('PORT-040 Neural confidence + explain API', () => {
  it('explainProof returns NeuralProofExplanation', () => {
    const r = explainProof('O(agent, deliver)', { proved: true, reason: 'proved' });
    expect(r.confidence).toBeGreaterThan(0.5);
    expect(typeof r.reasoning).toBe('string');
    expect(typeof r.strategy).toBe('string');
    expect(Array.isArray(r.steps)).toBe(true);
  });

  it('confidence is lower for unknown result', () => {
    const rYes = explainProof('P → Q', { proved: true,  reason: 'proved' });
    const rNo  = explainProof('P → Q', { proved: false, reason: 'unknown' });
    expect(rYes.confidence).toBeGreaterThan(rNo.confidence);
  });

  it('suggestProofStrategy routes deontic to dcec-native', () => {
    expect(suggestProofStrategy('O(agent, deliver)')).toBe('dcec-native');
  });
  it('suggestProofStrategy routes temporal to modal-tableaux', () => {
    expect(suggestProofStrategy('□P → ◊Q')).toBe('modal-tableaux');
  });
  it('suggestProofStrategy routes FOL to cvc5-wasm', () => {
    expect(suggestProofStrategy('∀x Human(x) → Mortal(x)')).toBe('cvc5-wasm');
  });
});

// ---------------------------------------------------------------------------
// PORT-100 — Propositional α/β tableaux rules
// ---------------------------------------------------------------------------
describe('PORT-100 Propositional α/β tableaux', () => {
  it('applyAlphaRule: ¬¬φ → φ', () => {
    const r = applyAlphaRule('¬¬P');
    expect(r).not.toBeNull();
    expect(r![0]).toBe('P');
  });

  it('applyAlphaRule: (P ∧ Q) → P, Q', () => {
    const r = applyAlphaRule('(P ∧ Q)');
    expect(r).not.toBeNull();
    expect(r!.length).toBe(2);
  });

  it('applyBetaRule: (P ∨ Q) → {P} | {Q}', () => {
    const r = applyBetaRule('(P ∨ Q)');
    expect(r).not.toBeNull();
    expect(r![0]).toEqual(['P']);
    expect(r![1]).toEqual(['Q']);
  });

  it('applyBetaRule: (P → Q) → {¬P} | {Q}', () => {
    const r = applyBetaRule('(P → Q)');
    expect(r).not.toBeNull();
    expect(r![0][0]).toBe('¬P');
    expect(r![1][0]).toBe('Q');
  });

  it('isAlphaFormula identifies ¬¬P', () => {
    expect(isAlphaFormula('¬¬P')).toBe(true);
    expect(isAlphaFormula('P')).toBe(false);
  });

  it('isBetaFormula identifies (P ∨ Q)', () => {
    expect(isBetaFormula('(P ∨ Q)')).toBe(true);
    expect(isBetaFormula('P')).toBe(false);
  });

  it('propositionalTableauxExpand closes contradictory set', () => {
    const result = propositionalTableauxExpand(['P', '¬P']);
    expect(result.closed).toBe(true);
    expect(result.open).toHaveLength(0);
  });

  it('propositionalTableauxExpand keeps consistent set open', () => {
    const result = propositionalTableauxExpand(['P', 'Q']);
    expect(result.closed).toBe(false);
  });

  it('propositionalTableauxExpand derives alpha components', () => {
    const result = propositionalTableauxExpand(['(P ∧ Q)']);
    expect(result.closed).toBe(false);
    expect(result.open[0]).toEqual(expect.arrayContaining(['P', 'Q']));
  });

  it('propositionalTableauxExpand closes both beta branches when alternatives contradict', () => {
    const result = propositionalTableauxExpand(['(P ∨ Q)', '¬P', '¬Q']);
    expect(result.closed).toBe(true);
    expect(result.open).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// PORT-101 — Python-compatible proof-step schema
// ---------------------------------------------------------------------------
describe('PORT-101 ProofStep wire schema', () => {
  it('exports Python-compatible rule/premises/conclusion fields', () => {
    const wire = toProofStepWire({ rule: 'ModusPonens', premises: ['P', 'P → Q'], conclusion: 'Q' });
    expect(wire.ruleName).toBe('ModusPonens');
    expect(wire.rule).toBe('ModusPonens');
    expect(wire.premises).toEqual(['P', 'P → Q']);
    expect(wire.conclusion).toBe('Q');
    expect(wire.formula).toBe('Q');
  });
});

// ---------------------------------------------------------------------------
// PORT-102 — DcecProverBridge mirrors Python core rule set
// ---------------------------------------------------------------------------
describe('PORT-102 DcecProverBridge Python-rule conformance', () => {
  let bridge: DcecProverBridge;
  beforeEach(() => { bridge = new DcecProverBridge(); });

  it('matches ModusPonens: P, P→Q ⊢ Q', async () => {
    const p = Atom('p');
    const q = Atom('q');
    const result = await bridge.prove([p, Implies(p, q)], q);
    expect(result.proved).toBe(true);
  });

  it('matches Simplification: P∧Q ⊢ P and Q', async () => {
    const p = Atom('p');
    const q = Atom('q');
    await expect(bridge.prove([Conjunction(p, q)], p)).resolves.toMatchObject({ proved: true });
    await expect(bridge.prove([Conjunction(p, q)], q)).resolves.toMatchObject({ proved: true });
  });

  it('matches DeonticProhibition equivalence: F(φ) ⊢ O(¬φ)', async () => {
    const phi = Atom('share_data');
    const result = await bridge.prove([Prohibition(phi)], Obligation(Negation(phi)));
    expect(result.proved).toBe(true);
  });

  it('matches DeonticPermission/obligation transfer: O(φ) ⊢ P(φ)', async () => {
    const phi = Atom('submit_report');
    const result = await bridge.prove([Obligation(phi)], Permission(phi));
    expect(result.proved).toBe(true);
  });

  it('matches ForbiddenToNotOblig: F(φ) ⊢ ¬O(φ)', async () => {
    const phi = Atom('delete_record');
    const result = await bridge.prove([Prohibition(phi)], Negation(Obligation(phi)));
    expect(result.proved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PORT-121 — residualSignatureForHint includes 11 fields
// ---------------------------------------------------------------------------
describe('PORT-121 residualSignatureForHint 11 fields', () => {
  const hint = {
    id: 'h1', action: 'REALIGN', targetComponent: 'modal_form', domain: 'legal',
    frameFeatures: ['obligation', 'temporal'], priority: 0.8, status: 'proposed',
    evidence: {
      bridge_failure_name: 'loss_1',
      primary_legal_ir_component_gap: 'modality',
      predicted_family: 'standard',
      target_family:    'deontic',
      frame_features:   ['obligation', 'temporal'],
      rule_id:          'R-001',
      constraint_type:  'hard',
      primary_loss:     'modality_loss',
    },
  };

  it('returns a 24-char hex string', () => {
    const sig = residualSignatureForHint(hint as unknown as Parameters<typeof residualSignatureForHint>[0]);
    expect(typeof sig).toBe('string');
    expect(sig.length).toBe(24);
  });

  it('is deterministic', () => {
    const s1 = residualSignatureForHint(hint as unknown as Parameters<typeof residualSignatureForHint>[0]);
    const s2 = residualSignatureForHint(hint as unknown as Parameters<typeof residualSignatureForHint>[0]);
    expect(s1).toBe(s2);
  });
});

// ---------------------------------------------------------------------------
// PORT-122 — synthesisHintsFromAutoencoderIntrospection
// ---------------------------------------------------------------------------
describe('PORT-122 synthesisHintsFromAutoencoderIntrospection', () => {
  it('returns hints for family gap', () => {
    const intro = {
      residualVector: [0.1, 0.2],
      lossBreakdown:  { primary_loss: 0.5, modality_loss: 0.3 },
      frameFeatures:  ['obligation'],
      predictedFamily: 'standard',
      targetFamily:    'deontic',
    };
    const hints = synthesisHintsFromAutoencoderIntrospection(intro, 'legal');
    expect(Array.isArray(hints)).toBe(true);
    expect(hints.length).toBeGreaterThan(0);
    expect(hints[0].domain).toBe('legal');
    expect(hints[0].evidence.frame_features).toEqual(['obligation']);
  });

  it('returns no hints when families match', () => {
    const intro = {
      residualVector: [],
      lossBreakdown:  {},
      frameFeatures:  [],
      predictedFamily: 'deontic',
      targetFamily:    'deontic',
    };
    const hints = synthesisHintsFromAutoencoderIntrospection(intro);
    expect(hints.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PORT-123 — KG label constants + augmentLegalIrProjectionTriples
// ---------------------------------------------------------------------------
describe('PORT-123 KG label constants', () => {
  it('LEGAL_CITATION_STRUCTURE is defined', () => {
    expect(LEGAL_CITATION_STRUCTURE).toBe('legal_citation_structure');
  });
  it('LEGAL_DOCUMENT_SCOPE is defined', () => {
    expect(LEGAL_DOCUMENT_SCOPE).toBe('legal_document_scope');
  });

  it('augmentLegalIrProjectionTriples adds 3 new triples', () => {
    const base = [{ subject: 'doc1', predicate: 'mentions', object: 'obligation' }];
    const augmented = augmentLegalIrProjectionTriples(base, 'doc1', 'contract');
    expect(augmented.length).toBe(4); // 1 base + 3 augmented
  });
});

// ---------------------------------------------------------------------------
// PORT-125 — FLogicOptimizer hook
// ---------------------------------------------------------------------------
describe('PORT-125 withFLogicOptimizer', () => {
  it('adds flogicOptimized and flogicScore fields', () => {
    const result = { confidence: 0.8, score: 0.75 };
    const opt = withFLogicOptimizer(result, 0.9);
    expect(opt.flogicOptimized).toBe(true);
    expect(opt.flogicScore).toBe(0.9);
    expect(opt.confidence).toBe(0.8);
  });

  it('flogicOptimized is false when no score provided', () => {
    const opt = withFLogicOptimizer({ confidence: 0.7 });
    expect(opt.flogicOptimized).toBe(false);
    expect(opt.flogicScore).toBe(0.7);
  });
});
