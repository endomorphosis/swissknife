/**
 * Tests for the Remote Deontic Engine (Round 51) — delegating hard/temporal
 * deontic proofs to the Python ipfs_datasets_py formal-logic MCP tools over the
 * MCP++ connector, with the local PolicyEngine as the authoritative fast path.
 *
 * All remote calls are exercised through an in-memory mock connector; no network
 * or Python server is required.
 */

import {
  RemoteDeonticEngine,
  createRemoteDeonticORBEvaluator,
  checkPolicyConsistencyRemote,
  deonticAtom,
  policyToDeonticFormulas,
  isTemporalPolicy,
  PolicyEngine,
  type DeonticLogicConnector,
  type Policy,
} from '../../src/services/mcp-remote-deontic-engine';

// --- mock connector ---------------------------------------------------------

type MockResponse = unknown | ((args: Record<string, unknown>) => unknown);

class MockConnector implements DeonticLogicConnector {
  calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  constructor(private readonly responses: Record<string, MockResponse> = {}) {}

  async dispatch(_category: string, tool: string, params: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ tool, args: params });
    const r = this.responses[tool];
    if (r === undefined) return { success: false, error: `no mock for ${tool}` };
    return typeof r === 'function' ? (r as (a: Record<string, unknown>) => unknown)(params) : r;
  }

  toolCalls(tool: string): Array<Record<string, unknown>> {
    return this.calls.filter(c => c.tool === tool).map(c => c.args);
  }
}

/** A connector that only exposes the raw callTool + envelope (no dispatch). */
class EnvelopeConnector implements DeonticLogicConnector {
  calls: string[] = [];
  constructor(private readonly payloads: Record<string, unknown>) {}
  async callTool(toolName: string, _args: Record<string, unknown>): Promise<unknown> {
    this.calls.push(toolName);
    const payload = this.payloads[toolName] ?? { success: false, error: 'unmocked' };
    return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
  }
}

const HEALTHY = { status: 'healthy', healthy: 3, total: 3, modules: {} };

function permitAllPolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'test-policy',
    version: '1',
    permissions: [{ cap: '*', rsc: '*' }],
    prohibitions: [],
    obligations: [],
    ...overrides,
  };
}

// --- pure mapping -----------------------------------------------------------

describe('policy → TDFOL mapping (pure)', () => {
  it('deonticAtom canonicalizes cap+resource deterministically and letter-initial', () => {
    const a = deonticAtom('dataset/read', 'ipfs://bafy...QmX');
    expect(a).toBe(deonticAtom('dataset/read', 'ipfs://bafy...QmX'));
    expect(a).toMatch(/^act_[a-z]/);
    expect(a).not.toMatch(/[^A-Za-z0-9_]/);
    // different inputs → different atoms
    expect(deonticAtom('a', 'b')).not.toBe(deonticAtom('a', 'c'));
    // empty parts collapse to a stable placeholder, still valid
    expect(deonticAtom('', '')).toBe('act_any_on_any');
  });

  it('policyToDeonticFormulas emits P()/F()/O() and wraps deadline obligations with ◊', () => {
    const policy = permitAllPolicy({
      permissions: [{ cap: 'dataset/read', rsc: 'ds' }],
      prohibitions: [{ cap: 'dataset/delete', rsc: 'ds' }],
      obligations: [
        { description: 'log', requiredCap: 'log/write', rsc: 'audit' },
        { description: 'retain', requiredCap: 'retain', rsc: 'audit', deadline: 9999999999 },
      ],
    });
    const f = policyToDeonticFormulas(policy);
    expect(f.permissions).toEqual([`P(${deonticAtom('dataset/read', 'ds')})`]);
    expect(f.prohibitions).toEqual([`F(${deonticAtom('dataset/delete', 'ds')})`]);
    expect(f.obligations[0]).toBe(`O(${deonticAtom('log/write', 'audit')})`);
    expect(f.obligations[1]).toBe(`◊O(${deonticAtom('retain', 'audit')})`);
    expect(f.all).toHaveLength(4);
  });

  it('isTemporalPolicy detects window/deadline/temporal clauses', () => {
    expect(isTemporalPolicy(permitAllPolicy())).toBe(false);
    expect(isTemporalPolicy(permitAllPolicy({ temporal: { notAfter: 10 } }))).toBe(true);
    expect(
      isTemporalPolicy(permitAllPolicy({ obligations: [{ description: 'x', deadline: 5 }] })),
    ).toBe(true);
    expect(
      isTemporalPolicy(
        permitAllPolicy({ permissions: [{ cap: 'a', rsc: 'b', temporal: { maxInvocations: 1 } }] }),
      ),
    ).toBe(true);
  });
});

