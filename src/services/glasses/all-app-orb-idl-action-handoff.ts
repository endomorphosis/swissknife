import {
  ALL_APP_EXECUTABLE_BACKEND_CONTRACT,
  type ExecutableBackendBinding,
} from '../apps/all-app-executable-backend-contract.js';
import {
  ALL_APP_LIVE_TOOL_BINDINGS,
  type AllAppLiveToolBinding,
  type AllAppLiveToolBindingCatalog,
} from '../apps/all-app-live-tool-bindings.js';
import { computeCID, computeInterfaceCID } from '../mcp/mcp-idl.js';
import { AGENT_SUPERVISOR_CONSOLE_CONTRACT } from '../mcp/agent-supervisor-console-gateway.js';
import {
  buildVirtualDesktopOrbIdlCompleteCoverage,
  type DesktopOrbIdlAppDescriptor,
  type DesktopOrbIdlModalityKind,
} from './desktop-orb-idl-contract.js';

export const ALL_APP_ORB_IDL_ACTION_HANDOFF_SCHEMA =
  'swissknife.all-app-orb-idl-action-handoff.v1' as const;
export const ALL_APP_ORB_IDL_ACTION_HANDOFF_TASK_ID = 'SVD-110' as const;

const MODALITIES = ['display', 'camera', 'speaker', 'microphone', 'input'] as const;

export type ActionHandoffPermissionState =
  | 'permitted'
  | 'confirmation_required'
  | 'denied'
  | 'unavailable';
export type ActionHandoffConsentState = 'not_required' | 'required' | 'granted' | 'denied';
export type ActionHandoffDeviceMode = 'simulator' | 'physical';

export interface ActionHandoffDeviceModality {
  modality: DesktopOrbIdlModalityKind;
  available: boolean;
  physical_hardware: boolean;
  permission: 'granted' | 'not_required' | 'denied';
  fallback_available: boolean;
}

export interface ActionHandoffDeviceCapabilities {
  device_id: string;
  mode: ActionHandoffDeviceMode;
  modalities: readonly ActionHandoffDeviceModality[];
}

export interface OrbIdlActionHandoffRoute {
  route_id: string;
  app_id: string;
  action_id: string;
  method_id: string;
  binding_id: string;
  correlation_id: string;
  requested_modality: DesktopOrbIdlModalityKind;
  permission_state: ActionHandoffPermissionState;
  consent_state: ActionHandoffConsentState;
  source_contract_ref: string;
}

export interface OrbIdlActionHandoffPacket {
  packet_id: string;
  packet_cid: string;
  route_id: string;
  app_id: string;
  action_id: string;
  interface_cid: string;
  method_id: string;
  binding_id: string;
  owner: string;
  peer_did: string;
  capability_profile: {
    profile_id: string;
    required_profiles: readonly ('A' | 'B' | 'C' | 'D' | 'E' | 'F')[];
    capabilities: readonly string[];
    transports: readonly ('http' | 'libp2p')[];
  };
  permission: {
    state: ActionHandoffPermissionState;
    policy_class: string;
    consent: ActionHandoffConsentState;
    confirmation_required: boolean;
    execution_allowed: boolean;
  };
  permission_state: ActionHandoffPermissionState;
  consent_state: ActionHandoffConsentState;
  correlation_id: string;
  tool_ref: { owner: string; tool_id: string; gateway_route: string; binding_id: string };
  tool_refs: readonly { owner: string; tool_id: string; gateway_route: string; binding_id: string }[];
  receipt_refs: readonly { ref: string; cid: string; state: 'expected' | 'preserved' }[];
  event_dag_refs: readonly { ref: string; cid: string; state: 'expected' }[];
  modality_constraints: readonly (ActionHandoffDeviceModality & {
    descriptor_availability: string;
    primary_surface: string;
    allowed: boolean;
  })[];
  rollback: {
    required: boolean;
    mode: 'no_mutation' | 'compensating_receipt';
    recovery_errors: readonly string[];
    rollback_token: string | null;
  };
  selected_fallback: {
    selected: boolean;
    kind: string;
    target_surface: string;
    reason: 'direct_route_available' | 'consent_required' | 'permission_denied' | 'device_unavailable';
    user_visible: boolean;
  };
  source_contract_ref: string;
}

