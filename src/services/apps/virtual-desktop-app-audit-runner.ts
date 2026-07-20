import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { encodeDeterministicPng } from './deterministic-png.js';
import {
  resolveVirtualDesktopAppId,
  VIRTUAL_DESKTOP_APP_MANIFEST,
  type VirtualDesktopAppManifest,
  type VirtualDesktopAppManifestEntry,
} from './virtual-desktop-app-manifest.js';
import {
  validateVirtualDesktopAppManifest,
  type VirtualDesktopAppManifestValidationResult,
} from './virtual-desktop-app-manifest-validator.js';

/**
 * SVD-132: manifest-driven app audit runner.
 *
 * Opens every canonical app id and every legacy alias declared in
 * {@link VIRTUAL_DESKTOP_APP_MANIFEST} (45 canonical ids + 3 aliases = 48
 * total ids), drives each through launch -> focus -> close -> reopen, and
 * captures fresh, structured, byte-verifiable evidence: desktop and narrow
 * screenshots, console errors, failed network requests, and manifest drift
 * findings.
 *
 * The runner is driver-agnostic: `SimulatedVirtualDesktopAppAuditDriver`
 * provides a fast, deterministic, hardware/browser-free driver (used by the
 * `test:run` vitest suite so evidence regeneration never depends on a live
 * browser), while `PlaywrightVirtualDesktopAppAuditDriver` drives a real
 * `@playwright/test` `Page` against the live desktop shell for end-to-end
 * evidence (see `test/e2e/virtual-desktop-app-audit-runner.spec.ts`).
 */

export const VIRTUAL_DESKTOP_APP_AUDIT_RUNNER_SCHEMA =
  'swissknife.virtual-desktop-app-audit-runner.v1' as const;
export const VIRTUAL_DESKTOP_APP_AUDIT_RUNNER_TASK_ID = 'SVD-132' as const;

export type AppAuditScreenshotViewport = 'desktop' | 'narrow';

export const APP_AUDIT_VIEWPORTS: Readonly<
  Record<AppAuditScreenshotViewport, { width: number; height: number }>
> = {
  desktop: { width: 1440, height: 900 },
  narrow: { width: 390, height: 844 },
};

export interface AppAuditPlanEntry {
  /** The literal id opened by the runner (canonical id or legacy alias). */
  requested_id: string;
  /** The canonical manifest app id the requested id resolves to. */
  canonical_id: string;
  /** True when `requested_id` is a legacy alias rather than the canonical id. */
  is_alias: boolean;
  app: VirtualDesktopAppManifestEntry;
}

export interface AppAuditScreenshotCapture {
  viewport: AppAuditScreenshotViewport;
  width: number;
  height: number;
  path: string;
  byte_length: number;
  sha256: string;
  captured: boolean;
  error?: string;
}

export interface AppAuditConsoleMessage {
  level: 'error' | 'warning';
  text: string;
  source?: string;
}

export interface AppAuditFailedRequest {
  url: string;
  method: string;
  status?: number;
  error_text?: string;
  phase: 'launch' | 'focus' | 'close' | 'reopen';
}

export interface AppAuditLaunchResult {
  attempted: boolean;
  opened: boolean;
  duration_ms: number;
  window_id?: string;
  error?: string;
}

export interface AppAuditFocusResult {
  attempted: boolean;
  focused: boolean;
  duration_ms: number;
  error?: string;
}

export interface AppAuditCloseReopenResult {
  attempted: boolean;
  closed: boolean;
  reopened: boolean;
  state_preserved: boolean;
  duration_ms: number;
  error?: string;
}

export type AppAuditManifestDriftSeverity = 'error' | 'warning';

export interface AppAuditManifestDriftFinding {
  kind: string;
  severity: AppAuditManifestDriftSeverity;
  message: string;
}

export type AppAuditAppStatus = 'passed' | 'failed';

export interface AppAuditAppEvidence {
  requested_id: string;
  canonical_id: string;
  is_alias: boolean;
  title: string;
  category: string;
  resolved: boolean;
  launch: AppAuditLaunchResult;
  focus: AppAuditFocusResult;
  close_reopen: AppAuditCloseReopenResult;
  screenshots: readonly AppAuditScreenshotCapture[];
  console_errors: readonly AppAuditConsoleMessage[];
  failed_requests: readonly AppAuditFailedRequest[];
  manifest_drift: readonly AppAuditManifestDriftFinding[];
  status: AppAuditAppStatus;
}

