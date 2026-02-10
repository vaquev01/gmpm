type FredObservation = {
  date: string;
  value: string;
};

type FredSeriesConfig = {
  id: string;
  name: string;
  unit: string;
};

export type FredSeriesData = {
  seriesId: string;
  name: string;
  value: number;
  date: string;
  unit: string;
};

type FredPayload = {
  success: boolean;
  timestamp: string;
  data?: Record<string, FredSeriesData>;
  summary?: unknown;
  error?: string;
};

type FredSnapshot = {
  data: Record<string, FredSeriesData>;
  summary: unknown;
};

type FredCacheEntry = {
  ts: number;
  snapshot: FredSnapshot;
};

const FRED_BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';

const FRED_SERIES: Record<string, FredSeriesConfig> = {
  GDP: { id: 'GDP', name: 'GDP', unit: 'Billions $' },
  GDPC1: { id: 'GDPC1', name: 'Real GDP', unit: 'Billions $' },
  INDPRO: { id: 'INDPRO', name: 'Industrial Production', unit: 'Index' },
  RSAFS: { id: 'RSAFS', name: 'Retail Sales', unit: 'Millions $' },
  PCEC96: { id: 'PCEC96', name: 'Real PCE', unit: 'Billions $' },
  AMTMNO: { id: 'AMTMNO', name: 'New Orders (Mfg)', unit: 'Millions $' },

  CPIAUCSL: { id: 'CPIAUCSL', name: 'CPI', unit: 'Index' },
  CPILFESL: { id: 'CPILFESL', name: 'Core CPI', unit: 'Index' },
  PCEPI: { id: 'PCEPI', name: 'PCE', unit: 'Index' },
  PCEPILFE: { id: 'PCEPILFE', name: 'Core PCE', unit: 'Index' },
  T5YIE: { id: 'T5YIE', name: '5Y Breakeven Inflation', unit: '%' },

  UNRATE: { id: 'UNRATE', name: 'Unemployment Rate', unit: '%' },
  PAYEMS: { id: 'PAYEMS', name: 'Non-Farm Payrolls', unit: 'Thousands' },
  ICSA: { id: 'ICSA', name: 'Initial Claims', unit: 'Thousands' },
  JTSJOL: { id: 'JTSJOL', name: 'JOLTS Openings', unit: 'Thousands' },
  CIVPART: { id: 'CIVPART', name: 'Participation Rate', unit: '%' },

  FEDFUNDS: { id: 'FEDFUNDS', name: 'Fed Funds Rate', unit: '%' },
  DGS10: { id: 'DGS10', name: '10-Year Treasury', unit: '%' },
  DGS2: { id: 'DGS2', name: '2-Year Treasury', unit: '%' },
  T10Y2Y: { id: 'T10Y2Y', name: 'Yield Curve (10Y-2Y)', unit: '%' },
  T10Y3M: { id: 'T10Y3M', name: 'Yield Curve (10Y-3M)', unit: '%' },

  M2SL: { id: 'M2SL', name: 'M2 Money Supply', unit: 'Billions $' },
  WALCL: { id: 'WALCL', name: 'Fed Total Assets', unit: 'Millions $' },
  RRPONTSYD: { id: 'RRPONTSYD', name: 'Reverse Repo (RRP)', unit: 'Billions $' },
  WTREGEN: { id: 'WTREGEN', name: 'Treasury General Account (TGA)', unit: 'Millions $' },

  BAMLC0A0CM: { id: 'BAMLC0A0CM', name: 'Credit Spread (AAA)', unit: '%' },
  BAMLH0A0HYM2: { id: 'BAMLH0A0HYM2', name: 'High Yield Spread', unit: '%' },
  DRSESP: { id: 'DRSESP', name: 'Delinquency Rate (All Loans)', unit: '%' },
  STLFSI3: { id: 'STLFSI3', name: 'Financial Stress Index', unit: 'Index' },

  HOUST: { id: 'HOUST', name: 'Housing Starts', unit: 'Thousands' },
  PERMIT: { id: 'PERMIT', name: 'Building Permits', unit: 'Thousands' },
  CSUSHPINSA: { id: 'CSUSHPINSA', name: 'Case-Shiller Home Price', unit: 'Index' },

  UMCSENT: { id: 'UMCSENT', name: 'Consumer Sentiment', unit: 'Index' },
  BOPTEXP: { id: 'BOPTEXP', name: 'Total Exports', unit: 'Millions $' },
  BOPTIMP: { id: 'BOPTIMP', name: 'Total Imports', unit: 'Millions $' },

  DCOILWTICO: { id: 'DCOILWTICO', name: 'WTI Crude Oil', unit: '$' },
  VIXCLS: { id: 'VIXCLS', name: 'VIX Index', unit: 'Index' },
};

