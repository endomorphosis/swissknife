/**
 * IPFS Interface Registry (root re-export)
 *
 * This module re-exports the IPFS interface registry implementation from
 * `services/ipfs/ipfs-interface-registry.ts` at the top level of `services/`
 * so that mobile deployment readiness tooling and the swissknife<->mobile
 * interoperability contracts can resolve a single stable import path
 * regardless of internal reorganizations under `services/ipfs/`.
 */
export * from './ipfs/ipfs-interface-registry.js';
export { default } from './ipfs/ipfs-interface-registry.js';
