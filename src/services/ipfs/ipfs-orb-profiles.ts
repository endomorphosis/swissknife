/**
 * IPFS ORB Capability Registration
 * 
 * Registers all IPFS backend operations (Kit, Datasets, Accelerate) as
 * ORB-discoverable capabilities so they can be invoked through the
 * MCPCapabilityRouter's discover/bind/invoke lifecycle.
 */

import type { MCPUIProfileDescriptor, MCPUIServiceDescriptor } from '../mcp-ui-profile.js';

const HANDSFREE_BASE = 'http://localhost:8080';

/**
 * IPFS Kit operations profile descriptor
 */
export const ipfsKitProfile: MCPUIProfileDescriptor = {
  meta: {
    app_id: 'ipfs-kit',
    name: 'IPFS Kit',
    version: '1.0.0',
    description: 'IPFS storage operations via ipfs_kit_py',
  },
  services: [
    {
      name: 'ipfs-kit-storage',
      interface_type: 'storage',
      transport: { kind: 'http', endpoint: `${HANDSFREE_BASE}/v1/ipfs` },
      operations: [
        'ipfs_add',
        'ipfs_cat',
        'ipfs_pin',
        'ipfs_unpin',
        'ipfs_resolve',
        'ipfs_list_pins',
        'ipfs_stat',
        'ipfs_dag_get',
        'ipfs_dag_put',
        'ipfs_name_publish',
        'ipfs_name_resolve',
      ],
    },
  ] as MCPUIServiceDescriptor[],
  methods: [
    { name: 'ipfs_add', input: { type: 'object', properties: { data: { type: 'string' }, pin: { type: 'boolean' } } }, output: { type: 'object' } },
    { name: 'ipfs_cat', input: { type: 'object', properties: { cid: { type: 'string' } } }, output: { type: 'object' } },
    { name: 'ipfs_pin', input: { type: 'object', properties: { cid: { type: 'string' } } }, output: { type: 'object' } },
    { name: 'ipfs_unpin', input: { type: 'object', properties: { cid: { type: 'string' } } }, output: { type: 'object' } },
    { name: 'ipfs_resolve', input: { type: 'object', properties: { cid: { type: 'string' } } }, output: { type: 'object' } },
    { name: 'ipfs_list_pins', input: { type: 'object', properties: { type: { type: 'string' } } }, output: { type: 'object' } },
    { name: 'ipfs_stat', input: { type: 'object', properties: { cid: { type: 'string' } } }, output: { type: 'object' } },
    { name: 'ipfs_dag_get', input: { type: 'object', properties: { cid: { type: 'string' } } }, output: { type: 'object' } },
    { name: 'ipfs_dag_put', input: { type: 'object', properties: { data: { type: 'object' } } }, output: { type: 'object' } },
    { name: 'ipfs_name_publish', input: { type: 'object', properties: { value: { type: 'string' } } }, output: { type: 'object' } },
    { name: 'ipfs_name_resolve', input: { type: 'object', properties: { name: { type: 'string' } } }, output: { type: 'object' } },
  ],
  data_contracts: {
    operations: [
      { method: 'ipfs_add', path: '/add', http_method: 'POST' },
      { method: 'ipfs_cat', path: '/cat', http_method: 'GET' },
      { method: 'ipfs_pin', path: '/pin', http_method: 'POST' },
      { method: 'ipfs_unpin', path: '/unpin', http_method: 'POST' },
      { method: 'ipfs_resolve', path: '/resolve', http_method: 'GET' },
      { method: 'ipfs_list_pins', path: '/list_pins', http_method: 'GET' },
      { method: 'ipfs_stat', path: '/stat', http_method: 'GET' },
      { method: 'ipfs_dag_get', path: '/dag/get', http_method: 'GET' },
      { method: 'ipfs_dag_put', path: '/dag/put', http_method: 'POST' },
      { method: 'ipfs_name_publish', path: '/name/publish', http_method: 'POST' },
      { method: 'ipfs_name_resolve', path: '/name/resolve', http_method: 'GET' },
    ],
  },
};

