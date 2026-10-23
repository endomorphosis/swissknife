#!/usr/bin/env node
/** Real, isolated Todo case-boundary check. Never writes canonical capture evidence. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const rank = selector => selector.includes('.window-control.close') ? 3
  : selector.includes('.window-control.minimize') ? 2 : selector.includes('.window-control.maximize') ? 1 : 0;

function currentFixture() {
  const source = fs.readFileSync(path.join(root, 'test/e2e/families/local-negative-mcp.spec.ts'), 'utf8');
  const match = source.match(/export (function installLocalTodoCaseIsolation\(\) \{[\s\S]*?\n\})\n\nconst require/);
  assert.ok(match, 'Local spec must carry the complete source-bound fixture');
  return new Function(`return (${match[1]});`)();
}

async function storage(page) {
  return page.evaluate(() => ({ todos: localStorage.getItem('swissknife-todos'), goals: localStorage.getItem('swissknife-goals') }));
}

async function closeTodo(page, app) {
  if (await app.count() && await app.isVisible()) await app.locator('.window-control.close').click({ timeout: 3000 });
  // Same owned cleanup as capture when minimize removes the titlebar's box.
  if (await app.count()) await app.evaluate(element => {
    window.swissknifeDesktop?.windows?.delete?.(element.id);
    element.remove();
  });
  await app.waitFor({ state: 'detached' });
}

export async function runLocalTodoIsolationSmoke() {
  const port = Number(process.env.SWISSKNIFE_VDG_LOCAL_TODO_SMOKE_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('An owned Todo smoke port is required.');
  const diagnostics = fs.mkdtempSync(path.join(os.tmpdir(), 'vdg-local-todo-smoke-'));
  const log = fs.createWriteStream(path.join(diagnostics, 'vite.log'), { mode: 0o600 });
  const base = `http://127.0.0.1:${port}`;
  const rows = JSON.parse(fs.readFileSync(path.join(root, 'test-results/virtual-desktop-ipfs-mcp-orb/control-tool-matrix.json'))).rows
    .filter(row => row.app_id === 'todo').sort((left, right) => rank(left.selector) - rank(right.selector));
  assert.equal(rows.length, 18, 'smoke must exercise the complete current Todo matrix');
  let server, browserServer, browser, summary;
  try {
    server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--config', 'vite.web.config.ts', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
      { cwd: root, env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.pipe(log, { end: false }); server.stderr.pipe(log, { end: false });
    const deadline = Date.now() + 60000;
    while (true) {
      if (server.exitCode !== null || server.signalCode !== null) throw new Error('Owned Vite exited before readiness.');
      try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break; } catch {}
      if (Date.now() > deadline) throw new Error('Owned Vite readiness exceeded 60 seconds.');
      await delay(100);
    }
    browserServer = await chromium.launchServer({ channel: 'chrome', headless: true, timeout: 30000 });
    browser = await chromium.connect(browserServer.wsEndpoint());
    const cases = [];
    for (const baselineKind of ['absent', 'persisted']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const blocked = [];
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== base || !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
          blocked.push({ method: request.method(), host: url.host }); return route.abort('blockedbyclient');
        }
        return route.continue();
      });
      const page = await context.newPage(); page.on('dialog', dialog => dialog.dismiss());
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.swissknifeDesktop?.launchApp === 'function');
      if (baselineKind === 'persisted') {
        // Obtain real persisted product bytes through actual UI actions. Two
        // toggles restore the real default item without fabricating fixture data.
        await page.locator('.icon[data-app="todo"]').click();
        const app = page.locator('.window[data-app-id="todo"]');
        await app.locator('.high-container input[type="checkbox"]').first().click();
        await app.locator('.completed-container input[type="checkbox"]').first().click();
        await closeTodo(page, app);
        assert.ok((await storage(page)).todos);
      }
      await context.addInitScript(currentFixture());
      await context.addInitScript(() => {
        window.__todoSmokeClicks = [];
        document.addEventListener('click', event => {
          if (event.target.closest?.('.window[data-app-id="todo"]')) window.__todoSmokeClicks.push({ trusted: event.isTrusted });
        }, true);
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.swissknifeDesktop?.launchApp === 'function');
      const baseline = await storage(page);
      assert.equal(baselineKind === 'absent', baseline.todos === null);
      await page.evaluate(() => localStorage.setItem('vdg-unrelated-test-key', 'exact untouched bytes'));
      const visited = [];
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        await page.locator('.icon[data-app="todo"]').click();
        const app = page.locator('.window[data-app-id="todo"]');
        await app.waitFor({ state: 'visible' });
        const control = app.locator(row.selector);
        await control.waitFor({ state: 'visible', timeout: 10000 });
        assert.equal(await control.count(), 1, `matrix selector must resolve once: ${row.selector}`);
        assert.equal(await control.isVisible(), true, `later Todo row must retain its preconditions: ${row.selector}`);
        const mutation = await control.evaluate(element => {
          const match = (element.getAttribute('onchange') || element.getAttribute('onclick') || '').match(/(?:toggleTodo|deleteTodo)\((\d+)\)/);
          return match ? { id: Number(match[1]), operation: element.matches('input[type="checkbox"]') ? 'toggle' : 'delete' } : null;
        });
        const before = await page.evaluate(() => ({ todos: window.todoApp.todos.map(todo => ({ ...todo })), restores: window.__vdgLocalTodoCaseIsolation.restored_cases }));
        const trustedBefore = await page.evaluate(() => window.__todoSmokeClicks.length);
        await control.click({ timeout: 5000 });
        // Close the native select popover without altering the selected value.
        if (row.role === 'select') await page.keyboard.press('Escape');
        const after = await page.evaluate(() => ({ todos: window.todoApp.todos.map(todo => ({ ...todo })), restores: window.__vdgLocalTodoCaseIsolation.restored_cases }));
        const actionStorage = await storage(page);
        assert.ok(await page.evaluate(count => window.__todoSmokeClicks.slice(count).some(click => click.trusted), trustedBefore), 'matrix control needs a trusted real pointer click');
        if (mutation) {
          assert.equal(after.restores, before.restores, 'item rerender must not reset the open case');
          assert.deepEqual(JSON.parse(actionStorage.todos), after.todos, 'actual action must really persist before close');
          if (mutation.operation === 'toggle') assert.equal(after.todos.find(todo => todo.id === mutation.id).completed, !before.todos.find(todo => todo.id === mutation.id).completed);
          else assert.equal(after.todos.some(todo => todo.id === mutation.id), false, 'real deletion must remain effective until case close');
          await page.screenshot({ path: path.join(diagnostics, `${baselineKind}-${index}-${mutation.operation}-${mutation.id}-before-close.png`) });
        }
        await closeTodo(page, app);
        await page.waitForFunction(previous => window.__vdgLocalTodoCaseIsolation.restored_cases > previous, before.restores);
        assert.deepEqual(await storage(page), baseline, 'only the next case gets the exact original storage preconditions');
        assert.equal(await page.evaluate(() => localStorage.getItem('vdg-unrelated-test-key')), 'exact untouched bytes');
        visited.push({ selector: row.selector, visible: true, trusted_click: true, mutation, persisted_before_close: !!mutation, exact_baseline_restored_after_close: true });
      }
      assert.equal(visited.filter(row => row.mutation?.operation === 'toggle').length, 4);
      assert.equal(visited.filter(row => row.mutation?.operation === 'delete').length, 4);
      assert.equal(blocked.some(request => !['GET', 'HEAD', 'OPTIONS'].includes(request.method)), false, 'Todo smoke must not invoke providers or MCP');
      cases.push({ baseline: baselineKind, visited, external_requests_blocked: blocked.length });
      await page.screenshot({ path: path.join(diagnostics, `${baselineKind}-all-cases-closed.png`) });
      await context.close();
    }
    summary = { passed: true, matrix_control_count: rows.length, actual_case_count: 36, cases, provider_or_mcp_posts: 0,
      gui_acceptance: false, work_complete: false, completion_authority: false };
  } catch (error) {
    if (browser) for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: path.join(diagnostics, 'failure.png') }).catch(() => undefined);
    fs.writeFileSync(path.join(diagnostics, 'failure.json'), `${JSON.stringify({ error: error.stack || error.message, gui_acceptance: false, work_complete: false }, null, 2)}\n`, { mode: 0o600 });
    console.error(JSON.stringify({ diagnostics, passed: false })); throw error;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (browserServer) await browserServer.kill().catch(() => undefined);
    if (server) {
      try { process.kill(-server.pid, 'SIGTERM'); } catch {}
      if (server.exitCode === null && server.signalCode === null) await Promise.race([new Promise(resolve => server.once('exit', resolve)), delay(5000)]);
      try { process.kill(-server.pid, 'SIGKILL'); } catch {}
    }
    log.end();
  }
  summary.owned_resources_closed = true;
  fs.writeFileSync(path.join(diagnostics, 'result.json'), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ diagnostics, passed: summary.passed, actual_case_count: summary.actual_case_count, provider_or_mcp_posts: 0, owned_resources_closed: true }));
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runLocalTodoIsolationSmoke(); }
  catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
}
