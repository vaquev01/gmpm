// src/app/api/market/route.ts
// API COMPLETA com TODOS os 278 ativos do PRD v8.1

import { NextResponse } from 'next/server';
import { serverLog } from '@/lib/serverLogs';
import { yahooFetchJson } from '@/lib/yahooClient';

type QuoteQualityStatus = 'OK' | 'PARTIAL' | 'STALE' | 'SUSPECT';

type QuoteQuality = {
    status: QuoteQualityStatus;
    reasons: string[];
    ageMin?: number;
};

let lastGoodSnapshot: {
    payload: unknown;
    timestamp: string;
} | null = null;

type MarketCacheEntry = {
    ts: number;
    payload: unknown;
};

const marketCache = new Map<string, MarketCacheEntry>();
const marketCacheInFlight = new Map<string, Promise<{ status: number; payload: unknown; cacheable: boolean }>>();
const MARKET_CACHE_TTL_MS = 60_000;
const MARKET_CACHE_STALE_MS = 5 * 60_000;

function summarizeQuality(quotes: QuoteData[]) {
    const summary = quotes.reduce(
        (acc, q) => {
            const s = q.quality?.status || 'PARTIAL';
            acc[s] = (acc[s] || 0) + 1;
            return acc;
        },
        {} as Record<QuoteQualityStatus, number>
    );

    const total = quotes.length || 1;
    const okPct = (summary.OK || 0) / total;
    const suspectPct = (summary.SUSPECT || 0) / total;
    const stalePct = (summary.STALE || 0) / total;

    return { summary, total: quotes.length, okPct, suspectPct, stalePct };
}

