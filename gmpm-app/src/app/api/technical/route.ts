// src/app/api/technical/route.ts
// API para indicadores técnicos REAIS com dados históricos

import { NextResponse } from 'next/server';

interface HistoricalQuote {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface TechnicalIndicators {
    symbol: string;
    price: number;
    // RSI
    rsi14: number;
    rsiSignal: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
    // MACD
    macd: number;
    macdSignal: number;
    macdHistogram: number;
    macdCross: 'BULLISH' | 'BEARISH' | 'NONE';
    // ATR
    atr14: number;
    atrPercent: number;
    volatilityState: 'HIGH' | 'NORMAL' | 'LOW';
    // ADX
    adx14: number;
    plusDI: number;
    minusDI: number;
    trendStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NO_TREND';
    // Bollinger
    bbUpper: number;
    bbMiddle: number;
    bbLower: number;
    bbPosition: 'ABOVE' | 'UPPER' | 'MIDDLE' | 'LOWER' | 'BELOW';
    // Moving Averages
    sma20: number;
    sma50: number;
    sma200: number;
    maAlignment: 'BULLISH' | 'BEARISH' | 'MIXED';
    // Trend
    trend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
    trendScore: number; // 0-100
}

// ===== CÁLCULOS DE INDICADORES =====

function calculateRSI(closes: number[], period: number = 14): number {
    if (closes.length < period + 1) return 50;

    const changes = [];
    for (let i = 1; i < closes.length; i++) {
        changes.push(closes[i] - closes[i - 1]);
    }

    let gains = 0;
    let losses = 0;

    // Primeiro período
    for (let i = 0; i < period; i++) {
        if (changes[i] > 0) gains += changes[i];
        else losses += Math.abs(changes[i]);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Suavização
    for (let i = period; i < changes.length; i++) {
        if (changes[i] > 0) {
            avgGain = (avgGain * (period - 1) + changes[i]) / period;
            avgLoss = (avgLoss * (period - 1)) / period;
        } else {
            avgGain = (avgGain * (period - 1)) / period;
            avgLoss = (avgLoss * (period - 1) + Math.abs(changes[i])) / period;
        }
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function calculateEMA(data: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const ema: number[] = [data[0]];

    for (let i = 1; i < data.length; i++) {
        ema.push(data[i] * k + ema[i - 1] * (1 - k));
    }

    return ema;
}

function calculateMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
    if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };

    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);

    const macdLine: number[] = [];
    for (let i = 0; i < closes.length; i++) {
        macdLine.push(ema12[i] - ema26[i]);
    }

    const signalLine = calculateEMA(macdLine, 9);

    const lastMACD = macdLine[macdLine.length - 1];
    const lastSignal = signalLine[signalLine.length - 1];

    return {
        macd: lastMACD,
        signal: lastSignal,
        histogram: lastMACD - lastSignal,
    };
}

function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
    if (highs.length < period + 1) return 0;

    const trs: number[] = [];

    for (let i = 1; i < highs.length; i++) {
        const tr = Math.max(
            highs[i] - lows[i],
            Math.abs(highs[i] - closes[i - 1]),
            Math.abs(lows[i] - closes[i - 1])
        );
        trs.push(tr);
    }

    // ATR como média móvel exponencial
    let atr = trs.slice(0, period).reduce((a, b) => a + b) / period;

    for (let i = period; i < trs.length; i++) {
        atr = (atr * (period - 1) + trs[i]) / period;
    }

    return atr;
}

