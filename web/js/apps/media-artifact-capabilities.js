import { getBrowserAppCapabilityGateway } from '../core/app-capability-gateway.js';

export const MEDIA_ARTIFACT_WORKFLOW_SCHEMA = 'swissknife.media-artifact-workflow.v1';

export const MEDIA_ARTIFACT_CAPABILITIES = Object.freeze({
  inferenceJob: 'ipfs.accelerate.operation.run_inference_job',
  jobStatus: 'ipfs.accelerate.operation.job_status',
  telemetry: 'ipfs.accelerate.operation.telemetry',
  artifactStorage: 'ipfs.kit.tool.ipfs_add',
  artifactPin: 'ipfs.kit.tool.pin_add',
  provenance: 'ipfs.datasets.operation.record_provenance',
});

export function describeMediaArtifactCapabilities(appId, overrides = {}) {
  return {
    app_id: appId,
    workflow_schema: MEDIA_ARTIFACT_WORKFLOW_SCHEMA,
    inference_job: overrides.inferenceJob || MEDIA_ARTIFACT_CAPABILITIES.inferenceJob,
    job_status: overrides.jobStatus || MEDIA_ARTIFACT_CAPABILITIES.jobStatus,
    telemetry: overrides.telemetry || MEDIA_ARTIFACT_CAPABILITIES.telemetry,
    artifact_storage: overrides.artifactStorage || MEDIA_ARTIFACT_CAPABILITIES.artifactStorage,
    artifact_pin: overrides.artifactPin || MEDIA_ARTIFACT_CAPABILITIES.artifactPin,
    provenance: overrides.provenance || MEDIA_ARTIFACT_CAPABILITIES.provenance,
    media_refs: 'result.media_refs[].cid',
    progress_envelopes: ['job_status', 'telemetry'],
    fallback_strategy: 'descriptor-backed degraded envelopes with content-addressed media refs',
  };
}

