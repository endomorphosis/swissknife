import type {
  AllToolsAppBindingMatrix,
  AllToolsAppBindingRow,
} from '../apps/all-tools-app-binding-matrix.js';
import type {
  AllToolsCompositeWorkflow,
  AllToolsCompositeWorkflowCatalog,
  AllToolsCompositeWorkflowStep,
} from '../apps/all-tools-composite-workflows.js';
import type {
  AllToolsLedger,
  AllToolsLedgerTool,
} from '../apps/all-tools-policy-classifier.js';
import { createDefaultControlSurfaceContract } from './mcp-control-surface-mediator.js';
import {
  computeCID,
  computeInterfaceCID,
  type ErrorDefinition,
  type InterfaceDescriptor,
  type MethodSignature,
} from './mcp-idl.js';
import { generateSchemaDrivenUI } from './mcp-schema-ui-generator.js';
import {
  SWISSKNIFE_MCP_UI_PROFILE,
  SWISSKNIFE_MCP_UI_PROFILE_VERSION,
  type InterfaceType,
  type MCPUIOperationContract,
  type MCPUIProfileDescriptor,
  type MCPUISection,
  type MCPUIServiceDescriptor,
  type MCPUIWorkflowGraph,
  type TemplateKind,
} from './mcp-ui-profile.js';

export const ALL_TOOLS_IDL_DESCRIPTOR_CATALOG_ID =
  'org.hallucinate.swissknife.all-mcp-tools-idl-descriptor-catalog';

export type AllToolsIDLDescriptorKind = 'tool_group' | 'workflow';

export interface AllToolsIDLMethodBinding {
  method: string;
  tool_id?: string;
  workflow_id?: string;
  workflow_step_id?: string;
  service_id: string;
  app_id: string;
  capability_id: string;
  policy_class: string;
  confirmation_policy: string;
  receipt_policy: string;
  receipt_mapping: {
    receipt_policy: string;
    event_dag_required: boolean;
    decision_receipt_required: boolean;
  };
  adapter_required: boolean;
  glasses_fallback: string;
}

export interface AllToolsIDLDescriptorRecord {
  descriptor_id: string;
  kind: AllToolsIDLDescriptorKind;
  app_id: string;
  service_id: string;
  category: string;
  interface_cid: string;
  template_kind: TemplateKind;
  interface_type: InterfaceType;
  method_count: number;
  tool_ids: readonly string[];
  workflow_id?: string;
  policy_tags: readonly string[];
  error_codes: readonly string[];
  idl_descriptor: InterfaceDescriptor;
  ui_profile: MCPUIProfileDescriptor;
  generated_ui_profile: {
    command_count: number;
    form_count: number;
    result_renderer_count: number;
    region_count: number;
    widget_count: number;
    template: TemplateKind;
  };
  method_bindings: readonly AllToolsIDLMethodBinding[];
}

export interface AllToolsIDLToolCoverageRow {
  tool_id: string;
  app_id: string;
  service_id: string;
  category: string;
  capability_id: string;
  interface_cid: string;
  descriptor_id: string;
  method: string;
  policy_class: string;
  receipt_policy: string;
  adapter_required: boolean;
  glasses_fallback: string;
}

export interface AllToolsIDLWorkflowCoverageRow {
  workflow_id: string;
  category: string;
  interface_cid: string;
  descriptor_id: string;
  method_count: number;
  step_count: number;
  service_chain: readonly string[];
  cleanup_strategy: string;
  glasses_fallback_summary: string;
  adapter_required: boolean;
}

export interface AllToolsIDLDescriptorCatalog {
  catalog_id: typeof ALL_TOOLS_IDL_DESCRIPTOR_CATALOG_ID;
  schema: 'swissknife.all-mcp-tools-idl-descriptor-catalog.v1';
  version: string;
  generated_at?: string;
  generated_from: readonly string[];
  descriptor_count: number;
  tool_group_descriptor_count: number;
  workflow_descriptor_count: number;
  app_routable_tool_count: number;
  app_routable_tool_coverage_count: number;
  workflow_count: number;
  workflow_coverage_count: number;
  method_count: number;
  interface_cid_count: number;
  adapter_required_method_count: number;
  app_counts: Record<string, number>;
  service_counts: Record<string, number>;
  template_counts: Record<string, number>;
  descriptors: readonly AllToolsIDLDescriptorRecord[];
  tool_coverage: readonly AllToolsIDLToolCoverageRow[];
  workflow_coverage: readonly AllToolsIDLWorkflowCoverageRow[];
}

export interface AllToolsIDLDescriptorValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface ToolGroup {
  key: string;
  app_id: string;
  service_id: string;
  category: string;
  rows: AllToolsAppBindingRow[];
}

const CONFIGURED_ACCELERATE_COMPAT_TOOL_IDS = new Set([
  'ipfs_accelerate_py:get_hardware_info',
  'ipfs_accelerate_py:hardware_recommend',
  'ipfs_accelerate_py:tools_dispatch',
]);

