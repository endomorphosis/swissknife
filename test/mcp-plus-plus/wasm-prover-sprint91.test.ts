/**
 * wasm-prover-sprint91.test.ts
 * Tests for §12.20 enhanced FOL conversion and deontic extraction residuals.
 */

import {
  EnhancedFOLConverter,
  FOLConversionMonitor,
  extractPredicates,
  extractSemanticRoles,
} from '../../src/services/fol/enhanced-fol-converter';
import {
  extractDeonticStatements,
  extractPredicatesFromText,
  parseDeonticFormula,
  serializeDeonticAst,
} from '../../src/services/deontic/deontic-extraction';

describe('PORT-187 EnhancedFOLConverter', () => {
  it('adds predicate extraction and confidence scoring to FOL conversion', () => {
    const result = new EnhancedFOLConverter().convert('All humans are mortal');
    expect(result.formula).toContain('∀x.');
    expect(result.predicates).toEqual(expect.arrayContaining(['humans', 'mortal']));
    expect(result.confidence).toBeGreaterThan(0.85);
    expect(result.features.hasQuantifier).toBe(true);
  });

  it('extracts semantic roles from modal policy text', () => {
    const roles = extractSemanticRoles('Controller must notify the users');
    expect(roles).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'agent', text: 'Controller' }),
      expect.objectContaining({ role: 'action', text: 'notify the users' }),
      expect.objectContaining({ role: 'patient', text: 'users' }),
    ]));
  });

  it('records monitoring statistics across conversions', () => {
    const monitor = new FOLConversionMonitor();
    const converter = new EnhancedFOLConverter(monitor);
    converter.convert('All cats are animals');
    converter.convert('If cat then animal');
    expect(converter.getMonitorStats()).toMatchObject({ totalConversions: 2, failures: 0 });
    expect(converter.getMonitorStats().avgConfidence).toBeGreaterThan(0);
  });

  it('extracts predicates from formulas without counting deontic wrappers', () => {
    expect(extractPredicates('O(pay(alice)) ∧ mortal(Socrates)')).toEqual(['pay', 'mortal']);
  });
});

describe('PORT-189 Deontic extraction utilities', () => {
  it('extracts predicates from formula and simple copular text', () => {
    const predicates = extractPredicatesFromText('owns(alice, car). Alice is liable');
    expect(predicates).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'owns', args: ['alice', 'car'] }),
      expect.objectContaining({ name: 'liable', args: ['Alice'] }),
    ]));
  });

  it('extracts obligation, permission, and prohibition statements by clause', () => {
    const statements = extractDeonticStatements('Controller must notify users. Vendor shall not disclose data; User may inspect records.');
    expect(statements.map(statement => statement.operator)).toEqual(['O', 'F', 'P']);
    expect(statements.find(statement => statement.operator === 'O')).toMatchObject({ actor: 'Controller', action: 'notify users' });
    expect(statements.find(statement => statement.operator === 'F')).toMatchObject({ actor: 'Vendor', action: 'disclose data' });
  });

  it('parses nested deontic formulas with operator precedence', () => {
    const ast = parseDeonticFormula('O(pay(alice)) -> F(disclose(data)) ∧ P(inspect(records))');
    expect(ast.kind).toBe('implies');
    expect(serializeDeonticAst(ast)).toBe('(O(pay(alice)) → (F(disclose(data)) ∧ P(inspect(records))))');
  });

  it('parses negation and nested modal bodies', () => {
    const ast = parseDeonticFormula('¬O(P(inspect(records)))');
    expect(ast.kind).toBe('not');
    expect(serializeDeonticAst(ast)).toBe('¬O(P(inspect(records)))');
  });
});
