/**
 * wasm-prover-sprint86.test.ts
 * Tests for §12.20 TPTP/problem parsing and FOL exporter residual closure.
 */

import {
  createTptpProblem,
  extractTptpProofSteps,
  formulaToTptp,
  parseSzsStatus,
  parseTptpFormulas,
  parseTptpProblem,
} from '../../src/services/provers/tptp-problem.js';
import {
  convertFolToProlog,
  convertFolToTptp,
  convertFolToTptpCnf,
  exportFolFormula,
  toPrefixNotation,
} from '../../src/services/logic/fol/fol-exporters.js';

// ---------------------------------------------------------------------------
// PORT-172 — TPTP emit/parse
// ---------------------------------------------------------------------------

describe('PORT-172 TPTP problem utilities', () => {
  it('converts quantified formulas to TPTP body syntax', () => {
    expect(formulaToTptp('forall x. Human(x) -> Mortal(x)')).toBe('! [X] : Human(x) => Mortal(x)');
    expect(formulaToTptp('exists y. Cat(y) AND Cute(y)')).toBe('? [Y] : Cat(y) & Cute(y)');
  });

  it('creates TPTP problems with axiom and conjecture roles', () => {
    const problem = createTptpProblem({
      name: 'hm',
      axioms: [{ name: 'human_mortal', formula: 'forall x. Human(x) -> Mortal(x)' }],
      conjectures: [{ name: 'socrates_mortal', formula: 'Mortal(Socrates)' }],
    });
    expect(problem).toContain('% TPTP problem: hm');
    expect(problem).toContain('fof(human_mortal, axiom,');
    expect(problem).toContain('fof(socrates_mortal, conjecture,');
  });

  it('parses nested fof/cnf declarations and groups roles', () => {
    const text = [
      '% comment ignored by parser',
      'fof(ax1, axiom, (! [X] : (human(X) => mortal(X)))).',
      'cnf(cl1, hypothesis, (~ human(X) | mortal(X))).',
      'fof(goal, conjecture, (mortal(socrates))).',
    ].join('\n');
    const formulas = parseTptpFormulas(text);
    expect(formulas).toHaveLength(3);
    expect(formulas[0]).toMatchObject({ kind: 'fof', name: 'ax1', role: 'axiom' });
    const problem = parseTptpProblem(text, 'parsed');
    expect(problem.axioms).toHaveLength(2);
    expect(problem.conjectures).toHaveLength(1);
  });

  it('extracts SZS status and proof step lines', () => {
    const output = [
      '% SZS status Theorem for problem',
      '% SZS output start CNFRefutation',
      'fof(step1, plain, (p), inference(input, [], [])).',
      '% SZS output end CNFRefutation',
    ].join('\n');
    expect(parseSzsStatus(output)).toBe('Theorem');
    expect(extractTptpProofSteps(output)).toEqual(expect.arrayContaining([
      '% SZS output start CNFRefutation',
      'fof(step1, plain, (p), inference(input, [], [])).',
    ]));
  });
});

// ---------------------------------------------------------------------------
// PORT-173 — FOL Prolog/TPTP exporters
// ---------------------------------------------------------------------------

describe('PORT-173 FOL exporters', () => {
  const formula = 'forall x. Human(x) -> Mortal(x)';

  it('exports implication formulas to Prolog rules', () => {
    expect(convertFolToProlog(formula)).toBe('mortal(X) :- human(X).');
  });

  it('exports formulas to TPTP fof declarations', () => {
    expect(convertFolToTptp(formula, { name: 'human_mortal', role: 'axiom' }))
      .toBe('fof(human_mortal, axiom, (! [X] : Human(x) => Mortal(x))).');
  });

  it('exports implication formulas to TPTP cnf clauses', () => {
    expect(convertFolToTptpCnf(formula, { name: 'human_mortal_clause' }))
      .toBe('cnf(human_mortal_clause, axiom, (~ human(X) | mortal(X))).');
  });

  it('exports prefix notation and dispatches by format', () => {
    expect(toPrefixNotation('A AND B -> C')).toBe('(implies (and A B) C)');
    expect(exportFolFormula('Human(x)', 'prolog')).toBe('human(X).');
    expect(exportFolFormula('A -> B', 'prefix')).toBe('(implies A B)');
  });
});
