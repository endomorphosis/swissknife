/**
 * wasm-prover-sprint33.test.ts
 *
 * Sprint 33: Deontic Logic Converter + Symbolic Logic Primitives + FOL Syntax Validator
 */

import {
  makeConversionContext, DeonticLogicConverter, ConversionResult,
} from '../../src/services/deontic-logic-converter.js';
import { DeonticOp } from '../../src/services/deontic-query-engine.js';
import {
  analyzeLogicalStructure, AVAILABLE_PRIMITIVES, getAvailablePrimitives,
  createLogicSymbol, getPrimitive,
} from '../../src/services/symbolic-logic-primitives.js';
import {
  validateFolInput, FOLOutput, FOLSyntaxValidator,
  makeValidationContext,
} from '../../src/services/fol-syntax-validator.js';

const LEGAL_TEXT =
  'The contractor shall deliver the goods within 30 days. ' +
  'The client may reject non-conforming goods upon inspection. ' +
  'No party shall not disclose confidential information to third parties. ' +
  'The agency must file the report before the deadline.';

// ---------------------------------------------------------------------------
// ConversionContext
// ---------------------------------------------------------------------------

describe('makeConversionContext', () => {
  test('creates context with defaults', () => {
    const ctx = makeConversionContext('/docs/contract.txt');
    expect(ctx.sourceDocumentPath).toBe('/docs/contract.txt');
    expect(ctx.confidenceThreshold).toBe(0.5);
    expect(ctx.enableTemporalAnalysis).toBe(true);
    expect(ctx.enableAgentInference).toBe(true);
  });

  test('toDict serializes all fields', () => {
    const ctx = makeConversionContext('/doc.txt', { documentTitle: 'Contract', jurisdiction: 'US' });
    const d = ctx.toDict();
    expect(d['document_title']).toBe('Contract');
    expect(d['jurisdiction']).toBe('US');
  });
});

// ---------------------------------------------------------------------------
// DeonticLogicConverter
// ---------------------------------------------------------------------------

describe('DeonticLogicConverter', () => {
  const converter = new DeonticLogicConverter();

  test('convert returns ConversionResult', () => {
    const result = converter.convert(LEGAL_TEXT);
    expect(result).toBeInstanceOf(ConversionResult);
  });

  test('detects obligation formulas', () => {
    const result = converter.convert(LEGAL_TEXT);
    const obligations = result.deonticFormulas.filter(f => f.operator === DeonticOp.OBLIGATION);
    expect(obligations.length).toBeGreaterThan(0);
  });

  test('detects prohibition formulas', () => {
    const result = converter.convert(LEGAL_TEXT);
    const prohibitions = result.deonticFormulas.filter(f => f.operator === DeonticOp.PROHIBITION);
    expect(prohibitions.length).toBeGreaterThan(0);
  });

  test('detects permission formulas', () => {
    const result = converter.convert('The client may inspect the goods.');
    const permissions = result.deonticFormulas.filter(f => f.operator === DeonticOp.PERMISSION);
    expect(permissions.length).toBeGreaterThan(0);
  });

  test('statistics reflects formula counts', () => {
    const result = converter.convert(LEGAL_TEXT);
    expect(result.statistics['total_formulas']).toBe(result.deonticFormulas.length);
  });

  test('ruleSet contains all formulas', () => {
    const result = converter.convert(LEGAL_TEXT);
    expect(result.ruleSet.formulas).toHaveLength(result.deonticFormulas.length);
  });

  test('toDict is JSON-serialisable', () => {
    const result = converter.convert(LEGAL_TEXT);
    expect(() => JSON.stringify(result.toDict())).not.toThrow();
  });

  test('empty text returns errors', () => {
    const result = converter.convert('');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.success).toBe(false);
  });

  test('convertEntities wraps typed entities', () => {
    const entities = [
      { type: 'obligation', name: 'Contractor', action: 'Deliver' },
      { type: 'prohibition', name: 'Agent', action: 'Disclose' },
    ];
    const result = converter.convertEntities(entities);
    expect(result.deonticFormulas).toHaveLength(2);
    expect(result.deonticFormulas[0].operator).toBe(DeonticOp.OBLIGATION);
    expect(result.deonticFormulas[1].operator).toBe(DeonticOp.PROHIBITION);
  });
});

// ---------------------------------------------------------------------------
// analyzeLogicalStructure
// ---------------------------------------------------------------------------

