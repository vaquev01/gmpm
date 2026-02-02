// src/app/api/smc/route.ts
// API de Smart Money Concepts usando dados históricos

import { NextResponse } from 'next/server';
import { analyzeSMC, Candle } from '@/lib/smcEngine';

async function fetchCandles(symbol: string, interval: string = '1d'): Promise<Candle[]> {
    try {
        // Yahoo Finance Charts API
        const period1 = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
        const period2 = Math.floor(Date.now() / 1000);

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=${interval}`;

        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            next: { revalidate: 300 },
        });

        if (!response.ok) return [];

        const data = await response.json();
        const result = data.chart?.result?.[0];

        if (!result) return [];

        const timestamps = result.timestamp || [];
        const quotes = result.indicators?.quote?.[0] || {};

        const candles: Candle[] = [];

        for (let i = 0; i < timestamps.length; i++) {
            if (quotes.close?.[i] != null) {
                candles.push({
                    time: timestamps[i] * 1000,
                    open: quotes.open?.[i] || 0,
                    high: quotes.high?.[i] || 0,
                    low: quotes.low?.[i] || 0,
                    close: quotes.close?.[i] || 0,
                    volume: quotes.volume?.[i] || 0,
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
        console.error('SMC API Error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to analyze SMC' },
            { status: 500 }
        );
    }
}
