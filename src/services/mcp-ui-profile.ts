import type { InterfaceDescriptor, MethodSignature } from './mcp-idl.js';

export const SWISSKNIFE_MCP_UI_PROFILE = 'swissknife.mcp++/ui-profile';
export const SWISSKNIFE_MCP_UI_PROFILE_VERSION = '0.1.0';

export type TemplateKind =
  | 'dashboard'
  | 'explorer'
  | 'form-wizard'
  | 'job-console'
  | 'graph-viewer';

export type InterfaceType =
  | 'dataset'
  | 'compute'
  | 'workflow'
  | 'graph'
  | 'document'
  | 'storage'
  | 'generic';

export type StreamKind = 'none' | 'events' | 'progress' | 'telemetry' | 'job-status';

export interface MCPUIProfileMeta {
  profile: typeof SWISSKNIFE_MCP_UI_PROFILE;
  profile_version: string;
  app_id: string;
  title: string;
  description?: string;
  publisher?: string;
  icon?: string;
}

export interface MCPUIServiceDescriptor {
  id: string;
  interface_type: InterfaceType;
  interface_cid?: string;
  transport?: 'local' | 'websocket' | 'http' | 'mcp-server';
  endpoint?: string;
  operations: string[];
}

export interface MCPUIStreamDescriptor {
  kind: StreamKind;
  event_schema?: Record<string, unknown>;
  event_schema_cid?: string;
  correlation_id_field?: string;
  generation_key?: string;
}

export interface MCPUIOperationContract {
  method: string;
  title?: string;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  input_schema_cid?: string;
  output_schema_cid?: string;
  stream?: MCPUIStreamDescriptor;
  idempotent?: boolean;
  retry_policy?: {
    max_attempts?: number;
    backoff_ms?: number;
  };
}

export interface MCPUIDataContracts {
  operations: MCPUIOperationContract[];
  schemas?: Record<string, Record<string, unknown>>;
}

export interface MCPUITemplateMapping {
  kind: TemplateKind;
  title?: string;
  operations: string[];
  regions?: Array<{
    id: string;
    kind: 'command' | 'form' | 'table' | 'status' | 'timeline' | 'provenance' | 'graph';
    operation?: string;
  }>;
}

export interface MCPUISection {
  id: string;
  title: string;
  kind: 'command-bar' | 'form' | 'table' | 'status' | 'timeline' | 'audit' | 'graph';
  operation?: string;
}

export interface MCPUIProfileUI {
  primary_template: TemplateKind;
  templates: MCPUITemplateMapping[];
  sections?: MCPUISection[];
}

export interface MCPUIPermissions {
  default_deny?: boolean;
  operations: Record<string, string[]>;
}

export interface MCPUIStateModel {
  keys: string[];
  events: string[];
  projections?: string[];
  replay?: boolean;
}

export interface MCPUIDescriptorTrustMetadata {
  signed_by: string;
  signature_algorithm: 'Ed25519';
  signature: string;
  signed_at: string;
  canonical_cid: string;
}

export interface MCPUIWorkflowAction {
  operation: string;
  service_id?: string;
  state_keys?: string[];
  reason?: string;
}

export interface MCPUIWorkflowStep {
  id: string;
  title?: string;
  operation: string;
  service_id?: string;
  depends_on?: string[];
  read_state_keys?: string[];
  write_state_keys?: string[];
  rollback?: MCPUIWorkflowAction;
  compensation?: MCPUIWorkflowAction;
}

export interface MCPUIWorkflowGraph {
  id: string;
  title?: string;
  description?: string;
  shared_state_keys: string[];
  steps: MCPUIWorkflowStep[];
}

export interface MCPUIProfileDescriptor extends InterfaceDescriptor {
  meta: MCPUIProfileMeta;
  services: MCPUIServiceDescriptor[];
  ui: MCPUIProfileUI;
  data_contracts: MCPUIDataContracts;
  permissions: MCPUIPermissions;
  state_model: MCPUIStateModel;
  workflow_graph?: MCPUIWorkflowGraph;
  trust?: MCPUIDescriptorTrustMetadata;
}

