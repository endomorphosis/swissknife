import {
  APP_RESULT_ENVELOPE_SCHEMA,
  type AppArtifactRef,
  type AppEventDagRef,
  type AppReceiptRef,
} from './app-result-envelope.js';
import {
  getIPFSAppCapabilityRegistry,
  type IPFSAppCapabilityRegistry,
  type IPFSAppCapabilityServiceFamily,
} from './ipfs-app-capability-registry.js';
import {
  VIRTUAL_DESKTOP_APP_MANIFEST,
  type VirtualDesktopAppManifest,
} from './virtual-desktop-app-manifest.js';

export const COMPOSITE_APP_DESCRIPTOR_CATALOG_ID =
  'org.hallucinate.swissknife.composite-app-descriptors';

export type CompositeAppWorkflowId =
  | 'file-manager.pin-selected-file'
  | 'ai-chat.answer-with-cited-dataset-context'
  | 'training-manager.train-with-dataset'
  | 'neural-photoshop.generate-and-store-media'
  | 'task-manager.monitor-accelerate-jobs';

export type CompositeWorkflowStepKind =
  | 'read'
  | 'write'
  | 'heavy_compute'
  | 'provenance'
  | 'monitor';

export interface CompositeWorkflowStepDescriptor {
  step_id: string;
  title: string;
  kind: CompositeWorkflowStepKind;
  app_id: string;
  service_family: IPFSAppCapabilityServiceFamily;
  capability_id: string;
  descriptor_pack_id: string;
  operation: string;
  input_schema: Record<string, unknown>;
  result_schema: Record<string, unknown>;
  depends_on: readonly string[];
  reads: readonly string[];
  writes: readonly string[];
  receipt_required: boolean;
  event_dag_required: boolean;
  rollback_step_id?: string;
}

export interface CompositeWorkflowReceiptLineage {
  required_step_ids: readonly string[];
  parent_links: readonly {
    step_id: string;
    parent_step_ids: readonly string[];
  }[];
  receipt_refs_field: 'receipt_refs';
  event_dag_refs_field: 'event_dag_refs';
}

export interface CompositeWorkflowResultEnvelopeContract {
  schema: typeof APP_RESULT_ENVELOPE_SCHEMA;
  output_schema: Record<string, unknown>;
  artifact_refs: readonly AppArtifactRef['kind'][];
  receipt_refs: readonly AppReceiptRef['receipt_schema'][];
  event_dag_refs: readonly AppEventDagRef['event_type'][];
  required_output_fields: readonly string[];
}

export interface CompositeAppDescriptor {
  workflow_id: CompositeAppWorkflowId;
  app_id: string;
  title: string;
  summary: string;
  trigger_intent: string;
  service_families: readonly IPFSAppCapabilityServiceFamily[];
  input_schema: Record<string, unknown>;
  steps: readonly CompositeWorkflowStepDescriptor[];
  result_envelope: CompositeWorkflowResultEnvelopeContract;
  receipt_lineage: CompositeWorkflowReceiptLineage;
  desktop_renderer: string;
  glasses_summary: string;
  fallback_strategy: string;
}

export interface CompositeAppDescriptorCatalog {
  catalog_id: typeof COMPOSITE_APP_DESCRIPTOR_CATALOG_ID;
  version: string;
  generated_from: readonly string[];
  descriptors: readonly CompositeAppDescriptor[];
}

export interface CompositeAppDescriptorValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const OBJECT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
};

const CID_REF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cid: { type: 'string' },
    uri: { type: 'string' },
    media_type: { type: 'string' },
    size_bytes: { type: 'number' },
  },
  required: ['cid'],
};

export function getCompositeAppDescriptorCatalog(): CompositeAppDescriptorCatalog {
  return {
    catalog_id: COMPOSITE_APP_DESCRIPTOR_CATALOG_ID,
    version: VIRTUAL_DESKTOP_APP_MANIFEST.version,
    generated_from: [
      VIRTUAL_DESKTOP_APP_MANIFEST.manifest_id,
      getIPFSAppCapabilityRegistry().registry_id,
      APP_RESULT_ENVELOPE_SCHEMA,
    ],
    descriptors: COMPOSITE_APP_DESCRIPTORS,
  };
}