export async function runMediaArtifactWorkflow({
  desktop = null,
  appId,
  mediaType = 'media',
  mimeType = 'application/octet-stream',
  operation = 'process-media',
  model = 'media-processing',
  prompt = 'Process SwissKnife media artifact',
  artifact = {},
  datasetId,
  jobId,
} = {}) {
  if (!appId) throw new Error('runMediaArtifactWorkflow requires appId.');

  const gateway = getBrowserAppCapabilityGateway({ desktop });
  const correlationPrefix = `${appId}-${Date.now()}`;
  const normalizedArtifact = normalizeArtifact(artifact, appId, mediaType, mimeType, operation);

  const inferenceJob = await invokeGateway(gateway, appId, MEDIA_ARTIFACT_CAPABILITIES.inferenceJob, {
    model,
    input: prompt,
    media_type: mediaType,
    operation,
    max_tokens: 96,
  }, `${correlationPrefix}-inference-job`);

  const resolvedJobId = jobId
    || jobIdFromEnvelope(inferenceJob)
    || inferenceJob.receipt_refs?.[0]?.receipt_cid
    || `browser:${appId}:pending-media-job`;

  const jobStatus = await invokeGateway(gateway, appId, MEDIA_ARTIFACT_CAPABILITIES.jobStatus, {
    job_id: resolvedJobId,
    include_progress: true,
  }, `${correlationPrefix}-job-status`);

  const telemetry = await invokeGateway(gateway, appId, MEDIA_ARTIFACT_CAPABILITIES.telemetry, {
    window: '5m',
    job_id: resolvedJobId,
    media_type: mediaType,
  }, `${correlationPrefix}-telemetry`);

  const artifactStorage = await invokeGateway(gateway, appId, MEDIA_ARTIFACT_CAPABILITIES.artifactStorage, {
    content: JSON.stringify({
      ...normalizedArtifact,
      generated_by: appId,
      operation,
      job_id: resolvedJobId,
    }, null, 2),
    filename: normalizedArtifact.filename,
    pin: true,
    metadata: normalizedArtifact.metadata,
  }, `${correlationPrefix}-artifact-storage`);

  const mediaCid = cidFromEnvelope(artifactStorage)
    || artifactStorage.receipt_refs?.[0]?.receipt_cid
    || `browser:${appId}:media-artifact`;

  const artifactPin = await invokeGateway(gateway, appId, MEDIA_ARTIFACT_CAPABILITIES.artifactPin, {
    cid: mediaCid,
    path: mediaCid,
    media_type: mediaType,
  }, `${correlationPrefix}-artifact-pin`);

  const provenance = await invokeGateway(gateway, appId, MEDIA_ARTIFACT_CAPABILITIES.provenance, {
    dataset_id: datasetId || `swissknife-${appId}-media`,
    app_id: appId,
    operation,
    subject_id: mediaCid,
    subject_type: mediaType,
    artifact_cid: mediaCid,
    metadata: {
      media_type: mediaType,
      mime_type: mimeType,
      model,
      job_id: resolvedJobId,
      storage_receipt_cid: artifactStorage.receipt_refs?.[0]?.receipt_cid,
      pin_receipt_cid: artifactPin.receipt_refs?.[0]?.receipt_cid,
    },
    recorded_at: new Date().toISOString(),
  }, `${correlationPrefix}-provenance`);

  const envelopes = {
    inference_job: inferenceJob,
    job_status: jobStatus,
    telemetry,
    artifact_storage: artifactStorage,
    artifact_pin: artifactPin,
    provenance,
  };
  const envelopeList = Object.values(envelopes);
  const mediaRefs = [{
    cid: mediaCid,
    name: normalizedArtifact.name,
    filename: normalizedArtifact.filename,
    media_type: mediaType,
    mime_type: mimeType,
    job_id: resolvedJobId,
    storage_receipt_cid: artifactStorage.receipt_refs?.[0]?.receipt_cid,
    pin_receipt_cid: artifactPin.receipt_refs?.[0]?.receipt_cid,
  }];

  const result = {
    schema: MEDIA_ARTIFACT_WORKFLOW_SCHEMA,
    app_id: appId,
    status: workflowStatus(envelopeList),
    capabilities: describeMediaArtifactCapabilities(appId),
    media_type: mediaType,
    operation,
    model,
    job_id: resolvedJobId,
    media_refs: mediaRefs,
    progress_envelopes: [jobStatus, telemetry],
    ...envelopes,
    receipt_refs: collectRefs(envelopeList, 'receipt_refs'),
    event_dag_refs: collectRefs(envelopeList, 'event_dag_refs'),
    fallback: envelopeList.some(envelope => envelope.status !== 'ok'),
  };

  publishLastWorkflowResult(appId, result);
  return result;
}

export function mediaArtifactFilename(name, extension = 'json') {
  const basename = String(name || 'media-artifact')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'media-artifact';
  return `${basename}.${extension.replace(/^\./, '')}`;
}

async function invokeGateway(gateway, appId, capabilityId, input, correlationId) {
  return gateway.invoke({
    app_id: appId,
    capability_id: capabilityId,
    input,
    correlation_id: correlationId,
  });
}

function normalizeArtifact(artifact, appId, mediaType, mimeType, operation) {
  const source = artifact && typeof artifact === 'object' ? artifact : { content: artifact };
  const name = source.name || source.title || `${appId}-${operation}`;
  return {
    id: String(source.id || name),
    name,
    filename: source.filename || mediaArtifactFilename(name),
    media_type: mediaType,
    mime_type: mimeType,
    content: source.content || source.data || `${mediaType} artifact generated by ${appId}`,
    metadata: {
      source_app: appId,
      operation,
      ...(source.metadata || {}),
    },
  };
}

function jobIdFromEnvelope(envelope) {
  const output = envelope?.output || {};
  return output.job_id || output.id || output.task_id || null;
}

function cidFromEnvelope(envelope) {
  const output = envelope?.output || {};
  return output.cid || output.hash || output.path || output.receipt_cid || null;
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
  window.__lastMediaArtifactWorkflow = result;
  window.__lastMediaArtifactWorkflows = window.__lastMediaArtifactWorkflows || {};
  window.__lastMediaArtifactWorkflows[appId] = result;
}