export interface MCPUIConformanceIssue {
  path: string;
  message: string;
}

export interface MCPUIConformanceResult {
  conformant: boolean;
  errors: MCPUIConformanceIssue[];
  warnings: MCPUIConformanceIssue[];
}

export interface TemplateSelection {
  kind: TemplateKind;
  reason: string;
  required_operations: string[];
}

export interface TemplateContract {
  requires_one_of: string[];
  interface_types?: InterfaceType[];
  stream?: StreamKind[];
  state_signals?: string[];
}

export const TEMPLATE_CONTRACTS: Record<TemplateKind, TemplateContract> = {
  dashboard: {
    requires_one_of: ['status', 'metrics', 'telemetry', 'list', 'summary'],
    interface_types: ['compute', 'dataset', 'workflow', 'storage', 'generic'],
    stream: ['events', 'progress', 'telemetry', 'job-status'],
    state_signals: ['dashboard', 'metrics', 'summary', 'telemetry'],
  },
  explorer: {
    requires_one_of: ['browse', 'list', 'get', 'search'],
    interface_types: ['dataset', 'document', 'storage', 'generic'],
    state_signals: ['selected', 'current', 'browser', 'explorer'],
  },
  'form-wizard': {
    requires_one_of: ['create', 'update', 'submit', 'run', 'publish'],
    interface_types: ['dataset', 'compute', 'workflow', 'document', 'storage', 'generic'],
    state_signals: ['draft', 'wizard', 'form'],
  },
  'job-console': {
    requires_one_of: ['run', 'start', 'job_status', 'status', 'cancel'],
    interface_types: ['compute', 'workflow', 'dataset', 'generic'],
    stream: ['progress', 'telemetry', 'job-status'],
    state_signals: ['job', 'progress', 'timeline', 'telemetry'],
  },
  'graph-viewer': {
    requires_one_of: ['graph', 'neighbors', 'lineage', 'provenance'],
    interface_types: ['graph', 'workflow', 'dataset', 'generic'],
    state_signals: ['graph', 'lineage', 'provenance'],
  },
};

const TEMPLATE_KINDS = new Set<TemplateKind>([
  'dashboard',
  'explorer',
  'form-wizard',
  'job-console',
  'graph-viewer',
]);

const STREAM_KINDS = new Set<StreamKind>([
  'none',
  'events',
  'progress',
  'telemetry',
  'job-status',
]);

export function validateMCPUIProfileDescriptor(
  descriptor: Partial<MCPUIProfileDescriptor>,
): MCPUIConformanceResult {
  const errors: MCPUIConformanceIssue[] = [];
  const warnings: MCPUIConformanceIssue[] = [];
  const methodNames = new Set<string>();

  if (!isNonEmptyString(descriptor.name)) {
    push(errors, 'name', 'Descriptor name is required.');
  }
  if (!isNonEmptyString(descriptor.namespace)) {
    push(errors, 'namespace', 'Descriptor namespace is required.');
  }
  if (!isNonEmptyString(descriptor.version)) {
    push(errors, 'version', 'Descriptor version is required.');
  }

  if (!Array.isArray(descriptor.methods) || descriptor.methods.length === 0) {
    push(errors, 'methods', 'At least one MCP-IDL method is required for a generated UI descriptor.');
  } else {
    for (const [index, method] of descriptor.methods.entries()) {
      if (!isNonEmptyString(method.name)) {
        push(errors, `methods[${index}].name`, 'Method name is required.');
        continue;
      }
      if (methodNames.has(method.name)) {
        push(errors, `methods[${index}].name`, `Duplicate method name: ${method.name}.`);
      }
      methodNames.add(method.name);
    }
  }

  if (!Array.isArray(descriptor.errors)) {
    push(errors, 'errors', 'MCP-IDL errors array is required.');
  }
  if (!Array.isArray(descriptor.requires)) {
    push(errors, 'requires', 'MCP-IDL requires array is required.');
  }
  if (!isRecord(descriptor.compatibility)) {
    push(errors, 'compatibility', 'MCP-IDL compatibility metadata is required.');
  }

  validateMeta(descriptor.meta, errors);
  validateServices(descriptor.services, methodNames, errors);
  validateDataContracts(descriptor.data_contracts, descriptor.methods ?? [], methodNames, errors, warnings);
  validateUI(
    descriptor.ui,
    methodNames,
    descriptor.services,
    descriptor.data_contracts,
    descriptor.state_model,
    errors,
    warnings,
  );
  validatePermissions(descriptor.permissions, methodNames, errors, warnings);
  validateStateModel(descriptor.state_model, descriptor.data_contracts, errors, warnings);
  validateWorkflowGraph(descriptor.workflow_graph, methodNames, descriptor.services, descriptor.state_model, errors);

  return {
    conformant: errors.length === 0,
    errors,
    warnings,
  };
}

