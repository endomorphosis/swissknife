<<<<<<< HEAD
import type {
  AllToolsAppBindingMatrix,
  AllToolsAppBindingRow,
} from './all-tools-app-binding-matrix.js';

export const ALL_TOOLS_COMPOSITE_WORKFLOW_CATALOG_ID =
  'org.hallucinate.swissknife.all-mcp-tools-composite-workflows';

export type AllToolsCompositeWorkflowCategory =
  | 'storage_to_provenance'
  | 'dataset_to_vector'
  | 'search_to_inference'
  | 'media_generation_to_ipfs'
  | 'hardware_selection_to_job'
  | 'wallet_credential_safe'
  | 'admin_reporting';

export type AllToolsCompositeWorkflowRollbackBehavior =
  | 'none'
  | 'manual_cleanup'
  | 'compensating_tool'
  | 'desktop_mobile_handoff'
  | 'supervisor_reconcile';

=======
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
export interface AllToolsCompositeWorkflowStep {
  step_id: string;
  order: number;
  purpose: string;
  tool_id: string;
  service_id: string;
<<<<<<< HEAD
  app_id?: string;
  capability_id?: string;
=======
  app_id: string;
  capability_id: string;
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
  mcp_tool_name?: string;
  app_visible: boolean;
  policy_class: string;
  confirmation_policy: string;
  receipt_policy: string;
  disposition: string;
  normalized_disposition: string;
  adapter_required: boolean;
<<<<<<< HEAD
  adapter_note?: string;
  input_contract: {
    consumes_state_keys: readonly string[];
  };
  output_contract: {
    produces_state_keys: readonly string[];
    artifact_kinds: readonly string[];
  };
  rollback: {
    behavior: AllToolsCompositeWorkflowRollbackBehavior;
    cleanup_tool_ids: readonly string[];
    requires_confirmation: boolean;
  };
  event_node: AllToolsWorkflowEventNode;
  glasses: {
    fallback: string;
    exposure: string;
    directly_displayable: boolean;
    summary: string;
  };
}

export interface AllToolsWorkflowEventNode {
  node_id: string;
  event_cid: string;
  event_type: string;
  parents: readonly string[];
  consumes_state_keys: readonly string[];
  produces_state_keys: readonly string[];
=======
  input_contract?: Record<string, unknown>;
  output_contract?: Record<string, unknown>;
  rollback?: Record<string, unknown>;
  event_node?: Record<string, unknown>;
  glasses?: Record<string, unknown>;
  [key: string]: unknown;
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
}

export interface AllToolsCompositeWorkflow {
  workflow_id: string;
  title: string;
<<<<<<< HEAD
  category: AllToolsCompositeWorkflowCategory;
=======
  category: string;
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
  intent: string;
  service_chain: readonly string[];
  app_chain: readonly string[];
  policy_classes: readonly string[];
  requires_confirmation: boolean;
  requires_receipt: boolean;
  requires_desktop_mobile_handoff: boolean;
  adapter_required: boolean;
  cleanup_behavior: {
    strategy: string;
<<<<<<< HEAD
    cleanup_tool_ids: readonly string[];
    rollback_notes: string;
  };
  glasses_fallback_summary: string;
  event_dag: {
    root_event_cid: string;
    terminal_event_cid: string;
    nodes: readonly AllToolsWorkflowEventNode[];
  };
  steps: readonly AllToolsCompositeWorkflowStep[];
}

export interface AllToolsCompositeWorkflowCatalog {
  catalog_id: typeof ALL_TOOLS_COMPOSITE_WORKFLOW_CATALOG_ID;
  schema: 'swissknife.all-mcp-tools-composite-workflows.v1';
  version: string;
  generated_at?: string;
  generated_from: readonly string[];
  workflow_count: number;
  step_count: number;
  required_category_coverage: Record<AllToolsCompositeWorkflowCategory, boolean>;
  service_counts: Record<string, number>;
  app_counts: Record<string, number>;
  policy_counts: Record<string, number>;
  adapter_required_step_count: number;
  desktop_mobile_handoff_step_count: number;
  workflows: readonly AllToolsCompositeWorkflow[];
}

export interface AllToolsCompositeWorkflowValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface WorkflowTemplate {
  workflow_id: string;
  title: string;
  category: AllToolsCompositeWorkflowCategory;
  intent: string;
  cleanup_behavior: {
    strategy: string;
    cleanup_tool_ids: readonly string[];
    rollback_notes: string;
  };
  glasses_fallback_summary: string;
  steps: readonly WorkflowStepTemplate[];
}

interface WorkflowStepTemplate {
  key: string;
  purpose: string;
  tool_id: string;
  consumes: readonly string[];
  produces: readonly string[];
  artifact_kinds: readonly string[];
  rollback_behavior: AllToolsCompositeWorkflowRollbackBehavior;
  cleanup_tool_ids?: readonly string[];
}

const REQUIRED_CATEGORIES = [
  'storage_to_provenance',
  'dataset_to_vector',
  'search_to_inference',
  'media_generation_to_ipfs',
  'hardware_selection_to_job',
  'wallet_credential_safe',
  'admin_reporting',
] as const satisfies readonly AllToolsCompositeWorkflowCategory[];

const CONFIGURED_ACCELERATE_COMPAT_TOOL_IDS = new Set([
  'ipfs_accelerate_py:get_hardware_info',
  'ipfs_accelerate_py:hardware_recommend',
  'ipfs_accelerate_py:tools_dispatch',
]);

