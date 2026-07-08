/**
 * SwissKnife Desktop Apps - Meta Glasses Widget Descriptors
 * 
 * Defines MetaGlassesWidgetDescriptor for every virtual desktop application,
 * enabling all apps to be viewed and interacted with on Meta Ray-Ban glasses.
 * 
 * Each app gets a constrained AR display layout optimized for the 600x600 viewport
 * with voice/gesture/dpad input and mobile fallback paths.
 * 
 * The GlassesAppControlPlane dispatches between apps, handling focus traversal,
 * action activation, and app switching via the ORB control surface.
 */

import type {
  MetaGlassesDisplayProfile,
  MetaGlassesWidgetDescriptor,
  MetaGlassesDisplayRegion,
  MetaGlassesActionBinding,
  MetaGlassesDisplayTemplate,
} from './meta-glasses-display-profile.js';
import {
  META_GLASSES_DISPLAY_PROFILE,
  META_GLASSES_DISPLAY_PROFILE_VERSION,
  META_GLASSES_DISPLAY_VIEWPORT,
  META_GLASSES_REQUIRED_METHODS,
  validateMetaGlassesDisplayProfile,
} from './meta-glasses-display-profile.js';
import type {
  VirtualDesktopAppManifest,
  VirtualDesktopAppManifestEntry,
  VirtualDesktopGlassesStrategy,
} from '../apps/virtual-desktop-app-manifest.js';
import {
  VIRTUAL_DESKTOP_APP_MANIFEST,
} from '../apps/virtual-desktop-app-manifest.js';

// ---------------------------------------------------------------------------
// Shared display factory
// ---------------------------------------------------------------------------

function makeDisplayProfile(
  template: MetaGlassesDisplayTemplate,
  regions: MetaGlassesDisplayRegion[],
  actions: MetaGlassesActionBinding[],
  opts: { maxActions?: number; maxText?: number; updateHz?: number; ttlMs?: number } = {},
): MetaGlassesDisplayProfile {
  const textBlockCount = regions.filter(region => Boolean(region.text)).length;

  return {
    profile: META_GLASSES_DISPLAY_PROFILE,
    profile_version: META_GLASSES_DISPLAY_PROFILE_VERSION,
    target: {
      display_class: 'meta-ray-ban-display',
      viewport: { width: 600, height: 600 },
      input: ['voice', 'gesture', 'dpad', 'mobile_action'],
      render_path: 'dat-native',
    },
    layout: {
      template,
      regions,
      focus_order: actions.filter(a => a.focusable).map(a => a.id),
    },
    constraints: {
      max_text_blocks: Math.max(opts.maxText ?? 4, textBlockCount),
      max_actions: Math.max(opts.maxActions ?? 3, actions.length),
      requires_high_contrast: true,
      requires_focus_order: true,
      max_update_hz: opts.updateHz ?? 3,
      ttl_ms: opts.ttlMs ?? 30000,
    },
    fallback: [
      { when: ['dat_native_display_unavailable'], render_path: 'mobile-card', message: 'View on phone' },
      { when: ['session_not_ready'], render_path: 'notification', message: 'App loading...' },
    ],
    actions,
  };
}

function textRegion(id: string, bounds: { x: number; y: number; width: number; height: number }, value: string, maxLines = 1, maxChars = 60): MetaGlassesDisplayRegion {
  return { id, kind: 'text', bounds, text: { value, max_lines: maxLines, max_chars: maxChars, overflow: 'truncate' } };
}

function statusRegion(id: string, bounds: { x: number; y: number; width: number; height: number }, source: string, value: string): MetaGlassesDisplayRegion {
  return { id, kind: 'status', bounds, text: { source, value, max_lines: 1, max_chars: 30, overflow: 'truncate' } };
}

function actionRegion(id: string, bounds: { x: number; y: number; width: number; height: number }, actionId: string): MetaGlassesDisplayRegion {
  return { id, kind: 'action', bounds, action_id: actionId };
}

function progressRegion(id: string, bounds: { x: number; y: number; width: number; height: number }, source: string, value: string): MetaGlassesDisplayRegion {
  return { id, kind: 'progress', bounds, text: { source, value, max_lines: 1, max_chars: 40, overflow: 'truncate' } };
}

// ---------------------------------------------------------------------------
// Individual App Widget Descriptors
// ---------------------------------------------------------------------------

