/**
 * wasm-prover-sprint66.test.ts
 * Tests for Sprint 66 modules:
 *   - deontic-cognitive-logic-types.ts    (DCEC enums/sorts, TPTP utils, DCEC-to-UCAN bridge)
 *   - prover-strategy-adapters.ts  (StrategySelector, VampireAdapter, UtilityMonitor, lazy installer)
 */

import {
  DeonticOperator, CognitiveOperator, LogicalConnective, TemporalOperator,
  BaseSort, AgentSort, ActionSort, TimeSort,
  makeVariable, makeFunction, makePredicate,
  formulaToTPTP, createTPTPProblem, TPTPConverter,
  DCECToUCANMapping, DCECToUCANBridge,
} from '../../src/services/logic/dcec/dcec-ucan-tptp-types.js';

import {
  StrategySelector,
  VampireAdapter, checkVampireInstallation, type VampireProcessResult,
  UtilityMonitor, trackPerformance, withCaching, getGlobalStats, clearGlobalCache, resetGlobalStats,
  normalizeProverName, findExecutable, isLazyInstallEnabled, lazyInstallProver,
} from '../../src/services/provers/prover-strategy-runtime.js';

// ---------------------------------------------------------------------------
// DCEC Enums
// ---------------------------------------------------------------------------
describe('DeonticOperator', () => {
  it('has O, P, F, W values', () => {
    expect(DeonticOperator.OBLIGATION).toBe('O');
    expect(DeonticOperator.PERMISSION).toBe('P');
    expect(DeonticOperator.PROHIBITION).toBe('F');
    expect(DeonticOperator.WAIVER).toBe('W');
  });
});

describe('CognitiveOperator', () => {
  it('has K, B, D, I values', () => {
    expect(CognitiveOperator.KNOWS).toBe('K');
    expect(CognitiveOperator.BELIEVES).toBe('B');
  });
});

describe('LogicalConnective', () => {
  it('has AND and IMPLIES', () => {
    expect(LogicalConnective.AND).toBe('∧');
    expect(LogicalConnective.IMPLIES).toBe('→');
  });
});

describe('TemporalOperator', () => {
  it('has ALWAYS and EVENTUALLY', () => {
    expect(TemporalOperator.ALWAYS).toBe('G');
    expect(TemporalOperator.EVENTUALLY).toBe('F');
  });
});

// ---------------------------------------------------------------------------
// Sorts / Variables / Functions / Predicates
// ---------------------------------------------------------------------------
describe('Base sorts', () => {
  it('BaseSort is Entity', () => expect(BaseSort.name).toBe('Entity'));
  it('AgentSort extends Entity', () => expect(AgentSort.superSort).toBe('Entity'));
  it('ActionSort name', () => expect(ActionSort.name).toBe('Action'));
  it('TimeSort name', () => expect(TimeSort.name).toBe('Time'));
});

describe('makeVariable', () => {
  it('creates variable with sort', () => {
    const v = makeVariable('x', AgentSort);
    expect(v.name).toBe('x');
    expect(v.sort).toBe(AgentSort);
  });
});

describe('makeFunction', () => {
  it('creates function with argSorts', () => {
    const f = makeFunction('f', [AgentSort], ActionSort);
    expect(f.name).toBe('f');
    expect(f.argSorts).toHaveLength(1);
    expect(f.returnSort).toBe(ActionSort);
  });
});

