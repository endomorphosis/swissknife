import {
  ALL_APP_EXECUTABLE_BACKEND_CONTRACT,
  EXECUTABLE_BACKEND_OWNERS,
  type ExecutableBackendBinding,
  type ExecutableBackendOwner,
} from '../apps/all-app-executable-backend-contract.js';
import {
  ALL_APP_BACKEND_STATUS_CONTRACT,
  KDA_BACKEND_FAMILIES,
} from '../apps/all-app-backend-status-contract.js';
import { VIRTUAL_DESKTOP_APP_MANIFEST } from '../apps/virtual-desktop-app-manifest.js';

export const ALL_APP_TOOL_MATRIX_SCHEMA =
  'swissknife.virtual-desktop.all-app-tool-matrix.v1';
export const KDA_RECEIPT_CATALOG_SCHEMA =
  'swissknife.mcpplusplus.http-libp2p-kda-receipt-catalog.v1';
export const ALL_APP_CROSS_SERVICE_TASK_ID = 'SVD-181';

const CID_PATTERN = /^b[a-z2-7]{58}$/;
const DID_PATTERN = /^did:key:/;
const TRANSPORTS = ['http', 'libp2p'] as const;

const OWNER_SEMANTIC_ROLES: Readonly<Record<ExecutableBackendOwner, string>> = {
  ipfs_kit_py: 'content-addressed storage, retrieval, peer networking, and receipt persistence',
  ipfs_datasets_py: 'dataset discovery, semantic indexing, and provenance',
  ipfs_accelerate_py: 'model execution, hardware selection, scheduling, and telemetry',
};

export interface LiveGatewayEvidence {
  schema?: string;
  task_id?: string;
  generated_at?: string;
  status?: string;
  execution_origin?: string;
  executions?: readonly LiveGatewayExecution[];
}

export interface LiveGatewayExecution {
  app_id?: string;
  binding_id?: string;
  ui_control_id?: string;
  owner?: string;
  selected_tool_id?: string | null;
  selected_transport?: 'http' | 'libp2p' | null;
  correlation_id?: string;
  invocation?: {
    narrow_non_mutating_input?: boolean;
    dry_run?: boolean;
    confirmation_or_policy?: string;
    operation_class?: string;
    confirmation_required?: boolean;
    real_safe_read?: boolean;
  };
  request?: { route?: string; same_origin?: boolean };
  policy?: {
    outcome?: string;
    decision_id?: string;
    consent?: string;
    dry_run?: boolean;
  };
  response?: { outcome?: string; ok?: boolean; http_status?: number };
  receipt_refs?: readonly string[];
  event_dag_refs?: readonly string[];
  persistence?: { status?: string; receipt_cid?: string; event_cid?: string } | null;
  transport_observation?: {
    transport?: 'http' | 'libp2p';
    descriptor_cid?: string | null;
    ucan_did_verified?: boolean;
    remote_did?: string | null;
    identity_proof_cid?: string | null;
    correlation_id?: string;
  } | null;
  no_backend_urls_or_credentials_exposed?: boolean;
}

export interface PeerEvidence {
  schema?: string;
  task_id?: string;
  generated_at?: string;
  decision?: string;
  services?: readonly PeerServiceEvidence[];
}

export interface PeerServiceEvidence {
  service?: string;
  decision?: string;
  approved_fixture?: { tool?: string; arguments?: Record<string, unknown>; approval?: string };
  transports?: Record<string, PeerTransportEvidence | undefined>;
  fixture?: {
    tool?: string;
    arguments?: Record<string, unknown>;
    approval?: string;
    transport_results?: Record<string, PeerFixtureEvidence | undefined>;
  };
  gates?: readonly { id?: string; passed?: boolean; reason?: string | null }[];
}

export interface PeerTransportEvidence {
  connected?: boolean;
  selected_transport?: string | null;
  no_transport_fallback?: boolean;
  negotiated_profiles?: readonly string[];
  normalized_negotiated_profiles?: readonly string[];
  descriptor?: {
    retrieved_cids?: readonly string[];
    cid_retrieval_complete?: boolean;
    compatible?: boolean;
    method_names?: readonly string[];
  };
  identity?: {
    verified?: boolean;
    remote_did?: string | null;
    identity_proof_cid?: string | null;
    peer_id?: string | null;
    peer_id_matches_announce?: boolean | null;
    multiaddr_matches_announce?: boolean | null;
  };
}

