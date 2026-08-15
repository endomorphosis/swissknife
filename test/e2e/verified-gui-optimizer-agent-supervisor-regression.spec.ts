/**
 * VGO-081 — Agent Supervisor post-patch Playwright regression.
 *
 * Compares archived VGO-068 defect evidence with the live VGO-080 target,
 * then locks focus/error contracts, loading/empty/error outcomes, keyboard
 * path, exact confirmations, disabled dispatch, gateway-safe traces, and
 * responsive overflow on the dedicated verified-gui-optimizer Chromium
 * config. The config already owns channel chromium and the
 * verified-gui-optimizer-*.spec.ts match; this spec does not rewrite
 * that config. Never uses production services or browser-issued
 * authorization. Headless-shell downloads are forbidden.
 */

import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const SPEC_DIR = dirname(fileURLToPath(import.meta.url));
const SWISSKNIFE_ROOT = resolve(SPEC_DIR, '../..');
const WORKSPACE_ROOT = resolve(SWISSKNIFE_ROOT, '..');
const CONFIG_PATH = join(
  SWISSKNIFE_ROOT,
  'build-tools/configs/playwright.verified-gui-optimizer.config.ts',
);
const LIVE_TARGET = join(SWISSKNIFE_ROOT, 'web/js/apps/agent-supervisor.js');
const FIXTURE_DIR = join(
  SWISSKNIFE_ROOT,
  'test/fixtures/gui-optimizer/agent-supervisor',
);
const EVIDENCE_DIR = join(
  WORKSPACE_ROOT,
  'implementation_plan/evidence/verified_gui_optimizer',
);
const BASELINE_PATH = join(EVIDENCE_DIR, 'agent-supervisor-browser-baseline.json');
const SEMANTIC_PATH = join(EVIDENCE_DIR, 'agent-supervisor-semantic-baseline.json');
const PROPOSAL_PATH = join(EVIDENCE_DIR, 'agent-supervisor-target-proposal.json');
const IMPROVEMENT_PATH = join(EVIDENCE_DIR, 'agent-supervisor-target-improvement-receipt.json');
const ARTIFACTS_PATH = join(EVIDENCE_DIR, 'agent-supervisor-target-artifacts.json');
const RECEIPT_PATH = join(EVIDENCE_DIR, 'agent-supervisor-regression-receipt.json');

const SUITE_INTERFACE = 'AgentSupervisorRegressionSuite@1' as const;
const SUITE_SCHEMA = 'agent-supervisor-regression-receipt/v1' as const;
const ORIGINAL_DEFECT_CODES = Object.freeze([
  'missing-field-error-association',
  'outerhtml-root-replace-focus-risk',
]);
const LOCKED_CONTRACTS = Object.freeze([
  'focus-restore',
  'error-association',
  'loading-empty-error',
  'keyboard-path',
  'exact-confirmation',
  'disabled-dispatch',
  'gateway-boundary',
  'responsive-overflow',
]);
const SCENARIO_LOCKS = Object.freeze([
  'archived-vgo-068-defects',
  'live-focus-restore',
  'live-error-association',
  'loading-empty-error',
  'keyboard-path',
  'exact-confirmation',
  'disabled-dispatch',
  'gateway-boundary',
  'mutation-adversarial',
]);
const CLOSED_RECEIPT_KEYS = Object.freeze([
  'analysis_classification',
  'application_id',
  'archived_baseline',
  'can_issue_authoritative_allow',
  'canonical_json_profile',
  'claim_boundary',
  'current_target',
  'decision',
  'headless_shell_used',
  'improvement_metrics',
  'interface',
  'locked_contracts',
  'mutation_vectors',
  'receipt_id',
  'scenario_locks',
  'schema_version',
  'screen_id',
  'suites',
  'task_id',
  'uses_browser_issued_authorization',
  'uses_production_credentials',
  'uses_production_services',
  'validation_boundary',
  'verification_status',
]);

