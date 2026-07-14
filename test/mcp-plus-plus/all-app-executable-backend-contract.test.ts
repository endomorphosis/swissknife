import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  ALL_APP_EXECUTABLE_BACKEND_CONTRACT,
  ALL_APP_EXECUTABLE_BACKEND_CONTRACT_ID,
  ALL_APP_EXECUTABLE_BACKEND_CONTRACT_SCHEMA,
  ALL_APP_EXECUTABLE_BACKEND_CONTRACT_VERSION,
  EXECUTABLE_BACKEND_OWNERS,
  getExecutableAppBackendDisposition,
  resolveBackendRecovery,
  resolveMediatedInvocation,
  selectBackendTool,
  selectBackendTransport,
  validateAllAppExecutableBackendContract,
  type AllAppExecutableBackendContract,
  type BackendToolSelectionRule,
} from '../../src/services/apps/all-app-executable-backend-contract';
import {
  VIRTUAL_DESKTOP_APP_MANIFEST,
  VIRTUAL_DESKTOP_APP_IDS,
} from '../../src/services/apps/virtual-desktop-app-manifest';

describe('SVD-103 all-app executable backend disposition contract', () => {
  it('is versioned and conforms to its checked-in JSON Schema', () => {
    const schema = JSON.parse(readFileSync(join(
      process.cwd(),
      'src/services/apps/all-app-executable-backend-contract.schema.json',
    ), 'utf8'));
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);

    expect(ALL_APP_EXECUTABLE_BACKEND_CONTRACT.schema).toBe(ALL_APP_EXECUTABLE_BACKEND_CONTRACT_SCHEMA);
    expect(ALL_APP_EXECUTABLE_BACKEND_CONTRACT.contract_id).toBe(ALL_APP_EXECUTABLE_BACKEND_CONTRACT_ID);
    expect(ALL_APP_EXECUTABLE_BACKEND_CONTRACT.version).toBe(ALL_APP_EXECUTABLE_BACKEND_CONTRACT_VERSION);
    expect(validate(ALL_APP_EXECUTABLE_BACKEND_CONTRACT), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('has exactly one versioned disposition for every canonical app', () => {
    const contractIds = ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.map(app => app.app_id);
    expect(new Set(contractIds).size).toBe(contractIds.length);
    expect(new Set(contractIds)).toEqual(new Set(VIRTUAL_DESKTOP_APP_IDS));
    expect(ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps).toHaveLength(VIRTUAL_DESKTOP_APP_MANIFEST.apps.length);

    for (const app of ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps) {
      expect(['tool_backed', 'browser_local', 'external_provider', 'policy_blocked']).toContain(app.disposition);
      expect(app.disposition_version).toBe(ALL_APP_EXECUTABLE_BACKEND_CONTRACT.version);
      expect(app.rationale.length).toBeGreaterThan(20);
      expect(app.user_visible_proof.surface).toBe(`virtual-desktop://apps/${app.app_id}`);
      expect(app.user_visible_proof.message).toBeTruthy();
      expect(app.user_visible_proof.deterministic_check).toBeTruthy();
    }

    expect(getExecutableAppBackendDisposition('calculator')?.disposition).toBe('browser_local');
    expect(getExecutableAppBackendDisposition('oauth-login')?.disposition).toBe('external_provider');
    expect(getExecutableAppBackendDisposition('api-keys')?.disposition).toBe('policy_blocked');
    expect(getExecutableAppBackendDisposition('code-editor')?.app_id).toBe('vibecode');
  });

  it('materializes a complete executable binding for every declared backend capability', () => {
    for (const manifestApp of VIRTUAL_DESKTOP_APP_MANIFEST.apps) {
      const app = getExecutableAppBackendDisposition(manifestApp.id)!;
      if (manifestApp.backend_capabilities.length === 0) {
        expect(app.backend_bindings).toEqual([]);
        continue;
      }

      expect(app.disposition).toBe('tool_backed');
      expect(app.backend_bindings).toHaveLength(manifestApp.backend_capabilities.length);
      for (const declared of manifestApp.backend_capabilities) {
        const binding = app.backend_bindings.find(candidate =>
          candidate.owner === declared.service
          && candidate.mediated_intent.capability === declared.capability,
        );
        expect(binding, `${manifestApp.id}/${declared.service}/${declared.capability}`).toBeDefined();
        expect(binding!.mediated_intent.intent_id).toBeTruthy();
        expect(binding!.mediated_intent.operation).toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
        expect(binding!.tool_selection.preferred_tool_ids.length).toBeGreaterThan(0);
        expect(binding!.tool_selection.on_no_match).toBe('tool_unsupported');
        expect(binding!.transport_policy.gateway_route).toBe('/api/mcp/tools/call');
        expect(binding!.transport_policy.direct_backend_access).toBe(false);
        expect(binding!.input_contract.required).toEqual(expect.arrayContaining(['correlation_id', 'payload', 'policy']));
        expect(binding!.output_contract.required).toEqual(expect.arrayContaining([
          'owner', 'tool_id', 'transport', 'correlation_id', 'outcome', 'receipt',
        ]));
        expect(binding!.receipt_requirement.required).toBe(true);
        expect(binding!.receipt_requirement.required_fields).toContain('correlation_id');
        expect(binding!.ui_control.states).toEqual(expect.arrayContaining(['pending', 'success', 'denied', 'error']));
        expect(binding!.ui_control.displays).toEqual(expect.arrayContaining(['tool_id', 'transport', 'receipt_id']));
        for (const error of [
          'policy_denied',
          'owner_unreachable',
          'tool_unsupported',
          'invalid_input',
          'invalid_output',
          'receipt_missing',
        ] as const) {
          expect(resolveBackendRecovery(binding!, error)).toMatchObject({ error, preserves_correlation_id: true });
        }
      }
    }
  });

  it('requires Agent Supervisor bindings owned by all three backends', () => {
    const supervisor = getExecutableAppBackendDisposition('agent-supervisor')!;
    expect(supervisor.disposition).toBe('tool_backed');
    expect(new Set(supervisor.backend_bindings.map(binding => binding.owner))).toEqual(
      new Set(EXECUTABLE_BACKEND_OWNERS),
    );
    expect(supervisor.backend_bindings.find(binding => binding.owner === 'ipfs_accelerate_py')?.mediated_intent.operation)
      .toBe('supervise_agent_work');
    expect(supervisor.backend_bindings.find(binding => binding.owner === 'ipfs_datasets_py')?.mediated_intent.operation)
      .toBe('query_catalog');
    expect(supervisor.backend_bindings.find(binding => binding.owner === 'ipfs_kit_py')?.receipt_requirement.persistence)
      .toBe('ipfs_kit_py_or_browser_helia');
  });

  it('selects exact tool IDs deterministically and only uses exact capability fallback', () => {
    const rule: BackendToolSelectionRule = {
      strategy: 'ordered_exact_then_capability',
      owner: 'ipfs_datasets_py',
      preferred_tool_ids: ['preferred_second', 'preferred_first'],
      required_capability: 'ipfs.datasets.discovery',
      capability_match: 'exact',
      tie_breaker: 'preferred_order_then_lexical_tool_id',
      on_no_match: 'tool_unsupported',
    };
    const tools = [
      { owner: 'ipfs_datasets_py' as const, tool_id: 'preferred_first' },
      { owner: 'ipfs_datasets_py' as const, tool_id: 'preferred_second' },
      { owner: 'ipfs_kit_py' as const, tool_id: 'preferred_second' },
    ];
    expect(selectBackendTool(rule, tools)?.tool_id).toBe('preferred_second');

    const capabilityOnly = tools
      .filter(tool => tool.tool_id !== 'preferred_first' && tool.tool_id !== 'preferred_second')
      .concat([
        { owner: 'ipfs_datasets_py' as const, tool_id: 'z-tool', capabilities: ['ipfs.datasets.discovery'] },
        { owner: 'ipfs_datasets_py' as const, tool_id: 'a-tool', capabilities: ['ipfs.datasets.discovery'] },
      ]);
    expect(selectBackendTool(rule, capabilityOnly)?.tool_id).toBe('a-tool');
    expect(selectBackendTool(rule, [{
      owner: 'ipfs_datasets_py',
      tool_id: 'near-match',
      capabilities: ['ipfs.datasets.discovery.v2'],
    }])).toBeNull();
  });

  it('negotiates only declared transports with deterministic fallback', () => {
    const binding = getExecutableAppBackendDisposition('agent-supervisor')!.backend_bindings[0];
    expect(selectBackendTransport(binding.transport_policy, ['libp2p', 'http'])).toBe('http');
    expect(selectBackendTransport(binding.transport_policy, ['libp2p'])).toBe('libp2p');
    expect(selectBackendTransport(binding.transport_policy, [])).toBeNull();
  });

  it('compiles a successful browser-mediated invocation plan with receipt and UI requirements', () => {
    const supervisor = getExecutableAppBackendDisposition('agent-supervisor')!;
    const binding = supervisor.backend_bindings.find(candidate => candidate.owner === 'ipfs_accelerate_py')!;
    const selectedToolId = binding.tool_selection.preferred_tool_ids[0];
    const result = resolveMediatedInvocation({
      app_id: 'agent-supervisor',
      intent_id: binding.mediated_intent.intent_id,
      correlation_id: 'corr-svd-103',
      payload: { view: 'queue' },
      consent: 'granted',
      dry_run: true,
      discovered_tools: [{ owner: binding.owner, tool_id: selectedToolId }],
      available_transports: ['http', 'libp2p'],
    });

    expect(result).toMatchObject({
      ok: true,
      gateway_route: '/api/mcp/tools/call',
      app_id: 'agent-supervisor',
      owner: 'ipfs_accelerate_py',
      tool_id: selectedToolId,
      transport: 'http',
      correlation_id: 'corr-svd-103',
      receipt_requirement: { required: true },
    });
    if (result.ok) {
      expect(result.input.policy).toEqual({ consent: 'granted', dry_run: true });
      expect(result.ui_control.displays).toContain('receipt_id');
    }
  });

  it('fails closed with explicit recovery for policy, discovery, and transport failures', () => {
    const blocked = resolveMediatedInvocation({
      app_id: 'api-keys',
      correlation_id: 'corr-blocked',
      payload: {},
      consent: 'granted',
      dry_run: true,
      discovered_tools: [],
      available_transports: ['http'],
    });
    expect(blocked).toMatchObject({ ok: false, error: 'policy_denied' });

    const app = getExecutableAppBackendDisposition('agent-supervisor')!;
    const binding = app.backend_bindings[0];
    const base = {
      app_id: app.app_id,
      intent_id: binding.mediated_intent.intent_id,
      correlation_id: 'corr-failure',
      payload: {},
      consent: 'granted' as const,
      dry_run: true,
    };
    expect(resolveMediatedInvocation({
      ...base,
      discovered_tools: [],
      available_transports: ['http'],
    })).toMatchObject({ ok: false, error: 'tool_unsupported', recovery: { action: 'refresh_descriptor' } });
    expect(resolveMediatedInvocation({
      ...base,
      discovered_tools: [{ owner: binding.owner, tool_id: binding.tool_selection.preferred_tool_ids[0] }],
      available_transports: [],
    })).toMatchObject({ ok: false, error: 'owner_unreachable', recovery: { action: 'try_fallback_transport' } });
  });

  it('passes semantic validation and rejects incomplete canonical coverage', () => {
    expect(validateAllAppExecutableBackendContract()).toEqual({ valid: true, errors: [], warnings: [] });
    const incomplete: AllAppExecutableBackendContract = {
      ...ALL_APP_EXECUTABLE_BACKEND_CONTRACT,
      apps: ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.slice(1),
    };
    const result = validateAllAppExecutableBackendContract(incomplete);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`${VIRTUAL_DESKTOP_APP_IDS[0]}: missing canonical app disposition`);
  });
});
