import {
  convertToPrologFormat,
  convertToTptpFormat,
  extractFolMetadata,
  formatFol,
  parseFolToJson,
} from '../../src/services/fol-utils/logic-formatter';
import {
  parseFol,
  parseLogicalOperators,
  parseQuantifiers,
  validateFolSyntax,
} from '../../src/services/fol-utils/fol-parser';
import {
  extractLogicalRelationsNlp,
  extractPredicatesNlp,
  extractSemanticRoles,
  getExtractionStats,
  getSpacyModel,
} from '../../src/services/fol-utils/nlp-predicate-extractor';
import {
  ChunkedBatchProcessor,
  FOLBatchProcessor,
  LogicBatchResult,
  ProofBatchProcessor,
} from '../../src/services/logic-batch-processing';
import {
  compileExplainIter,
  evaluateWithManager,
} from '../../src/services/logic-api-remainders';

describe('PORT-226 FOL text utilities', () => {
  it('formats FOL into Python-compatible Prolog, TPTP, JSON, and metadata shapes', () => {
    const formula = '∀x (Human(x) → Mortal(x))';

    expect(convertToPrologFormat(formula)).toBe('mortal(X) :- human(X).');
    expect(convertToTptpFormat(formula)).toBe('fof(formula, axiom, ![x]: (Human(x) => Mortal(x))).');
    expect(formatFol(formula, 'prolog')).toMatchObject({
      fol_formula: formula,
      format: 'prolog',
      prolog_form: 'mortal(X) :- human(X).',
      metadata: { quantifier_count: 1, predicate_count: 2, operator_count: 1, max_arity: 1 },
    });
    expect(formatFol(formula, 'json', false)).toMatchObject({
      structured_form: {
        quantifiers: [{ type: 'universal', variable: 'x', symbol: '∀' }],
        predicates: [
          { name: 'Human', arity: 1, arguments: ['x'] },
          { name: 'Mortal', arity: 1, arguments: ['x'] },
        ],
      },
    });
    expect(parseFolToJson('∃x (Cat(x) ∧ Cute(x))')).toMatchObject({
      operators: [{ type: 'conjunction', symbol: '∧' }],
    });
    expect(extractFolMetadata('∀x (A(x) ∧ B(x) → C(x))')).toMatchObject({
      complexity: 'moderate',
      predicate_count: 3,
      operator_count: 2,
    });
  });

  it('parses natural-language FOL cues and validates generated formulas', () => {
    const parsed = parseFol('All humans are mortal.');

    expect(parseQuantifiers('Every person has a duty.')).toMatchObject([
      { type: 'universal', symbol: '∀', scope: 'person' },
    ]);
    expect(parseLogicalOperators('if p then q and r')).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'implication', symbol: '→' }),
      expect.objectContaining({ type: 'conjunction', symbol: '∧' }),
    ]));
    expect(parsed).toMatchObject({
      fol_formula: '∀x (Humans(x) → Mortal(x))',
      validation: { valid: true, errors: [] },
    });
    expect(validateFolSyntax('∀ (P(x)')).toMatchObject({
      valid: false,
      errors: expect.arrayContaining(['Unbalanced parentheses', 'Quantifier missing variable']),
    });
  });

  it('exposes NLP predicate extraction with deterministic regex fallback', () => {
    expect(getSpacyModel()).toBeNull();
    expect(getExtractionStats()).toMatchObject({ spacy_available: false, fallback_mode: true });
    expect(extractPredicatesNlp('Alice must file Report.')).toMatchObject({
      nouns: expect.arrayContaining(['Alice', 'Report']),
      verbs: expect.arrayContaining(['File']),
      entities: [],
    });
    expect(extractLogicalRelationsNlp('If a person files then the clerk records.')).toEqual([
      { type: 'implication', premise: 'a person files', conclusion: 'the clerk records' },
    ]);
    expect(extractSemanticRoles('Alice must file Report.')).toEqual([
      { agent: 'Alice', action: 'file', patient: 'Report', location: null, time: null },
    ]);
  });
});

describe('PORT-232 batch processing and API remainders', () => {
  it('provides Python-shaped batch results and FOL conversion batches', async () => {
    const result = new LogicBatchResult({
      totalItems: 4,
      successful: 3,
      failed: 1,
      totalTime: 2,
      itemsPerSecond: 2,
    });
    expect(result.successRate()).toBe(75);
    expect(result.toDict()).toMatchObject({
      total_items: 4,
      successful: 3,
      failed: 1,
      success_rate: 75,
    });

    const batch = await new FOLBatchProcessor(2).convertBatch(['All cats are animals.', '']);
    expect(batch.successful).toBe(2);
    expect(batch.results[0]).toMatchObject({ fol_formula: '∀x (Cats(x) → Animals(x))' });
    expect(batch.results[1]).toMatchObject({ fol_formula: '⊤' });
  });

  it('supports injected proof workers and chunked large-batch processing', async () => {
    const proof = await new ProofBatchProcessor(2).proveBatch(['P', 'bad'], {
      prover: 'mock',
      proveFormula: formula => {
        if (formula === 'bad') throw new Error('boom');
        return { formula, proved: true };
      },
    });
    expect(proof.successful).toBe(1);
    expect(proof.failed).toBe(1);
    expect(proof.errors[0]).toMatchObject({ index: 1, error: 'boom' });

    const chunked = await new ChunkedBatchProcessor({ chunkSize: 2, maxConcurrency: 1 })
      .processLargeBatch([1, 2, 3], value => value * 2);
    expect(chunked.results).toEqual([2, 4, 6]);
    expect(chunked.toDict()).toMatchObject({ total_items: 3, successful: 3 });
  });

  it('wraps optional manager evaluation and compile explanation generators', () => {
    const calls: unknown[] = [];
    const evaluated = evaluateWithManager('policy-cid', 'tool.read', {
      actor: 'did:example:alice',
      bridge: {
        evaluateAuditedWithManager: (policyCid, options) => {
          calls.push({ policyCid, options });
          return { allowed: true };
        },
      },
    });

    expect(evaluated).toEqual({ allowed: true });
    expect(calls[0]).toMatchObject({
      policyCid: 'policy-cid',
      options: { tool: 'tool.read', actor: 'did:example:alice' },
    });
    expect(evaluateWithManager('policy-cid', 'tool.read')).toBeNull();

    expect(Array.from(compileExplainIter(['A', 'B'], { policyId: 'p1', maxLines: 1 }))).toEqual(['[p1] 1. A']);
    expect(Array.from(compileExplainIter(['A'], {
      compiler: {
        compileExplainIter: function* () {
          yield 'delegate line';
        },
      },
    }))).toEqual(['delegate line']);
  });
});
