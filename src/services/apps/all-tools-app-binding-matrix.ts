import type { AppManifest, AppRuntimeClass } from './app-manifest.js';
import { textReferencesHostOnlyCapability } from './app-manifest.js';

export interface AllToolsAppBindingRow {
  tool_id: string;
  service_id: string;
  name: string;
  category: string;
  owner_module: string;
  policy_class: string;
  policy_ref?: string;
  confirmation_policy: string;
  receipt_policy: string;
  mcp_tool_name?: string;
  input_schema_available?: boolean;
  input_schema_source?: string;
  result_renderer?: string;
  glasses_fallback?: string;
  glasses_exposure?: string;
  disposition: string;
  normalized_disposition: string;
  app_visible: boolean;
  app_id?: string;
  capability_id?: string;
  capability_source?: string;
  binding_reason?: string;
  [key: string]: unknown;
}

export interface AllToolsAppBindingMatrix {
  matrix_id: string;
  schema: string;
  version?: string;
  generated_from?: readonly string[];
  generated_at?: string;
  tool_count: number;
  disposition_counts: Record<string, number>;
  app_counts?: Record<string, number>;
  service_counts?: Record<string, number>;
  rows: readonly AllToolsAppBindingRow[];
}

// ---------------------------------------------------------------------------
// App manifest normalization
//
// Turns the raw tool -> app bindings in an AllToolsAppBindingMatrix into
// normalized AppManifest records (see ./app-manifest.ts): one manifest per
// distinct app_visible app_id, with a runtime_class inferred from the tool
// categories/policy classes bound to that app, the union of required
// capability ids, and a conventional lazy_import target so a web bundle
// loader can lazily import (or explicitly refuse to import) the app module.
// ---------------------------------------------------------------------------

const RUNTIME_CLASS_RESTRICTIVENESS: Record<AppRuntimeClass, number> = {
  'browser-safe': 0,
  hybrid: 1,
  'remote-capability': 2,
  'host-only': 3,
};

/**
 * Infers the runtime class a single binding row implies for the app it is
 * bound to. A row whose category/policy_class references a host-only
 * capability yields `host-only` when the row itself is not app-visible
 * (i.e., the tool is not meant to be reachable from the browser at all) or
 * `hybrid` when the row is app-visible (the app is bundled, but this
 * particular capability degrades gracefully / requires an optional host
 * bridge). Everything else defaults to `browser-safe`.
 */
export function inferAppRuntimeClassFromBindingRow(row: AllToolsAppBindingRow): AppRuntimeClass {
  const isHostOnlyCapability = textReferencesHostOnlyCapability(row.category, row.policy_class, row.owner_module);
  if (!isHostOnlyCapability) {
    return 'browser-safe';
  }
  return row.app_visible ? 'hybrid' : 'host-only';
}

/**
 * Combines multiple per-tool runtime-class inferences for the same app into
 * a single, most-restrictive runtime class (host-only > remote-capability >
 * hybrid > browser-safe).
 */
export function combineAppRuntimeClasses(classes: readonly AppRuntimeClass[]): AppRuntimeClass {
  if (classes.length === 0) return 'browser-safe';
  return classes.reduce((mostRestrictive, current) => (
    RUNTIME_CLASS_RESTRICTIVENESS[current] > RUNTIME_CLASS_RESTRICTIVENESS[mostRestrictive]
      ? current
      : mostRestrictive
  ));
}

export interface BuildAppManifestFromBindingRowsOptions {
  /** Overrides the conventional `../../js/apps/<app_id>.js` lazy import module path. */
  lazyImportModule?: string;
  /** Overrides the derived name (defaults to a title-cased app_id). */
  name?: string;
  category?: string;
  ownerModule?: string;
}

function titleCaseAppId(appId: string): string {
  return appId
    .split(/[-_]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Builds a single normalized AppManifest from every binding row sharing the
 * same `app_id`.
 */
export function buildAppManifestFromBindingRows(
  appId: string,
  rows: readonly AllToolsAppBindingRow[],
  options: BuildAppManifestFromBindingRowsOptions = {},
): AppManifest {
  const runtimeClass = combineAppRuntimeClasses(rows.map(inferAppRuntimeClassFromBindingRow));
  const requiredCapabilities = Array.from(
    new Set(rows.map(row => row.capability_id).filter((value): value is string => Boolean(value))),
  );
  const category = options.category ?? rows.find(row => row.category)?.category;
  const ownerModule = options.ownerModule ?? rows.find(row => row.owner_module)?.owner_module;
  const name = options.name ?? titleCaseAppId(appId);
  const lazyImportModule = options.lazyImportModule ?? `../../js/apps/${appId}.js`;

  if (runtimeClass === 'host-only') {
    return {
      app_id: appId,
      name,
      category,
      owner_module: ownerModule,
      runtime_class: 'host-only',
      required_capabilities: requiredCapabilities,
      browser: {
        supported: false,
        reason: `App "${appId}" requires a host-only capability and cannot run in the browser sandbox.`,
        unavailable_capability_id: requiredCapabilities[0] ?? 'host.capability.unavailable',
      },
      lazy_import: { kind: 'unavailable' },
    };
  }

  const degraded = runtimeClass === 'hybrid';
  return {
    app_id: appId,
    name,
    category,
    owner_module: ownerModule,
    runtime_class: runtimeClass,
    required_capabilities: requiredCapabilities,
    browser: {
      supported: true,
      degraded,
      reason: degraded
        ? `App "${appId}" bundles fully in the browser; one or more bound capabilities may be optional/host-degraded.`
        : undefined,
    },
    lazy_import: { kind: 'dynamic-import', module: lazyImportModule },
  };
}

/**
 * Groups every `app_visible` row in a binding matrix by `app_id` and builds
 * one normalized AppManifest per app.
 */
export function buildAppManifestsFromBindingMatrix(
  matrix: AllToolsAppBindingMatrix,
  optionsByAppId: Record<string, BuildAppManifestFromBindingRowsOptions> = {},
): AppManifest[] {
  const rowsByAppId = new Map<string, AllToolsAppBindingRow[]>();
  for (const row of matrix.rows) {
    if (!row.app_visible || !row.app_id) continue;
    const bucket = rowsByAppId.get(row.app_id);
    if (bucket) {
      bucket.push(row);
    } else {
      rowsByAppId.set(row.app_id, [row]);
    }
  }

  return Array.from(rowsByAppId.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([appId, rows]) => buildAppManifestFromBindingRows(appId, rows, optionsByAppId[appId]));
}

export interface AppManifestCoverageResult {
  valid: boolean;
  missingAppIds: string[];
  errors: string[];
}

/**
 * Cross-checks a manifest set against a binding matrix: every distinct
 * `app_visible` `app_id` in the matrix must have a corresponding manifest.
 */
export function validateAppManifestCoverage(
  matrix: AllToolsAppBindingMatrix,
  manifests: readonly AppManifest[],
): AppManifestCoverageResult {
  const manifestIds = new Set(manifests.map(manifest => manifest.app_id));
  const boundAppIds = new Set(
    matrix.rows.filter(row => row.app_visible && row.app_id).map(row => row.app_id as string),
  );

  const missingAppIds = Array.from(boundAppIds).filter(appId => !manifestIds.has(appId)).sort();
  const errors = missingAppIds.map(appId => `No app manifest registered for app-visible app_id "${appId}".`);

  return { valid: errors.length === 0, missingAppIds, errors };
}
