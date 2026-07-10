import {
  VIRTUAL_DESKTOP_APP_MANIFEST,
  type VirtualDesktopAppManifest,
  type VirtualDesktopAppManifestEntry,
  type VirtualDesktopBackendCapability,
} from '../apps/virtual-desktop-app-manifest.js';
import {
  computeCID,
  computeInterfaceCID,
  type ErrorDefinition,
  type InterfaceDescriptor,
  type MethodSignature,
} from '../mcp/mcp-idl.js';

export const VIRTUAL_DESKTOP_ORB_IDL_CONTRACT_SCHEMA =
  'swissknife.virtual_desktop_orb_idl_contract.v1';
export const VIRTUAL_DESKTOP_ORB_IDL_CONTRACT_ID =
  'org.hallucinate.swissknife.virtual-desktop-orb-idl-contract';
export const VIRTUAL_DESKTOP_ORB_IDL_TASK_ID = 'SWR-108';

export type DesktopOrbIdlModalityKind =
  | 'display'
  | 'camera'
  | 'speaker'
  | 'microphone'
  | 'input';

export type DesktopOrbIdlAvailability =
  | 'available'
  | 'fallback_only'
  | 'permission_required'
  | 'unsupported'
  | 'unavailable';

export type DesktopOrbIdlSurface =
  | 'desktop'
  | 'glasses_hud'
  | 'display_webapp'
  | 'mobile_card'
  | 'audio_channel'
  | 'notification'
  | 'policy_console'
  | 'none';

export type DesktopOrbIdlFallbackKind =
  | 'native-display'
  | 'display-webapp'
  | 'mobile-card'
  | 'audio-summary'
  | 'notification'
  | 'desktop-only'
  | 'read-only-status'
  | 'confirmed-policy-path'
  | 'unsupported-modality'
  | 'permission-required';

export interface DesktopOrbIdlFallbackDescriptor {
  kind: DesktopOrbIdlFallbackKind;
  target_surface: DesktopOrbIdlSurface;
  typed_reason:
    | 'supported_projection'
    | 'hardware_not_declared'
    | 'permission_gate'
    | 'policy_gate'
    | 'read_only_projection'
    | 'transport_unavailable'
    | 'desktop_only';
  user_visible: boolean;
  receipt_required: boolean;
  semantics: string;
}

export interface DesktopOrbIdlModalityDescriptor {
  kind: DesktopOrbIdlModalityKind;
  availability: DesktopOrbIdlAvailability;
  primary_surface: DesktopOrbIdlSurface;
  hardware_available: boolean;
  permission_scope?: string;
  read_only: boolean;
  fallback: DesktopOrbIdlFallbackDescriptor;
  semantics: string;
}

export interface DesktopOrbIdlActionOperationPolicy {
  method: string;
  policy_class: string;
  confirmation: 'none' | 'required' | 'required_for_steering' | 'forbidden';
  read_only: boolean;
  receipt_required: boolean;
  allowed_projection_surfaces: readonly DesktopOrbIdlSurface[];
  fallback: DesktopOrbIdlFallbackDescriptor;
}

export interface DesktopOrbIdlActionPolicyDescriptor {
  default_projection: 'read-only' | 'confirmed-action';
  default_read_only: boolean;
  desktop_policy_path: 'same-as-desktop-confirmation';
  glasses_policy_path: 'read-only-status' | 'same-as-desktop-confirmation';
  steering_requires_confirmed_policy_path: boolean;
  operation_policies: readonly DesktopOrbIdlActionOperationPolicy[];
}

export interface DesktopOrbIdlAppDescriptor {
  descriptor_id: string;
  app_id: string;
  title: string;
  category: string;
  owner_module: string;
  launch_kind: string;
  interface_cid: string;
  descriptor_cid: string;
  idl_descriptor: InterfaceDescriptor;
  modality_contract: {
    display: DesktopOrbIdlModalityDescriptor;
    camera: DesktopOrbIdlModalityDescriptor;
    speaker: DesktopOrbIdlModalityDescriptor;
    microphone: DesktopOrbIdlModalityDescriptor;
    input: DesktopOrbIdlModalityDescriptor;
  };
  action_policy: DesktopOrbIdlActionPolicyDescriptor;
  fallback_semantics: readonly DesktopOrbIdlFallbackDescriptor[];
  backend_capability_ids: readonly string[];
  glasses_projection: {
    default_mode: 'read-only' | 'confirmed-action';
    status_read_only: boolean;
    receipts_read_only: boolean;
    steering_requires_confirmation: boolean;
    projected_methods: readonly string[];
  };
}

