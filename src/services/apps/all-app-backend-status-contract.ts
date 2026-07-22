import {
  ALL_APP_EXECUTABLE_BACKEND_CONTRACT,
  EXECUTABLE_BACKEND_GATEWAY_ROUTE,
  EXECUTABLE_BACKEND_OWNERS,
  type AppBackendDisposition,
  type BackendRecoveryRoute,
  type ExecutableAppBackendDisposition,
  type ExecutableBackendBinding,
  type ExecutableBackendOwner,
  type MediatedPolicyOutcome,
} from './all-app-executable-backend-contract.js';
import {
  ALL_APP_LIVE_TOOL_BINDINGS,
  type AllAppLiveToolBinding,
} from './all-app-live-tool-bindings.js';
import {
  VIRTUAL_DESKTOP_APP_MANIFEST,
  getVirtualDesktopApp,
  type VirtualDesktopAppManifestEntry,
  type VirtualDesktopPolicyClass,
  type VirtualDesktopReceiptStrategy,
} from './virtual-desktop-app-manifest.js';

export const ALL_APP_BACKEND_STATUS_CONTRACT_SCHEMA =
  'swissknife.all-app-backend-status-contract.v1';
export const ALL_APP_BACKEND_STATUS_CONTRACT_ID =
  'org.hallucinate.swissknife.all-app-backend-status-contract';
export const ALL_APP_BACKEND_STATUS_CONTRACT_VERSION = '1.0.0';
export const BACKEND_STATUS_MATRIX_SCHEMA =
  'swissknife.virtual-desktop.backend-status-matrix.v1';

export type AllAppBackendStatusState =
  | 'live'
  | 'denied'
  | 'unavailable'
  | 'local-only'
  | 'external-provider';

export type AllAppBackendRole =
  | 'mediated-gateway'
  | 'policy-denied'
  | 'capability-unavailable'
  | 'browser-local'
  | 'external-provider';

export interface KdaBackendFamily {
  owner: ExecutableBackendOwner;
  key: 'K' | 'D' | 'A';
  label: string;
}

export interface BackendStatusControlObservation {
  binding_id: string;
  status: 'available' | 'unavailable';
  selected_tool_id?: string | null;
  transport?: 'http' | 'libp2p' | null;
  transports?: readonly ('http' | 'libp2p')[];
}

export interface BackendStatusBuildOptions {
  controls?: readonly BackendStatusControlObservation[];
}

export interface BackendStatusCorrelationContract {
  required: boolean;
  preservation: 'required_and_preserved';
  current_correlation_id: string | null;
}

export interface BackendStatusPolicyContract {
  required: boolean;
  current_outcome: MediatedPolicyOutcome | 'not_evaluated';
  policy_classes: readonly VirtualDesktopPolicyClass[];
  decision_id: string | null;
  reason: string;
}

export interface BackendStatusReceiptContract {
  required: boolean;
  strategies: readonly VirtualDesktopReceiptStrategy[];
  current_receipt_id: string | null;
  persistence: 'ipfs_kit_py_or_browser_helia' | 'browser_runtime' | 'provider_receipt' | 'not_required';
  visible_fields: readonly string[];
}

export interface BackendStatusRecoveryRoute {
  error:
    | BackendRecoveryRoute['error']
    | 'capability_not_declared'
    | 'local_runtime'
    | 'provider_handoff';
  action:
    | BackendRecoveryRoute['action']
    | 'use_declared_backend_roles'
    | 'continue_browser_workflow'
    | 'complete_provider_handoff';
  next_error: BackendRecoveryRoute['next_error'] | null;
  user_message: string;
  preserves_correlation_id: true;
}

export interface BackendStatusBindingRef {
  binding_id: string;
  capability_id: string;
  intent_id: string;
  gateway_route: typeof EXECUTABLE_BACKEND_GATEWAY_ROUTE;
  transports: readonly ('http' | 'libp2p')[];
  selected_tool_id: string | null;
  status_source: 'live-tool-binding' | 'gateway-control-catalog';
}

