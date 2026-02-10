import { calculateRegimeSnapshot, RegimeSnapshot, MacroInputs } from '../lib/regimeEngine';

// Cache for regime snapshot
let cachedSnapshot: RegimeSnapshot | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 15_000; // 15 seconds

async function fetchJsonWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

async function fetchMacroInputs(): Promise<MacroInputs> {
  const port = process.env.PORT || '3001';
  const baseUrl = `http://localhost:${port}`;

  try {
    const [macroRes, marketRes] = await Promise.all([
      fetchJsonWithTimeout(`${baseUrl}/api/macro`, 5000),
      fetchJsonWithTimeout(`${baseUrl}/api/market?limit=50&includeMacro=false`, 6000),
    ]);

    const macroJson = isRecord(macroRes.json) ? macroRes.json : {};
    const marketJson = isRecord(marketRes.json) ? marketRes.json : {};

    if (!macroRes.ok) {
      console.warn('[regime] macro fetch failed:', macroRes.status);
    }
    if (!marketRes.ok) {
      console.warn('[regime] market fetch failed:', marketRes.status);
    }

    const macro = isRecord(macroJson.macro) ? (macroJson.macro as Record<string, unknown>) : {};
    const stats = isRecord(marketJson.stats) ? (marketJson.stats as Record<string, unknown>) : {};
    const assets = Array.isArray(marketJson.assets)
      ? (marketJson.assets as Array<Record<string, unknown>>)
      : Array.isArray(marketJson.data)
        ? (marketJson.data as Array<Record<string, unknown>>)
        : [];

    const fgRaw = macro.fearGreed;
    const fearGreed = isRecord(fgRaw)
      ? (() => {
          const r = fgRaw as Record<string, unknown>;
          const value = typeof r.value === 'number' ? r.value : null;
          const classification = typeof r.classification === 'string' ? r.classification : null;
          if (value === null || classification === null) return null;
          return { value, classification };
        })()
      : null;

    const gainers = typeof stats.gainers === 'number' ? stats.gainers : 0;
    const losers = typeof stats.losers === 'number' ? stats.losers : 0;
    const advDecRatio = losers > 0 ? gainers / losers : (gainers > 0 ? 2 : 1);

    const dxyAsset = assets.find((a) => a?.symbol === 'DX=F' || a?.symbol === 'DX-Y.NYB');
    const dxyAssetChg = dxyAsset && typeof dxyAsset.changePercent === 'number' ? dxyAsset.changePercent : null;
    const macroDxyChg = typeof macro.dollarIndexChange === 'number' ? macro.dollarIndexChange : null;
    const dollarIndexChange = macroDxyChg ?? dxyAssetChg;

    const inputs: MacroInputs = {
      vix: typeof macro.vix === 'number' ? macro.vix : undefined,
      vixChange: typeof macro.vixChange === 'number' ? macro.vixChange : undefined,
      treasury10y: typeof macro.treasury10y === 'number' ? macro.treasury10y : undefined,
      treasury2y: typeof macro.treasury2y === 'number' ? macro.treasury2y : undefined,
      treasury30y: typeof macro.treasury30y === 'number' ? macro.treasury30y : undefined,
      yieldCurve: typeof macro.yieldCurve === 'number' ? macro.yieldCurve : undefined,
      dollarIndex: typeof macro.dollarIndex === 'number' ? macro.dollarIndex : undefined,
      dollarIndexChange: dollarIndexChange ?? undefined,
      fearGreed,
      advDecRatio,
      marketAvgChange: typeof stats.avgChange === 'number' ? stats.avgChange : undefined,
      dataTimestamp: typeof macroJson.timestamp === 'string'
        ? (macroJson.timestamp as string)
        : typeof marketJson.timestamp === 'string'
          ? (marketJson.timestamp as string)
          : undefined,
    };

    return inputs;
  } catch (error) {
    console.error('[regime] fetchMacroInputs error:', error);
    return {};
  }
}

export async function getRegimeSnapshot() {
  const now = Date.now();

  // Return cached if fresh
  if (cachedSnapshot && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return {
      status: 200,
      payload: {
        success: true,
        cached: true,
        cacheAge: now - cacheTimestamp,
        snapshot: cachedSnapshot,
      },
    };
  }

  try {
    const inputs = await fetchMacroInputs();
    const snapshot = calculateRegimeSnapshot(inputs);

    cachedSnapshot = snapshot;
    cacheTimestamp = now;

    const hasCritical = snapshot.alerts.some((a) => a.level === 'CRITICAL');
    console.log(
      `[regime] ${hasCritical ? 'WARN' : 'INFO'} regime=${snapshot.regime} confidence=${snapshot.regimeConfidence} drivers=${snapshot.dominantDrivers.join(',')} alerts=${snapshot.alerts.length}`
    );

    return {
      status: 200,
      payload: {
        success: true,
        cached: false,
        snapshot,
      },
    };
  } catch (error) {
    console.error('[regime] snapshot error:', error);

    if (cachedSnapshot) {
      return {
        status: 200,
        payload: {
          success: true,
          cached: true,
          degraded: true,
          cacheAge: now - cacheTimestamp,
          snapshot: cachedSnapshot,
        },
      };
    }

    return {
      status: 500,
      payload: { success: false, error: 'Failed to calculate regime' },
    };
  }
}
