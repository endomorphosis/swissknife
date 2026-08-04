/**
 * UIIRGlassesAdapter@1 — Meta-glasses and spatial projection adapter.
 *
 * Maps UI/UX IR semantic items onto bounded HUD cards, actions, status,
 * privacy indicators, audio summaries, and mobile companion fallbacks while
 * respecting current Meta DAT versus Web App capability paths.
 *
 * Constraints (UIR-001 Meta capability matrix / UIR-043):
 * - Web Apps expose Neural Band/captouch as Arrow/Enter-style intents only.
 * - DAT is a distinct capability path; never collapse DAT and Web App.
 * - Continuous cursor, free-form touch, continuous text input, and raw EMG
 *   are never assumed or fabricated.
 * - Mandatory semantics that do not fit fall back to mobile/audio or fail
 *   with an explicit loss receipt. Privacy indicators and confirmations
 *   always survive or are marked unsatisfiable.
 */

export const UIIR_GLASSES_ADAPTER_INTERFACE = 'UIIRGlassesAdapter@1' as const;
export const UIIR_GLASSES_PROJECTION_INTERFACE = 'UIIRGlassesProjection@1' as const;
export const UIIR_GLASSES_PROJECTION_SCHEMA_VERSION = 'ui-glasses-projection/v1' as const;

export const ARROW_ENTER_TOKENS = [
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Enter',
] as const;

export type ArrowEnterToken = (typeof ARROW_ENTER_TOKENS)[number];

export const ARROW_ENTER_INTENT_MAP: Readonly<Record<string, string>> = Object.freeze({
  ArrowUp: 'navigate_up',
  ArrowDown: 'navigate_down',
  ArrowLeft: 'navigate_left',
  ArrowRight: 'navigate_right',
  Enter: 'activate',
  arrowup: 'navigate_up',
  arrowdown: 'navigate_down',
  arrowleft: 'navigate_left',
  arrowright: 'navigate_right',
  enter: 'activate',
  up: 'navigate_up',
  down: 'navigate_down',
  left: 'navigate_left',
  right: 'navigate_right',
  select: 'activate',
});

export const UNSUPPORTED_GLASSES_ASSUMPTIONS = [
  'continuous_cursor',
  'freeform_touch',
  'continuous_text_input',
  'raw_emg',
  'raw_neural_stream',
  'full_touchscreen_pointer',
] as const;

export type UnsupportedGlassesAssumption =
  (typeof UNSUPPORTED_GLASSES_ASSUMPTIONS)[number];

export type GlassesCapabilityPath = 'dat' | 'web_app' | 'simulator';

export type GlassesSurfaceKind =
  | 'hud_card'
  | 'action'
  | 'status'
  | 'confirmation'
  | 'privacy_indicator'
  | 'audio_summary'
  | 'mobile_fallback'
  | 'notification'
  | 'unsatisfiable';

export type GlassesInputSource =
  | 'neural_band'
  | 'captouch'
  | 'dpad'
  | 'speech'
  | 'hand_gesture'
  | 'gaze'
  | 'head_pose'
  | 'mobile_action';

export type GlassesRenderPath =
  | 'dat-native'
  | 'display-webapp'
  | 'simulator'
  | 'mobile-card'
  | 'audio-summary'
  | 'notification';

export type GlassesProjectionStatus =
  | 'satisfied'
  | 'degraded'
  | 'fallback'
  | 'unsatisfiable'
  | 'bound_exceeded';

export type GlassesDisposition =
  | 'preserved'
  | 'adapted'
  | 'summarized'
  | 'fallback'
  | 'omitted'
  | 'unsatisfiable';

export type GlassesLossCategory =
  | 'preserved'
  | 'adapted'
  | 'summarized'
  | 'fallback'
  | 'omitted'
  | 'degraded'
  | 'unsupported'
  | 'unsatisfiable'
  | 'budget_exceeded';

export type GlassesMandatoryKind =
  | 'action'
  | 'consent'
  | 'consequence'
  | 'error'
  | 'confirmation'
  | 'feedback'
  | 'accessibility'
  | 'privacy';

export interface GlassesBudgetLimits {
  action_count: number;
  text_chars: number;
  update_hz: number;
  field_of_view: number;
  attention: number;
  latency_ms: number;
}

