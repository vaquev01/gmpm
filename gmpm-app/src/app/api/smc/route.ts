// src/app/api/smc/route.ts
// API de Smart Money Concepts usando dados históricos

import { NextResponse } from 'next/server';
import { analyzeSMC, Candle } from '@/lib/smcEngine';
import { yahooFetchJson } from '@/lib/yahooClient';
import { serverLog } from '@/lib/serverLogs';

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

async function fetchCandles(symbol: string, interval: string = '1d'): Promise<Candle[]> {
    try {
        // Yahoo Finance Charts API
        const period1 = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
        const period2 = Math.floor(Date.now() / 1000);

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=${interval}`;

        const y = await yahooFetchJson(url, 300_000);
        if (!y.ok || !y.data) {
            serverLog('warn', 'smc_yahoo_fetch_failed', { symbol, interval, status: y.status, cached: y.cached, stale: y.stale }, 'api/smc');
            return [];
        }

        const data = y.data as YahooChartResponse;
        const result = data.chart?.result?.[0];

        if (!result) return [];

        const timestamps = result.timestamp || [];
        const quote = result.indicators?.quote?.[0];
        if (!quote) return [];

        const open = quote.open || [];
        const high = quote.high || [];
        const low = quote.low || [];
        const close = quote.close || [];
        const volume = quote.volume || [];

        const coalesceNum = (v: number | null | undefined, fallback: number) => (v == null ? fallback : v);
        const coalesceVol = (v: number | null | undefined) => (v == null ? 0 : v);

        const candles: Candle[] = [];

        for (let i = 0; i < timestamps.length; i++) {
            const c = close[i];
            if (c != null) {
                const o0 = open[i];
                const o = o0 != null ? o0 : c;
                candles.push({
                    time: timestamps[i] * 1000,
                    open: o,
                    high: coalesceNum(high[i], o),
                    low: coalesceNum(low[i], o),
                    close: c,
                    volume: coalesceVol(volume[i]),
                });
            }
        }

        return candles;
    } catch {
        return [];
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'SPY';
    const interval = searchParams.get('interval') || '1d';

    try {
        const candles = await fetchCandles(symbol, interval);

        if (candles.length < 30) {
            return NextResponse.json(
                { success: false, error: 'Insufficient data' },
                { status: 400 }
            );
        }

        const currentPrice = candles[candles.length - 1].close;
        const analysis = analyzeSMC(candles, currentPrice);

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            symbol,
            interval,
            currentPrice,
            candleCount: candles.length,
            analysis: {
                // Structure
                trend: analysis.trend,
                lastBOS: analysis.lastBOS,

                // Key Levels
                equilibrium: Math.round(analysis.equilibrium * 100) / 100,
                currentZone: analysis.currentZone,
                premiumLevel: Math.round(analysis.premiumLevel * 100) / 100,
                discountLevel: Math.round(analysis.discountLevel * 100) / 100,

                // Order Blocks
                activeOrderBlocks: analysis.activeOBs.length,
                nearestBullishOB: analysis.nearestBullishOB ? {
                    range: `${analysis.nearestBullishOB.priceLow.toFixed(2)} - ${analysis.nearestBullishOB.priceHigh.toFixed(2)}`,
                    strength: analysis.nearestBullishOB.strength,
                    tested: analysis.nearestBullishOB.tested,
                } : null,
                nearestBearishOB: analysis.nearestBearishOB ? {
                    range: `${analysis.nearestBearishOB.priceLow.toFixed(2)} - ${analysis.nearestBearishOB.priceHigh.toFixed(2)}`,
                    strength: analysis.nearestBearishOB.strength,
                    tested: analysis.nearestBearishOB.tested,
                } : null,

                // FVGs
                unfilledFVGs: analysis.unfilledFVGs.length,
                nearestBullishFVG: analysis.nearestBullishFVG ? {
                    range: `${analysis.nearestBullishFVG.low.toFixed(2)} - ${analysis.nearestBullishFVG.high.toFixed(2)}`,
                    size: `${analysis.nearestBullishFVG.sizePercent}%`,
                } : null,
                nearestBearishFVG: analysis.nearestBearishFVG ? {
                    range: `${analysis.nearestBearishFVG.low.toFixed(2)} - ${analysis.nearestBearishFVG.high.toFixed(2)}`,
                    size: `${analysis.nearestBearishFVG.sizePercent}%`,
                } : null,

                // Liquidity
                nearestBuySideLiquidity: analysis.nearestBuySide?.price.toFixed(2) || null,
                nearestSellSideLiquidity: analysis.nearestSellSide?.price.toFixed(2) || null,

                // Bias
                bias: analysis.bias,
                biasStrength: analysis.biasStrength,
                entryZones: analysis.entryZones,
            },
        });
    } catch (error) {
        serverLog('error', 'smc_api_error', { error: String(error) }, 'api/smc');
        return NextResponse.json(
            { success: false, error: 'Failed to analyze SMC' },
            { status: 500 }
        );
    }
}
