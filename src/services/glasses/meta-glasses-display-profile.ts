import type {
  MCPUIConformanceIssue,
  MCPUIConformanceResult,
  MCPUIProfileDescriptor,
} from '../mcp/mcp-ui-profile.js';
import { validateMCPUIProfileDescriptor } from '../mcp/mcp-ui-profile.js';

export const META_GLASSES_DISPLAY_PROFILE = 'handsfree.meta-glasses/display-widget';
export const META_GLASSES_DISPLAY_PROFILE_VERSION = '0.1.0';
export const META_GLASSES_DISPLAY_PROFILE_PROPERTY = 'meta_glasses_display';
export const META_GLASSES_DISPLAY_VIEWPORT = { width: 600, height: 600 } as const;
export const META_GLASSES_MAX_SAFE_UPDATE_HZ = 5;

export const META_GLASSES_DISPLAY_ERROR_CODES = {
  DISPLAY_PROFILE_MISSING: 'MGW_DISPLAY_PROFILE_MISSING',
  DISPLAY_PROFILE: 'MGW_DISPLAY_PROFILE',
  DISPLAY_PROFILE_VERSION: 'MGW_DISPLAY_PROFILE_VERSION',
  DISPLAY_VIEWPORT_MISSING: 'MGW_DISPLAY_VIEWPORT_MISSING',
  RENDER_PATH_UNSUPPORTED: 'MGW_RENDER_PATH_UNSUPPORTED',
  FOCUS_ORDER_MISSING: 'MGW_FOCUS_ORDER_MISSING',
  TEXT_UNBOUNDED: 'MGW_TEXT_UNBOUNDED',
  MEDIA_TYPE_UNSUPPORTED: 'MGW_MEDIA_TYPE_UNSUPPORTED',
  ACTION_METHOD_UNBOUND: 'MGW_ACTION_METHOD_UNBOUND',
  METHOD_NOT_PRESENT: 'MGW_METHOD_NOT_PRESENT',
  UPDATE_RATE_UNSAFE: 'MGW_UPDATE_RATE_UNSAFE',
  CLEAR_RESET_MISSING: 'MGW_CLEAR_RESET_MISSING',
  REQUIRED_OPERATION_MISSING: 'MGW_REQUIRED_OPERATION_MISSING',
  FALLBACK_MISSING: 'MGW_FALLBACK_MISSING',
} as const;

export type MetaGlassesDisplayValidationCode =
  (typeof META_GLASSES_DISPLAY_ERROR_CODES)[keyof typeof META_GLASSES_DISPLAY_ERROR_CODES];

export type MetaGlassesRenderPath = 'dat-native' | 'display-webapp' | 'simulator';
export type MetaGlassesFallbackRenderPath =
  | 'display-webapp'
  | 'simulator'
  | 'mobile-card'
  | 'notification'
  | 'audio-summary';
export type MetaGlassesDisplayClass = 'meta-ray-ban-display';
export type MetaGlassesInputKind = 'dpad' | 'gesture' | 'voice' | 'mobile_action';
export type MetaGlassesDisplayTemplate =
  | 'single-card'
  | 'stack'
  | 'list'
  | 'status'
  | 'progress'
  | 'media'
  | 'confirmation'
  | 'freeform-grid'
  | 'task-progress'
  | 'notification-summary'
  | 'video-preview';
export type MetaGlassesRegionKind =
  | 'text'
  | 'status'
  | 'progress'
  | 'list'
  | 'media'
  | 'action'
  | 'spacer';
export type MetaGlassesTextOverflow = 'truncate' | 'wrap' | 'clip';
export type MetaGlassesMediaType = 'image/png' | 'image/jpeg' | 'video/mp4';
export type MetaGlassesMediaTransport = 'cid' | 'https' | 'stream';
export type MetaGlassesFallbackReason =
  | 'dat_native_display_unavailable'
  | 'display_unsupported'
  | 'session_not_ready';

export interface MetaGlassesViewport {
  width: number;
  height: number;
}

export interface MetaGlassesRenderTarget {
  display_class: MetaGlassesDisplayClass;
  viewport: MetaGlassesViewport;
  input: MetaGlassesInputKind[];
  render_path: MetaGlassesRenderPath;
}

export interface MetaGlassesRegionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MetaGlassesTextBlock {
  source?: string;
  value?: string;
  max_lines: number;
  max_chars: number;
  overflow: MetaGlassesTextOverflow;
}

