/**
 * App Manifest — the normalized, JSON-serialisable description of a
 * SwissKnife desktop/web application: which runtime it needs, whether the
 * browser web bundle may statically or lazily include its module code,
 * which capabilities it depends on, and how a host (web bundle, Electron
 * shell, MCP host bridge, ...) should load it.
 *
 * This module is intentionally pure data + validation: it performs no
 * `import()` calls and has no side effects, so it can be statically imported
 * from browser bundles, host tooling, and audit scripts alike. It is
 * classified `universal` in `src/module-ownership.json` (service-apps).
 *
 * Runtime classes:
 *   - `browser-safe`       — app UI and logic run entirely in the browser;
 *                             its module is a normal lazy-loaded web chunk.
 *   - `hybrid`              — app UI runs in the browser, but one or more
 *                             optional features depend on a host/remote
 *                             capability that may be unavailable; the app is
 *                             still bundled and browser.supported is true.
 *   - `host-only`           — the app can only run on a host runtime (Node,
 *                             Electron main process, CLI). It must never be
 *                             statically or dynamically imported by a
 *                             browser bundle. `browser.supported` is false
 *                             and `lazy_import.kind` is `unavailable`.
 *   - `remote-capability`   — the app's functionality lives on a host that
 *                             the browser reaches only through a remote MCP
 *                             connector/descriptor; no host module code
 *                             enters the browser bundle, but the capability
 *                             can become available once a remote bridge is
 *                             connected. `lazy_import.kind` is
 *                             `remote-descriptor`.
 */

export const APP_RUNTIME_CLASSES = [
  'browser-safe',
  'hybrid',
  'host-only',
  'remote-capability',
] as const;

export type AppRuntimeClass = typeof APP_RUNTIME_CLASSES[number];

export const APP_LAZY_IMPORT_KINDS = [
  'dynamic-import',
  'remote-descriptor',
  'unavailable',
] as const;

export type AppLazyImportKind = typeof APP_LAZY_IMPORT_KINDS[number];

/**
 * Tool/app category, policy_class, or owner_module keywords that indicate a
 * host-only capability (filesystem, subprocess, native, or hardware access)
 * that cannot run in a browser sandbox. Shared by the all-tools app-binding
 * matrix and policy classifier so both infer runtime class consistently.
 */
export const APP_HOST_ONLY_CAPABILITY_KEYWORDS: readonly string[] = [
  'filesystem',
  'file_system',
  'process',
  'subprocess',
  'shell',
  'terminal_exec',
  'native',
  'hardware',
  'device',
  'node_sdk',
  'local_model_files',
];

/**
 * True when any of the given free-text fields (category, policy_class,
 * owner_module, ...) reference a host-only capability keyword.
 */
export function textReferencesHostOnlyCapability(...values: Array<string | undefined>): boolean {
  const haystack = values
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return APP_HOST_ONLY_CAPABILITY_KEYWORDS.some(keyword => haystack.includes(keyword));
}

/**
 * Whether/why the browser build may render and run this app.
 */
export interface AppBrowserSupport {
  /** True when the browser build can render/run this app (fully or in a degraded mode). */
  supported: boolean;
  /** Human-readable explanation of the support/unavailability status. */
  reason?: string;
  /**
   * Required when `supported` is false, or when the app is `remote-capability`:
   * the capability id that is missing/unavailable in the current context
   * (matches `required_capabilities` entries and app-binding capability ids).
   */
  unavailable_capability_id?: string;
  /** True when the app runs in the browser but with reduced functionality. */
  degraded?: boolean;
}

/**
 * Declares how a consumer (web bundle loader, host shell, ...) should
 * obtain the app's module code, if at all.
 */
export interface AppLazyImportTarget {
  kind: AppLazyImportKind;
  /**
   * Relative module specifier for `dynamic-import` targets, e.g.
   * `../../js/apps/terminal.js`. Must never be set for `host-only` or
   * `remote-capability` apps (no module code may enter the browser bundle).
   */
  module?: string;
  /** Named export to use from the imported module, when applicable. */
  export_name?: string;
  /**
   * Stable descriptor/registry id for `remote-descriptor` targets, used to
   * resolve the capability through a remote MCP connector instead of a
   * bundled module.
   */
  descriptor_ref?: string;
}

export interface AppManifest {
  app_id: string;
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  version?: string;
  /** Owning module per `src/module-ownership.json`, e.g. `service-apps`. */
  owner_module?: string;
  runtime_class: AppRuntimeClass;
  browser: AppBrowserSupport;
  /** Capability ids this app depends on (see all-tools app binding matrix `capability_id`). */
  required_capabilities: readonly string[];
  lazy_import: AppLazyImportTarget;
  [key: string]: unknown;
}

export interface AppManifestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validates a single app manifest against the runtime-class/browser-support/
 * lazy-import consistency rules described above. Pure and side-effect free.
 */
