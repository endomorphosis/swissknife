import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import {
  VIRTUAL_DESKTOP_APP_MANIFEST,
  type VirtualDesktopAppManifestEntry,
} from '../../src/services/apps/virtual-desktop-app-manifest';

test.describe.configure({ mode: 'serial' });
test.setTimeout(1_800_000);

const evidenceRoot = join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb', 'app-improvement');
const screenshotRoot = join(evidenceRoot, 'screenshots');
const reportRelativePath = process.env.SVD_APP_IMPROVEMENT_REPORT_PATH || 'index.json';
const reportPath = join(evidenceRoot, reportRelativePath);
const viewportMatrixEnabled = process.env.SVD_APP_IMPROVEMENT_VIEWPORT_MATRIX === '1';
const uiUxAccessibilityReportPath = join(evidenceRoot, 'ui-ux-accessibility.json');
const screenshotIndexPath = join(evidenceRoot, 'screenshot-index.json');

const viewportProfiles = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

test('opens canonical desktop apps, exercises primary controls, and records improvement evidence', async ({ page }) => {
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(20_000);
  resetEvidenceDirectory((process.env.SVD_APP_IMPROVEMENT_SCOPE || 'all') === 'all');

  const consoleEvents: ConsoleEvidence[] = [];
  const networkEvents: NetworkEvidence[] = [];
  installEventCapture(page, consoleEvents, networkEvents);

  const selectedApps = selectManifestApps();
  const manifestIds = VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => app.id);
  const selectedIds = selectedApps.map(app => app.id);
  const evidenceRunId = buildEvidenceRunId(selectedIds);
  expect(new Set(manifestIds).size).toBe(manifestIds.length);
  expect(VIRTUAL_DESKTOP_APP_MANIFEST.apps).toHaveLength(45);
  expectSelectedAppsMatchRunner(selectedIds);

  const results: AppImprovementEvidence[] = [];

  for (const [index, app] of selectedApps.entries()) {
    console.log(`[app-improvement] ${index + 1}/${selectedApps.length} ${app.id} desktop`);
    const desktopEvidence = await exerciseAppInViewport({
      page,
      app,
      appIndex: index,
      viewport: viewportProfiles[0],
      consoleEvents,
      networkEvents,
    });
    console.log(`[app-improvement] ${index + 1}/${selectedApps.length} ${app.id} mobile`);
    const mobileEvidence = await exerciseAppInViewport({
      page,
      app,
      appIndex: index,
      viewport: viewportProfiles[1],
      consoleEvents,
      networkEvents,
    });

    results.push({
      app_id: app.id,
      canonical_id: app.canonical_id,
      title: app.title,
      category: app.category,
      launch_kind: app.launch_kind,
      manifest_capabilities: [...app.capabilities],
      service_families: [...app.service_families],
      manifest_ux_scenarios: { ...app.ux_scenarios },
      desktop: desktopEvidence,
      mobile: mobileEvidence,
      pass: desktopEvidence.opened
        && mobileEvidence.opened
        && desktopEvidence.launch.from_desktop_icon
        && mobileEvidence.launch.from_desktop_icon
        && desktopEvidence.launch.registered_in_desktop_runtime
        && mobileEvidence.launch.registered_in_desktop_runtime
        && desktopEvidence.primary_control?.action_succeeded === true
        && mobileEvidence.primary_control?.action_succeeded === true
        && hasAppWorkflowEvidence(app.id, desktopEvidence)
        && hasAppWorkflowEvidence(app.id, mobileEvidence)
        && (!viewportMatrixEnabled || (hasUiUxViewportQuality(desktopEvidence) && hasUiUxViewportQuality(mobileEvidence)))
        && !desktopEvidence.interaction_error
        && !mobileEvidence.interaction_error,
    });

    writeAppEvidence(results[results.length - 1]);
  }

  const report: AppImprovementIndex = {
    schema: 'swissknife.virtual-desktop-all-app-improvement.v1',
    task_id: 'SVD-133',
    generated_at: new Date().toISOString(),
    evidence_run_id: evidenceRunId,
    manifest_id: VIRTUAL_DESKTOP_APP_MANIFEST.manifest_id,
    manifest_version: VIRTUAL_DESKTOP_APP_MANIFEST.version,
    manifest_app_count: VIRTUAL_DESKTOP_APP_MANIFEST.apps.length,
    manifest_app_ids: manifestIds,
    selected_app_count: selectedApps.length,
    selected_app_ids: selectedIds,
    scope: process.env.SVD_APP_IMPROVEMENT_SCOPE || 'all',
    launch_policy: {
      source: 'canonical manifest',
      desktop_selector: '.desktop-icons .icon[data-app="<canonical-app-id>"]',
      aliases_allowed: false,
      static_html_server_allowed: false,
      synthetic_success_allowed: false,
      runner: 'scripts/run-virtual-desktop-app-improvement.mjs',
    },
    screenshot_dir: relative(process.cwd(), screenshotRoot),
    per_app_report_dir: relative(process.cwd(), evidenceRoot),
    summary: summarize(results),
    apps: results,
  };

  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const screenshotIndex = buildScreenshotIndex(report);
  writeFileSync(screenshotIndexPath, `${JSON.stringify(screenshotIndex, null, 2)}\n`, 'utf8');

  if (viewportMatrixEnabled) {
    const uiUxAccessibilityReport = buildUiUxAccessibilityReport(report, screenshotIndex);
    writeFileSync(uiUxAccessibilityReportPath, `${JSON.stringify(uiUxAccessibilityReport, null, 2)}\n`, 'utf8');
    expect(uiUxAccessibilityReport.status).toBe('passed');
    expect(Object.values(uiUxAccessibilityReport.acceptance).every(Boolean)).toBe(true);
  }

  expect(results).toHaveLength(selectedApps.length);
  expect(results.every(result => result.desktop.opened && result.mobile.opened)).toBe(true);
  expect(results.every(result => result.desktop.launch.from_desktop_icon && result.mobile.launch.from_desktop_icon)).toBe(true);
  expect(results.every(result => result.desktop.launch.registered_in_desktop_runtime && result.mobile.launch.registered_in_desktop_runtime)).toBe(true);
  expect(results.every(result => result.desktop.primary_control?.action_succeeded && result.mobile.primary_control?.action_succeeded)).toBe(true);
  expect(results.every(result => hasDeterministicStateEvidence(result.desktop) && hasDeterministicStateEvidence(result.mobile))).toBe(true);
  expect(results.every(result => hasAppWorkflowEvidence(result.app_id, result.desktop) && hasAppWorkflowEvidence(result.app_id, result.mobile))).toBe(true);
  if (viewportMatrixEnabled) {
    expect(results.every(result => hasUiUxViewportQuality(result.desktop) && hasUiUxViewportQuality(result.mobile))).toBe(true);
  }
  expect(results.every(result => result.desktop.states.recovery.closed_to_desktop && result.mobile.states.recovery.closed_to_desktop)).toBe(true);
  expect(results.every(result => !result.desktop.interaction_error && !result.mobile.interaction_error)).toBe(true);
  expect(results.every(result => existsSync(join(process.cwd(), result.desktop.screenshot)))).toBe(true);
  expect(results.every(result => existsSync(join(process.cwd(), result.mobile.screenshot)))).toBe(true);
});

async function exerciseAppInViewport(input: {
  page: Page;
  app: VirtualDesktopAppManifestEntry;
  appIndex: number;
  viewport: typeof viewportProfiles[number];
  consoleEvents: ConsoleEvidence[];
  networkEvents: NetworkEvidence[];
}): Promise<ViewportEvidence> {
  const { page, app, appIndex, viewport, consoleEvents, networkEvents } = input;
  const consoleStart = consoleEvents.length;
  const networkStart = networkEvents.length;
  const screenshotPath = join(
    screenshotRoot,
    `${String(appIndex + 1).padStart(2, '0')}-${safeFileName(app.id)}-${viewport.name}.png`,
  );

  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await ensureDesktopReady(page);
  await prepareDesktopForLaunch(page);

  const desktopState = await readDesktopState(page);
  const iconSelector = `.desktop-icons .icon[data-app="${cssEscape(app.id)}"]`;
  const icon = page.locator(iconSelector).first();
  const iconCount = await icon.count();
  const iconVisible = iconCount > 0 && await icon.isVisible().catch(() => false);
  const registered = desktopState.registered_app_ids.includes(app.id);

  const launchEvidence: LaunchEvidence = {
    selector: iconSelector,
    from_desktop_icon: false,
    icon_visible: iconVisible,
    registered_in_desktop_runtime: registered,
    window_count_before: desktopState.window_count,
    window_count_after: desktopState.window_count,
  };

  let opened = false;
  let appWindow: Locator | null = null;
  let primaryControl: PrimaryControlEvidence | null = null;
  let focusEvidence: FocusEvidence = emptyFocusEvidence();
  let stateEvidence: StateEvidence = emptyStateEvidence();
  let workflowEvidence: AppWorkflowEvidence | null = null;
  let layoutEvidence: ViewportLayoutEvidence = emptyViewportLayoutEvidence();
  let interactionError: string | undefined;

  try {
    if (!iconVisible) {
      throw new Error(`Canonical desktop icon ${iconSelector} is not visible.`);
    }
    await icon.scrollIntoViewIfNeeded();
    await icon.focus();
    const iconFocus = await activeElementDescriptor(page);
    await icon.click({ force: true });
    launchEvidence.from_desktop_icon = true;
    launchEvidence.icon_focus_before_launch = iconFocus;

    appWindow = await waitForCanonicalWindow(page, app.id, desktopState.window_count);
    opened = Boolean(appWindow);
    if (!appWindow) {
      throw new Error(`No window with data-app-id="${app.id}" opened after desktop icon click.`);
    }

    launchEvidence.window_count_after = await page.locator('.window').count();
    const loadingInitial = await visibleCount(appWindow.locator('.window-loading'));
    await waitForWindowSettled(appWindow);
    await page.waitForTimeout(250);

    focusEvidence = await collectFocusEvidence(page, appWindow);
    primaryControl = await selectPrimaryControl(appWindow, app.id, viewport.name);
    if (!primaryControl) {
      throw new Error(`No named primary visible control found in ${app.id}.`);
    }

    const control = appWindow.locator(`[data-svd-primary-control="${primaryControl.probe_id}"]`).first();
    primaryControl.before_text = normalizeText(await control.textContent().catch(() => ''));
    primaryControl.action_attempted = true;
    const eventProbeBefore = await installPrimaryControlEventProbe(control, primaryControl.probe_id);
    await exercisePrimaryControl(control, primaryControl);
    await page.waitForTimeout(350);
    const eventProbeAfter = await readPrimaryControlEventProbe(page, primaryControl.probe_id);
    primaryControl.event_probe = {
      before: eventProbeBefore,
      after: eventProbeAfter,
      action_event_count: countActionEvents(eventProbeAfter) - countActionEvents(eventProbeBefore),
      value_changed: controlProbeValueChanged(eventProbeBefore, eventProbeAfter),
    };
    primaryControl.action_succeeded = didPrimaryControlActionSucceed(primaryControl);
    if (!primaryControl.action_succeeded) {
      throw new Error(`Primary control ${primaryControl.name} did not emit a concrete interaction event or value mutation.`);
    }
    primaryControl.after_text = normalizeText(await control.textContent().catch(() => ''));
    primaryControl.active_element_after = await activeElementDescriptor(page);

    stateEvidence = await collectStateEvidence(appWindow, loadingInitial, app);
    workflowEvidence = await collectAppWorkflowEvidence(appWindow, app.id);
    layoutEvidence = await collectViewportLayoutEvidence(page, appWindow);
    await appWindow.screenshot({ path: screenshotPath });
  } catch (error) {
    interactionError = error instanceof Error ? error.message : String(error);
    if (appWindow) {
      layoutEvidence = await collectViewportLayoutEvidence(page, appWindow).catch(() => layoutEvidence);
    }
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } finally {
    if (appWindow) {
      const recovery = await closeAndVerifyDesktopRecovery(page, appWindow, app.id);
      stateEvidence.recovery = recovery;
    }
    await cleanupWindows(page, app.id);
  }

  return {
    viewport: viewport.name,
    viewport_size: { width: viewport.width, height: viewport.height },
    opened,
    launch: launchEvidence,
    screenshot: relative(process.cwd(), screenshotPath),
    primary_control: primaryControl,
    focus: focusEvidence,
    layout: layoutEvidence,
    states: stateEvidence,
    app_workflow: workflowEvidence,
    console_events: consoleEvents.slice(consoleStart),
    network_events: networkEvents.slice(networkStart),
    interaction_error: interactionError,
  };
}

async function ensureDesktopReady(page: Page): Promise<void> {
  if (!await hasReusableDesktop(page)) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  }
  await page.waitForSelector('.desktop-icons', { timeout: 30_000 });
  await page.waitForFunction(() => {
    const loading = document.getElementById('loading-screen');
    return !loading || loading.style.display === 'none';
  }, null, { timeout: 10_000 }).catch(() => undefined);
  const expectedAppIds = VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => app.id);
  await page.waitForFunction(
    expectedIds => {
      const desktop = (window as any).__swissknifeDesktop;
      const registeredIds = desktop?.apps ? Array.from((desktop.apps as Map<string, unknown>).keys()) : [];
      const iconIds = Array.from(document.querySelectorAll<HTMLElement>('.desktop-icons .icon[data-app]'))
        .map(icon => icon.dataset.app || '');
      return expectedIds.every(id => registeredIds.includes(id) && iconIds.includes(id));
    },
    expectedAppIds,
    { timeout: 30_000 },
  );
}

async function prepareDesktopForLaunch(page: Page): Promise<void> {
  await dismissDesktopOverlays(page);
  await cleanupWindows(page);
  await expect(page.locator('.desktop-icons')).toBeVisible();
}

async function dismissDesktopOverlays(page: Page): Promise<void> {
  const graphicsBadgeClose = page.locator('#graphics-limited-badge .close').first();
  if (await graphicsBadgeClose.isVisible().catch(() => false)) {
    await graphicsBadgeClose.click({ force: true, timeout: 1_000 }).catch(() => undefined);
  }
}

async function cleanupWindows(page: Page, appId?: string): Promise<number> {
  return page.evaluate(id => {
    const desktop = (window as any).__swissknifeDesktop;
    if (desktop?.windows instanceof Map) {
      for (const [windowId, windowRecord] of Array.from((desktop.windows as Map<string, any>).entries())) {
        if (!id || windowRecord?.appId === id) {
          const element = windowRecord?.element as HTMLElement | undefined;
          const close = element?.querySelector<HTMLElement>('.window-control.close, [data-x], button[title="Close"]');
          if (close) {
            close.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          }
          if (element?.isConnected) element.remove();
          desktop.windows.delete(windowId);
        }
      }
    }

    const selector = id ? `.window[data-app-id="${CSS.escape(id)}"], .window[data-svd-app-id="${CSS.escape(id)}"]` : '.window';
    const windows = Array.from(document.querySelectorAll<HTMLElement>(selector));
    for (const windowEl of windows) {
      const close = windowEl.querySelector<HTMLElement>('.window-control.close, [data-x], button[title="Close"]');
      if (close) {
        close.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }
      if (windowEl.isConnected) {
        windowEl.remove();
      }
    }
    return document.querySelectorAll(selector).length;
  }, appId);
}

async function hasReusableDesktop(page: Page): Promise<boolean> {
  const expectedAppIds = VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => app.id);
  return page.evaluate(expectedIds => {
    const desktop = (window as any).__swissknifeDesktop;
    const loading = document.getElementById('loading-screen');
    const loadingHidden = !loading || loading.style.display === 'none';
    const registeredIds = desktop?.apps ? Array.from((desktop.apps as Map<string, unknown>).keys()) : [];
    const iconIds = Array.from(document.querySelectorAll<HTMLElement>('.desktop-icons .icon[data-app]'))
      .map(icon => icon.dataset.app || '');
    return Boolean(loadingHidden && expectedIds.every(id => registeredIds.includes(id) && iconIds.includes(id)));
  }, expectedAppIds).catch(() => false);
}

async function waitForCanonicalWindow(
  page: Page,
  appId: string,
  previousWindowCount: number,
): Promise<Locator | null> {
  await page.waitForFunction(
    ({ id, previous }) => {
      const desktop = (window as any).__swissknifeDesktop;
      const matchingRuntimeWindow = desktop?.windows instanceof Map
        ? Array.from((desktop.windows as Map<string, any>).values()).find((windowRecord: any) =>
          windowRecord?.appId === id
            && windowRecord.element instanceof HTMLElement
            && windowRecord.element.isConnected,
        )
        : null;
      if (matchingRuntimeWindow) {
        matchingRuntimeWindow.element.dataset.appId = id;
        matchingRuntimeWindow.element.dataset.svdAppId = id;
        return true;
      }

      const windows = Array.from(document.querySelectorAll<HTMLElement>('.window'));
      return windows.length > previous && windows.some(windowEl =>
        windowEl.dataset.appId === id || windowEl.dataset.svdAppId === id,
      );
    },
    { id: appId, previous: previousWindowCount },
    { timeout: 12_000 },
  ).catch(() => undefined);

  const appWindow = page.locator(`.window[data-app-id="${cssEscape(appId)}"], .window[data-svd-app-id="${cssEscape(appId)}"]`).last();
  if (await appWindow.count() === 0) return null;
  if (!await appWindow.isVisible().catch(() => false)) return null;
  return appWindow;
}

async function waitForWindowSettled(appWindow: Locator): Promise<void> {
  await appWindow.locator('.window-loading').waitFor({ state: 'detached', timeout: 8_000 }).catch(async () => {
    await appWindow.locator('.window-loading').waitFor({ state: 'hidden', timeout: 1_000 }).catch(() => undefined);
  });
  await appWindow.waitFor({ state: 'visible', timeout: 5_000 });
}

async function selectPrimaryControl(
  appWindow: Locator,
  appId: string,
  viewportName: string,
): Promise<PrimaryControlEvidence | null> {
  const probeId = `${safeFileName(appId)}-${viewportName}-primary`;
  return appWindow.evaluate((root, id) => {
    const candidates = Array.from(root.querySelectorAll<HTMLElement>([
      'button',
      '[role="button"]',
      'input:not([type="hidden"])',
      'textarea',
      'select',
      'a[href]',
      'canvas',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',')));

    const visibleCandidates = candidates
      .filter(element => isVisible(element))
      .filter(element => !element.closest('.window-titlebar'))
      .filter(element => !element.classList.contains('window-control'))
      .filter(element => !isDisabled(element))
      .map((element, index) => ({ element, index, name: controlName(element), score: scoreControl(element) }))
      .filter(candidate => candidate.name.length > 0)
      .filter(candidate => !isTerseUtility(candidate.name))
      .sort((a, b) => b.score - a.score || a.index - b.index);

    const selected = visibleCandidates[0];
    if (!selected) return null;

    selected.element.setAttribute('data-svd-primary-control', id);
    const rect = selected.element.getBoundingClientRect();
    const tagName = selected.element.tagName.toLowerCase();
    const inputType = selected.element instanceof HTMLInputElement ? selected.element.type : undefined;

    return {
      probe_id: id,
      selector: `[data-svd-primary-control="${id}"]`,
      tag_name: tagName,
      input_type: inputType,
      role: selected.element.getAttribute('role') || undefined,
      name: selected.name,
      score: selected.score,
      visible: true,
      enabled: true,
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      action: actionFor(selected.element),
    };

    function isVisible(element: HTMLElement): boolean {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden'
        && style.display !== 'none'
        && Number(style.opacity || '1') > 0
        && rect.width > 0
        && rect.height > 0;
    }

    function isDisabled(element: HTMLElement): boolean {
      return element.hasAttribute('disabled')
        || element.getAttribute('aria-disabled') === 'true'
        || (element instanceof HTMLButtonElement && element.disabled)
        || (element instanceof HTMLInputElement && element.disabled)
        || (element instanceof HTMLTextAreaElement && element.disabled)
        || (element instanceof HTMLSelectElement && element.disabled);
    }

    function controlName(element: HTMLElement): string {
      const labelledBy = element.getAttribute('aria-labelledby');
      const labelledByText = labelledBy
        ? labelledBy.split(/\s+/).map(ref => document.getElementById(ref)?.textContent || '').join(' ')
        : '';
      const label = element instanceof HTMLInputElement && element.id
        ? root.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(element.id)}"]`)?.textContent || ''
        : '';
      const value = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? element.placeholder || element.value
        : '';
      return compact([
        element.getAttribute('aria-label'),
        labelledByText,
        element.getAttribute('title'),
        label,
        value,
        element.textContent,
        element.dataset.testid,
        element.dataset.action,
        element.id,
      ].find(part => part && part.trim()) || tagFallback(element));
    }

    function tagFallback(element: HTMLElement): string {
      if (element instanceof HTMLCanvasElement) return 'canvas';
      if (element instanceof HTMLSelectElement) return 'select';
      if (element instanceof HTMLTextAreaElement) return 'textarea';
      if (element instanceof HTMLInputElement) return `${element.type || 'input'} input`;
      return element.tagName.toLowerCase();
    }

    function scoreControl(element: HTMLElement): number {
      const name = controlName(element).toLowerCase();
      let score = 0;
      if (element.dataset.svdWorkflowAction || element.dataset.svdWorkflow) score += 160;
      if (element.dataset.liveGatewayBinding) score += 120;
      if (element.dataset.capabilityId || element.dataset.action || element.dataset.testid) score += 25;
      if (/\b(primary|action|submit|run|search|refresh|send|generate|play|open|create|add|invoke)\b/i.test(element.className)) score += 40;
      if (/refresh|search|run|open|start|new|add|send|generate|play|save|connect|browse|create|upload|invoke|success|fallback|calculate|import/i.test(name)) score += 30;
      if (name.length >= 4) score += 12;
      if (element instanceof HTMLButtonElement || element.getAttribute('role') === 'button') score += 50;
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) score += 35;
      if (element instanceof HTMLCanvasElement) score += 10;
      if (/delete|remove|kill|revoke|logout|reset|clear|stop|cancel|destroy|close/i.test(name)) score -= 120;
      return score;
    }

    function isTerseUtility(name: string): boolean {
      const trimmed = name.trim();
      return /^(c|ce|\.|=|\+|-|x|×|÷|[0-9])$/i.test(trimmed)
        || (trimmed.length <= 2 && !/[a-z]/i.test(trimmed));
    }

    function actionFor(element: HTMLElement): 'click' | 'fill' | 'select' | 'toggle' | 'range-step' {
      if (element instanceof HTMLInputElement) {
        if (element.type === 'checkbox' || element.type === 'radio') return 'toggle';
        if (element.type === 'range') return 'range-step';
        return 'fill';
      }
      if (element instanceof HTMLTextAreaElement) return 'fill';
      if (element instanceof HTMLSelectElement) return 'select';
      return 'click';
    }

    function compact(value: string): string {
      return value.replace(/\s+/g, ' ').trim().slice(0, 160);
    }
  }, probeId);
}