export interface MetaGlassesMediaContract {
  type: MetaGlassesMediaType;
  duration_ms?: number;
  size_bytes?: number;
  transport: MetaGlassesMediaTransport;
  fallback_text: string;
}

export interface MetaGlassesDisplayRegion {
  id: string;
  kind: MetaGlassesRegionKind;
  bounds: MetaGlassesRegionBounds;
  text?: MetaGlassesTextBlock;
  media?: MetaGlassesMediaContract;
  action_id?: string;
  visible_if?: string;
}

export interface MetaGlassesActionBinding {
  id: string;
  method: string;
  backend_action_id: string;
  label?: string;
  focusable?: boolean;
  service_id?: string;
  state_keys?: string[];
}

export interface MetaGlassesDisplayLayout {
  template: MetaGlassesDisplayTemplate;
  regions: MetaGlassesDisplayRegion[];
  focus_order?: string[];
}

export interface MetaGlassesDisplayConstraints {
  max_text_blocks: number;
  max_actions: number;
  requires_high_contrast: boolean;
  requires_focus_order: boolean;
  max_update_hz: number;
  ttl_ms?: number;
}

export interface MetaGlassesDisplayFallback {
  when: MetaGlassesFallbackReason[];
  render_path: MetaGlassesFallbackRenderPath;
  message: string;
}

export interface MetaGlassesDisplayProfile {
  profile: typeof META_GLASSES_DISPLAY_PROFILE;
  profile_version: typeof META_GLASSES_DISPLAY_PROFILE_VERSION;
  target: MetaGlassesRenderTarget;
  layout: MetaGlassesDisplayLayout;
  constraints: MetaGlassesDisplayConstraints;
  fallback: MetaGlassesDisplayFallback;
  actions?: MetaGlassesActionBinding[];
}

export interface MetaGlassesWidgetDescriptor extends MCPUIProfileDescriptor {
  [META_GLASSES_DISPLAY_PROFILE_PROPERTY]: MetaGlassesDisplayProfile;
}

export const META_GLASSES_REQUIRED_METHODS = [
  'render_widget',
  'update_widget',
  'clear_widget',
  'focus_next',
  'focus_previous',
  'activate',
  'reset_session',
] as const;

const SUPPORTED_RENDER_PATHS = new Set<MetaGlassesRenderPath>([
  'dat-native',
  'display-webapp',
  'simulator',
]);

const SUPPORTED_FALLBACK_RENDER_PATHS = new Set<MetaGlassesFallbackRenderPath>([
  'display-webapp',
  'simulator',
  'mobile-card',
  'notification',
  'audio-summary',
]);

const SUPPORTED_TEXT_OVERFLOW = new Set<MetaGlassesTextOverflow>([
  'truncate',
  'wrap',
  'clip',
]);

const SUPPORTED_MEDIA_TYPES = new Set<MetaGlassesMediaType>([
  'image/png',
  'image/jpeg',
  'video/mp4',
]);

const TEXT_REGION_KINDS = new Set<MetaGlassesRegionKind>([
  'text',
  'status',
  'progress',
  'list',
]);

export function validateMetaGlassesWidgetDescriptor(
  descriptor: Partial<MetaGlassesWidgetDescriptor>,
): MCPUIConformanceResult {
  const uiResult = validateMCPUIProfileDescriptor(descriptor);
  const methodNames = new Set(
    Array.isArray(descriptor.methods)
      ? descriptor.methods
        .map(method => method.name)
        .filter(isNonEmptyString)
      : [],
  );
  const displayResult = validateMetaGlassesDisplayProfile(
    getDisplayProfile(descriptor),
    methodNames,
  );

  return {
    conformant: uiResult.conformant && displayResult.conformant,
    errors: [...uiResult.errors, ...displayResult.errors],
    warnings: [...uiResult.warnings, ...displayResult.warnings],
  };
}

export function assertMetaGlassesWidgetDescriptor(
  descriptor: Partial<MetaGlassesWidgetDescriptor>,
): asserts descriptor is MetaGlassesWidgetDescriptor {
  const result = validateMetaGlassesWidgetDescriptor(descriptor);
  if (!result.conformant) {
    const detail = result.errors
      .map(issue => `${issue.code} ${issue.path}: ${issue.message}`)
      .join('; ');
    throw new Error(`Meta glasses display profile conformance failed: ${detail}`);
  }
}

