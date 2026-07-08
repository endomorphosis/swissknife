/**
 * Sprint 49 tests — German Parser, Logic Converters, DeonticConverter, FOLConverter
 *
 * Covers T-218 (german-parser.ts),
 *         T-219/T-220/T-221 (logic-converters.ts — DeonticConverter/TDFOL converters/FOLConverter).
 */

import {
  GermanPatternMatcher,
  GermanParser,
  getGermanVerbConjugations,
  getGermanArticles,
  getGermanModalParticles,
  getGermanDeonticKeywords,
  getGermanCompoundWords,
  DEONTIC_OPERATOR,
  COGNITIVE_OPERATOR,
  TEMPORAL_OPERATOR,
} from '../../src/services/logic/nl/german-parser';

import {
  TDFOLToDCECConverter,
  DCECToTDFOLConverter,
  TDFOLToFOLConverter,
  TDFOLToTPTPConverter,
  tdfolToDcec,
  dcecToTdfol,
  tdfolToFol,
  tdfolToTptp,
  DeonticConverter,
  FOLConverter,
} from '../../src/services/logic/shared/logic-converters';

// ---------------------------------------------------------------------------
// GermanPatternMatcher tests
// ---------------------------------------------------------------------------

describe('GermanPatternMatcher — deontic patterns', () => {
  const matcher = new GermanPatternMatcher();

  test('detects obligation (muss)', () => {
    const matches = matcher.matchByType('Der Agent muss einhalten', 'deontic');
    expect(matches.some(m => m.operator === DEONTIC_OPERATOR.OBLIGATION)).toBe(true);
  });

  test('detects prohibition (verboten)', () => {
    const matches = matcher.matchByType('Es ist verboten teilen', 'deontic');
    expect(matches.some(m => m.operator === DEONTIC_OPERATOR.PROHIBITION)).toBe(true);
  });

  test('detects permission (darf)', () => {
    const matches = matcher.matchByType('Er darf gehen', 'deontic');
    expect(matches.some(m => m.operator === DEONTIC_OPERATOR.PERMISSION)).toBe(true);
  });

  test('detects cognitive belief', () => {
    const matches = matcher.matchByType('Er glaubt dass der Vertrag gilt', 'cognitive');
    expect(matches.some(m => m.operator === COGNITIVE_OPERATOR.BELIEF)).toBe(true);
  });

  test('detects temporal always', () => {
    const matches = matcher.matchByType('Immer die Regeln beachten', 'temporal');
    expect(matches.some(m => m.operator === TEMPORAL_OPERATOR.ALWAYS)).toBe(true);
  });

  test('match() returns results sorted by span', () => {
    const all = matcher.match('Der Agent muss einhalten und er darf gehen');
    for (let i = 1; i < all.length; i++) {
      expect(all[i].span[0]).toBeGreaterThanOrEqual(all[i - 1].span[0]);
    }
  });

  test('empty string returns no matches', () => {
    expect(matcher.match('')).toHaveLength(0);
  });
});

describe('GermanParser', () => {
  const parser = new GermanParser();

  test('parse() returns text, clauses, matches', () => {
    const result = parser.parse('Der Agent muss einhalten');
    expect(result.text).toBe('Der Agent muss einhalten');
    expect(Array.isArray(result.clauses)).toBe(true);
    expect(Array.isArray(result.matches)).toBe(true);
  });

  test('clauses have confidence in [0, 1]', () => {
    const { clauses } = parser.parse('Der Agent muss einhalten');
    for (const c of clauses) {
      expect(c.confidence).toBeGreaterThanOrEqual(0);
      expect(c.confidence).toBeLessThanOrEqual(1);
    }
  });

  test('extractClauses returns same as parse().clauses', () => {
    const { clauses: a, matches } = parser.parse('Er darf gehen');
    const b = parser.extractClauses('Er darf gehen', matches);
    expect(a.length).toBe(b.length);
  });
});

describe('German lexicon functions', () => {
  test('getGermanVerbConjugations covers müssen', () => {
    const conj = getGermanVerbConjugations();
    expect(conj['müssen']).toBeDefined();
    expect(conj['müssen']['ich']).toBe('muss');
  });

  test('getGermanArticles has nominative', () => {
    const arts = getGermanArticles();
    expect(arts['definite']['nominative']).toContain('der');
  });

  test('getGermanModalParticles is non-empty', () => {
    expect(getGermanModalParticles().length).toBeGreaterThan(5);
  });

  test('getGermanDeonticKeywords has obligation', () => {
    const kw = getGermanDeonticKeywords();
    expect(kw['obligation']).toContain('müssen');
  });

  test('getGermanCompoundWords has Verbot', () => {
    const cw = getGermanCompoundWords();
    expect(cw['Verbot']).toBe('prohibition');
  });
});

// ---------------------------------------------------------------------------
// TDFOL multi-converter tests
// ---------------------------------------------------------------------------