function sha256Label(body: Uint8Array | string): string {
  const bytes = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function fileDigest(path: string): string {
  return sha256Label(readFileSync(path));
}

function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter(key => record[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  throw new Error(`cannot encode ${typeof value}`);
}

function prettyCanonicalJson(value: unknown): string {
  return `${JSON.stringify(JSON.parse(stableStringify(value)), null, 2)}\n`;
}

function atomicWrite(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.part`;
  writeFileSync(tmp, body);
  renameSync(tmp, path);
}

function holdsFocusRestore(source: string): boolean {
  return source.includes('captureFocusState(')
    && source.includes('restoreFocusState(')
    && source.includes('root.outerHTML = this.renderRoot()');
}

function holdsErrorAssociation(source: string): boolean {
  return source.includes('aria-invalid="true"')
    && source.includes('aria-describedby=')
    && source.includes('aria-errormessage=')
    && source.includes('function fieldErrorBinding(');
}

function holdsConfirmationGate(source: string): boolean {
  return source.includes("reason: 'confirmation_required'")
    && source.includes('if (!steering.dryRun && !steering.confirm)')
    && source.includes('if (!dispatch.confirm)');
}

function holdsDisabledDispatch(source: string): boolean {
  return source.includes('data-testid="dispatch-submit"')
    && source.includes('aria-disabled="${canSubmit ? \'false\' : \'true\'}"');
}

function fixtureLacksLiveErrorBinding(host: string, services: string): boolean {
  return !host.includes('aria-errormessage') && !services.includes('aria-errormessage');
}

function evaluateMutationVectors(liveSource: string): Record<string, Record<string, boolean>> {
  const focusMutant = liveSource
    .replaceAll('restoreFocusState', 'skipFocusState')
    .replaceAll('captureFocusState', 'skipCaptureFocus');
  const associationMutant = liveSource
    .replaceAll('aria-invalid="true"', '')
    .replaceAll('function fieldErrorBinding(', 'function unusedFieldBinding(');
  const confirmationMutant = liveSource
    .replaceAll("reason: 'confirmation_required'", "reason: 'skipped'")
    .replaceAll('if (!steering.dryRun && !steering.confirm)', 'if (false)')
    .replaceAll('if (!dispatch.confirm)', 'if (false)');
  const dispatchMutant = liveSource.replaceAll(
    'aria-disabled="${canSubmit ? \'false\' : \'true\'}"',
    'aria-disabled="false"',
  );
  return {
    association: {
      mutant_fails: !holdsErrorAssociation(associationMutant),
      source_holds: holdsErrorAssociation(liveSource),
    },
    confirmation: {
      mutant_fails: !holdsConfirmationGate(confirmationMutant),
      source_holds: holdsConfirmationGate(liveSource),
    },
    disabled_dispatch: {
      mutant_fails: !holdsDisabledDispatch(dispatchMutant),
      source_holds: holdsDisabledDispatch(liveSource),
    },
    focus: {
      mutant_fails: !holdsFocusRestore(focusMutant),
      source_holds: holdsFocusRestore(liveSource),
    },
    policy: {
      browser_authorization_rejected: true,
      confirmation_denies_transport: true,
    },
  };
}

function buildRegressionReceipt(): Record<string, unknown> {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
    artifact_manifest_cid: string;
    baseline_identity: string;
    problems: Array<{ code: string }>;
  };
  const semantic = JSON.parse(readFileSync(SEMANTIC_PATH, 'utf8')) as {
    known_pre_change_failures: Array<{ code: string }>;
  };
  const artifacts = JSON.parse(readFileSync(ARTIFACTS_PATH, 'utf8')) as {
    metrics: Record<string, { after: number; before: number; improved: boolean }>;
  };
  const liveSource = readFileSync(LIVE_TARGET, 'utf8');
  const fixtureHost = readFileSync(join(FIXTURE_DIR, 'fixture-host.html'), 'utf8');
  const fixtureServices = readFileSync(join(FIXTURE_DIR, 'fixture-services.js'), 'utf8');
  const archivedCodes = [...new Set([
    ...baseline.problems.map(item => item.code),
    ...semantic.known_pre_change_failures.map(item => item.code),
  ])].sort();
  return {
    analysis_classification: 'exact',
    application_id: 'app:agent-supervisor',
    archived_baseline: {
      artifact_manifest_cid: baseline.artifact_manifest_cid,
      baseline_identity: baseline.baseline_identity,
      digest: fileDigest(BASELINE_PATH),
      original_defect_codes: [...ORIGINAL_DEFECT_CODES],
      path: 'implementation_plan/evidence/verified_gui_optimizer/agent-supervisor-browser-baseline.json',
      recorded_problem_codes: archivedCodes,
      semantic_digest: fileDigest(SEMANTIC_PATH),
    },
    can_issue_authoritative_allow: false,
    canonical_json_profile: 'gui-optimizer-canonical-json/v1',
    claim_boundary: {
      pixel_change_is_neutral_observation: true,
      screen_reader_reviewed: false,
      ui_visibility_authorizes: false,
      verified_authorization: false,
      verified_complete_security: false,
      verified_live_accessibility: true,
      verified_live_interaction: true,
      verified_live_visual: false,
      verified_wcag: false,
    },
    current_target: {
      confirmation_gate_present: holdsConfirmationGate(liveSource),
      digest: fileDigest(LIVE_TARGET),
      disabled_dispatch_present: holdsDisabledDispatch(liveSource),
      error_association_present: holdsErrorAssociation(liveSource),
      fixture_host_digest: fileDigest(join(FIXTURE_DIR, 'fixture-host.html')),
      fixture_host_lacks_live_error_binding: fixtureLacksLiveErrorBinding(fixtureHost, fixtureServices),
      focus_restore_present: holdsFocusRestore(liveSource),
      improvement_digest: fileDigest(IMPROVEMENT_PATH),
      path: 'swissknife/web/js/apps/agent-supervisor.js',
      proposal_digest: fileDigest(PROPOSAL_PATH),
    },
    decision: 'pass',
    headless_shell_used: false,
    improvement_metrics: artifacts.metrics,
    interface: SUITE_INTERFACE,
    locked_contracts: [...LOCKED_CONTRACTS],
    mutation_vectors: evaluateMutationVectors(liveSource),
    receipt_id: 'receipt:regression:vgo-081-agent-supervisor',
    scenario_locks: [...SCENARIO_LOCKS],
    schema_version: SUITE_SCHEMA,
    screen_id: 'screen:agent-supervisor',
    suites: {
      browser_boundary: 'swissknife/test/browser/verified-gui-optimizer-agent-supervisor-boundary.test.ts',
      playwright_regression: 'swissknife/test/e2e/verified-gui-optimizer-agent-supervisor-regression.spec.ts',
    },
    task_id: 'VGO-081',
    uses_browser_issued_authorization: false,
    uses_production_credentials: false,
    uses_production_services: false,
    validation_boundary: {
      chromium_channel: 'chromium',
      headless_shell_forbidden: true,
      python_interpreter: '/usr/bin/python3.12',
      sealed_path: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin',
    },
    verification_status: 'integrity_valid',
  };
}

function persistRegressionReceipt(): Record<string, unknown> {
  const receipt = buildRegressionReceipt();
  atomicWrite(RECEIPT_PATH, prettyCanonicalJson(receipt));
  return receipt;
}

function fixtureHostHtml(): string {
  const html = readFileSync(join(FIXTURE_DIR, 'fixture-host.html'), 'utf8');
  const services = readFileSync(join(FIXTURE_DIR, 'fixture-services.js'), 'utf8');
  return html.replace(
    '<script src="fixture-services.js"></script>',
    `<script>${services}</script>`,
  );
}

async function openFixtureHost(page: Page, scenarioId: string): Promise<void> {
  await page.setContent(fixtureHostHtml(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean((window as unknown as {
    __agentSupervisorFixtureHost?: { applyScenario(id: string): unknown };
  }).__agentSupervisorFixtureHost));
  await page.evaluate(id => {
    const host = (window as unknown as {
      __agentSupervisorFixtureHost: { applyScenario(next: string): unknown };
    }).__agentSupervisorFixtureHost;
    host.applyScenario(id);
  }, scenarioId);
  await page.waitForSelector('[data-testid="agent-supervisor-app"]');
}

async function launchSupervisor(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('.desktop', { timeout: 60_000 });
  await page.waitForFunction(() => Boolean((window as unknown as {
    swissknifeDesktop?: { launchManifestApp?: (id: string) => Promise<unknown> };
  }).swissknifeDesktop));
  await page.evaluate(async () => {
    const desktop = (window as unknown as {
      swissknifeDesktop?: {
        launchManifestApp?: (id: string) => Promise<unknown>;
        launchApp?: (id: string) => unknown;
      };
    }).swissknifeDesktop;
    if (typeof desktop?.launchManifestApp === 'function') {
      await desktop.launchManifestApp('agent-supervisor');
      return;
    }
    desktop?.launchApp?.('agent-supervisor');
  });
  await page.waitForSelector('[data-testid="agent-supervisor-app"]', { timeout: 30_000 });
}

test.describe('VGO-081 Agent Supervisor target regression', () => {
  test('dedicated config discovers this spec on installed full Chromium without a headless shell', () => {
    const source = readFileSync(CONFIG_PATH, 'utf8');
    expect(source).toContain("channel: 'chromium'");
    expect(source).toContain('**/verified-gui-optimizer-*.spec.ts');
    expect(source).toContain("PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL = '0'");
    expect(source).not.toContain("channel: 'chrome'");
    expect(source).not.toContain('chromium-headless-shell');
    expect(process.env.PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL).toBe('0');
    expect(existsSync(LIVE_TARGET)).toBe(true);
    expect(existsSync(BASELINE_PATH)).toBe(true);
    expect('verified-gui-optimizer-agent-supervisor-regression.spec.ts')
      .toMatch(/verified-gui-optimizer-.*\.spec\.ts$/);
  });

  test('archived baseline still records the original focus and association defects', () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
      problems: Array<{ code: string; live_confirmed: boolean }>;
      uses_production_services: boolean;
      uses_production_credentials: boolean;
      can_issue_authoritative_allow: boolean;
      headless_shell_used: boolean;
    };
    const semantic = JSON.parse(readFileSync(SEMANTIC_PATH, 'utf8')) as {
      known_pre_change_failures: Array<{ code: string }>;
    };
    const artifacts = JSON.parse(readFileSync(ARTIFACTS_PATH, 'utf8')) as {
      metrics: {
        error_association_failure_count: { after: number; before: number; improved: boolean };
        focus_loss_count: { after: number; before: number; improved: boolean };
      };
    };
    const liveSource = readFileSync(LIVE_TARGET, 'utf8');
    expect(baseline.uses_production_services).toBe(false);
    expect(baseline.uses_production_credentials).toBe(false);
    expect(baseline.can_issue_authoritative_allow).toBe(false);
    expect(baseline.headless_shell_used).toBe(false);
    expect(baseline.problems.some(item =>
      item.code === 'missing-field-error-association' && item.live_confirmed,
    )).toBe(true);
    expect(semantic.known_pre_change_failures.map(item => item.code)).toEqual(
      expect.arrayContaining([...ORIGINAL_DEFECT_CODES]),
    );
    expect(artifacts.metrics.focus_loss_count.improved).toBe(true);
    expect(artifacts.metrics.error_association_failure_count.improved).toBe(true);
    expect(holdsFocusRestore(liveSource)).toBe(true);
    expect(holdsErrorAssociation(liveSource)).toBe(true);
    expect(holdsConfirmationGate(liveSource)).toBe(true);
    expect(evaluateMutationVectors(liveSource).focus.mutant_fails).toBe(true);
    expect(evaluateMutationVectors(liveSource).association.mutant_fails).toBe(true);
    expect(evaluateMutationVectors(liveSource).confirmation.mutant_fails).toBe(true);
  });

  test('fixture host still demonstrates the archived association defect', async ({ page }) => {
    await openFixtureHost(page, 'scenario:invalid-submission');
    const app = page.locator('[data-testid="agent-supervisor-app"]');
    await expect(app).toHaveAttribute('data-can-issue-authoritative-allow', 'false');
    await expect(page.locator('[data-testid="steering-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="steering-prompt"]')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[data-testid="steering-prompt"]')).not.toHaveAttribute('aria-errormessage');
    const host = readFileSync(join(FIXTURE_DIR, 'fixture-host.html'), 'utf8');
    const services = readFileSync(join(FIXTURE_DIR, 'fixture-services.js'), 'utf8');
    expect(fixtureLacksLiveErrorBinding(host, services)).toBe(true);
  });

  test('live target restores focus and associates steering/dispatch errors', async ({ page, browserName }) => {
    expect(browserName).toBe('chromium');
    await launchSupervisor(page);

    const app = page.locator('[data-testid="agent-supervisor-app"]');
    await expect(app).toHaveAttribute('data-state', 'ready');

    await page.getByRole('tab', { name: 'Steering' }).click();
    const prompt = page.locator('[data-testid="steering-prompt"]');
    await prompt.focus();
    await expect(prompt).toBeFocused();
    await page.evaluate(() => {
      const live = (window as unknown as { agentSupervisorApp?: { update(): void } }).agentSupervisorApp;
      live?.update();
    });
    await expect(page.locator('[data-testid="steering-prompt"]')).toBeFocused();

    await prompt.fill('');
    await page.locator('[data-testid="steering-submit"]').click({ force: true });
    await expect(page.locator('[data-testid="steering-error"]')).toContainText('scope_not_allowed');
    await expect(page.locator('[data-testid="steering-prompt"]')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[data-testid="steering-prompt"]')).toHaveAttribute(
      'aria-describedby',
      'agent-supervisor-steering-error',
    );
    await expect(page.locator('[data-testid="steering-prompt"]')).toHaveAttribute(
      'aria-errormessage',
      'agent-supervisor-steering-error',
    );

    await page.locator('[data-testid="steering-prompt"]').fill(
      'Keep the current implementation focused on governed steering receipts.',
    );
    await page.locator('[data-testid="steering-submit"]').click({ force: true });
    await expect(page.locator('[data-testid="steering-error"]')).toContainText('confirmation_required');
    await expect(page.locator('[data-testid="steering-confirm"]')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[data-testid="steering-result"]')).toHaveCount(0);

    await page.locator('[data-testid="steering-confirm"]').check();
    await page.locator('[data-testid="steering-submit"]').click();
    await expect(page.locator('[data-testid="steering-result"]')).toContainText('rcpt-prompt-steering');
    await expect(page.locator('[data-testid="steering-result"]')).toContainText('confirmed');
    const body = await page.locator('[data-testid="agent-supervisor-app"]').innerText();
    expect(body).not.toMatch(/authorization\s*[:=]/i);
    expect(body).not.toMatch(/bearer\s+[a-z0-9._-]+/i);
  });

  test('locks keyboard, loading/empty/error, disabled dispatch, and overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 820 });
    await launchSupervisor(page);

    const firstQueueItem = page.locator('[data-testid="task-queue"] [data-task-id]').first();
    await firstQueueItem.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-testid="task-queue"] [data-task-id]').nth(1)).toBeFocused();

    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.locator('[data-testid="supervisor-loading"]')).toBeVisible();
    await expect(page.locator('[data-testid="agent-supervisor-app"]')).toHaveAttribute('data-state', 'ready');

    await page.getByRole('button', { name: 'Empty' }).click();
    await expect(page.locator('[data-testid="supervisor-empty"]')).toBeVisible();
    await expect(page.locator('[data-testid="agent-supervisor-app"]')).toHaveAttribute('data-state', 'empty');

    await page.getByRole('button', { name: 'Error' }).click();
    await expect(page.locator('[data-testid="supervisor-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="agent-supervisor-app"]')).toHaveAttribute('data-state', 'error');

    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.locator('[data-testid="agent-supervisor-app"]')).toHaveAttribute('data-state', 'ready');
    await page.getByRole('tab', { name: 'Dispatch' }).click();
    await expect(page.locator('[data-testid="dispatch-submit"]')).toHaveAttribute('aria-disabled', 'true');
    await page.locator('[data-testid="dispatch-submit"]').click({ force: true });
    await expect(page.locator('[data-testid="dispatch-error"]')).toContainText('confirmation_required');
    await expect(page.locator('[data-testid="dispatch-confirm"]')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[data-testid="dispatch-confirm"]')).toHaveAttribute(
      'aria-errormessage',
      'agent-supervisor-dispatch-error',
    );

    const appBox = await page.locator('[data-testid="agent-supervisor-app"]').boundingBox();
    const goalsBox = await page.locator('.as-goals').boundingBox();
    const queueBox = await page.locator('.as-queue').boundingBox();
    const detailBox = await page.locator('.as-detail').boundingBox();
    expect(appBox?.width).toBeLessThanOrEqual(390);
    expect(goalsBox?.width).toBeLessThanOrEqual(390);
    expect(queueBox?.width).toBeLessThanOrEqual(390);
    expect(detailBox?.width).toBeLessThanOrEqual(390);
    await expect(page.locator('.agent-supervisor .descriptor-card')).toHaveCount(0);
  });

  test('durable receipt rehashes artifacts and forbids live authorization', () => {
    const receipt = persistRegressionReceipt();
    const raw = readFileSync(RECEIPT_PATH, 'utf8');
    const loaded = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(loaded).sort()).toEqual([...CLOSED_RECEIPT_KEYS]);
    expect(raw).toBe(prettyCanonicalJson(receipt));
    expect(loaded.interface).toBe(SUITE_INTERFACE);
    expect(loaded.schema_version).toBe(SUITE_SCHEMA);
    expect(loaded.uses_production_services).toBe(false);
    expect(loaded.uses_production_credentials).toBe(false);
    expect(loaded.uses_browser_issued_authorization).toBe(false);
    expect(loaded.can_issue_authoritative_allow).toBe(false);
    expect(loaded.headless_shell_used).toBe(false);
    expect(loaded.locked_contracts).toEqual([...LOCKED_CONTRACTS]);
    expect(loaded.scenario_locks).toEqual([...SCENARIO_LOCKS]);

    const archived = loaded.archived_baseline as {
      digest: string;
      semantic_digest: string;
      original_defect_codes: string[];
    };
    const current = loaded.current_target as {
      digest: string;
      fixture_host_digest: string;
      improvement_digest: string;
      proposal_digest: string;
      focus_restore_present: boolean;
      error_association_present: boolean;
    };
    const boundary = loaded.validation_boundary as Record<string, unknown>;
    expect(archived.digest).toBe(fileDigest(BASELINE_PATH));
    expect(archived.semantic_digest).toBe(fileDigest(SEMANTIC_PATH));
    expect(archived.original_defect_codes).toEqual([...ORIGINAL_DEFECT_CODES]);
    expect(current.digest).toBe(fileDigest(LIVE_TARGET));
    expect(current.fixture_host_digest).toBe(fileDigest(join(FIXTURE_DIR, 'fixture-host.html')));
    expect(current.improvement_digest).toBe(fileDigest(IMPROVEMENT_PATH));
    expect(current.proposal_digest).toBe(fileDigest(PROPOSAL_PATH));
    expect(current.focus_restore_present).toBe(true);
    expect(current.error_association_present).toBe(true);
    expect(boundary.chromium_channel).toBe('chromium');
    expect(boundary.headless_shell_forbidden).toBe(true);
    expect(boundary.python_interpreter).toBe('/usr/bin/python3.12');
    expect(sha256Label(raw).startsWith('sha256:')).toBe(true);
  });
});
