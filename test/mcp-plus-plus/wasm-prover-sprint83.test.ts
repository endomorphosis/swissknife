/**
 * wasm-prover-sprint83.test.ts
 * Tests for §12.20 CEC native residual closure.
 */

import {
  AmbiguityResolver,
  DisambiguationStrategy,
  SemanticDisambiguator,
  StatisticalDisambiguator,
  makeParseScore,
  resolveAmbiguity,
  type ParseScore,
} from '../../src/services/logic/modal/ambiguity-resolver.js';
import {
  checkParens,
  cleanDcecFormula,
  consolidateParens,
  getMatchingCloseParen,
  normalizeDcecExpression,
  splitTopLevelArgs,
  stripComments,
  stripWhitespace,
} from '../../src/services/logic/dcec/dcec-cleaning.js';
import {
  DCECErrorCode,
  DCECHandledError,
  makeErrorEnvelope,
  safeDcecCall,
  safeDcecCallAsync,
  throwParseError,
  withDcecErrorHandling,
} from '../../src/services/logic/dcec/dcec-error-handling.js';
import {
  GrammarLoader,
  getGrammarLoader,
  parseGrammarRule,
} from '../../src/services/logic/nl/grammar-loader.js';
import {
  AndExpansionRule,
  ImpliesExpansionRule,
  NegationExpansionRule,
  OrExpansionRule,
  TemporalExpansionRule,
  expandFormula,
  getAllExpansionRules,
  selectExpansionRule,
} from '../../src/services/logic/tdfol/tdfol-expansion-rules.js';

// ---------------------------------------------------------------------------
// PORT-174 — parse ambiguity resolution
// ---------------------------------------------------------------------------

describe('PORT-174 AmbiguityResolver', () => {
  const parses: ParseScore[] = [
    { parseId: 'p-low', formula: 'P(pay)', score: 0.4, confidence: 0.8 },
    { parseId: 'p-high', formula: 'O(pay)', score: 0.9, confidence: 0.7 },
  ];

  it('selects the highest combined score by default', () => {
    const resolver = new AmbiguityResolver();
    expect(resolver.resolve(parses)?.parseId).toBe('p-high');
    expect(resolver.resolveDetailed(parses).reason).toBe('selected_highest_score');
  });

  it('supports FIRST strategy and empty candidate lists', () => {
    const resolver = new AmbiguityResolver();
    expect(resolver.resolve(parses, DisambiguationStrategy.FIRST)?.parseId).toBe('p-low');
    expect(resolver.resolve([])).toBeNull();
  });

  it('scores semantic context terms and ranks candidates', () => {
    const resolver = new AmbiguityResolver();
    const ranked = resolver.rank([
      makeParseScore('a', 'O(pay(alice))', 0.5),
      makeParseScore('b', 'P(read(bob))', 0.5),
    ], DisambiguationStrategy.SEMANTIC, ['alice', 'pay']);
    expect(ranked[0]!.parseId).toBe('a');
    expect(resolver.score('O(pay(alice))', ['alice', 'pay'])).toBeGreaterThan(0.5);
  });

  it('provides semantic and statistical disambiguator helpers', () => {
    const semantic = new SemanticDisambiguator();
    expect(semantic.disambiguate([makeParseScore('s', 'O(pay(alice))')], ['alice'])?.parseId).toBe('s');

    const statistical = new StatisticalDisambiguator();
    statistical.recordUsage('O(pay)');
    statistical.recordUsage('O(pay)');
    statistical.recordUsage('P(pay)');
    expect(statistical.getFrequency('O(pay)')).toBe(2);
    expect(statistical.disambiguate([
      makeParseScore('o', 'O(pay)'),
      makeParseScore('p', 'P(pay)'),
    ])?.parseId).toBe('o');
  });

  it('has a module-level resolve helper', () => {
    expect(resolveAmbiguity(parses)?.parseId).toBe('p-high');
  });
});

// ---------------------------------------------------------------------------
// PORT-175 — reusable DCEC cleaning helpers
// ---------------------------------------------------------------------------

