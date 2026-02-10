type FearGreedData = {
  value: number;
  classification: string;
  timestamp: string;
};

export type MacroData = {
  vix: number;
  vixChange: number;
  treasury10y: number;
  treasury2y: number;
  treasury30y: number;
  yieldCurve: number;
  dollarIndex: number;
  dollarIndexChange: number;
  fearGreed: FearGreedData | null;
};

type MacroPayload = {
  success: boolean;
  timestamp?: string;
  macro?: MacroData;
  degraded?: boolean;
  fallback?: boolean;
  fallbackTimestamp?: string;
  error?: string;
};

type MacroCacheEntry = {
  ts: number;
  payload: MacroPayload;
};

const macroCache = new Map<string, MacroCacheEntry>();
const macroCacheInFlight = new Map<string, Promise<{ status: number; payload: MacroPayload; cacheable: boolean }>>();
const MACRO_CACHE_TTL_MS = 60_000;
const MACRO_CACHE_STALE_MS = 5 * 60_000;
let lastGoodSnapshot: { payload: MacroPayload; timestamp: string } | null = null;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

const externalHeaders: Record<string, string> = {
  accept: 'application/json',
  'user-agent': 'Mozilla/5.0 (compatible; GMPM/1.0)',
};

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function fetchFredLatest(seriesId: string): Promise<number | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(seriesId)}&api_key=${encodeURIComponent(apiKey)}&file_type=json&sort_order=desc&limit=1`;
    const res = await fetchWithTimeout(url, { headers: externalHeaders }, 4500);
    if (!res.ok) return null;

    const json = (await res.json()) as unknown;
    const obs = isRecord(json) && Array.isArray(json.observations) ? (json.observations as Array<Record<string, unknown>>) : [];
    const v = obs.length > 0 && isRecord(obs[0]) ? obs[0].value : undefined;
    const n = typeof v === 'string' ? Number.parseFloat(v) : Number.NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function fetchFearGreed(): Promise<FearGreedData | null> {
  try {
    const res = await fetchWithTimeout(
      'https://api.alternative.me/fng/?limit=1',
      { headers: externalHeaders },
      3500
    );
    if (!res.ok) return null;

    const json = (await res.json()) as unknown;
    if (!isRecord(json) || !Array.isArray(json.data) || !isRecord(json.data[0])) return null;

    const fng = json.data[0];
    const value = typeof fng.value === 'string' ? Number.parseInt(fng.value) : Number.NaN;
    const classification = typeof fng.value_classification === 'string' ? fng.value_classification : null;
    const ts = typeof fng.timestamp === 'string' ? Number.parseInt(fng.timestamp) : Number.NaN;
    if (!Number.isFinite(value) || !classification || !Number.isFinite(ts)) return null;

    return {
      value,
      classification,
      timestamp: new Date(ts * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

type YahooMeta = {
  regularMarketPrice?: number;
  previousClose?: number;
};

type YahooQuote = {
  close?: Array<number | null>;
};

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: YahooMeta;
      indicators?: {
        quote?: YahooQuote[];
      };
    }>;
  };
};

type MacroQuote = {
  symbol: string;
  price: number;
  changePercent: number;
};

async function fetchMacroQuote(symbol: string): Promise<MacroQuote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=10d`;
    const res = await fetchWithTimeout(url, { headers: externalHeaders }, 7000);
    if (!res.ok) return null;

    const json = (await res.json()) as unknown;
    const data = json as YahooChartResponse;
    const result = data.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta || {};
    const quotes = result.indicators?.quote?.[0];
    if (!quotes?.close) return null;

    const closes = (quotes.close || []).filter((c): c is number => c !== null);
    const currentPriceRaw = closes[closes.length - 1] || meta.regularMarketPrice || 0;
    const previousCloseRaw = meta.previousClose || closes[closes.length - 2] || currentPriceRaw;

    const yieldScaledSymbols = new Set(['^TNX', '^TYX', '^FVX']);
    const scale = yieldScaledSymbols.has(symbol) && currentPriceRaw > 20 ? 10 : 1;

    const currentPrice = currentPriceRaw / scale;
    const previousClose = previousCloseRaw / scale;
    const change = currentPrice - previousClose;
    const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;

    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

    return {
      symbol,
      price: currentPrice,
      changePercent: Number.isFinite(changePercent) ? changePercent : 0,
    };
  } catch {
    return null;
  }
}

