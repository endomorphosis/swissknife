/**
 * wasm-prover-sprint85.test.ts
 * Tests for §12.20 security/common/type residual closure.
 */

import {
  AuditLog,
  FixedWindowRateLimiter,
  InputValidator,
  RateLimitExceeded,
  getSecurityAuditLog,
  rateLimit,
  resetSecurityAuditLog,
} from '../../src/services/platform/security-core.js';
import {
  convertFormula,
  convertFormulaBatch,
  convertFormulaDetailed,
  detectFormulaFormat,
  formatFormula,
  normalizeSyntax,
} from '../../src/services/logic/shared/logic-converters.js';
import {
  CommonTypes,
  DeonticTypes,
  FOLTypes,
  TranslationTypes,
} from '../../src/services/logic/shared/logic-type-modules.js';
import {
  BoundedCache,
  ProofCache,
  getUnifiedCacheStats,
} from '../../src/services/proof-engine/index.js';
import { FLogicProofCache } from '../../src/services/integrations/flogic-proof-cache.js';
import { IPFSProofCache } from '../../src/services/ipfs/ipfs-proof-cache';

// ---------------------------------------------------------------------------
// PORT-203 — unified security facade
// ---------------------------------------------------------------------------

describe('PORT-203 InputValidator', () => {
  it('validates and sanitizes text inputs', () => {
    const validator = new InputValidator({ maxTextLength: 20 });
    expect(validator.validateText('safe text').valid).toBe(true);
    expect(validator.validateText('x'.repeat(21)).valid).toBe(false);
    expect(validator.validateText('<script>alert(1)</script>').warnings[0]).toContain('blocked pattern');
    expect(validator.sanitizeText('A\u0000   B')).toBe('A B');
  });

  it('validates formula shape and throws through assert helpers', () => {
    const validator = new InputValidator();
    expect(validator.validateFormula('O(Pay)').valid).toBe(true);
    expect(validator.validateFormula('O(Pay').errors).toContain('unbalanced parentheses');
    expect(() => validator.assertValidFormula('')).toThrow('formula must not be empty');
  });
});

describe('PORT-203 FixedWindowRateLimiter', () => {
  it('limits by key and reports retry timing', () => {
    let now = 1_000;
    const limiter = new FixedWindowRateLimiter({ maxRequests: 2, windowMs: 100, clock: () => now });
    expect(limiter.check('actor-a').allowed).toBe(true);
    expect(limiter.check('actor-a').remaining).toBe(0);
    const denied = limiter.check('actor-a');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(100);
    now = 1_101;
    expect(limiter.check('actor-a').allowed).toBe(true);
  });

  it('wraps functions with rateLimit', () => {
    const limiter = new FixedWindowRateLimiter({ maxRequests: 1, windowMs: 1_000, clock: () => 1 });
    const wrapped = rateLimit((value: unknown) => String(value).toUpperCase(), limiter);
    expect(wrapped('ok')).toBe('OK');
    expect(() => wrapped('blocked')).toThrow(RateLimitExceeded);
  });
});

