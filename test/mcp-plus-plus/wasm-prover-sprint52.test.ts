/**
 * Sprint 52 tests — Spanish Parser, CEC Fluents, CEC Types, ZKP Trace Witness
 *
 * Covers T-233 (spanish-parser.ts),
 *         T-234 (cec-fluents.ts),
 *         T-235 (cec-types.ts),
 *         T-236 (zkp-trace.ts).
 */

import {
  SpanishPatternMatcher, SpanishParser,
  getSpanishVerbConjugations, getSpanishArticles, getSpanishDeonticKeywords,
  ES_DEONTIC_OP,
} from '../../src/services/logic/nl/spanish-parser';

import {
  FluentType, PersistenceRule, FluentManager,
} from '../../src/services/logic/cec/cec-fluents';
import { TimePoint } from '../../src/services/logic/cec/event-calculus';

import {
  isFormulaDict, isProofResultDict,
} from '../../src/services/logic/cec/cec-types';

import {
  TDFOLTraceNotDerivableError, TDFOLTraceBoundExceededError, TDFOLTraceSchemaError,
  makeTraceStep, traceStepToDict, stepKindCode,
  buildTdfolV1TraceWitness, validateTdfolV1TraceWitness,
  toNoirTraceFieldInputs, toPublicMetadata,
  theoremHashHex,
  MAX_TRACE_STEPS, CIRCUIT_REF, RULESET_ID,
} from '../../src/services/zkp/zkp-trace';

// ---------------------------------------------------------------------------
// SpanishPatternMatcher tests
// ---------------------------------------------------------------------------

describe('SpanishPatternMatcher — deontic patterns', () => {
  const m = new SpanishPatternMatcher();

  test('detects obligation (debe)', () => {
    const matches = m.matchByType('El agente debe pagar', 'deontic');
    expect(matches.some(x => x.operator === ES_DEONTIC_OP.OBLIGATION)).toBe(true);
  });

  test('detects prohibition (no debe)', () => {
    const matches = m.matchByType('El empleado no debe divulgar', 'deontic');
    expect(matches.some(x => x.operator === ES_DEONTIC_OP.PROHIBITION)).toBe(true);
  });

  test('detects permission (puede)', () => {
    const matches = m.matchByType('El empleado puede solicitar permiso', 'deontic');
    expect(matches.some(x => x.operator === ES_DEONTIC_OP.PERMISSION)).toBe(true);
  });

  test('detects cognitive belief', () => {
    const matches = m.matchByType('El agente cree que el contrato es válido', 'cognitive');
    expect(matches.length).toBeGreaterThan(0);
  });

  test('detects temporal always', () => {
    const matches = m.matchByType('Siempre cumplir las normas', 'temporal');
    expect(matches.length).toBeGreaterThan(0);
  });

  test('results sorted by span', () => {
    const all = m.match('El agente debe pagar y puede reclamar');
    for (let i = 1; i < all.length; i++) {
      expect(all[i].span[0]).toBeGreaterThanOrEqual(all[i - 1].span[0]);
    }
  });
});