export interface VirtualDesktopAppAuditSummary {
  total_id_count: number;
  canonical_app_count: number;
  alias_count: number;
  passed_app_count: number;
  failed_app_count: number;
  apps_with_console_errors_count: number;
  apps_with_failed_requests_count: number;
  apps_with_manifest_drift_count: number;
  screenshot_count: number;
  screenshot_captured_count: number;
}

export interface VirtualDesktopAppAuditEvidence {
  schema: typeof VIRTUAL_DESKTOP_APP_AUDIT_RUNNER_SCHEMA;
  task_id: typeof VIRTUAL_DESKTOP_APP_AUDIT_RUNNER_TASK_ID;
  generated_at: string;
  driver: string;
  manifest_id: string;
  manifest_version: string;
  manifest_generated_from: readonly string[];
  screenshot_root: string;
  validation: VirtualDesktopAppManifestValidationResult;
  summary: VirtualDesktopAppAuditSummary;
  apps: readonly AppAuditAppEvidence[];
}

/**
 * Every driver operation the audit runner needs. Implementations may be
 * fully simulated (deterministic, offline) or backed by a real browser.
 */
export interface VirtualDesktopAppAuditDriver {
  readonly name: string;
  openDesktop(): Promise<void>;
  launchApp(appId: string): Promise<{
    opened: boolean;
    windowId?: string;
    durationMs: number;
    error?: string;
  }>;
  focusApp(appId: string, windowId: string | undefined): Promise<{
    focused: boolean;
    durationMs: number;
    error?: string;
  }>;
  closeApp(appId: string, windowId: string | undefined): Promise<{
    closed: boolean;
    durationMs: number;
    error?: string;
  }>;
  reopenApp(appId: string): Promise<{
    opened: boolean;
    windowId?: string;
    statePreserved: boolean;
    durationMs: number;
    error?: string;
  }>;
  captureScreenshot(appId: string, viewport: AppAuditScreenshotViewport): Promise<Buffer>;
  collectConsoleMessages(appId: string): Promise<AppAuditConsoleMessage[]>;
  collectFailedRequests(appId: string): Promise<AppAuditFailedRequest[]>;
  dispose(): Promise<void>;
}

/**
 * Build the ordered plan of every id the runner must open: each of the 45
 * canonical app ids, immediately followed by that app's declared legacy
 * aliases (3 total), for 48 ids overall.
 */
export function buildVirtualDesktopAppAuditPlan(
  manifest: VirtualDesktopAppManifest = VIRTUAL_DESKTOP_APP_MANIFEST,
): AppAuditPlanEntry[] {
  const plan: AppAuditPlanEntry[] = [];
  for (const app of manifest.apps) {
    plan.push({ requested_id: app.id, canonical_id: app.id, is_alias: false, app });
    for (const alias of app.aliases) {
      plan.push({ requested_id: alias, canonical_id: app.id, is_alias: true, app });
    }
  }
  return plan;
}

/**
 * Deterministic, hardware/browser-free driver. Screenshots are real,
 * decodable PNG files whose pixels are derived from the app/viewport seed so
 * re-running the audit against an unchanged manifest reproduces
 * byte-identical evidence. An optional fault plan lets callers exercise the
 * console-error / failed-request / drift capture paths without needing a
 * live browser.
 */
export interface SimulatedAppAuditFault {
  launchFails?: boolean;
  focusFails?: boolean;
  closeFails?: boolean;
  reopenFails?: boolean;
  statePreserved?: boolean;
  consoleErrors?: readonly AppAuditConsoleMessage[];
  failedRequests?: readonly AppAuditFailedRequest[];
}

export class SimulatedVirtualDesktopAppAuditDriver implements VirtualDesktopAppAuditDriver {
  readonly name = 'simulated';
  private readonly faultPlan: ReadonlyMap<string, SimulatedAppAuditFault>;
  private windowCounter = 0;

  constructor(faultPlan: Readonly<Record<string, SimulatedAppAuditFault>> = {}) {
    this.faultPlan = new Map(Object.entries(faultPlan));
  }

  async openDesktop(): Promise<void> {
    // No-op: the simulated driver has no real desktop shell to navigate to.
  }

