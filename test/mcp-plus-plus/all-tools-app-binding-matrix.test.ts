import {
  APP_HOST_ONLY_CAPABILITY_KEYWORDS,
  isAppBundleable,
  isAppUnavailableInBrowser,
  validateAppManifest,
} from '../../src/services/apps/app-manifest';
import {
  APP_MANIFEST_REGISTRY,
  EXCLUDED_LEGACY_APP_IDS,
  getAppManifest,
  listAppManifests,
  listBrowserBundleableAppManifests,
  listUnavailableAppManifests,
} from '../../src/services/apps/app-manifest-registry';
import {
  buildAppManifestFromBindingRows,
  buildAppManifestsFromBindingMatrix,
  combineAppRuntimeClasses,
  inferAppRuntimeClassFromBindingRow,
  validateAppManifestCoverage,
  type AllToolsAppBindingMatrix,
  type AllToolsAppBindingRow,
} from '../../src/services/apps/all-tools-app-binding-matrix';

function bindingRow(overrides: Partial<AllToolsAppBindingRow> = {}): AllToolsAppBindingRow {
  return {
    tool_id: 'tool.example',
    service_id: 'example-service',
    name: 'Example Tool',
    category: 'utilities',
    owner_module: 'service-apps',
    policy_class: 'low_risk',
    confirmation_policy: 'none',
    receipt_policy: 'none',
    disposition: 'allow',
    normalized_disposition: 'allow',
    app_visible: true,
    app_id: 'example-app',
    capability_id: 'network.fetch',
    ...overrides,
  };
}

function bindingMatrix(rows: AllToolsAppBindingRow[]): AllToolsAppBindingMatrix {
  return {
    matrix_id: 'test-matrix',
    schema: 'swissknife.all-mcp-tools-app-binding-matrix.v1',
    tool_count: rows.length,
    disposition_counts: { allow: rows.length },
    rows,
  };
}

