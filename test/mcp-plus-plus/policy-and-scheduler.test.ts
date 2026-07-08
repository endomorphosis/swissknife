/**
 * Phase 6 — Policy Engine tests
 * Phase 8 — Risk Scorer tests
 */

<<<<<<< HEAD
import { PolicyEngine, Policy, computePolicyCID } from '../../src/services/logic/deontic/mcp-policy';
import { RiskScorer, MCPScheduler } from '../../src/services/mcp/mcp-scheduler';
import { EventDAG } from '../../src/services/mcp/mcp-event-dag';
=======
import { PolicyEngine, Policy, computePolicyCID } from '../../src/services/mcp/mcp-policy';
import { RiskScorer, MCPScheduler } from '../../src/services/mcp/mcp-scheduler';
import { EventDAG } from '../../src/services/event-dag';
>>>>>>> 1569811 (chore: add pending swissknife staged changes)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = Math.floor(Date.now() / 1000);

const ALLOW_ALL_POLICY: Policy = {
  id: 'test-allow-all',
  version: '1.0.0',
  permissions: [{ cap: '*', rsc: '*' }],
  prohibitions: [],
  obligations: [],
};

const DENY_WRITE_POLICY: Policy = {
  id: 'test-deny-write',
  version: '1.0.0',
  permissions: [{ cap: 'mcp++/invoke', rsc: '*' }],
  prohibitions: [{ cap: 'mcp++/write', rsc: '*' }],
  obligations: [],
};

const WITH_OBLIGATION_POLICY: Policy = {
  id: 'test-obligation',
  version: '1.0.0',
  permissions: [{ cap: '*', rsc: '*' }],
  prohibitions: [],
  obligations: [
    {
      description: 'Log the access',
      deadline: NOW + 60,
      requiredCap: 'mcp++/log',
    },
  ],
};

const TEMPORAL_POLICY: Policy = {
  id: 'test-temporal',
  version: '1.0.0',
  permissions: [{ cap: '*', rsc: '*' }],
  prohibitions: [],
  obligations: [],
  temporal: { notBefore: NOW - 100, notAfter: NOW + 100 },
};

const EXPIRED_POLICY: Policy = {
  id: 'test-expired',
  version: '1.0.0',
  permissions: [{ cap: '*', rsc: '*' }],
  prohibitions: [],
  obligations: [],
  temporal: { notAfter: NOW - 10 },
};

const RATE_LIMITED_POLICY: Policy = {
  id: 'test-rate-limit',
  version: '1.0.0',
  permissions: [
    { cap: 'mcp++/invoke', rsc: '*', temporal: { maxInvocations: 2, windowSeconds: 3600 } },
  ],
  prohibitions: [],
  obligations: [],
};

// ---------------------------------------------------------------------------
// PolicyEngine tests
// ---------------------------------------------------------------------------

