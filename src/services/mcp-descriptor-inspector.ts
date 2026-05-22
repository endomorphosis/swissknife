import {
  selectTemplateForDescriptor,
  validateMCPUIProfileDescriptor,
  type MCPUIConformanceIssue,
  type MCPUIProfileDescriptor,
  type TemplateSelection,
} from './mcp-ui-profile.js';

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
  validation: {
    conformant: boolean;
    errors: MCPUIConformanceIssue[];
    warnings: MCPUIConformanceIssue[];
  };
}

export function inspectMCPUIProfileDescriptor(
  descriptor: MCPUIProfileDescriptor,
): DescriptorInspectorViewModel {
  const validation = validateMCPUIProfileDescriptor(descriptor);
  const template = validation.conformant
    ? selectTemplateForDescriptor(descriptor)
    : {
      kind: descriptor.ui?.primary_template ?? 'form-wizard',
      reason: 'descriptor has validation errors',
      required_operations: [],
    } as TemplateSelection;

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
    validation,
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