export function assertMCPUIProfileDescriptor(
  descriptor: Partial<MCPUIProfileDescriptor>,
): asserts descriptor is MCPUIProfileDescriptor {
  const result = validateMCPUIProfileDescriptor(descriptor);
  if (!result.conformant) {
    const detail = result.errors.map(issue => `${issue.path}: ${issue.message}`).join('; ');
    throw new Error(`MCP++ UI Profile conformance failed: ${detail}`);
  }
}

export function selectTemplateForDescriptor(
  descriptor: MCPUIProfileDescriptor,
): TemplateSelection {
  const explicit = descriptor.ui.templates.find(template => template.kind === descriptor.ui.primary_template);
  if (explicit) {
    return {
      kind: explicit.kind,
      reason: 'descriptor primary_template mapping',
      required_operations: explicit.operations,
    };
  }

  const contracts = descriptor.data_contracts.operations;
  const streamKinds = contracts.map(operation => operation.stream?.kind ?? 'none');
  const names = contracts.map(operation => operation.method.toLowerCase());
  const interfaceTypes = new Set(descriptor.services.map(service => service.interface_type));
  const stateSignals = getStateSignals(descriptor.state_model);

  if (streamKinds.some(kind => kind === 'progress' || kind === 'job-status')) {
    return {
      kind: 'job-console',
      reason: 'operation exposes progress or job-status stream',
      required_operations: operationMatches(names, TEMPLATE_CONTRACTS['job-console'].requires_one_of),
    };
  }

  if (
    interfaceTypes.has('graph')
    || names.some(name => name.includes('graph') || name.includes('lineage'))
    || stateSignals.some(signal => TEMPLATE_CONTRACTS['graph-viewer'].state_signals?.some(token => signal.includes(token)))
  ) {
    return {
      kind: 'graph-viewer',
      reason: 'graph interface, operation names, or state model signals',
      required_operations: operationMatches(names, TEMPLATE_CONTRACTS['graph-viewer'].requires_one_of),
    };
  }

  if (interfaceTypes.has('dataset') || names.some(name => ['browse', 'list', 'get', 'search'].some(token => name.includes(token)))) {
    return {
      kind: 'explorer',
      reason: 'dataset or browse/list/get/search operation shape',
      required_operations: operationMatches(names, TEMPLATE_CONTRACTS.explorer.requires_one_of),
    };
  }

  if (
    streamKinds.some(kind => kind === 'telemetry' || kind === 'events')
    || stateSignals.some(signal => TEMPLATE_CONTRACTS.dashboard.state_signals?.some(token => signal.includes(token)))
  ) {
    return {
      kind: 'dashboard',
      reason: 'operation exposes telemetry/events or dashboard-shaped state model',
      required_operations: operationMatches(names, TEMPLATE_CONTRACTS.dashboard.requires_one_of),
    };
  }

  return {
    kind: 'form-wizard',
    reason: 'request/response operation shape with input schemas',
    required_operations: operationMatches(names, TEMPLATE_CONTRACTS['form-wizard'].requires_one_of),
  };
}

