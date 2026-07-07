/**
 * Browser-safe ZKP entrypoint.
 *
 * This barrel exports ZKP modules that avoid Node filesystem, process, and
 * native binary dependencies. Host-native Groth16/ProveKit/FFI adapters live in
 * `host.ts`.
 */

export * from './browser-snarkjs-backend.js';
export * from './canonicalization.js';
export * from './ethereum-zkp-bridge.js';
export * from './legal-theorem-semantics.js';
export * from './setup-artifacts.js';
export * from './vk-registry.js';
export * from './witness-manager.js';
export * from './zkp-attestation-bridge.js';
export * from './zkp-browser-schnorr.js';
export * from './zkp-circuits.js';
export * from './zkp-eth-integration.js';
export * from './zkp-form-circuit.js';
export * from './zkp-onchain-pipeline.js';
export * from './zkp-provekit-cache.js';
export * from './zkp-provekit-public-inputs.js';
export * from './zkp-simulated-prover.js';
export * from './zkp-statement.js';
export * from './zkp-to-ucan-bridge.js';
export * from './zkp-trace.js';
export * from './zkp-types.js';
export * from './zkp-ucan-bridge.js';
export * from './zkp-verifier.js';
