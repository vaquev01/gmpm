// src/lib/engineEnhancements.ts
// Funções de integração avançadas para o motor de cálculo

import { MacroData } from './realEngine';

// ===== TIPOS =====
export interface COTData {
    symbol: string;
    commercialNet: number;
    nonCommercialNet: number;
    retailNet: number;
    institutionalBias: 'LONG' | 'SHORT' | 'NEUTRAL';
    extremePosition: boolean;
    weeklyChange: number;
}

export interface MTFData {
    symbol: string;
    timeframes: {
        tf: string;
        trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
        strength: number;
    }[];
    confluenceScore: number;
    overallBias: 'LONG' | 'SHORT' | 'NEUTRAL';
    alignment: number; // 0-100, how aligned are all timeframes
}

export interface TechnicalData {
    symbol: string;
    rsi: number;
    macd: { value: number; signal: number; histogram: number };
    ema20: number;
    ema50: number;
    ema200: number;
    atr: number;
    bollingerBands: { upper: number; middle: number; lower: number };
    priceVsEMAs: 'ABOVE_ALL' | 'ABOVE_50' | 'BELOW_50' | 'BELOW_ALL';
}

export interface SMCData {
    symbol: string;
    orderBlocks: { type: 'BULLISH' | 'BEARISH'; price: number; strength: number }[];
    fvgs: { type: 'BULLISH' | 'BEARISH'; low: number; high: number }[];
    bos: boolean; // Break of Structure
    choch: boolean; // Change of Character
    liquidity: { price: number; type: 'BUY' | 'SELL' }[];
    smcBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

// ===== FETCH COT DATA =====
export async function fetchCOTData(symbols: string[]): Promise<Record<string, COTData>> {
    const result: Record<string, COTData> = {};

    try {
        // Fetch COT for forex and commodities
        const response = await fetch('/api/cot');
        if (!response.ok) return result;

        const data = await response.json();
        if (!data.success) return result;

        // Map COT data to our symbols
        for (const symbol of symbols) {
            const cleanSymbol = symbol.replace('=X', '').replace('=F', '');

            // Find matching COT data
            let cotEntry = null;
            if (cleanSymbol.includes('USD') || cleanSymbol.includes('EUR') || cleanSymbol.includes('GBP')) {
                cotEntry = data.data?.forex?.find((f: { symbol: string }) => f.symbol.includes(cleanSymbol.substring(0, 3)));
            } else if (['GC', 'SI', 'CL', 'NG', 'HG'].includes(cleanSymbol)) {
                cotEntry = data.data?.commodities?.find((c: { symbol: string }) => c.symbol.includes(cleanSymbol));
            }

            if (cotEntry) {
                const commercialNet = cotEntry.commercialLong - cotEntry.commercialShort;
                const nonCommercialNet = cotEntry.nonCommercialLong - cotEntry.nonCommercialShort;
                const totalPositions = cotEntry.openInterest || 100000;

                result[symbol] = {
                    symbol,
                    commercialNet: (commercialNet / totalPositions) * 100,
                    nonCommercialNet: (nonCommercialNet / totalPositions) * 100,
                    retailNet: -nonCommercialNet / totalPositions * 100, // Retail is opposite of specs
                    institutionalBias: nonCommercialNet > 0 ? 'LONG' : nonCommercialNet < 0 ? 'SHORT' : 'NEUTRAL',
                    extremePosition: Math.abs(nonCommercialNet / totalPositions) > 0.3,
                    weeklyChange: cotEntry.weeklyChange || 0,
                };
            }
        }
    } catch {
        console.error('Failed to fetch COT data');
    }

    return result;
}

// ===== FETCH MTF DATA =====
export async function fetchMTFData(symbol: string): Promise<MTFData | null> {
    try {
        const response = await fetch(`/api/mtf?symbol=${encodeURIComponent(symbol)}`);
        if (!response.ok) return null;

        const data = await response.json();
        if (!data.success) return null;

        const timeframes = Object.entries(data.data.timeframes).map(([tf, tfData]: [string, unknown]) => {
            const d = tfData as { trend: string; strength: number };
            return {
                tf,
                trend: d.trend as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
                strength: d.strength,
            };
        });

        return {
            symbol,
            timeframes,
            confluenceScore: data.data.confluence?.score || 50,
            overallBias: data.data.confluence?.bias || 'NEUTRAL',
            alignment: timeframes.filter(t => t.trend === timeframes[0]?.trend).length / timeframes.length * 100,
        };
    } catch {
        return null;
    }
}

// ===== FETCH TECHNICAL DATA =====
export async function fetchTechnicalData(symbol: string): Promise<TechnicalData | null> {
    try {
        const response = await fetch(`/api/technical?symbol=${encodeURIComponent(symbol)}`);
        if (!response.ok) return null;

        const data = await response.json();
        if (!data.success) return null;

        const tech = data.data;
        const price = tech.price || 0;

        let priceVsEMAs: TechnicalData['priceVsEMAs'] = 'BELOW_ALL';
        if (price > tech.ema200 && price > tech.ema50 && price > tech.ema20) {
            priceVsEMAs = 'ABOVE_ALL';
        } else if (price > tech.ema50) {
            priceVsEMAs = 'ABOVE_50';
        } else if (price < tech.ema50 && price > tech.ema200) {
            priceVsEMAs = 'BELOW_50';
        }

        return {
            symbol,
            rsi: tech.rsi || 50,
            macd: tech.macd || { value: 0, signal: 0, histogram: 0 },
            ema20: tech.ema20 || price,
            ema50: tech.ema50 || price,
            ema200: tech.ema200 || price,
            atr: tech.atr || 0,
            bollingerBands: tech.bollingerBands || { upper: price, middle: price, lower: price },
            priceVsEMAs,
        };
    } catch {
        return null;
    }
}

// ===== FETCH SMC DATA =====
export async function fetchSMCData(symbol: string): Promise<SMCData | null> {
    try {
        const response = await fetch(`/api/smc?symbol=${encodeURIComponent(symbol)}`);
        if (!response.ok) return null;

        const data = await response.json();
        if (!data.success) return null;

        const smc = data.data;

        return {
            symbol,
            orderBlocks: smc.orderBlocks || [],
            fvgs: smc.fvgs || [],
            bos: smc.bos || false,
            choch: smc.choch || false,
            liquidity: smc.liquidity || [],
            smcBias: smc.bias || 'NEUTRAL',
        };
    } catch {
        return null;
    }
}

// ===== CALCULATE COT SCORE =====
export function calculateCOTScore(cotData: COTData | undefined, _assetClass: string): number {
    if (!cotData) return 50; // Default neutral

    void _assetClass;

    let score = 50;

    // Non-commercial (speculator) positioning - they're usually right on trend
    if (cotData.institutionalBias === 'LONG') score += 15;
    else if (cotData.institutionalBias === 'SHORT') score -= 15;

    // Commercial positioning - they hedge, so opposite is bullish for price
    if (cotData.commercialNet < 0) score += 10; // Commercials hedging short = bullish
    else if (cotData.commercialNet > 0) score -= 10;

    // Extreme positions - potential reversal
    if (cotData.extremePosition) {
        score = score > 50 ? score - 10 : score + 10; // Mean reversion warning
    }

    // Weekly change momentum
    if (cotData.weeklyChange > 5) score += 5;
    else if (cotData.weeklyChange < -5) score -= 5;

    return Math.max(0, Math.min(100, score));
}

// ===== CALCULATE MTF SCORE =====
export function calculateMTFScore(mtfData: MTFData | null): number {
    if (!mtfData) return 50;

    let score = 50;

    // Confluence score (already 0-100)
    score = mtfData.confluenceScore;

    // Alignment bonus
    if (mtfData.alignment >= 75) score += 10; // All timeframes aligned
    else if (mtfData.alignment < 50) score -= 10; // Conflicting signals

    // Bias bonus
    if (mtfData.overallBias !== 'NEUTRAL') score += 5;

    return Math.max(0, Math.min(100, score));
}

// ===== CALCULATE TECHNICAL SCORE (ENHANCED) =====
export function calculateEnhancedTechnicalScore(
    techData: TechnicalData | null,
    direction: 'LONG' | 'SHORT'
): number {
    if (!techData) return 50;

    let score = 50;

    // RSI
    if (direction === 'LONG') {
        if (techData.rsi > 50 && techData.rsi < 70) score += 10;
        else if (techData.rsi < 30) score += 15; // Oversold bounce
        else if (techData.rsi > 70) score -= 10; // Overbought
    } else {
        if (techData.rsi < 50 && techData.rsi > 30) score += 10;
        else if (techData.rsi > 70) score += 15; // Overbought reversal
        else if (techData.rsi < 30) score -= 10; // Oversold
    }

    // MACD
    if (direction === 'LONG') {
        if (techData.macd.histogram > 0) score += 10;
        if (techData.macd.value > techData.macd.signal) score += 5;
    } else {
        if (techData.macd.histogram < 0) score += 10;
        if (techData.macd.value < techData.macd.signal) score += 5;
    }

    // EMA Structure
    if (direction === 'LONG') {
        if (techData.priceVsEMAs === 'ABOVE_ALL') score += 15;
        else if (techData.priceVsEMAs === 'ABOVE_50') score += 10;
        else if (techData.priceVsEMAs === 'BELOW_ALL') score -= 10;
    } else {
        if (techData.priceVsEMAs === 'BELOW_ALL') score += 15;
        else if (techData.priceVsEMAs === 'BELOW_50') score += 10;
        else if (techData.priceVsEMAs === 'ABOVE_ALL') score -= 10;
    }

    return Math.max(0, Math.min(100, score));
}

// ===== CALCULATE SMC SCORE =====
export function calculateSMCScore(
    smcData: SMCData | null,
    currentPrice: number,
    direction: 'LONG' | 'SHORT'
): number {
    if (!smcData) return 50;

    let score = 50;

    // Bias alignment
    if (direction === 'LONG' && smcData.smcBias === 'BULLISH') score += 15;
    else if (direction === 'SHORT' && smcData.smcBias === 'BEARISH') score += 15;
    else if (smcData.smcBias !== 'NEUTRAL' &&
        ((direction === 'LONG' && smcData.smcBias === 'BEARISH') ||
            (direction === 'SHORT' && smcData.smcBias === 'BULLISH'))) {
        score -= 15;
    }

    // Order Blocks nearby
    const nearbyOBs = smcData.orderBlocks.filter(ob =>
        Math.abs(ob.price - currentPrice) / currentPrice < 0.02 // Within 2%
    );
    if (nearbyOBs.length > 0) {
        const relevantOB = nearbyOBs.find(ob =>
            (direction === 'LONG' && ob.type === 'BULLISH') ||
            (direction === 'SHORT' && ob.type === 'BEARISH')
        );
        if (relevantOB) score += 10 * relevantOB.strength;
    }

    // FVGs (Fair Value Gaps)
    const nearbyFVGs = smcData.fvgs.filter(fvg =>
        currentPrice >= fvg.low && currentPrice <= fvg.high
    );
    if (nearbyFVGs.length > 0) {
        score += 10; // Price in an FVG = potential trade zone
    }

    // BOS/CHoCH
    if (direction === 'LONG' && smcData.bos) score += 10;
    else if (direction === 'SHORT' && smcData.choch) score += 10;

    return Math.max(0, Math.min(100, score));
}

// ===== ENHANCED MACRO SCORE WITH COT =====
export function calculateEnhancedMacroScore(
    macro: MacroData,
    assetClass: string,
    cotData: COTData | undefined
): number {
    let score = 50;

    // Base macro calculation (same as before)
    switch (assetClass) {
        case 'stock':
        case 'etf':
        case 'index':
            if (macro.vix < 18) score = 80;
            else if (macro.vix < 22) score = 65;
            else if (macro.vix > 28) score = 25;
            if (macro.yieldCurve > 0) score += 10;
            if (macro.fearGreed && macro.fearGreed.value > 60) score += 5;
            break;

        case 'bond':
            if (macro.vix > 25) score = 80;
            else if (macro.vix < 18) score = 40;
            if (macro.yieldCurve < 0) score += 10;
            break;

        case 'commodity':
            if (macro.dollarIndex > 0 && macro.dollarIndex < 100) score += 10;
            else if (macro.dollarIndex > 105) score -= 10;
            break;

        case 'forex':
            if (macro.vix < 20) score = 70;
            else if (macro.vix > 25) score = 50;
            break;

        case 'crypto':
            if (macro.fearGreed) {
                if (macro.fearGreed.value > 60) score = 75;
                else if (macro.fearGreed.value < 30) score = 60;
                else score = 55;
            }
            if (macro.vix < 20) score += 10;
            break;
    }

    // Add COT component (weighted 30%)
    if (cotData) {
        const cotScore = calculateCOTScore(cotData, assetClass);
        score = score * 0.7 + cotScore * 0.3;
    }

    return Math.min(100, Math.max(0, Math.round(score)));
}

// ===== COMBINED ENHANCED SCORE =====
export interface EnhancedScoreResult {
    total: number;
    components: {
        macro: number;
        cot: number;
        mtf: number;
        technical: number;
        smc: number;
        trend: number;
        momentum: number;
        volatility: number;
        flow: number;
        timing: number;
        crossAsset: number;
        riskReward: number;
    };
    enhancements: {
        cotIntegrated: boolean;
        mtfIntegrated: boolean;
        technicalIntegrated: boolean;
        smcIntegrated: boolean;
    };
}

// Enhanced weights including new components
export const ENHANCED_WEIGHTS = {
    MACRO: 0.12,      // Reduced from 15% (COT adds to this)
    COT: 0.05,        // NEW: Institutional positioning
    MTF: 0.08,        // NEW: Multi-timeframe confluence
    TREND: 0.10,      // Reduced from 15%
    MOMENTUM: 0.08,   // Reduced from 10%
    VOLATILITY: 0.08,
    FLOW: 0.10,
    TECHNICAL: 0.12,  // Increased (now uses real data)
    SMC: 0.10,        // Renamed from FRACTAL
    CROSS_ASSET: 0.05,
    TIMING: 0.05,
    RISK_REWARD: 0.07,
};
