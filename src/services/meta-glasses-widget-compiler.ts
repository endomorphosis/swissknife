import { computeCID, computeInterfaceCID } from './mcp-idl.js';
import {
  META_GLASSES_DISPLAY_PROFILE_PROPERTY,
  META_GLASSES_DISPLAY_VIEWPORT,
  META_GLASSES_REQUIRED_METHODS,
  validateMetaGlassesWidgetDescriptor,
  type MetaGlassesDisplayFallback,
  type MetaGlassesDisplayProfile,
  type MetaGlassesDisplayRegion,
  type MetaGlassesMediaContract,
  type MetaGlassesRenderPath,
  type MetaGlassesViewport,
  type MetaGlassesWidgetDescriptor,
} from './meta-glasses-display-profile.js';

export const META_GLASSES_WIDGET_MANIFEST_SCHEMA =
  'handsfree.meta-glasses/widget-manifest';
export const META_GLASSES_WIDGET_MANIFEST_SCHEMA_VERSION = '0.1.0';

export const META_GLASSES_WIDGET_COMPILER_ERROR_CODES = {
  DESCRIPTOR_INVALID: 'MGW_WIDGET_DESCRIPTOR_INVALID',
  OPERATION_UNSUPPORTED: 'MGW_WIDGET_OPERATION_UNSUPPORTED',
  REGION_BOUNDS_UNSAFE: 'MGW_WIDGET_REGION_BOUNDS_UNSAFE',
  REGION_COLLISION: 'MGW_WIDGET_REGION_COLLISION',
  TEXT_FIT_UNSAFE: 'MGW_WIDGET_TEXT_FIT_UNSAFE',
  TEXT_BLOCK_LIMIT: 'MGW_WIDGET_TEXT_BLOCK_LIMIT',
  ACTION_LIMIT: 'MGW_WIDGET_ACTION_LIMIT',
  ACTION_UNSAFE: 'MGW_WIDGET_ACTION_UNSAFE',
  FOCUS_ORDER_UNSAFE: 'MGW_WIDGET_FOCUS_ORDER_UNSAFE',
  MEDIA_UNSAFE: 'MGW_WIDGET_MEDIA_UNSAFE',
  STATE_UNSAFE: 'MGW_WIDGET_STATE_UNSAFE',
} as const;

export type MetaGlassesWidgetCompilerCode =
  (typeof META_GLASSES_WIDGET_COMPILER_ERROR_CODES)[keyof typeof META_GLASSES_WIDGET_COMPILER_ERROR_CODES];

export interface MetaGlassesWidgetCompileIssue {
  code: MetaGlassesWidgetCompilerCode;
  path: string;
  message: string;
}

export class MetaGlassesWidgetCompileError extends Error {
  readonly issues: MetaGlassesWidgetCompileIssue[];

  constructor(issues: MetaGlassesWidgetCompileIssue[]) {
    super(`Meta glasses widget manifest compile failed: ${formatIssues(issues)}`);
    this.name = 'MetaGlassesWidgetCompileError';
    this.issues = issues;
  }
}

export type MetaGlassesJSONValue =
  | null
  | boolean
  | number
  | string
  | MetaGlassesJSONValue[]
  | { [key: string]: MetaGlassesJSONValue };

export interface MetaGlassesWidgetCompileOptions {
  operation?: string;
  state?: Record<string, unknown>;
  widget_id?: string;
  interface_cid?: string;
}

export interface MetaGlassesCompiledText {
  source?: string;
  value: string;
  max_lines: number;
  max_chars: number;
  overflow: 'truncate' | 'wrap' | 'clip';
  estimated_capacity_chars: number;
}

export interface MetaGlassesCompiledRegion {
  id: string;
  kind: MetaGlassesDisplayRegion['kind'];
  bounds: MetaGlassesDisplayRegion['bounds'];
  text?: MetaGlassesCompiledText;
  action_id?: string;
  media_id?: string;
  visible_if?: string;
}

