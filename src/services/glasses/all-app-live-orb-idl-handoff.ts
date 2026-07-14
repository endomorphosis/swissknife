import {
  VIRTUAL_DESKTOP_APP_MANIFEST,
  type VirtualDesktopAppManifest,
  type VirtualDesktopAppManifestEntry,
} from '../apps/virtual-desktop-app-manifest.js';
import { AGENT_SUPERVISOR_CONSOLE_CONTRACT } from '../mcp/agent-supervisor-console-gateway.js';
import { computeCID, computeInterfaceCID } from '../mcp/mcp-idl.js';
import {
  type DesktopOrbIdlAppDescriptor,
  type DesktopOrbIdlModalityDescriptor,
  type DesktopOrbIdlModalityKind,
} from './desktop-orb-idl-contract.js';

export const ALL_APP_LIVE_ORB_IDL_HANDOFF_SCHEMA =
  'swissknife.all-app-live-orb-idl-handoff.v1' as const;
export const ALL_APP_LIVE_ORB_IDL_HANDOFF_TASK_ID = 'SVD-098' as const;

export type LiveHandoffPermissionState =
  | 'permitted'
  | 'confirmation_required'
  | 'denied'
  | 'unavailable';

export type LiveHandoffTransport =
  | 'browser-local'
  | 'http-jsonrpc-mcp'
  | 'http-jsonrpc-mcp-or-libp2p'
  | 'mcp'
  | 'mcp++'
  | 'libp2p';

export interface LiveBackendCapabilityContract {
  tool_id: string;
  service: string;
  source_role: string;
  app_visible: boolean;
  mcp_transport?: string;
  mcp_plus_plus_transport?: string;
  policy_class: string;
  confirmation_policy?: string;
  receipt_required?: boolean;
}

export interface LiveBackendAppContract {
  canonical_id: string;
  backend_state?: string;
  backend_rationale?: string;
  local_only_rationale?: string | null;
  backend_capabilities: readonly LiveBackendCapabilityContract[];
}

export interface AllAppLiveBackendContract {
  schema: string;
  contract_id?: string;
  contract_cid?: string;
  generated_at?: string;
  apps: readonly LiveBackendAppContract[];
}

export interface LiveOrbIdlActionRoute {
  route_id: string;
  app_id: string;
  action_id: string;
  backend_method_id: string;
  descriptor_id: string;
  method_id: string;
  owner: string;
  transport: LiveHandoffTransport;
  policy_class: string;
  permission_state: LiveHandoffPermissionState;
  correlation_id: string;
  capability_ids: readonly string[];
  receipt_required: boolean;
  requested_modality: DesktopOrbIdlModalityKind;
  source_contract_ref: string;
  denied_reason?: string;
}

export interface LiveOrbIdlCapabilityProfile {
  profile_id: string;
  required_profiles: readonly ('A' | 'B' | 'C' | 'D' | 'E' | 'F')[];
  capabilities: readonly string[];
  transport_profile: 'HTTP' | 'E' | 'local';
}

export interface LiveOrbIdlPermission {
  state: LiveHandoffPermissionState;
  policy_class: string;
  confirmation_required: boolean;
  execution_allowed: boolean;
  denied_reason?: string;
}

export interface LiveOrbIdlReference {
  ref: string;
  cid: string;
  state: 'expected' | 'preserved';
}

export interface LiveOrbIdlModalityConstraint {
  modality: DesktopOrbIdlModalityKind;
  availability: DesktopOrbIdlModalityDescriptor['availability'];
  primary_surface: DesktopOrbIdlModalityDescriptor['primary_surface'];
  permission_scope?: string;
  hardware_available: boolean;
  read_only: boolean;
  allowed: boolean;
  fallback_kind: DesktopOrbIdlModalityDescriptor['fallback']['kind'];
  fallback_surface: DesktopOrbIdlModalityDescriptor['fallback']['target_surface'];
  fallback_reason: DesktopOrbIdlModalityDescriptor['fallback']['typed_reason'];
}

