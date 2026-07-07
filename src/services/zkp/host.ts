/**
 * Host-native ZKP entrypoint.
 *
 * This barrel includes adapters that may use Node crypto, filesystem artifact
 * manifests, native Groth16/ProveKit processes, or external toolchains.
 * Browser builds should use `browser.ts` instead.
 */

export * from './browser.js';
export * from './zkp-canonicalization-runtime.js';
export * from './groth16-cec-expansion.js';
export * from './zkp-backends.js';
export * from './zkp-provekit-artifacts.js';
export * from './zkp-provekit-setup-artifacts.js';