export function validateMetaGlassesDisplayProfile(
  profile: unknown,
  methodNames: Set<string> = new Set(),
): MCPUIConformanceResult {
  const errors: MCPUIConformanceIssue[] = [];
  const warnings: MCPUIConformanceIssue[] = [];

  if (!isRecord(profile)) {
    push(
      errors,
      META_GLASSES_DISPLAY_ERROR_CODES.DISPLAY_PROFILE_MISSING,
      META_GLASSES_DISPLAY_PROFILE_PROPERTY,
      'Meta glasses display profile section is required.',
    );
    return { conformant: false, errors, warnings };
  }

  if (profile.profile !== META_GLASSES_DISPLAY_PROFILE) {
    push(
      errors,
      META_GLASSES_DISPLAY_ERROR_CODES.DISPLAY_PROFILE,
      `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.profile`,
      `Expected ${META_GLASSES_DISPLAY_PROFILE}.`,
    );
  }
  if (profile.profile_version !== META_GLASSES_DISPLAY_PROFILE_VERSION) {
    push(
      errors,
      META_GLASSES_DISPLAY_ERROR_CODES.DISPLAY_PROFILE_VERSION,
      `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.profile_version`,
      `Expected ${META_GLASSES_DISPLAY_PROFILE_VERSION}.`,
    );
  }

  validateRequiredMethods(methodNames, errors);
  validateTarget(profile.target, errors);
  validateLayout(profile.layout, profile.actions, profile.constraints, methodNames, errors);
  validateConstraints(profile.constraints, errors);
  validateFallback(profile.fallback, errors);

  return {
    conformant: errors.length === 0,
    errors,
    warnings,
  };
}

function validateRequiredMethods(
  methodNames: Set<string>,
  errors: MCPUIConformanceIssue[],
): void {
  for (const methodName of META_GLASSES_REQUIRED_METHODS) {
    if (methodNames.has(methodName)) {
      continue;
    }
    push(
      errors,
      methodName === 'clear_widget' || methodName === 'reset_session'
        ? META_GLASSES_DISPLAY_ERROR_CODES.CLEAR_RESET_MISSING
        : META_GLASSES_DISPLAY_ERROR_CODES.REQUIRED_OPERATION_MISSING,
      'methods',
      `Meta glasses display widgets must expose ${methodName}.`,
    );
  }
}

function validateTarget(target: unknown, errors: MCPUIConformanceIssue[]): void {
  if (!isRecord(target)) {
    push(
      errors,
      META_GLASSES_DISPLAY_ERROR_CODES.DISPLAY_VIEWPORT_MISSING,
      `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.target.viewport`,
      'Display target with fixed 600x600 viewport is required.',
    );
    push(
      errors,
      META_GLASSES_DISPLAY_ERROR_CODES.RENDER_PATH_UNSUPPORTED,
      `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.target.render_path`,
      'Render path must be dat-native, display-webapp, or simulator.',
    );
    return;
  }

  if (!isFixedDisplayViewport(target.viewport)) {
    push(
      errors,
      META_GLASSES_DISPLAY_ERROR_CODES.DISPLAY_VIEWPORT_MISSING,
      `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.target.viewport`,
      'Viewport must be fixed to 600x600 for the Meta glasses display target.',
    );
  }

  if (!SUPPORTED_RENDER_PATHS.has(target.render_path as MetaGlassesRenderPath)) {
    push(
      errors,
      META_GLASSES_DISPLAY_ERROR_CODES.RENDER_PATH_UNSUPPORTED,
      `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.target.render_path`,
      `Unsupported render path: ${String(target.render_path)}.`,
    );
  }
}

