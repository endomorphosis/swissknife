/**
 * SwissKnife Web App Manifest Registry
 *
 * Canonical, normalized app manifests for every application surfaced by the
 * SwissKnife web desktop (`web/index.html` -> `web/js/main-simple.js`).
 *
 * Each manifest declares:
 *   - `runtime_class`         — see `app-manifest.ts` for the four classes.
 *   - `browser`                — whether/why the browser build may run it.
 *   - `required_capabilities`  — capability ids the app depends on.
 *   - `lazy_import`            — how a loader should obtain the module
 *                                 (or why it cannot/should not).
 *
 * Legacy/backup app files that were not wired into `web/js/main-simple.js`
 * (broken, `-old`, `-fixed`, `-simple`, `-offline`, `-real`, `-functions`,
 * `-ui`, `-backup` variants) are intentionally left out of this registry and
 * have been archived to `web/legacy-archive/js/apps/` (SWR-026); see
 * `docs/app-browser-manifest-policy.md` and `docs/legacy-web-cleanup.md`
 * before restoring any of them into `web/js/apps/` and this registry.
 */

import type { AppManifest } from './app-manifest.js';
import { validateAppManifests } from './app-manifest.js';

/**
 * app_id values known to be legacy/backup duplicates, deliberately excluded.
 * Their source files live in `web/legacy-archive/js/apps/` (see
 * `docs/legacy-web-cleanup.md`), not `web/js/apps/`.
 */
export const EXCLUDED_LEGACY_APP_IDS: readonly string[] = [
  'neural-network-designer-old',
  'p2p-chat-offline',
  'p2p-chat-real',
  'p2p-network-functions',
  'p2p-network-ui',
  'settings-backup',
  'strudel',
  'strudel-broken',
  'strudel-grandma-broken',
  'strudel-grandma-fixed',
  'strudel-simple',
  'vibecode-broken',
];

function browserSafe(module: string): Pick<AppManifest, 'runtime_class' | 'browser' | 'lazy_import'> {
  return {
    runtime_class: 'browser-safe',
    browser: { supported: true },
    lazy_import: { kind: 'dynamic-import', module },
  };
}

function hybrid(
  module: string,
  reason: string,
): Pick<AppManifest, 'runtime_class' | 'browser' | 'lazy_import'> {
  return {
    runtime_class: 'hybrid',
    browser: { supported: true, degraded: true, reason },
    lazy_import: { kind: 'dynamic-import', module },
  };
}

/**
 * The 38 apps actively wired into `web/js/main-simple.js`, normalized into
 * app manifests. `lazy_import.module` mirrors the exact specifier
 * `main-simple.js` already uses so a manifest-driven loader (see
 * `web/src/apps/app-manifest-loader.ts`) can lazily import the same chunk.
 */