async function exercisePrimaryControl(control: Locator, evidence: PrimaryControlEvidence): Promise<void> {
  await control.scrollIntoViewIfNeeded();
  await control.focus().catch(() => undefined);
  if (evidence.action === 'fill') {
    evidence.action_method = 'fill';
    await control.fill('SVD-133 evidence probe').catch(async () => {
      evidence.action_method = 'keyboard-fill';
      await control.focus();
      await control.pressSequentially('SVD-133 evidence probe');
    });
  } else if (evidence.action === 'select') {
    evidence.action_method = 'select';
    const options = await control.locator('option').evaluateAll(elements =>
      elements.map(option => (option as HTMLOptionElement).value).filter(Boolean),
    ).catch(() => []);
    if (options.length > 0) {
      await control.selectOption(options[0]);
    } else {
      await control.focus();
    }
  } else if (evidence.action === 'range-step') {
    evidence.action_method = 'keyboard-step';
    await control.press('ArrowRight');
  } else {
    evidence.action_method = 'pointer';
    await control.click({ timeout: 5_000 }).catch(async error => {
      evidence.pointer_click_error = error instanceof Error ? error.message.slice(0, 1200) : String(error).slice(0, 1200);
      evidence.action_method = 'keyboard-enter';
      await control.focus();
      await control.press('Enter', { timeout: 2_000 }).catch(async () => {
        evidence.action_method = 'keyboard-space';
        await control.press('Space', { timeout: 2_000 });
      });
    });
  }
}

async function installPrimaryControlEventProbe(
  control: Locator,
  probeId: string,
): Promise<ControlEventProbeSnapshot> {
  return control.evaluate((element, id) => {
    const win = element.ownerDocument.defaultView as any;
    if (!win.__svdPrimaryControlEventProbes) win.__svdPrimaryControlEventProbes = {};
    const htmlElement = element as HTMLElement;
    const initial = readControlValue(htmlElement);
    const probe = {
      probe_id: id,
      click: 0,
      input: 0,
      change: 0,
      keydown: 0,
      focus: 0,
      before_value: initial.value,
      before_checked: initial.checked,
      before_selected_index: initial.selected_index,
      after_value: initial.value,
      after_checked: initial.checked,
      after_selected_index: initial.selected_index,
    };
    win.__svdPrimaryControlEventProbes[id] = probe;

    const update = () => {
      const current = readControlValue(htmlElement);
      probe.after_value = current.value;
      probe.after_checked = current.checked;
      probe.after_selected_index = current.selected_index;
    };
    htmlElement.addEventListener('click', () => { probe.click += 1; update(); }, { once: false });
    htmlElement.addEventListener('input', () => { probe.input += 1; update(); }, { once: false });
    htmlElement.addEventListener('change', () => { probe.change += 1; update(); }, { once: false });
    htmlElement.addEventListener('keydown', () => { probe.keydown += 1; update(); }, { once: false });
    htmlElement.addEventListener('focus', () => { probe.focus += 1; update(); }, { once: false });
    return { ...probe };

    function readControlValue(target: HTMLElement): {
      value: string;
      checked: boolean | null;
      selected_index: number | null;
    } {
      if (target instanceof HTMLInputElement) {
        return {
          value: target.value,
          checked: target.type === 'checkbox' || target.type === 'radio' ? target.checked : null,
          selected_index: null,
        };
      }
      if (target instanceof HTMLTextAreaElement) {
        return { value: target.value, checked: null, selected_index: null };
      }
      if (target instanceof HTMLSelectElement) {
        return { value: target.value, checked: null, selected_index: target.selectedIndex };
      }
      return {
        value: target.getAttribute('aria-pressed') || target.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) || '',
        checked: null,
        selected_index: null,
      };
    }
  }, probeId);
}

async function readPrimaryControlEventProbe(
  page: Page,
  probeId: string,
): Promise<ControlEventProbeSnapshot> {
  return page.evaluate(id => {
    const probe = (window as any).__svdPrimaryControlEventProbes?.[id];
    if (!probe) {
      return {
        probe_id: id,
        click: 0,
        input: 0,
        change: 0,
        keydown: 0,
        focus: 0,
        before_value: '',
        before_checked: null,
        before_selected_index: null,
        after_value: '',
        after_checked: null,
        after_selected_index: null,
      };
    }
    return { ...probe };
  }, probeId);
}

function countActionEvents(snapshot: ControlEventProbeSnapshot): number {
  return snapshot.click + snapshot.input + snapshot.change + snapshot.keydown;
}

function controlProbeValueChanged(
  before: ControlEventProbeSnapshot,
  after: ControlEventProbeSnapshot,
): boolean {
  return before.before_value !== after.after_value
    || before.before_checked !== after.after_checked
    || before.before_selected_index !== after.after_selected_index;
}

function didPrimaryControlActionSucceed(evidence: PrimaryControlEvidence): boolean {
  const probe = evidence.event_probe;
  if (!probe) return false;
  if (probe.action_event_count > 0 || probe.value_changed) return true;
  return evidence.action_method === 'fill' || evidence.action_method === 'keyboard-fill'
    ? probe.after.after_value === 'SVD-133 evidence probe'
    : false;
}

async function collectFocusEvidence(page: Page, appWindow: Locator): Promise<FocusEvidence> {
  const before = await activeElementDescriptor(page);
  await appWindow.click({ position: { x: 20, y: 20 } }).catch(() => undefined);
  await page.keyboard.press('Tab').catch(() => undefined);
  const after_tab = await activeElementDescriptor(page);
  return { before, after_tab };
}

async function collectStateEvidence(
  appWindow: Locator,
  loadingInitialCount: number,
  app: VirtualDesktopAppManifestEntry,
): Promise<StateEvidence> {
  const snapshot = await appWindow.evaluate(root => {
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 5000);
    const lower = text.toLowerCase();
    const loadingCount = root.querySelectorAll('.window-loading, [aria-busy="true"], [data-state="loading"], .loading').length;
    const emptyMatches = matchSnippets(text, /\b(no files|no tasks|no data|empty|nothing to show|no results|no conversations|no items)\b/ig);
    const errorMatches = matchSnippets(text, /\b(error|failed|unavailable|denied|offline|timeout|not connected|not configured)\b/ig);
    const recoveryControls = Array.from(root.querySelectorAll<HTMLElement>('button,[role="button"],a[href]'))
      .filter(element => element.offsetParent !== null)
      .map(element => ({
        name: (element.getAttribute('aria-label') || element.textContent || element.getAttribute('title') || '').replace(/\s+/g, ' ').trim(),
      }))
      .filter(control => /retry|refresh|recover|close|configure|connect|fallback|reload/i.test(control.name))
      .slice(0, 8);
    const visibleControlCount = Array.from(root.querySelectorAll<HTMLElement>('button,[role="button"],input:not([type="hidden"]),textarea,select,a[href],canvas'))
      .filter(element => element.offsetParent !== null)
      .length;
    return { textLength: text.length, lower, loadingCount, emptyMatches, errorMatches, recoveryControls, visibleControlCount };

    function matchSnippets(value: string, pattern: RegExp): string[] {
      const matches: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(value)) && matches.length < 8) {
        const start = Math.max(0, match.index - 50);
        const end = Math.min(value.length, match.index + match[0].length + 50);
        matches.push(value.slice(start, end).replace(/\s+/g, ' ').trim());
      }
      return matches;
    }
  });

  return {
    manifest_ux_scenarios: { ...app.ux_scenarios },
    deterministic_contract: {
      loading_state: 'window-loading indicator count at launch and after settle',
      empty_state: 'visible empty-state copy snippets from the opened app window',
      error_state: 'visible policy/error/offline snippets plus named recovery controls',
      recovery_state: 'close the actual app window and return to the desktop',
    },
    loading: {
      observed_on_launch: loadingInitialCount > 0,
      remaining_loading_indicators: snapshot.loadingCount,
    },
    empty: {
      state: snapshot.emptyMatches.length > 0 ? 'observed' : 'not_observed',
      snippets: snapshot.emptyMatches,
    },
    error: {
      state: snapshot.errorMatches.length > 0 ? 'observed' : 'not_observed',
      snippets: snapshot.errorMatches,
      recovery_controls: snapshot.recoveryControls,
    },
    deterministic_snapshot: {
      state_hash: stableHash(JSON.stringify({
        app_id: app.id,
        ux_scenarios: app.ux_scenarios,
        text_length: snapshot.textLength,
        visible_control_count: snapshot.visibleControlCount,
        loading_indicator_count: snapshot.loadingCount,
        empty_snippet_count: snapshot.emptyMatches.length,
        error_snippet_count: snapshot.errorMatches.length,
        recovery_control_count: snapshot.recoveryControls.length,
      })),
      text_length: snapshot.textLength,
      visible_control_count: snapshot.visibleControlCount,
      loading_indicator_count: snapshot.loadingCount,
      empty_snippet_count: snapshot.emptyMatches.length,
      error_snippet_count: snapshot.errorMatches.length,
      recovery_control_count: snapshot.recoveryControls.length,
    },
    recovery: {
      close_window_control_visible: false,
      closed_to_desktop: false,
      app_window_count_after_close: -1,
      close_method: 'not-available',
      harness_cleanup_performed: false,
      app_window_count_after_cleanup: -1,
    },
  };
}

async function collectViewportLayoutEvidence(page: Page, appWindow: Locator): Promise<ViewportLayoutEvidence> {
  return appWindow.evaluate((root, viewport) => {
    const rootRect = root.getBoundingClientRect();
    const windowBody = root.querySelector<HTMLElement>('.window-content, .window-body, [data-window-content]') || root;
    const textElements = collectReadableTextElements(root);
    const controls = collectVisibleControls(root);
    const layoutElements = uniqueLayoutElements([...textElements, ...controls]);
    const offscreenElements = layoutElements
      .filter(entry => intersectsVisibleWindow(entry, rootRect))
      .filter(entry => entry.rect.width > 0 && entry.rect.height > 0)
      .filter(entry => entry.rect.right > rootRect.right + 8 || entry.rect.left < rootRect.left - 8)
      .map(entry => entry.label)
      .slice(0, 20);
    const clippedTextIds = textElements
      .filter(entry => intersectsVisibleWindow(entry, rootRect))
      .filter(entry => entry.scrollWidth > entry.clientWidth + 2 || entry.scrollHeight > entry.clientHeight + 2)
      .map(entry => entry.label)
      .slice(0, 20);
    const overlapPairs = collectOverlapPairs(layoutElements);
    const horizontalOverflow = Math.ceil(windowBody.scrollWidth) > Math.ceil(windowBody.clientWidth) + 2
      || Math.ceil(root.scrollWidth) > Math.ceil(root.clientWidth) + 2;
    const unintendedDocumentOverflow = document.documentElement.scrollWidth > window.innerWidth + 2
      || document.body.scrollWidth > window.innerWidth + 2;
    const noOverlap = overlapPairs.length === 0;
    const noOffscreen = offscreenElements.length === 0;
    const noClippedText = clippedTextIds.length === 0;
    return {
      root_rect: roundRect(rootRect),
      content_box: {
        client_width: Math.round(windowBody.clientWidth),
        scroll_width: Math.round(windowBody.scrollWidth),
        client_height: Math.round(windowBody.clientHeight),
        scroll_height: Math.round(windowBody.scrollHeight),
      },
      text_element_count: textElements.length,
      visible_control_count: controls.length,
      horizontal_overflow: horizontalOverflow,
      unintended_document_overflow: unintendedDocumentOverflow,
      no_unintended_horizontal_overflow: !horizontalOverflow && !unintendedDocumentOverflow,
      no_offscreen_content: noOffscreen,
      no_text_or_control_overlap: noOverlap,
      no_clipped_readable_text: noClippedText,
      offscreen_elements: offscreenElements,
      clipped_text_ids: clippedTextIds,
      overlap_pairs: overlapPairs,
      pass: noOffscreen && noOverlap && noClippedText && !horizontalOverflow && !unintendedDocumentOverflow && controls.length > 0,
    };

    function collectReadableTextElements(scope: Element): LayoutElement[] {
      return Array.from(scope.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,p,li,label,summary,[role="status"],[role="alert"],[data-svd-vda-marker]'))
        .filter(element => isVisible(element))
        .filter(element => !element.closest('.window-titlebar'))
        .filter(element => readableText(element).length >= 2)
        .filter(element => hasVisibleOwnText(element) || isAtomicSemanticText(element))
        .filter(element => element.querySelector('button,[role="button"],input:not([type="hidden"]),textarea,select,a[href],canvas,[tabindex]:not([tabindex="-1"])') === null)
        .filter(element => Array.from(element.children).filter(child => isVisible(child as HTMLElement) && readableText(child as HTMLElement).length >= 2).length === 0)
        .slice(0, 90)
        .map((element, index) => ({
          label: elementLabel(element, index),
          tag_name: element.tagName.toLowerCase(),
          rect: roundRect(element.getBoundingClientRect()),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
        }));
    }

    function collectVisibleControls(scope: Element): LayoutElement[] {
      return Array.from(scope.querySelectorAll<HTMLElement>('button,[role="button"],input:not([type="hidden"]),textarea,select,a[href],[tabindex]:not([tabindex="-1"])'))
        .filter(element => isVisible(element))
        .filter(element => !element.closest('.window-titlebar'))
        .filter(element => !isCompositeFocusableContainer(element))
        .slice(0, 90)
        .map((element, index) => ({
          label: elementLabel(element, index),
          tag_name: element.tagName.toLowerCase(),
          rect: roundRect(element.getBoundingClientRect()),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
        }));
    }

    function uniqueLayoutElements(elements: LayoutElement[]): LayoutElement[] {
      const seen = new Set<string>();
      const unique: LayoutElement[] = [];
      for (const element of elements) {
        const label = element.label.replace(/^[a-z0-9-]+#\d+:/i, '');
        const key = [
          label,
          element.rect.left,
          element.rect.top,
          element.rect.right,
          element.rect.bottom,
        ].join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(element);
      }
      return unique;
    }

    function collectOverlapPairs(elements: LayoutElement[]): string[] {
      const pairs: string[] = [];
      for (let outer = 0; outer < elements.length; outer += 1) {
        for (let inner = outer + 1; inner < elements.length; inner += 1) {
          const first = elements[outer];
          const second = elements[inner];
          if (!intersectsVisibleWindow(first, rootRect) || !intersectsVisibleWindow(second, rootRect)) continue;
          if (isAllowedAdjacentFormPair(first, second)) continue;
          if (first.tag_name === 'canvas' || second.tag_name === 'canvas') continue;
          const overlapWidth = Math.min(first.rect.right, second.rect.right) - Math.max(first.rect.left, second.rect.left);
          const overlapHeight = Math.min(first.rect.bottom, second.rect.bottom) - Math.max(first.rect.top, second.rect.top);
          if (overlapWidth <= 1 || overlapHeight <= 1) continue;
          const overlapArea = overlapWidth * overlapHeight;
          const smallerArea = Math.min(first.rect.width * first.rect.height, second.rect.width * second.rect.height);
          if (smallerArea > 0 && overlapArea / smallerArea > 0.18) {
            pairs.push(`${first.label} overlaps ${second.label}`);
            if (pairs.length >= 20) return pairs;
          }
        }
      }
      return pairs;
    }

    function intersectsVisibleWindow(element: LayoutElement, visibleRect: DOMRect): boolean {
      return element.rect.bottom > visibleRect.top + 4 && element.rect.top < visibleRect.bottom - 4;
    }

    function isAllowedAdjacentFormPair(first: LayoutElement, second: LayoutElement): boolean {
      const pair = [first.tag_name, second.tag_name].sort().join('/');
      return pair === 'input/label' || pair === 'label/select' || pair === 'label/textarea';
    }

    function isVisible(element: HTMLElement): boolean {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || '1') > 0
        && rect.width > 0
        && rect.height > 0;
    }

    function readableText(element: HTMLElement): string {
      return (element.getAttribute('aria-label') || element.textContent || element.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
    }

    function hasVisibleOwnText(element: HTMLElement): boolean {
      return Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && (node.textContent || '').replace(/\s+/g, ' ').trim().length >= 2);
    }

    function isAtomicSemanticText(element: HTMLElement): boolean {
      const role = element.getAttribute('role');
      return (role === 'status' || role === 'alert' || element.tagName.toLowerCase() === 'summary')
        && element.children.length === 0;
    }

    function isCompositeFocusableContainer(element: HTMLElement): boolean {
      const tag = element.tagName.toLowerCase();
      const role = element.getAttribute('role');
      if (tag === 'button' || tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'a' || role === 'button') return false;
      return Boolean(element.querySelector('button,[role="button"],input:not([type="hidden"]),textarea,select,a[href],[tabindex]:not([tabindex="-1"])'));
    }

    function elementLabel(element: HTMLElement, index: number): string {
      const name = readableText(element).slice(0, 80) || element.id || element.dataset.testid || element.dataset.svdWorkflowAction || element.tagName.toLowerCase();
      return `${element.tagName.toLowerCase()}#${index}:${name}`;
    }

    function roundRect(rect: DOMRect): LayoutRect {
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
      };
    }
  }, await page.viewportSize() || { width: 0, height: 0 });
}

async function collectAppWorkflowEvidence(
  appWindow: Locator,
  appId: string,
): Promise<AppWorkflowEvidence | null> {
  if (appId === 'datasets-browser') return collectDatasetsBrowserWorkflowEvidence(appWindow);
  if (appId === 'accelerate-panel') return collectAcceleratePanelWorkflowEvidence(appWindow);
  if (appId === 'agent-supervisor') return collectAgentSupervisorWorkflowEvidence(appWindow);
  if (appId === 'calendar') return collectCalendarWorkflowEvidence(appWindow);
  if (appId === 'calculator') return collectCalculatorWorkflowEvidence(appWindow);
  if (appId === 'clock') return collectClockWorkflowEvidence(appWindow);
  if (appId === 'cinema') return collectCinemaWorkflowEvidence(appWindow);
  if (appId === 'friends-list') return collectFriendsListWorkflowEvidence(appWindow);
  if (appId === 'glasses-preview') return collectGlassesPreviewWorkflowEvidence(appWindow);
  if (appId === 'idl-explorer') return collectIDLExplorerWorkflowEvidence(appWindow);
  if (appId === 'image-viewer') return collectImageViewerWorkflowEvidence(appWindow);
  if (appId === 'media-player') return collectMediaPlayerWorkflowEvidence(appWindow);
  if (appId === 'music-studio') return collectMusicStudioWorkflowEvidence(appWindow);
  if (appId === 'neural-photoshop') return collectNeuralPhotoshopWorkflowEvidence(appWindow);
  if (appId === 'mcp-plus-plus') return collectMCPPlusPlusWorkflowEvidence(appWindow);
  if (appId === 'neural-network-designer') return collectNeuralNetworkDesignerWorkflowEvidence(appWindow);
  if (appId === 'notes') return collectNotesWorkflowEvidence(appWindow);
  if (appId === 'orb-auto-ui') return collectORBAutoUIWorkflowEvidence(appWindow);
  if (appId === 'p2p-chat') return collectP2PChatWorkflowEvidence(appWindow);
  if (appId === 'p2p-chat-unified') return collectP2PChatUnifiedWorkflowEvidence(appWindow);
  if (appId === 'peertube') return collectPeerTubeWorkflowEvidence(appWindow);
  if (appId === 'strudel') return collectStrudelWorkflowEvidence(appWindow);
  if (appId === 'strudel-ai-daw') return collectStrudelAIDAWWorkflowEvidence(appWindow);
  if (appId === 'system-monitor') return collectSystemMonitorWorkflowEvidence(appWindow);
  if (appId !== 'training-manager') return null;
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'provenance',
      'capacity-queue',
      'telemetry',
      'cancellation-confirmation',
      'checkpoints',
      'resume-recovery',
    ];
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 320))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafy[a-z0-9]+g032\b/gi) || []).slice(0, 12)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:training-manager:[a-z0-9:.-]+\b/gi) || []).slice(0, 12)));
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      provenance: markerObserved('provenance'),
      'capacity-queue': markerObserved('capacity-queue'),
      telemetry: markerObserved('telemetry'),
      'cancellation-confirmation': markerObserved('cancellation-confirmation'),
      checkpoints: markerObserved('checkpoints'),
      'resume-recovery': markerObserved('resume-recovery'),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length > 0
      && receiptRefs.length > 0
      && actionNodes.some(node => node.dataset.svdWorkflowAction === 'launch-governed-training');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'training-manager.train-with-dataset',
      vda_id: 'VDA-G032',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectCalculatorWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  const clickAction = async (action: string) => {
    await appWindow.locator(`.calc-btn[data-action="${cssEscape(action)}"]`).first().click({ timeout: 3_000 });
  };
  const clickValue = async (value: string) => {
    await appWindow.locator(`.calc-btn[data-value="${cssEscape(value)}"]`).first().click({ timeout: 3_000 });
  };

  await clickAction('clear');
  await clickValue('1');
  await clickValue('2');
  await clickAction('add');
  await clickValue('3');
  await clickAction('equals');
  const pointerResult = normalizeText(await appWindow.locator('#display-primary').textContent().catch(() => ''));

  await appWindow.locator('#verify-explanation-btn').click({ timeout: 3_000 });
  await appWindow.locator('#history-btn').click({ timeout: 3_000 });
  const historyVisible = await appWindow.locator('#history-panel').isVisible().catch(() => false);
  await appWindow.locator('#history-btn').click({ timeout: 3_000 });

  await clickAction('clear');
  await appWindow.locator('.calculator-container').focus();
  await appWindow.evaluate(root => {
    const container = root.querySelector<HTMLElement>('.calculator-container');
    if (!container) return;
    for (const key of ['9', '*', '9', 'Enter']) {
      container.dispatchEvent(new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
      }));
    }
  });
  const keyboardResult = normalizeText(await appWindow.locator('#display-primary').textContent().catch(() => ''));
  await appWindow.locator('#verify-explanation-btn').click({ timeout: 3_000 });

  await clickAction('clear');
  await clickValue('8');
  await clickAction('divide');
  await clickValue('0');
  await clickAction('equals');
  const errorText = normalizeText(await appWindow.locator('#display-error').textContent().catch(() => ''));
  const errorVisible = await appWindow.locator('#display-error').isVisible().catch(() => false);
  await clickAction('clear');
  const errorRecovered = !await appWindow.locator('#display-error').isVisible().catch(() => true);

  return appWindow.evaluate((root, { pointer, keyboard, historyOpen, error, errorWasVisible, recovered }) => {
    const requiredMarkers = [
      'calculation-cid-history',
      'verified-explanation',
      'keypad-focus',
      'error-handling',
      'responsive-layout',
    ];
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 320))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafy[a-z0-9]+g033\b/gi) || []).slice(0, 12)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:calculator:vda-g033:[a-z0-9:.-]+\b/gi) || []).slice(0, 12)));
    const historyItems = Array.from(root.querySelectorAll<HTMLElement>('.history-item'));
    const verifyButton = root.querySelector<HTMLElement>('#verify-explanation-btn');
    const panel = root.querySelector<HTMLElement>('.calculator-workflow-panel');
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'calculation-cid-history': markerObserved('calculation-cid-history')
        && historyItems.some(item => /^bafy[a-z0-9]+g033$/i.test(item.dataset.cid || ''))
        && pointer === '15',
      'verified-explanation': markerObserved('verified-explanation')
        && verifyButton?.getAttribute('aria-pressed') === 'true'
        && /Verified:/i.test(text),
      'keypad-focus': markerObserved('keypad-focus')
        && keyboard === '81'
        && root.querySelector('.calculator-container[tabindex="0"][role="application"]') !== null,
      'error-handling': markerObserved('error-handling')
        && errorWasVisible
        && /divide by zero/i.test(error)
        && recovered,
      'responsive-layout': markerObserved('responsive-layout')
        && panel !== null
        && panel.getBoundingClientRect().width <= root.getBoundingClientRect().width,
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length > 0
      && receiptRefs.length > 0
      && actionNodes.some(node => node.dataset.svdWorkflowAction === 'verify-explanation')
      && historyOpen;
    return {
      workflow_id: root.querySelector<HTMLElement>('[data-svd-workflow]')?.dataset.svdWorkflow || 'calculator.calculation-cid-history',
      vda_id: 'VDA-G033',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  }, {
    pointer: pointerResult,
    keyboard: keyboardResult,
    historyOpen: historyVisible,
    error: errorText,
    errorWasVisible: errorVisible,
    recovered: errorRecovered,
  });
}

