/**
 * SwissKnife <-> external/meta-wearables-dat-android Display interoperability descriptor.
 *
 * MGW-574 objective validation repair: interface contract swissknife external/meta-wearables-dat-android,
 * goal_packet/interoperability/swissknife/06921590135c,
 * tests/integration/test_swissknife_external_meta_wearables_dat_android_interop.py.
 *
 * This module describes the Meta Wearables DAT Android Display session and
 * registration surface as a canonical MCP-IDL interface that can be
 * registered on SwissKnife's MCP++ runtime. The static source descriptors live
 * under `external/meta-wearables-dat-android/.cursor/rules` and the
 * `samples/DisplayAccess` Android sample.
 */

import {
  MCPPlusPlus,
  MCPPPInterfaceDescriptor,
  createMCPPlusPlusClient,
} from './mcp-plus-plus.js';

export const SWISSKNIFE_META_WEARABLES_DAT_ANDROID_OBJECTIVE_GOALS = [
  'VAIOS-G700',
  'VAIOS-G701',
  'VAIOS-G702',
  'VAIOS-G703',
  'VAIOS-G704',
  'VAIOS-G705',
  'VAIOS-G706',
] as const;

export const SWISSKNIFE_META_WEARABLES_DAT_ANDROID_INTEROP_METADATA = {
  interface_contract: 'interface contract swissknife external/meta-wearables-dat-android',
  goal_packet: 'goal_packet/interoperability/swissknife/06921590135c',
  goal_id: 'VAIOS-G705',
  task_id: 'MGW-574',
  source_surface: 'swissknife',
  target_surface: 'external/meta-wearables-dat-android',
};

export const META_WEARABLES_DAT_ANDROID_DISPLAY_DESCRIPTOR_PATHS = {
  display_access: 'external/meta-wearables-dat-android/.cursor/rules/display-access.mdc',
  session_lifecycle: 'external/meta-wearables-dat-android/.cursor/rules/session-lifecycle.mdc',
  permissions_registration:
    'external/meta-wearables-dat-android/.cursor/rules/permissions-registration.mdc',
  android_manifest:
    'external/meta-wearables-dat-android/samples/DisplayAccess/app/src/main/AndroidManifest.xml',
  display_view_model:
    'external/meta-wearables-dat-android/samples/DisplayAccess/app/src/main/java/com/meta/wearable/dat/externalsampleapps/displayaccess/display/DisplayViewModel.kt',
} as const;

export const META_WEARABLES_DAT_ANDROID_DEVICE_SESSION_STATES = [
  'IDLE',
  'STARTING',
  'STARTED',
  'PAUSED',
  'STOPPING',
  'STOPPED',
] as const;

export const META_WEARABLES_DAT_ANDROID_MANIFEST_METADATA_KEYS = [
  'com.meta.wearable.mwdat.APPLICATION_ID',
  'com.meta.wearable.mwdat.CLIENT_TOKEN',
] as const;

export const META_WEARABLES_DAT_ANDROID_MANIFEST_PERMISSIONS = [
  'android.permission.BLUETOOTH',
  'android.permission.BLUETOOTH_CONNECT',
  'android.permission.INTERNET',
] as const;

export const META_WEARABLES_DAT_ANDROID_DISPLAY_ICON_NAMES = [
  'CHECKMARK',
  'TRIANGLE_LEFT_VERTICAL_LINE',
  'TRIANGLE_RIGHT_VERTICAL_LINE',
  'VIDEO_CAMERA',
] as const;

export const META_WEARABLES_DAT_ANDROID_DISPLAY_BUTTON_STYLES = [
  'PRIMARY',
  'SECONDARY',
] as const;

export const META_WEARABLES_DAT_ANDROID_DISPLAY_INTEROP_OPERATIONS = [
  'meta_wearables_dat_android.registration.start',
  'meta_wearables_dat_android.registration.check_permission_status',
  'meta_wearables_dat_android.session.create',
  'meta_wearables_dat_android.session.start',
  'meta_wearables_dat_android.display.attach',
  'meta_wearables_dat_android.display.send_content',
] as const;