export interface GlassesCapabilityProfile {
  profile_id: string;
  capability_path: GlassesCapabilityPath;
  family: 'glasses';
  input_capability_ids: readonly string[];
  output_capability_ids: readonly string[];
  budgets: GlassesBudgetLimits;
  render_path: GlassesRenderPath;
  description: string;
  /** Explicit denials — never claimed true for glasses projection. */
  unsupported_assumptions: readonly UnsupportedGlassesAssumption[];
  continuous_cursor: false;
  freeform_touch: false;
  continuous_text_input: false;
  raw_emg: false;
}

export interface GlassesSemanticItem {
  item_id: string;
  semantic_kind: string;
  mandatory?: boolean;
  label?: string;
  text?: string;
  component_id?: string;
  action_cost?: number;
  text_chars?: number;
  update_rate?: number;
  field_of_view_share?: number;
  attention_cost?: number;
  priority?: number;
  fallback_ref?: string;
  required_capability_ids?: readonly string[];
  fallback_capability_ids?: readonly string[];
}

export interface GlassesProjectionRequest {
  document_id?: string;
  projection_id?: string;
  capability_path?: GlassesCapabilityPath;
  items: readonly GlassesSemanticItem[];
  title?: string;
}

export interface GlassesInputBinding {
  binding_id: string;
  source: GlassesInputSource;
  capability_id: string;
  capability_path: GlassesCapabilityPath;
  admitted_tokens: readonly ArrowEnterToken[];
  intent_map: Readonly<Record<ArrowEnterToken, string>>;
  raw_emg_allowed: false;
  continuous_cursor_allowed: false;
  freeform_touch_allowed: false;
  continuous_text_input_allowed: false;
}

export interface GlassesLossEntry {
  loss_id: string;
  semantic_id: string;
  semantic_kind: string;
  category: GlassesLossCategory;
  reason: string;
  mandatory: boolean;
  fallback_ref?: string;
  budget_kind?: string;
  details?: readonly string[];
}

export interface GlassesPresentationNode {
  node_id: string;
  surface: GlassesSurfaceKind;
  semantic_id: string;
  semantic_kind: string;
  disposition: GlassesDisposition;
  mandatory: boolean;
  order: number;
  label: string;
  text: string;
  action_id: string;
  focus_index: number | null;
  fallback_ref: string;
  component_id: string;
}

export interface GlassesBudgetReceipt {
  action_count: number;
  action_limit: number;
  text_chars: number;
  text_limit: number;
  update_hz: number;
  update_limit: number;
  field_of_view_share: number;
  field_of_view_limit: number;
  exceeded: readonly string[];
}

export interface GlassesCapabilityReceipt {
  capability_path: GlassesCapabilityPath;
  profile_id: string;
  render_path: GlassesRenderPath;
  input_capability_ids: readonly string[];
  output_capability_ids: readonly string[];
  unsupported_assumptions: readonly UnsupportedGlassesAssumption[];
  dat_webapp_collapsed: false;
}

export interface GlassesCompilerHandoff {
  template: string;
  render_path: GlassesRenderPath;
  max_actions: number;
  max_text_chars: number;
  max_update_hz: number;
  focus_order: readonly string[];
  actions: readonly {
    id: string;
    method: string;
    backend_action_id: string;
    label: string;
    focusable: boolean;
  }[];
  regions: readonly Record<string, unknown>[];
  fallbacks: readonly Record<string, unknown>[];
  input_kinds: readonly string[];
}

export interface UIIRGlassesProjection {
  interface: typeof UIIR_GLASSES_PROJECTION_INTERFACE;
  schema_version: typeof UIIR_GLASSES_PROJECTION_SCHEMA_VERSION;
  projection_id: string;
  document_id: string;
  profile_id: string;
  capability_path: GlassesCapabilityPath;
  status: GlassesProjectionStatus;
  nodes: readonly GlassesPresentationNode[];
  input_bindings: readonly GlassesInputBinding[];
  losses: readonly GlassesLossEntry[];
  budget_receipt: GlassesBudgetReceipt;
  capability_receipt: GlassesCapabilityReceipt;
  compiler_handoff: GlassesCompilerHandoff;
}

export interface GlassesIntentNormalizationResult {
  token: ArrowEnterToken | string;
  intent: string;
  source: GlassesInputSource;
  capability_path: GlassesCapabilityPath;
  raw_emg: false;
  continuous_cursor: false;
}

export class UIIRGlassesAdapterError extends Error {
  readonly code: string;

  constructor(message: string, code = 'UIIR_GLASSES_ADAPTER_ERROR') {
    super(message);
    this.name = 'UIIRGlassesAdapterError';
    this.code = code;
  }
}