export interface MetaGlassesCompiledAction {
  id: string;
  method: string;
  backend_action_id: string;
  label?: string;
  focusable: boolean;
  focus_index?: number;
  service_id?: string;
  state_keys: string[];
  region_id?: string;
}

export interface MetaGlassesCompiledMedia {
  id: string;
  region_id: string;
  type: MetaGlassesMediaContract['type'];
  transport: MetaGlassesMediaContract['transport'];
  duration_ms?: number;
  size_bytes: number;
  fallback_text: string;
}

export interface MetaGlassesWidgetManifestState {
  keys: string[];
  values: Record<string, MetaGlassesJSONValue>;
}

export interface MetaGlassesWidgetRendererHints {
  primary_render_path: MetaGlassesRenderPath;
  supported_inputs: MetaGlassesDisplayProfile['target']['input'];
  high_contrast_required: boolean;
  max_update_hz: number;
  native_dat: {
    display_class: MetaGlassesDisplayProfile['target']['display_class'];
    fixed_viewport: true;
    session_required: true;
  };
  display_webapp: {
    viewport: MetaGlassesViewport;
    fallback_allowed: boolean;
  };
}

export interface MetaGlassesWidgetManifest {
  schema: typeof META_GLASSES_WIDGET_MANIFEST_SCHEMA;
  schema_version: typeof META_GLASSES_WIDGET_MANIFEST_SCHEMA_VERSION;
  widget_id: string;
  widget_cid: string;
  interface_cid: string;
  operation: string;
  descriptor: {
    name: string;
    namespace: string;
    version: string;
    profile: MetaGlassesDisplayProfile['profile'];
    profile_version: MetaGlassesDisplayProfile['profile_version'];
  };
  viewport: MetaGlassesViewport;
  regions: MetaGlassesCompiledRegion[];
  focus_order: string[];
  actions: MetaGlassesCompiledAction[];
  media: MetaGlassesCompiledMedia[];
  state: MetaGlassesWidgetManifestState;
  ttl_ms: number | null;
  fallback: MetaGlassesDisplayFallback;
  renderer_hints: MetaGlassesWidgetRendererHints;
}