// --- RemoteDeonticEngine ----------------------------------------------------

describe('RemoteDeonticEngine', () => {
  it('reports availability from logic_health and caches within the TTL', async () => {
    const connector = new MockConnector({ logic_health: HEALTHY });
    const engine = new RemoteDeonticEngine({ connector, healthTtlMs: 10000 });
    expect(await engine.isAvailable()).toBe(true);
    expect(await engine.isAvailable()).toBe(true);
    // cached → only one probe
    expect(connector.toolCalls('logic_health')).toHaveLength(1);
  });

  it('treats unavailable/failed/thrown health as not available (never throws)', async () => {
    const down = new RemoteDeonticEngine({ connector: new MockConnector({ logic_health: { status: 'unavailable' } }) });
    expect(await down.isAvailable()).toBe(false);

    const failed = new RemoteDeonticEngine({ connector: new MockConnector({ logic_health: { success: false, error: 'x' } }) });
    expect(await failed.isAvailable()).toBe(false);

    const thrower: DeonticLogicConnector = { async dispatch() { throw new Error('offline'); } };
    const unreachable = new RemoteDeonticEngine({ connector: thrower });
    expect(await unreachable.isAvailable()).toBe(false);
  });

  it('proveTemporal forwards the tdfol_prove args and normalizes the verdict', async () => {
    const connector = new MockConnector({
      tdfol_prove: (args) => ({ proved: true, status: 'proved', method: 'z3', formula: args.formula }),
    });
    const engine = new RemoteDeonticEngine({ connector, defaultTimeoutMs: 1234 });
    const res = await engine.proveTemporal('O(a) → ◊a', { strategy: 'modal_tableaux' });
    expect(res.proved).toBe(true);
    expect(res.status).toBe('proved');
    expect(res.method).toBe('z3');
    const [args] = connector.toolCalls('tdfol_prove');
    expect(args.formula).toBe('O(a) → ◊a');
    expect(args.strategy).toBe('modal_tableaux');
    expect(args.timeout_ms).toBe(1234);
  });

  it('proveTemporal surfaces tool failure and thrown errors as {proved:false,error}', async () => {
    const failed = new RemoteDeonticEngine({ connector: new MockConnector({ tdfol_prove: { success: false, error: 'parse error' } }) });
    expect(await failed.proveTemporal('bad(')).toEqual(expect.objectContaining({ proved: false, error: 'parse error' }));

    const thrower: DeonticLogicConnector = { async dispatch() { throw new Error('net down'); } };
    const res = await new RemoteDeonticEngine({ connector: thrower }).proveTemporal('P');
    expect(res.proved).toBe(false);
    expect(res.error).toContain('net down');
  });

  it('checkTheoryConsistency maps falsum-provable to inconsistent and vice versa', async () => {
    const inconsistent = new RemoteDeonticEngine({ connector: new MockConnector({ tdfol_prove: { proved: true } }) });
    expect((await inconsistent.checkTheoryConsistency(['O(a)', 'F(a)'])).consistent).toBe(false);

    const consistent = new RemoteDeonticEngine({ connector: new MockConnector({ tdfol_prove: { proved: false } }) });
    expect((await consistent.checkTheoryConsistency(['P(a)'])).consistent).toBe(true);

    const errored = new RemoteDeonticEngine({ connector: new MockConnector({ tdfol_prove: { success: false, error: 'oops' } }) });
    expect((await errored.checkTheoryConsistency(['P(a)'])).consistent).toBeUndefined();
  });

  it('works through the raw callTool + envelope path when dispatch is absent', async () => {
    const connector = new EnvelopeConnector({
      logic_health: HEALTHY,
      tdfol_prove: { proved: true, status: 'proved' },
    });
    const engine = new RemoteDeonticEngine({ connector });
    expect(await engine.isAvailable()).toBe(true);
    expect((await engine.proveTemporal('P')).proved).toBe(true);
  });

  it('legalTextToDeontic passes text through and normalizes success', async () => {
    const connector = new MockConnector({
      legal_text_to_deontic: { status: 'success', deontic_formulas: ['O(pay_tax)'] },
    });
    const engine = new RemoteDeonticEngine({ connector });
    const out = await engine.legalTextToDeontic('Everyone shall pay tax.', { jurisdiction: 'us' });
    expect(out.ok).toBe(true);
    expect(out.formulas).toEqual(['O(pay_tax)']);
    const [args] = connector.toolCalls('legal_text_to_deontic');
    expect(args.text_input).toContain('shall pay tax');
    expect(args.jurisdiction).toBe('us');
  });
});

