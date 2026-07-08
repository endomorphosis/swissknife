/**
 * SwissKnife <-> external/meta-wearables-dat-ios display interoperability.
 *
 * VAI-667 objective validation repair: interface contract swissknife
 * external/meta-wearables-dat-ios,
 * goal_packet/interoperability/swissknife/06921590135c,
 * tests/integration/test_swissknife_external_meta_wearables_dat_ios_interop.py.
 */

import {
  MCPPlusPlus,
  MCPPPInterfaceDescriptor,
  createMCPPlusPlusClient,
} from './mcp-plus-plus.js';

export const SWISSKNIFE_META_WEARABLES_DAT_IOS_OBJECTIVE_GOALS = [
  'VAIOS-G700',
  'VAIOS-G701',
  'VAIOS-G702',
  'VAIOS-G703',
  'VAIOS-G704',
  'VAIOS-G705',
  'VAIOS-G706',
] as const;

export const SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_METADATA = {
  interface_contract: 'interface contract swissknife external/meta-wearables-dat-ios',
  goal_packet: 'goal_packet/interoperability/swissknife/06921590135c',
  goal_id: 'VAIOS-G706',
  source_surface: 'swissknife',
  target_surface: 'external/meta-wearables-dat-ios',
};

export const META_WEARABLES_DAT_IOS_DISPLAY_DESCRIPTOR_PATHS = {
  display_access_doc: 'external/meta-wearables-dat-ios/.cursor/rules/display-access.mdc',
  session_lifecycle_doc: 'external/meta-wearables-dat-ios/.cursor/rules/session-lifecycle.mdc',
  permissions_registration_doc:
    'external/meta-wearables-dat-ios/.cursor/rules/permissions-registration.mdc',
  display_info_plist:
    'external/meta-wearables-dat-ios/samples/DisplayAccess/DisplayAccess/Info.plist',
} as const;

export const META_WEARABLES_DAT_IOS_DEVICE_SESSION_STATES = [
  'idle',
  'starting',
  'started',
  'paused',
  'stopping',
  'stopped',
] as const;

export const META_WEARABLES_DAT_IOS_INFO_PLIST_KEYS = [
  'CFBundleURLTypes',
  'MWDAT',
  'AppLinkURLScheme',
  'MetaAppID',
  'ClientToken',
  'TeamID',
  'UIBackgroundModes',
  'NSBluetoothAlwaysUsageDescription',
  'NSLocalNetworkUsageDescription',
  'NSBonjourServices',
] as const;

export const META_WEARABLES_DAT_IOS_BACKGROUND_MODES = [
  'processing',
  'bluetooth-central',
  'bluetooth-peripheral',
] as const;

export const META_WEARABLES_DAT_IOS_DISPLAY_ICON_NAMES = [
  'checkmark',
  'triangleLeftVerticalLine',
  'triangleRightVerticalLine',
  'videoCamera',
] as const;

export const META_WEARABLES_DAT_IOS_DISPLAY_BUTTON_STYLES = ['primary', 'secondary'] as const;

export const META_WEARABLES_DAT_IOS_DISPLAY_VIEW_TYPES = [
  'FlexBox',
  'Text',
  'Button',
  'Image',
  'VideoPlayer',
] as const;

export const META_WEARABLES_DAT_IOS_DISPLAY_INTEROP_OPERATIONS = [
  'meta_wearables_dat_ios.registration.start',
  'meta_wearables_dat_ios.registration.handle_url',
  'meta_wearables_dat_ios.registration.check_permission_status',
  'meta_wearables_dat_ios.session.create',
  'meta_wearables_dat_ios.session.start',
  'meta_wearables_dat_ios.display.attach',
  'meta_wearables_dat_ios.display.send',
  'meta_wearables_dat_ios.display.stop',
] as const;

export const SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_INTERFACE: MCPPPInterfaceDescriptor = {
  name: 'swissknife-meta-wearables-dat-ios-display-interop',
  namespace: 'com.swissknife.interop.meta_wearables_dat_ios.display',
  version: '0.1.0',
  interface_cid: 'bafyswissknifemetawearablesdatiosdisplay0001',
  methods: META_WEARABLES_DAT_IOS_DISPLAY_INTEROP_OPERATIONS.map((operation) => ({
    name: operation,
    input_schema_cid: `bafy_${operation.replaceAll('.', '_')}_in`,
    output_schema_cid: `bafy_${operation.replaceAll('.', '_')}_out`,
    error_schema_cids: ['bafy_meta_wearables_dat_ios_interop_error'],
  })),
  errors: [
    { name: 'PermissionDenied', code: 403 },
    { name: 'DeviceUnavailable', code: 404 },
    { name: 'SessionStateError', code: 409 },
    { name: 'DisplayUnavailable', code: 404 },
  ],
  requires: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
  compatibility: { compatible_with: [], supersedes: [] },
  semantic_tags: [
    'interop',
    'swissknife',
    'meta_wearables_dat_ios',
    'display',
    'control-surface',
    'policy-mediation',
  ],
  observability: { trace: true, metrics: true, events: true },
};

