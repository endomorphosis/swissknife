import {
  VIRTUAL_DESKTOP_APP_MANIFEST,
  getVirtualDesktopApp,
  type VirtualDesktopAppManifestEntry,
  type VirtualDesktopBackendCapability,
  type VirtualDesktopBackendService,
  type VirtualDesktopPolicyClass,
  type VirtualDesktopReceiptStrategy,
} from './virtual-desktop-app-manifest.js';

export const ALL_APP_EXECUTABLE_BACKEND_CONTRACT_ID =
  'org.hallucinate.swissknife.all-app-executable-backend-contract';
export const ALL_APP_EXECUTABLE_BACKEND_CONTRACT_SCHEMA =
  'swissknife.all-app-executable-backend-contract.v1';
export const ALL_APP_EXECUTABLE_BACKEND_CONTRACT_VERSION = '1.0.0';

export const EXECUTABLE_BACKEND_OWNERS = [
  'ipfs_kit_py',
  'ipfs_datasets_py',
  'ipfs_accelerate_py',
] as const satisfies readonly VirtualDesktopBackendService[];

export type ExecutableBackendOwner = (typeof EXECUTABLE_BACKEND_OWNERS)[number];
export type AppBackendDisposition =
  | 'tool_backed'
  | 'browser_local'
  | 'external_provider'
  | 'policy_blocked';
export type MediatedTransport = 'http' | 'libp2p';
export type BackendFailureCode =
  | 'policy_denied'
  | 'owner_unreachable'
  | 'tool_unsupported'
  | 'invalid_input'
  | 'invalid_output'
  | 'receipt_missing';

export interface JsonObjectContract {
  schema_id: string;
  type: 'object';
  required: readonly string[];
  properties: Readonly<Record<string, unknown>>;
  additionalProperties: boolean;
}

export interface MediatedBackendIntent {
  intent_id: string;
  operation: string;
  description: string;
  capability: string;
  policy_class: VirtualDesktopPolicyClass;
  mutates_remote_state: boolean;
}

export interface BackendToolSelectionRule {
  strategy: 'ordered_exact_then_capability';
  owner: ExecutableBackendOwner;
  preferred_tool_ids: readonly string[];
  required_capability: string;
  capability_match: 'exact';
  tie_breaker: 'preferred_order_then_lexical_tool_id';
  on_no_match: 'tool_unsupported';
}

export interface BackendTransportPolicy {
  gateway_route: '/api/mcp/tools/call';
  browser_boundary: 'mediated_gateway_only';
  allowed_transports: readonly MediatedTransport[];
  preferred_transport: MediatedTransport;
  fallback_transport: MediatedTransport | null;
  direct_backend_access: false;
  require_correlation_id: true;
  require_policy_decision: true;
  require_owner_identity: true;
}

export interface BackendReceiptRequirement {
  required: boolean;
  manifest_strategy: VirtualDesktopReceiptStrategy;
  receipt_kind: 'invocation' | 'confirmation' | 'event_dag';
  persistence: 'ipfs_kit_py_or_browser_helia';
  required_fields: readonly string[];
  on_missing: 'receipt_missing';
}

export interface BackendRecoveryRoute {
  error: BackendFailureCode;
  action:
    | 'request_confirmation'
    | 'try_fallback_transport'
    | 'refresh_descriptor'
    | 'correct_input'
    | 'quarantine_response'
    | 'persist_browser_receipt';
  next_error: BackendFailureCode | null;
  user_message: string;
  preserves_correlation_id: true;
}

export interface BackendErrorRecoveryContract {
  routes: readonly BackendRecoveryRoute[];
  terminal_action: 'surface_error_with_retry';
  never_silently_fallback: true;
}

export interface BackendUiControl {
  surface: string;
  control_id: string;
  label: string;
  event: string;
  confirmation: 'none' | 'policy' | 'always';
  states: readonly ('idle' | 'pending' | 'success' | 'denied' | 'unavailable' | 'error')[];
  displays: readonly string[];
}

