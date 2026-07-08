import { getBrowserAppCapabilityGateway, renderAppCapabilityEnvelopeHTML } from './app-capability-gateway.js';

export const BROWSER_MCP_DESCRIPTOR_REGISTRY_ID = 'swissknife.browser-mcp-descriptor-registry.v1';

const objectSchema = { type: 'object', additionalProperties: true };

const DESCRIPTORS = [
  {
    id: 'ipfs_kit_py',
    name: 'ipfs_kit_py',
    title: 'IPFS Kit',
    namespace: 'dev.hallucinate.ipfs.kit',
    version: '1.0.0',
    interface_cid: 'sha256:browser-ipfs-kit-descriptor-v1',
    service_family: 'ipfs_kit_py',
    tags: ['ipfs', 'storage', 'pinning', 'dag', 'ipns'],
    meta: {
      app_id: 'ipfs-explorer',
      descriptor_pack_id: 'ipfs_kit_py.mcp_dashboard.descriptor_pack.v1',
      publisher: 'hallucinate.app',
      registry_id: BROWSER_MCP_DESCRIPTOR_REGISTRY_ID,
    },
    services: [
      {
        id: 'ipfs-kit-py',
        transport: 'browser-gateway',
        endpoint: 'browser://swissknife/app-capability-gateway/ipfs_kit_py',
      },
    ],
    data_contracts: {
      operations: [
        operation('node_id', 'Node identity', 'ipfs.kit.tool.node_id', {}, { id: { type: 'string' }, addresses: { type: 'array' } }, 'read'),
        operation('ipfs_add', 'Add content', 'ipfs.kit.tool.ipfs_add', { content: { type: 'string' }, filename: { type: 'string' }, pin: { type: 'boolean' } }, { cid: { type: 'string' }, size: { type: 'number' } }, 'write', ['content']),
        operation('ipfs_cat', 'Read content', 'ipfs.kit.tool.ipfs_cat', { cid: { type: 'string' }, path: { type: 'string' } }, { content: { type: 'string' } }, 'read'),
        operation('ipfs_ls', 'List path', 'ipfs.kit.tool.ipfs_ls', { path: { type: 'string' }, cid: { type: 'string' } }, { items: { type: 'array' } }, 'read'),
        operation('pin_add', 'Pin content', 'ipfs.kit.tool.pin_add', { cid: { type: 'string' }, path: { type: 'string' } }, { pinned: { type: 'boolean' } }, 'write'),
        operation('pin_rm', 'Remove pin', 'ipfs.kit.tool.pin_rm', { cid: { type: 'string' }, path: { type: 'string' } }, { unpinned: { type: 'boolean' } }, 'destructive'),
        operation('pin_ls', 'List pins', 'ipfs.kit.tool.pin_ls', {}, { pins: { type: 'array' } }, 'read'),
        operation('get_pinset', 'Get pinset', 'ipfs.kit.tool.get_pinset', {}, { pins: { type: 'array' } }, 'read'),
        operation('block_stat', 'Block stats', 'ipfs.kit.tool.block_stat', { cid: { type: 'string' }, path: { type: 'string' } }, { size: { type: 'number' }, blocks: { type: 'number' } }, 'read'),
        operation('dag_get', 'Read DAG', 'ipfs.kit.tool.dag_get', { cid: { type: 'string' }, path: { type: 'string' } }, { data: objectSchema }, 'read'),
        operation('dag_put', 'Write DAG', 'ipfs.kit.tool.dag_put', { data: objectSchema, pin: { type: 'boolean' } }, { cid: { type: 'string' } }, 'write', ['data']),
        operation('name_publish', 'Publish IPNS', 'ipfs.kit.tool.name_publish', { path: { type: 'string' }, cid: { type: 'string' }, name: { type: 'string' } }, { name: { type: 'string' }, value: { type: 'string' } }, 'write'),
        operation('name_resolve', 'Resolve IPNS', 'ipfs.kit.tool.name_resolve', { name: { type: 'string' }, path: { type: 'string' } }, { path: { type: 'string' } }, 'read'),
      ],
    },
    ui: {
      primary_template: 'explorer',
      icon: '📦',
      display_name: 'IPFS Kit',
      category: 'storage',
      glasses_profile: 'meta-glasses.storage-summary.v1',
    },
    permissions: permissions({
      node_id: ['ipfs/read'],
      ipfs_add: ['ipfs/write'],
      ipfs_cat: ['ipfs/read'],
      ipfs_ls: ['ipfs/read'],
      pin_add: ['ipfs/pin'],
      pin_rm: ['ipfs/unpin'],
      pin_ls: ['ipfs/read'],
      get_pinset: ['ipfs/read'],
      block_stat: ['ipfs/read'],
      dag_get: ['ipfs/read'],
      dag_put: ['ipfs/write'],
      name_publish: ['ipfs/name'],
      name_resolve: ['ipfs/read'],
    }),
    state_model: stateModel(['ipfs.add.completed', 'ipfs.pin.changed', 'ipfs.dag.changed', 'ipfs.name.changed']),
  },
  {
    id: 'ipfs_datasets_py',
    name: 'ipfs_datasets_py',
    title: 'IPFS Datasets',
    namespace: 'dev.hallucinate.ipfs.datasets',
    version: '1.0.0',
    interface_cid: 'sha256:browser-ipfs-datasets-descriptor-v1',
    service_family: 'ipfs_datasets_py',
    tags: ['datasets', 'search', 'vectors', 'provenance'],
    meta: {
      app_id: 'datasets-browser',
      descriptor_pack_id: 'ipfs_datasets_py.mcp_dashboard.descriptor_pack.v1',
      publisher: 'hallucinate.app',
      registry_id: BROWSER_MCP_DESCRIPTOR_REGISTRY_ID,
    },
    services: [
      {
        id: 'ipfs-datasets-py',
        transport: 'browser-gateway',
        endpoint: 'browser://swissknife/app-capability-gateway/ipfs_datasets_py',
      },
    ],
    data_contracts: {
      operations: [
        operation('browse', 'Browse datasets', 'ipfs.datasets.operation.browse', { root_cid: { type: 'string' }, path: { type: 'string' }, limit: { type: 'number' } }, { entries: { type: 'array' }, root_cid: { type: 'string' } }, 'read'),
        operation('list_datasets', 'List datasets', 'ipfs.datasets.operation.list_datasets', { query: { type: 'string' }, limit: { type: 'number' } }, { datasets: { type: 'array' } }, 'read'),
        operation('get', 'Get dataset record', 'ipfs.datasets.operation.get', { dataset_id: { type: 'string' }, cid: { type: 'string' }, path: { type: 'string' } }, { record: objectSchema }, 'read'),
        operation('embed', 'Embed text', 'ipfs.datasets.operation.embed', { texts: { type: 'array', items: { type: 'string' } }, model_name: { type: 'string' } }, { embeddings: { type: 'array' } }, 'read', ['texts']),
        operation('vector_search', 'Vector search', 'ipfs.datasets.operation.vector_search', { query: { type: 'string' }, collection: { type: 'string' }, top_k: { type: 'number' } }, { results: { type: 'array' } }, 'read', ['query']),
        operation('semantic_search', 'Semantic search', 'ipfs.datasets.operation.semantic_search', { query: { type: 'string' }, top_k: { type: 'number' }, filters: objectSchema }, { results: { type: 'array' }, total: { type: 'number' } }, 'read', ['query']),
        operation('vector_index', 'Vector index', 'ipfs.datasets.operation.vector_index', { content: { type: 'string' }, collection: { type: 'string' }, metadata: objectSchema }, { id: { type: 'string' }, indexed: { type: 'boolean' } }, 'write', ['content']),
        operation('index', 'Index dataset', 'ipfs.datasets.operation.index', { dataset_id: { type: 'string' }, root_cid: { type: 'string' }, schema: objectSchema }, { indexed: { type: 'number' }, index_cid: { type: 'string' } }, 'write'),
        operation('pin', 'Pin dataset', 'ipfs.datasets.operation.pin', { dataset_id: { type: 'string' }, cid: { type: 'string' } }, { pinned: { type: 'boolean' }, receipt_cid: { type: 'string' } }, 'write'),
        operation('publish', 'Publish dataset', 'ipfs.datasets.operation.publish', { dataset_id: { type: 'string' }, metadata: objectSchema }, { dataset_cid: { type: 'string' }, provenance_cid: { type: 'string' } }, 'write'),
        operation('record_provenance', 'Record provenance', 'ipfs.datasets.operation.record_provenance', { dataset_id: { type: 'string' }, artifact_cid: { type: 'string' }, metadata: objectSchema }, { provenance_cid: { type: 'string' }, receipt_cid: { type: 'string' } }, 'write'),
        operation('sync_status', 'Sync status', 'ipfs.datasets.operation.sync_status', { dataset_id: { type: 'string' } }, { status: { type: 'string' }, frontier: { type: 'array' } }, 'read'),
      ],
    },
    ui: {
      primary_template: 'dashboard',
      icon: '📊',
      display_name: 'IPFS Datasets',
      category: 'datasets',
      glasses_profile: 'meta-glasses.dataset-browser.v1',
    },
    permissions: permissions({
      browse: ['dataset/read'],
      list_datasets: ['dataset/read'],
      get: ['dataset/read'],
      embed: ['dataset/embed'],
      vector_search: ['dataset/vector/read'],
      semantic_search: ['dataset/search'],
      vector_index: ['dataset/vector/write'],
      index: ['dataset/index'],
      pin: ['dataset/pin'],
      publish: ['dataset/publish'],
      record_provenance: ['dataset/provenance'],
      sync_status: ['dataset/read'],
    }),
    state_model: stateModel(['dataset.index.completed', 'dataset.pin.progress', 'dataset.publish.completed', 'dataset.sync.frontier']),
  },
  {
    id: 'ipfs_accelerate_py',
    name: 'ipfs_accelerate_py',
    title: 'IPFS Accelerate',
    namespace: 'dev.hallucinate.ipfs.accelerate',
    version: '1.0.0',
    interface_cid: 'sha256:browser-ipfs-accelerate-descriptor-v1',
    service_family: 'ipfs_accelerate_py',
    tags: ['inference', 'hardware', 'telemetry', 'jobs'],
    meta: {
      app_id: 'accelerate-panel',
      descriptor_pack_id: 'ipfs_accelerate_py.mcp_dashboard.descriptor_pack.v1',
      publisher: 'hallucinate.app',
      registry_id: BROWSER_MCP_DESCRIPTOR_REGISTRY_ID,
    },
    services: [
      {
        id: 'ipfs-accelerate-py',
        transport: 'browser-gateway',
        endpoint: 'browser://swissknife/app-capability-gateway/ipfs_accelerate_py',
      },
    ],
    data_contracts: {
      operations: [
        operation('list_models', 'List models', 'ipfs.accelerate.operation.list_models', { task: { type: 'string' }, provider: { type: 'string' } }, { models: { type: 'array' } }, 'read'),
        operation('hardware_profile', 'Hardware profile', 'ipfs.accelerate.operation.hardware_profile', {}, { devices: { type: 'array' }, memory_gb: { type: 'number' } }, 'read'),
        operation('run_inference_job', 'Run inference job', 'ipfs.accelerate.operation.run_inference_job', { model: { type: 'string' }, input: { type: 'string' }, max_tokens: { type: 'number' } }, { job_id: { type: 'string' }, status: { type: 'string' } }, 'write', ['model', 'input']),
        operation('job_status', 'Job status', 'ipfs.accelerate.operation.job_status', { job_id: { type: 'string' } }, { job_id: { type: 'string' }, status: { type: 'string' }, artifacts: { type: 'array' } }, 'read'),
        operation('telemetry', 'Telemetry', 'ipfs.accelerate.operation.telemetry', { window: { type: 'string', enum: ['1m', '5m', '1h'] } }, { throughput: { type: 'number' }, utilization: { type: 'number' }, event_frontier: { type: 'array' } }, 'read'),
      ],
    },
    ui: {
      primary_template: 'job-console',
      icon: '⚡',
      display_name: 'IPFS Accelerate',
      category: 'inference',
      glasses_profile: 'meta-glasses.inference-queue.v1',
    },
    permissions: permissions({
      list_models: ['accelerate/read'],
      hardware_profile: ['accelerate/read'],
      run_inference_job: ['accelerate/invoke'],
      job_status: ['accelerate/read'],
      telemetry: ['accelerate/read'],
    }),
    state_model: stateModel(['accelerate.job.queued', 'accelerate.job.completed', 'accelerate.telemetry.updated']),
  },
];