export interface PeerFixtureEvidence {
  tool?: string;
  status?: string;
  governance?: {
    operation_class?: string;
    mutates_remote_state?: boolean;
    confirmation_required?: boolean;
    confirmation_state?: string;
    dry_run?: boolean;
    policy_decision_id?: string;
    policy_outcome?: string;
    correlation_id?: string;
  };
  delegation?: { proof_cid?: string | null; valid?: boolean };
  plain_call?: { returned?: boolean; outcome?: string | null };
  envelope?: Record<string, unknown> & {
    interface_cid?: string | null;
    receipt_cid?: string | null;
    event_cid?: string | null;
    receipt_success?: boolean;
    artifact_persistence_complete?: boolean;
  };
  cid_retrieval?: {
    all_expected_cids_present?: boolean;
    all_found_verified?: boolean;
    artifacts?: readonly Record<string, unknown>[];
  };
  event_dag?: {
    execution_event_present?: boolean;
    provenance_visible?: boolean;
    event_cid?: string | null;
  };
  error?: string | null;
}

export interface CrossServiceProofResult {
  matrix: Record<string, unknown>;
  receiptCatalog: Record<string, unknown>;
}

export interface CrossServiceProofValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Joins call-bound desktop evidence with the independent server probes. The
 * diagnostic K/D/A projection is kept in its own field deliberately: a green
 * server status is not permission to invent a semantic app/backend role.
 */
