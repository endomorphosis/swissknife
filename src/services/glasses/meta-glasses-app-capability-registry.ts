import { computeInterfaceCID, type InterfaceDescriptor } from '../mcp/mcp-idl.js';
import {
  META_GLASSES_IO_PERMISSION_SCOPES,
  META_GLASSES_IO_PROFILE_PROPERTY,
  createDefaultMetaGlassesIOProfile,
  type MetaGlassesIOCapabilityContract,
  type MetaGlassesIOCapabilityKind,
  type MetaGlassesIOControlPlaneRouteDecision,
  type MetaGlassesIOFallbackRoute,
  type MetaGlassesIOPermissionScope,
  type MetaGlassesIOPolicyDecision,
  type MetaGlassesIOReadiness,
  type MetaGlassesIOSurface,
} from './meta-glasses-io-profile.js';

export const META_GLASSES_APP_CAPABILITY_REGISTRY_ID =
  'org.handsfree.swissknife.meta-glasses-app-capability-registry@0.1.0';

export type MetaGlassesAppCapabilityId =
  | MetaGlassesIOCapabilityKind
  | 'fallback.route'
  | 'unsupported.capability';

export type MetaGlassesAppCapabilitySource =
  | 'dat-native'
  | 'display-webapp'
  | 'bluetooth-audio-route'
  | 'phone-os-context'
  | 'swissknife-fallback'
  | 'unsupported';

export interface MetaGlassesAppCapabilityDescriptorRef {
  descriptor_id: typeof META_GLASSES_APP_CAPABILITY_REGISTRY_ID;
  interface_cid: string;
  profile_property: typeof META_GLASSES_IO_PROFILE_PROPERTY;
  capability_methods: string[];
  required_profiles: string[];
}

export interface MetaGlassesAppPolicyRequirements {
  default_deny: true;
  policy_gate: 'hallucinate_app.control_surface';
  decisions: MetaGlassesIOPolicyDecision[];
}

export interface MetaGlassesAppFallbackBehavior {
  available: boolean;
  readiness_triggers: MetaGlassesIOReadiness[];
  routes: MetaGlassesIOFallbackRoute[];
}

export interface MetaGlassesAppCapabilityEntry {
  capability_id: MetaGlassesAppCapabilityId;
  label: string;
  app_id: string;
  source: MetaGlassesAppCapabilitySource;
  primary_surface?: MetaGlassesIOSurface;
  app_binding_ids: string[];
  permission_scopes: MetaGlassesIOPermissionScope[];
  route_readiness: MetaGlassesIOReadiness;
  policy_requirements: MetaGlassesAppPolicyRequirements;
  control_plane_route_decisions: MetaGlassesIOControlPlaneRouteDecision[];
  mcp_descriptor_refs: MetaGlassesAppCapabilityDescriptorRef[];
  fallback_behavior: MetaGlassesAppFallbackBehavior;
  dat_sdk_import_required: false;
}

export interface MetaGlassesAppCapabilityRegistry {
  registry_id: typeof META_GLASSES_APP_CAPABILITY_REGISTRY_ID;
  app_id: string;
  descriptor: InterfaceDescriptor;
  descriptor_cid: string;
  entries: MetaGlassesAppCapabilityEntry[];
  sdk_import_required: false;
}

export interface CreateMetaGlassesAppCapabilityRegistryOptions {
  app_id?: string;
  descriptor?: InterfaceDescriptor;
}

export interface MetaGlassesAppCapabilityRequest {
  capability_id: MetaGlassesAppCapabilityId;
  app_id?: string;
  granted_scopes?: MetaGlassesIOPermissionScope[];
  preferred_surface?: MetaGlassesIOSurface;
  readiness_override?: MetaGlassesIOReadiness;
}

export type MetaGlassesAppCapabilityRequestStatus =
  | 'ready'
  | 'permission_required'
  | 'fallback'
  | 'unsupported'
  | 'denied';

export interface MetaGlassesAppCapabilityRequestResult {
  status: MetaGlassesAppCapabilityRequestStatus;
  granted: boolean;
  entry: MetaGlassesAppCapabilityEntry;
  missing_scopes: MetaGlassesIOPermissionScope[];
  selected_route?: MetaGlassesIOControlPlaneRouteDecision;
  fallback_route?: MetaGlassesIOFallbackRoute;
  policy_decision: MetaGlassesIOPolicyDecision;
  reasons: string[];
}

