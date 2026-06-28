/**
 * IPFS Full MCPUIProfileDescriptor Specifications
 * 
 * Complete profile descriptors conforming to the full MCPUIProfileDescriptor spec,
 * enabling auto-UI generation via mcp-schema-ui-generator.ts and ORB discovery.
 * These extend the IDL descriptors with UI templates, state models, permissions,
 * workflow graphs, and data contracts for the schema-driven UI pipeline.
 */

import type {
  MCPUIProfileDescriptor,
  MCPUIServiceDescriptor,
  MCPUIProfileUI,
  MCPUIDataContracts,
  MCPUIPermissions,
  MCPUIStateModel,
  MCPUIWorkflowGraph,
} from './mcp-ui-profile.js';

const HANDSFREE_BASE = 'http://localhost:8080';

// ---------------------------------------------------------------------------
// IPFS Kit - Full UI Profile (explorer template)
// ---------------------------------------------------------------------------

export const ipfsKitUIProfile: MCPUIProfileDescriptor = {
  // InterfaceDescriptor fields
  name: 'ipfs-kit',
  namespace: 'dev.hallucinate.ipfs',
  version: '1.0.0',
  methods: [
    { name: 'add', inputSchema: { type: 'object', properties: { content: { type: 'string' }, filename: { type: 'string' }, pin: { type: 'boolean' } }, required: ['content'] }, outputSchema: { type: 'object', properties: { cid: { type: 'string' }, size: { type: 'number' } } } },
    { name: 'cat', inputSchema: { type: 'object', properties: { cid: { type: 'string' } }, required: ['cid'] }, outputSchema: { type: 'object', properties: { content: { type: 'string' }, size: { type: 'number' } } } },
    { name: 'pin', inputSchema: { type: 'object', properties: { cid: { type: 'string' } }, required: ['cid'] }, outputSchema: { type: 'object', properties: { pinned: { type: 'boolean' } } } },
    { name: 'unpin', inputSchema: { type: 'object', properties: { cid: { type: 'string' } }, required: ['cid'] }, outputSchema: { type: 'object', properties: { unpinned: { type: 'boolean' } } } },
    { name: 'list_pins', inputSchema: { type: 'object', properties: {} }, outputSchema: { type: 'object', properties: { pins: { type: 'array', items: { type: 'string' } } } } },
    { name: 'stat', inputSchema: { type: 'object', properties: { cid: { type: 'string' } }, required: ['cid'] }, outputSchema: { type: 'object', properties: { cid: { type: 'string' }, size: { type: 'number' }, blocks: { type: 'number' } } } },
    { name: 'resolve', inputSchema: { type: 'object', properties: { cid: { type: 'string' } }, required: ['cid'] }, outputSchema: { type: 'object', properties: { resolved_cid: { type: 'string' } } } },
    { name: 'dag_get', inputSchema: { type: 'object', properties: { cid: { type: 'string' }, path: { type: 'string' } }, required: ['cid'] }, outputSchema: { type: 'object', properties: { data: { type: 'object' }, links: { type: 'array' } } } },
    { name: 'dag_put', inputSchema: { type: 'object', properties: { data: { type: 'object' }, pin: { type: 'boolean' } }, required: ['data'] }, outputSchema: { type: 'object', properties: { cid: { type: 'string' } } } },
    { name: 'name_publish', inputSchema: { type: 'object', properties: { cid: { type: 'string' }, key: { type: 'string' } }, required: ['cid'] }, outputSchema: { type: 'object', properties: { name: { type: 'string' }, value: { type: 'string' } } } },
    { name: 'name_resolve', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }, outputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
  ],
  errors: [
    { name: 'CID_NOT_FOUND', code: 404 },
    { name: 'PIN_FAILED', code: 500 },
    { name: 'DAG_INVALID', code: 400 },
  ],
  requires: ['mcp++/cid-artifacts'],
  compatibility: { compatibleWith: [], supersedes: [] },
  semanticTags: ['ipfs', 'storage', 'content-addressed', 'p2p'],
  observability: { trace: true, provenance: true },
  interactionPatterns: { requestResponse: true, eventStreams: false },

  // MCPUIProfileDescriptor extensions
  meta: {
    app_id: 'ipfs-kit',
    name: 'IPFS Kit',
    version: '1.0.0',
    description: 'Content-addressed storage with IPFS - add, retrieve, pin, DAG, and IPNS operations',
  },
  services: [
    {
      name: 'ipfs-kit-storage',
      interface_type: 'storage',
      transport: { kind: 'http', endpoint: `${HANDSFREE_BASE}/v1/ipfs` },
      operations: ['add', 'cat', 'pin', 'unpin', 'list_pins', 'stat', 'resolve', 'dag_get', 'dag_put', 'name_publish', 'name_resolve'],
    },
  ] as MCPUIServiceDescriptor[],
  ui: {
    primary_template: 'explorer',
    templates: [
      {
        kind: 'explorer',
        title: 'IPFS Content Explorer',
        operations: ['list_pins', 'cat', 'stat', 'dag_get'],
        regions: [
          { id: 'pin-list', kind: 'table', operation: 'list_pins' },
          { id: 'content-viewer', kind: 'form', operation: 'cat' },
          { id: 'stat-detail', kind: 'status', operation: 'stat' },
          { id: 'dag-viewer', kind: 'graph', operation: 'dag_get' },
        ],
      },
      {
        kind: 'form-wizard',
        title: 'Add Content',
        operations: ['add', 'pin', 'dag_put', 'name_publish'],
        regions: [
          { id: 'add-form', kind: 'form', operation: 'add' },
          { id: 'publish-form', kind: 'form', operation: 'name_publish' },
        ],
      },
    ],
    sections: [
      { id: 'browse', title: 'Browse Pins', kind: 'table', operation: 'list_pins' },
      { id: 'add', title: 'Add Content', kind: 'form', operation: 'add' },
      { id: 'dag', title: 'DAG Explorer', kind: 'graph', operation: 'dag_get' },
      { id: 'names', title: 'IPNS Names', kind: 'table', operation: 'name_resolve' },
    ],
  },
  data_contracts: {
    operations: [
      { method: 'add', path: '/add', http_method: 'POST' },
      { method: 'cat', path: '/cat', http_method: 'GET' },
      { method: 'pin', path: '/pin', http_method: 'POST' },
      { method: 'unpin', path: '/unpin', http_method: 'POST' },
      { method: 'list_pins', path: '/list_pins', http_method: 'GET' },
      { method: 'stat', path: '/stat', http_method: 'GET' },
      { method: 'resolve', path: '/resolve', http_method: 'GET' },
      { method: 'dag_get', path: '/dag/get', http_method: 'GET' },
      { method: 'dag_put', path: '/dag/put', http_method: 'POST' },
      { method: 'name_publish', path: '/name/publish', http_method: 'POST' },
      { method: 'name_resolve', path: '/name/resolve', http_method: 'GET' },
    ],
  },
  permissions: {
    default_deny: false,
    operations: {
      add: ['ipfs:write'],
      cat: ['ipfs:read'],
      pin: ['ipfs:write'],
      unpin: ['ipfs:write'],
      list_pins: ['ipfs:read'],
      stat: ['ipfs:read'],
      resolve: ['ipfs:read'],
      dag_get: ['ipfs:read'],
      dag_put: ['ipfs:write'],
      name_publish: ['ipfs:write', 'ipns:publish'],
      name_resolve: ['ipfs:read'],
    },
  },
  state_model: {
    keys: ['selected_cid', 'pin_list', 'dag_path', 'ipns_names'],
    events: ['content_added', 'content_pinned', 'content_unpinned', 'name_published'],
    projections: ['pin_count', 'total_size'],
    replay: true,
  },
  workflow_graph: {
    id: 'ipfs-publish-workflow',
    title: 'Content Publish Workflow',
    description: 'Add content, pin it, and publish to IPNS',
    shared_state_keys: ['current_cid', 'pin_status', 'ipns_name'],
    steps: [
      { id: 'add-content', title: 'Add Content', operation: 'add', write_state_keys: ['current_cid'] },
      { id: 'pin-content', title: 'Pin Content', operation: 'pin', depends_on: ['add-content'], read_state_keys: ['current_cid'] },
      { id: 'publish-name', title: 'Publish IPNS', operation: 'name_publish', depends_on: ['pin-content'], read_state_keys: ['current_cid'], write_state_keys: ['ipns_name'] },
    ],
  },
};

