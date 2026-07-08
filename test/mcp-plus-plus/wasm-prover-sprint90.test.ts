/**
 * wasm-prover-sprint90.test.ts
 * Tests for §12.20 NL preprocessing and NL->DCEC compiler residual closure.
 */

import {
  NLContext,
  TDFOLNLPreprocessor,
  preprocessTdfolNaturalLanguage,
} from '../../src/services/tdfol-nl-preprocessor';
import {
  NLToDCECCompiler,
  compileNaturalLanguageToDcec,
} from '../../src/services/nl-to-dcec-compiler';

describe('PORT-186 TDFOL NL preprocessor', () => {
  it('extracts entities, token hints, and temporal expressions', () => {
    const doc = preprocessTdfolNaturalLanguage('Contractor must deliver the report within 30 days.');
    expect(doc.sentences).toHaveLength(1);
    expect(doc.entities.map(entity => entity.text)).toContain('Contractor');
    expect(doc.temporalExpressions[0]).toMatchObject({ text: 'within 30 days', normalized: 'P30D' });
    expect(doc.sentences[0]!.tokens.some(token => token.pos === 'VERB')).toBe(true);
  });

  it('tracks focus and resolves pronouns across sentences', () => {
    const preprocessor = new TDFOLNLPreprocessor();
    const doc = preprocessor.preprocess('Contractor must deliver the report. It may inspect the site.');
    expect(preprocessor.getContext().getFocus()!.text).toBe('Contractor');
    expect(doc.sentences[1]!.resolvedText).toBe('Contractor may inspect the site');
  });

  it('supports explicit context entity lookup and reference resolution', () => {
    const context = new NLContext();
    context.addEntity('Data Controller', 'agent');
    expect(context.getEntity('data controller')!.text).toBe('Data Controller');
    expect(context.resolveReferences('it must notify users')).toBe('Data Controller must notify users');
  });
});

describe('PORT-180 NLToDCECCompiler', () => {
  it('compiles obligation, permission, and prohibition sentences to DCEC clauses', () => {
    const result = compileNaturalLanguageToDcec([
      'Contractor must deliver the report within 30 days.',
      'It may inspect the site.',
      'Vendor shall not disclose data.',
    ].join(' '));

    expect(result.clauses).toHaveLength(3);
    expect(result.formula).toContain('O(contractor, deliver_the_report');
    expect(result.formula).toContain('P(contractor, inspect_the_site)');
    expect(result.formula).toContain('F(vendor, disclose_data)');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('compiles conditional policies with temporal metadata', () => {
    const result = compileNaturalLanguageToDcec('If breach occurs, Controller must notify Users by 2026-08-01.');
    expect(result.clauses[0]).toMatchObject({
      modality: 'obligation',
      actor: 'Controller',
      condition: 'breach occurs',
      temporal: '2026-08-01',
    });
    expect(result.clauses[0]!.dcecFormula).toContain('if_breach_occurs');
    expect(result.clauses[0]!.dcecFormula).toContain('within_2026_08_01');
  });

  it('tracks compiler stats and errors', () => {
    const compiler = new NLToDCECCompiler();
    const ok = compiler.compile('User can download records.');
    const bad = compiler.compile('This sentence has no modal policy.');
    expect(ok.clauses[0]!.operator).toBe('P');
    expect(bad.errors).toContain('No DCEC policy clauses extracted');
    expect(compiler.getStats()).toMatchObject({ totalCompiled: 2, succeeded: 1, failed: 1, totalClauses: 1 });
  });
});
