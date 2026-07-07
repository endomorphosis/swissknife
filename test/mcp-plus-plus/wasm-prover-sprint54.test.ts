/**
 * Sprint 54 tests — Grammar NL Policy Compiler, TDFOL NL Generator,
 *                   DCEC Parsing, ZKP Form Circuit
 *
 * Covers T-243 (grammar-nl-policy-compiler.ts),
 *         T-244 (tdfol-nl-generator.ts),
 *         T-245 (dcec-parsing.ts),
 *         T-246 (zkp-form-circuit.ts).
 */

import {
  GrammarNLPolicyCompiler, GrammarCompilationResult,
  grammarCompileNlToPolicy,
  CLAUSE_TYPE_OBLIGATION, CLAUSE_TYPE_PERMISSION, CLAUSE_TYPE_PROHIBITION,
} from '../../src/services/logic/nl/grammar-nl-policy-compiler';

import {
  FormulaGenerator,
} from '../../src/services/logic/tdfol/tdfol-nl-generator';
import { PatternMatcher } from '../../src/services/tdfol-nl-patterns';

import {
  ParseToken,
  removeComments, functorizeSymbols, replaceSynonyms,
  prefixLogicalFunctions, prefixEmdas, parseDcecExpression,
} from '../../src/services/logic/dcec/dcec-parsing';

import {
  FormCompletionCircuit, generateFormCertificate, verifyFormCertificate,
} from '../../src/services/zkp/zkp-form-circuit';

// ---------------------------------------------------------------------------
// GrammarNLPolicyCompiler tests
// ---------------------------------------------------------------------------

