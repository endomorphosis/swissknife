import { InterfaceRepository } from '../../src/services/mcp/mcp-idl';
import {
  LocalMCPInterfaceRegistryBackend,
  MCPInterfaceDiscoveryRegistry,
} from '../../src/services/mcp/mcp-interface-registry';
import {
  SWISSKNIFE_MCP_UI_PROFILE,
  SWISSKNIFE_MCP_UI_PROFILE_VERSION,
  selectTemplateForDescriptor,
  validateMCPUIProfileDescriptor,
  type MCPUIProfileDescriptor,
} from '../../src/services/mcp/mcp-ui-profile';

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
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MCPUI_META', path: 'meta' }),
        expect.objectContaining({ code: 'MCPUI_STATE_MODEL', path: 'state_model' }),
      ]),
    );
  });

  it('rejects unsupported service interface types and transports with stable codes', () => {
    const descriptor = datasetDescriptor({
      services: [
        {
          id: 'datasets',
          interface_type: 'unknown-service' as any,
          transport: 'unsupported-transport' as any,
          operations: ['browse', 'pin'],
        },
      ],
    });

    const result = validateMCPUIProfileDescriptor(descriptor);

    expect(result.conformant).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'MCPUI_SERVICES_ITEM_INTERFACE_TYPE',
          path: 'services[0].interface_type',
        }),
        expect.objectContaining({
          code: 'MCPUI_SERVICES_ITEM_TRANSPORT',
          path: 'services[0].transport',
        }),
      ]),
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

  it('selects a graph viewer from state model signals when operation names are generic', () => {
    const descriptor = datasetDescriptor({
      name: 'lineage-inspector',
      methods: [
        {
          name: 'inspect',
          input_schema: { type: 'object' },
          output_schema: { type: 'object' },
        },
      ],
      services: [
        {
          id: 'lineage',
          interface_type: 'generic',
          operations: ['inspect'],
        },
      ],
      ui: {
        primary_template: 'graph-viewer',
        templates: [{ kind: 'dashboard', operations: ['inspect'] }],
      },
      data_contracts: {
        operations: [
          {
            method: 'inspect',
            input_schema: { type: 'object' },
            output_schema: { type: 'object' },
          },
        ],
      },
      permissions: {
        default_deny: false,
        operations: {
          inspect: [],
        },
      },
      state_model: {
        keys: ['lineage_graph'],
        events: ['provenance.recorded'],
        projections: ['provenance_graph'],
      },
    });

    const selection = selectTemplateForDescriptor(descriptor);

    expect(selection.kind).toBe('graph-viewer');
    expect(selection.reason).toContain('state model');
  });

  it('uses explicit primary template mappings before heuristic selection', () => {
    const selection = selectTemplateForDescriptor(datasetDescriptor());

    expect(selection.kind).toBe('explorer');
    expect(selection.reason).toBe('descriptor primary_template mapping');
    expect(selection.required_operations).toEqual(['browse', 'pin']);
  });

  it('selects graph viewer when a descriptor declares a workflow graph', () => {
    const descriptor = datasetDescriptor({
      ui: {
        primary_template: 'graph-viewer',
        templates: [{ kind: 'dashboard', operations: ['browse', 'pin'] }],
      },
      state_model: {
        keys: ['current_path', 'selected_cid', 'pin_jobs'],
        events: ['dataset.selected', 'dataset.pin.progress'],
        projections: ['workflow_projection'],
        replay: true,
      },
      workflow_graph: {
        id: 'dataset-pin',
        shared_state_keys: ['selected_cid', 'pin_jobs'],
        steps: [
          { id: 'select', operation: 'browse', write_state_keys: ['selected_cid'] },
          {
            id: 'pin',
            operation: 'pin',
            depends_on: ['select'],
            read_state_keys: ['selected_cid'],
            write_state_keys: ['pin_jobs'],
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
          },
        ],
      },
    });

    const selection = selectTemplateForDescriptor(descriptor);

    expect(selection.kind).toBe('graph-viewer');
    expect(selection.reason).toContain('workflow graph');
  });

  it('falls back to a form wizard for request response operation shapes', () => {
    const descriptor = datasetDescriptor({
      services: [
        {
          id: 'generic',
          interface_type: 'generic',
          operations: ['submit'],
        },
      ],
      methods: [
        {
          name: 'submit',
          input_schema: { type: 'object', properties: { value: { type: 'string' } } },
          output_schema: { type: 'object', properties: { id: { type: 'string' } } },
        },
      ],
      ui: {
        primary_template: 'dashboard',
        templates: [{ kind: 'explorer', operations: ['submit'] }],
      },
      data_contracts: {
        operations: [
          {
            method: 'submit',
            input_schema: { type: 'object', properties: { value: { type: 'string' } } },
            output_schema: { type: 'object', properties: { id: { type: 'string' } } },
          },
        ],
      },
      permissions: {
        default_deny: false,
        operations: {
          submit: [],
        },
      },
      state_model: {
        keys: ['draft'],
        events: [],
      },
    });

    const selection = selectTemplateForDescriptor(descriptor);

    expect(selection.kind).toBe('form-wizard');
    expect(selection.reason).toContain('request/response');
  });

  it('rejects template mappings that do not satisfy template capability contracts', () => {
    const descriptor = datasetDescriptor({
      ui: {
        primary_template: 'graph-viewer',
        templates: [{ kind: 'graph-viewer', operations: ['browse'] }],
      },
    });

    const result = validateMCPUIProfileDescriptor(descriptor);

    expect(result.conformant).toBe(false);
    expect(result.errors.map(error => error.path)).toContain('ui.templates[0].operations');
    expect(result.errors.map(error => error.message).join('\n')).toContain('graph-viewer template requires');
  });

  it('accepts workflow graphs with dependencies, shared state, and compensation actions', () => {
    const descriptor = datasetDescriptor({
      state_model: {
        keys: ['current_path', 'selected_cid', 'pin_jobs'],
        events: ['dataset.selected', 'dataset.pin.progress'],
        projections: ['workflow_graph'],
        replay: true,
      },
      workflow_graph: {
        id: 'dataset-pin',
        shared_state_keys: ['selected_cid', 'pin_jobs'],
        steps: [
          {
            id: 'select',
            operation: 'browse',
            service_id: 'datasets',
            write_state_keys: ['selected_cid'],
          },
          {
            id: 'pin',
            operation: 'pin',
            service_id: 'datasets',
            depends_on: ['select'],
            read_state_keys: ['selected_cid'],
            write_state_keys: ['pin_jobs'],
            compensation: {
              operation: 'browse',
              service_id: 'datasets',
              state_keys: ['selected_cid'],
            },
          },
        ],
      },
    });

    const result = validateMCPUIProfileDescriptor(descriptor);

    expect(result.conformant).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects workflow graphs with missing operation references or incompatible state keys', () => {
    const descriptor = datasetDescriptor({
      workflow_graph: {
        id: 'bad-workflow',
        shared_state_keys: ['selected_cid', 'missing_shared_key'],
        steps: [
          {
            id: 'select',
            operation: 'missing_operation',
            service_id: 'datasets',
            write_state_keys: ['selected_cid'],
          },
          {
            id: 'pin',
            operation: 'pin',
            service_id: 'datasets',
            depends_on: ['select', 'missing_step'],
            read_state_keys: ['not_shared'],
          },
        ],
      },
    });

    const result = validateMCPUIProfileDescriptor(descriptor);

    expect(result.conformant).toBe(false);
    expect(result.errors.map(error => error.path)).toEqual(
      expect.arrayContaining([
        'workflow_graph.shared_state_keys',
        'workflow_graph.steps[0].operation',
        'workflow_graph.steps[1].depends_on',
        'workflow_graph.steps[1].read_state_keys',
      ]),
    );
  });

  it('rejects workflow graphs with invalid rollback actions and dependency cycles', () => {
    const descriptor = datasetDescriptor({
      workflow_graph: {
        id: 'cyclic-workflow',
        shared_state_keys: ['selected_cid', 'pin_jobs'],
        steps: [
          {
            id: 'select',
            operation: 'browse',
            depends_on: ['pin'],
            write_state_keys: ['selected_cid'],
            rollback: {
              operation: 'missing_rollback',
              state_keys: ['not_shared'],
            },
          },
          {
            id: 'pin',
            operation: 'pin',
            depends_on: ['select'],
            read_state_keys: ['selected_cid'],
            write_state_keys: ['pin_jobs'],
          },
        ],
      },
    });

    const result = validateMCPUIProfileDescriptor(descriptor);

    expect(result.conformant).toBe(false);
    expect(result.errors.map(error => error.path)).toEqual(
      expect.arrayContaining([
        'workflow_graph.steps[0].rollback.operation',
        'workflow_graph.steps[0].rollback.state_keys',
        'workflow_graph.steps',
      ]),
    );
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