async function collectClockWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  for (const action of [
    'start-timer-with-receipt',
    'apply-reminder-policy',
    'schedule-clock-reminder',
    'recover-notification-permission',
    'verify-compact-ui',
  ]) {
    await appWindow.locator(`[data-svd-workflow-action="${cssEscape(action)}"]`).first().click({ timeout: 3_000 });
  }

  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'timer-receipt',
      'reminder-policy',
      'scheduling-state',
      'permission-recovery',
      'compact-ui',
    ];
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 420))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafyclockg034[a-z0-9-]*\b/gi) || []).slice(0, 24)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:clock:g034:[a-z0-9:.-]+\b/gi) || []).slice(0, 24)));
    const actionNames = Array.from(new Set(actionNodes.map(node => node.dataset.svdWorkflowAction || '').filter(Boolean)));
    const timerStates = Array.from(root.querySelectorAll<HTMLElement>('[data-timer-receipt-state]')).map(node => node.dataset.timerReceiptState || '');
    const reminderPolicyStates = Array.from(root.querySelectorAll<HTMLElement>('[data-reminder-policy-state]')).map(node => node.dataset.reminderPolicyState || '');
    const schedulingStates = Array.from(root.querySelectorAll<HTMLElement>('[data-scheduling-state]')).map(node => node.dataset.schedulingState || '');
    const permissionStates = Array.from(root.querySelectorAll<HTMLElement>('[data-permission-state]')).map(node => node.dataset.permissionState || '');
    const compactStates = Array.from(root.querySelectorAll<HTMLElement>('[data-compact-ui-state]')).map(node => node.dataset.compactUiState || '');
    const compactTime = root.querySelector<HTMLElement>('#clockCompactTime');
    const compactStrip = root.querySelector<HTMLElement>('#clockCompactStrip');
    const compactEpoch = Number(compactTime?.dataset.epochMs || 0);
    const compactFresh = Number.isFinite(compactEpoch) && Math.abs(Date.now() - compactEpoch) < 120_000;
    const compactTextLooksLikeTime = /^\d{1,2}:\d{2}/.test((compactTime?.textContent || '').trim());
    const compactFits = compactStrip
      ? compactStrip.scrollWidth <= compactStrip.clientWidth + 1
        && compactStrip.getBoundingClientRect().width <= root.getBoundingClientRect().width
      : false;
    const timerDisplay = (root.querySelector<HTMLElement>('.timer-time')?.textContent || '').trim();
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'timer-receipt': markerObserved('timer-receipt')
        && actionNames.includes('start-timer-with-receipt')
        && timerStates.includes('issued')
        && checkpointRefs.some(ref => /timerreceipt/i.test(ref))
        && receiptRefs.some(ref => /timer-issued/i.test(ref))
        && /^\d{2}:\d{2}\.\d{2}$/.test(timerDisplay),
      'reminder-policy': markerObserved('reminder-policy')
        && actionNames.includes('apply-reminder-policy')
        && reminderPolicyStates.includes('active')
        && checkpointRefs.some(ref => /reminderpolicy/i.test(ref))
        && receiptRefs.some(ref => /reminder-policy/i.test(ref))
        && /notification-first|in-app banner fallback|quiet hours/i.test(text),
      'scheduling-state': markerObserved('scheduling-state')
        && actionNames.includes('schedule-clock-reminder')
        && schedulingStates.includes('scheduled')
        && /VDA-G034 Review/i.test(text)
        && checkpointRefs.some(ref => /schedulingstate/i.test(ref))
        && receiptRefs.some(ref => /scheduling-state/i.test(ref)),
      'permission-recovery': markerObserved('permission-recovery')
        && actionNames.includes('recover-notification-permission')
        && permissionStates.some(state => ['recovered', 'granted'].includes(state))
        && checkpointRefs.some(ref => /permissionrecovery/i.test(ref))
        && receiptRefs.some(ref => /permission-recovery/i.test(ref))
        && /permission recovered|Browser notifications are granted|desktop badge|retry guidance/i.test(text),
      'compact-ui': markerObserved('compact-ui')
        && actionNames.includes('verify-compact-ui')
        && compactStates.includes('accurate')
        && compactFresh
        && compactTextLooksLikeTime
        && compactFits
        && checkpointRefs.some(ref => /compactui/i.test(ref))
        && receiptRefs.some(ref => /compact-ui/i.test(ref)),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length >= 6
      && receiptRefs.length >= 6
      && actionNames.includes('start-timer-with-receipt')
      && actionNames.includes('apply-reminder-policy')
      && actionNames.includes('schedule-clock-reminder')
      && actionNames.includes('recover-notification-permission')
      && actionNames.includes('verify-compact-ui');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'clock.timer-reminder-scheduling',
      vda_id: 'VDA-G034',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectImageViewerWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'cid-retrieval',
      'metadata-ocr',
      'enhancement-job',
      'zoom-pan',
      'unsupported-format',
      'alt-text',
    ];
    for (const action of [
      'retrieve-cid-image',
      'run-metadata-ocr',
      'start-enhancement-job',
      'apply-zoom-pan',
      'show-unsupported-format',
      'refresh-alt-text',
    ]) {
      root.querySelector<HTMLElement>(`[data-svd-workflow-action="${CSS.escape(action)}"]`)?.click();
    }
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 460))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafyimageviewerg038[a-z0-9-]*\b/gi) || []).slice(0, 24)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:image-viewer:g038:[a-z0-9:.-]+\b/gi) || []).slice(0, 24)));
    const actionNames = Array.from(new Set(actionNodes.map(node => node.dataset.svdWorkflowAction || '').filter(Boolean)));
    const retrievalStates = Array.from(root.querySelectorAll<HTMLElement>('[data-retrieval-state]')).map(node => node.dataset.retrievalState || '');
    const metadataStates = Array.from(root.querySelectorAll<HTMLElement>('[data-metadata-state]')).map(node => node.dataset.metadataState || '');
    const enhancementStates = Array.from(root.querySelectorAll<HTMLElement>('[data-enhancement-state]')).map(node => node.dataset.enhancementState || '');
    const zoomStates = Array.from(root.querySelectorAll<HTMLElement>('[data-zoom-state]')).map(node => node.dataset.zoomState || '');
    const unsupportedStates = Array.from(root.querySelectorAll<HTMLElement>('[data-unsupported-format-state]')).map(node => node.dataset.unsupportedFormatState || '');
    const altTextStates = Array.from(root.querySelectorAll<HTMLElement>('[data-alt-text-state]')).map(node => node.dataset.altTextState || '');
    const progressValues = Array.from(root.querySelectorAll<HTMLProgressElement>('progress')).map(node => Number(node.value || 0));
    const imageAltTexts = Array.from(root.querySelectorAll<HTMLImageElement>('img[alt][data-cid]')).map(node => node.alt).filter(Boolean);
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'cid-retrieval': markerObserved('cid-retrieval')
        && actionNames.includes('retrieve-cid-image')
        && retrievalStates.includes('retrieved')
        && checkpointRefs.some(ref => /sourcecidretrieval/i.test(ref))
        && checkpointRefs.some(ref => /retrievalmanifest/i.test(ref))
        && receiptRefs.some(ref => /cid-retrieval/i.test(ref)),
      'metadata-ocr': markerObserved('metadata-ocr')
        && actionNames.includes('run-metadata-ocr')
        && metadataStates.includes('parsed')
        && checkpointRefs.some(ref => /metadataocr/i.test(ref))
        && receiptRefs.some(ref => /metadata-ocr/i.test(ref))
        && /OCR|metadata/i.test(text),
      'enhancement-job': markerObserved('enhancement-job')
        && actionNames.includes('start-enhancement-job')
        && enhancementStates.includes('completed')
        && progressValues.some(value => value >= 100)
        && checkpointRefs.some(ref => /enhancementjob/i.test(ref))
        && receiptRefs.some(ref => /enhancement-job/i.test(ref)),
      'zoom-pan': markerObserved('zoom-pan')
        && actionNames.includes('apply-zoom-pan')
        && zoomStates.includes('zoomed-panned')
        && checkpointRefs.some(ref => /zoompanstate/i.test(ref))
        && receiptRefs.some(ref => /zoom-pan/i.test(ref)),
      'unsupported-format': markerObserved('unsupported-format')
        && actionNames.includes('show-unsupported-format')
        && unsupportedStates.includes('rejected')
        && checkpointRefs.some(ref => /unsupportedformat/i.test(ref))
        && receiptRefs.some(ref => /unsupported-format/i.test(ref))
        && /unsupported format|rejected/i.test(text),
      'alt-text': markerObserved('alt-text')
        && actionNames.includes('refresh-alt-text')
        && altTextStates.includes('available')
        && imageAltTexts.some(alt => alt.length >= 24)
        && checkpointRefs.some(ref => /alttext/i.test(ref))
        && receiptRefs.some(ref => /alt-text/i.test(ref)),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length >= 7
      && receiptRefs.length >= 6
      && actionNames.includes('retrieve-cid-image')
      && actionNames.includes('run-metadata-ocr')
      && actionNames.includes('start-enhancement-job')
      && actionNames.includes('apply-zoom-pan')
      && actionNames.includes('show-unsupported-format')
      && actionNames.includes('refresh-alt-text');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'image-viewer.cid-metadata-enhancement',
      vda_id: 'VDA-G038',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectFriendsListWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  for (const action of [
    'review-contact-provenance',
    'apply-relationship-policy',
    'process-invitation-state',
    'toggle-blocking-state',
    'refresh-freshness',
    'show-accessible-empty-state',
  ]) {
    await appWindow.locator(`.friends-workflow-panel [data-svd-workflow-action="${cssEscape(action)}"]`).first().click({ timeout: 3_000 });
  }

  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'contact-provenance',
      'relationship-policy',
      'invitation-blocking-state',
      'freshness',
      'accessible-empty-state',
    ];
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 460))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafyfriendsg037[a-z0-9-]*\b/gi) || []).slice(0, 24)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:friends-list:g037:[a-z0-9:.-]+\b/gi) || []).slice(0, 24)));
    const eventRefs = Array.from(new Set((text.match(/\bevent:friends-list:g037:[a-z0-9:.-]+\b/gi) || []).slice(0, 12)));
    const actionNames = Array.from(new Set(actionNodes.map(node => node.dataset.svdWorkflowAction || '').filter(Boolean)));
    const provenanceStates = Array.from(root.querySelectorAll<HTMLElement>('[data-provenance-state]')).map(node => node.dataset.provenanceState || '');
    const contactProvenanceCids = Array.from(root.querySelectorAll<HTMLElement>('.friend-card[data-provenance-cid]'))
      .map(node => node.dataset.provenanceCid || '')
      .filter(Boolean);
    const relationshipPolicyStates = Array.from(root.querySelectorAll<HTMLElement>('[data-relationship-policy-state], .friend-card[data-relationship-state]'))
      .map(node => node.dataset.relationshipPolicyState || node.dataset.relationshipState || '')
      .filter(Boolean);
    const invitationStates = Array.from(root.querySelectorAll<HTMLElement>('[data-invitation-state]')).map(node => node.dataset.invitationState || '');
    const blockingStates = Array.from(root.querySelectorAll<HTMLElement>('[data-blocking-state]')).map(node => node.dataset.blockingState || '');
    const freshnessNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-freshness-state]'));
    const freshnessStates = freshnessNodes.map(node => node.dataset.freshnessState || '');
    const freshnessEpochs = freshnessNodes.map(node => Number(node.dataset.freshnessEpochMs || 0)).filter(Number.isFinite);
    const freshEpochObserved = freshnessEpochs.some(epoch => Math.abs(Date.now() - epoch) < 120_000);
    const emptyStateNode = root.querySelector<HTMLElement>('#friends-empty-state');
    const emptyStateVisible = Boolean(emptyStateNode)
      && !emptyStateNode.classList.contains('hidden')
      && emptyStateNode.getAttribute('role') === 'status'
      && emptyStateNode.getAttribute('aria-live') === 'polite'
      && emptyStateNode.tabIndex >= 0;
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'contact-provenance': markerObserved('contact-provenance')
        && actionNames.includes('review-contact-provenance')
        && provenanceStates.includes('reviewed')
        && contactProvenanceCids.length >= 3
        && checkpointRefs.some(ref => /contactprovenance/i.test(ref))
        && receiptRefs.some(ref => /contact-provenance/i.test(ref))
        && eventRefs.some(ref => /contact-link/i.test(ref)),
      'relationship-policy': markerObserved('relationship-policy')
        && actionNames.includes('apply-relationship-policy')
        && relationshipPolicyStates.includes('active')
        && relationshipPolicyStates.includes('accepted')
        && checkpointRefs.some(ref => /relationshippolicy/i.test(ref))
        && receiptRefs.some(ref => /relationship-policy/i.test(ref))
        && /mutual-consent|confirm-before-adding|suppress-presence/i.test(text),
      'invitation-blocking-state': markerObserved('invitation-blocking-state')
        && actionNames.includes('process-invitation-state')
        && actionNames.includes('toggle-blocking-state')
        && invitationStates.some(state => /pending|reviewed/i.test(state))
        && blockingStates.some(state => /blocked/i.test(state))
        && checkpointRefs.some(ref => /invitationstate/i.test(ref))
        && checkpointRefs.some(ref => /blockingstate/i.test(ref))
        && receiptRefs.some(ref => /invitation-state/i.test(ref))
        && receiptRefs.some(ref => /blocking-state/i.test(ref)),
      freshness: markerObserved('freshness')
        && actionNames.includes('refresh-freshness')
        && freshnessStates.includes('fresh')
        && freshEpochObserved
        && checkpointRefs.some(ref => /freshnesscursor/i.test(ref))
        && receiptRefs.some(ref => /freshness/i.test(ref)),
      'accessible-empty-state': markerObserved('accessible-empty-state')
        && actionNames.includes('show-accessible-empty-state')
        && emptyStateVisible
        && checkpointRefs.some(ref => /accessibleempty/i.test(ref))
        && receiptRefs.some(ref => /accessible-empty-state/i.test(ref))
        && /No matching contacts|No results match|Clear filters/i.test(text),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length >= 7
      && receiptRefs.length >= 6
      && actionNames.includes('review-contact-provenance')
      && actionNames.includes('apply-relationship-policy')
      && actionNames.includes('process-invitation-state')
      && actionNames.includes('toggle-blocking-state')
      && actionNames.includes('refresh-freshness')
      && actionNames.includes('show-accessible-empty-state');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'friends-list.contact-provenance-policy-state',
      vda_id: 'VDA-G037',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectMediaPlayerWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'cid-media',
      'captions-metadata',
      'diagnostics',
      'seek-volume',
      'missing-codec',
      'background-audio-recovery',
    ];
    for (const action of [
      'retrieve-cid-media',
      'toggle-captions-metadata',
      'run-quality-diagnostics',
      'exercise-seek-volume',
      'simulate-missing-codec',
      'recover-background-audio',
    ]) {
      root.querySelector<HTMLElement>(`[data-svd-workflow-action="${CSS.escape(action)}"]`)?.click();
    }
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 460))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafymediaplayerg040[a-z0-9-]*\b/gi) || []).slice(0, 24)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:media-player:g040:[a-z0-9:.-]+\b/gi) || []).slice(0, 24)));
    const actionNames = Array.from(new Set(actionNodes.map(node => node.dataset.svdWorkflowAction || '').filter(Boolean)));
    const playbackStates = Array.from(root.querySelectorAll<HTMLElement>('[data-playback-state]')).map(node => node.dataset.playbackState || '');
    const retrievalStates = Array.from(root.querySelectorAll<HTMLElement>('[data-retrieval-state], [data-cid-media-state]'))
      .map(node => node.dataset.retrievalState || node.dataset.cidMediaState || '');
    const captionStates = Array.from(root.querySelectorAll<HTMLElement>('[data-caption-state]')).map(node => node.dataset.captionState || '');
    const metadataStates = Array.from(root.querySelectorAll<HTMLElement>('[data-metadata-state]')).map(node => node.dataset.metadataState || '');
    const diagnosticStates = Array.from(root.querySelectorAll<HTMLElement>('[data-diagnostic-state]')).map(node => node.dataset.diagnosticState || '');
    const seekStates = Array.from(root.querySelectorAll<HTMLElement>('[data-seek-state]')).map(node => node.dataset.seekState || '');
    const volumeStates = Array.from(root.querySelectorAll<HTMLElement>('[data-volume-state]')).map(node => node.dataset.volumeState || '');
    const codecStates = Array.from(root.querySelectorAll<HTMLElement>('[data-codec-state]')).map(node => node.dataset.codecState || '');
    const fallbackStates = Array.from(root.querySelectorAll<HTMLElement>('[data-fallback-state]')).map(node => node.dataset.fallbackState || '');
    const backgroundStates = Array.from(root.querySelectorAll<HTMLElement>('[data-background-audio-state], [data-audio-route-state]'))
      .map(node => node.dataset.backgroundAudioState || node.dataset.audioRouteState || '');
    const cidNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-cid], [data-cid-media-state]'));
    const rangeInputs = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="range"]'));
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'cid-media': markerObserved('cid-media')
        && actionNames.includes('retrieve-cid-media')
        && retrievalStates.includes('retrieved')
        && playbackStates.includes('playing')
        && cidNodes.length > 0
        && checkpointRefs.some(ref => /audiocidplayback/i.test(ref))
        && checkpointRefs.some(ref => /retrievalmanifest/i.test(ref))
        && receiptRefs.some(ref => /cid-media/i.test(ref)),
      'captions-metadata': markerObserved('captions-metadata')
        && actionNames.includes('toggle-captions-metadata')
        && captionStates.includes('enabled')
        && metadataStates.includes('loaded')
        && checkpointRefs.some(ref => /captionmetadata/i.test(ref))
        && receiptRefs.some(ref => /captions-metadata/i.test(ref))
        && /VTT|caption catalog|metadata|transcript/i.test(text),
      diagnostics: markerObserved('diagnostics')
        && actionNames.includes('run-quality-diagnostics')
        && diagnosticStates.includes('transcode-ready')
        && checkpointRefs.some(ref => /transcodediagnostics/i.test(ref))
        && receiptRefs.some(ref => /diagnostics/i.test(ref))
        && /transcode recommendation|quality diagnostics|gateway RTT|LUFS/i.test(text),
      'seek-volume': markerObserved('seek-volume')
        && actionNames.includes('exercise-seek-volume')
        && seekStates.includes('bounded')
        && volumeStates.includes('bounded')
        && rangeInputs.length >= 2
        && checkpointRefs.some(ref => /seekvolume/i.test(ref))
        && receiptRefs.some(ref => /seek-volume/i.test(ref))
        && /seek checkpoint|volume 62%|mute-safe|scrubber/i.test(text),
      'missing-codec': markerObserved('missing-codec')
        && actionNames.includes('simulate-missing-codec')
        && (codecStates.includes('fallback-ready') || fallbackStates.includes('aac-preview'))
        && checkpointRefs.some(ref => /missingcodec/i.test(ref))
        && receiptRefs.some(ref => /missing-codec/i.test(ref))
        && /missing codec|unsupported ALAC|AAC preview|fallback target/i.test(text),
      'background-audio-recovery': markerObserved('background-audio-recovery')
        && actionNames.includes('recover-background-audio')
        && backgroundStates.includes('recovered')
        && checkpointRefs.some(ref => /backgroundaudiorecovery/i.test(ref))
        && receiptRefs.some(ref => /background-audio/i.test(ref))
        && /Background audio recovered|route loss|resume token|desktop focus/i.test(text),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length >= 7
      && receiptRefs.length >= 6
      && actionNames.includes('retrieve-cid-media')
      && actionNames.includes('toggle-captions-metadata')
      && actionNames.includes('run-quality-diagnostics')
      && actionNames.includes('exercise-seek-volume')
      && actionNames.includes('simulate-missing-codec')
      && actionNames.includes('recover-background-audio');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'media-player.cid-audio-quality-recovery',
      vda_id: 'VDA-G040',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectNeuralPhotoshopWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'source-result-cids',
      'prompt-model-provenance',
      'generation-progress',
      'edit-progress',
      'cancellation',
      'denial',
      'comparison-ui',
    ];
    for (const action of [
      'load-source-cid',
      'start-generation',
      'apply-edit-progress',
      'cancel-generation',
      'simulate-policy-denial',
      'open-comparison-ui',
    ]) {
      root.querySelector<HTMLElement>(`[data-svd-workflow-action="${CSS.escape(action)}"]`)?.click();
    }
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 520))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafyneuralphotoshopg042[a-z0-9-]*\b/gi) || []).slice(0, 28)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:neural-photoshop:g042:[a-z0-9:.-]+\b/gi) || []).slice(0, 28)));
    const actionNames = actionNodes.map(node => node.dataset.svdWorkflowAction || '');
    const sourceStates = Array.from(root.querySelectorAll<HTMLElement>('[data-source-cid-state]')).map(node => node.dataset.sourceCidState || '');
    const resultStates = Array.from(root.querySelectorAll<HTMLElement>('[data-result-cid-state]')).map(node => node.dataset.resultCidState || '');
    const promptStates = Array.from(root.querySelectorAll<HTMLElement>('[data-prompt-provenance-state]')).map(node => node.dataset.promptProvenanceState || '');
    const modelStates = Array.from(root.querySelectorAll<HTMLElement>('[data-model-provenance-state]')).map(node => node.dataset.modelProvenanceState || '');
    const generationStates = Array.from(root.querySelectorAll<HTMLElement>('[data-generation-state]')).map(node => node.dataset.generationState || '');
    const editStates = Array.from(root.querySelectorAll<HTMLElement>('[data-edit-state]')).map(node => node.dataset.editState || '');
    const cancellationStates = Array.from(root.querySelectorAll<HTMLElement>('[data-cancellation-state]')).map(node => node.dataset.cancellationState || '');
    const denialStates = Array.from(root.querySelectorAll<HTMLElement>('[data-denial-state]')).map(node => node.dataset.denialState || '');
    const comparisonStates = Array.from(root.querySelectorAll<HTMLElement>('[data-comparison-state]')).map(node => node.dataset.comparisonState || '');
    const progressValues = Array.from(root.querySelectorAll<HTMLProgressElement>('progress')).map(node => Number(node.value || 0));
    const comparisonPanes = Array.from(root.querySelectorAll<HTMLElement>('[data-comparison-pane]')).map(node => node.dataset.comparisonPane || '');
    const comparisonSliders = Array.from(root.querySelectorAll<HTMLInputElement>('[data-comparison-slider]')).map(node => Number(node.value || 0));
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'source-result-cids': markerObserved('source-result-cids')
        && actionNames.includes('load-source-cid')
        && sourceStates.includes('loaded')
        && resultStates.includes('stored')
        && checkpointRefs.some(ref => /sourcecid/i.test(ref))
        && checkpointRefs.some(ref => /resultcid/i.test(ref))
        && receiptRefs.some(ref => /source-result-cids/i.test(ref)),
      'prompt-model-provenance': markerObserved('prompt-model-provenance')
        && promptStates.includes('recorded')
        && modelStates.includes('recorded')
        && checkpointRefs.some(ref => /promptprovenance/i.test(ref))
        && checkpointRefs.some(ref => /modelprovenance/i.test(ref))
        && receiptRefs.some(ref => /prompt-model-provenance/i.test(ref))
        && /stable-diffusion-xl-refiner|prompt:/i.test(text),
      'generation-progress': markerObserved('generation-progress')
        && actionNames.includes('start-generation')
        && generationStates.includes('completed')
        && progressValues.some(value => value >= 100)
        && checkpointRefs.some(ref => /generationprogress/i.test(ref))
        && receiptRefs.some(ref => /generation-progress/i.test(ref)),
      'edit-progress': markerObserved('edit-progress')
        && actionNames.includes('apply-edit-progress')
        && editStates.includes('completed')
        && progressValues.some(value => value >= 100)
        && checkpointRefs.some(ref => /editprogress/i.test(ref))
        && receiptRefs.some(ref => /edit-progress/i.test(ref)),
      cancellation: markerObserved('cancellation')
        && actionNames.includes('cancel-generation')
        && cancellationStates.includes('cancelled')
        && checkpointRefs.some(ref => /cancellation/i.test(ref))
        && receiptRefs.some(ref => /cancellation/i.test(ref)),
      denial: markerObserved('denial')
        && actionNames.includes('simulate-policy-denial')
        && denialStates.includes('denied')
        && checkpointRefs.some(ref => /denial/i.test(ref))
        && receiptRefs.some(ref => /denial/i.test(ref))
        && /policy denial|default_deny|rejected/i.test(text),
      'comparison-ui': markerObserved('comparison-ui')
        && actionNames.includes('open-comparison-ui')
        && comparisonStates.includes('open')
        && comparisonPanes.includes('source')
        && comparisonPanes.includes('result')
        && comparisonSliders.some(value => value > 0)
        && checkpointRefs.some(ref => /comparisonui/i.test(ref))
        && receiptRefs.some(ref => /comparison-ui/i.test(ref)),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length >= 9
      && receiptRefs.length >= 7
      && actionNames.includes('load-source-cid')
      && actionNames.includes('start-generation')
      && actionNames.includes('apply-edit-progress')
      && actionNames.includes('cancel-generation')
      && actionNames.includes('simulate-policy-denial')
      && actionNames.includes('open-comparison-ui');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'neural-photoshop.source-result-provenance-edit',
      vda_id: 'VDA-G042',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectCinemaWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'project-media-cids',
      'rights-metadata',
      'render-queue',
      'failed-export',
      'playback-fallback',
      'stable-timeline-controls',
    ];
    for (const action of [
      'load-project-media-cids',
      'verify-rights-metadata',
      'submit-render-queue',
      'simulate-failed-export',
      'activate-playback-fallback',
      'stabilize-timeline-controls',
    ]) {
      root.querySelector<HTMLElement>(`[data-svd-workflow-action="${CSS.escape(action)}"]`)?.click();
    }
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 520))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafycinemag043[a-z0-9-]*\b/gi) || []).slice(0, 24)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:cinema:g043:[a-z0-9:.-]+\b/gi) || []).slice(0, 24)));
    const actionNames = Array.from(new Set(actionNodes.map(node => node.dataset.svdWorkflowAction || '').filter(Boolean)));
    const projectStates = Array.from(root.querySelectorAll<HTMLElement>('[data-project-cid-state]')).map(node => node.dataset.projectCidState || '');
    const mediaStates = Array.from(root.querySelectorAll<HTMLElement>('[data-media-cid-state]')).map(node => node.dataset.mediaCidState || '');
    const rightsStates = Array.from(root.querySelectorAll<HTMLElement>('[data-rights-state]')).map(node => node.dataset.rightsState || '');
    const renderQueueStates = Array.from(root.querySelectorAll<HTMLElement>('[data-render-queue-state]')).map(node => node.dataset.renderQueueState || '');
    const exportStates = Array.from(root.querySelectorAll<HTMLElement>('[data-export-state]')).map(node => node.dataset.exportState || '');
    const fallbackStates = Array.from(root.querySelectorAll<HTMLElement>('[data-playback-fallback-state]')).map(node => node.dataset.playbackFallbackState || '');
    const playbackStates = Array.from(root.querySelectorAll<HTMLElement>('[data-playback-state]')).map(node => node.dataset.playbackState || '');
    const timelineStates = Array.from(root.querySelectorAll<HTMLElement>('[data-timeline-state]')).map(node => node.dataset.timelineState || '');
    const renderProgressValues = Array.from(root.querySelectorAll<HTMLProgressElement>('progress[data-render-progress]')).map(node => Number(node.value || 0));
    const timelineControls = Array.from(root.querySelectorAll<HTMLInputElement>('[data-timeline-control]')).map(node => ({
      control: node.dataset.timelineControl || '',
      value: Number(node.value || 0),
      min: Number(node.min || 0),
      max: Number(node.max || 0),
    }));
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'project-media-cids': markerObserved('project-media-cids')
        && actionNames.includes('load-project-media-cids')
        && projectStates.includes('loaded')
        && mediaStates.includes('loaded')
        && checkpointRefs.some(ref => /projectcid/i.test(ref))
        && checkpointRefs.some(ref => /mediacid/i.test(ref))
        && receiptRefs.some(ref => /project-media-cids/i.test(ref)),
      'rights-metadata': markerObserved('rights-metadata')
        && actionNames.includes('verify-rights-metadata')
        && rightsStates.includes('verified')
        && checkpointRefs.some(ref => /rightsmetadata/i.test(ref))
        && receiptRefs.some(ref => /rights-metadata/i.test(ref))
        && /CC-BY-4\.0|creator release|license/i.test(text),
      'render-queue': markerObserved('render-queue')
        && actionNames.includes('submit-render-queue')
        && renderQueueStates.includes('queued')
        && renderProgressValues.some(value => value >= 50)
        && checkpointRefs.some(ref => /renderqueue/i.test(ref))
        && receiptRefs.some(ref => /render-queue/i.test(ref)),
      'failed-export': markerObserved('failed-export')
        && actionNames.includes('simulate-failed-export')
        && exportStates.includes('failed-recoverable')
        && checkpointRefs.some(ref => /failedexport/i.test(ref))
        && receiptRefs.some(ref => /failed-export/i.test(ref))
        && /failed|encoder unavailable|fallback queued/i.test(text),
      'playback-fallback': markerObserved('playback-fallback')
        && actionNames.includes('activate-playback-fallback')
        && fallbackStates.includes('active')
        && playbackStates.includes('fallback-preview')
        && checkpointRefs.some(ref => /playbackfallback/i.test(ref))
        && receiptRefs.some(ref => /playback-fallback/i.test(ref)),
      'stable-timeline-controls': markerObserved('stable-timeline-controls')
        && actionNames.includes('stabilize-timeline-controls')
        && timelineStates.includes('stable')
        && timelineControls.some(control => control.control === 'playhead' && control.value > control.min && control.value < control.max)
        && timelineControls.some(control => control.control === 'zoom' && control.value >= 100)
        && checkpointRefs.some(ref => /timelinecontrols/i.test(ref))
        && receiptRefs.some(ref => /stable-timeline-controls/i.test(ref)),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length >= 7
      && receiptRefs.length >= 6
      && actionNames.includes('load-project-media-cids')
      && actionNames.includes('verify-rights-metadata')
      && actionNames.includes('submit-render-queue')
      && actionNames.includes('simulate-failed-export')
      && actionNames.includes('activate-playback-fallback')
      && actionNames.includes('stabilize-timeline-controls');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'cinema.project-media-render-provenance',
      vda_id: 'VDA-G043',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectCalendarWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'artifact-backed-events',
      'semantic-search',
      'reminders',
      'conflict-handling',
      'mobile-summary',
    ];
    for (const action of [
      'persist-event-artifact',
      'run-semantic-search',
      'schedule-reminder',
      'resolve-conflict',
      'refresh-mobile-summary',
    ]) {
      root.querySelector<HTMLElement>(`[data-svd-workflow-action="${CSS.escape(action)}"]`)?.click();
    }
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 420))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafycalg035[a-z0-9-]*\b/gi) || []).slice(0, 24)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:calendar:g035:[a-z0-9:.-]+\b/gi) || []).slice(0, 24)));
    const eventRefs = Array.from(new Set((text.match(/\bevent:calendar:g035:[a-z0-9:.-]+\b/gi) || []).slice(0, 12)));
    const actionNames = actionNodes.map(node => node.dataset.svdWorkflowAction || '');
    const conflictStates = Array.from(root.querySelectorAll<HTMLElement>('[data-conflict-state]'))
      .map(node => node.dataset.conflictState || '')
      .filter(Boolean);
    const mobileSummaryStates = Array.from(root.querySelectorAll<HTMLElement>('[data-mobile-summary-state]'))
      .map(node => node.dataset.mobileSummaryState || '')
      .filter(Boolean);
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'artifact-backed-events': markerObserved('artifact-backed-events')
        && checkpointRefs.some(ref => /eventartifact/i.test(ref))
        && checkpointRefs.some(ref => /eventdag/i.test(ref))
        && receiptRefs.some(ref => /event-artifact/i.test(ref))
        && eventRefs.some(ref => /event-created/i.test(ref)),
      'semantic-search': markerObserved('semantic-search')
        && actionNames.includes('run-semantic-search')
        && checkpointRefs.some(ref => /semanticindex/i.test(ref))
        && receiptRefs.some(ref => /semantic-search/i.test(ref))
        && /semantic_search|semantic search/i.test(text),
      reminders: markerObserved('reminders')
        && actionNames.includes('schedule-reminder')
        && checkpointRefs.some(ref => /reminderpolicy/i.test(ref))
        && receiptRefs.some(ref => /reminder-policy/i.test(ref))
        && /reminders scheduled|permission fallback|Reminder/i.test(text),
      'conflict-handling': markerObserved('conflict-handling')
        && actionNames.includes('resolve-conflict')
        && checkpointRefs.some(ref => /conflictresolution/i.test(ref))
        && receiptRefs.some(ref => /conflict-resolution/i.test(ref))
        && conflictStates.includes('resolved')
        && /conflict|Resolved/i.test(text),
      'mobile-summary': markerObserved('mobile-summary')
        && actionNames.includes('refresh-mobile-summary')
        && checkpointRefs.some(ref => /mobilesummary/i.test(ref))
        && receiptRefs.some(ref => /mobile-summary/i.test(ref))
        && mobileSummaryStates.includes('compact')
        && /mobile summary|events; next|compact/i.test(text),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length >= 6
      && receiptRefs.length >= 5
      && eventRefs.length >= 5
      && actionNames.includes('persist-event-artifact')
      && actionNames.includes('run-semantic-search')
      && actionNames.includes('schedule-reminder')
      && actionNames.includes('resolve-conflict')
      && actionNames.includes('refresh-mobile-summary');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'calendar.artifact-backed-scheduling',
      vda_id: 'VDA-G035',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectNotesWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'note-cids',
      'semantic-search',
      'provenance',
      'summary',
      'conflict-recovery',
      'keyboard-safe-editing',
    ];
    for (const action of [
      'persist-note-cid',
      'run-semantic-search',
      'record-provenance',
      'generate-summary',
      'recover-conflict',
      'verify-keyboard-editing',
    ]) {
      root.querySelector<HTMLElement>(`[data-svd-workflow-action="${CSS.escape(action)}"]`)?.click();
    }
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 460))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafynotesg039[a-z0-9-]*\b/gi) || []).slice(0, 28)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:notes:g039:[a-z0-9:.-]+\b/gi) || []).slice(0, 28)));
    const eventRefs = Array.from(new Set((text.match(/\bevent:notes:g039:[a-z0-9:.-]+\b/gi) || []).slice(0, 16)));
    const actionNames = actionNodes.map(node => node.dataset.svdWorkflowAction || '');
    const conflictStates = Array.from(root.querySelectorAll<HTMLElement>('[data-conflict-state]'))
      .map(node => node.dataset.conflictState || '')
      .filter(Boolean);
    const keyboardStates = Array.from(root.querySelectorAll<HTMLElement>('[data-keyboard-safe-state]'))
      .map(node => node.dataset.keyboardSafeState || '')
      .filter(Boolean);
    const syncStates = Array.from(root.querySelectorAll<HTMLElement>('[data-sync-state]'))
      .map(node => node.dataset.syncState || '')
      .filter(Boolean);
    const summaryStates = Array.from(root.querySelectorAll<HTMLElement>('[data-summary-state]'))
      .map(node => node.dataset.summaryState || '')
      .filter(Boolean);
    const semanticStates = Array.from(root.querySelectorAll<HTMLElement>('[data-semantic-search-state]'))
      .map(node => node.dataset.semanticSearchState || '')
      .filter(Boolean);
    const provenanceStates = Array.from(root.querySelectorAll<HTMLElement>('[data-provenance-state]'))
      .map(node => node.dataset.provenanceState || '')
      .filter(Boolean);
    const citationLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="ipfs://"]'))
      .map(node => node.href)
      .filter(Boolean);
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'note-cids': markerObserved('note-cids')
        && actionNames.includes('persist-note-cid')
        && checkpointRefs.some(ref => /notecid/i.test(ref))
        && checkpointRefs.some(ref => /notebookmanifest/i.test(ref))
        && checkpointRefs.some(ref => /syncdag/i.test(ref))
        && receiptRefs.some(ref => /note-cids/i.test(ref))
        && syncStates.includes('synchronized'),
      'semantic-search': markerObserved('semantic-search')
        && actionNames.includes('run-semantic-search')
        && checkpointRefs.some(ref => /semanticindex/i.test(ref))
        && receiptRefs.some(ref => /semantic-search/i.test(ref))
        && semanticStates.includes('indexed')
        && /semantic_search|semantic search/i.test(text),
      provenance: markerObserved('provenance')
        && actionNames.includes('record-provenance')
        && checkpointRefs.some(ref => /provenanceledger/i.test(ref))
        && receiptRefs.some(ref => /provenance/i.test(ref))
        && provenanceStates.includes('recorded')
        && /did:key|provenance ledger|notes\.provenance/i.test(text),
      summary: markerObserved('summary')
        && actionNames.includes('generate-summary')
        && checkpointRefs.some(ref => /summaryjob/i.test(ref))
        && receiptRefs.some(ref => /summary/i.test(ref))
        && summaryStates.includes('complete')
        && /Summary CID|summary job|Tags/i.test(text),
      'conflict-recovery': markerObserved('conflict-recovery')
        && actionNames.includes('recover-conflict')
        && checkpointRefs.some(ref => /conflictrecovery/i.test(ref))
        && checkpointRefs.some(ref => /conflictlocal/i.test(ref))
        && checkpointRefs.some(ref => /conflictremote/i.test(ref))
        && receiptRefs.some(ref => /conflict-recovery/i.test(ref))
        && conflictStates.includes('recovered')
        && /conflict recovered|remote citations merged|Conflict recovery/i.test(text),
      'keyboard-safe-editing': markerObserved('keyboard-safe-editing')
        && actionNames.includes('verify-keyboard-editing')
        && checkpointRefs.some(ref => /keyboardedit/i.test(ref))
        && receiptRefs.some(ref => /keyboard-safe-editing/i.test(ref))
        && keyboardStates.includes('verified')
        && /Ctrl\+S|Ctrl\+K|Escape editor focus recovery/i.test(text),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length >= 8
      && receiptRefs.length >= 7
      && eventRefs.length >= 6
      && citationLinks.length >= 1
      && actionNames.includes('persist-note-cid')
      && actionNames.includes('run-semantic-search')
      && actionNames.includes('record-provenance')
      && actionNames.includes('generate-summary')
      && actionNames.includes('recover-conflict')
      && actionNames.includes('verify-keyboard-editing');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'notes.provenance-rich-sync',
      vda_id: 'VDA-G039',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectPeerTubeWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'cid-playback',
      'captions',
      'diagnostics',
      'buffering-recovery',
      'missing-content-recovery',
      'media-fallback',
    ];
    for (const action of [
      'retrieve-cid-playback',
      'toggle-captions',
      'run-quality-diagnostics',
      'recover-buffering',
      'recover-missing-content',
      'activate-media-fallback',
    ]) {
      root.querySelector<HTMLElement>(`[data-svd-workflow-action="${CSS.escape(action)}"]`)?.click();
    }
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 460))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafypeertubeg036[a-z0-9-]*\b/gi) || []).slice(0, 24)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:peertube:g036:[a-z0-9:.-]+\b/gi) || []).slice(0, 24)));
    const actionNames = actionNodes.map(node => node.dataset.svdWorkflowAction || '');
    const videoNodes = Array.from(root.querySelectorAll<HTMLElement>('video[data-cid], [data-playback-state], [data-caption-state], [data-media-fallback]'));
    const playbackStates = Array.from(root.querySelectorAll<HTMLElement>('[data-playback-state]')).map(node => node.dataset.playbackState || '');
    const captionStates = Array.from(root.querySelectorAll<HTMLElement>('[data-caption-state]')).map(node => node.dataset.captionState || '');
    const diagnosticStates = Array.from(root.querySelectorAll<HTMLElement>('[data-diagnostic-state]')).map(node => node.dataset.diagnosticState || '');
    const bufferStates = Array.from(root.querySelectorAll<HTMLElement>('[data-buffer-state]')).map(node => node.dataset.bufferState || '');
    const missingStates = Array.from(root.querySelectorAll<HTMLElement>('[data-missing-content-state]')).map(node => node.dataset.missingContentState || '');
    const fallbackStates = Array.from(root.querySelectorAll<HTMLElement>('[data-media-fallback], [data-fallback-state]'))
      .map(node => node.dataset.mediaFallback || node.dataset.fallbackState || '');
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'cid-playback': markerObserved('cid-playback')
        && actionNames.includes('retrieve-cid-playback')
        && checkpointRefs.some(ref => /videocidplayback/i.test(ref))
        && checkpointRefs.some(ref => /retrievalmanifest/i.test(ref))
        && receiptRefs.some(ref => /cid-playback/i.test(ref))
        && playbackStates.includes('playing')
        && videoNodes.length > 0,
      captions: markerObserved('captions')
        && actionNames.includes('toggle-captions')
        && checkpointRefs.some(ref => /captioncatalog/i.test(ref))
        && receiptRefs.some(ref => /captions/i.test(ref))
        && captionStates.includes('enabled')
        && /VTT|caption catalog|transcript/i.test(text),
      diagnostics: markerObserved('diagnostics')
        && actionNames.includes('run-quality-diagnostics')
        && checkpointRefs.some(ref => /transcodediagnostics/i.test(ref))
        && receiptRefs.some(ref => /diagnostics/i.test(ref))
        && diagnosticStates.includes('transcode-ready')
        && /transcode|quality diagnostics|720p|gateway RTT/i.test(text),
      'buffering-recovery': markerObserved('buffering-recovery')
        && actionNames.includes('recover-buffering')
        && checkpointRefs.some(ref => /bufferrecovery/i.test(ref))
        && receiptRefs.some(ref => /buffering/i.test(ref))
        && bufferStates.includes('recovered')
        && /buffering recovered|quality downgrade|resumed/i.test(text),
      'missing-content-recovery': markerObserved('missing-content-recovery')
        && actionNames.includes('recover-missing-content')
        && checkpointRefs.some(ref => /missingcontentrecovery/i.test(ref))
        && receiptRefs.some(ref => /missing-content/i.test(ref))
        && missingStates.includes('recovered')
        && /missing content recovered|mirrored provider|unavailable segment/i.test(text),
      'media-fallback': markerObserved('media-fallback')
        && actionNames.includes('activate-media-fallback')
        && checkpointRefs.some(ref => /mediafallback/i.test(ref))
        && receiptRefs.some(ref => /media-fallback/i.test(ref))
        && fallbackStates.includes('audio-summary')
        && /fallback target audio-summary|media fallback active|codec/i.test(text),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length >= 7
      && receiptRefs.length >= 6
      && actionNames.includes('retrieve-cid-playback')
      && actionNames.includes('toggle-captions')
      && actionNames.includes('run-quality-diagnostics')
      && actionNames.includes('recover-buffering')
      && actionNames.includes('recover-missing-content')
      && actionNames.includes('activate-media-fallback');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'peertube.cid-playback-quality-recovery',
      vda_id: 'VDA-G036',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectStrudelWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'session-sample-cids',
      'pattern-context',
      'optional-assistance',
      'compile-audio-errors',
      'session-restore',
    ];
    for (const action of [
      'load-session-sample-cids',
      'inspect-pattern-context',
      'request-optional-assistance',
      'simulate-compile-error',
      'simulate-audio-error',
      'restore-session',
    ]) {
      root.querySelector<HTMLElement>(`[data-svd-workflow-action="${CSS.escape(action)}"]`)?.click();
    }
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 520))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafystrudelg044[a-z0-9-]*\b/gi) || []).slice(0, 24)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:strudel:g044:[a-z0-9:.-]+\b/gi) || []).slice(0, 24)));
    const actionNames = Array.from(new Set(actionNodes.map(node => node.dataset.svdWorkflowAction || '').filter(Boolean)));
    const sessionStates = Array.from(root.querySelectorAll<HTMLElement>('[data-session-cid-state]')).map(node => node.dataset.sessionCidState || '');
    const sampleStates = Array.from(root.querySelectorAll<HTMLElement>('[data-sample-cid-state]')).map(node => node.dataset.sampleCidState || '');
    const patternStates = Array.from(root.querySelectorAll<HTMLElement>('[data-pattern-context-state]')).map(node => node.dataset.patternContextState || '');
    const assistanceStates = Array.from(root.querySelectorAll<HTMLElement>('[data-assistance-state]')).map(node => node.dataset.assistanceState || '');
    const compileErrorStates = Array.from(root.querySelectorAll<HTMLElement>('[data-compile-error-state]')).map(node => node.dataset.compileErrorState || '');
    const audioErrorStates = Array.from(root.querySelectorAll<HTMLElement>('[data-audio-error-state]')).map(node => node.dataset.audioErrorState || '');
    const restoreStates = Array.from(root.querySelectorAll<HTMLElement>('[data-session-restore-state]')).map(node => node.dataset.sessionRestoreState || '');
    const restoreProofs = Array.from(root.querySelectorAll<HTMLElement>('[data-session-restore-proof]')).map(node => node.dataset.sessionRestoreProof || '');
    const statusStates = Array.from(root.querySelectorAll<HTMLElement>('[data-workflow-status]')).map(node => node.dataset.workflowStatus || '');
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'session-sample-cids': markerObserved('session-sample-cids')
        && actionNames.includes('load-session-sample-cids')
        && sessionStates.includes('loaded')
        && sampleStates.includes('loaded')
        && checkpointRefs.some(ref => /sessioncid/i.test(ref))
        && checkpointRefs.some(ref => /samplecid/i.test(ref))
        && checkpointRefs.some(ref => /eventdag/i.test(ref))
        && receiptRefs.some(ref => /session-sample-cids/i.test(ref)),
      'pattern-context': markerObserved('pattern-context')
        && actionNames.includes('inspect-pattern-context')
        && patternStates.includes('available')
        && checkpointRefs.some(ref => /patterncontext/i.test(ref))
        && receiptRefs.some(ref => /pattern-context/i.test(ref))
        && /stack\(|140 BPM|D minor|low-pass/i.test(text),
      'optional-assistance': markerObserved('optional-assistance')
        && actionNames.includes('request-optional-assistance')
        && assistanceStates.includes('optional')
        && checkpointRefs.some(ref => /optionalassistance/i.test(ref))
        && receiptRefs.some(ref => /optional-assistance/i.test(ref))
        && /optional assistant|without changing the saved pattern|can keep composing/i.test(text),
      'compile-audio-errors': markerObserved('compile-audio-errors')
        && actionNames.includes('simulate-compile-error')
        && actionNames.includes('simulate-audio-error')
        && compileErrorStates.includes('recoverable')
        && audioErrorStates.includes('fallback-active')
        && checkpointRefs.some(ref => /compileerror/i.test(ref))
        && checkpointRefs.some(ref => /audioerror/i.test(ref))
        && receiptRefs.some(ref => /compile-error/i.test(ref))
        && receiptRefs.some(ref => /audio-error/i.test(ref))
        && /compile error|audio backend error|fallback active/i.test(text),
      'session-restore': markerObserved('session-restore')
        && actionNames.includes('restore-session')
        && restoreStates.includes('restored')
        && restoreProofs.includes('local-storage')
        && statusStates.includes('session-restored')
        && checkpointRefs.some(ref => /restoredsession/i.test(ref))
        && receiptRefs.some(ref => /session-restore/i.test(ref)),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length >= 7
      && receiptRefs.length >= 6
      && actionNames.includes('load-session-sample-cids')
      && actionNames.includes('inspect-pattern-context')
      && actionNames.includes('request-optional-assistance')
      && actionNames.includes('simulate-compile-error')
      && actionNames.includes('simulate-audio-error')
      && actionNames.includes('restore-session');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'strudel.session-sample-pattern-recovery',
      vda_id: 'VDA-G044',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectMusicStudioWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'legacy-workflow',
      'artifact-workflow',
      'metadata-rights',
      'optional-render',
      'save-proof',
      'responsive-fallback',
    ];
    for (const action of [
      'preserve-legacy-flow',
      'load-artifact-cids',
      'inspect-catalog-rights',
      'start-optional-render',
      'save-classic-project',
      'prove-responsive-fallback',
    ]) {
      root.querySelector<HTMLElement>(`[data-svd-workflow-action="${CSS.escape(action)}"]`)?.click();
    }
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 560))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafymusicstudiog046[a-z0-9-]*\b/gi) || []).slice(0, 32)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:music-studio:g046:[a-z0-9:.-]+\b/gi) || []).slice(0, 32)));
    const actionNames = Array.from(new Set(actionNodes.map(node => node.dataset.svdWorkflowAction || '').filter(Boolean)));
    const legacyStates = Array.from(root.querySelectorAll<HTMLElement>('[data-legacy-workflow-state]')).map(node => node.dataset.legacyWorkflowState || '');
    const legacyProofs = Array.from(root.querySelectorAll<HTMLElement>('[data-legacy-control-proof]')).map(node => node.dataset.legacyControlProof || '');
    const artifactStates = Array.from(root.querySelectorAll<HTMLElement>('[data-artifact-state]')).map(node => node.dataset.artifactState || '');
    const metadataStates = Array.from(root.querySelectorAll<HTMLElement>('[data-metadata-rights-state]')).map(node => node.dataset.metadataRightsState || '');
    const renderStates = Array.from(root.querySelectorAll<HTMLElement>('[data-render-state]')).map(node => node.dataset.renderState || '');
    const renderJobStates = Array.from(root.querySelectorAll<HTMLElement>('[data-render-job-state]')).map(node => node.dataset.renderJobState || '');
    const renderProgressValues = Array.from(root.querySelectorAll<HTMLProgressElement>('progress[data-render-progress]')).map(node => Number(node.value || 0));
    const saveStates = Array.from(root.querySelectorAll<HTMLElement>('[data-save-state]')).map(node => node.dataset.saveState || '');
    const saveProofs = Array.from(root.querySelectorAll<HTMLElement>('[data-save-proof]')).map(node => node.dataset.saveProof || '');
    const fallbackStates = Array.from(root.querySelectorAll<HTMLElement>('[data-responsive-fallback-state]')).map(node => node.dataset.responsiveFallbackState || '');
    const fallbackProofs = Array.from(root.querySelectorAll<HTMLElement>('[data-responsive-fallback-proof]')).map(node => node.dataset.responsiveFallbackProof || '');
    const visibleLegacyControls = Array.from(root.querySelectorAll<HTMLElement>([
      '#new-project',
      '#record-btn',
      '#import-audio',
      '#start-collaboration',
      '#export-project',
      '.btn-instrument',
      '.btn-drum',
    ].join(','))).filter(node => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }).length;
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'legacy-workflow': markerObserved('legacy-workflow')
        && actionNames.includes('preserve-legacy-flow')
        && legacyStates.includes('preserved')
        && legacyProofs.includes('record-instrument-collaboration-export')
        && visibleLegacyControls >= 7
        && /Record|Import|Collaborate|Export|Synthesizers|Drums/i.test(text),
      'artifact-workflow': markerObserved('artifact-workflow')
        && actionNames.includes('load-artifact-cids')
        && artifactStates.includes('loaded')
        && checkpointRefs.some(ref => /projectassetcid/i.test(ref))
        && checkpointRefs.some(ref => /stemaudiocid/i.test(ref))
        && checkpointRefs.some(ref => /mixartifactcid/i.test(ref))
        && checkpointRefs.some(ref => /eventdag/i.test(ref))
        && receiptRefs.some(ref => /artifact-cids/i.test(ref)),
      'metadata-rights': markerObserved('metadata-rights')
        && actionNames.includes('inspect-catalog-rights')
        && metadataStates.includes('verified')
        && checkpointRefs.some(ref => /catalogrights/i.test(ref))
        && receiptRefs.some(ref => /catalog-rights/i.test(ref))
        && /CC-BY-4\.0|creator release|commercial sync|attribution/i.test(text),
      'optional-render': markerObserved('optional-render')
        && actionNames.includes('start-optional-render')
        && renderStates.includes('optional')
        && renderJobStates.includes('queued')
        && renderProgressValues.some(value => value >= 50)
        && checkpointRefs.some(ref => /optionalrender/i.test(ref))
        && receiptRefs.some(ref => /optional-render/i.test(ref))
        && /Optional render job queued|classic project stays editable|render services are unavailable/i.test(text),
      'save-proof': markerObserved('save-proof')
        && actionNames.includes('save-classic-project')
        && saveStates.includes('saved')
        && saveProofs.includes('local-project-bundle')
        && checkpointRefs.some(ref => /savebundle/i.test(ref))
        && receiptRefs.some(ref => /save-project/i.test(ref))
        && receiptRefs.some(ref => /restore-state/i.test(ref)),
      'responsive-fallback': markerObserved('responsive-fallback')
        && actionNames.includes('prove-responsive-fallback')
        && fallbackStates.includes('active')
        && fallbackProofs.includes('mobile-ready')
        && checkpointRefs.some(ref => /responsivefallback/i.test(ref))
        && receiptRefs.some(ref => /responsive-fallback/i.test(ref))
        && /compact stacked panels|narrow screens|artifact save|render status/i.test(text),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length >= 8
      && receiptRefs.length >= 7
      && actionNames.includes('preserve-legacy-flow')
      && actionNames.includes('load-artifact-cids')
      && actionNames.includes('inspect-catalog-rights')
      && actionNames.includes('start-optional-render')
      && actionNames.includes('save-classic-project')
      && actionNames.includes('prove-responsive-fallback');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'music-studio.classic-artifact-save-render-fallback',
      vda_id: 'VDA-G046',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectStrudelAIDAWWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'asset-provenance',
      'assisted-composition',
      'render-state',
      'undo',
      'failed-audio-backend',
      'compact-controls',
    ];
    for (const action of [
      'load-asset-provenance',
      'request-assisted-composition',
      'start-render-job',
      'undo-ai-change',
      'simulate-audio-backend-failure',
      'toggle-compact-controls',
    ]) {
      root.querySelector<HTMLElement>(`[data-svd-workflow-action="${CSS.escape(action)}"]`)?.click();
    }
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 560))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafystrudelaidawg045[a-z0-9-]*\b/gi) || []).slice(0, 32)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:strudel-ai-daw:g045:[a-z0-9:.-]+\b/gi) || []).slice(0, 32)));
    const actionNames = Array.from(new Set(actionNodes.map(node => node.dataset.svdWorkflowAction || '').filter(Boolean)));
    const assetStates = Array.from(root.querySelectorAll<HTMLElement>('[data-asset-provenance-state]')).map(node => node.dataset.assetProvenanceState || '');
    const projectStates = Array.from(root.querySelectorAll<HTMLElement>('[data-project-cid-state]')).map(node => node.dataset.projectCidState || '');
    const mediaStates = Array.from(root.querySelectorAll<HTMLElement>('[data-media-cid-state]')).map(node => node.dataset.mediaCidState || '');
    const assistedStates = Array.from(root.querySelectorAll<HTMLElement>('[data-assisted-composition-state]')).map(node => node.dataset.assistedCompositionState || '');
    const assistantEditStates = Array.from(root.querySelectorAll<HTMLElement>('[data-assistant-edit-state]')).map(node => node.dataset.assistantEditState || '');
    const renderStates = Array.from(root.querySelectorAll<HTMLElement>('[data-render-state]')).map(node => node.dataset.renderState || '');
    const renderJobStates = Array.from(root.querySelectorAll<HTMLElement>('[data-render-job-state]')).map(node => node.dataset.renderJobState || '');
    const undoStates = Array.from(root.querySelectorAll<HTMLElement>('[data-undo-state]')).map(node => node.dataset.undoState || '');
    const undoProofs = Array.from(root.querySelectorAll<HTMLElement>('[data-undo-proof]')).map(node => node.dataset.undoProof || '');
    const audioBackendStates = Array.from(root.querySelectorAll<HTMLElement>('[data-audio-backend-state]')).map(node => node.dataset.audioBackendState || '');
    const audioFallbackStates = Array.from(root.querySelectorAll<HTMLElement>('[data-audio-fallback-state]')).map(node => node.dataset.audioFallbackState || '');
    const compactStates = Array.from(root.querySelectorAll<HTMLElement>('[data-compact-controls-state]')).map(node => node.dataset.compactControlsState || '');
    const compactProofs = Array.from(root.querySelectorAll<HTMLElement>('[data-compact-controls-proof]')).map(node => node.dataset.compactControlsProof || '');
    const renderProgressValues = Array.from(root.querySelectorAll<HTMLProgressElement>('progress[data-render-progress]')).map(node => Number(node.value || 0));
    const compactButtons = Array.from(root.querySelectorAll<HTMLElement>('.transport-btn, .svd-g045-actions button')).length;
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'asset-provenance': markerObserved('asset-provenance')
        && actionNames.includes('load-asset-provenance')
        && assetStates.includes('verified')
        && projectStates.includes('loaded')
        && mediaStates.includes('loaded')
        && checkpointRefs.some(ref => /projectcid/i.test(ref))
        && checkpointRefs.some(ref => /mediacid/i.test(ref))
        && checkpointRefs.some(ref => /samplelibrary/i.test(ref))
        && checkpointRefs.some(ref => /librarycontext/i.test(ref))
        && checkpointRefs.some(ref => /eventdag/i.test(ref))
        && receiptRefs.some(ref => /asset-provenance/i.test(ref))
        && /creator-release|CC-BY-4\.0|sample library/i.test(text),
      'assisted-composition': markerObserved('assisted-composition')
        && actionNames.includes('request-assisted-composition')
        && assistedStates.includes('accepted')
        && assistantEditStates.includes('editable')
        && checkpointRefs.some(ref => /assistedcomposition/i.test(ref))
        && receiptRefs.some(ref => /assisted-composition/i.test(ref))
        && /editable local change|D minor|126 BPM|undo history/i.test(text),
      'render-state': markerObserved('render-state')
        && actionNames.includes('start-render-job')
        && renderStates.includes('queued')
        && renderJobStates.includes('rendering')
        && renderProgressValues.some(value => value >= 50)
        && checkpointRefs.some(ref => /renderstate/i.test(ref))
        && checkpointRefs.some(ref => /renderpreview/i.test(ref))
        && receiptRefs.some(ref => /render-state/i.test(ref)),
      undo: markerObserved('undo')
        && actionNames.includes('undo-ai-change')
        && undoStates.includes('restored')
        && undoProofs.includes('local-history')
        && checkpointRefs.some(ref => /undosnapshot/i.test(ref))
        && receiptRefs.some(ref => /undo/i.test(ref))
        && /Undo applied|local history snapshot|Restored/i.test(text),
      'failed-audio-backend': markerObserved('failed-audio-backend')
        && actionNames.includes('simulate-audio-backend-failure')
        && audioBackendStates.includes('failed')
        && audioFallbackStates.includes('fallback-active')
        && checkpointRefs.some(ref => /failedaudiobackend/i.test(ref))
        && checkpointRefs.some(ref => /audiobackendfallback/i.test(ref))
        && receiptRefs.some(ref => /failed-audio-backend/i.test(ref))
        && /AudioWorklet processor unavailable|Fallback active|offline WebAudio preview/i.test(text),
      'compact-controls': markerObserved('compact-controls')
        && actionNames.includes('toggle-compact-controls')
        && compactStates.includes('enabled')
        && compactProofs.includes('mobile-ready')
        && compactButtons >= 6
        && checkpointRefs.some(ref => /compactcontrols/i.test(ref))
        && receiptRefs.some(ref => /compact-controls/i.test(ref))
        && /narrow mobile control strip|transport, BPM input, volume slider|render state, undo/i.test(text),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length >= 9
      && receiptRefs.length >= 6
      && actionNames.includes('load-asset-provenance')
      && actionNames.includes('request-assisted-composition')
      && actionNames.includes('start-render-job')
      && actionNames.includes('undo-ai-change')
      && actionNames.includes('simulate-audio-backend-failure')
      && actionNames.includes('toggle-compact-controls');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'strudel-ai-daw.assisted-composition-render-recovery',
      vda_id: 'VDA-G045',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectP2PChatUnifiedWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'pubsub-offline-delivery',
      'moderation-context',
      'receipts',
      'audio-fallback',
      'offline-recovery',
    ];
    for (const action of [
      'publish-pubsub-message',
      'queue-offline-delivery',
      'review-moderation-context',
      'emit-delivery-receipt',
      'activate-audio-fallback',
      'recover-offline-delivery',
    ]) {
      root.querySelector<HTMLElement>(`[data-svd-workflow-action="${CSS.escape(action)}"]`)?.click();
    }
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 440))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafyp2pchatg030[a-z0-9-]*\b/gi) || []).slice(0, 24)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:p2p-chat-unified:g030:[a-z0-9:.-]+\b/gi) || []).slice(0, 24)));
    const actionNames = actionNodes.map(node => node.dataset.svdWorkflowAction || '');
    const audioFallbackModes = Array.from(root.querySelectorAll<HTMLElement>('[data-audio-fallback-mode]'))
      .map(node => node.dataset.audioFallbackMode || '')
      .filter(Boolean);
    const recoveryStates = Array.from(root.querySelectorAll<HTMLElement>('[data-recovery-state]'))
      .map(node => node.dataset.recoveryState || '')
      .filter(Boolean);
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'pubsub-offline-delivery': markerObserved('pubsub-offline-delivery')
        && actionNames.includes('publish-pubsub-message')
        && actionNames.includes('queue-offline-delivery')
        && checkpointRefs.some(ref => /pubsubdelivery/i.test(ref))
        && checkpointRefs.some(ref => /offlinequeue/i.test(ref))
        && /pubsub|store-and-forward|offline/i.test(text),
      'moderation-context': markerObserved('moderation-context')
        && actionNames.includes('review-moderation-context')
        && checkpointRefs.some(ref => /moderationcontext/i.test(ref))
        && receiptRefs.some(ref => /moderation/i.test(ref))
        && /moderation|policy|decision|risk/i.test(text),
      receipts: markerObserved('receipts')
        && actionNames.includes('emit-delivery-receipt')
        && checkpointRefs.some(ref => /receiptbundle/i.test(ref))
        && receiptRefs.some(ref => /delivery:ack/i.test(ref))
        && receiptRefs.length >= 6,
      'audio-fallback': markerObserved('audio-fallback')
        && actionNames.includes('activate-audio-fallback')
        && checkpointRefs.some(ref => /audiofallback/i.test(ref))
        && receiptRefs.some(ref => /audio:fallback/i.test(ref))
        && audioFallbackModes.includes('text-transcript'),
      'offline-recovery': markerObserved('offline-recovery')
        && actionNames.includes('recover-offline-delivery')
        && checkpointRefs.some(ref => /offlinerecovery/i.test(ref))
        && receiptRefs.some(ref => /recovery:replayed/i.test(ref))
        && recoveryStates.length > 0
        && /reconnect|replay|recovery/i.test(text),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length >= 6
      && receiptRefs.length >= 6
      && actionNames.includes('publish-pubsub-message')
      && actionNames.includes('queue-offline-delivery')
      && actionNames.includes('activate-audio-fallback')
      && actionNames.includes('recover-offline-delivery');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'p2p-chat-unified.pubsub-offline-recovery',
      vda_id: 'VDA-G030',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectP2PChatWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'legacy-alias-behavior',
      'pubsub-provenance',
      'offline-state',
      'delivery-failure',
      'migration-path',
    ];
    for (const action of [
      'document-legacy-alias',
      'publish-pubsub-provenance',
      'queue-offline-state',
      'simulate-delivery-failure',
      'show-migration-path',
    ]) {
      root.querySelector<HTMLElement>(`[data-svd-workflow-action="${CSS.escape(action)}"]`)?.click();
    }
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 440))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafyp2pchatg047[a-z0-9-]*\b/gi) || []).slice(0, 24)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:p2p-chat:g047:[a-z0-9:.-]+\b/gi) || []).slice(0, 24)));
    const actionNames = actionNodes.map(node => node.dataset.svdWorkflowAction || '');
    const aliasStates = Array.from(root.querySelectorAll<HTMLElement>('[data-legacy-alias-state]'))
      .map(node => node.dataset.legacyAliasState || '')
      .filter(Boolean);
    const pubsubStates = Array.from(root.querySelectorAll<HTMLElement>('[data-pubsub-provenance-state]'))
      .map(node => node.dataset.pubsubProvenanceState || '')
      .filter(Boolean);
    const offlineStates = Array.from(root.querySelectorAll<HTMLElement>('[data-offline-state]'))
      .map(node => node.dataset.offlineState || '')
      .filter(Boolean);
    const deliveryStates = Array.from(root.querySelectorAll<HTMLElement>('[data-delivery-failure-state]'))
      .map(node => node.dataset.deliveryFailureState || '')
      .filter(Boolean);
    const migrationStates = Array.from(root.querySelectorAll<HTMLElement>('[data-migration-state]'))
      .map(node => node.dataset.migrationState || '')
      .filter(Boolean);
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'legacy-alias-behavior': markerObserved('legacy-alias-behavior')
        && actionNames.includes('document-legacy-alias')
        && checkpointRefs.some(ref => /legacyalias/i.test(ref))
        && receiptRefs.some(ref => /alias:legacy-route/i.test(ref))
        && aliasStates.some(state => /alias|canonical|documented/i.test(state))
        && /p2p-chat-offline|legacy-only|alias/i.test(text),
      'pubsub-provenance': markerObserved('pubsub-provenance')
        && actionNames.includes('publish-pubsub-provenance')
        && checkpointRefs.some(ref => /pubsubprovenance/i.test(ref))
        && checkpointRefs.some(ref => /eventdag/i.test(ref))
        && receiptRefs.some(ref => /pubsub:provenance-ready/i.test(ref))
        && pubsubStates.some(state => /provenance|pending/i.test(state))
        && /ipfs\.kit\.pubsub|pubsub|Event DAG|provenance/i.test(text),
      'offline-state': markerObserved('offline-state')
        && actionNames.includes('queue-offline-state')
        && checkpointRefs.some(ref => /offlinequeue/i.test(ref))
        && receiptRefs.some(ref => /offline:queued/i.test(ref))
        && offlineStates.some(state => /offline|queued|peer-offline/i.test(state))
        && /store-and-forward|queue|reconnect|offline/i.test(text),
      'delivery-failure': markerObserved('delivery-failure')
        && actionNames.includes('simulate-delivery-failure')
        && checkpointRefs.some(ref => /deliveryfailure/i.test(ref))
        && receiptRefs.some(ref => /delivery:failed/i.test(ref))
        && deliveryStates.some(state => /failed|pending/i.test(state))
        && /failed|no false success|no ack|retry/i.test(text),
      'migration-path': markerObserved('migration-path')
        && actionNames.includes('show-migration-path')
        && checkpointRefs.some(ref => /migrationpath/i.test(ref))
        && receiptRefs.some(ref => /migration:unified-ready/i.test(ref))
        && migrationStates.some(state => /migration|unified|available/i.test(state))
        && /p2p-chat-unified|exports|handoff|migration/i.test(text),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length >= 6
      && receiptRefs.length >= 5
      && actionNames.includes('document-legacy-alias')
      && actionNames.includes('publish-pubsub-provenance')
      && actionNames.includes('queue-offline-state')
      && actionNames.includes('simulate-delivery-failure')
      && actionNames.includes('show-migration-path');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'p2p-chat.legacy-alias-pubsub-migration',
      vda_id: 'VDA-G047',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectNeuralNetworkDesignerWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'graph-artifacts',
      'schema-validation',
      'compile-train-planning',
      'invalid-edge-feedback',
      'result-receipts',
    ];
    for (const action of [
      'generate-graph-artifacts',
      'validate-schema-contract',
      'plan-compile-train',
      'surface-invalid-edge-feedback',
      'submit-compile-workflow',
    ]) {
      root.querySelector<HTMLElement>(`[data-svd-workflow-action="${CSS.escape(action)}"]`)?.click();
    }
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 460))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafynndg031[a-z0-9-]*\b/gi) || []).slice(0, 24)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:neural-network-designer:g031:[a-z0-9:.-]+\b/gi) || []).slice(0, 24)));
    const actionNames = actionNodes.map(node => node.dataset.svdWorkflowAction || '');
    const invalidEdgeStatuses = Array.from(root.querySelectorAll<HTMLElement>('[data-invalid-edge-status]'))
      .map(node => node.dataset.invalidEdgeStatus || '')
      .filter(Boolean);
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'graph-artifacts': markerObserved('graph-artifacts')
        && checkpointRefs.some(ref => /graphartifact/i.test(ref))
        && /layers|valid directed edges|Graph artifact/i.test(text),
      'schema-validation': markerObserved('schema-validation')
        && checkpointRefs.some(ref => /schemacontract/i.test(ref))
        && /input \[32,32,3\]|target \[10\]|categoricalCrossentropy|Status: valid/i.test(text),
      'compile-train-planning': markerObserved('compile-train-planning')
        && checkpointRefs.some(ref => /compiletrainplan/i.test(ref))
        && /adam|epochs|batch|planned|submitted/i.test(text),
      'invalid-edge-feedback': markerObserved('invalid-edge-feedback')
        && checkpointRefs.some(ref => /invalidedgefeedback/i.test(ref))
        && invalidEdgeStatuses.includes('rejected')
        && /Rejected output-to-hidden edge|cycle/i.test(text),
      'result-receipts': markerObserved('result-receipts')
        && checkpointRefs.some(ref => /resultartifact/i.test(ref))
        && receiptRefs.length >= 5
        && receiptRefs.some(ref => /result-artifact/i.test(ref)),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length >= 5
      && receiptRefs.length >= 5
      && actionNames.includes('generate-graph-artifacts')
      && actionNames.includes('validate-schema-contract')
      && actionNames.includes('plan-compile-train')
      && actionNames.includes('surface-invalid-edge-feedback')
      && actionNames.includes('submit-compile-workflow');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'neural-network-designer.design-compile-train',
      vda_id: 'VDA-G031',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectDatasetsBrowserWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'dataset-cid',
      'semantic-operation',
      'provenance-operation',
      'preparation-job',
      'schema-filter-ui',
      'error-ui',
      'progress-ui',
      'receipts',
    ];
    for (const action of [
      'run-semantic-search',
      'record-provenance',
      'start-preparation-job',
      'apply-schema-filter',
      'show-schema-error',
      'refresh-progress',
    ]) {
      root.querySelector<HTMLElement>(`[data-svd-workflow-action="${CSS.escape(action)}"]`)?.click();
    }
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 460))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafydatasetg048[a-z0-9-]*\b/gi) || []).slice(0, 24)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:datasets-browser:g048:[a-z0-9:.-]+\b/gi) || []).slice(0, 24)));
    const eventRefs = Array.from(new Set((text.match(/\bevent:datasets-browser:g048:[a-z0-9:.-]+\b/gi) || []).slice(0, 12)));
    const actionNames = actionNodes.map(node => node.dataset.svdWorkflowAction || '');
    const schemaControls = Array.from(root.querySelectorAll<HTMLElement>('[data-datasets-filter]'))
      .map(node => node.getAttribute('data-datasets-filter') || '')
      .filter(Boolean);
    const progress = root.querySelector<HTMLProgressElement>('#datasets-progress-bar');
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'dataset-cid': markerObserved('dataset-cid')
        && checkpointRefs.some(ref => /customerintent/i.test(ref))
        && /Dataset CID|Selected dataset/i.test(text),
      'semantic-operation': markerObserved('semantic-operation')
        && actionNames.includes('run-semantic-search')
        && checkpointRefs.some(ref => /semanticresults/i.test(ref))
        && receiptRefs.some(ref => /semantic:primary/i.test(ref))
        && /semantic_search|primary semantic/i.test(text),
      'provenance-operation': markerObserved('provenance-operation')
        && actionNames.includes('record-provenance')
        && checkpointRefs.some(ref => /provenance/i.test(ref))
        && receiptRefs.some(ref => /provenance:recorded/i.test(ref))
        && /record_provenance|Provenance CID/i.test(text),
      'preparation-job': markerObserved('preparation-job')
        && actionNames.includes('start-preparation-job')
        && checkpointRefs.some(ref => /preparationjob/i.test(ref))
        && receiptRefs.some(ref => /preparation:queued/i.test(ref))
        && /Preparation job|vector_index|dataset-prep-g048/i.test(text),
      'schema-filter-ui': markerObserved('schema-filter-ui')
        && actionNames.includes('apply-schema-filter')
        && checkpointRefs.some(ref => /schema/i.test(ref))
        && checkpointRefs.some(ref => /filter/i.test(ref))
        && schemaControls.includes('schema')
        && schemaControls.includes('split'),
      'error-ui': markerObserved('error-ui')
        && actionNames.includes('show-schema-error')
        && checkpointRefs.some(ref => /schemaerror/i.test(ref))
        && receiptRefs.some(ref => /error:schema-validation/i.test(ref))
        && /Invalid filter|Schema error|rejected before transport|recovery/i.test(text),
      'progress-ui': markerObserved('progress-ui')
        && actionNames.includes('refresh-progress')
        && checkpointRefs.some(ref => /progress/i.test(ref))
        && receiptRefs.some(ref => /progress:updated/i.test(ref))
        && Boolean(progress)
        && /[0-9]{1,3}% complete|progress UI/i.test(text),
      receipts: markerObserved('receipts')
        && receiptRefs.length >= 6
        && eventRefs.length >= 2,
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length >= 7
      && receiptRefs.length >= 6
      && eventRefs.length >= 2
      && actionNames.includes('run-semantic-search')
      && actionNames.includes('record-provenance')
      && actionNames.includes('start-preparation-job')
      && actionNames.includes('apply-schema-filter')
      && actionNames.includes('show-schema-error')
      && actionNames.includes('refresh-progress');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'datasets-browser.semantic-provenance-preparation',
      vda_id: 'VDA-G048',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectAgentSupervisorWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'goal-subgoal-graph',
      'prompt-preview',
      'taskboard-links',
      'policy-confirmation',
      'kda-evidence',
      'progress',
      'timeout-reassignment',
      'receipt-visibility',
    ];
    for (const action of [
      'inspect-goal-graph',
      'preview-steering-prompt',
      'open-taskboard-links',
      'confirm-policy',
      'inspect-kda-evidence',
      'track-progress',
      'simulate-timeout-reassignment',
      'open-receipt-visibility',
    ]) {
      root.querySelector<HTMLElement>(`[data-svd-workflow-action="${CSS.escape(action)}"]`)?.click();
    }
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 520))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafyagentg054[a-z0-9-]*\b/gi) || []).slice(0, 32)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:agent-supervisor:g054:[a-z0-9:.-]+\b/gi) || []).slice(0, 32)));
    const goalNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-goal-id]')).map(node => node.dataset.goalId || '').filter(Boolean);
    const subgoalNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-subgoal-id]')).map(node => node.dataset.subgoalId || '').filter(Boolean);
    const taskNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-task-id]')).map(node => node.dataset.taskId || '').filter(Boolean);
    const receiptNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-receipt-id]')).map(node => node.dataset.receiptId || '').filter(Boolean);
    const taskboardLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'))
      .map(node => node.getAttribute('href') || '')
      .filter(href => /^#(?:task|goal|subgoal)\//.test(href) || /taskboard|implementation_plan|agent-supervisor-console/i.test(href));
    const actionNames = actionNodes.map(node => node.dataset.svdWorkflowAction || '');
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'goal-subgoal-graph': markerObserved('goal-subgoal-graph')
        && checkpointRefs.some(ref => /goalsubgoalgraph/i.test(ref))
        && goalNodes.length > 0
        && subgoalNodes.length > 0
        && taskNodes.length > 0,
      'prompt-preview': markerObserved('prompt-preview')
        && actionNames.includes('preview-steering-prompt')
        && checkpointRefs.some(ref => /promptpreview/i.test(ref))
        && /normalized target|planned MCP action|prompt_log_preview|structured-json-payload/i.test(text),
      'taskboard-links': markerObserved('taskboard-links')
        && actionNames.includes('open-taskboard-links')
        && checkpointRefs.some(ref => /taskboardlinks/i.test(ref))
        && taskboardLinks.length > 0,
      'policy-confirmation': markerObserved('policy-confirmation')
        && actionNames.includes('confirm-policy')
        && checkpointRefs.some(ref => /policyconfirmation/i.test(ref))
        && /confirmation_required|Confirm this governed|policy class|required_policy_checks|governed writes/i.test(text),
      'kda-evidence': markerObserved('kda-evidence')
        && actionNames.includes('inspect-kda-evidence')
        && checkpointRefs.some(ref => /kdaevidence/i.test(ref))
        && /ipfs_kit_py|ipfs_datasets_py|ipfs_accelerate_py/i.test(text)
        && /task receipts\/event DAG|goal and policy reasoning|queue, scheduler, and workers/i.test(text),
      progress: markerObserved('progress')
        && actionNames.includes('track-progress')
        && checkpointRefs.some(ref => /progress/i.test(ref))
        && /\b[0-9]{1,3}%\b|progress/i.test(text),
      'timeout-reassignment': markerObserved('timeout-reassignment')
        && actionNames.includes('simulate-timeout-reassignment')
        && checkpointRefs.some(ref => /timeoutreassignment/i.test(ref))
        && /timeout|reassign|assignee/i.test(text),
      'receipt-visibility': markerObserved('receipt-visibility')
        && actionNames.includes('open-receipt-visibility')
        && checkpointRefs.some(ref => /receiptvisibility/i.test(ref))
        && receiptNodes.length > 0
        && /event-DAG checkpoint|receipt retrieval|receipts visible/i.test(text),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length >= 8
      && receiptRefs.length >= 8
      && actionNames.includes('inspect-goal-graph')
      && actionNames.includes('preview-steering-prompt')
      && actionNames.includes('open-taskboard-links')
      && actionNames.includes('confirm-policy')
      && actionNames.includes('inspect-kda-evidence')
      && actionNames.includes('track-progress')
      && actionNames.includes('simulate-timeout-reassignment')
      && actionNames.includes('open-receipt-visibility');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'agent-supervisor.steer-goals-subgoals-dispatch',
      vda_id: 'VDA-G054',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectORBAutoUIWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'generated-artifact-cids',
      'intent-schema-policy',
      'execution-preview',
      'schema-error',
      'confirmation',
      'fallback-renderer',
    ];
    for (const action of [
      'generate-auto-ui-artifacts',
      'preview-execution-envelope',
      'validate-schema-error',
      'confirm-governed-execution',
      'render-fallback-surface',
    ]) {
      root.querySelector<HTMLElement>(`[data-svd-workflow-action="${CSS.escape(action)}"]`)?.click();
    }
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 460))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const artifactRefs = Array.from(new Set((text.match(/\bbafyorbg052[a-z0-9-]*\b/gi) || []).slice(0, 24)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:orb-auto-ui:g052:[a-z0-9:.-]+\b/gi) || []).slice(0, 24)));
    const rendererKinds = Array.from(root.querySelectorAll<HTMLElement>('[data-orb-fallback-renderer]'))
      .map(node => node.dataset.orbFallbackRenderer || '')
      .filter(Boolean);
    const actionNames = actionNodes.map(node => node.dataset.svdWorkflowAction || '');
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'generated-artifact-cids': markerObserved('generated-artifact-cids')
        && artifactRefs.some(ref => /descriptorpack/i.test(ref))
        && artifactRefs.some(ref => /layoutschema/i.test(ref))
        && artifactRefs.some(ref => /rendererbundle/i.test(ref)),
      'intent-schema-policy': markerObserved('intent-schema-policy')
        && /intent_policy|input_schema|output_schema|default_deny|confirmation_policy|receipt_policy/i.test(text),
      'execution-preview': markerObserved('execution-preview')
        && actionNames.includes('preview-execution-envelope')
        && artifactRefs.some(ref => /executionpreview/i.test(ref))
        && /dry_run|execution preview|no side effects/i.test(text),
      'schema-error': markerObserved('schema-error')
        && actionNames.includes('validate-schema-error')
        && artifactRefs.some(ref => /schemaerror/i.test(ref))
        && /schema error|invalid input|rejected before transport/i.test(text),
      confirmation: markerObserved('confirmation')
        && actionNames.includes('confirm-governed-execution')
        && artifactRefs.some(ref => /confirmation/i.test(ref))
        && receiptRefs.some(ref => /confirmation/i.test(ref))
        && /requires user confirmation|confirmed governed execution|confirm_governed/i.test(text),
      'fallback-renderer': markerObserved('fallback-renderer')
        && actionNames.includes('render-fallback-surface')
        && artifactRefs.some(ref => /fallbackrenderer/i.test(ref))
        && ['descriptor-fallback', 'mobile-card', 'audio-summary'].every(kind => text.includes(kind))
        && rendererKinds.length >= 3,
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && artifactRefs.length >= 6
      && receiptRefs.length >= 5
      && actionNames.includes('generate-auto-ui-artifacts')
      && actionNames.includes('confirm-governed-execution')
      && actionNames.includes('render-fallback-surface');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'orb-auto-ui.generate-governed-auto-ui',
      vda_id: 'VDA-G052',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: artifactRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectGlassesPreviewWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'replay-bundle',
      'privacy-policy',
      'display-denial',
      'camera-denial',
      'microphone-denial',
      'speaker-denial',
      'display-audio-analysis',
      'fallback-proof',
    ];
    for (const action of [
      'replay-simulator-bundle',
      'deny-display',
      'deny-camera',
      'deny-microphone',
      'deny-speaker',
      'run-display-audio-analysis',
      'prove-fallback',
    ]) {
      root.querySelector<HTMLElement>(`[data-svd-workflow-action="${CSS.escape(action)}"]`)?.click();
    }
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 420))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafyglassg051[a-z0-9-]*\b/gi) || []).slice(0, 20)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:glasses-preview:g051:[a-z0-9:.-]+\b/gi) || []).slice(0, 20)));
    const actionNames = actionNodes.map(node => node.dataset.svdWorkflowAction || '');
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'replay-bundle': markerObserved('replay-bundle') && checkpointRefs.some(ref => /replaybundle/i.test(ref)) && /handoff:app:glasses-preview:primary/i.test(text),
      'privacy-policy': markerObserved('privacy-policy') && checkpointRefs.some(ref => /privacypolicy/i.test(ref)) && /raw media capture is false|raw media captured: false|redacted|no-mutation/i.test(text),
      'display-denial': markerObserved('display-denial') && /display state denied|denied display\.output/i.test(text) && receiptRefs.some(ref => /denial:display/i.test(ref)),
      'camera-denial': markerObserved('camera-denial') && /camera state denied|denied camera/i.test(text) && receiptRefs.some(ref => /denial:camera/i.test(ref)),
      'microphone-denial': markerObserved('microphone-denial') && /microphone state denied|denied microphone/i.test(text) && receiptRefs.some(ref => /denial:microphone/i.test(ref)),
      'mic-denial': markerObserved('microphone-denial') && /microphone state denied|denied microphone/i.test(text) && receiptRefs.some(ref => /denial:microphone/i.test(ref)),
      'speaker-denial': markerObserved('speaker-denial') && /speaker state denied|denied speaker/i.test(text) && receiptRefs.some(ref => /denial:speaker/i.test(ref)),
      'display-audio-analysis': markerObserved('display-audio-analysis') && checkpointRefs.some(ref => /displayaudioanalysis/i.test(ref)) && /display.*audio|audio.*display/i.test(text),
      analysis: markerObserved('display-audio-analysis') && checkpointRefs.some(ref => /displayaudioanalysis/i.test(ref)) && /display.*audio|audio.*display/i.test(text),
      'fallback-proof': markerObserved('fallback-proof') && checkpointRefs.some(ref => /fallbackproof/i.test(ref)) && /fallback target mobile-card/i.test(text) && receiptRefs.some(ref => /fallback:mobile-card/i.test(ref)),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length >= 7
      && receiptRefs.length >= 7
      && actionNames.includes('replay-simulator-bundle')
      && actionNames.includes('prove-fallback');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'glasses-preview.replay-orb-handoff',
      vda_id: 'VDA-G051',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectAcceleratePanelWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'model-artifacts',
      'evaluation-policy',
      'primary-execution',
      'hardware-fit',
      'queue-log-cancel',
      'no-capacity-recovery',
    ];
    for (const action of ['inspect-model-artifacts', 'refresh-hardware-fit', 'cancel-queued-job', 'recover-no-capacity']) {
      root.querySelector<HTMLElement>(`[data-svd-workflow-action="${CSS.escape(action)}"]`)?.click();
    }
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 360))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const artifactRefs = Array.from(new Set((text.match(/\bbafyaccelerate[a-z0-9-]*g049[a-z0-9-]*\b/gi) || []).slice(0, 16)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:accelerate-panel:[a-z0-9:.-]+\b/gi) || []).slice(0, 16)));
    const logRefs = Array.from(new Set((text.match(/\blog:accelerate-panel:g049:[a-z0-9:.-]+\b/gi) || []).slice(0, 16)));
    const actionNames = actionNodes.map(node => node.dataset.svdWorkflowAction || '');
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'model-artifacts': markerObserved('model-artifacts') && artifactRefs.length >= 3,
      'evaluation-policy': markerObserved('evaluation-policy') && artifactRefs.some(ref => /evalpolicy/i.test(ref)) && /redacted|max tokens|receipt/i.test(text),
      'primary-execution': markerObserved('primary-execution') && actionNames.includes('launch-primary-execution') && receiptRefs.some(ref => /primary-execution/i.test(ref)),
      'hardware-fit': markerObserved('hardware-fit') && /WebGPU|WebNN|CPU|fit score/i.test(text),
      'queue-log-cancel': markerObserved('queue-log-cancel') && actionNames.includes('cancel-queued-job') && receiptRefs.some(ref => /cancel/i.test(ref)) && logRefs.length > 0,
      'no-capacity-recovery': markerObserved('no-capacity-recovery') && actionNames.includes('recover-no-capacity') && receiptRefs.some(ref => /recovery:no-capacity/i.test(ref)),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && artifactRefs.length >= 4
      && receiptRefs.length >= 5
      && actionNames.includes('launch-primary-execution');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'accelerate-panel.inference-with-hardware-fit',
      vda_id: 'VDA-G049',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: [...artifactRefs, ...logRefs],
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectSystemMonitorWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'live-telemetry',
      'diagnostic-history',
      'analysis',
      'stale-data',
      'alert-state',
      'accessible-summaries',
    ];
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 360))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const telemetryRefs = Array.from(new Set((text.match(/\btelemetry:system-monitor:g041:[a-z0-9:-]+\b/gi) || []).slice(0, 12)));
    const sampleCidRefs = Array.from(new Set((text.match(/\bbafysysmonitor[a-z0-9-]*g041[a-z0-9-]*\b/gi) || []).slice(0, 12)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:system-monitor:[a-z0-9:.-]+\b/gi) || []).slice(0, 12)));
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'live-telemetry': markerObserved('live-telemetry') && telemetryRefs.length > 0,
      'diagnostic-history': markerObserved('diagnostic-history') && sampleCidRefs.length > 0,
      analysis: markerObserved('analysis'),
      'stale-data': markerObserved('stale-data') && /stale-data|fresh/i.test(text),
      'alert-state': markerObserved('alert-state') && /alert state|warning|critical|info/i.test(text),
      'accessible-summaries': markerObserved('accessible-summaries') && Array.from(root.querySelectorAll<HTMLElement>('[aria-live], [role="status"]')).length > 0,
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && receiptRefs.length >= requiredMarkers.length
      && actionNodes.some(node => node.dataset.svdWorkflowAction === 'refresh-live-telemetry');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'system-monitor.live-diagnostics',
      vda_id: 'VDA-G041',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: [...sampleCidRefs, ...telemetryRefs],
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectIDLExplorerWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'descriptor-cids',
      'schema-policy',
      'compatibility-fixture',
      'invalid-input',
      'transport-badges',
      'receipt-drill-down',
    ];
    for (const action of [
      'run-compatibility-fixture',
      'validate-invalid-input',
      'open-receipt-drilldown',
      'refresh-transport-badges',
    ]) {
      root.querySelector<HTMLElement>(`[data-svd-workflow-action="${CSS.escape(action)}"]`)?.click();
    }
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 420))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const descriptorCidRefs = Array.from(new Set((text.match(/\bbafyidlg050[a-z0-9]+\b/gi) || []).slice(0, 16)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:idl-explorer:[a-z0-9:.-]+\b/gi) || []).slice(0, 16)));
    const transportBadges = Array.from(root.querySelectorAll<HTMLElement>('[data-transport-badge]'))
      .map(node => node.dataset.transportBadge || '')
      .filter(Boolean);
    const actionNames = actionNodes.map(node => node.dataset.svdWorkflowAction || '');
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'descriptor-cids': markerObserved('descriptor-cids') && descriptorCidRefs.filter(ref => /descriptor$/i.test(ref)).length >= 3,
      'schema-policy': markerObserved('schema-policy') && /input_schema|output_schema|confirmation_policy|receipt_policy|default_deny|permissions/i.test(text),
      'compatibility-fixture': markerObserved('compatibility-fixture') && descriptorCidRefs.some(ref => /compatfixture/i.test(ref)) && receiptRefs.some(ref => /compatibility/i.test(ref)),
      'invalid-input': markerObserved('invalid-input') && descriptorCidRefs.some(ref => /invalidinputfixture/i.test(ref)) && /rejected|input_schema|invalid input/i.test(text),
      'transport-badges': markerObserved('transport-badges') && ['browser-gateway', 'mcp_remote', 'mcp_plus_plus_remote', 'descriptor-fallback'].every(transport => text.includes(transport)) && transportBadges.length >= 4,
      'receipt-drill-down': markerObserved('receipt-drill-down') && receiptRefs.some(ref => /receipt-drilldown/i.test(ref)) && /event:idl-explorer:g050:descriptor-fixture-drilldown/i.test(text),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && descriptorCidRefs.length >= 5
      && receiptRefs.length >= 3
      && actionNames.includes('run-compatibility-fixture')
      && actionNames.includes('validate-invalid-input')
      && actionNames.includes('open-receipt-drilldown');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'idl-explorer.inspect-governed-descriptors',
      vda_id: 'VDA-G050',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: descriptorCidRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function collectMCPPlusPlusWorkflowEvidence(appWindow: Locator): Promise<AppWorkflowEvidence> {
  return appWindow.evaluate(root => {
    const requiredMarkers = [
      'peer-diagnostics',
      'event-dag-diagnostics',
      'policy-diagnostics',
      'scheduling-diagnostics',
      'http-libp2p-distinction',
      'did-identity',
      'profile-failure',
      'evidence-drill-down',
    ];
    for (const action of [
      'inspect-peer-diagnostics',
      'compare-http-libp2p',
      'verify-did-identity',
      'evaluate-policy-diagnostics',
      'evaluate-scheduling-frontier',
      'diagnose-profile-failure',
      'open-evidence-drilldown',
    ]) {
      root.querySelector<HTMLElement>(`[data-svd-workflow-action="${CSS.escape(action)}"]`)?.click();
    }
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    const markers = requiredMarkers.map(marker => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(`[data-svd-vda-marker="${CSS.escape(marker)}"]`));
      const snippets = elements
        .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 520))
        .filter(Boolean)
        .slice(0, 4);
      return {
        marker,
        observed: snippets.length > 0,
        snippets,
      };
    });
    const workflowNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow]'));
    const actionNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-svd-workflow-action]'));
    const checkpointRefs = Array.from(new Set((text.match(/\bbafymcppg053[a-z0-9-]*\b/gi) || []).slice(0, 32)));
    const receiptRefs = Array.from(new Set((text.match(/\breceipt:mcp-plus-plus:g053:[a-z0-9:.-]+\b/gi) || []).slice(0, 32)));
    const eventRefs = Array.from(new Set((text.match(/\bevent:mcp-plus-plus:g053:[a-z0-9:.-]+\b/gi) || []).slice(0, 16)));
    const didRefs = Array.from(new Set((text.match(/\bdid:key:z[1-9A-HJ-NP-Za-km-z]+\b/g) || []).slice(0, 16)));
    const actionNames = actionNodes.map(node => node.dataset.svdWorkflowAction || '');
    const markerObserved = (marker: string) => markers.some(entry => entry.marker === marker && entry.observed);
    const acceptance = {
      'peer-diagnostics': markerObserved('peer-diagnostics')
        && checkpointRefs.some(ref => /peerdiagnostics/i.test(ref))
        && /peer.*diagnostics|libp2p peer id|peer\/cid/i.test(text)
        && didRefs.length > 0,
      'event-dag-diagnostics': markerObserved('event-dag-diagnostics')
        && checkpointRefs.some(ref => /eventdagfrontier/i.test(ref))
        && eventRefs.length > 0
        && /event dag|frontier|parent/i.test(text),
      'policy-diagnostics': markerObserved('policy-diagnostics')
        && checkpointRefs.some(ref => /policydecision/i.test(ref))
        && /Profile D|formal.*policy|policy\/provenance|default_deny|receipt_policy/i.test(text),
      'scheduling-diagnostics': markerObserved('scheduling-diagnostics')
        && checkpointRefs.some(ref => /schedulefrontier/i.test(ref))
        && /Profile G|scheduling frontier|lease|fencing token|risk score/i.test(text),
      'http-libp2p-distinction': markerObserved('http-libp2p-distinction')
        && checkpointRefs.some(ref => /transportmatrix/i.test(ref))
        && /HTTP JSON-RPC|mcp\+\+\/http|\/mcp\+p2p\/1\.0\.0|libp2p/i.test(text),
      'did-identity': markerObserved('did-identity')
        && checkpointRefs.some(ref => /dididentity/i.test(ref))
        && didRefs.length >= 2
        && /UCAN|nonce|verified signature|DID identity/i.test(text),
      'profile-failure': markerObserved('profile-failure')
        && checkpointRefs.some(ref => /profilefailure/i.test(ref))
        && /profile_unavailable|failed closed|not configured|Unavailable profile/i.test(text),
      'evidence-drill-down': markerObserved('evidence-drill-down')
        && checkpointRefs.some(ref => /evidencedrilldown/i.test(ref))
        && receiptRefs.some(ref => /evidence-drilldown/i.test(ref))
        && /receipt\/event-DAG|drill-down|event_dag_cid|policy_decision_cid/i.test(text),
    };
    const complete = requiredMarkers.every(marker => acceptance[marker])
      && checkpointRefs.length >= 8
      && receiptRefs.length >= 8
      && eventRefs.length > 0
      && didRefs.length >= 2
      && actionNames.includes('inspect-peer-diagnostics')
      && actionNames.includes('compare-http-libp2p')
      && actionNames.includes('verify-did-identity')
      && actionNames.includes('evaluate-scheduling-frontier')
      && actionNames.includes('diagnose-profile-failure')
      && actionNames.includes('open-evidence-drilldown');
    return {
      workflow_id: workflowNodes[0]?.dataset.svdWorkflow || 'mcp-plus-plus.diagnose-profiles-peers-event-dag',
      vda_id: 'VDA-G053',
      acceptance,
      markers,
      actions: actionNodes.map(node => ({
        action: node.dataset.svdWorkflowAction || '',
        name: (node.getAttribute('aria-label') || node.textContent || node.id || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      checkpoint_refs: checkpointRefs,
      receipt_refs: receiptRefs,
      complete,
    };
  });
}

async function closeAndVerifyDesktopRecovery(
  page: Page,
  appWindow: Locator,
  appId: string,
): Promise<RecoveryEvidence> {
  const close = appWindow.locator('.window-control.close, [data-x], button[title="Close"]').first();
  const closeVisible = await close.isVisible().catch(() => false);
  let closeMethod: RecoveryEvidence['close_method'] = 'not-available';
  if (closeVisible) {
    closeMethod = 'pointer';
    await close.click({ force: true, timeout: 1_000 }).catch(() => undefined);
    await page.waitForFunction(
      id => document.querySelectorAll(`.window[data-app-id="${CSS.escape(id)}"]`).length === 0,
      appId,
      { timeout: 1_000 },
    ).catch(() => undefined);
  }

  let countAfterClose = await page.locator(`.window[data-app-id="${cssEscape(appId)}"], .window[data-svd-app-id="${cssEscape(appId)}"]`).count();
  if (countAfterClose > 0 && closeVisible) {
    closeMethod = 'dom-click';
    await appWindow.evaluate(root => {
      const closeButton = root.querySelector<HTMLElement>('.window-control.close, [data-x], button[title="Close"]');
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }).catch(() => undefined);
    await page.waitForFunction(
      id => document.querySelectorAll(`.window[data-app-id="${CSS.escape(id)}"]`).length === 0,
      appId,
      { timeout: 1_000 },
    ).catch(() => undefined);
  }
  countAfterClose = await page.locator(`.window[data-app-id="${cssEscape(appId)}"], .window[data-svd-app-id="${cssEscape(appId)}"]`).count();
  const cleanupRemaining = countAfterClose > 0 ? await cleanupWindows(page, appId) : countAfterClose;
  return {
    close_window_control_visible: closeVisible,
    closed_to_desktop: countAfterClose === 0,
    app_window_count_after_close: countAfterClose,
    close_method: closeMethod,
    harness_cleanup_performed: countAfterClose > 0,
    app_window_count_after_cleanup: cleanupRemaining,
  };
}

async function readDesktopState(page: Page): Promise<DesktopStateEvidence> {
  return page.evaluate(() => {
    const desktop = (window as any).__swissknifeDesktop;
    return {
      desktop_hook_present: Boolean(desktop),
      registered_app_ids: desktop?.apps ? Array.from(desktop.apps.keys()) : [],
      icon_app_ids: Array.from(document.querySelectorAll<HTMLElement>('.desktop-icons .icon[data-app]')).map(icon => icon.dataset.app || ''),
      window_count: document.querySelectorAll('.window').length,
    };
  });
}

function installEventCapture(
  page: Page,
  consoleEvents: ConsoleEvidence[],
  networkEvents: NetworkEvidence[],
): void {
  page.on('console', msg => {
    if (['error', 'warning'].includes(msg.type())) {
      consoleEvents.push({
        type: msg.type(),
        text: msg.text().slice(0, 1200),
        location: msg.location(),
      });
    }
  });

  page.on('requestfailed', request => {
    networkEvents.push({
      type: 'requestfailed',
      url: sanitizeUrl(request.url()),
      method: request.method(),
      failure: request.failure()?.errorText || 'unknown',
    });
  });

  page.on('response', response => {
    if (response.status() >= 400) {
      networkEvents.push({
        type: 'response',
        url: sanitizeUrl(response.url()),
        method: response.request().method(),
        status: response.status(),
      });
    }
  });
}

async function activeElementDescriptor(page: Page): Promise<ElementDescriptor> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element) return { tag_name: 'none', name: '', selector_hint: '' };
    return {
      tag_name: element.tagName.toLowerCase(),
      name: (element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      selector_hint: [
        element.id ? `#${element.id}` : '',
        element.getAttribute('data-app') ? `[data-app="${element.getAttribute('data-app')}"]` : '',
        element.getAttribute('data-testid') ? `[data-testid="${element.getAttribute('data-testid')}"]` : '',
        element.className ? `.${String(element.className).split(/\s+/).filter(Boolean).slice(0, 3).join('.')}` : '',
      ].filter(Boolean).join(''),
    };
  });
}