export const SWISSKNIFE_WEB_APP_MANIFESTS: readonly AppManifest[] = [
  {
    app_id: 'ai-chat',
    name: 'AI Chat',
    category: 'ai',
    owner_module: 'service-apps',
    required_capabilities: ['ai.provider.fetch'],
    ...browserSafe('../../js/apps/ai-chat.js'),
  },
  {
    app_id: 'api-keys',
    name: 'API Keys',
    category: 'settings',
    owner_module: 'service-apps',
    required_capabilities: ['storage.browser.secure'],
    ...browserSafe('../../js/apps/api-keys.js'),
  },
  {
    app_id: 'calculator',
    name: 'Calculator',
    category: 'utilities',
    owner_module: 'service-apps',
    required_capabilities: [],
    ...browserSafe('../../js/apps/calculator.js'),
  },
  {
    app_id: 'calendar',
    name: 'Calendar',
    category: 'productivity',
    owner_module: 'service-apps',
    required_capabilities: ['storage.browser.local'],
    ...browserSafe('../../js/apps/calendar.js'),
  },
  {
    app_id: 'cinema',
    name: 'Cinema',
    category: 'media',
    owner_module: 'service-apps',
    required_capabilities: ['network.fetch'],
    ...browserSafe('../../js/apps/cinema.js'),
  },
  {
    app_id: 'clock',
    name: 'Clock',
    category: 'utilities',
    owner_module: 'service-apps',
    required_capabilities: [],
    ...browserSafe('../../js/apps/clock.js'),
  },
  {
    app_id: 'cron',
    name: 'Cron Scheduler',
    category: 'productivity',
    owner_module: 'service-apps',
    required_capabilities: ['storage.browser.local'],
    ...browserSafe('../../js/apps/cron.js'),
  },
  {
    app_id: 'device-manager',
    name: 'Device Manager',
    category: 'system',
    owner_module: 'service-apps',
    required_capabilities: ['hardware.profile.optional'],
    ...hybrid(
      '../../js/apps/device-manager.js',
      'Uses browser device APIs (WebUSB/WebBluetooth) when available; full hardware inventory requires an optional host bridge capability.',
    ),
  },
  {
    app_id: 'file-manager',
    name: 'File Manager',
    category: 'files',
    owner_module: 'service-apps',
    required_capabilities: ['storage.browser.fs', 'ipfs.client'],
    ...hybrid(
      '../../js/apps/file-manager.js',
      'Browses browser storage and IPFS-backed content by default; local host filesystem paths require an optional host bridge capability.',
    ),
  },
  {
    app_id: 'friends-list',
    name: 'Friends List',
    category: 'social',
    owner_module: 'service-apps',
    required_capabilities: ['network.fetch'],
    ...browserSafe('../../js/apps/friends-list.js'),
  },
  {
    app_id: 'github',
    name: 'GitHub',
    category: 'developer',
    owner_module: 'service-apps',
    required_capabilities: ['network.fetch', 'oauth.github'],
    ...browserSafe('../../js/apps/github.js'),
  },
  {
    app_id: 'huggingface',
    name: 'Hugging Face',
    category: 'ai',
    owner_module: 'service-apps',
    required_capabilities: ['network.fetch'],
    ...browserSafe('../../js/apps/huggingface.js'),
  },
  {
    app_id: 'image-viewer',
    name: 'Image Viewer',
    category: 'media',
    owner_module: 'service-apps',
    required_capabilities: ['storage.browser.filepicker'],
    ...browserSafe('../../js/apps/image-viewer.js'),
  },
  {
    app_id: 'ipfs-explorer',
    name: 'IPFS Explorer',
    category: 'files',
    owner_module: 'service-apps',
    required_capabilities: ['ipfs.client'],
    ...browserSafe('../../js/apps/ipfs-explorer.js'),
  },
  {
    app_id: 'mcp-control',
    name: 'MCP Control',
    category: 'system',
    owner_module: 'service-apps',
    required_capabilities: ['mcp.client'],
    ...browserSafe('../../js/apps/mcp-control.js'),
  },
  {
    app_id: 'media-player',
    name: 'Media Player',
    category: 'media',
    owner_module: 'service-apps',
    required_capabilities: ['storage.browser.filepicker'],
    ...browserSafe('../../js/apps/media-player.js'),
  },
  {
    app_id: 'model-browser',
    name: 'Model Browser',
    category: 'ai',
    owner_module: 'service-apps',
    required_capabilities: ['network.fetch'],
    ...browserSafe('../../js/apps/model-browser.js'),
  },
  {
    app_id: 'music-studio-unified',
    name: 'Music Studio',
    category: 'media',
    owner_module: 'service-apps',
    required_capabilities: ['audio.webaudio'],
    ...browserSafe('../../js/apps/music-studio-unified.js'),
  },
  {
    app_id: 'music-studio',
    name: 'Music Studio (legacy)',
    category: 'media',
    owner_module: 'service-apps',
    required_capabilities: ['audio.webaudio'],
    ...browserSafe('../../js/apps/music-studio.js'),
  },
  {
    app_id: 'navi',
    name: 'NAVI Assistant',
    category: 'ai',
    owner_module: 'service-apps',
    required_capabilities: ['ai.provider.fetch'],
    ...browserSafe('../../js/apps/navi.js'),
  },
  {
    app_id: 'neural-network-designer',
    name: 'Neural Network Designer',
    category: 'ai',
    owner_module: 'service-apps',
    required_capabilities: [],
    ...browserSafe('../../js/apps/neural-network-designer.js'),
  },
  {
    app_id: 'neural-photoshop',
    name: 'Neural Photoshop',
    category: 'media',
    owner_module: 'service-apps',
    required_capabilities: ['gpu.webgl'],
    ...browserSafe('../../js/apps/neural-photoshop.js'),
  },
  {
    app_id: 'notes',
    name: 'Notes',
    category: 'productivity',
    owner_module: 'service-apps',
    required_capabilities: ['storage.browser.local'],
    ...browserSafe('../../js/apps/notes.js'),
  },
  {
    app_id: 'oauth-login',
    name: 'OAuth Login',
    category: 'system',
    owner_module: 'service-apps',
    required_capabilities: ['oauth.provider'],
    ...browserSafe('../../js/apps/oauth-login.js'),
  },
  {
    app_id: 'openrouter',
    name: 'OpenRouter',
    category: 'ai',
    owner_module: 'service-apps',
    required_capabilities: ['network.fetch'],
    ...browserSafe('../../js/apps/openrouter.js'),
  },
  {
    app_id: 'p2p-chat-unified',
    name: 'P2P Chat',
    category: 'social',
    owner_module: 'service-apps',
    required_capabilities: ['p2p.libp2p'],
    ...browserSafe('../../js/apps/p2p-chat-unified.js'),
  },
  {
    app_id: 'p2p-chat',
    name: 'P2P Chat (legacy)',
    category: 'social',
    owner_module: 'service-apps',
    required_capabilities: ['p2p.libp2p'],
    ...browserSafe('../../js/apps/p2p-chat.js'),
  },
  {
    app_id: 'p2p-network',
    name: 'P2P Network',
    category: 'system',
    owner_module: 'service-apps',
    required_capabilities: ['p2p.libp2p'],
    ...browserSafe('../../js/apps/p2p-network.js'),
  },
  {
    app_id: 'peertube',
    name: 'PeerTube',
    category: 'media',
    owner_module: 'service-apps',
    required_capabilities: ['network.fetch'],
    ...browserSafe('../../js/apps/peertube.js'),
  },
  {
    app_id: 'settings',
    name: 'Settings',
    category: 'settings',
    owner_module: 'service-apps',
    required_capabilities: ['storage.browser.local'],
    ...browserSafe('../../js/apps/settings.js'),
  },
  {
    app_id: 'strudel-ai-daw',
    name: 'Strudel AI DAW',
    category: 'media',
    owner_module: 'service-apps',
    required_capabilities: ['audio.webaudio'],
    ...browserSafe('../../js/apps/strudel-ai-daw.js'),
  },
  {
    app_id: 'strudel-grandma',
    name: 'Strudel (Grandma)',
    category: 'media',
    owner_module: 'service-apps',
    required_capabilities: ['audio.webaudio'],
    ...browserSafe('../../js/apps/strudel-grandma.js'),
  },
  {
    app_id: 'system-monitor',
    name: 'System Monitor',
    category: 'system',
    owner_module: 'service-apps',
    required_capabilities: ['host.system.metrics.optional'],
    ...hybrid(
      '../../js/apps/system-monitor.js',
      'Shows browser-available performance metrics by default; full host system metrics require an optional host bridge capability.',
    ),
  },
  {
    app_id: 'task-manager',
    name: 'Task Manager',
    category: 'productivity',
    owner_module: 'service-apps',
    required_capabilities: ['storage.browser.local'],
    ...browserSafe('../../js/apps/task-manager.js'),
  },
  {
    app_id: 'terminal',
    name: 'Terminal',
    category: 'system',
    owner_module: 'service-apps',
    required_capabilities: ['host.process.exec.optional'],
    ...hybrid(
      '../../js/apps/terminal.js',
      'The built-in simulated shell runs fully in-browser; SSH and real process commands require an optional host bridge capability.',
    ),
  },
  {
    app_id: 'todo',
    name: 'Todo',
    category: 'productivity',
    owner_module: 'service-apps',
    required_capabilities: ['storage.browser.local'],
    ...browserSafe('../../js/apps/todo.js'),
  },
  {
    app_id: 'training-manager',
    name: 'Training Manager',
    category: 'ai',
    owner_module: 'service-apps',
    required_capabilities: ['host.compute.training.optional'],
    ...hybrid(
      '../../js/apps/training-manager.js',
      'UI and lightweight WebGPU/WebNN training run in-browser; large-scale model training requires an optional host compute capability.',
    ),
  },
  {
    app_id: 'vibecode',
    name: 'VibeCode',
    category: 'developer',
    owner_module: 'service-apps',
    required_capabilities: ['host.code.exec.optional'],
    ...hybrid(
      '../../js/apps/vibecode.js',
      'The editor and sandboxed in-browser execution run fully client-side; full multi-language code execution requires an optional host execution bridge.',
    ),
  },
  {
    app_id: 'datasets-browser',
    name: 'Datasets Browser',
    category: 'generated',
    owner_module: 'service-apps',
    required_capabilities: ['mcp.ipfs_datasets.descriptor'],
    ...browserSafe('../../js/apps/generated-service-surface.js'),
  },
  {
    app_id: 'accelerate-panel',
    name: 'Accelerate Panel',
    category: 'generated',
    owner_module: 'service-apps',
    required_capabilities: ['mcp.ipfs_accelerate.descriptor'],
    ...browserSafe('../../js/apps/generated-service-surface.js'),
  },
  {
    app_id: 'idl-explorer',
    name: 'IDL Explorer',
    category: 'generated',
    owner_module: 'service-apps',
    required_capabilities: ['mcp.idl.descriptor'],
    ...browserSafe('../../js/apps/generated-service-surface.js'),
  },
  {
    app_id: 'glasses-preview',
    name: 'Glasses Preview',
    category: 'glasses',
    owner_module: 'service-apps',
    required_capabilities: ['meta_glasses.simulator'],
    ...browserSafe('../../js/apps/generated-service-surface.js'),
  },
  {
    app_id: 'orb-auto-ui',
    name: 'ORB Auto-UI',
    category: 'generated',
    owner_module: 'service-apps',
    required_capabilities: ['orb.auto_ui'],
    ...browserSafe('../../js/apps/generated-service-surface.js'),
  },
  {
    app_id: 'mcp-plus-plus',
    name: 'MCP++ Explorer',
    category: 'system',
    owner_module: 'service-apps',
    required_capabilities: ['mcp_plus_plus.catalog'],
    ...browserSafe('../../js/apps/generated-service-surface.js'),
  },
  {
    app_id: 'agent-supervisor',
    name: 'Agent Supervisor',
    category: 'system',
    owner_module: 'service-apps',
    required_capabilities: ['ipfs_accelerate.supervisor', 'mcp_plus_plus.receipts'],
    ...browserSafe('../../js/apps/agent-supervisor.js'),
  },
];

