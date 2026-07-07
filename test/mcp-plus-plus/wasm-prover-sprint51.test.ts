/**
 * Sprint 51 tests — CEC Advanced Inference, Deontic Rules, Event Calculus, French Parser
 *
 * Covers T-228 (cec-advanced-inference.ts),
 *         T-229 (deontic-inference-rules.ts),
 *         T-230 (event-calculus.ts),
 *         T-231 (french-parser.ts).
 */

import {
  ModalKAxiom, ModalTAxiom, ModalS4Axiom, ModalNecessitation,
  ModalNecassitation,
  TemporalInduction, FrameAxiom,
  DeonticDRule, DeonticPermissionObligation, DeonticDistribution, KnowledgeObligation,
  TemporalObligation,
  ALL_ADVANCED_RULES, findApplicableAdvancedRules,
  get_all_advanced_rules, get_combined_rules, get_deontic_rules, get_modal_rules, get_temporal_rules,
} from '../../src/services/logic/cec/cec-advanced-inference';

import {
  DeonticKAxiomRule, DeonticDAxiomRule, ProhibitionEquivalenceRule,
  PermissionNegationRule, ObligationConsistencyRule, PermissionIntroductionRule,
  DeonticNecessitationRule, ProhibitionFromObligationRule,
  ObligationWeakeningRule, PermissionStrengtheningRule,
  ALL_DEONTIC_RULES, findApplicableDeonticRules,
  obligation, permission, prohibition,
  DeonticOp,
} from '../../src/services/logic/deontic/deontic-inference-rules';
import { atom, binary, unary, LogicOperator } from '../../src/services/logic/tdfol/temporal-inference-rules';

import {
  Event, Fluent, TimePoint, EventCalculus,
} from '../../src/services/logic/cec/event-calculus';

import {
  FrenchPatternMatcher, FrenchParser,
  getFrenchVerbConjugations, getFrenchArticles,
  getFrenchNegationPatterns, getFrenchDeonticKeywords,
  FR_DEONTIC_OP,
} from '../../src/services/logic/nl/french-parser';

// ---------------------------------------------------------------------------
// CEC Advanced Inference Rules tests
// ---------------------------------------------------------------------------

describe('ALL_ADVANCED_RULES registry', () => {
  test('contains the Python advanced_inference rule set', () => { expect(ALL_ADVANCED_RULES).toHaveLength(11); });
  test('rule names are unique', () => {
    const names = ALL_ADVANCED_RULES.map(r => r.name);
    expect(new Set(names).size).toBe(11);
  });
  test('Python-compatible helper registries partition the rule set', () => {
    expect(get_modal_rules()).toHaveLength(4);
    expect(get_temporal_rules()).toHaveLength(2);
    expect(get_deontic_rules()).toHaveLength(3);
    expect(get_combined_rules()).toHaveLength(2);
    expect(get_all_advanced_rules().map(rule => rule.name)).toEqual(ALL_ADVANCED_RULES.map(rule => rule.name));
  });
});

describe('ModalKAxiom', () => {
  const rule = new ModalKAxiom();
  test('applies to □(A→B)', () => { expect(rule.canApply(['□(P→Q)'])).toBe(true); });
  test('does not apply to plain formula', () => { expect(rule.canApply(['P'])).toBe(false); });
  test('produces □A → □B', () => {
    const out = rule.apply(['□(P→Q)']);
    expect(out[0]).toContain('□P');
    expect(out[0]).toContain('□Q');
  });
});

describe('ModalTAxiom', () => {
  const rule = new ModalTAxiom();
  test('applies to □φ', () => { expect(rule.canApply(['□P'])).toBe(true); });
  test('strips □ to produce inner formula', () => {
    const out = rule.apply(['□P']);
    expect(out[0]).toBe('P');
  });
});