function selectManifestApps(): VirtualDesktopAppManifestEntry[] {
  const scope = process.env.SVD_APP_IMPROVEMENT_SCOPE || 'all';
  if (scope === 'all') return [...VIRTUAL_DESKTOP_APP_MANIFEST.apps];
  const requested = scope.split(',').map(appId => appId.trim()).filter(Boolean);
  const byId = new Map(VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => [app.id, app]));
  const missing = requested.filter(appId => !byId.has(appId));
  if (missing.length > 0) {
    throw new Error(`Unknown canonical manifest app id(s): ${missing.join(', ')}`);
  }
  return requested.map(appId => byId.get(appId)!);
}

function expectSelectedAppsMatchRunner(selectedIds: string[]): void {
  const expectedRaw = process.env.SVD_APP_IMPROVEMENT_EXPECTED_APP_IDS;
  if (!expectedRaw) return;
  const expectedIds = expectedRaw.split(',').map(appId => appId.trim()).filter(Boolean);
  expect(selectedIds).toEqual(expectedIds);
}

function summarize(results: AppImprovementEvidence[]) {
  return {
    passed: results.filter(result => result.pass).length,
    failed: results.filter(result => !result.pass).length,
    desktop_opened: results.filter(result => result.desktop.opened).length,
    mobile_opened: results.filter(result => result.mobile.opened).length,
    desktop_primary_controls: results.filter(result => result.desktop.primary_control).length,
    mobile_primary_controls: results.filter(result => result.mobile.primary_control).length,
    desktop_icon_launches: results.filter(result => result.desktop.launch.from_desktop_icon).length,
    mobile_icon_launches: results.filter(result => result.mobile.launch.from_desktop_icon).length,
    console_event_count: results.reduce((sum, result) => sum + result.desktop.console_events.length + result.mobile.console_events.length, 0),
    network_event_count: results.reduce((sum, result) => sum + result.desktop.network_events.length + result.mobile.network_events.length, 0),
    error_state_observed: results.filter(result => result.desktop.states.error.state === 'observed' || result.mobile.states.error.state === 'observed').length,
    empty_state_observed: results.filter(result => result.desktop.states.empty.state === 'observed' || result.mobile.states.empty.state === 'observed').length,
    loading_state_observed: results.filter(result => result.desktop.states.loading.observed_on_launch || result.mobile.states.loading.observed_on_launch).length,
    deterministic_state_records: results.filter(result => hasDeterministicStateEvidence(result.desktop) && hasDeterministicStateEvidence(result.mobile)).length,
    recovered_to_desktop: results.filter(result => result.desktop.states.recovery.closed_to_desktop && result.mobile.states.recovery.closed_to_desktop).length,
  };
}