export interface ExecutableBackendBinding {
  binding_id: string;
  owner: ExecutableBackendOwner;
  mediated_intent: MediatedBackendIntent;
  tool_selection: BackendToolSelectionRule;
  transport_policy: BackendTransportPolicy;
  input_contract: JsonObjectContract;
  output_contract: JsonObjectContract;
  receipt_requirement: BackendReceiptRequirement;
  error_recovery: BackendErrorRecoveryContract;
  ui_control: BackendUiControl;
}

export interface UserVisibleDispositionProof {
  proof_id: string;
  surface: string;
  control_id: string;
  proof_kind: 'mediated_receipt' | 'browser_runtime' | 'provider_handoff' | 'policy_denial';
  message: string;
  deterministic_check: string;
  visible_fields: readonly string[];
}

export interface ExecutableAppBackendDisposition {
  app_id: string;
  aliases: readonly string[];
  disposition_version: string;
  disposition: AppBackendDisposition;
  rationale: string;
  backend_bindings: readonly ExecutableBackendBinding[];
  user_visible_proof: UserVisibleDispositionProof;
}

export interface AllAppExecutableBackendContract {
  schema: typeof ALL_APP_EXECUTABLE_BACKEND_CONTRACT_SCHEMA;
  contract_id: typeof ALL_APP_EXECUTABLE_BACKEND_CONTRACT_ID;
  version: typeof ALL_APP_EXECUTABLE_BACKEND_CONTRACT_VERSION;
  manifest: {
    manifest_id: string;
    manifest_version: string;
  };
  backend_owners: readonly ExecutableBackendOwner[];
  selection_semantics: {
    candidate_identity: 'owner_and_tool_id';
    capability_matching: 'exact_only';
    ambiguous_match: 'preferred_order_then_lexical_tool_id';
    missing_match: 'tool_unsupported';
  };
  apps: readonly ExecutableAppBackendDisposition[];
}

export interface DiscoveredBackendTool {
  owner: ExecutableBackendOwner;
  tool_id: string;
  capabilities?: readonly string[];
}

export interface BackendContractValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface MediatedInvocationRequest {
  app_id: string;
  intent_id?: string;
  owner?: ExecutableBackendOwner;
  correlation_id: string;
  payload: Readonly<Record<string, unknown>>;
  consent: 'granted' | 'not_required';
  dry_run: boolean;
  discovered_tools: readonly DiscoveredBackendTool[];
  available_transports: readonly MediatedTransport[];
}

export interface MediatedInvocationPlan {
  ok: true;
  gateway_route: '/api/mcp/tools/call';
  app_id: string;
  binding_id: string;
  intent_id: string;
  owner: ExecutableBackendOwner;
  tool_id: string;
  transport: MediatedTransport;
  correlation_id: string;
  input: {
    correlation_id: string;
    payload: Readonly<Record<string, unknown>>;
    policy: { consent: 'granted' | 'not_required'; dry_run: boolean };
  };
  receipt_requirement: BackendReceiptRequirement;
  ui_control: BackendUiControl;
}

export interface MediatedInvocationFailure {
  ok: false;
  app_id: string;
  intent_id: string | null;
  correlation_id: string;
  error: BackendFailureCode;
  recovery: BackendRecoveryRoute | null;
  user_message: string;
}

export type MediatedInvocationResolution = MediatedInvocationPlan | MediatedInvocationFailure;

const POLICY_BLOCKED_APP_IDS = new Set(['api-keys']);
const EXTERNAL_PROVIDER_APP_IDS = new Set(['oauth-login']);