function validateMeta(meta: unknown, errors: MCPUIConformanceIssue[]): void {
  if (!isRecord(meta)) {
    push(errors, 'meta', 'UI profile meta section is required.');
    return;
  }
  if (meta.profile !== SWISSKNIFE_MCP_UI_PROFILE) {
    push(errors, 'meta.profile', `Expected ${SWISSKNIFE_MCP_UI_PROFILE}.`);
  }
  if (!isNonEmptyString(meta.profile_version)) {
    push(errors, 'meta.profile_version', 'Profile version is required.');
  }
  if (!isNonEmptyString(meta.app_id)) {
    push(errors, 'meta.app_id', 'Generated desktop app id is required.');
  }
  if (!isNonEmptyString(meta.title)) {
    push(errors, 'meta.title', 'Generated desktop app title is required.');
  }
}

function validateServices(
  services: unknown,
  methodNames: Set<string>,
  errors: MCPUIConformanceIssue[],
): void {
  if (!Array.isArray(services) || services.length === 0) {
    push(errors, 'services', 'At least one service binding is required.');
    return;
  }

  services.forEach((service, index) => {
    if (!isRecord(service)) {
      push(errors, `services[${index}]`, 'Service must be an object.');
      return;
    }
    if (!isNonEmptyString(service.id)) {
      push(errors, `services[${index}].id`, 'Service id is required.');
    }
    if (!isNonEmptyString(service.interface_type)) {
      push(errors, `services[${index}].interface_type`, 'Service interface type is required.');
    }
    if (!Array.isArray(service.operations) || service.operations.length === 0) {
      push(errors, `services[${index}].operations`, 'Service must list bound operations.');
      return;
    }
    for (const operation of service.operations) {
      if (!isNonEmptyString(operation) || !methodNames.has(operation)) {
        push(errors, `services[${index}].operations`, `Unknown operation binding: ${String(operation)}.`);
      }
    }
  });
}

function validateDataContracts(
  dataContracts: unknown,
  methods: MethodSignature[],
  methodNames: Set<string>,
  errors: MCPUIConformanceIssue[],
  warnings: MCPUIConformanceIssue[],
): void {
  if (!isRecord(dataContracts)) {
    push(errors, 'data_contracts', 'Data contracts section is required.');
    return;
  }
  if (!Array.isArray(dataContracts.operations) || dataContracts.operations.length === 0) {
    push(errors, 'data_contracts.operations', 'At least one operation contract is required.');
    return;
  }

  const methodByName = new Map(methods.map(method => [method.name, method]));
  const seen = new Set<string>();

  dataContracts.operations.forEach((operation, index) => {
    if (!isRecord(operation)) {
      push(errors, `data_contracts.operations[${index}]`, 'Operation contract must be an object.');
      return;
    }
    if (!isNonEmptyString(operation.method)) {
      push(errors, `data_contracts.operations[${index}].method`, 'Operation method is required.');
      return;
    }
    const methodName = operation.method;
    if (!methodNames.has(methodName)) {
      push(errors, `data_contracts.operations[${index}].method`, `Unknown MCP-IDL method: ${methodName}.`);
      return;
    }
    if (seen.has(methodName)) {
      push(errors, `data_contracts.operations[${index}].method`, `Duplicate operation contract: ${methodName}.`);
    }
    seen.add(methodName);

    const method = methodByName.get(methodName);
    if (!hasInputSchema(operation, method)) {
      push(errors, `data_contracts.operations[${index}].input_schema`, `Input schema or CID is required for ${methodName}.`);
    }
    if (!hasOutputSchema(operation, method)) {
      push(errors, `data_contracts.operations[${index}].output_schema`, `Output schema or CID is required for ${methodName}.`);
    }

    const stream = operation.stream;
    if (stream !== undefined) {
      if (!isRecord(stream)) {
        push(errors, `data_contracts.operations[${index}].stream`, 'Stream contract must be an object.');
        return;
      }
      if (!STREAM_KINDS.has(stream.kind as StreamKind)) {
        push(errors, `data_contracts.operations[${index}].stream.kind`, `Unsupported stream kind: ${String(stream.kind)}.`);
      }
      if (stream.kind !== 'none' && !isRecord(stream.event_schema) && !isNonEmptyString(stream.event_schema_cid)) {
        push(errors, `data_contracts.operations[${index}].stream.event_schema`, `Event schema or CID is required for streaming operation ${methodName}.`);
      }
    }
  });

  for (const methodName of methodNames) {
    if (!seen.has(methodName)) {
      push(warnings, 'data_contracts.operations', `Method ${methodName} has no UI operation contract.`);
    }
  }
}

