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
