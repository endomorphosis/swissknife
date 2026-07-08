/**
 * Sprint 53 tests — Cognitive Inference Rules, Lemma Generation,
 *                   Proof Strategies, LLM Circuit Breaker
 *
 * Covers T-238 (cognitive-inference-rules.ts),
 *         T-239 (lemma-generation.ts),
 *         T-240 (proof-strategies.ts),
 *         T-241 (llm-circuit-breaker.ts).
 */

import {
  BeliefDistribution, KnowledgeImpliesBelief, BeliefMonotonicity,
  IntentionCommitment, BeliefConjunction, KnowledgeDistribution,
  PerceptionImpliesKnowledge, BeliefNegation, KnowledgeConjunction,
  ALL_COGNITIVE_RULES, findApplicableCognitiveRules,
} from '../../src/services/logic/shared/cognitive-inference-rules';

import {
  LemmaType, makeLemma, LemmaCache, LemmaGenerator, createLemmaGenerator,
} from '../../src/services/logic/shared/lemma-generation';

import {
  StrategyType, ForwardChainingStrategy, BackwardChainingStrategy,
  BidirectionalStrategy, HybridStrategy, getStrategy,
} from '../../src/services/proof-engine/proof-strategies';

import {
  CircuitState, LLMCircuitBreaker, CircuitBreakerOpenError,
  getCircuitBreaker, resetAllCircuitBreakers, getAllCircuitBreakerStats,
} from '../../src/services/platform/llm-circuit-breaker';

// ---------------------------------------------------------------------------
// Cognitive Inference Rules tests
// ---------------------------------------------------------------------------

describe('ALL_COGNITIVE_RULES registry', () => {
  test('contains exactly 10 rules', () => { expect(ALL_COGNITIVE_RULES).toHaveLength(10); });
  test('rule names are unique', () => {
    const names = ALL_COGNITIVE_RULES.map(r => r.name);
    expect(new Set(names).size).toBe(10);
  });
});

describe('BeliefDistribution', () => {
  const rule = new BeliefDistribution();
  test('applies to B(alice, P∧Q)', () => {
    expect(rule.canApply(['B(alice, P∧Q)'])).toBe(true);
  });
  test('produces B(alice,P) and B(alice,Q)', () => {
    const out = rule.apply(['B(alice, P∧Q)']);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('B(alice');
    expect(out[1]).toContain('B(alice');
  });
  test('does not apply to non-belief formula', () => {
    expect(rule.canApply(['P∧Q'])).toBe(false);
  });
});

describe('KnowledgeImpliesBelief', () => {
  const rule = new KnowledgeImpliesBelief();
  test('applies to K(agent, P)', () => { expect(rule.canApply(['K(bob, P)'])).toBe(true); });
  test('produces B(agent, P)', () => {
    const out = rule.apply(['K(bob, P)']);
    expect(out[0]).toBe('B(bob, P)');
  });
});

describe('BeliefMonotonicity', () => {
  const rule = new BeliefMonotonicity();
  test('applies to B(a,P) and P→Q', () => {
    expect(rule.canApply(['B(alice, P)', 'P→Q'])).toBe(true);
  });
  test('produces B(a,Q)', () => {
    const out = rule.apply(['B(alice, P)', 'P→Q']);
    expect(out[0]).toBe('B(alice, Q)');
  });
});

describe('BeliefConjunction', () => {
  const rule = new BeliefConjunction();
  test('applies to two beliefs by same agent', () => {
    expect(rule.canApply(['B(alice, P)', 'B(alice, Q)'])).toBe(true);
  });
  test('produces B(a, P∧Q)', () => {
    const out = rule.apply(['B(alice, P)', 'B(alice, Q)']);
    expect(out[0]).toContain('P ∧ Q');
  });
});

describe('KnowledgeDistribution', () => {
  const rule = new KnowledgeDistribution();
  test('applies to K(a, P∧Q)', () => { expect(rule.canApply(['K(alice, P∧Q)'])).toBe(true); });
  test('produces K(a,P) and K(a,Q)', () => {
    const out = rule.apply(['K(alice, P∧Q)']);
    expect(out).toHaveLength(2);
  });
});

describe('PerceptionImpliesKnowledge', () => {
  const rule = new PerceptionImpliesKnowledge();
  test('applies to P(agent, fact)', () => { expect(rule.canApply(['P(alice, sunny)'])).toBe(true); });
  test('produces K(agent, fact)', () => {
    const out = rule.apply(['P(alice, sunny)']);
    expect(out[0]).toBe('K(alice, sunny)');
  });
});

