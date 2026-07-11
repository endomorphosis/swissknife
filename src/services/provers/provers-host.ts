/**
 * Host-native prover entrypoint.
 *
 * This barrel includes adapters that may probe the filesystem, spawn native
 * solver binaries, or inspect host package managers. Browser builds should use
 * `browser.ts` instead.
 */

export * from './provers-browser.js';
export * from './external-prover-wrappers.js';
export * from './external-provers.js';
export * from './prover-installer.js';
export * from './prover-strategy-runtime.js';