// ---------------------------------------------------------------------------
// IPFS Datasets - Full UI Profile (dashboard template)
// ---------------------------------------------------------------------------

export const ipfsDatasetsUIProfile: MCPUIProfileDescriptor = {
  name: 'ipfs-datasets',
  namespace: 'dev.hallucinate.ipfs',
  version: '1.0.0',
  methods: [
    { name: 'embed', inputSchema: { type: 'object', properties: { texts: { type: 'array', items: { type: 'string' } }, model: { type: 'string' } }, required: ['texts'] }, outputSchema: { type: 'object', properties: { embeddings: { type: 'array' }, dimensions: { type: 'number' } } } },
    { name: 'generate', inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, model: { type: 'string' }, max_tokens: { type: 'number' }, temperature: { type: 'number' } }, required: ['prompt'] }, outputSchema: { type: 'object', properties: { text: { type: 'string' }, tokens_used: { type: 'number' } } } },
    { name: 'list_datasets', inputSchema: { type: 'object', properties: {} }, outputSchema: { type: 'object', properties: { datasets: { type: 'array' } } } },
    { name: 'search_datasets', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, outputSchema: { type: 'object', properties: { results: { type: 'array' } } } },
    { name: 'vector_index', inputSchema: { type: 'object', properties: { content: { type: 'string' }, metadata: { type: 'object' }, collection: { type: 'string' } }, required: ['content'] }, outputSchema: { type: 'object', properties: { id: { type: 'string' }, indexed: { type: 'boolean' } } } },
    { name: 'vector_search', inputSchema: { type: 'object', properties: { query: { type: 'string' }, collection: { type: 'string' }, top_k: { type: 'number' } }, required: ['query'] }, outputSchema: { type: 'object', properties: { results: { type: 'array' } } } },
    { name: 'semantic_search', inputSchema: { type: 'object', properties: { query: { type: 'string' }, top_k: { type: 'number' }, filters: { type: 'object' } }, required: ['query'] }, outputSchema: { type: 'object', properties: { results: { type: 'array' } } } },
    { name: 'similarity_search', inputSchema: { type: 'object', properties: { query: { type: 'string' }, threshold: { type: 'number' } }, required: ['query'] }, outputSchema: { type: 'object', properties: { results: { type: 'array' } } } },
    { name: 'faceted_search', inputSchema: { type: 'object', properties: { query: { type: 'string' }, facets: { type: 'array' }, filters: { type: 'object' } }, required: ['query'] }, outputSchema: { type: 'object', properties: { results: { type: 'array' }, facet_counts: { type: 'object' } } } },
  ],
  errors: [
    { name: 'MODEL_NOT_FOUND', code: 404 },
    { name: 'EMBED_FAILED', code: 500 },
    { name: 'INDEX_FAILED', code: 500 },
  ],
  requires: ['mcp++/cid-artifacts'],
  compatibility: { compatibleWith: [], supersedes: [] },
  semanticTags: ['datasets', 'embeddings', 'vector-search', 'llm'],
  observability: { trace: true, provenance: true },
  interactionPatterns: { requestResponse: true, eventStreams: true },

  meta: {
    app_id: 'ipfs-datasets',
    name: 'IPFS Datasets',
    version: '1.0.0',
    description: 'Dataset management, embedding generation, vector search, and semantic retrieval',
  },
  services: [
    {
      name: 'ipfs-datasets-engine',
      interface_type: 'dataset',
      transport: { kind: 'http', endpoint: `${HANDSFREE_BASE}/v1/ipfs` },
      operations: ['embed', 'generate', 'list_datasets', 'search_datasets', 'vector_index', 'vector_search', 'semantic_search', 'similarity_search', 'faceted_search'],
    },
  ] as MCPUIServiceDescriptor[],
  ui: {
    primary_template: 'dashboard',
    templates: [
      {
        kind: 'dashboard',
        title: 'Datasets Dashboard',
        operations: ['list_datasets', 'search_datasets', 'vector_search', 'semantic_search'],
        regions: [
          { id: 'dataset-list', kind: 'table', operation: 'list_datasets' },
          { id: 'search-panel', kind: 'form', operation: 'search_datasets' },
          { id: 'vector-status', kind: 'status', operation: 'vector_search' },
        ],
      },
      {
        kind: 'form-wizard',
        title: 'Embed & Index',
        operations: ['embed', 'vector_index', 'generate'],
        regions: [
          { id: 'embed-form', kind: 'form', operation: 'embed' },
          { id: 'index-form', kind: 'form', operation: 'vector_index' },
          { id: 'generate-form', kind: 'form', operation: 'generate' },
        ],
      },
    ],
    sections: [
      { id: 'datasets', title: 'Available Datasets', kind: 'table', operation: 'list_datasets' },
      { id: 'search', title: 'Search', kind: 'form', operation: 'semantic_search' },
      { id: 'embed', title: 'Generate Embeddings', kind: 'form', operation: 'embed' },
      { id: 'generate', title: 'Text Generation', kind: 'form', operation: 'generate' },
    ],
  },
  data_contracts: {
    operations: [
      { method: 'embed', path: '/embed', http_method: 'POST' },
      { method: 'generate', path: '/generate', http_method: 'POST' },
      { method: 'list_datasets', path: '/list_datasets', http_method: 'GET' },
      { method: 'search_datasets', path: '/search_datasets', http_method: 'GET' },
      { method: 'vector_index', path: '/vector/index', http_method: 'POST' },
      { method: 'vector_search', path: '/vector/search', http_method: 'POST' },
      { method: 'semantic_search', path: '/search/semantic', http_method: 'POST' },
      { method: 'similarity_search', path: '/search/similarity', http_method: 'POST' },
      { method: 'faceted_search', path: '/search/faceted', http_method: 'POST' },
    ],
  },
  permissions: {
    default_deny: false,
    operations: {
      embed: ['datasets:compute'],
      generate: ['datasets:compute'],
      list_datasets: ['datasets:read'],
      search_datasets: ['datasets:read'],
      vector_index: ['datasets:write'],
      vector_search: ['datasets:read'],
      semantic_search: ['datasets:read'],
      similarity_search: ['datasets:read'],
      faceted_search: ['datasets:read'],
    },
  },
  state_model: {
    keys: ['active_collection', 'search_results', 'embedding_queue', 'generation_history'],
    events: ['content_indexed', 'search_completed', 'embedding_generated', 'text_generated'],
    projections: ['index_count', 'search_latency'],
    replay: true,
  },
};