  async launchApp(appId: string): Promise<{ opened: boolean; windowId?: string; durationMs: number; error?: string }> {
    const fault = this.faultPlan.get(appId);
    const durationMs = deterministicDurationMs(appId, 'launch');
    if (fault?.launchFails) {
      return { opened: false, durationMs, error: `simulated launch failure for ${appId}` };
    }
    this.windowCounter += 1;
    return { opened: true, windowId: `window-${this.windowCounter}`, durationMs };
  }

  async focusApp(appId: string): Promise<{ focused: boolean; durationMs: number; error?: string }> {
    const fault = this.faultPlan.get(appId);
    const durationMs = deterministicDurationMs(appId, 'focus');
    if (fault?.focusFails) {
      return { focused: false, durationMs, error: `simulated focus failure for ${appId}` };
    }
    return { focused: true, durationMs };
  }

  async closeApp(appId: string): Promise<{ closed: boolean; durationMs: number; error?: string }> {
    const fault = this.faultPlan.get(appId);
    const durationMs = deterministicDurationMs(appId, 'close');
    if (fault?.closeFails) {
      return { closed: false, durationMs, error: `simulated close failure for ${appId}` };
    }
    return { closed: true, durationMs };
  }

  async reopenApp(appId: string): Promise<{
    opened: boolean;
    windowId?: string;
    statePreserved: boolean;
    durationMs: number;
    error?: string;
  }> {
    const fault = this.faultPlan.get(appId);
    const durationMs = deterministicDurationMs(appId, 'reopen');
    if (fault?.reopenFails) {
      return { opened: false, statePreserved: false, durationMs, error: `simulated reopen failure for ${appId}` };
    }
    this.windowCounter += 1;
    return {
      opened: true,
      windowId: `window-${this.windowCounter}`,
      statePreserved: fault?.statePreserved ?? true,
      durationMs,
    };
  }

  async captureScreenshot(appId: string, viewport: AppAuditScreenshotViewport): Promise<Buffer> {
    const { width, height } = APP_AUDIT_VIEWPORTS[viewport];
    return encodeDeterministicPng(width, height, `${appId}:${viewport}`);
  }

  async collectConsoleMessages(appId: string): Promise<AppAuditConsoleMessage[]> {
    const fault = this.faultPlan.get(appId);
    return fault?.consoleErrors ? [...fault.consoleErrors] : [];
  }

  async collectFailedRequests(appId: string): Promise<AppAuditFailedRequest[]> {
    const fault = this.faultPlan.get(appId);
    return fault?.failedRequests ? [...fault.failedRequests] : [];
  }

  async dispose(): Promise<void> {
    // No-op: nothing to release.
  }
}

function deterministicDurationMs(appId: string, phase: string): number {
  const digest = createHash('sha256').update(`${appId}:${phase}`, 'utf8').digest();
  // Map to a plausible 8-64ms simulated duration, deterministically.
  return 8 + (digest[0] % 57);
}

/**
 * Structural manifest-drift checks run per plan entry. These re-derive the
 * same invariants `validateVirtualDesktopAppManifest` enforces globally, but
 * scoped to a single opened app so drift is captured alongside that app's
 * fresh evidence rather than only in the aggregate validation block.
 */
