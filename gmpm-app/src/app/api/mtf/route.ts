import { NextResponse } from 'next/server';
import { yahooFetchJson } from '@/lib/yahooClient';
import { serverLog } from '@/lib/serverLogs';

// ===== MULTI-TIMEFRAME ANALYSIS API =====
// Fetches candles in multiple timeframes for confluence analysis

interface CandleData {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface TimeframeAnalysis {
    timeframe: string;
    trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    strength: number; // 0-100
    keyLevels: {
        resistance: number[];
        support: number[];
    };
    structure: {
        higherHighs: boolean;
        higherLows: boolean;
        lowerHighs: boolean;
        lowerLows: boolean;
    };
    candles: CandleData[];
}

interface MTFResult {
    symbol: string;
    timeframes: Record<string, TimeframeAnalysis>;
    confluence: {
        score: number; // 0-100
        bias: 'LONG' | 'SHORT' | 'NEUTRAL';
        aligned: boolean;
        description: string;
    };
}

type YahooChartResponse = {
    chart?: {
        result?: Array<{
            timestamp?: number[];
            indicators?: {
                quote?: Array<{
                    open?: Array<number | null>;
                    high?: Array<number | null>;
                    low?: Array<number | null>;
                    close?: Array<number | null>;
                    volume?: Array<number | null>;
                }>;
            };
        }>;
    };
};

// Timeframe intervals for Yahoo Finance
const INTERVALS: Record<string, { interval: string; range: string }> = {
    '1D': { interval: '1d', range: '3mo' },
    '4H': { interval: '1h', range: '1mo' }, // Yahoo doesn't have 4h, we'll aggregate
    '1H': { interval: '1h', range: '5d' },
    '15M': { interval: '15m', range: '5d' },
};

type MtfCacheEntry = {
    ts: number;
    payload: unknown;
};

const mtfCache = new Map<string, MtfCacheEntry>();
const MTF_CACHE_TTL_MS = 30_000;

// Aggregate 1h candles to 4h
function aggregateTo4H(candles: CandleData[]): CandleData[] {
    const aggregated: CandleData[] = [];
    for (let i = 0; i < candles.length; i += 4) {
        const slice = candles.slice(i, Math.min(i + 4, candles.length));
        if (slice.length > 0) {
            aggregated.push({
                timestamp: slice[0].timestamp,
                open: slice[0].open,
                high: Math.max(...slice.map(c => c.high)),
                low: Math.min(...slice.map(c => c.low)),
                close: slice[slice.length - 1].close,
                volume: slice.reduce((sum, c) => sum + c.volume, 0),
            });
        }
    }
    return aggregated;
}

// Fetch candles from Yahoo Finance
async function fetchCandles(symbol: string, interval: string, range: string): Promise<CandleData[]> {
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
        const ttlMs = interval === '1d' ? 60_000 : 30_000;
        const y = await yahooFetchJson(url, ttlMs);
        if (!y.ok || !y.data) {
            if (y.status) {
                serverLog('warn', 'mtf_yahoo_fetch_failed', { symbol, interval, range, status: y.status, cached: y.cached, stale: y.stale }, 'api/mtf');
            }
            return [];
        }

        const data = y.data as YahooChartResponse;
        const result = data.chart?.result?.[0];

        if (!result || !result.timestamp) return [];

        const timestamps = result.timestamp;
        const quote = result.indicators?.quote?.[0];

        if (!quote) return [];

        const open = quote.open || [];
        const high = quote.high || [];
        const low = quote.low || [];
        const close = quote.close || [];
        const volume = quote.volume || [];

        const coalesceNum = (v: number | null | undefined, fallback: number) => (v == null ? fallback : v);
        const coalesceVol = (v: number | null | undefined) => (v == null ? 0 : v);

        const candles: CandleData[] = [];
        for (let i = 0; i < timestamps.length; i++) {
            const o = open[i];
            const c = close[i];
            if (o != null && c != null) {
                const h = coalesceNum(high[i], o);
                const l = coalesceNum(low[i], o);
                const v = coalesceVol(volume[i]);
                candles.push({
                    timestamp: timestamps[i] * 1000,
                    open: o,
                    high: h,
                    low: l,
                    close: c,
                    volume: v,
                });
            }
        }

        return candles;
    } catch (error) {
        serverLog('warn', 'mtf_yahoo_fetch_error', { symbol, interval, range, error: String(error) }, 'api/mtf');
        return [];
    }
}

