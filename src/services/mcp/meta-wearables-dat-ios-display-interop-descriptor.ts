/**
 * SwissKnife <-> external/meta-wearables-dat-ios display interop descriptor.
 * VAI-667 objective validation repair for VAIOS-G706.
 */

import { MCPPlusPlus, MCPPPInterfaceDescriptor, createMCPPlusPlusClient } from './mcp-plus-plus.js';

export const SWISSKNIFE_META_WEARABLES_DAT_IOS_OBJECTIVE_GOALS = [
  'VAIOS-G700',
  'VAIOS-G701',
  'VAIOS-G702',
  'VAIOS-G703',
  'VAIOS-G704',
  'VAIOS-G705',
  'VAIOS-G706',
] as const;

export const META_WEARABLES_DAT_IOS_OPERATIONS = [
  'meta_wearables_dat_ios.registration.start',
  'meta_wearables_dat_ios.registration.handle_url',
  'meta_wearables_dat_ios.registration.check_permission_status',
  'meta_wearables_dat_ios.session.create',
  'meta_wearables_dat_ios.session.start',
  'meta_wearables_dat_ios.display.attach',
  'meta_wearables_dat_ios.display.send',
  'meta_wearables_dat_ios.display.stop',
] as const;

export const META_WEARABLES_DAT_IOS_DEVICE_SESSION_STATES = [
  'idle',
  'starting',
  'started',
  'paused',
  'stopping',
  'stopped',
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

export const SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_INTERFACE: MCPPPInterfaceDescriptor = {
  name: 'swissknife-meta-wearables-dat-ios-display-interop',
  namespace: 'com.swissknife.interop.meta_wearables_dat_ios.display',
  version: '0.1.0',
  interface_cid: 'bafyswissknifemetawearablesdatiosdisplay0001',
  methods: META_WEARABLES_DAT_IOS_OPERATIONS.map((name) => ({
    name,
    input_schema_cid: `bafy_${name}_in`,
    output_schema_cid: `bafy_${name}_out`,
    error_schema_cids: [],
  })),
  errors: [{ name: 'DisplayStateError', code: 409 }],
  requires: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
  compatibility: { compatible_with: [], supersedes: [] },
  semantic_tags: ['interop', 'swissknife', 'meta_wearables_dat_ios', 'display'],
  observability: { trace: true, metrics: true, events: true },
};

export const SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_DESCRIPTOR = {
  descriptor_id: 'swissknife-meta-wearables-dat-ios-display-interop@0.1.0',
  interface: SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_INTERFACE,
  metadata: {
    interface_contract: 'interface contract swissknife external/meta-wearables-dat-ios',
    goal_packet: 'goal_packet/interoperability/swissknife/06921590135c',
    goal_id: 'VAIOS-G706',
  },
  objective_goals: SWISSKNIFE_META_WEARABLES_DAT_IOS_OBJECTIVE_GOALS,
  schema_refs: {
    control_surface_contract: 'swissknife/contracts/control_surface_contract.schema.json',
    interaction_envelope: 'swissknife/contracts/interaction_envelope.schema.json',
    mediation_receipt: 'swissknife/contracts/mediation_receipt.schema.json',
    mcp_plus_plus_compatibility_receipt:
      'swissknife/contracts/mcp_plus_plus_compatibility_receipt.schema.json',
    display_access_doc: 'external/meta-wearables-dat-ios/.cursor/rules/display-access.mdc',
    session_lifecycle_doc: 'external/meta-wearables-dat-ios/.cursor/rules/session-lifecycle.mdc',
    permissions_registration_doc:
      'external/meta-wearables-dat-ios/.cursor/rules/permissions-registration.mdc',
    info_plist: 'external/meta-wearables-dat-ios/samples/DisplayAccess/DisplayAccess/Info.plist',
  },
  runtime_handoff: {
    allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
    operations: META_WEARABLES_DAT_IOS_OPERATIONS,
    device_session_states: META_WEARABLES_DAT_IOS_DEVICE_SESSION_STATES,
    display_icon_names: META_WEARABLES_DAT_IOS_DISPLAY_ICON_NAMES,
    display_button_styles: META_WEARABLES_DAT_IOS_DISPLAY_BUTTON_STYLES,
    display_view_types: META_WEARABLES_DAT_IOS_DISPLAY_VIEW_TYPES,
    info_plist_keys: META_WEARABLES_DAT_IOS_INFO_PLIST_KEYS,
    background_modes: META_WEARABLES_DAT_IOS_BACKGROUND_MODES,
    norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
  },
  validation: { task_id: 'VAI-667', goal_id: 'VAIOS-G706', evidence: 'objective validation repair' },
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

export function buildSwissKnifeMetaWearablesDATIOSControlSurfaceContract() {
  return {
    control_surface_contract: {
      version: '0.1.0',
      control_surfaces: [{ id: 'swissknife.meta_wearables_dat_ios.display-service', kind: 'display_service' }],
      intent_bindings: [
        {
          intent: 'swissknife.meta_wearables_dat_ios.send_display_view',
          method: 'meta_wearables_dat_ios.display.send',
          allowed_surfaces: ['agent', 'mcp_server', 'remote_client'],
          required_context_facts: ['agent_identity', 'device_id'],
        },
      ],
      logic_bindings: [{ norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'] }],
    },
  };
}

export function buildSwissKnifeMetaWearablesDATIOSInteractionEnvelope() {
  return {
    interaction_id: 'interaction:swissknife-meta-wearables-dat-ios:send-display-view:1',
    surface: 'display_service',
    normalized_intent: {
      method: 'meta_wearables_dat_ios.display.send',
      arguments: { arguments_hash: 'sha256:swissknife-meta-wearables-dat-ios-send-display-view' },
    },
  };
}
