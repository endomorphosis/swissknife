import { expect, test } from '@playwright/test';
import { runLiveClickTarget } from './helpers/live-click-session';

test.describe.configure({ mode: 'serial', timeout: 7_200_000 });

test('clicks and inspects one virtual-desktop live-click target', async ({ page }) => {
  test.setTimeout(7_200_000);
  const target = process.env.VDL_LIVE_CLICK_TARGET || 'pilot';
  const report = await runLiveClickTarget(page, target);
  expect(report.clicked, report.summary).toBe(true);
});
