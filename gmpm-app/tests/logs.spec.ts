import { test, expect } from '@playwright/test';

test('logs page loads and shows server logs panel', async ({ page }) => {
  await page.goto('/logs');
  await expect(page.getByRole('heading', { name: 'Logs' })).toBeVisible();
  await expect(page.getByText('Server Logs')).toBeVisible();
  await expect(page.getByText('Source: /api/server-logs')).toBeVisible();
});