function validateUI(
  ui: unknown,
  methodNames: Set<string>,
  services: unknown,
  dataContracts: unknown,
  stateModel: unknown,
  errors: MCPUIConformanceIssue[],
  warnings: MCPUIConformanceIssue[],
): void {
  if (!isRecord(ui)) {
    push(errors, 'ui', 'UI section is required.');
    return;
  }
  if (!TEMPLATE_KINDS.has(ui.primary_template as TemplateKind)) {
    push(errors, 'ui.primary_template', `Unsupported primary template: ${String(ui.primary_template)}.`);
  }
  if (!Array.isArray(ui.templates) || ui.templates.length === 0) {
    push(errors, 'ui.templates', 'At least one template mapping is required.');
    return;
  }
  ui.templates.forEach((template, index) => {
    if (!isRecord(template)) {
      push(errors, `ui.templates[${index}]`, 'Template mapping must be an object.');
      return;
    }
    if (!TEMPLATE_KINDS.has(template.kind as TemplateKind)) {
      push(errors, `ui.templates[${index}].kind`, `Unsupported template kind: ${String(template.kind)}.`);
    }
    if (!Array.isArray(template.operations) || template.operations.length === 0) {
      push(errors, `ui.templates[${index}].operations`, 'Template mapping must declare operations.');
      return;
    }
    for (const operation of template.operations) {
      if (!isNonEmptyString(operation) || !methodNames.has(operation)) {
        push(errors, `ui.templates[${index}].operations`, `Unknown template operation: ${String(operation)}.`);
      }
    }
    validateTemplateContract(template, index, services, dataContracts, stateModel, errors, warnings);
  });
}

function validateTemplateContract(
  template: Record<string, unknown>,
  index: number,
  services: unknown,
  dataContracts: unknown,
  stateModel: unknown,
  errors: MCPUIConformanceIssue[],
  warnings: MCPUIConformanceIssue[],
): void {
  const kind = template.kind as TemplateKind;
  if (!TEMPLATE_KINDS.has(kind) || !Array.isArray(template.operations)) {
    return;
  }

  const contract = TEMPLATE_CONTRACTS[kind];
  const operationNames = template.operations.filter(isNonEmptyString).map(operation => operation.toLowerCase());
  const operationContracts = isRecord(dataContracts) && Array.isArray(dataContracts.operations)
    ? dataContracts.operations.filter(isRecord)
    : [];
  const serviceTypes = Array.isArray(services)
    ? services.filter(isRecord).map(service => service.interface_type).filter(isNonEmptyString)
    : [];
  const stateSignals = getStateSignals(stateModel);

  const hasRequiredOperation = operationNames.some(name => (
    contract.requires_one_of.some(token => name.includes(token))
  ));
  const hasStateSignal = contract.state_signals
    ? stateSignals.some(signal => contract.state_signals?.some(token => signal.includes(token)))
    : false;

  if (!hasRequiredOperation && !hasStateSignal) {
    push(
      errors,
      `ui.templates[${index}].operations`,
      `${kind} template requires an operation or state signal matching one of: ${contract.requires_one_of.join(', ')}.`,
    );
  }

  if (contract.interface_types && serviceTypes.length > 0) {
    const hasCompatibleService = serviceTypes.some(type => contract.interface_types?.includes(type as InterfaceType));
    if (!hasCompatibleService) {
      push(
        warnings,
        `ui.templates[${index}].kind`,
        `${kind} template has no service with an expected interface type: ${contract.interface_types.join(', ')}.`,
      );
    }
  }

  if (contract.stream) {
    const mappedStreams = operationContracts
      .filter(operation => operationNames.includes(String(operation.method).toLowerCase()))
      .map(operation => isRecord(operation.stream) ? operation.stream.kind : 'none');
    const hasRequiredStream = mappedStreams.some(kindName => contract.stream?.includes(kindName as StreamKind));
    if (!hasRequiredStream) {
      push(
        errors,
        `ui.templates[${index}].operations`,
        `${kind} template requires a mapped operation with stream kind: ${contract.stream.join(', ')}.`,
      );
    }
  }
}