export const META_GLASSES_WIDGET_MANIFEST_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://handsfree.local/schemas/meta-glasses-widget-manifest.schema.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'schema',
    'schema_version',
    'widget_id',
    'widget_cid',
    'interface_cid',
    'operation',
    'descriptor',
    'viewport',
    'regions',
    'focus_order',
    'actions',
    'media',
    'state',
    'ttl_ms',
    'fallback',
    'renderer_hints',
  ],
  properties: {
    schema: { const: META_GLASSES_WIDGET_MANIFEST_SCHEMA },
    schema_version: { const: META_GLASSES_WIDGET_MANIFEST_SCHEMA_VERSION },
    widget_id: { type: 'string', minLength: 1 },
    widget_cid: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
    interface_cid: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
    operation: { type: 'string', minLength: 1 },
    descriptor: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'namespace', 'version', 'profile', 'profile_version'],
      properties: {
        name: { type: 'string', minLength: 1 },
        namespace: { type: 'string', minLength: 1 },
        version: { type: 'string', minLength: 1 },
        profile: { type: 'string', minLength: 1 },
        profile_version: { type: 'string', minLength: 1 },
      },
    },
    viewport: {
      type: 'object',
      additionalProperties: false,
      required: ['width', 'height'],
      properties: {
        width: { const: META_GLASSES_DISPLAY_VIEWPORT.width },
        height: { const: META_GLASSES_DISPLAY_VIEWPORT.height },
      },
    },
    regions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'kind', 'bounds'],
        properties: {
          id: { type: 'string', minLength: 1 },
          kind: {
            enum: ['text', 'status', 'progress', 'list', 'media', 'action', 'spacer'],
          },
          bounds: {
            type: 'object',
            additionalProperties: false,
            required: ['x', 'y', 'width', 'height'],
            properties: {
              x: { type: 'number', minimum: 0 },
              y: { type: 'number', minimum: 0 },
              width: { type: 'number', exclusiveMinimum: 0 },
              height: { type: 'number', exclusiveMinimum: 0 },
            },
          },
          text: {
            type: 'object',
            additionalProperties: false,
            required: [
              'value',
              'max_lines',
              'max_chars',
              'overflow',
              'estimated_capacity_chars',
            ],
            properties: {
              source: { type: 'string', minLength: 1 },
              value: { type: 'string' },
              max_lines: { type: 'integer', minimum: 1 },
              max_chars: { type: 'integer', minimum: 1 },
              overflow: { enum: ['truncate', 'wrap', 'clip'] },
              estimated_capacity_chars: { type: 'integer', minimum: 0 },
            },
          },
          action_id: { type: 'string', minLength: 1 },
          media_id: { type: 'string', minLength: 1 },
          visible_if: { type: 'string', minLength: 1 },
        },
      },
    },
    focus_order: { type: 'array', items: { type: 'string', minLength: 1 } },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'method', 'backend_action_id', 'focusable', 'state_keys'],
        properties: {
          id: { type: 'string', minLength: 1 },
          method: { type: 'string', minLength: 1 },
          backend_action_id: { type: 'string', minLength: 1 },
          label: { type: 'string', minLength: 1 },
          focusable: { type: 'boolean' },
          focus_index: { type: 'integer', minimum: 0 },
          service_id: { type: 'string', minLength: 1 },
          state_keys: { type: 'array', items: { type: 'string', minLength: 1 } },
          region_id: { type: 'string', minLength: 1 },
        },
      },
    },
    media: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'region_id', 'type', 'transport', 'size_bytes', 'fallback_text'],
        properties: {
          id: { type: 'string', minLength: 1 },
          region_id: { type: 'string', minLength: 1 },
          type: { enum: ['image/png', 'image/jpeg', 'video/mp4'] },
          transport: { enum: ['cid', 'https', 'stream'] },
          duration_ms: { type: 'integer', minimum: 1 },
          size_bytes: { type: 'integer', minimum: 1 },
          fallback_text: { type: 'string', minLength: 1 },
        },
      },
    },
    state: {
      type: 'object',
      additionalProperties: false,
      required: ['keys', 'values'],
      properties: {
        keys: { type: 'array', items: { type: 'string', minLength: 1 } },
        values: {
          type: 'object',
          additionalProperties: {
            type: ['null', 'boolean', 'number', 'string', 'array', 'object'],
          },
        },
      },
    },
    ttl_ms: { type: ['integer', 'null'], minimum: 1 },
    fallback: {
      type: 'object',
      additionalProperties: false,
      required: ['when', 'render_path', 'message'],
      properties: {
        when: {
          type: 'array',
          contains: { const: 'dat_native_display_unavailable' },
          items: {
            enum: [
              'dat_native_display_unavailable',
              'display_unsupported',
              'session_not_ready',
            ],
          },
        },
        render_path: {
          enum: ['display-webapp', 'simulator', 'mobile-card', 'notification', 'audio-summary'],
        },
        message: { type: 'string', minLength: 1 },
      },
    },
    renderer_hints: {
      type: 'object',
      additionalProperties: false,
      required: [
        'primary_render_path',
        'supported_inputs',
        'high_contrast_required',
        'max_update_hz',
        'native_dat',
        'display_webapp',
      ],
      properties: {
        primary_render_path: { enum: ['dat-native', 'display-webapp', 'simulator'] },
        supported_inputs: {
          type: 'array',
          items: { enum: ['dpad', 'gesture', 'voice', 'mobile_action'] },
        },
        high_contrast_required: { type: 'boolean' },
        max_update_hz: { type: 'number', exclusiveMinimum: 0 },
        native_dat: {
          type: 'object',
          additionalProperties: false,
          required: ['display_class', 'fixed_viewport', 'session_required'],
          properties: {
            display_class: { const: 'meta-ray-ban-display' },
            fixed_viewport: { const: true },
            session_required: { const: true },
          },
        },
        display_webapp: {
          type: 'object',
          additionalProperties: false,
          required: ['viewport', 'fallback_allowed'],
          properties: {
            viewport: {
              type: 'object',
              additionalProperties: false,
              required: ['width', 'height'],
              properties: {
                width: { const: META_GLASSES_DISPLAY_VIEWPORT.width },
                height: { const: META_GLASSES_DISPLAY_VIEWPORT.height },
              },
            },
            fallback_allowed: { type: 'boolean' },
          },
        },
      },
    },
  },
} as const;

