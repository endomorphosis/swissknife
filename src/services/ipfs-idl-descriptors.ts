/**
 * IPFS Backend IDL Descriptors
 * 
 * Full MCP-IDL InterfaceDescriptor objects for IPFS Kit, Datasets, and Accelerate
 * backends. These are registered in the InterfaceRepository for discovery,
 * compatibility checking, and auto-UI generation via the schema-driven pipeline.
 */

import type { InterfaceDescriptor, MethodSignature } from './mcp-idl.js';

// ---------------------------------------------------------------------------
// IPFS Kit Interface Descriptor
// ---------------------------------------------------------------------------

export const ipfsKitDescriptor: InterfaceDescriptor = {
  name: 'ipfs-kit',
  namespace: 'dev.hallucinate.ipfs',
  version: '1.0.0',
  methods: [
    {
      name: 'add',
      description: 'Add content to IPFS and return a CID',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Content to add (text or base64)' },
          filename: { type: 'string', description: 'Optional filename' },
          pin: { type: 'boolean', description: 'Whether to pin the content', default: true },
        },
        required: ['content'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          cid: { type: 'string', description: 'Content identifier (CIDv1)' },
          size: { type: 'number', description: 'Content size in bytes' },
        },
        required: ['cid'],
      },
    },
    {
      name: 'cat',
      description: 'Retrieve content from IPFS by CID',
      inputSchema: {
        type: 'object',
        properties: {
          cid: { type: 'string', description: 'Content identifier to retrieve' },
        },
        required: ['cid'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Retrieved content' },
          size: { type: 'number' },
        },
      },
    },
    {
      name: 'pin',
      description: 'Pin content to prevent garbage collection',
      inputSchema: {
        type: 'object',
        properties: { cid: { type: 'string' } },
        required: ['cid'],
      },
      outputSchema: {
        type: 'object',
        properties: { pinned: { type: 'boolean' }, cid: { type: 'string' } },
      },
    },
    {
      name: 'unpin',
      description: 'Unpin content allowing garbage collection',
      inputSchema: {
        type: 'object',
        properties: { cid: { type: 'string' } },
        required: ['cid'],
      },
      outputSchema: {
        type: 'object',
        properties: { unpinned: { type: 'boolean' } },
      },
    },
    {
      name: 'list_pins',
      description: 'List all pinned CIDs',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {
        type: 'object',
        properties: { pins: { type: 'array', items: { type: 'string' } } },
      },
    },
    {
      name: 'stat',
      description: 'Get IPFS object statistics',
      inputSchema: {
        type: 'object',
        properties: { cid: { type: 'string' } },
        required: ['cid'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          cid: { type: 'string' },
          size: { type: 'number' },
          cumulative_size: { type: 'number' },
          blocks: { type: 'number' },
          type: { type: 'string' },
        },
      },
    },
    {
      name: 'resolve',
      description: 'Resolve an IPFS path to a CID',
      inputSchema: {
        type: 'object',
        properties: { cid: { type: 'string' } },
        required: ['cid'],
      },
      outputSchema: {
        type: 'object',
        properties: { resolved_cid: { type: 'string' }, path: { type: 'string' } },
      },
    },
    {
      name: 'dag_get',
      description: 'Get a DAG node by CID',
      inputSchema: {
        type: 'object',
        properties: { cid: { type: 'string' }, path: { type: 'string' } },
        required: ['cid'],
      },
      outputSchema: {
        type: 'object',
        properties: { data: { type: 'object' }, links: { type: 'array' } },
      },
    },
    {
      name: 'dag_put',
      description: 'Store a DAG node and return its CID',
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'object', description: 'DAG-CBOR object to store' },
          pin: { type: 'boolean', default: true },
        },
        required: ['data'],
      },
      outputSchema: {
        type: 'object',
        properties: { cid: { type: 'string' } },
      },
    },
    {
      name: 'name_publish',
      description: 'Publish a CID to an IPNS name',
      inputSchema: {
        type: 'object',
        properties: {
          cid: { type: 'string' },
          key: { type: 'string', description: 'IPNS key name', default: 'self' },
          lifetime: { type: 'string', default: '24h' },
        },
        required: ['cid'],
      },
      outputSchema: {
        type: 'object',
        properties: { name: { type: 'string' }, value: { type: 'string' } },
      },
    },
    {
      name: 'name_resolve',
      description: 'Resolve an IPNS name to a CID',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
      outputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
      },
    },
  ],
  errors: [
    { name: 'CID_NOT_FOUND', code: 404, description: 'Content not found on network' },
    { name: 'PIN_FAILED', code: 500, description: 'Pinning operation failed' },
    { name: 'DAG_INVALID', code: 400, description: 'Invalid DAG structure' },
    { name: 'NAME_NOT_FOUND', code: 404, description: 'IPNS name not found' },
  ],
  requires: ['mcp++/cid-artifacts'],
  compatibility: { compatibleWith: [], supersedes: [] },
  semanticTags: ['ipfs', 'storage', 'content-addressed', 'p2p', 'dag', 'ipns'],
  observability: { trace: true, provenance: true },
  interactionPatterns: { requestResponse: true, eventStreams: false },
  resourceCostHints: { tokensPerCall: 50, latencyMs: 200, bytesPerCall: 4096 },
};