describe('BeliefNegation', () => {
  const rule = new BeliefNegation();
  test('detects B(a,P) ∧ ¬P', () => {
    expect(rule.canApply(['B(alice, P)', '¬P'])).toBe(true);
  });
  test('produces belief_inconsistency', () => {
    const out = rule.apply(['B(alice, P)', '¬P']);
    expect(out[0]).toContain('belief_inconsistency');
  });
});

describe('KnowledgeConjunction', () => {
  const rule = new KnowledgeConjunction();
  test('combines K(a,P) and K(a,Q) to K(a, P∧Q)', () => {
    const out = rule.apply(['K(alice, P)', 'K(alice, Q)']);
    expect(out[0]).toContain('P ∧ Q');
  });
});

describe('findApplicableCognitiveRules', () => {
  test('finds KnowledgeImpliesBelief for K(a,P)', () => {
    const rules = findApplicableCognitiveRules(['K(alice, P)']);
    expect(rules.some(r => r.name === 'KnowledgeImpliesBelief')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Lemma Generation tests
// ---------------------------------------------------------------------------

describe('makeLemma', () => {
  test('creates lemma with correct fields', () => {
    const l = makeLemma('Q', ['P', 'P→Q'], 'modus_ponens');
    expect(l.formula).toBe('Q');
    expect(l.premises).toHaveLength(2);
    expect(l.lemmaType).toBe(LemmaType.DERIVED);
    expect(l.patternHash.length).toBeGreaterThan(0);
  });
});

describe('LemmaCache', () => {
  test('add and get round-trip', () => {
    const cache = new LemmaCache(10);
    const l = makeLemma('Q', ['P'], 'mp');
    cache.add(l);
    const found = cache.get('Q');
    expect(found).not.toBeNull();
    expect(found!.formula).toBe('Q');
  });

  test('contains() returns true for cached formula', () => {
    const cache = new LemmaCache(10);
    cache.add(makeLemma('R', [], 'fact'));
    expect(cache.contains('R')).toBe(true);
  });

  test('LRU evicts oldest when full', () => {
    const cache = new LemmaCache(2);
    cache.add(makeLemma('A', [], 'fact'));
    cache.add(makeLemma('B', [], 'fact'));
    cache.add(makeLemma('C', [], 'fact')); // evicts A
    expect(cache.contains('A')).toBe(false);
    expect(cache.contains('C')).toBe(true);
  });

  test('getStats tracks hits and misses', () => {
    const cache = new LemmaCache(10);
    cache.add(makeLemma('X', [], 'fact'));
    cache.get('X');    // hit
    cache.get('Y');    // miss
    const s = cache.getStats();
    expect(s['hits']).toBe(1);
    expect(s['misses']).toBe(1);
  });

  test('clear empties cache', () => {
    const cache = new LemmaCache(10);
    cache.add(makeLemma('A', [], 'fact'));
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe('LemmaGenerator', () => {
  test('derives Q from {P, P→Q}', () => {
    const gen = createLemmaGenerator(50);
    const lemmas = gen.generateFormulaLemmas(['P', 'P→Q']);
    expect(lemmas.some(l => l.formula === 'Q')).toBe(true);
  });

  test('stats increment after generation', () => {
    const gen = new LemmaGenerator(50);
    gen.generateFormulaLemmas(['P', 'P→Q']);
    expect(gen.getStats().totalGenerated).toBeGreaterThan(0);
  });

  test('generateKBLemmas works', () => {
    const gen = createLemmaGenerator();
    const result = gen.generateKBLemmas(['A', 'A→B', 'B→C']);
    expect(result.some(l => l.formula === 'B')).toBe(true);
    expect(result.some(l => l.formula === 'C')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Proof Strategies tests
// ---------------------------------------------------------------------------

describe('ForwardChainingStrategy', () => {
  const s = new ForwardChainingStrategy(50);
  test('proves Q from {P, P→Q}', () => {
    const r = s.prove('Q', ['P', 'P→Q']);
    expect(r.isProved).toBe(true);
    expect(r.strategy).toBe('ForwardChaining');
    expect(r.stepCount).toBeGreaterThan(0);
  });
  test('fails for unprovable goal', () => {
    expect(new ForwardChainingStrategy().prove('R', ['P']).isProved).toBe(false);
  });
  test('stats track successes', () => {
    const s2 = new ForwardChainingStrategy();
    s2.prove('P', ['P']);
    expect(s2.getStats().proofsSucceeded).toBe(1);
  });
});

describe('BackwardChainingStrategy', () => {
  const s = new BackwardChainingStrategy();
  test('proves Q via backward chaining from {P, P→Q}', () => {
    const r = s.prove('Q', ['P', 'P→Q']);
    expect(r.isProved).toBe(true);
    expect(r.strategy).toBe('BackwardChaining');
  });
});

describe('BidirectionalStrategy', () => {
  test('proves multi-hop R from {P, P→Q, Q→R}', () => {
    const s = new BidirectionalStrategy(50);
    const r = s.prove('R', ['P', 'P→Q', 'Q→R']);
    expect(r.isProved).toBe(true);
  });
});

describe('HybridStrategy', () => {
  test('proves Q from {P, P→Q}', () => {
    const r = new HybridStrategy().prove('Q', ['P', 'P→Q']);
    expect(r.isProved).toBe(true);
    expect(r.strategy).toBe('Hybrid');
  });
});

describe('getStrategy factory', () => {
  test('returns ForwardChainingStrategy', () => {
    const s = getStrategy(StrategyType.FORWARD_CHAINING);
    expect(s.name).toBe('ForwardChaining');
  });
  test('returns BackwardChainingStrategy', () => {
    expect(getStrategy(StrategyType.BACKWARD_CHAINING).name).toBe('BackwardChaining');
  });
  test('throws for unknown strategy', () => {
    // @ts-ignore
    expect(() => getStrategy('invalid')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// LLM Circuit Breaker tests
// ---------------------------------------------------------------------------

describe('LLMCircuitBreaker — initial state', () => {
  test('starts in CLOSED state', () => {
    const cb = new LLMCircuitBreaker();
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });
  test('initial metrics are zeroed', () => {
    const m = new LLMCircuitBreaker().getMetrics();
    expect(m.totalCalls).toBe(0);
    expect(m.failureRate).toBe(0);
  });
});

describe('LLMCircuitBreaker — successful calls', () => {
  test('passes through successful call', async () => {
    const cb = new LLMCircuitBreaker();
    const result = await cb.call(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  test('stays CLOSED after successes', async () => {
    const cb = new LLMCircuitBreaker({ failureThreshold: 3 });
    await cb.call(() => 'ok');
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });
});

describe('LLMCircuitBreaker — failures', () => {
  test('opens after failureThreshold consecutive failures', async () => {
    const cb = new LLMCircuitBreaker({ failureThreshold: 3, timeoutSeconds: 60 });
    for (let i = 0; i < 3; i++) {
      await cb.call(() => { throw new Error('fail'); }).catch(() => {});
    }
    expect(cb.getState()).toBe(CircuitState.OPEN);
  });

  test('throws CircuitBreakerOpenError when OPEN', async () => {
    const cb = new LLMCircuitBreaker({ failureThreshold: 1, timeoutSeconds: 60 });
    await cb.call(() => { throw new Error('fail'); }).catch(() => {});
    await expect(cb.call(() => 'ok')).rejects.toThrow(CircuitBreakerOpenError);
  });

  test('uses fallback when OPEN and fallback is provided', async () => {
    const cb = new LLMCircuitBreaker({ failureThreshold: 1, timeoutSeconds: 60, fallback: () => 'fallback' });
    await cb.call(() => { throw new Error('fail'); }).catch(() => {});
    const result = await cb.call(() => 'ok');
    expect(result).toBe('fallback');
  });
});

describe('LLMCircuitBreaker — reset', () => {
  test('reset returns to CLOSED state', async () => {
    const cb = new LLMCircuitBreaker({ failureThreshold: 1, timeoutSeconds: 60 });
    await cb.call(() => { throw new Error('fail'); }).catch(() => {});
    cb.reset();
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });
});

describe('LLMCircuitBreaker — constructor validation', () => {
  test('throws for failureThreshold < 1', () => {
    expect(() => new LLMCircuitBreaker({ failureThreshold: 0 })).toThrow();
  });
  test('throws for timeoutSeconds <= 0', () => {
    expect(() => new LLMCircuitBreaker({ timeoutSeconds: 0 })).toThrow();
  });
});

describe('Circuit breaker registry', () => {
  afterEach(() => { resetAllCircuitBreakers(); });

  test('getCircuitBreaker returns same instance', () => {
    const a = getCircuitBreaker('test-cb');
    const b = getCircuitBreaker('test-cb');
    expect(a).toBe(b);
  });

  test('resetAllCircuitBreakers returns count', () => {
    getCircuitBreaker('cb1');
    getCircuitBreaker('cb2');
    const n = resetAllCircuitBreakers();
    expect(n).toBeGreaterThanOrEqual(2);
  });

  test('getAllCircuitBreakerStats returns map with state', () => {
    getCircuitBreaker('my-cb');
    const stats = getAllCircuitBreakerStats();
    expect(stats['my-cb']).toBeDefined();
    expect(stats['my-cb'].state).toBe(CircuitState.CLOSED);
  });
});