const TEXT_CHAR_WIDTH_PX = 8;
const TEXT_LINE_HEIGHT_PX = 24;
const COMPILABLE_WIDGET_OPERATIONS = new Set<string>([
  ...META_GLASSES_REQUIRED_METHODS,
  'play_video',
  'subscribe_updates',
]);

export function compileMetaGlassesWidgetManifest(
  descriptor: Partial<MetaGlassesWidgetDescriptor>,
  options: MetaGlassesWidgetCompileOptions = {},
): MetaGlassesWidgetManifest {
  const issues: MetaGlassesWidgetCompileIssue[] = [];
  const validation = validateMetaGlassesWidgetDescriptor(descriptor);
  if (!validation.conformant) {
    for (const error of validation.errors) {
      issues.push({
        code: META_GLASSES_WIDGET_COMPILER_ERROR_CODES.DESCRIPTOR_INVALID,
        path: error.path,
        message: `${error.code}: ${error.message}`,
      });
    }
    throw new MetaGlassesWidgetCompileError(issues);
  }

  const widgetDescriptor = descriptor as MetaGlassesWidgetDescriptor;
  const profile = widgetDescriptor[META_GLASSES_DISPLAY_PROFILE_PROPERTY];
  const operation = options.operation ?? 'render_widget';
  const methodNames = new Set(widgetDescriptor.methods.map(method => method.name));
  if (!methodNames.has(operation) || !COMPILABLE_WIDGET_OPERATIONS.has(operation)) {
    issues.push({
      code: META_GLASSES_WIDGET_COMPILER_ERROR_CODES.OPERATION_UNSUPPORTED,
      path: 'operation',
      message: `Operation is not a declared widget operation: ${operation}.`,
    });
  }

  const state = compileState(widgetDescriptor, options.state ?? {}, issues);
  const actionRegions = mapActionRegions(profile.layout.regions);
  const actions = compileActions(profile, widgetDescriptor, actionRegions, issues);
  const media = compileMedia(profile.layout.regions, issues);
  const regions = compileRegions(profile.layout.regions, state.values, media, issues);
  validateRegionGeometry(profile, issues);
  validateCompilerLimits(profile, widgetDescriptor, issues);
  validateFocusOrder(profile, actions, issues);

  if (issues.length > 0) {
    throw new MetaGlassesWidgetCompileError(issues);
  }

  const manifestWithoutCid: Omit<MetaGlassesWidgetManifest, 'widget_cid'> = {
    schema: META_GLASSES_WIDGET_MANIFEST_SCHEMA,
    schema_version: META_GLASSES_WIDGET_MANIFEST_SCHEMA_VERSION,
    widget_id: options.widget_id ?? defaultWidgetId(widgetDescriptor),
    interface_cid: options.interface_cid ?? computeInterfaceCID(widgetDescriptor),
    operation,
    descriptor: {
      name: widgetDescriptor.name,
      namespace: widgetDescriptor.namespace,
      version: widgetDescriptor.version,
      profile: profile.profile,
      profile_version: profile.profile_version,
    },
    viewport: clonePlain(profile.target.viewport),
    regions,
    focus_order: [...(profile.layout.focus_order ?? [])],
    actions,
    media,
    state,
    ttl_ms: profile.constraints.ttl_ms ?? null,
    fallback: clonePlain(profile.fallback),
    renderer_hints: rendererHints(profile),
  };

  const widgetCid = computeCID(stableStringify(manifestWithoutCid));

  return {
    ...manifestWithoutCid,
    widget_cid: widgetCid,
  };
}