export interface AllAppOrbIdlActionHandoffCatalog {
  schema: typeof ALL_APP_ORB_IDL_ACTION_HANDOFF_SCHEMA;
  task_id: typeof ALL_APP_ORB_IDL_ACTION_HANDOFF_TASK_ID;
  generated_at: string;
  generated_from: readonly string[];
  packet_count: number;
  app_count: number;
  live_binding_packet_count: number;
  supervisor_action_packet_count: number;
  peer_did_count: number;
  fallback_selected_count: number;
  packets: readonly OrbIdlActionHandoffPacket[];
}

export type OrbIdlActionHandoffCompileErrorCode =
  | 'DESCRIPTOR_NOT_FOUND'
  | 'DESCRIPTOR_CID_MISMATCH'
  | 'METHOD_NOT_FOUND'
  | 'DUPLICATE_ROUTE'
  | 'MISSING_LIVE_BINDING'
  | 'LIVE_BINDING_IDENTITY_MISMATCH'
  | 'INVALID_DEVICE_CAPABILITY'
  | 'INVALID_CORRELATION_ID';

export class OrbIdlActionHandoffCompileError extends Error {
  constructor(
    public readonly code: OrbIdlActionHandoffCompileErrorCode,
    public readonly subject: string,
    message: string,
  ) {
    super(`${code} [${subject}]: ${message}`);
    this.name = 'OrbIdlActionHandoffCompileError';
  }
}

export interface CompileAllAppOrbIdlActionHandoffOptions {
  generatedAt?: string;
  generatedFrom?: readonly string[];
  liveBindings?: AllAppLiveToolBindingCatalog;
}

/**
 * Returns every action that is eligible to cross the desktop-to-ORB boundary:
 * each gateway-materialized tool binding and each Supervisor Console action.
 * The console actions are deliberately mapped to a materialized owner binding
 * so a descriptor alone can never be mistaken for a callable action.
 */
export function buildEligibleAllAppOrbIdlActionRoutes(): OrbIdlActionHandoffRoute[] {
  const bindingRoutes = ALL_APP_LIVE_TOOL_BINDINGS.bindings.map((binding, index) => {
    const executable = getExecutableBinding(binding.binding_id);
    return {
      route_id: `binding:${binding.binding_id}`,
      app_id: binding.app_id,
      action_id: executable.tool_selection.preferred_tool_ids[0],
      method_id: 'request_action',
      binding_id: binding.binding_id,
      correlation_id: `svd110-binding-${String(index + 1).padStart(3, '0')}-${slug(binding.binding_id)}`,
      requested_modality: 'display' as const,
      permission_state: permissionStateFor(executable),
      consent_state: consentStateFor(executable),
      source_contract_ref: ALL_APP_LIVE_TOOL_BINDINGS.catalog_id,
    };
  });
  const supervisorRoutes = AGENT_SUPERVISOR_CONSOLE_CONTRACT.capabilities.map((capability, index) => {
    const binding = ALL_APP_LIVE_TOOL_BINDINGS.bindings.find(candidate =>
      candidate.app_id === 'agent-supervisor' && candidate.owner === capability.owner,
    );
    if (!binding) {
      throw new OrbIdlActionHandoffCompileError(
        'MISSING_LIVE_BINDING', capability.id,
        `Supervisor action has no materialized ${capability.owner} live binding.`,
      );
    }
    const read = capability.access === 'read';
    const steering = capability.id === 'supervisor.prompt-steering.request';
    return {
      route_id: `supervisor:${capability.id}`,
      app_id: 'agent-supervisor',
      action_id: capability.id,
      method_id: steering ? 'request_prompt_steering' : read ? 'read_status' : 'request_action',
      binding_id: binding.binding_id,
      correlation_id: `svd110-supervisor-${String(index + 1).padStart(2, '0')}-${slug(capability.id)}`,
      requested_modality: read ? 'display' as const : 'input' as const,
      permission_state: read ? 'permitted' as const : 'confirmation_required' as const,
      consent_state: read ? 'not_required' as const : 'required' as const,
      source_contract_ref: AGENT_SUPERVISOR_CONSOLE_CONTRACT.schema,
    };
  });
  return [...bindingRoutes, ...supervisorRoutes];
}

/** A simulator-safe device declaration with no claim of physical pairing. */
export function buildSimulatorActionHandoffDeviceCapabilities(): ActionHandoffDeviceCapabilities {
  return {
    device_id: 'meta-device-simulator:svd-110',
    mode: 'simulator',
    modalities: MODALITIES.map(modality => ({
      modality,
      available: modality === 'display' || modality === 'input',
      physical_hardware: false,
      permission: modality === 'display' || modality === 'input' ? 'granted' : 'not_required',
      fallback_available: true,
    })),
  };
}