function validatePermissions(
  permissions: unknown,
  methodNames: Set<string>,
  errors: MCPUIConformanceIssue[],
  warnings: MCPUIConformanceIssue[],
): void {
  if (!isRecord(permissions)) {
    push(errors, 'permissions', 'Permissions section is required.');
    return;
  }
  if (!isRecord(permissions.operations)) {
    push(errors, 'permissions.operations', 'Operation permissions are required.');
    return;
  }
  for (const [operation, grants] of Object.entries(permissions.operations)) {
    if (!methodNames.has(operation)) {
      push(errors, `permissions.operations.${operation}`, `Unknown permission operation: ${operation}.`);
    }
    if (!Array.isArray(grants) || !grants.every(isNonEmptyString)) {
      push(errors, `permissions.operations.${operation}`, 'Permissions must be non-empty capability strings.');
    }
  }
  for (const methodName of methodNames) {
    if (!(methodName in permissions.operations)) {
      push(warnings, 'permissions.operations', `Method ${methodName} has no explicit permission grant.`);
    }
  }
}

function validateStateModel(
  stateModel: unknown,
  dataContracts: unknown,
  errors: MCPUIConformanceIssue[],
  warnings: MCPUIConformanceIssue[],
): void {
  if (!isRecord(stateModel)) {
    push(errors, 'state_model', 'State model section is required.');
    return;
  }
  if (!Array.isArray(stateModel.keys) || !stateModel.keys.every(isNonEmptyString)) {
    push(errors, 'state_model.keys', 'State model keys must be strings.');
  }
  if (!Array.isArray(stateModel.events) || !stateModel.events.every(isNonEmptyString)) {
    push(errors, 'state_model.events', 'State model events must be strings.');
  }

  const operations = isRecord(dataContracts) && Array.isArray(dataContracts.operations)
    ? dataContracts.operations
    : [];
  const hasStreamingOperation = operations.some(
    operation => isRecord(operation) && isRecord(operation.stream) && operation.stream.kind !== 'none',
  );
  if (hasStreamingOperation && Array.isArray(stateModel.events) && stateModel.events.length === 0) {
    push(warnings, 'state_model.events', 'Streaming descriptors should declare replayable event names.');
  }
}

