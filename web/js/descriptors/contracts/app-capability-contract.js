export const APP_CAPABILITY_CONTRACT_VERSION = '1.0.0';

export const AppCapabilityLifecycle = Object.freeze([
    'discover',
    'bind',
    'authorize',
    'invoke',
    'stream_updates',
    'recover'
]);

export const ServiceContractSchema = Object.freeze({
    required: ['name', 'version', 'operations'],
    optional: ['events', 'streams', 'errors', 'endpoint', 'auth']
});

export const UIContractSchema = Object.freeze({
    required: ['template', 'window', 'regions'],
    optional: ['commands', 'menus', 'permissions', 'themeTokens', 'i18n']
});

export const DataContractSchema = Object.freeze({
    required: ['entities'],
    optional: ['result', 'task', 'provenance'],
    conventions: {
        fieldNaming: 'snake_case'
    }
});

export const CompatibilityPolicy = Object.freeze({
    semver: true,
    allowMinorAdditiveOnly: true,
    enforceDeprecationWindow: true,
    breakOnIncompatibleChanges: true
});