describe('SWR-023 app manifest normalization from the all-tools app binding matrix', () => {
  it('infers browser-safe runtime class for ordinary app-visible tools', () => {
    const row = bindingRow();
    expect(inferAppRuntimeClassFromBindingRow(row)).toBe('browser-safe');
  });

  it('infers hybrid for app-visible tools bound to a host-only-flavored capability', () => {
    const row = bindingRow({ category: 'hardware', app_visible: true, capability_id: 'hardware.profile' });
    expect(inferAppRuntimeClassFromBindingRow(row)).toBe('hybrid');
  });

  it('infers host-only for non-app-visible tools bound to a host-only-flavored capability', () => {
    const row = bindingRow({
      category: 'subprocess',
      app_visible: false,
      app_id: undefined,
      capability_id: 'host.process.exec',
    });
    expect(inferAppRuntimeClassFromBindingRow(row)).toBe('host-only');
    expect(APP_HOST_ONLY_CAPABILITY_KEYWORDS).toContain('subprocess');
  });

  it('combines multiple per-tool classes into the most restrictive runtime class', () => {
    expect(combineAppRuntimeClasses(['browser-safe', 'hybrid'])).toBe('hybrid');
    expect(combineAppRuntimeClasses(['browser-safe', 'hybrid', 'host-only'])).toBe('host-only');
    expect(combineAppRuntimeClasses(['remote-capability', 'browser-safe'])).toBe('remote-capability');
    expect(combineAppRuntimeClasses([])).toBe('browser-safe');
  });

  it('builds a valid browser-safe app manifest from ordinary binding rows', () => {
    const rows = [
      bindingRow({ tool_id: 'tool.a', capability_id: 'network.fetch' }),
      bindingRow({ tool_id: 'tool.b', capability_id: 'storage.browser.local' }),
    ];
    const manifest = buildAppManifestFromBindingRows('example-app', rows);

    expect(manifest.runtime_class).toBe('browser-safe');
    expect(manifest.browser.supported).toBe(true);
    expect(manifest.lazy_import.kind).toBe('dynamic-import');
    expect(manifest.lazy_import.module).toBe('../../js/apps/example-app.js');
    expect(manifest.required_capabilities).toEqual(
      expect.arrayContaining(['network.fetch', 'storage.browser.local']),
    );
    expect(validateAppManifest(manifest)).toEqual({ valid: true, errors: [], warnings: [] });
    expect(isAppBundleable(manifest)).toBe(true);
    expect(isAppUnavailableInBrowser(manifest)).toBe(false);
  });

  it('builds a host-only app manifest that is never dynamic-import bundleable', () => {
    const rows = [
      bindingRow({
        tool_id: 'tool.shell',
        category: 'subprocess',
        app_visible: false,
        app_id: undefined,
        capability_id: 'host.process.exec',
      }),
    ];
    const manifest = buildAppManifestFromBindingRows('host-shell-app', rows);

    expect(manifest.runtime_class).toBe('host-only');
    expect(manifest.browser.supported).toBe(false);
    expect(manifest.browser.unavailable_capability_id).toBe('host.process.exec');
    expect(manifest.lazy_import).toEqual({ kind: 'unavailable' });
    expect(validateAppManifest(manifest).valid).toBe(true);
    expect(isAppBundleable(manifest)).toBe(false);
    expect(isAppUnavailableInBrowser(manifest)).toBe(true);
  });

  it('builds one manifest per app_visible app_id and skips non-app-visible/app-id-less rows', () => {
    const matrix = bindingMatrix([
      bindingRow({ tool_id: 'tool.a', app_id: 'app-one', capability_id: 'network.fetch' }),
      bindingRow({ tool_id: 'tool.b', app_id: 'app-one', capability_id: 'storage.browser.local' }),
      bindingRow({ tool_id: 'tool.c', app_id: 'app-two', category: 'device' }),
      bindingRow({ tool_id: 'tool.d', app_visible: false, app_id: 'hidden-app' }),
      bindingRow({ tool_id: 'tool.e', app_visible: true, app_id: undefined }),
    ]);

    const manifests = buildAppManifestsFromBindingMatrix(matrix);
    const manifestIds = manifests.map(manifest => manifest.app_id);

    expect(manifestIds).toEqual(['app-one', 'app-two']);
    expect(manifests.every(manifest => validateAppManifest(manifest).valid)).toBe(true);

    const appOne = manifests.find(manifest => manifest.app_id === 'app-one')!;
    expect(appOne.required_capabilities).toEqual(
      expect.arrayContaining(['network.fetch', 'storage.browser.local']),
    );

    const appTwo = manifests.find(manifest => manifest.app_id === 'app-two')!;
    expect(appTwo.runtime_class).toBe('hybrid');
  });

  it('flags missing manifest coverage for app_visible app_ids', () => {
    const matrix = bindingMatrix([
      bindingRow({ tool_id: 'tool.a', app_id: 'covered-app' }),
      bindingRow({ tool_id: 'tool.b', app_id: 'uncovered-app' }),
    ]);
    const manifests = buildAppManifestsFromBindingMatrix(bindingMatrix([bindingRow({ app_id: 'covered-app' })]));

    const coverage = validateAppManifestCoverage(matrix, manifests);
    expect(coverage.valid).toBe(false);
    expect(coverage.missingAppIds).toEqual(['uncovered-app']);
    expect(coverage.errors[0]).toMatch(/uncovered-app/);
  });

  it('reports full coverage once every app_visible app has a manifest', () => {
    const matrix = bindingMatrix([
      bindingRow({ tool_id: 'tool.a', app_id: 'app-one' }),
      bindingRow({ tool_id: 'tool.b', app_id: 'app-two', category: 'hardware' }),
    ]);
    const manifests = buildAppManifestsFromBindingMatrix(matrix);
    expect(validateAppManifestCoverage(matrix, manifests)).toEqual({
      valid: true,
      missingAppIds: [],
      errors: [],
    });
  });
});

