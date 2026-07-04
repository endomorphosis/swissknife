/**
 * deontic-query-engine-port141.test.ts
 *
 * Conformance checks for PORT-141 proposition/action parity.
 */

import {
  DeonticOp,
  DeonticQueryEngine,
  makeDeonticFormula,
  makeRuleSet,
} from '../../src/services/deontic-query-engine';
import { DeonticLogicConverter } from '../../src/services/deontic-logic-converter';
import { DocumentConsistencyChecker } from '../../src/services/document-consistency-checker';
import { TemporalDeonticRAGStore } from '../../src/services/temporal-deontic-rag-store';

describe('PORT-141 proposition/action field parity', () => {
  it('serializes proposition and action aliases in toDict()', () => {
    const formula = makeDeonticFormula(DeonticOp.OBLIGATION, 'Agent', 'submit annual report');
    const payload = formula.toDict() as Record<string, unknown>;

    expect(payload.proposition).toBe('submit annual report');
    expect(payload.action).toBe('submit annual report');
  });

  it('detects conflicts using proposition as canonical content', () => {
    const f1 = makeDeonticFormula(DeonticOp.OBLIGATION, 'Company', 'protect customer data');
    const f2 = makeDeonticFormula(DeonticOp.PROHIBITION, 'Company', 'protect customer data');

    const engine = new DeonticQueryEngine(makeRuleSet('policy', [f1, f2]));
    const conflicts = engine.detectConflicts();

    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].explanation.toLowerCase()).toContain('protect customer data');
  });

  it('compliance recommendations preserve proposition text', () => {
    const prohibition = makeDeonticFormula(DeonticOp.PROHIBITION, 'User', 'share private key');
    const engine = new DeonticQueryEngine(makeRuleSet('policy', [prohibition]));

    const result = engine.checkCompliance('share private key', 'User');

    expect(result.isCompliant).toBe(false);
    expect(result.recommendations.join(' ')).toContain('share private key');
  });

  it('converter entity mapping prefers proposition over action', () => {
    const converter = new DeonticLogicConverter();
    const converted = converter.convertEntities([
      { type: 'obligation', name: 'Controller', proposition: 'notify regulator', action: 'legacy action' },
    ]);

    expect(converted.deonticFormulas[0].proposition).toBe('notify regulator');
    expect(converted.deonticFormulas[0].action).toBe('notify regulator');
  });

  it('document consistency conflict reasons use proposition text', () => {
    const checker = new DocumentConsistencyChecker();
    const analysis = checker.analyze('Agent must report incidents. Agent must not report incidents.');

    expect(analysis.isConsistent).toBe(false);
    expect(analysis.consistencyResult?.conflicts[0].reason.toLowerCase()).toContain('report incidents');
  });

  it('theorem factory stores proposition and keeps action alias', () => {
    const theorem = TemporalDeonticRAGStore.makeTheoremFromFormula(
      DeonticOp.OBLIGATION,
      'Agent',
      'submit evidence',
    );
    const payload = theorem.toDict() as Record<string, unknown>;

    expect(payload.formula_proposition).toBe('submit evidence');
    expect(payload.formula_action).toBe('submit evidence');
  });
});