describe('TDFOLToDCECConverter', () => {
  const conv = new TDFOLToDCECConverter();

  test('replaces O( with (obligated', () => {
    const out = conv.convert('O(pay(alice))');
    expect(out).toContain('obligated');
  });

  test('replaces □ with (always', () => {
    const out = conv.convert('□P(x)');
    expect(out).toContain('always');
  });

  test('replaces ∧ with and', () => {
    const out = conv.convert('P ∧ Q');
    expect(out).toContain('and');
  });
});

describe('DCECToTDFOLConverter', () => {
  const conv = new DCECToTDFOLConverter();

  test('replaces (obligated with O(', () => {
    const out = conv.convert('(obligated pay)');
    expect(out).toContain('O(');
  });

  test('replaces and with ∧', () => {
    const out = conv.convert('P and Q');
    expect(out).toContain('∧');
  });
});

describe('TDFOLToFOLConverter', () => {
  const conv = new TDFOLToFOLConverter();

  test('strips □ modality', () => {
    // □Holds(x) should remove □ and leave predicate
    const out = conv.convert('□Holds(x)');
    expect(out).not.toContain('□');
    expect(out).toContain('Holds');
  });

  test('converts F( to negation', () => {
    const out = conv.convert('F(disclose)');
    expect(out).toContain('¬');
  });
});

describe('TDFOLToTPTPConverter', () => {
  const conv = new TDFOLToTPTPConverter();

  test('wraps in fof(...) format', () => {
    const out = conv.convert('P(x) ∧ Q(x)', 'axiom1');
    expect(out).toMatch(/^fof\(axiom1, conjecture,/);
    expect(out).toContain(').');
  });

  test('replaces ∀ with ! [...]', () => {
    const out = conv.convert('∀x. P(x)');
    expect(out).toContain('! [');
  });
});

describe('module-level converter fns', () => {
  test('tdfolToDcec works', () => { expect(tdfolToDcec('O(pay)')).toContain('obligated'); });
  test('dcecToTdfol works', () => { expect(dcecToTdfol('(obligated pay)')).toContain('O('); });
  test('tdfolToFol works',  () => { expect(tdfolToFol('□P(x)')).not.toContain('□'); });
  test('tdfolToTptp works', () => { expect(tdfolToTptp('P(x)')).toMatch(/^fof/); });
});

// ---------------------------------------------------------------------------
// DeonticConverter tests
// ---------------------------------------------------------------------------

describe('DeonticConverter', () => {
  const conv = new DeonticConverter();

  test('converts obligation text to O(...)', () => {
    const r = conv.convert('Alice must pay taxes');
    expect(r.output).toContain('O(');
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  test('converts permission text to P(...)', () => {
    const r = conv.convert('Bob may leave early');
    expect(r.output).toContain('P(');
  });

  test('converts prohibition text to F(...)', () => {
    const r = conv.convert('Eve must not disclose secrets');
    expect(r.output).toContain('F(');
  });

  test('cache hit on second call', () => {
    const conv2 = new DeonticConverter({ useCache: true });
    conv2.convert('Alice must pay');
    conv2.convert('Alice must pay');
    expect(conv2.getStats().cacheHits).toBe(1);
  });

  test('convertBatch processes multiple texts', () => {
    const results = conv.convertBatch(['Alice must pay', 'Bob may leave']);
    expect(results).toHaveLength(2);
    results.forEach(r => expect(typeof r.output).toBe('string'));
  });

  test('getStats returns numeric fields', () => {
    const s = conv.getStats();
    expect(typeof s.totalConverted).toBe('number');
    expect(typeof s.avgConfidence).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// FOLConverter tests
// ---------------------------------------------------------------------------

describe('FOLConverter', () => {
  const conv = new FOLConverter();

  test('converts universal quantification', () => {
    const r = conv.convert('All humans are mortal');
    expect(r.output).toContain('∀x');
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  test('converts existential quantification', () => {
    const r = conv.convert('There exists a contractor who complies');
    expect(r.output).toContain('∃x');
  });

  test('converts implication', () => {
    const r = conv.convert('If P then Q');
    expect(r.output).toContain('→');
  });

  test('validate() accepts well-formed formula', () => {
    const v = conv.validate('∀x.(P(x) → Q(x))');
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
  });

  test('validate() rejects unmatched paren', () => {
    const v = conv.validate('∀x.(P(x)');
    expect(v.valid).toBe(false);
  });

  test('convertBatch works', () => {
    const results = conv.convertBatch(['All X are Y', 'Some Z exist']);
    expect(results).toHaveLength(2);
  });

  test('getStats increments totalConverted', () => {
    const conv2 = new FOLConverter({ useCache: false });
    conv2.convert('All X are Y');
    expect(conv2.getStats().totalConverted).toBe(1);
  });
});