const WORKFLOW_TEMPLATES: readonly WorkflowTemplate[] = [
  {
    workflow_id: 'workflow.storage-to-provenance',
    title: 'Storage to provenance',
    category: 'storage_to_provenance',
    intent: 'Store content in IPFS, record provenance for the resulting CID, and pin it for durable retrieval.',
    cleanup_behavior: {
      strategy: 'manual_cleanup_with_desktop_confirmation',
      cleanup_tool_ids: ['ipfs_kit_py:Files.files_rm'],
      rollback_notes: 'Content removal is destructive and stays behind desktop/mobile confirmation.',
    },
    glasses_fallback_summary: 'Show CID, provenance receipt, pin state, and cleanup warning as a display-webapp summary.',
    steps: [
      step('add-content', 'Add source content to IPFS.', 'ipfs_kit_py:IPFS.ipfs_add', ['source_path'], ['content_cid'], ['cid'], 'manual_cleanup', ['ipfs_kit_py:Files.files_rm']),
      step('record-provenance', 'Record dataset provenance for the new CID.', 'ipfs_datasets_py:provenance_tools.record_provenance', ['content_cid'], ['provenance_receipt_cid'], ['receipt'], 'compensating_tool'),
      step('pin-content', 'Pin the CID after provenance is recorded.', 'ipfs_kit_py:pin_add', ['content_cid', 'provenance_receipt_cid'], ['pin_receipt_cid'], ['cid'], 'manual_cleanup', ['ipfs_kit_py:Files.files_rm']),
    ],
  },
  {
    workflow_id: 'workflow.dataset-to-vector',
    title: 'Dataset to vector',
    category: 'dataset_to_vector',
    intent: 'Load a dataset, generate a vector store, search it, and persist the updated dataset metadata.',
    cleanup_behavior: {
      strategy: 'delete_vector_index_with_desktop_confirmation',
      cleanup_tool_ids: ['ipfs_datasets_py:bespoke_tools.delete_index'],
      rollback_notes: 'Vector index deletion is destructive and must be mediated by desktop/mobile confirmation.',
    },
    glasses_fallback_summary: 'Show vector build status, query result count, and save receipt in a display-webapp card.',
    steps: [
      step('load-dataset', 'Load the source dataset.', 'ipfs_datasets_py:dataset_tools.load_dataset', ['dataset_uri'], ['dataset_ref'], ['dataset'], 'none'),
      step('create-vector-store', 'Create a searchable vector store from the dataset.', 'ipfs_datasets_py:bespoke_tools.create_vector_store', ['dataset_ref'], ['vector_store_id'], ['model'], 'manual_cleanup', ['ipfs_datasets_py:bespoke_tools.delete_index']),
      step('search-vector-index', 'Run a smoke search against the vector index.', 'ipfs_datasets_py:vector_tools.search_vector_index', ['vector_store_id', 'query'], ['vector_search_result'], ['dataset'], 'none'),
      step('save-dataset', 'Persist vector metadata back to the dataset.', 'ipfs_datasets_py:dataset_tools.save_dataset', ['dataset_ref', 'vector_store_id'], ['dataset_save_receipt_cid'], ['receipt'], 'compensating_tool'),
    ],
  },
  {
    workflow_id: 'workflow.search-to-inference',
    title: 'Search to inference',
    category: 'search_to_inference',
    intent: 'Collect web evidence, summarize it, send the summary to an inference job, and record inference provenance.',
    cleanup_behavior: {
      strategy: 'mark_failed_and_record_provenance',
      cleanup_tool_ids: ['ipfs_accelerate_py:job_status'],
      rollback_notes: 'Inference jobs are reconciled by status polling and provenance logging rather than direct deletion.',
    },
    glasses_fallback_summary: 'Show search query, inference job state, and provenance status after confirmation.',
    steps: [
      step('search-web', 'Search external web sources for evidence.', 'ipfs_datasets_py:web_archive_tools.brave_search', ['query'], ['search_results'], ['url'], 'none'),
      step('summarize-results', 'Generate a compact prompt summary from search results.', 'ipfs_datasets_py:file_converter_tools.generate_summary', ['search_results'], ['inference_prompt'], ['file'], 'compensating_tool'),
      step('run-inference', 'Run the inference job through the accelerate service.', 'ipfs_accelerate_py:run_inference_job', ['inference_prompt'], ['inference_job_id'], ['job'], 'supervisor_reconcile', ['ipfs_accelerate_py:job_status']),
      step('log-inference', 'Record inference lineage and output metadata.', 'ipfs_accelerate_py:ProvenanceLogger.log_inference', ['inference_job_id'], ['inference_provenance_receipt_cid'], ['receipt'], 'compensating_tool'),
    ],
  },
  {
    workflow_id: 'workflow.media-generation-to-ipfs',
    title: 'Media generation to IPFS',
    category: 'media_generation_to_ipfs',
    intent: 'Generate a portable certificate artifact, add it to IPFS, pin it, and attach provenance.',
    cleanup_behavior: {
      strategy: 'manual_ipfs_cleanup_with_receipt',
      cleanup_tool_ids: ['ipfs_kit_py:Files.files_rm'],
      rollback_notes: 'Generated artifacts can be unpinned or removed only through confirmed desktop/mobile cleanup.',
    },
    glasses_fallback_summary: 'Show generated artifact CID, pin receipt, and provenance receipt as a display-webapp summary.',
    steps: [
      step('generate-certificate', 'Generate a portable certificate artifact.', 'ipfs_datasets_py:pdf_tools.pdf_generate_zkp_certificate', ['certificate_request'], ['certificate_path'], ['media'], 'compensating_tool'),
      step('add-certificate', 'Add the generated artifact to IPFS.', 'ipfs_kit_py:IPFS.ipfs_add', ['certificate_path'], ['certificate_cid'], ['cid'], 'manual_cleanup', ['ipfs_kit_py:Files.files_rm']),
      step('pin-certificate', 'Pin the generated artifact CID.', 'ipfs_kit_py:pin_add', ['certificate_cid'], ['certificate_pin_receipt_cid'], ['cid'], 'manual_cleanup', ['ipfs_kit_py:Files.files_rm']),
      step('record-certificate-provenance', 'Record provenance for the generated artifact.', 'ipfs_datasets_py:provenance_tools.record_provenance', ['certificate_cid', 'certificate_pin_receipt_cid'], ['certificate_provenance_receipt_cid'], ['receipt'], 'compensating_tool'),
    ],
  },
  {
    workflow_id: 'workflow.hardware-selection-to-job',
    title: 'Hardware selection to job',
    category: 'hardware_selection_to_job',
    intent: 'Select hardware, submit a job, poll status, and emit telemetry for release evidence.',
    cleanup_behavior: {
      strategy: 'supervisor_reconcile_job_state',
      cleanup_tool_ids: ['ipfs_accelerate_py:job_status'],
      rollback_notes: 'Job cleanup depends on accelerate supervisor reconciliation under the SVD-031 endpoint boundary.',
    },
    glasses_fallback_summary: 'Show recommended hardware, job status, telemetry, and adapter-required flags after confirmation.',
    steps: [
      step('recommend-hardware', 'Recommend hardware for the requested workload.', 'ipfs_accelerate_py:hardware_recommend', ['workload_profile'], ['hardware_plan'], ['model'], 'none'),
      step('submit-job', 'Submit the compute job using the hardware plan.', 'ipfs_accelerate_py:submit_task', ['hardware_plan', 'job_spec'], ['accelerate_task_id'], ['job'], 'supervisor_reconcile', ['ipfs_accelerate_py:job_status']),
      step('poll-job', 'Poll the submitted task status.', 'ipfs_accelerate_py:job_status', ['accelerate_task_id'], ['job_status'], ['job'], 'supervisor_reconcile'),
      step('emit-telemetry', 'Generate metrics for job telemetry.', 'ipfs_accelerate_py:PrometheusMetrics.generate_metrics', ['job_status'], ['metrics_snapshot'], ['dataset'], 'compensating_tool'),
    ],
  },
  {
    workflow_id: 'workflow.wallet-credential-safe',
    title: 'Wallet credential safe handoff',
    category: 'wallet_credential_safe',
    intent: 'Model wallet operations as desktop/mobile handoffs with audit receipts and explicit glasses denial.',
    cleanup_behavior: {
      strategy: 'revoke_grant_after_audit',
      cleanup_tool_ids: ['ipfs_datasets_py:wallet_tools.wallet_revoke_grant'],
      rollback_notes: 'Credential steps never execute directly from app or glasses surfaces; grant revocation is the cleanup step.',
    },
    glasses_fallback_summary: 'Show a redacted handoff summary only; credential actions stay on desktop/mobile.',
    steps: [
      step('list-wallet-records', 'List wallet records through a mediated credential view.', 'ipfs_datasets_py:wallet_tools.wallet_list_records', ['wallet_context'], ['redacted_record_list'], ['dataset'], 'desktop_mobile_handoff'),
      step('create-export-grant', 'Create an export grant after desktop/mobile confirmation.', 'ipfs_datasets_py:wallet_tools.wallet_create_export_grant', ['redacted_record_list'], ['export_grant_id'], ['receipt'], 'desktop_mobile_handoff', ['ipfs_datasets_py:wallet_tools.wallet_revoke_grant']),
      step('record-audit-event', 'Record an audit event for the mediated credential action.', 'ipfs_datasets_py:audit_tools.record_audit_event', ['export_grant_id'], ['audit_event_receipt_cid'], ['receipt'], 'compensating_tool'),
      step('revoke-export-grant', 'Revoke the grant as the final cleanup action.', 'ipfs_datasets_py:wallet_tools.wallet_revoke_grant', ['export_grant_id', 'audit_event_receipt_cid'], ['grant_revoke_receipt_cid'], ['receipt'], 'desktop_mobile_handoff'),
    ],
  },
  {
    workflow_id: 'workflow.admin-reporting',
    title: 'Admin reporting',
    category: 'admin_reporting',
    intent: 'Collect MCP tool inventory, admin status, audit report, and accelerate telemetry into one report chain.',
    cleanup_behavior: {
      strategy: 'report_only_no_mutating_cleanup',
      cleanup_tool_ids: [],
      rollback_notes: 'Reporting steps are append-only or read-only; failed reports are replaced by a later generated report.',
    },
    glasses_fallback_summary: 'Show inventory counts, admin health, audit report state, and telemetry summary.',
    steps: [
      step('list-kit-tools', 'List IPFS Kit tools for the report inventory.', 'ipfs_kit_py:tools_list_tools', [], ['kit_tool_inventory'], ['dataset'], 'none'),
      step('read-admin-status', 'Read dataset admin status.', 'ipfs_datasets_py:admin_tools.admin_tools', ['kit_tool_inventory'], ['admin_status'], ['dataset'], 'none'),
      step('generate-audit-report', 'Generate the audit report.', 'ipfs_datasets_py:audit_tools.generate_audit_report', ['admin_status'], ['audit_report_cid'], ['receipt'], 'compensating_tool'),
      step('collect-accelerate-metrics', 'Attach accelerate metrics to the report.', 'ipfs_accelerate_py:PrometheusMetrics.generate_metrics', ['audit_report_cid'], ['accelerate_metrics_snapshot'], ['dataset'], 'compensating_tool'),
    ],
  },
];

