const APP_RESULT_ENVELOPE_SCHEMA = 'swissknife.app-result-envelope.v1';

const CAPABILITY_DEFINITIONS = [
  { capability_id: 'ipfs.kit.tool.node_id', service_family: 'ipfs_kit_py', mcp_tool_name: 'node_id', policy_class: 'read' },
  { capability_id: 'ipfs.kit.tool.ipfs_add', service_family: 'ipfs_kit_py', mcp_tool_name: 'ipfs_add', policy_class: 'write' },
  { capability_id: 'ipfs.kit.tool.ipfs_cat', service_family: 'ipfs_kit_py', mcp_tool_name: 'ipfs_cat', policy_class: 'read' },
  { capability_id: 'ipfs.kit.tool.ipfs_ls', service_family: 'ipfs_kit_py', mcp_tool_name: 'ipfs_ls', policy_class: 'read' },
  { capability_id: 'ipfs.kit.tool.pin_add', service_family: 'ipfs_kit_py', mcp_tool_name: 'pin_add', policy_class: 'write' },
  { capability_id: 'ipfs.kit.tool.pin_rm', service_family: 'ipfs_kit_py', mcp_tool_name: 'pin_rm', policy_class: 'destructive' },
  { capability_id: 'ipfs.kit.tool.pin_ls', service_family: 'ipfs_kit_py', mcp_tool_name: 'pin_ls', policy_class: 'read' },
  { capability_id: 'ipfs.kit.tool.get_pinset', service_family: 'ipfs_kit_py', mcp_tool_name: 'get_pinset', policy_class: 'read' },
  { capability_id: 'ipfs.kit.tool.block_stat', service_family: 'ipfs_kit_py', mcp_tool_name: 'block_stat', policy_class: 'read' },
  { capability_id: 'ipfs.kit.tool.dag_get', service_family: 'ipfs_kit_py', mcp_tool_name: 'dag_get', policy_class: 'read' },
  { capability_id: 'ipfs.kit.tool.dag_put', service_family: 'ipfs_kit_py', mcp_tool_name: 'dag_put', policy_class: 'write' },
  { capability_id: 'ipfs.kit.tool.name_publish', service_family: 'ipfs_kit_py', mcp_tool_name: 'name_publish', policy_class: 'write' },
  { capability_id: 'ipfs.kit.tool.name_resolve', service_family: 'ipfs_kit_py', mcp_tool_name: 'name_resolve', policy_class: 'read' },
  { capability_id: 'ipfs.datasets.operation.browse', service_family: 'ipfs_datasets_py', mcp_tool_name: 'browse', policy_class: 'read' },
  { capability_id: 'ipfs.datasets.operation.list_datasets', service_family: 'ipfs_datasets_py', mcp_tool_name: 'list_datasets', policy_class: 'read' },
  { capability_id: 'ipfs.datasets.operation.get', service_family: 'ipfs_datasets_py', mcp_tool_name: 'get', policy_class: 'read' },
  { capability_id: 'ipfs.datasets.operation.embed', service_family: 'ipfs_datasets_py', mcp_tool_name: 'embed', policy_class: 'read' },
  { capability_id: 'ipfs.datasets.operation.vector_search', service_family: 'ipfs_datasets_py', mcp_tool_name: 'vector_search', policy_class: 'read' },
  { capability_id: 'ipfs.datasets.operation.semantic_search', service_family: 'ipfs_datasets_py', mcp_tool_name: 'semantic_search', policy_class: 'read' },
  { capability_id: 'ipfs.datasets.operation.vector_index', service_family: 'ipfs_datasets_py', mcp_tool_name: 'vector_index', policy_class: 'write' },
  { capability_id: 'ipfs.datasets.operation.index', service_family: 'ipfs_datasets_py', mcp_tool_name: 'index', policy_class: 'write' },
  { capability_id: 'ipfs.datasets.operation.pin', service_family: 'ipfs_datasets_py', mcp_tool_name: 'pin', policy_class: 'write' },
  { capability_id: 'ipfs.datasets.operation.publish', service_family: 'ipfs_datasets_py', mcp_tool_name: 'publish', policy_class: 'write' },
  { capability_id: 'ipfs.datasets.operation.record_provenance', service_family: 'ipfs_datasets_py', mcp_tool_name: 'record_provenance', policy_class: 'write' },
  { capability_id: 'ipfs.datasets.operation.sync_status', service_family: 'ipfs_datasets_py', mcp_tool_name: 'sync_status', policy_class: 'read' },
  { capability_id: 'ipfs.accelerate.operation.list_models', service_family: 'ipfs_accelerate_py', mcp_tool_name: 'list_models', policy_class: 'read' },
  { capability_id: 'ipfs.accelerate.operation.hardware_profile', service_family: 'ipfs_accelerate_py', mcp_tool_name: 'hardware_profile', policy_class: 'read' },
  { capability_id: 'ipfs.accelerate.operation.run_inference_job', service_family: 'ipfs_accelerate_py', mcp_tool_name: 'run_inference_job', policy_class: 'write' },
  { capability_id: 'ipfs.accelerate.operation.job_status', service_family: 'ipfs_accelerate_py', mcp_tool_name: 'job_status', policy_class: 'read' },
  { capability_id: 'ipfs.accelerate.operation.telemetry', service_family: 'ipfs_accelerate_py', mcp_tool_name: 'telemetry', policy_class: 'read' },
];

