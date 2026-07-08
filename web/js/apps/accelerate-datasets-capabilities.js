import { getBrowserAppCapabilityGateway } from '../core/app-capability-gateway.js';

export const ACCELERATE_DATASETS_WORKFLOW_SCHEMA = 'swissknife.accelerate-datasets-workflow.v1';

export const ACCELERATE_DATASETS_CAPABILITIES = Object.freeze({
  modelDiscovery: 'ipfs.accelerate.operation.list_models',
  hardwareProfile: 'ipfs.accelerate.operation.hardware_profile',
  inferenceJob: 'ipfs.accelerate.operation.run_inference_job',
  jobStatus: 'ipfs.accelerate.operation.job_status',
  telemetry: 'ipfs.accelerate.operation.telemetry',
  datasetDiscovery: 'ipfs.datasets.operation.list_datasets',
  embedding: 'ipfs.datasets.operation.embed',
  vectorSearch: 'ipfs.datasets.operation.vector_search',
  semanticSearch: 'ipfs.datasets.operation.semantic_search',
  provenance: 'ipfs.datasets.operation.record_provenance',
});

export function describeAccelerateDatasetsCapabilities(appId, overrides = {}) {
  return {
    app_id: appId,
    workflow_schema: ACCELERATE_DATASETS_WORKFLOW_SCHEMA,
    model_discovery: overrides.modelDiscovery || ACCELERATE_DATASETS_CAPABILITIES.modelDiscovery,
    hardware_profile: overrides.hardwareProfile || ACCELERATE_DATASETS_CAPABILITIES.hardwareProfile,
    inference_job: overrides.inferenceJob || ACCELERATE_DATASETS_CAPABILITIES.inferenceJob,
    job_status: overrides.jobStatus || ACCELERATE_DATASETS_CAPABILITIES.jobStatus,
    telemetry: overrides.telemetry || ACCELERATE_DATASETS_CAPABILITIES.telemetry,
    dataset_discovery: overrides.datasetDiscovery || ACCELERATE_DATASETS_CAPABILITIES.datasetDiscovery,
    embedding: overrides.embedding || ACCELERATE_DATASETS_CAPABILITIES.embedding,
    vector_search: overrides.vectorSearch || ACCELERATE_DATASETS_CAPABILITIES.vectorSearch,
    semantic_search: overrides.semanticSearch || ACCELERATE_DATASETS_CAPABILITIES.semanticSearch,
    provenance: overrides.provenance || ACCELERATE_DATASETS_CAPABILITIES.provenance,
    progress_envelopes: ['job_status', 'telemetry'],
    fallback_strategy: 'descriptor-backed degraded envelopes with job progress receipts',
  };
}

