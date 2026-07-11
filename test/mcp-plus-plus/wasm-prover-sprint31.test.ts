/**
 * wasm-prover-sprint31.test.ts
 *
 * Sprint 31: Logic Verifier + Translation Core + Legal Symbolic Analyzer
 */

import {
  VerificationResult, makeAxiom, LogicVerifier,
} from '../../src/services/logic/shared/logic-verifier.js';
import {
  LogicTranslationTarget, TranslationResult,
  LeanTranslator, CoqTranslator, SMTTranslator,
  makeAtomicFormula, translateFormula,
} from '../../src/services/logic/shared/logic-translation-core.js';
import {
  LegalDomain, DeonticOperator, LegalSymbolicAnalyzer,
  LegalReasoningEngine, createLegalAnalyzer, createLegalReasoningEngine,
} from '../../src/services/logic/shared/legal-symbolic-analyzer.js';

const LEGAL_TEXT =
  'The contractor shall deliver the goods within 30 days. ' +
  'The client may inspect the goods upon delivery. ' +
  'No party shall not disclose confidential information. ' +
  'The agreement must be signed by both parties before execution.';

// ---------------------------------------------------------------------------
// LogicVerifier
// ---------------------------------------------------------------------------

describe('LogicVerifier', () => {
  test('initializes with built-in axioms', () => {
    const v = new LogicVerifier();
    expect(v.getAxioms().length).toBeGreaterThan(0);
  });

  test('addAxiom adds a new axiom', () => {
    const v = new LogicVerifier({ initBasicAxioms: false });
    const ax = makeAxiom('test_ax', 'P → P', 'Identity', 'user_defined');
    expect(v.addAxiom(ax)).toBe(true);
    expect(v.getAxioms()).toHaveLength(1);
  });

  test('addAxiom returns false for duplicate name', () => {
    const v = new LogicVerifier({ initBasicAxioms: false });
    const ax = makeAxiom('dup', 'P', 'dup', 'user_defined');
    v.addAxiom(ax);
    expect(v.addAxiom(ax)).toBe(false);
  });

  test('removeAxiom removes by name', () => {
    const v = new LogicVerifier({ initBasicAxioms: false });
    v.addAxiom(makeAxiom('my_ax', 'P', 'd'));
    expect(v.removeAxiom('my_ax')).toBe(true);
    expect(v.getAxioms()).toHaveLength(0);
  });

  test('verifyFormula returns ProofResult for built-in axiom', () => {
    const v = new LogicVerifier();
    const axioms = v.getAxioms();
    const result = v.verifyFormula(axioms[0].formula);
    expect(result.proved).toBe(true);
    expect(result.method).toBe('axiom_lookup');
  });

  test('verifyFormula PROVED for axiom', () => {
    const v = new LogicVerifier({ initBasicAxioms: false });
    v.addAxiom(makeAxiom('p_ax', 'P', 'P is true', 'user_defined'));
    const result = v.verifyFormula('P');
    expect(result.proved).toBe(true);
  });

  test('verifyFormula FAILED for unknown formula', () => {
    const v = new LogicVerifier({ initBasicAxioms: false });
    const result = v.verifyFormula('VeryUnknownFormula');
    expect(result.proved).toBe(false);
  });

  test('proofSteps non-empty when proved', () => {
    const v = new LogicVerifier();
    const ax = v.getAxioms()[0];
    const result = v.verifyFormula(ax.formula);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  test('checkConsistency true for non-contradictory set', () => {
    const v = new LogicVerifier();
    const check = v.checkConsistency(['P(x)', 'Q(y)', 'R(z)']);
    expect(check.isConsistent).toBe(true);
  });

  test('checkConsistency false for P and ¬P', () => {
    const v = new LogicVerifier();
    const check = v.checkConsistency(['P(x)', '¬P(x)']);
    expect(check.isConsistent).toBe(false);
    expect(check.conflictingFormulas.length).toBeGreaterThan(0);
  });

  test('checkEntailment returns EntailmentResult', () => {
    const v = new LogicVerifier({ initBasicAxioms: false });
    v.addAxiom(makeAxiom('p', 'P', 'd'));
    const r = v.checkEntailment(['P'], 'P');
    expect(r.entails).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LeanTranslator
// ---------------------------------------------------------------------------

describe('LeanTranslator', () => {
  const translator = new LeanTranslator();

  test('translate returns TranslationResult', () => {
    const result = translator.translate('P → Q');
    expect(result.target).toBe(LogicTranslationTarget.LEAN4);
    expect(result.success).toBe(true);
    expect(result.translatedFormula.length).toBeGreaterThan(0);
  });

  test('translated formula contains theorem keyword', () => {
    const result = translator.translate('P → Q');
    expect(result.translatedFormula).toContain('theorem');
  });

  test('dependencies includes Mathlib', () => {
    const result = translator.translate('P');
    expect(result.dependencies).toContain('Mathlib');
  });

  test('O(φ) translates to Obligatory', () => {
    const result = translator.translate('O(P)');
    expect(result.translatedFormula).toContain('Obligatory');
  });

  test('empty formula returns success=false', () => {
    const result = translator.translate('');
    expect(result.success).toBe(false);
  });

  test('toDict() is serializable', () => {
    const result = translator.translate('P');
    expect(() => JSON.stringify(result.toDict())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// CoqTranslator
// ---------------------------------------------------------------------------

describe('CoqTranslator', () => {
  const translator = new CoqTranslator();

  test('translate returns success=true', () => {
    expect(translator.translate('P ∧ Q').success).toBe(true);
  });

  test('translated formula contains Theorem keyword', () => {
    expect(translator.translate('P').translatedFormula).toContain('Theorem');
  });

  test('∧ translated to /\\', () => {
    expect(translator.translate('P ∧ Q').translatedFormula).toContain('/\\');
  });
});

// ---------------------------------------------------------------------------
// SMTTranslator
// ---------------------------------------------------------------------------

describe('SMTTranslator', () => {
  const translator = new SMTTranslator();

  test('translate returns success=true', () => {
    expect(translator.translate('P ∨ Q').success).toBe(true);
  });

  test('translated formula contains check-sat', () => {
    expect(translator.translate('P').translatedFormula).toContain('check-sat');
  });
});

// ---------------------------------------------------------------------------
// translateFormula convenience wrapper
// ---------------------------------------------------------------------------

describe('translateFormula', () => {
  test('LEAN4 target', () => {
    const r = translateFormula('P → Q', LogicTranslationTarget.LEAN4);
    expect(r.target).toBe(LogicTranslationTarget.LEAN4);
    expect(r.success).toBe(true);
  });

  test('COQ target', () => {
    const r = translateFormula('P ∧ Q', LogicTranslationTarget.COQ);
    expect(r.target).toBe(LogicTranslationTarget.COQ);
  });

  test('AbstractLogicFormula input', () => {
    const formula = makeAtomicFormula('P → Q', 'propositional');
    const r = translateFormula(formula, LogicTranslationTarget.SMT_LIB2);
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LegalSymbolicAnalyzer
// ---------------------------------------------------------------------------

describe('LegalSymbolicAnalyzer', () => {
  const analyzer = new LegalSymbolicAnalyzer();

  test('analyze returns LegalAnalysisResult', () => {
    const result = analyzer.analyze(LEGAL_TEXT);
    expect(result).toHaveProperty('legalDomain');
    expect(result).toHaveProperty('deonticStatements');
    expect(result).toHaveProperty('primaryParties');
    expect(result).toHaveProperty('confidence');
  });

  test('detects CONTRACT domain', () => {
    const result = analyzer.analyze(LEGAL_TEXT);
    expect(result.legalDomain).toBe(LegalDomain.CONTRACT);
  });

  test('extracts deontic statements', () => {
    const result = analyzer.analyze(LEGAL_TEXT);
    expect(result.deonticStatements.length).toBeGreaterThan(0);
  });

  test('each deontic statement has operator and action', () => {
    const result = analyzer.analyze(LEGAL_TEXT);
    for (const stmt of result.deonticStatements) {
      expect(Object.values(DeonticOperator)).toContain(stmt.operator);
      expect(stmt.action.length).toBeGreaterThan(0);
    }
  });

  test('detects temporal expressions', () => {
    const result = analyzer.analyze(LEGAL_TEXT);
    expect(result.temporalExpressions.length).toBeGreaterThan(0);
  });

  test('confidence > 0 for non-empty text', () => {
    const result = analyzer.analyze(LEGAL_TEXT);
    expect(result.confidence).toBeGreaterThan(0);
  });

  test('empty text returns confidence=0', () => {
    const result = analyzer.analyze('');
    expect(result.confidence).toBe(0);
  });

  test('createLegalAnalyzer factory', () => {
    const a = createLegalAnalyzer();
    expect(a).toBeInstanceOf(LegalSymbolicAnalyzer);
  });
});

// ---------------------------------------------------------------------------
// LegalReasoningEngine
// ---------------------------------------------------------------------------

describe('LegalReasoningEngine', () => {
  const engine = createLegalReasoningEngine();

  test('reason returns ReasoningResult', () => {
    const result = engine.reason('deliver goods', LEGAL_TEXT);
    expect(result).toHaveProperty('query');
    expect(result).toHaveProperty('answer');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('supportingFacts');
  });

  test('answer is a non-empty string', () => {
    const result = engine.reason('sign agreement', LEGAL_TEXT);
    expect(typeof result.answer).toBe('string');
    expect(result.answer.length).toBeGreaterThan(0);
  });
});