function resetEvidenceDirectory(resetAllEvidence: boolean): void {
  if (resetAllEvidence) {
    rmSync(evidenceRoot, { recursive: true, force: true });
  }
  mkdirSync(screenshotRoot, { recursive: true });
  mkdirSync(dirname(reportPath), { recursive: true });
}

function writeAppEvidence(result: AppImprovementEvidence): void {
  const appReport = {
    schema: 'swissknife.virtual-desktop-app-improvement.v1',
    task_id: 'SVD-133',
    manifest_id: VIRTUAL_DESKTOP_APP_MANIFEST.manifest_id,
    manifest_version: VIRTUAL_DESKTOP_APP_MANIFEST.version,
    generated_at: new Date().toISOString(),
    evidence_run_id: buildEvidenceRunId([result.app_id]),
    app: result,
  };
  writeFileSync(
    join(evidenceRoot, `${safeFileName(result.app_id)}.json`),
    `${JSON.stringify(appReport, null, 2)}\n`,
    'utf8',
  );
}

async function visibleCount(locator: Locator): Promise<number> {
  const count = await locator.count();
  let visible = 0;
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) visible += 1;
  }
  return visible;
}

function emptyFocusEvidence(): FocusEvidence {
  return {
    before: { tag_name: 'none', name: '', selector_hint: '' },
    after_tab: { tag_name: 'none', name: '', selector_hint: '' },
  };
}

