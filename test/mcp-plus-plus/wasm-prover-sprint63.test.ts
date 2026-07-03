/**
 * Sprint 63 tests — ErgoAI Wrapper, FLogic ZKP, Prometheus Metrics,
 *                   Base Parser, Error Handling, TDFOL NL Context
 */

import {
  ErgoAIWrapper, defaultErgoAIConfig, findErgoBinary, lazyInstallErgo,
  ZKPFLogicProver, FLogicProvingMethod,
} from '../../src/services/flogic-ergoai-wrapper';

import {
  PrometheusMetricsCollector, getPrometheusCollector, CircuitBreakerState,
  BaseParser, getParser,
  ProofError, ParseError,
  handleProofError, handleParseError, withErrorContext, safeCall, safeCallAsync,
  formatErrorMessage, validateNotNull,
  NLContext, makeTDFOLEntity, ContextResolver,
} from '../../src/services/cec-sprint63-utils';

// ---------------------------------------------------------------------------
// ErgoAI Wrapper
// ---------------------------------------------------------------------------
describe('ErgoAIWrapper', () => {
  test('isAvailable() returns false when no binary', () => {
    const w = new ErgoAIWrapper(defaultErgoAIConfig());
    expect(w.isAvailable()).toBe(false);
  });

  test('query() returns failure when binary unavailable', async () => {
    const w = new ErgoAIWrapper(defaultErgoAIConfig());
    const r = await w.query('P(x)');
    expect(r.success).toBe(false);
    expect(r.error).toBeDefined();
  });

  test('queryBatch() processes multiple formulas', async () => {
    const w = new ErgoAIWrapper(defaultErgoAIConfig());
    const results = await w.queryBatch(['P(x)', 'Q(y)']);
    expect(results).toHaveLength(2);
  });

  test('getStats() returns expected fields', () => {
    const s = new ErgoAIWrapper().getStats();
    expect(s).toHaveProperty('totalQueries');
    expect(s).toHaveProperty('succeeded');
  });

  test('findErgoBinary() returns string or null', () => {
    const result = findErgoBinary();
    expect(result === null || typeof result === 'string').toBe(true);
  });

  test('lazyInstallErgo() returns string or null', () => {
    const result = lazyInstallErgo('test');
    expect(result === null || typeof result === 'string').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FLogic ZKP Integration
// ---------------------------------------------------------------------------
describe('ZKPFLogicProver', () => {
  test('prove standard: trivial formula', async () => {
    const prover = new ZKPFLogicProver();
    const r = await prover.prove('P', ['P']);
    expect(r.isProved).toBe(true);
    expect(r.method).toBe(FLogicProvingMethod.STANDARD);
    expect(r.proof).toBeNull();
  });

  test('prove via modus ponens', async () => {
    const prover = new ZKPFLogicProver();
    const r = await prover.prove('Q', ['P', 'P→Q']);
    expect(r.isProved).toBe(true);
  });

  test('prove ZKP method produces proof', async () => {
    const prover = new ZKPFLogicProver();
    const r = await prover.prove('P', ['P'], FLogicProvingMethod.ZKP);
    expect(r.method).toBe(FLogicProvingMethod.ZKP);
    expect(r.proof).not.toBeNull();
    expect(r.isProved).toBe(true);
  });

  test('cache hit on second call', async () => {
    const prover = new ZKPFLogicProver();
    await prover.prove('P', ['P']);
    await prover.prove('P', ['P']);
    expect(prover.getStats().cacheHits).toBe(1);
  });

  test('getStats() returns numeric fields', () => {
    const s = new ZKPFLogicProver().getStats();
    expect(typeof s.standardProofs).toBe('number');
    expect(typeof s.zkpProofs).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Prometheus Metrics
// ---------------------------------------------------------------------------
describe('PrometheusMetricsCollector', () => {
  test('record and getMetrics round-trip', () => {
    const c = new PrometheusMetricsCollector();
    c.record('prove', 12.5, { prover: 'z3' });
    const m = c.getMetrics('prove', { prover: 'z3' });
    expect(m).not.toBeNull();
    expect(m!.calls).toBe(1);
    expect(m!.totalMs).toBeCloseTo(12.5);
  });

  test('incrementCounter accumulates', () => {
    const c = new PrometheusMetricsCollector();
    c.incrementCounter('cache_hits');
    c.incrementCounter('cache_hits');
    const fmt = c.format();
    expect(fmt).toContain('cache_hits_counter 2');
  });

  test('setGauge appears in format', () => {
    const c = new PrometheusMetricsCollector();
    c.setGauge('active_provers', 3);
    expect(c.format()).toContain('active_provers_gauge 3');
  });

  test('reset clears all data', () => {
    const c = new PrometheusMetricsCollector();
    c.record('op', 5);
    c.reset();
    expect(c.getMetrics('op')).toBeNull();
  });

  test('format returns string', () => {
    expect(typeof new PrometheusMetricsCollector().format()).toBe('string');
  });

  test('getPrometheusCollector returns singleton', () => {
    expect(getPrometheusCollector()).toBe(getPrometheusCollector());
  });
});

// ---------------------------------------------------------------------------
// CEC Base Parser
// ---------------------------------------------------------------------------
describe('getParser', () => {
  test('returns a BaseParser for en', () => {
    const p = getParser('en');
    expect(p).toBeDefined();
    expect(p.getLanguage()).toBe('en');
  });

  test('fallback parser for unknown language', () => {
    const p = getParser('klingon');
    expect(p.getLanguage()).toBe('en');
  });
});

describe('BaseParser.parse', () => {
  const parser = getParser('en');

  test('extracts obligation clause', () => {
    const r = parser.parse('Contractors must pay taxes.');
    expect(r.language).toBe('en');
    expect(r.clauses.some(c => c.clauseType === 'obligation')).toBe(true);
  });

  test('confidence in [0,1]', () => {
    const r = parser.parse('Alice must pay.');
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  test('parseAll processes array', () => {
    const results = parser.parseAll(['A must B.', 'C may D.']);
    expect(results).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------
describe('handleProofError', () => {
  test('wraps non-ProofError in ProofError', () => {
    expect(() => handleProofError(new Error('oops'), 'P')).toThrow(ProofError);
  });
  test('rethrows ProofError unchanged', () => {
    const err = new ProofError('already a proof error');
    expect(() => handleProofError(err)).toThrow(ProofError);
  });
});

describe('handleParseError', () => {
  test('wraps in ParseError', () => {
    expect(() => handleParseError('bad text')).toThrow(ParseError);
  });
});

describe('withErrorContext', () => {
  test('prefixes error message with context', () => {
    expect(() => withErrorContext('proving', () => { throw new Error('failed'); }))
      .toThrow('[proving]');
  });

  test('returns value when no error', () => {
    expect(withErrorContext('ctx', () => 42)).toBe(42);
  });
});

describe('safeCall', () => {
  test('returns fallback on error', () => {
    expect(safeCall(() => { throw new Error('err'); }, 'fallback')).toBe('fallback');
  });
  test('returns fn result when success', () => {
    expect(safeCall(() => 99, 0)).toBe(99);
  });
});

describe('safeCallAsync', () => {
  test('returns fallback on async error', async () => {
    const r = await safeCallAsync(async () => { throw new Error('err'); }, 'fb');
    expect(r).toBe('fb');
  });
});

describe('formatErrorMessage', () => {
  test('formats Error object', () => {
    expect(formatErrorMessage(new Error('bad'))).toContain('bad');
  });
  test('formats string', () => {
    expect(formatErrorMessage('str error')).toBe('str error');
  });
});

describe('validateNotNull', () => {
  test('returns value when not null', () => {
    expect(validateNotNull(42, 'x')).toBe(42);
  });
  test('throws for null', () => {
    expect(() => validateNotNull(null, 'y')).toThrow('y');
  });
  test('throws for undefined', () => {
    expect(() => validateNotNull(undefined, 'z')).toThrow('z');
  });
});

// ---------------------------------------------------------------------------
// TDFOL NL Context
// ---------------------------------------------------------------------------
describe('NLContext', () => {
  test('update extracts capitalized entities', () => {
    const ctx = new NLContext();
    ctx.update('Alice must pay Bob.');
    const entities = ctx.getAllEntities();
    expect(entities.some(e => e.name === 'Alice')).toBe(true);
  });

  test('getFocus returns most-recently-seen entity', () => {
    const ctx = new NLContext();
    ctx.update('Alice must pay.');
    expect(ctx.getFocus()).not.toBeNull();
    expect(ctx.getFocus()!.name).toBe('Alice');
  });

  test('addEntity / getEntity round-trip', () => {
    const ctx = new NLContext();
    const e = makeTDFOLEntity('Alice', 'Agent');
    ctx.addEntity(e);
    expect(ctx.getEntity('alice')).toBe(e);
  });

  test('reset clears everything', () => {
    const ctx = new NLContext();
    ctx.update('Alice pays.');
    ctx.reset();
    expect(ctx.getAllEntities()).toHaveLength(0);
    expect(ctx.getFocus()).toBeNull();
  });
});

describe('ContextResolver', () => {
  test('resolve replaces pronoun with entity', () => {
    const ctx = new NLContext();
    ctx.update('Alice must pay.');
    const resolver = new ContextResolver();
    const result = resolver.resolve('She must comply.', ctx);
    expect(result).not.toContain('She');
    expect(result).toContain('Alice');
  });

  test('update calls ctx.update', () => {
    const ctx = new NLContext();
    const resolver = new ContextResolver();
    resolver.update('Bob must report.', ctx);
    expect(ctx.getAllEntities().some(e => e.name === 'Bob')).toBe(true);
  });
});