// --- remote-augmented consistency ------------------------------------------

describe('checkPolicyConsistencyRemote', () => {
  it('returns the local result and flags remoteChecked=false when the engine is down', async () => {
    const engine = new RemoteDeonticEngine({ connector: new MockConnector({ logic_health: { status: 'unavailable' } }) });
    const report = await checkPolicyConsistencyRemote(permitAllPolicy(), engine);
    expect(report.remoteChecked).toBe(false);
    expect(report.remoteError).toBeDefined();
    expect(report.consistent).toBe(true);
  });

  it('PORT-255 decides temporal consistency natively without probing the remote connector', async () => {
    const connector = new MockConnector({
      logic_health: { status: 'unavailable' },
      tdfol_prove: { proved: true },
    });
    const engine = new RemoteDeonticEngine({ connector });
    const policy = permitAllPolicy({
      permissions: [{ cap: 'archive', rsc: 'case' }],
      prohibitions: [],
      obligations: [{ description: 'retain case file', requiredCap: 'retain', rsc: 'case', deadline: 9999999999 }],
      temporal: { notBefore: 0, notAfter: 4102444800 },
    });

    const report = await checkPolicyConsistencyRemote(policy, engine);

    expect(report.consistent).toBe(true);
    expect(report.remoteChecked).toBe(false);
    expect(report.remoteError).toBeUndefined();
    expect(report.localProver).toBe('tdfol-native');
    expect(connector.calls).toHaveLength(0);
  });

  it('PORT-255 returns native inconsistent verdicts without probing the remote connector', async () => {
    const connector = new MockConnector({
      logic_health: { status: 'unavailable' },
      tdfol_prove: { proved: false },
    });
    const engine = new RemoteDeonticEngine({ connector });
    const policy = permitAllPolicy({
      permissions: [],
      prohibitions: [{ cap: 'log/write', rsc: 'audit' }],
      obligations: [{ description: 'write audit log', requiredCap: 'log/write', rsc: 'audit', deadline: 9999999999 }],
      temporal: { notBefore: 0, notAfter: 4102444800 },
    });

    const report = await checkPolicyConsistencyRemote(policy, engine);

    expect(report.consistent).toBe(false);
    expect(report.remoteChecked).toBe(false);
    expect(report.remoteError).toBeUndefined();
    expect(report.localProver).toBe('tdfol-native');
    expect(connector.calls).toHaveLength(0);
  });

  it('appends a theory conflict when the prover finds an inconsistency the local fragment misses', async () => {
    const connector = new MockConnector({ logic_health: HEALTHY, tdfol_prove: { proved: true } });
    const engine = new RemoteDeonticEngine({ connector });
    // A policy the *local* heuristic considers fine (no identical permit+prohibit pair).
    const policy = permitAllPolicy({
      permissions: [{ cap: 'a', rsc: 'x' }],
      prohibitions: [{ cap: 'b', rsc: 'y' }],
    });
    const report = await checkPolicyConsistencyRemote(policy, engine);
    expect(report.remoteChecked).toBe(true);
    expect(report.remoteInconsistent).toBe(true);
    expect(report.consistent).toBe(false);
    expect(report.conflicts.some(c => c.detail.includes('TDFOL prover'))).toBe(true);
  });

  it('keeps local conflicts and does not double-count when remote agrees consistent', async () => {
    const connector = new MockConnector({ logic_health: HEALTHY, tdfol_prove: { proved: false } });
    const engine = new RemoteDeonticEngine({ connector });
    const policy = permitAllPolicy({
      permissions: [{ cap: 'dataset/read', rsc: 'ds' }],
      prohibitions: [{ cap: 'dataset/read', rsc: 'ds' }], // identical → local conflict
    });
    const report = await checkPolicyConsistencyRemote(policy, engine);
    expect(report.remoteChecked).toBe(true);
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0].kind).toBe('permission_prohibition');
  });
});