export function computeAppAuditManifestDrift(entry: AppAuditPlanEntry): AppAuditManifestDriftFinding[] {
  const findings: AppAuditManifestDriftFinding[] = [];
  const { app, requested_id, canonical_id, is_alias } = entry;

  const resolved = resolveVirtualDesktopAppId(requested_id);
  if (resolved !== canonical_id) {
    findings.push({
      kind: 'alias_resolution_mismatch',
      severity: 'error',
      message: `requested id ${requested_id} resolved to ${resolved ?? 'null'}, expected canonical id ${canonical_id}`,
    });
  }

  if (app.canonical_id !== app.id) {
    findings.push({
      kind: 'canonical_id_mismatch',
      severity: 'error',
      message: `${app.id}: canonical_id (${app.canonical_id}) must match id`,
    });
  }

  if (is_alias && !app.aliases.includes(requested_id)) {
    findings.push({
      kind: 'alias_not_declared',
      severity: 'error',
      message: `${requested_id} is opened as an alias of ${canonical_id} but is not declared in aliases`,
    });
  }

  const requiredCoverage: readonly string[] = app.required_test_coverage ?? [];
  for (const required of ['manifest', 'launch', 'screenshot', 'console', 'network'] as const) {
    if (!requiredCoverage.includes(required)) {
      findings.push({
        kind: 'missing_required_coverage',
        severity: 'warning',
        message: `${app.id}: required_test_coverage is missing ${required}`,
      });
    }
  }

  if (is_alias && !requiredCoverage.includes('alias')) {
    findings.push({
      kind: 'missing_alias_coverage',
      severity: 'warning',
      message: `${app.id}: has aliases but required_test_coverage is missing alias`,
    });
  }

  const remoteServices = (app.service_families ?? []).filter(
    service => service === 'ipfs_kit_py' || service === 'ipfs_datasets_py' || service === 'ipfs_accelerate_py',
  );
  if (remoteServices.length > 0 && (app.backend_capabilities?.length ?? 0) === 0) {
    findings.push({
      kind: 'missing_backend_capabilities',
      severity: 'error',
      message: `${app.id}: declares ${remoteServices.join(', ')} service families but has no backend_capabilities`,
    });
  }
  if (remoteServices.length === 0 && !app.local_only_rationale) {
    findings.push({
      kind: 'missing_local_only_rationale',
      severity: 'error',
      message: `${app.id}: has no remote MCP backend service and no local_only_rationale`,
    });
  }

  if (!app.orb_idl_state?.state || !app.orb_idl_state?.descriptor_owner) {
    findings.push({
      kind: 'incomplete_orb_idl_state',
      severity: 'error',
      message: `${app.id}: orb_idl_state.state and orb_idl_state.descriptor_owner are required`,
    });
  }

  if (!app.glasses_strategy?.kind || !app.glasses_strategy?.handoff) {
    findings.push({
      kind: 'incomplete_glasses_strategy',
      severity: 'error',
      message: `${app.id}: glasses_strategy.kind and glasses_strategy.handoff are required`,
    });
  }

  if (!app.ux_scenarios?.success || !app.ux_scenarios?.fallback || !app.ux_scenarios?.error) {
    findings.push({
      kind: 'incomplete_ux_scenarios',
      severity: 'error',
      message: `${app.id}: ux_scenarios.success, ux_scenarios.fallback, and ux_scenarios.error are required`,
    });
  }

  return findings;
}

export interface RunVirtualDesktopAppAuditOptions {
  manifest?: VirtualDesktopAppManifest;
  driver: VirtualDesktopAppAuditDriver;
  generatedAt: string;
  screenshotRoot: string;
  /** Absolute repo root used to compute relative evidence screenshot paths. */
  repoRoot: string;
  /** When false, screenshots are captured in-memory but not written to disk. */
  writeScreenshots?: boolean;
}

/**
 * Run the full manifest-driven audit: open every canonical id and alias
 * (48 total for the current manifest), drive launch/focus/close/reopen,
 * capture desktop + narrow screenshots, collect console errors and failed
 * requests, and compute manifest drift -- producing one fresh, structured
 * evidence document.
 */
export async function runVirtualDesktopAppAudit(
  options: RunVirtualDesktopAppAuditOptions,
): Promise<VirtualDesktopAppAuditEvidence> {
  const manifest = options.manifest ?? VIRTUAL_DESKTOP_APP_MANIFEST;
  const { driver, generatedAt, screenshotRoot, repoRoot } = options;
  const writeScreenshots = options.writeScreenshots ?? true;
  const plan = buildVirtualDesktopAppAuditPlan(manifest);

  await driver.openDesktop();

  const apps: AppAuditAppEvidence[] = [];
  for (const entry of plan) {
    apps.push(await auditOnePlanEntry(entry, driver, { screenshotRoot, repoRoot, writeScreenshots }));
  }

  await driver.dispose();

  const validation = validateVirtualDesktopAppManifest(manifest);
  const aliasCount = plan.filter(entry => entry.is_alias).length;

  const summary: VirtualDesktopAppAuditSummary = {
    total_id_count: plan.length,
    canonical_app_count: manifest.apps.length,
    alias_count: aliasCount,
    passed_app_count: apps.filter(app => app.status === 'passed').length,
    failed_app_count: apps.filter(app => app.status === 'failed').length,
    apps_with_console_errors_count: apps.filter(app => app.console_errors.length > 0).length,
    apps_with_failed_requests_count: apps.filter(app => app.failed_requests.length > 0).length,
    apps_with_manifest_drift_count: apps.filter(app => app.manifest_drift.length > 0).length,
    screenshot_count: apps.reduce((total, app) => total + app.screenshots.length, 0),
    screenshot_captured_count: apps.reduce(
      (total, app) => total + app.screenshots.filter(shot => shot.captured).length,
      0,
    ),
  };

  return {
    schema: VIRTUAL_DESKTOP_APP_AUDIT_RUNNER_SCHEMA,
    task_id: VIRTUAL_DESKTOP_APP_AUDIT_RUNNER_TASK_ID,
    generated_at: generatedAt,
    driver: driver.name,
    manifest_id: manifest.manifest_id,
    manifest_version: manifest.version,
    manifest_generated_from: manifest.generated_from,
    screenshot_root: toPosixRelative(repoRoot, screenshotRoot),
    validation,
    summary,
    apps,
  };
}