const SERVICE_PACKS = {
  ipfs_kit_py: {
    descriptor_pack_id: 'ipfs_kit_py.mcp_dashboard.descriptor_pack.v1',
    interface_prefix: 'ipfs_kit/browser',
    renderer: 'browser-schema-ui:ipfs-kit:object',
  },
  ipfs_datasets_py: {
    descriptor_pack_id: 'ipfs_datasets_py.mcp_dashboard.descriptor_pack.v1',
    interface_prefix: 'ipfs_datasets/browser',
    renderer: 'browser-schema-ui:ipfs-datasets:object',
  },
  ipfs_accelerate_py: {
    descriptor_pack_id: 'ipfs_accelerate_py.mcp_dashboard.descriptor_pack.v1',
    interface_prefix: 'ipfs_accelerate/browser',
    renderer: 'browser-schema-ui:ipfs-accelerate:object',
  },
};

const IPFS_CAPABILITIES = CAPABILITY_DEFINITIONS.map(definition => {
  const pack = SERVICE_PACKS[definition.service_family];
  return {
    capability_id: definition.capability_id,
    service_family: definition.service_family,
    descriptor_pack_id: pack.descriptor_pack_id,
    mcp_tool_name: definition.mcp_tool_name,
    mcp_plus_plus_interface: `${pack.interface_prefix}.${definition.mcp_tool_name}`,
    policy_class: definition.policy_class,
    confirmation_policy: definition.policy_class === 'read' ? 'none' : definition.policy_class === 'destructive' ? 'confirm_destructive' : 'confirm',
    receipt_policy: definition.policy_class === 'read' ? 'optional' : 'required_for_side_effects',
    execution_modes: ['direct_import', 'mcp_remote', 'mcp_plus_plus_remote', 'mock'],
    default_execution_mode: definition.service_family === 'ipfs_kit_py' ? 'direct_import' : 'mcp_plus_plus_remote',
    desktop_result_renderer: pack.renderer,
    glasses_summary_renderer: `glasses-summary:${definition.service_family}:${definition.mcp_tool_name}`,
    fallback_strategy: 'descriptor-preview>degraded-envelope>desktop-visible',
    input_schema: { type: 'object', additionalProperties: true },
    result_schema: { type: 'object', additionalProperties: true },
  };
});