/** Terminal - single-card with command output */
export const terminalGlassesDisplay = makeDisplayProfile('single-card', [
  textRegion('title', { x: 20, y: 20, width: 560, height: 40 }, 'SwissKnife Terminal'),
  textRegion('output', { x: 20, y: 80, width: 560, height: 300 }, '$ _', 8, 200),
  textRegion('prompt', { x: 20, y: 400, width: 560, height: 40 }, '> Ready for input'),
  actionRegion('action-run', { x: 20, y: 460, width: 270, height: 70 }, 'voice-command'),
  actionRegion('action-clear', { x: 310, y: 460, width: 270, height: 70 }, 'clear-screen'),
], [
  { id: 'voice-command', method: 'execute_command', backend_action_id: 'terminal_exec', label: 'Voice Command', focusable: true },
  { id: 'clear-screen', method: 'clear', backend_action_id: 'terminal_clear', label: 'Clear', focusable: true },
], { maxText: 3, updateHz: 5 });

/** AI Chat - stack with conversation */
export const aiChatGlassesDisplay = makeDisplayProfile('stack', [
  textRegion('title', { x: 20, y: 20, width: 560, height: 40 }, 'AI Chat'),
  { id: 'messages', kind: 'list', bounds: { x: 20, y: 80, width: 560, height: 300 }, text: { source: 'state.messages', value: 'No messages yet', max_lines: 8, max_chars: 300, overflow: 'wrap' } },
  actionRegion('action-speak', { x: 20, y: 400, width: 180, height: 70 }, 'voice-message'),
  actionRegion('action-read', { x: 210, y: 400, width: 180, height: 70 }, 'read-aloud'),
  actionRegion('action-clear', { x: 400, y: 400, width: 180, height: 70 }, 'clear-chat'),
], [
  { id: 'voice-message', method: 'send_message', backend_action_id: 'chat_send', label: 'Speak', focusable: true },
  { id: 'read-aloud', method: 'read_response', backend_action_id: 'chat_read', label: 'Read', focusable: true },
  { id: 'clear-chat', method: 'clear_history', backend_action_id: 'chat_clear', label: 'Clear', focusable: true },
], { maxText: 2, updateHz: 3 });

/** File Manager - list with directory contents */
export const fileManagerGlassesDisplay = makeDisplayProfile('list', [
  textRegion('title', { x: 20, y: 20, width: 560, height: 40 }, 'File Manager'),
  statusRegion('path', { x: 20, y: 70, width: 560, height: 40 }, 'state.current_path', '~/'),
  { id: 'files', kind: 'list', bounds: { x: 20, y: 120, width: 560, height: 280 }, text: { source: 'state.file_list', value: 'Loading...', max_lines: 8, max_chars: 200, overflow: 'truncate' } },
  actionRegion('action-open', { x: 20, y: 420, width: 180, height: 70 }, 'open-file'),
  actionRegion('action-up', { x: 210, y: 420, width: 180, height: 70 }, 'go-up'),
  actionRegion('action-pin', { x: 400, y: 420, width: 180, height: 70 }, 'pin-to-ipfs'),
], [
  { id: 'open-file', method: 'open', backend_action_id: 'fm_open', label: 'Open', focusable: true },
  { id: 'go-up', method: 'navigate_up', backend_action_id: 'fm_up', label: 'Up', focusable: true },
  { id: 'pin-to-ipfs', method: 'ipfs_pin', backend_action_id: 'fm_pin', label: 'Pin to IPFS', focusable: true },
]);

/** Settings - status card with key values */
export const settingsGlassesDisplay = makeDisplayProfile('status', [
  textRegion('title', { x: 20, y: 20, width: 560, height: 40 }, 'Settings'),
  statusRegion('backend', { x: 20, y: 80, width: 270, height: 80 }, 'state.backend_status', 'Backend: --'),
  statusRegion('glasses', { x: 310, y: 80, width: 270, height: 80 }, 'state.glasses_connected', 'Glasses: --'),
  statusRegion('theme', { x: 20, y: 180, width: 270, height: 80 }, 'state.theme', 'Theme: Dark'),
  statusRegion('port', { x: 310, y: 180, width: 270, height: 80 }, 'state.port', 'Port: 8080'),
  actionRegion('action-toggle', { x: 20, y: 300, width: 270, height: 70 }, 'toggle-setting'),
  actionRegion('action-save', { x: 310, y: 300, width: 270, height: 70 }, 'save-settings'),
], [
  { id: 'toggle-setting', method: 'toggle', backend_action_id: 'settings_toggle', label: 'Toggle', focusable: true },
  { id: 'save-settings', method: 'save', backend_action_id: 'settings_save', label: 'Save', focusable: true },
]);