function compileState(
  descriptor: MetaGlassesWidgetDescriptor,
  state: Record<string, unknown>,
  issues: MetaGlassesWidgetCompileIssue[],
): MetaGlassesWidgetManifestState {
  const keys = [...descriptor.state_model.keys];
  const values: Record<string, MetaGlassesJSONValue> = {};

  for (const key of keys) {
    values[key] = Object.prototype.hasOwnProperty.call(state, key)
      ? toJSONValue(state[key], `state.${key}`, issues)
      : null;
  }

  return { keys, values };
}

function compileActions(
  profile: MetaGlassesDisplayProfile,
  descriptor: MetaGlassesWidgetDescriptor,
  actionRegions: Map<string, string>,
  issues: MetaGlassesWidgetCompileIssue[],
): MetaGlassesCompiledAction[] {
  const stateKeys = new Set(descriptor.state_model.keys);
  const focusOrder = profile.layout.focus_order ?? [];

  return (profile.actions ?? []).map((action, index) => {
    if (!isNonEmptyString(action.backend_action_id)) {
      issues.push({
        code: META_GLASSES_WIDGET_COMPILER_ERROR_CODES.ACTION_UNSAFE,
        path: `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.actions[${index}].backend_action_id`,
        message: `Action ${action.id} must declare a backend-approved action id.`,
      });
    }

    const actionStateKeys = action.state_keys ?? [];
    for (const key of actionStateKeys) {
      if (!stateKeys.has(key)) {
        issues.push({
          code: META_GLASSES_WIDGET_COMPILER_ERROR_CODES.STATE_UNSAFE,
          path: `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.actions[${index}].state_keys`,
          message: `Action ${action.id} references undeclared state key ${key}.`,
        });
      }
    }

    const focusable = action.focusable !== false;
    const focusIndex = focusOrder.indexOf(action.id);
    if (focusable && !actionRegions.has(action.id)) {
      issues.push({
        code: META_GLASSES_WIDGET_COMPILER_ERROR_CODES.ACTION_UNSAFE,
        path: `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.actions[${index}].id`,
        message: `Focusable action ${action.id} must be reachable from a layout region.`,
      });
    }

    return omitUndefined({
      id: action.id,
      method: action.method,
      backend_action_id: action.backend_action_id,
      label: action.label,
      focusable,
      focus_index: focusIndex >= 0 ? focusIndex : undefined,
      service_id: action.service_id,
      state_keys: [...actionStateKeys],
      region_id: actionRegions.get(action.id),
    });
  });
}

function compileMedia(
  regions: MetaGlassesDisplayRegion[],
  issues: MetaGlassesWidgetCompileIssue[],
): MetaGlassesCompiledMedia[] {
  return regions.flatMap((region, index) => {
    if (!region.media) {
      return [];
    }
    const mediaPath = `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.layout.regions[${index}].media`;
    if (!isPositiveInteger(region.media.size_bytes)) {
      issues.push({
        code: META_GLASSES_WIDGET_COMPILER_ERROR_CODES.MEDIA_UNSAFE,
        path: `${mediaPath}.size_bytes`,
        message: `Media region ${region.id} must declare a positive byte size.`,
      });
    }
    if (region.media.type === 'video/mp4' && !isPositiveInteger(region.media.duration_ms)) {
      issues.push({
        code: META_GLASSES_WIDGET_COMPILER_ERROR_CODES.MEDIA_UNSAFE,
        path: `${mediaPath}.duration_ms`,
        message: `Video media region ${region.id} must declare a positive duration.`,
      });
    }

    return [
      omitUndefined({
        id: `${region.id}-media`,
        region_id: region.id,
        type: region.media.type,
        transport: region.media.transport,
        duration_ms: region.media.duration_ms,
        size_bytes: region.media.size_bytes ?? 0,
        fallback_text: region.media.fallback_text,
      }),
    ];
  });
}

