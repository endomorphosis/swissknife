import { test, expect } from '@playwright/test';

test.describe('SwissKnife Web Desktop', () => {
  test('should have a desktop element', async ({ page }) => {
    await page.goto('/');
    const desktop = await page.$('#desktop');
    expect(desktop).not.toBeNull();
  });
});