export interface VirtualDesktopOrbIdlCompleteCoverage {
  schema: typeof VIRTUAL_DESKTOP_ORB_IDL_CONTRACT_SCHEMA;
  contract_id: typeof VIRTUAL_DESKTOP_ORB_IDL_CONTRACT_ID;
  task_id: typeof VIRTUAL_DESKTOP_ORB_IDL_TASK_ID;
  generated_at?: string;
  generated_from: readonly string[];
  validation_commands: readonly string[];
  expected_outputs: readonly string[];
  app_count: number;
  descriptor_count: number;
  interface_cid_count: number;
  modality_count: number;
  typed_fallback_count: number;
  unsupported_modality_count: number;
  read_only_projection_count: number;
  confirmed_policy_action_count: number;
  supervisor_console: {
    app_id: 'agent-supervisor';
    default_projection: 'read-only';
    status_read_only: true;
    receipts_read_only: true;
    steering_requires_confirmation: true;
    policy_path: 'same-as-desktop-confirmation';
  };
  modality_kinds: readonly DesktopOrbIdlModalityKind[];
  descriptors: readonly DesktopOrbIdlAppDescriptor[];
}

export interface VirtualDesktopOrbIdlValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const MODALITY_KINDS = ['display', 'camera', 'speaker', 'microphone', 'input'] as const;

const VALIDATION_COMMANDS = [
  'npm run evidence:mcp-glasses',
  'npm run typecheck:services',
] as const;

const EXPECTED_OUTPUTS = [
  'src/services/glasses',
  'contracts',
  'test-results/virtual-desktop-ipfs-mcp-orb/orb-idl-complete-coverage.json',
  'docs/orb-idl-virtual-desktop-contract.md',
] as const;

export function buildVirtualDesktopOrbIdlCompleteCoverage(
  manifest: VirtualDesktopAppManifest = VIRTUAL_DESKTOP_APP_MANIFEST,
  options: { generatedAt?: string } = {},
): VirtualDesktopOrbIdlCompleteCoverage {
  const descriptors = manifest.apps.map(app => buildAppDescriptor(app));
  const allModalities = descriptors.flatMap(descriptor => Object.values(descriptor.modality_contract));
  const operationPolicies = descriptors.flatMap(descriptor => [...descriptor.action_policy.operation_policies]);

  return {
    schema: VIRTUAL_DESKTOP_ORB_IDL_CONTRACT_SCHEMA,
    contract_id: VIRTUAL_DESKTOP_ORB_IDL_CONTRACT_ID,
    task_id: VIRTUAL_DESKTOP_ORB_IDL_TASK_ID,
    generated_at: options.generatedAt,
    generated_from: [
      manifest.manifest_id,
      'contracts/swissknife_virtual_desktop_app_manifest.schema.json',
      'contracts/orb_idl_virtual_desktop_contract.schema.json',
      'contracts/agent-supervisor-console.schema.json',
    ],
    validation_commands: VALIDATION_COMMANDS,
    expected_outputs: EXPECTED_OUTPUTS,
    app_count: manifest.apps.length,
    descriptor_count: descriptors.length,
    interface_cid_count: new Set(descriptors.map(descriptor => descriptor.interface_cid)).size,
    modality_count: allModalities.length,
    typed_fallback_count: allModalities.filter(modality => Boolean(modality.fallback.kind)).length,
    unsupported_modality_count: allModalities.filter(modality => modality.availability === 'unsupported').length,
    read_only_projection_count: descriptors.filter(descriptor => descriptor.glasses_projection.default_mode === 'read-only').length,
    confirmed_policy_action_count: operationPolicies.filter(policy => (
      policy.confirmation === 'required' || policy.confirmation === 'required_for_steering'
    )).length,
    supervisor_console: {
      app_id: 'agent-supervisor',
      default_projection: 'read-only',
      status_read_only: true,
      receipts_read_only: true,
      steering_requires_confirmation: true,
      policy_path: 'same-as-desktop-confirmation',
    },
    modality_kinds: MODALITY_KINDS,
    descriptors,
  };
}