export function listBrowserMCPDescriptors() {
  return DESCRIPTORS.map(clone);
}

export function getBrowserMCPDescriptor(idOrName) {
  const descriptor = DESCRIPTORS.find(candidate => (
    candidate.id === idOrName
    || candidate.name === idOrName
    || candidate.service_family === idOrName
    || candidate.meta.app_id === idOrName
  ));
  return descriptor ? clone(descriptor) : null;
}

export function inspectBrowserMCPDescriptor(idOrDescriptor) {
  const descriptor = typeof idOrDescriptor === 'string'
    ? getBrowserMCPDescriptor(idOrDescriptor)
    : clone(idOrDescriptor);
  if (!descriptor) return null;
  return {
    registry_id: BROWSER_MCP_DESCRIPTOR_REGISTRY_ID,
    id: descriptor.id,
    name: descriptor.name,
    namespace: descriptor.namespace,
    version: descriptor.version,
    interface_cid: descriptor.interface_cid,
    service_family: descriptor.service_family,
    services: descriptor.services,
    method_schemas: descriptor.data_contracts.operations.map(operation => ({
      method: operation.method,
      title: operation.title,
      capability_id: operation.capability_id,
      input_schema: operation.input_schema,
      output_schema: operation.output_schema,
      policy_class: operation.policy_class,
      receipt_policy: operation.receipt_policy,
      permissions: descriptor.permissions.operations[operation.method] || [],
    })),
    ui: descriptor.ui,
    permissions: descriptor.permissions,
    state_events: descriptor.state_model.events,
    handoff: {
      orb_ready: true,
      glasses_profile: descriptor.ui.glasses_profile,
      result_envelope_schema: 'swissknife.app-result-envelope.v1',
      receipt_schema: 'swissknife.app-capability-receipt.v1',
      event_dag_schema: 'swissknife.app-capability-event-dag.v1',
    },
  };
}

