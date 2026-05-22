import {
  selectTemplateForDescriptor,
  type MCPUIOperationContract,
  type MCPUIProfileDescriptor,
  type MCPUISection,
  type MCPUIWorkflowGraph,
  type MCPUITemplateMapping,
  type TemplateKind,
  type TemplateSelection,
} from './mcp-ui-profile.js';

export type GeneratedFieldWidget =
  | 'text-input'
  | 'number-input'
  | 'checkbox'
  | 'select'
  | 'cid-picker'
  | 'did-input'
  | 'json-editor'
  | 'list-editor'
  | 'status-badge'
  | 'progress-timeline'
  | 'provenance-panel'
  | 'policy-denial-panel';

export type GeneratedRendererKind =
  | 'table'
  | 'object'
  | 'list'
  | 'status'
  | 'timeline'
  | 'provenance'
  | 'artifact-ref';

export type GeneratedRegionKind =
  | MCPUISection['kind']
  | NonNullable<MCPUITemplateMapping['regions']>[number]['kind'];

export interface GeneratedCommand {
  id: string;
  operation: string;
  title: string;
  required_capabilities: string[];
  idempotent: boolean;
  disabled_reason?: string;
}

export interface GeneratedFieldControl {
  id: string;
  operation: string;
  name: string;
  path: string;
  label: string;
  required: boolean;
  widget: GeneratedFieldWidget;
  schema: Record<string, unknown>;
  options?: string[];
}

export interface GeneratedOperationForm {
  id: string;
  operation: string;
  title: string;
  submit_command_id: string;
  fields: GeneratedFieldControl[];
}

export interface GeneratedRendererField {
  name: string;
  path: string;
  label: string;
  widget: GeneratedFieldWidget;
  schema: Record<string, unknown>;
}

export interface GeneratedResultRenderer {
  id: string;
  operation: string;
  title: string;
  kind: GeneratedRendererKind;
  fields: GeneratedRendererField[];
  schema: Record<string, unknown>;
}

export interface GeneratedRegion {
  id: string;
  title: string;
  kind: GeneratedRegionKind;
  operation?: string;
  command_ids: string[];
  form_ids: string[];
  renderer_ids: string[];
}

export interface GeneratedWidgetBinding {
  id: string;
  operation: string;
  surface: 'input' | 'output' | 'policy' | 'stream';
  widget: GeneratedFieldWidget;
  path?: string;
  label: string;
}

export interface GeneratedSchemaDrivenUI {
  app_id: string;
  title: string;
  template: TemplateKind;
  template_reason: string;
  commands: GeneratedCommand[];
  forms: GeneratedOperationForm[];
  result_renderers: GeneratedResultRenderer[];
  regions: GeneratedRegion[];
  widgets: GeneratedWidgetBinding[];
  workflow_graph?: MCPUIWorkflowGraph;
}

export interface GeneratedValidationIssue {
  path: string;
  message: string;
}

export interface GeneratedValidationResult {
  valid: boolean;
  errors: GeneratedValidationIssue[];
}

interface SchemaField {
  name: string;
  path: string;
  required: boolean;
  schema: Record<string, unknown>;
}

export function generateSchemaDrivenUI(
  descriptor: MCPUIProfileDescriptor,
  templateSelection: TemplateSelection = selectTemplateForDescriptor(descriptor),
): GeneratedSchemaDrivenUI {
  const commands = descriptor.data_contracts.operations.map(operation => generateCommand(descriptor, operation));
  const forms = descriptor.data_contracts.operations.map(operation => generateOperationForm(descriptor, operation));
  const resultRenderers = descriptor.data_contracts.operations.map(operation => generateResultRenderer(descriptor, operation));
  const widgets = [
    ...forms.flatMap(form => form.fields.map(field => ({
      id: field.id,
      operation: field.operation,
      surface: 'input' as const,
      widget: field.widget,
      path: field.path,
      label: field.label,
    }))),
    ...resultRenderers.flatMap(renderer => renderer.fields.map(field => ({
      id: `${renderer.id}.${field.path}`,
      operation: renderer.operation,
      surface: 'output' as const,
      widget: field.widget,
      path: field.path,
      label: field.label,
    }))),
    ...descriptor.data_contracts.operations.flatMap(operation => generatePolicyWidgets(descriptor, operation)),
    ...descriptor.data_contracts.operations.flatMap(operation => generateStreamWidgets(operation)),
  ];

  return {
    app_id: descriptor.meta.app_id,
    title: descriptor.meta.title,
    template: templateSelection.kind,
    template_reason: templateSelection.reason,
    commands,
    forms,
    result_renderers: resultRenderers,
    regions: generateRegions(descriptor, commands, forms, resultRenderers),
    widgets: dedupeWidgets(widgets),
    workflow_graph: descriptor.workflow_graph
      ? JSON.parse(JSON.stringify(descriptor.workflow_graph)) as MCPUIWorkflowGraph
      : undefined,
  };
}