// Analyze a single timeframe
function analyzeTimeframe(candles: CandleData[], tfName: string): TimeframeAnalysis {
    if (candles.length < 5) {
        return {
            timeframe: tfName,
            trend: 'NEUTRAL',
            strength: 50,
            keyLevels: { resistance: [], support: [] },
            structure: { higherHighs: false, higherLows: false, lowerHighs: false, lowerLows: false },
            candles: [],
        };
    }

    const recent = candles.slice(-20); // Last 20 candles
    const last = recent[recent.length - 1];
    const first = recent[0];

    // Trend determination
    const priceChange = ((last.close - first.close) / first.close) * 100;
    let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (priceChange > 1) trend = 'BULLISH';
    else if (priceChange < -1) trend = 'BEARISH';

    // Trend strength based on consistency
    let bullishCandles = 0;
    let bearishCandles = 0;
    recent.forEach(c => {
        if (c.close > c.open) bullishCandles++;
        else if (c.close < c.open) bearishCandles++;
    });
    const strength = Math.round((Math.max(bullishCandles, bearishCandles) / recent.length) * 100);

    // Structure analysis (Higher Highs, Higher Lows, etc.)
    const highs = recent.map(c => c.high);
    const lows = recent.map(c => c.low);

    const lastHighs = highs.slice(-5);
    const lastLows = lows.slice(-5);

    const higherHighs = lastHighs.every((h, i) => i === 0 || h >= lastHighs[i - 1]);
    const higherLows = lastLows.every((l, i) => i === 0 || l >= lastLows[i - 1]);
    const lowerHighs = lastHighs.every((h, i) => i === 0 || h <= lastHighs[i - 1]);
    const lowerLows = lastLows.every((l, i) => i === 0 || l <= lastLows[i - 1]);

    // Key levels (swing highs/lows)
    const resistance: number[] = [];
    const support: number[] = [];

    for (let i = 2; i < recent.length - 2; i++) {
        const isSwingHigh = recent[i].high > recent[i - 1].high && recent[i].high > recent[i - 2].high &&
            recent[i].high > recent[i + 1].high && recent[i].high > recent[i + 2].high;
        const isSwingLow = recent[i].low < recent[i - 1].low && recent[i].low < recent[i - 2].low &&
            recent[i].low < recent[i + 1].low && recent[i].low < recent[i + 2].low;

        if (isSwingHigh) resistance.push(recent[i].high);
        if (isSwingLow) support.push(recent[i].low);
    }

    return {
        timeframe: tfName,
        trend,
        strength,
        keyLevels: {
            resistance: resistance.slice(-3),
            support: support.slice(-3),
        },
        structure: { higherHighs, higherLows, lowerHighs, lowerLows },
        candles: candles.slice(-50), // Return last 50 candles
    };
}

