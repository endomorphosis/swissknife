#!/usr/bin/env node
/** Observe one real canonical app. Baselines never grant functional acceptance.
 * No operation controls are clicked; tool requests, writes and external network
 * access are blocked. An owned Vite server and browser are always cleaned up.
 */
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findOwnedPort } from './lib/pick-free-port.mjs';

const filename = fileURLToPath(import.meta.url);
export const PROJECT_ROOT = path.resolve(path.dirname(filename), '..');
export const CONTRACT_PATH = path.join(PROJECT_ROOT, 'config/visual-functional-app-contracts.json');
export const BASELINE_SCHEMA = 'swissknife.visual-functional-baseline.v1';
const LOCK_PATH = path.join(PROJECT_ROOT, 'test-results/visual-functional/.capture.lock');
const require = createRequire(import.meta.url);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const usage = 'usage: capture-visual-functional-baseline.mjs --app <canonical-id> --output-dir <path> [--desktop-url <http(s) URL>]';
export const VIEWPORTS = Object.freeze([
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]);

export function parseArguments(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = { '--app': 'appId', '--output-dir': 'outputDir', '--desktop-url': 'desktopUrl' }[argv[i]];
    if (!key || result[key] !== undefined || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(usage);
    result[key] = argv[++i];
  }
  if (!/^[a-z][a-z0-9-]*$/.test(result.appId || '') || !result.outputDir) throw new Error(usage);
  result.outputDir = path.resolve(result.outputDir);
  if (result.desktopUrl) {
    const url = new URL(result.desktopUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('desktop URL must be HTTP(S), without credentials, query or fragment');
    }
    result.desktopUrl = url.href;
  }
  return result;
}

export function loadCanonicalContracts() {
  const { require: loadTs } = require('tsx/cjs/api');
  return {
    manifest: loadTs(path.join(PROJECT_ROOT, 'src/services/apps/virtual-desktop-app-manifest.ts'), filename).VIRTUAL_DESKTOP_APP_MANIFEST,
    backend: loadTs(path.join(PROJECT_ROOT, 'src/services/apps/all-app-executable-backend-contract.ts'), filename).ALL_APP_EXECUTABLE_BACKEND_CONTRACT,
  };
}

