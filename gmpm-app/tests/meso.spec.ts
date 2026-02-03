import { test, expect } from '@playwright/test';

test('meso view loads successfully', async ({ page }) => {
    await page.goto('/');

    // Navigate to Meso view
    const mesoButton = page.locator('button:has-text("MESO")');
    await expect(mesoButton).toBeVisible({ timeout: 30_000 });
    await mesoButton.click();

    // Wait for meso view to load - check for main header
    await expect(page.getByText('MESO ANALYSIS')).toBeVisible({ timeout: 60_000 });
});

test('api/meso returns valid analysis with temporal focus', async ({ request }) => {
    const response = await request.get('/api/meso');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.regime).toBeDefined();
    expect(data.regime.type).toBeDefined();

    // Check executive summary
    expect(data.executiveSummary).toBeDefined();
    expect(data.executiveSummary.marketBias).toBeDefined();
    expect(data.executiveSummary.oneLineSummary).toBeDefined();

    // Check temporal focus
    expect(data.temporalFocus).toBeDefined();
    expect(data.temporalFocus.weeklyThesis).toBeDefined();
    expect(Array.isArray(data.temporalFocus.dailyFocus)).toBe(true);
    expect(Array.isArray(data.temporalFocus.actionPlan)).toBe(true);

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
});