export interface LiveOrbIdlRollbackBehavior {
  mode: 'no_mutation' | 'preserve_projection' | 'compensating_receipt';
  required: boolean;
  rollback_token: string | null;
  trigger_states: readonly ('denied' | 'unavailable' | 'partial_failure')[];
  preserves_receipt_refs: boolean;
  semantics: string;
}

export interface LiveOrbIdlFallbackSelection {
  selected: boolean;
  kind: DesktopOrbIdlModalityDescriptor['fallback']['kind'];
  target_surface: DesktopOrbIdlModalityDescriptor['fallback']['target_surface'];
  reason:
    | 'direct_route_available'
    | 'permission_denied'
    | 'confirmation_required'
    | 'route_unavailable'
    | 'modality_unavailable';
  user_visible: boolean;
}

export interface AllAppLiveOrbIdlHandoffPacket {
  packet_id: string;
  packet_cid: string;
  route_id: string;
  app_id: string;
  descriptor_id: string;
  interface_cid: string;
  action_id: string;
  method_id: string;
  backend_method_id: string;
  capability_profile: LiveOrbIdlCapabilityProfile;
  capability_profile_id: string;
  owner: string;
  transport: LiveHandoffTransport;
  permission: LiveOrbIdlPermission;
  permission_state: LiveHandoffPermissionState;
  correlation_id: string;
  receipt_refs: readonly LiveOrbIdlReference[];
  event_dag_refs: readonly LiveOrbIdlReference[];
  rollback_behavior: LiveOrbIdlRollbackBehavior;
  requested_modality: DesktopOrbIdlModalityKind;
  modality_constraints: readonly LiveOrbIdlModalityConstraint[];
  fallback_selection: LiveOrbIdlFallbackSelection;
  source_contract_ref: string;
}

export interface AllAppLiveOrbIdlHandoffCatalog {
  schema: typeof ALL_APP_LIVE_ORB_IDL_HANDOFF_SCHEMA;
  task_id: typeof ALL_APP_LIVE_ORB_IDL_HANDOFF_TASK_ID;
  generated_at: string;
  generated_from: readonly string[];
  packet_count: number;
  app_count: number;
  descriptor_count: number;
  interface_cid_count: number;
  owner_counts: Record<string, number>;
  permission_state_counts: Record<string, number>;
  requested_modality_counts: Record<string, number>;
  fallback_selected_count: number;
  supervisor_packet_count: number;
  packets: readonly AllAppLiveOrbIdlHandoffPacket[];
}

export type OrbIdlHandoffCompileErrorCode =
  | 'DUPLICATE_DESCRIPTOR'
  | 'DUPLICATE_ROUTE'
  | 'DESCRIPTOR_NOT_FOUND'
  | 'DESCRIPTOR_CID_MISMATCH'
  | 'METHOD_NOT_FOUND'
  | 'INVALID_CORRELATION_ID';

export class OrbIdlHandoffCompileError extends Error {
  constructor(
    public readonly code: OrbIdlHandoffCompileErrorCode,
    public readonly route_id: string,
    message: string,
  ) {
    super(`${code} [${route_id}]: ${message}`);
    this.name = 'OrbIdlHandoffCompileError';
  }
}

export interface CompileAllAppLiveOrbIdlHandoffOptions {
  generatedAt?: string;
  generatedFrom?: readonly string[];
}

/**
 * Compile live app actions into immutable ORB/IDL handoff packets. The
 * descriptor and method checks are deliberately performed before any packet
 * is returned, so callers can never partially publish a catalog containing a
 * route that is absent from the current Profile A descriptor set.
 */