// ===== UNIVERSO COMPLETO DE ATIVOS (278 total) =====
const ASSETS = {
    // Forex Majors & Crosses (28)
    forex: [
        'EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'USDCHF=X', 'AUDUSD=X', 'USDCAD=X', 'NZDUSD=X',
        'EURGBP=X', 'EURJPY=X', 'GBPJPY=X', 'AUDJPY=X', 'EURAUD=X', 'EURCHF=X', 'GBPCHF=X',
        'AUDCHF=X', 'CADJPY=X', 'CHFJPY=X', 'NZDJPY=X', 'GBPAUD=X', 'AUDNZD=X', 'EURCAD=X',
        'GBPCAD=X', 'AUDCAD=X', 'NZDCAD=X', 'EURNZD=X', 'GBPNZD=X', 'USDMXN=X', 'USDZAR=X'
    ],

    // Commodities (25)
    commodities: [
        'GC=F',   // Gold
        'SI=F',   // Silver
        'PL=F',   // Platinum
        'PA=F',   // Palladium
        'HG=F',   // Copper
        'CL=F',   // Crude Oil WTI
        'BZ=F',   // Brent
        'NG=F',   // Natural Gas
        'RB=F',   // Gasoline
        'HO=F',   // Heating Oil
        'ZC=F',   // Corn
        'ZW=F',   // Wheat
        'ZS=F',   // Soybeans
        'ZM=F',   // Soybean Meal
        'ZL=F',   // Soybean Oil
        'KC=F',   // Coffee
        'SB=F',   // Sugar
        'CC=F',   // Cocoa
        'CT=F',   // Cotton
        'OJ=F',   // Orange Juice
        'LBS=F',  // Lumber
        'LE=F',   // Live Cattle
        'HE=F',   // Lean Hogs
        'GF=F',   // Feeder Cattle
        'DX=F',   // US Dollar Index
    ],

    // Indices (20)
    indices: [
        '^GSPC',  // S&P 500
        '^DJI',   // Dow Jones
        '^IXIC',  // NASDAQ
        '^RUT',   // Russell 2000
        '^VIX',   // VIX
        '^FTSE',  // FTSE 100
        '^GDAXI', // DAX
        '^FCHI',  // CAC 40
        '^N225',  // Nikkei 225
        '^HSI',   // Hang Seng
        '000001.SS', // Shanghai
        '^STOXX50E', // Euro Stoxx 50
        '^IBEX',  // IBEX 35
        '^BVSP',  // Bovespa
        '^MXX',   // IPC Mexico
        '^AORD',  // ASX 200
        '^KS11',  // KOSPI
        '^TWII',  // Taiwan
        '^TNX',   // 10-Year Treasury
        '^TYX',   // 30-Year Treasury
    ],

    // ETFs (50)
    etfs: [
        // Equity
        'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'IVV', 'VTV', 'VUG', 'VIG',
        // Sector
        'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLU', 'XLP', 'XLY', 'XLB', 'XLRE',
        // International
        'EFA', 'EEM', 'VWO', 'VEA', 'IEMG', 'VGK', 'EWJ', 'FXI', 'EWZ', 'EWG',
        // Fixed Income
        'TLT', 'IEF', 'SHY', 'LQD', 'HYG', 'JNK', 'EMB', 'VCIT', 'BND', 'AGG',
        // Commodities
        'GLD', 'SLV', 'USO', 'UNG', 'DBA', 'DBC', 'PDBC', 'GLDM', 'IAU', 'SGOL',
    ],

    // Crypto (25)
    crypto: [
        'BTC-USD', 'ETH-USD', 'BNB-USD', 'XRP-USD', 'ADA-USD',
        'SOL-USD', 'DOGE-USD', 'DOT-USD', 'AVAX-USD', 'MATIC-USD',
        'LINK-USD', 'UNI-USD', 'ATOM-USD', 'LTC-USD', 'ETC-USD',
        'XLM-USD', 'ALGO-USD', 'VET-USD', 'HBAR-USD', 'FIL-USD',
        'NEAR-USD', 'APT-USD', 'ICP-USD', 'EGLD-USD', 'SAND-USD',
    ],

    // Stocks (100)
    stocks: [
        // Tech
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'INTC', 'CRM',
        'ADBE', 'NFLX', 'PYPL', 'SHOP', 'SQ', 'UBER', 'ABNB', 'SNOW', 'NOW', 'PANW',
        // Finance
        'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'BLK', 'SCHW', 'USB', 'PNC',
        'V', 'MA', 'AXP', 'COF', 'DFS',
        // Healthcare
        'JNJ', 'PFE', 'UNH', 'MRK', 'ABBV', 'TMO', 'ABT', 'LLY', 'BMY', 'AMGN',
        // Consumer
        'WMT', 'HD', 'COST', 'NKE', 'SBUX', 'MCD', 'DIS', 'CMCSA', 'TGT', 'LOW',
        // Industrial
        'CAT', 'DE', 'HON', 'UPS', 'BA', 'GE', 'LMT', 'RTX', 'MMM', 'UNP',
        // Energy
        'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'PXD', 'MPC', 'VLO', 'PSX', 'OXY',
        // Telecom/Utilities
        'T', 'VZ', 'TMUS', 'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE',
        // Materials
        'LIN', 'APD', 'ECL', 'SHW', 'FCX', 'NEM', 'NUE', 'DOW', 'DD', 'PPG',
    ],

    // Volatility (5)
    volatility: [
        '^VIX',   // VIX
        'VXX',    // VIX Short-term
        'UVXY',   // Ultra VIX
        'SVXY',   // Short VIX
        'VIXY',   // VIX ETF
    ],

    // Bonds/Rates (25)
    bonds: [
        '^TNX',   // 10-Year
        '^TYX',   // 30-Year
        '^FVX',   // 5-Year
        '^IRX',   // 13-Week
        'TLT',    // Long Treasury ETF
        'IEF',    // 7-10 Year
        'SHY',    // 1-3 Year
        'TIP',    // TIPS
        'BIL',    // T-Bills
        'GOVT',   // All Treasuries
    ],
};

// CORE SYMBOLS - Fast initial load (most important assets only)
const CORE_SYMBOLS = [
    // Key Forex (8)
    'EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'AUDUSD=X', 'USDCAD=X', 'NZDUSD=X', 'GBPJPY=X', 'EURJPY=X',
    // Key Commodities (6)
    'GC=F', 'SI=F', 'CL=F', 'NG=F', 'HG=F', 'DX=F',
    // Key Indices (6)
    '^GSPC', '^DJI', '^IXIC', '^VIX', '^FTSE', '^N225',
    // Key Crypto (5)
    'BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'ADA-USD',
    // Key Futures (4)
    'ES=F', 'NQ=F', 'YM=F', 'RTY=F',
    // Key Rates (3)
    '^TNX', '^TYX', '^FVX',
];

