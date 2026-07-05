/**
 * Sprint 58 tests — DCEC Core Types, CEC ZKP Integration, Modal Autoencoder Loop
 *
 * Covers T-259 (modal-autoencoder-loop.ts),
 *         T-260 (cec-zkp-integration.ts),
 *         T-261 (dcec-core-types.ts).
 */

import {
  DeonticOperator, CognitiveOperator, LogicalConnective, DCECTemporalOperator,
  makeSort, makeVariable, makeFunction, makePredicate, applyOperator,
  SORT_AGENT, SORT_ACTION, SORT_TIME,
  PRED_HAPPENS, PRED_HOLDS_AT,
} from '../../src/services/dcec-core-types';

import {
  ProvingMethod, ZKPCECProver, UnifiedCECProofResult,
  createHybridProver,
} from '../../src/services/cec-zkp-integration';
import { Groth16BackendFallback } from '../../src/services/zkp-backends';

import {
  LegalModalAutoencoderLoop,
  defaultAutoencoderConfig,
} from '../../src/services/modal-autoencoder-loop';

// ---------------------------------------------------------------------------
// DCEC Core Types tests
// ---------------------------------------------------------------------------

describe('DeonticOperator enum', () => {
  test('OBLIGATION = O', () => { expect(DeonticOperator.OBLIGATION).toBe('O'); });
  test('PERMISSION = P', () => { expect(DeonticOperator.PERMISSION).toBe('P'); });
  test('PROHIBITION = F', () => { expect(DeonticOperator.PROHIBITION).toBe('F'); });
  test('POWER = POW',       () => { expect(DeonticOperator.POWER).toBe('POW'); });
  test('IMMUNITY = IMM',    () => { expect(DeonticOperator.IMMUNITY).toBe('IMM'); });
  test('alias OBLIGATORY = O', () => { expect(DeonticOperator.OBLIGATORY).toBe('O'); });
});

describe('CognitiveOperator enum', () => {
  test('BELIEF = B',    () => { expect(CognitiveOperator.BELIEF).toBe('B'); });
  test('KNOWLEDGE = K', () => { expect(CognitiveOperator.KNOWLEDGE).toBe('K'); });
  test('INTENTION = I', () => { expect(CognitiveOperator.INTENTION).toBe('I'); });
  test('DESIRE = D',    () => { expect(CognitiveOperator.DESIRE).toBe('D'); });
  test('GOAL = G',      () => { expect(CognitiveOperator.GOAL).toBe('G'); });
});

describe('LogicalConnective enum', () => {
  test('AND = ∧', () => { expect(LogicalConnective.AND).toBe('∧'); });
  test('OR = ∨',  () => { expect(LogicalConnective.OR).toBe('∨'); });
  test('NOT = ¬', () => { expect(LogicalConnective.NOT).toBe('¬'); });
  test('IMPLIES = →', () => { expect(LogicalConnective.IMPLIES).toBe('→'); });
  test('IFF = ↔',     () => { expect(LogicalConnective.IFF).toBe('↔'); });
});

describe('DCECTemporalOperator enum', () => {
  test('ALWAYS = □',     () => { expect(DCECTemporalOperator.ALWAYS).toBe('□'); });
  test('EVENTUALLY = ◊ (PORT-096: Python codepoint)', () => { expect(DCECTemporalOperator.EVENTUALLY).toBe('◊'); });
  test('NEXT = X',       () => { expect(DCECTemporalOperator.NEXT).toBe('X'); });
  test('UNTIL = U',      () => { expect(DCECTemporalOperator.UNTIL).toBe('U'); });
});

describe('makeSort / makeVariable / makeFunction / makePredicate', () => {
  test('makeSort creates a named sort', () => {
    const s = makeSort('MySort');
    expect(s.name).toBe('MySort');
    expect(s.isSubsort).toBe(false);
  });

  test('makeSort with parent is subsort', () => {
    const s = makeSort('Event', 'Object');
    expect(s.isSubsort).toBe(true);
    expect(s.parent).toBe('Object');
  });

  test('makeVariable has name and sort', () => {
    const v = makeVariable('x', SORT_AGENT);
    expect(v.name).toBe('x');
    expect(v.sort.name).toBe('Agent');
  });

  test('makeFunction has arity matching argSorts', () => {
    const f = makeFunction('concat', [SORT_AGENT, SORT_ACTION], SORT_AGENT);
    expect(f.argSorts).toHaveLength(2);
    expect(f.returnSort.name).toBe('Agent');
  });

  test('makePredicate has correct arity', () => {
    const p = makePredicate('happensAt', [SORT_ACTION, SORT_TIME]);
    expect(p.arity).toBe(2);
  });
});

describe('Predefined sorts and predicates', () => {
  test('SORT_AGENT name is Agent', () => { expect(SORT_AGENT.name).toBe('Agent'); });
  test('PRED_HAPPENS has 2 args', () => { expect(PRED_HAPPENS.arity).toBe(2); });
  test('PRED_HOLDS_AT name is holdsAt', () => { expect(PRED_HOLDS_AT.name).toBe('holdsAt'); });
});

describe('applyOperator', () => {
  test('builds obligation formula', () => {
    expect(applyOperator(DeonticOperator.OBLIGATION, ['pay'])).toBe('O(pay)');
  });
  test('builds belief formula', () => {
    expect(applyOperator(CognitiveOperator.BELIEF, ['alice', 'P'])).toBe('B(alice, P)');
  });
  test('builds box formula', () => {
    expect(applyOperator(DCECTemporalOperator.ALWAYS, ['P'])).toBe('□(P)');
  });
});

// ---------------------------------------------------------------------------
// CEC ZKP Integration tests
// ---------------------------------------------------------------------------