export function compileAllAppLiveOrbIdlHandoff(
  routes: readonly LiveOrbIdlActionRoute[],
  descriptors: readonly DesktopOrbIdlAppDescriptor[],
  options: CompileAllAppLiveOrbIdlHandoffOptions = {},
): AllAppLiveOrbIdlHandoffCatalog {
  const descriptorById = new Map<string, DesktopOrbIdlAppDescriptor>();
  for (const descriptor of descriptors) {
    if (descriptorById.has(descriptor.descriptor_id)) {
      throw new OrbIdlHandoffCompileError(
        'DUPLICATE_DESCRIPTOR',
        descriptor.descriptor_id,
        `descriptor ${descriptor.descriptor_id} is registered more than once`,
      );
    }
    descriptorById.set(descriptor.descriptor_id, descriptor);
  }

  const routeIds = new Set<string>();
  const packets = routes.map(route => {
    if (routeIds.has(route.route_id)) {
      throw new OrbIdlHandoffCompileError(
        'DUPLICATE_ROUTE', route.route_id, `route ${route.route_id} is registered more than once`,
      );
    }
    routeIds.add(route.route_id);
    return compileRoute(route, descriptorById);
  }).sort((left, right) => left.packet_id.localeCompare(right.packet_id));

  return {
    schema: ALL_APP_LIVE_ORB_IDL_HANDOFF_SCHEMA,
    task_id: ALL_APP_LIVE_ORB_IDL_HANDOFF_TASK_ID,
    generated_at: options.generatedAt ?? '2026-07-13T00:00:00.000Z',
    generated_from: [...(options.generatedFrom ?? [
      'src/services/apps/virtual-desktop-app-manifest.ts',
      'src/services/glasses/desktop-orb-idl-contract.ts',
      'src/services/mcp/agent-supervisor-console-gateway.ts',
    ])].sort(),
    packet_count: packets.length,
    app_count: new Set(packets.map(packet => packet.app_id)).size,
    descriptor_count: new Set(packets.map(packet => packet.descriptor_id)).size,
    interface_cid_count: new Set(packets.map(packet => packet.interface_cid)).size,
    owner_counts: countBy(packets, packet => packet.owner),
    permission_state_counts: countBy(packets, packet => packet.permission.state),
    requested_modality_counts: countBy(packets, packet => packet.requested_modality),
    fallback_selected_count: packets.filter(packet => packet.fallback_selection.selected).length,
    supervisor_packet_count: packets.filter(packet => packet.app_id === 'agent-supervisor').length,
    packets,
  };
}

/** Build the one primary action exercised by SVD-096 for every manifest app. */
export function buildAllAppRoutesFromLiveBackendContract(
  contract: AllAppLiveBackendContract,
  manifest: VirtualDesktopAppManifest = VIRTUAL_DESKTOP_APP_MANIFEST,
): LiveOrbIdlActionRoute[] {
  const contractByApp = new Map(contract.apps.map(app => [app.canonical_id, app]));
  return manifest.apps.map((app, index) => {
    const liveApp = contractByApp.get(app.id);
    if (!liveApp) {
      throw new OrbIdlHandoffCompileError(
        'DESCRIPTOR_NOT_FOUND',
        `app:${app.id}:primary`,
        `live backend contract ${contract.schema} has no route declaration for app ${app.id}`,
      );
    }
    return primaryRouteForApp(app, liveApp, contract, index);
  });
}

/** Build the ten read/governed actions exercised by the SVD-097 console flow. */
export function buildAgentSupervisorLiveRoutes(): LiveOrbIdlActionRoute[] {
  return AGENT_SUPERVISOR_CONSOLE_CONTRACT.capabilities.map((capability, index) => {
    const read = capability.access === 'read';
    const steering = capability.id === 'supervisor.prompt-steering.request';
    const transport = capability.transports.includes('libp2p') ? 'libp2p' : 'mcp++';
    return {
      route_id: `supervisor:${capability.id}`,
      app_id: 'agent-supervisor',
      action_id: capability.id,
      backend_method_id: capability.method,
      descriptor_id: 'virtual-desktop.agent-supervisor',
      method_id: steering ? 'request_prompt_steering' : read ? 'read_status' : 'request_action',
      owner: capability.owner,
      transport,
      policy_class: capability.policy_class,
      permission_state: read ? 'permitted' : 'confirmation_required',
      correlation_id: `svd097-${String(index + 1).padStart(2, '0')}-${slug(capability.id)}`,
      capability_ids: [capability.id],
      receipt_required: capability.receipt_required,
      requested_modality: read ? 'display' : 'input',
      source_contract_ref: AGENT_SUPERVISOR_CONSOLE_CONTRACT.schema,
    };
  });
}

