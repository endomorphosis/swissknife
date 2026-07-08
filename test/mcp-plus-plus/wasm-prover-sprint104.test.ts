import {
  ALL_CEC_NATIVE_DEONTIC_RULES,
  ALL_CEC_NATIVE_MODAL_RULES,
  ALL_CEC_NATIVE_MODAL_TEMPORAL_DEONTIC_RULES,
  ALL_CEC_NATIVE_TEMPORAL_RULES,
  AlwaysDistribution,
  AlwaysInduction,
  EventuallyImplication,
  NecessityConjunction,
  NecessityDistribution,
  NecessityElimination,
  NextImplication,
  ObligationConsistency,
  ObligationDistribution,
  ObligationImplication,
  PermissionFromNonObligation,
  PossibilityDuality,
  ProhibitionEquivalence,
  TemporalNegation,
  UntilWeakening,
  findApplicableCecNativeRules,
} from '../../src/services/cec-modal-temporal-deontic-rules';

describe('PORT-224 CEC native modal, temporal, and deontic inference rules', () => {
  it('ports modal rule classes as CECInferenceRule adapters', () => {
    expect(new NecessityElimination().apply(['□P'])).toEqual(['P']);
    expect(new NecessityDistribution().apply(['□(P → Q)', '□P'])).toEqual(['□Q']);
    expect(new PossibilityDuality().apply(['¬□¬P'])).toEqual(['◇P']);
    expect(new NecessityConjunction().apply(['□P', '□Q'])).toEqual(['□(P ∧ Q)']);
    expect(ALL_CEC_NATIVE_MODAL_RULES.map(rule => rule.name)).toEqual([
      'NecessityElimination',
      'PossibilityIntroduction',
      'NecessityDistribution',
      'PossibilityDuality',
      'NecessityConjunction',
    ]);
  });

  it('ports temporal rule classes over always/eventually/next/until operators', () => {
    expect(new AlwaysDistribution().apply(['□(P ∧ Q)'])).toEqual(['□P ∧ □Q']);
    expect(new AlwaysInduction().apply(['P', '□(P → X(P))'])).toEqual(['□P']);
    expect(new EventuallyImplication().apply(['◇P', '□(P → Q)'])).toEqual(['◇Q']);
    expect(new NextImplication().apply(['X(P)', 'X(P → Q)'])).toEqual(['X(Q)']);
    expect(new UntilWeakening().apply(['U(P,Q)'])).toEqual(['◇Q']);
    expect(new TemporalNegation().apply(['¬□P'])).toEqual(['◇¬P']);
    expect(ALL_CEC_NATIVE_TEMPORAL_RULES).toHaveLength(15);
  });

  it('ports deontic rule classes over obligation, permission, and prohibition', () => {
    expect(new ObligationDistribution().apply(['O(P ∧ Q)'])).toEqual(['O(P) ∧ O(Q)']);
    expect(new ObligationImplication().apply(['O(P)', 'P → Q'])).toEqual(['O(Q)']);
    expect(new PermissionFromNonObligation().apply(['¬O(¬P)'])).toEqual(['P(P)']);
    expect(new ObligationConsistency().apply(['O(P)', 'O(¬P)'])).toEqual(['⊥']);
    expect(new ProhibitionEquivalence().apply(['F(P)', 'O(¬Q)'])).toEqual(['O(¬P)', 'F(Q)']);
    expect(ALL_CEC_NATIVE_DEONTIC_RULES).toHaveLength(7);
  });

  it('exposes a combined rule registry and applicability scan', () => {
    const applicable = findApplicableCecNativeRules(['□P', 'P → Q', 'O(P)']);

    expect(ALL_CEC_NATIVE_MODAL_TEMPORAL_DEONTIC_RULES).toHaveLength(27);
    expect(applicable.map(rule => rule.name)).toEqual(expect.arrayContaining([
      'NecessityElimination',
      'PossibilityIntroduction',
      'EventuallyFromAlways',
      'AlwaysImpliesNext',
      'ObligationImplication',
    ]));
  });
});
