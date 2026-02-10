import { NextResponse } from 'next/server';
import { serverLog } from '@/lib/serverLogs';
import { yahooFetchJson } from '@/lib/yahooClient';

type NextFetchInit = RequestInit & { next?: { revalidate?: number } };

type FearGreedData = {
    value: number;
    classification: string;
    timestamp: string;
};

type MacroData = {
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

type MacroCacheEntry = {
    ts: number;
    payload: unknown;
};

const macroCache = new Map<string, MacroCacheEntry>();
const macroCacheInFlight = new Map<string, Promise<{ status: number; payload: unknown; cacheable: boolean }>>();
const MACRO_CACHE_TTL_MS = 120_000;      // 2 min fresh
const MACRO_CACHE_STALE_MS = 15 * 60_000; // 15 min stale-while-revalidate

let lastGoodSnapshot: { payload: unknown; timestamp: string } | null = null;

async function fetchWithTimeout(input: string, init: NextFetchInit, timeoutMs: number) {
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
        const res = await fetchWithTimeout(url, { next: { revalidate: 300 } }, 4500);
        if (!res.ok) return null;

        const json = await res.json();
        const v = json?.observations?.[0]?.value;
        const n = typeof v === 'string' ? Number.parseFloat(v) : Number.NaN;
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

async function fetchFearGreed(): Promise<FearGreedData | null> {
    try {
        const response = await fetchWithTimeout(
            'https://api.alternative.me/fng/?limit=1',
            { next: { revalidate: 3600 } },
            3500
        );
        if (!response.ok) return null;

        const data = await response.json();
        const fng = data.data?.[0];
        if (!fng) return null;

        return {
            value: parseInt(fng.value),
            classification: fng.value_classification,
            timestamp: new Date(parseInt(fng.timestamp) * 1000).toISOString(),
        };
    } catch {
        return null;
    }
}

type YahooMeta = {
    regularMarketPrice?: number;
    previousClose?: number;
    regularMarketTime?: number;
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
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=10d`;
        const y = await yahooFetchJson(url, 60_000, 7000);
        if (!y.ok || !y.data) return null;

        const data = y.data as YahooChartResponse;
        const result = data.chart?.result?.[0];
        if (!result) return null;

        const meta: YahooMeta = result.meta || {};
        const quotes = result.indicators?.quote?.[0];
        if (!quotes?.close) return null;

        const closes = (quotes.close || []).filter((c): c is number => c !== null);
        const currentPriceRaw = closes[closes.length - 1] || meta.regularMarketPrice || 0;
        const previousCloseRaw = meta.previousClose || closes[closes.length - 2] || currentPriceRaw;

        const yieldScaledSymbols = new Set(['^TNX', '^TYX', '^FVX']);
        const scale = (yieldScaledSymbols.has(symbol) && currentPriceRaw > 20) ? 10 : 1;

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

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const noCache = searchParams.get('nocache') === '1';

    const cacheKey = 'macro_v1';
    const cached = noCache ? null : macroCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.ts) < MACRO_CACHE_TTL_MS) {
        const payload = cached.payload as Record<string, unknown>;
        return NextResponse.json({
            ...payload,
            cached: true,
            cacheAge: now - cached.ts,
            cacheMode: 'HIT',
        });
    }

    if (cached && (now - cached.ts) < MACRO_CACHE_STALE_MS) {
        if (!macroCacheInFlight.has(cacheKey)) {
            const inFlight = (async () => {
                const res = await buildSnapshot();
                if (res.cacheable) {
                    macroCache.set(cacheKey, { ts: Date.now(), payload: res.payload });
                }
                return res;
            })().finally(() => {
                macroCacheInFlight.delete(cacheKey);
            });
            macroCacheInFlight.set(cacheKey, inFlight);
        }

        const payload = cached.payload as Record<string, unknown>;
        return NextResponse.json({
            ...payload,
            cached: true,
            cacheAge: now - cached.ts,
            cacheMode: 'STALE',
        });
    }

    const existing = macroCacheInFlight.get(cacheKey);
    if (existing) {
        try {
            const res = await existing;
            return NextResponse.json(
                {
                    ...(res.payload as Record<string, unknown>),
                    cached: true,
                    cacheAge: 0,
                    cacheMode: 'INFLIGHT',
                },
                { status: res.status }
            );
        } catch {
            // ignore
        }
    }

    async function buildSnapshot(): Promise<{ status: number; payload: unknown; cacheable: boolean }> {
        try {
            const macroSymbols = ['^VIX', '^TNX', '^TYX', '^FVX', 'DX=F'];
            const [vix, t10y, t30y, t5y, dxy] = await Promise.all(macroSymbols.map(fetchMacroQuote));

            const [fearGreed, fred10y, fred2y] = await Promise.all([
                fetchFearGreed(),
                fetchFredLatest('DGS10'),
                fetchFredLatest('DGS2'),
            ]);

            const treasury10y = (fred10y !== null) ? fred10y : (t10y?.price || 0);
            const treasury2y = (fred2y !== null) ? fred2y : (t5y?.price || 0);
            const yieldCurve = (treasury10y && treasury2y) ? (treasury10y - treasury2y) : 0;

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

            const payload = {
                success: true,
                timestamp: new Date().toISOString(),
                macro,
            };

            if (macro.vix > 0) {
                lastGoodSnapshot = { payload, timestamp: payload.timestamp };
            }

            return { status: 200, payload, cacheable: true };
        } catch (error) {
            serverLog('error', 'macro_api_error', { error: String(error) }, 'api/macro');

            if (lastGoodSnapshot) {
                const last = lastGoodSnapshot.payload as Record<string, unknown>;
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

    const inFlight = (async () => {
        return await buildSnapshot();
    })().finally(() => {
        macroCacheInFlight.delete(cacheKey);
    });

    macroCacheInFlight.set(cacheKey, inFlight);
    const res = await inFlight;

    if (res.cacheable) {
        macroCache.set(cacheKey, { ts: Date.now(), payload: res.payload });
    }

    return NextResponse.json(
        {
            ...(res.payload as Record<string, unknown>),
            cacheMode: 'MISS',
        },
        { status: res.status }
    );
}