export function compileAllAppOrbIdlActionHandoff(
  routes: readonly OrbIdlActionHandoffRoute[],
  descriptors: readonly DesktopOrbIdlAppDescriptor[] = buildVirtualDesktopOrbIdlCompleteCoverage().descriptors,
  deviceCapabilities: ActionHandoffDeviceCapabilities = buildSimulatorActionHandoffDeviceCapabilities(),
  options: CompileAllAppOrbIdlActionHandoffOptions = {},
): AllAppOrbIdlActionHandoffCatalog {
  const descriptorByApp = new Map(descriptors.map(descriptor => [descriptor.app_id, descriptor]));
  const bindingById = new Map((options.liveBindings ?? ALL_APP_LIVE_TOOL_BINDINGS).bindings
    .map(binding => [binding.binding_id, binding]));
  validateDeviceCapabilities(deviceCapabilities);
  const routeIds = new Set<string>();
  const packets = routes.map(route => {
    if (routeIds.has(route.route_id)) {
      throw new OrbIdlActionHandoffCompileError('DUPLICATE_ROUTE', route.route_id, 'Route ID is not unique.');
    }
    routeIds.add(route.route_id);
    return compileRoute(route, descriptorByApp, bindingById, deviceCapabilities);
  }).sort((left, right) => left.packet_id.localeCompare(right.packet_id));

  return {
    schema: ALL_APP_ORB_IDL_ACTION_HANDOFF_SCHEMA,
    task_id: ALL_APP_ORB_IDL_ACTION_HANDOFF_TASK_ID,
    generated_at: options.generatedAt ?? '2026-07-15T00:00:00.000Z',
    generated_from: [...(options.generatedFrom ?? [
      'src/services/apps/all-app-executable-backend-contract.ts',
      'src/services/apps/all-app-live-tool-bindings.ts',
      'src/services/glasses/desktop-orb-idl-contract.ts',
      'src/services/mcp/agent-supervisor-console-gateway.ts',
    ])].sort(),
    packet_count: packets.length,
    app_count: new Set(packets.map(packet => packet.app_id)).size,
    live_binding_packet_count: packets.filter(packet => packet.route_id.startsWith('binding:')).length,
    supervisor_action_packet_count: packets.filter(packet => packet.route_id.startsWith('supervisor:')).length,
    peer_did_count: new Set(packets.map(packet => packet.peer_did)).size,
    fallback_selected_count: packets.filter(packet => packet.selected_fallback.selected).length,
    packets,
  };
}

