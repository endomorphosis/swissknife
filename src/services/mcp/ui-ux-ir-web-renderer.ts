/**
 * UIIRWebRenderer@1 — bounded web/desktop accessible render models.
 *
 * Renders UI/UX IR projection artifacts and DOM/ARIA-derived semantic trees
 * into deterministic accessible web models. Never executes imported markup or
 * scripts. CSS/framework details are retained only as source metadata or
 * explicit loss receipts. Denial, error, and confirmation surfaces remain
 * visible and accessible.
 *
 * Mirrors Python `ipfs_datasets_py.logic.ui_ux_ir.projection.web`.
 */

export const UIIR_WEB_RENDERER_INTERFACE = 'UIIRWebRenderer@1' as const;
export const UIIR_WEB_PROJECTION_INTERFACE = 'UIIRWebProjection@1' as const;
export const UIIR_WEB_PROJECTION_SCHEMA_VERSION = 'ui-web-projection/v1' as const;
export const UIIR_WEB_RENDER_MODEL_VERSION = 'ui-web-render-model/v1' as const;
export const DOMARIA_UIIR_ADAPTER = 'DOMARIAUIIRAdapter@1' as const;
export const POLICY_OWNER = 'UIProjectionSolver@1' as const;

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

const EXECUTABLE_TEXT_MARKERS = [
  '<script',
  '</script',
  'javascript:',
  'vbscript:',
  'onerror=',
  'onload=',
  'onclick=',
  'eval(',
  'Function(',
  'document.write',
  'innerHTML',
  '__proto__',
] as const;

const FORBIDDEN_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'applet',
  'link',
  'meta',
  'base',
  'template',
  'noscript',
]);

const SUPPORTED_ARIA_ROLES = new Set([
  'alert',
  'alertdialog',
  'application',
  'banner',
  'button',
  'cell',
  'checkbox',
  'columnheader',
  'combobox',
  'complementary',
  'contentinfo',
  'dialog',
  'document',
  'form',
  'grid',
  'gridcell',
  'group',
  'heading',
  'img',
  'link',
  'list',
  'listbox',
  'listitem',
  'log',
  'main',
  'menu',
  'menubar',
  'menuitem',
  'navigation',
  'none',
  'option',
  'presentation',
  'progressbar',
  'radio',
  'region',
  'row',
  'rowheader',
  'search',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'textbox',
  'toolbar',
  'tooltip',
  'tree',
  'treeitem',
]);

const SUPPORTED_STATE_KEYS = new Set([
  'busy',
  'checked',
  'current',
  'disabled',
  'expanded',
  'haspopup',
  'hidden',
  'invalid',
  'level',
  'multiline',
  'multiselectable',
  'orientation',
  'pressed',
  'readonly',
  'required',
  'selected',
  'valuemax',
  'valuemin',
  'valuenow',
  'valuetext',
]);

const SUPPORTED_RELATIONSHIP_KEYS = new Set([
  'activedescendant',
  'controls',
  'describedby',
  'flowto',
  'labelledby',
  'owns',
]);

const SUPPORTED_ACTION_KINDS = new Set([
  'activate',
  'click',
  'confirm',
  'dismiss',
  'edit',
  'select',
  'submit',
  'toggle',
]);

const FOCUSABLE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'switch',
  'combobox',
  'listbox',
  'option',
  'slider',
  'spinbutton',
  'tab',
  'menuitem',
  'treeitem',
  'search',
  'dialog',
  'alertdialog',
]);

const ROLE_DEFAULT_TAG: Readonly<Record<string, string>> = Object.freeze({
  alert: 'div',
  alertdialog: 'div',
  application: 'div',
  banner: 'header',
  button: 'button',
  cell: 'td',
  checkbox: 'input',
  columnheader: 'th',
  combobox: 'div',
  complementary: 'aside',
  contentinfo: 'footer',
  dialog: 'div',
  document: 'article',
  form: 'form',
  grid: 'table',
  gridcell: 'td',
  group: 'div',
  heading: 'h2',
  img: 'img',
  link: 'a',
  list: 'ul',
  listbox: 'div',
  listitem: 'li',
  log: 'div',
  main: 'main',
  menu: 'ul',
  menubar: 'ul',
  menuitem: 'li',
  navigation: 'nav',
  none: 'div',
  option: 'div',
  presentation: 'div',
  progressbar: 'div',
  radio: 'input',
  region: 'section',
  row: 'tr',
  rowheader: 'th',
  search: 'form',
  separator: 'hr',
  slider: 'input',
  spinbutton: 'input',
  status: 'div',
  switch: 'button',
  tab: 'button',
  table: 'table',
  tablist: 'div',
  tabpanel: 'div',
  textbox: 'input',
  toolbar: 'div',
  tooltip: 'div',
  tree: 'ul',
  treeitem: 'li',
});

const HTML_IMPLICIT_ROLES: Readonly<Record<string, string>> = Object.freeze({
  a: 'link',
  article: 'document',
  aside: 'complementary',
  button: 'button',
  dialog: 'dialog',
  footer: 'contentinfo',
  form: 'form',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  header: 'banner',
  hr: 'separator',
  img: 'img',
  input: 'textbox',
  li: 'listitem',
  main: 'main',
  menu: 'menu',
  nav: 'navigation',
  ol: 'list',
  option: 'option',
  output: 'status',
  progress: 'progressbar',
  search: 'search',
  select: 'listbox',
  table: 'table',
  td: 'cell',
  textarea: 'textbox',
  th: 'columnheader',
  tr: 'row',
  ul: 'list',
});

const INPUT_TYPE_ROLES: Readonly<Record<string, string>> = Object.freeze({
  button: 'button',
  checkbox: 'checkbox',
  email: 'textbox',
  number: 'spinbutton',
  password: 'textbox',
  radio: 'radio',
  range: 'slider',
  reset: 'button',
  search: 'textbox',
  submit: 'button',
  tel: 'textbox',
  text: 'textbox',
  url: 'textbox',
});

export type WebSurfaceKind =
  | 'document'
  | 'landmark'
  | 'form'
  | 'control'
  | 'list'
  | 'dialog'
  | 'status'
  | 'alert'
  | 'confirmation'
  | 'denial'
  | 'error'
  | 'feedback'
  | 'fallback'
  | 'structure';

export type WebInteractionState =
  | 'idle'
  | 'pending'
  | 'error'
  | 'confirmation'
  | 'denial'
  | 'success'
  | 'disabled'
  | 'invalid';

export type WebRenderMode =
  | 'accessible_tree'
  | 'semantic_html_model'
  | 'desktop_surface';

export type WebLossCategory =
  | 'source_metadata'
  | 'unsupported'
  | 'sanitized'
  | 'rejected'
  | 'preserved'
  | 'adapted'
  | 'fallback'
  | 'omitted'
  | 'unsatisfiable'
  | 'budget_exceeded'
  | 'degraded';

