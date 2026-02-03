import { test, expect } from '@playwright/test';

test('regime panel loads and shows 6 axes', async ({ page }) => {
  await page.goto('/');

  // Wait for regime panel to load
  await expect(page.getByText('Regime Engine')).toBeVisible({ timeout: 60_000 });

  // At least one regime type should be visible (GOLDILOCKS, REFLATION, RISK ON, etc.)
  const regimeVisible = await page.locator('text=/GOLDILOCKS|REFLATION|STAGFLATION|DEFLATION|LIQUIDITY|CREDIT|RISK|NEUTRAL|UNKNOWN/i').first().isVisible();
  expect(regimeVisible).toBeTruthy();

  // Check for 6 axes (G, I, L, C, D, V)
  await expect(page.getByText('State Variables (6 Axes)')).toBeVisible();
  
  // Each axis should show a direction (↑↑, ↑, →, ↓, ↓↓)
  const axisLabels = ['G', 'I', 'L', 'C', 'D', 'V'];
  for (const axis of axisLabels) {
    const axisElement = page.locator(`text="${axis}"`).first();
    await expect(axisElement).toBeVisible();
  }

  // Check for Meso Tilts section
  await expect(page.getByText('Meso Tilts')).toBeVisible();
});

test('execution status panel shows trading session', async ({ page }) => {
  await page.goto('/');

  // Wait for execution panel to load
  await expect(page.getByText('Execution Window')).toBeVisible({ timeout: 60_000 });

  // Should show session quality (OPTIMAL, GOOD, FAIR, POOR)
  const qualityVisible = await page.locator('text=/OPTIMAL|GOOD|FAIR|POOR/').first().isVisible();
  expect(qualityVisible).toBeTruthy();

  // Should show active sessions info
  await expect(page.getByText(/Active:/)).toBeVisible();
});

test('api/regime returns valid snapshot', async ({ request }) => {
  const response = await request.get('/api/regime');
  expect(response.ok()).toBeTruthy();

  const data = await response.json();
  expect(data.success).toBe(true);
  expect(data.snapshot).toBeDefined();
  expect(data.snapshot.regime).toBeDefined();
  expect(data.snapshot.axes).toBeDefined();

  // Check all 6 axes exist
  const axes = ['G', 'I', 'L', 'C', 'D', 'V'];
  for (const axis of axes) {
    expect(data.snapshot.axes[axis]).toBeDefined();
    expect(data.snapshot.axes[axis].direction).toBeDefined();
    expect(data.snapshot.axes[axis].confidence).toBeDefined();
  }

  // Check meso tilts and prohibitions
  expect(Array.isArray(data.snapshot.mesoTilts)).toBe(true);
  expect(Array.isArray(data.snapshot.mesoProhibitions)).toBe(true);
});