export function createMetaGlassesAppCapabilityDescriptor(): InterfaceDescriptor {
  const ioProfile = createDefaultMetaGlassesIOProfile();

  return {
    name: 'meta-glasses-app-capability-registry',
    namespace: 'org.handsfree.swissknife.meta_glasses',
    version: '0.1.0',
    methods: [
      ...ioProfile.capabilities.map(capability => ({
        name: methodForCapability(capability.kind),
        input_schema: { type: 'object', additionalProperties: true },
        output_schema: { type: 'object', additionalProperties: true },
      })),
      {
        name: 'fallback_route',
        input_schema: { type: 'object', additionalProperties: true },
        output_schema: { type: 'object', additionalProperties: true },
      },
      {
        name: 'unsupported_capability',
        input_schema: { type: 'object', additionalProperties: true },
        output_schema: { type: 'object', additionalProperties: true },
      },
    ],
    errors: [
      { name: 'CapabilityUnsupported' },
      { name: 'PermissionRequired' },
      { name: 'AppBindingDenied' },
    ],
    requires: ['mcp++/idl', 'mcp++/receipts', 'mcp++/policy', 'libp2p/session'],
    compatibility: {
      compatible_with: [],
      supersedes: [],
    },
    semanticTags: ['meta-glasses', 'app-capability-registry', 'mcp++'],
    observability: { trace: true, provenance: true },
    interaction_patterns: { request_response: true, event_streams: true },
    [META_GLASSES_IO_PROFILE_PROPERTY]: ioProfile,
  } as InterfaceDescriptor;
}

export function createDefaultMetaGlassesAppCapabilityRegistry(
  options: CreateMetaGlassesAppCapabilityRegistryOptions = {},
): MetaGlassesAppCapabilityRegistry {
  const appId = options.app_id ?? 'swissknife.meta-glasses';
  const descriptor = options.descriptor ?? createMetaGlassesAppCapabilityDescriptor();
  const descriptorCid = computeInterfaceCID(descriptor);
  const ioProfile = createDefaultMetaGlassesIOProfile();
  const descriptorRef = descriptorRefFor(descriptor, descriptorCid);
  const entries = [
    ...ioProfile.capabilities.map(capability =>
      entryForCapability(capability, appId, descriptorRef),
    ),
    fallbackEntry(appId, descriptorRef, ioProfile.capabilities),
    unsupportedEntry(appId, descriptorRef),
  ];

  return {
    registry_id: META_GLASSES_APP_CAPABILITY_REGISTRY_ID,
    app_id: appId,
    descriptor,
    descriptor_cid: descriptorCid,
    entries,
    sdk_import_required: false,
  };
}

export function listMetaGlassesAppCapabilities(
  registry: MetaGlassesAppCapabilityRegistry,
): MetaGlassesAppCapabilityEntry[] {
  return registry.entries.map(entry => clone(entry));
}

export function findMetaGlassesAppCapability(
  registry: MetaGlassesAppCapabilityRegistry,
  capabilityId: MetaGlassesAppCapabilityId,
): MetaGlassesAppCapabilityEntry | undefined {
  const entry = registry.entries.find(candidate => candidate.capability_id === capabilityId);
  return entry ? clone(entry) : undefined;
}