function validateWorkflowGraph(
  workflowGraph: unknown,
  methodNames: Set<string>,
  services: unknown,
  stateModel: unknown,
  errors: MCPUIConformanceIssue[],
): void {
  if (workflowGraph === undefined) {
    return;
  }
  if (!isRecord(workflowGraph)) {
    push(errors, 'workflow_graph', 'Workflow graph must be an object.');
    return;
  }
  if (!isNonEmptyString(workflowGraph.id)) {
    push(errors, 'workflow_graph.id', 'Workflow graph id is required.');
  }
  if (!Array.isArray(workflowGraph.shared_state_keys) || !workflowGraph.shared_state_keys.every(isNonEmptyString)) {
    push(errors, 'workflow_graph.shared_state_keys', 'Workflow shared state keys must be strings.');
    return;
  }
  if (!Array.isArray(workflowGraph.steps) || workflowGraph.steps.length === 0) {
    push(errors, 'workflow_graph.steps', 'Workflow graph must declare at least one step.');
    return;
  }

  const declaredStateKeys = new Set(
    isRecord(stateModel) && Array.isArray(stateModel.keys)
      ? stateModel.keys.filter(isNonEmptyString)
      : [],
  );
  const sharedStateKeys = new Set(workflowGraph.shared_state_keys);
  for (const key of sharedStateKeys) {
    if (!declaredStateKeys.has(key)) {
      push(
        errors,
        'workflow_graph.shared_state_keys',
        `Workflow shared state key is not declared in state_model.keys: ${key}.`,
      );
    }
  }

  const serviceOperations = new Map<string, Set<string>>();
  if (Array.isArray(services)) {
    for (const service of services) {
      if (!isRecord(service) || !isNonEmptyString(service.id) || !Array.isArray(service.operations)) {
        continue;
      }
      serviceOperations.set(
        service.id,
        new Set(service.operations.filter(isNonEmptyString)),
      );
    }
  }

  const stepIds = new Set<string>();
  workflowGraph.steps.forEach((step, index) => {
    if (!isRecord(step)) {
      push(errors, `workflow_graph.steps[${index}]`, 'Workflow step must be an object.');
      return;
    }
    if (!isNonEmptyString(step.id)) {
      push(errors, `workflow_graph.steps[${index}].id`, 'Workflow step id is required.');
      return;
    }
    if (stepIds.has(step.id)) {
      push(errors, `workflow_graph.steps[${index}].id`, `Duplicate workflow step id: ${step.id}.`);
    }
    stepIds.add(step.id);
  });

  workflowGraph.steps.forEach((step, index) => {
    if (!isRecord(step)) {
      return;
    }
    validateWorkflowOperationRef(step, `workflow_graph.steps[${index}]`, methodNames, serviceOperations, errors);
    validateWorkflowStringArray(step.depends_on, `workflow_graph.steps[${index}].depends_on`, errors);
    validateWorkflowStateKeys(step.read_state_keys, `workflow_graph.steps[${index}].read_state_keys`, sharedStateKeys, errors);
    validateWorkflowStateKeys(step.write_state_keys, `workflow_graph.steps[${index}].write_state_keys`, sharedStateKeys, errors);

    if (Array.isArray(step.depends_on)) {
      for (const dependency of step.depends_on) {
        if (!isNonEmptyString(dependency) || !stepIds.has(dependency)) {
          push(errors, `workflow_graph.steps[${index}].depends_on`, `Unknown workflow dependency: ${String(dependency)}.`);
        } else if (dependency === step.id) {
          push(errors, `workflow_graph.steps[${index}].depends_on`, `Workflow step cannot depend on itself: ${dependency}.`);
        }
      }
    }

    validateWorkflowAction(step.rollback, `workflow_graph.steps[${index}].rollback`, methodNames, serviceOperations, sharedStateKeys, errors);
    validateWorkflowAction(step.compensation, `workflow_graph.steps[${index}].compensation`, methodNames, serviceOperations, sharedStateKeys, errors);
  });

  validateWorkflowAcyclic(workflowGraph.steps, errors);
}

function validateWorkflowAction(
  action: unknown,
  path: string,
  methodNames: Set<string>,
  serviceOperations: Map<string, Set<string>>,
  sharedStateKeys: Set<string>,
  errors: MCPUIConformanceIssue[],
): void {
  if (action === undefined) {
    return;
  }
  if (!isRecord(action)) {
    push(errors, path, 'Workflow action must be an object.');
    return;
  }
  validateWorkflowOperationRef(action, path, methodNames, serviceOperations, errors);
  validateWorkflowStateKeys(action.state_keys, `${path}.state_keys`, sharedStateKeys, errors);
}

