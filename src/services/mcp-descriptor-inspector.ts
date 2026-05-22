import {
  selectTemplateForDescriptor,
  validateMCPUIProfileDescriptor,
  type MCPUIConformanceIssue,
  type MCPUIProfileDescriptor,
  type TemplateSelection,
} from './mcp-ui-profile.js';
import {
  generateSchemaDrivenUI,
  type GeneratedSchemaDrivenUI,
  type GeneratedUIPolicyDecision,
} from './mcp-schema-ui-generator.js';
import {
  replayGeneratedAppState,
  type GeneratedAppReplayEvent,
} from './mcp-generated-app-state.js';

export interface DescriptorInspectorOperation {
  method: string;
  title: string;
  input_fields: string[];
  output_fields: string[];
  stream_kind: string;
  permissions: string[];
}

export interface DescriptorInspectorViewModel {
  name: string;
  app_id: string;
  title: string;
  namespace: string;
  version: string;
  services: Array<{
    id: string;
    interface_type: string;
    transport?: string;
    endpoint?: string;
    operations: string[];
  }>;
  template: TemplateSelection;
  template_mappings: MCPUIProfileDescriptor['ui']['templates'];
  operations: DescriptorInspectorOperation[];
  permissions: MCPUIProfileDescriptor['permissions'];
  state_model: MCPUIProfileDescriptor['state_model'];
  workflow_graph?: MCPUIProfileDescriptor['workflow_graph'];
  ui_mapping?: DescriptorInspectorUIMapping;
  policy_decisions: Record<string, GeneratedUIPolicyDecision>;
  replay?: DescriptorInspectorReplaySummary;
  validation: {
    conformant: boolean;
    errors: MCPUIConformanceIssue[];
    warnings: MCPUIConformanceIssue[];
  };
}

export interface DescriptorInspectorOptions {
  replay_log?: GeneratedAppReplayEvent[];
  policy_decisions?: Record<string, GeneratedUIPolicyDecision>;
  granted_capabilities?: string[];
}

export interface DescriptorInspectorUIMapping {
  commands: Array<{
    operation: string;
    command_id: string;
    hidden: boolean;
    disabled_reason?: string;
    missing_capabilities: string[];
  }>;
  forms: string[];
  renderers: string[];
  regions: string[];
  widgets: string[];
  failures: Array<{
    path: string;
    message: string;
  }>;
}

export interface DescriptorInspectorReplaySummary {
  app_id: string;
  app_instance_id: string;
  descriptor_name?: string;
  descriptor_version?: string;
  interface_cid?: string;
  replay_event_count: number;
  command_count: number;
  stream_event_count: number;
  stale_stream_event_count: number;
  audit_entry_count: number;
  workflow_ids: string[];
  artifact_cids: string[];
}

export function inspectMCPUIProfileDescriptor(
  descriptor: MCPUIProfileDescriptor,
  optionsOrReplayLog: DescriptorInspectorOptions | GeneratedAppReplayEvent[] = {},
): DescriptorInspectorViewModel {
  const options = Array.isArray(optionsOrReplayLog)
    ? { replay_log: optionsOrReplayLog }
    : optionsOrReplayLog;
  const validation = validateMCPUIProfileDescriptor(descriptor);
  const template = validation.conformant
    ? selectTemplateForDescriptor(descriptor)
    : {
      kind: descriptor.ui?.primary_template ?? 'form-wizard',
      reason: 'descriptor has validation errors',
      required_operations: [],
    } as TemplateSelection;
  const generatedUI = validation.conformant
    ? generateSchemaDrivenUI(descriptor, template, { policy_decisions: options.policy_decisions })
    : undefined;

  return {
    name: descriptor.name,
    app_id: descriptor.meta?.app_id,
    title: descriptor.meta?.title,
    namespace: descriptor.namespace,
    version: descriptor.version,
    services: (descriptor.services ?? []).map(service => ({
      id: service.id,
      interface_type: service.interface_type,
      transport: service.transport,
      endpoint: service.endpoint,
      operations: service.operations,
    })),
    template,
    template_mappings: descriptor.ui?.templates ?? [],
    operations: (descriptor.data_contracts?.operations ?? []).map(operation => ({
      method: operation.method,
      title: operation.title ?? humanize(operation.method),
      input_fields: schemaFields(operation.input_schema),
      output_fields: schemaFields(operation.output_schema),
      stream_kind: operation.stream?.kind ?? 'none',
      permissions: descriptor.permissions?.operations?.[operation.method] ?? [],
    })),
    permissions: descriptor.permissions,
    state_model: descriptor.state_model,
    workflow_graph: descriptor.workflow_graph,
    ui_mapping: generatedUI
      ? inspectGeneratedUIMapping(descriptor, generatedUI, options.granted_capabilities ?? [])
      : undefined,
    policy_decisions: options.policy_decisions ?? {},
    replay: options.replay_log ? inspectGeneratedAppReplayLog(options.replay_log, {
      app_id: descriptor.meta?.app_id,
      descriptor_name: descriptor.name,
      descriptor_version: descriptor.version,
    }) : undefined,
    validation,
  };
}