describe('ZKPCECProver — standard mode', () => {
  test('proves trivial formula', async () => {
    const prover = new ZKPCECProver({ method: ProvingMethod.STANDARD });
    const r = await prover.prove('P', ['P']);
    expect(r.isProved).toBe(true);
    expect(r.method).toBe(ProvingMethod.STANDARD);
    expect(r.isPrivate).toBe(false);
  });

  test('proves via forward chaining', async () => {
    const prover = new ZKPCECProver();
    const r = await prover.prove('Q', ['P', 'P→Q']);
    expect(r.isProved).toBe(true);
  });

  test('fails for underivable formula', async () => {
    const prover = new ZKPCECProver();
    const r = await prover.prove('R', ['P']);
    expect(r.isProved).toBe(false);
  });

  test('stats increment', async () => {
    const prover = new ZKPCECProver({ enableCache: false });
    await prover.prove('P', ['P']);
    expect(prover.getStats().standardProofs).toBe(1);
  });
});

describe('ZKPCECProver — ZKP mode', () => {
  test('fails closed in ZKP mode when no native backend is configured', async () => {
    const prover = new ZKPCECProver({ enableZkp: true, method: ProvingMethod.ZKP });
    await expect(prover.prove('P', ['P'])).rejects.toThrow(/allowSimulatedFallback:true/);
  });

  test('produces private proof with explicit simulated backend injection', async () => {
    const prover = new ZKPCECProver({
      enableZkp: true,
      method: ProvingMethod.ZKP,
      zkpBackend: new Groth16BackendFallback(),
    });
    const r = await prover.prove('P', ['P']);
    expect(r.isProved).toBe(true);
    expect(r.method).toBe(ProvingMethod.ZKP);
    expect(r.isPrivate).toBe(true);
    expect(r.zkpProof).not.toBeNull();
  });

  test('verifyZkp returns true for valid proof', async () => {
    const prover = new ZKPCECProver({
      enableZkp: true,
      method: ProvingMethod.ZKP,
      zkpBackend: new Groth16BackendFallback(),
    });
    const r = await prover.prove('P', ['P']);
    const ok = await prover.verifyZkp(r.zkpProof!, 'P');
    expect(ok).toBe(true);
  });

  test('verifyZkp throws when ZKP not enabled', async () => {
    const prover = new ZKPCECProver({ enableZkp: false });
    await expect(prover.verifyZkp({}, 'P')).rejects.toThrow();
  });
});

describe('ZKPCECProver — hybrid mode', () => {
  test('proves in hybrid mode', async () => {
    const prover = new ZKPCECProver({ method: ProvingMethod.HYBRID });
    const r = await prover.prove('Q', ['P', 'P→Q']);
    expect(r.isProved).toBe(true);
    expect(r.method).toBe(ProvingMethod.HYBRID);
  });
});

describe('ZKPCECProver — caching', () => {
  test('cache hit on second call', async () => {
    const prover = new ZKPCECProver({ enableCache: true });
    await prover.prove('P', ['P']);
    await prover.prove('P', ['P']);
    expect(prover.getStats().cacheHits).toBe(1);
  });
});

describe('createHybridProver', () => {
  test('returns a ZKPCECProver in hybrid mode', async () => {
    const prover = createHybridProver(true);
    const r = await prover.prove('P', ['P']);
    expect(r.method).toBe(ProvingMethod.HYBRID);
  });
});

// ---------------------------------------------------------------------------
// LegalModalAutoencoderLoop tests
// ---------------------------------------------------------------------------

describe('defaultAutoencoderConfig', () => {
  test('has expected defaults', () => {
    const cfg = defaultAutoencoderConfig();
    expect(cfg.maxIterations).toBe(3);
    expect(cfg.convergenceThreshold).toBeGreaterThan(0);
    expect(cfg.targetConfidence).toBeGreaterThan(0);
  });
});

describe('LegalModalAutoencoderLoop — run()', () => {
  const loop = new LegalModalAutoencoderLoop();

  test('returns ModalAutoencoderLoopResult', () => {
    const r = loop.run('All contractors must pay taxes.');
    expect(r).toHaveProperty('compilationResult');
    expect(r).toHaveProperty('decodedText');
    expect(r).toHaveProperty('patchValidations');
    expect(r).toHaveProperty('confidence');
    expect(r).toHaveProperty('iterations');
    expect(r).toHaveProperty('converged');
  });

  test('iterations is at least 1', () => {
    expect(loop.run('P').iterations).toBeGreaterThanOrEqual(1);
  });

  test('confidence is in [0, 1]', () => {
    const r = loop.run('Alice must pay Bob.');
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  test('patchValidations is an array', () => {
    const r = loop.run('Employees may take leave.');
    expect(Array.isArray(r.patchValidations)).toBe(true);
  });

  test('metadata contains originalText', () => {
    const r = loop.run('P must Q.', { documentId: 'doc-1' });
    expect((r.metadata as Record<string, unknown>)['originalText']).toBe('P must Q.');
    expect((r.metadata as Record<string, unknown>)['documentId']).toBe('doc-1');
  });

  test('stats increment after run', () => {
    const loop2 = new LegalModalAutoencoderLoop();
    loop2.run('P');
    loop2.run('Q');
    expect(loop2.getStats().totalRuns).toBe(2);
  });
});

describe('LegalModalAutoencoderLoop — runBatch()', () => {
  test('processes multiple texts', () => {
    const loop = new LegalModalAutoencoderLoop();
    const results = loop.runBatch(['Alice must pay.', 'Bob may leave.', 'Eve must not disclose.']);
    expect(results).toHaveLength(3);
    results.forEach(r => expect(r.iterations).toBeGreaterThanOrEqual(1));
  });
});
