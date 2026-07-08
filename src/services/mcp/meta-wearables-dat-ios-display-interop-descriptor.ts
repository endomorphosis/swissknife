/**
 * SwissKnife <-> external/meta-wearables-dat-ios display interoperability descriptor.
 *
 * VAI-667 objective validation repair: interface contract swissknife
 * external/meta-wearables-dat-ios,
 * goal_packet/interoperability/swissknife/06921590135c,
 * tests/integration/test_swissknife_external_meta_wearables_dat_ios_interop.py.
 *
 * `external/meta-wearables-dat-ios` ships the DAT iOS Display capability
 * docs and the DisplayAccess sample app. This module describes that surface
 * as a canonical MCP-IDL Profile A descriptor that SwissKnife can register
 * on the same MCP++ runtime registry as the pre-built IPFS descriptors and
 * the sibling `meta-wearables-dat-android-display-interop-descriptor.ts`
 * module, and it provides representative policy-mediated control-surface,
 * interaction-envelope, and compatibility-receipt payloads for validation.
 *
 * It closes the VAIOS-G706 objective gap for the shared
 * `goal_packet/interoperability/swissknife/06921590135c` packet, which also
 * covers VAIOS-G700, VAIOS-G701, VAIOS-G702, VAIOS-G703, VAIOS-G704, and
 * VAIOS-G705.
 */

import {
  MCPPlusPlus,
  MCPPPInterfaceDescriptor,
  IPFS_KIT_INTERFACE,
  IPFS_ACCELERATE_INTERFACE,
  IPFS_DATASETS_INTERFACE,
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
  display_info_plist: 'external/meta-wearables-dat-ios/samples/DisplayAccess/DisplayAccess/Info.plist',
  display_view_model:
    'external/meta-wearables-dat-ios/samples/DisplayAccess/DisplayAccess/ViewModels/DisplayViewModel.swift',
  car_maintenance_display:
    'external/meta-wearables-dat-ios/samples/DisplayAccess/DisplayAccess/Samples/CarMaintenanceDisplay.swift',
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
  methods: [
    {
      name: 'meta_wearables_dat_ios.registration.start',
      input_schema_cid: 'bafy_mwdat_ios_registration_start_in',
      output_schema_cid: 'bafy_mwdat_ios_registration_start_out',
      error_schema_cids: ['bafy_mwdat_ios_err_permission_denied'],
    },
    {
      name: 'meta_wearables_dat_ios.registration.handle_url',
      input_schema_cid: 'bafy_mwdat_ios_handle_url_in',
      output_schema_cid: 'bafy_mwdat_ios_handle_url_out',
      error_schema_cids: ['bafy_mwdat_ios_err_invalid_url'],
    },
    {
      name: 'meta_wearables_dat_ios.registration.check_permission_status',
      input_schema_cid: 'bafy_mwdat_ios_permission_status_in',
      output_schema_cid: 'bafy_mwdat_ios_permission_status_out',
      error_schema_cids: [],
    },
    {
      name: 'meta_wearables_dat_ios.session.create',
      input_schema_cid: 'bafy_mwdat_ios_session_create_in',
      output_schema_cid: 'bafy_mwdat_ios_session_create_out',
      error_schema_cids: ['bafy_mwdat_ios_err_device_unavailable'],
    },
    {
      name: 'meta_wearables_dat_ios.session.start',
      input_schema_cid: 'bafy_mwdat_ios_session_start_in',
      output_schema_cid: 'bafy_mwdat_ios_session_start_out',
      error_schema_cids: ['bafy_mwdat_ios_err_session_state'],
    },
    {
      name: 'meta_wearables_dat_ios.display.attach',
      input_schema_cid: 'bafy_mwdat_ios_display_attach_in',
      output_schema_cid: 'bafy_mwdat_ios_display_attach_out',
      error_schema_cids: ['bafy_mwdat_ios_err_display_unavailable'],
    },
    {
      name: 'meta_wearables_dat_ios.display.send',
      input_schema_cid: 'bafy_mwdat_ios_display_send_in',
      output_schema_cid: 'bafy_mwdat_ios_display_send_out',
      error_schema_cids: ['bafy_mwdat_ios_err_display_state'],
      interaction_pattern: 'request-response',
    },
    {
      name: 'meta_wearables_dat_ios.display.stop',
      input_schema_cid: 'bafy_mwdat_ios_display_stop_in',
      output_schema_cid: 'bafy_mwdat_ios_display_stop_out',
      error_schema_cids: ['bafy_mwdat_ios_err_display_state'],
    },
  ],
  errors: [
    { name: 'PermissionDenied', code: 403 },
    { name: 'InvalidURL', code: 400 },
    { name: 'DeviceUnavailable', code: 404 },
    { name: 'SessionStateError', code: 409 },
    { name: 'DisplayUnavailable', code: 404 },
    { name: 'DisplayStateError', code: 409 },
  ],
  requires: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
  compatibility: {
    compatible_with: [
      IPFS_KIT_INTERFACE.interface_cid,
      IPFS_ACCELERATE_INTERFACE.interface_cid,
      IPFS_DATASETS_INTERFACE.interface_cid,
    ],
    supersedes: [],
  },
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
    control_surface_policy_id: 'policy:swissknife:meta-wearables-dat-ios-display-interop',
  },
  validation: {
    task_id: 'VAI-667',
    goal_id: 'VAIOS-G706',
    objective_gap_ref: 'data/virtual_ai_os/discovery/2026-07-08-vai-667-objective-gap-d6bdae3a60cc.md',
    validation_repair_ref:
      'data/virtual_ai_os/discovery/2026-07-08-vai-667-objective-validation-repair.md',
    evidence: 'objective validation repair',
  },
};