export async function getMacroSnapshot(noCache: boolean) {
  const cacheKey = 'macro_v1';
  const cached = noCache ? null : macroCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.ts < MACRO_CACHE_TTL_MS) {
    return { status: 200, payload: cached.payload, cacheable: false, cached: true, cacheAge: now - cached.ts, cacheMode: 'HIT' };
  }

  if (cached && now - cached.ts < MACRO_CACHE_STALE_MS) {
    if (!macroCacheInFlight.has(cacheKey)) {
      const inFlight = (async () => {
        const res = await buildSnapshot();
        if (res.cacheable) macroCache.set(cacheKey, { ts: Date.now(), payload: res.payload });
        return res;
      })().finally(() => {
        macroCacheInFlight.delete(cacheKey);
      });
      macroCacheInFlight.set(cacheKey, inFlight);
    }

    return { status: 200, payload: cached.payload, cacheable: false, cached: true, cacheAge: now - cached.ts, cacheMode: 'STALE' };
  }

  const existing = macroCacheInFlight.get(cacheKey);
  if (existing) {
    try {
      const res = await existing;
      return { status: res.status, payload: res.payload, cacheable: false, cached: true, cacheAge: 0, cacheMode: 'INFLIGHT' };
    } catch {
      return { status: 500, payload: { success: false, error: 'Failed to fetch macro data' }, cacheable: false };
    }
  }

  async function buildSnapshot(): Promise<{ status: number; payload: MacroPayload; cacheable: boolean }> {
    try {
      const macroSymbols = ['^VIX', '^TNX', '^TYX', '^FVX', 'DX=F'];
      const [vix, t10y, t30y, t5y, dxy] = await Promise.all(macroSymbols.map(fetchMacroQuote));

      const [fearGreed, fred10y, fred2y] = await Promise.all([
        fetchFearGreed(),
        fetchFredLatest('DGS10'),
        fetchFredLatest('DGS2'),
      ]);

      const treasury10y = fred10y !== null ? fred10y : t10y?.price || 0;
      const treasury2y = fred2y !== null ? fred2y : t5y?.price || 0;
      const yieldCurve = treasury10y && treasury2y ? treasury10y - treasury2y : 0;

      const macro: MacroData = {
        vix: vix?.price || 0,
        vixChange: vix?.changePercent || 0,
        treasury10y,
        treasury2y,
        treasury30y: t30y?.price || 0,
        yieldCurve,
        dollarIndex: dxy?.price || 0,
        dollarIndexChange: dxy?.changePercent || 0,
        fearGreed,
      };

      const payload: MacroPayload = {
        success: true,
        timestamp: new Date().toISOString(),
        macro,
      };

      if (macro.vix > 0) {
        lastGoodSnapshot = { payload, timestamp: payload.timestamp || new Date().toISOString() };
      }

      return { status: 200, payload, cacheable: true };
    } catch {
      if (lastGoodSnapshot) {
        const last = lastGoodSnapshot.payload;
        return {
          status: 200,
          cacheable: true,
          payload: {
            ...last,
            degraded: true,
            fallback: true,
            fallbackTimestamp: lastGoodSnapshot.timestamp,
          },
        };
      }

      return { status: 500, payload: { success: false, error: 'Failed to fetch macro data' }, cacheable: false };
    }
  }

  const inFlight = buildSnapshot().finally(() => {
    macroCacheInFlight.delete(cacheKey);
  });

  macroCacheInFlight.set(cacheKey, inFlight);
  const res = await inFlight;

  if (res.cacheable) {
    macroCache.set(cacheKey, { ts: Date.now(), payload: res.payload });
  }

  return { status: res.status, payload: res.payload, cacheable: false, cacheMode: 'MISS' };
}