function compileRoute(
  route: OrbIdlActionHandoffRoute,
  descriptorByApp: ReadonlyMap<string, DesktopOrbIdlAppDescriptor>,
  bindingById: ReadonlyMap<string, AllAppLiveToolBinding>,
  device: ActionHandoffDeviceCapabilities,
): OrbIdlActionHandoffPacket {
  if (!route.correlation_id.trim()) {
    throw new OrbIdlActionHandoffCompileError('INVALID_CORRELATION_ID', route.route_id, 'A correlation ID is required.');
  }
  const descriptor = descriptorByApp.get(route.app_id);
  if (!descriptor) {
    throw new OrbIdlActionHandoffCompileError('DESCRIPTOR_NOT_FOUND', route.route_id, `No descriptor for ${route.app_id}.`);
  }
  if (computeInterfaceCID(descriptor.idl_descriptor) !== descriptor.interface_cid) {
    throw new OrbIdlActionHandoffCompileError('DESCRIPTOR_CID_MISMATCH', route.route_id, 'Descriptor interface CID is stale.');
  }
  if (!descriptor.idl_descriptor.methods.some(method => method.name === route.method_id)) {
    throw new OrbIdlActionHandoffCompileError('METHOD_NOT_FOUND', route.route_id, `Method ${route.method_id} is not exposed.`);
  }
  const liveBinding = bindingById.get(route.binding_id);
  if (!liveBinding) {
    throw new OrbIdlActionHandoffCompileError('MISSING_LIVE_BINDING', route.route_id, `Missing ${route.binding_id}.`);
  }
  const executable = getExecutableBinding(route.binding_id);
  if (liveBinding.app_id !== route.app_id || liveBinding.owner !== executable.owner
    || liveBinding.state !== 'gateway_materialized' || liveBinding.gateway.direct_backend_access) {
    throw new OrbIdlActionHandoffCompileError(
      'LIVE_BINDING_IDENTITY_MISMATCH', route.route_id,
      `Live binding ${route.binding_id} is not a materialized binding for ${route.app_id}.`,
    );
  }
  const deviceByModality = new Map(device.modalities.map(capability => [capability.modality, capability]));
  const requestedDevice = deviceByModality.get(route.requested_modality)!;
  const modality = descriptor.modality_contract[route.requested_modality];
  if (requestedDevice.available && requestedDevice.permission === 'denied' && !requestedDevice.fallback_available) {
    throw new OrbIdlActionHandoffCompileError('INVALID_DEVICE_CAPABILITY', route.route_id, 'Denied device permission lacks a fallback.');
  }
  if (!requestedDevice.available && !requestedDevice.fallback_available) {
    throw new OrbIdlActionHandoffCompileError('INVALID_DEVICE_CAPABILITY', route.route_id, 'Unavailable requested modality lacks a fallback.');
  }
  const constraints = MODALITIES.map(kind => {
    const capability = deviceByModality.get(kind)!;
    const declared = descriptor.modality_contract[kind];
    return {
      ...capability,
      descriptor_availability: declared.availability,
      primary_surface: declared.primary_surface,
      allowed: kind === route.requested_modality && capability.available
        && capability.permission !== 'denied' && route.permission_state === 'permitted'
        && declared.availability === 'available',
    };
  });
  const receiptCid = stableCid({ route: route.route_id, interface: descriptor.interface_cid, ref: 'receipt' });
  const eventDagCid = stableCid({ route: route.route_id, interface: descriptor.interface_cid, receiptCid, ref: 'event-dag' });
  const fallback = fallbackFor(route, modality, requestedDevice);
  const capabilityProfile = capabilityProfileFor(executable, liveBinding);
  const packetWithoutIdentity = {
    route_id: route.route_id,
    app_id: route.app_id,
    action_id: route.action_id,
    interface_cid: descriptor.interface_cid,
    method_id: route.method_id,
    binding_id: route.binding_id,
    owner: liveBinding.owner,
    peer_did: peerDidFor(liveBinding.owner),
    capability_profile: capabilityProfile,
    permission: {
      state: route.permission_state,
      policy_class: executable.mediated_intent.policy_class,
      consent: route.consent_state,
      confirmation_required: route.permission_state === 'confirmation_required',
      execution_allowed: route.permission_state === 'permitted' && route.consent_state !== 'denied',
    },
    permission_state: route.permission_state,
    consent_state: route.consent_state,
    correlation_id: route.correlation_id,
    tool_ref: {
      owner: liveBinding.owner,
      tool_id: executable.tool_selection.preferred_tool_ids[0],
      gateway_route: liveBinding.gateway.route,
      binding_id: liveBinding.binding_id,
    },
    tool_refs: [{
      owner: liveBinding.owner,
      tool_id: executable.tool_selection.preferred_tool_ids[0],
      gateway_route: liveBinding.gateway.route,
      binding_id: liveBinding.binding_id,
    }],
    receipt_refs: [{ ref: `receipt:${route.correlation_id}`, cid: receiptCid,
      state: executable.receipt_requirement.required ? 'expected' as const : 'preserved' as const }],
    event_dag_refs: [{ ref: `event-dag:${route.correlation_id}`, cid: eventDagCid, state: 'expected' as const }],
    modality_constraints: constraints,
    rollback: rollbackFor(executable, receiptCid),
    selected_fallback: fallback,
    source_contract_ref: route.source_contract_ref,
  };
  const packetCid = stableCid(packetWithoutIdentity);
  return { packet_id: `handoff:${route.route_id}:${packetCid.slice(-16)}`, packet_cid: packetCid, ...packetWithoutIdentity };
}