export function requestMetaGlassesAppCapability(
  registry: MetaGlassesAppCapabilityRegistry,
  request: MetaGlassesAppCapabilityRequest,
): MetaGlassesAppCapabilityRequestResult {
  const entry =
    registry.entries.find(candidate => candidate.capability_id === request.capability_id) ??
    registry.entries.find(candidate => candidate.capability_id === 'unsupported.capability') ??
    unsupportedEntry(registry.app_id, descriptorRefFor(registry.descriptor, registry.descriptor_cid));

  if (entry.capability_id === 'unsupported.capability') {
    const policyDecision = denyPolicy([], 'Requested capability is unsupported.');
    return {
      status: 'unsupported',
      granted: false,
      entry: clone(entry),
      missing_scopes: [],
      policy_decision: policyDecision,
      reasons: policyDecision.reasons,
    };
  }

  if (request.app_id && request.app_id !== entry.app_id) {
    const policyDecision = denyPolicy(
      entry.permission_scopes,
      `Capability is bound to ${entry.app_id}, not ${request.app_id}.`,
    );
    return {
      status: 'denied',
      granted: false,
      entry: clone(entry),
      missing_scopes: [],
      policy_decision: policyDecision,
      reasons: policyDecision.reasons,
    };
  }

  const grantedScopes = request.granted_scopes ?? [];
  const missingScopes = entry.permission_scopes.filter(scope => !grantedScopes.includes(scope));
  if (missingScopes.length > 0) {
    const policyDecision = confirmationPolicy(entry.permission_scopes, grantedScopes);
    return {
      status: 'permission_required',
      granted: false,
      entry: clone(entry),
      missing_scopes: missingScopes,
      policy_decision: policyDecision,
      reasons: policyDecision.reasons,
    };
  }

  const readiness = request.readiness_override ?? entry.route_readiness;
  const fallbackRoute = entry.fallback_behavior.routes.find(route => route.when.includes(readiness));
  if (readiness !== 'ready' && fallbackRoute) {
    return {
      status: 'fallback',
      granted: true,
      entry: clone(entry),
      missing_scopes: [],
      fallback_route: clone(fallbackRoute),
      policy_decision: clone(fallbackRoute.policy_decision),
      reasons: fallbackRoute.policy_decision.reasons,
    };
  }

  const selectedRoute =
    entry.control_plane_route_decisions.find(
      route => route.selected_surface === request.preferred_surface,
    ) ?? entry.control_plane_route_decisions[0];
  if (!selectedRoute && entry.fallback_behavior.available) {
    const defaultFallbackRoute = entry.fallback_behavior.routes[0];
    return {
      status: 'fallback',
      granted: true,
      entry: clone(entry),
      missing_scopes: [],
      fallback_route: clone(defaultFallbackRoute),
      policy_decision: clone(defaultFallbackRoute.policy_decision),
      reasons: defaultFallbackRoute.policy_decision.reasons,
    };
  }

  return {
    status: 'ready',
    granted: true,
    entry: clone(entry),
    missing_scopes: [],
    selected_route: clone(selectedRoute),
    policy_decision: clone(selectedRoute.policy_decision),
    reasons: selectedRoute.policy_decision.reasons,
  };
}

function entryForCapability(
  capability: MetaGlassesIOCapabilityContract,
  appId: string,
  descriptorRef: MetaGlassesAppCapabilityDescriptorRef,
): MetaGlassesAppCapabilityEntry {
  const appBindingIds = capability.application_bindings.map(binding => binding.binding_id);
  const policyDecisions = capability.route_decisions.map(route => route.policy_decision);

  return {
    capability_id: capability.kind,
    label: capability.label,
    app_id: appId,
    source: sourceForCapability(capability),
    primary_surface: capability.primary_surface,
    app_binding_ids: appBindingIds,
    permission_scopes: uniqueScopes(capability.permission_scopes),
    route_readiness: capability.readiness,
    policy_requirements: {
      default_deny: true,
      policy_gate: 'hallucinate_app.control_surface',
      decisions: policyDecisions,
    },
    control_plane_route_decisions: capability.route_decisions.map(route => ({
      ...clone(route),
      selected_surface: route.selected_surface,
    })),
    mcp_descriptor_refs: [descriptorRef],
    fallback_behavior: {
      available: capability.fallback_routes.length > 0,
      readiness_triggers: uniqueReadiness(
        capability.fallback_routes.flatMap(route => route.when),
      ),
      routes: clone(capability.fallback_routes),
    },
    dat_sdk_import_required: false,
  };
}

function fallbackEntry(
  appId: string,
  descriptorRef: MetaGlassesAppCapabilityDescriptorRef,
  capabilities: MetaGlassesIOCapabilityContract[],
): MetaGlassesAppCapabilityEntry {
  const routes = capabilities.flatMap(capability => capability.fallback_routes);
  return {
    capability_id: 'fallback.route',
    label: 'Meta glasses fallback routing',
    app_id: appId,
    source: 'swissknife-fallback',
    app_binding_ids: ['fallback.route.binding'],
    permission_scopes: ['meta_glasses.control.route'],
    route_readiness: 'ready',
    policy_requirements: {
      default_deny: true,
      policy_gate: 'hallucinate_app.control_surface',
      decisions: routes.map(route => route.policy_decision),
    },
    control_plane_route_decisions: [],
    mcp_descriptor_refs: [descriptorRef],
    fallback_behavior: {
      available: true,
      readiness_triggers: uniqueReadiness([
        'permission_denied',
        'route_lost',
        'unsupported',
        'unavailable',
        'degraded',
        'firmware_update_required',
      ]),
      routes: clone(routes),
    },
    dat_sdk_import_required: false,
  };
}