export function descriptorToIDLDescriptor(idOrDescriptor) {
  const descriptor = typeof idOrDescriptor === 'string'
    ? getBrowserMCPDescriptor(idOrDescriptor)
    : clone(idOrDescriptor);
  if (!descriptor) return null;
  return {
    name: descriptor.name,
    namespace: descriptor.namespace,
    version: descriptor.version,
    interface_cid: descriptor.interface_cid,
    service_family: descriptor.service_family,
    methods: descriptor.data_contracts.operations.map(operation => ({
      name: operation.method,
      capability_id: operation.capability_id,
      inputSchema: operation.input_schema,
      outputSchema: operation.output_schema,
    })),
    ui: {
      primary_template: descriptor.ui.primary_template,
      icon: descriptor.ui.icon,
      display_name: descriptor.ui.display_name,
      category: descriptor.ui.category,
    },
  };
}

export async function invokeDescriptorOperation({
  descriptor_id,
  operation,
  input = {},
  app_id,
  execution_mode,
  desktop,
} = {}) {
  const descriptor = getBrowserMCPDescriptor(descriptor_id);
  if (!descriptor) {
    throw new Error(`Descriptor ${descriptor_id} is not registered in ${BROWSER_MCP_DESCRIPTOR_REGISTRY_ID}.`);
  }
  const method = descriptor.data_contracts.operations.find(candidate => candidate.method === operation);
  if (!method) {
    throw new Error(`Operation ${operation} is not registered on descriptor ${descriptor.name}.`);
  }
  const gateway = getBrowserAppCapabilityGateway({ desktop });
  return gateway.invoke({
    app_id: app_id || descriptor.meta.app_id,
    capability_id: method.capability_id,
    input,
    execution_mode,
  });
}