function emptyStateEvidence(): StateEvidence {
  return {
    manifest_ux_scenarios: {
      success: '',
      fallback: '',
      error: '',
    },
    deterministic_contract: {
      loading_state: 'window-loading indicator count at launch and after settle',
      empty_state: 'visible empty-state copy snippets from the opened app window',
      error_state: 'visible policy/error/offline snippets plus named recovery controls',
      recovery_state: 'close the actual app window and return to the desktop',
    },
    loading: { observed_on_launch: false, remaining_loading_indicators: 0 },
    empty: { state: 'not_observed', snippets: [] },
    error: { state: 'not_observed', snippets: [], recovery_controls: [] },
    deterministic_snapshot: {
      state_hash: stableHash(JSON.stringify({
        text_length: 0,
        visible_control_count: 0,
        loading_indicator_count: 0,
        empty_snippet_count: 0,
        error_snippet_count: 0,
        recovery_control_count: 0,
      })),
      text_length: 0,
      visible_control_count: 0,
      loading_indicator_count: 0,
      empty_snippet_count: 0,
      error_snippet_count: 0,
      recovery_control_count: 0,
    },
    recovery: {
      close_window_control_visible: false,
      closed_to_desktop: false,
      app_window_count_after_close: -1,
      close_method: 'not-available',
      harness_cleanup_performed: false,
      app_window_count_after_cleanup: -1,
    },
  };
}

