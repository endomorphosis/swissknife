/**
 * Sprint 64 tests — Forward Chaining, NL Preprocessor, Ambiguity Resolver,
 *                   Semantic Normalizer, Text to FOL, Legal Text to Deontic
 */

import {
  ForwardChainingStrategy,
  preprocess, NLEntityType,
  AmbiguityResolver, SemanticDisambiguator, StatisticalDisambiguator,
  DisambiguationStrategy, ParseScore,
  SemanticNormalizer, getGlobalNormalizer,
  convertTextToFol, extractTextFromDataset, getQuantifierDistribution, getOperatorDistribution,
  legalTextToDeontic, extractLegalTextFromDataset, convertResultToLegacyFormat,
} from '../../src/services/legacy/sprint64-modules';

// ---------------------------------------------------------------------------
// ForwardChainingStrategy
// ---------------------------------------------------------------------------
describe('ForwardChainingStrategy', () => {
  const s = new ForwardChainingStrategy();

  test('proves trivially assumed formula', () => {
    const { isProved } = s.prove('P', ['P']);
    expect(isProved).toBe(true);
  });

  test('proves via modus ponens', () => {
    const { isProved, steps } = s.prove('Q', ['P', 'P→Q']);
    expect(isProved).toBe(true);
    expect(steps.length).toBeGreaterThan(0);
  });

  test('fails for underivable goal', () => {
    const { isProved } = s.prove('R', ['P']);
    expect(isProved).toBe(false);
  });

  test('stats increment after prove', () => {
    const s2 = new ForwardChainingStrategy();
    s2.prove('P', ['P']);
    expect(s2.getStats().proofsAttempted).toBe(1);
    expect(s2.getStats().proofsSucceeded).toBe(1);
  });

  test('getStats().elapsedMs not returned directly', () => {
    expect(typeof s.getStats().totalSteps).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// TDFOL NL Preprocessor
// ---------------------------------------------------------------------------
describe('preprocess', () => {
  test('returns ProcessedDocument with expected fields', () => {
    const doc = preprocess('Alice must pay taxes within 30 days.');
    expect(doc.text).toBe('Alice must pay taxes within 30 days.');
    expect(doc.sentences.length).toBeGreaterThan(0);
    expect(Array.isArray(doc.tokens)).toBe(true);
    expect(Array.isArray(doc.entities)).toBe(true);
    expect(Array.isArray(doc.temporalExprs)).toBe(true);
  });

  test('extracts Alice as entity', () => {
    const doc = preprocess('Alice must pay.');
    expect(doc.entities.some(e => e.text === 'Alice')).toBe(true);
  });

  test('extracts temporal expression "within 30 days"', () => {
    const doc = preprocess('Submit reports within 30 days.');
    expect(doc.temporalExprs.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Ambiguity Resolver
// ---------------------------------------------------------------------------
describe('AmbiguityResolver', () => {
  const resolver = new AmbiguityResolver();
  const parses: ParseScore[] = [
    { parseId: 'p1', score: 0.7, formula: 'O(pay)', confidence: 0.7 },
    { parseId: 'p2', score: 0.9, formula: 'P(pay)', confidence: 0.9 },
  ];

  test('resolve HIGHEST_SCORE returns best parse', () => {
    const result = resolver.resolve(parses, DisambiguationStrategy.HIGHEST_SCORE);
    expect(result?.parseId).toBe('p2');
  });

  test('resolve FIRST returns first parse', () => {
    const result = resolver.resolve(parses, DisambiguationStrategy.FIRST);
    expect(result?.parseId).toBe('p1');
  });

  test('resolve empty returns null', () => {
    expect(resolver.resolve([])).toBeNull();
  });

  test('score returns numeric value', () => {
    const s = resolver.score('O(pay(alice))', ['alice', 'pay']);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});

describe('SemanticDisambiguator', () => {
  test('disambiguate with context returns a parse', () => {
    const d = new SemanticDisambiguator();
    const parses: ParseScore[] = [
      { parseId: 'p1', score: 0, formula: 'O(pay(alice))', confidence: 0.5 },
    ];
    const result = d.disambiguate(parses, ['alice', 'pay']);
    expect(result).not.toBeNull();
  });
});

describe('StatisticalDisambiguator', () => {
  test('recordUsage influences disambiguation', () => {
    const d = new StatisticalDisambiguator();
    d.recordUsage('O(pay)');
    d.recordUsage('O(pay)');
    const parses: ParseScore[] = [
      { parseId: 'a', score: 0, formula: 'O(pay)', confidence: 0.5 },
      { parseId: 'b', score: 0, formula: 'P(pay)', confidence: 0.5 },
    ];
    const result = d.disambiguate(parses);
    expect(result?.formula).toBe('O(pay)');
  });
});

// ---------------------------------------------------------------------------
// Semantic Normalizer
// ---------------------------------------------------------------------------
describe('SemanticNormalizer', () => {
  const n = new SemanticNormalizer();

  test('normalize lowercases and strips articles', () => {
    const result = n.normalize('The contractor must pay the taxes');
    expect(result).not.toContain('The');
    expect(result.toLowerCase()).toBe(result);
  });

  test('cache hit on second call', () => {
    n.normalize('some text');
    n.normalize('some text');
    expect(n.getStats().cacheHits).toBe(1);
  });

  test('normalizeAll works on array', () => {
    const results = n.normalizeAll(['A must B', 'C may D']);
    expect(results).toHaveLength(2);
  });

  test('getGlobalNormalizer returns singleton', () => {
    expect(getGlobalNormalizer()).toBe(getGlobalNormalizer());
  });
});

// ---------------------------------------------------------------------------
// Text to FOL
// ---------------------------------------------------------------------------
describe('convertTextToFol', () => {
  test('universal quantification', () => {
    const r = convertTextToFol('All contractors must pay.');
    expect(r.operators).toContain('∀');
    expect(r.confidence).toBeGreaterThan(0);
  });

  test('implication pattern', () => {
    const r = convertTextToFol('If P then Q');
    expect(r.operators).toContain('→');
  });

  test('result has formula string', () => {
    expect(typeof convertTextToFol('Alice must pay.').formula).toBe('string');
  });
});

describe('extractTextFromDataset', () => {
  test('extracts from documents array', () => {
    const texts = extractTextFromDataset({ documents: [{ content: 'Alice must pay.' }, { content: 'Bob may leave.' }] });
    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain('Alice');
  });
});

describe('getQuantifierDistribution', () => {
  test('counts quantifier types', () => {
    const results = [
      convertTextToFol('All humans are mortal.'),
      convertTextToFol('There exists a solution.'),
    ];
    const dist = getQuantifierDistribution(results);
    expect(typeof dist['∀']).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Legal Text to Deontic
// ---------------------------------------------------------------------------
describe('legalTextToDeontic', () => {
  test('extracts obligation clauses', () => {
    const r = legalTextToDeontic('Contractors must pay taxes.', { jurisdiction: 'us' });
    expect(r.jurisdiction).toBe('us');
    expect(r.clauses.some(c => c.modality === 'obligation')).toBe(true);
  });

  test('confidence in [0,1]', () => {
    const r = legalTextToDeontic('Alice must pay.');
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  test('formula contains O/P/F', () => {
    const r = legalTextToDeontic('Alice must pay. Bob may leave.');
    expect(/[OPF]\(/.test(r.formula)).toBe(true);
  });
});

describe('convertResultToLegacyFormat', () => {
  test('contains expected fields', () => {
    const r = legalTextToDeontic('Alice must pay.');
    const legacy = convertResultToLegacyFormat(r, r.text);
    expect(legacy).toHaveProperty('formula');
    expect(legacy).toHaveProperty('confidence');
    expect(legacy).toHaveProperty('success');
  });
});

describe('extractLegalTextFromDataset', () => {
  test('works like extractTextFromDataset', () => {
    const texts = extractLegalTextFromDataset({ documents: [{ content: 'Legal text.' }] });
    expect(texts).toHaveLength(1);
  });
});
