import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  META_GLASSES_DISPLAY_PROFILE,
  META_GLASSES_DISPLAY_PROFILE_PROPERTY,
  META_GLASSES_DISPLAY_PROFILE_VERSION,
  META_GLASSES_DISPLAY_VIEWPORT,
  validateMetaGlassesWidgetDescriptor,
  type MetaGlassesActionBinding,
  type MetaGlassesDisplayRegion,
  type MetaGlassesDisplayTemplate,
  type MetaGlassesRenderPath,
  type MetaGlassesWidgetDescriptor,
} from '../services/glasses/meta-glasses-display-profile.js';
import {
  MetaGlassesWidgetCompileError,
  compileMetaGlassesWidgetManifest,
  type MetaGlassesWidgetManifest,
} from '../services/glasses/meta-glasses-widget-compiler.js';

const COMMAND_NAME = 'meta-glasses';
const WIDGET_SCOPE = 'widget';
const DISPLAY_SERVICE_ID = 'display-widget';
const DEFAULT_NAMESPACE = 'org.handsfree.meta_glasses.gallery';
const DEFAULT_VERSION = '1.0.0';
const DEFAULT_POLICY = 'local-developer-preview';
const GALLERY_SCHEMA = 'handsfree.meta-glasses/widget-gallery';
const PUBLISH_SCHEMA = 'handsfree.meta-glasses/widget-publish-record';
const INVOCATION_SCHEMA = 'handsfree.meta-glasses/widget-invocation';
const OUTPUT_SCHEMA_VERSION = '0.1.0';

const OPEN_OBJECT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: true,
};

const STATUS_SUMMARY_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: true,
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    status: { type: 'string' },
  },
};

const STATUS_EVENT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: true,
  properties: {
    correlation_id: { type: 'string' },
    status: { type: 'string' },
  },
  required: ['correlation_id', 'status'],
};

export const META_GLASSES_WIDGET_GALLERY_TEMPLATE_IDS = [
  'task-progress',
  'confirmation',
  'summary',
  'timer',
  'media',
  'checklist',
  'metric',
] as const;

export type MetaGlassesWidgetGalleryTemplateId =
  (typeof META_GLASSES_WIDGET_GALLERY_TEMPLATE_IDS)[number];

export type MetaGlassesWidgetCommandAction =
  | 'help'
  | 'gallery'
  | 'init'
  | 'lint'
  | 'compile'
  | 'preview'
  | 'publish'
  | 'invoke';

export interface MetaGlassesWidgetGalleryEntry {
  id: MetaGlassesWidgetGalleryTemplateId;
  title: string;
  description: string;
  descriptor: MetaGlassesWidgetDescriptor;
  sample_state: Record<string, unknown>;
}

export interface MetaGlassesWidgetCommandOptions {
  cwd?: string;
  now?: () => Date;
}

export interface MetaGlassesWidgetCLIResult {
  ok: boolean;
  exit_code: number;
  action: MetaGlassesWidgetCommandAction;
  message: string;
  output?: unknown;
  files?: string[];
}

export interface MetaGlassesWidgetLintIssue {
  code: string;
  path: string;
  message: string;
}

export interface MetaGlassesWidgetLintResult {
  ok: boolean;
  descriptor_name?: string;
  template?: string;
  interface_cid?: string;
  widget_cid?: string;
  errors: MetaGlassesWidgetLintIssue[];
  warnings: MetaGlassesWidgetLintIssue[];
}

export interface MetaGlassesWidgetPublishRecord {
  schema: typeof PUBLISH_SCHEMA;
  schema_version: typeof OUTPUT_SCHEMA_VERSION;
  published_at: string;
  descriptor_path: string;
  native_code_required: false;
  trust_policy: string;
  policy_outcome: 'permit';
  interface_cid: string;
  widget_id: string;
  widget_cid: string;
  descriptor: MetaGlassesWidgetDescriptor;
  manifest: MetaGlassesWidgetManifest;
}

export interface MetaGlassesWidgetInvocationEnvelope {
  schema: typeof INVOCATION_SCHEMA;
  schema_version: typeof OUTPUT_SCHEMA_VERSION;
  invoked_at: string;
  native_code_required: false;
  operation: string;
  mobile_action: {
    type: string;
    operation: string;
    correlation_id: string;
    widget_id: string;
    interface_cid: string;
    widget_cid?: string;
    manifest?: MetaGlassesWidgetManifest;
    patch?: Record<string, unknown>;
    state?: Record<string, unknown>;
    focus?: {
      direction: 'next' | 'previous';
      action_id?: string;
      focus_index: number;
    };
    activated_action?: MetaGlassesWidgetManifest['actions'][number];
    issued_at: string;
  };
}

interface SwissknifeLocalCommandLike {
  type: 'local';
  name: string;
  description: string;
  options: Array<{
    name: string;
    type: 'string' | 'boolean' | 'number';
    description: string;
    required?: boolean;
    default?: string | boolean | number;
  }>;
  isEnabled: boolean;
  isHidden: boolean;
  handler(args: Record<string, unknown>): Promise<string | number>;
  userFacingName(): string;
}

interface ParsedWidgetArgs {
  action: MetaGlassesWidgetCommandAction;
  flags: Record<string, string | boolean>;
  positionals: string[];
}

interface GalleryDefinition {
  id: MetaGlassesWidgetGalleryTemplateId;
  title: string;
  description: string;
  descriptorName: string;
  layoutTemplate: MetaGlassesDisplayTemplate;
  semanticTags: string[];
  regions: MetaGlassesDisplayRegion[];
  actions: MetaGlassesActionBinding[];
  stateKeys: string[];
  sampleState: Record<string, unknown>;
  maxUpdateHz: number;
  ttlMs: number;
  renderPath?: MetaGlassesRenderPath;
  extraMethods?: string[];
}

class MetaGlassesWidgetCLIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetaGlassesWidgetCLIError';
  }
}