const TOOL_PREFERENCES: Readonly<Record<ExecutableBackendOwner, Readonly<Record<string, readonly string[]>>>> = {
  ipfs_kit_py: {
    storage: ['ipfs_cat', 'ipfs_ls', 'ipfs_add'],
    vfs: ['files_ls', 'files_read', 'files_write'],
    dag: ['dag_get', 'dag_put'],
    swarm: ['swarm_peers', 'node_id'],
    pubsub: ['pubsub_ls', 'swarm_peers'],
  },
  ipfs_datasets_py: {
    discovery: ['load_dataset', 'get_from_ipfs'],
    vector: ['load_index', 'load_dataset'],
    provenance: ['record_provenance', 'save_dataset'],
  },
  ipfs_accelerate_py: {
    models: ['get_task', 'detect_hardware'],
    inference: ['submit_task', 'WorkflowCoordinator.submit_task'],
    jobs: ['get_task', 'submit_task'],
    hardware: ['detect_hardware', 'HardwareDetector.get_available_hardware'],
    telemetry: ['PrometheusMetrics.generate_metrics', 'HealthChecker.check_detailed'],
    supervisor: ['get_task', 'WorkflowCoordinator.submit_task'],
  },
};

const OPERATION_BY_CAPABILITY_TOKEN: Readonly<Record<string, string>> = {
  storage: 'retrieve_content',
  vfs: 'list_virtual_files',
  dag: 'read_event_dag',
  swarm: 'inspect_peer_network',
  pubsub: 'exchange_peer_messages',
  discovery: 'query_catalog',
  vector: 'query_vector_index',
  provenance: 'record_provenance',
  models: 'inspect_model_catalog',
  inference: 'submit_inference',
  jobs: 'inspect_job_state',
  hardware: 'inspect_hardware',
  telemetry: 'inspect_telemetry',
  supervisor: 'supervise_agent_work',
};

function capabilityToken(capability: string): string {
  return capability.split('.').at(-1) ?? 'tool';
}

function operationFor(capability: string): string {
  const token = capabilityToken(capability);
  return OPERATION_BY_CAPABILITY_TOKEN[token] ?? `execute_${token.replace(/[^a-z0-9]+/g, '_')}`;
}

function isMutating(policyClass: VirtualDesktopPolicyClass): boolean {
  return policyClass !== 'read' && policyClass !== 'media_capture';
}

function confirmationFor(policyClass: VirtualDesktopPolicyClass): BackendUiControl['confirmation'] {
  if (policyClass === 'credential' || policyClass === 'destructive') return 'always';
  if (policyClass === 'read' || policyClass === 'media_capture') return 'none';
  return 'policy';
}

