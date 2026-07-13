import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MCPPP_PROFILE_G_CAPABILITY,
  MCPPPServerConnector,
} from '../../src/services/mcp/mcp-plus-plus-connector';
import {
  getAgentSupervisorConsoleContract,
  AgentSupervisorConsoleGateway,
} from '../../src/services/mcp/agent-supervisor-console-gateway';

const profile = {
  version: '1.0', artifact_schema_major: 1, risk_model_cids: [],
  lease_clock: 'unix-ms-with-logical-epoch', limits: { max_page_size: 100 },
  transports: ['jsonrpc-http', 'mcp+p2p'],
};

const mutation = {
  caller_did: 'did:key:z6Mktest', idempotency_key: 'request-1', correlation_id: 'corr-1',
  parents: [], proof_cid: 'bafyproof', policy_decision_cid: 'bafydecision',
};

describe('SwissKnife MCP++ Profile G connector', () => {
  afterEach(() => vi.restoreAllMocks());

  it('negotiates Profile G and preserves every canonical operation name', async () => {
    const methods: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input: any, init?: any) => {
      if (!init?.body) return response({ ok: true });
      const request = JSON.parse(init.body);
      methods.push(request.method);
      if (request.method === 'initialize') return response({ jsonrpc: '2.0', id: request.id, result: { capabilities: { experimental: { [MCPPP_PROFILE_G_CAPABILITY]: profile } } } });
      if (request.method === 'tools/list') return response({ jsonrpc: '2.0', id: request.id, result: { tools: [] } });
      if (request.method === 'mcp++/risk/profile') return response({ jsonrpc: '2.0', id: request.id, result: profile });
      return response({ jsonrpc: '2.0', id: request.id, result: { items: [], receipt_cid: 'bafyreceipt' } });
    });

    const connector = new MCPPPServerConnector({
      name: 'profile-g', baseUrl: 'http://profile-g.test', mcpPath: '/mcp',
      toolsPath: '/tools', healthPath: '/health',
    });
    expect((await connector.connect()).profiles).toContain(MCPPP_PROFILE_G_CAPABILITY);

    await connector.getRiskSchedulingProfile();
    await connector.createGoal({ ...mutation, artifact: {} });
    await connector.getGoal('bafygoal'); await connector.listGoals();
    await connector.decomposeGoal({ ...mutation, goal_cid: 'bafygoal' });
    await connector.selectGoalPlan({ ...mutation, goal_cid: 'bafygoal', plan_branch_cid: 'bafybranch' });
    await connector.createTask({ ...mutation, artifact: {} });
    await connector.getTask('bafytask'); await connector.listTasks(); await connector.listReadyTasks();
    await connector.assessRisk({ ...mutation, task_cid: 'bafytask' });
    await connector.getRiskEvidence('bafytask'); await connector.getRiskHistory('bafytask');
    await connector.queryNeighborhood(); await connector.attestNeighborhood({ ...mutation });
    await connector.getScheduleFrontier(); await connector.getScheduleStatus('bafytask');
    await connector.proposeSchedule(mutation);
    await connector.claimTask({ ...mutation, task_cid: 'bafytask', requested_lease_ms: 30_000 });
    await connector.renewTaskClaim({ ...mutation, claim_cid: 'bafyclaim', fencing_token: 1 });
    await connector.releaseTaskClaim({ ...mutation, claim_cid: 'bafyclaim', fencing_token: 1 });
    await connector.resolveTaskClaims(mutation); await connector.reconcileSchedule(mutation);

    expect(new Set(methods)).toEqual(new Set([
      'initialize', 'tools/list', 'mcp++/risk/profile',
      'mcp++/goals/create', 'mcp++/goals/get', 'mcp++/goals/list', 'mcp++/goals/decompose', 'mcp++/goals/select',
      'mcp++/tasks/create', 'mcp++/tasks/get', 'mcp++/tasks/list', 'mcp++/tasks/ready',
      'mcp++/risk/assess', 'mcp++/risk/evidence', 'mcp++/risk/history',
      'mcp++/neighborhood/query', 'mcp++/neighborhood/attest',
      'mcp++/schedule/frontier', 'mcp++/schedule/status', 'mcp++/schedule/propose',
      'mcp++/schedule/claim', 'mcp++/schedule/renew', 'mcp++/schedule/release',
      'mcp++/schedule/resolve', 'mcp++/schedule/reconcile',
    ]));
  });

  it('fails closed before negotiation and for incomplete mutation authority', async () => {
    const connector = new MCPPPServerConnector({ name: 'offline', baseUrl: '', mcpPath: '', toolsPath: '', healthPath: '' });
    await expect(connector.listGoals()).rejects.toThrow('not negotiated');
    await expect(connector.claimTask({ task_cid: 'bafytask', requested_lease_ms: 1000 } as any)).rejects.toThrow('not negotiated');
  });

  it('publishes typed read telemetry and separately governed scheduling mappings', async () => {
    const contract = getAgentSupervisorConsoleContract();
    expect(contract.capabilities.filter(item => item.method.startsWith('mcp++/'))).toHaveLength(11);
    expect(contract.capabilities.find(item => item.id === 'supervisor.neighborhood.read')).toMatchObject({ access: 'read', policy_class: 'read' });
    expect(contract.capabilities.find(item => item.id === 'supervisor.schedule.claim')).toMatchObject({ access: 'governed-write', policy_class: 'privileged-control', receipt_required: true });

    const calls: any[] = [];
    const gateway = new AgentSupervisorConsoleGateway({ invoke: async invocation => {
      calls.push(invocation);
      return { state: 'available', capability_id: invocation.capability_id, owner: invocation.owner, data: [] } as any;
    } });
    await gateway.profileG(); await gateway.frontier(); await gateway.neighborhood(); await gateway.claims(); await gateway.risk();
    expect(calls.map(call => call.method)).toEqual([
      'mcp++/risk/profile', 'mcp++/schedule/frontier', 'mcp++/neighborhood/query',
      'mcp++/schedule/status', 'mcp++/risk/history',
    ]);
  });
});

function response(body: unknown): any {
  return Promise.resolve({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
}