function validateWorkflowOperationRef(
  value: Record<string, unknown>,
  path: string,
  methodNames: Set<string>,
  serviceOperations: Map<string, Set<string>>,
  errors: MCPUIConformanceIssue[],
): void {
  if (!isNonEmptyString(value.operation)) {
    push(errors, `${path}.operation`, 'Workflow operation reference is required.');
    return;
  }
  if (!methodNames.has(value.operation)) {
    push(errors, `${path}.operation`, `Unknown workflow operation: ${value.operation}.`);
  }
  if (value.service_id === undefined) {
    return;
  }
  if (!isNonEmptyString(value.service_id)) {
    push(errors, `${path}.service_id`, 'Workflow service id must be a string.');
    return;
  }
  const operations = serviceOperations.get(value.service_id);
  if (!operations) {
    push(errors, `${path}.service_id`, `Unknown workflow service: ${value.service_id}.`);
    return;
  }
  if (isNonEmptyString(value.operation) && !operations.has(value.operation)) {
    push(
      errors,
      `${path}.service_id`,
      `Workflow service ${value.service_id} does not bind operation ${value.operation}.`,
    );
  }
}

function validateWorkflowStringArray(
  values: unknown,
  path: string,
  errors: MCPUIConformanceIssue[],
): void {
  if (values !== undefined && (!Array.isArray(values) || !values.every(isNonEmptyString))) {
    push(errors, path, 'Workflow references must be strings.');
  }
}

function validateWorkflowStateKeys(
  values: unknown,
  path: string,
  sharedStateKeys: Set<string>,
  errors: MCPUIConformanceIssue[],
): void {
  if (values === undefined) {
    return;
  }
  if (!Array.isArray(values) || !values.every(isNonEmptyString)) {
    push(errors, path, 'Workflow state keys must be strings.');
    return;
  }
  for (const key of values) {
    if (!sharedStateKeys.has(key)) {
      push(errors, path, `Workflow state key is not declared in workflow_graph.shared_state_keys: ${key}.`);
    }
  }
}

function validateWorkflowAcyclic(steps: unknown[], errors: MCPUIConformanceIssue[]): void {
  const graph = new Map<string, string[]>();
  for (const step of steps) {
    if (!isRecord(step) || !isNonEmptyString(step.id)) {
      continue;
    }
    graph.set(
      step.id,
      Array.isArray(step.depends_on) ? step.depends_on.filter(isNonEmptyString) : [],
    );
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visited.has(id)) {
      return false;
    }
    if (visiting.has(id)) {
      return true;
    }
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) {
      if (graph.has(dependency) && visit(dependency)) {
        return true;
      }
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  for (const id of graph.keys()) {
    if (visit(id)) {
      push(errors, 'workflow_graph.steps', 'Workflow graph dependencies must be acyclic.');
      return;
    }
  }
}

function hasInputSchema(operation: Record<string, unknown>, method?: MethodSignature): boolean {
  return isRecord(operation.input_schema)
    || isNonEmptyString(operation.input_schema_cid)
    || isRecord(method?.input_schema)
    || isRecord(method?.inputSchema)
    || isNonEmptyString(method?.input_schema_cid)
    || isNonEmptyString(method?.inputSchemaCid);
}

function hasOutputSchema(operation: Record<string, unknown>, method?: MethodSignature): boolean {
  return isRecord(operation.output_schema)
    || isNonEmptyString(operation.output_schema_cid)
    || isRecord(method?.output_schema)
    || isRecord(method?.outputSchema)
    || isNonEmptyString(method?.output_schema_cid)
    || isNonEmptyString(method?.outputSchemaCid);
}

function operationMatches(names: string[], tokens: string[]): string[] {
  const matches = names.filter(name => tokens.some(token => name.includes(token)));
  return matches.length > 0 ? matches : names.slice(0, 1);
}

function getStateSignals(stateModel: unknown): string[] {
  if (!isRecord(stateModel)) {
    return [];
  }
  return [
    ...(Array.isArray(stateModel.keys) ? stateModel.keys : []),
    ...(Array.isArray(stateModel.events) ? stateModel.events : []),
    ...(Array.isArray(stateModel.projections) ? stateModel.projections : []),
  ]
    .filter(isNonEmptyString)
    .map(signal => signal.toLowerCase());
}

function push(issues: MCPUIConformanceIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
