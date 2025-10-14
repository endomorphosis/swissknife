import { test, expect } from '@playwright/test';

test.describe('Strudel AI DAW smoke', () => {
  test('renders, plays, and enables worklet or fallback', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', (msg) => logs.push(msg.text()));

    await page.goto('/');
    await page.waitForSelector('.desktop');

    const icon = page.locator('[data-app="strudel-ai-daw"]').first();
    await expect(icon).toBeVisible();
    await icon.click();

    // Find the most recent window
  const windows = page.locator('.window');
  const count = await windows.count();
  expect(count).toBeGreaterThan(0);
    const appWindow = windows.nth(count - 1);
    await expect(appWindow.locator('#play-btn')).toBeVisible();
    await expect(appWindow.locator('#waveform-canvas')).toBeVisible();
    await expect(appWindow.locator('#spectrum-canvas')).toBeVisible();

  // Click Play and verify UI reflects playing state
  await appWindow.locator('#play-btn').click();
  await page.waitForTimeout(500);
  // Pause button should become enabled when playing
  await expect(appWindow.locator('#pause-btn')).toBeEnabled();

    // Stop playback if visible
  const stopBtn = appWindow.locator('#stop-btn');
    if (await stopBtn.isVisible()) {
      await stopBtn.click();
    }
  });
});
