import { test, expect } from '@playwright/test';

test('meso view loads and shows asset classes', async ({ page }) => {
    await page.goto('/');

    // Navigate to Meso view
    const mesoButton = page.locator('button:has-text("MESO")');
    await expect(mesoButton).toBeVisible({ timeout: 30_000 });
    await mesoButton.click();

    // Wait for meso view to load
    await expect(page.getByText('MESO ANALYSIS')).toBeVisible({ timeout: 60_000 });

    // Check for regime info
    await expect(page.getByText('Regime')).toBeVisible();

    // Check for summary stats
    await expect(page.getByText('Bullish Classes')).toBeVisible();
    await expect(page.getByText('Avg Liquidity')).toBeVisible();

    // Check for asset class cards (at least one should be visible)
    const classCards = page.locator('text=/Equities|Crypto|Forex|Commodities|Fixed Income/');
    await expect(classCards.first()).toBeVisible();
});

test('meso view shows sectors tab', async ({ page }) => {
    await page.goto('/');

    // Navigate to Meso view
    await page.locator('button:has-text("MESO")').click();
    await expect(page.getByText('MESO ANALYSIS')).toBeVisible({ timeout: 60_000 });

    // Click on Sectors tab
    await page.locator('button:has-text("Sectors")').click();

    // Check for sector momentum info
    await expect(page.getByText('Sector Momentum & Relative Strength')).toBeVisible();

    // Check for at least one sector
    const sectors = page.locator('text=/Technology|Financials|Energy|Healthcare|Precious Metals/');
    await expect(sectors.first()).toBeVisible();
});

test('meso view shows liquidity map', async ({ page }) => {
    await page.goto('/');

    // Navigate to Meso view
    await page.locator('button:has-text("MESO")').click();
    await expect(page.getByText('MESO ANALYSIS')).toBeVisible({ timeout: 60_000 });

    // Click on Liquidity tab
    await page.locator('button:has-text("Liquidity")').click();

    // Check for liquidity map
    await expect(page.getByText('Liquidity Map by Asset Class')).toBeVisible();
});

test('api/meso returns valid analysis', async ({ request }) => {
    const response = await request.get('/api/meso');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.regime).toBeDefined();
    expect(data.regime.type).toBeDefined();

    // Check classes array
    expect(Array.isArray(data.classes)).toBe(true);
    expect(data.classes.length).toBeGreaterThan(0);

    // Validate class structure
    const firstClass = data.classes[0];
    expect(firstClass.name).toBeDefined();
    expect(firstClass.expectation).toBeDefined();
    expect(firstClass.liquidityScore).toBeDefined();
    expect(typeof firstClass.liquidityScore).toBe('number');

    // Check sectors array
    expect(Array.isArray(data.sectors)).toBe(true);
    expect(data.sectors.length).toBeGreaterThan(0);

    // Check summary
    expect(data.summary).toBeDefined();
    expect(Array.isArray(data.summary.topOpportunities)).toBe(true);
    expect(Array.isArray(data.summary.riskWarnings)).toBe(true);
});