export const SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_DESCRIPTOR = {
  descriptor_id: 'swissknife-meta-wearables-dat-ios-display-interop@0.1.0',
  interface: SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_INTERFACE,
  metadata: SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_METADATA,
  objective_goals: SWISSKNIFE_META_WEARABLES_DAT_IOS_OBJECTIVE_GOALS,
  schema_refs: {
    control_surface_contract: 'swissknife/contracts/control_surface_contract.schema.json',
    interaction_envelope: 'swissknife/contracts/interaction_envelope.schema.json',
    mediation_receipt: 'swissknife/contracts/mediation_receipt.schema.json',
    policy_decision: 'swissknife/contracts/policy_decision.schema.json',
    mcp_plus_plus_compatibility_receipt:
      'swissknife/contracts/mcp_plus_plus_compatibility_receipt.schema.json',
    ...META_WEARABLES_DAT_IOS_DISPLAY_DESCRIPTOR_PATHS,
  },
  runtime_handoff: {
    source_surface: 'swissknife',
    target_surface: 'external/meta-wearables-dat-ios',
    allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
    device_session_states: META_WEARABLES_DAT_IOS_DEVICE_SESSION_STATES,
    info_plist_keys: META_WEARABLES_DAT_IOS_INFO_PLIST_KEYS,
    background_modes: META_WEARABLES_DAT_IOS_BACKGROUND_MODES,
    display_icon_names: META_WEARABLES_DAT_IOS_DISPLAY_ICON_NAMES,
    display_button_styles: META_WEARABLES_DAT_IOS_DISPLAY_BUTTON_STYLES,
    display_view_types: META_WEARABLES_DAT_IOS_DISPLAY_VIEW_TYPES,
    operations: META_WEARABLES_DAT_IOS_DISPLAY_INTEROP_OPERATIONS,
    control_surface_policy_id: 'policy:swissknife:meta-wearables-dat-ios-display-interop',
  },
  validation: {
    task_id: 'VAI-667',
    goal_id: 'VAIOS-G706',
    evidence: 'objective validation repair',
  },
};

export function registerSwissKnifeMetaWearablesDATIOSDisplayInterop(
  client: MCPPlusPlus
): string {
  return client.registerInterface(SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_INTERFACE);
}

export function createMCPPlusPlusClientWithSwissKnifeMetaWearablesDATIOSInterop(
  agentDID: string
): MCPPlusPlus {
  const client = createMCPPlusPlusClient(agentDID);
  registerSwissKnifeMetaWearablesDATIOSDisplayInterop(client);
  return client;
}

const META_WEARABLES_DAT_IOS_POLICY_BUNDLE_REF = {
  policy_id: 'policy:swissknife:meta-wearables-dat-ios-display-interop',
  policy_cid: 'local:swissknife:meta-wearables-dat-ios-display-interop',
  version: '0.1.0',
  scope: 'swissknife-meta-wearables-dat-ios-display-interop',
  source: 'system_default' as const,
};

const META_WEARABLES_DAT_IOS_LOGIC_BINDING = {
  binding_id: 'binding:swissknife-meta-wearables-dat-ios-display-session',
  policy_bundle_ref: META_WEARABLES_DAT_IOS_POLICY_BUNDLE_REF,
  compiled_policy_cid: 'local:swissknife:meta-wearables-dat-ios-display-interop',
  ir_version: '0.1.0',
  frame_fact_kinds: ['actor', 'surface', 'event', 'method', 'context'],
  surface_refs: ['agent', 'mcp_server', 'remote_client'],
  method_refs: [
    'meta_wearables_dat_ios.session.start',
    'meta_wearables_dat_ios.display.send',
  ],
  norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
  compiled_artifact_refs: [
    {
      artifact_type: 'deontic_policy' as const,
      cid: 'local:swissknife:meta-wearables-dat-ios-display-interop',
      media_type: 'application/json',
      description: 'interface contract swissknife external/meta-wearables-dat-ios',
    },
  ],
  interaction_envelope_schema_ref: 'interaction_envelope' as const,
  policy_decision_schema_ref: 'policy_decision' as const,
  mediation_receipt_schema_ref: 'mediation_receipt' as const,
  mediation_required: true,
};