function compileRoute(
  route: LiveOrbIdlActionRoute,
  descriptorById: ReadonlyMap<string, DesktopOrbIdlAppDescriptor>,
): AllAppLiveOrbIdlHandoffPacket {
  const descriptor = descriptorById.get(route.descriptor_id);
  if (!descriptor || descriptor.app_id !== route.app_id) {
    throw new OrbIdlHandoffCompileError(
      'DESCRIPTOR_NOT_FOUND',
      route.route_id,
      `live route ${route.app_id}/${route.action_id} has no matching descriptor ${route.descriptor_id}`,
    );
  }
  const canonicalInterfaceCid = computeInterfaceCID(descriptor.idl_descriptor);
  if (canonicalInterfaceCid !== descriptor.interface_cid) {
    throw new OrbIdlHandoffCompileError(
      'DESCRIPTOR_CID_MISMATCH',
      route.route_id,
      `descriptor ${route.descriptor_id} declares ${descriptor.interface_cid}, expected ${canonicalInterfaceCid}`,
    );
  }
  if (!descriptor.idl_descriptor.methods.some(method => method.name === route.method_id)) {
    throw new OrbIdlHandoffCompileError(
      'METHOD_NOT_FOUND',
      route.route_id,
      `descriptor ${route.descriptor_id} does not declare method ${route.method_id}`,
    );
  }
  if (!route.correlation_id.trim()) {
    throw new OrbIdlHandoffCompileError(
      'INVALID_CORRELATION_ID', route.route_id, 'correlation_id must be non-empty',
    );
  }

  const modality = descriptor.modality_contract[route.requested_modality];
  const referenceSeed = {
    schema: ALL_APP_LIVE_ORB_IDL_HANDOFF_SCHEMA,
    route_id: route.route_id,
    correlation_id: route.correlation_id,
    interface_cid: descriptor.interface_cid,
    method_id: route.method_id,
  };
  const receiptCid = computeStableCid({ ...referenceSeed, ref: 'receipt' });
  const eventDagCid = computeStableCid({ ...referenceSeed, ref: 'event-dag', receipt_cid: receiptCid });
  // Even operations that do not require a new execution receipt retain a
  // descriptor/policy receipt reference, allowing display fallbacks to keep a
  // complete provenance chain.
  const receiptRefs = [{
    ref: `receipt:${route.correlation_id}`,
    cid: receiptCid,
    state: route.receipt_required ? 'expected' as const : 'preserved' as const,
  }];
  const eventDagRefs = [{
    ref: `event-dag:${route.correlation_id}`,
    cid: eventDagCid,
    state: 'expected' as const,
  }];
  const capabilityProfile = capabilityProfileFor(route);
  const packetWithoutIdentity = {
    route_id: route.route_id,
    app_id: route.app_id,
    descriptor_id: descriptor.descriptor_id,
    interface_cid: descriptor.interface_cid,
    action_id: route.action_id,
    method_id: route.method_id,
    backend_method_id: route.backend_method_id,
    capability_profile: capabilityProfile,
    capability_profile_id: capabilityProfile.profile_id,
    owner: route.owner,
    transport: route.transport,
    permission: permissionFor(route),
    permission_state: route.permission_state,
    correlation_id: route.correlation_id,
    receipt_refs: receiptRefs,
    event_dag_refs: eventDagRefs,
    rollback_behavior: rollbackFor(route, receiptCid),
    requested_modality: route.requested_modality,
    modality_constraints: modalityConstraintsFor(descriptor, route),
    fallback_selection: fallbackFor(route, modality),
    source_contract_ref: route.source_contract_ref,
  };
  const packetCid = computeStableCid(packetWithoutIdentity);
  return {
    packet_id: `handoff:${route.route_id}:${packetCid.slice(-16)}`,
    packet_cid: packetCid,
    ...packetWithoutIdentity,
  };
}

