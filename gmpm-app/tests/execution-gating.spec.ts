import { test, expect } from '@playwright/test';

type SignalHistoryEntry = {
  status?: unknown;
  notes?: unknown;
};

function isSignalHistoryEntry(v: unknown): v is SignalHistoryEntry {
  return typeof v === 'object' && v !== null;
}

function parseSignalHistory(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

test('execution gating: manual kill-switch blocks and audits CANCELLED', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Live Opportunity Scanner')).toBeVisible();

  // Enable kill-switch
  await expect(page.getByText('Execution controls')).toBeVisible();
  await page.getByRole('button', { name: 'KILL-SWITCH OFF' }).click();
  await expect(page.getByRole('button', { name: 'KILL-SWITCH ON' })).toBeVisible();

  // Open an asset detail
  const marketWatchItems = page.locator('[data-testid="market-watch-item"]');
  await expect(marketWatchItems.first()).toBeVisible({ timeout: 60_000 });

  const panel = page.locator('[data-testid="asset-detail-panel"]');

  let executed = false;
  for (let i = 0; i < 10; i++) {
    const item = marketWatchItems.nth(i);
    if (!(await item.isVisible())) break;

    await item.click();
    await expect(panel).toBeVisible();

    const reasonText = page.getByText(/Execution blocked:\s*MANUAL_KILL_SWITCH/);
    if (!(await reasonText.isVisible())) {
      await page.locator('[data-testid="close-asset-detail"]').click();
      await expect(panel).toBeHidden();
      continue;
    }

    const executeBtn = page.locator('[data-testid="execute-signal"]');
    await expect(executeBtn).toBeVisible();
    if (await executeBtn.isEnabled()) {
      await executeBtn.click();
      executed = true;
      break;
    }

    await page.locator('[data-testid="close-asset-detail"]').click();
    await expect(panel).toBeHidden();
  }

  expect(executed).toBeTruthy();

  // On block, we should see notice and panel should close (executeSignal calls onClose after attempt)
  await expect(page.getByText(/Execution blocked:/)).toBeVisible({ timeout: 60_000 });

  // Audit: localStorage history should include a CANCELLED signal with MANUAL_KILL_SWITCH notes
  const history = await page.evaluate(() => {
    const raw = localStorage.getItem('gmpm_signal_history');
    return raw;
  });

  const entries = parseSignalHistory(history);
  const found = entries.some((e) => {
    if (!isSignalHistoryEntry(e)) return false;
    return e.status === 'CANCELLED' && typeof e.notes === 'string' && e.notes.includes('MANUAL_KILL_SWITCH');
  });
  expect(found).toBeTruthy();
});

test('execution gating: risk HALTED blocks and audits CANCELLED', async ({ page }) => {
  await page.route('**/api/risk', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        cached: false,
        report: {
          tradingStatus: 'HALTED',
          alerts: [{ level: 'CRITICAL', message: 'TEST_HALTED' }],
        },
      }),
    });
  });

  await page.goto('/');

  await expect(page.getByText('Execution controls')).toBeVisible();
  await expect(page.getByText(/risk=HALTED/)).toBeVisible({ timeout: 60_000 });

  const marketWatchItems = page.locator('[data-testid="market-watch-item"]');
  await expect(marketWatchItems.first()).toBeVisible({ timeout: 60_000 });

  let executed = false;
  for (let i = 0; i < 10; i++) {
    const item = marketWatchItems.nth(i);
    if (!(await item.isVisible())) break;

    await item.click();
    const panel = page.locator('[data-testid="asset-detail-panel"]');
    await expect(panel).toBeVisible();

    const reasonText = page.getByText(/Execution blocked:\s*RISK_HALTED:\s*TEST_HALTED/);
    if (!(await reasonText.isVisible())) {
      await page.locator('[data-testid="close-asset-detail"]').click();
      await expect(panel).toBeHidden();
      continue;
    }

    const executeBtn = page.locator('[data-testid="execute-signal"]');
    if (await executeBtn.isEnabled()) {
      await executeBtn.click();
      executed = true;
      break;
    }

    await page.locator('[data-testid="close-asset-detail"]').click();
    await expect(panel).toBeHidden();
  }
  expect(executed).toBeTruthy();

  await expect(page.getByText(/Execution blocked:/)).toBeVisible({ timeout: 60_000 });

  const history = await page.evaluate(() => localStorage.getItem('gmpm_signal_history'));
  const entries = parseSignalHistory(history);
  const found = entries.some((e) => {
    if (!isSignalHistoryEntry(e)) return false;
    return e.status === 'CANCELLED' && typeof e.notes === 'string' && e.notes.includes('RISK_HALTED');
  });
  expect(found).toBeTruthy();
});
