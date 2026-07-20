import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
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
import {
  APP_AUDIT_VIEWPORTS,
  buildVirtualDesktopAppAuditPlan,
  computeAppAuditManifestDrift,
  runVirtualDesktopAppAudit,
  SimulatedVirtualDesktopAppAuditDriver,
  VIRTUAL_DESKTOP_APP_AUDIT_RUNNER_SCHEMA,
  VIRTUAL_DESKTOP_APP_AUDIT_RUNNER_TASK_ID,
  type VirtualDesktopAppAuditEvidence,
} from '../../src/services/apps/virtual-desktop-app-audit-runner';

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

const REPO_ROOT = process.cwd();
const AUDIT_EVIDENCE_ROOT = join(REPO_ROOT, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const AUDIT_EVIDENCE_PATH = join(AUDIT_EVIDENCE_ROOT, 'svd-132.json');
const AUDIT_SCREENSHOT_ROOT = join(AUDIT_EVIDENCE_ROOT, 'app-screenshots', 'svd-132');
const AUDIT_GENERATED_AT = '2026-07-20T00:00:00.000Z';

async function runFreshVirtualDesktopAppAudit(
  overrides: Partial<Parameters<typeof runVirtualDesktopAppAudit>[0]> = {},
): Promise<VirtualDesktopAppAuditEvidence> {
  return runVirtualDesktopAppAudit({
    driver: new SimulatedVirtualDesktopAppAuditDriver(),
    generatedAt: AUDIT_GENERATED_AT,
    screenshotRoot: AUDIT_SCREENSHOT_ROOT,
    repoRoot: REPO_ROOT,
    ...overrides,
  });
}

describe('SVD-132 manifest-driven virtual desktop app audit runner', () => {
  it('opens all 48 canonical ids and writes fresh structured evidence to disk', async () => {
    const evidence = await runFreshVirtualDesktopAppAudit();

    mkdirSync(dirname(AUDIT_EVIDENCE_PATH), { recursive: true });
    writeFileSync(AUDIT_EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

    expect(evidence).toMatchObject({
      schema: VIRTUAL_DESKTOP_APP_AUDIT_RUNNER_SCHEMA,
      task_id: VIRTUAL_DESKTOP_APP_AUDIT_RUNNER_TASK_ID,
      generated_at: AUDIT_GENERATED_AT,
      driver: 'simulated',
      manifest_id: VIRTUAL_DESKTOP_APP_MANIFEST_ID,
      manifest_version: VIRTUAL_DESKTOP_APP_MANIFEST.version,
    });

    // 45 canonical apps + 3 legacy aliases = 48 total ids opened.
    expect(evidence.summary.canonical_app_count).toBe(45);
    expect(evidence.summary.alias_count).toBe(3);
    expect(evidence.summary.total_id_count).toBe(48);
    expect(evidence.apps).toHaveLength(48);

    expect(JSON.parse(readFileSync(AUDIT_EVIDENCE_PATH, 'utf8'))).toEqual(evidence);
  });

  it('covers every canonical app id and every declared alias exactly once', async () => {
    const evidence = await runFreshVirtualDesktopAppAudit();
    const requestedIds = evidence.apps.map(app => app.requested_id);
    expect(new Set(requestedIds).size).toBe(requestedIds.length);

    for (const app of VIRTUAL_DESKTOP_APP_MANIFEST.apps) {
      expect(requestedIds).toContain(app.id);
      for (const alias of app.aliases) {
        expect(requestedIds).toContain(alias);
      }
    }

    const aliasEvidence = evidence.apps.filter(app => app.is_alias);
    expect(aliasEvidence.map(app => app.requested_id).sort()).toEqual(
      ['code-editor', 'p2p-chat-offline', 'strudel-grandma'].sort(),
    );
    for (const app of aliasEvidence) {
      expect(resolveVirtualDesktopAppId(app.requested_id)).toBe(app.canonical_id);
      expect(app.resolved).toBe(true);
    }
  });

  it('captures a desktop and a narrow screenshot for every opened id, written as real decodable PNGs', async () => {
    const evidence = await runFreshVirtualDesktopAppAudit();

    for (const app of evidence.apps) {
      expect(app.screenshots).toHaveLength(2);
      const viewports = app.screenshots.map(shot => shot.viewport).sort();
      expect(viewports).toEqual(['desktop', 'narrow']);

      for (const shot of app.screenshots) {
        expect(shot.captured).toBe(true);
        expect(shot.error).toBeUndefined();
        expect(shot.width).toBe(APP_AUDIT_VIEWPORTS[shot.viewport].width);
        expect(shot.height).toBe(APP_AUDIT_VIEWPORTS[shot.viewport].height);
        expect(shot.byte_length).toBeGreaterThan(0);
        expect(shot.sha256).toMatch(/^[0-9a-f]{64}$/);

        const absolutePath = join(REPO_ROOT, shot.path);
        expect(existsSync(absolutePath)).toBe(true);
        const bytes = readFileSync(absolutePath);
        expect(bytes.byteLength).toBe(shot.byte_length);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(shot.sha256);
        // PNG signature.
        expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        expect(statSync(absolutePath).size).toBe(shot.byte_length);
      }
    }

    expect(evidence.summary.screenshot_count).toBe(96);
    expect(evidence.summary.screenshot_captured_count).toBe(96);
  });

  it('produces byte-distinguishable screenshots per app and per viewport', async () => {
    const evidence = await runFreshVirtualDesktopAppAudit();
    const allHashes = evidence.apps.flatMap(app => app.screenshots.map(shot => shot.sha256));
    expect(new Set(allHashes).size).toBe(allHashes.length);
  });

  it('records launch, focus, and close/reopen behavior for every opened id', async () => {
    const evidence = await runFreshVirtualDesktopAppAudit();

    for (const app of evidence.apps) {
      expect(app.launch.attempted).toBe(true);
      expect(app.launch.opened).toBe(true);
      expect(app.launch.duration_ms).toBeGreaterThan(0);
      expect(app.launch.window_id).toBeTruthy();

      expect(app.focus.attempted).toBe(true);
      expect(app.focus.focused).toBe(true);

      expect(app.close_reopen.attempted).toBe(true);
      expect(app.close_reopen.closed).toBe(true);
      expect(app.close_reopen.reopened).toBe(true);
      expect(app.close_reopen.state_preserved).toBe(true);

      expect(app.status).toBe('passed');
    }

    expect(evidence.summary.passed_app_count).toBe(48);
    expect(evidence.summary.failed_app_count).toBe(0);
  });

  it('captures empty console-error and failed-request arrays for a clean simulated run, and reports zero manifest drift', async () => {
    const evidence = await runFreshVirtualDesktopAppAudit();

    for (const app of evidence.apps) {
      expect(Array.isArray(app.console_errors)).toBe(true);
      expect(app.console_errors).toHaveLength(0);
      expect(Array.isArray(app.failed_requests)).toBe(true);
      expect(app.failed_requests).toHaveLength(0);
      expect(Array.isArray(app.manifest_drift)).toBe(true);
      expect(app.manifest_drift).toHaveLength(0);
    }

    expect(evidence.summary.apps_with_console_errors_count).toBe(0);
    expect(evidence.summary.apps_with_failed_requests_count).toBe(0);
    expect(evidence.summary.apps_with_manifest_drift_count).toBe(0);
    expect(evidence.validation).toEqual(validateVirtualDesktopAppManifest(VIRTUAL_DESKTOP_APP_MANIFEST));
    expect(evidence.validation.valid).toBe(true);
  });

  it('captures injected console errors, failed requests, and drift findings when a driver reports them', async () => {
    const faultyDriver = new SimulatedVirtualDesktopAppAuditDriver({
      terminal: {
        consoleErrors: [{ level: 'error', text: 'Uncaught TypeError: window.desktop is undefined', source: 'browser-console' }],
        failedRequests: [{ url: '/mcp/tools/bindings', method: 'GET', status: 502, phase: 'launch' }],
      },
      'ai-chat': {
        launchFails: true,
      },
    });

    const evidence = await runVirtualDesktopAppAudit({
      driver: faultyDriver,
      generatedAt: AUDIT_GENERATED_AT,
      screenshotRoot: join(AUDIT_EVIDENCE_ROOT, 'app-screenshots', 'svd-132-fault-drill'),
      repoRoot: REPO_ROOT,
    });

    const terminal = evidence.apps.find(app => app.requested_id === 'terminal');
    expect(terminal?.console_errors).toHaveLength(1);
    expect(terminal?.failed_requests).toHaveLength(1);
    expect(terminal?.status).toBe('failed');

    const aiChat = evidence.apps.find(app => app.requested_id === 'ai-chat');
    expect(aiChat?.launch.opened).toBe(false);
    expect(aiChat?.launch.error).toBeTruthy();
    expect(aiChat?.focus.attempted).toBe(false);
    expect(aiChat?.status).toBe('failed');

    expect(evidence.summary.apps_with_console_errors_count).toBe(1);
    expect(evidence.summary.apps_with_failed_requests_count).toBe(1);
    expect(evidence.summary.failed_app_count).toBeGreaterThanOrEqual(2);
  });

  it('flags manifest drift when a requested alias resolves to the wrong canonical app', () => {
    const plan = buildVirtualDesktopAppAuditPlan();
    const codeEditorEntry = plan.find(entry => entry.requested_id === 'code-editor');
    expect(codeEditorEntry).toBeDefined();
    if (!codeEditorEntry) throw new Error('code-editor entry missing from audit plan');

    const tamperedEntry = {
      ...codeEditorEntry,
      canonical_id: 'terminal',
    };
    const findings = computeAppAuditManifestDrift(tamperedEntry);
    expect(findings).toContainEqual(expect.objectContaining({
      kind: 'alias_resolution_mismatch',
      severity: 'error',
    }));
  });

  it('is deterministic: two runs against the unchanged manifest produce byte-identical evidence', async () => {
    const first = await runFreshVirtualDesktopAppAudit({ writeScreenshots: false });
    const second = await runFreshVirtualDesktopAppAudit({ writeScreenshots: false });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('scopes the audit plan to exactly 48 ids in stable manifest order', () => {
    const plan = buildVirtualDesktopAppAuditPlan();
    expect(plan).toHaveLength(48);

    let index = 0;
    for (const app of VIRTUAL_DESKTOP_APP_MANIFEST.apps) {
      expect(plan[index]).toMatchObject({ requested_id: app.id, canonical_id: app.id, is_alias: false });
      index += 1;
      for (const alias of app.aliases) {
        expect(plan[index]).toMatchObject({ requested_id: alias, canonical_id: app.id, is_alias: true });
        index += 1;
      }
    }
  });
});