export function getCompositeAppDescriptor(
  workflowId: CompositeAppWorkflowId,
  catalog: CompositeAppDescriptorCatalog = getCompositeAppDescriptorCatalog(),
): CompositeAppDescriptor | null {
  return catalog.descriptors.find(descriptor => descriptor.workflow_id === workflowId) ?? null;
}

export function validateCompositeAppDescriptorCatalog(
  catalog: CompositeAppDescriptorCatalog = getCompositeAppDescriptorCatalog(),
  manifest: VirtualDesktopAppManifest = VIRTUAL_DESKTOP_APP_MANIFEST,
  registry: IPFSAppCapabilityRegistry = getIPFSAppCapabilityRegistry(manifest),
): CompositeAppDescriptorValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const appIds = new Set(manifest.apps.map(app => app.id));
  const capabilityKeys = new Set(
    registry.capabilities.map(capability => `${capability.app_id}::${capability.capability_id}`),
  );
  const seenWorkflows = new Set<string>();

  for (const descriptor of catalog.descriptors) {
    if (seenWorkflows.has(descriptor.workflow_id)) {
      errors.push(`Duplicate composite workflow: ${descriptor.workflow_id}`);
    }
    seenWorkflows.add(descriptor.workflow_id);

    if (!appIds.has(descriptor.app_id)) {
      errors.push(`${descriptor.workflow_id}: unknown app ${descriptor.app_id}`);
    }
    if (descriptor.steps.length < 2) {
      errors.push(`${descriptor.workflow_id}: expected at least two workflow steps`);
    }
    if (descriptor.result_envelope.schema !== APP_RESULT_ENVELOPE_SCHEMA) {
      errors.push(`${descriptor.workflow_id}: result envelope schema mismatch`);
    }
    if (!descriptor.result_envelope.required_output_fields.includes('receipt_lineage')) {
      errors.push(`${descriptor.workflow_id}: result envelope must require receipt_lineage`);
    }
    if (!descriptor.result_envelope.required_output_fields.includes('step_results')) {
      errors.push(`${descriptor.workflow_id}: result envelope must require step_results`);
    }

    validateWorkflowSteps(descriptor, capabilityKeys, errors);
    validateReceiptLineage(descriptor, errors);
  }

  for (const required of REQUIRED_COMPOSITE_WORKFLOWS) {
    if (!seenWorkflows.has(required)) {
      errors.push(`Missing composite workflow: ${required}`);
    }
  }

  if (catalog.descriptors.length !== REQUIRED_COMPOSITE_WORKFLOWS.length) {
    warnings.push(`Catalog has ${catalog.descriptors.length}/${REQUIRED_COMPOSITE_WORKFLOWS.length} expected workflows`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

const REQUIRED_COMPOSITE_WORKFLOWS: readonly CompositeAppWorkflowId[] = [
  'file-manager.pin-selected-file',
  'ai-chat.answer-with-cited-dataset-context',
  'training-manager.train-with-dataset',
  'neural-photoshop.generate-and-store-media',
  'task-manager.monitor-accelerate-jobs',
];

export const COMPOSITE_APP_DESCRIPTORS: readonly CompositeAppDescriptor[] = [
  {
    workflow_id: 'file-manager.pin-selected-file',
    app_id: 'file-manager',
    title: 'File Manager: pin selected file',
    summary: 'Add the selected file to ipfs_kit_py and record dataset provenance for the pinned CID.',
    trigger_intent: 'pin selected file to IPFS',
    service_families: ['ipfs_kit_py', 'ipfs_datasets_py'],
    input_schema: objectSchema({
      file_path: { type: 'string' },
      pin_name: { type: 'string' },
    }, ['file_path']),
    steps: [
      step({
        step_id: 'add-selected-file',
        title: 'Add selected file to IPFS',
        kind: 'write',
        app_id: 'file-manager',
        service_family: 'ipfs_kit_py',
        capability_id: 'ipfs.kit.storage',
        descriptor_pack_id: 'ipfs_kit_py.mcp_dashboard.descriptor_pack.v1',
        operation: 'ipfs_add',
        writes: ['output.cid', 'artifact_refs.cid'],
        result_schema: objectSchema({ cid: { type: 'string' }, uri: { type: 'string' } }, ['cid']),
      }),
      step({
        step_id: 'record-pin-provenance',
        title: 'Record pin provenance',
        kind: 'provenance',
        app_id: 'file-manager',
        service_family: 'ipfs_datasets_py',
        capability_id: 'ipfs.datasets.provenance',
        descriptor_pack_id: 'org.endomorphosis.ipfs_datasets_py.dataset-pack',
        operation: 'record_provenance',
        depends_on: ['add-selected-file'],
        reads: ['add-selected-file.cid'],
        writes: ['event_dag_refs.pin_recorded'],
        result_schema: provenanceResultSchema('pin_recorded'),
      }),
    ],
    result_envelope: resultEnvelopeContract({
      pinned_cid: { type: 'string' },
      pin_uri: { type: 'string' },
      step_results: stepResultsSchema(),
      receipt_lineage: receiptLineageSchema(),
    }, ['pinned_cid', 'step_results', 'receipt_lineage']),
    receipt_lineage: lineage(['add-selected-file', 'record-pin-provenance'], [
      ['record-pin-provenance', ['add-selected-file']],
    ]),
    desktop_renderer: 'file-manager.pin-result',
    glasses_summary: 'Pinned CID and provenance status.',
    fallback_strategy: 'mobile-card with CID copy action when services are unavailable',
  },
  {
    workflow_id: 'ai-chat.answer-with-cited-dataset-context',
    app_id: 'ai-chat',
    title: 'AI Chat: answer with cited dataset context',
    summary: 'Load dataset context, retrieve vector citations, run inference, and store the cited answer.',
    trigger_intent: 'answer with dataset citations',
    service_families: ['ipfs_datasets_py', 'ipfs_accelerate_py', 'ipfs_kit_py'],
    input_schema: objectSchema({
      question: { type: 'string' },
      dataset_id: { type: 'string' },
      top_k: { type: 'integer', minimum: 1 },
    }, ['question', 'dataset_id']),
    steps: [
      step({
        step_id: 'load-dataset-context',
        title: 'Load dataset context',
        kind: 'read',
        app_id: 'ai-chat',
        service_family: 'ipfs_datasets_py',
        capability_id: 'ipfs.datasets.discovery',
        descriptor_pack_id: 'org.endomorphosis.ipfs_datasets_py.dataset-pack',
        operation: 'load_dataset',
        result_schema: objectSchema({ dataset_id: { type: 'string' }, root_cid: { type: 'string' } }, ['dataset_id']),
      }),
      step({
        step_id: 'retrieve-citations',
        title: 'Retrieve vector citations',
        kind: 'heavy_compute',
        app_id: 'ai-chat',
        service_family: 'ipfs_datasets_py',
        capability_id: 'ipfs.datasets.vector',
        descriptor_pack_id: 'org.endomorphosis.ipfs_datasets_py.dataset-pack',
        operation: 'load_index',
        depends_on: ['load-dataset-context'],
        reads: ['load-dataset-context.dataset_id'],
        result_schema: objectSchema({
          citations: {
            type: 'array',
            items: citationSchema(),
          },
        }, ['citations']),
      }),
      step({
        step_id: 'run-cited-answer',
        title: 'Run cited answer inference',
        kind: 'heavy_compute',
        app_id: 'ai-chat',
        service_family: 'ipfs_accelerate_py',
        capability_id: 'ipfs.accelerate.inference',
        descriptor_pack_id: 'org.endomorphosis.ipfs_accelerate_py.compute-pack',
        operation: 'submit_task',
        depends_on: ['retrieve-citations'],
        reads: ['retrieve-citations.citations'],
        writes: ['output.answer', 'output.model_job_id'],
        result_schema: objectSchema({ answer: { type: 'string' }, job_id: { type: 'string' } }, ['answer']),
      }),
      step({
        step_id: 'store-cited-answer',
        title: 'Store cited answer artifact',
        kind: 'write',
        app_id: 'ai-chat',
        service_family: 'ipfs_kit_py',
        capability_id: 'ipfs.kit.storage',
        descriptor_pack_id: 'ipfs_kit_py.mcp_dashboard.descriptor_pack.v1',
        operation: 'ipfs_add',
        depends_on: ['run-cited-answer'],
        reads: ['run-cited-answer.answer'],
        writes: ['artifact_refs.answer_cid'],
        result_schema: objectSchema({ cid: { type: 'string' } }, ['cid']),
      }),
    ],
    result_envelope: resultEnvelopeContract({
      answer: { type: 'string' },
      citations: { type: 'array', items: citationSchema() },
      answer_cid: { type: 'string' },
      step_results: stepResultsSchema(),
      receipt_lineage: receiptLineageSchema(),
    }, ['answer', 'citations', 'step_results', 'receipt_lineage']),
    receipt_lineage: lineage([
      'load-dataset-context',
      'retrieve-citations',
      'run-cited-answer',
      'store-cited-answer',
    ], [
      ['retrieve-citations', ['load-dataset-context']],
      ['run-cited-answer', ['retrieve-citations']],
      ['store-cited-answer', ['run-cited-answer']],
    ]),
    desktop_renderer: 'ai-chat.cited-answer',
    glasses_summary: 'Answer status with top citation labels.',
    fallback_strategy: 'audio summary plus mobile-card citations when display space is constrained',
  },
  {
    workflow_id: 'training-manager.train-with-dataset',
    app_id: 'training-manager',
    title: 'Training Manager: train with dataset',
    summary: 'Load a dataset, submit a training job through accelerate, and store resulting model artifacts.',
    trigger_intent: 'train model with selected dataset',
    service_families: ['ipfs_datasets_py', 'ipfs_accelerate_py', 'ipfs_kit_py'],
    input_schema: objectSchema({
      dataset_id: { type: 'string' },
      model_id: { type: 'string' },
      training_config: OBJECT_SCHEMA,
    }, ['dataset_id', 'model_id']),
    steps: [
      step({
        step_id: 'load-training-dataset',
        title: 'Load training dataset',
        kind: 'read',
        app_id: 'training-manager',
        service_family: 'ipfs_datasets_py',
        capability_id: 'ipfs.datasets.discovery',
        descriptor_pack_id: 'org.endomorphosis.ipfs_datasets_py.dataset-pack',
        operation: 'load_dataset',
        result_schema: objectSchema({ dataset_id: { type: 'string' }, root_cid: { type: 'string' } }, ['dataset_id']),
      }),
      step({
        step_id: 'submit-training-job',
        title: 'Submit accelerate training job',
        kind: 'heavy_compute',
        app_id: 'training-manager',
        service_family: 'ipfs_accelerate_py',
        capability_id: 'ipfs.accelerate.jobs',
        descriptor_pack_id: 'org.endomorphosis.ipfs_accelerate_py.compute-pack',
        operation: 'submit_task',
        depends_on: ['load-training-dataset'],
        reads: ['load-training-dataset.root_cid'],
        writes: ['output.job_id'],
        result_schema: objectSchema({ job_id: { type: 'string' }, status: { type: 'string' } }, ['job_id', 'status']),
      }),
      step({
        step_id: 'store-model-artifact',
        title: 'Store model artifact',
        kind: 'write',
        app_id: 'training-manager',
        service_family: 'ipfs_kit_py',
        capability_id: 'ipfs.kit.storage',
        descriptor_pack_id: 'ipfs_kit_py.mcp_dashboard.descriptor_pack.v1',
        operation: 'ipfs_add',
        depends_on: ['submit-training-job'],
        reads: ['submit-training-job.job_id'],
        writes: ['artifact_refs.model_cid'],
        result_schema: objectSchema({ cid: { type: 'string' }, uri: { type: 'string' } }, ['cid']),
      }),
    ],
    result_envelope: resultEnvelopeContract({
      job_id: { type: 'string' },
      model_artifact: CID_REF_SCHEMA,
      step_results: stepResultsSchema(),
      receipt_lineage: receiptLineageSchema(),
    }, ['job_id', 'model_artifact', 'step_results', 'receipt_lineage']),
    receipt_lineage: lineage([
      'load-training-dataset',
      'submit-training-job',
      'store-model-artifact',
    ], [
      ['submit-training-job', ['load-training-dataset']],
      ['store-model-artifact', ['submit-training-job']],
    ]),
    desktop_renderer: 'training-manager.job-progress',
    glasses_summary: 'Training job id, progress, and artifact CID.',
    fallback_strategy: 'task-progress card with notification fallback',
  },
  {
    workflow_id: 'neural-photoshop.generate-and-store-media',
    app_id: 'neural-photoshop',
    title: 'Neural Photoshop: generate and store media',
    summary: 'Run image generation/editing through accelerate, monitor the job, and store media in IPFS.',
    trigger_intent: 'generate image and store artifact',
    service_families: ['ipfs_accelerate_py', 'ipfs_kit_py'],
    input_schema: objectSchema({
      prompt: { type: 'string' },
      source_image_cid: { type: 'string' },
      parameters: OBJECT_SCHEMA,
    }, ['prompt']),
    steps: [
      step({
        step_id: 'submit-media-generation',
        title: 'Submit media generation job',
        kind: 'heavy_compute',
        app_id: 'neural-photoshop',
        service_family: 'ipfs_accelerate_py',
        capability_id: 'ipfs.accelerate.inference',
        descriptor_pack_id: 'org.endomorphosis.ipfs_accelerate_py.compute-pack',
        operation: 'submit_task',
        writes: ['output.job_id'],
        result_schema: objectSchema({ job_id: { type: 'string' }, status: { type: 'string' } }, ['job_id']),
      }),
      step({
        step_id: 'monitor-generation-job',
        title: 'Monitor generation job',
        kind: 'monitor',
        app_id: 'neural-photoshop',
        service_family: 'ipfs_accelerate_py',
        capability_id: 'ipfs.accelerate.jobs',
        descriptor_pack_id: 'org.endomorphosis.ipfs_accelerate_py.compute-pack',
        operation: 'job_status',
        depends_on: ['submit-media-generation'],
        reads: ['submit-media-generation.job_id'],
        result_schema: objectSchema({ status: { type: 'string' }, artifact_uri: { type: 'string' } }, ['status']),
      }),
      step({
        step_id: 'store-generated-media',
        title: 'Store generated media artifact',
        kind: 'write',
        app_id: 'neural-photoshop',
        service_family: 'ipfs_kit_py',
        capability_id: 'ipfs.kit.storage',
        descriptor_pack_id: 'ipfs_kit_py.mcp_dashboard.descriptor_pack.v1',
        operation: 'ipfs_add',
        depends_on: ['monitor-generation-job'],
        reads: ['monitor-generation-job.artifact_uri'],
        writes: ['artifact_refs.media_cid'],
        result_schema: objectSchema({ cid: { type: 'string' }, media_type: { type: 'string' } }, ['cid']),
      }),
    ],
    result_envelope: resultEnvelopeContract({
      media: CID_REF_SCHEMA,
      job_id: { type: 'string' },
      step_results: stepResultsSchema(),
      receipt_lineage: receiptLineageSchema(),
    }, ['media', 'job_id', 'step_results', 'receipt_lineage']),
    receipt_lineage: lineage([
      'submit-media-generation',
      'monitor-generation-job',
      'store-generated-media',
    ], [
      ['monitor-generation-job', ['submit-media-generation']],
      ['store-generated-media', ['monitor-generation-job']],
    ]),
    desktop_renderer: 'neural-photoshop.generated-media',
    glasses_summary: 'Generation status and media CID.',
    fallback_strategy: 'media card with notification fallback and no raw pixels on glasses',
  },
  {
    workflow_id: 'task-manager.monitor-accelerate-jobs',
    app_id: 'task-manager',
    title: 'Task Manager: monitor accelerate jobs',
    summary: 'Poll accelerate job status and record provenance snapshots for task monitoring.',
    trigger_intent: 'monitor accelerate jobs',
    service_families: ['ipfs_accelerate_py', 'ipfs_datasets_py'],
    input_schema: objectSchema({
      job_id: { type: 'string' },
      poll_interval_ms: { type: 'integer', minimum: 250 },
    }, ['job_id']),
    steps: [
      step({
        step_id: 'poll-accelerate-job',
        title: 'Poll accelerate job',
        kind: 'monitor',
        app_id: 'task-manager',
        service_family: 'ipfs_accelerate_py',
        capability_id: 'ipfs.accelerate.jobs',
        descriptor_pack_id: 'org.endomorphosis.ipfs_accelerate_py.compute-pack',
        operation: 'job_status',
        reads: ['input.job_id'],
        writes: ['output.status', 'output.progress'],
        result_schema: objectSchema({
          job_id: { type: 'string' },
          status: { type: 'string' },
          progress: { type: 'number' },
        }, ['job_id', 'status']),
      }),
      step({
        step_id: 'record-job-provenance',
        title: 'Record job provenance snapshot',
        kind: 'provenance',
        app_id: 'task-manager',
        service_family: 'ipfs_datasets_py',
        capability_id: 'ipfs.datasets.provenance',
        descriptor_pack_id: 'org.endomorphosis.ipfs_datasets_py.dataset-pack',
        operation: 'record_provenance',
        depends_on: ['poll-accelerate-job'],
        reads: ['poll-accelerate-job.status', 'poll-accelerate-job.progress'],
        writes: ['event_dag_refs.job_status_recorded'],
        result_schema: provenanceResultSchema('job_status_recorded'),
      }),
    ],
    result_envelope: resultEnvelopeContract({
      job_id: { type: 'string' },
      status: { type: 'string' },
      progress: { type: 'number' },
      step_results: stepResultsSchema(),
      receipt_lineage: receiptLineageSchema(),
    }, ['job_id', 'status', 'step_results', 'receipt_lineage']),
    receipt_lineage: lineage(['poll-accelerate-job', 'record-job-provenance'], [
      ['record-job-provenance', ['poll-accelerate-job']],
    ]),
    desktop_renderer: 'task-manager.accelerate-monitor',
    glasses_summary: 'Job status, progress, and provenance receipt.',
    fallback_strategy: 'task-progress glasses card with audio summary fallback',
  },
];

function validateWorkflowSteps(
  descriptor: CompositeAppDescriptor,
  capabilityKeys: Set<string>,
  errors: string[],
): void {
  const seenSteps = new Set<string>();

  for (const stepDescriptor of descriptor.steps) {
    if (seenSteps.has(stepDescriptor.step_id)) {
      errors.push(`${descriptor.workflow_id}: duplicate step ${stepDescriptor.step_id}`);
    }
    seenSteps.add(stepDescriptor.step_id);

    if (stepDescriptor.app_id !== descriptor.app_id) {
      errors.push(`${descriptor.workflow_id}.${stepDescriptor.step_id}: step app mismatch`);
    }
    if (!descriptor.service_families.includes(stepDescriptor.service_family)) {
      errors.push(`${descriptor.workflow_id}.${stepDescriptor.step_id}: service family not declared`);
    }
    if (!capabilityKeys.has(`${stepDescriptor.app_id}::${stepDescriptor.capability_id}`)) {
      errors.push(`${descriptor.workflow_id}.${stepDescriptor.step_id}: missing capability ${stepDescriptor.capability_id}`);
    }
    if (stepDescriptor.input_schema.type !== 'object') {
      errors.push(`${descriptor.workflow_id}.${stepDescriptor.step_id}: input schema must be object`);
    }
    if (stepDescriptor.result_schema.type !== 'object') {
      errors.push(`${descriptor.workflow_id}.${stepDescriptor.step_id}: result schema must be object`);
    }
    for (const dependency of stepDescriptor.depends_on) {
      if (!seenSteps.has(dependency)) {
        errors.push(`${descriptor.workflow_id}.${stepDescriptor.step_id}: dependency must reference earlier step ${dependency}`);
      }
    }
    if (stepDescriptor.kind !== 'read' && !stepDescriptor.receipt_required) {
      errors.push(`${descriptor.workflow_id}.${stepDescriptor.step_id}: side-effect or monitor step must require receipt`);
    }
    if ((stepDescriptor.kind === 'write' || stepDescriptor.kind === 'provenance') && !stepDescriptor.event_dag_required) {
      errors.push(`${descriptor.workflow_id}.${stepDescriptor.step_id}: write/provenance step must require event DAG ref`);
    }
  }
}

function validateReceiptLineage(
  descriptor: CompositeAppDescriptor,
  errors: string[],
): void {
  const stepIds = new Set(descriptor.steps.map(stepDescriptor => stepDescriptor.step_id));
  const requiredReceiptSteps = descriptor.steps
    .filter(stepDescriptor => stepDescriptor.receipt_required)
    .map(stepDescriptor => stepDescriptor.step_id);
  const lineageRequired = [...descriptor.receipt_lineage.required_step_ids];

  for (const stepId of lineageRequired) {
    if (!stepIds.has(stepId)) {
      errors.push(`${descriptor.workflow_id}: receipt lineage references unknown step ${stepId}`);
    }
  }
  for (const stepId of requiredReceiptSteps) {
    if (!lineageRequired.includes(stepId)) {
      errors.push(`${descriptor.workflow_id}: receipt lineage missing step ${stepId}`);
    }
  }
  for (const link of descriptor.receipt_lineage.parent_links) {
    if (!stepIds.has(link.step_id)) {
      errors.push(`${descriptor.workflow_id}: parent link references unknown step ${link.step_id}`);
    }
    for (const parent of link.parent_step_ids) {
      if (!stepIds.has(parent)) {
        errors.push(`${descriptor.workflow_id}: parent link references unknown parent ${parent}`);
      }
    }
  }
}

function step(input: Partial<CompositeWorkflowStepDescriptor> & {
  step_id: string;
  title: string;
  kind: CompositeWorkflowStepKind;
  app_id: string;
  service_family: IPFSAppCapabilityServiceFamily;
  capability_id: string;
  descriptor_pack_id: string;
  operation: string;
  result_schema: Record<string, unknown>;
}): CompositeWorkflowStepDescriptor {
  return {
    input_schema: OBJECT_SCHEMA,
    depends_on: [],
    reads: [],
    writes: [],
    receipt_required: input.kind !== 'read',
    event_dag_required: input.kind === 'write' || input.kind === 'provenance',
    ...input,
  };
}

function lineage(
  requiredStepIds: readonly string[],
  parentLinks: readonly [string, readonly string[]][],
): CompositeWorkflowReceiptLineage {
  return {
    required_step_ids: requiredStepIds,
    parent_links: parentLinks.map(([stepId, parentStepIds]) => ({
      step_id: stepId,
      parent_step_ids: parentStepIds,
    })),
    receipt_refs_field: 'receipt_refs',
    event_dag_refs_field: 'event_dag_refs',
  };
}

function resultEnvelopeContract(
  outputProperties: Record<string, unknown>,
  requiredOutputFields: readonly string[],
): CompositeWorkflowResultEnvelopeContract {
  return {
    schema: APP_RESULT_ENVELOPE_SCHEMA,
    output_schema: objectSchema(outputProperties, requiredOutputFields),
    artifact_refs: ['cid', 'ipfs', 'media', 'dataset', 'model', 'job'],
    receipt_refs: [
      'mcp++/operation-receipt',
      'mcp++/policy-decision',
      'mcp++/event-dag-receipt',
    ],
    event_dag_refs: [
      'pin_recorded',
      'answer_cited',
      'training_artifact_stored',
      'media_artifact_stored',
      'job_status_recorded',
    ],
    required_output_fields: requiredOutputFields,
  };
}

function objectSchema(
  properties: Record<string, unknown>,
  required: readonly string[] = [],
): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: true,
    properties,
    required: [...required],
  };
}