describe('ModalS4Axiom', () => {
  const rule = new ModalS4Axiom();
  test('produces □□φ from □φ', () => {
    const out = rule.apply(['□P']);
    expect(out[0]).toBe('□□P');
  });
});

describe('ModalNecessitation', () => {
  const rule = new ModalNecessitation();
  test('wraps formula in □', () => {
    const out = rule.apply(['P']);
    expect(out[0]).toBe('□P');
  });
});

describe('ModalNecassitation', () => {
  const rule = new ModalNecassitation();
  test('wraps non-modal theorem in system knowledge', () => {
    expect(rule.apply(['P'])).toEqual(['K(system, P)']);
  });
});

describe('DeonticDRule', () => {
  const rule = new DeonticDRule();
  test('applies to O(φ)', () => { expect(rule.canApply(['O(P)'])).toBe(true); });
  test('produces P(φ)', () => {
    const out = rule.apply(['O(P)']);
    expect(out[0]).toBe('P(P)');
  });
});

describe('DeonticPermissionObligation', () => {
  const rule = new DeonticPermissionObligation();
  test('detects O(P) ∧ P(¬P) conflict', () => {
    expect(rule.canApply(['O(P)', 'P(¬P)'])).toBe(true);
  });
  test('produces ⊥', () => {
    expect(rule.apply(['O(P)', 'P(¬P)'])[0]).toBe('⊥');
  });
});

describe('DeonticDistribution', () => {
  const rule = new DeonticDistribution();
  test('applies to O(A ∧ B)', () => { expect(rule.canApply(['O(P ∧ Q)'])).toBe(true); });
  test('produces O(P) and O(Q)', () => {
    const out = rule.apply(['O(P ∧ Q)']);
    expect(out).toContain('O(P)');
    expect(out).toContain('O(Q)');
  });
});

describe('KnowledgeObligation', () => {
  const rule = new KnowledgeObligation();
  test('applies to K(agent, O(P))', () => { expect(rule.canApply(['K(alice, O(pay))'])).toBe(true); });
  test('produces O(pay)', () => {
    const out = rule.apply(['K(alice, O(pay))']);
    expect(out[0]).toBe('O(pay)');
  });
});

describe('TemporalObligation', () => {
  const rule = new TemporalObligation();
  test('turns an eventual obligation into eventual obligation content', () => {
    expect(rule.apply(['O(◇pay)'])).toEqual(['◇O(pay)']);
  });
  test('persists ordinary obligations conservatively', () => {
    expect(rule.apply(['O(pay)'])).toEqual(['O(pay)']);
  });
});