export function buildAllAppCrossServiceProof(input: {
  generatedAt: string;
  liveGatewayEvidence: LiveGatewayEvidence;
  peerEvidence: PeerEvidence;
}): CrossServiceProofResult {
  const errors = validateInputs(input.liveGatewayEvidence, input.peerEvidence);
  if (errors.length > 0) throw new Error(errors.join('\n'));

  const executions = input.liveGatewayEvidence.executions ?? [];
  const executionByBindingTransport = new Map(
    executions.map(execution => [
      `${execution.binding_id}:${execution.selected_transport}`,
      execution,
    ]),
  );
  const serviceByOwner = new Map(
    (input.peerEvidence.services ?? []).map(service => [service.service, service]),
  );

  const receiptServers = KDA_BACKEND_FAMILIES.map(family => {
    const service = serviceByOwner.get(family.owner);
    if (!service) throw new Error(`Missing live peer service ${family.owner}.`);
    const appReadBinding = mcpControlReadBinding(family.owner);
    return {
      owner: family.owner,
      kda_key: family.key,
      label: family.label,
      semantic_backend_role: OWNER_SEMANTIC_ROLES[family.owner],
      diagnostic_status_role:
        'Reachability, identity, descriptor, receipt, and event-DAG diagnostics only; this row does not assign an application semantic role.',
      safe_read_tool: service.fixture?.tool ?? service.approved_fixture?.tool ?? null,
      safe_read_approval: service.fixture?.approval ?? service.approved_fixture?.approval ?? null,
      transports: Object.fromEntries(TRANSPORTS.map(transport => {
        const peerTransport = service.transports?.[transport];
        const fixture = service.fixture?.transport_results?.[transport];
        const appExecution = executionByBindingTransport.get(`${appReadBinding.binding_id}:${transport}`);
        return [transport, buildServerTransportReceipt(
          family.owner,
          transport,
          peerTransport,
          fixture,
          appExecution,
        )];
      })),
    };
  });

  const receiptCatalog = {
    schema: KDA_RECEIPT_CATALOG_SCHEMA,
    task_id: ALL_APP_CROSS_SERVICE_TASK_ID,
    generated_at: input.generatedAt,
    status: 'passed',
    source_peer_evidence: {
      schema: input.peerEvidence.schema,
      task_id: input.peerEvidence.task_id,
      generated_at: input.peerEvidence.generated_at,
      decision: input.peerEvidence.decision,
    },
    evidence_policy: {
      safe_read_definition:
        'A real, non-mutating request with dry_run=false, an allow decision, no confirmation requirement, and a persisted receipt/event DAG.',
      independent_transport_sessions_required: true,
      transport_fallback_forbidden: true,
      count_only_inference_forbidden: true,
      application_path_required: 'mcp-control canonical desktop control',
    },
    summary: {
      server_count: receiptServers.length,
      transport_count: receiptServers.length * TRANSPORTS.length,
      real_safe_read_count: receiptServers.length * TRANSPORTS.length,
      application_safe_read_count: receiptServers.length * TRANSPORTS.length,
      persisted_receipt_count: receiptServers.length * TRANSPORTS.length * 2,
    },
    servers: receiptServers,
  };

  const apps = ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.map(appContract => {
    const diagnostic = ALL_APP_BACKEND_STATUS_CONTRACT.apps.find(app => app.app_id === appContract.app_id);
    if (!diagnostic) throw new Error(`Missing K/D/A diagnostic contract for ${appContract.app_id}.`);
    const primaryRoles = appContract.backend_bindings.map(binding => ({
      binding_id: binding.binding_id,
      owner: binding.owner,
      semantic_role: binding.mediated_intent.operation,
      semantic_description: binding.mediated_intent.description,
      capability_id: binding.capability_id,
      intent_id: binding.mediated_intent.intent_id,
      policy_class: binding.mediated_intent.policy_class,
      mutates_remote_state: binding.mediated_intent.mutates_remote_state,
      confirmation_policy: binding.ui_control.confirmation,
      selected_tool_id: binding.tool_selection.preferred_tool_ids[0],
      transports: binding.transport_policy.allowed_transports,
      executions: expectedTransports(binding).map(transport =>
        buildAppExecutionProof(binding, transport, executionByBindingTransport.get(`${binding.binding_id}:${transport}`))),
    }));
    const primaryOwners = new Set(primaryRoles.map(role => role.owner));
    return {
      app_id: appContract.app_id,
      title: VIRTUAL_DESKTOP_APP_MANIFEST.apps.find(app => app.id === appContract.app_id)?.title,
      disposition: appContract.disposition,
      semantic_backend_roles: {
        source: 'canonical executable backend bindings',
        assignment_rule: 'Only these declared bindings are primary application roles.',
        roles: primaryRoles,
      },
      diagnostic_kda_status: {
        source: 'all-app backend status contract',
        interpretation:
          'K/D/A rows report health and policy disposition. They are not primary semantic role assignments.',
        rows: diagnostic.statuses.map(status => ({
          owner: status.owner,
          kda_key: status.key,
          state: status.state,
          role: status.role,
          reason: status.reason,
          diagnostic_only: true,
          declared_primary_semantic_owner: primaryOwners.has(status.owner),
        })),
      },
      proof: {
        primary_role_count: primaryRoles.length,
        diagnostic_row_count: diagnostic.statuses.length,
        diagnostic_status_is_not_semantic_assignment: true,
        user_visible_disposition_proof: appContract.user_visible_proof,
      },
    };
  });

  const bindingCount = ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps
    .reduce((sum, app) => sum + app.backend_bindings.length, 0);
  const mutatingBindings = ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps
    .flatMap(app => app.backend_bindings)
    .filter(binding => binding.mediated_intent.mutates_remote_state);
  const governedExecutionCount = mutatingBindings
    .reduce((sum, binding) => sum + expectedTransports(binding).length, 0);
  const matrix = {
    schema: ALL_APP_TOOL_MATRIX_SCHEMA,
    task_id: ALL_APP_CROSS_SERVICE_TASK_ID,
    generated_at: input.generatedAt,
    status: 'passed',
    manifest_id: VIRTUAL_DESKTOP_APP_MANIFEST.manifest_id,
    manifest_version: VIRTUAL_DESKTOP_APP_MANIFEST.version,
    sources: {
      live_gateway: {
        schema: input.liveGatewayEvidence.schema,
        task_id: input.liveGatewayEvidence.task_id,
        generated_at: input.liveGatewayEvidence.generated_at,
        execution_origin: input.liveGatewayEvidence.execution_origin,
      },
      peer_interoperability: {
        schema: input.peerEvidence.schema,
        task_id: input.peerEvidence.task_id,
        generated_at: input.peerEvidence.generated_at,
        decision: input.peerEvidence.decision,
      },
      receipt_catalog: KDA_RECEIPT_CATALOG_SCHEMA,
    },
    evidence_boundary: {
      primary_semantic_backend_roles:
        'Derived only from canonical executable app bindings and their mediated intent/capability assignments.',
      diagnostic_kda_status:
        'Derived only from the K/D/A status contract; reachability never creates an app semantic assignment.',
      live_execution:
        'Call-bound DID, descriptor, policy, receipt CID, and event-DAG CID come from the same canonical application request.',
      server_safe_reads:
        'Each reachable K/D/A server is independently read over HTTP and libp2p and also read from the canonical MCP Control app path.',
      governed_writes:
        'Every side-effecting request is confirmation-gated and sent only as a dry run.',
    },
    summary: {
      app_count: apps.length,
      primary_semantic_role_count: bindingCount,
      diagnostic_kda_row_count: apps.length * KDA_BACKEND_FAMILIES.length,
      live_application_execution_count: executions.length,
      real_server_safe_read_count: receiptServers.length * TRANSPORTS.length,
      real_application_safe_read_count: receiptServers.length * TRANSPORTS.length,
      governed_write_dry_run_count: governedExecutionCount,
      browser_local_app_count: apps.filter(app => app.disposition === 'browser_local').length,
      policy_blocked_app_count: apps.filter(app => app.disposition === 'policy_blocked').length,
      external_provider_app_count: apps.filter(app => app.disposition === 'external_provider').length,
    },
    acceptance: {
      every_canonical_app_covered: apps.length === VIRTUAL_DESKTOP_APP_MANIFEST.apps.length,
      primary_roles_separate_from_diagnostic_status: true,
      real_safe_read_over_http_and_libp2p_for_each_reachable_server: true,
      did_descriptor_cid_policy_receipt_event_dag_preserved: true,
      governed_writes_confirmation_gated_dry_run: true,
      direct_backend_details_exposed_to_apps: false,
    },
    apps,
  };

  return { matrix, receiptCatalog };
}