export function validateVirtualDesktopOrbIdlCompleteCoverage(
  coverage: VirtualDesktopOrbIdlCompleteCoverage,
  manifest: VirtualDesktopAppManifest = VIRTUAL_DESKTOP_APP_MANIFEST,
): VirtualDesktopOrbIdlValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const manifestAppIds = new Set(manifest.apps.map(app => app.id));
  const descriptorAppIds = new Set(coverage.descriptors.map(descriptor => descriptor.app_id));
  const descriptorIds = new Set<string>();

  if (coverage.schema !== VIRTUAL_DESKTOP_ORB_IDL_CONTRACT_SCHEMA) {
    errors.push(`schema must be ${VIRTUAL_DESKTOP_ORB_IDL_CONTRACT_SCHEMA}`);
  }
  if (coverage.contract_id !== VIRTUAL_DESKTOP_ORB_IDL_CONTRACT_ID) {
    errors.push(`contract_id must be ${VIRTUAL_DESKTOP_ORB_IDL_CONTRACT_ID}`);
  }
  if (coverage.task_id !== VIRTUAL_DESKTOP_ORB_IDL_TASK_ID) {
    errors.push(`task_id must be ${VIRTUAL_DESKTOP_ORB_IDL_TASK_ID}`);
  }
  if (coverage.app_count !== manifest.apps.length) {
    errors.push(`app_count ${coverage.app_count} does not match manifest app count ${manifest.apps.length}`);
  }
  if (coverage.descriptor_count !== coverage.descriptors.length) {
    errors.push(`descriptor_count ${coverage.descriptor_count} does not match descriptor length ${coverage.descriptors.length}`);
  }
  if (coverage.modality_count !== coverage.descriptors.length * MODALITY_KINDS.length) {
    errors.push(`modality_count must equal descriptor_count * ${MODALITY_KINDS.length}`);
  }
  if (coverage.typed_fallback_count !== coverage.modality_count) {
    errors.push('every modality must include a typed fallback descriptor');
  }
  if (coverage.interface_cid_count !== coverage.descriptors.length) {
    errors.push('interface_cid_count must equal descriptor_count; duplicate ORB/IDL CIDs detected');
  }

  for (const appId of manifestAppIds) {
    if (!descriptorAppIds.has(appId)) errors.push(`${appId}: missing ORB/IDL app descriptor`);
  }
  for (const descriptor of coverage.descriptors) {
    if (descriptorIds.has(descriptor.descriptor_id)) errors.push(`${descriptor.descriptor_id}: duplicate descriptor id`);
    descriptorIds.add(descriptor.descriptor_id);
    if (!manifestAppIds.has(descriptor.app_id)) {
      errors.push(`${descriptor.descriptor_id}: descriptor references unknown app ${descriptor.app_id}`);
    }
    if (computeInterfaceCID(descriptor.idl_descriptor) !== descriptor.interface_cid) {
      errors.push(`${descriptor.descriptor_id}: interface CID does not match canonical descriptor`);
    }
    if (computeCID(JSON.stringify(descriptor.idl_descriptor)) !== descriptor.descriptor_cid) {
      errors.push(`${descriptor.descriptor_id}: descriptor CID does not match descriptor body`);
    }
    if (descriptor.idl_descriptor.methods.length !== descriptor.action_policy.operation_policies.length) {
      errors.push(`${descriptor.descriptor_id}: method count must match action policy operation count`);
    }

    for (const kind of MODALITY_KINDS) {
      const modality = descriptor.modality_contract[kind];
      if (!modality) {
        errors.push(`${descriptor.descriptor_id}: missing ${kind} modality`);
        continue;
      }
      if (modality.kind !== kind) errors.push(`${descriptor.descriptor_id}: ${kind} modality kind mismatch`);
      if (!modality.fallback?.kind || !modality.fallback.typed_reason) {
        errors.push(`${descriptor.descriptor_id}/${kind}: missing typed fallback semantics`);
      }
      if (modality.availability === 'unsupported' && modality.hardware_available) {
        errors.push(`${descriptor.descriptor_id}/${kind}: unsupported modality cannot claim hardware availability`);
      }
      if (modality.availability !== 'available' && modality.fallback.kind === 'native-display') {
        errors.push(`${descriptor.descriptor_id}/${kind}: unavailable modality cannot use native-display fallback`);
      }
    }

    for (const policy of descriptor.action_policy.operation_policies) {
      if (!descriptor.idl_descriptor.methods.some(method => method.name === policy.method)) {
        errors.push(`${descriptor.descriptor_id}/${policy.method}: policy references unknown IDL method`);
      }
      if (policy.confirmation === 'forbidden' && !policy.read_only) {
        errors.push(`${descriptor.descriptor_id}/${policy.method}: forbidden policy must be read-only/fallback only`);
      }
      if (!policy.fallback?.kind) errors.push(`${descriptor.descriptor_id}/${policy.method}: missing action fallback`);
    }
  }

  const supervisor = coverage.descriptors.find(descriptor => descriptor.app_id === 'agent-supervisor');
  if (!supervisor) {
    errors.push('agent-supervisor: missing supervisor ORB/IDL descriptor');
  } else {
    if (supervisor.glasses_projection.default_mode !== 'read-only') {
      errors.push('agent-supervisor: glasses projection must default to read-only');
    }
    if (!supervisor.glasses_projection.status_read_only || !supervisor.glasses_projection.receipts_read_only) {
      errors.push('agent-supervisor: status and receipts projections must be read-only');
    }
    if (!supervisor.glasses_projection.steering_requires_confirmation) {
      errors.push('agent-supervisor: steering must require confirmed policy path');
    }
    const steering = supervisor.action_policy.operation_policies.find(policy => policy.method === 'request_prompt_steering');
    if (!steering) {
      errors.push('agent-supervisor: missing request_prompt_steering policy');
    } else if (steering.confirmation !== 'required_for_steering' || steering.read_only) {
      errors.push('agent-supervisor/request_prompt_steering: must require steering confirmation and cannot be read-only');
    }
    for (const method of ['read_status', 'read_receipts']) {
      const policy = supervisor.action_policy.operation_policies.find(candidate => candidate.method === method);
      if (!policy?.read_only || policy.confirmation !== 'none') {
        errors.push(`agent-supervisor/${method}: must remain read-only without confirmation`);
      }
    }
  }

  if (coverage.unsupported_modality_count === 0) {
    warnings.push('coverage contains no unsupported modalities; check for fabricated hardware availability');
  }

  return { valid: errors.length === 0, errors, warnings };
}