const fredCache = new Map<string, FredCacheEntry>();
const fredCacheInFlight = new Map<string, Promise<{ status: number; payload: FredPayload; cacheable: boolean }>>();
const FRED_CACHE_TTL_MS = 60 * 60_000;
const FRED_CACHE_STALE_MS = 6 * 60 * 60_000;
let lastGoodSnapshot: { payload: FredPayload; timestamp: string } | null = null;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

async function fetchTextWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal });
    const text = await res.text();
    return { res, text };
  } finally {
    clearTimeout(t);
  }
}

async function fetchFredObservations(seriesId: string, limit: number): Promise<FredObservation[] | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  try {
    const url = new URL(FRED_BASE_URL);
    url.search = new URLSearchParams({
      series_id: seriesId,
      api_key: apiKey,
      file_type: 'json',
      sort_order: 'desc',
      limit: String(Math.max(1, limit)),
    }).toString();

    const { res, text } = await fetchTextWithTimeout(url.toString(), 4500);
    if (!res.ok) return null;

    let json: unknown = null;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = null;
    }

    const obs = isRecord(json) && Array.isArray(json.observations) ? (json.observations as FredObservation[]) : null;
    if (!obs || obs.length === 0) return null;

    return obs;
  } catch {
    return null;
  }
}

async function fetchFredSeriesWithStatus(
  seriesId: string,
  onNonOk?: (status: number, message?: string) => void
): Promise<FredSeriesData | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  try {
    const url = new URL(FRED_BASE_URL);
    url.search = new URLSearchParams({
      series_id: seriesId,
      api_key: apiKey,
      file_type: 'json',
      sort_order: 'desc',
      limit: '1',
    }).toString();

    const { res, text } = await fetchTextWithTimeout(url.toString(), 4500);
    if (!res.ok) {
      let msg: string | undefined;
      try {
        const parsed = JSON.parse(text) as unknown;
        msg = isRecord(parsed)
          ? (typeof parsed.error_message === 'string'
            ? parsed.error_message
            : typeof parsed.error === 'string'
              ? parsed.error
              : undefined)
          : undefined;
      } catch {
        msg = text?.slice(0, 300) || undefined;
      }

      onNonOk?.(res.status, msg);
      return null;
    }

    let json: unknown = null;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = null;
    }

    const observations = isRecord(json) && Array.isArray(json.observations) ? (json.observations as FredObservation[]) : null;
    if (!observations || observations.length === 0) return null;

    const latest = observations[0];
    const value = Number.parseFloat(latest.value);
    if (!Number.isFinite(value)) return null;

    const series = FRED_SERIES[seriesId];
    return {
      seriesId,
      name: series?.name || seriesId,
      value,
      date: latest.date,
      unit: series?.unit || '',
    };
  } catch {
    return null;
  }
}

