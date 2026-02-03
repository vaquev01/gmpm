import { test, expect } from '@playwright/test';

test('macro view loads and shows economic data', async ({ page }) => {
  await page.goto('/');
  
  // Navigate to Macro view
  const macroButton = page.locator('button:has-text("MACRO")');
  await expect(macroButton).toBeVisible({ timeout: 30_000 });
  await macroButton.click();

  // Wait for macro view to load
  await expect(page.getByText('LIVE FEED')).toBeVisible({ timeout: 60_000 });

  // Check for Oracle section
  await expect(page.getByText('ORACLE SYNTHESIS')).toBeVisible();

  // Check for key economic indicators (use first match for regex)
  await expect(page.getByText(/GROWTH/i).first()).toBeVisible();
  await expect(page.getByText(/INFLATION/i).first()).toBeVisible();
  await expect(page.getByText(/Fed Funds/i).first()).toBeVisible();

  // Check for geopolitical radar
  await expect(page.getByText('GEOPOLITICAL RADAR')).toBeVisible();

  // Check for technology watch
  await expect(page.getByText('TECHNOLOGY WATCH')).toBeVisible();

  // Check for news headlines
  await expect(page.getByText('NEWS HEADLINES')).toBeVisible();
});

test('api/fred returns valid economic data', async ({ request }) => {
  const response = await request.get('/api/fred');
  expect(response.ok()).toBeTruthy();

  const data = await response.json();
  expect(data.success).toBe(true);
  expect(data.summary).toBeDefined();
  expect(data.summary.rates).toBeDefined();

  // Validate key rates exist
  expect(typeof data.summary.rates.fedFunds).toBe('number');
  expect(typeof data.summary.rates.treasury10y).toBe('number');
  expect(typeof data.summary.rates.treasury2y).toBe('number');
  expect(typeof data.summary.rates.yieldCurve).toBe('number');
});

test('api/news returns news feeds', async ({ request }) => {
  const response = await request.get('/api/news?limit=5');
  expect(response.ok()).toBeTruthy();

  const data = await response.json();
  expect(data.success).toBe(true);
  expect(Array.isArray(data.geopolitics)).toBe(true);
  expect(Array.isArray(data.technology)).toBe(true);
  expect(Array.isArray(data.headlines)).toBe(true);

  // Check that feeds have content
  expect(data.geopolitics.length).toBeGreaterThan(0);
  expect(data.technology.length).toBeGreaterThan(0);
  expect(data.headlines.length).toBeGreaterThan(0);
});

test('api/calendar returns economic events', async ({ request }) => {
  const response = await request.get('/api/calendar?days=14');
  expect(response.ok()).toBeTruthy();

  const data = await response.json();
  expect(data.success).toBe(true);
  expect(Array.isArray(data.events)).toBe(true);
});
