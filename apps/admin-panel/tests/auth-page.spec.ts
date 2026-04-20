import { test, expect } from '@playwright/test';

test('auth page loads with secret key input', async ({ page }) => {
  await page.goto('https://crm.entraycompara.com');
  await expect(page.getByLabel('Secret Key Input')).toBeVisible();
  await expect(page.getByRole('button', { name: /аутентификация|auth/i })).toBeVisible();
});