const nonempty = value => typeof value === 'string' && value.trim().length > 0;
function assert(condition, message) { if (!condition) throw new Error(message); }
export function validateContracts(config, manifest, backend, root = PROJECT_ROOT) {
  assert(config?.schema === 'swissknife.visual-functional-app-contracts.v1', 'invalid app contract schema');
  assert(config.manifest?.id === manifest.manifest_id && config.manifest?.version === manifest.version, 'canonical manifest identity/version mismatch');
  assert(config.manifest?.app_count === manifest.apps.length && config.apps?.length === manifest.apps.length, 'canonical app coverage mismatch');
  assert(new Set(config.apps.map(app => app.app_id)).size === config.apps.length, 'duplicate app contract');
  for (const [index, app] of config.apps.entries()) {
    const declared = manifest.apps[index];
    const owner = backend.apps.find(item => item.app_id === app.app_id);
    assert(declared?.id === app.app_id && declared.title === app.title && owner?.disposition === app.disposition, `canonical identity/disposition mismatch: ${app.app_id}`);
    assert(Array.isArray(app.intended_workflows) && app.intended_workflows.length > 0 && app.intended_workflows.every(nonempty), `missing intended workflow: ${app.app_id}`);
    const workflow = app.primary_workflow;
    assert(workflow && ['input_fixture', 'persist_reopen', 'error', 'recovery', 'acceptance_requires'].every(key => nonempty(workflow[key])), `incomplete primary workflow: ${app.app_id}`);
    assert(workflow.actions?.length >= 2 && workflow.actions.every(nonempty) && workflow.expected_results?.length > 0 && workflow.expected_results.every(nonempty), `missing semantic workflow results: ${app.app_id}`);
    assert(Array.isArray(app.visual_checks) && app.visual_checks.length >= 4 && app.visual_checks.every(nonempty)
      && Array.isArray(app.negative_cases) && app.negative_cases.length >= 2 && app.negative_cases.every(item => nonempty(item.case) && nonempty(item.expected))
      && app.source_paths?.length > 0, `incomplete visual/negative/source contract: ${app.app_id}`);
    for (const source of app.source_paths) {
      assert(nonempty(source) && !path.isAbsolute(source) && !source.split('/').includes('..'), `invalid source path: ${source}`);
      let declared = path.resolve(root);
      for (const component of source.split('/')) {
        declared = path.join(declared, component);
        assert(!fs.lstatSync(declared).isSymbolicLink(), `symbolic source path is forbidden: ${source}`);
      }
      assert(fs.lstatSync(declared).isFile(), `invalid source path: ${source}`);
    }
    assert(app.launch?.canonical_launcher === `.desktop-icons .icon[data-app="${app.app_id}"]` && app.launch?.runtime_app_id === app.app_id, `noncanonical launch: ${app.app_id}`);
    assert(Array.isArray(app.backend_roles) && app.backend_roles.every(role => nonempty(role.semantic_role) && Array.isArray(role.bindings)), `invalid backend role shape: ${app.app_id}`);
    const actualBindings = app.backend_roles.flatMap(role => role.bindings.map(binding => ({ ...binding, owner: role.owner })));
    assert(new Set(actualBindings.map(binding => binding.binding_id)).size === actualBindings.length, `duplicate backend binding: ${app.app_id}`);
    assert(actualBindings.length === owner.backend_bindings.length, `backend role coverage mismatch: ${app.app_id}`);
    for (const binding of actualBindings) {
      const source = owner.backend_bindings.find(item => item.binding_id === binding.binding_id);
      assert(source && source.owner === binding.owner && source.mediated_intent.capability === binding.capability
        && source.mediated_intent.operation === binding.operation && source.mediated_intent.policy_class === binding.policy_class
        && source.mediated_intent.mutates_remote_state === binding.mutates_remote_state
        && JSON.stringify(source.tool_selection.preferred_tool_ids) === JSON.stringify(binding.exact_tool_candidates)
        && JSON.stringify(source.transport_policy.allowed_transports) === JSON.stringify(binding.transports), `undeclared backend tool role: ${app.app_id}/${binding.binding_id}`);
    }
    if (app.disposition !== 'tool_backed') assert(actualBindings.length === 0, `non-tool app dispatch: ${app.app_id}`);
    for (const output of Object.values(app.outputs || {})) assert(nonempty(output) && !path.isAbsolute(output) && !output.split('/').includes('..'), `invalid output path: ${app.app_id}`);
  }
  return config;
}

/** Keep query strings, credentials, payload bodies and secret-looking text out
 * of evidence. Fresh browser contexts never import saved user credentials. */
export function redactText(value, limit = 2000) {
  return String(value || '').replace(/\b(?:Bearer\s+)[^\s"'<>]+/gi, 'Bearer [redacted]')
    .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret)\s*[:=]\s*["']?[^\s,"'<>]+/gi, '$1=[redacted]')
    .slice(0, limit);
}
export function requestMetadata(url, method, resourceType, desktopOrigin) {
  try {
    const parsed = new URL(url);
    return { method, resource_type: resourceType, origin: parsed.origin === desktopOrigin ? 'desktop' : 'external', path: parsed.pathname };
  } catch { return { method, resource_type: resourceType, origin: 'invalid', path: '[invalid-url]' }; }
}
export function baselineRequestDecision(url, method, desktopOrigin) {
  let parsed;
  try { parsed = new URL(url); } catch { return { allow: false, reason: 'invalid-url' }; }
  if (['data:', 'blob:'].includes(parsed.protocol)) return { allow: true, reason: 'browser-local-content' };
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== desktopOrigin) return { allow: false, reason: 'external-network-blocked' };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) return { allow: false, reason: 'non-read-request-blocked' };
  if (/^\/mcp\/(?:tools\/call|artifacts|dag)(?:\/|$)/.test(parsed.pathname)) return { allow: false, reason: 'tool-or-private-artifact-request-blocked' };
  return { allow: true, reason: 'same-origin-read' };
}

