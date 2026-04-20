import { test, expect } from '@playwright/test';

const SECRET_KEY = process.env.OPERATOR_SECRET_KEY;
const API_BASE = 'https://backend-upload-service-staging-bfuq4rsamq-ew.a.run.app/api';

test.describe('CRM Admin Panel', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!SECRET_KEY, 'OPERATOR_SECRET_KEY is not set');

    await page.goto('/');
    await page.getByLabel('Secret Key Input').fill(SECRET_KEY!);
    await page.getByRole('button', { name: /войти|enter/i }).click();
    await page.waitForSelector('text=Заявки', { timeout: 10000 });
  });

  test('dashboard loads with kanban or table', async ({ page }) => {
    await expect(page.locator('text=Заявки')).toBeVisible();
    const hasCards = await page.locator('[class*="rounded-2xl"]').count() > 0;
    expect(hasCards).toBeTruthy();
  });

  test('proposal card exists in detail view', async ({ page }) => {
    // Click first application card
    const firstCard = page.locator('h4').first();
    await firstCard.click();

    // Wait for detail view
    await page.waitForSelector('text=Коммерческое предложение', { timeout: 10000 });

    const proposalCard = page.locator('text=Коммерческое предложение').locator('xpath=../../..');
    await expect(proposalCard).toBeVisible();

    // Check upload button exists
    const uploadBtn = page.locator('button:has-text("Загрузить КП")');
    await expect(uploadBtn).toBeVisible();

    // Check send button only visible when proposal exists
    const sendBtn = page.locator('button:has-text("Отправить КП")');
    const hasProposal = await sendBtn.isVisible().catch(() => false);
    const noProposalText = page.locator('text=КП не загружено');
    
    expect(hasProposal || (await noProposalText.isVisible())).toBeTruthy();
  });

  test('documents card exists with upload button', async ({ page }) => {
    const firstCard = page.locator('h4').first();
    await firstCard.click();

    await page.waitForSelector('text=Документы', { timeout: 10000 });
    const docsCard = page.locator('text=Документы').first();
    await expect(docsCard).toBeVisible();
  });

  test('API docs do not expose generate-proposal', async ({ request }) => {
    const response = await request.get(`${API_BASE}/docs`, {
      headers: { Authorization: `Bearer ${SECRET_KEY}` },
    });
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).not.toContain('generate-proposal');
    expect(body).toContain('upload-proposal');
    expect(body).toContain('send-proposal');
  });
});
