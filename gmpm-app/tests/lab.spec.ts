import { test, expect } from '@playwright/test';

test('lab page loads and renders decision panel without console errors', async ({ page }) => {
  const consoleErrors: string[] = [];

  page.on('pageerror', (err) => {
    consoleErrors.push(`pageerror: ${String(err)}`);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(`console.error: ${msg.text()}`);
    }
  });

  await page.goto('/lab');

  await expect(page.getByText('LAB', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Lab Decision')).toBeVisible({ timeout: 60_000 });

  // If MESO universe is empty or degraded, app must still be stable.
  // If a report is available, it should render at least one stable marker.
  const noData = page.getByText('No data.');
  const loading = page.getByText('Loading...');
  const executionLevels = page.getByText('Execution Levels');

  await expect(async () => {
    const any = (await noData.isVisible().catch(() => false)) ||
      (await loading.isVisible().catch(() => false)) ||
      (await executionLevels.isVisible().catch(() => false));
    expect(any).toBeTruthy();
  }).toPass({ timeout: 60_000 });

  // Allow background requests to settle
  await page.waitForTimeout(1000);

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});