export async function getFredSnapshot(noCache: boolean) {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return {
      status: 500,
      payload: { success: false, timestamp: new Date().toISOString(), error: 'Missing FRED_API_KEY' } satisfies FredPayload,
      cacheable: false,
    };
  }

  const cacheKey = 'fred_v1';
  const cached = noCache ? null : fredCache.get(cacheKey);
  const now = Date.now();

  const snapshotToPayload = (snapshot: FredSnapshot): FredPayload => ({
    success: true,
    timestamp: new Date().toISOString(),
    data: snapshot.data,
    summary: snapshot.summary,
  });

  if (cached && now - cached.ts < FRED_CACHE_TTL_MS) {
    return { status: 200, payload: snapshotToPayload(cached.snapshot), cacheable: false, cached: true, cacheAge: now - cached.ts, cacheMode: 'HIT' };
  }

  if (cached && now - cached.ts < FRED_CACHE_STALE_MS) {
    if (!fredCacheInFlight.has(cacheKey)) {
      const inFlight = (async () => {
        const res = await buildSnapshot();
        if (res.cacheable) {
          if (res.payload.success && res.payload.data) {
            fredCache.set(cacheKey, {
              ts: Date.now(),
              snapshot: {
                data: res.payload.data,
                summary: res.payload.summary,
              },
            });
          }
        }
        return res;
      })().finally(() => {
        fredCacheInFlight.delete(cacheKey);
      });
      fredCacheInFlight.set(cacheKey, inFlight);
    }

    return { status: 200, payload: snapshotToPayload(cached.snapshot), cacheable: false, cached: true, cacheAge: now - cached.ts, cacheMode: 'STALE' };
  }

  const existing = fredCacheInFlight.get(cacheKey);
  if (existing) {
    try {
      const res = await existing;
      return { status: res.status, payload: res.payload, cacheable: false, cached: true, cacheAge: 0, cacheMode: 'INFLIGHT' };
    } catch {
      return { status: 500, payload: { success: false, timestamp: new Date().toISOString(), error: 'Failed to fetch FRED data' }, cacheable: false };
    }
  }

  async function buildSnapshot(): Promise<{ status: number; payload: FredPayload; cacheable: boolean }> {
    try {
      const seriesIds = Object.keys(FRED_SERIES);
      let firstNonOkStatus: number | null = null;
      let firstNonOkMessage: string | null = null;
      const noteNonOk = (s: number, msg?: string) => {
        if (firstNonOkStatus === null) {
          firstNonOkStatus = s;
          firstNonOkMessage = msg || null;
        }
      };

      const results: Array<FredSeriesData | null> = [];
      const batchSize = 6;
      for (let i = 0; i < seriesIds.length; i += batchSize) {
        const batch = seriesIds.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map((id) => fetchFredSeriesWithStatus(id, noteNonOk)));
        results.push(...batchResults);
      }

      const data: Record<string, FredSeriesData> = {};
      for (const result of results) {
        if (result) data[result.seriesId] = result;
      }

      if (Object.keys(data).length === 0) {
        const statusHint = firstNonOkStatus !== null ? ` Last HTTP status: ${firstNonOkStatus}.` : '';
        const messageHint = firstNonOkMessage ? ` Message: ${firstNonOkMessage}` : '';
        return {
          status: 502,
          cacheable: false,
          payload: {
            success: false,
            timestamp: new Date().toISOString(),
            error: `No FRED series could be fetched. Check FRED_API_KEY validity, rate limits, or network connectivity.${statusHint}${messageHint}`,
          },
        };
      }

      const cpiValue = Number.isFinite(data.CPIAUCSL?.value) ? data.CPIAUCSL.value : null;
      const cpiObs = await fetchFredObservations('CPIAUCSL', 13);
      const cpiObsPrev12 = cpiObs && cpiObs.length >= 13 ? Number.parseFloat(cpiObs[12].value) : Number.NaN;
      const prevCpi = Number.isFinite(cpiObsPrev12) && cpiObsPrev12 > 0 ? cpiObsPrev12 : null;
      const cpiYoY = cpiValue !== null && prevCpi !== null && prevCpi > 0 ? ((cpiValue - prevCpi) / prevCpi) * 100 : null;

      const gdpValue = Number.isFinite(data.GDPC1?.value) ? data.GDPC1.value : null;
      const gdpObs = await fetchFredObservations('GDPC1', 5);
      const gdpObsPrev4 = gdpObs && gdpObs.length >= 5 ? Number.parseFloat(gdpObs[4].value) : Number.NaN;
      const prevGdp = Number.isFinite(gdpObsPrev4) && gdpObsPrev4 > 0 ? gdpObsPrev4 : null;
      const gdpYoY = gdpValue !== null && prevGdp !== null && prevGdp > 0 ? ((gdpValue - prevGdp) / prevGdp) * 100 : null;

      const dgs10 = Number.isFinite(data.DGS10?.value) ? data.DGS10.value : null;
      const dgs2 = Number.isFinite(data.DGS2?.value) ? data.DGS2.value : null;
      const yieldCurve = dgs10 !== null && dgs2 !== null ? dgs10 - dgs2 : null;

      const gdpTrend = gdpYoY !== null ? (gdpYoY > 2 ? 'EXPANDING' : gdpYoY < 1 ? 'SLOWING' : 'STABLE') : 'UNKNOWN';
      const inflationTrend = cpiYoY !== null ? (cpiYoY > 3 ? 'RISING' : cpiYoY < 2 ? 'FALLING' : 'STABLE') : 'UNKNOWN';

      const unrate = Number.isFinite(data.UNRATE?.value) ? data.UNRATE.value : null;
      const employmentTrend = unrate !== null ? (unrate < 4.5 ? 'STRONG' : 'MODERATE') : 'UNKNOWN';

      const summary = {
          gdp: {
            value: gdpValue,
            trend: gdpTrend,
            lastUpdate: data.GDPC1?.date || '',
          },
          inflation: {
            cpi: cpiValue,
            cpiYoY,
            coreCpi: Number.isFinite(data.CPILFESL?.value) ? data.CPILFESL.value : null,
            pce: Number.isFinite(data.PCEPI?.value) ? data.PCEPI.value : null,
            trend: inflationTrend,
          },
          employment: {
            unemploymentRate: unrate,
            nfp: Number.isFinite(data.PAYEMS?.value) ? data.PAYEMS.value : null,
            initialClaims: Number.isFinite(data.ICSA?.value) ? data.ICSA.value : null,
            trend: employmentTrend,
          },
          rates: {
            fedFunds: Number.isFinite(data.FEDFUNDS?.value) ? data.FEDFUNDS.value : null,
            treasury10y: dgs10,
            treasury2y: dgs2,
            yieldCurve,
            curveStatus:
              yieldCurve === null ? 'UNKNOWN' : yieldCurve < 0 ? 'INVERTED' : yieldCurve < 0.5 ? 'FLAT' : 'NORMAL',
          },
          credit: {
            aaaSpread: Number.isFinite(data.BAMLC0A0CM?.value) ? data.BAMLC0A0CM.value : null,
            hySpread: Number.isFinite(data.BAMLH0A0HYM2?.value) ? data.BAMLH0A0HYM2.value : null,
            condition:
              Number.isFinite(data.BAMLH0A0HYM2?.value) ? (data.BAMLH0A0HYM2.value > 5 ? 'STRESSED' : 'NORMAL') : 'UNKNOWN',
          },
          sentiment: {
            consumerSentiment: Number.isFinite(data.UMCSENT?.value) ? data.UMCSENT.value : null,
            condition:
              Number.isFinite(data.UMCSENT?.value)
                ? data.UMCSENT.value > 80
                  ? 'OPTIMISTIC'
                  : data.UMCSENT.value < 60
                    ? 'PESSIMISTIC'
                    : 'NEUTRAL'
                : 'UNKNOWN',
          },
        };

      const payload: FredPayload = {
        success: true,
        timestamp: new Date().toISOString(),
        data,
        summary,
      };

      lastGoodSnapshot = { payload, timestamp: payload.timestamp };
      return { status: 200, payload, cacheable: true };
    } catch {
      if (lastGoodSnapshot) {
        return {
          status: 200,
          payload: { ...lastGoodSnapshot.payload, timestamp: new Date().toISOString() },
          cacheable: true,
        };
      }
      return {
        status: 500,
        payload: { success: false, timestamp: new Date().toISOString(), error: 'Failed to fetch FRED data' },
        cacheable: false,
      };
    }
  }

  const inFlight = buildSnapshot().finally(() => {
    fredCacheInFlight.delete(cacheKey);
  });

  fredCacheInFlight.set(cacheKey, inFlight);
  const res = await inFlight;
  if (res.cacheable) {
    if (res.payload.success && res.payload.data) {
      fredCache.set(cacheKey, {
        ts: Date.now(),
        snapshot: {
          data: res.payload.data,
          summary: res.payload.summary,
        },
      });
    }
  }

  return { status: res.status, payload: res.payload, cacheable: false, cacheMode: 'MISS' };
}
