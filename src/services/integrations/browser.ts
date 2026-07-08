export * from './flogic-ergoai-wrapper.js';
export * from './flogic-proof-cache.js';
export * from './flogic-semantic-normalizer.js';
export * from './flogic-zkp-integration.js';
export {
  SYMBOLIC_AI_AVAILABLE,
  enableSymbolicAI,
  resetSymbolicAI,
  getIntegrationStatus,
  hasCapability,
  DEFAULT_CAPABILITIES as DEFAULT_INTEGRATION_CAPABILITIES,
} from './integration-init.js';
export type {
  IntegrationCapabilities,
  IntegrationStatus,
} from './integration-init.js';
export {
  NeurosymbolicReasoner,
  getReasoner,
  resetReasoner,
  DEFAULT_CAPABILITIES as DEFAULT_NEUROSYMBOLIC_CAPABILITIES,
} from './neurosymbolic-api.js';
export type {
  ReasoningCapabilities,
  NeurosymbolicProofResult,
} from './neurosymbolic-api.js';
export * from './neurosymbolic-graphrag.js';
export * from './shadow-prover.js';
export * from './shadow-prover-wrapper.js';
export * from './spacy-wasm-nlp.js';
