export * from './registry.js';
export * from './providers.js';
export * from './init.js';
export * from './execution.js';
export {
  ModelExecutionService as EventedModelExecutionService,
  type ModelExecutionOptions as EventedModelExecutionOptions,
  type ModelExecutionResult as EventedModelExecutionResult,
  type ModelExecutionStats,
} from './execution/service.js';

export const modelHostRuntime = {
  runtime: 'host',
  browserSafe: false,
  capabilities: [
    'node-sdk',
    'bedrock-host-credentials',
    'vertex-host-credentials',
    'local-model-files',
    'subprocess-inference',
    'native-loader',
    'host-bridge-execution',
  ],
} as const;