describe('PORT-203 AuditLog', () => {
  afterEach(() => resetSecurityAuditLog());

  it('records hash-chained audit entries and queries them', () => {
    const log = new AuditLog(10);
    const first = log.record({ action: 'validate', subject: 'formula', actor: 'alice', payload: { ok: true } });
    const second = log.record({ action: 'prove', subject: 'formula', actor: 'bob', payload: { prover: 'z3' } });
    expect(first.previousHash).toBeNull();
    expect(second.previousHash).toBe(first.entryHash);
    expect(log.query({ actor: 'bob' })).toHaveLength(1);
    expect(log.verifyIntegrity()).toBe(true);
  });

  it('exposes a security audit singleton', () => {
    const log = getSecurityAuditLog();
    log.record({ action: 'test', subject: 'singleton' });
    expect(getSecurityAuditLog().size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PORT-205 — unified cache base
// ---------------------------------------------------------------------------

describe('PORT-205 unified cache base', () => {
  it('provides a generic bounded cache with LRU eviction and stats', () => {
    const cache = new BoundedCache<string>({ maxSize: 2 });
    cache.set('a', 'A');
    cache.set('b', 'B');
    expect(cache.get('a')).toBe('A');
    cache.set('c', 'C');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.stats()).toMatchObject({ size: 2, maxSize: 2, evictions: 1 });
  });

  it('normalizes stats for memory, FLogic, and IPFS proof caches', () => {
    const memory = new ProofCache();
    memory.set('formula-hash', 'cec', { proved: true });
    memory.get('formula-hash');

    const flogic = new FLogicProofCache();
    flogic.set('ancestor(alice, bob)', { proved: true });
    flogic.get('ancestor(alice, bob)');

    const ipfs = new IPFSProofCache();
    ipfs.set('O(Pay)', { proved: true, method: 'cec' });
    ipfs.get('O(Pay)');

    expect(getUnifiedCacheStats([memory, flogic, ipfs])).toEqual([
      expect.objectContaining({ kind: 'memory-proof', size: 1, hits: 1 }),
      expect.objectContaining({ kind: 'flogic-proof', size: 1, hits: 1 }),
      expect.objectContaining({ kind: 'ipfs-proof', size: 1, hits: 1 }),
    ]);
  });
});

// ---------------------------------------------------------------------------
// PORT-206 — converter helpers
// ---------------------------------------------------------------------------

describe('PORT-206 formula converter helpers', () => {
  it('normalizes ASCII and LaTeX operators to unicode syntax', () => {
    expect(normalizeSyntax('forall x: Human(x) AND Mortal(x)')).toBe('∀x. Human(x) ∧ Mortal(x)');
    expect(normalizeSyntax('\\forall x. Human(x) \\rightarrow Mortal(x)')).toBe('∀x. Human(x) → Mortal(x)');
  });

  it('formats formulas as TPTP, Prolog, LaTeX, and ASCII', () => {
    expect(convertFormula('forall x. Human(x) -> Mortal(x)', 'tptp', { name: 'human_mortal', role: 'axiom' }))
      .toBe('fof(human_mortal, axiom, (! [x] : Human(x) => Mortal(x))).');
    expect(formatFormula('O(Pay) -> P(Inspect)', 'prolog')).toBe('permitted(Inspect) :- obligatory(Pay)');
    expect(formatFormula('A ∧ B → C', 'ascii')).toBe('A & B => C');
    expect(formatFormula('A ∨ B', 'latex')).toBe('A \\lor B');
  });

  it('detects source formats and returns detailed conversion envelopes', () => {
    expect(detectFormulaFormat('fof(a, axiom, (p)).')).toBe('tptp');
    expect(detectFormulaFormat('\\forall x. P(x)')).toBe('latex');
    const detailed = convertFormulaDetailed('A -> B', 'unicode');
    expect(detailed.output).toBe('A → B');
    expect(detailed.metadata).toMatchObject({ source_format: 'ascii', target_format: 'unicode' });
  });

  it('converts formula batches', () => {
    expect(convertFormulaBatch(['A -> B', 'B <-> C'], 'unicode')).toEqual(['A → B', 'B ↔ C']);
  });
});

// ---------------------------------------------------------------------------
// PORT-207 — namespaced type modules
// ---------------------------------------------------------------------------

describe('PORT-207 namespaced logic type modules', () => {
  it('exposes common and translation envelopes', () => {
    const result: TranslationTypes.TranslationResult = {
      ok: true,
      value: 'O(Pay)',
      errors: [],
      warnings: [],
      metadata: { source: 'test' },
      source: 'tdfol',
      target: 'dcec',
      confidence: 0.9,
    };
    const envelope: CommonTypes.ResultEnvelope<string> = result;
    expect(envelope.ok).toBe(true);
    expect(result.target).toBe('dcec');
  });

  it('exposes deontic and FOL domain types', () => {
    const clause: DeonticTypes.DeonticClause = {
      modality: 'obligation',
      actor: { id: 'alice', role: 'controller' },
      action: 'notify',
    };
    const predicate: FOLTypes.Predicate = {
      name: 'Human',
      terms: [{ name: 'x' }],
    };
    expect(clause.modality).toBe('obligation');
    expect(predicate.terms[0]!.name).toBe('x');
  });
});
