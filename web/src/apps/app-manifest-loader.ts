/**
 * App Manifest Loader — the browser-side consumer of the normalized app
 * manifest registry (`src/services/apps/app-manifest-registry.ts`).
 *
 * This module is the single place a web bundle should ask "how do I load
 * app X?". It never imports host-only or remote-capability app code: those
 * apps resolve to an `unavailable`/`remote` result instead of a module, so
 * their (non-existent) module code can never enter the browser bundle graph.
 *
 * Every entry in `BROWSER_APP_IMPORTERS` uses a literal `import()` specifier
 * (not a computed/templated string) so bundlers can statically analyze and
 * code-split each app into its own lazily-fetched chunk — the same pattern
 * `web/js/main-simple.js` already uses per app, centralized here and driven
 * by manifest metadata instead of ad hoc per-app branches.
 *
 * See `docs/app-browser-manifest-policy.md` for the full policy.
 */

import {
  getAppManifest,
  listAppManifests,
} from '../../../src/services/apps/app-manifest-registry';
import type { AppManifest } from '../../../src/services/apps/app-manifest';

export type AppLoadStatus = 'loaded' | 'unavailable' | 'remote' | 'not_found';

export interface AppLoadResult {
  status: AppLoadStatus;
  app_id: string;
  manifest?: AppManifest;
  /** The imported module, only present when `status === 'loaded'`. */
  module?: unknown;
  /** Explanation, present for `unavailable`/`remote`/`not_found` results. */
  reason?: string;
  /** Missing/unavailable capability id, present for `unavailable`/`remote` results. */
  capability_id?: string;
  /** Remote descriptor id to resolve through an MCP connector, for `remote` results. */
  descriptor_ref?: string;
}

/**
 * Literal, statically-analyzable dynamic import table: one entry per
 * `browser-safe`/`hybrid` app manifest in the registry. Bundlers split each
 * of these into its own lazy chunk; nothing here is imported eagerly.
 *
 * IMPORTANT: this table must stay in sync with
 * `SWISSKNIFE_WEB_APP_MANIFESTS` in `app-manifest-registry.ts`. Call
 * `assertAppRegistryConsistency()` (e.g. in a test) to verify that.
 */
const BROWSER_APP_IMPORTERS: Record<string, () => Promise<unknown>> = {
  'ai-chat': () => import('../../js/apps/ai-chat.js'),
  'api-keys': () => import('../../js/apps/api-keys.js'),
  calculator: () => import('../../js/apps/calculator.js'),
  calendar: () => import('../../js/apps/calendar.js'),
  cinema: () => import('../../js/apps/cinema.js'),
  clock: () => import('../../js/apps/clock.js'),
  cron: () => import('../../js/apps/cron.js'),
  'device-manager': () => import('../../js/apps/device-manager.js'),
  'file-manager': () => import('../../js/apps/file-manager.js'),
  'friends-list': () => import('../../js/apps/friends-list.js'),
  github: () => import('../../js/apps/github.js'),
  huggingface: () => import('../../js/apps/huggingface.js'),
  'image-viewer': () => import('../../js/apps/image-viewer.js'),
  'ipfs-explorer': () => import('../../js/apps/ipfs-explorer.js'),
  'mcp-control': () => import('../../js/apps/mcp-control.js'),
  'media-player': () => import('../../js/apps/media-player.js'),
  'model-browser': () => import('../../js/apps/model-browser.js'),
  'music-studio-unified': () => import('../../js/apps/music-studio-unified.js'),
  'music-studio': () => import('../../js/apps/music-studio.js'),
  navi: () => import('../../js/apps/navi.js'),
  'neural-network-designer': () => import('../../js/apps/neural-network-designer.js'),
  'neural-photoshop': () => import('../../js/apps/neural-photoshop.js'),
  notes: () => import('../../js/apps/notes.js'),
  'oauth-login': () => import('../../js/apps/oauth-login.js'),
  openrouter: () => import('../../js/apps/openrouter.js'),
  'p2p-chat-unified': () => import('../../js/apps/p2p-chat-unified.js'),
  'p2p-chat': () => import('../../js/apps/p2p-chat.js'),
  'p2p-network': () => import('../../js/apps/p2p-network.js'),
  peertube: () => import('../../js/apps/peertube.js'),
  settings: () => import('../../js/apps/settings.js'),
  'strudel-ai-daw': () => import('../../js/apps/strudel-ai-daw.js'),
  'strudel-grandma': () => import('../../js/apps/strudel-grandma.js'),
  'system-monitor': () => import('../../js/apps/system-monitor.js'),
  'task-manager': () => import('../../js/apps/task-manager.js'),
  terminal: () => import('../../js/apps/terminal.js'),
  todo: () => import('../../js/apps/todo.js'),
  'training-manager': () => import('../../js/apps/training-manager.js'),
  vibecode: () => import('../../js/apps/vibecode.js'),
};