/** Code Editor - single-card with code context */
export const codeEditorGlassesDisplay = makeDisplayProfile('single-card', [
  textRegion('title', { x: 20, y: 20, width: 560, height: 40 }, 'VibeCode Editor'),
  statusRegion('file', { x: 20, y: 70, width: 560, height: 40 }, 'state.current_file', 'No file open'),
  textRegion('code', { x: 20, y: 120, width: 560, height: 260 }, '// Code preview', 8, 300),
  progressRegion('diagnostics', { x: 20, y: 400, width: 560, height: 40 }, 'state.diagnostics', '0 errors, 0 warnings'),
  actionRegion('action-save', { x: 20, y: 460, width: 180, height: 70 }, 'save-file'),
  actionRegion('action-run', { x: 210, y: 460, width: 180, height: 70 }, 'run-code'),
  actionRegion('action-ai', { x: 400, y: 460, width: 180, height: 70 }, 'ai-assist'),
], [
  { id: 'save-file', method: 'save', backend_action_id: 'editor_save', label: 'Save', focusable: true },
  { id: 'run-code', method: 'execute', backend_action_id: 'editor_run', label: 'Run', focusable: true },
  { id: 'ai-assist', method: 'ai_complete', backend_action_id: 'editor_ai', label: 'AI', focusable: true },
], { maxText: 4, updateHz: 2 });

/** Task Manager - task-progress with system metrics */
export const taskManagerGlassesDisplay = makeDisplayProfile('task-progress', [
  textRegion('title', { x: 20, y: 20, width: 560, height: 40 }, 'Task Manager'),
  statusRegion('cpu', { x: 20, y: 80, width: 180, height: 80 }, 'state.cpu', 'CPU: --'),
  statusRegion('mem', { x: 210, y: 80, width: 180, height: 80 }, 'state.memory', 'Mem: --'),
  statusRegion('tasks', { x: 400, y: 80, width: 180, height: 80 }, 'state.task_count', 'Tasks: 0'),
  { id: 'processes', kind: 'list', bounds: { x: 20, y: 180, width: 560, height: 200 }, text: { source: 'state.top_processes', value: 'No running tasks', max_lines: 5, max_chars: 150, overflow: 'truncate' } },
  actionRegion('action-kill', { x: 20, y: 400, width: 270, height: 70 }, 'kill-task'),
  actionRegion('action-refresh', { x: 310, y: 400, width: 270, height: 70 }, 'refresh-tasks'),
], [
  { id: 'kill-task', method: 'kill_process', backend_action_id: 'task_kill', label: 'Kill', focusable: true },
  { id: 'refresh-tasks', method: 'refresh', backend_action_id: 'task_refresh', label: 'Refresh', focusable: true },
], { updateHz: 5 });

/** Model Browser - list with model info */
export const modelBrowserGlassesDisplay = makeDisplayProfile('list', [
  textRegion('title', { x: 20, y: 20, width: 560, height: 40 }, 'Model Browser'),
  statusRegion('loaded', { x: 20, y: 70, width: 270, height: 50 }, 'state.loaded_count', 'Loaded: 0'),
  statusRegion('available', { x: 310, y: 70, width: 270, height: 50 }, 'state.available_count', 'Available: 0'),
  { id: 'models', kind: 'list', bounds: { x: 20, y: 130, width: 560, height: 260 }, text: { source: 'state.model_list', value: 'Loading models...', max_lines: 7, max_chars: 200, overflow: 'truncate' } },
  actionRegion('action-load', { x: 20, y: 410, width: 180, height: 70 }, 'load-model'),
  actionRegion('action-search', { x: 210, y: 410, width: 180, height: 70 }, 'search-models'),
  actionRegion('action-info', { x: 400, y: 410, width: 180, height: 70 }, 'model-info'),
], [
  { id: 'load-model', method: 'load', backend_action_id: 'model_load', label: 'Load', focusable: true },
  { id: 'search-models', method: 'search', backend_action_id: 'model_search', label: 'Search', focusable: true },
  { id: 'model-info', method: 'info', backend_action_id: 'model_info', label: 'Info', focusable: true },
]);