function compileRegions(
  regions: MetaGlassesDisplayRegion[],
  state: Record<string, MetaGlassesJSONValue>,
  media: MetaGlassesCompiledMedia[],
  issues: MetaGlassesWidgetCompileIssue[],
): MetaGlassesCompiledRegion[] {
  const mediaByRegion = new Map(media.map(entry => [entry.region_id, entry.id]));

  return regions.map((region, index) => {
    const compiledText = region.text
      ? compileText(region, index, state, issues)
      : undefined;

    return omitUndefined({
      id: region.id,
      kind: region.kind,
      bounds: clonePlain(region.bounds),
      text: compiledText,
      action_id: region.action_id,
      media_id: mediaByRegion.get(region.id),
      visible_if: region.visible_if,
    });
  });
}

function compileText(
  region: MetaGlassesDisplayRegion,
  index: number,
  state: Record<string, MetaGlassesJSONValue>,
  issues: MetaGlassesWidgetCompileIssue[],
): MetaGlassesCompiledText {
  const text = region.text;
  if (!text) {
    throw new Error(`Region ${region.id} does not declare text.`);
  }

  const capacity = textCapacity(region);
  const path = `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.layout.regions[${index}].text`;
  if (capacity.maxLines < text.max_lines || capacity.maxChars < text.max_chars) {
    issues.push({
      code: META_GLASSES_WIDGET_COMPILER_ERROR_CODES.TEXT_FIT_UNSAFE,
      path,
      message:
        `Text region ${region.id} declares ${text.max_lines} lines and ${text.max_chars} chars, ` +
        `but its bounds fit at most ${capacity.maxLines} lines and ${capacity.maxChars} chars.`,
    });
  }

  const resolved = resolveTextValue(text.source, text.value, state);
  return omitUndefined({
    source: text.source,
    value: clampText(resolved, text.max_chars),
    max_lines: text.max_lines,
    max_chars: text.max_chars,
    overflow: text.overflow,
    estimated_capacity_chars: capacity.maxChars,
  });
}

function validateRegionGeometry(
  profile: MetaGlassesDisplayProfile,
  issues: MetaGlassesWidgetCompileIssue[],
): void {
  const viewport = profile.target.viewport;
  const seenIds = new Set<string>();

  profile.layout.regions.forEach((region, index) => {
    const path = `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.layout.regions[${index}]`;
    if (seenIds.has(region.id)) {
      issues.push({
        code: META_GLASSES_WIDGET_COMPILER_ERROR_CODES.REGION_BOUNDS_UNSAFE,
        path: `${path}.id`,
        message: `Region id must be unique: ${region.id}.`,
      });
    }
    seenIds.add(region.id);

    if (!withinViewport(region.bounds, viewport)) {
      issues.push({
        code: META_GLASSES_WIDGET_COMPILER_ERROR_CODES.REGION_BOUNDS_UNSAFE,
        path: `${path}.bounds`,
        message: `Region ${region.id} must stay within the ${viewport.width}x${viewport.height} viewport.`,
      });
    }
  });

  for (let a = 0; a < profile.layout.regions.length; a += 1) {
    const first = profile.layout.regions[a];
    if (!first || first.kind === 'spacer') {
      continue;
    }
    for (let b = a + 1; b < profile.layout.regions.length; b += 1) {
      const second = profile.layout.regions[b];
      if (!second || second.kind === 'spacer') {
        continue;
      }
      if (rectanglesOverlap(first.bounds, second.bounds)) {
        issues.push({
          code: META_GLASSES_WIDGET_COMPILER_ERROR_CODES.REGION_COLLISION,
          path: `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.layout.regions`,
          message: `Regions ${first.id} and ${second.id} overlap.`,
        });
      }
    }
  }
}