function buildAppDescriptor(app: VirtualDesktopAppManifestEntry): DesktopOrbIdlAppDescriptor {
  const methods = methodSignaturesForApp(app);
  const idlDescriptor: InterfaceDescriptor = {
    name: `virtual-desktop.${slug(app.id)}`,
    namespace: 'org.hallucinate.swissknife.virtual_desktop',
    version: '2026-07-10',
    methods,
    errors: errorDefinitions(),
    requires: requiredCapabilities(app),
    compatibility: { compatibleWith: [], supersedes: [] },
    semanticTags: [
      'virtual-desktop',
      'orb-idl',
      app.id,
      app.category,
      app.owner_module,
      app.launch_kind,
      ...app.service_families,
      ...app.capabilities,
    ],
    observability: { trace: true, provenance: true },
    interactionPatterns: { requestResponse: true, eventStreams: app.orb_idl_state.receipt_required },
    resourceCostHints: costHintsForApp(app),
    schemaHash: computeCID(JSON.stringify(methods.map(method => ({
      name: method.name,
      inputSchema: method.inputSchema,
      outputSchema: method.outputSchema,
    })))),
  };
  const interfaceCid = computeInterfaceCID(idlDescriptor);
  const actionPolicy = actionPolicyForApp(app, methods);

  return {
    descriptor_id: `virtual-desktop.${app.id}`,
    app_id: app.id,
    title: app.title,
    category: app.category,
    owner_module: app.owner_module,
    launch_kind: app.launch_kind,
    interface_cid: interfaceCid,
    descriptor_cid: computeCID(JSON.stringify(idlDescriptor)),
    idl_descriptor: idlDescriptor,
    modality_contract: {
      display: displayModalityForApp(app),
      camera: captureModalityForApp(app, 'camera'),
      speaker: speakerModalityForApp(app),
      microphone: captureModalityForApp(app, 'microphone'),
      input: inputModalityForApp(app),
    },
    action_policy: actionPolicy,
    fallback_semantics: uniqueFallbacks([
      displayModalityForApp(app).fallback,
      captureModalityForApp(app, 'camera').fallback,
      speakerModalityForApp(app).fallback,
      captureModalityForApp(app, 'microphone').fallback,
      inputModalityForApp(app).fallback,
      ...actionPolicy.operation_policies.map(policy => policy.fallback),
    ]),
    backend_capability_ids: app.backend_capabilities.map(capability => capability.id),
    glasses_projection: glassesProjectionForApp(app, methods),
  };
}