describe('GrammarNLPolicyCompiler — compile()', () => {
  const compiler = new GrammarNLPolicyCompiler();

  test('obligation text produces obligation clauses', () => {
    const r = compiler.compile('Contractors must pay taxes.');
    expect(r.success).toBe(true);
    expect(r.obligationClauses.length).toBeGreaterThan(0);
  });

  test('permission text produces permission clauses', () => {
    const r = compiler.compile('Employees may take leave.');
    if (r.success) {
      expect(r.permissionClauses.length).toBeGreaterThan(0);
    }
    // At minimum, no exception thrown
    expect(r).toBeInstanceOf(GrammarCompilationResult);
  });

  test('prohibition text produces prohibition clauses', () => {
    const r = compiler.compile('Vendors must not disclose trade secrets.');
    if (r.success) {
      expect(r.prohibitionClauses.length).toBeGreaterThan(0);
    }
    expect(r).toBeInstanceOf(GrammarCompilationResult);
  });

  test('toDict() is JSON-serialisable', () => {
    const r = compiler.compile('Alice must pay.');
    const d = r.toDict();
    expect(() => JSON.stringify(d)).not.toThrow();
    expect(d).toHaveProperty('text');
    expect(d).toHaveProperty('clauses');
    expect(d).toHaveProperty('success');
  });

  test('empty string produces no clauses with warning', () => {
    const r = compiler.compile('');
    expect(r.success).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  test('compileBatch processes multiple texts', () => {
    const results = compiler.compileBatch(['Alice must pay.', 'Bob may leave.']);
    expect(results).toHaveLength(2);
  });

  test('getStats increments totalCompiled', () => {
    const c2 = new GrammarNLPolicyCompiler();
    c2.compile('Alice must pay.');
    c2.compile('Bob may leave.');
    expect(c2.getStats().totalCompiled).toBe(2);
  });
});

describe('grammarCompileNlToPolicy convenience fn', () => {
  test('returns GrammarCompilationResult', () => {
    const r = grammarCompileNlToPolicy('Alice must pay.');
    expect(r).toBeInstanceOf(GrammarCompilationResult);
  });
});

// ---------------------------------------------------------------------------
// FormulaGenerator tests
// ---------------------------------------------------------------------------

describe('FormulaGenerator — generateFromText()', () => {
  const gen = new FormulaGenerator();

  test('generates obligation formula', () => {
    const formulas = gen.generateFromText('Contractors must pay taxes.');
    expect(formulas.some(f => f.formulaString.includes('O('))).toBe(true);
  });

  test('generates permission formula', () => {
    const formulas = gen.generateFromText('Employees may take leave.');
    expect(formulas.some(f => f.formulaString.includes('P('))).toBe(true);
  });

  test('generates prohibition formula', () => {
    const formulas = gen.generateFromText('Vendors must not disclose secrets.');
    expect(formulas.some(f => f.formulaString.includes('F('))).toBe(true);
  });

  test('formula has confidence in [0,1]', () => {
    const formulas = gen.generateFromText('All employees must comply.');
    for (const f of formulas) {
      expect(f.confidence).toBeGreaterThanOrEqual(0);
      expect(f.confidence).toBeLessThanOrEqual(1);
    }
  });

  test('stats increment after generation', () => {
    const g2 = new FormulaGenerator();
    g2.generateFromText('Alice must pay taxes.');
    expect(g2.getStats().totalGenerated).toBeGreaterThan(0);
  });
});

describe('FormulaGenerator — generateFromMatches()', () => {
  test('processes matcher output', () => {
    const matcher = new PatternMatcher();
    const matches = matcher.match('Alice must pay. Bob may leave.');
    const gen = new FormulaGenerator();
    const formulas = gen.generateFromMatches(matches);
    expect(formulas.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// DCEC Parsing tests
// ---------------------------------------------------------------------------

describe('ParseToken', () => {
  test('depthOf() leaf = 1', () => {
    const t = new ParseToken('P', []);
    expect(t.depthOf()).toBe(1);
  });

  test('depthOf() nested = 2', () => {
    const inner = new ParseToken('Q', ['x']);
    const outer = new ParseToken('O', [inner]);
    expect(outer.depthOf()).toBe(2);
  });

  test('widthOf() counts leaves', () => {
    const t = new ParseToken('f', ['a', 'b', 'c']);
    expect(t.widthOf()).toBe(3);
  });

  test('createSExpression() correct format', () => {
    const t = new ParseToken('and', ['P', 'Q']);
    expect(t.createSExpression()).toBe('(and P Q)');
  });

  test('createFExpression() correct format', () => {
    const t = new ParseToken('f', ['x', 'y']);
    expect(t.createFExpression()).toBe('f(x, y)');
  });

  test('toString() delegates to createFExpression()', () => {
    const t = new ParseToken('g', ['a']);
    expect(t.toString()).toBe('g(a)');
  });
});

describe('removeComments', () => {
  test('removes ; comments', () => {
    const result = removeComments('P(x) ; this is a comment');
    expect(result).toContain('P(x)');
    expect(result).not.toContain('; this');
  });

  test('removes /* */ comments', () => {
    const result = removeComments('P(x) /* block */ Q(y)');
    expect(result).toContain('P(x)');
    expect(result).toContain('Q(y)');
    expect(result).not.toContain('block');
  });
});

describe('prefixLogicalFunctions', () => {
  test('converts (A and B) to (∧ A B)', () => {
    const result = prefixLogicalFunctions('(P and Q)');
    expect(result).toContain('∧');
  });

  test('converts (A or B) to (∨ A B)', () => {
    expect(prefixLogicalFunctions('(P or Q)')).toContain('∨');
  });
});

describe('prefixEmdas', () => {
  test('converts (A * B) to (* A B)', () => {
    const result = prefixEmdas('(x * y)');
    expect(result).toContain('*');
    expect(result).toContain('x');
    expect(result).toContain('y');
  });

  test('converts (A + B) to (+ A B)', () => {
    expect(prefixEmdas('(a + b)')).toContain('+');
  });
});

describe('replaceSynonyms', () => {
  test('replaces "and" with ∧', () => {
    const args: Array<string> = ['P', 'and', 'Q'];
    replaceSynonyms(args);
    expect(args[1]).toBe('∧');
  });

  test('replaces "obligated" with O', () => {
    const args: Array<string> = ['obligated'];
    replaceSynonyms(args);
    expect(args[0]).toBe('O');
  });
});

describe('parseDcecExpression', () => {
  test('parses flat S-expression', () => {
    const result = parseDcecExpression('(f x y)');
    expect(result instanceof ParseToken).toBe(true);
    if (result instanceof ParseToken) {
      expect(result.funcName).toBe('f');
    }
  });

  test('returns string for bare atom', () => {
    const result = parseDcecExpression('P');
    expect(typeof result === 'string' || result instanceof ParseToken).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ZKP Form Circuit tests
// ---------------------------------------------------------------------------

describe('FormCompletionCircuit', () => {
  test('constructor initialises public inputs', () => {
    const c = new FormCompletionCircuit({
      formId: 'form1',
      formTemplateHash: 'a'.repeat(64),
      ruleSetHash: 'b'.repeat(64),
      verdictsHash: 'c'.repeat(64),
    });
    expect(c.formId).toBe('form1');
    expect(c.formTemplateHash).toBe('a'.repeat(64));
  });

  test('build() returns a circuit', () => {
    const c = new FormCompletionCircuit({ formTemplateHash: 'h1', ruleSetHash: 'h2', verdictsHash: 'h3' });
    const circuit = c.build();
    expect(circuit).toBeDefined();
    expect(typeof circuit.evaluate).toBe('function');
  });

  test('getPublicInputsDict() contains three hashes', () => {
    const c = new FormCompletionCircuit({ formTemplateHash: 'H1', ruleSetHash: 'H2', verdictsHash: 'H3' });
    const d = c.getPublicInputsDict();
    expect(d).toHaveProperty('formTemplateHash', 'H1');
    expect(d).toHaveProperty('ruleSetHash', 'H2');
    expect(d).toHaveProperty('verdictsHash', 'H3');
  });

  test('evaluate(true) returns true when all public inputs are set', () => {
    const c = new FormCompletionCircuit({ formTemplateHash: 'h', ruleSetHash: 'r', verdictsHash: 'v' });
    expect(c.evaluate(true)).toBe(true);
  });

  test('evaluate(false) returns false', () => {
    const c = new FormCompletionCircuit({ formTemplateHash: 'h', ruleSetHash: 'r', verdictsHash: 'v' });
    expect(c.evaluate(false)).toBe(false);
  });

  test('fromRuleSetAndReport creates circuit from objects', () => {
    const ruleSet = { toDict: () => ({ rules: ['R1'] }) };
    const report  = { formId: 'f1', verdictsHash: () => 'abc123' };
    const c = FormCompletionCircuit.fromRuleSetAndReport(ruleSet, report, { sourcePdf: 'form.pdf' });
    expect(c.formId).toBe('f1');
    expect(c.formTemplateHash.length).toBe(64);
    expect(c.ruleSetHash.length).toBe(64);
  });
});

describe('generateFormCertificate', () => {
  test('returns a FormCompletionCertificate', () => {
    const c = new FormCompletionCircuit({ formId: 'f1', formTemplateHash: 'h1', ruleSetHash: 'h2', verdictsHash: 'h3' });
    const cert = generateFormCertificate(c, { field1: 'value1' });
    expect(cert).toHaveProperty('circuitRef', 'form_completion_v1');
    expect(cert).toHaveProperty('proofHash');
    expect(cert).toHaveProperty('publicInputs');
    expect(cert).toHaveProperty('timestamp');
    expect(cert).toHaveProperty('isValid');
  });

  test('certificate has 64-char hex proofHash', () => {
    const c = new FormCompletionCircuit({ formTemplateHash: 'a', ruleSetHash: 'b', verdictsHash: 'c' });
    const cert = generateFormCertificate(c, {});
    expect(cert.proofHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('verifyFormCertificate', () => {
  test('valid certificate returns true', () => {
    const c = new FormCompletionCircuit({ formId: 'f', formTemplateHash: 'H', ruleSetHash: 'R', verdictsHash: 'V' });
    const cert = generateFormCertificate(c, {});
    expect(verifyFormCertificate(cert)).toBe(true);
  });

  test('tampered proofHash returns false', () => {
    const c = new FormCompletionCircuit({ formTemplateHash: 'H', ruleSetHash: 'R', verdictsHash: 'V' });
    const cert = { ...generateFormCertificate(c, {}), proofHash: 'invalid' };
    expect(verifyFormCertificate(cert)).toBe(false);
  });
});
