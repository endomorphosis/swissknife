import {
  assertAppRegistryConsistency,
  listLoadableAppIds,
  loadApp,
} from './app-manifest-loader';
import { listBrowserBundleableAppManifests } from '../../../src/services/apps/app-manifest-registry';

describe('SWR-023 web app manifest loader', () => {
  it('lazily loads a browser-safe app module through the manifest-driven importer table', async () => {
    const result = await loadApp('calculator');
    expect(result.status).toBe('loaded');
    expect(result.manifest?.runtime_class).toBe('browser-safe');
    expect(result.module).toBeDefined();
  });

  it('never imports module code for a host-only app; returns an unavailable result instead', async () => {
    const result = await loadApp('swissknife-cli-console');
    expect(result.status).toBe('unavailable');
    expect(result.module).toBeUndefined();
    expect(result.capability_id).toBe('host.process.exec');
    expect(result.reason).toBeTruthy();
  });

  it('resolves a remote-capability app to a remote result with a descriptor ref, not a module', async () => {
    const result = await loadApp('remote-cli-bridge');
    expect(result.status).toBe('remote');
    expect(result.module).toBeUndefined();
    expect(result.descriptor_ref).toBe('org.hallucinate.swissknife.remote-host-cli-bridge@0.1.0');
  });

  it('returns not_found for an unregistered app id', async () => {
    const result = await loadApp('does-not-exist');
    expect(result.status).toBe('not_found');
    expect(result.reason).toMatch(/does-not-exist/);
  });

  it('keeps the static importer table in exact sync with the registry (assertAppRegistryConsistency)', () => {
    expect(() => assertAppRegistryConsistency()).not.toThrow();
  });

  it('lists exactly the browser-bundleable app ids as loadable', () => {
    const loadable = new Set(listLoadableAppIds());
    const bundleable = listBrowserBundleableAppManifests().map(manifest => manifest.app_id);

    expect(loadable.size).toBe(bundleable.length);
    for (const appId of bundleable) {
      expect(loadable.has(appId)).toBe(true);
    }
  });
});