/**
 * Illustrative `host-only` app: the SwissKnife host CLI console. It uses
 * `child_process`/local filesystem access (see `src/module-ownership.json`
 * `commands`/`entrypoints`, both `host-only`) and must never be statically
 * or dynamically imported by a browser bundle.
 */
export const HOST_ONLY_APP_MANIFESTS: readonly AppManifest[] = [
  {
    app_id: 'swissknife-cli-console',
    name: 'SwissKnife CLI Console',
    category: 'system',
    owner_module: 'commands',
    runtime_class: 'host-only',
    required_capabilities: ['host.process.exec', 'host.commands.registry'],
    browser: {
      supported: false,
      reason: 'Executes host CLI commands via child_process and local filesystem access; not available in the browser sandbox.',
      unavailable_capability_id: 'host.process.exec',
    },
    lazy_import: { kind: 'unavailable' },
  },
];

/**
 * Illustrative `remote-capability` app: the same host CLI surface, exposed
 * to the browser only through a remote MCP host bridge connector. No host
 * module code enters the browser bundle; the capability becomes reachable
 * once a remote bridge connection is established and resolved by descriptor.
 */
export const REMOTE_CAPABILITY_APP_MANIFESTS: readonly AppManifest[] = [
  {
    app_id: 'remote-cli-bridge',
    name: 'Remote CLI Bridge',
    category: 'system',
    owner_module: 'service-apps',
    runtime_class: 'remote-capability',
    required_capabilities: ['host.process.exec', 'mcp.remote_bridge'],
    browser: {
      supported: true,
      degraded: true,
      reason: 'Available only when a remote MCP host bridge connection is established; no host code is bundled into the browser build.',
      unavailable_capability_id: 'host.process.exec',
    },
    lazy_import: {
      kind: 'remote-descriptor',
      descriptor_ref: 'org.hallucinate.swissknife.remote-host-cli-bridge@0.1.0',
    },
  },
];