/** Existing programs do not all use this new lock yet. Refuse an observed
 * browser/acquisition owner before launching; never signal foreign processes. */
export function findBrowserOwners(procRoot = '/proc', ownPid = process.pid) {
  const owners = [];
  for (const item of fs.readdirSync(procRoot)) {
    if (!/^\d+$/.test(item) || Number(item) === ownPid) continue;
    try {
      const args = fs.readFileSync(path.join(procRoot, item, 'cmdline'), 'utf8').split('\0').filter(Boolean);
      const executable = path.basename(args[0] || '');
      const browser = /^(chrome|chromium|chromium-browser|chrome-headless-shell)$/.test(executable);
      // Repair dispatchers list these scripts as evidence paths; those are
      // not a running browser owner. Only actual Node/npm launchers count.
      const acquisition = /^(node|nodejs|npm|npx|playwright)$/.test(executable) && args.some(arg => /(?:^|\/)(?:run-live-click\.mjs|run-vdg-family\.mjs|run-vdg-all-families\.mjs|run-rendered-census\.mjs|run-virtual-desktop-app-improvement\.mjs|playwright\/cli\.(?:js|mjs)|playwright-test\/cli\.js)$/.test(arg));
      if (browser || acquisition) owners.push({ pid: Number(item), kind: browser ? 'browser' : 'desktop-acquisition', executable });
    } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error; }
  }
  return owners;
}
export function retainsCaptureLock(lockPath = LOCK_PATH, locksText = fs.readFileSync('/proc/locks', 'utf8'), pid = process.pid) {
  let inode;
  try { inode = String(fs.statSync(lockPath, { bigint: true }).ino); } catch { return false; }
  return locksText.split('\n').some(line => {
    const fields = line.trim().split(/\s+/);
    return fields[1] === 'FLOCK' && fields[3] === 'WRITE' && fields[4] === String(pid) && fields[5]?.split(':').at(-1) === inode;
  });
}

function atomicJson(destination, payload) {
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporary, destination);
}
async function sleep(ms) { await new Promise(resolve => setTimeout(resolve, ms)); }
async function startDesktop(outputDir, signal) {
  const lease = await findOwnedPort({ preferredPort: 3017 });
  const url = `http://127.0.0.1:${lease.port}/`;
  const descriptor = fs.openSync(path.join(outputDir, 'desktop-server.log'), 'wx');
  const child = spawn('npm', ['run', 'desktop', '--', '--host', '127.0.0.1', '--port', String(lease.port), '--strictPort'], {
    cwd: PROJECT_ROOT, stdio: ['ignore', descriptor, descriptor], detached: true, shell: false,
  });
  fs.closeSync(descriptor);
  let launchError;
  child.on('error', error => { launchError = error; });
  const stop = async () => {
    if (!child.pid) return;
    try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    const deadline = Date.now() + 5000;
    while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) await sleep(100);
    if (child.exitCode === null && child.signalCode === null) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  };
  try {
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      if (signal.aborted) throw Object.assign(new Error('owned desktop startup interrupted'), { exitCode: 143 });
      if (launchError) throw launchError;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('owned desktop server exited before readiness');
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1500), redirect: 'manual' });
        await response.body?.cancel();
        if (response.ok) return { url, pid: child.pid, ownership: 'spawned-private-server', stop };
      } catch { /* Binding is still in progress. */ }
      await sleep(250);
    }
    throw new Error('owned desktop server readiness timed out');
  } catch (error) { await stop(); throw error; }
}

/** This executes in the real app DOM. It does not attach proof labels, inject
 * app content, click operation buttons, or infer functional success. */