describe('PORT-175 DCEC cleaning utilities', () => {
  it('strips comments and collapses whitespace', () => {
    expect(stripComments('O(pay) ; note\nP(read)')).toContain('P(read)');
    expect(stripWhitespace('  O   ( pay )  ')).toBe('O ( pay )');
  });

  it('normalizes synonyms and spacing', () => {
    expect(normalizeDcecExpression('obligated(pay) and permitted(read)')).toBe('O(pay) ∧ P(read)');
  });

  it('consolidates redundant parentheses and checks balance', () => {
    expect(consolidateParens('((P))')).toBe('(P)');
    expect(checkParens('(P ∧ Q)')).toBe(true);
    expect(checkParens('(P ∧ Q')).toBe(false);
  });

  it('finds matching parentheses and splits top-level arguments', () => {
    expect(getMatchingCloseParen('O(P(a),Q(b))', 1)).toBe(11);
    expect(splitTopLevelArgs('P(a), Q(b,c), R')).toEqual(['P(a)', 'Q(b,c)', 'R']);
  });

  it('returns a cleaning result envelope', () => {
    const result = cleanDcecFormula('/*x*/ obligated(pay)');
    expect(result.cleaned).toBe('O(pay)');
    expect(result.changed).toBe(true);
    expect(result.balancedParens).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PORT-176 — reusable error handling envelopes
// ---------------------------------------------------------------------------

describe('PORT-176 DCEC error handling', () => {
  it('wraps successful sync calls', () => {
    const result = safeDcecCall('parse', () => 42, 'input');
    expect(result).toMatchObject({ ok: true, value: 42, operation: 'parse' });
  });

  it('wraps handled parse errors', () => {
    const result = safeDcecCall('parse', () => throwParseError('bad formula', 'O('), 'O(');
    expect(result).toMatchObject({
      ok: false,
      code: DCECErrorCode.PARSE_ERROR,
      message: 'bad formula',
      operation: 'parse',
      input: 'O(',
    });
  });

  it('wraps unknown errors and infers validation codes', () => {
    const envelope = makeErrorEnvelope(new Error('validation failed'), 'validate');
    expect(envelope.code).toBe(DCECErrorCode.VALIDATION_ERROR);
    expect(envelope.recoverable).toBe(true);
  });

  it('wraps async calls', async () => {
    await expect(safeDcecCallAsync('prove', async () => 'proved')).resolves.toMatchObject({
      ok: true,
      value: 'proved',
    });
  });

  it('creates reusable wrapper functions', () => {
    const wrapped = withDcecErrorHandling('validate', (text: string) => {
      if (!text) throw new DCECHandledError('empty', DCECErrorCode.VALIDATION_ERROR, text);
      return text.length;
    });
    expect(wrapped('abc')).toMatchObject({ ok: true, value: 3 });
    expect(wrapped('')).toMatchObject({ ok: false, code: DCECErrorCode.VALIDATION_ERROR });
  });
});

// ---------------------------------------------------------------------------
// PORT-177 — dedicated data-driven grammar loader
// ---------------------------------------------------------------------------

describe('PORT-177 GrammarLoader', () => {
  it('loads default English and Portuguese grammars', () => {
    const loader = new GrammarLoader();
    const en = loader.load('en');
    const pt = loader.load('pt');
    expect(en.lexicon.obligation).toContain('must');
    expect(pt.lexicon.obligation).toContain('deve');
    expect(en.parsedRules[0]).toMatchObject({ lhs: 'S', rhs: ['NP', 'VP'] });
  });

  it('loads and validates JSON grammar bundles', () => {
    const loader = new GrammarLoader();
    const grammar = loader.loadFromJson(JSON.stringify({
      language: 'test',
      lexicon: { modal: ['must', 'must'], agent: ['party'] },
      rules: ['S -> Modal Agent'],
      metadata: { source: 'unit' },
    }));
    expect(grammar.lexicon.modal).toEqual(['must']);
    expect(loader.get('test')?.metadata.source).toBe('unit');
    expect(loader.listLanguages()).toContain('test');
  });

  it('rejects invalid grammar rules', () => {
    const loader = new GrammarLoader();
    expect(() => loader.loadFromObject({
      language: 'bad',
      lexicon: { modal: ['must'] },
      rules: ['not a rule'],
      metadata: {},
    })).toThrow(/Invalid grammar rule/);
  });

  it('parses individual grammar rules and exposes singleton loader', () => {
    expect(parseGrammarRule('VP -> Modal Verb NP')).toEqual({
      lhs: 'VP',
      rhs: ['Modal', 'Verb', 'NP'],
      raw: 'VP -> Modal Verb NP',
    });
    expect(getGrammarLoader({ language: 'en' })).toBeInstanceOf(GrammarLoader);
  });
});

// ---------------------------------------------------------------------------
// PORT-185 — dedicated TDFOL expansion-rule module
// ---------------------------------------------------------------------------

describe('PORT-185 TDFOL expansion rules', () => {
  it('expands conjunction as one alpha branch', () => {
    const branches = new AndExpansionRule().expand('P ∧ Q');
    expect(branches).toEqual([{ formulas: ['P', 'Q'] }]);
  });

  it('expands disjunction and implication as beta branches', () => {
    expect(new OrExpansionRule().expand('P ∨ Q')).toEqual([{ formulas: ['P'] }, { formulas: ['Q'] }]);
    expect(new ImpliesExpansionRule().expand('P → Q')).toEqual([{ formulas: ['¬P'] }, { formulas: ['Q'] }]);
  });

  it('expands double negation', () => {
    expect(new NegationExpansionRule().expand('¬¬P')).toEqual([{ formulas: ['P'] }]);
  });

  it('expands temporal always/eventually/until forms', () => {
    const temporal = new TemporalExpansionRule();
    expect(temporal.expand('□P')).toEqual([{ formulas: ['P'] }]);
    expect(temporal.expand('◊P')).toEqual([{ formulas: ['P'] }, { formulas: ['X(◊P)'] }]);
    expect(temporal.expand('P U Q')).toEqual([{ formulas: ['Q'] }, { formulas: ['P', 'X(P U Q)'] }]);
  });

  it('selects and dispatches rules', () => {
    expect(getAllExpansionRules().map(r => r.name)).toContain('temporal-expansion');
    expect(selectExpansionRule('A ∧ B')?.name).toBe('and-expansion');
    expect(expandFormula('A ↔ B')).toEqual([{ formulas: ['A → B', 'B → A'] }]);
    expect(expandFormula('Atom')).toEqual([{ formulas: ['Atom'] }]);
  });
});
