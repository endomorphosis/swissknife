/**
 * Meta Glasses Display ORB Adapter (root re-export)
 *
 * This module re-exports the Meta Glasses display ORB adapter implementation
 * from `services/glasses/meta-glasses-display-orb-adapter.ts` at the top
 * level of `services/` so that mobile deployment readiness tooling and the
 * swissknife<->mobile interoperability contracts can resolve a single stable
 * import path regardless of internal reorganizations under `services/glasses/`.
 */
export * from './glasses/meta-glasses-display-orb-adapter.js';
