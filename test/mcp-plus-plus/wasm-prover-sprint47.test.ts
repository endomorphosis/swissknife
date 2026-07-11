/**
 * Sprint 47 tests — TDFOL NL Patterns, NL Policy Conflict Detector, LLM Prompt Builder
 *
 * Covers T-209 (tdfol-nl-patterns.ts),
 *         T-210 (nl-policy-conflict-detector.ts),
 *         T-211 (tdfol-nl-llm.ts).
 */

import {
  PatternType,
  PatternMatcher,
} from '../../src/services/logic/shared/tdfol-nl-patterns.js';

import {
  NLPolicyConflictDetector,
  detectConflicts,
  PolicyClause,
} from '../../src/services/logic/nl/nl-policy-conflict-detector.js';

import {
  buildConversionPrompt,
  buildValidationPrompt,
  buildErrorCorrectionPrompt,
  getOperatorHintsForText,
  LLMResponseCache,
  makeLLMParseResult,
} from '../../src/services/logic/tdfol/tdfol-nl-llm.js';

// ---------------------------------------------------------------------------
// PatternMatcher tests
// ---------------------------------------------------------------------------

describe('PatternMatcher — built-in patterns', () => {
  const pm = new PatternMatcher();

  test('loads at least 10 built-in patterns', () => {
    expect(pm.getPatterns().length).toBeGreaterThanOrEqual(10);
  });

  test('detects obligation in "contractor must pay"', () => {
    const matches = pm.match('The contractor must pay the vendor.');
    const types = matches.map(m => m.pattern.type);
    expect(types).toContain(PatternType.OBLIGATION);
  });

  test('detects prohibition in "shall not disclose"', () => {
    const matches = pm.match('All parties shall not disclose trade secrets.');
    const types = matches.map(m => m.pattern.type);
    expect(types).toContain(PatternType.PROHIBITION);
  });

  test('detects permission in "employee may take leave"', () => {
    const matches = pm.match('An employee may take sick leave.');
    const types = matches.map(m => m.pattern.type);
    expect(types).toContain(PatternType.PERMISSION);
  });

  test('detects universal quantification in "all contractors must"', () => {
    const matches = pm.match('All contractors must register.');
    const types = matches.map(m => m.pattern.type);
    expect(types).toContain(PatternType.UNIVERSAL_QUANTIFICATION);
  });

  test('detects temporal pattern in "within 30 days"', () => {
    const matches = pm.match('Payment must be made within 30 days.');
    const types = matches.map(m => m.pattern.type);
    expect(types).toContain(PatternType.TEMPORAL);
  });

  test('detects conditional in "if ... then"', () => {
    const matches = pm.match('If contractor fails, then penalty applies.');
    const types = matches.map(m => m.pattern.type);
    expect(types).toContain(PatternType.CONDITIONAL);
  });

  test('matches are ordered by span start', () => {
    const matches = pm.match('All contractors must pay. Employees may request.');
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i].span[0]).toBeGreaterThanOrEqual(matches[i - 1].span[0]);
    }
  });

  test('confidence is in [0, 1]', () => {
    const matches = pm.match('The contractor must pay taxes within 30 days.');
    for (const m of matches) {
      expect(m.confidence).toBeGreaterThanOrEqual(0);
      expect(m.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe('PatternMatcher — getPatternsByType', () => {
  const pm = new PatternMatcher();
  test('returns only obligation patterns', () => {
    const obs = pm.getPatternsByType(PatternType.OBLIGATION);
    expect(obs.length).toBeGreaterThan(0);
    obs.forEach(p => expect(p.type).toBe(PatternType.OBLIGATION));
  });
});

describe('PatternMatcher — addPattern', () => {
  test('custom pattern is matched after registration', () => {
    const pm = new PatternMatcher();
    pm.addPattern({
      name: 'custom_pay',
      type: PatternType.OBLIGATION,
      textPattern: String.raw`\bpay immediately\b`,
      description: 'Custom pay pattern',
      examples: [],
    });
    const matches = pm.match('The vendor must pay immediately.');
    expect(matches.some(m => m.pattern.name === 'custom_pay')).toBe(true);
  });
});

describe('PatternMatcher — matchAll', () => {
  test('returns array of match lists', () => {
    const pm = new PatternMatcher();
    const results = pm.matchAll([
      'Contractor must pay.',
      'Employees may leave early.',
    ]);
    expect(results).toHaveLength(2);
    expect(Array.isArray(results[0])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NLPolicyConflictDetector tests
// ---------------------------------------------------------------------------

const clause = (clause_type: string, action: string, actor?: string, resource?: string): PolicyClause =>
  ({ clause_type, action, actor: actor ?? null, resource: resource ?? null });

describe('NLPolicyConflictDetector — permission + prohibition', () => {
  const det = new NLPolicyConflictDetector();

  test('detects simultaneous_perm_prohib', () => {
    const clauses = [
      clause('permission', 'read', 'alice', 'file'),
      clause('prohibition', 'read', 'alice', 'file'),
    ];
    const conflicts = det.detect(clauses);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].conflictType).toBe('simultaneous_perm_prohib');
  });

  test('no conflict when actions differ', () => {
    const clauses = [
      clause('permission', 'read', 'alice', 'file'),
      clause('prohibition', 'write', 'alice', 'file'),
    ];
    expect(det.detect(clauses)).toHaveLength(0);
  });

  test('wildcard actor causes conflict with specific actor', () => {
    const clauses = [
      clause('permission', 'pay', '*', 'invoice'),
      clause('prohibition', 'pay', 'alice', 'invoice'),
    ];
    const conflicts = det.detect(clauses);
    expect(conflicts.some(c => c.conflictType === 'simultaneous_perm_prohib')).toBe(true);
  });

  test('conflict includes both clause types', () => {
    const clauses = [
      clause('permission', 'access', 'bob', 'db'),
      clause('prohibition', 'access', 'bob', 'db'),
    ];
    const [c] = det.detect(clauses);
    expect(c.clauseTypes.has('permission')).toBe(true);
    expect(c.clauseTypes.has('prohibition')).toBe(true);
  });
});

describe('NLPolicyConflictDetector — duplicate obligations', () => {
  const det = new NLPolicyConflictDetector();

  test('detects multiple_obligations', () => {
    const clauses = [
      clause('obligation', 'pay', 'alice', 'invoice'),
      clause('obligation', 'pay', 'alice', 'invoice'),
    ];
    const conflicts = det.detect(clauses);
    expect(conflicts.some(c => c.conflictType === 'multiple_obligations')).toBe(true);
  });

  test('single obligation is not a conflict', () => {
    const clauses = [clause('obligation', 'report', 'alice')];
    expect(det.detect(clauses)).toHaveLength(0);
  });
});

describe('NLPolicyConflictDetector — toDict()', () => {
  test('toDict returns plain serialisable object', () => {
    const clauses = [
      clause('permission', 'read', 'alice'),
      clause('prohibition', 'read', 'alice'),
    ];
    const [conflict] = new NLPolicyConflictDetector().detect(clauses);
    const d = conflict.toDict();
    expect(d).toHaveProperty('conflictType');
    expect(Array.isArray(d['actors'])).toBe(true);
    expect(JSON.stringify(d)).toBeTruthy(); // fully serialisable
  });
});

describe('NLPolicyConflictDetector — detectAndWarn', () => {
  test('emits console.warn for each conflict', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const det = new NLPolicyConflictDetector();
    const clauses = [
      clause('permission', 'write', 'eve'),
      clause('prohibition', 'write', 'eve'),
    ];
    const conflicts = det.detectAndWarn(clauses);
    expect(warnSpy).toHaveBeenCalledTimes(conflicts.length);
    warnSpy.mockRestore();
  });
});

describe('detectConflicts convenience function', () => {
  test('works as module-level shorthand', () => {
    const conflicts = detectConflicts([
      clause('permission', 'read', 'alice'),
      clause('prohibition', 'read', 'alice'),
    ]);
    expect(conflicts.length).toBeGreaterThan(0);
  });

  test('returns empty for no-conflict list', () => {
    expect(detectConflicts([clause('permission', 'read', 'alice')])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// LLM Prompt Builder tests
// ---------------------------------------------------------------------------

describe('buildConversionPrompt', () => {
  test('contains the input text', () => {
    const p = buildConversionPrompt('All users must pay.');
    expect(p).toContain('All users must pay.');
  });

  test('contains "Output:" marker', () => {
    expect(buildConversionPrompt('X')).toContain('Output:');
  });

  test('includes examples when requested', () => {
    const p = buildConversionPrompt('X', true, 'basic');
    expect(p).toContain('Examples:');
  });

  test('omits examples when includeExamples=false', () => {
    const p = buildConversionPrompt('X', false);
    expect(p).not.toContain('Examples:');
  });

  test('includes operator hint when specified', () => {
    const p = buildConversionPrompt('X', false, 'basic', ['obligation']);
    expect(p).toContain('Obligation');
  });
});

describe('buildValidationPrompt', () => {
  test('contains the formula', () => {
    const p = buildValidationPrompt('∀x.P(x)');
    expect(p).toContain('∀x.P(x)');
  });
});

describe('buildErrorCorrectionPrompt', () => {
  test('contains formula and error list', () => {
    const p = buildErrorCorrectionPrompt('bad formula', ['missing paren', 'unknown op']);
    expect(p).toContain('bad formula');
    expect(p).toContain('missing paren');
    expect(p).toContain('unknown op');
  });
});

describe('getOperatorHintsForText', () => {
  test('returns obligation for "must"', () => {
    expect(getOperatorHintsForText('All users must comply')).toContain('obligation');
  });

  test('returns universal for "all"', () => {
    expect(getOperatorHintsForText('All contractors')).toContain('universal');
  });

  test('returns permission for "may"', () => {
    expect(getOperatorHintsForText('Users may access')).toContain('permission');
  });

  test('returns forbidden for "must not"', () => {
    expect(getOperatorHintsForText('Vendors must not share')).toContain('forbidden');
  });

  test('returns temporal_always for "always"', () => {
    expect(getOperatorHintsForText('Contractors must always comply')).toContain('temporal_always');
  });

  test('returns empty list for neutral text', () => {
    expect(getOperatorHintsForText('The quick brown fox jumps.')).toHaveLength(0);
  });
});

describe('LLMResponseCache', () => {
  test('cache miss returns null', async () => {
    const cache = new LLMResponseCache();
    expect(await cache.get('text', 'openai', 'hash')).toBeNull();
  });

  test('cache hit after put', async () => {
    const cache = new LLMResponseCache();
    await cache.put('text', 'openai', 'hash', '∀x.P(x)', 0.9);
    const result = await cache.get('text', 'openai', 'hash');
    expect(result).not.toBeNull();
    expect(result!.formula).toBe('∀x.P(x)');
    expect(result!.confidence).toBe(0.9);
  });

  test('size increases after put', async () => {
    const cache = new LLMResponseCache();
    expect(cache.size).toBe(0);
    await cache.put('a', 'p', 'h', '∀x.Q(x)', 0.8);
    expect(cache.size).toBe(1);
  });

  test('clear resets cache', async () => {
    const cache = new LLMResponseCache();
    await cache.put('a', 'p', 'h', '∃x.P(x)', 0.7);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(await cache.get('a', 'p', 'h')).toBeNull();
  });

  test('stats reports hit rate', async () => {
    const cache = new LLMResponseCache();
    await cache.put('x', 'p', 'h', 'P', 0.9);
    await cache.get('x', 'p', 'h'); // hit
    await cache.get('y', 'p', 'h'); // miss
    const s = cache.stats();
    expect(s['hits']).toBe(1);
    expect(s['misses']).toBe(1);
    expect(s['hitRate']).toBe(0.5);
  });

  test('LRU eviction when maxSize reached', async () => {
    const cache = new LLMResponseCache(2);
    await cache.put('a', 'p', 'h1', 'F1', 0.9);
    await cache.put('b', 'p', 'h2', 'F2', 0.8);
    await cache.put('c', 'p', 'h3', 'F3', 0.7); // evicts 'a'
    expect(cache.size).toBe(2);
    expect(await cache.get('a', 'p', 'h1')).toBeNull();
    expect(await cache.get('c', 'p', 'h3')).not.toBeNull();
  });
});

describe('makeLLMParseResult', () => {
  test('defaults to failure with empty formula', () => {
    const r = makeLLMParseResult();
    expect(r.success).toBe(false);
    expect(r.formula).toBe('');
    expect(r.method).toBe('unknown');
    expect(r.errors).toEqual([]);
  });

  test('partial override works', () => {
    const r = makeLLMParseResult({ success: true, formula: '∀x.P(x)', confidence: 0.95 });
    expect(r.success).toBe(true);
    expect(r.confidence).toBe(0.95);
  });
});
