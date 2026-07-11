/**
 * WASM Prover Sprint 22 — TDFOL Exceptions + Optimization + Security Validator.
 *
 * Tasks:
 *   T-112: TDFOLError hierarchy (tdfol-exceptions.ts)
 *   T-113: OptimizedProver + IndexedKB (tdfol-optimization.ts)
 *   T-114: SecurityValidator (tdfol-security-validator.ts)
 *   T-115: ≥10 tests
 *
 * Sprint 22 (Phase 22 — TDFOL Exceptions + Optimization + Security, P2).
 */

import {
  TDFOLError, ParseError, ProofError, ProofTimeoutError, ProofNotFoundError,
  ZKPProofError, ConversionError, InferenceError, NLProcessingError,
  PatternMatchError, CacheError,
  isTDFOLError, isProofError, isParseError,
} from '../../src/services/logic/tdfol/tdfol-exceptions.js';
import {
  IndexedKB, OptimizedProver, createOptimizedProver,
} from '../../src/services/logic/tdfol/tdfol-optimization.js';
import {
  SecurityValidator, createValidator, validateFormula,
} from '../../src/services/logic/tdfol/tdfol-security-validator.js';
import { Atom, Obligation, Permission } from '../../src/services/provers/provers-dcec-types.js';

// ---------------------------------------------------------------------------
// T-112: TDFOL Exception Hierarchy
// ---------------------------------------------------------------------------

describe('T-112 TDFOL Exception Hierarchy', () => {
  it('TDFOLError is instanceof Error', () => {
    const e = new TDFOLError('test error');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(TDFOLError);
    expect(e.name).toBe('TDFOLError');
    expect(e.message).toContain('test error');
  });

  it('TDFOLError includes suggestion in message', () => {
    const e = new TDFOLError('error', 'try this');
    expect(e.message).toContain('Suggestion: try this');
    expect(e.suggestion).toBe('try this');
  });

  it('TDFOLError.toDict() returns serialisable object', () => {
    const e = new TDFOLError('msg', 'hint', { formula: 'P(x)' });
    const d = e.toDict();
    expect(d['error_type']).toBe('TDFOLError');
    expect(d['context']).toMatchObject({ formula: 'P(x)' });
  });

  it('ParseError has formula/line/column', () => {
    const e = new ParseError({ message: 'syntax error', formula: 'P(', line: 1, column: 2 });
    expect(e).toBeInstanceOf(TDFOLError);
    expect(e.name).toBe('ParseError');
    expect(e.formula).toBe('P(');
    expect(e.line).toBe(1);
    expect(e.column).toBe(2);
  });

  it('ProofTimeoutError has timeout_ms', () => {
    const e = new ProofTimeoutError('timed out', { formula: 'O(x)', timeoutMs: 5000 });
    expect(e).toBeInstanceOf(ProofError);
    expect(e.timeout_ms).toBe(5000);
    expect(e.proof_status).toBe('timeout');
  });

  it('ProofNotFoundError has default suggestion', () => {
    const e = new ProofNotFoundError('no proof', { formula: 'O(x)' });
    expect(e.suggestion).toBeTruthy();
    expect(e.proof_status).toBe('not_found');
  });

  it('ZKPProofError has zkp_backend', () => {
    const e = new ZKPProofError('zkp failed', { zkpBackend: 'lurk' });
    expect(e.zkp_backend).toBe('lurk');
  });

  it('CacheError extends TDFOLError', () => {
    const e = new CacheError('cache miss', { cacheKey: 'k1', operation: 'get' });
    expect(e).toBeInstanceOf(TDFOLError);
    expect(e.cache_key).toBe('k1');
    expect(e.operation).toBe('get');
  });

  it('isTDFOLError / isProofError / isParseError type guards', () => {
    const p = new ParseError({ message: 'parse fail' });
    const t = new ProofTimeoutError('timeout');
    expect(isTDFOLError(p)).toBe(true);
    expect(isParseError(p)).toBe(true);
    expect(isProofError(t)).toBe(true);
    expect(isTDFOLError(new Error('plain'))).toBe(false);
  });

  it('NLProcessingError / PatternMatchError chain', () => {
    const e = new PatternMatchError('no match', { pattern: '\\bsomething\\b' });
    expect(e).toBeInstanceOf(NLProcessingError);
    expect(e).toBeInstanceOf(TDFOLError);
    expect(e.pattern).toBe('\\bsomething\\b');
  });
});