// Flatten all symbols and deduplicate
const ALL_SYMBOLS = [...new Set([
    ...ASSETS.forex,
    ...ASSETS.commodities,
    ...ASSETS.indices,
    ...ASSETS.etfs,
    ...ASSETS.crypto,
    ...ASSETS.stocks,
    ...ASSETS.volatility,
    ...ASSETS.bonds,
])];

// ===== TYPES =====
interface QuoteData {
    symbol: string;
    displaySymbol: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    avgVolume?: number; // ADDED
    high: number;
    low: number;
    open: number;
    previousClose: number;
    marketState: string;
    assetClass: string;
    name: string;   // ADDED
    sector: string; // ADDED
    // Technical data for scoring
    atr?: number;
    rsi?: number;
    quoteTimestamp?: string;
    history?: number[];
    quality?: QuoteQuality;
}

interface FearGreedData {
    value: number;
    classification: string;
    timestamp: string;
}

interface MacroData {
    vix: number;
    vixChange: number;
    treasury10y: number;
    treasury2y: number;
    treasury30y: number;
    yieldCurve: number;
    dollarIndex: number;
    fearGreed: FearGreedData | null;
}

type YahooMeta = {
    regularMarketPrice?: number;
    previousClose?: number;
    regularMarketTime?: number;
    regularMarketDayHigh?: number;
    regularMarketDayLow?: number;
    regularMarketOpen?: number;
    regularMarketVolume?: number;
    marketState?: string;
    shortName?: string;
    longName?: string;
};

type YahooQuote = {
    open?: Array<number | null>;
    high?: Array<number | null>;
    low?: Array<number | null>;
    close?: Array<number | null>;
    volume?: Array<number | null>;
};

type YahooChartResponse = {
    chart?: {
        result?: Array<{
            meta?: YahooMeta;
            timestamp?: number[];
            indicators?: {
                quote?: YahooQuote[];
            };
        }>;
    };
};

type NextFetchInit = RequestInit & { next?: { revalidate?: number } };

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

