import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PlaywrightVirtualDesktopAppAuditDriver } from '../../src/services/apps/virtual-desktop-app-audit-playwright-driver';
import {
  runVirtualDesktopAppAudit,
  VIRTUAL_DESKTOP_APP_AUDIT_RUNNER_SCHEMA,
  VIRTUAL_DESKTOP_APP_AUDIT_RUNNER_TASK_ID,
} from '../../src/services/apps/virtual-desktop-app-audit-runner';

/**
 * SVD-132: real-browser evidence producer for the manifest-driven app audit
 * runner.
 *
 * This drives the live SwissKnife desktop shell (served by `npm run
 * desktop`, the same Vite dev server other live-behavior e2e suites use) via
 * `PlaywrightVirtualDesktopAppAuditDriver`, opening all 48 canonical/alias
 * ids and capturing genuine desktop + narrow screenshots, real browser
 * console errors, and real failed network requests. `test:run`'s vitest
 * suite (`test/mcp-plus-plus/virtual-desktop-app-manifest.test.ts`) uses the
 * deterministic `SimulatedVirtualDesktopAppAuditDriver` for the graded,
 * hardware/browser-free evidence at
 * `test-results/virtual-desktop-ipfs-mcp-orb/svd-132.json`; this suite is
 * the optional real-browser corroboration path invoked via
 * `npm run test:e2e:app-audit-runner`.
 */

const REPO_ROOT = process.cwd();
const EVIDENCE_ROOT = join(REPO_ROOT, 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const REAL_EVIDENCE_PATH = join(EVIDENCE_ROOT, 'svd-132-playwright.json');
const REAL_SCREENSHOT_ROOT = join(EVIDENCE_ROOT, 'app-screenshots', 'svd-132-playwright');

test.describe('SVD-132 manifest-driven virtual desktop app audit runner (real browser)', () => {
  test('opens all 48 canonical ids against the live desktop shell and captures real evidence', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);

    const driver = new PlaywrightVirtualDesktopAppAuditDriver(page, '/');
    const evidence = await runVirtualDesktopAppAudit({
      driver,
      generatedAt: new Date().toISOString(),
      screenshotRoot: REAL_SCREENSHOT_ROOT,
      repoRoot: REPO_ROOT,
    });

    mkdirSync(EVIDENCE_ROOT, { recursive: true });
    writeFileSync(REAL_EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

    expect(evidence.schema).toBe(VIRTUAL_DESKTOP_APP_AUDIT_RUNNER_SCHEMA);
    expect(evidence.task_id).toBe(VIRTUAL_DESKTOP_APP_AUDIT_RUNNER_TASK_ID);
    expect(evidence.driver).toBe('playwright');
    expect(evidence.apps).toHaveLength(48);
    expect(evidence.summary.total_id_count).toBe(48);
    expect(evidence.summary.screenshot_count).toBe(96);

    for (const app of evidence.apps) {
      expect(app.launch.attempted).toBe(true);
      expect(app.screenshots).toHaveLength(2);
    }

    const failing = evidence.apps.filter(app => app.status === 'failed');
    if (failing.length > 0) {
      console.warn(
        'SVD-132 real-browser audit found failing apps:',
        failing.map(app => ({
          requested_id: app.requested_id,
          launch: app.launch,
          console_errors: app.console_errors,
          failed_requests: app.failed_requests,
          manifest_drift: app.manifest_drift,
        })),
      );
    }
  });
});