const SURVIVAL_KINDS = new Set<string>([
  'confirmation',
  'privacy',
  'consent',
  'consequence',
]);

const MANDATORY_KINDS = new Set<string>([
  'action',
  'consent',
  'consequence',
  'error',
  'confirmation',
  'feedback',
  'accessibility',
  'privacy',
]);

const DEFAULT_BUDGETS: GlassesBudgetLimits = Object.freeze({
  action_count: 4,
  text_chars: 180,
  update_hz: 10,
  field_of_view: 30,
  attention: 25,
  latency_ms: 80,
});

const WEB_APP_PROFILE: GlassesCapabilityProfile = Object.freeze({
  profile_id: 'profile:glasses:web_app',
  capability_path: 'web_app',
  family: 'glasses',
  input_capability_ids: Object.freeze([
    'dpad_captouch',
    'neural_band_normalized',
    'speech',
  ]),
  output_capability_ids: Object.freeze([
    'spatial_display',
    'audio',
    'speech_output',
    'mobile_companion',
    'notification',
    'fallback',
  ]),
  budgets: DEFAULT_BUDGETS,
  render_path: 'display-webapp',
  description:
    'Meta Web App glasses path: Neural Band/captouch as Arrow/Enter intents; no camera/mic/raw-EMG claims',
  unsupported_assumptions: UNSUPPORTED_GLASSES_ASSUMPTIONS,
  continuous_cursor: false,
  freeform_touch: false,
  continuous_text_input: false,
  raw_emg: false,
});

const DAT_PROFILE: GlassesCapabilityProfile = Object.freeze({
  profile_id: 'profile:glasses:dat',
  capability_path: 'dat',
  family: 'glasses',
  input_capability_ids: Object.freeze([
    'dpad_captouch',
    'neural_band_normalized',
    'gaze',
    'head_pose',
    'speech',
    'hand_gesture',
  ]),
  output_capability_ids: Object.freeze([
    'spatial_display',
    'audio',
    'speech_output',
    'haptic',
    'mobile_companion',
    'notification',
    'fallback',
  ]),
  budgets: Object.freeze({
    ...DEFAULT_BUDGETS,
    attention: 30,
  }),
  render_path: 'dat-native',
  description:
    'Meta DAT glasses path: native spatial display with normalized embodied inputs; distinct from Web App',
  unsupported_assumptions: UNSUPPORTED_GLASSES_ASSUMPTIONS,
  continuous_cursor: false,
  freeform_touch: false,
  continuous_text_input: false,
  raw_emg: false,
});

const SIMULATOR_PROFILE: GlassesCapabilityProfile = Object.freeze({
  ...WEB_APP_PROFILE,
  profile_id: 'profile:glasses:simulator',
  capability_path: 'simulator',
  render_path: 'simulator',
  description: 'Hardware-free Meta glasses simulator projection path',
});

export function glassesCapabilityProfile(
  path: GlassesCapabilityPath = 'web_app',
): GlassesCapabilityProfile {
  if (path === 'dat') return DAT_PROFILE;
  if (path === 'simulator') return SIMULATOR_PROFILE;
  if (path === 'web_app') return WEB_APP_PROFILE;
  throw new UIIRGlassesAdapterError(
    `Unknown glasses capability path: ${String(path)}`,
    'UNKNOWN_CAPABILITY_PATH',
  );
}

export function renderPathForCapabilityPath(
  path: GlassesCapabilityPath,
): GlassesRenderPath {
  return glassesCapabilityProfile(path).render_path;
}

export function isSupportedArrowEnterToken(token: string): token is ArrowEnterToken {
  if (typeof token !== 'string' || !token.trim()) return false;
  const key = token.trim();
  return key in ARROW_ENTER_INTENT_MAP || key.toLowerCase() in ARROW_ENTER_INTENT_MAP;
}

export function normalizeArrowEnterIntent(token: string): string {
  if (typeof token !== 'string' || !token.trim()) {
    throw new UIIRGlassesAdapterError(
      'Arrow/Enter intent token must be a non-empty string',
      'INVALID_INTENT_TOKEN',
    );
  }
  const key = token.trim();
  const intent =
    ARROW_ENTER_INTENT_MAP[key] ?? ARROW_ENTER_INTENT_MAP[key.toLowerCase()];
  if (!intent) {
    throw new UIIRGlassesAdapterError(
      `Unsupported glasses intent token ${JSON.stringify(token)}; expected Arrow/Enter-style normalized intents only (admitted: ${ARROW_ENTER_TOKENS.join(', ')})`,
      'UNSUPPORTED_INTENT_TOKEN',
    );
  }
  return intent;
}

