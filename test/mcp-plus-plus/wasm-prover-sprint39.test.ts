/**
 * wasm-prover-sprint39.test.ts
 *
 * Sprint 39: Reasoning Coordinator + Deontic Conflict Detector + Interactive FOL Constructor
 */

import {
  ReasoningStrategy, CoordinatedResult, NeuralSymbolicCoordinator,
} from '../../src/services/reasoning-coordinator.js';
import {
  DeonticConflictType, ConflictDetector, DeonticConflictMixin,
  LocalDeonticStatement,
} from '../../src/services/deontic-conflict-detector.js';
import {
  InteractiveFOLConstructor,
} from '../../src/services/interactive-fol-constructor.js';

// ---------------------------------------------------------------------------
// ReasoningStrategy + CoordinatedResult
// ---------------------------------------------------------------------------

describe('ReasoningStrategy', () => {
  test('has 4 values', () => {
    expect(Object.values(ReasoningStrategy)).toHaveLength(4);
  });
});

describe('CoordinatedResult', () => {
  test('constructs with valid confidence', () => {
    const r = new CoordinatedResult({ isProved: true, confidence: 0.9 });
    expect(r.isProved).toBe(true);
    expect(r.confidence).toBeCloseTo(0.9);
  });

  test('throws for confidence out of range', () => {
    expect(() => new CoordinatedResult({ isProved: false, confidence: 1.5 })).toThrow();
    expect(() => new CoordinatedResult({ isProved: false, confidence: -0.1 })).toThrow();
  });

  test('toDict is JSON-safe', () => {
    const r = new CoordinatedResult({ isProved: false, confidence: 0.2, strategyUsed: ReasoningStrategy.HYBRID });
    expect(() => JSON.stringify(r.toDict())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// NeuralSymbolicCoordinator
// ---------------------------------------------------------------------------

describe('NeuralSymbolicCoordinator', () => {
  const coord = new NeuralSymbolicCoordinator();

  test('coordinate returns CoordinatedResult', () => {
    const result = coord.coordinate('O(Pay)');
    expect(result).toBeInstanceOf(CoordinatedResult);
  });

  test('deontic formula auto-selects symbolic strategy', () => {
    const result = coord.coordinate('O(RegisterVehicle)');
    expect(result.strategyUsed).toBe(ReasoningStrategy.SYMBOLIC_ONLY);
    expect(result.isProved).toBe(true);
  });

  test('event-calculus formula auto-selects symbolic', () => {
    const result = coord.coordinate('HoldsAt(Obligation, t)');
    expect(result.isProved).toBe(true);
  });

  test('symbolic_only strategy used when forced', () => {
    const result = coord.coordinate('P(Inspect)', ReasoningStrategy.SYMBOLIC_ONLY);
    expect(result.strategyUsed).toBe(ReasoningStrategy.SYMBOLIC_ONLY);
  });

  test('neural_only strategy returns confidence', () => {
    const result = coord.coordinate('Some complex formula', ReasoningStrategy.NEURAL_ONLY);
    expect(result.strategyUsed).toBe(ReasoningStrategy.NEURAL_ONLY);
    expect(result.neuralConfidence).not.toBeNull();
  });

  test('hybrid strategy uses both signals', () => {
    const result = coord.coordinate('O(Act)', ReasoningStrategy.HYBRID);
    expect(result.strategyUsed).toBe(ReasoningStrategy.HYBRID);
    expect(result.symbolicConfidence).not.toBeNull();
    expect(result.neuralConfidence).not.toBeNull();
  });

  test('reasoningPath is non-empty', () => {
    const result = coord.coordinate('O(Pay)');
    expect(result.reasoningPath.length).toBeGreaterThan(0);
  });

  test('getStats tracks coordinations', () => {
    const c = new NeuralSymbolicCoordinator();
    c.coordinate('O(A)');
    c.coordinate('P(B)');
    expect(c.getStats()['coordinations']).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// ConflictDetector
// ---------------------------------------------------------------------------

function makeStmt(operator: 'O' | 'P' | 'F', action: string, agent = 'Agent', id?: string): LocalDeonticStatement {
  return { operator, action, agent, conditions: [], sourceText: action, statementId: id ?? `${operator}:${action}` };
}

function makeStmtFromProposition(operator: 'O' | 'P' | 'F', proposition: string, agent = 'Agent', id?: string): LocalDeonticStatement {
  return { operator, proposition, agent, conditions: [], sourceText: proposition, statementId: id ?? `${operator}:${proposition}` };
}

describe('ConflictDetector', () => {
  const detector = new ConflictDetector();

  test('detectConflicts returns empty for no conflict', () => {
    const stmts = [makeStmt('O', 'pay fees'), makeStmt('P', 'inspect goods')];
    expect(detector.detectConflicts(stmts)).toHaveLength(0);
  });

  test('detectConflicts finds O/F conflict', () => {
    const stmts = [makeStmt('O', 'deliver goods'), makeStmt('F', 'deliver goods')];
    const conflicts = detector.detectConflicts(stmts);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].conflictType).toBe(DeonticConflictType.OBLIGATION_PROHIBITION);
    expect(conflicts[0].severity).toBe('critical');
  });

  test('detectConflicts finds P/F conflict', () => {
    const stmts = [makeStmt('P', 'disclose info'), makeStmt('F', 'disclose info')];
    const conflicts = detector.detectConflicts(stmts);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].conflictType).toBe(DeonticConflictType.PERMISSION_PROHIBITION);
  });

  test('detectConflicts uses proposition alias when action is absent', () => {
    const stmts = [
      makeStmtFromProposition('O', 'deliver goods'),
      makeStmtFromProposition('F', 'deliver goods'),
    ];
    const conflicts = detector.detectConflicts(stmts);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].conflictType).toBe(DeonticConflictType.OBLIGATION_PROHIBITION);
    expect(conflicts[0].explanation).toContain('deliver goods');
  });

  test('summarize counts by severity', () => {
    const stmts = [makeStmt('O', 'deliver goods'), makeStmt('F', 'deliver goods')];
    const conflicts = detector.detectConflicts(stmts);
    const summary = detector.summarize(conflicts);
    expect(summary['total']).toBeGreaterThan(0);
    expect(typeof summary['critical']).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// DeonticConflictMixin
// ---------------------------------------------------------------------------

describe('DeonticConflictMixin', () => {
  test('wouldConflict detects new conflict', () => {
    const mixin = new DeonticConflictMixin();
    const existing = [makeStmt('F', 'deliver goods', 'Agent', 's1')];
    const proposed = makeStmt('O', 'deliver goods', 'Agent', 's2');
    const conflicts = mixin.wouldConflict(proposed, existing);
    expect(conflicts.length).toBeGreaterThan(0);
  });

  test('wouldConflict supports proposition-only statements', () => {
    const mixin = new DeonticConflictMixin();
    const existing = [makeStmtFromProposition('F', 'deliver goods', 'Agent', 's1')];
    const proposed = makeStmtFromProposition('O', 'deliver goods', 'Agent', 's2');
    const conflicts = mixin.wouldConflict(proposed, existing);
    expect(conflicts.length).toBeGreaterThan(0);
  });

  test('conflictScore 0 for no conflicts', () => {
    const mixin = new DeonticConflictMixin();
    const stmts = [makeStmt('O', 'pay fees'), makeStmt('P', 'inspect')];
    expect(mixin.conflictScore(stmts)).toBe(0);
  });

  test('conflictScore > 0 for conflicts', () => {
    const mixin = new DeonticConflictMixin();
    const stmts = [makeStmt('O', 'deliver goods'), makeStmt('F', 'deliver goods')];
    expect(mixin.conflictScore(stmts)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// InteractiveFOLConstructor
// ---------------------------------------------------------------------------

describe('InteractiveFOLConstructor', () => {
  test('addStatement returns StatementAnalysis', () => {
    const c = new InteractiveFOLConstructor();
    const analysis = c.addStatement('The contractor must deliver the goods.');
    expect(analysis).toHaveProperty('operator');
    expect(analysis).toHaveProperty('formula');
    expect(analysis).toHaveProperty('confidence');
  });

  test('addStatement detects obligation', () => {
    const c = new InteractiveFOLConstructor();
    const a = c.addStatement('All parties must sign the contract.');
    expect(a.operator).toBe('O');
    expect(a.formula).toContain('O(');
  });

  test('addStatement detects prohibition', () => {
    const c = new InteractiveFOLConstructor();
    const a = c.addStatement('No party shall not disclose.');
    expect(a.operator).toBe('F');
  });

  test('addStatement detects permission', () => {
    const c = new InteractiveFOLConstructor();
    const a = c.addStatement('The client may inspect the goods.');
    expect(a.operator).toBe('P');
  });

  test('statementCount increments', () => {
    const c = new InteractiveFOLConstructor();
    c.addStatement('Must pay.');
    c.addStatement('May inspect.');
    expect(c.statementCount).toBe(2);
  });

  test('buildFormula joins with ∧', () => {
    const c = new InteractiveFOLConstructor();
    c.addStatement('Must pay.');
    c.addStatement('May inspect.');
    const f = c.buildFormula('∧');
    expect(f).toContain('∧');
  });

  test('checkConsistency returns ConsistencyCheckResult', () => {
    const c = new InteractiveFOLConstructor();
    c.addStatement('Must pay fees.');
    const result = c.checkConsistency();
    expect(result).toHaveProperty('isConsistent');
    expect(result).toHaveProperty('score');
  });

  test('getSession returns session snapshot', () => {
    const c = new InteractiveFOLConstructor({ domain: 'legal' });
    c.addStatement('Must pay.');
    const session = c.getSession();
    expect(session.domain).toBe('legal');
    expect(session.statements).toHaveLength(1);
  });

  test('reset clears session', () => {
    const c = new InteractiveFOLConstructor();
    c.addStatement('Must pay.');
    c.reset();
    expect(c.statementCount).toBe(0);
  });

  test('exportFormulas is JSON-safe', () => {
    const c = new InteractiveFOLConstructor();
    c.addStatement('Must pay fees.');
    expect(() => JSON.stringify(c.exportFormulas())).not.toThrow();
  });
});