export interface WebFormValidation {
  valid: boolean | null;
  message: string;
  required: boolean;
  invalid_state: string;
}

export interface WebAriaModel {
  role: string;
  name: string;
  description: string;
  value: string;
  states: Readonly<Record<string, string>>;
  relationships: Readonly<Record<string, readonly string[]>>;
  live: string;
  atomic: boolean;
  relevant: string;
}

export interface WebSourceMetadata {
  metadata_id: string;
  node_id: string;
  tag_name: string;
  css_classes: readonly string[];
  css_inline_summary: string;
  framework_hints: Readonly<Record<string, string>>;
  attributes_retained: Readonly<Record<string, string>>;
  detail: string;
}

export interface WebLoss {
  loss_id: string;
  path: string;
  reason: string;
  category: WebLossCategory | string;
  detail: string;
  mandatory: boolean;
}

export interface WebNodeModel {
  node_id: string;
  surface: WebSurfaceKind;
  semantic_kind: string;
  disposition: string;
  order: number;
  aria: WebAriaModel;
  aria_attributes: Readonly<Record<string, string>>;
  tag_name: string;
  text: string;
  actions: readonly string[];
  children: readonly string[];
  parent_id: string;
  component_id: string;
  source_item_id: string;
  focus_index: number | null;
  tab_index: number | null;
  interaction_state: WebInteractionState;
  validation: WebFormValidation;
  status_tone: string;
  visible: boolean;
  accessible: boolean;
  mandatory: boolean;
  source_metadata_id: string;
  attributes: Readonly<Record<string, string>>;
  notes: readonly string[];
}

export interface WebFocusOrderEntry {
  order: number;
  node_id: string;
  role: string;
  name: string;
  focusable: boolean;
}

export interface WebProjectionArtifact {
  interface: typeof UIIR_WEB_RENDERER_INTERFACE | typeof UIIR_WEB_PROJECTION_INTERFACE;
  schema_version: typeof UIIR_WEB_PROJECTION_SCHEMA_VERSION;
  render_model_version: typeof UIIR_WEB_RENDER_MODEL_VERSION;
  artifact_id: string;
  nodes: readonly WebNodeModel[];
  focus_order: readonly WebFocusOrderEntry[];
  entry_node_ids: readonly string[];
  source_metadata: readonly WebSourceMetadata[];
  losses: readonly WebLoss[];
  render_mode: WebRenderMode;
  projection_artifact_id: string;
  projection_status: string;
  profile_id: string;
  document_id: string;
  title: string;
  loss_report: Readonly<Record<string, unknown>>;
  execution_performed: false;
  policy_owner: typeof POLICY_OWNER;
  notes: readonly string[];
}

export interface DomAriaNodeInput {
  node_id?: string;
  id?: string;
  role?: string;
  name?: string;
  accessible_name?: string;
  description?: string;
  accessible_description?: string;
  value?: string;
  states?: Record<string, string | number | boolean>;
  aria_states?: Record<string, string | number | boolean>;
  relationships?: Record<string, string | readonly string[]>;
  aria_relationships?: Record<string, string | readonly string[]>;
  actions?: string | readonly string[];
  children?: readonly DomAriaNodeInput[];
  focus_order?: number | null;
  validation?: {
    valid?: boolean | null;
    message?: string;
    required?: boolean;
    invalid_state?: string;
  };
  live?: string | { politeness?: string; atomic?: boolean; relevant?: string; 'aria-live'?: string };
  aria_live?: string | { politeness?: string; atomic?: boolean; relevant?: string };
  tag_name?: string;
  tag?: string;
  css_classes?: string | readonly string[];
  classList?: string | readonly string[];
  css_inline?: string;
  style?: string;
  framework_hints?: Record<string, string>;
  framework?: Record<string, string> | string;
  attributes?: Record<string, string>;
  text_content?: string;
  text?: string;
  input_type?: string;
}

export interface DomAriaDocumentInput {
  document_id: string;
  title: string;
  root: DomAriaNodeInput;
  source_uri?: string;
  source_id?: string;
  source_revision?: string;
  locale?: string;
}

export interface ProjectionSemanticItem {
  item_id: string;
  semantic_kind: string;
  mandatory?: boolean;
  label?: string;
  component_id?: string;
  disposition?: string;
  order?: number;
  fallback_ref?: string;
}

export interface WebProjectionRequest {
  document_id?: string;
  title?: string;
  items?: readonly ProjectionSemanticItem[];
  dom_aria?: DomAriaDocumentInput;
  render_mode?: WebRenderMode;
  include_css_metadata?: boolean;
  notes?: readonly string[];
}

export interface WebAccessibleTree {
  interface: typeof UIIR_WEB_RENDERER_INTERFACE;
  schema_version: typeof UIIR_WEB_RENDER_MODEL_VERSION;
  document_id: string;
  title: string;
  execution_performed: false;
  focus_order: readonly WebFocusOrderEntry[];
  nodes: readonly {
    node_id: string;
    role: string;
    name: string;
    value: string;
    text: string;
    surface: WebSurfaceKind;
    actions: readonly string[];
    children: readonly string[];
    focus_index: number | null;
    interaction_state: WebInteractionState;
    validation: WebFormValidation;
    visible: boolean;
    aria: Readonly<Record<string, string>>;
  }[];
}

export class UIIRWebRendererError extends Error {
  readonly code: string;

