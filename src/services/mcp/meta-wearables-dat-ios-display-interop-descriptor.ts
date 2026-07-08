export const SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_INTERFACE = {
  interface_contract: 'interface contract swissknife external/meta-wearables-dat-ios',
  goal_packet: 'goal_packet/interoperability/swissknife/06921590135c',
  goals: ['VAIOS-G700', 'VAIOS-G701', 'VAIOS-G702', 'VAIOS-G703', 'VAIOS-G704', 'VAIOS-G705', 'VAIOS-G706'],
  task_id: 'VAI-667',
  operations: [
    'meta_wearables_dat_ios.display.attach',
    'meta_wearables_dat_ios.display.send',
    'meta_wearables_dat_ios.display.stop',
    'meta_wearables_dat_ios.registration.check_permission_status',
    'meta_wearables_dat_ios.registration.handle_url',
    'meta_wearables_dat_ios.registration.start',
    'meta_wearables_dat_ios.session.create',
    'meta_wearables_dat_ios.session.start',
  ],
  device_session_states: ['idle', 'paused', 'started', 'starting', 'stopped', 'stopping'],
  info_plist_keys: [
    'AppLinkURLScheme',
    'CFBundleURLTypes',
    'ClientToken',
    'MWDAT',
    'MetaAppID',
    'NSBluetoothAlwaysUsageDescription',
    'NSBonjourServices',
    'NSLocalNetworkUsageDescription',
    'TeamID',
    'UIBackgroundModes',
  ],
  background_modes: ['bluetooth-central', 'bluetooth-peripheral', 'processing'],
  display_icon_names: ['checkmark', 'triangleLeftVerticalLine', 'triangleRightVerticalLine', 'videoCamera'],
  display_button_styles: ['primary', 'secondary'],
  display_view_types: ['Button', 'FlexBox', 'Image', 'Text', 'VideoPlayer'],
  artifacts: [
    'swissknife/contracts/control_surface_contract.schema.json',
    'swissknife/contracts/interaction_envelope.schema.json',
    'swissknife/contracts/mediation_receipt.schema.json',
    'swissknife/contracts/mcp_plus_plus_compatibility_receipt.schema.json',
    'external/meta-wearables-dat-ios/.cursor/rules/display-access.mdc',
    'external/meta-wearables-dat-ios/.cursor/rules/session-lifecycle.mdc',
    'external/meta-wearables-dat-ios/.cursor/rules/permissions-registration.mdc',
    'external/meta-wearables-dat-ios/samples/DisplayAccess/DisplayAccess/Info.plist',
  ],
  mediation_norms: ['agent_identity', 'allowed_surfaces', 'arguments_hash'],
};

export const SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_DESCRIPTOR = SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_INTERFACE;

export function registerSwissKnifeMetaWearablesDATIOSDisplayInterop(registry: { register?: Function }) {
  return registry.register?.(SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_DESCRIPTOR) ?? SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_DESCRIPTOR;
}

export function createMCPPlusPlusClientWithSwissKnifeMetaWearablesDATIOSInterop(client: object) {
  return { ...client, swissknife_meta_wearables_dat_ios: SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_DESCRIPTOR };
}

export function buildSwissKnifeMetaWearablesDATIOSControlSurfaceContract() {
  return { control_surface_contract: SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_DESCRIPTOR };
}

export function buildSwissKnifeMetaWearablesDATIOSInteractionEnvelope() {
  return { interface_contract: SWISSKNIFE_META_WEARABLES_DAT_IOS_INTEROP_INTERFACE.interface_contract };
}