export function generateOperationForm(
  descriptor: MCPUIProfileDescriptor,
  operation: MCPUIOperationContract,
): GeneratedOperationForm {
  const schema = operation.input_schema ?? methodSchema(descriptor, operation.method, 'input') ?? { type: 'object' };
  const fields = flattenSchemaFields(schema).map(field => ({
    id: `${operation.method}.input.${field.path}`,
    operation: operation.method,
    name: field.name,
    path: field.path,
    label: humanize(field.name),
    required: field.required,
    widget: selectInputWidget(field.name, field.schema),
    schema: field.schema,
    options: Array.isArray(field.schema.enum)
      ? field.schema.enum.filter((value): value is string => typeof value === 'string')
      : undefined,
  }));

  return {
    id: `${operation.method}.form`,
    operation: operation.method,
    title: operation.title ?? humanize(operation.method),
    submit_command_id: `${operation.method}.command`,
    fields,
  };
}

export function generateResultRenderer(
  descriptor: MCPUIProfileDescriptor,
  operation: MCPUIOperationContract,
): GeneratedResultRenderer {
  const schema = operation.output_schema ?? methodSchema(descriptor, operation.method, 'output') ?? { type: 'object' };
  const fields = flattenSchemaFields(schema).map(field => ({
    name: field.name,
    path: field.path,
    label: humanize(field.name),
    widget: selectOutputWidget(field.name, field.schema),
    schema: field.schema,
  }));

  return {
    id: `${operation.method}.result`,
    operation: operation.method,
    title: `${operation.title ?? humanize(operation.method)} Result`,
    kind: selectRendererKind(operation, schema, fields),
    fields,
    schema,
  };
}