/** IDL Interface Explorer - list with interface details */
export const idlExplorerGlassesDisplay = makeDisplayProfile('list', [
  textRegion('title', { x: 20, y: 20, width: 560, height: 40 }, 'IDL Explorer'),
  statusRegion('interfaces', { x: 20, y: 70, width: 270, height: 50 }, 'state.interface_count', 'Interfaces: 3'),
  statusRegion('methods', { x: 310, y: 70, width: 270, height: 50 }, 'state.total_methods', 'Methods: 30'),
  { id: 'descriptors', kind: 'list', bounds: { x: 20, y: 130, width: 560, height: 260 }, text: { source: 'state.descriptor_list', value: 'ipfs-kit, ipfs-datasets, ipfs-accelerate', max_lines: 6, max_chars: 180, overflow: 'truncate' } },
  actionRegion('action-discover', { x: 20, y: 410, width: 270, height: 70 }, 'discover-interfaces'),
  actionRegion('action-invoke', { x: 310, y: 410, width: 270, height: 70 }, 'invoke-method'),
], [
  { id: 'discover-interfaces', method: 'discover', backend_action_id: 'idl_discover', label: 'Discover', focusable: true },
  { id: 'invoke-method', method: 'invoke', backend_action_id: 'idl_invoke', label: 'Invoke', focusable: true },
]);

/** Glasses Preview (meta - self-referential) */
export const glassesPreviewGlassesDisplay = makeDisplayProfile('status', [
  textRegion('title', { x: 20, y: 20, width: 560, height: 40 }, 'Glasses Config'),
  statusRegion('connected', { x: 20, y: 80, width: 270, height: 80 }, 'state.connected', 'Connected: --'),
  statusRegion('render-path', { x: 310, y: 80, width: 270, height: 80 }, 'state.render_path', 'Path: DAT-native'),
  statusRegion('fps', { x: 20, y: 180, width: 270, height: 80 }, 'state.fps', 'FPS: --'),
  statusRegion('battery', { x: 310, y: 180, width: 270, height: 80 }, 'state.battery', 'Battery: --'),
  actionRegion('action-calibrate', { x: 20, y: 300, width: 270, height: 70 }, 'calibrate'),
  actionRegion('action-toggle', { x: 310, y: 300, width: 270, height: 70 }, 'toggle-display'),
], [
  { id: 'calibrate', method: 'calibrate_display', backend_action_id: 'glasses_calibrate', label: 'Calibrate', focusable: true },
  { id: 'toggle-display', method: 'toggle_display', backend_action_id: 'glasses_toggle', label: 'Toggle', focusable: true },
]);

/** ORB Auto-UI Launcher - service discovery and auto-generation */
export const orbAutoUIGlassesDisplay = makeDisplayProfile('list', [
  textRegion('title', { x: 20, y: 20, width: 560, height: 40 }, 'ORB Auto-UI'),
  statusRegion('services', { x: 20, y: 70, width: 270, height: 50 }, 'state.service_count', 'Services: 3'),
  statusRegion('methods', { x: 310, y: 70, width: 270, height: 50 }, 'state.total_methods', 'Methods: 24'),
  { id: 'service-list', kind: 'list', bounds: { x: 20, y: 130, width: 560, height: 260 }, text: { source: 'state.services', value: '📦 IPFS Kit | 📊 Datasets | ⚡ Accelerate', max_lines: 6, max_chars: 180, overflow: 'truncate' } },
  actionRegion('action-discover', { x: 20, y: 410, width: 180, height: 70 }, 'discover-services'),
  actionRegion('action-launch', { x: 210, y: 410, width: 180, height: 70 }, 'launch-auto-ui'),
  actionRegion('action-refresh', { x: 400, y: 410, width: 180, height: 70 }, 'refresh-registry'),
], [
  { id: 'discover-services', method: 'discover', backend_action_id: 'orb_discover', label: 'Discover', focusable: true },
  { id: 'launch-auto-ui', method: 'launch', backend_action_id: 'orb_launch', label: 'Launch', focusable: true },
  { id: 'refresh-registry', method: 'refresh', backend_action_id: 'orb_refresh', label: 'Refresh', focusable: true },
]);

// ---------------------------------------------------------------------------
// App Registry - maps desktop app IDs to glasses displays
// ---------------------------------------------------------------------------

export interface GlassesAppEntry {
  id: string;
  name: string;
  icon: string;
  display: MetaGlassesDisplayProfile;
}

