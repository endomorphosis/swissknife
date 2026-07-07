/**
 * Sprint 46 tests — ShadowProver, Temporal Inference Rules, ProverRouter
 *
 * Covers T-205 (shadow-prover.ts),
 *         T-206 (temporal-inference-rules.ts),
 *         T-207 (prover-router.ts).
 */

import {
  ModalLogic,
  ProofStatus,
  KProver,
  ProofTree,
} from '../../src/services/logic/modal/shadow-prover';

import {
  TemporalOperator,
  LogicOperator,
  temporalUnary,
  temporalBinary,
  binary,
  unary,
  atom,
  formulaEquals,
  ALL_TEMPORAL_RULES,
  findApplicableRules,
  TemporalKAxiomRule,
  TemporalTAxiomRule,
  TemporalS4AxiomRule,
  TemporalS5AxiomRule,
  EventuallyIntroductionRule,
  AlwaysNecessitationRule,
  UntilUnfoldingRule,
  UntilInductionRule,
  EventuallyExpansionRule,
  AlwaysDistributionRule,
  AlwaysEventuallyExpansionRule,
  EventuallyAlwaysContractionRule,
  UntilReleaseDualityRule,
  WeakUntilExpansionRule,
  NextDistributionRule,
} from '../../src/services/logic/tdfol/temporal-inference-rules';

import {
  ProverRouter,
  ProverStrategy,
  RegisteredProver,
  SingleProverResult,
} from '../../src/services/proof-engine/prover-router';

// ---------------------------------------------------------------------------
// ShadowProver tests
// ---------------------------------------------------------------------------

describe('KProver — basic construction', () => {
  test('creates prover with default K logic', () => {
    const p = new KProver();
    expect(p['logic']).toBe(ModalLogic.K);
  });

  test('creates prover with S5 logic', () => {
    const p = new KProver(ModalLogic.S5);
    expect(p['logic']).toBe(ModalLogic.S5);
  });

  test('initial statistics are zero', () => {
    const s = new KProver().getStatistics();
    expect(s.proofsAttempted).toBe(0);
    expect(s.proofsSucceeded).toBe(0);
    expect(s.proofsFailed).toBe(0);
  });
});

describe('KProver — proving', () => {
  test('proves trivial assumed formula', () => {
    const p = new KProver();
    const tree = p.prove('P', ['P']);
    expect(tree.isSuccessful()).toBe(true);
    expect(tree.status).toBe(ProofStatus.SUCCESS);
  });

  test('proves via modus ponens', () => {
    const p = new KProver();
    // P, P→Q ⊢ Q
    const tree = p.prove('Q', ['P', 'P→Q']);
    expect(tree.isSuccessful()).toBe(true);
    expect(tree.getDepth()).toBeGreaterThan(0);
  });

  test('fails for unprovable formula', () => {
    const p = new KProver();
    const tree = p.prove('Q', ['P']); // no implication connecting P to Q
    expect(tree.status).toBe(ProofStatus.FAILURE);
    expect(tree.isSuccessful()).toBe(false);
  });

  test('cache: second identical call returns cached result', () => {
    const p = new KProver();
    const t1 = p.prove('P', ['P']);
    const t2 = p.prove('P', ['P']);
    // Both should be the same (cached) ProofTree object
    expect(t1).toBe(t2);
  });

  test('statistics update after proofs', () => {
    const p = new KProver();
    p.prove('X', ['X']);       // success
    p.prove('Y', ['A', 'B']); // failure
    const s = p.getStatistics();
    expect(s.proofsAttempted).toBe(2);
    expect(s.proofsSucceeded).toBe(1);
    expect(s.proofsFailed).toBe(1);
  });

  test('proveProblem proves all goals', () => {
    const p = new KProver();
    const trees = p.proveProblem({
      name: 'test',
      logic: ModalLogic.T,
      assumptions: ['A', 'A→B', 'B→C'],
      goals: ['B', 'C'],
    });
    expect(trees).toHaveLength(2);
    expect(trees[0].isSuccessful()).toBe(true);
    expect(trees[1].isSuccessful()).toBe(true);
  });

  test('clearCache resets cache', () => {
    const p = new KProver();
    const t1 = p.prove('P', ['P']);
    p.clearCache();
    const t2 = p.prove('P', ['P']);
    expect(t1).not.toBe(t2); // different objects after cache clear
  });
});