export function validateGeneratedOperationInput(
  form: GeneratedOperationForm,
  input: Record<string, unknown>,
): GeneratedValidationResult {
  const errors: GeneratedValidationIssue[] = [];
  for (const field of form.fields) {
    const value = valueAtPath(input, field.path);
    if (field.required && value === undefined) {
      errors.push({ path: field.path, message: `${field.label} is required.` });
      continue;
    }
    if (value === undefined) {
      continue;
    }
    validateValue(field.path, field.label, value, field.schema, errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function escapeGeneratedUIText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateCommand(
  descriptor: MCPUIProfileDescriptor,
  operation: MCPUIOperationContract,
): GeneratedCommand {
  const requiredCapabilities = descriptor.permissions.operations[operation.method] ?? [];
  return {
    id: `${operation.method}.command`,
    operation: operation.method,
    title: operation.title ?? humanize(operation.method),
    required_capabilities: requiredCapabilities,
    idempotent: Boolean(operation.idempotent),
    disabled_reason: descriptor.permissions.default_deny && requiredCapabilities.length > 0
      ? `Requires ${requiredCapabilities.join(', ')}`
      : undefined,
  };
}

function generateRegions(
  descriptor: MCPUIProfileDescriptor,
  commands: GeneratedCommand[],
  forms: GeneratedOperationForm[],
  renderers: GeneratedResultRenderer[],
): GeneratedRegion[] {
  const commandByOperation = new Map(commands.map(command => [command.operation, command]));
  const formByOperation = new Map(forms.map(form => [form.operation, form]));
  const rendererByOperation = new Map(renderers.map(renderer => [renderer.operation, renderer]));
  const regions = descriptor.ui.sections?.length
    ? descriptor.ui.sections
    : descriptor.ui.templates.flatMap(template => template.regions ?? []);

  return regions.map(region => {
    const operation = region.operation;
    return {
      id: region.id,
      title: 'title' in region && typeof region.title === 'string'
        ? region.title
        : humanize(region.id),
      kind: region.kind,
      operation,
      command_ids: operation && commandByOperation.has(operation) ? [commandByOperation.get(operation)!.id] : [],
      form_ids: operation && formByOperation.has(operation) ? [formByOperation.get(operation)!.id] : [],
      renderer_ids: operation && rendererByOperation.has(operation) ? [rendererByOperation.get(operation)!.id] : [],
    };
  });
}

function generatePolicyWidgets(
  descriptor: MCPUIProfileDescriptor,
  operation: MCPUIOperationContract,
): GeneratedWidgetBinding[] {
  const capabilities = descriptor.permissions.operations[operation.method] ?? [];
  if (!descriptor.permissions.default_deny || capabilities.length === 0) {
    return [];
  }
  return [{
    id: `${operation.method}.policy-denial`,
    operation: operation.method,
    surface: 'policy',
    widget: 'policy-denial-panel',
    label: `Policy for ${humanize(operation.method)}`,
  }];
}

function generateStreamWidgets(operation: MCPUIOperationContract): GeneratedWidgetBinding[] {
  if (!operation.stream || operation.stream.kind === 'none') {
    return [];
  }
  return [{
    id: `${operation.method}.stream.${operation.stream.kind}`,
    operation: operation.method,
    surface: 'stream',
    widget: operation.stream.kind === 'telemetry' ? 'status-badge' : 'progress-timeline',
    label: `${humanize(operation.method)} ${humanize(operation.stream.kind)}`,
  }];
}

function flattenSchemaFields(schema: Record<string, unknown>, prefix = '', inheritedRequired = false): SchemaField[] {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((value): value is string => typeof value === 'string')
    : [];

  if (Object.keys(properties).length === 0) {
    return [];
  }

  const fields: SchemaField[] = [];
  for (const [name, rawChildSchema] of Object.entries(properties)) {
    if (!isRecord(rawChildSchema)) {
      continue;
    }
    const path = prefix ? `${prefix}.${name}` : name;
    const isRequired = inheritedRequired || required.includes(name);
    const childProperties = isRecord(rawChildSchema.properties) ? rawChildSchema.properties : {};
    const shouldFlattenChild = rawChildSchema.type === 'object'
      && Object.keys(childProperties).length > 0
      && rawChildSchema.additionalProperties === false;

    if (shouldFlattenChild) {
      fields.push(...flattenSchemaFields(rawChildSchema, path, isRequired));
    } else {
      fields.push({
        name,
        path,
        required: isRequired,
        schema: rawChildSchema,
      });
    }
  }
  return fields;
}

function selectInputWidget(name: string, schema: Record<string, unknown>): GeneratedFieldWidget {
  const normalized = name.toLowerCase();
  if (normalized.includes('cid')) return 'cid-picker';
  if (normalized.includes('did')) return 'did-input';
  if (Array.isArray(schema.enum)) return 'select';
  if (schema.type === 'boolean') return 'checkbox';
  if (schema.type === 'number' || schema.type === 'integer') return 'number-input';
  if (schema.type === 'array') return 'list-editor';
  if (schema.type === 'object') return 'json-editor';
  return 'text-input';
}

function selectOutputWidget(name: string, schema: Record<string, unknown>): GeneratedFieldWidget {
  const normalized = name.toLowerCase();
  if (normalized.includes('provenance')) return 'provenance-panel';
  if (normalized.includes('progress')) return 'progress-timeline';
  if (normalized.includes('status')) return 'status-badge';
  if (normalized.includes('cid')) return 'cid-picker';
  if (schema.type === 'array') return 'list-editor';
  if (schema.type === 'object') return 'json-editor';
  if (schema.type === 'number' || schema.type === 'integer') return 'number-input';
  if (schema.type === 'boolean') return 'checkbox';
  return 'text-input';
}

function selectRendererKind(
  operation: MCPUIOperationContract,
  schema: Record<string, unknown>,
  fields: GeneratedRendererField[],
): GeneratedRendererKind {
  const fieldNames = fields.map(field => field.name.toLowerCase());
  if (operation.stream?.kind === 'progress' || fieldNames.includes('progress')) return 'timeline';
  if (operation.stream?.kind === 'job-status' || fieldNames.includes('status')) return 'status';
  if (fieldNames.some(name => ['entries', 'rows', 'items'].includes(name))) return 'table';
  if (fieldNames.some(name => name.includes('provenance'))) return 'provenance';
  if (fieldNames.some(name => name.includes('artifact') || name.includes('cid'))) return 'artifact-ref';
  if (schema.type === 'array') return 'list';
  return 'object';
}

function validateValue(
  path: string,
  label: string,
  value: unknown,
  schema: Record<string, unknown>,
  errors: GeneratedValidationIssue[],
): void {
  if (!matchesSchemaType(value, schema.type)) {
    errors.push({ path, message: `${label} must be ${String(schema.type)}.` });
    return;
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push({ path, message: `${label} must be one of: ${schema.enum.join(', ')}.` });
  }
  if (typeof value === 'string' && typeof schema.minLength === 'number' && value.length < schema.minLength) {
    errors.push({ path, message: `${label} must be at least ${schema.minLength} characters.` });
  }
  if (typeof value === 'number' && typeof schema.minimum === 'number' && value < schema.minimum) {
    errors.push({ path, message: `${label} must be at least ${schema.minimum}.` });
  }
  if (typeof value === 'number' && typeof schema.maximum === 'number' && value > schema.maximum) {
    errors.push({ path, message: `${label} must be at most ${schema.maximum}.` });
  }
}

function matchesSchemaType(value: unknown, schemaType: unknown): boolean {
  if (schemaType === undefined) return true;
  const types = Array.isArray(schemaType) ? schemaType : [schemaType];
  return types.some(type => {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'integer':
        return Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return isRecord(value);
      case 'null':
        return value === null;
      default:
        return true;
    }
  });
}

function methodSchema(
  descriptor: MCPUIProfileDescriptor,
  methodName: string,
  direction: 'input' | 'output',
): Record<string, unknown> | undefined {
  const method = descriptor.methods.find(candidate => candidate.name === methodName);
  if (!method) {
    return undefined;
  }
  return direction === 'input'
    ? method.input_schema ?? method.inputSchema
    : method.output_schema ?? method.outputSchema;
}

function valueAtPath(input: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => (
    isRecord(current) ? current[segment] : undefined
  ), input);
}

function dedupeWidgets(widgets: GeneratedWidgetBinding[]): GeneratedWidgetBinding[] {
  const seen = new Set<string>();
  return widgets.filter(widget => {
    if (seen.has(widget.id)) {
      return false;
    }
    seen.add(widget.id);
    return true;
  });
}

function humanize(value: string): string {
  return escapeGeneratedUIText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