const metaGlassesWidgetCommand: SwissknifeLocalCommandLike = {
  type: 'local',
  name: COMMAND_NAME,
  description: 'Author Meta glasses display widgets from Swissknife descriptors',
  options: [
    {
      name: 'subcommand',
      type: 'string',
      description: 'Sub-command scope, expected: widget',
      required: false,
    },
    {
      name: 'action',
      type: 'string',
      description: 'Widget action: gallery|init|lint|compile|preview|publish|invoke',
      required: false,
    },
    {
      name: 'arg',
      type: 'string',
      description: 'Optional positional argument, such as a template id or descriptor path',
      required: false,
    },
    {
      name: 'args',
      type: 'string',
      description: 'Widget command arguments, for example: widget init --template task-progress',
      required: false,
    },
    {
      name: 'template',
      type: 'string',
      description: 'Gallery template id',
      required: false,
    },
    {
      name: 'descriptor',
      type: 'string',
      description: 'Descriptor JSON path',
      required: false,
    },
    {
      name: 'state-file',
      type: 'string',
      description: 'Widget state JSON path',
      required: false,
    },
    {
      name: 'output',
      type: 'string',
      description: 'Output path',
      required: false,
    },
    {
      name: 'operation',
      type: 'string',
      description: 'Widget operation for compile or invoke',
      required: false,
    },
  ],
  isEnabled: true,
  isHidden: false,
  async handler(args) {
    const result = await runMetaGlassesWidgetCommand(args);
    return formatMetaGlassesWidgetCLIResult(result);
  },
  userFacingName() {
    return COMMAND_NAME;
  },
};

export default metaGlassesWidgetCommand;

