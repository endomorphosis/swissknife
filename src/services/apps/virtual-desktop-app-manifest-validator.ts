import type {
  VirtualDesktopAppManifest,
  VirtualDesktopAppManifestEntry,
  VirtualDesktopRequiredCoverage,
} from './virtual-desktop-app-manifest.js';
import {
  GENERATED_SERVICE_APP_IDS,
  VIRTUAL_DESKTOP_APP_MANIFEST,
  VIRTUAL_DESKTOP_APP_MANIFEST_ID,
  VISIBLE_DESKTOP_APP_IDS,
} from './virtual-desktop-app-manifest.js';

export interface VirtualDesktopAppManifestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const APP_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateVirtualDesktopAppManifest(
  manifest: VirtualDesktopAppManifest = VIRTUAL_DESKTOP_APP_MANIFEST,
): VirtualDesktopAppManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (manifest.manifest_id !== VIRTUAL_DESKTOP_APP_MANIFEST_ID) {
    errors.push(`manifest_id must be ${VIRTUAL_DESKTOP_APP_MANIFEST_ID}`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.version)) {
    errors.push('version must be a YYYY-MM-DD date string');
  }

  if (!Array.isArray(manifest.generated_from) || manifest.generated_from.length === 0) {
    errors.push('generated_from must contain at least one evidence path');
  }

  if (!Array.isArray(manifest.apps) || manifest.apps.length === 0) {
    errors.push('apps must contain at least one app entry');
    return { valid: false, errors, warnings };
  }

  const appIds = new Set<string>();
  const aliasToId = new Map<string, string>();
  for (const [index, app] of manifest.apps.entries()) {
    validateAppEntry(app, index, errors, warnings);

    if (appIds.has(app.id)) {
      errors.push(`duplicate app id: ${app.id}`);
    }
    appIds.add(app.id);

    for (const alias of app.aliases) {
      const existing = aliasToId.get(alias);
      if (existing && existing !== app.id) {
        errors.push(`alias ${alias} maps to both ${existing} and ${app.id}`);
      }
      aliasToId.set(alias, app.id);
    }
  }

  for (const alias of aliasToId.keys()) {
    if (appIds.has(alias)) {
      errors.push(`alias ${alias} collides with a canonical app id`);
    }
  }

  for (const visibleId of VISIBLE_DESKTOP_APP_IDS) {
    if (!appIds.has(visibleId)) {
      errors.push(`manifest missing visible desktop app: ${visibleId}`);
    }
  }

  for (const generatedId of GENERATED_SERVICE_APP_IDS) {
    if (!appIds.has(generatedId)) {
      errors.push(`manifest missing generated/service app: ${generatedId}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateAppEntry(
  app: VirtualDesktopAppManifestEntry,
  index: number,
  errors: string[],
  warnings: string[],
): void {
  const label = app?.id || `apps[${index}]`;
  if (!app || typeof app !== 'object') {
    errors.push(`apps[${index}] must be an object`);
    return;
  }

  if (!APP_ID_PATTERN.test(app.id)) {
    errors.push(`${label}: id must be kebab-case`);
  }

  if (app.canonical_id !== app.id) {
    errors.push(`${label}: canonical_id must match id`);
  }

  for (const alias of app.aliases) {
    if (!APP_ID_PATTERN.test(alias)) {
      errors.push(`${label}: alias ${alias} must be kebab-case`);
    }
  }

  if (!app.title || typeof app.title !== 'string') {
    errors.push(`${label}: title is required`);
  }

  if (!app.category) errors.push(`${label}: category is required`);
  if (!app.owner_module) errors.push(`${label}: owner_module is required`);
  if (!app.launch_kind) errors.push(`${label}: launch_kind is required`);
  if (!app.launch_owner?.module) errors.push(`${label}: launch_owner.module is required`);

  requireNonEmptyArray(app.capabilities, `${label}: capabilities`, errors);
  requireNonEmptyArray(app.service_families, `${label}: service_families`, errors);
  requireNonEmptyArray(app.source_sets, `${label}: source_sets`, errors);
  requireNonEmptyArray(app.required_test_coverage, `${label}: required_test_coverage`, errors);

  const remoteServices = app.service_families.filter(service =>
    service === 'ipfs_kit_py' || service === 'ipfs_datasets_py' || service === 'ipfs_accelerate_py',
  );
  if (remoteServices.length > 0) {
    requireNonEmptyArray(app.backend_capabilities, `${label}: backend_capabilities`, errors);
  } else if (!app.local_only_rationale) {
    errors.push(`${label}: local_only_rationale is required when no Python MCP backend service is used`);
  }

  for (const service of remoteServices) {
    if (!app.backend_capabilities.some(capability => capability.service === service)) {
      errors.push(`${label}: backend_capabilities must include ${service}`);
    }
  }

  for (const capability of app.backend_capabilities ?? []) {
    if (!capability.id || !capability.capability || !capability.service) {
      errors.push(`${label}: every backend capability requires id, service, and capability`);
    }
    if (!capability.mcp_transport || !capability.mcp_plus_plus_transport) {
      errors.push(`${label}: backend capability ${capability.id} must declare MCP and MCP++ transport eligibility`);
    }
    if (!capability.policy_class || !capability.receipt_strategy) {
      errors.push(`${label}: backend capability ${capability.id} must declare policy_class and receipt_strategy`);
    }
  }

  if (!app.required_test_coverage.includes('manifest')) {
    errors.push(`${label}: required_test_coverage must include manifest`);
  }

  if (!app.orb_idl_state?.state || !app.orb_idl_state?.descriptor_owner) {
    errors.push(`${label}: orb_idl_state.state and orb_idl_state.descriptor_owner are required`);
  }

  if (!app.glasses_strategy || !app.glasses_strategy.kind || !app.glasses_strategy.handoff) {
    errors.push(`${label}: glasses_strategy.kind and glasses_strategy.handoff are required`);
  }

  if (!app.ux_scenarios?.success || !app.ux_scenarios?.fallback || !app.ux_scenarios?.error) {
    errors.push(`${label}: ux_scenarios.success, ux_scenarios.fallback, and ux_scenarios.error are required`);
  }

  if (app.launch_kind === 'idl-generated' && !app.source_sets.includes('idl-generated')) {
    warnings.push(`${label}: idl-generated app should include the idl-generated source set`);
  }

  if (app.glasses_strategy?.kind === 'manual') {
    requireCoverage(app, 'glasses', errors);
  }
}

function requireCoverage(
  app: VirtualDesktopAppManifestEntry,
  coverage: VirtualDesktopRequiredCoverage,
  errors: string[],
): void {
  if (!app.required_test_coverage.includes(coverage)) {
    errors.push(`${app.id}: required_test_coverage must include ${coverage}`);
  }
}

function requireNonEmptyArray(value: readonly unknown[] | undefined, label: string, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${label} must be a non-empty array`);
  }
}