export const GLASSES_APP_REGISTRY: GlassesAppEntry[] = [
  { id: 'terminal', name: 'Terminal', icon: '💻', display: terminalGlassesDisplay },
  { id: 'ai-chat', name: 'AI Chat', icon: '🤖', display: aiChatGlassesDisplay },
  { id: 'file-manager', name: 'File Manager', icon: '📁', display: fileManagerGlassesDisplay },
  { id: 'settings', name: 'Settings', icon: '⚙️', display: settingsGlassesDisplay },
  { id: 'code-editor', name: 'Code Editor', icon: '📝', display: codeEditorGlassesDisplay },
  { id: 'task-manager', name: 'Task Manager', icon: '📊', display: taskManagerGlassesDisplay },
  { id: 'model-browser', name: 'Model Browser', icon: '🧠', display: modelBrowserGlassesDisplay },
  { id: 'idl-explorer', name: 'IDL Explorer', icon: '🔗', display: idlExplorerGlassesDisplay },
  { id: 'glasses-preview', name: 'Glasses Config', icon: '👓', display: glassesPreviewGlassesDisplay },
  { id: 'orb-auto-ui', name: 'ORB Auto-UI', icon: '🪄', display: orbAutoUIGlassesDisplay },
  // IPFS apps (ipfs-explorer, datasets-browser, accelerate-panel) are
  // auto-registered from IDL descriptors via idl-to-glasses-compiler.ts
];

export type GlassesManifestDisplaySource = VirtualDesktopGlassesStrategy['kind'];

export interface GlassesManifestControlPlaneValidation {
  conformant: boolean;
  errors: string[];
  warnings: string[];
}

export interface GlassesManifestControlPlaneCoverageEntry {
  app_id: string;
  app_title: string;
  title: string;
  displayable: boolean;
  display_source: GlassesManifestDisplaySource;
  handoff: VirtualDesktopGlassesStrategy['handoff'];
  fallback_targets: string[];
  display_profile?: MetaGlassesDisplayProfile;
  validation: GlassesManifestControlPlaneValidation;
}

export interface GlassesManifestControlPlaneCoverage {
  control_plane_id: string;
  manifest_id: string;
  version: string;
  app_count: number;
  displayable_count: number;
  fallback_only_count: number;
  entries: GlassesManifestControlPlaneCoverageEntry[];
}

export interface GlassesManifestControlPlaneCoverageResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function createGlassesManifestControlPlaneCoverage(
  manifest: VirtualDesktopAppManifest = VIRTUAL_DESKTOP_APP_MANIFEST,
): GlassesManifestControlPlaneCoverage {
  const entries = manifest.apps.map(createGlassesManifestControlPlaneCoverageEntry);

  return {
    control_plane_id: 'swissknife.glasses-app-control-plane',
    manifest_id: manifest.manifest_id,
    version: manifest.version,
    app_count: manifest.apps.length,
    displayable_count: entries.filter(entry => entry.displayable).length,
    fallback_only_count: entries.filter(entry => !entry.displayable).length,
    entries,
  };
}

export function getGlassesManifestCoverageEntry(
  appId: string,
  coverage: GlassesManifestControlPlaneCoverage,
): GlassesManifestControlPlaneCoverageEntry | undefined {
  return coverage.entries.find(entry => entry.app_id === appId);
}