describe('SpanishParser', () => {
  const p = new SpanishParser();
  test('parse returns text/clauses/matches', () => {
    const r = p.parse('El agente debe pagar');
    expect(r.text).toBe('El agente debe pagar');
    expect(Array.isArray(r.clauses)).toBe(true);
  });
  test('clauses have confidence in [0,1]', () => {
    const { clauses } = p.parse('El agente debe pagar');
    for (const c of clauses) {
      expect(c.confidence).toBeGreaterThanOrEqual(0);
      expect(c.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe('Spanish lexicon functions', () => {
  test('getSpanishVerbConjugations covers deber', () => {
    const c = getSpanishVerbConjugations();
    expect(c['deber']).toBeDefined();
    expect(c['deber']['él']).toBe('debe');
  });
  test('getSpanishArticles has definite_masc_sg', () => {
    const a = getSpanishArticles();
    expect(a['definite_masc_sg']).toContain('el');
  });
  test('getSpanishDeonticKeywords has obligation', () => {
    const kw = getSpanishDeonticKeywords();
    expect(kw['obligation']).toContain('debe');
  });
});

// ---------------------------------------------------------------------------
// FluentManager tests
// ---------------------------------------------------------------------------

describe('FluentManager — basic usage', () => {
  test('addFluent creates fluent with initial value', () => {
    const mgr = new FluentManager();
    mgr.addFluent({ name: 'light_on', type: FluentType.BOOLEAN });
    const state = mgr.getState(new TimePoint(0));
    expect(state.get('light_on')).toBe(false);
  });

  test('setState overrides value at given time', () => {
    const mgr = new FluentManager();
    mgr.addFluent({ name: 'light_on', type: FluentType.BOOLEAN });
    mgr.setState('light_on', true, new TimePoint(0));
    expect(mgr.getHoldsAt('light_on', new TimePoint(0))).toBe(true);
  });

  test('initiate + transition makes fluent hold at next time', () => {
    const mgr = new FluentManager();
    mgr.addFluent({ name: 'door_open', type: FluentType.BOOLEAN });
    mgr.initiate('door_open', true, new TimePoint(1));
    mgr.transition(new TimePoint(0), new TimePoint(1));
    expect(mgr.getHoldsAt('door_open', new TimePoint(1))).toBe(true);
  });

  test('terminate removes inertial fluent value', () => {
    const mgr = new FluentManager();
    mgr.addFluent({ name: 'light_on', type: FluentType.BOOLEAN, initialValue: true });
    mgr.terminate('light_on', new TimePoint(1));
    mgr.transition(new TimePoint(0), new TimePoint(1));
    expect(mgr.getHoldsAt('light_on', new TimePoint(1))).toBe(false);
  });

  test('numerical fluent with decaying persistence', () => {
    const mgr = new FluentManager();
    mgr.addFluent({ name: 'heat', type: FluentType.NUMERICAL, initialValue: 100, persistenceRule: PersistenceRule.DECAYING, decayRate: 0.9 });
    mgr.transition(new TimePoint(0), new TimePoint(1));
    const h = mgr.getHoldsAt('heat', new TimePoint(1)) as number;
    expect(h).toBeCloseTo(90);
  });

  test('getFluents returns registered specs', () => {
    const mgr = new FluentManager();
    mgr.addFluent({ name: 'x', type: FluentType.BOOLEAN });
    mgr.addFluent({ name: 'y', type: FluentType.NUMERICAL });
    expect(mgr.getFluents()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// CEC Types tests
// ---------------------------------------------------------------------------

describe('isFormulaDict', () => {
  test('returns true for valid FormulaDict', () => {
    expect(isFormulaDict({ type: 'deontic', operator: 'O' })).toBe(true);
  });
  test('returns false for non-object', () => {
    expect(isFormulaDict('string')).toBe(false);
  });
  test('returns false for object without type', () => {
    expect(isFormulaDict({ operator: 'O' })).toBe(false);
  });
});

describe('isProofResultDict', () => {
  test('returns true for valid ProofResultDict', () => {
    expect(isProofResultDict({ isValid: true })).toBe(true);
  });
  test('returns false for missing isValid', () => {
    expect(isProofResultDict({ proved: true })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ZKP Trace tests
// ---------------------------------------------------------------------------

describe('makeTraceStep', () => {
  test('creates fact step', () => {
    const step = makeTraceStep('fact', 'P', null, 0);
    expect(step.kind).toBe('fact');
    expect(step.atom).toBe('P');
    expect(step.antecedent).toBeNull();
    expect(step.stepIndex).toBe(0);
  });

  test('creates modus_ponens step', () => {
    const step = makeTraceStep('modus_ponens', 'Q', 'P', 1);
    expect(step.kind).toBe('modus_ponens');
    expect(step.antecedent).toBe('P');
  });

  test('throws on invalid kind', () => {
    // @ts-ignore testing invalid input
    expect(() => makeTraceStep('unknown', 'P', null, 0)).toThrow(TDFOLTraceSchemaError);
  });

  test('throws fact step with antecedent', () => {
    expect(() => makeTraceStep('fact', 'P', 'Q', 0)).toThrow(TDFOLTraceSchemaError);
  });

  test('throws modus_ponens step without antecedent', () => {
    expect(() => makeTraceStep('modus_ponens', 'Q', null, 0)).toThrow(TDFOLTraceSchemaError);
  });

  test('throws on negative stepIndex', () => {
    expect(() => makeTraceStep('fact', 'P', null, -1)).toThrow(TDFOLTraceSchemaError);
  });
});

describe('stepKindCode', () => {
  test('fact → 0', () => { expect(stepKindCode(makeTraceStep('fact', 'P', null, 0))).toBe(0); });
  test('modus_ponens → 1', () => { expect(stepKindCode(makeTraceStep('modus_ponens', 'Q', 'P', 1))).toBe(1); });
});

describe('buildTdfolV1TraceWitness', () => {
  test('proves Q from {P, P→Q}', () => {
    const w = buildTdfolV1TraceWitness(['P', 'P→Q'], 'Q');
    expect(w.theorem).toBe('Q');
    expect(w.traceLength).toBeGreaterThan(0);
    expect(w.traceSteps).toHaveLength(w.traceLength);
    expect(w.circuitRef).toBe(CIRCUIT_REF);
    expect(w.rulesetId).toBe(RULESET_ID);
  });

  test('proves multi-hop R from {P, P→Q, Q→R}', () => {
    const w = buildTdfolV1TraceWitness(['P', 'P→Q', 'Q→R'], 'R');
    expect(w.theorem).toBe('R');
    expect(w.traceLength).toBeGreaterThan(0);
  });

  test('theoremHash matches expected SHA-256', () => {
    const w = buildTdfolV1TraceWitness(['P', 'P→Q'], 'Q');
    expect(w.theoremHash).toBe(theoremHashHex('Q'));
  });

  test('throws TDFOLTraceNotDerivableError for underivable theorem', () => {
    expect(() => buildTdfolV1TraceWitness(['A', 'B'], 'C')).toThrow(TDFOLTraceNotDerivableError);
  });

  test('axioms_commitment is 64-char hex string', () => {
    const w = buildTdfolV1TraceWitness(['P'], 'P');
    expect(w.axiomsCommitment).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('validateTdfolV1TraceWitness', () => {
  test('valid witness does not throw', () => {
    const w = buildTdfolV1TraceWitness(['P', 'P→Q'], 'Q');
    expect(() => validateTdfolV1TraceWitness(w)).not.toThrow();
  });

  test('throws on tampered theoremHash', () => {
    const w = buildTdfolV1TraceWitness(['P'], 'P');
    const tampered = { ...w, theoremHash: 'a'.repeat(64) };
    expect(() => validateTdfolV1TraceWitness(tampered)).toThrow(TDFOLTraceSchemaError);
  });
});

describe('toNoirTraceFieldInputs', () => {
  test('output has theoremHashField, axiomsCommitmentField, traceLength, traceSteps', () => {
    const w = buildTdfolV1TraceWitness(['P', 'P→Q'], 'Q');
    const out = toNoirTraceFieldInputs(w);
    expect(out).toHaveProperty('theoremHashField');
    expect(out).toHaveProperty('axiomsCommitmentField');
    expect(out).toHaveProperty('traceLength');
    expect(out).toHaveProperty('traceSteps');
  });

  test('traceSteps padded to MAX_TRACE_STEPS', () => {
    const w = buildTdfolV1TraceWitness(['P'], 'P');
    const out = toNoirTraceFieldInputs(w);
    expect((out['traceSteps'] as unknown[]).length).toBe(MAX_TRACE_STEPS);
  });
});

describe('toPublicMetadata', () => {
  test('does not include raw theorem text', () => {
    const w = buildTdfolV1TraceWitness(['P', 'P→Q'], 'Q');
    const pub = toPublicMetadata(w);
    // Public metadata should not expose atom text — only hashes
    expect(pub).not.toHaveProperty('theorem');
    expect(pub).toHaveProperty('theoremHash');
    expect(pub).toHaveProperty('traceSteps');
  });
});