function primaryRouteForApp(
  app: VirtualDesktopAppManifestEntry,
  liveApp: LiveBackendAppContract,
  contract: AllAppLiveBackendContract,
  index: number,
): LiveOrbIdlActionRoute {
  const executable = liveApp.backend_capabilities.filter(isExecutableCapability);
  const selected = executable[0]
    ?? liveApp.backend_capabilities.find(capability => capability.app_visible)
    ?? liveApp.backend_capabilities[0];
  const localAction = app.capabilities[0] ?? `local.${app.id}.primary`;
  const actionId = selected?.tool_id ?? localAction;
  const owner = selected?.service ?? app.owner_module;
  const permitted = Boolean(selected && isExecutableCapability(selected));
  const confirmationRequired = permitted && (
    selected?.confirmation_policy !== 'none' || selected?.policy_class !== 'read'
  );
  const deniedReason = permitted
    ? undefined
    : selected
      ? dispositionReason(selected)
      : liveApp.local_only_rationale ?? liveApp.backend_rationale ?? 'No live backend route is declared.';

  return {
    route_id: `app:${app.id}:primary`,
    app_id: app.id,
    action_id: actionId,
    backend_method_id: actionId,
    descriptor_id: `virtual-desktop.${app.id}`,
    method_id: 'request_action',
    owner,
    transport: selected ? transportFor(selected) : 'browser-local',
    policy_class: selected?.policy_class ?? policyForLocalAction(localAction),
    permission_state: permitted
      ? confirmationRequired ? 'confirmation_required' : 'permitted'
      : 'denied',
    correlation_id: `svd096-${String(index + 1).padStart(2, '0')}-${slug(app.id)}`,
    capability_ids: selected ? [selected.tool_id] : [localAction],
    receipt_required: selected?.receipt_required ?? true,
    requested_modality: requestedModalityFor(actionId, app),
    source_contract_ref: contract.contract_cid ?? contract.contract_id ?? contract.schema,
    denied_reason: deniedReason,
  };
}

function isExecutableCapability(capability: LiveBackendCapabilityContract): boolean {
  return capability.app_visible
    && !/(?:static|descriptor|placeholder|fixture|stub)/i.test(capability.source_role)
    && !['credential', 'external_network', 'media_capture', 'destructive'].includes(capability.policy_class);
}

function dispositionReason(capability: LiveBackendCapabilityContract): string {
  if (!capability.app_visible) return 'The live route is supervisor-only and grants no direct app authority.';
  if (/(?:static|descriptor|placeholder|fixture|stub)/i.test(capability.source_role)) {
    return `The ${capability.source_role} declaration is not an executable live backend route.`;
  }
  return `Policy class ${capability.policy_class} requires authority unavailable to this app route.`;
}

function transportFor(capability: LiveBackendCapabilityContract): LiveHandoffTransport {
  return capability.mcp_plus_plus_transport === 'eligible'
    ? 'http-jsonrpc-mcp-or-libp2p'
    : 'http-jsonrpc-mcp';
}

function requestedModalityFor(
  actionId: string,
  app: VirtualDesktopAppManifestEntry,
): DesktopOrbIdlModalityKind {
  const value = `${actionId} ${app.capabilities.join(' ')}`.toLowerCase();
  if (/(camera|photo|image.capture)/.test(value)) return 'camera';
  if (/(microphone|transcrib|speech.input)/.test(value)) return 'microphone';
  if (/(audio|music|media.playback|speaker)/.test(value)) return 'speaker';
  return 'display';
}

function capabilityProfileFor(route: LiveOrbIdlActionRoute): LiveOrbIdlCapabilityProfile {
  const profiles = new Set<'A' | 'B' | 'C' | 'D' | 'E' | 'F'>(['A', 'B', 'D', 'F']);
  if (route.policy_class !== 'read') profiles.add('C');
  if (route.transport === 'libp2p' || route.transport === 'http-jsonrpc-mcp-or-libp2p') profiles.add('E');
  const requiredProfiles = [...profiles].sort() as LiveOrbIdlCapabilityProfile['required_profiles'];
  return {
    profile_id: `mcp++:${requiredProfiles.join('+')}`,
    required_profiles: requiredProfiles,
    capabilities: [...new Set(route.capability_ids)].sort(),
    transport_profile: profiles.has('E') ? 'E' : route.transport === 'browser-local' ? 'local' : 'HTTP',
  };
}