function buildInputContract(appId: string, bindingId: string): JsonObjectContract {
  return {
    schema_id: `${ALL_APP_EXECUTABLE_BACKEND_CONTRACT_ID}/input/${appId}/${bindingId}/v1`,
    type: 'object',
    required: ['correlation_id', 'payload', 'policy'],
    properties: {
      correlation_id: { type: 'string', minLength: 1 },
      payload: { type: 'object', additionalProperties: true },
      policy: {
        type: 'object',
        required: ['consent', 'dry_run'],
        properties: {
          consent: { type: 'string', enum: ['granted', 'not_required'] },
          dry_run: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  };
}

function buildOutputContract(appId: string, bindingId: string): JsonObjectContract {
  return {
    schema_id: `${ALL_APP_EXECUTABLE_BACKEND_CONTRACT_ID}/output/${appId}/${bindingId}/v1`,
    type: 'object',
    required: ['ok', 'owner', 'tool_id', 'transport', 'correlation_id', 'outcome', 'result', 'receipt'],
    properties: {
      ok: { type: 'boolean' },
      owner: { type: 'string', enum: EXECUTABLE_BACKEND_OWNERS },
      tool_id: { type: 'string', minLength: 1 },
      transport: { type: 'string', enum: ['http', 'libp2p'] },
      correlation_id: { type: 'string', minLength: 1 },
      outcome: { type: 'string', enum: ['executed', 'denied', 'unsupported', 'unreachable', 'failed'] },
      result: {},
      receipt: { type: ['object', 'null'] },
    },
    additionalProperties: false,
  };
}

function buildReceiptRequirement(capability: VirtualDesktopBackendCapability): BackendReceiptRequirement {
  const receiptKind = capability.receipt_strategy === 'event-dag-receipt'
    ? 'event_dag'
    : capability.receipt_strategy === 'confirmation-receipt'
      ? 'confirmation'
      : 'invocation';
  return {
    // Even read-only operations need an invocation receipt as executable evidence.
    required: true,
    manifest_strategy: capability.receipt_strategy,
    receipt_kind: receiptKind,
    persistence: 'ipfs_kit_py_or_browser_helia',
    required_fields: ['receipt_id', 'correlation_id', 'owner', 'tool_id', 'transport', 'policy_outcome', 'outcome'],
    on_missing: 'receipt_missing',
  };
}

function recoveryRoutes(hasFallbackTransport: boolean): readonly BackendRecoveryRoute[] {
  return [
    {
      error: 'policy_denied',
      action: 'request_confirmation',
      next_error: null,
      user_message: 'The operation was denied by policy. Review the decision and explicitly confirm if permitted.',
      preserves_correlation_id: true,
    },
    {
      error: 'owner_unreachable',
      action: hasFallbackTransport ? 'try_fallback_transport' : 'refresh_descriptor',
      next_error: 'owner_unreachable',
      user_message: hasFallbackTransport
        ? 'The selected transport is unavailable. Retry once through the declared fallback transport.'
        : 'The backend is unavailable. Refresh its signed descriptor before retrying.',
      preserves_correlation_id: true,
    },
    {
      error: 'tool_unsupported',
      action: 'refresh_descriptor',
      next_error: 'tool_unsupported',
      user_message: 'No approved tool matches this intent. Refresh discovery; do not substitute an unrelated tool.',
      preserves_correlation_id: true,
    },
    {
      error: 'invalid_input',
      action: 'correct_input',
      next_error: null,
      user_message: 'The request does not satisfy the mediated input contract. Correct the highlighted fields.',
      preserves_correlation_id: true,
    },
    {
      error: 'invalid_output',
      action: 'quarantine_response',
      next_error: null,
      user_message: 'The backend response was quarantined because it does not satisfy the output contract.',
      preserves_correlation_id: true,
    },
    {
      error: 'receipt_missing',
      action: 'persist_browser_receipt',
      next_error: 'receipt_missing',
      user_message: 'The result remains unverified until its receipt is stored through IPFS Kit or browser Helia.',
      preserves_correlation_id: true,
    },
  ];
}

function buildBinding(
  app: VirtualDesktopAppManifestEntry,
  capability: VirtualDesktopBackendCapability,
): ExecutableBackendBinding {
  const owner = capability.service;
  const token = capabilityToken(capability.capability);
  const operation = operationFor(capability.capability);
  const bindingId = `${app.id}.${owner}.${operation}`;
  const supportsLibp2p = capability.mcp_plus_plus_transport !== 'not-eligible';
  const allowedTransports: readonly MediatedTransport[] = supportsLibp2p ? ['http', 'libp2p'] : ['http'];
  const preferredTools = TOOL_PREFERENCES[owner][token] ?? [`${token}`];

  return {
    binding_id: bindingId,
    owner,
    mediated_intent: {
      intent_id: `${app.id}.${operation}`,
      operation,
      description: `${app.title} uses ${owner} to ${operation.replaceAll('_', ' ')} through the browser-safe MCP gateway.`,
      capability: capability.capability,
      policy_class: capability.policy_class,
      mutates_remote_state: isMutating(capability.policy_class),
    },
    tool_selection: {
      strategy: 'ordered_exact_then_capability',
      owner,
      preferred_tool_ids: preferredTools,
      required_capability: capability.capability,
      capability_match: 'exact',
      tie_breaker: 'preferred_order_then_lexical_tool_id',
      on_no_match: 'tool_unsupported',
    },
    transport_policy: {
      gateway_route: '/api/mcp/tools/call',
      browser_boundary: 'mediated_gateway_only',
      allowed_transports: allowedTransports,
      preferred_transport: 'http',
      fallback_transport: supportsLibp2p ? 'libp2p' : null,
      direct_backend_access: false,
      require_correlation_id: true,
      require_policy_decision: true,
      require_owner_identity: true,
    },
    input_contract: buildInputContract(app.id, bindingId),
    output_contract: buildOutputContract(app.id, bindingId),
    receipt_requirement: buildReceiptRequirement(capability),
    error_recovery: {
      routes: recoveryRoutes(supportsLibp2p),
      terminal_action: 'surface_error_with_retry',
      never_silently_fallback: true,
    },
    ui_control: {
      surface: `virtual-desktop://apps/${app.id}`,
      control_id: `${app.id}--${owner}--${operation}`,
      label: `${app.title}: ${operation.replaceAll('_', ' ')}`,
      event: `backend-intent:${app.id}.${operation}`,
      confirmation: confirmationFor(capability.policy_class),
      states: ['idle', 'pending', 'success', 'denied', 'unavailable', 'error'],
      displays: ['owner', 'tool_id', 'transport', 'correlation_id', 'policy_outcome', 'outcome', 'receipt_id'],
    },
  };
}

function dispositionFor(app: VirtualDesktopAppManifestEntry): AppBackendDisposition {
  if (POLICY_BLOCKED_APP_IDS.has(app.id)) return 'policy_blocked';
  if (EXTERNAL_PROVIDER_APP_IDS.has(app.id)) return 'external_provider';
  if (app.backend_capabilities.length > 0) return 'tool_backed';
  return 'browser_local';
}

function rationaleFor(app: VirtualDesktopAppManifestEntry, disposition: AppBackendDisposition): string {
  switch (disposition) {
    case 'tool_backed':
      return `${app.title} declares ${app.backend_capabilities.length} mediated backend capability assignment(s); each must resolve an exact owner/tool identity and produce a receipt.`;
    case 'external_provider':
      return `${app.title} is a user-initiated external identity-provider redirect; Python MCP owners never receive provider credentials.`;
    case 'policy_blocked':
      return `${app.title} handles credentials in browser-local protected storage; policy credential-isolation-v1 blocks dispatch to every Python MCP owner.`;
    case 'browser_local':
      return app.local_only_rationale
        ?? `${app.title} executes entirely in the browser and has no declared Python MCP backend capability.`;
  }
}

function proofFor(
  app: VirtualDesktopAppManifestEntry,
  disposition: AppBackendDisposition,
): UserVisibleDispositionProof {
  const common = {
    proof_id: `${app.id}.backend-disposition-proof.v1`,
    surface: `virtual-desktop://apps/${app.id}`,
    control_id: `${app.id}--backend-disposition`,
    visible_fields: ['disposition', 'rationale', 'proof_id'],
  } as const;
  if (disposition === 'tool_backed') {
    return {
      ...common,
      proof_kind: 'mediated_receipt',
      message: 'Backend status shows the selected owner, exact tool ID, transport, policy outcome, correlation ID, and receipt.',
      deterministic_check: 'A success state is allowed only when every required receipt field is visible.',
    };
  }
  if (disposition === 'external_provider') {
    return {
      ...common,
      proof_kind: 'provider_handoff',
      message: 'The app identifies the selected provider and shows redirect, cancelled, denied, and returned states.',
      deterministic_check: 'No Python backend owner or MCP gateway request may appear in the provider handoff trace.',
    };
  }
  if (disposition === 'policy_blocked') {
    return {
      ...common,
      proof_kind: 'policy_denial',
      message: 'The app displays credential-isolation-v1 and offers browser-local credential management instead of backend dispatch.',
      deterministic_check: 'Every attempted Python-owner dispatch resolves to policy_denied before transport selection.',
    };
  }
  return {
    ...common,
    proof_kind: 'browser_runtime',
    message: 'The app displays browser-local status and deterministic success, fallback, and error states without an MCP request.',
    deterministic_check: 'The primary action completes with zero Python-owner gateway calls.',
  };
}

function buildAppDisposition(app: VirtualDesktopAppManifestEntry): ExecutableAppBackendDisposition {
  const disposition = dispositionFor(app);
  return {
    app_id: app.id,
    aliases: app.aliases,
    disposition_version: ALL_APP_EXECUTABLE_BACKEND_CONTRACT_VERSION,
    disposition,
    rationale: rationaleFor(app, disposition),
    backend_bindings: disposition === 'tool_backed'
      ? app.backend_capabilities.map(capability => buildBinding(app, capability))
      : [],
    user_visible_proof: proofFor(app, disposition),
  };
}

export const ALL_APP_EXECUTABLE_BACKEND_CONTRACT: AllAppExecutableBackendContract = {
  schema: ALL_APP_EXECUTABLE_BACKEND_CONTRACT_SCHEMA,
  contract_id: ALL_APP_EXECUTABLE_BACKEND_CONTRACT_ID,
  version: ALL_APP_EXECUTABLE_BACKEND_CONTRACT_VERSION,
  manifest: {
    manifest_id: VIRTUAL_DESKTOP_APP_MANIFEST.manifest_id,
    manifest_version: VIRTUAL_DESKTOP_APP_MANIFEST.version,
  },
  backend_owners: EXECUTABLE_BACKEND_OWNERS,
  selection_semantics: {
    candidate_identity: 'owner_and_tool_id',
    capability_matching: 'exact_only',
    ambiguous_match: 'preferred_order_then_lexical_tool_id',
    missing_match: 'tool_unsupported',
  },
  apps: VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(buildAppDisposition),
};

const APP_DISPOSITION_BY_ID = new Map(
  ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.map(app => [app.app_id, app]),
);
const ALIAS_DISPOSITION_BY_ID = new Map(
  ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.flatMap(app =>
    app.aliases.map(alias => [alias, app] as const),
  ),
);

export function getExecutableAppBackendDisposition(
  appIdOrAlias: string,
): ExecutableAppBackendDisposition | null {
  return APP_DISPOSITION_BY_ID.get(appIdOrAlias)
    ?? ALIAS_DISPOSITION_BY_ID.get(appIdOrAlias)
    ?? null;
}

export function selectBackendTool(
  rule: BackendToolSelectionRule,
  discoveredTools: readonly DiscoveredBackendTool[],
): DiscoveredBackendTool | null {
  const owned = discoveredTools.filter(tool => tool.owner === rule.owner);
  for (const preferredId of rule.preferred_tool_ids) {
    const exact = owned.find(tool => tool.tool_id === preferredId);
    if (exact) return exact;
  }
  const capabilityMatches = owned
    .filter(tool => tool.capabilities?.includes(rule.required_capability))
    .sort((left, right) => left.tool_id.localeCompare(right.tool_id));
  return capabilityMatches[0] ?? null;
}

export function selectBackendTransport(
  policy: BackendTransportPolicy,
  availableTransports: readonly MediatedTransport[],
): MediatedTransport | null {
  const available = new Set(availableTransports);
  if (policy.allowed_transports.includes(policy.preferred_transport) && available.has(policy.preferred_transport)) {
    return policy.preferred_transport;
  }
  if (policy.fallback_transport
    && policy.allowed_transports.includes(policy.fallback_transport)
    && available.has(policy.fallback_transport)) {
    return policy.fallback_transport;
  }
  return null;
}

export function resolveBackendRecovery(
  binding: ExecutableBackendBinding,
  error: BackendFailureCode,
): BackendRecoveryRoute | null {
  return binding.error_recovery.routes.find(route => route.error === error) ?? null;
}

function failure(
  request: MediatedInvocationRequest,
  binding: ExecutableBackendBinding | null,
  error: BackendFailureCode,
  message?: string,
): MediatedInvocationFailure {
  const recovery = binding ? resolveBackendRecovery(binding, error) : null;
  return {
    ok: false,
    app_id: request.app_id,
    intent_id: binding?.mediated_intent.intent_id ?? request.intent_id ?? null,
    correlation_id: request.correlation_id,
    error,
    recovery,
    user_message: message ?? recovery?.user_message ?? 'No executable backend route is available.',
  };
}

export function resolveMediatedInvocation(
  request: MediatedInvocationRequest,
): MediatedInvocationResolution {
  const app = getExecutableAppBackendDisposition(request.app_id);
  if (!app || app.disposition !== 'tool_backed') {
    const error: BackendFailureCode = app?.disposition === 'policy_blocked' ? 'policy_denied' : 'tool_unsupported';
    return failure(request, null, error, app?.rationale ?? `Unknown canonical app: ${request.app_id}`);
  }
  const matches = app.backend_bindings.filter(binding =>
    (request.intent_id === undefined || binding.mediated_intent.intent_id === request.intent_id)
    && (request.owner === undefined || binding.owner === request.owner),
  );
  if (matches.length !== 1) {
    return failure(
      request,
      matches[0] ?? null,
      'tool_unsupported',
      matches.length === 0
        ? 'No backend binding matches the requested app intent and owner.'
        : 'The request is ambiguous; provide an intent_id or owner that selects exactly one binding.',
    );
  }
  const binding = matches[0];
  if (!request.correlation_id || typeof request.payload !== 'object' || request.payload === null) {
    return failure(request, binding, 'invalid_input');
  }
  if (binding.ui_control.confirmation === 'always' && request.consent !== 'granted') {
    return failure(request, binding, 'policy_denied');
  }
  const tool = selectBackendTool(binding.tool_selection, request.discovered_tools);
  if (!tool) return failure(request, binding, 'tool_unsupported');
  const transport = selectBackendTransport(binding.transport_policy, request.available_transports);
  if (!transport) return failure(request, binding, 'owner_unreachable');

  return {
    ok: true,
    gateway_route: binding.transport_policy.gateway_route,
    app_id: app.app_id,
    binding_id: binding.binding_id,
    intent_id: binding.mediated_intent.intent_id,
    owner: binding.owner,
    tool_id: tool.tool_id,
    transport,
    correlation_id: request.correlation_id,
    input: {
      correlation_id: request.correlation_id,
      payload: request.payload,
      policy: { consent: request.consent, dry_run: request.dry_run },
    },
    receipt_requirement: binding.receipt_requirement,
    ui_control: binding.ui_control,
  };
}

export function validateAllAppExecutableBackendContract(
  contract: AllAppExecutableBackendContract = ALL_APP_EXECUTABLE_BACKEND_CONTRACT,
): BackendContractValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (contract.schema !== ALL_APP_EXECUTABLE_BACKEND_CONTRACT_SCHEMA) errors.push('invalid contract schema');
  if (contract.contract_id !== ALL_APP_EXECUTABLE_BACKEND_CONTRACT_ID) errors.push('invalid contract_id');
  if (!/^\d+\.\d+\.\d+$/.test(contract.version)) errors.push('version must be semantic versioning');
  if (contract.manifest.manifest_id !== VIRTUAL_DESKTOP_APP_MANIFEST.manifest_id
    || contract.manifest.manifest_version !== VIRTUAL_DESKTOP_APP_MANIFEST.version) {
    errors.push('manifest identity or version does not match the canonical manifest');
  }
  if (new Set(contract.backend_owners).size !== EXECUTABLE_BACKEND_OWNERS.length
    || EXECUTABLE_BACKEND_OWNERS.some(owner => !contract.backend_owners.includes(owner))) {
    errors.push('backend_owners must contain each required owner exactly once');
  }

  const expectedIds = new Set(VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => app.id));
  const seenIds = new Set<string>();
  for (const appContract of contract.apps) {
    const manifestApp = getVirtualDesktopApp(appContract.app_id);
    if (!manifestApp || manifestApp.id !== appContract.app_id) errors.push(`${appContract.app_id}: not a canonical app id`);
    if (seenIds.has(appContract.app_id)) errors.push(`${appContract.app_id}: duplicate app disposition`);
    seenIds.add(appContract.app_id);
    if (appContract.disposition_version !== contract.version) errors.push(`${appContract.app_id}: disposition version mismatch`);
    if (!appContract.rationale.trim()) errors.push(`${appContract.app_id}: missing deterministic rationale`);
    if (!appContract.user_visible_proof?.message || !appContract.user_visible_proof?.deterministic_check) {
      errors.push(`${appContract.app_id}: missing user-visible proof`);
    }
    if (manifestApp && appContract.disposition !== dispositionFor(manifestApp)) {
      errors.push(`${appContract.app_id}: disposition does not match its canonical backend declaration`);
    }
    if (appContract.disposition !== 'tool_backed') {
      if (appContract.backend_bindings.length !== 0) errors.push(`${appContract.app_id}: non-tool disposition has backend bindings`);
      continue;
    }
    if (!manifestApp) continue;
    if (appContract.backend_bindings.length !== manifestApp.backend_capabilities.length) {
      errors.push(`${appContract.app_id}: backend binding count does not match declared capabilities`);
    }
    const bindingIds = new Set<string>();
    for (const binding of appContract.backend_bindings) {
      if (bindingIds.has(binding.binding_id)) errors.push(`${appContract.app_id}: duplicate binding ${binding.binding_id}`);
      bindingIds.add(binding.binding_id);
      const declared = manifestApp.backend_capabilities.some(capability =>
        capability.service === binding.owner
        && capability.capability === binding.mediated_intent.capability,
      );
      if (!declared) errors.push(`${binding.binding_id}: binding is not declared by the canonical manifest`);
      if (binding.tool_selection.owner !== binding.owner) errors.push(`${binding.binding_id}: tool selector owner mismatch`);
      if (binding.tool_selection.preferred_tool_ids.length === 0) errors.push(`${binding.binding_id}: no preferred exact tool IDs`);
      if (binding.transport_policy.direct_backend_access !== false
        || binding.transport_policy.browser_boundary !== 'mediated_gateway_only') {
        errors.push(`${binding.binding_id}: browser access must be gateway mediated`);
      }
      if (binding.input_contract.required.length === 0 || binding.output_contract.required.length === 0) {
        errors.push(`${binding.binding_id}: input/output contracts must be executable`);
      }
      if (!binding.transport_policy.allowed_transports.includes(binding.transport_policy.preferred_transport)) {
        errors.push(`${binding.binding_id}: preferred transport is not allowed`);
      }
      if (binding.transport_policy.fallback_transport
        && !binding.transport_policy.allowed_transports.includes(binding.transport_policy.fallback_transport)) {
        errors.push(`${binding.binding_id}: fallback transport is not allowed`);
      }
      if (!binding.receipt_requirement.required) errors.push(`${binding.binding_id}: invocation receipt is required`);
      for (const code of ['policy_denied', 'owner_unreachable', 'tool_unsupported', 'invalid_input', 'invalid_output', 'receipt_missing'] as const) {
        if (!resolveBackendRecovery(binding, code)) errors.push(`${binding.binding_id}: missing ${code} recovery route`);
      }
      if (!binding.ui_control.control_id || !binding.ui_control.event) errors.push(`${binding.binding_id}: missing UI control`);
    }
  }
  for (const expectedId of expectedIds) {
    if (!seenIds.has(expectedId)) errors.push(`${expectedId}: missing canonical app disposition`);
  }
  for (const seenId of seenIds) {
    if (!expectedIds.has(seenId)) errors.push(`${seenId}: unexpected app disposition`);
  }

  const supervisor = contract.apps.find(app => app.app_id === 'agent-supervisor');
  const supervisorOwners = new Set(supervisor?.backend_bindings.map(binding => binding.owner) ?? []);
  for (const owner of EXECUTABLE_BACKEND_OWNERS) {
    if (!supervisorOwners.has(owner)) errors.push(`agent-supervisor: missing required owner ${owner}`);
  }
  if (supervisor?.disposition !== 'tool_backed') errors.push('agent-supervisor must be tool_backed');

  return { valid: errors.length === 0, errors, warnings };
}

export function assertAllAppExecutableBackendContract(
  contract: AllAppExecutableBackendContract = ALL_APP_EXECUTABLE_BACKEND_CONTRACT,
): void {
  const validation = validateAllAppExecutableBackendContract(contract);
  if (!validation.valid) {
    throw new Error(`Invalid all-app executable backend contract:\n${validation.errors.join('\n')}`);
  }
}
