/**
 * wasm-prover-sprint89.test.ts
 * Tests for §12.20 TDFOL delegate/router and modal strategy selection.
 */

import { ExternalProver, ProverResult, ProverStatus } from '../../src/services/external-provers';
import {
  CECDelegateStrategy,
  CECProverRouter,
  CostBasedStrategySelector,
  ForwardFallbackStrategy,
  ModalTableauxStrategy,
  createDefaultStrategySelector,
  estimateFormulaCost,
} from '../../src/services/tdfol-strategy-router';

class FakeExternalProver implements ExternalProver {
  readonly supportsEquality = true;
  lastProblem = '';

  constructor(readonly name = 'fake-vampire', private readonly available = true) {}

  isAvailable(): boolean {
    return this.available;
  }

  prove(problem: string): ProverResult {
    this.lastProblem = problem;
    return {
      status: ProverStatus.THEOREM,
      proof: '% SZS status Theorem\nfof(step, plain, (p)).',
      time: 0.01,
      prover: this.name,
      error: null,
      statistics: null,
    };
  }
}

describe('PORT-182 CEC delegate/router', () => {
  it('routes hard quantified/equality formulas to available external provers', () => {
    const fake = new FakeExternalProver();
    const router = new CECProverRouter([fake]);
    const result = router.prove('forall x. x = x', ['Reflexive(x)']);
    expect(result.proved).toBe(true);
    expect(result.strategy).toBe('cec-router:fake-vampire');
    expect(fake.lastProblem).toContain('fof(conj_1, conjecture,');
  });

  it('reports unavailable external provers without throwing', () => {
    const router = new CECProverRouter([new FakeExternalProver('offline', false)]);
    const result = router.prove('forall x. P(x)');
    expect(result.proved).toBe(false);
    expect(result.status).toBe('unavailable');
  });

  it('wraps the router as a TDFOL delegate strategy', () => {
    const delegate = new CECDelegateStrategy(new CECProverRouter([new FakeExternalProver()]));
    expect(delegate.canHandle('forall x. P(x)')).toBe(true);
    expect(delegate.prove('forall x. P(x)').proved).toBe(true);
  });
});

describe('PORT-183 modal tableaux and cost selector', () => {
  it('proves modal goals from contradictory tableaux assumptions', () => {
    const strategy = new ModalTableauxStrategy();
    const result = strategy.prove('P', ['P']);
    expect(result.proved).toBe(true);
    expect(result.strategy).toBe('modal-tableaux');
  });

  it('estimates modal, quantifier, connective, and equality costs', () => {
    const estimate = estimateFormulaCost('forall x. □P(x) -> x = x');
    expect(estimate.quantifiers).toBe(1);
    expect(estimate.modalOperators).toBe(1);
    expect(estimate.equalityAtoms).toBe(1);
    expect(estimate.estimatedCost).toBeGreaterThan(estimate.length);
  });

  it('selects the lowest-cost capable strategy', () => {
    const modal = new ModalTableauxStrategy();
    const fallback = new ForwardFallbackStrategy();
    const selector = new CostBasedStrategySelector([fallback, modal]);
    expect(selector.select('□P').name).toBe('modal-tableaux');
    expect(selector.select('Q').name).toBe('forward-fallback');
  });

  it('creates a default selector including modal, delegate, and fallback strategies', () => {
    const selector = createDefaultStrategySelector([new FakeExternalProver()]);
    expect(selector.rank('forall x. P(x)').map(entry => entry.strategy.name))
      .toEqual(expect.arrayContaining(['cec-delegate', 'forward-fallback']));
  });
});