const DEFAULT_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
};

const DEFAULT_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    ok: { type: 'boolean' },
    result: { type: ['object', 'array', 'string', 'number', 'boolean', 'null'] },
    artifact_refs: { type: 'array', items: { type: 'object', additionalProperties: true } },
    receipt_refs: { type: 'array', items: { type: 'object', additionalProperties: true } },
    event_dag_refs: { type: 'array', items: { type: 'object', additionalProperties: true } },
  },
};

const EVENT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    correlation_id: { type: 'string' },
    status: { type: 'string' },
    progress: { type: 'number', minimum: 0, maximum: 1 },
    event_cid: { type: 'string' },
    receipt_cid: { type: 'string' },
  },
};

export function buildAllToolsIDLDescriptorCatalog(
  ledger: AllToolsLedger,
  bindingMatrix: AllToolsAppBindingMatrix,
  workflowCatalog: AllToolsCompositeWorkflowCatalog,
  options: { generatedAt?: string; version?: string } = {},
): AllToolsIDLDescriptorCatalog {
  const toolById = new Map(ledger.tools.map(tool => [tool.tool_id, tool]));
  const toolGroupDescriptors = groupToolRows(bindingMatrix.rows.filter(row => row.app_visible))
    .map(group => buildToolGroupDescriptor(group, toolById));
  const workflowDescriptors = workflowCatalog.workflows
    .map(workflow => buildWorkflowDescriptor(workflow));
  const descriptors = [...toolGroupDescriptors, ...workflowDescriptors]
    .sort((left, right) => left.descriptor_id.localeCompare(right.descriptor_id));
  const toolCoverage = descriptors
    .filter(record => record.kind === 'tool_group')
    .flatMap(record => record.method_bindings
      .filter(binding => binding.tool_id)
      .map(binding => ({
        tool_id: binding.tool_id as string,
        app_id: binding.app_id,
        service_id: binding.service_id,
        category: record.category,
        capability_id: binding.capability_id,
        interface_cid: record.interface_cid,
        descriptor_id: record.descriptor_id,
        method: binding.method,
        policy_class: binding.policy_class,
        receipt_policy: binding.receipt_policy,
        adapter_required: binding.adapter_required,
        glasses_fallback: binding.glasses_fallback,
      } satisfies AllToolsIDLToolCoverageRow)))
    .sort((left, right) => left.tool_id.localeCompare(right.tool_id));
  const workflowCoverage = workflowDescriptors.map(record => {
    const workflow = workflowCatalog.workflows.find(candidate => candidate.workflow_id === record.workflow_id);
    return {
      workflow_id: record.workflow_id as string,
      category: record.category,
      interface_cid: record.interface_cid,
      descriptor_id: record.descriptor_id,
      method_count: record.method_count,
      step_count: workflow?.steps.length ?? record.method_count,
      service_chain: workflow?.service_chain ?? [],
      cleanup_strategy: workflow?.cleanup_behavior.strategy ?? '',
      glasses_fallback_summary: workflow?.glasses_fallback_summary ?? '',
      adapter_required: record.method_bindings.some(binding => binding.adapter_required),
    } satisfies AllToolsIDLWorkflowCoverageRow;
  }).sort((left, right) => left.workflow_id.localeCompare(right.workflow_id));
  const methodBindings = descriptors.flatMap(record => [...record.method_bindings]);

  return {
    catalog_id: ALL_TOOLS_IDL_DESCRIPTOR_CATALOG_ID,
    schema: 'swissknife.all-mcp-tools-idl-descriptor-catalog.v1',
    version: options.version ?? '2026-07-08',
    generated_at: options.generatedAt,
    generated_from: [
      ledger.schema ?? 'unknown-ledger-schema',
      bindingMatrix.matrix_id,
      workflowCatalog.catalog_id,
    ],
    descriptor_count: descriptors.length,
    tool_group_descriptor_count: toolGroupDescriptors.length,
    workflow_descriptor_count: workflowDescriptors.length,
    app_routable_tool_count: bindingMatrix.rows.filter(row => row.app_visible).length,
    app_routable_tool_coverage_count: toolCoverage.length,
    workflow_count: workflowCatalog.workflows.length,
    workflow_coverage_count: workflowCoverage.length,
    method_count: methodBindings.length,
    interface_cid_count: new Set(descriptors.map(record => record.interface_cid)).size,
    adapter_required_method_count: methodBindings.filter(binding => binding.adapter_required).length,
    app_counts: countBy(descriptors, descriptor => descriptor.app_id),
    service_counts: countBy(methodBindings, binding => binding.service_id),
    template_counts: countBy(descriptors, descriptor => descriptor.template_kind),
    descriptors,
    tool_coverage: toolCoverage,
    workflow_coverage: workflowCoverage,
  };
}