function calculateADX(highs: number[], lows: number[], closes: number[], period: number = 14): { adx: number; plusDI: number; minusDI: number } {
    if (highs.length < period * 2) return { adx: 0, plusDI: 0, minusDI: 0 };

    const plusDMs: number[] = [];
    const minusDMs: number[] = [];
    const trs: number[] = [];

    for (let i = 1; i < highs.length; i++) {
        const upMove = highs[i] - highs[i - 1];
        const downMove = lows[i - 1] - lows[i];

        plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
        minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);

        const tr = Math.max(
            highs[i] - lows[i],
            Math.abs(highs[i] - closes[i - 1]),
            Math.abs(lows[i] - closes[i - 1])
        );
        trs.push(tr);
    }

    // Smooth
    const smoothPlusDM = calculateEMA(plusDMs, period);
    const smoothMinusDM = calculateEMA(minusDMs, period);
    const smoothTR = calculateEMA(trs, period);

    const plusDI = (smoothPlusDM[smoothPlusDM.length - 1] / smoothTR[smoothTR.length - 1]) * 100;
    const minusDI = (smoothMinusDM[smoothMinusDM.length - 1] / smoothTR[smoothTR.length - 1]) * 100;

    const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;

    // ADX é a média móvel do DX
    const dxValues: number[] = [];
    for (let i = period; i < smoothPlusDM.length; i++) {
        const pdi = (smoothPlusDM[i] / smoothTR[i]) * 100;
        const mdi = (smoothMinusDM[i] / smoothTR[i]) * 100;
        dxValues.push(Math.abs(pdi - mdi) / (pdi + mdi || 1) * 100);
    }

    const adx = dxValues.slice(-period).reduce((a, b) => a + b, 0) / period;

    return { adx: adx || 0, plusDI: plusDI || 0, minusDI: minusDI || 0 };
}

function calculateSMA(data: number[], period: number): number {
    if (data.length < period) return data[data.length - 1];
    return data.slice(-period).reduce((a, b) => a + b) / period;
}

function calculateBollinger(closes: number[], period: number = 20, stdDev: number = 2): { upper: number; middle: number; lower: number } {
    if (closes.length < period) return { upper: 0, middle: 0, lower: 0 };

    const slice = closes.slice(-period);
    const middle = slice.reduce((a, b) => a + b) / period;

    const squaredDiffs = slice.map(v => Math.pow(v - middle, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b) / period;
    const std = Math.sqrt(variance);

    return {
        upper: middle + stdDev * std,
        middle,
        lower: middle - stdDev * std,
    };
}

// ===== BUSCAR DADOS HISTÓRICOS =====

async function fetchHistoricalData(symbol: string): Promise<HistoricalQuote[]> {
    try {
        // Yahoo Finance Charts API (gratuito, sem autenticação)
        const period1 = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000); // 90 dias atrás
        const period2 = Math.floor(Date.now() / 1000);

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;

        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            next: { revalidate: 300 }, // Cache 5 min
        });

        if (!response.ok) return [];

        const data = await response.json();
        const result = data.chart?.result?.[0];

        if (!result) return [];

        const timestamps = result.timestamp || [];
        const quotes = result.indicators?.quote?.[0] || {};

        const historical: HistoricalQuote[] = [];

        for (let i = 0; i < timestamps.length; i++) {
            if (quotes.close?.[i] != null) {
                historical.push({
                    date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
                    open: quotes.open?.[i] || 0,
                    high: quotes.high?.[i] || 0,
                    low: quotes.low?.[i] || 0,
                    close: quotes.close?.[i] || 0,
                    volume: quotes.volume?.[i] || 0,
                });
            }
        }

        return historical;
    } catch {
        return [];
    }
}