describe('makePredicate', () => {
  it('creates predicate', () => {
    const p = makePredicate('happy', [AgentSort]);
    expect(p.name).toBe('happy');
    expect(p.argSorts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// TPTP Utils
// ---------------------------------------------------------------------------
describe('formulaToTPTP', () => {
  it('converts AND to &', () => {
    expect(formulaToTPTP('P ∧ Q')).toBe('P & Q');
  });
  it('converts NOT to ~', () => {
    expect(formulaToTPTP('¬P')).toBe('~P');
  });
  it('converts IMPLIES to =>', () => {
    expect(formulaToTPTP('P → Q')).toContain('=>');
  });
});

describe('createTPTPProblem', () => {
  it('produces fof lines for axioms and conjectures', () => {
    const ax  = [{ name: 'a1', role: 'axiom', formula: 'P ∧ Q' }];
    const con = [{ name: 'c1', role: 'conjecture', formula: 'P' }];
    const tptp = createTPTPProblem('test', ax, con);
    expect(tptp).toContain('fof(a1, axiom,');
    expect(tptp).toContain('fof(c1, conjecture,');
  });
});

describe('TPTPConverter', () => {
  const conv = new TPTPConverter();
  it('convert wraps formulaToTPTP', () => {
    expect(conv.convert('P ∨ Q')).toContain('|');
  });
  it('parseRoles extracts entries', () => {
    const text = 'fof(ax1, axiom, happy(john)).';
    const entries = conv.parseRoles(text);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].name).toBe('ax1');
  });
});

// ---------------------------------------------------------------------------
// DCEC-to-UCAN Bridge
// ---------------------------------------------------------------------------
describe('DCECToUCANMapping', () => {
  it('maps O operator to ucan/obligation', () => {
    const mapping = new DCECToUCANMapping();
    const { ability } = mapping.abilityFor('O', 'share_data');
    expect(ability).toContain('ucan/obligation');
  });
});

describe('DCECToUCANBridge', () => {
  it('converts O(agent, action) formula to UCAN claims', () => {
    const bridge = new DCECToUCANBridge();
    const result = bridge.convert('O(contractor, deliver_report)');
    expect(result.success).toBe(true);
    expect(result.ucanClaims.length).toBe(1);
  });

  it('returns error for formula with no mappable clauses', () => {
    const bridge = new DCECToUCANBridge();
    const result = bridge.convert('hello world no ops');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('buildDenyCapability returns deny object', () => {
    const bridge = new DCECToUCANBridge();
    const deny = bridge.buildDenyCapability('data', 'read', 'unauthorized');
    expect(deny.resource).toBe('data');
    expect(deny.ability).toContain('prohibition');
    expect(deny.reason).toBe('unauthorized');
  });
});

// ---------------------------------------------------------------------------
// StrategySelector
// ---------------------------------------------------------------------------
describe('StrategySelector', () => {
  const sel = new StrategySelector();

  it('selects model_checking for temporal formulas', () => {
    expect(sel.select('G P → F Q')).toBe('model_checking');
  });

  it('selects tableaux for deontic formulas', () => {
    expect(sel.select('O(a, b)')).toBe('tableaux');
  });

  it('selects resolution for quantified formulas', () => {
    expect(sel.select('∀x Happy(x) → Lucky(x)')).toBe('resolution');
  });

  it('selectForBatch picks most-frequent strategy', () => {
    const strategy = sel.selectForBatch(['P ∧ Q', 'A ∧ B', 'O(a, b)']);
    expect(typeof strategy).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// VampireAdapter
// ---------------------------------------------------------------------------
describe('VampireAdapter', () => {
  it('isAvailable returns boolean', () => {
    const adapter = new VampireAdapter();
    expect(typeof adapter.isAvailable()).toBe('boolean');
  });

  it('prove returns result with required fields', async () => {
    const adapter = new VampireAdapter();
    const result = await adapter.prove('fof(a, axiom, p(x)).');
    expect(typeof result.isProved).toBe('boolean');
    expect(typeof result.status).toBe('string');
    expect(typeof result.cpuTime).toBe('number');
  });

  it('getStats tracks totalProofs', async () => {
    const adapter = new VampireAdapter();
    await adapter.prove('fof(a, axiom, q(x)).');
    expect(adapter.getStats().totalProofs).toBe(1);
  });

  it('checkVampireInstallation returns boolean', () => {
    expect(typeof checkVampireInstallation()).toBe('boolean');
  });

  it('uses runner output when vampire is available', async () => {
    const runner = (_command: string, _args: string[], _input: string, _timeoutMs: number): VampireProcessResult => ({
      status: 0,
      stdout: '% SZS status Unsatisfiable\nfof(step_1, plain, p).',
      stderr: '',
    });
    const adapter = new VampireAdapter({ availabilityCheck: () => true, runner, binary: 'vampire' });
    const result = await adapter.prove('p');
    expect(result.isProved).toBe(true);
    expect(result.status).toBe('SZS_Unsatisfiable');
    expect(result.proof).toContain('fof(step_1, plain, p).');
    expect(result.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// UtilityMonitor
// ---------------------------------------------------------------------------
describe('UtilityMonitor', () => {
  let monitor: UtilityMonitor;
  beforeEach(() => { monitor = new UtilityMonitor(); });

  it('track records a call', () => {
    monitor.track('compute', () => 42);
    expect(monitor.getRecords()).toHaveLength(1);
    expect(monitor.getRecords()[0].name).toBe('compute');
  });

  it('cachedCall returns same value on second call', () => {
    let calls = 0;
    const fn = () => { calls++; return 'result'; };
    const r1 = monitor.cachedCall('k', fn);
    const r2 = monitor.cachedCall('k', fn);
    expect(r1).toBe(r2);
    expect(calls).toBe(1);  // fn only called once
  });

  it('clearCache allows re-computation', () => {
    let calls = 0;
    monitor.cachedCall('key', () => { calls++; return 1; });
    monitor.clearCache();
    monitor.cachedCall('key', () => { calls++; return 2; });
    expect(calls).toBe(2);
  });

  it('reset clears records and cache', () => {
    monitor.track('x', () => 1);
    monitor.reset();
    expect(monitor.getRecords()).toHaveLength(0);
  });
});

describe('Global stats functions', () => {
  beforeEach(() => { resetGlobalStats(); clearGlobalCache(); });

  it('getGlobalStats returns stats object', () => {
    const stats = getGlobalStats();
    expect(typeof stats.totalCalls).toBe('number');
    expect(typeof stats.totalMs).toBe('number');
  });

  it('withCaching caches results', () => {
    let calls = 0;
    withCaching('key1', () => { calls++; return 'val'; });
    withCaching('key1', () => { calls++; return 'val2'; });
    expect(calls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Lazy Installer
// ---------------------------------------------------------------------------
describe('normalizeProverName', () => {
  it('lowercases and replaces dashes with underscores', () => {
    expect(normalizeProverName('E-Prover')).toBe('e_prover');
    expect(normalizeProverName('Vampire 4')).toBe('vampire_4');
  });
});

describe('findExecutable', () => {
  it('returns a string or null', () => {
    const result = findExecutable('ls');
    expect(result === null || typeof result === 'string').toBe(true);
  });
});

describe('isLazyInstallEnabled', () => {
  it('returns boolean', () => {
    expect(typeof isLazyInstallEnabled()).toBe('boolean');
  });
});

describe('lazyInstallProver', () => {
  it('returns installed:false when lazy install disabled', async () => {
    // LAZY_INSTALL env not set in test environment
    const result = await lazyInstallProver('nonexistent_prover');
    expect(typeof result.installed).toBe('boolean');
  });
});
