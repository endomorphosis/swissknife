/**
 * Meta Glasses Widget Compiler (root re-export)
 *
 * This module re-exports the Meta Glasses widget compiler implementation
 * from `services/glasses/meta-glasses-widget-compiler.ts` at the top level
 * of `services/` so that mobile deployment readiness tooling and the
 * swissknife<->mobile interoperability contracts can resolve a single stable
 * import path regardless of internal reorganizations under `services/glasses/`.
 */
export * from './glasses/meta-glasses-widget-compiler.js';
