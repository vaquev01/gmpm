import { test, expect } from '@playwright/test';

test('currency strength view loads via menu', async ({ page }) => {
  await page.goto('/');

  const btn = page.getByRole('button', { name: 'CURRENCY' });
  await expect(btn).toBeVisible();
  await btn.click();

  await expect(page.getByRole('heading', { name: 'Currency Strength Analysis' })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('🎯 CONCLUSÃO & RECOMENDAÇÕES - O Que Fazer Agora')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('Strength Meter')).toBeVisible({ timeout: 90_000 });

  const hasExecutionWindow = await page.getByText('Execution Window').first().isVisible().catch(() => false);
  if (hasExecutionWindow) {
    await expect(page.getByText('Entry').first()).toBeVisible();
    await expect(page.getByText('SL').first()).toBeVisible();
    await expect(page.getByText('TP').first()).toBeVisible();
  }
});