function validateCompilerLimits(
  profile: MetaGlassesDisplayProfile,
  descriptor: MetaGlassesWidgetDescriptor,
  issues: MetaGlassesWidgetCompileIssue[],
): void {
  const textBlocks = profile.layout.regions.filter(region => region.text).length;
  if (textBlocks > profile.constraints.max_text_blocks) {
    issues.push({
      code: META_GLASSES_WIDGET_COMPILER_ERROR_CODES.TEXT_BLOCK_LIMIT,
      path: `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.constraints.max_text_blocks`,
      message: `Layout declares ${textBlocks} text blocks, above the limit of ${profile.constraints.max_text_blocks}.`,
    });
  }

  const actions = profile.actions ?? [];
  if (actions.length > profile.constraints.max_actions) {
    issues.push({
      code: META_GLASSES_WIDGET_COMPILER_ERROR_CODES.ACTION_LIMIT,
      path: `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.constraints.max_actions`,
      message: `Layout declares ${actions.length} actions, above the limit of ${profile.constraints.max_actions}.`,
    });
  }

  const declaredKeys = new Set(descriptor.state_model.keys);
  profile.layout.regions.forEach((region, index) => {
    const source = region.text?.source;
    if (!source?.startsWith('state.')) {
      return;
    }
    const key = source.slice('state.'.length).split('.')[0];
    if (key && !declaredKeys.has(key)) {
      issues.push({
        code: META_GLASSES_WIDGET_COMPILER_ERROR_CODES.STATE_UNSAFE,
        path: `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.layout.regions[${index}].text.source`,
        message: `Text source ${source} references undeclared state key ${key}.`,
      });
    }
  });
}

function validateFocusOrder(
  profile: MetaGlassesDisplayProfile,
  compiledActions: MetaGlassesCompiledAction[],
  issues: MetaGlassesWidgetCompileIssue[],
): void {
  const focusOrder = profile.layout.focus_order ?? [];
  const uniqueFocusOrder = new Set(focusOrder);
  if (uniqueFocusOrder.size !== focusOrder.length) {
    issues.push({
      code: META_GLASSES_WIDGET_COMPILER_ERROR_CODES.FOCUS_ORDER_UNSAFE,
      path: `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.layout.focus_order`,
      message: 'Focus order must not contain duplicate actions.',
    });
  }

  const focusableActions = compiledActions.filter(action => action.focusable);
  const focusableIds = new Set(focusableActions.map(action => action.id));
  for (const focusTarget of focusOrder) {
    if (!focusableIds.has(focusTarget)) {
      issues.push({
        code: META_GLASSES_WIDGET_COMPILER_ERROR_CODES.FOCUS_ORDER_UNSAFE,
        path: `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.layout.focus_order`,
        message: `Focus order target is not focusable: ${focusTarget}.`,
      });
    }
  }
}

function mapActionRegions(regions: MetaGlassesDisplayRegion[]): Map<string, string> {
  const actionRegions = new Map<string, string>();
  for (const region of regions) {
    if (region.action_id) {
      actionRegions.set(region.action_id, region.id);
    }
  }
  return actionRegions;
}