export function validateGlassesManifestControlPlaneCoverage(
  coverage: GlassesManifestControlPlaneCoverage,
): GlassesManifestControlPlaneCoverageResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  if (coverage.app_count !== coverage.entries.length) {
    errors.push(`coverage app_count ${coverage.app_count} does not match entries ${coverage.entries.length}`);
  }

  for (const entry of coverage.entries) {
    if (seen.has(entry.app_id)) {
      errors.push(`${entry.app_id}: duplicate coverage entry`);
    }
    seen.add(entry.app_id);

    if (entry.displayable) {
      if (!entry.display_profile) {
        errors.push(`${entry.app_id}: displayable entry is missing a display_profile`);
      }
      if (!entry.validation.conformant) {
        errors.push(`${entry.app_id}: display profile is not conformant: ${entry.validation.errors.join('; ')}`);
      }
    } else if (entry.fallback_targets.length === 0) {
      errors.push(`${entry.app_id}: fallback-only entry is missing fallback targets`);
    }
  }

  const displayableCount = coverage.entries.filter(entry => entry.displayable).length;
  const fallbackOnlyCount = coverage.entries.length - displayableCount;
  if (coverage.displayable_count !== displayableCount) {
    errors.push(`displayable_count ${coverage.displayable_count} does not match entries ${displayableCount}`);
  }
  if (coverage.fallback_only_count !== fallbackOnlyCount) {
    errors.push(`fallback_only_count ${coverage.fallback_only_count} does not match entries ${fallbackOnlyCount}`);
  }
  if (displayableCount === 0) {
    errors.push('coverage has no displayable Meta glasses entries');
  }
  if (fallbackOnlyCount === 0) {
    warnings.push('coverage has no fallback-only entries');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function createGlassesManifestControlPlaneCoverageEntry(
  app: VirtualDesktopAppManifestEntry,
): GlassesManifestControlPlaneCoverageEntry {
  const fallbackTargets = fallbackTargetsForStrategy(app.glasses_strategy);
  const displayProfile = displayProfileForApp(app, fallbackTargets);
  const validation = displayProfile
    ? validateDisplayProfileForCoverage(displayProfile)
    : {
      conformant: true,
      errors: [],
      warnings: [],
    };

  return {
    app_id: app.id,
    app_title: app.title,
    title: app.title,
    displayable: Boolean(displayProfile),
    display_source: app.glasses_strategy.kind,
    handoff: app.glasses_strategy.handoff,
    fallback_targets: fallbackTargets,
    display_profile: displayProfile,
    validation,
  };
}

function displayProfileForApp(
  app: VirtualDesktopAppManifestEntry,
  fallbackTargets: string[],
): MetaGlassesDisplayProfile | undefined {
  if (app.glasses_strategy.kind === 'manual') {
    const registryId = app.glasses_strategy.profile_id ?? app.id;
    const profile = GLASSES_APP_REGISTRY.find(entry => entry.id === registryId)?.display;
    return profile ? normalizeDisplayProfile(profile, fallbackTargets) : undefined;
  }

  if (app.glasses_strategy.kind === 'idl-generated') {
    return createIdlGeneratedDisplayProfile(app, fallbackTargets);
  }

  if (app.glasses_strategy.kind === 'display-webapp') {
    return createDisplayWebAppProfile(app, fallbackTargets);
  }

  return undefined;
}

function validateDisplayProfileForCoverage(
  profile: MetaGlassesDisplayProfile,
): GlassesManifestControlPlaneValidation {
  const methodNames = new Set<string>(META_GLASSES_REQUIRED_METHODS);
  for (const action of profile.actions ?? []) {
    if (action.method) {
      methodNames.add(action.method);
    }
  }

  const result = validateMetaGlassesDisplayProfile(profile, methodNames);
  return {
    conformant: result.conformant,
    errors: result.errors.map(issue => `${issue.code} ${issue.path}: ${issue.message}`),
    warnings: result.warnings.map(issue => `${issue.code} ${issue.path}: ${issue.message}`),
  };
}

function normalizeDisplayProfile(
  profile: MetaGlassesDisplayProfile,
  fallbackTargets: string[],
): MetaGlassesDisplayProfile {
  return {
    ...profile,
    target: {
      ...profile.target,
      viewport: { ...META_GLASSES_DISPLAY_VIEWPORT },
    },
    layout: {
      ...profile.layout,
      focus_order: profile.layout.focus_order ?? profile.actions?.filter(action => action.focusable !== false).map(action => action.id) ?? [],
    },
    fallback: normalizeFallback((profile as unknown as { fallback?: unknown }).fallback, fallbackTargets),
  };
}

function createIdlGeneratedDisplayProfile(
  app: VirtualDesktopAppManifestEntry,
  fallbackTargets: string[],
): MetaGlassesDisplayProfile {
  return createGeneratedDisplayProfile(app, 'list', 'IDL Generated', fallbackTargets, [
    {
      id: 'title',
      kind: 'text',
      bounds: { x: 20, y: 20, width: 560, height: 44 },
      text: { value: app.title, max_lines: 1, max_chars: 60, overflow: 'truncate' },
    },
    {
      id: 'service-family',
      kind: 'status',
      bounds: { x: 20, y: 82, width: 560, height: 58 },
      text: {
        value: app.service_families.join(' / '),
        max_lines: 2,
        max_chars: 96,
        overflow: 'truncate',
      },
    },
    {
      id: 'capabilities',
      kind: 'list',
      bounds: { x: 20, y: 160, width: 560, height: 230 },
      text: {
        value: app.capabilities.join(', '),
        max_lines: 5,
        max_chars: 180,
        overflow: 'wrap',
      },
    },
    {
      id: 'refresh-action',
      kind: 'action',
      bounds: { x: 20, y: 420, width: 270, height: 70 },
      action_id: 'render-widget',
    },
    {
      id: 'activate-action',
      kind: 'action',
      bounds: { x: 310, y: 420, width: 270, height: 70 },
      action_id: 'activate',
    },
  ]);
}

function createDisplayWebAppProfile(
  app: VirtualDesktopAppManifestEntry,
  fallbackTargets: string[],
): MetaGlassesDisplayProfile {
  return createGeneratedDisplayProfile(app, 'single-card', 'Display Web App', fallbackTargets, [
    {
      id: 'title',
      kind: 'text',
      bounds: { x: 20, y: 20, width: 560, height: 44 },
      text: { value: app.title, max_lines: 1, max_chars: 60, overflow: 'truncate' },
    },
    {
      id: 'summary',
      kind: 'text',
      bounds: { x: 20, y: 92, width: 560, height: 220 },
      text: {
        value: `${app.title} is routed through the display-webapp fallback surface.`,
        max_lines: 4,
        max_chars: 180,
        overflow: 'wrap',
      },
    },
    {
      id: 'open-action',
      kind: 'action',
      bounds: { x: 20, y: 360, width: 560, height: 80 },
      action_id: 'activate',
    },
  ]);
}

function createGeneratedDisplayProfile(
  app: VirtualDesktopAppManifestEntry,
  template: MetaGlassesDisplayTemplate,
  label: string,
  fallbackTargets: string[],
  regions: MetaGlassesDisplayRegion[],
): MetaGlassesDisplayProfile {
  const actions: MetaGlassesActionBinding[] = [
    {
      id: 'render-widget',
      method: 'render_widget',
      backend_action_id: `${app.id}.render_widget`,
      label: 'Refresh',
      focusable: true,
    },
    {
      id: 'activate',
      method: 'activate',
      backend_action_id: `${app.id}.activate`,
      label: label,
      focusable: true,
    },
  ];

  return {
    profile: META_GLASSES_DISPLAY_PROFILE,
    profile_version: META_GLASSES_DISPLAY_PROFILE_VERSION,
    target: {
      display_class: 'meta-ray-ban-display',
      viewport: { ...META_GLASSES_DISPLAY_VIEWPORT },
      input: ['voice', 'gesture', 'dpad', 'mobile_action'],
      render_path: 'dat-native',
    },
    layout: {
      template,
      regions,
      focus_order: actions.map(action => action.id),
    },
    constraints: {
      max_text_blocks: Math.max(3, regions.filter(region => Boolean(region.text)).length),
      max_actions: actions.length,
      requires_high_contrast: true,
      requires_focus_order: true,
      max_update_hz: 3,
      ttl_ms: 30000,
    },
    fallback: normalizeFallback(undefined, fallbackTargets),
    actions,
  };
}

function normalizeFallback(
  fallback: unknown,
  fallbackTargets: string[],
): MetaGlassesDisplayProfile['fallback'] {
  const fallbackRecord = Array.isArray(fallback)
    ? fallback.find(item => hasNativeDisplayUnavailableFallback(item)) ?? fallback.find(isRecord)
    : isRecord(fallback)
      ? fallback
      : undefined;
  const renderPath = safeFallbackRenderPath(
    typeof fallbackRecord?.render_path === 'string'
      ? fallbackRecord.render_path
      : fallbackTargets[0],
  );

  return {
    when: ['dat_native_display_unavailable'],
    render_path: renderPath,
    message: typeof fallbackRecord?.message === 'string' && fallbackRecord.message.trim().length > 0
      ? fallbackRecord.message
      : 'Use phone or desktop fallback.',
  };
}

function hasNativeDisplayUnavailableFallback(value: unknown): boolean {
  return isRecord(value)
    && Array.isArray(value.when)
    && value.when.includes('dat_native_display_unavailable');
}

function fallbackTargetsForStrategy(strategy: VirtualDesktopGlassesStrategy): string[] {
  const targets = new Set<string>();
  if (strategy.handoff !== 'native-display') {
    targets.add(strategy.handoff);
  }
  for (const target of strategy.fallback ?? []) {
    targets.add(target);
  }
  if (strategy.kind === 'not-displayable') {
    targets.add('not-displayable');
  }
  if (targets.size === 0) {
    targets.add('mobile-card');
    targets.add('notification');
  }
  return Array.from(targets);
}

function safeFallbackRenderPath(target?: string): MetaGlassesDisplayProfile['fallback']['render_path'] {
  if (
    target === 'display-webapp'
    || target === 'simulator'
    || target === 'mobile-card'
    || target === 'notification'
    || target === 'audio-summary'
  ) {
    return target;
  }
  return 'mobile-card';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Glasses App Control Plane
// ---------------------------------------------------------------------------

export interface GlassesControlPlaneState {
  activeAppId: string | null;
  focusIndex: number;
  appStack: string[];
  lastUpdate: number;
}

/**
 * GlassesAppControlPlane manages the display lifecycle for all desktop apps
 * on the Meta Glasses display. It handles:
 * - App switching (voice: "open terminal", gesture: swipe to app)
 * - Focus traversal within an app (dpad up/down, gesture flick)
 * - Action activation (dpad select, voice confirm, gesture tap)
 * - App stack navigation (back gesture returns to previous app)
 * - State synchronization between desktop and glasses display
 */
export class GlassesAppControlPlane {
  private state: GlassesControlPlaneState = {
    activeAppId: null,
    focusIndex: 0,
    appStack: [],
    lastUpdate: 0,
  };

  private registry: Map<string, GlassesAppEntry> = new Map();

  constructor() {
    for (const entry of GLASSES_APP_REGISTRY) {
      this.registry.set(entry.id, entry);
    }
  }

  /** Get all available apps for glasses display */
  listApps(): GlassesAppEntry[] {
    return Array.from(this.registry.values());
  }

  /** Switch to an app by ID */
  openApp(appId: string): MetaGlassesDisplayProfile | null {
    const entry = this.registry.get(appId);
    if (!entry) return null;

    if (this.state.activeAppId) {
      this.state.appStack.push(this.state.activeAppId);
    }
    this.state.activeAppId = appId;
    this.state.focusIndex = 0;
    this.state.lastUpdate = Date.now();
    return entry.display;
  }

  /** Go back to previous app */
  goBack(): MetaGlassesDisplayProfile | null {
    const prevId = this.state.appStack.pop();
    if (!prevId) return null;
    this.state.activeAppId = prevId;
    this.state.focusIndex = 0;
    const entry = this.registry.get(prevId);
    return entry?.display ?? null;
  }

  /** Move focus to next action in the current app */
  focusNext(): { actionId: string; index: number } | null {
    const entry = this.state.activeAppId ? this.registry.get(this.state.activeAppId) : null;
    if (!entry) return null;
    const focusOrder = entry.display.layout.focus_order || [];
    if (focusOrder.length === 0) return null;
    this.state.focusIndex = (this.state.focusIndex + 1) % focusOrder.length;
    return { actionId: focusOrder[this.state.focusIndex], index: this.state.focusIndex };
  }

  /** Move focus to previous action */
  focusPrevious(): { actionId: string; index: number } | null {
    const entry = this.state.activeAppId ? this.registry.get(this.state.activeAppId) : null;
    if (!entry) return null;
    const focusOrder = entry.display.layout.focus_order || [];
    if (focusOrder.length === 0) return null;
    this.state.focusIndex = (this.state.focusIndex - 1 + focusOrder.length) % focusOrder.length;
    return { actionId: focusOrder[this.state.focusIndex], index: this.state.focusIndex };
  }

  /** Activate the currently focused action */
  activate(): MetaGlassesActionBinding | null {
    const entry = this.state.activeAppId ? this.registry.get(this.state.activeAppId) : null;
    if (!entry) return null;
    const focusOrder = entry.display.layout.focus_order || [];
    const focusedId = focusOrder[this.state.focusIndex];
    if (!focusedId) return null;
    const action = entry.display.actions.find(a => a.id === focusedId);
    return action ?? null;
  }

  /** Get current display state for rendering */
  getCurrentDisplay(): { app: GlassesAppEntry; focusIndex: number; focusedAction: string | null } | null {
    if (!this.state.activeAppId) return null;
    const entry = this.registry.get(this.state.activeAppId);
    if (!entry) return null;
    const focusOrder = entry.display.layout.focus_order || [];
    return {
      app: entry,
      focusIndex: this.state.focusIndex,
      focusedAction: focusOrder[this.state.focusIndex] || null,
    };
  }

  /** Register a custom app (e.g., from IDL discovery) */
  registerApp(entry: GlassesAppEntry): void {
    this.registry.set(entry.id, entry);
  }

  /** Get the current state (for persistence/sync) */
  getState(): GlassesControlPlaneState {
    return { ...this.state };
  }
}

export default GlassesAppControlPlane;
