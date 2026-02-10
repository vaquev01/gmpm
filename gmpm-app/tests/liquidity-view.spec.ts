import { test, expect } from '@playwright/test';

test('liquidity map view loads via menu', async ({ page }) => {
  await page.goto('/');

  const btn = page.getByRole('button', { name: 'LIQUIDITY MAP' });
  await expect(btn).toBeVisible();
  await btn.click();

  await expect(page.getByRole('heading', { name: 'LIQUIDITY MAP' })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('Falha ao carregar Mapa de Liquidez')).toHaveCount(0);

  await expect(page.getByText('📊 CONCLUSÃO GERAL DO MERCADO')).toBeVisible({ timeout: 90_000 });
});