describe('ProofTree', () => {
  test('getDepth equals number of steps', () => {
    const tree = new ProofTree('P', [{ ruleName: 'r', premises: [], conclusion: 'P', justification: '' }], ProofStatus.SUCCESS, ModalLogic.K);
    expect(tree.getDepth()).toBe(1);
  });

  test('isSuccessful true only for SUCCESS', () => {
    expect(new ProofTree('P', [], ProofStatus.SUCCESS, ModalLogic.K).isSuccessful()).toBe(true);
    expect(new ProofTree('P', [], ProofStatus.FAILURE, ModalLogic.K).isSuccessful()).toBe(false);
    expect(new ProofTree('P', [], ProofStatus.TIMEOUT, ModalLogic.K).isSuccessful()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Temporal Inference Rules tests
// ---------------------------------------------------------------------------

describe('ALL_TEMPORAL_RULES registry', () => {
  test('contains exactly 15 rules', () => {
    expect(ALL_TEMPORAL_RULES).toHaveLength(15);
  });

  test('all rules have non-empty name and description', () => {
    for (const r of ALL_TEMPORAL_RULES) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.description.length).toBeGreaterThan(0);
    }
  });

  test('rule names are unique', () => {
    const names = ALL_TEMPORAL_RULES.map(r => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('TemporalKAxiomRule', () => {
  const rule = new TemporalKAxiomRule();
  const phi = atom('φ');
  const psi = atom('ψ');
  const boxImplies = temporalUnary(TemporalOperator.ALWAYS, binary(LogicOperator.IMPLIES, phi, psi));
  const boxPhi = temporalUnary(TemporalOperator.ALWAYS, phi);

  test('applies to □(φ→ψ), □φ', () => {
    expect(rule.canApply(boxImplies, boxPhi)).toBe(true);
  });

  test('produces □ψ', () => {
    const result = rule.apply(boxImplies, boxPhi);
    expect(result.kind).toBe('temporal-unary');
    if (result.kind === 'temporal-unary') {
      expect(result.op).toBe(TemporalOperator.ALWAYS);
      expect(formulaEquals(result.formula, psi)).toBe(true);
    }
  });

  test('does not apply to single formula', () => {
    expect(rule.canApply(boxPhi)).toBe(false);
  });
});

describe('TemporalTAxiomRule', () => {
  const rule = new TemporalTAxiomRule();
  const phi = atom('φ');
  const boxPhi = temporalUnary(TemporalOperator.ALWAYS, phi);

  test('applies to □φ', () => { expect(rule.canApply(boxPhi)).toBe(true); });
  test('produces φ', () => {
    expect(formulaEquals(rule.apply(boxPhi), phi)).toBe(true);
  });
  test('does not apply to ◇φ', () => {
    expect(rule.canApply(temporalUnary(TemporalOperator.EVENTUALLY, phi))).toBe(false);
  });
});

describe('TemporalS4AxiomRule', () => {
  const rule = new TemporalS4AxiomRule();
  const phi = atom('φ');
  const boxPhi = temporalUnary(TemporalOperator.ALWAYS, phi);
  test('produces □□φ from □φ', () => {
    const result = rule.apply(boxPhi);
    expect(result.kind).toBe('temporal-unary');
    if (result.kind === 'temporal-unary') {
      expect(formulaEquals(result.formula, boxPhi)).toBe(true);
    }
  });
});

describe('TemporalS5AxiomRule', () => {
  const rule = new TemporalS5AxiomRule();
  const phi = atom('φ');
  const evPhi = temporalUnary(TemporalOperator.EVENTUALLY, phi);
  test('applies to ◇φ and produces □◇φ', () => {
    expect(rule.canApply(evPhi)).toBe(true);
    const result = rule.apply(evPhi);
    expect(result.kind).toBe('temporal-unary');
    if (result.kind === 'temporal-unary') {
      expect(result.op).toBe(TemporalOperator.ALWAYS);
      expect(formulaEquals(result.formula, evPhi)).toBe(true);
    }
  });
});

describe('EventuallyIntroductionRule', () => {
  const rule = new EventuallyIntroductionRule();
  const phi = atom('φ');
  test('always applicable (any single formula)', () => { expect(rule.canApply(phi)).toBe(true); });
  test('produces ◇φ', () => {
    const r = rule.apply(phi);
    expect(r.kind).toBe('temporal-unary');
    if (r.kind === 'temporal-unary') expect(r.op).toBe(TemporalOperator.EVENTUALLY);
  });
});

describe('UntilUnfoldingRule', () => {
  const rule = new UntilUnfoldingRule();
  const phi = atom('φ');
  const psi = atom('ψ');
  const phiUPsi = temporalBinary(TemporalOperator.UNTIL, phi, psi);
  test('applies to φUψ', () => { expect(rule.canApply(phiUPsi)).toBe(true); });
  test('produces ψ ∨ (φ ∧ X(φUψ))', () => {
    const r = rule.apply(phiUPsi);
    expect(r.kind).toBe('binary');
    if (r.kind === 'binary') expect(r.op).toBe(LogicOperator.OR);
  });
  test('does not apply to □φ', () => {
    expect(rule.canApply(temporalUnary(TemporalOperator.ALWAYS, phi))).toBe(false);
  });
});

describe('AlwaysDistributionRule', () => {
  const rule = new AlwaysDistributionRule();
  const phi = atom('φ');
  const psi = atom('ψ');
  const boxAnd = temporalUnary(TemporalOperator.ALWAYS, binary(LogicOperator.AND, phi, psi));
  test('applies to □(φ∧ψ)', () => { expect(rule.canApply(boxAnd)).toBe(true); });
  test('produces □φ ∧ □ψ', () => {
    const r = rule.apply(boxAnd);
    expect(r.kind).toBe('binary');
    if (r.kind === 'binary') {
      expect(r.op).toBe(LogicOperator.AND);
      expect(r.left.kind).toBe('temporal-unary');
      expect(r.right.kind).toBe('temporal-unary');
    }
  });
});

describe('UntilReleaseDualityRule', () => {
  const rule = new UntilReleaseDualityRule();
  const phi = atom('φ');
  const psi = atom('ψ');
  const until = temporalBinary(TemporalOperator.UNTIL, phi, psi);
  test('applies to φUψ and produces ¬(¬φ R ¬ψ)', () => {
    expect(rule.canApply(until)).toBe(true);
    const r = rule.apply(until);
    expect(r.kind).toBe('unary');
    if (r.kind === 'unary') {
      expect(r.op).toBe(LogicOperator.NOT);
      expect(r.formula.kind).toBe('temporal-binary');
    }
  });
});

describe('WeakUntilExpansionRule', () => {
  const rule = new WeakUntilExpansionRule();
  const phi = atom('φ');
  const psi = atom('ψ');
  const weakUntil = temporalBinary(TemporalOperator.WEAK_UNTIL, phi, psi);
  test('produces (φUψ) ∨ □φ', () => {
    expect(rule.canApply(weakUntil)).toBe(true);
    const r = rule.apply(weakUntil);
    expect(r.kind).toBe('binary');
    if (r.kind === 'binary') expect(r.op).toBe(LogicOperator.OR);
  });
});

describe('NextDistributionRule', () => {
  const rule = new NextDistributionRule();
  const phi = atom('φ');
  const psi = atom('ψ');
  const nextAnd = temporalUnary(TemporalOperator.NEXT, binary(LogicOperator.AND, phi, psi));
  test('produces Xφ ∧ Xψ', () => {
    expect(rule.canApply(nextAnd)).toBe(true);
    const r = rule.apply(nextAnd);
    expect(r.kind).toBe('binary');
    if (r.kind === 'binary') expect(r.op).toBe(LogicOperator.AND);
  });
});

describe('findApplicableRules', () => {
  test('returns non-empty set for □φ', () => {
    const phi = atom('P');
    const rules = findApplicableRules(temporalUnary(TemporalOperator.ALWAYS, phi));
    expect(rules.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// ProverRouter tests
// ---------------------------------------------------------------------------

const makeProver = (name: string, succeeds = true, delayMs = 0): RegisteredProver => ({
  name,
  prove: async (formula) => {
    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
    return { isProved: succeeds, proverName: name, proofTime: delayMs / 1000, proof: succeeds ? { formula } : null };
  },
});

describe('ProverRouter — basic registration', () => {
  test('lists registered provers', () => {
    const router = new ProverRouter({ enableSyntacticFallback: false });
    router.register(makeProver('z3'));
    expect(router.getAvailableProvers()).toContain('z3');
  });

  test('unregister removes prover', () => {
    const router = new ProverRouter({ enableSyntacticFallback: false });
    router.register(makeProver('z3'));
    router.unregister('z3');
    expect(router.getAvailableProvers()).not.toContain('z3');
  });

  test('syntactic fallback included by default', () => {
    const router = new ProverRouter();
    expect(router.getAvailableProvers()).toContain('native_syntactic');
  });
});

describe('ProverRouter — sequential strategy', () => {
  test('proves with first successful prover', async () => {
    const router = new ProverRouter({ enableSyntacticFallback: false });
    router.register(makeProver('z3', true));
    const result = await router.prove('P(x)', { strategy: ProverStrategy.SEQUENTIAL });
    expect(result.isProved).toBe(true);
    expect(result.proverUsed).toBe('z3');
  });

  test('falls back to second prover when first fails', async () => {
    const router = new ProverRouter({ enableSyntacticFallback: false });
    router.register(makeProver('z3', false));
    router.register(makeProver('cvc5', true));
    const result = await router.prove('P(x)', { strategy: ProverStrategy.SEQUENTIAL });
    expect(result.isProved).toBe(true);
    expect(result.proverUsed).toBe('cvc5');
  });

  test('fails when all provers fail', async () => {
    const router = new ProverRouter({ enableSyntacticFallback: false });
    router.register(makeProver('z3', false));
    const result = await router.prove('P(x)', { strategy: ProverStrategy.SEQUENTIAL });
    expect(result.isProved).toBe(false);
    expect(result.proverUsed).toBeNull();
  });
});

describe('ProverRouter — parallel strategy', () => {
  test('returns first success from parallel provers', async () => {
    const router = new ProverRouter({ enableSyntacticFallback: false });
    router.register(makeProver('slow', true, 50));
    router.register(makeProver('fast', true, 5));
    const result = await router.prove('P', { strategy: ProverStrategy.PARALLEL });
    expect(result.isProved).toBe(true);
  });

  test('aggregates all results', async () => {
    const router = new ProverRouter({ enableSyntacticFallback: false });
    router.register(makeProver('a', true));
    router.register(makeProver('b', false));
    const result = await router.prove('Q', { strategy: ProverStrategy.PARALLEL });
    expect(Object.keys(result.allResults)).toHaveLength(2);
  });
});

describe('ProverRouter — caching', () => {
  test('second call is a cache hit', async () => {
    const router = new ProverRouter({ enableCache: true });
    await router.prove('CachedFormula');
    const second = await router.prove('CachedFormula');
    expect(second.reason).toBe('cache_hit');
    expect(router.getStats().cacheHits).toBe(1);
  });
});

describe('ProverRouter — AUTO strategy', () => {
  test('selects a prover automatically', async () => {
    const router = new ProverRouter({ enableSyntacticFallback: false, enableCache: false });
    router.register(makeProver('z3', true));
    const result = await router.prove('forall x . P(x)', { strategy: ProverStrategy.AUTO });
    expect(result.strategyUsed).toBe(ProverStrategy.AUTO);
  });
});

describe('ProverRouter — selectBest', () => {
  test('returns fastest successful result', () => {
    const router = new ProverRouter({ enableSyntacticFallback: false });
    const results: SingleProverResult[] = [
      { isProved: true, proverName: 'a', proofTime: 2, proof: {} },
      { isProved: true, proverName: 'b', proofTime: 0.5, proof: {} },
      { isProved: false, proverName: 'c', proofTime: 0.1, proof: null },
    ];
    const best = router.selectBest(results);
    expect(best?.proverName).toBe('b');
  });

  test('returns first when no provers succeed', () => {
    const router = new ProverRouter({ enableSyntacticFallback: false });
    const results: SingleProverResult[] = [{ isProved: false, proverName: 'x', proofTime: 1, proof: null }];
    expect(router.selectBest(results)?.proverName).toBe('x');
  });

  test('returns null for empty list', () => {
    expect(new ProverRouter().selectBest([])).toBeNull();
  });
});

describe('ProverRouter — stats', () => {
  test('stats increment correctly', async () => {
    const router = new ProverRouter({ enableSyntacticFallback: false, enableCache: false });
    router.register(makeProver('z3', true));
    await router.prove('P');
    await router.prove('Q');
    const s = router.getStats();
    expect(s.totalProofs).toBe(2);
    expect(s.succeeded).toBe(2);
  });
});