export function collectPrimaryDom(root) {
  const visible = element => {
    const box = element.getBoundingClientRect();
    const css = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && css.visibility !== 'hidden' && css.display !== 'none';
  };
  const safe = text => String(text || '').replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [redacted]')
    .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret)\s*[:=]\s*["']?[^\s,"'<>]+/gi, '$1=[redacted]').slice(0, 12000);
  const bounds = element => {
    const r = element.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const clone = root.cloneNode(true);
  clone.querySelectorAll('script, style, input[type="password"], [data-secret], [data-credential-value]').forEach(node => node.remove());
  const controls = Array.from(root.querySelectorAll('button, input, select, textarea, a[href], [role="button"], [tabindex]'))
    .filter(visible).slice(0, 250).map(element => {
      const name = element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || element.getAttribute('placeholder') || '';
      const r = element.getBoundingClientRect();
      return { tag: element.tagName.toLowerCase(), role: element.getAttribute('role'), type: element.getAttribute('type'),
        name: safe(name).trim().slice(0, 160), disabled: element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true',
        tabindex: element.getAttribute('tabindex'), bounds: bounds(element),
        outside_viewport: r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight };
    });
  return {
    root_tag: root.tagName.toLowerCase(), root_id: root.id, bounds: bounds(root),
    text: safe(clone.textContent).replace(/\s+/g, ' ').trim(), controls,
    media: Array.from(root.querySelectorAll('img, canvas, video, audio, svg')).slice(0, 80).map(element => ({
      tag: element.tagName.toLowerCase(), visible: visible(element), bounds: bounds(element),
      ...(element.tagName === 'IMG' ? { decoded: element.complete && element.naturalWidth > 0,
        natural_width: element.naturalWidth, natural_height: element.naturalHeight, alt: safe(element.alt).slice(0, 200) } : {}),
    })),
    layout: { viewport: { width: innerWidth, height: innerHeight }, scroll_width: root.scrollWidth, client_width: root.clientWidth,
      scroll_height: root.scrollHeight, client_height: root.clientHeight, horizontal_overflow: root.scrollWidth > root.clientWidth + 1,
      unnamed_controls: controls.filter(control => !control.name).length,
      controls_outside_viewport: controls.filter(control => control.outside_viewport).length },
    functional_acceptance: 'not_evaluated',
  };
}

async function captureViewport(browser, app, viewport, desktopUrl, outputDir) {
  const consoleEvents = [];
  const network = [];
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height },
    serviceWorkers: 'block', acceptDownloads: false, permissions: [] });
  const desktopOrigin = new URL(desktopUrl).origin;
  try {
    await context.route('**/*', async route => {
      const request = route.request();
      const decision = baselineRequestDecision(request.url(), request.method(), desktopOrigin);
      if (!decision.allow) {
        network.push({ ...requestMetadata(request.url(), request.method(), request.resourceType(), desktopOrigin), blocked: true, reason: decision.reason });
        await route.abort('blockedbyclient');
      } else await route.continue();
    });
    if (typeof context.routeWebSocket === 'function') await context.routeWebSocket('**/*', route => {
      network.push({ method: 'WEBSOCKET', origin: 'not-recorded', path: '[websocket]', blocked: true, reason: 'baseline-websocket-blocked' });
      route.close();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('dialog', dialog => dialog.dismiss().catch(() => undefined));
    page.on('popup', popup => popup.close().catch(() => undefined));
    page.on('console', message => consoleEvents.push({ type: message.type(), text: redactText(message.text()) }));
    page.on('pageerror', error => consoleEvents.push({ type: 'pageerror', text: redactText(error.message) }));
    page.on('response', response => network.push({ ...requestMetadata(response.url(), response.request().method(), response.request().resourceType(), desktopOrigin), status: response.status() }));
    page.on('requestfailed', request => network.push({ ...requestMetadata(request.url(), request.method(), request.resourceType(), desktopOrigin), failed: true, reason: redactText(request.failure()?.errorText) }));
    await page.goto(desktopUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(id => {
      const desktop = window.__swissknifeDesktop || window.swissknifeDesktop;
      const loading = document.getElementById('loading-screen');
      return desktop?.apps instanceof Map && desktop.apps.has(id) && (!loading || getComputedStyle(loading).display === 'none');
    }, app.app_id, { timeout: 45000 });
    const launcher = page.locator(app.launch.canonical_launcher);
    assert(await launcher.count() === 1, 'canonical app launcher must be unique');
    await launcher.scrollIntoViewIfNeeded();
    await launcher.focus();
    await launcher.click();
    const window = page.locator(app.launch.window_selector).last();
    await window.waitFor({ state: 'visible', timeout: 20000 });
    const canonicalRuntime = await page.evaluate(id => {
      const desktop = window.__swissknifeDesktop || window.swissknifeDesktop;
      return desktop?.windows instanceof Map && Array.from(desktop.windows.values()).some(item => item.appId === id
        && item.element?.isConnected && item.element.dataset.appId === id);
    }, app.app_id);
    assert(canonicalRuntime, 'canonical runtime window ownership was not observed');
    await window.locator('.window-loading').first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined);
    const primary = window.locator(app.launch.primary_content_selector).first();
    await primary.waitFor({ state: 'visible' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    const dom = await primary.evaluate(collectPrimaryDom);
    const focus = [];
    const firstControl = primary.locator('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]').first();
    if (await firstControl.isVisible().catch(() => false)) {
      await firstControl.focus();
      for (let count = 0; count < 4; count += 1) {
        focus.push(await page.evaluate(() => {
          const element = document.activeElement;
          return { tag: element?.tagName.toLowerCase(), name: (element?.getAttribute('aria-label') || element?.getAttribute('title') || element?.textContent || '').trim().slice(0, 160),
            inside_app: Boolean(element?.closest('.window')) };
        }));
        await page.keyboard.press('Tab');
      }
    }
    const mask = [window.locator('input[type="password"], [data-secret], [data-credential-value]')];
    const screenshot = `${viewport.name}.png`;
    const primaryScreenshot = `${viewport.name}-primary.png`;
    await window.screenshot({ path: path.join(outputDir, screenshot), mask, animations: 'disabled' });
    await primary.screenshot({ path: path.join(outputDir, primaryScreenshot), mask, animations: 'disabled' });
    const domFile = `${viewport.name}.dom.json`;
    const keyboardFocus = focus.map(item => ({ ...item, name: redactText(item.name, 160) }));
    dom.keyboard_focus_observations = keyboardFocus;
    // Write after focus redaction; no unfiltered console or form values enter
    // the baseline evidence package.
    atomicJson(path.join(outputDir, domFile), dom);
    return { viewport, app_id: app.app_id, launch: { from_canonical_icon: true, runtime_window_verified: true,
      launcher_selector: app.launch.canonical_launcher, window_selector: app.launch.window_selector },
      primary_content_selector: app.launch.primary_content_selector, screenshot, primary_screenshot: primaryScreenshot, dom_file: domFile,
      screenshot_sha256: digest(fs.readFileSync(path.join(outputDir, screenshot))), primary_screenshot_sha256: digest(fs.readFileSync(path.join(outputDir, primaryScreenshot))),
      dom_sha256: digest(fs.readFileSync(path.join(outputDir, domFile))), console_events: consoleEvents.slice(0, 500), network_events: network.slice(0, 1500),
      network_events_truncated: network.length > 1500, console_events_truncated: consoleEvents.length > 500,
      layout: dom.layout, keyboard_focus_observations: keyboardFocus, functional_acceptance: 'not_evaluated' };
  } finally { await context.close(); }
}

/** A baseline is complete only when both canonical launches and every addressed
 * artifact are present and hash-matched. Blank UI remains a captured defect. */
export function validateBaselineEvidence(report, outputDir) {
  assert(report?.schema === BASELINE_SCHEMA && report.baseline_only === true && report.capture_complete === true, 'baseline capture incomplete');
  assert(report.acceptance_decision === 'not_evaluated' && report.work_complete === false && report.completion_authority === false, 'baseline cannot claim acceptance');
  assert(report.passed !== true && !['GO', 'passed', 'complete'].includes(report.decision), 'baseline cannot publish GO');
  assert(report.boundary?.tool_invocations === 'blocked' && report.boundary?.non_read_requests === 'blocked', 'baseline network boundary missing');
  assert(/^[a-z][a-z0-9-]*$/.test(report.app_id || ''), 'invalid baseline app identity');
  assert(report.contract_sha256 === digest(fs.readFileSync(CONTRACT_PATH)), 'baseline app contracts changed');
  const config = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  const app = config.apps.find(item => item.app_id === report.app_id);
  assert(app && app.title === report.title, 'unknown baseline app/title');
  const sourcePaths = [...new Set([...app.source_paths, 'web/js/main-simple.js', 'web/index.html', 'scripts/capture-visual-functional-baseline.mjs'])];
  assert(report.source_sha256 && Object.keys(report.source_sha256).length > 0, 'baseline source hashes missing');
  assert(JSON.stringify(Object.keys(report.source_sha256).sort()) === JSON.stringify(sourcePaths.sort()), 'baseline source coverage incomplete');
  for (const [source, expectedHash] of Object.entries(report.source_sha256)) {
    assert(!path.isAbsolute(source) && !source.split(/[\\/]/).includes('..')
      && digest(fs.readFileSync(path.join(PROJECT_ROOT, source))) === expectedHash, `baseline source changed: ${source}`);
  }
  assert(report.viewports?.length === VIEWPORTS.length, 'baseline needs both viewports');
  for (const expected of VIEWPORTS) {
    const view = report.viewports.find(item => item.viewport?.name === expected.name);
    assert(view && view.app_id === report.app_id && view.viewport.width === expected.width && view.viewport.height === expected.height
      && view.launch?.from_canonical_icon === true && view.launch?.runtime_window_verified === true
      && view.launch.launcher_selector === `.desktop-icons .icon[data-app="${report.app_id}"]`
      && view.launch.window_selector === `.window[data-app-id="${report.app_id}"]`, `canonical viewport launch missing: ${expected.name}`);
    for (const [fileKey, hashKey] of [['screenshot', 'screenshot_sha256'], ['primary_screenshot', 'primary_screenshot_sha256'], ['dom_file', 'dom_sha256']]) {
      const relative = view[fileKey];
      assert(nonempty(relative) && !path.isAbsolute(relative) && !relative.split(/[\\/]/).includes('..'), 'baseline artifact escapes output directory');
      assert(fs.lstatSync(path.join(outputDir, relative)).isFile(), 'baseline artifact must be an owned regular file');
      const bytes = fs.readFileSync(path.join(outputDir, relative));
      assert(bytes.length > 0 && digest(bytes) === view[hashKey], `baseline artifact changed: ${relative}`);
      if (fileKey !== 'dom_file') assert(bytes.length >= 128 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.readUInt32BE(16) >= 150 && bytes.readUInt32BE(20) >= 100,
      `baseline screenshot is not a usable app PNG: ${relative}`);
    }
    const dom = JSON.parse(fs.readFileSync(path.join(outputDir, view.dom_file), 'utf8'));
    assert(dom.functional_acceptance === 'not_evaluated' && dom.layout?.viewport?.width === expected.width
      && dom.layout?.viewport?.height === expected.height, 'DOM viewport/proof mismatch');
    assert(view.functional_acceptance === 'not_evaluated' && Array.isArray(view.network_events), 'viewport acceptance/network boundary missing');
    for (const event of view.network_events) {
      if (event.status !== undefined) assert(event.origin === 'desktop' && ['GET', 'HEAD', 'OPTIONS'].includes(event.method)
        && !/^\/mcp\/(?:tools\/call|artifacts|dag)(?:\/|$)/.test(event.path), 'baseline observed an unblocked tool, write or external response');
    }
  }
  return true;
}

export async function captureBaseline(settings) {
  assert(retainsCaptureLock(), 'capture requires its retained kernel browser lock');
  const owners = findBrowserOwners();
  if (owners.length) throw Object.assign(new Error(`desktop acquisition already active: ${owners.map(item => `${item.kind} pid=${item.pid}`).join(', ')}`), { exitCode: 75 });
  const canonical = loadCanonicalContracts();
  const config = validateContracts(JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8')), canonical.manifest, canonical.backend);
  const app = config.apps.find(item => item.app_id === settings.appId);
  assert(app, 'unknown canonical app ID');
  assert(!fs.existsSync(settings.outputDir) || fs.readdirSync(settings.outputDir).length === 0, 'output directory must be empty; preserve prior baseline evidence');
  fs.mkdirSync(settings.outputDir, { recursive: true });
  const report = { schema: BASELINE_SCHEMA, app_id: app.app_id, title: app.title, captured_at: new Date().toISOString(),
    baseline_only: true, capture_complete: false, acceptance_decision: 'not_evaluated', work_complete: false, completion_authority: false,
    contract_sha256: digest(fs.readFileSync(CONTRACT_PATH)), source_sha256: Object.fromEntries([...new Set([...app.source_paths, 'web/js/main-simple.js', 'web/index.html', 'scripts/capture-visual-functional-baseline.mjs'])]
      .map(relative => [relative, digest(fs.readFileSync(path.join(PROJECT_ROOT, relative)))])),
    boundary: { tool_invocations: 'blocked', non_read_requests: 'blocked', external_requests: 'blocked', service_workers: 'blocked',
      operation_controls_clicked: false, credentials_imported: false }, viewports: [] };
  let server;
  let browser;
  const controller = new AbortController();
  const cleanups = [];
  const cleanup = () => {
    const ownedBrowser = browser;
    const ownedServer = server;
    browser = undefined;
    server = undefined;
    cleanups.push((async () => {
      try { await ownedBrowser?.close(); } finally { await ownedServer?.stop(); }
    })());
    return Promise.allSettled(cleanups);
  };
  const interrupted = () => { process.exitCode = 143; controller.abort(); void cleanup(); };
  process.once('SIGTERM', interrupted);
  process.once('SIGINT', interrupted);
  try {
    server = settings.desktopUrl ? { url: settings.desktopUrl, ownership: 'explicit-existing-desktop', stop: async () => {} } : await startDesktop(settings.outputDir, controller.signal);
    report.desktop = { ownership: server.ownership, owner_pid: server.pid || null };
    const { chromium } = require('playwright');
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const desktopUrl = server?.url;
    for (const viewport of VIEWPORTS) {
      if (controller.signal.aborted) throw Object.assign(new Error('baseline capture interrupted'), { exitCode: 143 });
      report.viewports.push(await captureViewport(browser, app, viewport, desktopUrl, settings.outputDir));
    }
    report.capture_complete = true;
    validateBaselineEvidence(report, settings.outputDir);
    atomicJson(path.join(settings.outputDir, 'baseline.json'), report);
    return report;
  } catch (error) {
    report.capture_complete = false;
    report.error = redactText(error.message);
    atomicJson(path.join(settings.outputDir, 'baseline.json'), report);
    throw error;
  } finally {
    await cleanup();
    process.removeListener('SIGTERM', interrupted);
    process.removeListener('SIGINT', interrupted);
  }
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) { console.log(usage); return 0; }
  const settings = parseArguments(argv);
  // Validate the canonical scope before acquiring resources or spawning a server.
  const canonical = loadCanonicalContracts();
  const config = validateContracts(JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8')), canonical.manifest, canonical.backend);
  assert(config.apps.some(app => app.app_id === settings.appId), 'unknown canonical app ID');
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  if (!retainsCaptureLock()) {
    return await new Promise((resolve, reject) => {
      const child = spawn('/usr/bin/flock', ['--exclusive', '--nonblock', '--conflict-exit-code', '75', '--no-fork', LOCK_PATH,
        process.execPath, filename, ...argv], { cwd: PROJECT_ROOT, stdio: 'inherit', shell: false });
      const stop = signal => child.kill(signal);
      const terminate = () => stop('SIGTERM');
      const interrupt = () => stop('SIGINT');
      process.once('SIGTERM', terminate);
      process.once('SIGINT', interrupt);
      const detach = () => { process.removeListener('SIGTERM', terminate); process.removeListener('SIGINT', interrupt); };
      child.once('error', error => { detach(); reject(error); });
      child.once('close', (status, signal) => { detach(); resolve(status ?? (signal ? 143 : 1)); });
    });
  }
  const report = await captureBaseline(settings);
  console.log(JSON.stringify({ app_id: report.app_id, capture_complete: report.capture_complete, baseline_only: true,
    acceptance_decision: 'not_evaluated', report: path.join(settings.outputDir, 'baseline.json') }));
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === filename) {
  try { process.exitCode = await main(); }
  catch (error) { console.error(redactText(error.message)); process.exitCode = error.exitCode || (process.exitCode === 143 ? 143 : 1); }
}
