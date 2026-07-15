import { describe, expect, it } from 'vitest';
import {
  AGENT_SUPERVISOR_CONSOLE_CONTRACT,
  buildAgentSupervisorInvocation,
  createAgentSupervisorConsoleGateway,
  createAgentSupervisorThreeBackendRuntime,
  listAgentSupervisorCapabilities,
  type AgentSupervisorGatewayTransport,
} from '../../src/services/mcp/browser-mcp';
import { AllAppToolGateway, type BrowserMediatedToolCall } from '../../src/services/mcp/all-app-tool-gateway';
import { getAllAppLiveToolBinding } from '../../src/services/apps/all-app-live-tool-bindings';

describe('Agent Supervisor browser gateway contract', () => {
  it('declares all browser-safe read and governed write capabilities with backend owners', () => {
    const capabilities = listAgentSupervisorCapabilities();
    const byId = new Map(capabilities.map(capability => [capability.id, capability]));

    expect(AGENT_SUPERVISOR_CONSOLE_CONTRACT.browser_safe).toBe(true);
    expect(byId.get('supervisor.health.read')).toMatchObject({ access: 'read', owner: 'ipfs_accelerate_py' });
    expect(byId.get('supervisor.queue.read')).toMatchObject({ access: 'read', owner: 'ipfs_accelerate_py' });
    expect(byId.get('supervisor.goals.read')).toMatchObject({ access: 'read', owner: 'ipfs_accelerate_py' });
    expect(byId.get('supervisor.subgoals.read')).toMatchObject({ access: 'read', owner: 'ipfs_accelerate_py' });
    expect(byId.get('supervisor.taskboard.links.read')).toMatchObject({ access: 'read', owner: 'ipfs_datasets_py' });
    expect(byId.get('supervisor.logs.read')).toMatchObject({ access: 'read', owner: 'ipfs_accelerate_py' });
    expect(byId.get('supervisor.receipts.read')).toMatchObject({ access: 'read', owner: 'ipfs_kit_py' });
    expect(byId.get('supervisor.run-history.search')).toMatchObject({ access: 'read', owner: 'ipfs_datasets_py' });
    expect(byId.get('supervisor.prompt-steering.request')).toMatchObject({ access: 'governed-write', owner: 'ipfs_accelerate_py', policy_class: 'confirm' });
    expect(byId.get('supervisor.task-control.request')).toMatchObject({ access: 'governed-write', owner: 'ipfs_accelerate_py', policy_class: 'privileged-control' });

    expect(AGENT_SUPERVISOR_CONSOLE_CONTRACT.forbidden_browser_surfaces).toEqual(expect.arrayContaining([
      'host_state_file_read',
      'host_process_launch',
      'direct_implementation_supervisor_call',
      'unmediated_prompt_mutation',
    ]));
  });

  it('builds typed invocations without direct host implementation details', () => {
    const invocation = buildAgentSupervisorInvocation('supervisor.taskboard.links.read', { limit: 10 }, 'corr-1');

    expect(invocation).toEqual({
      capability_id: 'supervisor.taskboard.links.read',
      owner: 'ipfs_datasets_py',
      method: 'agent_supervisor.taskboard.links.read',
      access: 'read',
      policy_class: 'read',
      payload: { limit: 10 },
      correlation_id: 'corr-1',
    });
  });

  it('returns typed unavailable states when no browser transport is configured', async () => {
    const gateway = createAgentSupervisorConsoleGateway();
    const result = await gateway.health('corr-unconfigured');

    expect(result).toMatchObject({
      state: 'unavailable',
      capability_id: 'supervisor.health.read',
      owner: 'ipfs_accelerate_py',
      reason: 'not_configured',
      correlation_id: 'corr-unconfigured',
    });
  });

  it('blocks governed writes before transport when confirmation is missing', async () => {
    const gateway = createAgentSupervisorConsoleGateway({
      async invoke() {
        throw new Error('transport should not be called');
      },
    });

    const result = await gateway.requestPromptSteering({
      target_type: 'goal',
      target_id: 'SWR-104',
      prompt: 'prioritize browser-safe contract evidence',
      dry_run: false,
    });

    expect(result).toMatchObject({
      state: 'denied',
      capability_id: 'supervisor.prompt-steering.request',
      owner: 'ipfs_accelerate_py',
      reason: 'confirmation_required',
      required_confirmation: true,
    });
  });

  it('dispatches accepted governed requests through the injected transport', async () => {
    const seen: string[] = [];
    const transport: AgentSupervisorGatewayTransport = {
      async invoke(invocation) {
        seen.push(invocation.method);
        return {
          state: 'available',
          capability_id: invocation.capability_id,
          owner: invocation.owner,
          correlation_id: invocation.correlation_id,
          data: {
            request_id: 'req-1',
            accepted: true,
            dry_run: true,
            normalized_target: 'task:SWR-104',
            policy_class: invocation.policy_class,
            affected_task_ids: ['SWR-104'],
            receipt: {
              receipt_id: 'receipt-1',
              owner: 'ipfs_kit_py',
            },
          },
        };
      },
    };

    const gateway = createAgentSupervisorConsoleGateway(transport);
    const result = await gateway.requestTaskControl({
      task_id: 'SWR-104',
      action: 'retry',
      reason: 'refresh gateway contract evidence',
      dry_run: true,
    }, 'corr-accepted');

    expect(seen).toEqual(['agent_supervisor.task_control.request']);
    expect(result).toMatchObject({
      state: 'available',
      capability_id: 'supervisor.task-control.request',
      owner: 'ipfs_accelerate_py',
      correlation_id: 'corr-accepted',
      data: {
        request_id: 'req-1',
        receipt: {
          receipt_id: 'receipt-1',
          owner: 'ipfs_kit_py',
        },
      },
    });
  });

  it('uses all three materialized bindings and exposes kit-to-Helia recovery evidence', async () => {
    const calls: BrowserMediatedToolCall[] = [];
    const tools = ['ipfs_accelerate_py', 'ipfs_datasets_py', 'ipfs_kit_py'].flatMap(owner => {
      const binding = getAllAppLiveToolBinding(`agent-supervisor.${owner}.${owner === 'ipfs_accelerate_py' ? 'supervise_agent_work' : owner === 'ipfs_datasets_py' ? 'query_catalog' : 'retrieve_content'}`);
      if (!binding) throw new Error(`missing ${owner} binding`);
      // The live binding's preferred tool is selected from the executable contract by its capability.
      const tool = owner === 'ipfs_accelerate_py' ? 'get_task' : owner === 'ipfs_datasets_py' ? 'load_dataset' : 'ipfs_cat';
      return [{ owner: binding.owner, tool_id: tool, capabilities: [owner === 'ipfs_accelerate_py' ? 'ipfs.accelerate.supervisor' : owner === 'ipfs_datasets_py' ? 'ipfs.datasets.discovery' : 'ipfs.kit.storage'] }];
    });
    const runtime = createAgentSupervisorThreeBackendRuntime({
      tool_gateway: new AllAppToolGateway({
        http: {
          kind: 'http',
          async invoke(call) {
            calls.push(call);
            if (call.owner === 'ipfs_kit_py') throw new Error('kit temporarily unreachable');
            return {
              ok: true, owner: call.owner, tool_id: call.tool_id, transport: call.transport,
              correlation_id: call.correlation_id, outcome: 'executed', result: { owner: call.owner, assistance: true },
              receipt: { receipt_id: `receipt:${call.owner}`, owner: call.owner, tool_id: call.tool_id, transport: call.transport, correlation_id: call.correlation_id, policy_outcome: 'allow', outcome: 'executed' },
            };
          },
        },
      }),
      discovered_tools: tools,
      available_transports: ['http'],
      helia: { put: async () => ({ cid: 'bafybrowserheliacheckpoint' }), get: async cid => ({ cid, from: 'helia' }) },
    });

    const [state, policy, checkpoint, content] = await Promise.all([
      runtime.invoke(buildAgentSupervisorInvocation('supervisor.queue.read', {}, 'corr-state')),
      runtime.invoke(buildAgentSupervisorInvocation('supervisor.policy.assist', {}, 'corr-policy')),
      runtime.invoke(buildAgentSupervisorInvocation('supervisor.event-dag.checkpoint', { confirmation_token: 'confirm' }, 'corr-checkpoint')),
      runtime.invoke(buildAgentSupervisorInvocation('supervisor.content.retrieve', { cid: 'bafybrowserheliacheckpoint' }, 'corr-content')),
    ]);

    expect(state).toMatchObject({ state: 'available', owner: 'ipfs_accelerate_py', runtime: { transport: 'http', policy_outcome: 'allow' } });
    expect(policy).toMatchObject({ state: 'available', owner: 'ipfs_datasets_py', runtime: { binding_id: 'agent-supervisor.ipfs_datasets_py.query_catalog' } });
    expect(checkpoint).toMatchObject({ state: 'available', owner: 'ipfs_kit_py', runtime: { transport: 'browser-helia', content_cid: 'bafybrowserheliacheckpoint' } });
    expect(content).toMatchObject({ state: 'available', owner: 'ipfs_kit_py', data: { cid: 'bafybrowserheliacheckpoint', from: 'helia' }, runtime: { transport: 'browser-helia', content_cid: 'bafybrowserheliacheckpoint' } });
    expect(new Set(calls.map(call => call.owner))).toEqual(new Set(['ipfs_accelerate_py', 'ipfs_datasets_py', 'ipfs_kit_py']));
  });
});