// Calculate MTF confluence
function calculateConfluence(timeframes: Record<string, TimeframeAnalysis>): MTFResult['confluence'] {
    const trends = Object.values(timeframes).map(tf => tf.trend);
    const strengths = Object.values(timeframes).map(tf => tf.strength);

    const bullishCount = trends.filter(t => t === 'BULLISH').length;
    const bearishCount = trends.filter(t => t === 'BEARISH').length;
    const totalTFs = trends.length;

    // Weighted confluence (higher TFs matter more)
    const weights = { '1D': 4, '4H': 3, '1H': 2, '15M': 1 };
    let weightedBullish = 0;
    let weightedBearish = 0;
    let totalWeight = 0;

    Object.entries(timeframes).forEach(([tf, analysis]) => {
        const weight = weights[tf as keyof typeof weights] || 1;
        totalWeight += weight;
        if (analysis.trend === 'BULLISH') weightedBullish += weight;
        else if (analysis.trend === 'BEARISH') weightedBearish += weight;
    });

    const alignedThreshold = totalTFs - 1; // Allow 1 dissent
    const aligned = bullishCount >= alignedThreshold || bearishCount >= alignedThreshold;

    let bias: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
    if (weightedBullish > weightedBearish * 1.5) bias = 'LONG';
    else if (weightedBearish > weightedBullish * 1.5) bias = 'SHORT';

    // Confluence score
    const biasStrength = Math.abs(weightedBullish - weightedBearish) / totalWeight;
    const avgStrength = strengths.reduce((a, b) => a + b, 0) / strengths.length;
    const score = Math.round((biasStrength * 60) + (avgStrength * 0.4));

    // Description
    let description = '';
    if (aligned && bias !== 'NEUTRAL') {
        description = `Strong ${bias} confluence: ${bullishCount > bearishCount ? bullishCount : bearishCount}/${totalTFs} timeframes aligned`;
    } else if (bias !== 'NEUTRAL') {
        description = `Moderate ${bias} bias: Higher TFs favor ${bias === 'LONG' ? 'bulls' : 'bears'}`;
    } else {
        description = `Mixed signals: ${bullishCount} bullish, ${bearishCount} bearish, ${totalTFs - bullishCount - bearishCount} neutral`;
    }

    return { score, bias, aligned, description };
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'AAPL';
    const lite = searchParams.get('lite') === '1';

    const cacheKey = `${symbol}|${lite ? 'lite' : 'full'}`;
    const cached = mtfCache.get(cacheKey);
    const now = Date.now();
    if (cached && (now - cached.ts) < MTF_CACHE_TTL_MS) {
        return NextResponse.json({
            success: true,
            cached: true,
            cacheAge: now - cached.ts,
            data: cached.payload,
        });
    }

    try {
        const timeframes: Record<string, TimeframeAnalysis> = {};

        // Fetch 1D
        const dailyCandles = await fetchCandles(symbol, INTERVALS['1D'].interval, INTERVALS['1D'].range);
        timeframes['1D'] = analyzeTimeframe(dailyCandles, '1D');

        // Fetch 1H once and reuse for 4H aggregation + 1H analysis
        const hourlyCandles1M = await fetchCandles(symbol, '1h', '1mo');
        timeframes['4H'] = analyzeTimeframe(aggregateTo4H(hourlyCandles1M), '4H');
        timeframes['1H'] = analyzeTimeframe(hourlyCandles1M, '1H');

        // Fetch 15M (optional)
        if (lite) {
            timeframes['15M'] = analyzeTimeframe([], '15M');
        } else {
            const m15Candles = await fetchCandles(symbol, INTERVALS['15M'].interval, INTERVALS['15M'].range);
            timeframes['15M'] = analyzeTimeframe(m15Candles, '15M');
        }

        // Calculate confluence
        const confluence = calculateConfluence(timeframes);

        const result: MTFResult = {
            symbol,
            timeframes,
            confluence,
        };

        const payload = {
            success: true,
            data: result,
            degraded: Object.values(timeframes).some(tf => tf.candles.length === 0),
        };

        mtfCache.set(cacheKey, { ts: now, payload: result });
        return NextResponse.json(payload);

    } catch (error) {
        serverLog('error', 'mtf_api_error', { error: String(error) }, 'api/mtf');
        return NextResponse.json({
            success: true,
            degraded: true,
            data: {
                symbol,
                timeframes: {
                    '1D': analyzeTimeframe([], '1D'),
                    '4H': analyzeTimeframe([], '4H'),
                    '1H': analyzeTimeframe([], '1H'),
                    '15M': analyzeTimeframe([], '15M'),
                },
                confluence: { score: 50, bias: 'NEUTRAL', aligned: false, description: 'Degraded: no data' },
            },
        });
    }
}
