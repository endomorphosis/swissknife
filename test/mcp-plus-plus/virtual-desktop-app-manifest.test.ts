import { readFileSync } from 'fs';
import { join } from 'path';
import {
  GENERATED_SERVICE_APP_IDS,
  VIRTUAL_DESKTOP_ALIAS_TO_ID,
  VIRTUAL_DESKTOP_APP_MANIFEST,
  VIRTUAL_DESKTOP_APP_MANIFEST_ID,
  VIRTUAL_DESKTOP_APP_BY_ID,
  VIRTUAL_DESKTOP_APP_IDS,
  VISIBLE_DESKTOP_APP_IDS,
  getVirtualDesktopApp,
  resolveVirtualDesktopAppId,
  type VirtualDesktopAppManifest,
} from '../../src/services/apps/virtual-desktop-app-manifest';
import { validateVirtualDesktopAppManifest } from '../../src/services/apps/virtual-desktop-app-manifest-validator';

describe('SwissKnife virtual desktop app manifest', () => {
  it('ships a schema contract with the expected top-level identity', () => {
    const raw = readFileSync(
      join(process.cwd(), 'contracts', 'swissknife_virtual_desktop_app_manifest.schema.json'),
      'utf8',
    );
    const schema = JSON.parse(raw);

    expect(schema.$id).toBe('https://hallucinate.app/contracts/swissknife_virtual_desktop_app_manifest.schema.json');
    expect(schema.properties.manifest_id.const).toBe(VIRTUAL_DESKTOP_APP_MANIFEST_ID);
    expect(schema.$defs.app.required).toEqual(
      expect.arrayContaining([
        'id',
        'aliases',
        'title',
        'category',
        'owner_module',
        'launch_kind',
        'capabilities',
        'service_families',
        'glasses_strategy',
        'required_test_coverage',
      ]),
    );
  });

  it('validates the bundled manifest', () => {
    const result = validateVirtualDesktopAppManifest();
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('covers every visible desktop app and generated service surface', () => {
    for (const id of VISIBLE_DESKTOP_APP_IDS) {
      expect(VIRTUAL_DESKTOP_APP_BY_ID.has(id)).toBe(true);
    }
    for (const id of GENERATED_SERVICE_APP_IDS) {
      expect(VIRTUAL_DESKTOP_APP_BY_ID.has(id)).toBe(true);
    }
    expect(VIRTUAL_DESKTOP_APP_MANIFEST.apps).toHaveLength(
      VISIBLE_DESKTOP_APP_IDS.length + GENERATED_SERVICE_APP_IDS.length,
    );
  });

  it('records aliases for known drift cases without making them canonical ids', () => {
    expect(resolveVirtualDesktopAppId('code-editor')).toBe('vibecode');
    expect(resolveVirtualDesktopAppId('strudel-grandma')).toBe('music-studio');
    expect(resolveVirtualDesktopAppId('p2p-chat-offline')).toBe('p2p-chat');
    expect(VIRTUAL_DESKTOP_APP_IDS).not.toContain('code-editor');
    expect(VIRTUAL_DESKTOP_APP_IDS).not.toContain('strudel-grandma');
    expect(VIRTUAL_DESKTOP_APP_IDS).not.toContain('p2p-chat-offline');
    expect(VIRTUAL_DESKTOP_ALIAS_TO_ID.get('code-editor')).toBe('vibecode');
  });

  it('records service families, capabilities, glasses strategy, and coverage for every app', () => {
    for (const app of VIRTUAL_DESKTOP_APP_MANIFEST.apps) {
      expect(app.capabilities.length).toBeGreaterThan(0);
      expect(app.service_families.length).toBeGreaterThan(0);
      expect(app.glasses_strategy.kind).toBeTruthy();
      expect(app.glasses_strategy.handoff).toBeTruthy();
      expect(app.required_test_coverage).toContain('manifest');
    }

    expect(getVirtualDesktopApp('datasets-browser')!.service_families).toContain('ipfs_datasets_py');
    expect(getVirtualDesktopApp('accelerate-panel')!.service_families).toContain('ipfs_accelerate_py');
    expect(getVirtualDesktopApp('ipfs-explorer')!.service_families).toContain('ipfs_kit_py');
  });

  it('fails duplicate app ids', () => {
    const duplicate: VirtualDesktopAppManifest = {
      ...VIRTUAL_DESKTOP_APP_MANIFEST,
      apps: [
        ...VIRTUAL_DESKTOP_APP_MANIFEST.apps,
        { ...VIRTUAL_DESKTOP_APP_MANIFEST.apps[0] },
      ],
    };

    const result = validateVirtualDesktopAppManifest(duplicate);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('duplicate app id: terminal');
  });

  it('fails invalid app ids and incomplete required fields', () => {
    const invalid: VirtualDesktopAppManifest = {
      ...VIRTUAL_DESKTOP_APP_MANIFEST,
      apps: [
        {
          ...VIRTUAL_DESKTOP_APP_MANIFEST.apps[0],
          id: 'Bad Id',
          capabilities: [],
          required_test_coverage: ['launch'],
        },
        ...VIRTUAL_DESKTOP_APP_MANIFEST.apps.slice(1),
      ],
    };

    const result = validateVirtualDesktopAppManifest(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'Bad Id: id must be kebab-case',
      'Bad Id: capabilities must be a non-empty array',
      'Bad Id: required_test_coverage must include manifest',
      'manifest missing visible desktop app: terminal',
    ]));
  });
});