function inspectGeneratedUIMapping(
  descriptor: MCPUIProfileDescriptor,
  generatedUI: GeneratedSchemaDrivenUI,
  grantedCapabilities: string[],
): DescriptorInspectorUIMapping {
  const granted = new Set(grantedCapabilities);
  const operationNames = new Set(descriptor.data_contracts.operations.map(operation => operation.method));
  const failures: DescriptorInspectorUIMapping['failures'] = [];
  for (const region of generatedUI.regions) {
    if (region.operation && !operationNames.has(region.operation)) {
      failures.push({
        path: `ui.regions.${region.id}`,
        message: `Region references unknown operation: ${region.operation}.`,
      });
    }
    if (region.operation && region.command_ids.length === 0 && region.form_ids.length === 0 && region.renderer_ids.length === 0) {
      failures.push({
        path: `ui.regions.${region.id}`,
        message: `Region ${region.id} has no generated command, form, or renderer binding.`,
      });
    }
  }
  return {
    commands: generatedUI.commands.map(command => ({
      operation: command.operation,
      command_id: command.id,
      hidden: Boolean(command.hidden),
      disabled_reason: command.disabled_reason,
      missing_capabilities: command.required_capabilities.filter(capability => !granted.has(capability)),
    })),
    forms: generatedUI.forms.map(form => form.id).sort(),
    renderers: generatedUI.result_renderers.map(renderer => renderer.id).sort(),
    regions: generatedUI.regions.map(region => region.id).sort(),
    widgets: generatedUI.widgets.map(widget => widget.id).sort(),
    failures,
  };
}

export function inspectGeneratedAppReplayLog(
  replayLog: GeneratedAppReplayEvent[],
  options: {
    app_id?: string;
    app_instance_id?: string;
    descriptor_name?: string;
    descriptor_version?: string;
    interface_cid?: string;
  } = {},
): DescriptorInspectorReplaySummary {
  const first = replayLog[0];
  const appId = options.app_id ?? first?.app_id ?? 'generated-mcp-app';
  const appInstanceId = options.app_instance_id ?? first?.app_instance_id ?? 'unknown-instance';
  const state = replayGeneratedAppState(appId, appInstanceId, replayLog);
  return {
    app_id: appId,
    app_instance_id: appInstanceId,
    descriptor_name: options.descriptor_name ?? first?.descriptor_name,
    descriptor_version: options.descriptor_version ?? first?.descriptor_version,
    interface_cid: options.interface_cid ?? first?.interface_cid,
    replay_event_count: state.replay_event_count,
    command_count: state.command_order.length,
    stream_event_count: state.stream_events.length,
    stale_stream_event_count: state.stale_stream_events.length,
    audit_entry_count: state.audit.entries.length,
    workflow_ids: Object.keys(state.workflows).sort(),
    artifact_cids: Object.keys(state.audit.artifact_lineage).sort(),
  };
}

function schemaFields(schema: Record<string, unknown> | undefined): string[] {
  const fields: string[] = [];
  const visit = (candidate: Record<string, unknown> | undefined, prefix = ''): void => {
    if (!candidate || typeof candidate !== 'object') {
      return;
    }
    const properties = candidate.properties;
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
      return;
    }
    for (const [name, child] of Object.entries(properties as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${name}` : name;
      fields.push(path);
      if (
        child
        && typeof child === 'object'
        && !Array.isArray(child)
        && (child as Record<string, unknown>).type === 'object'
        && (child as Record<string, unknown>).additionalProperties === false
      ) {
        visit(child as Record<string, unknown>, path);
      }
    }
  };
  visit(schema);
  return fields;
}

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}