export interface AllAppBackendOwnerStatus {
  owner: ExecutableBackendOwner;
  key: KdaBackendFamily['key'];
  label: string;
  state: AllAppBackendStatusState;
  role: AllAppBackendRole;
  source: 'mediated-gateway' | 'policy' | 'manifest' | 'provider-handoff';
  reason: string;
  gateway: {
    route: typeof EXECUTABLE_BACKEND_GATEWAY_ROUTE | null;
    browser_boundary: 'mediated_gateway_only';
    direct_backend_access: false;
    browser_credentials: 'never_exposed_to_application';
    host_file_access: 'never_exposed_to_application';
    owner_process_access: 'never_exposed_to_application';
  };
  bindings: readonly BackendStatusBindingRef[];
  correlation: BackendStatusCorrelationContract;
  policy: BackendStatusPolicyContract;
  receipt: BackendStatusReceiptContract;
  recovery: {
    current_state: AllAppBackendStatusState;
    routes: readonly BackendStatusRecoveryRoute[];
    never_silently_fallback: true;
  };
}

export interface AllAppBackendStatus {
  app_id: string;
  title: string;
  aliases: readonly string[];
  disposition: AppBackendDisposition;
  statuses: readonly AllAppBackendOwnerStatus[];
  display_contract: {
    component: 'all-app-backend-status-panel';
    required_rows: readonly KdaBackendFamily['key'][];
    visible_fields: readonly string[];
  };
}

export interface AllAppBackendStatusContract {
  schema: typeof ALL_APP_BACKEND_STATUS_CONTRACT_SCHEMA;
  contract_id: typeof ALL_APP_BACKEND_STATUS_CONTRACT_ID;
  version: typeof ALL_APP_BACKEND_STATUS_CONTRACT_VERSION;
  source_contracts: {
    executable_backend_contract: {
      contract_id: string;
      version: string;
    };
    live_tool_bindings: {
      catalog_id: string;
      version: string;
    };
    manifest: {
      manifest_id: string;
      manifest_version: string;
    };
  };
  browser_safety: {
    gateway_route: typeof EXECUTABLE_BACKEND_GATEWAY_ROUTE;
    backend_urls_exposed: false;
    credentials_exposed: false;
    host_paths_exposed: false;
    owner_processes_exposed: false;
  };
  backend_families: readonly KdaBackendFamily[];
  apps: readonly AllAppBackendStatus[];
}

export interface AllAppBackendStatusValidationResult {
  valid: boolean;
  errors: string[];
}

export const KDA_BACKEND_FAMILIES: readonly KdaBackendFamily[] = Object.freeze([
  Object.freeze({ owner: 'ipfs_kit_py', key: 'K', label: 'IPFS Kit' }),
  Object.freeze({ owner: 'ipfs_datasets_py', key: 'D', label: 'IPFS Datasets' }),
  Object.freeze({ owner: 'ipfs_accelerate_py', key: 'A', label: 'IPFS Accelerate' }),
]);

const SAFE_VISIBLE_FIELDS = Object.freeze([
  'state',
  'owner',
  'correlation_id',
  'policy_outcome',
  'receipt_id',
  'recovery',
] as const);

const LIVE_BINDING_BY_ID = new Map(
  ALL_APP_LIVE_TOOL_BINDINGS.bindings.map(binding => [binding.binding_id, binding]),
);