function validateDeviceCapabilities(device: ActionHandoffDeviceCapabilities): void {
  if (!device.device_id.trim() || !['simulator', 'physical'].includes(device.mode)) {
    throw new OrbIdlActionHandoffCompileError('INVALID_DEVICE_CAPABILITY', 'device', 'Device ID and mode are required.');
  }
  const seen = new Set<string>();
  for (const capability of device.modalities) {
    if (seen.has(capability.modality)) {
      throw new OrbIdlActionHandoffCompileError('INVALID_DEVICE_CAPABILITY', capability.modality, 'Duplicate modality declaration.');
    }
    seen.add(capability.modality);
    if (capability.physical_hardware && device.mode === 'simulator') {
      throw new OrbIdlActionHandoffCompileError('INVALID_DEVICE_CAPABILITY', capability.modality, 'Simulator cannot claim physical hardware.');
    }
    if (capability.permission === 'granted' && !capability.available) {
      throw new OrbIdlActionHandoffCompileError('INVALID_DEVICE_CAPABILITY', capability.modality, 'Unavailable modality cannot have granted permission.');
    }
    if (!capability.available && !capability.fallback_available) {
      throw new OrbIdlActionHandoffCompileError('INVALID_DEVICE_CAPABILITY', capability.modality, 'Unavailable modality must declare a fallback.');
    }
  }
  for (const modality of MODALITIES) {
    if (!seen.has(modality)) {
      throw new OrbIdlActionHandoffCompileError('INVALID_DEVICE_CAPABILITY', modality, 'Required modality capability is missing.');
    }
  }
}

function getExecutableBinding(bindingId: string): ExecutableBackendBinding {
  const binding = ALL_APP_EXECUTABLE_BACKEND_CONTRACT.apps
    .flatMap(app => app.backend_bindings)
    .find(candidate => candidate.binding_id === bindingId);
  if (!binding) throw new OrbIdlActionHandoffCompileError('MISSING_LIVE_BINDING', bindingId, 'Not declared by executable contract.');
  return binding;
}

function permissionStateFor(binding: ExecutableBackendBinding): ActionHandoffPermissionState {
  return binding.ui_control.confirmation === 'none' && binding.mediated_intent.policy_class === 'read'
    ? 'permitted'
    : 'confirmation_required';
}

function consentStateFor(binding: ExecutableBackendBinding): ActionHandoffConsentState {
  return permissionStateFor(binding) === 'permitted' ? 'not_required' : 'required';
}

function capabilityProfileFor(binding: ExecutableBackendBinding, liveBinding: AllAppLiveToolBinding) {
  const profiles = new Set<'A' | 'B' | 'C' | 'D' | 'E' | 'F'>(['A', 'B', 'D', 'F']);
  if (binding.mediated_intent.policy_class !== 'read') profiles.add('C');
  if (liveBinding.gateway.transports.includes('libp2p')) profiles.add('E');
  const required = [...profiles].sort() as ('A' | 'B' | 'C' | 'D' | 'E' | 'F')[];
  return {
    profile_id: `mcp++:${required.join('+')}`,
    required_profiles: required,
    capabilities: [binding.capability_id, binding.mediated_intent.capability].sort(),
    transports: [...liveBinding.gateway.transports].sort() as ('http' | 'libp2p')[],
  };
}

function fallbackFor(
  route: OrbIdlActionHandoffRoute,
  modality: DesktopOrbIdlAppDescriptor['modality_contract'][DesktopOrbIdlModalityKind],
  device: ActionHandoffDeviceModality,
): OrbIdlActionHandoffPacket['selected_fallback'] {
  const reason = route.permission_state === 'denied' || route.consent_state === 'denied'
    ? 'permission_denied' as const
    : route.permission_state === 'confirmation_required' || route.consent_state === 'required'
      ? 'consent_required' as const
      : !device.available || device.permission === 'denied' || modality.availability !== 'available'
        ? 'device_unavailable' as const
        : 'direct_route_available' as const;
  return {
    selected: reason !== 'direct_route_available',
    kind: modality.fallback.kind,
    target_surface: modality.fallback.target_surface,
    reason,
    user_visible: modality.fallback.user_visible,
  };
}

function rollbackFor(binding: ExecutableBackendBinding, receiptCid: string): OrbIdlActionHandoffPacket['rollback'] {
  const mutating = binding.mediated_intent.mutates_remote_state;
  return {
    required: mutating,
    mode: mutating ? 'compensating_receipt' : 'no_mutation',
    recovery_errors: binding.error_recovery.routes.map(route => route.error).sort(),
    rollback_token: mutating ? `rollback:${receiptCid}` : null,
  };
}

function peerDidFor(owner: string): string {
  const peers: Record<string, string> = {
    ipfs_kit_py: 'did:key:z6MkhSvdK7t',
    ipfs_datasets_py: 'did:key:z6MkhSvdD4tas',
    ipfs_accelerate_py: 'did:key:z6MkhSvdAcce1',
  };
  return peers[owner] ?? 'did:key:z6MkhSvdUnkn';
}

function stableCid(value: unknown): string {
  return computeCID(stableStringify(value));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().filter(key => record[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