async function calculateTechnicals(symbol: string): Promise<TechnicalIndicators | null> {
    const historical = await fetchHistoricalData(symbol);

    if (historical.length < 30) return null;

    const closes = historical.map(h => h.close);
    const highs = historical.map(h => h.high);
    const lows = historical.map(h => h.low);
    const price = closes[closes.length - 1];

    // RSI
    const rsi14 = calculateRSI(closes, 14);
    const rsiSignal = rsi14 > 70 ? 'OVERBOUGHT' : rsi14 < 30 ? 'OVERSOLD' : 'NEUTRAL';

    // MACD
    const macdData = calculateMACD(closes);
    const macdCross = macdData.histogram > 0 && macdData.macd > macdData.signal ? 'BULLISH' :
        macdData.histogram < 0 && macdData.macd < macdData.signal ? 'BEARISH' : 'NONE';

    // ATR
    const atr14 = calculateATR(highs, lows, closes, 14);
    const atrPercent = (atr14 / price) * 100;
    const volatilityState = atrPercent > 3 ? 'HIGH' : atrPercent < 1 ? 'LOW' : 'NORMAL';

    // ADX
    const adxData = calculateADX(highs, lows, closes, 14);
    const trendStrength = adxData.adx > 40 ? 'STRONG' : adxData.adx > 25 ? 'MODERATE' : adxData.adx > 15 ? 'WEAK' : 'NO_TREND';

    // Bollinger
    const bb = calculateBollinger(closes, 20, 2);
    const bbPosition = price > bb.upper ? 'ABOVE' : price > bb.middle + (bb.upper - bb.middle) / 2 ? 'UPPER' :
        price < bb.lower ? 'BELOW' : price < bb.middle - (bb.middle - bb.lower) / 2 ? 'LOWER' : 'MIDDLE';

    // Moving Averages
    const sma20 = calculateSMA(closes, 20);
    const sma50 = calculateSMA(closes, 50);
    const sma200 = closes.length >= 200 ? calculateSMA(closes, 200) : sma50;
    const maAlignment = price > sma20 && sma20 > sma50 && sma50 > sma200 ? 'BULLISH' :
        price < sma20 && sma20 < sma50 && sma50 < sma200 ? 'BEARISH' : 'MIXED';

    // Trend
    const trend = adxData.plusDI > adxData.minusDI && price > sma50 ? 'UPTREND' :
        adxData.minusDI > adxData.plusDI && price < sma50 ? 'DOWNTREND' : 'SIDEWAYS';

    // Trend Score (0-100)
    let trendScore = 50;
    if (rsi14 > 50) trendScore += (rsi14 - 50) * 0.3;
    else trendScore -= (50 - rsi14) * 0.3;
    if (macdData.histogram > 0) trendScore += 10;
    else trendScore -= 10;
    if (maAlignment === 'BULLISH') trendScore += 15;
    else if (maAlignment === 'BEARISH') trendScore -= 15;
    if (adxData.adx > 25) {
        if (adxData.plusDI > adxData.minusDI) trendScore += 10;
        else trendScore -= 10;
    }
    trendScore = Math.max(0, Math.min(100, trendScore));

    return {
        symbol,
        price,
        rsi14: Math.round(rsi14 * 100) / 100,
        rsiSignal,
        macd: Math.round(macdData.macd * 10000) / 10000,
        macdSignal: Math.round(macdData.signal * 10000) / 10000,
        macdHistogram: Math.round(macdData.histogram * 10000) / 10000,
        macdCross,
        atr14: Math.round(atr14 * 100) / 100,
        atrPercent: Math.round(atrPercent * 100) / 100,
        volatilityState,
        adx14: Math.round(adxData.adx * 100) / 100,
        plusDI: Math.round(adxData.plusDI * 100) / 100,
        minusDI: Math.round(adxData.minusDI * 100) / 100,
        trendStrength,
        bbUpper: Math.round(bb.upper * 100) / 100,
        bbMiddle: Math.round(bb.middle * 100) / 100,
        bbLower: Math.round(bb.lower * 100) / 100,
        bbPosition,
        sma20: Math.round(sma20 * 100) / 100,
        sma50: Math.round(sma50 * 100) / 100,
        sma200: Math.round(sma200 * 100) / 100,
        maAlignment,
        trend,
        trendScore: Math.round(trendScore),
    };
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'SPY';
    const symbols = searchParams.get('symbols')?.split(',') || [symbol];

    try {
        const results = await Promise.all(symbols.slice(0, 10).map(calculateTechnicals));
        const validResults = results.filter((r): r is TechnicalIndicators => r !== null);

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            count: validResults.length,
            data: validResults,
        });
    } catch (error) {
        console.error('Technical API Error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to calculate technicals' },
            { status: 500 }
        );
    }
}