function methodSignaturesForApp(app: VirtualDesktopAppManifestEntry): MethodSignature[] {
  const methods: MethodSignature[] = [
    operationMethod('read_status', app, 'Read the app projection, launch, transport, and policy status.', 'read'),
    operationMethod('read_receipts', app, 'Read descriptor, policy, and execution receipt references.', 'read'),
    operationMethod('request_action', app, 'Request an app action through the desktop confirmation policy path.', primaryPolicyClass(app)),
    operationMethod('request_fallback', app, 'Request a typed fallback projection when a modality is unavailable.', 'read'),
  ];
  if (app.id === 'agent-supervisor') {
    methods.splice(2, 0, operationMethod(
      'request_prompt_steering',
      app,
      'Request bounded supervisor prompt steering through the confirmed desktop policy path.',
      'confirm',
    ));
  }
  return methods;
}

function operationMethod(
  name: string,
  app: VirtualDesktopAppManifestEntry,
  description: string,
  policyClass: string,
): MethodSignature {
  const inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      app_id: { type: 'string', const: app.id },
      correlation_id: { type: 'string' },
      modality: { type: 'string', enum: MODALITY_KINDS },
      requested_surface: { type: 'string' },
      payload: { type: 'object', additionalProperties: true },
      confirmed_policy_receipt_cid: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
    },
    required: ['app_id', 'correlation_id'],
  };
  const outputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      app_id: { type: 'string', const: app.id },
      method: { type: 'string', const: name },
      status: { type: 'string', enum: ['ok', 'fallback', 'denied', 'unavailable'] },
      policy_class: { type: 'string', const: policyClass },
      receipt_refs: { type: 'array', items: receiptRefSchema() },
      fallback: { type: 'object', additionalProperties: true },
    },
    required: ['app_id', 'method', 'status', 'policy_class', 'receipt_refs'],
  };
  return {
    name,
    description,
    inputSchema,
    outputSchema,
    input_schema: inputSchema,
    output_schema: outputSchema,
    errorSchemaCids: [
      computeCID(`${VIRTUAL_DESKTOP_ORB_IDL_CONTRACT_SCHEMA}.${name}.policy_denied`),
      computeCID(`${VIRTUAL_DESKTOP_ORB_IDL_CONTRACT_SCHEMA}.${name}.fallback_required`),
    ],
  };
}

function actionPolicyForApp(
  app: VirtualDesktopAppManifestEntry,
  methods: readonly MethodSignature[],
): DesktopOrbIdlActionPolicyDescriptor {
  const supervisor = app.id === 'agent-supervisor';
  return {
    default_projection: supervisor ? 'read-only' : 'confirmed-action',
    default_read_only: supervisor,
    desktop_policy_path: 'same-as-desktop-confirmation',
    glasses_policy_path: supervisor ? 'read-only-status' : 'same-as-desktop-confirmation',
    steering_requires_confirmed_policy_path: supervisor,
    operation_policies: methods.map(method => operationPolicyForMethod(app, method.name)),
  };
}

function operationPolicyForMethod(
  app: VirtualDesktopAppManifestEntry,
  method: string,
): DesktopOrbIdlActionOperationPolicy {
  const isRead = method === 'read_status' || method === 'read_receipts' || method === 'request_fallback';
  const isSteering = app.id === 'agent-supervisor' && method === 'request_prompt_steering';
  const policyClass = isRead ? 'read' : isSteering ? 'confirm' : primaryPolicyClass(app);
  return {
    method,
    policy_class: policyClass,
    confirmation: isRead ? 'none' : isSteering ? 'required_for_steering' : confirmationForPolicy(policyClass),
    read_only: isRead,
    receipt_required: app.orb_idl_state.receipt_required || !isRead || isSteering,
    allowed_projection_surfaces: isRead
      ? ['desktop', surfaceForGlassesHandoff(app)]
      : ['desktop', 'mobile_card', 'policy_console'],
    fallback: isRead
      ? fallback('read-only-status', surfaceForGlassesHandoff(app), 'read_only_projection', false, 'Read-only projection remains visible without action authority.')
      : fallback('confirmed-policy-path', 'policy_console', 'policy_gate', true, 'Action routes through the same confirmed policy path as desktop.'),
  };
}