  constructor(message: string, code = 'UIIR_WEB_RENDERER_ERROR') {
    super(message);
    this.name = 'UIIRWebRendererError';
    this.code = code;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function requireIdentifier(name: string, value: string): string {
  if (!IDENTIFIER_RE.test(value)) {
    throw new UIIRWebRendererError(
      `${name} is not a stable identifier: ${JSON.stringify(value)}`,
      'INVALID_IDENTIFIER',
    );
  }
  return value;
}

/** Strip control chars and executable markup markers; never evaluate HTML. */
export function sanitizeWebText(value: unknown): string {
  if (value == null) return '';
  let text = String(value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  let lower = text.toLowerCase();
  for (const marker of EXECUTABLE_TEXT_MARKERS) {
    if (lower.includes(marker)) {
      const re = new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      text = text.replace(re, '');
      lower = text.toLowerCase();
    }
  }
  text = text.replace(/<\s*\/?\s*script[^>]*>/gi, '');
  text = text.replace(/<[^>]*>/g, '');
  return text.trim();
}

function normalizeRole(role: string): string {
  let text = (role || '').trim().toLowerCase();
  if (text.startsWith('aria:')) text = text.slice(5);
  if (text.startsWith('role:')) text = text.slice(5);
  if (text === 'searchbox') return 'textbox';
  if (text === 'rowgroup') return 'group';
  return text;
}

function inferRole(tagName: string, inputType: string): string {
  const tag = (tagName || '').toLowerCase();
  if (tag === 'input') {
    return INPUT_TYPE_ROLES[(inputType || 'text').toLowerCase()] || 'textbox';
  }
  return HTML_IMPLICIT_ROLES[tag] || '';
}

function roleToTag(role: string): string {
  return ROLE_DEFAULT_TAG[normalizeRole(role)] || 'div';
}

function surfaceFor(
  semanticKind: string,
  role: string,
  disposition = 'preserved',
): WebSurfaceKind {
  const kind = (semanticKind || '').toLowerCase();
  const roleL = normalizeRole(role);
  if (disposition === 'fallback') return 'fallback';
  if (kind.includes('denial') || kind === 'denied' || kind === 'authorization_denied') {
    return 'denial';
  }
  if (kind === 'error') return 'error';
  if (kind === 'confirmation' || kind === 'consent' || kind === 'consequence') {
    return 'confirmation';
  }
  if (kind === 'feedback') return 'feedback';
  if (roleL === 'alert' || roleL === 'alertdialog' || kind === 'alert') {
    return roleL === 'alertdialog' || kind === 'confirmation' ? 'confirmation' : 'alert';
  }
  if (roleL === 'dialog') return 'dialog';
  if (roleL === 'status' || roleL === 'log' || roleL === 'progressbar') return 'status';
  if (roleL === 'form') return 'form';
  if (
    ['textbox', 'checkbox', 'radio', 'switch', 'combobox', 'listbox', 'slider', 'spinbutton', 'search'].includes(
      roleL,
    )
  ) {
    return 'control';
  }
  if (
    ['banner', 'complementary', 'contentinfo', 'main', 'navigation', 'region', 'search'].includes(
      roleL,
    )
  ) {
    return 'landmark';
  }
  if (['list', 'listitem', 'menu', 'menuitem', 'tree', 'treeitem'].includes(roleL)) {
    return 'list';
  }
  if (roleL === 'document' || roleL === 'application') return 'document';
  if (kind === 'action') return 'control';
  return 'structure';
}

function interactionState(
  semanticKind: string,
  surface: WebSurfaceKind,
  states: Record<string, string> = {},
  validation: WebFormValidation = emptyValidation(),
): WebInteractionState {
  const kind = (semanticKind || '').toLowerCase();
  if (['true', '1', 'disabled'].includes((states.disabled || '').toLowerCase())) {
    return 'disabled';
  }
  if (
    validation.invalid_state === 'true' ||
    ['true', '1'].includes((states.invalid || '').toLowerCase()) ||
    validation.valid === false
  ) {
    return 'invalid';
  }
  if (surface === 'denial' || kind.includes('denial')) return 'denial';
  if (surface === 'error' || kind === 'error') return 'error';
  if (surface === 'confirmation') return 'confirmation';
  if (kind === 'pending' || ['true', '1'].includes((states.busy || '').toLowerCase())) {
    return 'pending';
  }
  return 'idle';
}

function livePoliteness(
  surface: WebSurfaceKind,
  interaction: WebInteractionState,
  live?: { politeness?: string },
): string {
  if (live?.politeness === 'polite' || live?.politeness === 'assertive') {
    return live.politeness;
  }
  if (surface === 'error' || surface === 'denial' || surface === 'alert') return 'assertive';
  if (surface === 'confirmation' || interaction === 'confirmation') return 'assertive';
  if (surface === 'status' || surface === 'feedback' || interaction === 'pending') {
    return 'polite';
  }
  return 'off';
}

function statusTone(surface: WebSurfaceKind, interaction: WebInteractionState): string {
  if (surface === 'error' || surface === 'denial' || interaction === 'error') return 'danger';
  if (surface === 'confirmation' || interaction === 'confirmation' || interaction === 'invalid') {
    return 'warning';
  }
  if (interaction === 'pending') return 'active';
  if (interaction === 'success') return 'success';
  return 'neutral';
}

function emptyValidation(): WebFormValidation {
  return { valid: null, message: '', required: false, invalid_state: '' };
}

export function ariaAttributesFromModel(aria: WebAriaModel): Record<string, string> {
  const attrs: Record<string, string> = {};
  const role = normalizeRole(aria.role);
  if (role && role !== 'none' && role !== 'presentation') {
    attrs.role = role;
  }
  if (aria.name) attrs['aria-label'] = aria.name;
  if (aria.description) attrs['aria-description'] = aria.description;
  if (aria.value) attrs['aria-valuetext'] = aria.value;
  for (const [key, value] of Object.entries(aria.states)) {
    attrs[`aria-${key}`] = value;
  }
  for (const [key, refs] of Object.entries(aria.relationships)) {
    if (refs.length) attrs[`aria-${key}`] = refs.join(' ');
  }
  if (aria.live === 'polite' || aria.live === 'assertive') {
    attrs['aria-live'] = aria.live;
    attrs['aria-atomic'] = aria.atomic ? 'true' : 'false';
    if (aria.relevant) attrs['aria-relevant'] = aria.relevant;
  }
  return attrs;
}

function semanticFromRole(role: string): string {
  const roleL = normalizeRole(role);
  if (roleL === 'alert') return 'error';
  if (roleL === 'alertdialog') return 'confirmation';
  if (roleL === 'status' || roleL === 'log' || roleL === 'progressbar') return 'feedback';
  if (roleL === 'button' || roleL === 'link' || roleL === 'menuitem' || roleL === 'tab') {
    return 'action';
  }
  return roleL || 'structure';
}

function slug(value: string): string {
  const text = value
    .trim()
    .replace(/[^A-Za-z0-9._:/-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (text.slice(0, 200) || 'node');
}

function normalizeId(value: string): string {
  const text = (value || '').trim();
  if (!text) {
    throw new UIIRWebRendererError('node_id must not be empty', 'EMPTY_NODE_ID');
  }
  const candidate = text.startsWith('component:') ? text : `component:${slug(text)}`;
  return requireIdentifier('node_id', candidate);
}

interface InternalNode {
  node_id: string;
  role: string;
  name: string;
  description: string;
  value: string;
  states: Record<string, string>;
  relationships: Record<string, string[]>;
  actions: string[];
  children: InternalNode[];
  focus_order: number | null;
  validation: WebFormValidation;
  live: { politeness: string; atomic: boolean; relevant: string };
  tag_name: string;
  css_classes: string[];
  css_inline: string;
  framework_hints: Record<string, string>;
  attributes: Record<string, string>;
  text_content: string;
}

function parseDomNode(payload: DomAriaNodeInput, path = 'node'): InternalNode {
  if (!isObject(payload)) {
    throw new UIIRWebRendererError(`${path} must be an object`, 'INVALID_NODE');
  }
  const nodeId = normalizeId(asString(payload.node_id || payload.id));
  const childrenRaw = payload.children || [];
  if (!Array.isArray(childrenRaw)) {
    throw new UIIRWebRendererError(`${path}.children must be an array`, 'INVALID_CHILDREN');
  }
  const children = childrenRaw
    .filter(isObject)
    .map((child, index) => parseDomNode(child as DomAriaNodeInput, `${path}/children[${index}]`));

  const statesRaw = payload.states || payload.aria_states || {};
  const states: Record<string, string> = {};
  if (isObject(statesRaw)) {
    for (const [key, value] of Object.entries(statesRaw)) {
      states[String(key)] = String(value);
    }
  }

  const relRaw = payload.relationships || payload.aria_relationships || {};
  const relationships: Record<string, string[]> = {};
  if (isObject(relRaw)) {
    for (const [key, refs] of Object.entries(relRaw)) {
      if (typeof refs === 'string') relationships[key] = [refs];
      else if (Array.isArray(refs)) relationships[key] = refs.map(String);
    }
  }

  const validationRaw = payload.validation || {};
  const validation: WebFormValidation = {
    valid:
      validationRaw && typeof validationRaw.valid === 'boolean'
        ? validationRaw.valid
        : validationRaw?.valid === null
          ? null
          : null,
    message: sanitizeWebText(validationRaw?.message || ''),
    required: Boolean(validationRaw?.required),
    invalid_state: sanitizeWebText(
      validationRaw?.invalid_state || states.invalid || '',
    ),
  };

  let liveRaw: Record<string, unknown> = {};
  const liveInput = payload.live ?? payload.aria_live;
  if (typeof liveInput === 'string') {
    liveRaw = { politeness: liveInput };
  } else if (isObject(liveInput)) {
    liveRaw = liveInput;
  }

  let actions: string[] = [];
  if (typeof payload.actions === 'string') actions = [payload.actions];
  else if (Array.isArray(payload.actions)) actions = payload.actions.map(String);

  let cssClasses: string[] = [];
  const cssRaw = payload.css_classes ?? payload.classList;
  if (typeof cssRaw === 'string') {
    cssClasses = cssRaw.split(/\s+/).filter(Boolean);
  } else if (Array.isArray(cssRaw)) {
    cssClasses = cssRaw.map(String);
  }

  let framework: Record<string, string> = {};
  const fw = payload.framework_hints ?? payload.framework;
  if (typeof fw === 'string') framework = { hint: fw };
  else if (isObject(fw)) {
    for (const [k, v] of Object.entries(fw)) framework[String(k)] = String(v);
  }

  const attributes: Record<string, string> = {};
  if (isObject(payload.attributes)) {
    for (const [k, v] of Object.entries(payload.attributes)) {
      attributes[String(k)] = String(v);
    }
  }

  const tagName = asString(payload.tag_name || payload.tag).toLowerCase();
  const inputType = asString(
    payload.input_type || attributes.type || '',
  ).toLowerCase();
  let role = normalizeRole(asString(payload.role));
  if (!role) role = inferRole(tagName, inputType);

  const focusOrder =
    payload.focus_order === null || payload.focus_order === undefined
      ? null
      : asNumber(payload.focus_order, NaN);
  if (focusOrder !== null && Number.isNaN(focusOrder)) {
    throw new UIIRWebRendererError(
      `${path}.focus_order must be an integer or null`,
      'INVALID_FOCUS_ORDER',
    );
  }

  return {
    node_id: nodeId,
    role,
    name: asString(payload.name || payload.accessible_name),
    description: asString(payload.description || payload.accessible_description),
    value: asString(payload.value),
    states,
    relationships,
    actions,
    children,
    focus_order: focusOrder,
    validation,
    live: {
      politeness: asString(
        liveRaw.politeness || liveRaw['aria-live'] || 'off',
        'off',
      ).toLowerCase(),
      atomic: Boolean(liveRaw.atomic),
      relevant: sanitizeWebText(liveRaw.relevant || 'additions text') || 'additions text',
    },
    tag_name: tagName,
    css_classes: cssClasses,
    css_inline: asString(payload.css_inline || payload.style),
    framework_hints: framework,
    attributes,
    text_content: asString(payload.text_content || payload.text),
  };
}

function safeAttributes(attributes: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(attributes)) {
    const keyL = key.toLowerCase();
    if (keyL.startsWith('on') && keyL.length > 2) continue;
    const valueS = sanitizeWebText(value);
    const valueL = valueS.trim().toLowerCase();
    if (
      valueL.startsWith('javascript:') ||
      valueL.startsWith('vbscript:') ||
      valueL.startsWith('data:text/html') ||
      valueL.startsWith('data:application/')
    ) {
      continue;
    }
    if (
      [
        'id',
        'name',
        'type',
        'for',
        'placeholder',
        'title',
        'alt',
        'role',
        'tabindex',
        'required',
        'disabled',
        'readonly',
        'checked',
        'value',
        'min',
        'max',
        'step',
      ].includes(keyL) ||
      keyL.startsWith('aria-') ||
      keyL.startsWith('data-')
    ) {
      safe[keyL] = valueS;
    }
  }
  return safe;
}

function summarizeCss(value: string): string {
  const text = sanitizeWebText(value);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

interface SanitizeResult {
  node: InternalNode | null;
  losses: WebLoss[];
  metadata: WebSourceMetadata;
}

function sanitizeNode(node: InternalNode, path: string): SanitizeResult {
  const losses: WebLoss[] = [];
  const nodeId = node.node_id;

  if (FORBIDDEN_TAGS.has(node.tag_name)) {
    losses.push({
      loss_id: `loss:rejected-tag:${nodeId}`,
      path,
      reason: `Tag ${JSON.stringify(node.tag_name)} is forbidden and never imported or executed`,
      category: 'rejected',
      detail: node.tag_name,
      mandatory: false,
    });
    return {
      node: null,
      losses,
      metadata: {
        metadata_id: `meta:${nodeId}`,
        node_id: nodeId,
        tag_name: node.tag_name,
        css_classes: node.css_classes,
        css_inline_summary: summarizeCss(node.css_inline),
        framework_hints: node.framework_hints,
        attributes_retained: {},
        detail: 'rejected forbidden tag',
      },
    };
  }

  for (const [attr, value] of Object.entries(node.attributes)) {
    const attrL = attr.toLowerCase();
    if (attrL.startsWith('on') && attrL.length > 2) {
      losses.push({
        loss_id: `loss:sanitized-attr:${nodeId}:${attrL}`,
        path: `${path}/attributes/${attr}`,
        reason: 'Event-handler attributes are stripped and never executed',
        category: 'sanitized',
        detail: attr,
        mandatory: false,
      });
    }
    const valueL = value.trim().toLowerCase();
    if (
      valueL.startsWith('javascript:') ||
      valueL.startsWith('vbscript:') ||
      valueL.startsWith('data:text/html')
    ) {
      losses.push({
        loss_id: `loss:sanitized-uri:${nodeId}:${attrL}`,
        path: `${path}/attributes/${attr}`,
        reason: 'Executable URI scheme stripped; markup is never executed',
        category: 'sanitized',
        detail: `${attr}=${value.slice(0, 64)}`,
        mandatory: false,
      });
    }
  }

  for (const [field, textValue] of [
    ['name', node.name],
    ['description', node.description],
    ['value', node.value],
    ['text_content', node.text_content],
  ] as const) {
    if (EXECUTABLE_TEXT_MARKERS.some(m => textValue.toLowerCase().includes(m))) {
      losses.push({
        loss_id: `loss:sanitized-text:${nodeId}:${field}`,
        path: `${path}/${field}`,
        reason: 'Executable markup markers stripped from text fields',
        category: 'sanitized',
        detail: field,
        mandatory: false,
      });
    }
  }

  let role = normalizeRole(node.role);
  if (!role) {
    losses.push({
      loss_id: `loss:role-missing:${path}`,
      path: `${path}/role`,
      reason: 'Node has no resolvable ARIA/HTML role in the supported subset',
      category: 'unsupported',
      detail: '',
      mandatory: false,
    });
    return {
      node: null,
      losses,
      metadata: {
        metadata_id: `meta:${nodeId}`,
        node_id: nodeId,
        tag_name: node.tag_name,
        css_classes: node.css_classes.map(sanitizeWebText),
        css_inline_summary: summarizeCss(node.css_inline),
        framework_hints: Object.fromEntries(
          Object.entries(node.framework_hints).map(([k, v]) => [
            sanitizeWebText(k),
            sanitizeWebText(v),
          ]),
        ),
        attributes_retained: safeAttributes(node.attributes),
        detail: 'unsupported role',
      },
    };
  }
  if (!SUPPORTED_ARIA_ROLES.has(role)) {
    losses.push({
      loss_id: `loss:role-unsupported:${path}`,
      path: `${path}/role`,
      reason: `Role ${JSON.stringify(role)} is outside the reviewed DOM/ARIA subset`,
      category: 'unsupported',
      detail: role,
      mandatory: false,
    });
    return {
      node: null,
      losses,
      metadata: {
        metadata_id: `meta:${nodeId}`,
        node_id: nodeId,
        tag_name: node.tag_name,
        css_classes: node.css_classes.map(sanitizeWebText),
        css_inline_summary: summarizeCss(node.css_inline),
        framework_hints: Object.fromEntries(
          Object.entries(node.framework_hints).map(([k, v]) => [
            sanitizeWebText(k),
            sanitizeWebText(v),
          ]),
        ),
        attributes_retained: safeAttributes(node.attributes),
        detail: 'unsupported role',
      },
    };
  }

  if (node.css_classes.length || node.css_inline) {
    losses.push({
      loss_id: `loss:css-metadata:${nodeId}`,
      path: `${path}/css`,
      reason: 'CSS class/style retained as source metadata only; not reconstructed',
      category: 'source_metadata',
      detail: summarizeCss([...node.css_classes, node.css_inline].join(' ')),
      mandatory: false,
    });
  }
  if (Object.keys(node.framework_hints).length) {
    losses.push({
      loss_id: `loss:framework-metadata:${nodeId}`,
      path: `${path}/framework_hints`,
      reason: 'Framework hints retained as source metadata only',
      category: 'source_metadata',
      detail: Object.entries(node.framework_hints)
        .map(([k, v]) => `${k}=${v}`)
        .sort()
        .join(','),
      mandatory: false,
    });
  }

  const stateValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(node.states)) {
    const keyL = key.toLowerCase().replace(/^aria-/, '');
    if (!SUPPORTED_STATE_KEYS.has(keyL)) {
      losses.push({
        loss_id: `loss:state-unsupported:${nodeId}:${keyL}`,
        path: `${path}/states/${key}`,
        reason: `State ${JSON.stringify(keyL)} is outside the supported subset`,
        category: 'unsupported',
        detail: keyL,
        mandatory: false,
      });
      continue;
    }
    stateValues[keyL] = sanitizeWebText(String(value));
  }

  const actions: string[] = [];
  for (const action of node.actions) {
    let actionL = action.trim().toLowerCase();
    if (actionL === 'click') actionL = 'activate';
    if (!SUPPORTED_ACTION_KINDS.has(actionL)) {
      losses.push({
        loss_id: `loss:action-unsupported:${nodeId}:${actionL}`,
        path: `${path}/actions`,
        reason: `Action ${JSON.stringify(action)} is outside the supported subset`,
        category: 'unsupported',
        detail: action,
        mandatory: false,
      });
      continue;
    }
    if (!actions.includes(actionL)) actions.push(actionL);
  }
  if (!actions.length && ['button', 'link', 'menuitem', 'tab'].includes(role)) {
    actions.push('activate');
  }
  if (!actions.length && ['checkbox', 'switch', 'radio'].includes(role)) {
    actions.push('toggle');
  }
  if (!actions.length && role === 'textbox') actions.push('edit');

  let livePolitenessValue = (node.live.politeness || 'off').toLowerCase();
  if (!['off', 'polite', 'assertive'].includes(livePolitenessValue)) {
    losses.push({
      loss_id: `loss:live-unsupported:${nodeId}`,
      path: `${path}/live`,
      reason: `aria-live value ${JSON.stringify(node.live.politeness)} not in off|polite|assertive`,
      category: 'unsupported',
      detail: node.live.politeness,
      mandatory: false,
    });
    livePolitenessValue = 'off';
  }
  if (['alert', 'status', 'log'].includes(role) && livePolitenessValue === 'off') {
    livePolitenessValue = role === 'alert' ? 'assertive' : 'polite';
  }

  const validation: WebFormValidation = {
    valid: node.validation.valid,
    message: sanitizeWebText(node.validation.message),
    required:
      node.validation.required ||
      ['true', '1', 'required'].includes((stateValues.required || '').toLowerCase()),
    invalid_state: sanitizeWebText(
      node.validation.invalid_state || stateValues.invalid || '',
    ),
  };

  const safeAttrs = safeAttributes(node.attributes);
  const metadata: WebSourceMetadata = {
    metadata_id: `meta:${nodeId}`,
    node_id: nodeId,
    tag_name: node.tag_name,
    css_classes: node.css_classes.map(sanitizeWebText).filter(Boolean),
    css_inline_summary: summarizeCss(node.css_inline),
    framework_hints: Object.fromEntries(
      Object.entries(node.framework_hints).map(([k, v]) => [
        sanitizeWebText(k),
        sanitizeWebText(v),
      ]),
    ),
    attributes_retained: safeAttrs,
    detail: 'css/framework retained as source metadata only',
  };

  // Children are sanitized by the caller walk; keep originals here.
  return {
    node: {
      node_id: nodeId,
      role,
      name: sanitizeWebText(node.name),
      description: sanitizeWebText(node.description),
      value: sanitizeWebText(node.value),
      states: stateValues,
      relationships: node.relationships,
      actions,
      children: node.children,
      focus_order: node.focus_order,
      validation,
      live: {
        politeness: livePolitenessValue,
        atomic: Boolean(node.live.atomic),
        relevant: sanitizeWebText(node.live.relevant) || 'additions text',
      },
      tag_name: node.tag_name,
      css_classes: metadata.css_classes.slice(),
      css_inline: metadata.css_inline_summary,
      framework_hints: { ...metadata.framework_hints },
      attributes: safeAttrs,
      text_content: sanitizeWebText(node.text_content),
    },
    losses,
    metadata,
  };
}

function buildNodeModel(
  node: InternalNode,
  parentId: string,
  order: number,
  focusRank: Map<string, number>,
  metadataId: string,
): WebNodeModel {
  const role = normalizeRole(node.role);
  const semantic = semanticFromRole(role);
  const surface = surfaceFor(semantic, role, 'preserved');
  const interaction = interactionState(semantic, surface, node.states, node.validation);
  const live = livePoliteness(surface, interaction, node.live);

  const relationships: Record<string, readonly string[]> = {};
  for (const [key, refs] of Object.entries(node.relationships)) {
    if (!SUPPORTED_RELATIONSHIP_KEYS.has(key)) continue;
    relationships[key] = refs.map(r => {
      try {
        return normalizeId(r);
      } catch {
        return slug(r);
      }
    });
  }

  const focusable =
    focusRank.has(node.node_id) ||
    (FOCUSABLE_ROLES.has(role) &&
      !['true', '1', 'disabled'].includes((node.states.disabled || '').toLowerCase()) &&
      !['true', '1', 'hidden'].includes((node.states.hidden || '').toLowerCase()));

  let tag = node.tag_name || roleToTag(role);
  if (FORBIDDEN_TAGS.has(tag.toLowerCase())) tag = 'div';

  let text = node.name || sanitizeWebText(node.text_content);
  if (node.validation.message && interaction === 'invalid') {
    text = text ? `${text}: ${node.validation.message}` : node.validation.message;
  }

  const aria: WebAriaModel = {
    role: role || 'region',
    name: node.name,
    description: node.description,
    value: node.value,
    states: { ...node.states },
    relationships,
    live: node.live.politeness === 'polite' || node.live.politeness === 'assertive'
      ? node.live.politeness
      : live,
    atomic:
      node.live.atomic ||
      surface === 'error' ||
      surface === 'alert' ||
      surface === 'denial',
    relevant: node.live.relevant || 'additions text',
  };

  const childIds = node.children.map(c => c.node_id);
  // children may not yet be sanitized ids — walk fixes this

  return {
    node_id: node.node_id,
    surface,
    semantic_kind: semantic,
    disposition: 'preserved',
    order,
    aria,
    aria_attributes: ariaAttributesFromModel(aria),
    tag_name: tag || 'div',
    text,
    actions: node.actions,
    children: childIds,
    parent_id: parentId,
    component_id: node.node_id,
    source_item_id: node.node_id,
    focus_index: focusable ? (focusRank.get(node.node_id) ?? order) : null,
    tab_index: focusable ? 0 : FOCUSABLE_ROLES.has(role) ? -1 : null,
    interaction_state: interaction,
    validation: node.validation,
    status_tone: statusTone(surface, interaction),
    visible: !['true', '1', 'hidden'].includes((node.states.hidden || '').toLowerCase()),
    accessible: true,
    mandatory: ['error', 'denial', 'confirmation', 'alert'].includes(surface),
    source_metadata_id: metadataId,
    attributes: { ...node.attributes },
    notes: [],
  };
}

/**
 * Import a DOM/ARIA document into a sanitized web projection (never executes).
 */
export function importDomAriaToWeb(
  document: DomAriaDocumentInput,
  options: {
    render_mode?: WebRenderMode;
    include_css_metadata?: boolean;
    notes?: readonly string[];
  } = {},
): WebProjectionArtifact {
  if (!isObject(document)) {
    throw new UIIRWebRendererError('DOM/ARIA document must be an object', 'INVALID_DOCUMENT');
  }
  const documentId = asString(document.document_id).trim();
  const title = asString(document.title).trim();
  if (!documentId) {
    throw new UIIRWebRendererError('document_id must be non-empty', 'INVALID_DOCUMENT');
  }
  if (!title) {
    throw new UIIRWebRendererError('title must be non-empty', 'INVALID_DOCUMENT');
  }
  if (!isObject(document.root)) {
    throw new UIIRWebRendererError('document.root must be an object', 'INVALID_DOCUMENT');
  }

  const includeCss = options.include_css_metadata !== false;
  const rootParsed = parseDomNode(document.root, 'root');

  const nodes: WebNodeModel[] = [];
  const sourceMetadata: WebSourceMetadata[] = [];
  const losses: WebLoss[] = [];
  const focusExplicit: Array<{ order: number; node_id: string }> = [];
  const seenIds = new Set<string>();

  function walk(node: InternalNode, parentId: string, path: string, orderBase: number): string | null {
    const result = sanitizeNode(node, path);
    losses.push(...result.losses);
    if (includeCss) {
      sourceMetadata.push(result.metadata);
    } else if (
      result.metadata.css_classes.length ||
      result.metadata.css_inline_summary ||
      Object.keys(result.metadata.framework_hints).length
    ) {
      losses.push({
        loss_id: `loss:web-css-omitted:${result.metadata.node_id}`,
        path: `source_metadata/${result.metadata.node_id}`,
        reason: 'CSS/framework metadata omitted by web options',
        category: 'source_metadata',
        detail: result.metadata.node_id,
        mandatory: false,
      });
    }
    if (!result.node) return null;
    if (seenIds.has(result.node.node_id)) {
      throw new UIIRWebRendererError(
        `Duplicate node_id: ${result.node.node_id}`,
        'DUPLICATE_NODE_ID',
      );
    }
    seenIds.add(result.node.node_id);

    const childIds: string[] = [];
    const sanitizedChildren: InternalNode[] = [];
    result.node.children.forEach((child, index) => {
      // sanitize child fully via walk
      const childId = walk(
        child,
        result.node!.node_id,
        `${path}/children[${index}]`,
        orderBase + 1 + index,
      );
      if (childId) {
        childIds.push(childId);
        // recover sanitized child from nodes later
      }
    });

    // Re-sanitize children list for model building: use only accepted child ids
    const working: InternalNode = {
      ...result.node,
      children: childIds.map(id => ({
        node_id: id,
        role: '',
        name: '',
        description: '',
        value: '',
        states: {},
        relationships: {},
        actions: [],
        children: [],
        focus_order: null,
        validation: emptyValidation(),
        live: { politeness: 'off', atomic: false, relevant: 'additions text' },
        tag_name: '',
        css_classes: [],
        css_inline: '',
        framework_hints: {},
        attributes: {},
        text_content: '',
      })),
    };

    if (result.node.focus_order != null) {
      focusExplicit.push({ order: result.node.focus_order, node_id: result.node.node_id });
    }

    const model = buildNodeModel(
      working,
      parentId,
      nodes.length,
      new Map(),
      result.metadata.metadata_id,
    );
    // Fix children to actual ids
    const finalModel: WebNodeModel = {
      ...model,
      children: childIds,
    };
    nodes.push(finalModel);
    return result.node.node_id;
  }

  const rootId = walk(rootParsed, '', 'root', 0);
  if (!rootId) {
    throw new UIIRWebRendererError(
      'Root node was rejected; refuse empty adaptation',
      'EMPTY_ADAPTATION',
    );
  }

  // Build focus order
  focusExplicit.sort((a, b) => a.order - b.order || a.node_id.localeCompare(b.node_id));
  const focusOrder: WebFocusOrderEntry[] = [];
  const seenFocus = new Set<string>();
  for (const entry of focusExplicit) {
    const node = nodes.find(n => n.node_id === entry.node_id);
    if (!node) continue;
    focusOrder.push({
      order: focusOrder.length,
      node_id: entry.node_id,
      role: node.aria.role,
      name: node.aria.name || node.text,
      focusable: true,
    });
    seenFocus.add(entry.node_id);
  }
  for (const node of [...nodes].sort((a, b) => a.order - b.order || a.node_id.localeCompare(b.node_id))) {
    if (seenFocus.has(node.node_id)) continue;
    const role = normalizeRole(node.aria.role);
    if (
      FOCUSABLE_ROLES.has(role) &&
      node.interaction_state !== 'disabled' &&
      node.visible
    ) {
      focusOrder.push({
        order: focusOrder.length,
        node_id: node.node_id,
        role: node.aria.role,
        name: node.aria.name || node.text,
        focusable: true,
      });
      seenFocus.add(node.node_id);
    }
  }

  const orderById = new Map(focusOrder.map(e => [e.node_id, e.order]));
  const stamped = nodes.map(n => ({
    ...n,
    focus_index: orderById.has(n.node_id) ? orderById.get(n.node_id)! : n.focus_index,
    tab_index: orderById.has(n.node_id) ? 0 : n.tab_index,
  }));

  // Ensure denial/error/confirmation visible
  for (const node of stamped) {
    if (
      (node.surface === 'denial' ||
        node.surface === 'error' ||
        node.surface === 'confirmation' ||
        node.surface === 'alert') &&
      (!node.visible || !node.accessible)
    ) {
      throw new UIIRWebRendererError(
        `Web node ${node.node_id} ${node.surface} must be visible and accessible`,
        'INVISIBLE_MANDATORY',
      );
    }
  }

  return {
    interface: UIIR_WEB_RENDERER_INTERFACE,
    schema_version: UIIR_WEB_PROJECTION_SCHEMA_VERSION,
    render_model_version: UIIR_WEB_RENDER_MODEL_VERSION,
    artifact_id: `web:dom-aria:${documentId}`,
    nodes: stamped,
    focus_order: focusOrder,
    entry_node_ids: [rootId],
    source_metadata: sourceMetadata,
    losses,
    render_mode: options.render_mode || 'accessible_tree',
    projection_artifact_id: '',
    projection_status: 'satisfied',
    profile_id: 'profile:desktop:default',
    document_id: documentId,
    title,
    loss_report: { adapter: DOMARIA_UIIR_ADAPTER, loss_count: losses.length },
    execution_performed: false,
    policy_owner: POLICY_OWNER,
    notes: [
      ...(options.notes || []),
      'web render from DOM/ARIA adapter; markup never executed',
      `adapter=${DOMARIA_UIIR_ADAPTER}`,
    ],
  };
}

/**
 * Project semantic projection items into a web accessible model.
 */
export function projectUIIRToWeb(request: WebProjectionRequest): WebProjectionArtifact {
  if (!isObject(request)) {
    throw new UIIRWebRendererError(
      'Web projection request must be an object',
      'INVALID_REQUEST',
    );
  }
  if (request.dom_aria) {
    return importDomAriaToWeb(request.dom_aria, {
      render_mode: request.render_mode,
      include_css_metadata: request.include_css_metadata,
      notes: request.notes,
    });
  }

  const items = request.items || [];
  if (!Array.isArray(items)) {
    throw new UIIRWebRendererError('items must be an array', 'INVALID_ITEMS');
  }

  const nodes: WebNodeModel[] = [];
  const losses: WebLoss[] = [];

  const sorted = [...items].sort(
    (a, b) => (a.order ?? 100) - (b.order ?? 100) || a.item_id.localeCompare(b.item_id),
  );

  sorted.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new UIIRWebRendererError(`items[${index}] must be an object`, 'INVALID_ITEM');
    }
    const itemId = asString(item.item_id).trim();
    if (!itemId) {
      throw new UIIRWebRendererError(`items[${index}].item_id is required`, 'INVALID_ITEM');
    }
    const kind = asString(item.semantic_kind).toLowerCase() || 'structure';
    const label = sanitizeWebText(item.label || item.component_id || itemId);
    const disposition = asString(item.disposition, 'preserved');
    let role = 'region';
    if (kind === 'action') role = 'button';
    else if (kind === 'error') role = 'alert';
    else if (kind === 'confirmation' || kind === 'consent') role = 'alertdialog';
    else if (kind === 'feedback') role = 'status';
    else if (kind.includes('denial')) role = 'alert';

    const surface = surfaceFor(kind, role, disposition);
    const interaction = interactionState(kind, surface);
    const live = livePoliteness(surface, interaction);

    let text = label;
    if (surface === 'confirmation') text = `Confirm: ${label}`;
    else if (surface === 'error') text = `Error: ${label}`;
    else if (surface === 'denial') text = `Denied: ${label}`;
    else if (surface === 'fallback') text = `Fallback: ${label}`;

    const focusable =
      FOCUSABLE_ROLES.has(role) && disposition !== 'omitted' && disposition !== 'unsatisfiable';
    let actions: string[] = [];
    if (kind === 'action' || surface === 'control') actions = ['activate'];
    if (surface === 'confirmation') actions = ['confirm', 'dismiss'];

    const mandatory =
      Boolean(item.mandatory) ||
      ['error', 'confirmation', 'consent', 'consequence', 'action', 'feedback'].includes(kind) ||
      kind.includes('denial');

    const visible =
      disposition !== 'omitted' || mandatory || surface === 'error' || surface === 'denial';

    if ((surface === 'error' || surface === 'denial' || surface === 'confirmation') && !visible) {
      throw new UIIRWebRendererError(
        `Mandatory ${surface} for ${itemId} must remain visible`,
        'INVISIBLE_MANDATORY',
      );
    }

    const aria: WebAriaModel = {
      role,
      name: label,
      description: '',
      value: '',
      states: interaction === 'pending' ? { busy: 'true' } : {},
      relationships: {},
      live,
      atomic: surface === 'error' || surface === 'denial' || surface === 'alert',
      relevant: 'additions text',
    };

    nodes.push({
      node_id: `web:${itemId}`,
      surface,
      semantic_kind: kind,
      disposition,
      order: index,
      aria,
      aria_attributes: ariaAttributesFromModel(aria),
      tag_name: roleToTag(role),
      text,
      actions,
      children: [],
      parent_id: '',
      component_id: asString(item.component_id),
      source_item_id: itemId,
      focus_index: focusable ? index : null,
      tab_index: focusable ? 0 : null,
      interaction_state: interaction,
      validation: emptyValidation(),
      status_tone: statusTone(surface, interaction),
      visible,
      accessible: true,
      mandatory,
      source_metadata_id: '',
      attributes: {},
      notes: [
        `disposition:${disposition}`,
        item.fallback_ref ? `fallback:${item.fallback_ref}` : '',
      ].filter(Boolean),
    });
  });

  const focusOrder: WebFocusOrderEntry[] = nodes
    .filter(n => n.focus_index != null)
    .sort(
      (a, b) =>
        (a.focus_index ?? 0) - (b.focus_index ?? 0) || a.node_id.localeCompare(b.node_id),
    )
    .map((n, order) => ({
      order,
      node_id: n.node_id,
      role: n.aria.role,
      name: n.aria.name || n.text,
      focusable: true,
    }));

  const documentId = asString(request.document_id, 'doc:web');
  return {
    interface: UIIR_WEB_RENDERER_INTERFACE,
    schema_version: UIIR_WEB_PROJECTION_SCHEMA_VERSION,
    render_model_version: UIIR_WEB_RENDER_MODEL_VERSION,
    artifact_id: `web:proj:${documentId}`,
    nodes,
    focus_order: focusOrder,
    entry_node_ids: nodes.length ? [nodes[0].node_id] : [],
    source_metadata: [],
    losses,
    render_mode: request.render_mode || 'accessible_tree',
    projection_artifact_id: '',
    projection_status: 'satisfied',
    profile_id: 'profile:desktop:default',
    document_id: documentId,
    title: asString(request.title, documentId),
    loss_report: {},
    execution_performed: false,
    policy_owner: POLICY_OWNER,
    notes: [
      ...(request.notes || []),
      'web is presentation-only; policy_owner=UIProjectionSolver@1',
      'imported markup/scripts are never executed',
    ],
  };
}

/** Serialize a stable accessible-tree handoff (no HTML execution). */
export function renderWebAccessibleTree(
  artifact: WebProjectionArtifact,
): WebAccessibleTree {
  validateWebProjectionArtifact(artifact);
  return {
    interface: UIIR_WEB_RENDERER_INTERFACE,
    schema_version: UIIR_WEB_RENDER_MODEL_VERSION,
    document_id: artifact.document_id,
    title: artifact.title,
    execution_performed: false,
    focus_order: [...artifact.focus_order].sort(
      (a, b) => a.order - b.order || a.node_id.localeCompare(b.node_id),
    ),
    nodes: [...artifact.nodes]
      .sort((a, b) => a.order - b.order || a.node_id.localeCompare(b.node_id))
      .map(node => ({
        node_id: node.node_id,
        role: node.aria.role,
        name: node.aria.name,
        value: node.aria.value,
        text: node.text,
        surface: node.surface,
        actions: node.actions,
        children: node.children,
        focus_index: node.focus_index,
        interaction_state: node.interaction_state,
        validation: node.validation,
        visible: node.visible,
        aria: node.aria_attributes,
      })),
  };
}

export function validateWebProjectionArtifact(artifact: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!isObject(artifact)) {
    return { valid: false, errors: ['artifact must be an object'] };
  }
  if (
    artifact.interface &&
    artifact.interface !== UIIR_WEB_RENDERER_INTERFACE &&
    artifact.interface !== UIIR_WEB_PROJECTION_INTERFACE
  ) {
    errors.push(`unsupported interface: ${String(artifact.interface)}`);
  }
  if (
    artifact.schema_version &&
    artifact.schema_version !== UIIR_WEB_PROJECTION_SCHEMA_VERSION
  ) {
    errors.push(`unsupported schema_version: ${String(artifact.schema_version)}`);
  }
  if (artifact.execution_performed === true) {
    errors.push('execution_performed must be false; markup/scripts are never executed');
  }
  if (artifact.policy_owner && artifact.policy_owner !== POLICY_OWNER) {
    errors.push(
      `web must not own policy; expected policy_owner=${POLICY_OWNER}, got ${String(artifact.policy_owner)}`,
    );
  }
  if (!Array.isArray(artifact.nodes)) {
    errors.push('nodes must be an array');
  } else {
    artifact.nodes.forEach((node, index) => {
      if (!isObject(node)) {
        errors.push(`nodes[${index}] must be an object`);
        return;
      }
      if (!asString(node.node_id)) {
        errors.push(`nodes[${index}].node_id is required`);
      }
      if (
        (node.surface === 'denial' ||
          node.surface === 'error' ||
          node.surface === 'confirmation' ||
          node.surface === 'alert') &&
        (node.visible === false || node.accessible === false)
      ) {
        errors.push(
          `nodes[${index}] ${String(node.surface)} must be visible and accessible`,
        );
      }
    });
  }
  if (!Array.isArray(artifact.focus_order)) {
    errors.push('focus_order must be an array');
  }
  return { valid: errors.length === 0, errors };
}

export class UIIRWebRenderer {
  readonly interface = UIIR_WEB_RENDERER_INTERFACE;

  project(request: WebProjectionRequest): WebProjectionArtifact {
    return projectUIIRToWeb(request);
  }

  render(request: WebProjectionRequest | WebProjectionArtifact): WebAccessibleTree {
    if (
      isObject(request) &&
      Array.isArray((request as WebProjectionArtifact).nodes) &&
      (request as WebProjectionArtifact).schema_version === UIIR_WEB_PROJECTION_SCHEMA_VERSION
    ) {
      return renderWebAccessibleTree(request as WebProjectionArtifact);
    }
    return renderWebAccessibleTree(projectUIIRToWeb(request as WebProjectionRequest));
  }
}

export default UIIRWebRenderer;