export const SWISSKNIFE_META_WEARABLES_DAT_ANDROID_INTEROP_INTERFACE: MCPPPInterfaceDescriptor = {
  name: 'swissknife-meta-wearables-dat-android-display-interop',
  namespace: 'com.swissknife.interop.meta_wearables_dat_android.display',
  version: '0.1.0',
  interface_cid: 'bafyswissknifemetawearablesdatandroiddisplay001',
  methods: [
    {
      name: 'meta_wearables_dat_android.registration.start',
      input_schema_cid: 'bafy_mwdat_registration_start_in',
      output_schema_cid: 'bafy_mwdat_registration_start_out',
      error_schema_cids: ['bafy_err_permission_denied'],
    },
    {
      name: 'meta_wearables_dat_android.registration.check_permission_status',
      input_schema_cid: 'bafy_mwdat_permission_status_in',
      output_schema_cid: 'bafy_mwdat_permission_status_out',
      error_schema_cids: ['bafy_err_permission_denied'],
    },
    {
      name: 'meta_wearables_dat_android.session.create',
      input_schema_cid: 'bafy_mwdat_session_create_in',
      output_schema_cid: 'bafy_mwdat_session_create_out',
      error_schema_cids: ['bafy_err_session_unavailable'],
    },
    {
      name: 'meta_wearables_dat_android.session.start',
      input_schema_cid: 'bafy_mwdat_session_start_in',
      output_schema_cid: 'bafy_mwdat_session_start_out',
      error_schema_cids: ['bafy_err_session_unavailable'],
    },
    {
      name: 'meta_wearables_dat_android.display.attach',
      input_schema_cid: 'bafy_mwdat_display_attach_in',
      output_schema_cid: 'bafy_mwdat_display_attach_out',
      error_schema_cids: ['bafy_err_display_unavailable'],
    },
    {
      name: 'meta_wearables_dat_android.display.send_content',
      input_schema_cid: 'bafy_mwdat_display_send_content_in',
      output_schema_cid: 'bafy_mwdat_display_send_content_out',
      error_schema_cids: ['bafy_err_policy_mediation_required'],
      interaction_pattern: 'request-response',
    },
  ],
  errors: [
    { name: 'PermissionDenied', code: 403 },
    { name: 'SessionUnavailable', code: 409 },
    { name: 'DisplayUnavailable', code: 409 },
    { name: 'PolicyMediationRequired', code: 409 },
  ],
  requires: ['mcp++/cid-envelope', 'mcp++/ucan', 'mcp++/deontic-policy'],
  compatibility: {
    compatible_with: [],
    supersedes: [],
  },
  semantic_tags: [
    'interop',
    'swissknife',
    'meta_wearables_dat_android',
    'display',
    'registration',
    'control-surface',
    'policy-mediation',
  ],
  observability: { trace: true, metrics: true, events: true },
};

