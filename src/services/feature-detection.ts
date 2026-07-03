/**
 * Runtime Feature Detection — PORT-204 (Sprint 82)
 *
 * Port of ipfs_datasets_py/logic/common/feature_detection.py.
 *
 * Provides a dedicated, discoverable common module for optional dependency and
 * runtime capability checks. Older sprint helpers remain in place, but this is
 * the canonical service surface for new code.
 */

export interface FeatureStatus {
  name: string;
  available: boolean;
  kind: 'module' | 'runtime' | 'environment';
  detail?: string;
  checkedAt: number;
}

export interface FeatureDetectionReport {
  checked: Record<string, boolean>;
  details: Record<string, FeatureStatus>;
}

const featureCache = new Map<string, FeatureStatus>();

export function isModuleAvailable(moduleName: string): boolean {
  return detectModule(moduleName).available;
}

export function detectModule(moduleName: string): FeatureStatus {
  const key = `module:${moduleName}`;
  const cached = featureCache.get(key);
  if (cached) return cached;

  let available = false;
  let detail: string | undefined;
  try {
    require.resolve(moduleName);
    available = true;
  } catch (err) {
    detail = err instanceof Error ? err.message : String(err);
  }

  const status = makeStatus(moduleName, available, 'module', detail);
  featureCache.set(key, status);
  return status;
}

export function detectRuntimeFeature(name: string): FeatureStatus {
  const key = `runtime:${name}`;
  const cached = featureCache.get(key);
  if (cached) return cached;

  const normalized = name.toLowerCase();
  let available = false;
  let detail: string | undefined;

  switch (normalized) {
    case 'node':
    case 'nodejs':
      available = typeof process !== 'undefined' && Boolean(process.versions?.node);
      detail = available ? process.versions.node : undefined;
      break;
    case 'browser':
      available = typeof window !== 'undefined' && typeof document !== 'undefined';
      break;
    case 'fetch':
      available = typeof fetch === 'function';
      break;
    case 'webassembly':
    case 'wasm':
      available = typeof WebAssembly !== 'undefined';
      break;
    case 'webgpu':
      available = typeof navigator !== 'undefined' && 'gpu' in navigator;
      break;
    case 'worker':
      available = typeof Worker !== 'undefined';
      break;
    default:
      detail = `Unknown runtime feature: ${name}`;
      available = false;
  }

  const status = makeStatus(name, available, 'runtime', detail);
  featureCache.set(key, status);
  return status;
}

export function importOptionalModule<T = unknown>(moduleName: string): T | null {
  if (!isModuleAvailable(moduleName)) return null;
  try {
    return require(moduleName) as T;
  } catch {
    return null;
  }
}

export function clearFeatureDetectionCache(): void {
  featureCache.clear();
}

export function warnOptionalImportsEnabled(): boolean {
  return envFlag('WARN_OPTIONAL_IMPORTS');
}

export function minimalImportsEnabled(): boolean {
  return envFlag('MINIMAL_IMPORTS');
}

export function detectEnvironmentFeatures(): FeatureDetectionReport {
  const detector = new FeatureDetector();
  for (const feature of ['node', 'browser', 'fetch', 'webassembly', 'webgpu', 'worker']) {
    detector.checkRuntime(feature);
  }
  return detector.getDetailedReport();
}

export class FeatureDetector {
  private readonly checked = new Map<string, FeatureStatus>();

  check(feature: string): boolean {
    return this.checkModule(feature);
  }

  checkModule(moduleName: string): boolean {
    const status = detectModule(moduleName);
    this.checked.set(moduleName, status);
    return status.available;
  }

  checkRuntime(feature: string): boolean {
    const status = detectRuntimeFeature(feature);
    this.checked.set(feature, status);
    return status.available;
  }

  checkMany(features: string[], kind: 'module' | 'runtime' = 'module'): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const feature of features) {
      out[feature] = kind === 'runtime' ? this.checkRuntime(feature) : this.checkModule(feature);
    }
    return out;
  }

  getReport(): Record<string, boolean> {
    return Object.fromEntries(Array.from(this.checked, ([name, status]) => [name, status.available]));
  }

  getDetailedReport(): FeatureDetectionReport {
    return {
      checked: this.getReport(),
      details: Object.fromEntries(this.checked),
    };
  }

  reset(): void {
    this.checked.clear();
  }
}

function makeStatus(
  name: string,
  available: boolean,
  kind: FeatureStatus['kind'],
  detail?: string,
): FeatureStatus {
  return { name, available, kind, detail, checkedAt: Date.now() };
}

function envFlag(name: string): boolean {
  return (typeof process !== 'undefined' ? process.env[name] : undefined) === '1';
}