function permissionFor(route: LiveOrbIdlActionRoute): LiveOrbIdlPermission {
  return {
    state: route.permission_state,
    policy_class: route.policy_class,
    confirmation_required: route.permission_state === 'confirmation_required',
    execution_allowed: route.permission_state === 'permitted',
    ...(route.denied_reason ? { denied_reason: route.denied_reason } : {}),
  };
}

function modalityConstraintsFor(
  descriptor: DesktopOrbIdlAppDescriptor,
  route: LiveOrbIdlActionRoute,
): LiveOrbIdlModalityConstraint[] {
  return (['display', 'camera', 'speaker', 'microphone', 'input'] as const).map(modality => {
    const constraint = descriptor.modality_contract[modality];
    const requested = modality === route.requested_modality;
    return {
      modality,
      availability: constraint.availability,
      primary_surface: constraint.primary_surface,
      ...(constraint.permission_scope ? { permission_scope: constraint.permission_scope } : {}),
      hardware_available: constraint.hardware_available,
      read_only: constraint.read_only,
      allowed: requested
        && route.permission_state === 'permitted'
        && constraint.availability === 'available',
      fallback_kind: constraint.fallback.kind,
      fallback_surface: constraint.fallback.target_surface,
      fallback_reason: constraint.fallback.typed_reason,
    };
  });
}

function rollbackFor(route: LiveOrbIdlActionRoute, receiptCid: string): LiveOrbIdlRollbackBehavior {
  if (route.policy_class === 'read') {
    return {
      mode: 'no_mutation',
      required: false,
      rollback_token: null,
      trigger_states: [],
      preserves_receipt_refs: route.receipt_required,
      semantics: 'Read-only execution has no state mutation to roll back; provenance remains preserved.',
    };
  }
  if (route.permission_state === 'denied' || route.permission_state === 'unavailable') {
    return {
      mode: 'preserve_projection',
      required: false,
      rollback_token: null,
      trigger_states: ['denied', 'unavailable'],
      preserves_receipt_refs: route.receipt_required,
      semantics: 'No mutation is attempted; preserve the last safe display and its receipt references.',
    };
  }
  return {
    mode: 'compensating_receipt',
    required: true,
    rollback_token: `rollback:${receiptCid}`,
    trigger_states: ['denied', 'unavailable', 'partial_failure'],
    preserves_receipt_refs: true,
    semantics: 'A confirmed mutation must emit a compensating receipt or preserve the prior projection on failure.',
  };
}

function fallbackFor(
  route: LiveOrbIdlActionRoute,
  modality: DesktopOrbIdlModalityDescriptor,
): LiveOrbIdlFallbackSelection {
  const reason = route.permission_state === 'denied'
    ? 'permission_denied'
    : route.permission_state === 'confirmation_required'
      ? 'confirmation_required'
      : route.permission_state === 'unavailable'
        ? 'route_unavailable'
        : modality.availability !== 'available'
          ? 'modality_unavailable'
          : 'direct_route_available';
  return {
    selected: reason !== 'direct_route_available',
    kind: modality.fallback.kind,
    target_surface: modality.fallback.target_surface,
    reason,
    user_visible: modality.fallback.user_visible,
  };
}

function policyForLocalAction(action: string): string {
  if (/(credential|oauth|secret|key|token|secure)/i.test(action)) return 'credential';
  if (/(camera|microphone|capture)/i.test(action)) return 'media_capture';
  if (/(shell|tasks|calendar|notes|audio|settings)/i.test(action)) return 'write';
  return 'read';
}

function computeStableCid(value: unknown): string {
  return computeCID(stableStringify(value));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort()
    .filter(key => record[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function countBy<T>(items: readonly T[], select: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = select(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
