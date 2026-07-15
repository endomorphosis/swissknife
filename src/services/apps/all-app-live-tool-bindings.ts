import {
  ALL_APP_EXECUTABLE_BACKEND_CONTRACT,
  EXECUTABLE_BACKEND_GATEWAY_ROUTE,
  getExecutableAppBackendDisposition,
  type BackendRecoveryRoute,
  type ExecutableBackendBinding,
  type MediatedInvocationRequest,
} from './all-app-executable-backend-contract.js';
import type {
  AllAppToolGateway,
  AllAppToolGatewayResult,
} from '../mcp/all-app-tool-gateway.js';

/**
 * The materialized, browser-facing projection of SVD-103's executable
 * contract.  This is deliberately a separate object from the declaration:
 * an entry exists only when it has a callable mediated gateway route.
 */
export const ALL_APP_LIVE_TOOL_BINDINGS_SCHEMA = 'swissknife.all-app-live-tool-bindings.v1';
export const ALL_APP_LIVE_TOOL_BINDINGS_ID =
  'org.hallucinate.swissknife.all-app-live-tool-bindings';
export const ALL_APP_LIVE_TOOL_BINDINGS_VERSION = '1.0.0';

export type LiveToolBindingState = 'gateway_materialized';

export interface AllAppLiveToolBinding {
  binding_id: string;
  app_id: string;
  capability_id: string;
  intent_id: string;
  owner: ExecutableBackendBinding['owner'];
  state: LiveToolBindingState;
  gateway: {
    route: typeof EXECUTABLE_BACKEND_GATEWAY_ROUTE;
    browser_boundary: 'mediated_gateway_only';
    transports: readonly ('http' | 'libp2p')[];
    direct_backend_access: false;
    browser_credentials: 'never_exposed_to_application';
    host_file_access: 'never_exposed_to_application';
    python_process_access: 'never_exposed_to_application';
  };
  observability: {
    required_events: readonly ['request', 'policy', 'response', 'recovery'];
    correlation_id: 'required_and_preserved';
    receipt: 'required';
  };
  recovery_routes: readonly BackendRecoveryRoute[];
  ui_control_id: string;
}

export interface AllAppLiveToolBindingCatalog {
  schema: typeof ALL_APP_LIVE_TOOL_BINDINGS_SCHEMA;
  catalog_id: typeof ALL_APP_LIVE_TOOL_BINDINGS_ID;
  version: typeof ALL_APP_LIVE_TOOL_BINDINGS_VERSION;
  source_contract: {
    contract_id: string;
    version: string;
  };
  bindings: readonly AllAppLiveToolBinding[];
}

export interface LiveToolBindingValidationResult {
  valid: boolean;
  errors: string[];
}

export type LiveToolBindingInvocation = Omit<MediatedInvocationRequest, 'app_id' | 'intent_id' | 'owner'>;

function materializeBinding(
  appId: string,
  binding: ExecutableBackendBinding,
): AllAppLiveToolBinding {
  return Object.freeze({
    binding_id: binding.binding_id,
    app_id: appId,
    capability_id: binding.capability_id,
    intent_id: binding.mediated_intent.intent_id,
    owner: binding.owner,
    state: 'gateway_materialized',
    gateway: Object.freeze({
      route: binding.transport_policy.gateway_route,
      browser_boundary: binding.transport_policy.browser_boundary,
      transports: Object.freeze([...binding.transport_policy.allowed_transports]),
      direct_backend_access: binding.transport_policy.direct_backend_access,
      browser_credentials: 'never_exposed_to_application',
      host_file_access: 'never_exposed_to_application',
      python_process_access: 'never_exposed_to_application',
    }),
    observability: Object.freeze({
      required_events: Object.freeze(['request', 'policy', 'response', 'recovery'] as const),
      correlation_id: 'required_and_preserved',
      receipt: 'required',
    }),
    recovery_routes: Object.freeze([...binding.error_recovery.routes]),
    ui_control_id: binding.ui_control.control_id,
  });
}

export const ALL_APP_LIVE_TOOL_BINDINGS: AllAppLiveToolBindingCatalog = Object.freeze({
  schema: ALL_APP_LIVE_TOOL_BINDINGS_SCHEMA,
  catalog_id: ALL_APP_LIVE_TOOL_BINDINGS_ID,
  version: ALL_APP_LIVE_TOOL_BINDINGS_VERSION,
  source_contract: Object.freeze({
    contract_id: ALL_APP_EXECUTABLE_BACKEND_CONTRACT.contract_id,
    version: ALL_APP_EXECUTABLE_BACKEND_CONTRACT.version,
  }),
  bindings: Object.freeze(ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.flatMap(app =>
    app.backend_bindings.map(binding => materializeBinding(app.app_id, binding)),
  )),
});

