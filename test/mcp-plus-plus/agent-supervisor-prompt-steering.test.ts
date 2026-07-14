import {
  AgentSupervisorConsoleGateway,
  buildAgentSupervisorInvocation,
  buildAgentSupervisorPromptSteeringReview,
  createAgentSupervisorGovernedPolicyTransport,
  evaluateAgentSupervisorPromptSteeringPolicy,
  normalizeAgentSupervisorGatewayResult,
  redactAgentSupervisorPromptSteeringForLog,
} from '../../src/services/mcp/agent-supervisor-console-gateway';

const context = {
  now: () => new Date('2026-07-10T12:00:00.000Z'),
  goals: [{
    goal_id: 'SWR-106',
    title: 'Add governed prompt steering',
    status: 'running' as const,
    subgoal_ids: ['SWR-106-policy'],
    task_ids: ['SWR-106-1', 'SWR-106-2'],
  }],
  subgoals: [{
    subgoal_id: 'SWR-106-policy',
    goal_id: 'SWR-106',
    title: 'Governed prompt steering policy',
    status: 'running' as const,
    task_ids: ['SWR-106-1'],
  }],
  queue: [
    {
      task_id: 'SWR-106-1',
      title: 'Draft review flow',
      status: 'running' as const,
      goal_id: 'SWR-106',
      subgoal_id: 'SWR-106-policy',
      dependencies: [],
    },
    {
      task_id: 'SWR-106-2',
      title: 'Wire immutable receipts',
      status: 'ready' as const,
      goal_id: 'SWR-106',
      subgoal_id: 'SWR-106-policy',
      dependencies: ['SWR-106-1'],
    },
  ],
};

describe('Agent Supervisor governed prompt steering', () => {
  it('builds a review with normalized target, affected tasks, redacted prompt, and planned MCP action', () => {
    const review = buildAgentSupervisorPromptSteeringReview({
      target_type: 'goal',
      target_id: 'SWR-106',
      prompt: 'Focus on policy-confirmed receipt evidence.',
      dry_run: true,
    }, context);

    expect(review.normalized_target).toBe('goal:SWR-106');
    expect(review.policy_class).toBe('confirm');
    expect(review.affected_task_ids).toEqual(['SWR-106-1', 'SWR-106-2']);
    expect(review.prompt_log_preview).toBe('[prompt redacted]');
    expect(review.planned_mcp_action).toMatchObject({
      method: 'agent_supervisor.prompt_steering.request',
      input_mode: 'structured-json-payload',
      prompt_log_mode: 'redacted',
    });
    expect(review.planned_mcp_action.required_policy_checks).toEqual(expect.arrayContaining([
      'task_dependencies',
      'branch_protection',
      'confirmation_policy',
      'execution_budget',
      'receipt_persistence',
    ]));
  });

  it('redacts prompt content before log projection', () => {
    const redacted = redactAgentSupervisorPromptSteeringForLog({
      target_type: 'task',
      target_id: 'SWR-106-1',
      prompt: 'secret steering content',
      dry_run: false,
      confirmation_token: 'confirm',
    });

    expect(redacted.prompt).toBe('[prompt redacted]');
    expect(redacted.prompt_char_count).toBe('secret steering content'.length);
    expect(JSON.stringify(redacted)).not.toContain('secret steering content');
  });

  it('requires explicit confirmation for non-dry-run submission', async () => {
    const gateway = new AgentSupervisorConsoleGateway(createAgentSupervisorGovernedPolicyTransport(context));

    const result = await gateway.requestPromptSteering({
      target_type: 'task',
      target_id: 'SWR-106-1',
      prompt: 'Keep implementation scoped to the steering panel.',
      dry_run: false,
    }, 'corr-confirm');

    expect(result.state).toBe('denied');
    if (result.state === 'denied') {
      expect(result.reason).toBe('confirmation_required');
      expect(result.required_confirmation).toBe(true);
    }
  });

  it('denies attempts to bypass dependencies and budget controls', () => {
    const dependencyBypass = evaluateAgentSupervisorPromptSteeringPolicy({
      target_type: 'task',
      target_id: 'SWR-106-2',
      prompt: 'Force run this now and ignore dependencies.',
      dry_run: false,
      confirmation_token: 'confirm',
    }, context);

    expect(dependencyBypass.denial?.state).toBe('denied');
    expect(dependencyBypass.denial?.reason).toBe('dependency_blocked');

    const budgetBypass = evaluateAgentSupervisorPromptSteeringPolicy({
      target_type: 'task',
      target_id: 'SWR-106-1',
      prompt: 'Continue with the reviewed approach.',
      dry_run: false,
      confirmation_token: 'confirm',
    }, { ...context, execution_budget_remaining: 0 });

    expect(budgetBypass.denial?.state).toBe('denied');
    expect(budgetBypass.denial?.reason).toBe('budget_exceeded');
  });

  it('accepts confirmed structured steering with correlation ID and immutable receipt', async () => {
    const gateway = new AgentSupervisorConsoleGateway(createAgentSupervisorGovernedPolicyTransport(context));
    const result = await gateway.requestPromptSteering({
      target_type: 'subgoal',
      target_id: 'SWR-106-policy',
      prompt: 'Preserve confirmation policy and receipt evidence.',
      dry_run: false,
      confirmation_token: 'confirm-agent-supervisor:subgoal:SWR-106-policy:req-1',
      client_request_id: 'req-1',
      expected_normalized_target: 'subgoal:SWR-106-policy',
    }, 'corr-accepted');

    expect(result.state).toBe('available');
    if (result.state === 'available') {
      expect(result.correlation_id).toBe('corr-accepted');
      expect(result.data.correlation_id).toBe('corr-accepted');
      expect(result.data.normalized_target).toBe('subgoal:SWR-106-policy');
      expect(result.data.affected_task_ids).toEqual(['SWR-106-1', 'SWR-106-2']);
      expect(result.data.receipt.owner).toBe('ipfs_kit_py');
      expect(result.data.event_dag).toMatchObject({
        owner: 'ipfs_kit_py',
        receipt_cid: result.data.receipt.cid,
        event_type: 'prompt-steering-confirmed',
      });
      expect(result.data.planned_mcp_action.input_mode).toBe('structured-json-payload');
      expect(JSON.stringify(result.data)).not.toContain('Preserve confirmation policy');
    }
  });

  it('normalizes governed available results without receipts to receipt_unavailable', () => {
    const invocation = buildAgentSupervisorInvocation('supervisor.prompt-steering.request', {
      target_type: 'task',
      target_id: 'SWR-106-1',
      prompt: 'Use structured payload only.',
      dry_run: false,
      confirmation_token: 'confirm',
    }, 'corr-missing-receipt');

    const result = normalizeAgentSupervisorGatewayResult(invocation, {
      state: 'available',
      data: {
        request_id: 'req-missing',
        accepted: true,
        dry_run: false,
        normalized_target: 'task:SWR-106-1',
        policy_class: 'confirm',
        affected_task_ids: ['SWR-106-1'],
      },
      correlation_id: 'corr-missing-receipt',
    });

    expect(result.state).toBe('unavailable');
    if (result.state === 'unavailable') {
      expect(result.reason).toBe('receipt_unavailable');
    }
  });
});