// --- remote-backed ORB evaluator -------------------------------------------

describe('createRemoteDeonticORBEvaluator', () => {
  const RESOURCE = 'sha256:iface-cid';

  function setup(proveResponse: MockResponse, obligations: Policy['obligations']) {
    const localEngine = new PolicyEngine();
    const policy = permitAllPolicy({ obligations });
    const policyCid = localEngine.registerPolicy(policy);
    const connector = new MockConnector({ logic_health: HEALTHY, tdfol_batch_prove: proveResponse });
    const engine = new RemoteDeonticEngine({ connector });
    const evaluator = createRemoteDeonticORBEvaluator({ engine, localEngine });
    return { evaluator, connector, policyCid };
  }

  it('does not consult the prover for a non-temporal permit', async () => {
    const { evaluator, connector, policyCid } = setup({ results: [] }, []);
    const result = await evaluator.evaluate({ policy_cid: policyCid, capability: 'mcp++/invoke:browse', resource: RESOURCE });
    expect(result.outcome).toBe('PERMIT');
    expect(connector.toolCalls('tdfol_batch_prove')).toHaveLength(0);
  });

  it('verifies a temporal obligation and keeps the permit when the prover discharges it', async () => {
    const { evaluator, connector, policyCid } = setup(
      { results: [{ proved: true }] },
      [{ description: 'retain-audit', requiredCap: 'log/write', rsc: 'audit', deadline: 9999999999 }],
    );
    const result = await evaluator.evaluate({ policy_cid: policyCid, capability: 'mcp++/invoke:browse', resource: RESOURCE });
    expect(result.outcome).toBe('OBLIGATION_SPAWNED');
    expect(connector.toolCalls('tdfol_batch_prove')).toHaveLength(1);
    expect(result.reasons.some(r => r.includes('verified dischargeable'))).toBe(true);
  });

  it('downgrades a temporal permit to DENY when the prover refutes dischargeability', async () => {
    const { evaluator, policyCid } = setup(
      { results: [{ proved: false }] },
      [{ description: 'impossible-obligation', requiredCap: 'x', rsc: 'y', deadline: 1 }],
    );
    const result = await evaluator.evaluate({ policy_cid: policyCid, capability: 'mcp++/invoke:browse', resource: RESOURCE });
    expect(result.outcome).toBe('DENY');
    expect(result.reasons.some(r => r.includes('not dischargeable'))).toBe(true);
  });

  it('retains the local decision when the remote prover is unavailable', async () => {
    const localEngine = new PolicyEngine();
    const policyCid = localEngine.registerPolicy(
      permitAllPolicy({ obligations: [{ description: 'o', requiredCap: 'x', rsc: 'y', deadline: 5 }] }),
    );
    const engine = new RemoteDeonticEngine({ connector: new MockConnector({ logic_health: { status: 'unavailable' } }) });
    const evaluator = createRemoteDeonticORBEvaluator({ engine, localEngine });
    const result = await evaluator.evaluate({ policy_cid: policyCid, capability: 'mcp++/invoke:browse', resource: RESOURCE });
    expect(result.outcome).toBe('OBLIGATION_SPAWNED');
    expect(result.reasons.some(r => r.includes('prover unavailable'))).toBe(true);
  });

  it('returns a local DENY untouched without consulting the prover', async () => {
    const localEngine = new PolicyEngine();
    // default_deny style: no permission matches → DENY
    const policyCid = localEngine.registerPolicy({
      id: 'deny', version: '1', permissions: [{ cap: 'other', rsc: 'other' }], prohibitions: [], obligations: [],
    });
    const connector = new MockConnector({ logic_health: HEALTHY, tdfol_batch_prove: { results: [{ proved: true }] } });
    const engine = new RemoteDeonticEngine({ connector });
    const evaluator = createRemoteDeonticORBEvaluator({ engine, localEngine });
    const result = await evaluator.evaluate({ policy_cid: policyCid, capability: 'mcp++/invoke:browse', resource: RESOURCE });
    expect(result.outcome).toBe('DENY');
    expect(connector.toolCalls('tdfol_batch_prove')).toHaveLength(0);
  });
});