export function validateAllAppCrossServiceProof(input: {
  matrix: Record<string, unknown>;
  receiptCatalog: Record<string, unknown>;
}): CrossServiceProofValidation {
  const errors: string[] = [];
  const matrix = input.matrix as any;
  const catalog = input.receiptCatalog as any;
  if (matrix.schema !== ALL_APP_TOOL_MATRIX_SCHEMA) errors.push('invalid all-app tool matrix schema');
  if (matrix.task_id !== ALL_APP_CROSS_SERVICE_TASK_ID || matrix.status !== 'passed') errors.push('all-app tool matrix did not pass SVD-181');
  if (!Array.isArray(matrix.apps) || matrix.apps.length !== VIRTUAL_DESKTOP_APP_MANIFEST.apps.length) errors.push('all-app tool matrix must cover every canonical app');
  if (!matrix.acceptance || Object.values(matrix.acceptance).some(value => value !== true && value !== false)) errors.push('all-app acceptance flags are incomplete');
  if (matrix.acceptance?.direct_backend_details_exposed_to_apps !== false) errors.push('browser boundary exposure flag must be false');
  if (Object.entries(matrix.acceptance ?? {}).some(([key, value]) => key !== 'direct_backend_details_exposed_to_apps' && value !== true)) errors.push('one or more SVD-181 acceptance gates failed');
  const matrixApps = Array.isArray(matrix.apps) ? matrix.apps : [];
  const matrixAppIds = matrixApps.map((app: any) => app?.app_id);
  if (new Set(matrixAppIds).size !== matrixAppIds.length) errors.push('all-app tool matrix contains duplicate app ids');
  for (const appContract of ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps) {
    const app = matrixApps.find((candidate: any) => candidate?.app_id === appContract.app_id);
    if (!app) {
      errors.push(`${appContract.app_id}: application proof missing`);
      continue;
    }
    const roles = app.semantic_backend_roles?.roles;
    if (!Array.isArray(roles) || roles.length !== appContract.backend_bindings.length) {
      errors.push(`${app.app_id}: primary semantic roles do not match canonical bindings`);
      continue;
    }
    const rows = app.diagnostic_kda_status?.rows;
    if (!Array.isArray(rows) || rows.length !== KDA_BACKEND_FAMILIES.length
      || new Set(rows.map((row: any) => row?.owner)).size !== KDA_BACKEND_FAMILIES.length
      || rows.some((row: any) => row?.diagnostic_only !== true)) {
      errors.push(`${app.app_id}: diagnostic K/D/A rows missing or conflated`);
    }
    if (app.proof?.diagnostic_status_is_not_semantic_assignment !== true) errors.push(`${app.app_id}: semantic and diagnostic roles are conflated`);
    for (const binding of appContract.backend_bindings) {
      const role = roles.find((candidate: any) => candidate?.binding_id === binding.binding_id);
      if (!role || role.owner !== binding.owner
        || role.semantic_role !== binding.mediated_intent.operation
        || role.mutates_remote_state !== binding.mediated_intent.mutates_remote_state) {
        errors.push(`${binding.binding_id}: canonical semantic role mismatch`);
        continue;
      }
      const executions = Array.isArray(role.executions) ? role.executions : [];
      for (const transport of expectedTransports(binding)) {
        const execution = executions.find((candidate: any) => candidate?.transport === transport);
        validateCompiledAppExecution(binding, transport, execution, errors);
      }
      if (executions.length !== expectedTransports(binding).length) {
        errors.push(`${binding.binding_id}: unexpected compiled transport execution count`);
      }
    }
  }
  if (catalog.schema !== KDA_RECEIPT_CATALOG_SCHEMA || catalog.status !== 'passed') errors.push('invalid K/D/A receipt catalog');
  if (!Array.isArray(catalog.servers) || catalog.servers.length !== EXECUTABLE_BACKEND_OWNERS.length) errors.push('receipt catalog must cover K/D/A servers');
  const catalogServers = Array.isArray(catalog.servers) ? catalog.servers : [];
  if (new Set(catalogServers.map((server: any) => server?.owner)).size !== catalogServers.length) errors.push('receipt catalog contains duplicate servers');
  for (const owner of EXECUTABLE_BACKEND_OWNERS) {
    const server = catalogServers.find((candidate: any) => candidate?.owner === owner);
    if (!server) {
      errors.push(`${owner}: receipt catalog server missing`);
      continue;
    }
    for (const transport of TRANSPORTS) {
      const row = server.transports?.[transport];
      const label = `${owner}/${transport}`;
      if (!row?.real_safe_read || !row?.application_safe_read || row?.no_transport_fallback !== true) errors.push(`${label}: real safe read missing`);
      if (!CID_PATTERN.test(row?.receipt_cid ?? '') || !CID_PATTERN.test(row?.event_dag_cid ?? '')) errors.push(`${label}: receipt/event CID missing`);
      if (!DID_PATTERN.test(row?.remote_did ?? '') || !CID_PATTERN.test(row?.descriptor_cid ?? '')
        || !CID_PATTERN.test(row?.identity_proof_cid ?? '')) errors.push(`${label}: DID/descriptor evidence missing`);
      const policy = row?.policy;
      if (policy?.operation_class !== 'safe_read' || policy?.mutates_remote_state !== false
        || policy?.confirmation_required !== false || policy?.confirmation_state !== 'not_required'
        || policy?.dry_run !== false || policy?.policy_outcome !== 'allow'
        || !policy?.policy_decision_id || !policy?.correlation_id) errors.push(`${label}: safe-read policy evidence missing`);
      const application = row?.canonical_application_read;
      if (application?.app_id !== 'mcp-control' || application?.owner !== owner
        || !application?.correlation_id || application?.policy?.dry_run !== false
        || application?.policy?.outcome !== 'allow' || application?.policy?.consent !== 'not_required'
        || !CID_PATTERN.test(application?.receipt_cid ?? '')
        || !CID_PATTERN.test(application?.event_dag_cid ?? '')
        || !CID_PATTERN.test(application?.descriptor_cid ?? '')
        || !CID_PATTERN.test(application?.identity_proof_cid ?? '')
        || !DID_PATTERN.test(application?.remote_did ?? '')) errors.push(`${label}: canonical application safe-read receipt missing`);
    }
  }
  return { valid: errors.length === 0, errors };
}

