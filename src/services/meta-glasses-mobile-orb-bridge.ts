/**
 * Meta Glasses Mobile ORB Bridge (root re-export)
 *
 * This module re-exports the Meta Glasses mobile ORB bridge implementation
 * from `services/glasses/meta-glasses-mobile-orb-bridge.ts` at the top level
 * of `services/` so that mobile deployment readiness tooling and the
 * swissknife<->mobile interoperability contracts can resolve a single stable
 * import path regardless of internal reorganizations under `services/glasses/`.
 */
export * from './glasses/meta-glasses-mobile-orb-bridge.js';
