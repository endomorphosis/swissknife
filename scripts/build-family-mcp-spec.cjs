#!/usr/bin/env node
'use strict';
/** Generate executable family acceptance. Writing a spec is not validation. */
const fs = require('node:fs');
const path = require('node:path');
const { FAMILIES } = require('./vdg-evidence.cjs');
const family = process.argv[2];
const selected = FAMILIES[family];
if (!selected) throw new Error(`usage: node build-family-mcp-spec.cjs ${Object.keys(FAMILIES).join('|')}`);
const projectRoot = path.resolve(__dirname, '..');
const specDir = path.resolve(process.env.VDG_FAMILY_SPEC_DIR || path.join(projectRoot, 'test/e2e/families'));
const specPath = path.join(specDir, selected.spec);
// Only the Local acceptance spec installs this browser-case fixture. Its full
// executable bytes are emitted inline, so the existing family fingerprint
// binds changes without invalidating any other family's source identity.
function installLocalTodoCaseIsolation() {
  if (window.__vdgLocalTodoCaseIsolation) return;
  const keys = ['swissknife-todos', 'swissknife-goals'];
  const baseline = keys.map(key => [key, localStorage.getItem(key)]);
  const state = { restored_cases: 0 };
  window.__vdgLocalTodoCaseIsolation = state;
  const restore = () => {
    for (const [key, value] of baseline) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    state.restored_cases += 1;
  };
  const containsTodoWindow = node => node.nodeType === 1
    && (node.matches('.window[data-app-id="todo"]') || node.querySelector('.window[data-app-id="todo"]'));
  const observer = new MutationObserver(records => {
    if (records.some(record => [...record.removedNodes].some(node => !node.isConnected && containsTodoWindow(node)))) restore();
  });
  observer.observe(document, { childList: true, subtree: true });
  // A timed-out row may replace its page instead of removing one app window.
  window.addEventListener('pagehide', restore);
}
// Bind this executable guard only to Control's spec/fingerprint. It observes
// the real completed app mount without supplying any app UI or backend result.
function installControlPrimaryAppGuard() {
  if (window.__vdgControlPrimaryAppGuard) return;
  const state = { checked_launches: 0 };
  window.__vdgControlPrimaryAppGuard = state;
  const wrapped = new WeakMap();
  const mountFailure = error => {
    const message = error instanceof Error ? error.message : String(error);
    return message === 'launch timed out' ? new Error('VDG control primary mount: underlying launch timed out') : error;
  };
  const wrap = desktop => {
    if (!desktop || typeof desktop.launchApp !== 'function' || wrapped.get(desktop) === desktop.launchApp) return;
    const original = desktop.launchApp;
    const guarded = function (...args) {
      let result;
      try { result = original.apply(this, args); }
      catch (error) { throw args[0] === 'mcp-control' ? mountFailure(error) : error; }
      if (args[0] !== 'mcp-control') return result;
      let timer;
      // The shared launch budget is 8 seconds and treats its own timeout as
      // recoverable. A distinct, earlier rejection cannot take that bypass.
      const deadline = new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('VDG control primary mount: launch completion exceeded 6500ms')), 6500);
      });
      return Promise.race([Promise.resolve(result), deadline]).then(value => {
        const records = this.windows?.values ? Array.from(this.windows.values()) : [];
        const appWindow = records.filter(record => record.appId === 'mcp-control' && record.element?.isConnected).at(-1)?.element;
        const shellContent = Array.from(appWindow?.children || []).find(node => node.classList.contains('window-content'));
        const content = Array.from(shellContent?.children || []).find(node => node.classList.contains('window-app-content'));
        const roots = content?.querySelectorAll('.mcp-control-app') || [];
        if (!appWindow?.matches('.window[data-app-id="mcp-control"]') || !content
          || roots.length !== 1 || roots[0].getClientRects().length === 0
          || appWindow.querySelector('.app-error, .app-placeholder, .window-loading')) {
          throw new Error('VDG control primary mount: visible MCP Control root required without app-error or fallback');
        }
        state.checked_launches += 1;
        return value;
      }).catch(error => { throw mountFailure(error); }).finally(() => window.clearTimeout(timer));
    };
    wrapped.set(desktop, guarded);
    desktop.launchApp = guarded;
  };
  // The desktop publishes itself during construction, before the shared
  // capture waits for launchApp. The setter avoids readiness/polling races.
  let current = window.swissknifeDesktop;
  Object.defineProperty(window, 'swissknifeDesktop', {
    configurable: true, enumerable: true,
    get: () => current,
    set: value => { current = value; wrap(value); },
  });
  wrap(current);
}
const localInputGuard = family === 'vdg-local' ? require('./vdg-openrouter-catalog-input.cjs') : null;
const localFixture = family === 'vdg-local' ? `export ${localInputGuard.installLocalOpenRouterCatalogGuard.toString()}\n\nexport ${installLocalTodoCaseIsolation.toString()}\n\n` : '';
const localInputContract = family === 'vdg-local' ? `const catalogInputGuardPath = require.resolve('../../../scripts/vdg-openrouter-catalog-input.cjs');
const catalogInputSourcePins = ${JSON.stringify(Object.fromEntries(['vdg-openrouter-catalog-input.cjs', 'run-with-vdg-openrouter-catalog-input.mjs'].map(name => [name, require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname, name))).digest('hex')])))};
for (const [filename, expected] of Object.entries(catalogInputSourcePins)) {
  const actual = require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync(require.resolve('../../../scripts/' + filename))).digest('hex');
  if (actual !== expected) throw new Error('VDG Local catalog input: source differs from the executable Local contract: ' + filename);
}
const { assertLocalCatalogInput, assertCatalogInventory, preflightLocalCatalogPage } = require(catalogInputGuardPath);
` : '';
const controlFixture = family === 'vdg-control' ? `export ${installControlPrimaryAppGuard.toString()}\n\n` : '';
const familyTimeout = family === 'vdg-local' ? '21_600_000' : '14_400_000';
const source = `import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { runVdgFamilyCapture } from '../helpers/vdg-family-capture';

${localFixture}${controlFixture}const require = createRequire(import.meta.url);
const { writeFamilyEvidence } = require('../../../scripts/vdg-evidence.cjs');
${localInputContract}
test('${family} proves originating calls, connector receipts and governed negatives', async ({ page }) => {
  test.setTimeout(${familyTimeout});
  // Replay verifies existing real evidence; the default captures real clicks.
  if (process.env.VDG_EVIDENCE_REPLAY !== '1') {
${family === 'vdg-local' ? '    const catalogInput = assertCatalogInventory(assertLocalCatalogInput());\n    await page.context().addInitScript(installLocalOpenRouterCatalogGuard, catalogInput);\n    await page.context().addInitScript(installLocalTodoCaseIsolation);\n    await preflightLocalCatalogPage(page);\n' : ''}${family === 'vdg-control' ? '    await page.context().addInitScript(installControlPrimaryAppGuard);\n' : ''}    await runVdgFamilyCapture(page, '${selected.target}');
  }
  const evidence = writeFamilyEvidence('${family}');
  expect(evidence.reasons, JSON.stringify(evidence.gap_counts)).toEqual([]);
  expect(evidence.decision).toBe('GO');
  expect(evidence.passed).toBe(true);
});
`;
fs.mkdirSync(specDir, { recursive: true });
fs.writeFileSync(specPath, source);
console.log(JSON.stringify({ decision: 'family_spec_written', family, output: path.relative(projectRoot, specPath), validation: `node scripts/check-vdg-family-evidence.cjs ${family}`, completion_authority: false }));
