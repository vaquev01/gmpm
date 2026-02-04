import { NextResponse } from 'next/server';
import { yahooFetchJson } from '@/lib/yahooClient';
import { serverLog } from '@/lib/serverLogs';

// ===== HISTORICAL DATA API =====
// Fetches historical candles for backtesting

interface HistoricalCandle {
    date: string;
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    changePercent: number;
}

interface HistoricalData {
    symbol: string;
    period: string;
    candles: HistoricalCandle[];
    stats: {
        totalDays: number;
        startDate: string;
        endDate: string;
        startPrice: number;
        endPrice: number;
        totalReturn: number;
        annualizedReturn: number;
        volatility: number;
        maxDrawdown: number;
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

// Period to Yahoo Finance range mapping
const PERIOD_MAP: Record<string, { range: string; interval: string }> = {
    '1M': { range: '1mo', interval: '1d' },
    '3M': { range: '3mo', interval: '1d' },
    '6M': { range: '6mo', interval: '1d' },
    '1Y': { range: '1y', interval: '1d' },
    '2Y': { range: '2y', interval: '1d' },
    '5Y': { range: '5y', interval: '1wk' },
};

// Calculate max drawdown
function calculateMaxDrawdown(prices: number[]): number {
    let maxDD = 0;
    let peak = prices[0];

    for (const price of prices) {
        if (price > peak) peak = price;
        const dd = (peak - price) / peak;
        if (dd > maxDD) maxDD = dd;
    }

    return maxDD * 100;
}

// Calculate annualized volatility
function calculateVolatility(returns: number[]): number {
    if (returns.length < 2) return 0;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    const dailyVol = Math.sqrt(variance);

    return dailyVol * Math.sqrt(252) * 100; // Annualized
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'SPY';
    const period = searchParams.get('period') || '6M';

    const periodConfig = PERIOD_MAP[period] || PERIOD_MAP['6M'];

    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${periodConfig.interval}&range=${periodConfig.range}`;

        const y = await yahooFetchJson(url, 300_000);
        if (!y.ok || !y.data) {
            serverLog('warn', 'history_yahoo_fetch_failed', { symbol, period, status: y.status, cached: y.cached, stale: y.stale }, 'api/history');
            return NextResponse.json({
                success: false,
                error: `Failed to fetch data for ${symbol}`,
            }, { status: 500 });
        }

        const data = y.data as YahooChartResponse;
        const result = data.chart?.result?.[0];

        if (!result || !result.timestamp) {
            return NextResponse.json({
                success: false,
                error: 'No data found',
            }, { status: 404 });
        }

        const timestamps = result.timestamp;
        const quote = result.indicators?.quote?.[0];

        if (!quote) {
            return NextResponse.json({
                success: false,
                error: 'No quote data',
            }, { status: 404 });
        }

        const candles: HistoricalCandle[] = [];
        const closes: number[] = [];
        const returns: number[] = [];

        const open = quote.open || [];
        const high = quote.high || [];
        const low = quote.low || [];
        const close = quote.close || [];
        const volume = quote.volume || [];

        const coalesceNum = (v: number | null | undefined, fallback: number) => (v == null ? fallback : v);
        const coalesceVol = (v: number | null | undefined) => (v == null ? 0 : v);

        for (let i = 0; i < timestamps.length; i++) {
            const o = open[i];
            const c = close[i];
            if (o != null && c != null) {
                const date = new Date(timestamps[i] * 1000);
                const closePx = c;

                if (closes.length > 0) {
                    const prevClose = closes[closes.length - 1];
                    returns.push((closePx - prevClose) / prevClose);
                }

                closes.push(closePx);

                candles.push({
                    date: date.toISOString().split('T')[0],
                    timestamp: timestamps[i] * 1000,
                    open: o,
                    high: coalesceNum(high[i], o),
                    low: coalesceNum(low[i], o),
                    close: closePx,
                    volume: coalesceVol(volume[i]),
                    changePercent: closes.length > 1
                        ? ((closePx - closes[closes.length - 2]) / closes[closes.length - 2]) * 100
                        : 0,
                });
            }
        }

        const startPrice = closes[0];
        const endPrice = closes[closes.length - 1];
        const totalReturn = ((endPrice - startPrice) / startPrice) * 100;
        const daysInPeriod = candles.length;
        const annualizedReturn = (Math.pow(endPrice / startPrice, 252 / daysInPeriod) - 1) * 100;

        const histData: HistoricalData = {
            symbol,
            period,
            candles,
            stats: {
                totalDays: daysInPeriod,
                startDate: candles[0]?.date || '',
                endDate: candles[candles.length - 1]?.date || '',
                startPrice,
                endPrice,
                totalReturn,
                annualizedReturn,
                volatility: calculateVolatility(returns),
                maxDrawdown: calculateMaxDrawdown(closes),
            },
        };

        return NextResponse.json({
            success: true,
            data: histData,
        });

    } catch (error) {
        serverLog('error', 'history_api_error', { symbol, period, error: String(error) }, 'api/history');
        return NextResponse.json({
            success: false,
            error: 'Failed to fetch historical data',
        }, { status: 500 });
    }
}
