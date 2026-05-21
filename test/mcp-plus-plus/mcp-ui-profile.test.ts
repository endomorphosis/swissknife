import { InterfaceRepository } from '../../src/services/mcp-idl';
import {
  LocalMCPInterfaceRegistryBackend,
  MCPInterfaceDiscoveryRegistry,
} from '../../src/services/mcp-interface-registry';
import {
  SWISSKNIFE_MCP_UI_PROFILE,
  SWISSKNIFE_MCP_UI_PROFILE_VERSION,
  selectTemplateForDescriptor,
  validateMCPUIProfileDescriptor,
  type MCPUIProfileDescriptor,
} from '../../src/services/mcp-ui-profile';

function datasetDescriptor(overrides: Partial<MCPUIProfileDescriptor> = {}): MCPUIProfileDescriptor {
  const descriptor: MCPUIProfileDescriptor = {
    name: 'ipfs-dataset-workbench',
    namespace: 'org.endomorphosis.ipfs_datasets_py',
    version: '1.0.0',
    methods: [
      {
        name: 'browse',
        input_schema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
        output_schema: {
          type: 'object',
          properties: { entries: { type: 'array' } },
          required: ['entries'],
        },
      },
      {
        name: 'pin',
        input_schema: {
          type: 'object',
          properties: { cid: { type: 'string' } },
          required: ['cid'],
        },
        output_schema: {
          type: 'object',
          properties: { job_id: { type: 'string' } },
          required: ['job_id'],
        },
      },
    ],
    errors: [{ name: 'NotFound' }, { name: 'Unauthorized' }],
    requires: [],
    compatibility: {
      compatible_with: [],
      supersedes: [],
    },
    semanticTags: ['ipfs', 'dataset'],
    observability: { trace: true, provenance: true },
    interaction_patterns: { request_response: true, event_streams: true },
    meta: {
      profile: SWISSKNIFE_MCP_UI_PROFILE,
      profile_version: SWISSKNIFE_MCP_UI_PROFILE_VERSION,
      app_id: 'ipfs-dataset-workbench',
      title: 'IPFS Dataset Workbench',
      publisher: 'endomorphosis',
    },
    services: [
      {
        id: 'datasets',
        interface_type: 'dataset',
        transport: 'mcp-server',
        operations: ['browse', 'pin'],
      },
    ],
    ui: {
      primary_template: 'explorer',
      templates: [
        {
          kind: 'explorer',
          operations: ['browse', 'pin'],
          regions: [
            { id: 'browser', kind: 'table', operation: 'browse' },
            { id: 'pin-status', kind: 'timeline', operation: 'pin' },
          ],
        },
      ],
    },
    data_contracts: {
      operations: [
        {
          method: 'browse',
          input_schema: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
          output_schema: {
            type: 'object',
            properties: { entries: { type: 'array' } },
            required: ['entries'],
          },
        },
        {
          method: 'pin',
          input_schema: {
            type: 'object',
            properties: { cid: { type: 'string' } },
            required: ['cid'],
          },
          output_schema: {
            type: 'object',
            properties: { job_id: { type: 'string' } },
            required: ['job_id'],
          },
          stream: {
            kind: 'progress',
            correlation_id_field: 'job_id',
            event_schema: {
              type: 'object',
              properties: {
                job_id: { type: 'string' },
                progress: { type: 'number' },
              },
              required: ['job_id', 'progress'],
            },
          },
        },
      ],
    },
    permissions: {
      default_deny: true,
      operations: {
        browse: ['dataset/read'],
        pin: ['dataset/pin'],
      },
    },
    state_model: {
      keys: ['current_path', 'selected_cid', 'pin_jobs'],
      events: ['dataset.pin.progress'],
      replay: true,
    },
  };

  return {
    ...descriptor,
    ...overrides,
  };
}

describe('SwissKnife MCP++ UI Profile conformance', () => {
  it('accepts a descriptor with required MCP-IDL and generated UI sections', () => {
    const result = validateMCPUIProfileDescriptor(datasetDescriptor());

    expect(result.conformant).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects descriptors that omit generated app profile sections', () => {
    const descriptor = datasetDescriptor();
    const result = validateMCPUIProfileDescriptor({
      ...descriptor,
      meta: undefined,
      state_model: undefined,
    });

    expect(result.conformant).toBe(false);
    expect(result.errors.map(error => error.path)).toEqual(
      expect.arrayContaining(['meta', 'state_model']),
    );
  });

  it('rejects streaming operations without an event schema or schema CID', () => {
    const descriptor = datasetDescriptor({
      data_contracts: {
        operations: [
          {
            method: 'browse',
            input_schema: { type: 'object' },
            output_schema: { type: 'object' },
            stream: { kind: 'progress' },
          },
        ],
      },
    });

    const result = validateMCPUIProfileDescriptor(descriptor);

    expect(result.conformant).toBe(false);
    expect(result.errors.map(error => error.path)).toContain(
      'data_contracts.operations[0].stream.event_schema',
    );
  });

  it('selects a job console for progress stream operation shapes', () => {
    const descriptor = datasetDescriptor({
      ui: {
        primary_template: 'job-console',
        templates: [{ kind: 'dashboard', operations: ['pin'] }],
      },
      services: [
        {
          id: 'accelerate',
          interface_type: 'compute',
          operations: ['browse', 'pin'],
        },
      ],
    });

    const selection = selectTemplateForDescriptor(descriptor);

    expect(selection.kind).toBe('job-console');
    expect(selection.reason).toContain('progress');
  });
});

describe('MCP interface discovery registry', () => {
  it('publishes only conforming UI descriptors', () => {
    const backend = new LocalMCPInterfaceRegistryBackend(new InterfaceRepository());
    const registry = new MCPInterfaceDiscoveryRegistry(backend);

    expect(() => registry.publish(datasetDescriptor())).not.toThrow();
    expect(() => registry.publish(datasetDescriptor({ meta: undefined }))).toThrow(
      /conformance failed/,
    );
  });

  it('discovers UI descriptors and exposes template selection', async () => {
    const backend = new LocalMCPInterfaceRegistryBackend(new InterfaceRepository());
    const registry = new MCPInterfaceDiscoveryRegistry(backend);
    const cid = registry.publish(datasetDescriptor());

    const discovered = await registry.discover({ ui_only: true });

    expect(discovered).toHaveLength(1);
    expect(discovered[0].cid).toBe(cid);
    expect(discovered[0].template?.kind).toBe('explorer');
  });

  it('negotiates to the latest compatible descriptor when a preferred version is unavailable', async () => {
    const backend = new LocalMCPInterfaceRegistryBackend(new InterfaceRepository());
    const registry = new MCPInterfaceDiscoveryRegistry(backend);
    registry.publish(datasetDescriptor({ version: '1.0.0' }));
    registry.publish(datasetDescriptor({ version: '1.2.0' }));

    const resolution = await registry.resolveForLaunch({
      app_id: 'ipfs-dataset-workbench',
      preferred_version: '1.1.0',
      required_methods: ['browse', 'pin'],
    });

    expect(resolution?.descriptor.version).toBe('1.2.0');
    expect(resolution?.fallback).toBe(true);
  });
});