export class BrowserAppCapabilityGateway {
  constructor(options = {}) {
    this.desktop = options.desktop || null;
    this.now = options.now || (() => new Date());
    this.idFactory = options.idFactory || (() => `cap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    this.capabilities = new Map(IPFS_CAPABILITIES.map(capability => [capability.capability_id, capability]));
    this.lastEnvelope = null;
  }

  setDesktop(desktop) {
    if (desktop) this.desktop = desktop;
  }

  listCapabilities() {
    return Array.from(this.capabilities.values()).map(capability => ({ ...capability }));
  }

  getCapability(capabilityId) {
    return this.capabilities.get(capabilityId) || null;
  }

  async invoke(request) {
    const startedAt = this.now();
    const correlationId = request.correlation_id || this.idFactory();
    const capability = this.getCapability(request.capability_id);

    if (!capability) {
      return this.buildEnvelope({
        status: 'error',
        summary: `Capability ${request.capability_id} is not registered in the browser gateway.`,
        output: null,
        error: {
          code: 'CAPABILITY_NOT_FOUND',
          message: `Capability ${request.capability_id} is not registered in the browser gateway.`,
        },
        appId: request.app_id,
        requestedAppId: request.app_id,
        capabilityId: request.capability_id,
        executionMode: request.execution_mode || 'mock',
        serviceFamily: 'unknown',
        descriptorPackId: undefined,
        mcpToolName: undefined,
        mcpPlusPlusInterface: undefined,
        policyClass: 'read',
        confirmationPolicy: 'none',
        receiptPolicy: 'optional',
        startedAt,
        correlationId,
        warnings: [],
      });
    }

    const executionMode = request.execution_mode || capability.default_execution_mode;
    try {
      const output = await this.invokeIPFSOperation(capability, request.input || {});
      return this.buildEnvelope({
        status: 'ok',
        summary: `Invoked ${capability.mcp_tool_name} through the app capability gateway.`,
        output,
        appId: request.app_id,
        requestedAppId: request.app_id,
        capabilityId: capability.capability_id,
        executionMode,
        serviceFamily: capability.service_family,
        descriptorPackId: capability.descriptor_pack_id,
        mcpToolName: capability.mcp_tool_name,
        mcpPlusPlusInterface: capability.mcp_plus_plus_interface,
        policyClass: capability.policy_class,
        confirmationPolicy: capability.confirmation_policy,
        receiptPolicy: capability.receipt_policy,
        startedAt,
        correlationId,
        warnings: [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.buildEnvelope({
        status: 'degraded',
        summary: `${capability.mcp_tool_name} is unavailable; returning descriptor-backed fallback output.`,
        output: {
          fallback: true,
          reason: message,
          capability_id: capability.capability_id,
          mcp_tool_name: capability.mcp_tool_name,
          input: request.input || {},
        },
        error: {
          code: 'TRANSPORT_UNAVAILABLE',
          message,
        },
        appId: request.app_id,
        requestedAppId: request.app_id,
        capabilityId: capability.capability_id,
        executionMode,
        serviceFamily: capability.service_family,
        descriptorPackId: capability.descriptor_pack_id,
        mcpToolName: capability.mcp_tool_name,
        mcpPlusPlusInterface: capability.mcp_plus_plus_interface,
        policyClass: capability.policy_class,
        confirmationPolicy: capability.confirmation_policy,
        receiptPolicy: capability.receipt_policy,
        startedAt,
        correlationId,
        warnings: ['No live IPFS transport was available in the browser runtime.'],
      });
    }
  }

  async invokeIPFSOperation(capability, input) {
    if (capability.service_family !== 'ipfs_kit_py') {
      throw new Error(`No live ${capability.service_family} descriptor transport is registered in the browser runtime.`);
    }

    const api = this.resolveIPFSAPI();
    if (!api) {
      throw new Error('No live IPFS transport is registered on desktop.swissknife.ipfs, window.SwissKnife.ipfs, or window.ipfs.');
    }

    const operation = capability.mcp_tool_name;
    if (operation === 'node_id') return callFirst(api, [['id'], ['getPeerId'], ['status']], []);
    if (operation === 'ipfs_add') return normalizeAddResult(await callFirst(api, [['add'], ['addFile'], ['addContent']], [input.file || input.content || input.file_path || input.data || '']));
    if (operation === 'ipfs_cat') return readMaybeIterable(await callFirst(api, [['cat'], ['get']], [input.cid || input.path]));
    if (operation === 'ipfs_ls') return normalizeListResult(await callFirst(api, [['ls'], ['files', 'ls']], [input.path || input.cid || '/']));
    if (operation === 'pin_add') return callFirst(api, [['pin'], ['pin', 'add']], [input.cid || input.path]);
    if (operation === 'pin_rm') return callFirst(api, [['unpin'], ['pin', 'rm'], ['pin', 'remove']], [input.cid || input.path]);
    if (operation === 'pin_ls' || operation === 'get_pinset') return normalizeListResult(await callFirst(api, [['listPins'], ['pins'], ['pin', 'ls']], []));
    if (operation === 'block_stat') return callFirst(api, [['stat'], ['block', 'stat'], ['object', 'stat']], [input.cid || input.path]);
    if (operation === 'dag_get') return callFirst(api, [['dag', 'get']], [input.cid || input.path]);
    if (operation === 'dag_put') return normalizeAddResult(await callFirst(api, [['dag', 'put']], [input.data || input.object || input]));
    if (operation === 'name_publish') return callFirst(api, [['name', 'publish'], ['namePublish']], [input.path || input.cid, input.name].filter(Boolean));
    if (operation === 'name_resolve') return callFirst(api, [['name', 'resolve'], ['nameResolve']], [input.name || input.path]);

    throw new Error(`No browser transport mapper exists for ${operation}.`);
  }

  resolveIPFSAPI() {
    return this.desktop?.swissknife?.ipfs
      || window.SwissKnife?.ipfs
      || window.ipfs
      || null;
  }

  buildEnvelope(input) {
    const finishedAt = this.now();
    const durationMs = Math.max(0, finishedAt.getTime() - input.startedAt.getTime());
    const policy = {
      policy_class: input.policyClass,
      confirmation_policy: input.confirmationPolicy,
      receipt_policy: input.receiptPolicy,
      decision: 'not_evaluated',
      reasons: [],
    };
    const trace = {
      correlation_id: input.correlationId,
      app_id: input.appId,
      requested_app_id: input.requestedAppId,
      capability_id: input.capabilityId,
      execution_mode: input.executionMode,
      service_family: input.serviceFamily,
      descriptor_pack_id: input.descriptorPackId,
      mcp_tool_name: input.mcpToolName,
      mcp_plus_plus_interface: input.mcpPlusPlusInterface,
      started_at: input.startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      transport: input.status === 'ok' ? 'browser-ipfs-api' : 'descriptor-fallback',
      warnings: input.warnings,
    };
    const receipt = {
      receipt_cid: `browser:${input.correlationId}:${input.capabilityId}`,
      receipt_schema: 'swissknife.app-capability-receipt.v1',
      service_family: input.serviceFamily,
      capability_id: input.capabilityId,
    };
    const event = {
      event_cid: `browser-event:${input.correlationId}:${input.capabilityId}`,
      parents: [],
      event_type: 'app_capability_invocation',
      metadata: { receipt_cid: receipt.receipt_cid },
    };
    const envelope = {
      schema: APP_RESULT_ENVELOPE_SCHEMA,
      status: input.status,
      summary: input.summary,
      output: input.output,
      ...(input.error ? { error: input.error } : {}),
      artifact_refs: [],
      receipt_refs: [receipt],
      event_dag_refs: [event],
      policy,
      trace,
    };
    this.lastEnvelope = envelope;
    window.__lastSwissKnifeCapabilityEnvelope = envelope;
    return envelope;
  }
}

export function getBrowserAppCapabilityGateway(options = {}) {
  if (!window.__swissKnifeCapabilityGateway) {
    window.__swissKnifeCapabilityGateway = new BrowserAppCapabilityGateway(options);
    window.swissKnifeCapabilityGateway = window.__swissKnifeCapabilityGateway;
  }
  window.__swissKnifeCapabilityGateway.setDesktop(options.desktop);
  return window.__swissKnifeCapabilityGateway;
}

export function formatAppCapabilityEnvelope(envelope) {
  return JSON.stringify({
    schema: envelope.schema,
    status: envelope.status,
    summary: envelope.summary,
    output: envelope.output,
    error: envelope.error,
    policy: envelope.policy,
    trace: envelope.trace,
    receipt_refs: envelope.receipt_refs,
    event_dag_refs: envelope.event_dag_refs,
  }, null, 2);
}

export function renderAppCapabilityEnvelopeHTML(envelope) {
  const borderColor = envelope.status === 'ok' ? '#16a34a' : envelope.status === 'degraded' ? '#d97706' : '#dc2626';
  return `
    <div class="app-capability-envelope" data-capability-id="${escapeHTML(envelope.trace.capability_id)}" data-envelope-status="${escapeHTML(envelope.status)}" style="border:1px solid ${borderColor};border-radius:6px;padding:12px;background:#fff7ed;color:#1f2937;">
      <div style="font-weight:600;margin-bottom:6px;">App Capability Envelope: ${escapeHTML(envelope.status)}</div>
      <div style="font-size:12px;margin-bottom:8px;">${escapeHTML(envelope.summary)}</div>
      <pre style="white-space:pre-wrap;overflow:auto;font-size:11px;background:#111827;color:#e5e7eb;padding:10px;border-radius:4px;">${escapeHTML(formatAppCapabilityEnvelope(envelope))}</pre>
    </div>
  `;
}

async function callFirst(api, paths, args) {
  for (const path of paths) {
    const fn = methodAt(api, path);
    if (typeof fn === 'function') {
      return await fn.apply(parentAt(api, path), args);
    }
  }
  throw new Error(`IPFS API does not expose any of: ${paths.map(path => path.join('.')).join(', ')}`);
}

function methodAt(api, path) {
  let cursor = api;
  for (const key of path) {
    if (!cursor) return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

function parentAt(api, path) {
  let cursor = api;
  for (const key of path.slice(0, -1)) {
    cursor = cursor?.[key];
  }
  return cursor || api;
}

async function readMaybeIterable(value) {
  if (value && typeof value[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    for await (const chunk of value) chunks.push(chunk);
    return { content: decodeChunks(chunks), chunks: chunks.length };
  }
  return value;
}

async function normalizeListResult(value) {
  if (value && typeof value[Symbol.asyncIterator] === 'function') {
    const items = [];
    for await (const item of value) items.push(normalizeIPFSItem(item));
    return { items };
  }
  if (Array.isArray(value)) return { items: value.map(normalizeIPFSItem) };
  if (Array.isArray(value?.items)) return { ...value, items: value.items.map(normalizeIPFSItem) };
  if (Array.isArray(value?.pins)) return { ...value, pins: value.pins.map(normalizeIPFSItem) };
  return value;
}

function normalizeIPFSItem(item) {
  if (typeof item === 'string') return { hash: item, cid: item, name: item, type: 'cid' };
  const cid = item?.cid?.toString?.() || item?.hash || item?.cid || item?.path || item?.peer;
  return {
    ...item,
    hash: cid || item?.name || 'unknown',
    cid,
    name: item?.name || item?.path || cid || 'IPFS item',
    type: item?.type === 1 ? 'directory' : item?.type || 'document',
  };
}

function normalizeAddResult(value) {
  const cid = value?.cid?.toString?.() || value?.cid || value?.hash || value?.path;
  return { ...value, cid, hash: cid };
}

function decodeChunks(chunks) {
  try {
    const decoder = new TextDecoder();
    return chunks.map(chunk => (
      typeof chunk === 'string' ? chunk : decoder.decode(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk))
    )).join('');
  } catch {
    return chunks.map(chunk => String(chunk)).join('');
  }
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