function emptyViewportLayoutEvidence(): ViewportLayoutEvidence {
  return {
    root_rect: { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 },
    content_box: { client_width: 0, scroll_width: 0, client_height: 0, scroll_height: 0 },
    text_element_count: 0,
    visible_control_count: 0,
    horizontal_overflow: true,
    unintended_document_overflow: true,
    no_unintended_horizontal_overflow: false,
    no_offscreen_content: false,
    no_text_or_control_overlap: false,
    no_clipped_readable_text: false,
    offscreen_elements: [],
    clipped_text_ids: [],
    overlap_pairs: [],
    pass: false,
  };
}

function hasDeterministicStateEvidence(evidence: ViewportEvidence): boolean {
  return Boolean(
    evidence.states.manifest_ux_scenarios.success
      && evidence.states.manifest_ux_scenarios.fallback
      && evidence.states.manifest_ux_scenarios.error
      && evidence.states.deterministic_contract.loading_state
      && evidence.states.deterministic_contract.empty_state
      && evidence.states.deterministic_contract.error_state
      && evidence.states.deterministic_contract.recovery_state
      && /^[0-9a-f]{16}$/.test(evidence.states.deterministic_snapshot.state_hash)
      && evidence.states.deterministic_snapshot.visible_control_count > 0,
  );
}

function hasUiUxViewportQuality(evidence: ViewportEvidence): boolean {
  return Boolean(
    evidence.layout?.pass
      && evidence.layout.no_unintended_horizontal_overflow
      && evidence.layout.no_offscreen_content
      && evidence.layout.no_text_or_control_overlap
      && evidence.layout.no_clipped_readable_text
      && evidence.focus?.after_tab?.tag_name
      && evidence.focus.after_tab.tag_name !== 'body'
      && evidence.primary_control?.visible
      && evidence.primary_control.enabled
      && evidence.primary_control.rect.width > 0
      && evidence.primary_control.rect.height > 0
      && evidence.states?.deterministic_snapshot?.text_length > 0
      && evidence.states?.recovery?.closed_to_desktop === true,
  );
}

function buildScreenshotIndex(report: AppImprovementIndex): ScreenshotIndex {
  const screenshots = report.apps.flatMap(app => ([
    screenshotEntry(app, app.desktop),
    screenshotEntry(app, app.mobile),
  ]));
  return {
    schema: 'swissknife.virtual-desktop-app-improvement.screenshot-index.v1',
    task_id: viewportMatrixEnabled ? 'SVD-180' : 'SVD-133',
    generated_at: new Date().toISOString(),
    evidence_run_id: report.evidence_run_id,
    screenshot_dir: report.screenshot_dir,
    screenshot_count: screenshots.length,
    screenshots,
  };
}

function screenshotEntry(app: AppImprovementEvidence, viewport: ViewportEvidence): ScreenshotIndexEntry {
  const absolutePath = join(process.cwd(), viewport.screenshot);
  const stat = existsSync(absolutePath) ? statSync(absolutePath) : null;
  return {
    app_id: app.app_id,
    title: app.title,
    viewport: viewport.viewport === 'mobile' ? 'narrow' : 'desktop',
    viewport_size: viewport.viewport_size,
    path: viewport.screenshot,
    exists: Boolean(stat),
    bytes: stat?.size ?? 0,
    opened: viewport.opened,
    layout_pass: viewport.layout?.pass === true,
    keyboard_focus_selector: viewport.focus?.after_tab?.selector_hint || '',
    recovery_close_method: viewport.states?.recovery?.close_method || 'not-available',
  };
}

function buildUiUxAccessibilityReport(
  report: AppImprovementIndex,
  screenshotIndex: ScreenshotIndex,
): UiUxAccessibilityReport {
  const applications = report.apps.map(app => {
    const desktop = uiViewportSummary(app.desktop);
    const narrow = uiViewportSummary(app.mobile);
    return {
      app_id: app.app_id,
      title: app.title,
      category: app.category,
      service_families: app.service_families,
      manifest_ux_scenarios: app.manifest_ux_scenarios,
      viewports: { desktop, narrow },
      recovery_path: buildRecoveryPath(app),
      pass: desktop.pass && narrow.pass && app.pass,
    };
  });
  const acceptance = {
    every_canonical_app_covered: report.selected_app_count === VIRTUAL_DESKTOP_APP_MANIFEST.apps.length
      && applications.length === VIRTUAL_DESKTOP_APP_MANIFEST.apps.length
      && report.selected_app_ids.join(',') === VIRTUAL_DESKTOP_APP_MANIFEST.apps.map(app => app.id).join(','),
    desktop_and_narrow_layout_pass: applications.every(app => app.viewports.desktop.layout.pass && app.viewports.narrow.layout.pass),
    keyboard_focus_visible: applications.every(app => app.viewports.desktop.keyboard.focus_after_tab && app.viewports.narrow.keyboard.focus_after_tab),
    readable_loading_empty_error_denied_states: applications.every(app =>
      app.viewports.desktop.states.readable && app.viewports.narrow.states.readable),
    no_unintended_horizontal_overflow_or_overlap: applications.every(app =>
      app.viewports.desktop.layout.no_unintended_horizontal_overflow
        && app.viewports.narrow.layout.no_unintended_horizontal_overflow
        && app.viewports.desktop.layout.no_text_or_control_overlap
        && app.viewports.narrow.layout.no_text_or_control_overlap),
    reviewer_readable_recovery_path: applications.every(app => app.recovery_path.close_to_desktop.desktop
      && app.recovery_path.close_to_desktop.narrow
      && app.recovery_path.guidance.length > 0),
    screenshot_index_complete: screenshotIndex.screenshot_count === applications.length * 2
      && screenshotIndex.screenshots.every(entry => entry.exists && entry.bytes > 0),
  };
  return {
    schema: 'swissknife.virtual-desktop-app-improvement.ui-ux-accessibility.v1',
    task_id: 'SVD-180',
    generated_at: new Date().toISOString(),
    source_report: relative(process.cwd(), reportPath),
    screenshot_index: relative(process.cwd(), screenshotIndexPath),
    validation_command: 'npm run test:e2e:app-improvement -- --all --viewport-matrix && npm run test:e2e:accessibility',
    manifest_id: report.manifest_id,
    manifest_version: report.manifest_version,
    manifest_app_count: report.manifest_app_count,
    selected_app_count: report.selected_app_count,
    viewport_matrix: [
      { id: 'desktop', source: 'desktop', width: viewportProfiles[0].width, height: viewportProfiles[0].height },
      { id: 'narrow', source: 'mobile', width: viewportProfiles[1].width, height: viewportProfiles[1].height },
    ],
    status: Object.values(acceptance).every(Boolean) && applications.every(app => app.pass) ? 'passed' : 'failed',
    summary: {
      passed: applications.filter(app => app.pass).length,
      failed: applications.filter(app => !app.pass).length,
      screenshots: screenshotIndex.screenshot_count,
      desktop_layout_passed: applications.filter(app => app.viewports.desktop.layout.pass).length,
      narrow_layout_passed: applications.filter(app => app.viewports.narrow.layout.pass).length,
      keyboard_focus_passed: applications.filter(app => app.viewports.desktop.keyboard.focus_after_tab && app.viewports.narrow.keyboard.focus_after_tab).length,
      recovery_paths: applications.filter(app => app.recovery_path.close_to_desktop.desktop && app.recovery_path.close_to_desktop.narrow).length,
    },
    acceptance,
    applications,
  };
}

function uiViewportSummary(evidence: ViewportEvidence): UiViewportSummary {
  return {
    viewport_size: evidence.viewport_size,
    screenshot: evidence.screenshot,
    opened: evidence.opened,
    layout: {
      pass: evidence.layout.pass,
      no_unintended_horizontal_overflow: evidence.layout.no_unintended_horizontal_overflow,
      no_offscreen_content: evidence.layout.no_offscreen_content,
      no_text_or_control_overlap: evidence.layout.no_text_or_control_overlap,
      no_clipped_readable_text: evidence.layout.no_clipped_readable_text,
      text_element_count: evidence.layout.text_element_count,
      visible_control_count: evidence.layout.visible_control_count,
      offscreen_elements: evidence.layout.offscreen_elements,
      clipped_text_ids: evidence.layout.clipped_text_ids,
      overlap_pairs: evidence.layout.overlap_pairs,
    },
    keyboard: {
      focus_before_selector: evidence.focus.before.selector_hint,
      focus_after_tab_selector: evidence.focus.after_tab.selector_hint,
      focus_after_tab: evidence.focus.after_tab.tag_name !== 'body' && Boolean(evidence.focus.after_tab.tag_name),
      primary_control_name: evidence.primary_control?.name || '',
      primary_control_action_succeeded: evidence.primary_control?.action_succeeded === true,
    },
    states: {
      readable: hasDeterministicStateEvidence(evidence),
      loading: evidence.states.loading,
      empty: evidence.states.empty,
      error_or_denied: evidence.states.error,
      deterministic_contract: evidence.states.deterministic_contract,
      deterministic_snapshot: evidence.states.deterministic_snapshot,
    },
    recovery: evidence.states.recovery,
    pass: hasUiUxViewportQuality(evidence),
  };
}

function buildRecoveryPath(app: AppImprovementEvidence): UiRecoveryPath {
  const recoveryControls = [
    ...app.desktop.states.error.recovery_controls.map(control => control.name),
    ...app.mobile.states.error.recovery_controls.map(control => control.name),
  ].filter(Boolean);
  const guidance = Array.from(new Set([
    app.manifest_ux_scenarios.error,
    app.manifest_ux_scenarios.fallback,
    ...recoveryControls,
    `Close ${app.title} to return to the desktop, then relaunch from .desktop-icons .icon[data-app="${app.app_id}"].`,
  ].filter(Boolean)));
  return {
    guidance,
    close_to_desktop: {
      desktop: app.desktop.states.recovery.closed_to_desktop,
      narrow: app.mobile.states.recovery.closed_to_desktop,
    },
    close_method: {
      desktop: app.desktop.states.recovery.close_method,
      narrow: app.mobile.states.recovery.close_method,
    },
  };
}

