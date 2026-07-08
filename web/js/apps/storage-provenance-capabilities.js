import { getBrowserAppCapabilityGateway } from '../core/app-capability-gateway.js';

export const STORAGE_PROVENANCE_WORKFLOW_SCHEMA = 'swissknife.storage-provenance-workflow.v1';

export const STORAGE_PROVENANCE_CAPABILITIES = Object.freeze({
  storage: 'ipfs.kit.tool.ipfs_add',
  dagStorage: 'ipfs.kit.tool.dag_put',
  datasetDiscovery: 'ipfs.datasets.operation.browse',
  provenance: 'ipfs.datasets.operation.record_provenance',
});

export function describeStorageProvenanceCapabilities(appId, overrides = {}) {
  return {
    app_id: appId,
    workflow_schema: STORAGE_PROVENANCE_WORKFLOW_SCHEMA,
    storage: overrides.storage || STORAGE_PROVENANCE_CAPABILITIES.storage,
    cid: overrides.cid || 'gateway.storage.output.cid|gateway.storage.receipt_refs[0].receipt_cid',
    dataset_discovery: overrides.datasetDiscovery || STORAGE_PROVENANCE_CAPABILITIES.datasetDiscovery,
    provenance: overrides.provenance || STORAGE_PROVENANCE_CAPABILITIES.provenance,
    fallback_strategy: 'descriptor-backed degraded envelopes with receipt and event DAG refs',
  };
}

export async function runStorageProvenanceWorkflow({
  desktop = null,
  appId,
  artifact,
  provenance = {},
  dataset = {},
  storageCapabilityId = STORAGE_PROVENANCE_CAPABILITIES.storage,
  datasetDiscoveryCapabilityId = STORAGE_PROVENANCE_CAPABILITIES.datasetDiscovery,
  provenanceCapabilityId = STORAGE_PROVENANCE_CAPABILITIES.provenance,
} = {}) {
  if (!appId) throw new Error('runStorageProvenanceWorkflow requires appId.');

  const normalizedArtifact = normalizeArtifact(artifact, appId);
  const datasetId = dataset.dataset_id || dataset.datasetId || `swissknife-${appId}`;
  const gateway = getBrowserAppCapabilityGateway({ desktop });
  const correlationPrefix = `${appId}-${Date.now()}`;

  const storage = await gateway.invoke({
    app_id: appId,
    capability_id: storageCapabilityId,
    input: storageInputForCapability(storageCapabilityId, normalizedArtifact),
    correlation_id: `${correlationPrefix}-storage`,
  });
  const cidRef = cidFromEnvelope(storage) || storage.receipt_refs?.[0]?.receipt_cid || null;

  const datasetDiscovery = await gateway.invoke({
    app_id: appId,
    capability_id: datasetDiscoveryCapabilityId,
    input: {
      dataset_id: datasetId,
      root_cid: dataset.root_cid || dataset.rootCid || cidRef || `browser:${appId}:pending-cid`,
      path: dataset.path || `/${appId}`,
      limit: dataset.limit || 20,
      query: dataset.query || normalizedArtifact.title || normalizedArtifact.id,
      artifact_type: normalizedArtifact.type,
    },
    correlation_id: `${correlationPrefix}-dataset-discovery`,
  });

  const provenanceEnvelope = await gateway.invoke({
    app_id: appId,
    capability_id: provenanceCapabilityId,
    input: {
      dataset_id: datasetId,
      app_id: appId,
      operation: provenance.action || 'storage_provenance.record',
      subject_id: provenance.subject_id || normalizedArtifact.id,
      subject_type: provenance.subject_type || normalizedArtifact.type,
      artifact_cid: cidRef,
      artifact_title: normalizedArtifact.title,
      artifact_type: normalizedArtifact.type,
      storage_receipt_refs: storage.receipt_refs || [],
      dataset_receipt_refs: datasetDiscovery.receipt_refs || [],
      metadata: {
        ...(normalizedArtifact.metadata || {}),
        ...(provenance.metadata || {}),
      },
      recorded_at: new Date().toISOString(),
    },
    correlation_id: `${correlationPrefix}-provenance`,
  });

  const envelopes = [storage, datasetDiscovery, provenanceEnvelope];
  const result = {
    schema: STORAGE_PROVENANCE_WORKFLOW_SCHEMA,
    app_id: appId,
    status: workflowStatus(envelopes),
    capabilities: describeStorageProvenanceCapabilities(appId, {
      storage: storageCapabilityId,
      datasetDiscovery: datasetDiscoveryCapabilityId,
      provenance: provenanceCapabilityId,
    }),
    artifact: normalizedArtifact,
    dataset_id: datasetId,
    cid_ref: cidRef,
    storage,
    dataset_discovery: datasetDiscovery,
    provenance: provenanceEnvelope,
    receipt_refs: collectRefs(envelopes, 'receipt_refs'),
    event_dag_refs: collectRefs(envelopes, 'event_dag_refs'),
    fallback: envelopes.some(envelope => envelope.status !== 'ok'),
  };

  publishLastWorkflowResult(appId, result);
  return result;
}

export function sanitizeArtifactFilename(title, extension = 'json') {
  const basename = String(title || 'swissknife-artifact')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'swissknife-artifact';
  return `${basename}.${extension.replace(/^\./, '')}`;
}

function normalizeArtifact(artifact, appId) {
  const source = artifact && typeof artifact === 'object' ? artifact : { content: artifact };
  const id = String(source.id || source.path || source.name || `${appId}-artifact`);
  const title = source.title || source.name || id;
  return {
    id,
    title,
    type: source.type || 'application-artifact',
    filename: source.filename || sanitizeArtifactFilename(title),
    content: source.content ?? source.body ?? source.text ?? JSON.stringify(toSerializable(source), null, 2),
    metadata: {
      ...(source.metadata || {}),
      source_app: appId,
    },
  };
}

function storageInputForCapability(capabilityId, artifact) {
  if (capabilityId === STORAGE_PROVENANCE_CAPABILITIES.dagStorage) {
    return {
      data: {
        id: artifact.id,
        title: artifact.title,
        type: artifact.type,
        content: artifact.content,
        metadata: artifact.metadata,
      },
      pin: true,
    };
  }

  return {
    content: typeof artifact.content === 'string' ? artifact.content : JSON.stringify(artifact.content),
    filename: artifact.filename,
    pin: true,
    metadata: artifact.metadata,
  };
}

function cidFromEnvelope(envelope) {
  const output = envelope?.output || {};
  return output.cid
    || output.hash
    || output.path
    || output.dataset_cid
    || output.provenance_cid
    || output.receipt_cid
    || null;
}

function workflowStatus(envelopes) {
  if (envelopes.some(envelope => envelope.status === 'error')) return 'error';
  if (envelopes.some(envelope => envelope.status === 'degraded')) return 'degraded';
  return 'ok';
}

function collectRefs(envelopes, key) {
  return envelopes.flatMap(envelope => Array.isArray(envelope?.[key]) ? envelope[key] : []);
}

function publishLastWorkflowResult(appId, result) {
  if (typeof window === 'undefined') return;
  window.__lastStorageProvenanceWorkflow = result;
  window.__lastStorageProvenanceWorkflows = window.__lastStorageProvenanceWorkflows || {};
  window.__lastStorageProvenanceWorkflows[appId] = result;
}

function toSerializable(value) {
  return JSON.parse(JSON.stringify(value, (_key, entry) => {
    if (entry instanceof Date) return entry.toISOString();
    return entry;
  }));
}