export function defaultInputBindings(
  capabilityPath: GlassesCapabilityPath,
): GlassesInputBinding[] {
  const intentMap = Object.fromEntries(
    ARROW_ENTER_TOKENS.map(token => [token, ARROW_ENTER_INTENT_MAP[token]]),
  ) as Record<ArrowEnterToken, string>;

  const base = {
    admitted_tokens: ARROW_ENTER_TOKENS,
    intent_map: Object.freeze(intentMap),
    capability_path: capabilityPath,
    raw_emg_allowed: false as const,
    continuous_cursor_allowed: false as const,
    freeform_touch_allowed: false as const,
    continuous_text_input_allowed: false as const,
  };

  return [
    {
      ...base,
      binding_id: `binding:${capabilityPath}:neural_band`,
      source: 'neural_band',
      capability_id: 'neural_band_normalized',
    },
    {
      ...base,
      binding_id: `binding:${capabilityPath}:captouch`,
      source: 'captouch',
      capability_id: 'dpad_captouch',
    },
    {
      ...base,
      binding_id: `binding:${capabilityPath}:dpad`,
      source: 'dpad',
      capability_id: 'dpad_captouch',
    },
  ];
}

export function rejectFabricatedCapabilityClaims(
  payload: Record<string, unknown>,
): void {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new UIIRGlassesAdapterError(
      'capability claim payload must be a mapping',
      'INVALID_CAPABILITY_CLAIM',
    );
  }
  const keys = Object.keys(payload).map(k => k.toLowerCase());
  const values = Object.values(payload)
    .filter((v): v is string => typeof v === 'string')
    .map(v => v.toLowerCase());
  const hits = new Set(
    [...keys, ...values].filter(item =>
      [
        'raw_emg',
        'emg_raw',
        'continuous_cursor',
        'freeform_touch',
        'continuous_text_input',
        'neural_band_raw',
        'raw_neural_stream',
      ].includes(item),
    ),
  );
  // Only fail when a claim asserts these as available/true, not when listing denials.
  const assertedTrue = [
    'raw_emg',
    'continuous_cursor',
    'freeform_touch',
    'continuous_text_input',
    'raw_neural_stream',
  ].filter(key => payload[key] === true);
  if (assertedTrue.length > 0) {
    throw new UIIRGlassesAdapterError(
      `Fabricated glasses capability claims are forbidden: ${assertedTrue.join(', ')}`,
      'FABRICATED_CAPABILITY',
    );
  }
  if (payload.dat_webapp_collapsed === true) {
    throw new UIIRGlassesAdapterError(
      'DAT and Web App capability paths must not be collapsed',
      'COLLAPSED_CAPABILITY_PATHS',
    );
  }
  // Presence of forbidden raw sensor sample fields is always rejected.
  if (hits.has('emg_raw') || hits.has('neural_band_raw')) {
    throw new UIIRGlassesAdapterError(
      'Raw EMG / neural stream fields are forbidden in glasses projection payloads',
      'RAW_SENSOR_FORBIDDEN',
    );
  }
}

function isMandatory(item: GlassesSemanticItem): boolean {
  return Boolean(item.mandatory) || MANDATORY_KINDS.has(item.semantic_kind);
}

function truncateText(text: string, limit: number): string {
  if (limit <= 0) return '';
  if (text.length <= limit) return text;
  if (limit <= 1) return text.slice(0, limit);
  return `${text.slice(0, limit - 1)}…`;
}

function surfaceFor(
  item: GlassesSemanticItem,
  disposition: GlassesDisposition,
): GlassesSurfaceKind {
  if (disposition === 'unsatisfiable') return 'unsatisfiable';
  if (disposition === 'fallback') {
    const fallbacks = item.fallback_capability_ids ?? [];
    if (
      item.fallback_ref?.startsWith('fallback:mobile') ||
      fallbacks.includes('mobile_companion')
    ) {
      return 'mobile_fallback';
    }
    if (
      item.fallback_ref?.startsWith('fallback:audio') ||
      fallbacks.includes('audio') ||
      fallbacks.includes('speech_output')
    ) {
      return 'audio_summary';
    }
    if (fallbacks.includes('notification')) return 'notification';
    return 'mobile_fallback';
  }
  if (item.semantic_kind === 'confirmation') return 'confirmation';
  if (item.semantic_kind === 'privacy' || item.semantic_kind === 'consent') {
    return 'privacy_indicator';
  }
  if (item.semantic_kind === 'action') return 'action';
  if (
    item.semantic_kind === 'error' ||
    item.semantic_kind === 'feedback' ||
    item.semantic_kind === 'consequence'
  ) {
    return 'status';
  }
  return 'hud_card';
}