// ---------------------------------------------------------------------------
// IPFS Datasets Interface Descriptor
// ---------------------------------------------------------------------------

export const ipfsDatasetsDescriptor: InterfaceDescriptor = {
  name: 'ipfs-datasets',
  namespace: 'dev.hallucinate.ipfs',
  version: '1.0.0',
  methods: [
    {
      name: 'embed',
      description: 'Generate embeddings for text content',
      inputSchema: {
        type: 'object',
        properties: {
          texts: { type: 'array', items: { type: 'string' }, description: 'Texts to embed' },
          model: { type: 'string', description: 'Embedding model name' },
        },
        required: ['texts'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          embeddings: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
          model: { type: 'string' },
          dimensions: { type: 'number' },
        },
      },
    },
    {
      name: 'generate',
      description: 'Generate text using a language model',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          model: { type: 'string' },
          max_tokens: { type: 'number', default: 512 },
          temperature: { type: 'number', default: 0.7 },
        },
        required: ['prompt'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          model: { type: 'string' },
          tokens_used: { type: 'number' },
        },
      },
    },
    {
      name: 'list_datasets',
      description: 'List available datasets',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {
        type: 'object',
        properties: {
          datasets: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, size: { type: 'number' }, format: { type: 'string' } },
            },
          },
        },
      },
    },
    {
      name: 'search_datasets',
      description: 'Search datasets by query',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
      outputSchema: {
        type: 'object',
        properties: { results: { type: 'array' }, total: { type: 'number' } },
      },
    },
    {
      name: 'vector_index',
      description: 'Index content into a vector store',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          metadata: { type: 'object' },
          collection: { type: 'string', default: 'default' },
        },
        required: ['content'],
      },
      outputSchema: {
        type: 'object',
        properties: { id: { type: 'string' }, indexed: { type: 'boolean' } },
      },
    },
    {
      name: 'vector_search',
      description: 'Search a vector store',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          collection: { type: 'string', default: 'default' },
          top_k: { type: 'number', default: 10 },
        },
        required: ['query'],
      },
      outputSchema: {
        type: 'object',
        properties: { results: { type: 'array' } },
      },
    },
    {
      name: 'semantic_search',
      description: 'Semantic search across indexed content',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          top_k: { type: 'number', default: 10 },
          filters: { type: 'object' },
        },
        required: ['query'],
      },
      outputSchema: {
        type: 'object',
        properties: { results: { type: 'array' }, total: { type: 'number' } },
      },
    },
    {
      name: 'similarity_search',
      description: 'Find similar content by threshold',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          threshold: { type: 'number', default: 0.7 },
          max_results: { type: 'number', default: 20 },
        },
        required: ['query'],
      },
      outputSchema: {
        type: 'object',
        properties: { results: { type: 'array' } },
      },
    },
    {
      name: 'faceted_search',
      description: 'Faceted search with category filtering',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          facets: { type: 'array', items: { type: 'string' } },
          filters: { type: 'object' },
        },
        required: ['query'],
      },
      outputSchema: {
        type: 'object',
        properties: { results: { type: 'array' }, facet_counts: { type: 'object' } },
      },
    },
  ],
  errors: [
    { name: 'MODEL_NOT_FOUND', code: 404, description: 'Requested model not available' },
    { name: 'EMBED_FAILED', code: 500, description: 'Embedding generation failed' },
    { name: 'DATASET_NOT_FOUND', code: 404, description: 'Dataset not found' },
    { name: 'INDEX_FAILED', code: 500, description: 'Vector indexing failed' },
  ],
  requires: ['mcp++/cid-artifacts'],
  compatibility: { compatibleWith: [], supersedes: [] },
  semanticTags: ['datasets', 'embeddings', 'vector-search', 'llm', 'semantic'],
  observability: { trace: true, provenance: true },
  interactionPatterns: { requestResponse: true, eventStreams: true },
  resourceCostHints: { tokensPerCall: 200, latencyMs: 500, bytesPerCall: 16384 },
};