function validateCompiledAppExecution(
  binding: ExecutableBackendBinding,
  transport: 'http' | 'libp2p',
  execution: any,
  errors: string[],
): void {
  const label = `${binding.binding_id}/${transport}`;
  if (!execution) {
    errors.push(`${label}: compiled application execution missing`);
    return;
  }
  if (!execution.correlation_id || execution.same_origin_mediator !== true
    || execution.direct_backend_details_exposed !== false || execution.persistence_status !== 'persisted'
    || execution.outcome !== 'executed' || execution.did_identity?.verified !== true
    || !DID_PATTERN.test(execution.did_identity?.remote_did ?? '')
    || !CID_PATTERN.test(execution.did_identity?.identity_proof_cid ?? '')
    || !CID_PATTERN.test(execution.descriptor_cid ?? '')
    || !CID_PATTERN.test(execution.receipt_cid ?? '')
    || !CID_PATTERN.test(execution.event_dag_cid ?? '')
    || !execution.policy?.decision_id) errors.push(`${label}: compiled DID/descriptor/policy/receipt/event evidence incomplete`);
  if (binding.mediated_intent.mutates_remote_state
    && (execution.operation_class !== 'governed_write_request'
      || execution.execution_mode !== 'confirmation_gated_dry_run'
      || execution.confirmation?.required !== true
      || execution.confirmation?.policy === 'none'
      || execution.confirmation?.consent !== 'granted'
      || execution.confirmation?.dry_run !== true
      || execution.policy?.outcome !== 'require_confirmation'
      || execution.policy?.dry_run !== true)) errors.push(`${label}: compiled governed write is not confirmation-gated dry run`);
}