function hasAppWorkflowEvidence(appId: string, evidence: ViewportEvidence): boolean {
  if (appId === 'calculator') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'calculator.calculation-cid-history'
        && workflow.vda_id === 'VDA-G033'
        && workflow.complete === true
        && workflow.acceptance['calculation-cid-history']
        && workflow.acceptance['verified-explanation']
        && workflow.acceptance['keypad-focus']
        && workflow.acceptance['error-handling']
        && workflow.acceptance['responsive-layout']
        && workflow.checkpoint_refs.length >= 1
        && workflow.receipt_refs.length >= 1,
    );
  }
  if (appId === 'datasets-browser') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'datasets-browser.semantic-provenance-preparation'
        && workflow.vda_id === 'VDA-G048'
        && workflow.complete === true
        && workflow.acceptance['dataset-cid']
        && workflow.acceptance['semantic-operation']
        && workflow.acceptance['provenance-operation']
        && workflow.acceptance['preparation-job']
        && workflow.acceptance['schema-filter-ui']
        && workflow.acceptance['error-ui']
        && workflow.acceptance['progress-ui']
        && workflow.acceptance.receipts
        && workflow.checkpoint_refs.length >= 7
        && workflow.receipt_refs.length >= 6,
    );
  }
  if (appId === 'accelerate-panel') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'accelerate-panel.inference-with-hardware-fit'
        && workflow.vda_id === 'VDA-G049'
        && workflow.complete === true
        && workflow.acceptance['model-artifacts']
        && workflow.acceptance['evaluation-policy']
        && workflow.acceptance['primary-execution']
        && workflow.acceptance['hardware-fit']
        && workflow.acceptance['queue-log-cancel']
        && workflow.acceptance['no-capacity-recovery']
        && workflow.checkpoint_refs.length > 0
        && workflow.receipt_refs.length > 0,
    );
  }
  if (appId === 'agent-supervisor') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'agent-supervisor.steer-goals-subgoals-dispatch'
        && workflow.vda_id === 'VDA-G054'
        && workflow.complete === true
        && workflow.acceptance['goal-subgoal-graph']
        && workflow.acceptance['prompt-preview']
        && workflow.acceptance['taskboard-links']
        && workflow.acceptance['policy-confirmation']
        && workflow.acceptance['kda-evidence']
        && workflow.acceptance.progress
        && workflow.acceptance['timeout-reassignment']
        && workflow.acceptance['receipt-visibility']
        && workflow.checkpoint_refs.length >= 8
        && workflow.receipt_refs.length >= 8,
    );
  }
  if (appId === 'calendar') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'calendar.artifact-backed-scheduling'
        && workflow.vda_id === 'VDA-G035'
        && workflow.complete === true
        && workflow.acceptance['artifact-backed-events']
        && workflow.acceptance['semantic-search']
        && workflow.acceptance.reminders
        && workflow.acceptance['conflict-handling']
        && workflow.acceptance['mobile-summary']
        && workflow.checkpoint_refs.length >= 6
        && workflow.receipt_refs.length >= 5,
    );
  }
  if (appId === 'clock') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'clock.timer-reminder-scheduling'
        && workflow.vda_id === 'VDA-G034'
        && workflow.complete === true
        && workflow.acceptance['timer-receipt']
        && workflow.acceptance['reminder-policy']
        && workflow.acceptance['scheduling-state']
        && workflow.acceptance['permission-recovery']
        && workflow.acceptance['compact-ui']
        && workflow.checkpoint_refs.length >= 6
        && workflow.receipt_refs.length >= 6,
    );
  }
  if (appId === 'cinema') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'cinema.project-media-render-provenance'
        && workflow.vda_id === 'VDA-G043'
        && workflow.complete === true
        && workflow.acceptance['project-media-cids']
        && workflow.acceptance['rights-metadata']
        && workflow.acceptance['render-queue']
        && workflow.acceptance['failed-export']
        && workflow.acceptance['playback-fallback']
        && workflow.acceptance['stable-timeline-controls']
        && workflow.checkpoint_refs.length >= 7
        && workflow.receipt_refs.length >= 6,
    );
  }
  if (appId === 'idl-explorer') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'idl-explorer.inspect-governed-descriptors'
        && workflow.vda_id === 'VDA-G050'
        && workflow.complete === true
        && workflow.acceptance['descriptor-cids']
        && workflow.acceptance['schema-policy']
        && workflow.acceptance['compatibility-fixture']
        && workflow.acceptance['invalid-input']
        && workflow.acceptance['transport-badges']
        && workflow.acceptance['receipt-drill-down']
        && workflow.checkpoint_refs.length >= 5
        && workflow.receipt_refs.length >= 3,
    );
  }
  if (appId === 'glasses-preview') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'glasses-preview.replay-orb-handoff'
        && workflow.vda_id === 'VDA-G051'
        && workflow.complete === true
        && workflow.acceptance['replay-bundle']
        && workflow.acceptance['privacy-policy']
        && workflow.acceptance['display-denial']
        && workflow.acceptance['camera-denial']
        && workflow.acceptance['microphone-denial']
        && workflow.acceptance['speaker-denial']
        && workflow.acceptance['display-audio-analysis']
        && workflow.acceptance['fallback-proof']
        && workflow.checkpoint_refs.length >= 7
        && workflow.receipt_refs.length >= 7,
    );
  }
  if (appId === 'friends-list') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'friends-list.contact-provenance-policy-state'
        && workflow.vda_id === 'VDA-G037'
        && workflow.complete === true
        && workflow.acceptance['contact-provenance']
        && workflow.acceptance['relationship-policy']
        && workflow.acceptance['invitation-blocking-state']
        && workflow.acceptance.freshness
        && workflow.acceptance['accessible-empty-state']
        && workflow.checkpoint_refs.length >= 7
        && workflow.receipt_refs.length >= 6,
    );
  }
  if (appId === 'image-viewer') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'image-viewer.cid-metadata-enhancement'
        && workflow.vda_id === 'VDA-G038'
        && workflow.complete === true
        && workflow.acceptance['cid-retrieval']
        && workflow.acceptance['metadata-ocr']
        && workflow.acceptance['enhancement-job']
        && workflow.acceptance['zoom-pan']
        && workflow.acceptance['unsupported-format']
        && workflow.acceptance['alt-text']
        && workflow.checkpoint_refs.length >= 7
        && workflow.receipt_refs.length >= 6,
    );
  }
  if (appId === 'media-player') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'media-player.cid-audio-quality-recovery'
        && workflow.vda_id === 'VDA-G040'
        && workflow.complete === true
        && workflow.acceptance['cid-media']
        && workflow.acceptance['captions-metadata']
        && workflow.acceptance.diagnostics
        && workflow.acceptance['seek-volume']
        && workflow.acceptance['missing-codec']
        && workflow.acceptance['background-audio-recovery']
        && workflow.checkpoint_refs.length >= 7
        && workflow.receipt_refs.length >= 6,
    );
  }
  if (appId === 'music-studio') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'music-studio.classic-artifact-save-render-fallback'
        && workflow.vda_id === 'VDA-G046'
        && workflow.complete === true
        && workflow.acceptance['legacy-workflow']
        && workflow.acceptance['artifact-workflow']
        && workflow.acceptance['metadata-rights']
        && workflow.acceptance['optional-render']
        && workflow.acceptance['save-proof']
        && workflow.acceptance['responsive-fallback']
        && workflow.checkpoint_refs.length >= 8
        && workflow.receipt_refs.length >= 7,
    );
  }
  if (appId === 'neural-photoshop') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'neural-photoshop.source-result-provenance-edit'
        && workflow.vda_id === 'VDA-G042'
        && workflow.complete === true
        && workflow.acceptance['source-result-cids']
        && workflow.acceptance['prompt-model-provenance']
        && workflow.acceptance['generation-progress']
        && workflow.acceptance['edit-progress']
        && workflow.acceptance.cancellation
        && workflow.acceptance.denial
        && workflow.acceptance['comparison-ui']
        && workflow.checkpoint_refs.length >= 9
        && workflow.receipt_refs.length >= 7,
    );
  }
  if (appId === 'orb-auto-ui') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'orb-auto-ui.generate-governed-auto-ui'
        && workflow.vda_id === 'VDA-G052'
        && workflow.complete === true
        && workflow.acceptance['generated-artifact-cids']
        && workflow.acceptance['intent-schema-policy']
        && workflow.acceptance['execution-preview']
        && workflow.acceptance['schema-error']
        && workflow.acceptance.confirmation
        && workflow.acceptance['fallback-renderer']
        && workflow.checkpoint_refs.length >= 6
        && workflow.receipt_refs.length >= 5,
    );
  }
  if (appId === 'mcp-plus-plus') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'mcp-plus-plus.diagnose-profiles-peers-event-dag'
        && workflow.vda_id === 'VDA-G053'
        && workflow.complete === true
        && workflow.acceptance['peer-diagnostics']
        && workflow.acceptance['event-dag-diagnostics']
        && workflow.acceptance['policy-diagnostics']
        && workflow.acceptance['scheduling-diagnostics']
        && workflow.acceptance['http-libp2p-distinction']
        && workflow.acceptance['did-identity']
        && workflow.acceptance['profile-failure']
        && workflow.acceptance['evidence-drill-down']
        && workflow.checkpoint_refs.length >= 8
        && workflow.receipt_refs.length >= 8,
    );
  }
  if (appId === 'neural-network-designer') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'neural-network-designer.design-compile-train'
        && workflow.vda_id === 'VDA-G031'
        && workflow.complete === true
        && workflow.acceptance['graph-artifacts']
        && workflow.acceptance['schema-validation']
        && workflow.acceptance['compile-train-planning']
        && workflow.acceptance['invalid-edge-feedback']
        && workflow.acceptance['result-receipts']
        && workflow.checkpoint_refs.length >= 5
        && workflow.receipt_refs.length >= 5,
    );
  }
  if (appId === 'p2p-chat-unified') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'p2p-chat-unified.pubsub-offline-recovery'
        && workflow.vda_id === 'VDA-G030'
        && workflow.complete === true
        && workflow.acceptance['pubsub-offline-delivery']
        && workflow.acceptance['moderation-context']
        && workflow.acceptance.receipts
        && workflow.acceptance['audio-fallback']
        && workflow.acceptance['offline-recovery']
        && workflow.checkpoint_refs.length >= 6
        && workflow.receipt_refs.length >= 6,
    );
  }
  if (appId === 'p2p-chat') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'p2p-chat.legacy-alias-pubsub-migration'
        && workflow.vda_id === 'VDA-G047'
        && workflow.complete === true
        && workflow.acceptance['legacy-alias-behavior']
        && workflow.acceptance['pubsub-provenance']
        && workflow.acceptance['offline-state']
        && workflow.acceptance['delivery-failure']
        && workflow.acceptance['migration-path']
        && workflow.checkpoint_refs.length >= 6
        && workflow.receipt_refs.length >= 5,
    );
  }
  if (appId === 'peertube') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'peertube.cid-playback-quality-recovery'
        && workflow.vda_id === 'VDA-G036'
        && workflow.complete === true
        && workflow.acceptance['cid-playback']
        && workflow.acceptance.captions
        && workflow.acceptance.diagnostics
        && workflow.acceptance['buffering-recovery']
        && workflow.acceptance['missing-content-recovery']
        && workflow.acceptance['media-fallback']
        && workflow.checkpoint_refs.length >= 7
        && workflow.receipt_refs.length >= 6,
    );
  }
  if (appId === 'strudel') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'strudel.session-sample-pattern-recovery'
        && workflow.vda_id === 'VDA-G044'
        && workflow.complete === true
        && workflow.acceptance['session-sample-cids']
        && workflow.acceptance['pattern-context']
        && workflow.acceptance['optional-assistance']
        && workflow.acceptance['compile-audio-errors']
        && workflow.acceptance['session-restore']
        && workflow.checkpoint_refs.length >= 7
        && workflow.receipt_refs.length >= 6,
    );
  }
  if (appId === 'strudel-ai-daw') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'strudel-ai-daw.assisted-composition-render-recovery'
        && workflow.vda_id === 'VDA-G045'
        && workflow.complete === true
        && workflow.acceptance['asset-provenance']
        && workflow.acceptance['assisted-composition']
        && workflow.acceptance['render-state']
        && workflow.acceptance.undo
        && workflow.acceptance['failed-audio-backend']
        && workflow.acceptance['compact-controls']
        && workflow.checkpoint_refs.length >= 9
        && workflow.receipt_refs.length >= 6,
    );
  }
  if (appId === 'system-monitor') {
    const workflow = evidence.app_workflow;
    return Boolean(
      workflow?.workflow_id === 'system-monitor.live-diagnostics'
        && workflow.vda_id === 'VDA-G041'
        && workflow.complete === true
        && workflow.acceptance['live-telemetry']
        && workflow.acceptance['diagnostic-history']
        && workflow.acceptance.analysis
        && workflow.acceptance['stale-data']
        && workflow.acceptance['alert-state']
        && workflow.acceptance['accessible-summaries']
        && workflow.checkpoint_refs.length > 0
        && workflow.receipt_refs.length > 0,
    );
  }
  if (appId !== 'training-manager') return true;
  const workflow = evidence.app_workflow;
  return Boolean(
    workflow?.workflow_id === 'training-manager.train-with-dataset'
      && workflow.vda_id === 'VDA-G032'
      && workflow.complete === true
      && workflow.acceptance.provenance
      && workflow.acceptance['capacity-queue']
      && workflow.acceptance.telemetry
      && workflow.acceptance['cancellation-confirmation']
      && workflow.acceptance.checkpoints
      && workflow.acceptance['resume-recovery']
      && workflow.checkpoint_refs.length > 0
      && workflow.receipt_refs.length > 0,
  );
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
}

function cssEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    for (const key of Array.from(url.searchParams.keys())) {
      if (/token|key|secret|password|credential/i.test(key)) {
        url.searchParams.set(key, '[redacted]');
      }
    }
    return url.toString();
  } catch {
    return value.replace(/([?&](?:token|key|secret|password|credential)=)[^&]+/gi, '$1[redacted]');
  }
}

function buildEvidenceRunId(selectedIds: string[]): string {
  return `svd-133-${VIRTUAL_DESKTOP_APP_MANIFEST.version}-${stableHash([
    VIRTUAL_DESKTOP_APP_MANIFEST.manifest_id,
    VIRTUAL_DESKTOP_APP_MANIFEST.version,
    ...selectedIds,
  ].join('|'))}`;
}

function stableHash(input: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193) >>> 0;
    hashB = (Math.imul(hashB ^ code, 0x85ebca6b) + 0xc2b2ae35) >>> 0;
  }
  return `${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}`;
}

interface AppImprovementIndex {
  schema: 'swissknife.virtual-desktop-all-app-improvement.v1';
  task_id: 'SVD-133';
  generated_at: string;
  evidence_run_id: string;
  manifest_id: string;
  manifest_version: string;
  manifest_app_count: number;
  manifest_app_ids: string[];
  selected_app_count: number;
  selected_app_ids: string[];
  scope: string;
  launch_policy: {
    source: 'canonical manifest';
    desktop_selector: string;
    aliases_allowed: false;
    static_html_server_allowed: false;
    synthetic_success_allowed: false;
    runner: string;
  };
  screenshot_dir: string;
  per_app_report_dir: string;
  summary: ReturnType<typeof summarize>;
  apps: AppImprovementEvidence[];
}

interface AppImprovementEvidence {
  app_id: string;
  canonical_id: string;
  title: string;
  category: string;
  launch_kind: string;
  manifest_capabilities: string[];
  service_families: string[];
  manifest_ux_scenarios: {
    success: string;
    fallback: string;
    error: string;
  };
  desktop: ViewportEvidence;
  mobile: ViewportEvidence;
  pass: boolean;
}

interface ViewportEvidence {
  viewport: 'desktop' | 'mobile';
  viewport_size: { width: number; height: number };
  opened: boolean;
  launch: LaunchEvidence;
  screenshot: string;
  primary_control: PrimaryControlEvidence | null;
  focus: FocusEvidence;
  layout: ViewportLayoutEvidence;
  states: StateEvidence;
  app_workflow: AppWorkflowEvidence | null;
  console_events: ConsoleEvidence[];
  network_events: NetworkEvidence[];
  interaction_error?: string;
}

interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface LayoutElement {
  label: string;
  tag_name: string;
  rect: LayoutRect;
  clientWidth: number;
  scrollWidth: number;
  clientHeight: number;
  scrollHeight: number;
}

interface ViewportLayoutEvidence {
  root_rect: LayoutRect;
  content_box: {
    client_width: number;
    scroll_width: number;
    client_height: number;
    scroll_height: number;
  };
  text_element_count: number;
  visible_control_count: number;
  horizontal_overflow: boolean;
  unintended_document_overflow: boolean;
  no_unintended_horizontal_overflow: boolean;
  no_offscreen_content: boolean;
  no_text_or_control_overlap: boolean;
  no_clipped_readable_text: boolean;
  offscreen_elements: string[];
  clipped_text_ids: string[];
  overlap_pairs: string[];
  pass: boolean;
}

interface AppWorkflowEvidence {
  workflow_id: string;
  vda_id: string;
  acceptance: Record<string, boolean>;
  markers: Array<{
    marker: string;
    observed: boolean;
    snippets: string[];
  }>;
  actions: Array<{
    action: string;
    name: string;
  }>;
  checkpoint_refs: string[];
  receipt_refs: string[];
  complete: boolean;
}

interface LaunchEvidence {
  selector: string;
  from_desktop_icon: boolean;
  icon_visible: boolean;
  registered_in_desktop_runtime: boolean;
  window_count_before: number;
  window_count_after: number;
  icon_focus_before_launch?: ElementDescriptor;
}

interface PrimaryControlEvidence {
  probe_id: string;
  selector: string;
  tag_name: string;
  input_type?: string;
  role?: string;
  name: string;
  score: number;
  visible: boolean;
  enabled: boolean;
  rect: { x: number; y: number; width: number; height: number };
  action: 'click' | 'fill' | 'select' | 'toggle' | 'range-step';
  action_method?: 'pointer' | 'keyboard-enter' | 'keyboard-space' | 'fill' | 'keyboard-fill' | 'select' | 'keyboard-step';
  action_attempted?: boolean;
  action_succeeded?: boolean;
  pointer_click_error?: string;
  before_text?: string;
  after_text?: string;
  active_element_after?: ElementDescriptor;
  event_probe?: ControlEventProbeEvidence;
}

interface ControlEventProbeEvidence {
  before: ControlEventProbeSnapshot;
  after: ControlEventProbeSnapshot;
  action_event_count: number;
  value_changed: boolean;
}

interface ControlEventProbeSnapshot {
  probe_id: string;
  click: number;
  input: number;
  change: number;
  keydown: number;
  focus: number;
  before_value: string;
  before_checked: boolean | null;
  before_selected_index: number | null;
  after_value: string;
  after_checked: boolean | null;
  after_selected_index: number | null;
}

interface FocusEvidence {
  before: ElementDescriptor;
  after_tab: ElementDescriptor;
}

interface ElementDescriptor {
  tag_name: string;
  name: string;
  selector_hint: string;
}

interface StateEvidence {
  manifest_ux_scenarios: {
    success: string;
    fallback: string;
    error: string;
  };
  deterministic_contract: {
    loading_state: string;
    empty_state: string;
    error_state: string;
    recovery_state: string;
  };
  loading: {
    observed_on_launch: boolean;
    remaining_loading_indicators: number;
  };
  empty: {
    state: 'observed' | 'not_observed';
    snippets: string[];
  };
  error: {
    state: 'observed' | 'not_observed';
    snippets: string[];
    recovery_controls: Array<{ name: string }>;
  };
  deterministic_snapshot: {
    state_hash: string;
    text_length: number;
    visible_control_count: number;
    loading_indicator_count: number;
    empty_snippet_count: number;
    error_snippet_count: number;
    recovery_control_count: number;
  };
  recovery: RecoveryEvidence;
}

interface RecoveryEvidence {
  close_window_control_visible: boolean;
  closed_to_desktop: boolean;
  app_window_count_after_close: number;
  close_method: 'pointer' | 'dom-click' | 'not-available';
  harness_cleanup_performed: boolean;
  app_window_count_after_cleanup: number;
}

interface DesktopStateEvidence {
  desktop_hook_present: boolean;
  registered_app_ids: string[];
  icon_app_ids: string[];
  window_count: number;
}

interface ConsoleEvidence {
  type: string;
  text: string;
  location: { url: string; lineNumber: number; columnNumber: number };
}

type NetworkEvidence =
  | {
      type: 'requestfailed';
      url: string;
      method: string;
      failure: string;
    }
  | {
      type: 'response';
      url: string;
      method: string;
      status: number;
    };

interface ScreenshotIndex {
  schema: 'swissknife.virtual-desktop-app-improvement.screenshot-index.v1';
  task_id: 'SVD-133' | 'SVD-180';
  generated_at: string;
  evidence_run_id: string;
  screenshot_dir: string;
  screenshot_count: number;
  screenshots: ScreenshotIndexEntry[];
}

interface ScreenshotIndexEntry {
  app_id: string;
  title: string;
  viewport: 'desktop' | 'narrow';
  viewport_size: { width: number; height: number };
  path: string;
  exists: boolean;
  bytes: number;
  opened: boolean;
  layout_pass: boolean;
  keyboard_focus_selector: string;
  recovery_close_method: RecoveryEvidence['close_method'];
}

interface UiUxAccessibilityReport {
  schema: 'swissknife.virtual-desktop-app-improvement.ui-ux-accessibility.v1';
  task_id: 'SVD-180';
  generated_at: string;
  source_report: string;
  screenshot_index: string;
  validation_command: string;
  manifest_id: string;
  manifest_version: string;
  manifest_app_count: number;
  selected_app_count: number;
  viewport_matrix: Array<{ id: 'desktop' | 'narrow'; source: 'desktop' | 'mobile'; width: number; height: number }>;
  status: 'passed' | 'failed';
  summary: {
    passed: number;
    failed: number;
    screenshots: number;
    desktop_layout_passed: number;
    narrow_layout_passed: number;
    keyboard_focus_passed: number;
    recovery_paths: number;
  };
  acceptance: Record<string, boolean>;
  applications: UiAppSummary[];
}

interface UiAppSummary {
  app_id: string;
  title: string;
  category: string;
  service_families: string[];
  manifest_ux_scenarios: AppImprovementEvidence['manifest_ux_scenarios'];
  viewports: {
    desktop: UiViewportSummary;
    narrow: UiViewportSummary;
  };
  recovery_path: UiRecoveryPath;
  pass: boolean;
}

interface UiViewportSummary {
  viewport_size: { width: number; height: number };
  screenshot: string;
  opened: boolean;
  layout: {
    pass: boolean;
    no_unintended_horizontal_overflow: boolean;
    no_offscreen_content: boolean;
    no_text_or_control_overlap: boolean;
    no_clipped_readable_text: boolean;
    text_element_count: number;
    visible_control_count: number;
    offscreen_elements: string[];
    clipped_text_ids: string[];
    overlap_pairs: string[];
  };
  keyboard: {
    focus_before_selector: string;
    focus_after_tab_selector: string;
    focus_after_tab: boolean;
    primary_control_name: string;
    primary_control_action_succeeded: boolean;
  };
  states: {
    readable: boolean;
    loading: StateEvidence['loading'];
    empty: StateEvidence['empty'];
    error_or_denied: StateEvidence['error'];
    deterministic_contract: StateEvidence['deterministic_contract'];
    deterministic_snapshot: StateEvidence['deterministic_snapshot'];
  };
  recovery: RecoveryEvidence;
  pass: boolean;
}

interface UiRecoveryPath {
  guidance: string[];
  close_to_desktop: {
    desktop: boolean;
    narrow: boolean;
  };
  close_method: {
    desktop: RecoveryEvidence['close_method'];
    narrow: RecoveryEvidence['close_method'];
  };
}
