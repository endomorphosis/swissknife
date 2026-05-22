import {
    APP_CAPABILITY_CONTRACT_VERSION,
    CompatibilityPolicy
} from '../descriptors/contracts/app-capability-contract.js';

const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateSemver(version) {
    return typeof version === 'string' && SEMVER_REGEX.test(version);
}

function major(version) {
    return parseInt(version.split('.')[0], 10);
}

export function validateCompatibility(sourceVersion, targetVersion) {
    if (!validateSemver(sourceVersion) || !validateSemver(targetVersion)) {
        return {
            valid: false,
            reason: 'Invalid semver version'
        };
    }

    if (major(sourceVersion) !== major(targetVersion)) {
        return {
            valid: false,
            reason: 'Major version mismatch'
        };
    }

    return { valid: true };
}

export function validateDescriptor(descriptor) {
    const errors = [];

    if (!isObject(descriptor)) {
        return { valid: false, errors: ['Descriptor must be an object'] };
    }

    if (!isObject(descriptor.meta)) {
        errors.push('meta is required');
    } else {
        if (!descriptor.meta.id) errors.push('meta.id is required');
        if (!descriptor.meta.name) errors.push('meta.name is required');
        if (!validateSemver(descriptor.meta.version)) errors.push('meta.version must be semver');
    }

    if (!Array.isArray(descriptor.lifecycle) || descriptor.lifecycle.length === 0) {
        errors.push('lifecycle is required');
    }

    if (!isObject(descriptor.ui)) {
        errors.push('ui is required');
    } else {
        if (!descriptor.ui.template) errors.push('ui.template is required');
        if (!isObject(descriptor.ui.window)) errors.push('ui.window is required');
        if (!Array.isArray(descriptor.ui.regions)) errors.push('ui.regions must be an array');
    }

    if (!Array.isArray(descriptor.services)) {
        errors.push('services must be an array');
    }

    if (!isObject(descriptor.dataContracts)) {
        errors.push('dataContracts is required');
    }

    if (!isObject(descriptor.compatibilityPolicy)) {
        errors.push('compatibilityPolicy is required');
    }

    if (descriptor.contractVersion && descriptor.contractVersion !== APP_CAPABILITY_CONTRACT_VERSION) {
        errors.push(`Unsupported contractVersion: ${descriptor.contractVersion}`);
    }

    return { valid: errors.length === 0, errors };
}

export function defaultCompatibilityPolicy() {
    return { ...CompatibilityPolicy };
}