export function renderDescriptorRegistrySummary(descriptors = listBrowserMCPDescriptors()) {
  return `
    <div class="descriptor-registry-summary" data-registry-id="${escapeHTML(BROWSER_MCP_DESCRIPTOR_REGISTRY_ID)}" style="display:grid;gap:8px;">
      ${descriptors.map(descriptor => `
        <div class="descriptor-registry-card" data-descriptor-id="${escapeHTML(descriptor.id)}" style="border:1px solid #e5e7eb;border-radius:6px;padding:10px;background:#f8fafc;">
          <div style="display:flex;justify-content:space-between;gap:8px;">
            <strong style="font-size:13px;">${escapeHTML(descriptor.name)}</strong>
            <span style="font-size:10px;color:#1e40af;background:#dbeafe;padding:2px 6px;border-radius:4px;">${descriptor.data_contracts.operations.length} methods</span>
          </div>
          <div style="font-size:11px;color:#64748b;margin-top:3px;">${escapeHTML(descriptor.namespace)} | ${escapeHTML(descriptor.interface_cid)}</div>
          <div style="font-size:10px;color:#475569;margin-top:5px;">${descriptor.tags.map(tag => escapeHTML(tag)).join(' | ')}</div>
        </div>
      `).join('')}
    </div>
  `;
}