function unavailableResult(manifest: AppManifest): AppLoadResult {
  const isRemote = manifest.lazy_import.kind === 'remote-descriptor';
  return {
    status: isRemote ? 'remote' : 'unavailable',
    app_id: manifest.app_id,
    manifest,
    reason: manifest.browser.reason
      ?? (isRemote
        ? 'This capability is only available through a remote MCP host bridge connection.'
        : 'This app requires a host-only capability and cannot run in the browser.'),
    capability_id: manifest.browser.unavailable_capability_id,
    descriptor_ref: manifest.lazy_import.descriptor_ref,
  };
}

/**
 * Resolves an app by id using its manifest:
 *   - unknown app id                                -> `not_found`
 *   - `browser.supported === false`                  -> `unavailable`
 *   - `lazy_import.kind === 'remote-descriptor'`      -> `remote`
 *   - `lazy_import.kind === 'dynamic-import'`         -> lazily imports the
 *     module via the static `BROWSER_APP_IMPORTERS` table -> `loaded`
 *
 * Host-only/remote-capability apps never trigger an `import()` call: their
 * module code (if it even exists) never enters the browser bundle graph.
 */
export async function loadApp(appId: string): Promise<AppLoadResult> {
  const manifest = getAppManifest(appId);
  if (!manifest) {
    return {
      status: 'not_found',
      app_id: appId,
      reason: `No app manifest registered for "${appId}".`,
    };
  }

  if (manifest.browser.supported !== true || manifest.lazy_import.kind !== 'dynamic-import') {
    return unavailableResult(manifest);
  }

  const importer = BROWSER_APP_IMPORTERS[appId];
  if (!importer) {
    return {
      status: 'not_found',
      app_id: appId,
      manifest,
      reason: `App "${appId}" declares a dynamic-import target but no bundle importer is registered in app-manifest-loader.ts.`,
    };
  }

  const module = await importer();
  return { status: 'loaded', app_id: appId, manifest, module };
}

/** app_ids that can currently be loaded via a bundled dynamic import. */
export function listLoadableAppIds(): string[] {
  return Object.keys(BROWSER_APP_IMPORTERS);
}

/**
 * Verifies the static importer table exactly matches the registry's
 * dynamic-import-kind manifests, in both directions. Throws with a
 * descriptive message on drift; intended to be called from a test/dev
 * assertion, not on every production module load.
 */
export function assertAppRegistryConsistency(): void {
  const dynamicImportAppIds = new Set(
    listAppManifests()
      .filter(manifest => manifest.lazy_import.kind === 'dynamic-import')
      .map(manifest => manifest.app_id),
  );

  for (const appId of dynamicImportAppIds) {
    if (!BROWSER_APP_IMPORTERS[appId]) {
      throw new Error(`Missing bundle importer for browser-safe/hybrid app "${appId}".`);
    }
  }

  for (const appId of Object.keys(BROWSER_APP_IMPORTERS)) {
    const manifest = getAppManifest(appId);
    if (!manifest) {
      throw new Error(`Bundle importer "${appId}" has no matching app manifest.`);
    }
    if (manifest.lazy_import.kind !== 'dynamic-import') {
      throw new Error(
        `Bundle importer "${appId}" is registered but its manifest declares lazy_import.kind = "${manifest.lazy_import.kind}"; host-only/remote-capability apps must not have a bundle importer.`,
      );
    }
  }
}