// ---------------------------------------------------------------------------
// IPFS Accelerate Interface Descriptor
// ---------------------------------------------------------------------------

export const ipfsAccelerateDescriptor: InterfaceDescriptor = {
  name: 'ipfs-accelerate',
  namespace: 'dev.hallucinate.ipfs',
  version: '1.0.0',
  methods: [
    {
      name: 'capabilities',
      description: 'List hardware acceleration capabilities',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {
        type: 'object',
        properties: {
          backends: { type: 'array', items: { type: 'string' } },
          devices: { type: 'array' },
        },
      },
    },
    {
      name: 'hardware_profile',
      description: 'Get detailed hardware profile',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {
        type: 'object',
        properties: {
          cpu: { type: 'object' },
          gpu: { type: 'array' },
          memory: { type: 'object' },
          accelerators: { type: 'array' },
        },
      },
    },
    {
      name: 'list_models',
      description: 'List available accelerated models',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {
        type: 'object',
        properties: {
          models: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                backend: { type: 'string' },
                loaded: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
    {
      name: 'search_models',
      description: 'Search for models by query',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
      outputSchema: {
        type: 'object',
        properties: { results: { type: 'array' } },
      },
    },
    {
      name: 'inference',
      description: 'Run model inference with hardware acceleration',
      inputSchema: {
        type: 'object',
        properties: {
          model: { type: 'string' },
          input: { type: 'object' },
          backend: { type: 'string', description: 'cuda, openvino, etc.' },
        },
        required: ['model', 'input'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          output: { type: 'object' },
          latency_ms: { type: 'number' },
          backend_used: { type: 'string' },
        },
      },
    },
    {
      name: 'metrics',
      description: 'Get performance metrics',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {
        type: 'object',
        properties: {
          throughput: { type: 'number' },
          latency_p50: { type: 'number' },
          latency_p99: { type: 'number' },
          gpu_utilization: { type: 'number' },
          memory_used: { type: 'number' },
        },
      },
    },
    {
      name: 'endpoints',
      description: 'List inference endpoints',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {
        type: 'object',
        properties: {
          endpoints: {
            type: 'array',
            items: {
              type: 'object',
              properties: { url: { type: 'string' }, model: { type: 'string' }, status: { type: 'string' } },
            },
          },
        },
      },
    },
    {
      name: 'scrape_url',
      description: 'Scrape a URL and extract content',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          extract_text: { type: 'boolean', default: true },
          extract_links: { type: 'boolean', default: false },
        },
        required: ['url'],
      },
      outputSchema: {
        type: 'object',
        properties: { content: { type: 'string' }, metadata: { type: 'object' } },
      },
    },
    {
      name: 'scrape_batch',
      description: 'Scrape multiple URLs in batch',
      inputSchema: {
        type: 'object',
        properties: {
          urls: { type: 'array', items: { type: 'string' } },
          options: { type: 'object' },
        },
        required: ['urls'],
      },
      outputSchema: {
        type: 'object',
        properties: { results: { type: 'array' }, failed: { type: 'array' } },
      },
    },
    {
      name: 'workflow_execute',
      description: 'Execute a workflow step',
      inputSchema: {
        type: 'object',
        properties: {
          workflow_id: { type: 'string' },
          step: { type: 'string' },
          params: { type: 'object' },
        },
        required: ['workflow_id', 'step'],
      },
      outputSchema: {
        type: 'object',
        properties: { result: { type: 'object' }, status: { type: 'string' }, next_step: { type: 'string' } },
      },
    },
  ],
  errors: [
    { name: 'NO_ACCELERATOR', code: 503, description: 'No hardware accelerator available' },
    { name: 'MODEL_LOAD_FAILED', code: 500, description: 'Failed to load model' },
    { name: 'INFERENCE_TIMEOUT', code: 504, description: 'Inference timed out' },
    { name: 'SCRAPE_FAILED', code: 502, description: 'URL scraping failed' },
    { name: 'WORKFLOW_STEP_FAILED', code: 500, description: 'Workflow step execution failed' },
  ],
  requires: ['mcp++/cid-artifacts'],
  compatibility: { compatibleWith: [], supersedes: [] },
  semanticTags: ['accelerate', 'gpu', 'inference', 'hardware', 'scraping', 'workflow'],
  observability: { trace: true, provenance: true },
  interactionPatterns: { requestResponse: true, eventStreams: true },
  resourceCostHints: { tokensPerCall: 100, latencyMs: 1000, bytesPerCall: 65536 },
};

export const ipfsIDLDescriptors = [ipfsKitDescriptor, ipfsDatasetsDescriptor, ipfsAccelerateDescriptor];
export default ipfsIDLDescriptors;