// ---------------------------------------------------------------------------
// IPFS Accelerate - Full UI Profile (job-console template)
// ---------------------------------------------------------------------------

export const ipfsAccelerateUIProfile: MCPUIProfileDescriptor = {
  name: 'ipfs-accelerate',
  namespace: 'dev.hallucinate.ipfs',
  version: '1.0.0',
  methods: [
    { name: 'capabilities', inputSchema: { type: 'object', properties: {} }, outputSchema: { type: 'object', properties: { backends: { type: 'array' }, devices: { type: 'array' } } } },
    { name: 'hardware_profile', inputSchema: { type: 'object', properties: {} }, outputSchema: { type: 'object', properties: { cpu: { type: 'object' }, gpu: { type: 'array' }, memory: { type: 'object' } } } },
    { name: 'list_models', inputSchema: { type: 'object', properties: {} }, outputSchema: { type: 'object', properties: { models: { type: 'array' } } } },
    { name: 'search_models', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, outputSchema: { type: 'object', properties: { results: { type: 'array' } } } },
    { name: 'inference', inputSchema: { type: 'object', properties: { model: { type: 'string' }, input: { type: 'object' }, backend: { type: 'string' } }, required: ['model', 'input'] }, outputSchema: { type: 'object', properties: { output: { type: 'object' }, latency_ms: { type: 'number' }, backend_used: { type: 'string' } } } },
    { name: 'metrics', inputSchema: { type: 'object', properties: {} }, outputSchema: { type: 'object', properties: { throughput: { type: 'number' }, latency_p50: { type: 'number' }, gpu_utilization: { type: 'number' } } } },
    { name: 'endpoints', inputSchema: { type: 'object', properties: {} }, outputSchema: { type: 'object', properties: { endpoints: { type: 'array' } } } },
    { name: 'scrape_url', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }, outputSchema: { type: 'object', properties: { content: { type: 'string' }, metadata: { type: 'object' } } } },
    { name: 'scrape_batch', inputSchema: { type: 'object', properties: { urls: { type: 'array', items: { type: 'string' } } }, required: ['urls'] }, outputSchema: { type: 'object', properties: { results: { type: 'array' } } } },
    { name: 'workflow_execute', inputSchema: { type: 'object', properties: { workflow_id: { type: 'string' }, step: { type: 'string' }, params: { type: 'object' } }, required: ['workflow_id', 'step'] }, outputSchema: { type: 'object', properties: { result: { type: 'object' }, status: { type: 'string' } } } },
  ],
  errors: [
    { name: 'NO_ACCELERATOR', code: 503 },
    { name: 'MODEL_LOAD_FAILED', code: 500 },
    { name: 'INFERENCE_TIMEOUT', code: 504 },
  ],
  requires: ['mcp++/cid-artifacts'],
  compatibility: { compatibleWith: [], supersedes: [] },
  semanticTags: ['accelerate', 'gpu', 'inference', 'hardware', 'workflow'],
  observability: { trace: true, provenance: true },
  interactionPatterns: { requestResponse: true, eventStreams: true },

  meta: {
    app_id: 'ipfs-accelerate',
    name: 'IPFS Accelerate',
    version: '1.0.0',
    description: 'Hardware-accelerated inference, model management, web scraping, and workflow orchestration',
  },
  services: [
    {
      name: 'ipfs-accelerate-engine',
      interface_type: 'compute',
      transport: { kind: 'http', endpoint: `${HANDSFREE_BASE}/v1/ipfs` },
      operations: ['capabilities', 'hardware_profile', 'list_models', 'search_models', 'inference', 'metrics', 'endpoints', 'scrape_url', 'scrape_batch', 'workflow_execute'],
    },
  ] as MCPUIServiceDescriptor[],
  ui: {
    primary_template: 'job-console',
    templates: [
      {
        kind: 'job-console',
        title: 'Inference Console',
        operations: ['inference', 'metrics', 'list_models'],
        regions: [
          { id: 'model-list', kind: 'table', operation: 'list_models' },
          { id: 'inference-form', kind: 'form', operation: 'inference' },
          { id: 'metrics-view', kind: 'status', operation: 'metrics' },
          { id: 'job-timeline', kind: 'timeline', operation: 'inference' },
        ],
      },
      {
        kind: 'dashboard',
        title: 'Hardware Dashboard',
        operations: ['capabilities', 'hardware_profile', 'metrics', 'endpoints'],
        regions: [
          { id: 'hw-profile', kind: 'status', operation: 'hardware_profile' },
          { id: 'metrics-panel', kind: 'status', operation: 'metrics' },
          { id: 'endpoint-list', kind: 'table', operation: 'endpoints' },
        ],
      },
    ],
    sections: [
      { id: 'hw', title: 'Hardware', kind: 'status', operation: 'hardware_profile' },
      { id: 'models', title: 'Models', kind: 'table', operation: 'list_models' },
      { id: 'inference', title: 'Run Inference', kind: 'form', operation: 'inference' },
      { id: 'metrics', title: 'Metrics', kind: 'status', operation: 'metrics' },
      { id: 'workflow', title: 'Workflows', kind: 'timeline', operation: 'workflow_execute' },
    ],
  },
  data_contracts: {
    operations: [
      { method: 'capabilities', path: '/capabilities', http_method: 'GET' },
      { method: 'hardware_profile', path: '/hardware_profile', http_method: 'GET' },
      { method: 'list_models', path: '/list_models', http_method: 'GET' },
      { method: 'search_models', path: '/search_models', http_method: 'GET' },
      { method: 'inference', path: '/inference', http_method: 'POST' },
      { method: 'metrics', path: '/metrics', http_method: 'GET' },
      { method: 'endpoints', path: '/endpoints', http_method: 'GET' },
      { method: 'scrape_url', path: '/scrape/url', http_method: 'POST' },
      { method: 'scrape_batch', path: '/scrape/batch', http_method: 'POST' },
      { method: 'workflow_execute', path: '/workflow/execute', http_method: 'POST' },
    ],
  },
  permissions: {
    default_deny: false,
    operations: {
      capabilities: ['accelerate:read'],
      hardware_profile: ['accelerate:read'],
      list_models: ['accelerate:read'],
      search_models: ['accelerate:read'],
      inference: ['accelerate:compute'],
      metrics: ['accelerate:read'],
      endpoints: ['accelerate:read'],
      scrape_url: ['accelerate:scrape'],
      scrape_batch: ['accelerate:scrape'],
      workflow_execute: ['accelerate:workflow'],
    },
  },
  state_model: {
    keys: ['active_model', 'inference_queue', 'hw_capabilities', 'workflow_state'],
    events: ['inference_started', 'inference_completed', 'model_loaded', 'workflow_step_completed'],
    projections: ['gpu_utilization', 'inference_count', 'avg_latency'],
    replay: false,
  },
  workflow_graph: {
    id: 'accelerate-inference-pipeline',
    title: 'Inference Pipeline',
    description: 'Load model, run inference, collect metrics',
    shared_state_keys: ['active_model', 'inference_result', 'metrics_snapshot'],
    steps: [
      { id: 'check-hw', title: 'Check Hardware', operation: 'hardware_profile', write_state_keys: ['hw_capabilities'] },
      { id: 'load-model', title: 'Load Model', operation: 'list_models', depends_on: ['check-hw'], write_state_keys: ['active_model'] },
      { id: 'run-inference', title: 'Run Inference', operation: 'inference', depends_on: ['load-model'], read_state_keys: ['active_model'], write_state_keys: ['inference_result'] },
      { id: 'collect-metrics', title: 'Collect Metrics', operation: 'metrics', depends_on: ['run-inference'], write_state_keys: ['metrics_snapshot'] },
    ],
  },
};

export const ipfsFullUIProfiles: MCPUIProfileDescriptor[] = [
  ipfsKitUIProfile,
  ipfsDatasetsUIProfile,
  ipfsAccelerateUIProfile,
];

export default ipfsFullUIProfiles;
