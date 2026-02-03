import { test, expect } from '@playwright/test';

test('verify page loads and shows checks', async ({ page }) => {
  await page.goto('/verify');
  await expect(page.getByRole('heading', { name: 'Verification' })).toBeVisible();
  await expect(page.getByText('FRED Macro', { exact: true })).toBeVisible();
  await expect(page.getByText('Market', { exact: true })).toBeVisible();
  await expect(page.getByText('News', { exact: true })).toBeVisible();
});