export function buildSwissKnifeMetaWearablesDATIOSControlSurfaceContract() {
  return {
    control_surface_contract: {
      version: '0.1.0',
      control_surfaces: [
        {
          id: 'swissknife.meta_wearables_dat_ios.display-service',
          kind: 'display_service',
          event_types: ['registration_callback', 'session_start', 'send_display_view'],
          intent_resolver: 'swissknife.meta_wearables_dat_ios.intent_resolver',
          confidence_policy: { min_confidence: 0.85, clarify_below: 0.6 },
          logic_bindings: [META_WEARABLES_DAT_IOS_LOGIC_BINDING],
        },
      ],
      intent_bindings: [
        {
          intent: 'swissknife.meta_wearables_dat_ios.send_display_view',
          method: 'meta_wearables_dat_ios.display.send',
          target_ref: 'meta_wearables_dat_ios:display_session',
          allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
          required_context_facts: ['agent_identity', 'device_id', 'ios_bundle_id'],
          logic_bindings: [META_WEARABLES_DAT_IOS_LOGIC_BINDING],
        },
      ],
      policy_hooks: {
        compile_api: 'swissknife://control-surface/compile',
        evaluate_api: 'swissknife://control-surface/evaluate',
        decision_receipt: true,
        compiled_artifact_types: ['deontic_policy', 'explanation'],
      },
      context_schema: {
        state_frames: ['meta_wearables_dat_ios_display_session'],
        time_context: true,
        location_context: false,
        device_context: true,
        agent_identity: true,
      },
      conflict_resolution: {
        default: 'require_confirmation',
        requires_explanation: true,
        requires_user_confirmation_for: ['session_stop', 'display_detach'],
      },
      logic_bindings: [META_WEARABLES_DAT_IOS_LOGIC_BINDING],
      mediation_receipts: {
        decision_schema_ref: 'policy_decision',
        receipt_schema_ref: 'mediation_receipt',
        emit_for_outcomes: ['allow', 'deny', 'require_confirmation'],
        store: 'audit_log',
      },
    },
  };
}

export function buildSwissKnifeMetaWearablesDATIOSInteractionEnvelope() {
  return {
    interaction_id: 'interaction:swissknife-meta-wearables-dat-ios:send-display-view:1',
    surface: 'display_service',
    surface_event: 'send_display_view',
    raw_payload: {
      device_id: 'swissknife-meta-wearables-dat-ios-device',
      display_view: { root: 'FlexBox', button_style: 'primary', icon_name: 'checkmark' },
    },
    normalized_intent: {
      intent: 'swissknife.meta_wearables_dat_ios.send_display_view',
      method: 'meta_wearables_dat_ios.display.send',
      target_ref: 'meta_wearables_dat_ios:display_session',
      arguments: {
        device_id: 'swissknife-meta-wearables-dat-ios-device',
        ios_bundle_id: 'com.swissknife.displayaccess',
        arguments_hash: 'sha256:swissknife-meta-wearables-dat-ios-send-display-view',
      },
      confidence: 0.95,
    },
    actor: {
      type: 'agent',
      id: 'swissknife:meta-wearables-dat-ios-operator-agent',
      delegation_chain: ['ucan:swissknife-meta-wearables-dat-ios-display-interop'],
    },
    context: {
      local_time: '2026-07-08T00:00:00Z',
      state_frames: ['meta_wearables_dat_ios_display_session'],
      device_mode: 'mobile',
      platform: 'meta_wearables_dat_ios',
      location_context: {},
      device_context: {
        device_session_states: META_WEARABLES_DAT_IOS_DEVICE_SESSION_STATES,
        info_plist_keys: META_WEARABLES_DAT_IOS_INFO_PLIST_KEYS,
        background_modes: META_WEARABLES_DAT_IOS_BACKGROUND_MODES,
        display_icon_names: META_WEARABLES_DAT_IOS_DISPLAY_ICON_NAMES,
        display_button_styles: META_WEARABLES_DAT_IOS_DISPLAY_BUTTON_STYLES,
        display_view_types: META_WEARABLES_DAT_IOS_DISPLAY_VIEW_TYPES,
      },
    },
    control_surface_contract_ref: 'swissknife/contracts/control_surface_contract.schema.json',
    policy_bundle_ref: META_WEARABLES_DAT_IOS_POLICY_BUNDLE_REF,
    compiled_policy_cid: 'local:swissknife:meta-wearables-dat-ios-display-interop',
    logic_bindings: [
      {
        binding_id: 'binding:swissknife-meta-wearables-dat-ios-display-session',
        policy_bundle_ref: META_WEARABLES_DAT_IOS_POLICY_BUNDLE_REF,
        compiled_policy_cid: 'local:swissknife:meta-wearables-dat-ios-display-interop',
        surface_ref: 'display_service',
        method_ref: 'meta_wearables_dat_ios.display.send',
        norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
      },
    ],
  };
}
