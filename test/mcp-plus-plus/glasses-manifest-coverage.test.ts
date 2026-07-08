<<<<<<< HEAD
import {
  META_GLASSES_DISPLAY_VIEWPORT,
  META_GLASSES_MAX_SAFE_UPDATE_HZ,
} from '../../src/services/glasses/meta-glasses-display-profile';
import {
  createGlassesManifestControlPlaneCoverage,
  getGlassesManifestCoverageEntry,
  validateGlassesManifestControlPlaneCoverage,
} from '../../src/services/glasses/glasses-app-control-plane';
import { VIRTUAL_DESKTOP_APP_MANIFEST } from '../../src/services/apps/virtual-desktop-app-manifest';

describe('glasses manifest control-plane coverage', () => {
  const coverage = createGlassesManifestControlPlaneCoverage(VIRTUAL_DESKTOP_APP_MANIFEST);

  it('creates one glasses coverage entry for every manifest app', () => {
    const manifestIds = VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => app.id).sort();
    const coverageIds = coverage.entries.map(entry => entry.app_id).sort();

    expect(coverage.app_count).toBe(VIRTUAL_DESKTOP_APP_MANIFEST.apps.length);
    expect(coverageIds).toEqual(manifestIds);
    expect(coverage.displayable_count).toBeGreaterThan(0);
    expect(coverage.fallback_only_count).toBeGreaterThan(0);
  });

  it('validates all displayable profiles and fallback-only strategies', () => {
    const result = validateGlassesManifestControlPlaneCoverage(coverage);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('uses manual, IDL-generated, audio summary, and mobile-card strategies from the manifest', () => {
    expect(entry('terminal')?.display_source).toBe('manual');
    expect(entry('vibecode')?.display_source).toBe('manual');
    expect(entry('ipfs-explorer')?.display_source).toBe('idl-generated');
    expect(entry('music-studio-unified')?.display_source).toBe('audio-summary');
    expect(entry('model-browser')?.display_source).toBe('manual');
    expect(entry('task-manager')?.display_source).toBe('manual');
    expect(entry('api-keys')?.display_source).toBe('mobile-card');
  });

  it('keeps displayable profiles inside Meta glasses safety constraints', () => {
    const displayable = coverage.entries.filter(entry => entry.displayable);

    expect(displayable.length).toBeGreaterThan(0);
    for (const entry of displayable) {
      const profile = entry.display_profile;
      expect(profile).toBeDefined();
      expect(profile?.target.viewport).toEqual(META_GLASSES_DISPLAY_VIEWPORT);
      expect(profile?.layout.focus_order?.length).toBeGreaterThan(0);
      expect(profile?.constraints.requires_focus_order).toBe(true);
      expect(profile?.constraints.requires_high_contrast).toBe(true);
      expect(profile?.constraints.max_update_hz).toBeLessThanOrEqual(META_GLASSES_MAX_SAFE_UPDATE_HZ);
      expect(profile?.fallback.when).toContain('dat_native_display_unavailable');
      expect(profile?.fallback.render_path).toEqual(
        expect.stringMatching(/display-webapp|mobile-card|notification|audio-summary|simulator/),
      );
      expect(entry.validation.conformant).toBe(true);
    }
  });

  it('records safe fallback targets for non-displayable glasses strategies', () => {
    const fallbackOnly = coverage.entries.filter(entry => !entry.displayable);

    expect(fallbackOnly.length).toBeGreaterThan(0);
    for (const entry of fallbackOnly) {
      expect(entry.fallback_targets.length).toBeGreaterThan(0);
      expect(entry.fallback_targets.join(',')).toEqual(
        expect.stringMatching(/mobile-card|notification|audio-summary|display-webapp|desktop-only|not-displayable/),
      );
    }
  });

  function entry(appId: string) {
    return getGlassesManifestCoverageEntry(appId, coverage);
  }
});
=======
/**
 * @vitest-environment node
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import type { AllToolsAppBindingMatrix } from '../../src/services/apps/all-tools-app-binding-matrix';
import type { AllToolsCompositeWorkflowCatalog } from '../../src/services/apps/all-tools-composite-workflows';
import type { AllToolsLedger } from '../../src/services/apps/all-tools-policy-classifier';
import {
  buildAllToolsGlassesProjectionCatalog,
  validateAllToolsGlassesProjectionCatalog,
} from '../../src/services/glasses/all-tools-glasses-projection';
import {
  buildAllToolsIDLDescriptorCatalog,
  validateAllToolsIDLDescriptorCatalog,
} from '../../src/services/mcp/all-tools-idl-generator';

const evidenceRoot = join(process.cwd(), 'test-results/virtual-desktop-ipfs-mcp-orb');
const servicesRoot = join(process.cwd(), 'src/services');

describe('SWR-006 glasses manifest ownership and coverage', () => {
  it('keeps product surface files under their owning service directories', () => {
    const expectedOwnership = {
      apps: [
        'all-tools-app-binding-matrix.ts',
        'all-tools-composite-workflows.ts',
        'all-tools-policy-classifier.ts',
        'all-tools-release-policy-gates.ts',
        'mcp-deontic-ui-manifest.ts',
        'mcp-generated-app-quality-gates.ts',
        'mcp-generated-app-state.ts',
        'meta-glasses-app-capability-registry.ts',
        'swissknife-mcp-capability-registry.ts',
      ],
      glasses: [
        'all-tools-glasses-projection.ts',
        'glasses-app-control-plane.ts',
        'glasses-enhanced-control-plane.ts',
        'idl-to-glasses-compiler.ts',
        'ipfs-glasses-widgets.ts',
        'meta-glasses-display-orb-adapter.ts',
        'meta-glasses-mobile-orb-bridge.ts',
        'meta-glasses-widget-compiler.ts',
      ],
      ipfs: [
        'browser.ts',
        'host.ts',
        'ipfs-idl-descriptors.ts',
        'ipfs-interface-registry.ts',
        'ipfs-orb-profiles.ts',
        'ipfs-proof-cache.ts',
        'ipfs-ui-profiles.ts',
        'mcp-ipfs-ui-descriptors.ts',
      ],
      mcp: [
        'all-tools-idl-generator.ts',
        'control-surface-mediator.ts',
        'libp2p-browser-runtime.ts',
        'mcp-idl.ts',
        'mcp-interface-registry.ts',
        'mcp-orb-capability-router.ts',
        'mcp-schema-ui-generator.ts',
        'mcp-transport.ts',
        'mcp-ui-profile.ts',
      ],
    } as const;

    for (const [owner, files] of Object.entries(expectedOwnership)) {
      for (const file of files) {
        const ownedPath = join(servicesRoot, owner, file);
        expect(existsSync(ownedPath)).toBe(true);
        expect(statSync(ownedPath).isFile()).toBe(true);
        expect(existsSync(join(servicesRoot, file))).toBe(false);
      }
    }
  });

  it('rebuilds ORB/IDL and glasses coverage from app-owned manifest inputs', () => {
    const ledger = readJson<AllToolsLedger>('all-tools-ledger.json');
    const bindingMatrix = readJson<AllToolsAppBindingMatrix>('all-tools-app-bindings.json');
    const workflowCatalog = readJson<AllToolsCompositeWorkflowCatalog>('all-tools-composite-workflows.json');
    const idlCatalog = buildAllToolsIDLDescriptorCatalog(
      ledger,
      bindingMatrix,
      workflowCatalog,
      { generatedAt: '2026-07-08T00:00:00.000Z' },
    );
    const glassesCatalog = buildAllToolsGlassesProjectionCatalog(idlCatalog, {
      generatedAt: '2026-07-08T00:00:00.000Z',
    });

    expect(validateAllToolsIDLDescriptorCatalog(
      idlCatalog,
      ledger,
      bindingMatrix,
      workflowCatalog,
    )).toEqual({ valid: true, errors: [], warnings: [] });
    expect(validateAllToolsGlassesProjectionCatalog(glassesCatalog, idlCatalog)).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
    expect(glassesCatalog.projection_count).toBe(idlCatalog.descriptor_count);
    expect(glassesCatalog.tool_coverage_count).toBe(bindingMatrix.rows.filter(row => row.app_visible).length);
    expect(glassesCatalog.hardware_free_replay_state_count).toBe(glassesCatalog.projection_count * 8);
    expect(glassesCatalog.behavior_counts.native_display).toBeGreaterThan(0);
    expect(glassesCatalog.behavior_counts.display_webapp).toBeGreaterThan(0);
    expect(glassesCatalog.behavior_counts.physical_device_only).toBeGreaterThan(0);
  });
});

function readJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(join(evidenceRoot, fileName), 'utf8')) as T;
}
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