function rendererHints(profile: MetaGlassesDisplayProfile): MetaGlassesWidgetRendererHints {
  return {
    primary_render_path: profile.target.render_path,
    supported_inputs: [...profile.target.input],
    high_contrast_required: profile.constraints.requires_high_contrast,
    max_update_hz: profile.constraints.max_update_hz,
    native_dat: {
      display_class: profile.target.display_class,
      fixed_viewport: true,
      session_required: true,
    },
    display_webapp: {
      viewport: clonePlain(profile.target.viewport),
      fallback_allowed:
        profile.target.render_path === 'display-webapp'
        || profile.fallback.render_path === 'display-webapp',
    },
  };
}

function textCapacity(region: MetaGlassesDisplayRegion): {
  maxLines: number;
  maxCharsPerLine: number;
  maxChars: number;
} {
  const maxLines = Math.max(0, Math.floor(region.bounds.height / TEXT_LINE_HEIGHT_PX));
  const maxCharsPerLine = Math.max(0, Math.floor(region.bounds.width / TEXT_CHAR_WIDTH_PX));
  return {
    maxLines,
    maxCharsPerLine,
    maxChars: maxLines * maxCharsPerLine,
  };
}

function resolveTextValue(
  source: string | undefined,
  fallbackValue: string | undefined,
  state: Record<string, MetaGlassesJSONValue>,
): string {
  if (source?.startsWith('state.')) {
    const value = resolvePath(state, source.slice('state.'.length));
    return stringifyDisplayValue(value);
  }
  return fallbackValue ?? '';
}

function resolvePath(
  value: MetaGlassesJSONValue | Record<string, MetaGlassesJSONValue>,
  path: string,
): MetaGlassesJSONValue | undefined {
  let current: MetaGlassesJSONValue | Record<string, MetaGlassesJSONValue> | undefined = value;
  for (const segment of path.split('.')) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current as MetaGlassesJSONValue | undefined;
}

function stringifyDisplayValue(value: MetaGlassesJSONValue | undefined): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return stableStringify(value);
}

function clampText(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : value.slice(0, maxChars);
}

function withinViewport(
  bounds: MetaGlassesDisplayRegion['bounds'],
  viewport: MetaGlassesViewport,
): boolean {
  return bounds.x >= 0
    && bounds.y >= 0
    && bounds.width > 0
    && bounds.height > 0
    && bounds.x + bounds.width <= viewport.width
    && bounds.y + bounds.height <= viewport.height;
}

function rectanglesOverlap(
  first: MetaGlassesDisplayRegion['bounds'],
  second: MetaGlassesDisplayRegion['bounds'],
): boolean {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

function toJSONValue(
  value: unknown,
  path: string,
  issues: MetaGlassesWidgetCompileIssue[],
): MetaGlassesJSONValue {
  if (value === undefined) {
    return null;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return value;
    }
    issues.push({
      code: META_GLASSES_WIDGET_COMPILER_ERROR_CODES.STATE_UNSAFE,
      path,
      message: 'State numbers must be finite JSON values.',
    });
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => toJSONValue(entry, `${path}[${index}]`, issues));
  }
  if (isRecord(value)) {
    const output: Record<string, MetaGlassesJSONValue> = {};
    for (const key of Object.keys(value).sort()) {
      output[key] = toJSONValue(value[key], `${path}.${key}`, issues);
    }
    return output;
  }

  issues.push({
    code: META_GLASSES_WIDGET_COMPILER_ERROR_CODES.STATE_UNSAFE,
    path,
    message: `State value is not JSON serializable: ${typeof value}.`,
  });
  return null;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .filter(key => record[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(',')}}`;
}

function defaultWidgetId(descriptor: MetaGlassesWidgetDescriptor): string {
  return `${descriptor.namespace}.${descriptor.name}@${descriptor.version}`;
}

function formatIssues(issues: MetaGlassesWidgetCompileIssue[]): string {
  return issues
    .map(issue => `${issue.code} ${issue.path}: ${issue.message}`)
    .join('; ');
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clonePlain<T extends MetaGlassesViewport | MetaGlassesDisplayFallback | MetaGlassesDisplayRegion['bounds']>(
  value: T,
): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