export async function runMetaGlassesWidgetCommand(
  input: string[] | string | Record<string, unknown>,
  options: MetaGlassesWidgetCommandOptions = {},
): Promise<MetaGlassesWidgetCLIResult> {
  const cwd = options.cwd ?? process.cwd();
  const now = options.now ?? (() => new Date());
  let action: MetaGlassesWidgetCommandAction = 'help';

  try {
    const parsed = parseWidgetArgs(input);
    action = parsed.action;
    switch (parsed.action) {
      case 'help':
        return {
          ok: true,
          exit_code: 0,
          action: 'help',
          message: widgetHelpText(),
        };
      case 'gallery':
        return runGallery(parsed);
      case 'init':
        return await runInit(parsed, cwd);
      case 'lint':
        return await runLint(parsed, cwd);
      case 'compile':
        return await runCompile(parsed, cwd);
      case 'preview':
        return await runPreview(parsed, cwd);
      case 'publish':
        return await runPublish(parsed, cwd, now);
      case 'invoke':
        return await runInvoke(parsed, cwd, now);
      default:
        return unreachableAction(parsed.action);
    }
  } catch (error) {
    return {
      ok: false,
      exit_code: 1,
      action,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function listMetaGlassesWidgetGalleryTemplates(): MetaGlassesWidgetGalleryEntry[] {
  return GALLERY_DEFINITIONS.map(definition => ({
    id: definition.id,
    title: definition.title,
    description: definition.description,
    descriptor: createGalleryDescriptor(definition),
    sample_state: { ...definition.sampleState },
  }));
}

export function createMetaGlassesWidgetDescriptor(
  templateId: MetaGlassesWidgetGalleryTemplateId,
  overrides: {
    name?: string;
    namespace?: string;
    version?: string;
    render_path?: MetaGlassesRenderPath;
  } = {},
): MetaGlassesWidgetDescriptor {
  return createGalleryDescriptor(getGalleryDefinition(templateId), overrides);
}

export function lintMetaGlassesWidgetDescriptor(
  descriptor: Partial<MetaGlassesWidgetDescriptor>,
  state: Record<string, unknown> = {},
  operation = 'render_widget',
): MetaGlassesWidgetLintResult {
  const validation = validateMetaGlassesWidgetDescriptor(descriptor);
  const result: MetaGlassesWidgetLintResult = {
    ok: validation.conformant,
    descriptor_name: descriptor.name,
    template: descriptor[META_GLASSES_DISPLAY_PROFILE_PROPERTY]?.layout.template,
    errors: validation.errors.map(issue => ({ ...issue })),
    warnings: validation.warnings.map(issue => ({ ...issue })),
  };

  if (!validation.conformant) {
    return result;
  }

  try {
    const manifest = compileMetaGlassesWidgetManifest(descriptor, {
      operation,
      state,
    });
    result.interface_cid = manifest.interface_cid;
    result.widget_cid = manifest.widget_cid;
  } catch (error) {
    if (error instanceof MetaGlassesWidgetCompileError) {
      result.ok = false;
      result.errors.push(...error.issues.map(issue => ({ ...issue })));
    } else {
      throw error;
    }
  }

  return result;
}

function runGallery(parsed: ParsedWidgetArgs): MetaGlassesWidgetCLIResult {
  const template = stringFlag(parsed, 'template');
  const entries = listMetaGlassesWidgetGalleryTemplates();
  if (template) {
    const entry = entries.find(candidate => candidate.id === template);
    if (!entry) {
      throw new MetaGlassesWidgetCLIError(
        `Unknown gallery template: ${template}. Valid templates: ${META_GLASSES_WIDGET_GALLERY_TEMPLATE_IDS.join(', ')}.`,
      );
    }
    return {
      ok: true,
      exit_code: 0,
      action: 'gallery',
      message: `Gallery template ${entry.id}: ${entry.title}`,
      output: entry,
    };
  }

  return {
    ok: true,
    exit_code: 0,
    action: 'gallery',
    message: `Meta glasses widget gallery: ${entries.map(entry => entry.id).join(', ')}`,
    output: {
      schema: GALLERY_SCHEMA,
      schema_version: OUTPUT_SCHEMA_VERSION,
      templates: entries.map(entry => ({
        id: entry.id,
        title: entry.title,
        description: entry.description,
        descriptor_name: entry.descriptor.name,
        layout_template: entry.descriptor[META_GLASSES_DISPLAY_PROFILE_PROPERTY].layout.template,
      })),
    },
  };
}

async function runInit(
  parsed: ParsedWidgetArgs,
  cwd: string,
): Promise<MetaGlassesWidgetCLIResult> {
  const templateId = galleryTemplateFlag(parsed);
  const descriptor = createMetaGlassesWidgetDescriptor(templateId, {
    name: stringFlag(parsed, 'name') ?? undefined,
    namespace: stringFlag(parsed, 'namespace') ?? undefined,
    version: stringFlag(parsed, 'version') ?? undefined,
    render_path: renderPathFlag(parsed),
  });
  const definition = getGalleryDefinition(templateId);
  const outputPath = resolvePath(
    cwd,
    stringFlag(parsed, 'output') ?? `${descriptor.name}.widget.json`,
  );
  const stateOutputPath = resolvePath(
    cwd,
    stringFlag(parsed, 'state-output') ?? defaultStateOutputPath(outputPath),
  );
  const force = booleanFlag(parsed, 'force');

  await writeJson(outputPath, descriptor, force);
  await writeJson(stateOutputPath, definition.sampleState, force);

  return {
    ok: true,
    exit_code: 0,
    action: 'init',
    message:
      `Initialized ${templateId} widget descriptor at ${relativeForMessage(cwd, outputPath)} ` +
      `and sample state at ${relativeForMessage(cwd, stateOutputPath)}.`,
    output: {
      descriptor_path: outputPath,
      state_path: stateOutputPath,
      descriptor,
      sample_state: definition.sampleState,
      native_code_required: false,
    },
    files: [outputPath, stateOutputPath],
  };
}

async function runLint(
  parsed: ParsedWidgetArgs,
  cwd: string,
): Promise<MetaGlassesWidgetCLIResult> {
  const descriptorPath = descriptorInputPath(parsed, cwd);
  const descriptor = await readJson<Partial<MetaGlassesWidgetDescriptor>>(descriptorPath);
  const state = await readState(parsed, cwd);
  const operation = stringFlag(parsed, 'operation') ?? 'render_widget';
  const lint = lintMetaGlassesWidgetDescriptor(descriptor, state, operation);

  return {
    ok: lint.ok,
    exit_code: lint.ok ? 0 : 1,
    action: 'lint',
    message: formatLintMessage(lint, descriptorPath, cwd),
    output: lint,
  };
}

async function runCompile(
  parsed: ParsedWidgetArgs,
  cwd: string,
): Promise<MetaGlassesWidgetCLIResult> {
  const descriptorPath = descriptorInputPath(parsed, cwd);
  const descriptor = await readJson<MetaGlassesWidgetDescriptor>(descriptorPath);
  const state = await readState(parsed, cwd);
  const manifest = compileMetaGlassesWidgetManifest(descriptor, {
    operation: stringFlag(parsed, 'operation') ?? 'render_widget',
    state,
    widget_id: stringFlag(parsed, 'widget-id') ?? undefined,
    interface_cid: stringFlag(parsed, 'interface-cid') ?? undefined,
  });
  const outputPath = resolvePath(
    cwd,
    stringFlag(parsed, 'output') ?? defaultOutputPath(descriptorPath, '.manifest.json'),
  );
  await writeJson(outputPath, manifest, booleanFlag(parsed, 'force'));

  return {
    ok: true,
    exit_code: 0,
    action: 'compile',
    message:
      `Compiled ${manifest.widget_id} to ${relativeForMessage(cwd, outputPath)} ` +
      `(${manifest.widget_cid}).`,
    output: manifest,
    files: [outputPath],
  };
}

async function runPreview(
  parsed: ParsedWidgetArgs,
  cwd: string,
): Promise<MetaGlassesWidgetCLIResult> {
  const manifest = await manifestFromArgs(parsed, cwd);
  const outputPath = resolvePath(
    cwd,
    stringFlag(parsed, 'output') ?? `${safeFilename(manifest.widget_id)}.preview.html`,
  );
  const html = renderPreviewHtml(manifest);
  await writeText(outputPath, html, booleanFlag(parsed, 'force'));

  return {
    ok: true,
    exit_code: 0,
    action: 'preview',
    message:
      `Wrote browser preview for ${manifest.widget_id} to ` +
      `${pathToFileURL(outputPath).toString()}.`,
    output: {
      preview_path: outputPath,
      preview_url: pathToFileURL(outputPath).toString(),
      widget_id: manifest.widget_id,
      widget_cid: manifest.widget_cid,
      native_code_required: false,
    },
    files: [outputPath],
  };
}

async function runPublish(
  parsed: ParsedWidgetArgs,
  cwd: string,
  now: () => Date,
): Promise<MetaGlassesWidgetCLIResult> {
  const descriptorPath = descriptorInputPath(parsed, cwd);
  const descriptor = await readJson<MetaGlassesWidgetDescriptor>(descriptorPath);
  const state = await readState(parsed, cwd);
  const manifest = compileMetaGlassesWidgetManifest(descriptor, {
    operation: stringFlag(parsed, 'operation') ?? 'render_widget',
    state,
    widget_id: stringFlag(parsed, 'widget-id') ?? undefined,
    interface_cid: stringFlag(parsed, 'interface-cid') ?? undefined,
  });
  const record: MetaGlassesWidgetPublishRecord = {
    schema: PUBLISH_SCHEMA,
    schema_version: OUTPUT_SCHEMA_VERSION,
    published_at: now().toISOString(),
    descriptor_path: descriptorPath,
    native_code_required: false,
    trust_policy: stringFlag(parsed, 'policy') ?? DEFAULT_POLICY,
    policy_outcome: 'permit',
    interface_cid: manifest.interface_cid,
    widget_id: manifest.widget_id,
    widget_cid: manifest.widget_cid,
    descriptor,
    manifest,
  };
  const outputPath = resolvePath(
    cwd,
    stringFlag(parsed, 'output') ?? defaultOutputPath(descriptorPath, '.publish.json'),
  );
  await writeJson(outputPath, record, booleanFlag(parsed, 'force'));

  return {
    ok: true,
    exit_code: 0,
    action: 'publish',
    message:
      `Published ${record.widget_id} with interface ${record.interface_cid} ` +
      `to ${relativeForMessage(cwd, outputPath)}.`,
    output: record,
    files: [outputPath],
  };
}

async function runInvoke(
  parsed: ParsedWidgetArgs,
  cwd: string,
  now: () => Date,
): Promise<MetaGlassesWidgetCLIResult> {
  const operation = stringFlag(parsed, 'operation') ?? parsed.positionals[0] ?? 'render_widget';
  const descriptorPath = descriptorInputPath(parsed, cwd);
  const descriptor = await readJson<MetaGlassesWidgetDescriptor>(descriptorPath);
  const state = await readState(parsed, cwd);
  const manifest = compileMetaGlassesWidgetManifest(descriptor, {
    operation: operation === 'activate' || operation === 'clear_widget'
      || operation === 'focus_next' || operation === 'focus_previous'
      || operation === 'reset_session'
      ? 'render_widget'
      : operation,
    state,
    widget_id: stringFlag(parsed, 'widget-id') ?? undefined,
    interface_cid: stringFlag(parsed, 'interface-cid') ?? undefined,
  });
  const invokedAt = now().toISOString();
  const envelope = createInvocationEnvelope(
    manifest,
    operation,
    {
      correlationId: stringFlag(parsed, 'correlation-id') ?? `local-${manifest.widget_cid.slice(7, 19)}`,
      state,
      patch: await readPatch(parsed, cwd),
      actionId: stringFlag(parsed, 'action-id') ?? undefined,
      issuedAt: invokedAt,
    },
  );
  const outputPath = stringFlag(parsed, 'output')
    ? resolvePath(cwd, stringFlag(parsed, 'output') as string)
    : undefined;

  if (outputPath) {
    await writeJson(outputPath, envelope, booleanFlag(parsed, 'force'));
  }

  return {
    ok: true,
    exit_code: 0,
    action: 'invoke',
    message:
      `Prepared ${envelope.mobile_action.type} for ${manifest.widget_id} ` +
      `(${operation}).`,
    output: envelope,
    files: outputPath ? [outputPath] : undefined,
  };
}

function createInvocationEnvelope(
  manifest: MetaGlassesWidgetManifest,
  operation: string,
  options: {
    correlationId: string;
    state: Record<string, unknown>;
    patch: Record<string, unknown>;
    actionId?: string;
    issuedAt: string;
  },
): MetaGlassesWidgetInvocationEnvelope {
  const actionType = mobileActionType(operation);
  const envelope: MetaGlassesWidgetInvocationEnvelope = {
    schema: INVOCATION_SCHEMA,
    schema_version: OUTPUT_SCHEMA_VERSION,
    invoked_at: options.issuedAt,
    native_code_required: false,
    operation,
    mobile_action: {
      type: actionType,
      operation,
      correlation_id: options.correlationId,
      widget_id: manifest.widget_id,
      interface_cid: manifest.interface_cid,
      issued_at: options.issuedAt,
    },
  };

  if (operation === 'render_widget') {
    envelope.mobile_action.widget_cid = manifest.widget_cid;
    envelope.mobile_action.manifest = manifest;
    envelope.mobile_action.state = manifest.state.values;
  } else if (operation === 'update_widget') {
    envelope.mobile_action.patch = options.patch;
    envelope.mobile_action.state = manifest.state.values;
  } else if (operation === 'focus_next' || operation === 'focus_previous') {
    const direction = operation === 'focus_next' ? 'next' : 'previous';
    const focusIndex = direction === 'next'
      ? Math.min(1, Math.max(0, manifest.focus_order.length - 1))
      : 0;
    envelope.mobile_action.focus = {
      direction,
      action_id: manifest.focus_order[focusIndex],
      focus_index: focusIndex,
    };
  } else if (operation === 'activate') {
    const action = options.actionId
      ? manifest.actions.find(candidate => candidate.id === options.actionId)
      : manifest.actions.find(candidate => candidate.id === manifest.focus_order[0]);
    if (!action) {
      throw new MetaGlassesWidgetCLIError(
        `Cannot activate unknown action ${options.actionId ?? '<first focus target>'}.`,
      );
    }
    envelope.mobile_action.activated_action = action;
  }

  return envelope;
}

async function manifestFromArgs(
  parsed: ParsedWidgetArgs,
  cwd: string,
): Promise<MetaGlassesWidgetManifest> {
  const manifestPath = stringFlag(parsed, 'manifest');
  if (manifestPath) {
    return await readJson<MetaGlassesWidgetManifest>(resolvePath(cwd, manifestPath));
  }

  const descriptorPath = descriptorInputPath(parsed, cwd);
  const descriptor = await readJson<MetaGlassesWidgetDescriptor>(descriptorPath);
  const state = await readState(parsed, cwd);
  return compileMetaGlassesWidgetManifest(descriptor, {
    operation: stringFlag(parsed, 'operation') ?? 'render_widget',
    state,
    widget_id: stringFlag(parsed, 'widget-id') ?? undefined,
    interface_cid: stringFlag(parsed, 'interface-cid') ?? undefined,
  });
}

function createGalleryDescriptor(
  definition: GalleryDefinition,
  overrides: {
    name?: string;
    namespace?: string;
    version?: string;
    render_path?: MetaGlassesRenderPath;
  } = {},
): MetaGlassesWidgetDescriptor {
  const methodNames = [
    'render_widget',
    'update_widget',
    'clear_widget',
    'focus_next',
    'focus_previous',
    'activate',
    'reset_session',
    'subscribe_updates',
    'status_summary',
    ...(definition.extraMethods ?? []),
  ];
  const uniqueMethodNames = Array.from(new Set(methodNames));
  const descriptorName = overrides.name ?? definition.descriptorName;
  const namespace = overrides.namespace ?? DEFAULT_NAMESPACE;
  const version = overrides.version ?? DEFAULT_VERSION;

  return {
    name: descriptorName,
    namespace,
    version,
    methods: uniqueMethodNames.map(name => ({
      name,
      input_schema: OPEN_OBJECT_SCHEMA,
      output_schema: name === 'status_summary' ? STATUS_SUMMARY_OUTPUT_SCHEMA : OPEN_OBJECT_SCHEMA,
    })),
    errors: [
      { name: 'DisplayUnavailable' },
      { name: 'ActionDenied' },
      { name: 'SessionNotReady' },
    ],
    requires: [],
    compatibility: {
      compatible_with: [],
      supersedes: [],
    },
    semanticTags: [
      'meta-glasses',
      'display-widget',
      ...definition.semanticTags,
    ],
    observability: {
      trace: true,
      provenance: true,
    },
    interaction_patterns: {
      request_response: true,
      event_streams: true,
    },
    meta: {
      profile: 'swissknife.mcp++/ui-profile',
      profile_version: '0.1.0',
      app_id: descriptorName,
      title: definition.title,
      description: definition.description,
      publisher: 'handsfree',
    },
    services: [
      {
        id: DISPLAY_SERVICE_ID,
        interface_type: 'generic',
        transport: 'mcp-server',
        operations: uniqueMethodNames,
      },
    ],
    ui: {
      primary_template: 'dashboard',
      templates: [
        {
          kind: 'dashboard',
          title: definition.title,
          operations: ['status_summary'],
          regions: [
            {
              id: 'summary',
              kind: 'status',
              operation: 'status_summary',
            },
          ],
        },
      ],
    },
    data_contracts: {
      operations: uniqueMethodNames.map(name => ({
        method: name,
        title: titleFromMethodName(name),
        input_schema: OPEN_OBJECT_SCHEMA,
        output_schema: name === 'status_summary' ? STATUS_SUMMARY_OUTPUT_SCHEMA : OPEN_OBJECT_SCHEMA,
        idempotent: ['render_widget', 'clear_widget', 'reset_session'].includes(name),
        stream: name === 'status_summary' || name === 'subscribe_updates' || name === 'update_widget'
          ? {
            kind: name === 'update_widget' ? 'progress' : 'telemetry',
            correlation_id_field: 'correlation_id',
            event_schema: STATUS_EVENT_SCHEMA,
          }
          : undefined,
      })),
    },
    permissions: {
      default_deny: true,
      operations: Object.fromEntries(
        uniqueMethodNames.map(name => [name, ['display/widget']]),
      ),
    },
    state_model: {
      keys: definition.stateKeys,
      events: [`display.${definition.id.replace(/-/g, '_')}.telemetry`],
      replay: true,
    },
    [META_GLASSES_DISPLAY_PROFILE_PROPERTY]: {
      profile: META_GLASSES_DISPLAY_PROFILE,
      profile_version: META_GLASSES_DISPLAY_PROFILE_VERSION,
      target: {
        display_class: 'meta-ray-ban-display',
        viewport: { ...META_GLASSES_DISPLAY_VIEWPORT },
        input: ['dpad', 'gesture', 'voice', 'mobile_action'],
        render_path: overrides.render_path ?? definition.renderPath ?? 'dat-native',
      },
      layout: {
        template: definition.layoutTemplate,
        regions: definition.regions,
        focus_order: definition.actions
          .filter(action => action.focusable !== false)
          .map(action => action.id),
      },
      constraints: {
        max_text_blocks: definition.regions.filter(region => region.text).length,
        max_actions: definition.actions.length,
        requires_high_contrast: true,
        requires_focus_order: definition.actions.some(action => action.focusable !== false),
        max_update_hz: definition.maxUpdateHz,
        ttl_ms: definition.ttlMs,
      },
      fallback: {
        when: [
          'dat_native_display_unavailable',
          'display_unsupported',
          'session_not_ready',
        ],
        render_path: 'mobile-card',
        message: `Display unavailable. Showing ${definition.title.toLowerCase()} on phone.`,
      },
      actions: definition.actions,
    },
  };
}

const GALLERY_DEFINITIONS: GalleryDefinition[] = [
  {
    id: 'task-progress',
    title: 'Task Progress',
    description: 'Progress, status, and pause/dismiss controls for a running task.',
    descriptorName: 'task-progress-widget',
    layoutTemplate: 'task-progress',
    semanticTags: ['task-progress', 'progress'],
    stateKeys: commonStateKeys(['title', 'summary', 'progress', 'progress_label', 'status']),
    sampleState: {
      title: 'Sync dataset',
      summary: 'Pinning and indexing a research collection for offline access.',
      progress: 0.42,
      progress_label: '42% complete',
      status: 'running',
      selected_action: null,
      last_error: null,
      updated_at: '2026-05-22T12:00:00.000Z',
    },
    maxUpdateHz: 2,
    ttlMs: 45_000,
    regions: [
      textRegion('title', 'text', 24, 24, 552, 72, 'state.title', 2, 64),
      textRegion('summary', 'status', 24, 112, 552, 168, 'state.summary', 4, 180, 'wrap'),
      textRegion('progress', 'progress', 24, 304, 552, 120, 'state.progress_label', 2, 48),
      actionRegion('pause-control', 24, 464, 264, 80, 'pause'),
      actionRegion('dismiss-control', 312, 464, 264, 80, 'dismiss'),
    ],
    actions: [
      actionBinding('pause', 'activate', 'handsfree.task.pause', 'Pause'),
      actionBinding('dismiss', 'clear_widget', 'handsfree.widget.dismiss', 'Dismiss'),
    ],
  },
  {
    id: 'confirmation',
    title: 'Confirmation Prompt',
    description: 'A high-contrast confirm/cancel prompt for policy-gated actions.',
    descriptorName: 'confirmation-widget',
    layoutTemplate: 'confirmation',
    semanticTags: ['confirmation', 'policy'],
    stateKeys: commonStateKeys(['title', 'message', 'warning', 'status']),
    sampleState: {
      title: 'Publish widget?',
      message: 'Send the approved descriptor and manifest to the local registry.',
      warning: 'Requires developer preview display policy.',
      status: 'awaiting_confirmation',
      selected_action: null,
      last_error: null,
      updated_at: '2026-05-22T12:05:00.000Z',
    },
    maxUpdateHz: 1,
    ttlMs: 30_000,
    regions: [
      textRegion('title', 'text', 24, 24, 552, 72, 'state.title', 2, 64),
      textRegion('message', 'status', 24, 112, 552, 224, 'state.message', 5, 220, 'wrap'),
      textRegion('warning', 'status', 24, 360, 552, 56, 'state.warning', 2, 96),
      actionRegion('confirm-control', 24, 464, 264, 80, 'confirm'),
      actionRegion('cancel-control', 312, 464, 264, 80, 'cancel'),
    ],
    actions: [
      actionBinding('confirm', 'activate', 'handsfree.confirmation.confirm', 'Confirm'),
      actionBinding('cancel', 'clear_widget', 'handsfree.confirmation.cancel', 'Cancel'),
    ],
  },
  {
    id: 'summary',
    title: 'Summary',
    description: 'A compact notification or inbox summary with acknowledge and open controls.',
    descriptorName: 'summary-widget',
    layoutTemplate: 'notification-summary',
    semanticTags: ['summary', 'notification-summary'],
    stateKeys: commonStateKeys(['title', 'summary', 'detail', 'status']),
    sampleState: {
      title: 'Inbox summary',
      summary: 'Three priority messages mention the release checklist.',
      detail: 'Latest from Alex: build evidence is ready for review.',
      status: 'unread',
      selected_action: null,
      last_error: null,
      updated_at: '2026-05-22T12:10:00.000Z',
    },
    maxUpdateHz: 1,
    ttlMs: 60_000,
    regions: [
      textRegion('title', 'text', 24, 24, 552, 72, 'state.title', 2, 64),
      textRegion('summary', 'status', 24, 112, 552, 240, 'state.summary', 5, 220, 'wrap'),
      textRegion('detail', 'status', 24, 384, 552, 56, 'state.detail', 2, 96),
      actionRegion('open-control', 24, 464, 264, 80, 'open'),
      actionRegion('dismiss-control', 312, 464, 264, 80, 'dismiss'),
    ],
    actions: [
      actionBinding('open', 'activate', 'handsfree.summary.open', 'Open'),
      actionBinding('dismiss', 'clear_widget', 'handsfree.summary.dismiss', 'Dismiss'),
    ],
  },
  {
    id: 'timer',
    title: 'Timer',
    description: 'A countdown or elapsed timer with pause, reset, and dismiss controls.',
    descriptorName: 'timer-widget',
    layoutTemplate: 'status',
    semanticTags: ['timer', 'countdown'],
    stateKeys: commonStateKeys(['title', 'remaining', 'status', 'progress_label']),
    sampleState: {
      title: 'Focus timer',
      remaining: '14:32',
      status: 'running',
      progress_label: 'Next break at 12:30 PM',
      selected_action: null,
      last_error: null,
      updated_at: '2026-05-22T12:15:00.000Z',
    },
    maxUpdateHz: 1,
    ttlMs: 1_000,
    regions: [
      textRegion('title', 'text', 24, 24, 552, 72, 'state.title', 2, 64),
      textRegion('remaining', 'status', 24, 128, 552, 144, 'state.remaining', 3, 16),
      textRegion('status', 'progress', 24, 320, 552, 96, 'state.progress_label', 2, 96),
      actionRegion('pause-control', 24, 464, 168, 80, 'pause'),
      actionRegion('reset-control', 216, 464, 168, 80, 'reset'),
      actionRegion('dismiss-control', 408, 464, 168, 80, 'dismiss'),
    ],
    actions: [
      actionBinding('pause', 'activate', 'handsfree.timer.pause', 'Pause'),
      actionBinding('reset', 'reset_session', 'handsfree.timer.reset', 'Reset'),
      actionBinding('dismiss', 'clear_widget', 'handsfree.timer.dismiss', 'Dismiss'),
    ],
  },
  {
    id: 'media',
    title: 'Media Card',
    description: 'Image or short video preview with declared size, duration, and fallback text.',
    descriptorName: 'media-widget',
    layoutTemplate: 'media',
    semanticTags: ['media', 'video-preview'],
    stateKeys: commonStateKeys(['title', 'caption', 'status']),
    sampleState: {
      title: 'Clip ready',
      caption: '12 second field validation clip.',
      status: 'ready',
      selected_action: null,
      last_error: null,
      updated_at: '2026-05-22T12:20:00.000Z',
    },
    maxUpdateHz: 1,
    ttlMs: 60_000,
    extraMethods: ['play_video'],
    regions: [
      textRegion('title', 'text', 24, 24, 552, 64, 'state.title', 2, 64),
      mediaRegion('preview', 24, 104, 552, 272),
      textRegion('caption', 'status', 24, 400, 552, 40, 'state.caption', 1, 64),
      actionRegion('play-control', 24, 464, 264, 80, 'play'),
      actionRegion('dismiss-control', 312, 464, 264, 80, 'dismiss'),
    ],
    actions: [
      actionBinding('play', 'play_video', 'handsfree.media.play', 'Play'),
      actionBinding('dismiss', 'clear_widget', 'handsfree.media.dismiss', 'Dismiss'),
    ],
  },
  {
    id: 'checklist',
    title: 'Checklist',
    description: 'A focused checklist with progress, next item, and completion controls.',
    descriptorName: 'checklist-widget',
    layoutTemplate: 'list',
    semanticTags: ['checklist', 'task-list'],
    stateKeys: commonStateKeys(['title', 'items', 'progress_label', 'status']),
    sampleState: {
      title: 'Release checklist',
      items: '1. Typecheck\n2. CLI tests\n3. Publish evidence',
      progress_label: '2 of 3 complete',
      status: 'reviewing',
      selected_action: null,
      last_error: null,
      updated_at: '2026-05-22T12:25:00.000Z',
    },
    maxUpdateHz: 2,
    ttlMs: 45_000,
    regions: [
      textRegion('title', 'text', 24, 24, 552, 64, 'state.title', 2, 64),
      textRegion('items', 'list', 24, 104, 552, 288, 'state.items', 8, 240, 'wrap'),
      textRegion('progress', 'progress', 24, 416, 552, 32, 'state.progress_label', 1, 48),
      actionRegion('next-control', 24, 464, 264, 80, 'next'),
      actionRegion('done-control', 312, 464, 264, 80, 'done'),
    ],
    actions: [
      actionBinding('next', 'activate', 'handsfree.checklist.next', 'Next'),
      actionBinding('done', 'clear_widget', 'handsfree.checklist.done', 'Done'),
    ],
  },
  {
    id: 'metric',
    title: 'Metric Dashboard',
    description: 'A compact metric dashboard for counters, ratios, and trend status.',
    descriptorName: 'metric-widget',
    layoutTemplate: 'freeform-grid',
    semanticTags: ['metric', 'dashboard'],
    stateKeys: commonStateKeys(['title', 'primary_metric', 'secondary_metric', 'trend', 'status']),
    sampleState: {
      title: 'Build metrics',
      primary_metric: '97.8% pass',
      secondary_metric: '42 ms p95',
      trend: '+3.1% from previous run',
      status: 'healthy',
      selected_action: null,
      last_error: null,
      updated_at: '2026-05-22T12:30:00.000Z',
    },
    maxUpdateHz: 2,
    ttlMs: 30_000,
    regions: [
      textRegion('title', 'text', 24, 24, 552, 64, 'state.title', 2, 64),
      textRegion('primary', 'status', 24, 112, 264, 120, 'state.primary_metric', 3, 48),
      textRegion('secondary', 'status', 312, 112, 264, 120, 'state.secondary_metric', 3, 48),
      textRegion('trend', 'progress', 24, 256, 552, 96, 'state.trend', 2, 96),
      textRegion('status', 'status', 24, 376, 552, 56, 'state.status', 2, 64),
      actionRegion('refresh-control', 24, 464, 264, 80, 'refresh'),
      actionRegion('dismiss-control', 312, 464, 264, 80, 'dismiss'),
    ],
    actions: [
      actionBinding('refresh', 'update_widget', 'handsfree.metric.refresh', 'Refresh'),
      actionBinding('dismiss', 'clear_widget', 'handsfree.metric.dismiss', 'Dismiss'),
    ],
  },
];

function textRegion(
  id: string,
  kind: MetaGlassesDisplayRegion['kind'],
  x: number,
  y: number,
  width: number,
  height: number,
  source: string,
  maxLines: number,
  maxChars: number,
  overflow: 'truncate' | 'wrap' | 'clip' = 'truncate',
): MetaGlassesDisplayRegion {
  return {
    id,
    kind,
    bounds: { x, y, width, height },
    text: {
      source,
      max_lines: maxLines,
      max_chars: maxChars,
      overflow,
    },
  };
}

function actionRegion(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  actionId: string,
): MetaGlassesDisplayRegion {
  return {
    id,
    kind: 'action',
    bounds: { x, y, width, height },
    action_id: actionId,
  };
}

function mediaRegion(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): MetaGlassesDisplayRegion {
  return {
    id,
    kind: 'media',
    bounds: { x, y, width, height },
    media: {
      type: 'video/mp4',
      transport: 'https',
      duration_ms: 12_000,
      size_bytes: 1_048_576,
      fallback_text: 'Media preview unavailable. Open on phone.',
    },
  };
}

function actionBinding(
  id: string,
  method: string,
  backendActionId: string,
  label: string,
): MetaGlassesActionBinding {
  return {
    id,
    method,
    backend_action_id: backendActionId,
    label,
    focusable: true,
    service_id: DISPLAY_SERVICE_ID,
    state_keys: ['selected_action'],
  };
}

function commonStateKeys(keys: string[]): string[] {
  return Array.from(new Set([
    ...keys,
    'selected_action',
    'last_error',
    'updated_at',
  ]));
}

function parseWidgetArgs(input: string[] | string | Record<string, unknown>): ParsedWidgetArgs {
  const tokens = normalizeTokens(input);
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const withoutPrefix = token.slice(2);
    const equalsIndex = withoutPrefix.indexOf('=');
    if (equalsIndex >= 0) {
      flags[withoutPrefix.slice(0, equalsIndex)] = withoutPrefix.slice(equalsIndex + 1);
      continue;
    }

    const nextToken = tokens[index + 1];
    if (!nextToken || nextToken.startsWith('--')) {
      flags[withoutPrefix] = true;
      continue;
    }

    flags[withoutPrefix] = nextToken;
    index += 1;
  }

  copyRecordFlags(input, flags);

  if (positionals[0] === COMMAND_NAME) {
    positionals.shift();
  }
  if (positionals[0] === WIDGET_SCOPE) {
    positionals.shift();
  }

  const actionCandidate = positionals.shift() ?? stringValue(flags.action) ?? 'help';
  if (!isWidgetAction(actionCandidate)) {
    throw new MetaGlassesWidgetCLIError(
      `Unknown meta glasses widget command: ${actionCandidate}. Run "swissknife meta-glasses widget help".`,
    );
  }

  return {
    action: actionCandidate,
    flags,
    positionals,
  };
}

function normalizeTokens(input: string[] | string | Record<string, unknown>): string[] {
  if (Array.isArray(input)) {
    return input;
  }
  if (typeof input === 'string') {
    return splitArgs(input);
  }

  const rawArgs = input.args;
  if (typeof rawArgs === 'string') {
    return splitArgs(rawArgs);
  }
  if (Array.isArray(rawArgs) && rawArgs.every(entry => typeof entry === 'string')) {
    return rawArgs;
  }
  if (Array.isArray(input._) && input._.every(entry => typeof entry === 'string')) {
    return input._;
  }

  const tokens: string[] = [];
  for (const key of ['scope', 'subcommand', 'action', 'arg']) {
    const value = input[key];
    if (typeof value === 'string' && value.length > 0) {
      tokens.push(value);
    }
  }
  return tokens;
}

function copyRecordFlags(
  input: string[] | string | Record<string, unknown>,
  flags: Record<string, string | boolean>,
): void {
  if (Array.isArray(input) || typeof input === 'string') {
    return;
  }

  for (const [key, value] of Object.entries(input)) {
    if (key === '_' || key === 'args' || key === 'scope' || key === 'subcommand' || key === 'action' || key === 'arg') {
      continue;
    }
    if (typeof value === 'string' || typeof value === 'boolean') {
      flags[key] = value;
    } else if (typeof value === 'number') {
      flags[key] = String(value);
    }
  }
}

function splitArgs(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === '\\') {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (quote) {
    throw new MetaGlassesWidgetCLIError('Unclosed quote in widget command arguments.');
  }
  if (escaping) {
    current += '\\';
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

async function readState(parsed: ParsedWidgetArgs, cwd: string): Promise<Record<string, unknown>> {
  const inline = stringFlag(parsed, 'state');
  if (inline) {
    return parseJsonObject(inline, '--state');
  }

  const stateFile = stringFlag(parsed, 'state-file');
  if (stateFile) {
    return await readJsonObject(resolvePath(cwd, stateFile));
  }

  return {};
}

async function readPatch(parsed: ParsedWidgetArgs, cwd: string): Promise<Record<string, unknown>> {
  const inline = stringFlag(parsed, 'patch');
  if (inline) {
    return parseJsonObject(inline, '--patch');
  }

  const patchFile = stringFlag(parsed, 'patch-file');
  if (patchFile) {
    return await readJsonObject(resolvePath(cwd, patchFile));
  }

  return {};
}

function parseJsonObject(input: string, source: string): Record<string, unknown> {
  const parsed = JSON.parse(input) as unknown;
  if (!isRecord(parsed)) {
    throw new MetaGlassesWidgetCLIError(`${source} must decode to a JSON object.`);
  }
  return parsed;
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown>> {
  const parsed = await readJson<unknown>(filePath);
  if (!isRecord(parsed)) {
    throw new MetaGlassesWidgetCLIError(`${filePath} must contain a JSON object.`);
  }
  return parsed;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

async function writeJson(filePath: string, value: unknown, force: boolean): Promise<void> {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`, force);
}

async function writeText(filePath: string, value: string, force: boolean): Promise<void> {
  if (!force && await exists(filePath)) {
    throw new MetaGlassesWidgetCLIError(
      `Refusing to overwrite ${filePath}. Pass --force to replace it.`,
    );
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, 'utf8');
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function descriptorInputPath(parsed: ParsedWidgetArgs, cwd: string): string {
  const value = stringFlag(parsed, 'descriptor')
    ?? stringFlag(parsed, 'input')
    ?? parsed.positionals[0];
  if (!value) {
    throw new MetaGlassesWidgetCLIError('A descriptor path is required. Pass --descriptor <file>.');
  }
  return resolvePath(cwd, value);
}

function resolvePath(cwd: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(cwd, value);
}

function defaultStateOutputPath(descriptorPath: string): string {
  return defaultOutputPath(descriptorPath, '.state.json');
}

function defaultOutputPath(inputPath: string, suffix: string): string {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}${suffix}`);
}

function relativeForMessage(cwd: string, filePath: string): string {
  const relative = path.relative(cwd, filePath);
  return relative.length > 0 && !relative.startsWith('..') ? relative : filePath;
}

function galleryTemplateFlag(parsed: ParsedWidgetArgs): MetaGlassesWidgetGalleryTemplateId {
  const templateId = stringFlag(parsed, 'template') ?? parsed.positionals[0] ?? 'task-progress';
  if (!isGalleryTemplateId(templateId)) {
    throw new MetaGlassesWidgetCLIError(
      `Unknown gallery template: ${templateId}. Valid templates: ${META_GLASSES_WIDGET_GALLERY_TEMPLATE_IDS.join(', ')}.`,
    );
  }
  return templateId;
}

function renderPathFlag(parsed: ParsedWidgetArgs): MetaGlassesRenderPath | undefined {
  const value = stringFlag(parsed, 'render-path');
  if (value === undefined) {
    return undefined;
  }
  if (value !== 'dat-native' && value !== 'display-webapp' && value !== 'simulator') {
    throw new MetaGlassesWidgetCLIError(`Unsupported render path: ${value}.`);
  }
  return value;
}

function stringFlag(parsed: ParsedWidgetArgs, name: string): string | undefined {
  return stringValue(parsed.flags[name]);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function booleanFlag(parsed: ParsedWidgetArgs, name: string): boolean {
  return parsed.flags[name] === true || parsed.flags[name] === 'true';
}

function getGalleryDefinition(templateId: MetaGlassesWidgetGalleryTemplateId): GalleryDefinition {
  const definition = GALLERY_DEFINITIONS.find(candidate => candidate.id === templateId);
  if (!definition) {
    return unreachableTemplate(templateId);
  }
  return definition;
}

function isGalleryTemplateId(value: string): value is MetaGlassesWidgetGalleryTemplateId {
  return (META_GLASSES_WIDGET_GALLERY_TEMPLATE_IDS as readonly string[]).includes(value);
}

function isWidgetAction(value: string): value is MetaGlassesWidgetCommandAction {
  return [
    'help',
    'gallery',
    'init',
    'lint',
    'compile',
    'preview',
    'publish',
    'invoke',
  ].includes(value);
}

function titleFromMethodName(methodName: string): string {
  return methodName
    .split('_')
    .map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function mobileActionType(operation: string): string {
  switch (operation) {
    case 'render_widget':
      return 'mobile_render_display_widget';
    case 'update_widget':
      return 'mobile_update_display_widget';
    case 'clear_widget':
      return 'mobile_clear_display_widget';
    case 'focus_next':
    case 'focus_previous':
      return 'mobile_focus_display_widget';
    case 'activate':
      return 'mobile_activate_display_widget_action';
    case 'reset_session':
      return 'mobile_reset_display_widget_session';
    case 'play_video':
      return 'mobile_play_display_widget_video';
    case 'subscribe_updates':
      return 'mobile_subscribe_display_widget_updates';
    default:
      throw new MetaGlassesWidgetCLIError(`Unsupported invoke operation: ${operation}.`);
  }
}

function renderPreviewHtml(manifest: MetaGlassesWidgetManifest): string {
  const regions = manifest.regions.map(region => {
    const action = region.action_id
      ? manifest.actions.find(candidate => candidate.id === region.action_id)
      : undefined;
    const media = region.media_id
      ? manifest.media.find(candidate => candidate.id === region.media_id)
      : undefined;
    const label = region.text?.value ?? action?.label ?? media?.fallback_text ?? region.id;
    const className = ['region', `kind-${region.kind}`, action ? 'focusable' : '']
      .filter(Boolean)
      .join(' ');
    return [
      `<div class="${className}" data-region-id="${escapeHtml(region.id)}" style="`,
      `left:${region.bounds.x}px;top:${region.bounds.y}px;width:${region.bounds.width}px;height:${region.bounds.height}px;">`,
      `<span>${escapeHtml(label)}</span>`,
      '</div>',
    ].join('');
  }).join('\n');

  return `<!doctype html>
<html lang="en" data-meta-glasses-widget-preview="true">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=600,height=600,initial-scale=1">
  <title>${escapeHtml(manifest.descriptor.name)} preview</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111827; color: #f8fafc; }
    .viewport { position: relative; width: 600px; height: 600px; background: #05070d; overflow: hidden; }
    .region { position: absolute; box-sizing: border-box; border: 1px solid #64748b; padding: 16px; display: flex; align-items: center; justify-content: center; text-align: center; color: #f8fafc; background: #111827; }
    .kind-text, .kind-status, .kind-list { justify-content: flex-start; text-align: left; }
    .kind-progress { background: #0f2f2a; border-color: #22c55e; }
    .kind-action { background: #1f2937; border-color: #38bdf8; }
    .kind-media { background: #111827; border-style: dashed; }
    .focusable:first-of-type, .focusable:focus { outline: 4px solid #38bdf8; outline-offset: -6px; }
    span { overflow-wrap: anywhere; white-space: pre-wrap; }
  </style>
</head>
<body>
  <main class="viewport" aria-label="${escapeHtml(manifest.widget_id)}">
${regions}
  </main>
  <script type="application/json" id="meta-glasses-widget-manifest">${escapeHtml(JSON.stringify(manifest))}</script>
</body>
</html>
`;
}

function formatMetaGlassesWidgetCLIResult(result: MetaGlassesWidgetCLIResult): string {
  if (result.output === undefined) {
    return result.message;
  }
  return `${result.message}\n${JSON.stringify(result.output, null, 2)}`;
}

function formatLintMessage(
  lint: MetaGlassesWidgetLintResult,
  descriptorPath: string,
  cwd: string,
): string {
  if (lint.ok) {
    return [
      `Meta glasses widget lint passed: ${relativeForMessage(cwd, descriptorPath)}`,
      `Descriptor: ${lint.descriptor_name ?? '<unknown>'}`,
      `Template: ${lint.template ?? '<unknown>'}`,
      `Interface CID: ${lint.interface_cid ?? '<not compiled>'}`,
      `Widget CID: ${lint.widget_cid ?? '<not compiled>'}`,
    ].join('\n');
  }

  const issues = lint.errors.length > 0 ? lint.errors : lint.warnings;
  return [
    `Meta glasses widget lint failed: ${relativeForMessage(cwd, descriptorPath)}`,
    'Why rejected:',
    ...issues.map(issue => `- ${issue.code} ${issue.path}: ${issue.message}`),
  ].join('\n');
}

function widgetHelpText(): string {
  return [
    'Swissknife Meta glasses widget commands:',
    '',
    '  swissknife meta-glasses widget gallery [--template <id>]',
    '  swissknife meta-glasses widget init --template <id> --output <descriptor.json>',
    '  swissknife meta-glasses widget lint --descriptor <descriptor.json> [--state-file <state.json>]',
    '  swissknife meta-glasses widget compile --descriptor <descriptor.json> --output <manifest.json>',
    '  swissknife meta-glasses widget preview --descriptor <descriptor.json> --output <preview.html>',
    '  swissknife meta-glasses widget publish --descriptor <descriptor.json> --output <publish.json>',
    '  swissknife meta-glasses widget invoke --descriptor <descriptor.json> --operation render_widget',
    '',
    `Gallery templates: ${META_GLASSES_WIDGET_GALLERY_TEMPLATE_IDS.join(', ')}`,
  ].join('\n');
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'widget';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error !== null
    && typeof error === 'object'
    && 'code' in error;
}

function unreachableAction(action: never): never {
  throw new MetaGlassesWidgetCLIError(`Unhandled widget command action: ${String(action)}.`);
}

function unreachableTemplate(templateId: string): never {
  throw new MetaGlassesWidgetCLIError(`Unhandled widget gallery template: ${String(templateId)}.`);
}