/**
 * IPFS Datasets operations profile descriptor
 */
export const ipfsDatasetsProfile: MCPUIProfileDescriptor = {
  meta: {
    app_id: 'ipfs-datasets',
    name: 'IPFS Datasets',
    version: '1.0.0',
    description: 'Dataset management, embeddings, and generation via ipfs_datasets_py',
  },
  services: [
    {
      name: 'ipfs-datasets-compute',
      interface_type: 'compute',
      transport: { kind: 'http', endpoint: `${HANDSFREE_BASE}/v1/ipfs` },
      operations: [
        'datasets_embed',
        'datasets_generate',
        'datasets_list',
        'datasets_search',
      ],
    },
  ] as MCPUIServiceDescriptor[],
  methods: [
    { name: 'datasets_embed', input: { type: 'object', properties: { texts: { type: 'array' }, model_name: { type: 'string' } } }, output: { type: 'object' } },
    { name: 'datasets_generate', input: { type: 'object', properties: { prompt: { type: 'string' }, model_name: { type: 'string' } } }, output: { type: 'object' } },
    { name: 'datasets_list', input: { type: 'object', properties: {} }, output: { type: 'object' } },
    { name: 'datasets_search', input: { type: 'object', properties: { query: { type: 'string' } } }, output: { type: 'object' } },
  ],
  data_contracts: {
    operations: [
      { method: 'datasets_embed', path: '/embed', http_method: 'POST' },
      { method: 'datasets_generate', path: '/generate', http_method: 'POST' },
      { method: 'datasets_list', path: '/list_datasets', http_method: 'GET' },
      { method: 'datasets_search', path: '/search_datasets', http_method: 'GET' },
    ],
  },
};

/**
 * IPFS Accelerate operations profile descriptor
 */
export const ipfsAccelerateProfile: MCPUIProfileDescriptor = {
  meta: {
    app_id: 'ipfs-accelerate',
    name: 'IPFS Accelerate',
    version: '1.0.0',
    description: 'Hardware profiling, model management, and inference via ipfs_accelerate_py',
  },
  services: [
    {
      name: 'ipfs-accelerate-compute',
      interface_type: 'compute',
      transport: { kind: 'http', endpoint: `${HANDSFREE_BASE}/v1/ipfs` },
      operations: [
        'accelerate_capabilities',
        'accelerate_hardware_profile',
        'accelerate_list_models',
        'accelerate_search_models',
        'accelerate_inference',
        'accelerate_metrics',
        'accelerate_endpoints',
      ],
    },
  ] as MCPUIServiceDescriptor[],
  methods: [
    { name: 'accelerate_capabilities', input: { type: 'object', properties: {} }, output: { type: 'object' } },
    { name: 'accelerate_hardware_profile', input: { type: 'object', properties: {} }, output: { type: 'object' } },
    { name: 'accelerate_list_models', input: { type: 'object', properties: {} }, output: { type: 'object' } },
    { name: 'accelerate_search_models', input: { type: 'object', properties: { query: { type: 'string' } } }, output: { type: 'object' } },
    { name: 'accelerate_inference', input: { type: 'object', properties: { model: { type: 'string' }, data: { type: 'string' } } }, output: { type: 'object' } },
    { name: 'accelerate_metrics', input: { type: 'object', properties: {} }, output: { type: 'object' } },
    { name: 'accelerate_endpoints', input: { type: 'object', properties: {} }, output: { type: 'object' } },
  ],
  data_contracts: {
    operations: [
      { method: 'accelerate_capabilities', path: '/capabilities', http_method: 'GET' },
      { method: 'accelerate_hardware_profile', path: '/hardware_profile', http_method: 'GET' },
      { method: 'accelerate_list_models', path: '/list_models', http_method: 'GET' },
      { method: 'accelerate_search_models', path: '/search_models', http_method: 'GET' },
      { method: 'accelerate_inference', path: '/inference', http_method: 'POST' },
      { method: 'accelerate_metrics', path: '/metrics', http_method: 'GET' },
      { method: 'accelerate_endpoints', path: '/endpoints', http_method: 'GET' },
    ],
  },
};