const FORBIDDEN_BROWSER_STATUS_PATTERNS: readonly RegExp[] = Object.freeze([
  /https?:\/\/[^\s"']+/i,
  /\b(?:127\.0\.0\.1|0\.0\.0\.0|localhost)\b/i,
  /\/(?:home|Users|var|tmp|private)\//,
  /\b(?:backend_url|authorization|bearer|api_key|password|host_path|file_path|filesystem_path|python_process|process_command|stdio)\b/i,
]);

export function buildAllAppBackendStatusContract(
  options: BackendStatusBuildOptions = {},
): AllAppBackendStatusContract {
  const controlByBindingId = new Map((options.controls ?? []).map(control => [control.binding_id, control]));
  return Object.freeze({
    schema: ALL_APP_BACKEND_STATUS_CONTRACT_SCHEMA,
    contract_id: ALL_APP_BACKEND_STATUS_CONTRACT_ID,
    version: ALL_APP_BACKEND_STATUS_CONTRACT_VERSION,
    source_contracts: Object.freeze({
      executable_backend_contract: Object.freeze({
        contract_id: ALL_APP_EXECUTABLE_BACKEND_CONTRACT.contract_id,
        version: ALL_APP_EXECUTABLE_BACKEND_CONTRACT.version,
      }),
      live_tool_bindings: Object.freeze({
        catalog_id: ALL_APP_LIVE_TOOL_BINDINGS.catalog_id,
        version: ALL_APP_LIVE_TOOL_BINDINGS.version,
      }),
      manifest: Object.freeze({
        manifest_id: VIRTUAL_DESKTOP_APP_MANIFEST.manifest_id,
        manifest_version: VIRTUAL_DESKTOP_APP_MANIFEST.version,
      }),
    }),
    browser_safety: Object.freeze({
      gateway_route: EXECUTABLE_BACKEND_GATEWAY_ROUTE,
      backend_urls_exposed: false,
      credentials_exposed: false,
      host_paths_exposed: false,
      owner_processes_exposed: false,
    }),
    backend_families: KDA_BACKEND_FAMILIES,
    apps: Object.freeze(ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.map(appContract =>
      buildAppStatus(appContract, controlByBindingId),
    )),
  });
}

export const ALL_APP_BACKEND_STATUS_CONTRACT: AllAppBackendStatusContract =
  buildAllAppBackendStatusContract();

const BACKEND_STATUS_BY_APP_ID = new Map(
  ALL_APP_BACKEND_STATUS_CONTRACT.apps.map(app => [app.app_id, app]),
);
const BACKEND_STATUS_BY_ALIAS = new Map(
  ALL_APP_BACKEND_STATUS_CONTRACT.apps.flatMap(app =>
    app.aliases.map(alias => [alias, app] as const),
  ),
);

export function getAllAppBackendStatus(appIdOrAlias: string): AllAppBackendStatus | null {
  return BACKEND_STATUS_BY_APP_ID.get(appIdOrAlias)
    ?? BACKEND_STATUS_BY_ALIAS.get(appIdOrAlias)
    ?? null;
}

export function buildBackendStatusMatrixEvidence(
  contract: AllAppBackendStatusContract = ALL_APP_BACKEND_STATUS_CONTRACT,
  generatedAt = new Date().toISOString(),
): Record<string, unknown> {
  const stateCounts = Object.fromEntries(
    ['live', 'denied', 'unavailable', 'local-only', 'external-provider']
      .map(state => [state, 0]),
  ) as Record<AllAppBackendStatusState, number>;
  for (const status of contract.apps) {
    for (const ownerStatus of status.statuses) stateCounts[ownerStatus.state] += 1;
  }

  return {
    schema: BACKEND_STATUS_MATRIX_SCHEMA,
    task_id: 'SVD-134',
    generated_at: generatedAt,
    contract_id: contract.contract_id,
    contract_version: contract.version,
    manifest_id: contract.source_contracts.manifest.manifest_id,
    manifest_version: contract.source_contracts.manifest.manifest_version,
    app_count: contract.apps.length,
    backend_families: contract.backend_families,
    summary: {
      total_statuses: contract.apps.length * contract.backend_families.length,
      states: stateCounts,
      browser_safety: contract.browser_safety,
    },
    apps: contract.apps.map(app => ({
      app_id: app.app_id,
      title: app.title,
      disposition: app.disposition,
      statuses: app.statuses.map(status => ({
        owner: status.owner,
        key: status.key,
        state: status.state,
        role: status.role,
        source: status.source,
        reason: status.reason,
        binding_count: status.bindings.length,
        binding_ids: status.bindings.map(binding => binding.binding_id),
        gateway_route: status.gateway.route,
        correlation: status.correlation,
        policy: status.policy,
        receipt: status.receipt,
        recovery: status.recovery,
      })),
    })),
  };
}

export function validateAllAppBackendStatusContract(
  contract: AllAppBackendStatusContract = ALL_APP_BACKEND_STATUS_CONTRACT,
): AllAppBackendStatusValidationResult {
  const errors: string[] = [];
  if (contract.schema !== ALL_APP_BACKEND_STATUS_CONTRACT_SCHEMA) errors.push('invalid backend status schema');
  if (contract.contract_id !== ALL_APP_BACKEND_STATUS_CONTRACT_ID) errors.push('invalid backend status contract id');
  if (contract.version !== ALL_APP_BACKEND_STATUS_CONTRACT_VERSION) errors.push('unsupported backend status version');
  if (contract.source_contracts.manifest.manifest_id !== VIRTUAL_DESKTOP_APP_MANIFEST.manifest_id
    || contract.source_contracts.manifest.manifest_version !== VIRTUAL_DESKTOP_APP_MANIFEST.version) {
    errors.push('manifest identity mismatch');
  }
  if (contract.apps.length !== VIRTUAL_DESKTOP_APP_MANIFEST.apps.length) {
    errors.push('backend status app count does not match manifest');
  }
  if (!sameStringSet(contract.backend_families.map(family => family.owner), [...EXECUTABLE_BACKEND_OWNERS])) {
    errors.push('backend status families must cover K/D/A owners exactly');
  }
  if (contract.browser_safety.backend_urls_exposed
    || contract.browser_safety.credentials_exposed
    || contract.browser_safety.host_paths_exposed
    || contract.browser_safety.owner_processes_exposed) {
    errors.push('browser safety flags expose a forbidden backend boundary');
  }

  const serialized = JSON.stringify(contract);
  for (const pattern of FORBIDDEN_BROWSER_STATUS_PATTERNS) {
    if (pattern.test(serialized)) errors.push(`browser status contract contains forbidden pattern ${pattern.source}`);
  }

  const expectedIds = new Set(VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => app.id));
  const seenAppIds = new Set<string>();
  for (const app of contract.apps) {
    const manifestApp = getVirtualDesktopApp(app.app_id);
    if (!manifestApp || !expectedIds.has(app.app_id)) errors.push(`${app.app_id}: not a canonical app`);
    if (seenAppIds.has(app.app_id)) errors.push(`${app.app_id}: duplicate backend status app`);
    seenAppIds.add(app.app_id);
    if (app.statuses.length !== KDA_BACKEND_FAMILIES.length) errors.push(`${app.app_id}: must display K/D/A rows`);
    if (app.display_contract.component !== 'all-app-backend-status-panel') {
      errors.push(`${app.app_id}: missing shared browser status component`);
    }
    if (!sameStringSet(app.display_contract.required_rows, ['K', 'D', 'A'])) {
      errors.push(`${app.app_id}: display contract must require K/D/A rows`);
    }
    for (const family of KDA_BACKEND_FAMILIES) {
      const status = app.statuses.find(candidate => candidate.owner === family.owner);
      if (!status) {
        errors.push(`${app.app_id}: missing ${family.owner} status`);
        continue;
      }
      if (status.key !== family.key || status.label !== family.label) {
        errors.push(`${app.app_id}/${family.owner}: incorrect K/D/A label`);
      }
      if (status.gateway.direct_backend_access !== false
        || status.gateway.browser_boundary !== 'mediated_gateway_only'
        || status.gateway.browser_credentials !== 'never_exposed_to_application'
        || status.gateway.host_file_access !== 'never_exposed_to_application'
        || status.gateway.owner_process_access !== 'never_exposed_to_application') {
        errors.push(`${app.app_id}/${family.owner}: forbidden browser gateway boundary`);
      }
      if (!status.correlation.required || status.correlation.preservation !== 'required_and_preserved') {
        errors.push(`${app.app_id}/${family.owner}: correlation is not preserved`);
      }
      if (status.recovery.never_silently_fallback !== true || status.recovery.routes.length === 0) {
        errors.push(`${app.app_id}/${family.owner}: missing recovery contract`);
      }
      if (status.state === 'live') {
        if (status.role !== 'mediated-gateway' || status.source !== 'mediated-gateway') {
          errors.push(`${app.app_id}/${family.owner}: live status is not mediated`);
        }
        if (status.gateway.route !== EXECUTABLE_BACKEND_GATEWAY_ROUTE) {
          errors.push(`${app.app_id}/${family.owner}: live status missing gateway route`);
        }
        if (status.bindings.length === 0 || status.bindings.some(binding => !LIVE_BINDING_BY_ID.has(binding.binding_id))) {
          errors.push(`${app.app_id}/${family.owner}: live status has no materialized binding`);
        }
        if (!status.receipt.required || status.receipt.visible_fields.length === 0) {
          errors.push(`${app.app_id}/${family.owner}: live status must require visible receipt data`);
        }
      }
      if (status.state === 'denied'
        && (status.policy.current_outcome !== 'deny' || status.role !== 'policy-denied')) {
        errors.push(`${app.app_id}/${family.owner}: denied status must carry policy denial data`);
      }
      if (status.state === 'local-only' && status.role !== 'browser-local') {
        errors.push(`${app.app_id}/${family.owner}: local-only status must be browser-local`);
      }
      if (status.state === 'external-provider' && status.role !== 'external-provider') {
        errors.push(`${app.app_id}/${family.owner}: external provider status must identify provider handoff`);
      }
      if (status.state === 'unavailable'
        && (status.role !== 'capability-unavailable' || status.reason.trim().length === 0)) {
        errors.push(`${app.app_id}/${family.owner}: unavailable status must explain the missing role`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

function buildAppStatus(
  appContract: ExecutableAppBackendDisposition,
  controlByBindingId: ReadonlyMap<string, BackendStatusControlObservation>,
): AllAppBackendStatus {
  const manifestApp = getVirtualDesktopApp(appContract.app_id);
  if (!manifestApp) throw new Error(`Backend status missing manifest app ${appContract.app_id}`);
  return Object.freeze({
    app_id: appContract.app_id,
    title: manifestApp.title,
    aliases: Object.freeze([...appContract.aliases]),
    disposition: appContract.disposition,
    statuses: Object.freeze(KDA_BACKEND_FAMILIES.map(family =>
      buildOwnerStatus(manifestApp, appContract, family, controlByBindingId),
    )),
    display_contract: Object.freeze({
      component: 'all-app-backend-status-panel',
      required_rows: Object.freeze(['K', 'D', 'A'] as const),
      visible_fields: SAFE_VISIBLE_FIELDS,
    }),
  });
}

function buildOwnerStatus(
  manifestApp: VirtualDesktopAppManifestEntry,
  appContract: ExecutableAppBackendDisposition,
  family: KdaBackendFamily,
  controlByBindingId: ReadonlyMap<string, BackendStatusControlObservation>,
): AllAppBackendOwnerStatus {
  const sourceBindings = appContract.backend_bindings.filter(binding => binding.owner === family.owner);
  if (sourceBindings.length > 0) {
    return buildLiveOrUnavailableOwnerStatus(manifestApp, appContract, family, sourceBindings, controlByBindingId);
  }
  if (appContract.disposition === 'policy_blocked') return buildDeniedOwnerStatus(manifestApp, appContract, family);
  if (appContract.disposition === 'browser_local') return buildLocalOwnerStatus(manifestApp, appContract, family);
  if (appContract.disposition === 'external_provider' || manifestApp.service_families.includes('external_network')) {
    return buildExternalProviderOwnerStatus(manifestApp, appContract, family);
  }
  return buildUnavailableOwnerStatus(manifestApp, appContract, family);
}

function buildLiveOrUnavailableOwnerStatus(
  manifestApp: VirtualDesktopAppManifestEntry,
  appContract: ExecutableAppBackendDisposition,
  family: KdaBackendFamily,
  bindings: readonly ExecutableBackendBinding[],
  controlByBindingId: ReadonlyMap<string, BackendStatusControlObservation>,
): AllAppBackendOwnerStatus {
  const bindingRefs = bindings.map(binding => bindingRef(binding, controlByBindingId.get(binding.binding_id)));
  const observedUnavailable = bindingRefs.every(ref => ref.status_source === 'gateway-control-catalog'
    && ref.selected_tool_id === null);
  if (observedUnavailable) {
    return baseOwnerStatus({
      family,
      state: 'unavailable',
      role: 'capability-unavailable',
      source: 'mediated-gateway',
      reason: `${manifestApp.title} declares ${family.label}, but the mediated gateway catalog did not advertise an approved tool for the declared binding.`,
      bindings: bindingRefs,
      policyClasses: unique(bindings.map(binding => binding.mediated_intent.policy_class)),
      receiptStrategies: unique(bindings.map(binding => binding.receipt_requirement.manifest_strategy)),
      receiptRequired: true,
      receiptPersistence: 'ipfs_kit_py_or_browser_helia',
      policyOutcome: 'not_evaluated',
      policyReason: 'Gateway discovery must select an approved owner tool before policy can allow execution.',
      routes: [{
        error: 'tool_unsupported',
        action: 'refresh_descriptor',
        next_error: 'tool_unsupported',
        user_message: 'Refresh the mediated tool catalog and keep the unavailable state visible until an approved owner tool is advertised.',
        preserves_correlation_id: true,
      }],
    });
  }
  return baseOwnerStatus({
    family,
    state: 'live',
    role: 'mediated-gateway',
    source: 'mediated-gateway',
    reason: `${manifestApp.title} has ${bindings.length} materialized ${family.label} binding(s) through the same-origin gateway.`,
    bindings: bindingRefs,
    policyClasses: unique(bindings.map(binding => binding.mediated_intent.policy_class)),
    receiptStrategies: unique(bindings.map(binding => binding.receipt_requirement.manifest_strategy)),
    receiptRequired: true,
    receiptPersistence: 'ipfs_kit_py_or_browser_helia',
    policyOutcome: 'not_evaluated',
    policyReason: 'A policy decision is required before each mediated invocation.',
    routes: uniqueRoutes(bindings.flatMap(binding => binding.error_recovery.routes)),
  });
}

function buildDeniedOwnerStatus(
  manifestApp: VirtualDesktopAppManifestEntry,
  appContract: ExecutableAppBackendDisposition,
  family: KdaBackendFamily,
): AllAppBackendOwnerStatus {
  return baseOwnerStatus({
    family,
    state: 'denied',
    role: 'policy-denied',
    source: 'policy',
    reason: browserSafeReason(appContract.rationale),
    bindings: [],
    policyClasses: ['credential'],
    receiptStrategies: ['confirmation-receipt'],
    receiptRequired: true,
    receiptPersistence: 'browser_runtime',
    policyOutcome: 'deny',
    policyDecisionId: `${manifestApp.id}.${family.owner}.credential-isolation-v1`,
    policyReason: `${manifestApp.title} keeps credential handling isolated from ${family.label}.`,
    routes: [{
      error: 'policy_denied',
      action: 'request_confirmation',
      next_error: null,
      user_message: 'Review the credential-isolation policy and continue with the browser-local recovery workflow.',
      preserves_correlation_id: true,
    }],
  });
}

function buildLocalOwnerStatus(
  manifestApp: VirtualDesktopAppManifestEntry,
  appContract: ExecutableAppBackendDisposition,
  family: KdaBackendFamily,
): AllAppBackendOwnerStatus {
  return baseOwnerStatus({
    family,
    state: 'local-only',
    role: 'browser-local',
    source: 'manifest',
    reason: browserSafeReason(appContract.rationale),
    bindings: [],
    policyClasses: [],
    receiptStrategies: ['none'],
    receiptRequired: false,
    receiptPersistence: 'browser_runtime',
    policyOutcome: 'not_evaluated',
    policyReason: `${manifestApp.title} has no declared ${family.label} backend operation in the canonical manifest.`,
    routes: [{
      error: 'local_runtime',
      action: 'continue_browser_workflow',
      next_error: null,
      user_message: 'Continue with the browser-local workflow; no backend dispatch is expected for this role.',
      preserves_correlation_id: true,
    }],
  });
}

function buildExternalProviderOwnerStatus(
  manifestApp: VirtualDesktopAppManifestEntry,
  appContract: ExecutableAppBackendDisposition,
  family: KdaBackendFamily,
): AllAppBackendOwnerStatus {
  return baseOwnerStatus({
    family,
    state: 'external-provider',
    role: 'external-provider',
    source: 'provider-handoff',
    reason: appContract.disposition === 'external_provider'
      ? browserSafeReason(appContract.rationale)
      : `${manifestApp.title} uses an external provider handoff for this role instead of a ${family.label} owner binding.`,
    bindings: [],
    policyClasses: ['external_network'],
    receiptStrategies: ['confirmation-receipt'],
    receiptRequired: true,
    receiptPersistence: 'provider_receipt',
    policyOutcome: 'not_evaluated',
    policyReason: 'Provider handoff and request receipts stay opaque in the browser status view.',
    routes: [{
      error: 'provider_handoff',
      action: 'complete_provider_handoff',
      next_error: null,
      user_message: 'Complete or cancel the external provider handoff; do not substitute an owner backend call.',
      preserves_correlation_id: true,
    }],
  });
}

function buildUnavailableOwnerStatus(
  manifestApp: VirtualDesktopAppManifestEntry,
  appContract: ExecutableAppBackendDisposition,
  family: KdaBackendFamily,
): AllAppBackendOwnerStatus {
  return baseOwnerStatus({
    family,
    state: 'unavailable',
    role: 'capability-unavailable',
    source: 'manifest',
    reason: `${manifestApp.title} does not declare a ${family.label} backend capability in this release; ${appContract.disposition} remains explicit.`,
    bindings: [],
    policyClasses: [],
    receiptStrategies: ['none'],
    receiptRequired: false,
    receiptPersistence: 'not_required',
    policyOutcome: 'not_evaluated',
    policyReason: 'No mediated owner binding exists for this app role.',
    routes: [{
      error: 'capability_not_declared',
      action: 'use_declared_backend_roles',
      next_error: null,
      user_message: 'Use the app roles that are declared live; keep this unavailable role visible instead of inventing a backend call.',
      preserves_correlation_id: true,
    }],
  });
}

function baseOwnerStatus(options: {
  family: KdaBackendFamily;
  state: AllAppBackendStatusState;
  role: AllAppBackendRole;
  source: AllAppBackendOwnerStatus['source'];
  reason: string;
  bindings: readonly BackendStatusBindingRef[];
  policyClasses: readonly VirtualDesktopPolicyClass[];
  receiptStrategies: readonly VirtualDesktopReceiptStrategy[];
  receiptRequired: boolean;
  receiptPersistence: BackendStatusReceiptContract['persistence'];
  policyOutcome: BackendStatusPolicyContract['current_outcome'];
  policyDecisionId?: string;
  policyReason: string;
  routes: readonly BackendStatusRecoveryRoute[];
}): AllAppBackendOwnerStatus {
  return Object.freeze({
    owner: options.family.owner,
    key: options.family.key,
    label: options.family.label,
    state: options.state,
    role: options.role,
    source: options.source,
    reason: options.reason,
    gateway: Object.freeze({
      route: options.bindings.length > 0 ? EXECUTABLE_BACKEND_GATEWAY_ROUTE : null,
      browser_boundary: 'mediated_gateway_only',
      direct_backend_access: false,
      browser_credentials: 'never_exposed_to_application',
      host_file_access: 'never_exposed_to_application',
      owner_process_access: 'never_exposed_to_application',
    }),
    bindings: Object.freeze([...options.bindings]),
    correlation: Object.freeze({
      required: true,
      preservation: 'required_and_preserved',
      current_correlation_id: null,
    }),
    policy: Object.freeze({
      required: options.policyOutcome !== 'not_evaluated' || options.bindings.length > 0,
      current_outcome: options.policyOutcome,
      policy_classes: Object.freeze([...options.policyClasses]),
      decision_id: options.policyDecisionId ?? null,
      reason: options.policyReason,
    }),
    receipt: Object.freeze({
      required: options.receiptRequired,
      strategies: Object.freeze([...options.receiptStrategies]),
      current_receipt_id: null,
      persistence: options.receiptPersistence,
      visible_fields: SAFE_VISIBLE_FIELDS,
    }),
    recovery: Object.freeze({
      current_state: options.state,
      routes: Object.freeze([...options.routes]),
      never_silently_fallback: true,
    }),
  });
}

function bindingRef(
  binding: ExecutableBackendBinding,
  control?: BackendStatusControlObservation,
): BackendStatusBindingRef {
  const liveBinding: AllAppLiveToolBinding | undefined = LIVE_BINDING_BY_ID.get(binding.binding_id);
  return Object.freeze({
    binding_id: binding.binding_id,
    capability_id: binding.capability_id,
    intent_id: binding.mediated_intent.intent_id,
    gateway_route: EXECUTABLE_BACKEND_GATEWAY_ROUTE,
    transports: Object.freeze([...(control?.transports ?? liveBinding?.gateway.transports ?? binding.transport_policy.allowed_transports)]),
    selected_tool_id: control
      ? control.selected_tool_id ?? null
      : binding.tool_selection.preferred_tool_ids[0] ?? null,
    status_source: control ? 'gateway-control-catalog' : 'live-tool-binding',
  });
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && new Set(left).size === left.length
    && left.every(value => right.includes(value));
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Object.freeze([...new Set(values)]);
}

function uniqueRoutes(routes: readonly BackendStatusRecoveryRoute[]): readonly BackendStatusRecoveryRoute[] {
  const byKey = new Map<string, BackendStatusRecoveryRoute>();
  for (const route of routes) byKey.set(`${route.error}:${route.action}`, route);
  return Object.freeze([...byKey.values()]);
}

function browserSafeReason(value: string): string {
  return value
    .replace(/\bPython MCP owner\b/g, 'backend owner')
    .replace(/\bPython MCP owners\b/g, 'backend owners')
    .replace(/\bPython\b/g, 'owner runtime')
    .replace(/\bauthorization\b/gi, 'handoff');
}
