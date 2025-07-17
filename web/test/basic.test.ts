import { test, expect } from '@playwright/test';

test('main page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#desktop')).toBeVisible();
});