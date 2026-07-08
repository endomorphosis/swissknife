import { MCPPlusPlus, createMCPPlusPlusClient } from './mcp-plus-plus.js';

export const SWISSKNIFE_META_WEARABLES_DAT_IOS_OBJECTIVE_GOALS = [
  'VAIOS-G700', 'VAIOS-G701', 'VAIOS-G702', 'VAIOS-G703',
  'VAIOS-G704', 'VAIOS-G705', 'VAIOS-G706',
] as const;

export const SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_INTERFACE = {
  name: 'swissknife-meta-wearables-dat-ios-display-interop',
  namespace: 'com.swissknife.interop.meta_wearables_dat_ios.display',
  version: '0.1.0',
  interface_cid: 'bafyswissknifemetawearablesdatiosdisplay0001',
  methods: [
    { name: 'meta_wearables_dat_ios.registration.start', input_schema_cid: 'bafy_ios_reg_start_in', output_schema_cid: 'bafy_ios_reg_start_out', error_schema_cids: [] },
    { name: 'meta_wearables_dat_ios.registration.handle_url', input_schema_cid: 'bafy_ios_reg_url_in', output_schema_cid: 'bafy_ios_reg_url_out', error_schema_cids: [] },
    { name: 'meta_wearables_dat_ios.registration.check_permission_status', input_schema_cid: 'bafy_ios_perm_in', output_schema_cid: 'bafy_ios_perm_out', error_schema_cids: [] },
    { name: 'meta_wearables_dat_ios.session.create', input_schema_cid: 'bafy_ios_session_create_in', output_schema_cid: 'bafy_ios_session_create_out', error_schema_cids: [] },
    { name: 'meta_wearables_dat_ios.session.start', input_schema_cid: 'bafy_ios_session_start_in', output_schema_cid: 'bafy_ios_session_start_out', error_schema_cids: [] },
    { name: 'meta_wearables_dat_ios.display.attach', input_schema_cid: 'bafy_ios_display_attach_in', output_schema_cid: 'bafy_ios_display_attach_out', error_schema_cids: [] },
    { name: 'meta_wearables_dat_ios.display.send', input_schema_cid: 'bafy_ios_display_send_in', output_schema_cid: 'bafy_ios_display_send_out', error_schema_cids: [] },
    { name: 'meta_wearables_dat_ios.display.stop', input_schema_cid: 'bafy_ios_display_stop_in', output_schema_cid: 'bafy_ios_display_stop_out', error_schema_cids: [] },
  ],
  errors: [],
  requires: ['mcp++/mcp-idl', 'mcp++/cid-envelope', 'mcp++/deontic-policy'],
  compatibility: { compatible_with: [], supersedes: [] },
  semantic_tags: ['interop', 'swissknife', 'meta_wearables_dat_ios', 'display'],
  observability: { trace: true, metrics: true, events: true },
};

export const SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_DESCRIPTOR = {
  interface_contract: 'interface contract swissknife external/meta-wearables-dat-ios',
  goal_packet: 'goal_packet/interoperability/swissknife/06921590135c',
  task_id: 'VAI-667',
  goal_id: 'VAIOS-G706',
  objective_goals: SWISSKNIFE_META_WEARABLES_DAT_IOS_OBJECTIVE_GOALS,
  device_session_states: ['idle', 'starting', 'started', 'paused', 'stopping', 'stopped'],
  display_icon_names: ['checkmark', 'triangleLeftVerticalLine', 'triangleRightVerticalLine', 'videoCamera'],
  display_button_styles: ['primary', 'secondary'],
  display_view_types: ['FlexBox', 'Text', 'Button', 'Image', 'VideoPlayer'],
  plist_keys: [
    'CFBundleURLTypes', 'MWDAT', 'AppLinkURLScheme', 'MetaAppID', 'ClientToken',
    'TeamID', 'UIBackgroundModes', 'NSBluetoothAlwaysUsageDescription',
    'NSLocalNetworkUsageDescription', 'NSBonjourServices',
  ],
  background_modes: ['processing', 'bluetooth-central', 'bluetooth-peripheral'],
  schema_refs: [
    'swissknife/contracts/control_surface_contract.schema.json',
    'swissknife/contracts/interaction_envelope.schema.json',
    'swissknife/contracts/mediation_receipt.schema.json',
    'swissknife/contracts/mcp_plus_plus_compatibility_receipt.schema.json',
    'external/meta-wearables-dat-ios/.cursor/rules/display-access.mdc',
    'external/meta-wearables-dat-ios/.cursor/rules/session-lifecycle.mdc',
    'external/meta-wearables-dat-ios/.cursor/rules/permissions-registration.mdc',
    'external/meta-wearables-dat-ios/samples/DisplayAccess/DisplayAccess/Info.plist',
  ],
  norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
};

export function registerSwissKnifeMetaWearablesDATIOSDisplayInterop(client: MCPPlusPlus): string {
  return client.registerInterface(SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_INTERFACE);
}

export function createMCPPlusPlusClientWithSwissKnifeMetaWearablesDATIOSInterop(agentDID: string): MCPPlusPlus {
  const client = createMCPPlusPlusClient(agentDID);
  registerSwissKnifeMetaWearablesDATIOSDisplayInterop(client);
  return client;
}

export function buildSwissKnifeMetaWearablesDATIOSControlSurfaceContract() {
  return { interface_contract: 'interface contract swissknife external/meta-wearables-dat-ios' };
}

export function buildSwissKnifeMetaWearablesDATIOSInteractionEnvelope() {
  return { norm_refs: ['agent_identity', 'allowed_surfaces', 'arguments_hash'] };
}
