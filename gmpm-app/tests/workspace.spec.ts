import { test, expect } from '@playwright/test';

function parseTrackedCount(text: string): number | null {
  const m = text.match(/TRACKED:\s*(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

test('workspace: open asset detail, see liquidity map, optionally execute', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Live Opportunity Scanner')).toBeVisible();

  const marketWatchItems = page.locator('[data-testid="market-watch-item"]');
  await expect(marketWatchItems.first()).toBeVisible({ timeout: 60_000 });

  const tracked = page.locator('[data-testid="tracked-count"]');
  await expect(tracked).toBeVisible();
  const beforeText = await tracked.textContent();
  const before = beforeText ? parseTrackedCount(beforeText) : null;

  let executed = false;
  for (let i = 0; i < 10; i++) {
    const item = marketWatchItems.nth(i);
    if (!(await item.isVisible())) break;

    await item.click();
    const panel = page.locator('[data-testid="asset-detail-panel"]');
    await expect(panel).toBeVisible();

    await expect(page.locator('[data-testid="liquidity-score"]')).toBeVisible();
    await expect(page.locator('[data-testid="execute-signal"]')).toBeVisible();

    const executeBtn = page.locator('[data-testid="execute-signal"]');
    if (await executeBtn.isEnabled()) {
      await executeBtn.click();
      await expect(panel).toBeHidden();
      executed = true;
      break;
    }

    await page.locator('[data-testid="close-asset-detail"]').click();
    await expect(panel).toBeHidden();
  }

  if (executed && before !== null) {
    await expect.poll(async () => {
      const t = await tracked.textContent();
      if (!t) return before;
      const n = parseTrackedCount(t);
      return n ?? before;
    }).toBeGreaterThanOrEqual(before + 1);
  }
});