// ===== YAHOO FINANCE FETCHER =====
async function fetchYahooQuote(symbol: string): Promise<QuoteData | null> {
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=30d`;

        const y = await yahooFetchJson(url, 60_000, 7000);
        if (!y.ok || !y.data) return null;

        const data = y.data as YahooChartResponse;
        const result = data.chart?.result?.[0];
        if (!result) return null;

        const meta: YahooMeta = result.meta || {};
        const quotes = result.indicators?.quote?.[0];
        if (!quotes?.close) return null;

        const closes = (quotes.close || []).filter((c): c is number => c !== null);
        const highs = (quotes.high || []).filter((h): h is number => h !== null);
        const lows = (quotes.low || []).filter((l): l is number => l !== null);
        // Safely handle volumes, some assets might calculate them differently or be null
        const volumes = (quotes.volume || []).filter((v): v is number => v !== null);

        const currentPriceRaw = closes[closes.length - 1] || meta.regularMarketPrice || 0;
        const previousCloseRaw = meta.previousClose || closes[closes.length - 2] || currentPriceRaw;

        // Yahoo treasury yield tickers are often scaled by 10 (e.g. ^TNX=42.5 => 4.25%),
        // but sometimes can already be expressed in % terms depending on upstream behavior.
        // Heuristic: if value is > 20, treat it as scaled-by-10.
        const yieldScaledSymbols = new Set(['^TNX', '^TYX', '^FVX']);
        const scale = (yieldScaledSymbols.has(symbol) && currentPriceRaw > 20) ? 10 : 1;

        const currentPrice = currentPriceRaw / scale;
        const previousClose = previousCloseRaw / scale;

        const change = currentPrice - previousClose;
        const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;

        // Calculate Avg Volume (20 days)
        let avgVolume = 0;
        if (volumes.length > 0) {
            const lookback = Math.min(volumes.length, 20);
            const recentVolumes = volumes.slice(volumes.length - lookback);
            const sum = recentVolumes.reduce((a: number, b: number) => a + b, 0);
            avgVolume = sum / lookback;
        }

        // Calculate ATR (simplified using last 14 periods)
        let atr = 0;
        if (highs.length >= 14 && lows.length >= 14) {
            const ranges = [];
            for (let i = closes.length - 14; i < closes.length; i++) {
                if (highs[i] && lows[i]) {
                    ranges.push(highs[i] - lows[i]);
                }
            }
            atr = ranges.length > 0 ? ranges.reduce((a, b) => a + b, 0) / ranges.length : 0;
        }

        // Calculate RSI (simplified)
        let rsi = 50;
        if (closes.length >= 15) {
            const gains = [];
            const losses = [];
            for (let i = closes.length - 14; i < closes.length; i++) {
                const diff = closes[i] - closes[i - 1];
                if (diff > 0) gains.push(diff);
                else losses.push(Math.abs(diff));
            }
            const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / 14 : 0;
            const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / 14 : 0.001;
            const rs = avgGain / avgLoss;
            rsi = 100 - (100 / (1 + rs));
        }

        const history = closes.slice(-20).map((c: number) => c / scale);
        const quoteTimestamp = (typeof meta.regularMarketTime === 'number')
            ? new Date(meta.regularMarketTime * 1000).toISOString()
            : undefined;

        // Determine asset class
        let assetClass = 'stock';
        if (symbol.includes('-USD')) assetClass = 'crypto';
        else if (symbol.includes('=X')) assetClass = 'forex';
        else if (symbol.includes('=F')) assetClass = 'commodity';
        else if (symbol.startsWith('^')) assetClass = 'index';
        else if (ASSETS.etfs.includes(symbol)) assetClass = 'etf';
        else if (ASSETS.bonds.includes(symbol)) assetClass = 'bond';

        const sessionBound = assetClass === 'stock' || assetClass === 'etf' || assetClass === 'index' || assetClass === 'bond';
        const marketState = (meta.marketState ? String(meta.marketState) : '').toUpperCase();

        let ageMin: number | undefined;
        if (quoteTimestamp) {
            const t = new Date(quoteTimestamp).getTime();
            if (Number.isFinite(t)) ageMin = Math.max(0, Math.round((Date.now() - t) / 60000));
        }

        const reasons: string[] = [];
        if (!Number.isFinite(currentPrice) || currentPrice <= 0) reasons.push('BAD_PRICE');
        if (!Number.isFinite(previousClose) || previousClose <= 0) reasons.push('BAD_PREV_CLOSE');
        if (!Number.isFinite(changePercent)) reasons.push('BAD_CHANGE');
        if (!Number.isFinite((meta.regularMarketDayHigh || 0)) || !Number.isFinite((meta.regularMarketDayLow || 0))) reasons.push('BAD_HILO');
        if (history.length < 8) reasons.push('SHORT_HISTORY');
        if (!quoteTimestamp) reasons.push('NO_QUOTE_TIMESTAMP');

        const dayHigh = (meta.regularMarketDayHigh || currentPriceRaw) / scale;
        const dayLow = (meta.regularMarketDayLow || currentPriceRaw) / scale;
        if (Number.isFinite(dayHigh) && Number.isFinite(dayLow) && dayHigh > 0 && dayLow > 0) {
            if (dayHigh < dayLow) reasons.push('INVALID_RANGE');
            // Price should typically lie within [low, high], allow small tolerance.
            const tol = currentPrice * 0.03;
            if (currentPrice > dayHigh + tol || currentPrice < dayLow - tol) reasons.push('PRICE_OUTSIDE_RANGE');
        }

        const absChg = Math.abs(changePercent);
        const outlierThreshold = assetClass === 'crypto' ? 60 : assetClass === 'forex' ? 10 : assetClass === 'commodity' ? 25 : 35;
        if (absChg > outlierThreshold) reasons.push('OUTLIER_CHANGE');

        if (sessionBound) {
            if (ageMin !== undefined && ageMin > 360) reasons.push('STALE');
            if (marketState && marketState !== 'REGULAR') reasons.push(`MARKET_STATE_${marketState}`);
        }

        let status: QuoteQualityStatus = 'OK';
        if (reasons.length === 0) status = 'OK';
        else if (reasons.includes('OUTLIER_CHANGE') || reasons.includes('BAD_PRICE') || reasons.includes('BAD_PREV_CLOSE') || reasons.includes('BAD_CHANGE')) status = 'SUSPECT';
        else if (reasons.includes('STALE') || reasons.some(r => r.startsWith('MARKET_STATE_'))) status = 'STALE';
        else status = 'PARTIAL';

        const quality: QuoteQuality = {
            status,
            reasons,
            ageMin,
        };

        const displaySymbol = symbol
            .replace('=X', '')
            .replace('-USD', '')
            .replace('=F', '')
            .replace('^', '');

        return {
            symbol,
            displaySymbol,
            name: meta.shortName || meta.longName || displaySymbol, // ADDED: Name
            sector: assetClass.toUpperCase(), // ADDED: Sector proxy (Asset Class for now)
            price: currentPrice,
            change,
            changePercent,
            volume: meta.regularMarketVolume || 0,
            avgVolume, // ADDED: AvgVolume
            high: dayHigh,
            low: dayLow,
            open: (meta.regularMarketOpen || previousCloseRaw) / scale,
            previousClose,
            marketState: meta.marketState || 'UNKNOWN',
            assetClass,
            atr,
            rsi,
            quoteTimestamp,
            history,
            quality,
        };
    } catch {
        return null;
    }
}

// ===== FEAR & GREED INDEX =====
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

// ===== MAIN API HANDLER =====
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '0', 10);
    const assetClass = searchParams.get('class');
    const category = searchParams.get('category');
    const symbolsParam = searchParams.get('symbols');
    const macroParam = searchParams.get('macro');
    const includeMacro = macroParam === '1' || macroParam === 'true';

    const cacheKey = JSON.stringify({ limit, assetClass, category, symbolsParam, includeMacro });
    const cached = marketCache.get(cacheKey);
    const now = Date.now();
    if (cached && (now - cached.ts) < MARKET_CACHE_TTL_MS) {
        const payload = cached.payload as Record<string, unknown>;
        return NextResponse.json({
            ...payload,
            cached: true,
            cacheAge: now - cached.ts,
            cacheMode: 'HIT',
        });
    }

    if (cached && (now - cached.ts) < MARKET_CACHE_STALE_MS) {
        if (!marketCacheInFlight.has(cacheKey)) {
            const inFlight = (async () => {
                const res = await buildSnapshot();
                if (res.cacheable) {
                    marketCache.set(cacheKey, { ts: Date.now(), payload: res.payload });
                }
                return res;
            })()
                .finally(() => {
                    marketCacheInFlight.delete(cacheKey);
                });
            marketCacheInFlight.set(cacheKey, inFlight);
        }

        const payload = cached.payload as Record<string, unknown>;
        return NextResponse.json({
            ...payload,
            cached: true,
            cacheAge: now - cached.ts,
            cacheMode: 'STALE',
        });
    }

    const existing = marketCacheInFlight.get(cacheKey);
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
            // ignore and rebuild
        }
    }

    const CLASS_TO_CATEGORY: Record<string, keyof typeof ASSETS> = {
        stock: 'stocks',
        etf: 'etfs',
        forex: 'forex',
        crypto: 'crypto',
        commodity: 'commodities',
        index: 'indices',
        bond: 'bonds',
    };

    async function buildSnapshot(): Promise<{ status: number; payload: unknown; cacheable: boolean }> {
        const macroSymbols = includeMacro ? ['^VIX', '^TNX', '^TYX', '^FVX', 'DX=F'] : [];

        // Default to CORE_SYMBOLS for fast initial load (32 assets vs 278)
        let symbolsToFetch = CORE_SYMBOLS;

        if (symbolsParam && symbolsParam.trim().length > 0) {
            const requested = symbolsParam
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            if (requested.length > 0) {
                symbolsToFetch = requested;
            }
        }

        if (!symbolsParam && category && category in ASSETS) {
            symbolsToFetch = ASSETS[category as keyof typeof ASSETS];
        } else if (!symbolsParam && assetClass && assetClass in CLASS_TO_CATEGORY) {
            const mapped = CLASS_TO_CATEGORY[assetClass];
            symbolsToFetch = ASSETS[mapped];
        }

        // If limit is specified, use ALL_SYMBOLS and slice
        if (!symbolsParam && !category && !assetClass && limit > 0) {
            symbolsToFetch = ALL_SYMBOLS.slice(0, limit);
        }

        // Always include core macro context symbols even when limit/category is used
        if (macroSymbols.length > 0) {
            symbolsToFetch = Array.from(new Set([...symbolsToFetch, ...macroSymbols]));
        }

        // Fetch all symbols and rely on yahooClient's concurrency queue.
        // This avoids slow outliers stalling an entire batch.
        const results = await Promise.all(symbolsToFetch.map(fetchYahooQuote));
        const allQuotes: QuoteData[] = results.filter((q): q is QuoteData => q !== null);

        const requestedCount = symbolsToFetch.length;
        const coverage = requestedCount > 0 ? (allQuotes.length / requestedCount) : 0;
        const degraded = coverage < 0.6;

        const { summary: qualitySummary } = summarizeQuality(allQuotes);

        const grouped = allQuotes.reduce((acc, q) => {
            (acc[q.assetClass] ||= []).push(q);
            return acc;
        }, {} as Record<string, QuoteData[]>);

        const tradeEnabledByClass: Record<string, boolean> = {};
        const tradeDisabledReasonByClass: Record<string, string | null> = {};

        const sessionBoundClasses = new Set(['stock', 'etf', 'index', 'bond']);
        const allClasses = ['stock', 'etf', 'index', 'bond', 'crypto', 'forex', 'commodity'];

        for (const cls of allClasses) {
            const quotes = grouped[cls] || [];
            if (degraded) {
                tradeEnabledByClass[cls] = false;
                tradeDisabledReasonByClass[cls] = 'DEGRADED_COVERAGE';
                continue;
            }
            if (quotes.length === 0) {
                tradeEnabledByClass[cls] = false;
                tradeDisabledReasonByClass[cls] = 'NO_QUOTES';
                continue;
            }

            const { okPct, suspectPct, stalePct } = summarizeQuality(quotes);

            // Base fail-closed thresholds
            if (suspectPct > 0.05) {
                tradeEnabledByClass[cls] = false;
                tradeDisabledReasonByClass[cls] = 'TOO_MANY_SUSPECT_QUOTES';
                continue;
            }
            if (okPct < 0.6) {
                tradeEnabledByClass[cls] = false;
                tradeDisabledReasonByClass[cls] = 'INSUFFICIENT_OK_QUOTES';
                continue;
            }

            // Session-bound markets: if many are stale, treat as market closed / not safe.
            if (sessionBoundClasses.has(cls) && stalePct > 0.05) {
                tradeEnabledByClass[cls] = false;
                tradeDisabledReasonByClass[cls] = 'MARKET_CLOSED_OR_STALE';
                continue;
            }

            // Always-on markets tolerate some STALE.
            tradeEnabledByClass[cls] = true;
            tradeDisabledReasonByClass[cls] = null;
        }

        const anyEnabled = Object.values(tradeEnabledByClass).some(Boolean);
        const tradeEnabled = !degraded && anyEnabled;
        const tradeDisabledReason = degraded
            ? 'DEGRADED_COVERAGE'
            : anyEnabled
                ? null
                : 'NO_TRADEABLE_CLASSES';

        // Get macro data
        const vixQuote = allQuotes.find(q => q.symbol === '^VIX');
        const treas10y = allQuotes.find(q => q.symbol === '^TNX');
        const treas30y = allQuotes.find(q => q.symbol === '^TYX');
        const treas5y = allQuotes.find(q => q.symbol === '^FVX');
        const dxy = allQuotes.find(q => q.symbol === 'DX=F');
        let fearGreed: FearGreedData | null = null;
        let treasury10y = treas10y?.price || 0;
        let treasury2y = treas5y?.price || 0;
        let yieldCurve = (treas10y?.price && treas5y?.price) ? (treas10y.price - treas5y.price) : 0;

        if (includeMacro) {
            fearGreed = await fetchFearGreed();

            // Prefer real FRED yields when available (more accurate than Yahoo proxies)
            const [fred10y, fred2y] = await Promise.all([
                fetchFredLatest('DGS10'),
                fetchFredLatest('DGS2'),
            ]);

            treasury10y = (fred10y !== null) ? fred10y : treasury10y;
            treasury2y = (fred2y !== null) ? fred2y : treasury2y;
            if (fred10y !== null && fred2y !== null) yieldCurve = fred10y - fred2y;
        }

        const macro: MacroData = {
            vix: vixQuote?.price || 0,
            vixChange: vixQuote?.changePercent || 0,
            treasury10y,
            treasury2y,
            treasury30y: treas30y?.price || 0,
            yieldCurve,
            dollarIndex: dxy?.price || 0,
            fearGreed,
        };

        // Separate by class
        const byClass = {
            stocks: allQuotes.filter(q => q.assetClass === 'stock'),
            etfs: allQuotes.filter(q => q.assetClass === 'etf'),
            forex: allQuotes.filter(q => q.assetClass === 'forex'),
            crypto: allQuotes.filter(q => q.assetClass === 'crypto'),
            commodities: allQuotes.filter(q => q.assetClass === 'commodity'),
            indices: allQuotes.filter(q => q.assetClass === 'index'),
            bonds: allQuotes.filter(q => q.assetClass === 'bond'),
        };

        // Statistics
        const stats = {
            totalAssets: allQuotes.length,
            gainers: allQuotes.filter(q => q.changePercent > 0).length,
            losers: allQuotes.filter(q => q.changePercent < 0).length,
            avgChange: allQuotes.reduce((sum, q) => sum + q.changePercent, 0) / allQuotes.length,
        };

        const payload = {
            success: true,
            timestamp: new Date().toISOString(),
            degraded,
            tradeEnabled,
            tradeDisabledReason,
            requestedCount,
            coverage: Number.isFinite(coverage) ? Math.round(coverage * 1000) / 1000 : 0,
            count: allQuotes.length,
            qualitySummary,
            tradeEnabledByClass,
            tradeDisabledReasonByClass,
            stats,
            macro,
            assets: allQuotes,
            data: allQuotes,
            byClass,
        };

        serverLog(
            degraded || !tradeEnabled ? 'warn' : 'info',
            'market_snapshot',
            {
                degraded,
                tradeEnabled,
                tradeDisabledReason,
                requestedCount: payload.requestedCount,
                count: payload.count,
                coverage: payload.coverage,
                qualitySummary: payload.qualitySummary,
                tradeEnabledByClass: payload.tradeEnabledByClass,
            },
            'api/market'
        );

        if (!degraded && allQuotes.length > 0) {
            lastGoodSnapshot = { payload, timestamp: payload.timestamp };
        }

        if (degraded && lastGoodSnapshot) {
            serverLog('warn', 'market_snapshot_fallback', { reason: 'DEGRADED_FALLBACK', requestedCount, count: allQuotes.length, coverage }, 'api/market');
            const last = lastGoodSnapshot.payload as Record<string, unknown>;
            return {
                status: 200,
                cacheable: true,
                payload: {
                ...last,
                degraded: true,
                tradeEnabled: false,
                tradeDisabledReason: 'DEGRADED_FALLBACK',
                tradeEnabledByClass: {},
                tradeDisabledReasonByClass: {},
                fallback: true,
                fallbackTimestamp: lastGoodSnapshot.timestamp,
                },
            };
        }

        return { status: 200, payload, cacheable: true };
    }

    const inFlight = (async () => {
        try {
            return await buildSnapshot();
        } catch (error) {
        serverLog('error', 'market_api_error', { error: String(error) }, 'api/market');

        if (lastGoodSnapshot) {
            serverLog('warn', 'market_snapshot_degraded', { error: String(error) }, 'api/market');
            const last = lastGoodSnapshot.payload as Record<string, unknown>;
            return {
                status: 200,
                cacheable: true,
                payload: {
                ...last,
                degraded: true,
                tradeEnabled: false,
                tradeDisabledReason: 'DEGRADED_FALLBACK',
                tradeEnabledByClass: {},
                tradeDisabledReasonByClass: {},
                fallback: true,
                fallbackTimestamp: lastGoodSnapshot.timestamp,
                },
            };
        }

            return { status: 500, payload: { success: false, error: 'Failed to fetch market data' }, cacheable: false };
        }
    })()
        .finally(() => {
            marketCacheInFlight.delete(cacheKey);
        });

    marketCacheInFlight.set(cacheKey, inFlight);
    const res = await inFlight;

    if (res.cacheable) {
        marketCache.set(cacheKey, { ts: Date.now(), payload: res.payload });
    }

    return NextResponse.json(
        {
            ...(res.payload as Record<string, unknown>),
            cacheMode: 'MISS',
        },
        { status: res.status }
    );
}