export function buildAllToolsCompositeWorkflowCatalog(
  bindingMatrix: AllToolsAppBindingMatrix,
  options: { generatedAt?: string; version?: string } = {},
): AllToolsCompositeWorkflowCatalog {
  const rowsByToolId = new Map(bindingMatrix.rows.map(row => [row.tool_id, row]));
  const workflows = WORKFLOW_TEMPLATES.map(template => buildWorkflow(template, rowsByToolId));
  const steps = workflows.flatMap(workflow => [...workflow.steps]);

  return {
    catalog_id: ALL_TOOLS_COMPOSITE_WORKFLOW_CATALOG_ID,
    schema: 'swissknife.all-mcp-tools-composite-workflows.v1',
    version: options.version ?? '2026-07-08',
    generated_at: options.generatedAt,
    generated_from: [bindingMatrix.matrix_id],
    workflow_count: workflows.length,
    step_count: steps.length,
    required_category_coverage: categoryCoverage(workflows),
    service_counts: countBy(steps, step => step.service_id),
    app_counts: countBy(steps, step => step.app_id ?? 'non_app_surface'),
    policy_counts: countBy(steps, step => step.policy_class),
    adapter_required_step_count: steps.filter(step => step.adapter_required).length,
    desktop_mobile_handoff_step_count: steps.filter(step => (
      step.confirmation_policy === 'desktop_or_mobile_only'
      || step.normalized_disposition === 'unsafe_without_human_review'
    )).length,
    workflows,
  };
}