export async function runAccelerateDatasetsWorkflow({
  desktop = null,
  appId,
  task = 'inference',
  model = 'llama-3.1-8b',
  provider = 'local',
  input = 'SwissKnife accelerate datasets workflow',
  datasetQuery = 'swissknife',
  datasetId,
  collection,
  maxTokens = 128,
  jobId,
  provenance = {},
} = {}) {
  if (!appId) throw new Error('runAccelerateDatasetsWorkflow requires appId.');

  const gateway = getBrowserAppCapabilityGateway({ desktop });
  const correlationPrefix = `${appId}-${Date.now()}`;
  const normalizedDatasetId = datasetId || `swissknife-${appId}-datasets`;
  const normalizedCollection = collection || `swissknife-${appId}`;
  const textInput = typeof input === 'string' ? input : JSON.stringify(input);

  const modelDiscovery = await invokeGateway(gateway, appId, ACCELERATE_DATASETS_CAPABILITIES.modelDiscovery, {
    task,
    provider,
    query: model,
  }, `${correlationPrefix}-model-discovery`);

  const hardwareProfile = await invokeGateway(gateway, appId, ACCELERATE_DATASETS_CAPABILITIES.hardwareProfile, {
    task,
    model,
  }, `${correlationPrefix}-hardware-profile`);

  const datasetDiscovery = await invokeGateway(gateway, appId, ACCELERATE_DATASETS_CAPABILITIES.datasetDiscovery, {
    dataset_id: normalizedDatasetId,
    query: datasetQuery,
    limit: 10,
  }, `${correlationPrefix}-dataset-discovery`);

  const embedding = await invokeGateway(gateway, appId, ACCELERATE_DATASETS_CAPABILITIES.embedding, {
    texts: [textInput],
    model_name: model,
    dataset_id: normalizedDatasetId,
  }, `${correlationPrefix}-embedding`);

  const vectorSearch = await invokeGateway(gateway, appId, ACCELERATE_DATASETS_CAPABILITIES.vectorSearch, {
    query: datasetQuery || textInput,
    collection: normalizedCollection,
    top_k: 5,
  }, `${correlationPrefix}-vector-search`);

  const semanticSearch = await invokeGateway(gateway, appId, ACCELERATE_DATASETS_CAPABILITIES.semanticSearch, {
    query: datasetQuery || textInput,
    top_k: 5,
    filters: { app_id: appId, task },
  }, `${correlationPrefix}-semantic-search`);

  const inferenceJob = await invokeGateway(gateway, appId, ACCELERATE_DATASETS_CAPABILITIES.inferenceJob, {
    model,
    input: textInput,
    max_tokens: maxTokens,
    dataset_id: normalizedDatasetId,
    collection: normalizedCollection,
    task,
  }, `${correlationPrefix}-inference-job`);

  const resolvedJobId = jobId
    || jobIdFromEnvelope(inferenceJob)
    || inferenceJob.receipt_refs?.[0]?.receipt_cid
    || `browser:${appId}:pending-job`;

  const jobStatus = await invokeGateway(gateway, appId, ACCELERATE_DATASETS_CAPABILITIES.jobStatus, {
    job_id: resolvedJobId,
    include_progress: true,
  }, `${correlationPrefix}-job-status`);

  const telemetry = await invokeGateway(gateway, appId, ACCELERATE_DATASETS_CAPABILITIES.telemetry, {
    window: '5m',
    job_id: resolvedJobId,
    model,
  }, `${correlationPrefix}-telemetry`);

  const provenanceEnvelope = await invokeGateway(gateway, appId, ACCELERATE_DATASETS_CAPABILITIES.provenance, {
    dataset_id: normalizedDatasetId,
    app_id: appId,
    operation: provenance.action || 'accelerate_datasets.workflow',
    subject_id: provenance.subject_id || resolvedJobId,
    subject_type: provenance.subject_type || 'accelerate-job',
    artifact_cid: resolvedJobId,
    metadata: {
      task,
      model,
      provider,
      collection: normalizedCollection,
      dataset_query: datasetQuery,
      progress_envelope_count: 2,
      ...(provenance.metadata || {}),
    },
    receipt_refs: collectRefs([modelDiscovery, hardwareProfile, datasetDiscovery, embedding, vectorSearch, semanticSearch, inferenceJob, jobStatus, telemetry], 'receipt_refs'),
    recorded_at: new Date().toISOString(),
  }, `${correlationPrefix}-provenance`);

  const envelopes = {
    model_discovery: modelDiscovery,
    hardware_profile: hardwareProfile,
    dataset_discovery: datasetDiscovery,
    embedding,
    vector_search: vectorSearch,
    semantic_search: semanticSearch,
    inference_job: inferenceJob,
    job_status: jobStatus,
    telemetry,
    provenance: provenanceEnvelope,
  };
  const envelopeList = Object.values(envelopes);
  const result = {
    schema: ACCELERATE_DATASETS_WORKFLOW_SCHEMA,
    app_id: appId,
    status: workflowStatus(envelopeList),
    capabilities: describeAccelerateDatasetsCapabilities(appId),
    task,
    model,
    provider,
    dataset_id: normalizedDatasetId,
    collection: normalizedCollection,
    job_id: resolvedJobId,
    progress_envelopes: [jobStatus, telemetry],
    ...envelopes,
    receipt_refs: collectRefs(envelopeList, 'receipt_refs'),
    event_dag_refs: collectRefs(envelopeList, 'event_dag_refs'),
    fallback: envelopeList.some(envelope => envelope.status !== 'ok'),
  };

  publishLastWorkflowResult(appId, result);
  return result;
}

async function invokeGateway(gateway, appId, capabilityId, input, correlationId) {
  return gateway.invoke({
    app_id: appId,
    capability_id: capabilityId,
    input,
    correlation_id: correlationId,
  });
}

function jobIdFromEnvelope(envelope) {
  const output = envelope?.output || {};
  return output.job_id
    || output.id
    || output.task_id
    || output.fallback?.input?.job_id
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
  window.__lastAccelerateDatasetsWorkflow = result;
  window.__lastAccelerateDatasetsWorkflows = window.__lastAccelerateDatasetsWorkflows || {};
  window.__lastAccelerateDatasetsWorkflows[appId] = result;
}
