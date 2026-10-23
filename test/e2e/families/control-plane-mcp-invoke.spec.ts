import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { runVdgFamilyCapture } from '../helpers/vdg-family-capture';

export function installControlPrimaryAppGuard() {
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

const require = createRequire(import.meta.url);
const { writeFamilyEvidence } = require('../../../scripts/vdg-evidence.cjs');

test('vdg-control proves originating calls, connector receipts and governed negatives', async ({ page }) => {
  test.setTimeout(14_400_000);
  // Replay verifies existing real evidence; the default captures real clicks.
  if (process.env.VDG_EVIDENCE_REPLAY !== '1') {
    await page.context().addInitScript(installControlPrimaryAppGuard);
    await runVdgFamilyCapture(page, 'control');
  }
  const evidence = writeFamilyEvidence('vdg-control');
  expect(evidence.reasons, JSON.stringify(evidence.gap_counts)).toEqual([]);
  expect(evidence.decision).toBe('GO');
  expect(evidence.passed).toBe(true);
});