describe('analyzeLogicalStructure', () => {
  test('detects universal quantifier', () => {
    const s = analyzeLogicalStructure('∀x. P(x) → Q(x)');
    expect(s.quantifiers).toContain('∀');
  });

  test('detects existential quantifier', () => {
    const s = analyzeLogicalStructure('∃x. P(x)');
    expect(s.quantifiers).toContain('∃');
  });

  test('detects conjunction connective', () => {
    const s = analyzeLogicalStructure('P(x) ∧ Q(x)');
    expect(s.connectives).toContain('∧');
  });

  test('detects deontic obligation operator', () => {
    const s = analyzeLogicalStructure('O(Pay)');
    expect(s.operators).toContain('O');
  });

  test('extracts predicates from formula', () => {
    const s = analyzeLogicalStructure('Person(x) → Citizen(x)');
    expect(s.predicates).toContain('Person');
    expect(s.predicates).toContain('Citizen');
  });

  test('confidence is in [0,1]', () => {
    const s = analyzeLogicalStructure('P → Q');
    expect(s.confidence).toBeGreaterThanOrEqual(0);
    expect(s.confidence).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// AVAILABLE_PRIMITIVES
// ---------------------------------------------------------------------------

describe('AVAILABLE_PRIMITIVES', () => {
  test('contains at least 10 primitives', () => {
    expect(AVAILABLE_PRIMITIVES.size).toBeGreaterThanOrEqual(10);
  });

  test('and primitive applies correctly', () => {
    const prim = getPrimitive('and')!;
    expect(prim.apply(['P', 'Q'])).toBe('(P ∧ Q)');
  });

  test('not primitive applies correctly', () => {
    const prim = getPrimitive('not')!;
    expect(prim.apply(['P'])).toBe('¬P');
  });

  test('getAvailablePrimitives returns sorted array', () => {
    const names = getAvailablePrimitives();
    expect(Array.isArray(names)).toBe(true);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual([...names].sort());
  });
});

// ---------------------------------------------------------------------------
// createLogicSymbol
// ---------------------------------------------------------------------------

describe('createLogicSymbol', () => {
  test('creates symbol with structure', () => {
    const sym = createLogicSymbol('∀x. P(x) → Q(x)');
    expect(sym.text).toBe('∀x. P(x) → Q(x)');
    expect(sym.structure).toBeDefined();
    expect(sym.structure.quantifiers).toContain('∀');
  });

  test('apply uses named primitive', () => {
    const sym = createLogicSymbol('P(x)');
    const result = sym.apply('not');
    expect(result).toBe('¬P(x)');
  });

  test('toFol symbolic is default', () => {
    const sym = createLogicSymbol('P(x)');
    const fol = sym.toFol();
    expect(typeof fol).toBe('string');
    expect(fol.length).toBeGreaterThan(0);
  });

  test('toFol prolog format', () => {
    const sym = createLogicSymbol('P(x)');
    expect(sym.toFol('prolog')).toContain('.');
  });
});

// ---------------------------------------------------------------------------
// validateFolInput
// ---------------------------------------------------------------------------

describe('validateFolInput', () => {
  test('creates FOLInput with defaults', () => {
    const inp = validateFolInput('P(x) → Q(x)');
    expect(inp.text).toBe('P(x) → Q(x)');
    expect(inp.confidenceThreshold).toBe(0.7);
    expect(inp.outputFormat).toBe('symbolic');
  });

  test('throws for empty text', () => {
    expect(() => validateFolInput('')).toThrow();
  });

  test('throws for invalid confidence', () => {
    expect(() => validateFolInput('P', { confidenceThreshold: 1.5 })).toThrow();
  });

  test('throws for invalid format', () => {
    expect(() => validateFolInput('P', { outputFormat: 'invalid' as never })).toThrow();
  });

  test('accepts prolog format', () => {
    const inp = validateFolInput('P(x)', { outputFormat: 'prolog' });
    expect(inp.outputFormat).toBe('prolog');
  });
});

// ---------------------------------------------------------------------------
// FOLSyntaxValidator
// ---------------------------------------------------------------------------

describe('FOLSyntaxValidator', () => {
  const validator = new FOLSyntaxValidator();

  test('validates balanced parentheses', () => {
    const result = validator.validate('P(x) ∧ Q(x)');
    expect(result.isValid).toBe(true);
  });

  test('rejects unbalanced parentheses', () => {
    const result = validator.validate('P(x ∧ Q(x)');
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('extracts predicates', () => {
    const result = validator.validate('Person(x) → Citizen(x)');
    expect(result.predicates).toContain('Person');
    expect(result.predicates).toContain('Citizen');
  });

  test('identifies free variables', () => {
    const result = validator.validate('P(x)');
    expect(result.freeVariables).toContain('x');
  });

  test('normalizes multiple spaces', () => {
    const result = validator.validate('P(x)   ∧   Q(y)');
    expect(result.normalizedFormula).toBe('P(x) ∧ Q(y)');
  });

  test('convert produces FOLOutput', () => {
    const input = validateFolInput('P(x) → Q(x)');
    const output = validator.convert(input);
    expect(output).toBeInstanceOf(FOLOutput);
    expect(output.isValid).toBe(true);
  });

  test('FOLOutput.toDict is JSON-safe', () => {
    const input = validateFolInput('P(x)');
    const output = validator.convert(input);
    expect(() => JSON.stringify(output.toDict())).not.toThrow();
  });
});