function sortItems(items: readonly GlassesSemanticItem[]): GlassesSemanticItem[] {
  return [...items].sort((a, b) => {
    const pa = a.priority ?? 100;
    const pb = b.priority ?? 100;
    if (pa !== pb) return pa - pb;
    return a.item_id.localeCompare(b.item_id);
  });
}

/**
 * Project semantic UI/UX IR items onto a Meta-glasses spatial presentation.
 */
export function projectUIIRToGlasses(
  request: GlassesProjectionRequest,
): UIIRGlassesProjection {
  if (!request || typeof request !== 'object') {
    throw new UIIRGlassesAdapterError(
      'Glasses projection request must be an object',
      'INVALID_REQUEST',
    );
  }
  if (!Array.isArray(request.items) || request.items.length === 0) {
    throw new UIIRGlassesAdapterError(
      'Glasses projection requires a non-empty items list',
      'EMPTY_ITEMS',
    );
  }

  const capabilityPath = request.capability_path ?? 'web_app';
  const profile = glassesCapabilityProfile(capabilityPath);
  rejectFabricatedCapabilityClaims({
    continuous_cursor: profile.continuous_cursor,
    freeform_touch: profile.freeform_touch,
    continuous_text_input: profile.continuous_text_input,
    raw_emg: profile.raw_emg,
    dat_webapp_collapsed: false,
  });

  const budgets = profile.budgets;
  const ordered = sortItems(request.items);
  const nodes: GlassesPresentationNode[] = [];
  const losses: GlassesLossEntry[] = [];
  let actionUsed = 0;
  let textUsed = 0;
  let updateUsed = 0;
  let fovUsed = 0;
  let attentionUsed = 0;
  let focusCounter = 0;
  let hasFallback = false;
  let hasDegraded = false;
  let hasUnsat = false;

  // Soft pass: place survival semantics first (privacy/confirmation), then others.
  const survival = ordered.filter(
    item => SURVIVAL_KINDS.has(item.semantic_kind) || isMandatory(item),
  );
  const optional = ordered.filter(
    item => !SURVIVAL_KINDS.has(item.semantic_kind) && !isMandatory(item),
  );
  const placementOrder = [...survival, ...optional];

  for (const [index, item] of placementOrder.entries()) {
    if (!item.item_id || !item.semantic_kind) {
      throw new UIIRGlassesAdapterError(
        'Each glasses projection item requires item_id and semantic_kind',
        'INVALID_ITEM',
      );
    }

    const mandatory = isMandatory(item);
    const actionCost = item.action_cost ?? (item.semantic_kind === 'action' ? 1 : 0);
    const textChars =
      item.text_chars ??
      Math.max(8, (item.label ?? item.text ?? item.item_id).length);
    const updateRate = item.update_rate ?? 0;
    const fovShare = item.field_of_view_share ?? (mandatory ? 8 : 4);
    const attention = item.attention_cost ?? (mandatory ? 5 : 1);
    const label = item.label ?? item.text ?? item.item_id;

    const wouldExceed =
      actionUsed + actionCost > budgets.action_count ||
      textUsed + textChars > budgets.text_chars ||
      Math.max(updateUsed, updateRate) > budgets.update_hz ||
      fovUsed + fovShare > budgets.field_of_view ||
      attentionUsed + attention > budgets.attention;

    let disposition: GlassesDisposition = 'preserved';
    let surface: GlassesSurfaceKind;
    let fallbackRef = item.fallback_ref ?? '';

    // Continuous text input is never assumed: text-entry items fall back/fail.
    if (item.semantic_kind === 'text_input' || item.semantic_kind === 'freeform_text') {
      if (mandatory) {
        disposition = 'fallback';
        fallbackRef = fallbackRef || `fallback:mobile:${item.item_id}`;
        hasFallback = true;
        losses.push({
          loss_id: `loss:fallback-text:${item.item_id}`,
          semantic_id: item.item_id,
          semantic_kind: item.semantic_kind,
          category: 'fallback',
          reason:
            'Continuous text input is not assumed on glasses; routing to mobile companion',
          mandatory: true,
          fallback_ref: fallbackRef,
        });
      } else {
        disposition = 'omitted';
        losses.push({
          loss_id: `loss:omit-text:${item.item_id}`,
          semantic_id: item.item_id,
          semantic_kind: item.semantic_kind,
          category: 'omitted',
          reason: 'Optional free-form text omitted; continuous text input not assumed',
          mandatory: false,
        });
      }
    } else if (wouldExceed) {
      if (mandatory) {
        disposition = 'fallback';
        fallbackRef =
          fallbackRef ||
          (item.fallback_capability_ids?.includes('audio')
            ? `fallback:audio:${item.item_id}`
            : `fallback:mobile:${item.item_id}`);
        hasFallback = true;
        losses.push({
          loss_id: `loss:fallback-budget:${item.item_id}`,
          semantic_id: item.item_id,
          semantic_kind: item.semantic_kind,
          category: 'fallback',
          reason:
            'Mandatory semantic projected via mobile/audio fallback to respect glasses budgets',
          mandatory: true,
          fallback_ref: fallbackRef,
          budget_kind: 'action_count',
        });
      } else {
        disposition = 'omitted';
        hasDegraded = true;
        losses.push({
          loss_id: `loss:omit-budget:${item.item_id}`,
          semantic_id: item.item_id,
          semantic_kind: item.semantic_kind,
          category: 'omitted',
          reason: 'Optional item omitted to respect glasses action/text/FOV budgets',
          mandatory: false,
          budget_kind: 'field_of_view',
        });
      }
    } else {
      // Fits on spatial display.
      actionUsed += actionCost;
      textUsed += textChars;
      updateUsed = Math.max(updateUsed, updateRate);
      fovUsed += fovShare;
      attentionUsed += attention;
    }

    // Survival kinds that somehow became omitted without policy → unsatisfiable.
    if (
      disposition === 'omitted' &&
      mandatory &&
      SURVIVAL_KINDS.has(item.semantic_kind)
    ) {
      disposition = 'unsatisfiable';
      hasUnsat = true;
      losses.push({
        loss_id: `loss:unsat-survival:${item.item_id}`,
        semantic_id: item.item_id,
        semantic_kind: item.semantic_kind,
        category: 'unsatisfiable',
        reason:
          'Privacy/confirmation semantics cannot be silently omitted on glasses',
        mandatory: true,
      });
    }

    surface = surfaceFor(item, disposition);

    // Fallback surfaces do not consume HUD action slots but remain present.
    if (disposition === 'fallback' || disposition === 'preserved' || disposition === 'adapted' || disposition === 'summarized') {
      // already handled usage for preserved path
    }

    let actionId = '';
    let focusIndex: number | null = null;
    if (
      surface === 'action' &&
      disposition !== 'omitted' &&
      disposition !== 'unsatisfiable'
    ) {
      actionId = item.item_id;
      focusIndex = focusCounter;
      focusCounter += 1;
    }

    nodes.push({
      node_id: `glasses:${item.item_id}`,
      surface,
      semantic_id: item.item_id,
      semantic_kind: item.semantic_kind,
      disposition,
      mandatory,
      order: index,
      label,
      text: truncateText(label, budgets.text_chars),
      action_id: actionId,
      focus_index: focusIndex,
      fallback_ref: fallbackRef,
      component_id: item.component_id ?? '',
    });
  }

  // Explicit unsupported-assumption receipts.
  for (const assumption of UNSUPPORTED_GLASSES_ASSUMPTIONS) {
    losses.push({
      loss_id: `loss:unsupported-assumption:${assumption}`,
      semantic_id: `assumption:${assumption}`,
      semantic_kind: 'capability_assumption',
      category: 'unsupported',
      reason: `Glasses projection never fabricates ${assumption}; path=${capabilityPath}`,
      mandatory: false,
      details: [`capability_path=${capabilityPath}`],
    });
  }

  // Fail closed: every survival semantic must appear as node or loss.
  for (const item of ordered) {
    if (!SURVIVAL_KINDS.has(item.semantic_kind) && !isMandatory(item)) continue;
    if (!MANDATORY_KINDS.has(item.semantic_kind) && !isMandatory(item)) continue;
    const covered =
      nodes.some(
        n =>
          n.semantic_id === item.item_id &&
          n.disposition !== 'omitted',
      ) || losses.some(l => l.semantic_id === item.item_id);
    if (!covered && isMandatory(item)) {
      hasUnsat = true;
      losses.push({
        loss_id: `loss:unsat-missing:${item.item_id}`,
        semantic_id: item.item_id,
        semantic_kind: item.semantic_kind,
        category: 'unsatisfiable',
        reason: 'Mandatory semantic missing explicit preserve/fallback/loss receipt',
        mandatory: true,
      });
      nodes.push({
        node_id: `glasses:unsat:${item.item_id}`,
        surface: 'unsatisfiable',
        semantic_id: item.item_id,
        semantic_kind: item.semantic_kind,
        disposition: 'unsatisfiable',
        mandatory: true,
        order: nodes.length,
        label: item.label ?? item.item_id,
        text: item.label ?? item.item_id,
        action_id: '',
        focus_index: null,
        fallback_ref: item.fallback_ref ?? '',
        component_id: item.component_id ?? '',
      });
    }
  }

  const exceeded: string[] = [];
  if (actionUsed > budgets.action_count) exceeded.push('action_count');
  if (textUsed > budgets.text_chars) exceeded.push('text_density');
  if (updateUsed > budgets.update_hz) exceeded.push('update_rate');
  if (fovUsed > budgets.field_of_view) exceeded.push('field_of_view');

  let status: GlassesProjectionStatus = 'satisfied';
  if (hasUnsat) status = 'unsatisfiable';
  else if (hasFallback) status = 'fallback';
  else if (hasDegraded || exceeded.length > 0) status = 'degraded';

  const budgetReceipt: GlassesBudgetReceipt = {
    action_count: actionUsed,
    action_limit: budgets.action_count,
    text_chars: textUsed,
    text_limit: budgets.text_chars,
    update_hz: updateUsed,
    update_limit: budgets.update_hz,
    field_of_view_share: fovUsed,
    field_of_view_limit: budgets.field_of_view,
    exceeded,
  };

  const capabilityReceipt: GlassesCapabilityReceipt = {
    capability_path: capabilityPath,
    profile_id: profile.profile_id,
    render_path: profile.render_path,
    input_capability_ids: [...profile.input_capability_ids].sort(),
    output_capability_ids: [...profile.output_capability_ids].sort(),
    unsupported_assumptions: UNSUPPORTED_GLASSES_ASSUMPTIONS,
    dat_webapp_collapsed: false,
  };

  const compilerHandoff = buildCompilerHandoff(
    nodes,
    capabilityPath,
    profile,
    budgetReceipt,
    request.title,
  );

  const documentId = request.document_id ?? '';
  const projectionId =
    request.projection_id ??
    `glasses:${capabilityPath}:${documentId || 'anon'}:${nodes.length}`;

  return {
    interface: UIIR_GLASSES_PROJECTION_INTERFACE,
    schema_version: UIIR_GLASSES_PROJECTION_SCHEMA_VERSION,
    projection_id: projectionId,
    document_id: documentId,
    profile_id: profile.profile_id,
    capability_path: capabilityPath,
    status,
    nodes,
    input_bindings: defaultInputBindings(capabilityPath),
    losses: losses.sort((a, b) => a.loss_id.localeCompare(b.loss_id)),
    budget_receipt: budgetReceipt,
    capability_receipt: capabilityReceipt,
    compiler_handoff: compilerHandoff,
  };
}

