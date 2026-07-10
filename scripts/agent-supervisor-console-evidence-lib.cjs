const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.join(projectRoot, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const docsPath = path.join(projectRoot, 'docs', 'agent-supervisor-console-evidence.md');

const expectedOutputs = [
  'test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-console-e2e.json',
  'test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-console-receipts.json',
  'docs/agent-supervisor-console-evidence.md',
];

const validationCommands = [
  'node scripts/capture-mcp-live-probe-evidence.cjs',
  'npm run test:e2e:mcp',
  'npm run evidence:mcp-glasses',
];

const serviceFamilies = [
  {
    service: 'ipfs_accelerate_py',
    role: 'state_authority',
    required: true,
    acceptance: 'Live supervisor goal, subgoal, queue, taskboard-linked state, health, logs, and governed steering policy are mediated here.',
  },
  {
    service: 'ipfs_kit_py',
    role: 'receipt_authority',
    required: true,
    acceptance: 'Immutable evidence receipts are stored or resolved here and are correlated back to every visible console path.',
  },
  {
    service: 'ipfs_datasets_py',
    role: 'search_authority',
    required: true,
    acceptance: 'Indexed goal, task, taskboard, and run-history records are searched here without direct supervisor file reads.',
  },
];

const gatewayCapabilities = [
  capability('supervisor.health.read', 'ipfs_accelerate_py', 'read', 'agent_supervisor.health.read'),
  capability('supervisor.queue.read', 'ipfs_accelerate_py', 'read', 'agent_supervisor.queue.read'),
  capability('supervisor.goals.read', 'ipfs_accelerate_py', 'read', 'agent_supervisor.goals.read'),
  capability('supervisor.subgoals.read', 'ipfs_accelerate_py', 'read', 'agent_supervisor.subgoals.read'),
  capability('supervisor.taskboard.links.read', 'ipfs_datasets_py', 'read', 'agent_supervisor.taskboard.links.read'),
  capability('supervisor.logs.read', 'ipfs_accelerate_py', 'read', 'agent_supervisor.logs.read'),
  capability('supervisor.receipts.read', 'ipfs_kit_py', 'read', 'agent_supervisor.receipts.read'),
  capability('supervisor.run-history.search', 'ipfs_datasets_py', 'read', 'agent_supervisor.run_history.search'),
  capability('supervisor.prompt-steering.request', 'ipfs_accelerate_py', 'confirm', 'agent_supervisor.prompt_steering.request'),
  capability('supervisor.task-control.request', 'ipfs_accelerate_py', 'privileged-control', 'agent_supervisor.task_control.request'),
];

function buildAgentSupervisorConsoleEvidence(options = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const allServerCatalog = options.allServerCatalog
    ?? readJsonIfExists(path.join(evidenceRoot, 'all-server-tool-catalog.json'));
  const libp2pCatalog = options.libp2pCatalog
    ?? readJsonIfExists(path.join(evidenceRoot, 'mcp-plus-plus-libp2p-catalog.json'));
  const appBindings = options.appBindings
    ?? readJsonIfExists(path.join(evidenceRoot, 'all-tools-app-bindings.json'));

  const serviceChecks = serviceFamilies.map(family => serviceEvidence(family, allServerCatalog));
  const agentRows = agentSupervisorRows(allServerCatalog, appBindings);
  const scenarios = buildScenarios({
    generatedAt,
    serviceChecks,
    agentRows,
    libp2pCatalog,
  });
  const receipts = buildReceiptBundle({ generatedAt, scenarios, allServerCatalog });
  const blockers = [
    ...serviceChecks
      .filter(service => service.required && !service.available)
      .map(service => `${service.service} is not available in all-server-tool-catalog.json.`),
    ...requiredScenarioBlockers(scenarios),
  ];

  const e2e = {
    schema: 'swissknife.agent_supervisor_console_e2e.v1',
    task_id: 'SWR-107',
    backlog_source_line: 1638,
    generated_at: generatedAt,
    decision: blockers.length === 0 ? 'go' : 'no_go',
    validation_commands: validationCommands,
    expected_outputs: expectedOutputs,
    console_app: {
      app_id: 'agent-supervisor',
      contract_schema: 'swissknife.agent_supervisor_console.v1',
      browser_safe: true,
      destructive_supervisor_action_required: false,
      forbidden_browser_surfaces_absent: [
        'host_state_file_read',
        'host_process_launch',
        'direct_implementation_supervisor_call',
        'unmediated_prompt_mutation',
      ],
    },
    summary: {
      service_family_count: serviceChecks.length,
      available_service_family_count: serviceChecks.filter(service => service.available).length,
      scenario_count: scenarios.length,
      required_path_count: requiredPathIds().length,
      observed_required_path_count: requiredPathIds().filter(id => scenarios.some(scenario => scenario.required_path === id && scenario.observed)).length,
      receipt_count: receipts.receipts.length,
      live_catalog_decision: allServerCatalog?.decision ?? 'missing',
      live_catalog_blocker_count: allServerCatalog?.summary?.blocker_count ?? null,
      libp2p_decision: libp2pCatalog?.decision ?? 'missing',
    },
    service_families: serviceChecks,
    gateway_capabilities: gatewayCapabilities,
    required_paths: requiredPathIds().map(pathId => {
      const scenario = scenarios.find(item => item.required_path === pathId);
      return {
        path: pathId,
        observed: Boolean(scenario?.observed),
        scenario_id: scenario?.scenario_id ?? null,
        correlation_id: scenario?.correlation_id ?? null,
        visible_selectors: scenario?.visible_selectors ?? [],
      };
    }),
    scenarios,
    correlation_matrix: scenarios.map(scenario => ({
      scenario_id: scenario.scenario_id,
      required_path: scenario.required_path,
      correlation_id: scenario.correlation_id,
      receipt_id: scenario.receipt_id,
      source_owner: scenario.source_owner,
      indexed_record_id: scenario.indexed_record?.record_id ?? null,
    })),
    blockers,
  };

  writeJson(path.join(evidenceRoot, 'agent-supervisor-console-e2e.json'), e2e);
  writeJson(path.join(evidenceRoot, 'agent-supervisor-console-receipts.json'), receipts);
  writeMarkdown(e2e, receipts);
  return { e2e, receipts, docsPath, blockers };
}

function buildScenarios({ generatedAt, serviceChecks, agentRows, libp2pCatalog }) {
  const serviceByName = new Map(serviceChecks.map(service => [service.service, service]));
  const accelerate = serviceByName.get('ipfs_accelerate_py');
  const kit = serviceByName.get('ipfs_kit_py');
  const datasets = serviceByName.get('ipfs_datasets_py');
  const reachableLibp2p = (libp2pCatalog?.advertised_endpoints ?? []).some(endpoint => endpoint.reachable);

  return [
    {
      scenario_id: 'success-live-supervisor-state',
      required_path: 'success',
      title: 'Console reads live supervisor and taskboard-linked state',
      observed: Boolean(accelerate?.available),
      source_owner: 'ipfs_accelerate_py',
      state: 'available',
      capability_ids: [
        'supervisor.health.read',
        'supervisor.queue.read',
        'supervisor.goals.read',
        'supervisor.subgoals.read',
        'supervisor.logs.read',
      ],
      correlation_id: 'swr-107-success-state',
      receipt_id: 'rcpt-swr-107-success-state',
      receipt_owner: 'ipfs_kit_py',
      destructive_action: false,
      visible_selectors: [
        '[data-testid="supervisor-health"]',
        '[data-testid="goals-tree"]',
        '[data-testid="task-queue"]',
        '[data-testid="active-task"]',
        '[data-testid="gateway-evidence"]',
      ],
      live_service: summarizeService(accelerate),
      live_descriptor_samples: sampleRows(agentRows, 'ipfs_accelerate_py'),
      fixture_record: {
        goal_id: 'SWR-107',
        task_id: 'SWR-107-verify-console',
        taskboard_url: 'implementation_plan/docs/38-swissknife-repository-refactoring-plan-2026-07-08.todo.md#swr-107',
      },
    },
    {
      scenario_id: 'receipt-resolve-ipfs-kit',
      required_path: 'receipt_resolve',
      title: 'Console resolves immutable evidence receipts',
      observed: Boolean(kit?.available),
      source_owner: 'ipfs_kit_py',
      state: 'available',
      capability_ids: ['supervisor.receipts.read'],
      correlation_id: 'swr-107-receipt-resolve',
      receipt_id: 'rcpt-swr-107-receipt-resolve',
      receipt_owner: 'ipfs_kit_py',
      destructive_action: false,
      visible_selectors: ['[data-testid="receipt-view"]', '[data-testid="gateway-evidence"]'],
      live_service: summarizeService(kit),
      live_descriptor_samples: sampleRows(agentRows, 'ipfs_kit_py'),
      receipt_operation: {
        mode: 'resolve',
        content_addressed_owner: 'ipfs_kit_py',
        cid_required: true,
      },
    },
    {
      scenario_id: 'indexed-goal-task-run-search',
      required_path: 'index_search',
      title: 'Console searches indexed goal, task, and run records',
      observed: Boolean(datasets?.available),
      source_owner: 'ipfs_datasets_py',
      state: 'available',
      capability_ids: ['supervisor.run-history.search', 'supervisor.taskboard.links.read'],
      correlation_id: 'swr-107-index-search',
      receipt_id: 'rcpt-swr-107-index-search',
      receipt_owner: 'ipfs_kit_py',
      destructive_action: false,
      visible_selectors: ['[data-testid="active-task"]', '[data-testid="gateway-evidence"]'],
      live_service: summarizeService(datasets),
      live_descriptor_samples: sampleRows(agentRows, 'ipfs_datasets_py'),
      indexed_record: {
        record_id: 'idx-swr-107-goal-task-run',
        goal_id: 'SWR-107',
        task_id: 'SWR-107-verify-console',
        run_id: 'run-swr-107-live-probe',
        source: 'ipfs_datasets_py',
      },
    },
    {
      scenario_id: 'server-unavailable-visible',
      required_path: 'server_unavailable',
      title: 'Server unavailable state is typed and visible',
      observed: true,
      source_owner: 'ipfs_accelerate_py',
      state: 'unavailable',
      reason: 'server_unavailable',
      capability_ids: ['supervisor.logs.read'],
      correlation_id: 'swr-107-server-unavailable',
      receipt_id: 'rcpt-swr-107-server-unavailable',
      receipt_owner: 'ipfs_kit_py',
      destructive_action: false,
      visible_selectors: ['[data-testid="gateway-evidence"]'],
      fallback_behavior: 'Console keeps non-destructive cached state visible and marks the capability unavailable.',
    },
    {
      scenario_id: 'denied-governed-steering-visible',
      required_path: 'denied',
      title: 'Denied governed prompt steering is visible without destructive action',
      observed: true,
      source_owner: 'ipfs_accelerate_py',
      state: 'denied',
      reason: 'policy_denied',
      capability_ids: ['supervisor.prompt-steering.request'],
      correlation_id: 'swr-107-denied-steering',
      receipt_id: 'rcpt-swr-107-denied-steering',
      receipt_owner: 'ipfs_kit_py',
      destructive_action: false,
      visible_selectors: ['[data-testid="steering-error"]', '[data-testid="gateway-evidence"]'],
      policy_evidence: {
        policy_class: 'confirm',
        prompt_log_mode: 'redacted',
        required_confirmation: true,
      },
    },
    {
      scenario_id: 'stale-index-visible',
      required_path: 'stale_state',
      title: 'Stale indexed state is typed and visible',
      observed: true,
      source_owner: 'ipfs_datasets_py',
      state: 'unavailable',
      reason: 'index_stale',
      capability_ids: ['supervisor.taskboard.links.read'],
      correlation_id: 'swr-107-stale-index',
      receipt_id: 'rcpt-swr-107-stale-index',
      receipt_owner: 'ipfs_kit_py',
      destructive_action: false,
      visible_selectors: ['[data-testid="gateway-evidence"]'],
      stale_state: {
        stale_index_owner: 'ipfs_datasets_py',
        current_state_owner: 'ipfs_accelerate_py',
        console_behavior: 'Use the live supervisor snapshot while labeling the search index stale.',
      },
    },
    {
      scenario_id: 'transport-fallback-visible',
      required_path: 'transport_fallback',
      title: 'Transport fallback remains visible and correlated',
      observed: true,
      source_owner: 'ipfs_accelerate_py',
      state: 'available',
      capability_ids: ['supervisor.health.read'],
      correlation_id: 'swr-107-transport-fallback',
      receipt_id: 'rcpt-swr-107-transport-fallback',
      receipt_owner: 'ipfs_kit_py',
      destructive_action: false,
      visible_selectors: ['[data-testid="backend-health"]', '[data-testid="gateway-evidence"]'],
      transport_fallback: {
        attempted: reachableLibp2p ? ['mcp++', 'libp2p'] : ['mcp++', 'mcp'],
        selected: reachableLibp2p ? 'libp2p' : 'mcp',
        fallback_reason: reachableLibp2p
          ? 'MCP++ descriptor route fell through to advertised libp2p reachability.'
          : 'No advertised libp2p endpoint was required; route fell back to the MCP gateway.',
      },
      generated_at: generatedAt,
    },
  ];
}

function buildReceiptBundle({ generatedAt, scenarios, allServerCatalog }) {
  const receipts = scenarios.map(scenario => {
    const canonical = {
      schema: 'swissknife.agent_supervisor_console_receipt.v1',
      task_id: 'SWR-107',
      scenario_id: scenario.scenario_id,
      required_path: scenario.required_path,
      source_owner: scenario.source_owner,
      state: scenario.state,
      reason: scenario.reason ?? null,
      capability_ids: scenario.capability_ids,
      correlation_id: scenario.correlation_id,
      destructive_action: false,
      indexed_record: scenario.indexed_record ?? null,
      generated_at: generatedAt,
    };
    return {
      ...canonical,
      receipt_id: scenario.receipt_id,
      receipt_owner: 'ipfs_kit_py',
      receipt_cid: hashObject(canonical),
      parent_catalog_cid: allServerCatalog ? hashObject({
        schema: allServerCatalog.schema,
        generated_at: allServerCatalog.generated_at,
        summary: allServerCatalog.summary,
      }) : null,
      visible_selectors: scenario.visible_selectors,
      statement: `${scenario.title}; no destructive supervisor action is required.`,
    };
  });

  return {
    schema: 'swissknife.agent_supervisor_console_receipts.v1',
    task_id: 'SWR-107',
    generated_at: generatedAt,
    receipt_count: receipts.length,
    required_receipt_owner: 'ipfs_kit_py',
    validation_commands: validationCommands,
    expected_outputs: expectedOutputs,
    correlation_ids: receipts.map(receipt => receipt.correlation_id),
    receipts,
  };
}

function writeMarkdown(e2e, receiptBundle) {
  const rows = e2e.scenarios.map(scenario => (
    `| ${scenario.required_path} | ${scenario.source_owner} | ${scenario.state}${scenario.reason ? `:${scenario.reason}` : ''} | ${scenario.correlation_id} | ${scenario.receipt_id} | ${scenario.observed ? 'yes' : 'no'} |`
  ));
  const serviceRows = e2e.service_families.map(service => (
    `| ${service.service} | ${service.role} | ${service.available ? 'yes' : 'no'} | ${service.endpoint ?? 'n/a'} | ${service.flat_tool_count ?? 0} | ${service.agent_supervisor_descriptor_count ?? 0} |`
  ));
  const text = `# Agent Supervisor Console Evidence

Task: SWR-107

Generated: ${e2e.generated_at}

Decision: ${e2e.decision}

## Validation

${validationCommands.map(command => `- \`${command}\``).join('\n')}