describe('PolicyEngine', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  describe('registerPolicy', () => {
    it('returns a sha256: CID', () => {
      const cid = engine.registerPolicy(ALLOW_ALL_POLICY);
      expect(cid).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it('same policy → same CID', () => {
      const cid1 = engine.registerPolicy(ALLOW_ALL_POLICY);
      const cid2 = engine.registerPolicy(ALLOW_ALL_POLICY);
      expect(cid1).toBe(cid2);
    });
  });

  describe('computePolicyCID', () => {
    it('is deterministic', () => {
      expect(computePolicyCID(ALLOW_ALL_POLICY)).toBe(computePolicyCID({ ...ALLOW_ALL_POLICY }));
    });

    it('differs for different policies', () => {
      expect(computePolicyCID(ALLOW_ALL_POLICY)).not.toBe(computePolicyCID(DENY_WRITE_POLICY));
    });
  });

  describe('evaluatePolicy', () => {
    it('PERMIT when capability matches a permission', () => {
      const cid = engine.registerPolicy(ALLOW_ALL_POLICY);
      const decision = engine.evaluatePolicy(cid, { cap: 'mcp++/invoke', rsc: 'mcp++/tools/search' });
      expect(decision.outcome).toBe('PERMIT');
    });

    it('DENY when no matching permission', () => {
      const cid = engine.registerPolicy(DENY_WRITE_POLICY);
      const decision = engine.evaluatePolicy(cid, { cap: 'mcp++/delete', rsc: 'mcp++/tools/search' });
      expect(decision.outcome).toBe('DENY');
    });

    it('DENY when prohibited', () => {
      const cid = engine.registerPolicy(DENY_WRITE_POLICY);
      const decision = engine.evaluatePolicy(cid, { cap: 'mcp++/write', rsc: 'anything' });
      expect(decision.outcome).toBe('DENY');
    });

    it('OBLIGATION_SPAWNED when policy has obligations', () => {
      const cid = engine.registerPolicy(WITH_OBLIGATION_POLICY);
      const decision = engine.evaluatePolicy(cid, { cap: 'mcp++/invoke', rsc: '*' });
      expect(decision.outcome).toBe('OBLIGATION_SPAWNED');
      expect(decision.obligations.length).toBe(1);
      expect(decision.obligations[0].description).toBe('Log the access');
    });

    it('DENY when policy is temporally expired', () => {
      const cid = engine.registerPolicy(EXPIRED_POLICY);
      const decision = engine.evaluatePolicy(cid, { cap: 'mcp++/invoke', rsc: '*' });
      expect(decision.outcome).toBe('DENY');
    });

    it('PERMIT when policy is within temporal window', () => {
      const cid = engine.registerPolicy(TEMPORAL_POLICY);
      const decision = engine.evaluatePolicy(cid, { cap: 'mcp++/invoke', rsc: '*' });
      expect(decision.outcome).toBe('PERMIT');
    });

    it('DENY when policy is not found', () => {
      const decision = engine.evaluatePolicy('sha256:notfound' + '0'.repeat(56), {
        cap: 'mcp++/invoke', rsc: '*',
      });
      expect(decision.outcome).toBe('DENY');
    });

    it('enforces rate limit', () => {
      const cid = engine.registerPolicy(RATE_LIMITED_POLICY);
      const ctx = { cap: 'mcp++/invoke', rsc: 'anything' };
      const r1 = engine.evaluatePolicy(cid, ctx);
      const r2 = engine.evaluatePolicy(cid, ctx);
      const r3 = engine.evaluatePolicy(cid, ctx); // over limit
      expect(r1.outcome).toBe('PERMIT');
      expect(r2.outcome).toBe('PERMIT');
      expect(r3.outcome).toBe('DENY');
    });

    it('returns a decision_cid for every decision', () => {
      const cid = engine.registerPolicy(ALLOW_ALL_POLICY);
      const decision = engine.evaluatePolicy(cid, { cap: '*', rsc: '*' });
      expect(decision.decision_cid).toMatch(/^sha256:/);
    });
  });

  describe('obligation tracking', () => {
    it('fulfils an active obligation', () => {
      const cid = engine.registerPolicy(WITH_OBLIGATION_POLICY);
      engine.evaluatePolicy(cid, { cap: 'mcp++/invoke', rsc: '*' });
      expect(engine.getActiveObligations().length).toBe(1);
      const ok = engine.fulfillObligation('Log the access');
      expect(ok).toBe(true);
      expect(engine.getActiveObligations().length).toBe(0);
    });

    it('marks overdue obligations', () => {
      const pastDeadlinePolicy: Policy = {
        ...WITH_OBLIGATION_POLICY,
        id: 'overdue-test',
        obligations: [
          { description: 'Overdue task', deadline: NOW - 100 },
        ],
      };
      const cid = engine.registerPolicy(pastDeadlinePolicy);
      engine.evaluatePolicy(cid, { cap: 'mcp++/invoke', rsc: '*' });
      const overdue = engine.checkObligationDeadlines();
      expect(overdue.length).toBe(1);
      expect(overdue[0].overdue).toBe(true);
    });

    it('emits obligation:spawned event', async () => {
      const emitted = new Promise<void>((resolve) => {
        engine.on('obligation:spawned', (ob) => {
          expect(ob.description).toBe('Log the access');
          resolve();
        });
      });
      const cid = engine.registerPolicy(WITH_OBLIGATION_POLICY);
      engine.evaluatePolicy(cid, { cap: 'mcp++/invoke', rsc: '*' });
      await emitted;
    });
  });
});

// ---------------------------------------------------------------------------
// RiskScorer tests
// ---------------------------------------------------------------------------

describe('RiskScorer', () => {
  let dag: EventDAG;
  let scorer: RiskScorer;

  beforeEach(() => {
    dag = new EventDAG();
    scorer = new RiskScorer(dag);
  });

  it('returns score 0 for empty parent set', () => {
    const risk = scorer.computeRisk([]);
    expect(risk.score).toBe(0);
  });

  it('counts unauthorised invocations (no proofs)', () => {
    const cid = dag.appendEvent({
      intent_cid: 'sha256:a' + '0'.repeat(63),
      interface_cid: 'sha256:i' + '0'.repeat(63),
      proofs: [], // no proof → unauthorised
      decision_outcome: 'PERMIT',
      outputs: [],
      parents: [],
      timestamp: new Date().toISOString(),
    });
    const risk = scorer.computeRisk([cid]);
    expect(risk.factors.unauthorisedInvocations).toBe(1);
    expect(risk.score).toBeGreaterThan(0);
  });

  it('counts disputed receipts', () => {
    const outputCid = 'sha256:disputed' + '0'.repeat(55);
    const cid = dag.appendEvent({
      intent_cid: 'sha256:a' + '0'.repeat(63),
      interface_cid: 'sha256:i' + '0'.repeat(63),
      proofs: ['some-proof'],
      decision_outcome: 'PERMIT',
      outputs: [outputCid],
      parents: [],
      timestamp: new Date().toISOString(),
    });
    scorer.disputeReceipt(outputCid);
    const risk = scorer.computeRisk([cid]);
    expect(risk.factors.disputedReceipts).toBe(1);
  });

  it('caps score at 1.0', () => {
    // Add many violations
    const cids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const c = dag.appendEvent({
        intent_cid: `sha256:${'a'.repeat(6)}${i.toString().padStart(58, '0')}`,
        interface_cid: 'sha256:i' + '0'.repeat(63),
        proofs: [],
        outputs: [],
        parents: cids.slice(-1),
        timestamp: new Date().toISOString(),
      });
      cids.push(c);
    }
    const risk = scorer.computeRisk(cids.slice(-1));
    expect(risk.score).toBeLessThanOrEqual(1.0);
  });
});