function buildCompilerHandoff(
  nodes: readonly GlassesPresentationNode[],
  capabilityPath: GlassesCapabilityPath,
  profile: GlassesCapabilityProfile,
  budget: GlassesBudgetReceipt,
  title?: string,
): GlassesCompilerHandoff {
  const actions: GlassesCompilerHandoff['actions'][number][] = [];
  const regions: Record<string, unknown>[] = [
    {
      id: 'title',
      kind: 'text',
      text: {
        value: title ?? 'UI/UX IR Glasses Projection',
        max_chars: 40,
        max_lines: 1,
      },
    },
  ];
  const focusOrder: string[] = [];
  const fallbacks: Record<string, unknown>[] = [];

  for (const node of [...nodes].sort((a, b) => a.order - b.order)) {
    if (node.disposition === 'omitted') continue;
    if (node.disposition === 'unsatisfiable') {
      fallbacks.push({
        when: ['unsatisfiable_mandatory'],
        render_path: 'notification',
        message: `Cannot present ${node.semantic_id} on glasses`,
        semantic_id: node.semantic_id,
      });
      continue;
    }
    if (node.surface === 'action') {
      const actionId = node.action_id || node.semantic_id;
      actions.push({
        id: actionId,
        method: actionId,
        backend_action_id: node.semantic_id,
        label: truncateText(node.label || actionId, 12),
        focusable: true,
      });
      focusOrder.push(actionId);
      regions.push({
        id: `action:${actionId}`,
        kind: 'action',
        action_id: actionId,
        text: {
          value: node.text,
          max_chars: Math.min(40, budget.text_limit),
          max_lines: 1,
        },
      });
    } else if (node.surface === 'confirmation') {
      regions.push({
        id: `confirm:${node.semantic_id}`,
        kind: 'status',
        text: {
          value: node.text || 'Confirm',
          max_chars: Math.min(80, budget.text_limit),
          max_lines: 2,
        },
        visible_if: 'confirmation_required',
      });
    } else if (node.surface === 'privacy_indicator') {
      regions.push({
        id: `privacy:${node.semantic_id}`,
        kind: 'status',
        text: {
          value: node.text || 'Privacy',
          max_chars: Math.min(60, budget.text_limit),
          max_lines: 1,
        },
        visible_if: 'privacy_active',
      });
    } else if (node.surface === 'mobile_fallback') {
      fallbacks.push({
        when: ['display_unsupported', 'budget_exceeded'],
        render_path: 'mobile-card',
        message: node.text || 'Continue on phone',
        semantic_id: node.semantic_id,
      });
    } else if (node.surface === 'audio_summary') {
      fallbacks.push({
        when: ['display_unsupported'],
        render_path: 'audio-summary',
        message: node.text || 'Audio summary',
        semantic_id: node.semantic_id,
      });
    } else {
      regions.push({
        id: `region:${node.semantic_id}`,
        kind: node.surface === 'status' ? 'status' : 'text',
        text: {
          value: node.text,
          max_chars: Math.min(80, budget.text_limit),
          max_lines: 2,
        },
      });
    }
  }

  if (fallbacks.length === 0) {
    fallbacks.push({
      when: ['dat_native_display_unavailable', 'session_not_ready'],
      render_path: 'mobile-card',
      message: 'View on phone',
    });
  }

  const template = nodes.some(n => n.surface === 'confirmation')
    ? 'confirmation'
    : actions.length <= 1
      ? 'single-card'
      : 'stack';

  const inputKinds =
    capabilityPath === 'dat'
      ? ['dpad', 'gesture', 'voice', 'mobile_action']
      : ['dpad', 'voice', 'mobile_action'];

  return {
    template,
    render_path: profile.render_path,
    max_actions: profile.budgets.action_count,
    max_text_chars: budget.text_limit,
    max_update_hz: budget.update_limit,
    focus_order: focusOrder.slice(0, profile.budgets.action_count),
    actions: actions.slice(0, profile.budgets.action_count),
    regions,
    fallbacks,
    input_kinds: inputKinds,
  };
}