export function validateAppManifest(manifest: AppManifest): AppManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isNonEmptyString(manifest?.app_id)) {
    errors.push('app_id is required.');
  }
  if (!isNonEmptyString(manifest?.name)) {
    errors.push('name is required.');
  }

  if (!manifest || !APP_RUNTIME_CLASSES.includes(manifest.runtime_class)) {
    errors.push(`runtime_class must be one of ${APP_RUNTIME_CLASSES.join(', ')}.`);
  }

  const lazyImportKind = manifest?.lazy_import?.kind;
  if (!lazyImportKind || !APP_LAZY_IMPORT_KINDS.includes(lazyImportKind)) {
    errors.push(`lazy_import.kind must be one of ${APP_LAZY_IMPORT_KINDS.join(', ')}.`);
  }

  const requiredCapabilities = manifest?.required_capabilities ?? [];
  const seenCapabilities = new Set<string>();
  for (const capability of requiredCapabilities) {
    if (!isNonEmptyString(capability)) {
      errors.push('required_capabilities entries must be non-empty strings.');
      continue;
    }
    if (seenCapabilities.has(capability)) {
      warnings.push(`required_capabilities contains duplicate entry "${capability}".`);
    }
    seenCapabilities.add(capability);
  }

  const runtimeClass = manifest?.runtime_class;
  const browser = manifest?.browser;
  const lazyImport = manifest?.lazy_import;

  if (runtimeClass === 'host-only' || runtimeClass === 'remote-capability') {
    if (runtimeClass === 'host-only' && browser?.supported !== false) {
      errors.push('host-only apps must set browser.supported = false.');
    }
    if (!isNonEmptyString(browser?.unavailable_capability_id)) {
      errors.push(`${runtimeClass} apps must declare browser.unavailable_capability_id.`);
    }
    if (lazyImport?.module) {
      errors.push(`${runtimeClass} apps must not declare a lazy_import.module (no module code may enter the browser bundle).`);
    }
    if (runtimeClass === 'host-only' && lazyImport?.kind !== 'unavailable') {
      errors.push('host-only apps must use lazy_import.kind = "unavailable".');
    }
    if (runtimeClass === 'remote-capability') {
      if (lazyImport?.kind !== 'remote-descriptor') {
        errors.push('remote-capability apps must use lazy_import.kind = "remote-descriptor".');
      }
      if (!isNonEmptyString(lazyImport?.descriptor_ref)) {
        errors.push('remote-capability apps must declare lazy_import.descriptor_ref.');
      }
    }
  } else if (runtimeClass === 'browser-safe' || runtimeClass === 'hybrid') {
    if (browser?.supported !== true) {
      errors.push(`${runtimeClass} apps must set browser.supported = true.`);
    }
    if (lazyImport?.kind !== 'dynamic-import') {
      errors.push(`${runtimeClass} apps must declare lazy_import.kind = "dynamic-import".`);
    }
    if (!isNonEmptyString(lazyImport?.module)) {
      errors.push(`${runtimeClass} apps must declare a non-empty lazy_import.module target.`);
    } else if (/^[a-z][a-z0-9+.-]*:/i.test(lazyImport.module) || lazyImport.module.startsWith('/')) {
      errors.push('lazy_import.module must be a relative module specifier, not an absolute path or URL.');
    }
    if (runtimeClass === 'hybrid' && requiredCapabilities.length === 0) {
      warnings.push('hybrid apps typically declare at least one required capability describing the host-optional/degraded feature.');
    }
    if (runtimeClass === 'hybrid' && browser?.degraded !== true && !isNonEmptyString(browser?.reason)) {
      warnings.push('hybrid apps should explain their degraded/optional-capability behavior in browser.reason.');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validates a set of manifests together, additionally checking that
 * `app_id` values are unique.
 */
export function validateAppManifests(manifests: readonly AppManifest[]): AppManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();

  for (const manifest of manifests) {
    const result = validateAppManifest(manifest);
    const prefix = manifest?.app_id ? `[${manifest.app_id}] ` : '[unknown] ';
    errors.push(...result.errors.map(error => `${prefix}${error}`));
    warnings.push(...result.warnings.map(warning => `${prefix}${warning}`));

    if (isNonEmptyString(manifest?.app_id)) {
      if (seenIds.has(manifest.app_id)) {
        errors.push(`Duplicate app_id "${manifest.app_id}".`);
      }
      seenIds.add(manifest.app_id);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * True when the manifest's module code is safe and intended to be included
 * in a browser web bundle as a lazily-loaded chunk.
 */
export function isAppBundleable(manifest: AppManifest): boolean {
  return manifest.runtime_class !== 'host-only'
    && manifest.browser?.supported === true
    && manifest.lazy_import?.kind === 'dynamic-import'
    && isNonEmptyString(manifest.lazy_import.module);
}

/**
 * True when the app cannot be loaded directly in the browser and must be
 * represented as an unavailable capability (`host-only`) or resolved through
 * a remote descriptor (`remote-capability`) instead of a bundled module.
 */
export function isAppUnavailableInBrowser(manifest: AppManifest): boolean {
  return manifest.browser?.supported !== true || manifest.lazy_import?.kind !== 'dynamic-import';
}

/**
 * Filters a manifest list down to the entries whose module code is safe to
 * ship in a browser web bundle.
 */
export function selectBrowserBundleableApps(manifests: readonly AppManifest[]): AppManifest[] {
  return manifests.filter(isAppBundleable);
}

/**
 * Filters a manifest list down to the entries that must be represented as
 * unavailable or remote capabilities rather than bundled module code.
 */
export function selectUnavailableApps(manifests: readonly AppManifest[]): AppManifest[] {
  return manifests.filter(isAppUnavailableInBrowser);
}