// ---------------------------------------------------------------------------
// MCPScheduler tests
// ---------------------------------------------------------------------------

describe('MCPScheduler', () => {
  it('executes calls through the executor', async () => {
    const scheduler = new MCPScheduler<string>();
    const results: string[] = [];
    scheduler.setExecutor(async (call) => { results.push(call); });

    scheduler.scheduleToolCall('call-a');
    scheduler.scheduleToolCall('call-b');

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(results.length).toBe(2);
  });

  it('executes lower priority hint first', async () => {
    const scheduler = new MCPScheduler<string>({ maxConcurrent: 1 });
    const order: string[] = [];
    scheduler.setExecutor(async (call) => { order.push(call); });

    scheduler.scheduleToolCall('high', 0);
    scheduler.scheduleToolCall('low', 10);

    await new Promise(resolve => setTimeout(resolve, 20));
    expect(order[0]).toBe('high');
  });

  it('emits enqueued + completed events', async () => {
    const scheduler = new MCPScheduler<string>();
    let enqueued = false;
    scheduler.on('enqueued', () => { enqueued = true; });
    const completed = new Promise<void>(resolve => {
      scheduler.on('completed', () => {
        expect(enqueued).toBe(true);
        resolve();
      });
    });
    scheduler.setExecutor(async () => 'ok');
    scheduler.scheduleToolCall('x');
    await completed;
  });
});