/**
 * Extended tools profile (vector store, search, scraping, workflow)
 */
export const ipfsExtendedToolsProfile: MCPUIProfileDescriptor = {
  meta: {
    app_id: 'ipfs-extended-tools',
    name: 'IPFS Extended Tools',
    version: '1.0.0',
    description: 'Vector store, search, web scraping, and workflow execution',
  },
  services: [
    {
      name: 'vector-store',
      interface_type: 'search',
      transport: { kind: 'http', endpoint: `${HANDSFREE_BASE}/v1/ipfs` },
      operations: ['vector_index', 'vector_search', 'vector_metadata'],
    },
    {
      name: 'semantic-search',
      interface_type: 'search',
      transport: { kind: 'http', endpoint: `${HANDSFREE_BASE}/v1/ipfs` },
      operations: ['semantic_search', 'similarity_search', 'faceted_search'],
    },
    {
      name: 'web-scraping',
      interface_type: 'ingestion',
      transport: { kind: 'http', endpoint: `${HANDSFREE_BASE}/v1/ipfs` },
      operations: ['scrape_url', 'scrape_batch'],
    },
    {
      name: 'workflow-engine',
      interface_type: 'orchestration',
      transport: { kind: 'http', endpoint: `${HANDSFREE_BASE}/v1/ipfs` },
      operations: ['workflow_execute'],
    },
  ],
  methods: [
    { name: 'vector_index', input: { content: 'string', metadata: 'object', collection: 'string' }, output: { id: 'string', indexed: 'boolean' } },
    { name: 'vector_search', input: { query: 'string', collection: 'string', top_k: 'number' }, output: { results: 'array' } },
    { name: 'vector_metadata', input: { collection: 'string' }, output: { count: 'number', dimensions: 'number' } },
    { name: 'semantic_search', input: { query: 'string', top_k: 'number', filters: 'object' }, output: { results: 'array' } },
    { name: 'similarity_search', input: { query: 'string', threshold: 'number', max_results: 'number' }, output: { results: 'array' } },
    { name: 'faceted_search', input: { query: 'string', facets: 'array', filters: 'object' }, output: { results: 'array', facet_counts: 'object' } },
    { name: 'scrape_url', input: { url: 'string', options: 'object' }, output: { content: 'string', metadata: 'object' } },
    { name: 'scrape_batch', input: { urls: 'array', options: 'object' }, output: { results: 'array' } },
    { name: 'workflow_execute', input: { workflow_id: 'string', step: 'string', params: 'object' }, output: { result: 'object', status: 'string' } },
  ],
  data_contracts: {
    operations: [
      { method: 'vector_index', path: '/vector/index', http_method: 'POST' },
      { method: 'vector_search', path: '/vector/search', http_method: 'POST' },
      { method: 'vector_metadata', path: '/vector/metadata', http_method: 'POST' },
      { method: 'semantic_search', path: '/search/semantic', http_method: 'POST' },
      { method: 'similarity_search', path: '/search/similarity', http_method: 'POST' },
      { method: 'faceted_search', path: '/search/faceted', http_method: 'POST' },
      { method: 'scrape_url', path: '/scrape/url', http_method: 'POST' },
      { method: 'scrape_batch', path: '/scrape/batch', http_method: 'POST' },
      { method: 'workflow_execute', path: '/workflow/execute', http_method: 'POST' },
    ],
  },
};

/**
 * All IPFS backend profile descriptors for bulk registration
 */
export const ipfsORBProfiles: MCPUIProfileDescriptor[] = [
  ipfsKitProfile,
  ipfsDatasetsProfile,
  ipfsAccelerateProfile,
  ipfsExtendedToolsProfile,
];

export default ipfsORBProfiles;