export function validateAllToolsCompositeWorkflowCatalog(
  catalog: AllToolsCompositeWorkflowCatalog,
  bindingMatrix: AllToolsAppBindingMatrix,
): AllToolsCompositeWorkflowValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rowsByToolId = new Map(bindingMatrix.rows.map(row => [row.tool_id, row]));
  const workflowIds = new Set<string>();

  if (catalog.workflow_count !== catalog.workflows.length) {
    errors.push(`workflow_count ${catalog.workflow_count} does not match workflow length ${catalog.workflows.length}`);
  }
  const steps = catalog.workflows.flatMap(workflow => [...workflow.steps]);
  if (catalog.step_count !== steps.length) {
    errors.push(`step_count ${catalog.step_count} does not match step length ${steps.length}`);
  }

  for (const category of REQUIRED_CATEGORIES) {
    if (!catalog.required_category_coverage[category]) {
      errors.push(`Missing required workflow category ${category}`);
    }
  }

  for (const workflow of catalog.workflows) {
    if (workflowIds.has(workflow.workflow_id)) {
      errors.push(`${workflow.workflow_id}: duplicate workflow id`);
    }
    workflowIds.add(workflow.workflow_id);
    if (workflow.steps.length < 2) errors.push(`${workflow.workflow_id}: workflow must have at least two steps`);
    if (!workflow.glasses_fallback_summary) errors.push(`${workflow.workflow_id}: missing glasses fallback summary`);
    if (!workflow.cleanup_behavior.strategy) errors.push(`${workflow.workflow_id}: missing cleanup strategy`);
    if (workflow.event_dag.nodes.length !== workflow.steps.length) {
      errors.push(`${workflow.workflow_id}: event DAG node count does not match step count`);
    }

    const eventNodeIds = new Set(workflow.event_dag.nodes.map(node => node.node_id));
    for (const [index, step] of workflow.steps.entries()) {
      const row = rowsByToolId.get(step.tool_id);
      if (!row) {
        errors.push(`${workflow.workflow_id}/${step.step_id}: missing binding row for ${step.tool_id}`);
        continue;
      }
      if (step.service_id !== row.service_id) errors.push(`${step.step_id}: service_id does not match binding row`);
      if (step.policy_class !== row.policy_class) errors.push(`${step.step_id}: policy_class does not match binding row`);
      if (step.confirmation_policy !== row.confirmation_policy) errors.push(`${step.step_id}: confirmation_policy does not match binding row`);
      if (step.receipt_policy !== row.receipt_policy) errors.push(`${step.step_id}: receipt_policy does not match binding row`);
      if (step.rollback.behavior === undefined) errors.push(`${step.step_id}: missing rollback behavior`);
      if (!step.event_node.event_cid) errors.push(`${step.step_id}: missing event cid`);
      for (const parent of step.event_node.parents) {
        if (!eventNodeIds.has(parent)) errors.push(`${step.step_id}: parent ${parent} is not in workflow DAG`);
      }
      if (index > 0 && step.event_node.parents.length === 0) {
        errors.push(`${step.step_id}: non-root step has no event parent`);
      }
      if (step.confirmation_policy === 'desktop_or_mobile_only' && step.glasses.directly_displayable) {
        errors.push(`${step.step_id}: desktop/mobile-only step cannot be directly displayable on glasses`);
      }
      for (const cleanupToolId of step.rollback.cleanup_tool_ids) {
        if (!rowsByToolId.has(cleanupToolId)) errors.push(`${step.step_id}: cleanup tool ${cleanupToolId} is not bound`);
      }
    }

    for (const cleanupToolId of workflow.cleanup_behavior.cleanup_tool_ids) {
      if (!rowsByToolId.has(cleanupToolId)) errors.push(`${workflow.workflow_id}: cleanup tool ${cleanupToolId} is not bound`);
    }

    if (workflow.category === 'wallet_credential_safe' && !workflow.requires_desktop_mobile_handoff) {
      errors.push(`${workflow.workflow_id}: credential-safe workflow must require desktop/mobile handoff`);
    }
    if (workflow.category !== 'wallet_credential_safe' && workflow.service_chain.length < 2) {
      warnings.push(`${workflow.workflow_id}: workflow uses only one service family`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function buildWorkflow(
  template: WorkflowTemplate,
  rowsByToolId: ReadonlyMap<string, AllToolsAppBindingRow>,
): AllToolsCompositeWorkflow {
  const steps: AllToolsCompositeWorkflowStep[] = [];
  for (const [index, templateStep] of template.steps.entries()) {
    const row = rowsByToolId.get(templateStep.tool_id);
    if (!row) throw new Error(`${template.workflow_id}: missing binding row ${templateStep.tool_id}`);
    const parents = index === 0 ? [] : [steps[index - 1].event_node.node_id];
    steps.push(buildWorkflowStep(template, templateStep, row, index, parents));
  }
  const eventNodes = steps.map(item => item.event_node);

  return {
    workflow_id: template.workflow_id,
    title: template.title,
    category: template.category,
    intent: template.intent,
    service_chain: unique(steps.map(step => step.service_id)),
    app_chain: unique(steps.map(step => step.app_id ?? 'non_app_surface')),
    policy_classes: unique(steps.map(step => step.policy_class)),
    requires_confirmation: steps.some(step => step.confirmation_policy !== 'none'),
    requires_receipt: steps.some(step => step.receipt_policy === 'required' || step.receipt_policy === 'required_for_side_effects'),
    requires_desktop_mobile_handoff: steps.some(step => (
      step.confirmation_policy === 'desktop_or_mobile_only'
      || step.normalized_disposition === 'unsafe_without_human_review'
    )),
    adapter_required: steps.some(step => step.adapter_required),
    cleanup_behavior: template.cleanup_behavior,
    glasses_fallback_summary: template.glasses_fallback_summary,
    event_dag: {
      root_event_cid: eventNodes[0].event_cid,
      terminal_event_cid: eventNodes[eventNodes.length - 1].event_cid,
      nodes: eventNodes,
    },
    steps,
  };
}

function buildWorkflowStep(
  workflow: WorkflowTemplate,
  templateStep: WorkflowStepTemplate,
  row: AllToolsAppBindingRow,
  index: number,
  parents: readonly string[],
): AllToolsCompositeWorkflowStep {
  const stepId = `${workflow.workflow_id}.${templateStep.key}`;
  const adapterRequired = row.service_id === 'ipfs_accelerate_py'
    && !CONFIGURED_ACCELERATE_COMPAT_TOOL_IDS.has(row.tool_id);

  return {
    step_id: stepId,
    order: index + 1,
    purpose: templateStep.purpose,
    tool_id: row.tool_id,
    service_id: row.service_id,
    app_id: row.app_id,
    capability_id: row.capability_id,
    mcp_tool_name: row.mcp_tool_name,
    app_visible: row.app_visible,
    policy_class: row.policy_class,
    confirmation_policy: row.confirmation_policy,
    receipt_policy: row.receipt_policy,
    disposition: row.disposition,
    normalized_disposition: row.normalized_disposition,
    adapter_required: adapterRequired,
    ...(adapterRequired ? {
      adapter_note: 'SVD-031 accepted a bounded compatibility endpoint; this accelerate step needs the full endpoint adapter before live dispatch.',
    } : {}),
    input_contract: {
      consumes_state_keys: templateStep.consumes,
    },
    output_contract: {
      produces_state_keys: templateStep.produces,
      artifact_kinds: templateStep.artifact_kinds,
    },
    rollback: {
      behavior: templateStep.rollback_behavior,
      cleanup_tool_ids: templateStep.cleanup_tool_ids ?? [],
      requires_confirmation: (
        row.confirmation_policy !== 'none'
        || (templateStep.cleanup_tool_ids ?? []).length > 0
      ),
    },
    event_node: {
      node_id: stepId,
      event_cid: `bafyworkflow${stableHash(stepId)}`,
      event_type: `${workflow.category}.step_planned`,
      parents,
      consumes_state_keys: templateStep.consumes,
      produces_state_keys: templateStep.produces,
    },
    glasses: {
      fallback: row.glasses_fallback ?? 'not_displayable',
      exposure: row.glasses_exposure,
      directly_displayable: row.glasses_exposure !== 'desktop_or_mobile_only',
      summary: `${templateStep.purpose} Fallback: ${row.glasses_fallback ?? 'not_displayable'}.`,
    },
  };
}

function step(
  key: string,
  purpose: string,
  toolId: string,
  consumes: readonly string[],
  produces: readonly string[],
  artifactKinds: readonly string[],
  rollbackBehavior: AllToolsCompositeWorkflowRollbackBehavior,
  cleanupToolIds: readonly string[] = [],
): WorkflowStepTemplate {
  return {
    key,
    purpose,
    tool_id: toolId,
    consumes,
    produces,
    artifact_kinds: artifactKinds,
    rollback_behavior: rollbackBehavior,
    cleanup_tool_ids: cleanupToolIds,
  };
}

function categoryCoverage(
  workflows: readonly AllToolsCompositeWorkflow[],
): Record<AllToolsCompositeWorkflowCategory, boolean> {
  const seen = new Set(workflows.map(workflow => workflow.category));
  return Object.fromEntries(
    REQUIRED_CATEGORIES.map(category => [category, seen.has(category)]),
  ) as Record<AllToolsCompositeWorkflowCategory, boolean>;
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function countBy<T>(items: readonly T[], keyForItem: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyForItem(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function stableHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x811c9dc5 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x01000193);
    second = Math.imul(second ^ (first >>> 16), 0x01000193);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}
=======
    cleanup_tool_ids?: readonly string[];
    rollback_notes?: string;
    [key: string]: unknown;
  };
  glasses_fallback_summary: string;
  event_dag?: Record<string, unknown>;
  steps: readonly AllToolsCompositeWorkflowStep[];
  [key: string]: unknown;
}

export interface AllToolsCompositeWorkflowCatalog {
  catalog_id: string;
  schema: string;
  version?: string;
  generated_at?: string;
  generated_from?: readonly string[];
  workflow_count: number;
  step_count: number;
  required_category_coverage?: readonly string[];
  service_counts?: Record<string, number>;
  app_counts?: Record<string, number>;
  policy_counts?: Record<string, number>;
  adapter_required_step_count?: number;
  desktop_mobile_handoff_step_count?: number;
  workflows: readonly AllToolsCompositeWorkflow[];
}
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