function validateLayout(
  layout: unknown,
  actions: unknown,
  constraints: unknown,
  methodNames: Set<string>,
  errors: MCPUIConformanceIssue[],
): void {
  const actionBindings = getActionBindings(actions, errors);
  const actionIds = new Set(actionBindings.map(action => action.id));

  for (const [index, action] of actionBindings.entries()) {
    if (!isNonEmptyString(action.method)) {
      push(
        errors,
        META_GLASSES_DISPLAY_ERROR_CODES.ACTION_METHOD_UNBOUND,
        `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.actions[${index}].method`,
        `Action ${action.id} must bind to an MCP-IDL method.`,
      );
    } else if (!methodNames.has(action.method)) {
      push(
        errors,
        META_GLASSES_DISPLAY_ERROR_CODES.METHOD_NOT_PRESENT,
        `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.actions[${index}].method`,
        `Action ${action.id} references unknown MCP-IDL method ${action.method}.`,
      );
    }
  }

  if (!isRecord(layout)) {
    push(
      errors,
      META_GLASSES_DISPLAY_ERROR_CODES.FOCUS_ORDER_MISSING,
      `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.layout.focus_order`,
      'Layout with deterministic focus order is required.',
    );
    return;
  }

  const regions = Array.isArray(layout.regions)
    ? layout.regions.filter(isRecord)
    : [];
  regions.forEach((region, index) => {
    validateRegion(region, index, actionIds, errors);
  });

  validateFocusOrder(layout, actionBindings, constraints, errors);
}

function getActionBindings(
  actions: unknown,
  errors: MCPUIConformanceIssue[],
): Array<Record<string, unknown> & { id: string }> {
  if (actions === undefined) {
    return [];
  }
  if (!Array.isArray(actions)) {
    push(
      errors,
      META_GLASSES_DISPLAY_ERROR_CODES.ACTION_METHOD_UNBOUND,
      `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.actions`,
      'Actions must be declared as an array of method bindings.',
    );
    return [];
  }

  return actions.flatMap((action, index) => {
    if (!isRecord(action) || !isNonEmptyString(action.id)) {
      push(
        errors,
        META_GLASSES_DISPLAY_ERROR_CODES.ACTION_METHOD_UNBOUND,
        `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.actions[${index}]`,
        'Action binding id is required.',
      );
      return [];
    }
    return [action as Record<string, unknown> & { id: string }];
  });
}

function validateRegion(
  region: Record<string, unknown>,
  index: number,
  actionIds: Set<string>,
  errors: MCPUIConformanceIssue[],
): void {
  const path = `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.layout.regions[${index}]`;
  const kind = region.kind as MetaGlassesRegionKind;

  if ((TEXT_REGION_KINDS.has(kind) || region.text !== undefined) && !hasBoundedText(region)) {
    push(
      errors,
      META_GLASSES_DISPLAY_ERROR_CODES.TEXT_UNBOUNDED,
      `${path}.text`,
      'Text regions must declare bounds, max_lines, max_chars, and overflow behavior.',
    );
  }

  if ((kind === 'media' || region.media !== undefined) && !hasSupportedMedia(region.media)) {
    push(
      errors,
      META_GLASSES_DISPLAY_ERROR_CODES.MEDIA_TYPE_UNSUPPORTED,
      `${path}.media.type`,
      'Media regions must use a supported image or video type with fallback content.',
    );
  }

  if (region.action_id !== undefined) {
    if (!isNonEmptyString(region.action_id) || !actionIds.has(region.action_id)) {
      push(
        errors,
        META_GLASSES_DISPLAY_ERROR_CODES.ACTION_METHOD_UNBOUND,
        `${path}.action_id`,
        `Region references an action that is not bound to a method: ${String(region.action_id)}.`,
      );
    }
  }
}

function validateFocusOrder(
  layout: Record<string, unknown>,
  actionBindings: Array<Record<string, unknown> & { id: string }>,
  constraints: unknown,
  errors: MCPUIConformanceIssue[],
): void {
  const focusableActionIds = actionBindings
    .filter(action => action.focusable !== false)
    .map(action => action.id);
  const requiresFocusOrder = isRecord(constraints)
    ? constraints.requires_focus_order === true
    : focusableActionIds.length > 0;

  if (!requiresFocusOrder && focusableActionIds.length === 0) {
    return;
  }

  if (!Array.isArray(layout.focus_order) || !layout.focus_order.every(isNonEmptyString)) {
    push(
      errors,
      META_GLASSES_DISPLAY_ERROR_CODES.FOCUS_ORDER_MISSING,
      `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.layout.focus_order`,
      'Focusable controls must declare a deterministic focus_order.',
    );
    return;
  }

  const ordered = new Set(layout.focus_order);
  for (const actionId of focusableActionIds) {
    if (!ordered.has(actionId)) {
      push(
        errors,
        META_GLASSES_DISPLAY_ERROR_CODES.FOCUS_ORDER_MISSING,
        `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.layout.focus_order`,
        `Focusable action is missing from focus_order: ${actionId}.`,
      );
    }
  }

  const declaredActions = new Set(actionBindings.map(action => action.id));
  for (const focusTarget of layout.focus_order) {
    if (!declaredActions.has(focusTarget)) {
      push(
        errors,
        META_GLASSES_DISPLAY_ERROR_CODES.ACTION_METHOD_UNBOUND,
        `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.layout.focus_order`,
        `Focus order references an action that is not bound to a method: ${focusTarget}.`,
      );
    }
  }
}