export function validateAllToolsIDLDescriptorCatalog(
  catalog: AllToolsIDLDescriptorCatalog,
  ledger: AllToolsLedger,
  bindingMatrix: AllToolsAppBindingMatrix,
  workflowCatalog: AllToolsCompositeWorkflowCatalog,
): AllToolsIDLDescriptorValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ledgerToolIds = new Set(ledger.tools.map(tool => tool.tool_id));
  const appVisibleRows = bindingMatrix.rows.filter(row => row.app_visible);
  const appVisibleToolIds = new Set(appVisibleRows.map(row => row.tool_id));
  const workflowIds = new Set(workflowCatalog.workflows.map(workflow => workflow.workflow_id));

  if (catalog.descriptor_count !== catalog.descriptors.length) {
    errors.push(`descriptor_count ${catalog.descriptor_count} does not match descriptor length ${catalog.descriptors.length}`);
  }
  if (catalog.app_routable_tool_coverage_count !== appVisibleRows.length) {
    errors.push(`tool coverage ${catalog.app_routable_tool_coverage_count} does not match app-visible tools ${appVisibleRows.length}`);
  }
  if (catalog.workflow_coverage_count !== workflowCatalog.workflows.length) {
    errors.push(`workflow coverage ${catalog.workflow_coverage_count} does not match workflow count ${workflowCatalog.workflows.length}`);
  }
  if (catalog.interface_cid_count !== catalog.descriptors.length) {
    errors.push('interface_cid_count must equal descriptor_count; duplicate descriptor CIDs detected');
  }

  const coveredToolIds = new Set(catalog.tool_coverage.map(row => row.tool_id));
  for (const toolId of appVisibleToolIds) {
    if (!coveredToolIds.has(toolId)) errors.push(`${toolId}: missing IDL tool coverage`);
  }
  for (const row of catalog.tool_coverage) {
    if (!ledgerToolIds.has(row.tool_id)) errors.push(`${row.tool_id}: coverage references unknown ledger tool`);
    if (!appVisibleToolIds.has(row.tool_id)) errors.push(`${row.tool_id}: coverage references non-app-visible tool`);
    if (!row.interface_cid.match(/^sha256:[0-9a-f]{64}$/)) errors.push(`${row.tool_id}: invalid interface cid`);
  }

  for (const row of catalog.workflow_coverage) {
    if (!workflowIds.has(row.workflow_id)) errors.push(`${row.workflow_id}: unknown workflow coverage row`);
    if (!row.interface_cid.match(/^sha256:[0-9a-f]{64}$/)) errors.push(`${row.workflow_id}: invalid workflow interface cid`);
    if (!row.glasses_fallback_summary) errors.push(`${row.workflow_id}: missing glasses fallback summary`);
  }

  const descriptorIds = new Set<string>();
  for (const descriptor of catalog.descriptors) {
    if (descriptorIds.has(descriptor.descriptor_id)) {
      errors.push(`${descriptor.descriptor_id}: duplicate descriptor id`);
    }
    descriptorIds.add(descriptor.descriptor_id);
    if (computeInterfaceCID(descriptor.idl_descriptor) !== descriptor.interface_cid) {
      errors.push(`${descriptor.descriptor_id}: interface cid does not match canonical IDL descriptor`);
    }
    if (descriptor.method_count !== descriptor.idl_descriptor.methods.length) {
      errors.push(`${descriptor.descriptor_id}: method_count does not match IDL methods`);
    }
    if (descriptor.method_count !== descriptor.ui_profile.data_contracts.operations.length) {
      errors.push(`${descriptor.descriptor_id}: method_count does not match UI operation contracts`);
    }
    if (descriptor.error_codes.length === 0) errors.push(`${descriptor.descriptor_id}: missing error code set`);
    if (descriptor.policy_tags.length === 0) errors.push(`${descriptor.descriptor_id}: missing policy tags`);
    if (descriptor.generated_ui_profile.command_count === 0) {
      errors.push(`${descriptor.descriptor_id}: generated UI profile has no commands`);
    }

    const methodNames = new Set(descriptor.idl_descriptor.methods.map(method => method.name));
    for (const method of descriptor.idl_descriptor.methods) {
      if (!method.inputSchema && !method.input_schema) errors.push(`${descriptor.descriptor_id}/${method.name}: missing input schema`);
      if (!method.outputSchema && !method.output_schema) errors.push(`${descriptor.descriptor_id}/${method.name}: missing output schema`);
    }
    for (const binding of descriptor.method_bindings) {
      if (!methodNames.has(binding.method)) errors.push(`${descriptor.descriptor_id}/${binding.method}: binding method missing from descriptor`);
      if (!binding.receipt_mapping.receipt_policy) errors.push(`${descriptor.descriptor_id}/${binding.method}: missing receipt mapping`);
      if (binding.tool_id && !ledgerToolIds.has(binding.tool_id)) warnings.push(`${binding.tool_id}: binding references tool absent from current ledger`);
      if (binding.workflow_id && !workflowIds.has(binding.workflow_id)) errors.push(`${binding.workflow_id}: binding references unknown workflow`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function buildToolGroupDescriptor(
  group: ToolGroup,
  toolById: ReadonlyMap<string, AllToolsLedgerTool>,
): AllToolsIDLDescriptorRecord {
  const templateKind = templateForRows(group.rows);
  const interfaceType = interfaceTypeForService(group.service_id, group.category);
  const methodBindings = group.rows.map(row => toolMethodBinding(row, group, requiredTool(toolById, row.tool_id)));
  const methods = methodBindings.map(binding => binding.method);
  const methodSignatures = methodBindings.map(binding => bindingToMethodSignature(binding, templateKind));
  const errors = errorDefinitions(methodBindings);
  const descriptorId = `all-tools.${slug(group.app_id)}.${slug(group.service_id)}.${slug(group.category)}`;
  const idlDescriptor: InterfaceDescriptor = {
    name: descriptorId,
    namespace: 'org.hallucinate.swissknife.all_tools',
    version: '2026-07-08',
    methods: methodSignatures,
    errors,
    requires: [],
    compatibility: { compatibleWith: [], supersedes: [] },
    semanticTags: unique([
      'all-tools',
      group.app_id,
      group.service_id,
      group.category,
      ...methodBindings.map(binding => binding.policy_class),
      ...methodBindings.filter(binding => binding.adapter_required).map(() => 'adapter-required'),
    ]),
    observability: { trace: true, provenance: true },
    interactionPatterns: { requestResponse: true, eventStreams: templateKind === 'job-console' },
    resourceCostHints: costHints(methodBindings),
    schemaHash: computeCID(JSON.stringify(methodSignatures.map(method => ({
      name: method.name,
      inputSchema: method.inputSchema,
      outputSchema: method.outputSchema,
    })))),
  };
  const interfaceCid = computeInterfaceCID(idlDescriptor);
  const uiProfile = buildUIProfile({
    idlDescriptor,
    interfaceCid,
    descriptorId,
    appId: group.app_id,
    title: `${title(group.app_id)} ${title(group.category)} Tools`,
    description: `Generated ORB/IDL profile for ${group.service_id} ${group.category} tools.`,
    templateKind,
    interfaceType,
    services: [{
      id: `${group.service_id}.${slug(group.category)}`,
      interface_type: interfaceType,
      interface_cid: interfaceCid,
      transport: 'mcp-server',
      endpoint: endpointForService(group.service_id),
      operations: methods,
    }],
    methodBindings,
  });
  const generatedUI = generateSchemaDrivenUI(uiProfile);

  return {
    descriptor_id: descriptorId,
    kind: 'tool_group',
    app_id: group.app_id,
    service_id: group.service_id,
    category: group.category,
    interface_cid: interfaceCid,
    template_kind: templateKind,
    interface_type: interfaceType,
    method_count: methods.length,
    tool_ids: group.rows.map(row => row.tool_id),
    policy_tags: idlDescriptor.semanticTags ?? [],
    error_codes: errors.map(error => error.name),
    idl_descriptor: idlDescriptor,
    ui_profile: uiProfile,
    generated_ui_profile: summarizeGeneratedUI(generatedUI),
    method_bindings: methodBindings,
  };
}

function buildWorkflowDescriptor(workflow: AllToolsCompositeWorkflow): AllToolsIDLDescriptorRecord {
  const descriptorId = `all-tools.workflow.${slug(workflow.workflow_id)}`;
  const methodBindings = workflow.steps.map(step => workflowStepMethodBinding(workflow, step));
  const methods = methodBindings.map(binding => binding.method);
  const methodSignatures = workflow.steps.map((step, index) => workflowStepMethodSignature(workflow, step, methodBindings[index]));
  const errors = errorDefinitions(methodBindings);
  const services = workflowServices(workflow, methodBindings);
  const idlDescriptor: InterfaceDescriptor = {
    name: descriptorId,
    namespace: 'org.hallucinate.swissknife.all_tools.workflow',
    version: '2026-07-08',
    methods: methodSignatures,
    errors,
    requires: [],
    compatibility: { compatibleWith: [], supersedes: [] },
    semanticTags: unique([
      'all-tools',
      'workflow',
      workflow.category,
      ...workflow.service_chain,
      ...workflow.policy_classes,
      ...(workflow.adapter_required ? ['adapter-required'] : []),
    ]),
    observability: { trace: true, provenance: true },
    interactionPatterns: { requestResponse: true, eventStreams: true },
    resourceCostHints: costHints(methodBindings),
    schemaHash: computeCID(JSON.stringify(methodSignatures.map(method => ({
      name: method.name,
      inputSchema: method.inputSchema,
      outputSchema: method.outputSchema,
    })))),
  };
  const interfaceCid = computeInterfaceCID(idlDescriptor);
  const uiProfile = buildUIProfile({
    idlDescriptor,
    interfaceCid,
    descriptorId,
    appId: workflow.app_chain[0] ?? 'all-tools-workflows',
    title: workflow.title,
    description: workflow.intent,
    templateKind: 'graph-viewer',
    interfaceType: 'workflow',
    services: services.map(service => ({ ...service, interface_cid: interfaceCid })),
    methodBindings,
    workflowGraph: workflowGraphFor(workflow, methodBindings),
  });
  const generatedUI = generateSchemaDrivenUI(uiProfile);

  return {
    descriptor_id: descriptorId,
    kind: 'workflow',
    app_id: workflow.app_chain[0] ?? 'all-tools-workflows',
    service_id: 'workflow',
    category: workflow.category,
    interface_cid: interfaceCid,
    template_kind: 'graph-viewer',
    interface_type: 'workflow',
    method_count: methods.length,
    tool_ids: workflow.steps.map(step => step.tool_id),
    workflow_id: workflow.workflow_id,
    policy_tags: idlDescriptor.semanticTags ?? [],
    error_codes: errors.map(error => error.name),
    idl_descriptor: idlDescriptor,
    ui_profile: uiProfile,
    generated_ui_profile: summarizeGeneratedUI(generatedUI),
    method_bindings: methodBindings,
  };
}

function buildUIProfile(input: {
  idlDescriptor: InterfaceDescriptor;
  interfaceCid: string;
  descriptorId: string;
  appId: string;
  title: string;
  description: string;
  templateKind: TemplateKind;
  interfaceType: InterfaceType;
  services: MCPUIServiceDescriptor[];
  methodBindings: readonly AllToolsIDLMethodBinding[];
  workflowGraph?: MCPUIWorkflowGraph;
}): MCPUIProfileDescriptor {
  const operations = input.methodBindings.map(binding => operationContractFor(binding, input.templateKind));
  const sections = sectionsFor(input.methodBindings, input.templateKind);
  const stateKeys = unique([
    stateSignalForTemplate(input.templateKind),
    'selected_tool',
    'last_result',
    'policy_decision',
    'receipt_refs',
    'event_dag_refs',
    ...(input.workflowGraph?.shared_state_keys ?? []),
  ]);
  const uiProfile: MCPUIProfileDescriptor = {
    ...input.idlDescriptor,
    meta: {
      profile: SWISSKNIFE_MCP_UI_PROFILE,
      profile_version: SWISSKNIFE_MCP_UI_PROFILE_VERSION,
      app_id: input.appId,
      title: input.title,
      description: input.description,
      publisher: 'SwissKnife',
    },
    services: input.services,
    ui: {
      primary_template: input.templateKind,
      templates: [{
        kind: input.templateKind,
        title: input.title,
        operations: operations.map(operation => operation.method),
        regions: sections.slice(0, Math.min(sections.length, 12)).map(section => ({
          id: section.id,
          kind: section.kind === 'command-bar' ? 'command' : section.kind,
          operation: section.operation,
        })),
      }],
      sections,
    },
    data_contracts: {
      operations,
      schemas: Object.fromEntries(
        operations.map(operation => [
          `${operation.method}.output`,
          operation.output_schema ?? DEFAULT_OUTPUT_SCHEMA,
        ]),
      ),
    },
    permissions: {
      default_deny: true,
      operations: Object.fromEntries(input.methodBindings.map(binding => [
        binding.method,
        [`mcp++/invoke:${binding.method}`, binding.capability_id],
      ])),
    },
    state_model: {
      keys: stateKeys,
      events: ['operation_started', 'operation_completed', 'operation_failed', 'receipt_recorded'],
      projections: ['desktop', 'mobile', 'meta_glasses'],
      replay: true,
    },
    workflow_graph: input.workflowGraph,
  };

  return {
    ...uiProfile,
    control_surface_contract: createDefaultControlSurfaceContract(uiProfile),
  };
}

function groupToolRows(rows: readonly AllToolsAppBindingRow[]): ToolGroup[] {
  const groups = new Map<string, ToolGroup>();
  for (const row of rows) {
    const appId = row.app_id ?? 'orb-auto-ui';
    const key = `${appId}::${row.service_id}::${row.category}`;
    const group = groups.get(key) ?? {
      key,
      app_id: appId,
      service_id: row.service_id,
      category: row.category,
      rows: [],
    };
    group.rows.push(row);
    groups.set(key, group);
  }
  return Array.from(groups.values())
    .map(group => ({
      ...group,
      rows: group.rows.sort((left, right) => left.tool_id.localeCompare(right.tool_id)),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function toolMethodBinding(
  row: AllToolsAppBindingRow,
  group: ToolGroup,
  tool: AllToolsLedgerTool,
): AllToolsIDLMethodBinding & { input_schema: Record<string, unknown>; output_schema: Record<string, unknown>; description: string } {
  const method = `call_${slug(row.tool_id)}`;
  return {
    method,
    tool_id: row.tool_id,
    service_id: row.service_id,
    app_id: group.app_id,
    capability_id: row.capability_id ?? row.tool_id,
    policy_class: row.policy_class,
    confirmation_policy: row.confirmation_policy,
    receipt_policy: row.receipt_policy,
    receipt_mapping: receiptMapping(row.receipt_policy),
    adapter_required: adapterRequiredForTool(row.tool_id, row.service_id),
    glasses_fallback: row.glasses_fallback ?? 'not_displayable',
    input_schema: normalizeSchema(tool.schemas?.input),
    output_schema: normalizeSchema(tool.schemas?.output, DEFAULT_OUTPUT_SCHEMA),
    description: tool.description ?? `Invoke ${row.tool_id}.`,
  };
}

function workflowStepMethodBinding(
  workflow: AllToolsCompositeWorkflow,
  step: AllToolsCompositeWorkflowStep,
): AllToolsIDLMethodBinding {
  return {
    method: `step_${slug(step.step_id.replace(`${workflow.workflow_id}.`, ''))}`,
    workflow_id: workflow.workflow_id,
    workflow_step_id: step.step_id,
    tool_id: step.tool_id,
    service_id: step.service_id,
    app_id: step.app_id ?? workflow.app_chain[0] ?? 'all-tools-workflows',
    capability_id: step.capability_id ?? step.tool_id,
    policy_class: step.policy_class,
    confirmation_policy: step.confirmation_policy,
    receipt_policy: step.receipt_policy,
    receipt_mapping: receiptMapping(step.receipt_policy),
    adapter_required: step.adapter_required,
    glasses_fallback: step.glasses.fallback,
  };
}

function bindingToMethodSignature(
  binding: AllToolsIDLMethodBinding & { input_schema: Record<string, unknown>; output_schema: Record<string, unknown>; description: string },
  templateKind: TemplateKind,
): MethodSignature {
  return {
    name: binding.method,
    description: binding.description,
    inputSchema: binding.input_schema,
    outputSchema: binding.output_schema,
    input_schema: binding.input_schema,
    output_schema: binding.output_schema,
    errorSchemaCids: errorSchemaCids(binding),
    eventSchema: streamKindFor(binding, templateKind) === 'none' ? undefined : EVENT_SCHEMA,
  };
}

function workflowStepMethodSignature(
  workflow: AllToolsCompositeWorkflow,
  step: AllToolsCompositeWorkflowStep,
  binding: AllToolsIDLMethodBinding,
): MethodSignature {
  const inputSchema = {
    type: 'object',
    additionalProperties: true,
    properties: Object.fromEntries(step.input_contract.consumes_state_keys.map(key => [
      key,
      { type: ['string', 'object', 'array', 'number', 'boolean', 'null'] },
    ])),
    required: [...step.input_contract.consumes_state_keys],
  };
  const outputSchema = {
    type: 'object',
    additionalProperties: true,
    properties: {
      workflow_id: { type: 'string', const: workflow.workflow_id },
      step_id: { type: 'string', const: step.step_id },
      status: { type: 'string', enum: ['ready', 'running', 'success', 'degraded', 'blocked', 'fallback'] },
      ...Object.fromEntries(step.output_contract.produces_state_keys.map(key => [
        key,
        { type: ['string', 'object', 'array', 'number', 'boolean', 'null'] },
      ])),
      receipt_refs: { type: 'array', items: { type: 'object', additionalProperties: true } },
      event_dag_refs: { type: 'array', items: { type: 'object', additionalProperties: true } },
    },
    required: ['workflow_id', 'step_id', 'status'],
  };

  return {
    name: binding.method,
    description: step.purpose,
    inputSchema,
    outputSchema,
    input_schema: inputSchema,
    output_schema: outputSchema,
    errorSchemaCids: errorSchemaCids(binding),
    eventSchema: EVENT_SCHEMA,
  };
}

function operationContractFor(
  binding: AllToolsIDLMethodBinding,
  templateKind: TemplateKind,
): MCPUIOperationContract {
  const method = binding.method;
  const inputSchema = methodInputSchema(binding);
  const outputSchema = methodOutputSchema(binding);
  const streamKind = streamKindFor(binding, templateKind);
  return {
    method,
    title: title(method),
    input_schema: inputSchema,
    output_schema: outputSchema,
    stream: streamKind === 'none'
      ? { kind: 'none' }
      : {
        kind: streamKind,
        event_schema: EVENT_SCHEMA,
        correlation_id_field: 'correlation_id',
        generation_key: `${method}.generation`,
      },
    idempotent: binding.policy_class === 'read',
    retry_policy: binding.policy_class === 'read'
      ? { max_attempts: 2, backoff_ms: 100 }
      : { max_attempts: 1, backoff_ms: 0 },
  };
}

function methodInputSchema(binding: AllToolsIDLMethodBinding): Record<string, unknown> {
  if ('input_schema' in binding && isRecord(binding.input_schema)) return binding.input_schema;
  return DEFAULT_INPUT_SCHEMA;
}

function methodOutputSchema(binding: AllToolsIDLMethodBinding): Record<string, unknown> {
  if ('output_schema' in binding && isRecord(binding.output_schema)) return binding.output_schema;
  return DEFAULT_OUTPUT_SCHEMA;
}

function workflowGraphFor(
  workflow: AllToolsCompositeWorkflow,
  methodBindings: readonly AllToolsIDLMethodBinding[],
): MCPUIWorkflowGraph {
  const methodByStepId = new Map(methodBindings.map(binding => [binding.workflow_step_id, binding.method]));
  const allStateKeys = unique([
    ...workflow.steps.flatMap(step => [...step.input_contract.consumes_state_keys]),
    ...workflow.steps.flatMap(step => [...step.output_contract.produces_state_keys]),
  ]);
  return {
    id: workflow.workflow_id,
    title: workflow.title,
    description: workflow.intent,
    shared_state_keys: allStateKeys,
    steps: workflow.steps.map(step => ({
      id: slug(step.step_id.replace(`${workflow.workflow_id}.`, '')),
      title: step.purpose,
      operation: required(methodByStepId.get(step.step_id), `Missing method for ${step.step_id}`),
      service_id: workflowServiceId(step.service_id, workflow.workflow_id),
      depends_on: step.event_node.parents.map(parent => slug(parent.replace(`${workflow.workflow_id}.`, ''))),
      read_state_keys: [...step.input_contract.consumes_state_keys],
      write_state_keys: [...step.output_contract.produces_state_keys],
      rollback: step.rollback.cleanup_tool_ids.length > 0
        ? {
          operation: required(methodByStepId.get(step.step_id), `Missing rollback method for ${step.step_id}`),
          service_id: workflowServiceId(step.service_id, workflow.workflow_id),
          state_keys: [...step.output_contract.produces_state_keys],
          reason: step.rollback.behavior,
        }
        : undefined,
    })),
  };
}

function workflowServices(
  workflow: AllToolsCompositeWorkflow,
  methodBindings: readonly AllToolsIDLMethodBinding[],
): MCPUIServiceDescriptor[] {
  const byService = new Map<string, string[]>();
  for (const binding of methodBindings) {
    const serviceId = workflowServiceId(binding.service_id, workflow.workflow_id);
    const methods = byService.get(serviceId) ?? [];
    methods.push(binding.method);
    byService.set(serviceId, methods);
  }
  return Array.from(byService.entries()).map(([serviceId, operations]) => ({
    id: serviceId,
    interface_type: interfaceTypeForService(serviceId, workflow.category),
    transport: 'mcp-server',
    endpoint: endpointForService(serviceId.split('.')[0]),
    operations,
  }));
}

function sectionsFor(
  bindings: readonly AllToolsIDLMethodBinding[],
  templateKind: TemplateKind,
): MCPUISection[] {
  const sectionKind: MCPUISection['kind'] =
    templateKind === 'graph-viewer' ? 'graph'
      : templateKind === 'job-console' ? 'timeline'
        : templateKind === 'dashboard' ? 'status'
          : templateKind === 'explorer' ? 'table'
            : 'form';
  return bindings.slice(0, 60).map(binding => ({
    id: `${binding.method}.section`,
    title: title(binding.method),
    kind: sectionKind,
    operation: binding.method,
  }));
}

function templateForRows(rows: readonly AllToolsAppBindingRow[]): TemplateKind {
  const haystack = rows.map(row => `${row.category} ${row.name} ${row.policy_class}`).join(' ').toLowerCase();
  if (haystack.includes('graph') || haystack.includes('vector') || haystack.includes('provenance')) return 'graph-viewer';
  if (rows.some(row => row.service_id === 'ipfs_accelerate_py' || row.policy_class === 'heavy_compute')) return 'job-console';
  if (haystack.match(/browse|list|get|search|files|ipfs|dataset/)) return 'explorer';
  if (rows.some(row => row.policy_class !== 'read')) return 'form-wizard';
  return 'explorer';
}

function interfaceTypeForService(serviceId: string, category: string): InterfaceType {
  if (serviceId.includes('ipfs_accelerate_py')) return 'compute';
  if (serviceId.includes('ipfs_kit_py')) return 'storage';
  if (category.includes('graph') || category.includes('vector') || category.includes('provenance')) return 'graph';
  if (serviceId.includes('ipfs_datasets_py')) return 'dataset';
  if (serviceId.includes('workflow')) return 'workflow';
  return 'generic';
}

function endpointForService(serviceId: string): string {
  if (serviceId === 'ipfs_kit_py') return 'http://127.0.0.1:8014/mcp';
  if (serviceId === 'ipfs_datasets_py') return 'http://127.0.0.1:3002/mcp';
  if (serviceId === 'ipfs_accelerate_py') return 'http://127.0.0.1:3003/mcp';
  return 'local://all-tools-workflow';
}

function errorDefinitions(bindings: readonly AllToolsIDLMethodBinding[]): ErrorDefinition[] {
  const errors: ErrorDefinition[] = [
    { name: 'POLICY_DENIED', code: 403, description: 'Policy denied the ORB/IDL method invocation.' },
    { name: 'VALIDATION_ERROR', code: 400, description: 'Input or output schema validation failed.' },
    { name: 'TOOL_UNAVAILABLE', code: 503, description: 'The target MCP/MCP++ tool is unavailable.' },
  ];
  if (bindings.some(binding => binding.adapter_required)) {
    errors.push({ name: 'ADAPTER_REQUIRED', code: 424, description: 'The target tool requires an adapter outside the configured compatibility endpoint.' });
  }
  if (bindings.some(binding => binding.confirmation_policy === 'desktop_or_mobile_only')) {
    errors.push({ name: 'DESKTOP_MOBILE_HANDOFF_REQUIRED', code: 451, description: 'The target method requires desktop/mobile mediation.' });
  }
  return errors;
}

function errorSchemaCids(binding: AllToolsIDLMethodBinding): string[] {
  return [
    computeCID(`error:${binding.method}:POLICY_DENIED`),
    computeCID(`error:${binding.method}:VALIDATION_ERROR`),
    ...(binding.adapter_required ? [computeCID(`error:${binding.method}:ADAPTER_REQUIRED`)] : []),
  ];
}

function receiptMapping(receiptPolicy: string): AllToolsIDLMethodBinding['receipt_mapping'] {
  return {
    receipt_policy: receiptPolicy,
    event_dag_required: receiptPolicy === 'required' || receiptPolicy === 'required_for_side_effects',
    decision_receipt_required: receiptPolicy !== 'none',
  };
}

function adapterRequiredForTool(toolId: string, serviceId: string): boolean {
  return serviceId === 'ipfs_accelerate_py' && !CONFIGURED_ACCELERATE_COMPAT_TOOL_IDS.has(toolId);
}

function streamKindFor(
  binding: AllToolsIDLMethodBinding,
  templateKind: TemplateKind,
): 'none' | 'events' | 'progress' | 'telemetry' | 'job-status' {
  if (templateKind !== 'job-console') return 'none';
  if (binding.method.includes('telemetry') || binding.tool_id?.toLowerCase().includes('metrics')) return 'telemetry';
  return 'job-status';
}

function costHints(bindings: readonly AllToolsIDLMethodBinding[]): InterfaceDescriptor['resourceCostHints'] {
  const heavy = bindings.some(binding => binding.policy_class === 'heavy_compute');
  const network = bindings.some(binding => binding.policy_class === 'external_network');
  return {
    tokensPerCall: heavy ? 2500 : network ? 750 : 150,
    latencyMs: heavy ? 30000 : network ? 5000 : 500,
    bytesPerCall: heavy ? 1048576 : 65536,
  };
}

function stateSignalForTemplate(templateKind: TemplateKind): string {
  if (templateKind === 'job-console') return 'job_status';
  if (templateKind === 'graph-viewer') return 'graph_lineage';
  if (templateKind === 'explorer') return 'explorer_selection';
  if (templateKind === 'dashboard') return 'dashboard_summary';
  return 'form_draft';
}

function normalizeSchema(
  schema: Record<string, unknown> | null | undefined,
  fallback: Record<string, unknown> = DEFAULT_INPUT_SCHEMA,
): Record<string, unknown> {
  if (isRecord(schema)) return schema;
  return fallback;
}

function requiredTool(
  toolById: ReadonlyMap<string, AllToolsLedgerTool>,
  toolId: string,
): AllToolsLedgerTool {
  return required(toolById.get(toolId), `Missing ledger tool ${toolId}`);
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(value => value.length > 0)));
}

function countBy<T>(items: readonly T[], keyForItem: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyForItem(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function title(value: string): string {
  return value
    .replace(/[_:.:-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function workflowServiceId(serviceId: string, workflowId: string): string {
  return `${serviceId}.${slug(workflowId)}`;
}

function summarizeGeneratedUI(generatedUI: ReturnType<typeof generateSchemaDrivenUI>): AllToolsIDLDescriptorRecord['generated_ui_profile'] {
  return {
    command_count: generatedUI.commands.length,
    form_count: generatedUI.forms.length,
    result_renderer_count: generatedUI.result_renderers.length,
    region_count: generatedUI.regions.length,
    widget_count: generatedUI.widgets.length,
    template: generatedUI.template,
  };
}
