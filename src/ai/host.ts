export * from './service.js';
export * from './types.js';
export * from './agent/agent.js';
export * from './agent/base-agent.js';
export * from './models/index.js';
export * from './models/model.js';
export * from './models/registry.js';
export * from './models/openai-factory.js';
export * from './models/openai-model.js';
export * from './thinking/graph.js';
export * from './thinking/manager.js';
export * from './tools/executor.js';
export * from './tools/web-search-tool.js';
export { type OldToolParameter } from './tools/tool.js';

export const aiHostRuntime = {
  runtime: 'host',
  browserSafe: false,
  capabilities: [
    'node-sdk',
    'host-config',
    'environment-credentials',
    'task-manager-integration',
    'host-tool-execution',
  ],
} as const;