export function normalizeGlassesIntent(
  token: string,
  options: {
    source?: GlassesInputSource;
    capability_path?: GlassesCapabilityPath;
  } = {},
): GlassesIntentNormalizationResult {
  const source = options.source ?? 'neural_band';
  const capabilityPath = options.capability_path ?? 'web_app';
  if (source !== 'neural_band' && source !== 'captouch' && source !== 'dpad') {
    throw new UIIRGlassesAdapterError(
      `Intent normalization for source ${source} is not Arrow/Enter-mapped in this adapter`,
      'UNSUPPORTED_SOURCE',
    );
  }
  const intent = normalizeArrowEnterIntent(token);
  return {
    token,
    intent,
    source,
    capability_path: capabilityPath,
    raw_emg: false,
    continuous_cursor: false,
  };
}

export class UIIRGlassesAdapter {
  readonly interface = UIIR_GLASSES_ADAPTER_INTERFACE;
  readonly capabilityPath: GlassesCapabilityPath;

  constructor(capabilityPath: GlassesCapabilityPath = 'web_app') {
    this.capabilityPath = capabilityPath;
    // Validate path early.
    glassesCapabilityProfile(capabilityPath);
  }

  profile(): GlassesCapabilityProfile {
    return glassesCapabilityProfile(this.capabilityPath);
  }

  inputBindings(): GlassesInputBinding[] {
    return defaultInputBindings(this.capabilityPath);
  }

  project(request: GlassesProjectionRequest): UIIRGlassesProjection {
    return projectUIIRToGlasses({
      ...request,
      capability_path: request.capability_path ?? this.capabilityPath,
    });
  }

  normalizeIntent(
    token: string,
    source: GlassesInputSource = 'neural_band',
  ): GlassesIntentNormalizationResult {
    return normalizeGlassesIntent(token, {
      source,
      capability_path: this.capabilityPath,
    });
  }
}

export default UIIRGlassesAdapter;