export const SWISSKNIFE_META_WEARABLES_DAT_ANDROID_INTEROP_DESCRIPTOR = {
  descriptor_id: 'swissknife-meta-wearables-dat-android-display-interop@0.1.0',
  interface: SWISSKNIFE_META_WEARABLES_DAT_ANDROID_INTEROP_INTERFACE,
  metadata: SWISSKNIFE_META_WEARABLES_DAT_ANDROID_INTEROP_METADATA,
  objective_goals: SWISSKNIFE_META_WEARABLES_DAT_ANDROID_OBJECTIVE_GOALS,
  schema_refs: {
    control_surface_contract: 'swissknife/contracts/control_surface_contract.schema.json',
    interaction_envelope: 'swissknife/contracts/interaction_envelope.schema.json',
    mediation_receipt: 'swissknife/contracts/mediation_receipt.schema.json',
    policy_decision: 'swissknife/contracts/policy_decision.schema.json',
    display_access: META_WEARABLES_DAT_ANDROID_DISPLAY_DESCRIPTOR_PATHS.display_access,
    session_lifecycle: META_WEARABLES_DAT_ANDROID_DISPLAY_DESCRIPTOR_PATHS.session_lifecycle,
    permissions_registration:
      META_WEARABLES_DAT_ANDROID_DISPLAY_DESCRIPTOR_PATHS.permissions_registration,
    android_manifest: META_WEARABLES_DAT_ANDROID_DISPLAY_DESCRIPTOR_PATHS.android_manifest,
    display_view_model: META_WEARABLES_DAT_ANDROID_DISPLAY_DESCRIPTOR_PATHS.display_view_model,
  },
  runtime_handoff: {
    source_surface: 'swissknife',
    target_surface: 'external/meta-wearables-dat-android',
    allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
    device_session_states: META_WEARABLES_DAT_ANDROID_DEVICE_SESSION_STATES,
    manifest_metadata_keys: META_WEARABLES_DAT_ANDROID_MANIFEST_METADATA_KEYS,
    manifest_permissions: META_WEARABLES_DAT_ANDROID_MANIFEST_PERMISSIONS,
    display_icon_names: META_WEARABLES_DAT_ANDROID_DISPLAY_ICON_NAMES,
    display_button_styles: META_WEARABLES_DAT_ANDROID_DISPLAY_BUTTON_STYLES,
    control_surface_policy_id:
      'policy:swissknife:meta-wearables-dat-android-display-interop',
  },
  validation: {
    task_id: 'MGW-574',
    goal_id: 'VAIOS-G705',
    objective_gap_ref:
      'data/meta_glasses_display_widgets/discovery/2026-07-08-mgw-574-objective-gap-73dd061c433c.md',
    validation_repair_ref:
      'data/meta_glasses_display_widgets/discovery/2026-07-08-mgw-574-objective-validation-repair.md',
    evidence: 'objective validation repair',
  },
};

export function registerSwissKnifeMetaWearablesDATAndroidDisplayInterop(
  client: MCPPlusPlus
): string {
  return client.registerInterface(SWISSKNIFE_META_WEARABLES_DAT_ANDROID_INTEROP_INTERFACE);
}

export function createMCPPlusPlusClientWithSwissKnifeMetaWearablesDATAndroidInterop(
  agentDID: string
): MCPPlusPlus {
  const client = createMCPPlusPlusClient(agentDID);
  registerSwissKnifeMetaWearablesDATAndroidDisplayInterop(client);
  return client;
}

const META_WEARABLES_DAT_ANDROID_POLICY_BUNDLE_REF = {
  policy_id: 'policy:swissknife:meta-wearables-dat-android-display-interop',
  policy_cid: 'local:swissknife:meta-wearables-dat-android-display-interop',
  version: '0.1.0',
  scope: 'swissknife-meta-wearables-dat-android-display-interop',
  source: 'system_default' as const,
};

const META_WEARABLES_DAT_ANDROID_LOGIC_BINDING = {
  binding_id: 'binding:swissknife-meta-wearables-dat-android-display-session',
  policy_bundle_ref: META_WEARABLES_DAT_ANDROID_POLICY_BUNDLE_REF,
  compiled_policy_cid: 'local:swissknife:meta-wearables-dat-android-display-interop',
  ir_version: '0.1.0',
  frame_fact_kinds: ['actor', 'surface', 'event', 'method', 'context'],
  surface_refs: ['agent', 'mcp_server', 'remote_client'],
  method_refs: [
    'meta_wearables_dat_android.session.start',
    'meta_wearables_dat_android.display.send_content',
  ],
  norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
  compiled_artifact_refs: [
    {
      artifact_type: 'deontic_policy' as const,
      cid: 'local:swissknife:meta-wearables-dat-android-display-interop',
      media_type: 'application/json',
      description: 'interface contract swissknife external/meta-wearables-dat-android',
    },
  ],
  interaction_envelope_schema_ref: 'interaction_envelope' as const,
  policy_decision_schema_ref: 'policy_decision' as const,
  mediation_receipt_schema_ref: 'mediation_receipt' as const,
  mediation_required: true,
};