/** All registered app manifests: browser-safe/hybrid + host-only + remote-capability. */
export const APP_MANIFEST_REGISTRY: readonly AppManifest[] = [
  ...SWISSKNIFE_WEB_APP_MANIFESTS,
  ...HOST_ONLY_APP_MANIFESTS,
  ...REMOTE_CAPABILITY_APP_MANIFESTS,
];

const APP_MANIFEST_BY_ID: ReadonlyMap<string, AppManifest> = new Map(
  APP_MANIFEST_REGISTRY.map(manifest => [manifest.app_id, manifest]),
);

/** Registry-wide integrity check, thrown eagerly so a broken manifest fails fast. */
const REGISTRY_VALIDATION = validateAppManifests(APP_MANIFEST_REGISTRY);
if (!REGISTRY_VALIDATION.valid) {
  throw new Error(
    `Invalid SwissKnife app manifest registry:\n${REGISTRY_VALIDATION.errors.join('\n')}`,
  );
}

export function listAppManifests(): readonly AppManifest[] {
  return APP_MANIFEST_REGISTRY;
}

export function getAppManifest(appId: string): AppManifest | undefined {
  return APP_MANIFEST_BY_ID.get(appId);
}

export function listBrowserBundleableAppManifests(): readonly AppManifest[] {
  return APP_MANIFEST_REGISTRY.filter(
    manifest => manifest.runtime_class !== 'host-only'
      && manifest.browser.supported === true
      && manifest.lazy_import.kind === 'dynamic-import',
  );
}

export function listUnavailableAppManifests(): readonly AppManifest[] {
  return APP_MANIFEST_REGISTRY.filter(
    manifest => manifest.browser.supported !== true || manifest.lazy_import.kind !== 'dynamic-import',
  );
}

export function listAppManifestsByRuntimeClass(runtimeClass: AppManifest['runtime_class']): readonly AppManifest[] {
  return APP_MANIFEST_REGISTRY.filter(manifest => manifest.runtime_class === runtimeClass);
}