function citationSchema(): Record<string, unknown> {
  return objectSchema({
    dataset_id: { type: 'string' },
    source_cid: { type: 'string' },
    title: { type: 'string' },
    score: { type: 'number' },
  }, ['source_cid']);
}

function provenanceResultSchema(eventType: string): Record<string, unknown> {
  return objectSchema({
    event_cid: { type: 'string' },
    event_type: { const: eventType },
    parents: { type: 'array', items: { type: 'string' } },
  }, ['event_cid', 'event_type']);
}

function stepResultsSchema(): Record<string, unknown> {
  return {
    type: 'array',
    items: objectSchema({
      step_id: { type: 'string' },
      status: { type: 'string', enum: ['ok', 'degraded', 'denied', 'error'] },
      output: OBJECT_SCHEMA,
      receipt_cid: { type: 'string' },
      event_cid: { type: 'string' },
    }, ['step_id', 'status']),
  };
}

function receiptLineageSchema(): Record<string, unknown> {
  return objectSchema({
    required_step_ids: { type: 'array', items: { type: 'string' } },
    parent_links: {
      type: 'array',
      items: objectSchema({
        step_id: { type: 'string' },
        parent_step_ids: { type: 'array', items: { type: 'string' } },
      }, ['step_id', 'parent_step_ids']),
    },
  }, ['required_step_ids', 'parent_links']);
}