describe('findApplicableAdvancedRules', () => {
  test('finds T axiom for □P', () => {
    const rules = findApplicableAdvancedRules(['□P']);
    expect(rules.some(r => r.name === 'Modal T Axiom')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Deontic Inference Rules tests
// ---------------------------------------------------------------------------

describe('ALL_DEONTIC_RULES', () => {
  test('contains exactly 10 rules', () => { expect(ALL_DEONTIC_RULES).toHaveLength(10); });
  test('rule names are unique', () => {
    const names = ALL_DEONTIC_RULES.map(r => r.name);
    expect(new Set(names).size).toBe(10);
  });
});

describe('DeonticDAxiomRule', () => {
  const rule = new DeonticDAxiomRule();
  const phi = atom('P');
  const oblPhi = obligation(phi);
  test('applies to O(φ)', () => { expect(rule.canApply(oblPhi)).toBe(true); });
  test('produces P(φ)', () => {
    const r = rule.apply(oblPhi);
    expect((r as any).op).toBe(DeonticOp.PERMISSION);
  });
});

describe('ProhibitionEquivalenceRule', () => {
  const rule = new ProhibitionEquivalenceRule();
  const phi = atom('P');
  test('applies to F(φ)', () => { expect(rule.canApply(prohibition(phi))).toBe(true); });
  test('produces O(¬φ)', () => {
    const r = rule.apply(prohibition(phi)) as any;
    expect(r.op).toBe(DeonticOp.OBLIGATION);
    expect(r.formula.op).toBe(LogicOperator.NOT);
  });
});

describe('ObligationConsistencyRule', () => {
  const rule = new ObligationConsistencyRule();
  const phi = atom('P');
  const notPhi = unary(LogicOperator.NOT, phi);
  test('detects inconsistency O(P) ∧ O(¬P)', () => {
    expect(rule.canApply(obligation(phi), obligation(notPhi))).toBe(true);
  });
  test('produces ⊥', () => {
    const r = rule.apply(obligation(phi), obligation(notPhi)) as any;
    expect(r.value).toBe('⊥');
  });
});

describe('ObligationWeakeningRule', () => {
  const rule = new ObligationWeakeningRule();
  const phi = atom('P');
  const psi = atom('Q');
  const oblAnd = obligation(binary(LogicOperator.AND, phi, psi));
  test('applies to O(P ∧ Q)', () => { expect(rule.canApply(oblAnd)).toBe(true); });
  test('produces O(P)', () => {
    const r = rule.apply(oblAnd) as any;
    expect(r.op).toBe(DeonticOp.OBLIGATION);
  });
});

describe('PermissionStrengtheningRule', () => {
  const rule = new PermissionStrengtheningRule();
  const phi = atom('P');
  const psi = atom('Q');
  test('applies with P(φ) and ψ', () => { expect(rule.canApply(permission(phi), psi)).toBe(true); });
  test('produces P(φ ∨ ψ)', () => {
    const r = rule.apply(permission(phi), psi) as any;
    expect(r.op).toBe(DeonticOp.PERMISSION);
    expect(r.formula.op).toBe(LogicOperator.OR);
  });
});

describe('findApplicableDeonticRules', () => {
  test('finds D axiom for obligation', () => {
    const rules = findApplicableDeonticRules(obligation(atom('P')));
    expect(rules.some(r => r.name === 'DeonticDAxiom')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Event Calculus tests
// ---------------------------------------------------------------------------

describe('TimePoint', () => {
  test('construction succeeds for non-negative values', () => {
    expect(new TimePoint(0).value).toBe(0);
    expect(new TimePoint(5).value).toBe(5);
  });
  test('throws for negative value', () => { expect(() => new TimePoint(-1)).toThrow(); });
  test('comparison methods', () => {
    const t0 = new TimePoint(0);
    const t1 = new TimePoint(1);
    expect(t0.lt(t1)).toBe(true);
    expect(t1.gt(t0)).toBe(true);
    expect(t0.eq(new TimePoint(0))).toBe(true);
  });
  test('next() increments', () => { expect(new TimePoint(3).next().value).toBe(4); });
  test('toString', () => { expect(new TimePoint(2).toString()).toBe('t2'); });
});

describe('Event / Fluent', () => {
  test('Event.toString() with no params', () => { expect(new Event('send').toString()).toBe('send'); });
  test('Event.toString() with params', () => { expect(new Event('send', ['alice', 'bob']).toString()).toBe('send(alice, bob)'); });
  test('Event.equals', () => { expect(new Event('e', [1]).equals(new Event('e', [1]))).toBe(true); });
  test('Fluent.toString', () => { expect(new Fluent('light_on').toString()).toBe('light_on'); });
});

describe('EventCalculus — holdsAt', () => {
  test('initially-held fluent holds at t=0', () => {
    const ec = new EventCalculus();
    const light = new Fluent('light_on');
    ec.initiallyHolds(light);
    expect(ec.holdsAt(light, new TimePoint(0))).toBe(true);
  });

  test('fluent initiated by an event holds after it', () => {
    const ec = new EventCalculus();
    const light = new Fluent('light_on');
    const turnOn = new Event('turn_on');
    const t1 = new TimePoint(1);
    ec.happens(turnOn, t1);
    ec.initiates(turnOn, light, t1);
    expect(ec.holdsAt(light, new TimePoint(2))).toBe(true);
  });

  test('fluent terminated by event does not hold after', () => {
    const ec = new EventCalculus();
    const light = new Fluent('light_on');
    const turnOn  = new Event('turn_on');
    const turnOff = new Event('turn_off');
    const t1 = new TimePoint(1);
    const t2 = new TimePoint(2);
    ec.happens(turnOn, t1);
    ec.initiates(turnOn, light, t1);
    ec.happens(turnOff, t2);
    ec.terminates(turnOff, light, t2);
    expect(ec.holdsAt(light, new TimePoint(3))).toBe(false);
  });

  test('doesHappen returns true for asserted event', () => {
    const ec = new EventCalculus();
    const e = new Event('act');
    const t = new TimePoint(5);
    ec.happens(e, t);
    expect(ec.doesHappen(e, t)).toBe(true);
  });

  test('doesHappen returns false for unasserted event', () => {
    const ec = new EventCalculus();
    expect(ec.doesHappen(new Event('x'), new TimePoint(1))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FrenchPatternMatcher tests
// ---------------------------------------------------------------------------

describe('FrenchPatternMatcher', () => {
  const matcher = new FrenchPatternMatcher();

  test('detects obligation (doit)', () => {
    const m = matcher.matchByType("L'agent doit payer", 'deontic');
    expect(m.some(x => x.operator === FR_DEONTIC_OP.OBLIGATION)).toBe(true);
  });

  test('detects prohibition (ne doit pas)', () => {
    const m = matcher.matchByType("Il ne doit pas divulguer", 'deontic');
    expect(m.some(x => x.operator === FR_DEONTIC_OP.PROHIBITION)).toBe(true);
  });

  test('detects permission (peut)', () => {
    const m = matcher.matchByType("L'employé peut partir", 'deontic');
    expect(m.some(x => x.operator === FR_DEONTIC_OP.PERMISSION)).toBe(true);
  });

  test('detects cognitive belief', () => {
    const m = matcher.matchByType("Il croit que le contrat est valide", 'cognitive');
    expect(m.length).toBeGreaterThan(0);
  });

  test('detects temporal always', () => {
    const m = matcher.matchByType("Toujours respecter les règles", 'temporal');
    expect(m.length).toBeGreaterThan(0);
  });

  test('results sorted by span', () => {
    const all = matcher.match("L'agent doit payer et peut partir");
    for (let i = 1; i < all.length; i++) {
      expect(all[i].span[0]).toBeGreaterThanOrEqual(all[i - 1].span[0]);
    }
  });
});

describe('FrenchParser', () => {
  const parser = new FrenchParser();
  test('parse returns text/clauses/matches', () => {
    const r = parser.parse("L'agent doit payer");
    expect(r.text).toBe("L'agent doit payer");
    expect(Array.isArray(r.clauses)).toBe(true);
  });
  test('clauses have confidence in [0,1]', () => {
    const { clauses } = parser.parse("L'agent doit payer");
    for (const c of clauses) {
      expect(c.confidence).toBeGreaterThanOrEqual(0);
      expect(c.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe('French lexicon functions', () => {
  test('getFrenchVerbConjugations covers devoir', () => {
    const c = getFrenchVerbConjugations();
    expect(c['devoir']).toBeDefined();
    expect(c['devoir']['il']).toBe('doit');
  });
  test('getFrenchArticles has definite plural', () => {
    const a = getFrenchArticles();
    expect(a['definite_plural']).toContain('les');
  });
  test('getFrenchNegationPatterns is non-empty', () => {
    expect(getFrenchNegationPatterns().length).toBeGreaterThan(3);
  });
  test('getFrenchDeonticKeywords has obligation', () => {
    const kw = getFrenchDeonticKeywords();
    expect(kw['obligation']).toContain('doit');
  });
});