function displayModalityForApp(app: VirtualDesktopAppManifestEntry): DesktopOrbIdlModalityDescriptor {
  const surface = surfaceForGlassesHandoff(app);
  const available = surface === 'glasses_hud' || surface === 'display_webapp';
  return {
    kind: 'display',
    availability: available ? 'available' : 'fallback_only',
    primary_surface: surface,
    hardware_available: false,
    permission_scope: 'meta_glasses.display.render',
    read_only: app.id === 'agent-supervisor',
    fallback: fallback(
      fallbackKindForSurface(surface),
      surface,
      available ? 'supported_projection' : 'desktop_only',
      app.orb_idl_state.receipt_required,
      `${app.title} projects display state through ${app.glasses_strategy.handoff}.`,
    ),
    semantics: `${app.title} display projection uses ${app.glasses_strategy.kind} with no physical glasses hardware claim.`,
  };
}

function captureModalityForApp(
  app: VirtualDesktopAppManifestEntry,
  kind: 'camera' | 'microphone',
): DesktopOrbIdlModalityDescriptor {
  const permission = kind === 'camera' ? 'meta_glasses.camera.photo' : 'meta_glasses.microphone.input';
  const surface = app.id === 'agent-supervisor' ? 'mobile_card' : 'desktop';
  return {
    kind,
    availability: 'unsupported',
    primary_surface: 'none',
    hardware_available: false,
    permission_scope: permission,
    read_only: true,
    fallback: fallback(
      'unsupported-modality',
      surface,
      'hardware_not_declared',
      false,
      `${kind} is not declared as available for ${app.id}; callers receive typed fallback metadata instead of hardware availability.`,
    ),
    semantics: `${kind} is explicitly modeled as unsupported unless a future app binding declares a governed capture route.`,
  };
}

function speakerModalityForApp(app: VirtualDesktopAppManifestEntry): DesktopOrbIdlModalityDescriptor {
  const audioCapable = app.glasses_strategy.handoff === 'audio-summary' || app.capabilities.some(capability => (
    /audio|media|music|chat|notification/.test(capability)
  ));
  return {
    kind: 'speaker',
    availability: audioCapable ? 'fallback_only' : 'unsupported',
    primary_surface: audioCapable ? 'audio_channel' : 'none',
    hardware_available: false,
    permission_scope: 'meta_glasses.speaker.output',
    read_only: true,
    fallback: fallback(
      audioCapable ? 'audio-summary' : 'unsupported-modality',
      audioCapable ? 'audio_channel' : 'mobile_card',
      audioCapable ? 'supported_projection' : 'hardware_not_declared',
      app.orb_idl_state.receipt_required,
      audioCapable
        ? `${app.title} may emit policy-filtered audio summaries through the companion audio route.`
        : `Speaker output is not declared for ${app.id}; a mobile-card or desktop fallback is returned.`,
    ),
    semantics: 'Speaker descriptors describe routed summary output only; they do not assert paired glasses speaker hardware.',
  };
}

function inputModalityForApp(app: VirtualDesktopAppManifestEntry): DesktopOrbIdlModalityDescriptor {
  return {
    kind: 'input',
    availability: 'available',
    primary_surface: app.id === 'agent-supervisor' ? 'display_webapp' : 'desktop',
    hardware_available: false,
    permission_scope: 'meta_glasses.input.intent',
    read_only: app.id === 'agent-supervisor',
    fallback: fallback(
      app.id === 'agent-supervisor' ? 'read-only-status' : 'mobile-card',
      app.id === 'agent-supervisor' ? 'display_webapp' : 'mobile_card',
      app.id === 'agent-supervisor' ? 'read_only_projection' : 'supported_projection',
      app.orb_idl_state.receipt_required,
      app.id === 'agent-supervisor'
        ? 'Supervisor glasses input can inspect status and receipts; steering input must switch to confirmed policy flow.'
        : `${app.title} input can be normalized as intent events with mobile or desktop fallback.`,
    ),
    semantics: 'Input means normalized intent events, not raw device sensor or keyboard hardware availability.',
  };
}

function glassesProjectionForApp(
  app: VirtualDesktopAppManifestEntry,
  methods: readonly MethodSignature[],
): DesktopOrbIdlAppDescriptor['glasses_projection'] {
  const supervisor = app.id === 'agent-supervisor';
  return {
    default_mode: supervisor ? 'read-only' : 'confirmed-action',
    status_read_only: true,
    receipts_read_only: true,
    steering_requires_confirmation: supervisor,
    projected_methods: methods
      .filter(method => supervisor
        ? method.name === 'read_status' || method.name === 'read_receipts' || method.name === 'request_prompt_steering'
        : true)
      .map(method => method.name),
  };
}