export function renderDescriptorInspectionHTML(idOrDescriptor) {
  const inspection = inspectBrowserMCPDescriptor(idOrDescriptor);
  if (!inspection) {
    return '<div class="descriptor-inspection descriptor-error">Descriptor not found.</div>';
  }
  return `
    <div class="descriptor-inspection" data-descriptor-id="${escapeHTML(inspection.id)}" style="border:1px solid #cbd5e1;border-radius:6px;padding:10px;background:#fff;">
      <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:8px;">
        <strong>${escapeHTML(inspection.name)}</strong>
        <span style="font-size:10px;color:#64748b;">${escapeHTML(inspection.handoff.glasses_profile)}</span>
      </div>
      <div style="display:grid;gap:6px;">
        ${inspection.method_schemas.map(method => `
          <details class="descriptor-method-schema" data-operation="${escapeHTML(method.method)}" data-capability-id="${escapeHTML(method.capability_id)}">
            <summary style="cursor:pointer;font-size:12px;">
              <code>${escapeHTML(method.method)}</code>
              <span style="color:#64748b;">${escapeHTML(method.capability_id)}</span>
            </summary>
            <pre style="white-space:pre-wrap;overflow:auto;background:#0f172a;color:#e2e8f0;padding:8px;border-radius:4px;font-size:10px;">${escapeHTML(JSON.stringify({
              input_schema: method.input_schema,
              output_schema: method.output_schema,
              permissions: method.permissions,
              receipt_policy: method.receipt_policy,
            }, null, 2))}</pre>
          </details>
        `).join('')}
      </div>
    </div>
  `;
}

export function renderDescriptorOperationButtons(descriptor) {
  return descriptor.data_contracts.operations.map(operation => `
    <button
      class="service-operation descriptor-operation"
      data-descriptor-id="${escapeHTML(descriptor.id)}"
      data-descriptor-operation="${escapeHTML(operation.method)}"
      data-capability-id="${escapeHTML(operation.capability_id)}"
      style="border:1px solid #cbd5e1;border-radius:5px;background:#fff;padding:7px 9px;cursor:pointer;font-size:12px;"
    >${escapeHTML(operation.title || humanize(operation.method))}</button>
  `).join('');
}

export function renderEnvelopeHTML(envelope) {
  return renderAppCapabilityEnvelopeHTML(envelope);
}

function operation(method, title, capabilityId, inputProperties, outputProperties, policyClass = 'read', required = []) {
  return {
    method,
    title,
    capability_id: capabilityId,
    policy_class: policyClass,
    confirmation_policy: policyClass === 'read' ? 'none' : policyClass === 'destructive' ? 'confirm_destructive' : 'confirm',
    receipt_policy: policyClass === 'read' ? 'optional' : 'required_for_side_effects',
    input_schema: {
      type: 'object',
      properties: inputProperties,
      required,
      additionalProperties: false,
    },
    output_schema: {
      type: 'object',
      properties: outputProperties,
      additionalProperties: true,
    },
  };
}

function permissions(operations) {
  return {
    default_deny: true,
    operations,
  };
}

function stateModel(events) {
  return {
    version: '1.0.0',
    events,
    receipt_dag: {
      schema: 'swissknife.app-capability-event-dag.v1',
      frontier_strategy: 'append-only',
    },
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function humanize(value) {
  return String(value || '')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

if (typeof window !== 'undefined') {
  const api = {
    registry_id: BROWSER_MCP_DESCRIPTOR_REGISTRY_ID,
    list: listBrowserMCPDescriptors,
    get: getBrowserMCPDescriptor,
    inspect: inspectBrowserMCPDescriptor,
    toIDL: descriptorToIDLDescriptor,
    invoke: invokeDescriptorOperation,
  };
  window.__swissKnifeDescriptorRegistry = api;
  window.swissKnifeDescriptorRegistry = api;
}