function unsupportedEntry(
  appId: string,
  descriptorRef: MetaGlassesAppCapabilityDescriptorRef,
): MetaGlassesAppCapabilityEntry {
  const policyDecision = denyPolicy([], 'Capability is unsupported by this registry.');
  return {
    capability_id: 'unsupported.capability',
    label: 'Unsupported Meta glasses app capability',
    app_id: appId,
    source: 'unsupported',
    app_binding_ids: ['unsupported.capability.binding'],
    permission_scopes: ['meta_glasses.control.route'],
    route_readiness: 'unsupported',
    policy_requirements: {
      default_deny: true,
      policy_gate: 'hallucinate_app.control_surface',
      decisions: [policyDecision],
    },
    control_plane_route_decisions: [],
    mcp_descriptor_refs: [descriptorRef],
    fallback_behavior: {
      available: false,
      readiness_triggers: ['unsupported'],
      routes: [],
    },
    dat_sdk_import_required: false,
  };
}

function descriptorRefFor(
  descriptor: InterfaceDescriptor,
  descriptorCid: string,
): MetaGlassesAppCapabilityDescriptorRef {
  return {
    descriptor_id: META_GLASSES_APP_CAPABILITY_REGISTRY_ID,
    interface_cid: descriptorCid,
    profile_property: META_GLASSES_IO_PROFILE_PROPERTY,
    capability_methods: descriptor.methods.map(method => method.name),
    required_profiles: [...descriptor.requires],
  };
}

function sourceForCapability(
  capability: MetaGlassesIOCapabilityContract,
): MetaGlassesAppCapabilitySource {
  if (capability.primary_surface === 'dat-native') {
    return 'dat-native';
  }
  if (capability.primary_surface === 'bluetooth-audio') {
    return 'bluetooth-audio-route';
  }
  if (capability.primary_surface === 'phone-os') {
    return 'phone-os-context';
  }
  return 'display-webapp';
}

function methodForCapability(kind: MetaGlassesIOCapabilityKind): string {
  return kind.replace('.', '_');
}

function confirmationPolicy(
  requiredScopes: MetaGlassesIOPermissionScope[],
  grantedScopes: MetaGlassesIOPermissionScope[],
): MetaGlassesIOPolicyDecision {
  return {
    decision_id: 'require-missing-meta-glasses-scopes',
    outcome: 'require_confirmation',
    reasons: ['Required Meta glasses permission scopes have not been granted.'],
    required_scopes: uniqueScopes(requiredScopes),
    granted_scopes: uniqueScopes(grantedScopes),
    decision_cid: 'sha256:requiremissingmetaglassesscopesdecision000000000000000000000000',
    receipt: {
      receipt_kind: 'mcp++/policy-decision',
      decision_cid: 'sha256:requiremissingmetaglassesscopesdecision000000000000000000000000',
      correlation_id_field: 'correlation_id',
    },
  };
}

function denyPolicy(
  requiredScopes: MetaGlassesIOPermissionScope[],
  reason: string,
): MetaGlassesIOPolicyDecision {
  return {
    decision_id: 'deny-meta-glasses-app-capability',
    outcome: 'deny',
    reasons: [reason],
    required_scopes: uniqueScopes(requiredScopes),
    granted_scopes: [],
    decision_cid: 'sha256:denymetaglassesappcapabilitydecision0000000000000000000000000',
    receipt: {
      receipt_kind: 'mcp++/policy-decision',
      decision_cid: 'sha256:denymetaglassesappcapabilitydecision0000000000000000000000000',
      correlation_id_field: 'correlation_id',
    },
  };
}

function uniqueScopes(scopes: MetaGlassesIOPermissionScope[]): MetaGlassesIOPermissionScope[] {
  const allowed = new Set<MetaGlassesIOPermissionScope>(META_GLASSES_IO_PERMISSION_SCOPES);
  return Array.from(new Set(scopes)).filter(scope => allowed.has(scope));
}

function uniqueReadiness(states: MetaGlassesIOReadiness[]): MetaGlassesIOReadiness[] {
  return Array.from(new Set(states));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