function primaryPolicyClass(app: VirtualDesktopAppManifestEntry): string {
  const ranked = ['destructive', 'credential', 'heavy_compute', 'external_network', 'media_capture', 'write', 'read'];
  const classes = new Set(app.backend_capabilities.map(capability => capability.policy_class));
  return ranked.find(policy => classes.has(policy as VirtualDesktopBackendCapability['policy_class'])) ?? 'read';
}

function confirmationForPolicy(policyClass: string): DesktopOrbIdlActionOperationPolicy['confirmation'] {
  return policyClass === 'read' ? 'none' : 'required';
}

function surfaceForGlassesHandoff(app: VirtualDesktopAppManifestEntry): DesktopOrbIdlSurface {
  if (app.glasses_strategy.handoff === 'native-display') return 'glasses_hud';
  if (app.glasses_strategy.handoff === 'display-webapp') return 'display_webapp';
  if (app.glasses_strategy.handoff === 'mobile-card') return 'mobile_card';
  if (app.glasses_strategy.handoff === 'audio-summary') return 'audio_channel';
  if (app.glasses_strategy.handoff === 'notification') return 'notification';
  return 'desktop';
}

function fallbackKindForSurface(surface: DesktopOrbIdlSurface): DesktopOrbIdlFallbackKind {
  if (surface === 'glasses_hud') return 'native-display';
  if (surface === 'display_webapp') return 'display-webapp';
  if (surface === 'mobile_card') return 'mobile-card';
  if (surface === 'audio_channel') return 'audio-summary';
  if (surface === 'notification') return 'notification';
  return 'desktop-only';
}

function fallback(
  kind: DesktopOrbIdlFallbackKind,
  targetSurface: DesktopOrbIdlSurface,
  typedReason: DesktopOrbIdlFallbackDescriptor['typed_reason'],
  receiptRequired: boolean,
  semantics: string,
): DesktopOrbIdlFallbackDescriptor {
  return {
    kind,
    target_surface: targetSurface,
    typed_reason: typedReason,
    user_visible: targetSurface !== 'none',
    receipt_required: receiptRequired,
    semantics,
  };
}

function requiredCapabilities(app: VirtualDesktopAppManifestEntry): string[] {
  return [
    `virtual-desktop/app:${app.id}`,
    ...app.capabilities,
    ...app.backend_capabilities.map(capability => capability.capability),
  ];
}

function costHintsForApp(app: VirtualDesktopAppManifestEntry): InterfaceDescriptor['resourceCostHints'] {
  const nonReadCapabilities = app.backend_capabilities.filter(capability => capability.policy_class !== 'read').length;
  return {
    tokensPerCall: 256 + nonReadCapabilities * 128,
    latencyMs: app.service_families.some(service => service.startsWith('ipfs_')) ? 800 : 120,
    bytesPerCall: 4096 + app.capabilities.length * 512,
  };
}

function errorDefinitions(): ErrorDefinition[] {
  return [
    { name: 'POLICY_DENIED', code: 403, description: 'The ORB policy layer denied the request.' },
    { name: 'CONFIRMATION_REQUIRED', code: 428, description: 'The request must use the confirmed desktop policy path.' },
    { name: 'MODALITY_UNSUPPORTED', code: 501, description: 'The requested modality is unsupported and returned a typed fallback.' },
    { name: 'TRANSPORT_UNAVAILABLE', code: 503, description: 'The selected MCP/MCP++ transport is unavailable.' },
  ];
}

function receiptRefSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      receipt_cid: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
      receipt_type: { type: 'string' },
      service: { type: 'string' },
    },
    required: ['receipt_cid', 'receipt_type'],
  };
}

function uniqueFallbacks(
  fallbacks: readonly DesktopOrbIdlFallbackDescriptor[],
): DesktopOrbIdlFallbackDescriptor[] {
  const seen = new Set<string>();
  const unique: DesktopOrbIdlFallbackDescriptor[] = [];
  for (const item of fallbacks) {
    const key = `${item.kind}:${item.target_surface}:${item.typed_reason}:${item.receipt_required}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }
  return unique;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