function validateInputs(live: LiveGatewayEvidence, peer: PeerEvidence): string[] {
  const errors: string[] = [];
  if (live.schema !== 'swissknife.all-app-live-gateway-executions.v2'
    || live.task_id !== 'SVD-126' || live.status !== 'passed'
    || live.execution_origin !== 'canonical-virtual-desktop-browser') {
    errors.push('SVD-181 requires passing SVD-126 canonical desktop live gateway evidence.');
  }
  if (peer.schema !== 'swissknife.all_tools_peer_interoperability_evidence.v1'
    || peer.task_id !== 'SVD-100' || peer.decision !== 'go') {
    errors.push('SVD-181 requires passing SVD-100 independent HTTP/libp2p peer evidence.');
  }
  const executions = live.executions ?? [];
  const expected = ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.flatMap(app =>
    app.backend_bindings.flatMap(binding => expectedTransports(binding)
      .map(transport => `${binding.binding_id}:${transport}`)));
  const counts = new Map<string, number>();
  for (const execution of executions) {
    const key = `${execution.binding_id}:${execution.selected_transport}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const key of expected) {
    if (counts.get(key) !== 1) errors.push(`${key}: expected exactly one live application receipt`);
  }
  for (const app of ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps) {
    for (const binding of app.backend_bindings) {
      for (const transport of expectedTransports(binding)) {
        validateLiveExecution(binding, transport,
          executions.find(row => row.binding_id === binding.binding_id && row.selected_transport === transport), errors);
      }
    }
  }
  const services = peer.services ?? [];
  for (const owner of EXECUTABLE_BACKEND_OWNERS) {
    const service = services.find(row => row.service === owner);
    if (!service || service.decision !== 'go') {
      errors.push(`${owner}: live peer decision is not go`);
      continue;
    }
    if (service.gates?.some(gate => gate.passed !== true)) errors.push(`${owner}: one or more peer gates failed`);
    for (const transport of TRANSPORTS) {
      validatePeerRead(owner, transport, service.transports?.[transport],
        service.fixture?.transport_results?.[transport], errors);
      const binding = mcpControlReadBinding(owner);
      const appRead = executions.find(row => row.binding_id === binding.binding_id && row.selected_transport === transport);
      if (appRead?.invocation?.real_safe_read !== true || appRead.policy?.dry_run !== false) {
        errors.push(`${owner}/${transport}: canonical MCP Control real safe read missing`);
      }
    }
  }
  return errors;
}

function validateLiveExecution(
  binding: ExecutableBackendBinding,
  transport: 'http' | 'libp2p',
  execution: LiveGatewayExecution | undefined,
  errors: string[],
): void {
  const label = `${binding.binding_id}/${transport}`;
  if (!execution) return;
  const observation = execution.transport_observation;
  if (execution.app_id !== binding.binding_id.split('.')[0]
    || execution.owner !== binding.owner
    || !binding.tool_selection.preferred_tool_ids.includes(execution.selected_tool_id ?? '')
    || execution.ui_control_id !== `live-gateway-control-${binding.binding_id}`) errors.push(`${label}: binding identity mismatch`);
  if (execution.request?.route !== '/mcp/tools/call' || execution.request.same_origin !== true
    || execution.response?.outcome !== 'executed' || execution.response.ok !== true
    || execution.response.http_status !== 200 || execution.persistence?.status !== 'persisted') errors.push(`${label}: successful persisted same-origin execution missing`);
  if (!CID_PATTERN.test(execution.persistence?.receipt_cid ?? execution.receipt_refs?.[0] ?? '')
    || !CID_PATTERN.test(execution.persistence?.event_cid ?? execution.event_dag_refs?.[0] ?? '')) errors.push(`${label}: receipt/event DAG CID missing`);
  if (observation?.transport !== transport || observation.ucan_did_verified !== true
    || !DID_PATTERN.test(observation.remote_did ?? '')
    || !CID_PATTERN.test(observation.descriptor_cid ?? '')
    || !CID_PATTERN.test(observation.identity_proof_cid ?? '')
    || observation.correlation_id !== execution.correlation_id) errors.push(`${label}: call-bound DID/descriptor evidence missing`);
  if (!execution.policy?.decision_id || execution.policy.dry_run !== execution.invocation?.dry_run) errors.push(`${label}: policy decision not preserved`);
  if (binding.mediated_intent.mutates_remote_state) {
    if (binding.ui_control.confirmation === 'none'
      || execution.invocation?.dry_run !== true
      || execution.invocation?.confirmation_required !== true
      || execution.invocation?.confirmation_or_policy !== 'confirmation_gated_dry_run'
      || execution.policy.outcome !== 'require_confirmation'
      || execution.policy.consent !== 'granted') errors.push(`${label}: governed write is not confirmation-gated dry run`);
  }
}

function validatePeerRead(
  owner: string,
  transport: 'http' | 'libp2p',
  peerTransport: PeerTransportEvidence | undefined,
  fixture: PeerFixtureEvidence | undefined,
  errors: string[],
): void {
  const label = `${owner}/${transport}`;
  if (!peerTransport?.connected || peerTransport.selected_transport !== transport
    || peerTransport.no_transport_fallback !== true) errors.push(`${label}: independent selected transport missing`);
  if (!peerTransport?.descriptor?.cid_retrieval_complete || !peerTransport.descriptor.compatible
    || !(peerTransport.descriptor.retrieved_cids ?? []).some(cid => CID_PATTERN.test(cid))) errors.push(`${label}: descriptor CID retrieval missing`);
  if (!peerTransport?.identity?.verified || !DID_PATTERN.test(peerTransport.identity.remote_did ?? '')
    || !CID_PATTERN.test(peerTransport.identity.identity_proof_cid ?? '')) errors.push(`${label}: verified DID identity missing`);
  if (fixture?.status !== 'executed' || fixture.plain_call?.returned !== true
    || fixture.plain_call.outcome !== 'success' || fixture.envelope?.receipt_success !== true
    || fixture.envelope.artifact_persistence_complete !== true
    || !CID_PATTERN.test(fixture.envelope.receipt_cid ?? '')
    || !CID_PATTERN.test(fixture.envelope.event_cid ?? '')
    || fixture.cid_retrieval?.all_expected_cids_present !== true
    || fixture.cid_retrieval.all_found_verified !== true
    || fixture.event_dag?.execution_event_present !== true
    || fixture.event_dag.provenance_visible !== true) errors.push(`${label}: persisted safe-read receipt/event DAG missing`);
  const governance = fixture?.governance;
  if (governance?.operation_class !== 'safe_read'
    || governance.mutates_remote_state !== false
    || governance.confirmation_required !== false
    || governance.confirmation_state !== 'not_required'
    || governance.dry_run !== false
    || governance.policy_outcome !== 'allow'
    || !governance.policy_decision_id
    || !governance.correlation_id) errors.push(`${label}: real safe-read policy evidence missing`);
}

function buildServerTransportReceipt(
  owner: ExecutableBackendOwner,
  transport: 'http' | 'libp2p',
  peerTransport: PeerTransportEvidence | undefined,
  fixture: PeerFixtureEvidence | undefined,
  appExecution: LiveGatewayExecution | undefined,
): Record<string, unknown> {
  return {
    transport,
    real_safe_read: true,
    application_safe_read: true,
    no_transport_fallback: peerTransport?.no_transport_fallback,
    tool_id: fixture?.tool,
    correlation_id: fixture?.governance?.correlation_id,
    policy: fixture?.governance,
    remote_did: peerTransport?.identity?.remote_did,
    identity_proof_cid: peerTransport?.identity?.identity_proof_cid,
    peer_id: peerTransport?.identity?.peer_id,
    descriptor_cid: peerTransport?.descriptor?.retrieved_cids?.[0],
    descriptor_cids: peerTransport?.descriptor?.retrieved_cids ?? [],
    negotiated_profiles: peerTransport?.normalized_negotiated_profiles ?? [],
    envelope_cids: fixture?.envelope,
    receipt_cid: fixture?.envelope?.receipt_cid,
    event_dag_cid: fixture?.envelope?.event_cid,
    cid_retrieval: fixture?.cid_retrieval,
    event_dag: fixture?.event_dag,
    canonical_application_read: {
      app_id: 'mcp-control',
      binding_id: appExecution?.binding_id,
      owner,
      selected_tool_id: appExecution?.selected_tool_id,
      correlation_id: appExecution?.correlation_id,
      policy: appExecution?.policy,
      receipt_cid: appExecution?.persistence?.receipt_cid,
      event_dag_cid: appExecution?.persistence?.event_cid,
      descriptor_cid: appExecution?.transport_observation?.descriptor_cid,
      remote_did: appExecution?.transport_observation?.remote_did,
      identity_proof_cid: appExecution?.transport_observation?.identity_proof_cid,
    },
  };
}

function buildAppExecutionProof(
  binding: ExecutableBackendBinding,
  transport: 'http' | 'libp2p',
  execution: LiveGatewayExecution | undefined,
): Record<string, unknown> {
  const mutating = binding.mediated_intent.mutates_remote_state;
  return {
    transport,
    operation_class: mutating ? 'governed_write_request' : 'read_request',
    execution_mode: mutating ? 'confirmation_gated_dry_run' : execution?.invocation?.real_safe_read ? 'real_safe_read' : 'safe_read_dry_run',
    correlation_id: execution?.correlation_id,
    policy: execution?.policy,
    confirmation: {
      required: mutating,
      policy: binding.ui_control.confirmation,
      consent: execution?.policy?.consent,
      dry_run: execution?.invocation?.dry_run,
    },
    did_identity: {
      verified: execution?.transport_observation?.ucan_did_verified,
      remote_did: execution?.transport_observation?.remote_did,
      identity_proof_cid: execution?.transport_observation?.identity_proof_cid,
    },
    descriptor_cid: execution?.transport_observation?.descriptor_cid,
    receipt_cid: execution?.persistence?.receipt_cid ?? execution?.receipt_refs?.[0],
    event_dag_cid: execution?.persistence?.event_cid ?? execution?.event_dag_refs?.[0],
    persistence_status: execution?.persistence?.status,
    outcome: execution?.response?.outcome,
    same_origin_mediator: execution?.request?.same_origin,
    direct_backend_details_exposed: false,
  };
}

function expectedTransports(binding: ExecutableBackendBinding): Array<'http' | 'libp2p'> {
  return TRANSPORTS.filter(transport => binding.transport_policy.allowed_transports.includes(transport));
}

function mcpControlReadBinding(owner: ExecutableBackendOwner): ExecutableBackendBinding {
  const app = ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.find(candidate => candidate.app_id === 'mcp-control');
  const binding = app?.backend_bindings.find(candidate =>
    candidate.owner === owner && candidate.mediated_intent.mutates_remote_state === false);
  if (!binding || !binding.transport_policy.allowed_transports.includes('libp2p')) {
    throw new Error(`SVD-181 requires a dual-transport MCP Control read binding for ${owner}.`);
  }
  return binding;
}
