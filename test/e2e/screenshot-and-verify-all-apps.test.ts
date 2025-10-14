import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe.configure({ mode: 'serial' });

test('Discover, screenshot, and verify all desktop applications', async ({ page }) => {
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotsDir = path.join(process.cwd(), 'docs', 'screenshots', 'verification', runId);
  const resultsDir = path.join(process.cwd(), 'test-results', 'verification', runId);
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(resultsDir, { recursive: true });

  const consoleMessages: string[] = [];
  page.on('console', (msg) => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });

  await page.goto('/');
  await page.waitForSelector('.desktop', { timeout: 30000 });
  await page.waitForSelector('.desktop-icons', { timeout: 10000 });

  const desktopOverviewPath = path.join(screenshotsDir, '00-desktop-overview.png');
  await page.screenshot({ path: desktopOverviewPath, fullPage: true });

  const apps = await page.$$eval('.desktop-icons [data-app]', (els) => {
    const seen = new Set<string>();
    const out: { name: string; selector: string; title: string }[] = [];
    for (const el of els as any as HTMLElement[]) {
      const name = el.getAttribute('data-app') || '';
      if (!name || (seen as any).has(name)) continue;
      (seen as any).add(name);
      const title = el.getAttribute('title') || (el.textContent || '').trim() || name;
      out.push({ name, selector: `[data-app="${name}"]`, title });
    }
    return out;
  });

  fs.writeFileSync(path.join(resultsDir, 'discovered-apps.json'), JSON.stringify(apps, null, 2), 'utf-8');

  const mockIndicators = [
    'this is a mock',
    'placeholder',
    'coming soon',
    'not implemented',
    '[object object]',
    'failed to load',
    'error loading',
    'todo:',
    'mock',
    'under development',
    'loading...'
  ];

  type AppResult = {
    name: string;
    title: string;
    opened: boolean;
    isMock: boolean;
    uiElements: number;
    buttons: number;
    inputs: number;
    canvases: number;
    contentLength: number;
    status: 'REAL' | 'BASIC' | 'MOCK' | 'FAILED';
    notes: string[];
    screenshot?: string;
  };

  const results: AppResult[] = [];

  for (const app of apps) {
    const notes: string[] = [];
    let status: AppResult['status'] = 'FAILED';
    let isMock = false;
    let opened = false;
    let screenshotPath: string | undefined;
    let buttons = 0;
    let inputs = 0;
    let canvases = 0;
    let uiElements = 0;
    let contentLength = 0;

    try {
      const icon = page.locator(app.selector).first();
      await expect(icon).toBeVisible({ timeout: 5000 });
      const iconShot = path.join(screenshotsDir, `icon-${app.name}.png`);
      await icon.screenshot({ path: iconShot });

      const priorWindows = await page.locator('.window').count();
      await icon.click();
      await page.waitForTimeout(1200);
      const windows = page.locator('.window');
      const countAfter = await windows.count();

      if (countAfter === 0 || countAfter < priorWindows) {
        notes.push('Window did not open');
        status = 'FAILED';
      } else {
        const appWindow = windows.nth(countAfter - 1);
        await expect(appWindow).toBeVisible({ timeout: 10000 });
        opened = true;

        screenshotPath = path.join(screenshotsDir, `${app.name}.png`);
        await appWindow.screenshot({ path: screenshotPath });

        const windowText = (await appWindow.textContent()) || '';
        contentLength = windowText.length;
        const lower = windowText.toLowerCase();
        isMock = mockIndicators.some((m) => lower.includes(m));

        buttons = await appWindow.locator('button').count();
        inputs = await appWindow.locator('input, textarea, select').count();
        canvases = await appWindow.locator('canvas').count();
        uiElements = buttons + inputs + canvases;

        if (isMock) {
          status = 'MOCK';
          notes.push('Contains mock/placeholder indicators');
        } else if (uiElements >= 3 && contentLength > 100) {
          status = 'REAL';
        } else {
          status = 'BASIC';
          notes.push('Limited interactivity or content');
        }

        const closeBtn = appWindow
          .locator('.window-control.close, .window-close, .close-btn, [data-action="close"], [title="Close"], button:has-text("×")')
          .first();

        if (await closeBtn.count()) {
          try {
            await closeBtn.click();
          } catch {
            notes.push('Unable to close window via standard selectors');
          }
        } else {
          notes.push('No close button found');
        }
      }
    } catch (err: any) {
      notes.push(`Error: ${err?.message || String(err)}`);
      status = 'FAILED';
    }

    results.push({
      name: app.name,
      title: app.title,
      opened,
      isMock,
      uiElements,
      buttons,
      inputs,
      canvases,
      contentLength,
      status,
      notes,
      screenshot: screenshotPath ? path.relative(process.cwd(), screenshotPath) : undefined
    });
  }

  const jsonReportPath = path.join(resultsDir, 'report.json');
  fs.writeFileSync(jsonReportPath, JSON.stringify({ runId, desktopOverviewPath, results }, null, 2), 'utf-8');

  const mdLines: string[] = [];
  mdLines.push(`# SwissKnife Application Verification Report`);
  mdLines.push(`- Run: ${runId}`);
  mdLines.push(`- Desktop overview: ${path.relative(process.cwd(), desktopOverviewPath)}`);
  mdLines.push('');
  const counts = {
    REAL: results.filter(r => r.status === 'REAL').length,
    BASIC: results.filter(r => r.status === 'BASIC').length,
    MOCK: results.filter(r => r.status === 'MOCK').length,
    FAILED: results.filter(r => r.status === 'FAILED').length,
  };
  mdLines.push(`Summary: REAL=${counts.REAL}, BASIC=${counts.BASIC}, MOCK=${counts.MOCK}, FAILED=${counts.FAILED}`);
  mdLines.push('');
  for (const r of results) {
    mdLines.push(`## ${r.title} (${r.name})`);
    mdLines.push(`- Status: ${r.status}`);
    mdLines.push(`- Opened: ${r.opened ? 'yes' : 'no'}`);
    mdLines.push(`- Mock indicators: ${r.isMock ? 'yes' : 'no'}`);
    mdLines.push(`- Interactivity: buttons=${r.buttons}, inputs=${r.inputs}, canvases=${r.canvases} (total=${r.uiElements})`);
    mdLines.push(`- Content length: ${r.contentLength}`);
    if (r.screenshot) mdLines.push(`- Screenshot: ${r.screenshot}`);
    if (r.notes.length) mdLines.push(`- Notes: ${r.notes.join(' | ')}`);
    mdLines.push('');
  }
  const mdReportPath = path.join(resultsDir, 'report.md');
  fs.writeFileSync(mdReportPath, mdLines.join('\n'), 'utf-8');

  if (consoleMessages.length) {
    fs.writeFileSync(path.join(resultsDir, 'console-messages.txt'), consoleMessages.join('\n'), 'utf-8');
  }

  expect(apps.length).toBeGreaterThan(25);
});