describe('SWR-023 canonical SwissKnife web app manifest registry', () => {
  it('registers every active web/js/apps app referenced by web/js/main-simple.js', () => {
    const expectedAppIds = [
      'ai-chat', 'api-keys', 'calculator', 'calendar', 'cinema', 'clock', 'cron',
      'device-manager', 'file-manager', 'friends-list', 'github', 'huggingface',
      'image-viewer', 'ipfs-explorer', 'mcp-control', 'media-player', 'model-browser',
      'music-studio-unified', 'music-studio', 'navi', 'neural-network-designer',
      'neural-photoshop', 'notes', 'oauth-login', 'openrouter', 'p2p-chat-unified',
      'p2p-chat', 'p2p-network', 'peertube', 'settings', 'strudel-ai-daw',
      'strudel-grandma', 'system-monitor', 'task-manager', 'terminal', 'todo',
      'training-manager', 'vibecode',
    ];

    for (const appId of expectedAppIds) {
      const manifest = getAppManifest(appId);
      expect(manifest, `expected manifest for "${appId}"`).toBeDefined();
      expect(manifest!.browser.supported).toBe(true);
      expect(manifest!.lazy_import.kind).toBe('dynamic-import');
    }

    expect(listAppManifests().length).toBe(APP_MANIFEST_REGISTRY.length);
  });

  it('excludes legacy/backup app variants that main-simple.js no longer imports', () => {
    for (const legacyAppId of EXCLUDED_LEGACY_APP_IDS) {
      expect(getAppManifest(legacyAppId)).toBeUndefined();
    }
  });

  it('represents a host-only capability app as unavailable, never bundleable', () => {
    const hostOnly = getAppManifest('swissknife-cli-console');
    expect(hostOnly).toBeDefined();
    expect(hostOnly!.runtime_class).toBe('host-only');
    expect(hostOnly!.browser.supported).toBe(false);
    expect(hostOnly!.browser.unavailable_capability_id).toBeTruthy();
    expect(hostOnly!.lazy_import).toEqual({ kind: 'unavailable' });
    expect(isAppBundleable(hostOnly!)).toBe(false);
    expect(listBrowserBundleableAppManifests().some(manifest => manifest.app_id === 'swissknife-cli-console')).toBe(false);
  });

  it('represents an equivalent host capability reachable via a remote descriptor, not a bundled module', () => {
    const remote = getAppManifest('remote-cli-bridge');
    expect(remote).toBeDefined();
    expect(remote!.runtime_class).toBe('remote-capability');
    expect(remote!.lazy_import.kind).toBe('remote-descriptor');
    expect(remote!.lazy_import.module).toBeUndefined();
    expect(remote!.lazy_import.descriptor_ref).toBeTruthy();
    expect(isAppBundleable(remote!)).toBe(false);
    expect(isAppUnavailableInBrowser(remote!)).toBe(true);
  });

  it('keeps every registered manifest internally valid', () => {
    for (const manifest of listAppManifests()) {
      const result = validateAppManifest(manifest);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });

  it('partitions the registry into browser-bundleable and unavailable/remote apps with no overlap', () => {
    const bundleable = new Set(listBrowserBundleableAppManifests().map(manifest => manifest.app_id));
    const unavailable = new Set(listUnavailableAppManifests().map(manifest => manifest.app_id));

    expect(bundleable.size + unavailable.size).toBe(APP_MANIFEST_REGISTRY.length);
    for (const appId of bundleable) {
      expect(unavailable.has(appId)).toBe(false);
    }
    expect(unavailable.has('swissknife-cli-console')).toBe(true);
    expect(unavailable.has('remote-cli-bridge')).toBe(true);
  });

  it('declares every lazy_import.module target as a relative specifier, never absolute or a URL', () => {
    for (const manifest of listBrowserBundleableAppManifests()) {
      expect(manifest.lazy_import.module).toBeTruthy();
      expect(manifest.lazy_import.module!.startsWith('/')).toBe(false);
      expect(manifest.lazy_import.module).not.toMatch(/^[a-z][a-z0-9+.-]*:/i);
    }
  });
});