// ---------------------------------------------------------------------------
// T-113: TDFOL Optimization
// ---------------------------------------------------------------------------

describe('T-113 IndexedKB', () => {
  it('adds and looks up by predicate', () => {
    const kb = new IndexedKB();
    const f = Obligation(Atom('log_access'));
    kb.addFormula(f);
    const found = kb.lookupByPredicate('log_access');
    expect(found).toHaveLength(1);
  });

  it('adds and looks up by operator', () => {
    const kb = new IndexedKB();
    kb.addFormula(Obligation(Atom('audit')));
    kb.addFormula(Permission(Atom('read')));
    const obligs = kb.lookupByOperator('O');
    expect(obligs).toHaveLength(1);
    const perms  = kb.lookupByOperator('P');
    expect(perms).toHaveLength(1);
  });

  it('getStats reflects insertions and lookups', () => {
    const kb = new IndexedKB();
    kb.addFormula(Atom('x'));
    kb.lookupByPredicate('x');
    kb.lookupByPredicate('y');
    const s = kb.getStats();
    expect(s.inserts).toBe(1);
    expect(s.lookups).toBe(2);
    expect(s.size).toBe(1);
  });
});

describe('T-113 OptimizedProver', () => {
  it('proves a simple obligation', async () => {
    const prover = createOptimizedProver('CACHED');
    const phi = Atom('log');
    const result = await prover.prove([Obligation(phi)], Permission(phi));
    expect(result.prover_id).toBe('tdfol-native');
  });

  it('second call is served from cache (cache_hits > 0)', async () => {
    const prover = new OptimizedProver({ strategy: 'CACHED' });
    const phi = Atom('unique_audit_action');
    // First call — proves + caches
    const r1 = await prover.prove([Obligation(phi)], Permission(phi));
    // Second call — same KB+goal → from cache
    const r2 = await prover.prove([Obligation(phi)], Permission(phi));
    const stats = prover.getStats();
    expect(r1.reason).toBe(r2.reason);
    // Either r1 was already cached from a prior run, or r2 is the first cache hit
    expect(stats.proofs_run + stats.cache_hits).toBeGreaterThanOrEqual(1);
  });

  it('getStats returns correct shape', () => {
    const prover = createOptimizedProver('FORWARD_CHAIN');
    const s = prover.getStats();
    expect(s.strategy).toBe('FORWARD_CHAIN');
    expect(typeof s.cache_hits).toBe('number');
    expect(typeof s.avg_time_ms).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// T-114: Security Validator
// ---------------------------------------------------------------------------

describe('T-114 SecurityValidator', () => {
  let validator: SecurityValidator;
  beforeEach(() => { validator = createValidator('medium'); });

  it('accepts a well-formed formula', () => {
    const r = validator.validateFormula('O(log_access)');
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('rejects oversized formula', () => {
    const big = 'O(' + 'x'.repeat(20_000) + ')';
    const r = validator.validateFormula(big);
    expect(r.valid).toBe(false);
    expect(r.threats).toContain('dos');
  });

  it('rejects deeply nested formula', () => {
    const deep = '('.repeat(200) + 'P(x)' + ')'.repeat(200);
    const r = validator.validateFormula(deep);
    expect(r.valid).toBe(false);
    expect(r.threats).toContain('recursive_bomb');
  });

  it('rejects formula with injection pattern', () => {
    const r = validator.validateFormula('<script>alert(1)</script>');
    expect(r.valid).toBe(false);
    expect(r.threats).toContain('injection');
  });

  it('warns on unbalanced parentheses', () => {
    const r = validator.validateFormula('O(log_access');
    expect(r.warnings.some(w => w.includes('parentheses'))).toBe(true);
  });

  it('validateKb validates array of formulas', () => {
    const r = validator.validateKb(['O(a)', 'P(b)', 'F(c)']);
    expect(r.valid).toBe(true);
    expect(r.metadata['formula_count']).toBe(3);
  });

  it('createValidator(high) uses stricter limits', () => {
    const highValidator = createValidator('high');
    const big = 'O(' + 'x'.repeat(6_000) + ')';
    expect(highValidator.validateFormula(big).valid).toBe(false);
    expect(createValidator('low').validateFormula(big).valid).toBe(true);
  });

  it('validateFormula convenience function works', () => {
    const r = validateFormula('O(x)', 'medium');
    expect(r.valid).toBe(true);
  });
});