function validateConstraints(
  constraints: unknown,
  errors: MCPUIConformanceIssue[],
): void {
  if (!isRecord(constraints) || !isSafeUpdateHz(constraints.max_update_hz)) {
    push(
      errors,
      META_GLASSES_DISPLAY_ERROR_CODES.UPDATE_RATE_UNSAFE,
      `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.constraints.max_update_hz`,
      `Display updates must be greater than 0 Hz and no more than ${META_GLASSES_MAX_SAFE_UPDATE_HZ} Hz.`,
    );
  }
}

function validateFallback(
  fallback: unknown,
  errors: MCPUIConformanceIssue[],
): void {
  if (!isRecord(fallback)) {
    push(
      errors,
      META_GLASSES_DISPLAY_ERROR_CODES.FALLBACK_MISSING,
      `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.fallback`,
      'A native-display-unavailable fallback is required.',
    );
    return;
  }

  const when = Array.isArray(fallback.when)
    ? fallback.when.filter(isNonEmptyString)
    : [];
  const hasNativeUnavailableFallback = when.includes('dat_native_display_unavailable');
  const hasSupportedRenderPath = SUPPORTED_FALLBACK_RENDER_PATHS.has(
    fallback.render_path as MetaGlassesFallbackRenderPath,
  );

  if (
    !hasNativeUnavailableFallback
    || !hasSupportedRenderPath
    || !isNonEmptyString(fallback.message)
  ) {
    push(
      errors,
      META_GLASSES_DISPLAY_ERROR_CODES.FALLBACK_MISSING,
      `${META_GLASSES_DISPLAY_PROFILE_PROPERTY}.fallback`,
      'Fallback must cover dat_native_display_unavailable with a safe render path and message.',
    );
  }
}

function getDisplayProfile(
  descriptor: Partial<MetaGlassesWidgetDescriptor>,
): unknown {
  return (descriptor as Record<string, unknown>)[META_GLASSES_DISPLAY_PROFILE_PROPERTY];
}

function hasBoundedText(region: Record<string, unknown>): boolean {
  if (!hasPositiveBounds(region.bounds) || !isRecord(region.text)) {
    return false;
  }
  return isPositiveInteger(region.text.max_lines)
    && isPositiveInteger(region.text.max_chars)
    && SUPPORTED_TEXT_OVERFLOW.has(region.text.overflow as MetaGlassesTextOverflow);
}

function hasSupportedMedia(media: unknown): boolean {
  if (!isRecord(media)) {
    return false;
  }
  return SUPPORTED_MEDIA_TYPES.has(media.type as MetaGlassesMediaType)
    && isNonEmptyString(media.transport)
    && isNonEmptyString(media.fallback_text);
}

function isFixedDisplayViewport(viewport: unknown): boolean {
  return isRecord(viewport)
    && viewport.width === META_GLASSES_DISPLAY_VIEWPORT.width
    && viewport.height === META_GLASSES_DISPLAY_VIEWPORT.height;
}

function hasPositiveBounds(bounds: unknown): boolean {
  return isRecord(bounds)
    && isFinitePositiveNumber(bounds.x, true)
    && isFinitePositiveNumber(bounds.y, true)
    && isFinitePositiveNumber(bounds.width)
    && isFinitePositiveNumber(bounds.height);
}

function isSafeUpdateHz(value: unknown): boolean {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value > 0
    && value <= META_GLASSES_MAX_SAFE_UPDATE_HZ;
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value > 0;
}

function isFinitePositiveNumber(value: unknown, allowZero = false): boolean {
  return typeof value === 'number'
    && Number.isFinite(value)
    && (allowZero ? value >= 0 : value > 0);
}

function push(
  issues: MCPUIConformanceIssue[],
  code: MetaGlassesDisplayValidationCode,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