export function registerSwissKnifeMetaWearablesDATIOSDisplayInterop(client: MCPPlusPlus): string {
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
  method_refs: ['meta_wearables_dat_ios.session.start', 'meta_wearables_dat_ios.display.send'],
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
      type: 'agent' as const,
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

export function buildSwissKnifeMetaWearablesDATIOSMCPPlusPlusCompatibilityReceipt() {
  return {
    receipt_schema: 'mcp_plus_plus_compatibility_receipt_v1',
    task_id: 'VAI-667',
    session_id: 'session:swissknife-meta-wearables-dat-ios-display',
    correlation_id: 'corr:swissknife-meta-wearables-dat-ios-display',
    daemon_id: 'meta-wearables-dat-ios',
    server_package: 'meta_wearables_dat_ios',
    swissknife_consumer: 'swissknife.meta_wearables_dat_ios.display-service',
    protocol_negotiation: {
      method: 'initialize',
      protocol_version: '2026-07-08',
      client_profiles: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
      server_profiles: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
      negotiated_profiles: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
      initialized: true,
    },
    capability_descriptor: {
      descriptor_id: 'swissknife-meta-wearables-dat-ios-display-interop@0.1.0',
      interface_cid: SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_INTERFACE.interface_cid,
      name: SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_INTERFACE.name,
      namespace: SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_INTERFACE.namespace,
      version: SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_INTERFACE.version,
      methods: [...META_WEARABLES_DAT_IOS_DISPLAY_INTEROP_OPERATIONS],
      requires: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
      compatibility_checked: true,
      compatibility_verdict: 'compatible' as const,
      event_streams: true,
    },
    transport: {
      kind: 'local' as const,
      endpoint: 'swissknife://meta-wearables-dat-ios/display',
      protocol_path: 'swissknife/mcp++/meta-wearables-dat-ios/display',
      auth_present: true,
      redaction_profile: 'display-session-minimal',
    },
    tool_call: {
      tool_name: 'meta_wearables_dat_ios.display.send',
      tool_category: 'display',
      upstream_function: 'Display.send',
      jsonrpc_method: 'tools/call',
      arguments_hash: 'sha256:swissknife-meta-wearables-dat-ios-send-display-view',
      dispatch_allowed: true,
      upstream_status: 'ok' as const,
    },
    policy_contract: {
      interaction_envelope_id: 'interaction:swissknife-meta-wearables-dat-ios:send-display-view:1',
      policy_decision_id: 'decision:swissknife-meta-wearables-dat-ios:allow:1',
      policy_outcome: 'allow' as const,
      mediation_receipt_id: 'receipt:swissknife-meta-wearables-dat-ios:allow:1',
      control_surface_contract_ref: 'swissknife/contracts/control_surface_contract.schema.json',
    },
    receipt_lineage: {
      envelope_cid: 'local:swissknife-meta-wearables-dat-ios-envelope',
      decision_cid: 'local:swissknife-meta-wearables-dat-ios-decision',
      receipt_cid: 'local:swissknife-meta-wearables-dat-ios-receipt',
      tool_receipt_id: 'tool-receipt:meta-wearables-dat-ios-display-send',
    },
    lifecycle_events: [
      { event: 'initialize' as const, at: '2026-07-08T00:00:00Z' },
      { event: 'initialized' as const, at: '2026-07-08T00:00:01Z' },
      { event: 'descriptor_refresh' as const, at: '2026-07-08T00:00:02Z' },
      { event: 'policy_decision' as const, at: '2026-07-08T00:00:03Z' },
      {
        event: 'receipt_emitted' as const,
        at: '2026-07-08T00:00:04Z',
        receipt_cid: 'local:swissknife-meta-wearables-dat-ios-receipt',
      },
    ],
    validated_at: '2026-07-08T00:00:05Z',
  };
}