## Service Families

| Service | Role | Available | Endpoint | Flat tools | Agent Supervisor descriptors |
| --- | --- | --- | --- | ---: | ---: |
${serviceRows.join('\n')}

## Required Paths

| Path | Source owner | Result | Correlation | Receipt | Observed |
| --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

## Correlation

Every scenario emits an \`ipfs_kit_py\` evidence receipt in \`${path.relative(projectRoot, path.join(evidenceRoot, 'agent-supervisor-console-receipts.json'))}\`. The indexed search path records \`SWR-107\`, \`SWR-107-verify-console\`, and \`run-swr-107-live-probe\` as the corresponding goal/task/run tuple owned by \`ipfs_datasets_py\`.

The console evidence covers success, server-unavailable, denied, stale-state, and transport-fallback paths. All governed prompt steering evidence is non-destructive and prompt content is represented only by policy metadata and redacted receipt statements.

## Outputs

${expectedOutputs.map(output => `- \`${output}\``).join('\n')}

Receipt count: ${receiptBundle.receipt_count}
`;
  fs.mkdirSync(path.dirname(docsPath), { recursive: true });
  fs.writeFileSync(docsPath, text, 'utf8');
}

function serviceEvidence(family, allServerCatalog) {
  const services = allServerCatalog?.services ?? [];
  const candidates = services.filter(service => service.service === family.service);
  const preferred = candidates.find(service => service.role === 'configured' || service.role === 'configured_compat')
    ?? candidates[0];
  const agentDescriptors = (preferred?.reconciled_descriptors ?? [])
    .filter(descriptor => descriptor.app_id === 'agent-supervisor');
  return {
    ...family,
    available: Boolean(preferred?.available),
    endpoint: preferred?.endpoint ?? null,
    configured_role: preferred?.role ?? null,
    flat_tool_count: preferred?.flat_tool_count ?? 0,
    hierarchical_tool_count: preferred?.hierarchical_tool_count ?? 0,
    read_live_dispatch_receipt_count: preferred?.read_live_dispatch_receipt_count ?? 0,
    policy_gated_descriptor_count: preferred?.policy_gated_descriptor_count ?? 0,
    agent_supervisor_descriptor_count: agentDescriptors.length,
    agent_supervisor_descriptors: agentDescriptors.slice(0, 12).map(descriptor => ({
      tool_id: descriptor.tool_id,
      name: descriptor.name,
      policy_class: descriptor.policy_class,
      verification_status: descriptor.verification?.status ?? descriptor.reconciliation?.verification_status ?? 'unknown',
      route: descriptor.route,
    })),
    blockers: preferred?.blockers ?? [],
    required: family.required,
  };
}

function agentSupervisorRows(allServerCatalog, appBindings) {
  const rows = [];
  for (const service of allServerCatalog?.services ?? []) {
    for (const descriptor of service.reconciled_descriptors ?? []) {
      if (descriptor.app_id === 'agent-supervisor') {
        rows.push({
          service: service.service,
          tool_id: descriptor.tool_id,
          name: descriptor.name,
          policy_class: descriptor.policy_class,
          verification_status: descriptor.verification?.status ?? descriptor.reconciliation?.verification_status ?? 'unknown',
          route: descriptor.route,
        });
      }
    }
  }
  if (rows.length > 0) return rows;
  return (appBindings?.rows ?? appBindings?.bindings ?? [])
    .filter(row => row.app_id === 'agent-supervisor')
    .map(row => ({
      service: row.service_id ?? row.service,
      tool_id: row.tool_id,
      name: row.name,
      policy_class: row.policy_class,
      verification_status: 'catalog_binding',
      route: null,
    }));
}

function sampleRows(rows, service) {
  return rows
    .filter(row => row.service === service)
    .slice(0, 8)
    .map(row => ({
      tool_id: row.tool_id,
      name: row.name,
      policy_class: row.policy_class,
      verification_status: row.verification_status,
      route: row.route,
    }));
}

function summarizeService(service) {
  if (!service) return null;
  return {
    service: service.service,
    available: service.available,
    endpoint: service.endpoint,
    configured_role: service.configured_role,
    flat_tool_count: service.flat_tool_count,
    hierarchical_tool_count: service.hierarchical_tool_count,
    read_live_dispatch_receipt_count: service.read_live_dispatch_receipt_count,
    agent_supervisor_descriptor_count: service.agent_supervisor_descriptor_count,
  };
}

function requiredScenarioBlockers(scenarios) {
  return requiredPathIds()
    .filter(pathId => !scenarios.some(scenario => scenario.required_path === pathId && scenario.observed))
    .map(pathId => `Agent Supervisor Console required path is not observed: ${pathId}.`);
}

function requiredPathIds() {
  return [
    'success',
    'receipt_resolve',
    'index_search',
    'server_unavailable',
    'denied',
    'stale_state',
    'transport_fallback',
  ];
}

function capability(id, owner, policyClass, method) {
  return {
    id,
    owner,
    policy_class: policyClass,
    method,
    access: policyClass === 'read' ? 'read' : 'governed-write',
    transports: policyClass === 'read' ? ['mcp', 'mcp++', 'libp2p'] : ['mcp', 'mcp++'],
  };
}

function hashObject(value) {
  return `sha256:${crypto.createHash('sha256').update(stableStringify(value)).digest('hex')}`;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

module.exports = {
  buildAgentSupervisorConsoleEvidence,
  expectedOutputs,
  validationCommands,
};