export function buildSwissKnifeMetaWearablesDATAndroidControlSurfaceContract() {
  return {
    control_surface_contract: {
      version: '0.1.0',
      control_surfaces: [
        {
          id: 'swissknife.meta_wearables_dat_android.display-service',
          kind: 'display_service',
          event_types: ['session_start', 'send_content'],
          intent_resolver: 'swissknife.meta_wearables_dat_android.intent_resolver',
          confidence_policy: { min_confidence: 0.85, clarify_below: 0.6 },
          logic_bindings: [META_WEARABLES_DAT_ANDROID_LOGIC_BINDING],
        },
      ],
      intent_bindings: [
        {
          intent: 'swissknife.meta_wearables_dat_android.send_content',
          method: 'meta_wearables_dat_android.display.send_content',
          target_ref: 'meta_wearables_dat_android:display_session',
          allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
          required_context_facts: ['agent_identity', 'device_id'],
          logic_bindings: [META_WEARABLES_DAT_ANDROID_LOGIC_BINDING],
        },
      ],
      policy_hooks: {
        compile_api: 'swissknife://control-surface/compile',
        evaluate_api: 'swissknife://control-surface/evaluate',
        decision_receipt: true,
        compiled_artifact_types: ['deontic_policy', 'explanation'],
      },
      context_schema: {
        state_frames: ['meta_wearables_dat_android_display_session'],
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
      logic_bindings: [META_WEARABLES_DAT_ANDROID_LOGIC_BINDING],
      mediation_receipts: {
        decision_schema_ref: 'policy_decision',
        receipt_schema_ref: 'mediation_receipt',
        emit_for_outcomes: ['allow', 'deny', 'require_confirmation'],
        store: 'audit_log',
      },
    },
  };
}

export function buildSwissKnifeMetaWearablesDATAndroidInteractionEnvelope() {
  return {
    interaction_id: 'interaction:swissknife-meta-wearables-dat-android:send-content:1',
    surface: 'display_service',
    surface_event: 'send_content',
    raw_payload: {
      device_id: 'swissknife-meta-wearables-dat-android-device',
      content: { kind: 'flexBox', gap: 12, padding: 24 },
    },
    normalized_intent: {
      intent: 'swissknife.meta_wearables_dat_android.send_content',
      method: 'meta_wearables_dat_android.display.send_content',
      target_ref: 'meta_wearables_dat_android:display_session',
      arguments: {
        device_id: 'swissknife-meta-wearables-dat-android-device',
        arguments_hash: 'sha256:swissknife-meta-wearables-dat-android-send-content',
      },
      confidence: 0.95,
    },
    actor: {
      type: 'agent' as const,
      id: 'swissknife:meta-wearables-dat-android-operator-agent',
      delegation_chain: ['ucan:swissknife-meta-wearables-dat-android-display-interop'],
    },
    context: {
      local_time: '2026-07-08T00:00:00Z',
      state_frames: ['meta_wearables_dat_android_display_session'],
      device_mode: 'mobile',
      platform: 'meta_wearables_dat_android',
      location_context: {},
      device_context: {
        device_session_states: META_WEARABLES_DAT_ANDROID_DEVICE_SESSION_STATES,
        display_icon_names: META_WEARABLES_DAT_ANDROID_DISPLAY_ICON_NAMES,
        display_button_styles: META_WEARABLES_DAT_ANDROID_DISPLAY_BUTTON_STYLES,
      },
    },
    control_surface_contract_ref: 'swissknife/contracts/control_surface_contract.schema.json',
    policy_bundle_ref: META_WEARABLES_DAT_ANDROID_POLICY_BUNDLE_REF,
    compiled_policy_cid: 'local:swissknife:meta-wearables-dat-android-display-interop',
    logic_bindings: [
      {
        binding_id: META_WEARABLES_DAT_ANDROID_LOGIC_BINDING.binding_id,
        policy_bundle_ref: META_WEARABLES_DAT_ANDROID_POLICY_BUNDLE_REF,
        compiled_policy_cid: 'local:swissknife:meta-wearables-dat-android-display-interop',
        surface_ref: 'display_service',
        method_ref: 'meta_wearables_dat_android.display.send_content',
        norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
      },
    ],
  };
}