interface AuditContext {
  screenshotRoot: string;
  repoRoot: string;
  writeScreenshots: boolean;
}

async function auditOnePlanEntry(
  entry: AppAuditPlanEntry,
  driver: VirtualDesktopAppAuditDriver,
  context: AuditContext,
): Promise<AppAuditAppEvidence> {
  const { requested_id, canonical_id, is_alias, app } = entry;

  const launchResult = await driver.launchApp(requested_id);
  const launch: AppAuditLaunchResult = {
    attempted: true,
    opened: launchResult.opened,
    duration_ms: launchResult.durationMs,
    window_id: launchResult.windowId,
    error: launchResult.error,
  };

  const focusResult = await driver.focusApp(requested_id, launchResult.windowId);
  const focus: AppAuditFocusResult = {
    attempted: launch.opened,
    focused: launch.opened && focusResult.focused,
    duration_ms: focusResult.durationMs,
    error: focusResult.error,
  };

  const screenshots: AppAuditScreenshotCapture[] = [];
  for (const viewport of ['desktop', 'narrow'] as const) {
    screenshots.push(await captureScreenshotEvidence(requested_id, viewport, driver, context));
  }

  const closeResult = await driver.closeApp(requested_id, launchResult.windowId);
  const reopenResult = await driver.reopenApp(requested_id);
  const close_reopen: AppAuditCloseReopenResult = {
    attempted: launch.opened,
    closed: launch.opened && closeResult.closed,
    reopened: launch.opened && closeResult.closed && reopenResult.opened,
    state_preserved: reopenResult.statePreserved,
    duration_ms: closeResult.durationMs + reopenResult.durationMs,
    error: closeResult.error ?? reopenResult.error,
  };

  const consoleMessages = await driver.collectConsoleMessages(requested_id);
  const console_errors = consoleMessages.filter(message => message.level === 'error');
  const failed_requests = await driver.collectFailedRequests(requested_id);
  const manifest_drift = computeAppAuditManifestDrift(entry);

  const status: AppAuditAppStatus =
    launch.opened
    && focus.focused
    && close_reopen.closed
    && close_reopen.reopened
    && console_errors.length === 0
    && failed_requests.length === 0
    && manifest_drift.filter(finding => finding.severity === 'error').length === 0
      ? 'passed'
      : 'failed';

  return {
    requested_id,
    canonical_id,
    is_alias,
    title: app.title,
    category: app.category,
    resolved: resolveVirtualDesktopAppId(requested_id) === canonical_id,
    launch,
    focus,
    close_reopen,
    screenshots,
    console_errors,
    failed_requests,
    manifest_drift,
    status,
  };
}

async function captureScreenshotEvidence(
  appId: string,
  viewport: AppAuditScreenshotViewport,
  driver: VirtualDesktopAppAuditDriver,
  context: AuditContext,
): Promise<AppAuditScreenshotCapture> {
  const { width, height } = APP_AUDIT_VIEWPORTS[viewport];
  const absolutePath = join(context.screenshotRoot, appId, `${viewport}.png`);
  try {
    const buffer = await driver.captureScreenshot(appId, viewport);
    if (context.writeScreenshots) {
      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, buffer);
    }
    return {
      viewport,
      width,
      height,
      path: toPosixRelative(context.repoRoot, absolutePath),
      byte_length: buffer.byteLength,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      captured: true,
    };
  } catch (error) {
    return {
      viewport,
      width,
      height,
      path: toPosixRelative(context.repoRoot, absolutePath),
      byte_length: 0,
      sha256: '',
      captured: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function toPosixRelative(root: string, target: string): string {
  const relative = target.startsWith(root) ? target.slice(root.length) : target;
  return relative.replace(/^[/\\]+/, '').split('\\').join('/');
}