const LIVE_BINDING_BY_ID = new Map(
  ALL_APP_LIVE_TOOL_BINDINGS.bindings.map(binding => [binding.binding_id, binding]),
);

export function getAllAppLiveToolBinding(bindingId: string): AllAppLiveToolBinding | null {
  return LIVE_BINDING_BY_ID.get(bindingId) ?? null;
}

/** Invokes a binding without letting the application choose an owner or route. */
export async function invokeAllAppLiveToolBinding(
  bindingId: string,
  invocation: LiveToolBindingInvocation,
  gateway: AllAppToolGateway,
): Promise<AllAppToolGatewayResult> {
  const binding = getAllAppLiveToolBinding(bindingId);
  if (!binding) {
    throw new Error(`Unknown materialized all-app live tool binding: ${bindingId}`);
  }
  return gateway.invoke({
    ...invocation,
    app_id: binding.app_id,
    intent_id: binding.intent_id,
    owner: binding.owner,
  });
}

export function validateAllAppLiveToolBindings(
  catalog: AllAppLiveToolBindingCatalog = ALL_APP_LIVE_TOOL_BINDINGS,
): LiveToolBindingValidationResult {
  const errors: string[] = [];
  if (catalog.schema !== ALL_APP_LIVE_TOOL_BINDINGS_SCHEMA) errors.push('invalid live-binding schema');
  if (catalog.catalog_id !== ALL_APP_LIVE_TOOL_BINDINGS_ID) errors.push('invalid live-binding catalog ID');
  if (catalog.version !== ALL_APP_LIVE_TOOL_BINDINGS_VERSION) errors.push('unsupported live-binding version');
  const expected = ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps.flatMap(app => app.backend_bindings.map(binding => ({
    app_id: app.app_id,
    binding,
  })));
  if (catalog.bindings.length !== expected.length) errors.push('binding count does not match executable contract');
  const seen = new Set<string>();
  for (const entry of catalog.bindings) {
    if (seen.has(entry.binding_id)) errors.push(`${entry.binding_id}: duplicate materialized binding`);
    seen.add(entry.binding_id);
    const source = expected.find(candidate => candidate.binding.binding_id === entry.binding_id);
    if (!source) {
      errors.push(`${entry.binding_id}: not declared by executable contract`);
      continue;
    }
    if (entry.app_id !== source.app_id || entry.intent_id !== source.binding.mediated_intent.intent_id
      || entry.owner !== source.binding.owner || entry.capability_id !== source.binding.capability_id) {
      errors.push(`${entry.binding_id}: identity differs from executable contract`);
    }
    if (entry.state !== 'gateway_materialized'
      || entry.gateway.route !== EXECUTABLE_BACKEND_GATEWAY_ROUTE
      || entry.gateway.browser_boundary !== 'mediated_gateway_only'
      || entry.gateway.direct_backend_access !== false) {
      errors.push(`${entry.binding_id}: is not browser-gateway materialized`);
    }
    if (entry.gateway.browser_credentials !== 'never_exposed_to_application'
      || entry.gateway.host_file_access !== 'never_exposed_to_application'
      || entry.gateway.python_process_access !== 'never_exposed_to_application') {
      errors.push(`${entry.binding_id}: permits a forbidden browser boundary`);
    }
    if (entry.observability.correlation_id !== 'required_and_preserved'
      || entry.observability.receipt !== 'required'
      || entry.observability.required_events.join(',') !== 'request,policy,response,recovery') {
      errors.push(`${entry.binding_id}: incomplete observable gateway lifecycle`);
    }
    if (entry.recovery_routes.length === 0) errors.push(`${entry.binding_id}: no recovery routes`);
  }
  for (const { binding } of expected) {
    if (!seen.has(binding.binding_id)) errors.push(`${binding.binding_id}: declared backend pair is not materialized`);
  }
  for (const app of ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps) {
    const source = getExecutableAppBackendDisposition(app.app_id);
    if (source?.disposition === 'tool_backed'
      && source.backend_bindings.some(binding => !seen.has(binding.binding_id))) {
      errors.push(`${app.app_id}: has a tool_backed declaration without a live binding`);
    }
  }
  return { valid: errors.length === 0, errors };
}
