// src/lib/realEngine.ts
// Engine COMPLETO com TODOS os cálculos do PRD v8.1
// ENHANCED V2: Integra COT, MTF, Technical, SMC para maior precisão

import { MarketData, Signal } from '@/types';
import {
    fetchCOTData,
    fetchMTFData,
    fetchTechnicalData,
    fetchSMCData,
    calculateCOTScore,
    calculateMTFScore,
    calculateEnhancedTechnicalScore,
    calculateSMCScore,
    calculateEnhancedMacroScore,
    ENHANCED_WEIGHTS,
    type COTData,
    type MTFData,
    type TechnicalData,
    type SMCData,
} from './engineEnhancements';
import {
    getAdjustedWeights,
    loadLearningState,
    type LearningState,
} from './continuousLearning';

// ===== PESOS DO PRD v8.1 =====
const WEIGHTS = {
    MACRO: 0.15,
    TREND: 0.15,
    MOMENTUM: 0.10,
    VOLATILITY: 0.10,
    FLOW: 0.10,
    TECHNICAL: 0.10,
    FRACTAL: 0.10,
    CROSS_ASSET: 0.05,
    TIMING: 0.05,
    RISK_REWARD: 0.10,
};

// Ajustes por regime
const REGIME_ADJUSTMENTS: Record<string, Record<string, number>> = {
    RISK_ON: { TREND: 1.2, MOMENTUM: 1.2, MACRO: 0.8 },
    RISK_OFF: { MACRO: 1.5, VOLATILITY: 1.3, TREND: 0.8 },
    TRANSITION: { VOLATILITY: 1.2, TECHNICAL: 1.2, MOMENTUM: 0.8 },
    STRESS: { VOLATILITY: 1.5, MACRO: 1.3, TREND: 0.5 },
};

// ===== TIPOS =====
export interface RealQuote {
    symbol: string;
    displaySymbol: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    high: number;
    low: number;
    open: number;
    previousClose: number;
    marketState: string;
    assetClass: string;
    atr?: number;
    rsi?: number;
}

export interface MacroData {
    vix: number;
    vixChange: number;
    treasury10y: number;
    treasury2y: number;
    treasury30y: number;
    yieldCurve: number;
    dollarIndex: number;
    fearGreed: {
        value: number;
        classification: string;
        timestamp: string;
    } | null;
}

export interface MarketResponse {
    success: boolean;
    timestamp: string;
    count: number;
    stats: {
        totalAssets: number;
        gainers: number;
        losers: number;
        avgChange: number;
    };
    macro: MacroData;
    data: RealQuote[];
    byClass: Record<string, RealQuote[]>;
}

export interface TradeSignal extends Signal {
    entryZone: { low: number; high: number };
    stopLoss: number;
    takeProfits: { price: number; ratio: string; probability: number }[];
    positionSize: string;
    riskR: number;
    oneLiner: string;
    rationale: string;
    keyDrivers: string[];
    risks: string[];
    validityHours: number;
}

// ===== FETCH FUNCTIONS =====
export async function fetchRealMarketData(): Promise<MarketResponse | null> {
    try {
        const response = await fetch('/api/market');
        const data = await response.json();
        return data.success ? data : null;
    } catch {
        return null;
    }
}

// ===== REGIME DETECTION =====
export function detectRegime(macro: MacroData): {
    regime: string;
    description: string;
    confidence: number;
} {
    const vix = macro.vix;
    const yieldCurve = macro.yieldCurve;
    const fearGreed = macro.fearGreed?.value || 50;

    let regime = 'UNCERTAIN';
    let description = '';
    let confidence = 60;

    // STRESS: VIX > 30, Fear & Greed < 25
    if (vix > 30 && fearGreed < 25) {
        regime = 'STRESS';
        description = 'Modo crise: alta volatilidade + medo extremo. Preservar capital.';
        confidence = 85;
    }
    // RISK_OFF: VIX > 25 ou yield curve invertida
    else if (vix > 25 || yieldCurve < 0) {
        regime = 'RISK_OFF';
        description = 'Risk-off: favorecer defensivos (JPY, CHF, Gold, Treasuries).';
        confidence = 75;
    }
    // RISK_ON: VIX < 18, Fear & Greed > 55
    else if (vix < 18 && fearGreed > 55) {
        regime = 'RISK_ON';
        description = 'Goldilocks: condições ideais para risk assets.';
        confidence = 80;
    }
    // TRANSITION
    else if (vix >= 18 && vix <= 25) {
        regime = 'TRANSITION';
        description = 'Transição: sinais mistos, reduzir tamanho de posições.';
        confidence = 65;
    }

    return { regime, description, confidence };
}

// ===== ASSET-CLASS SPECIFIC SENTIMENT =====
function calculateSentiment(assetClass: string, macro: MacroData, changePercent: number): number {
    let sentiment = 50;

    switch (assetClass) {
        case 'crypto':
            // Crypto: Use crypto-specific Fear & Greed Index (from alternative.me)
            if (macro.fearGreed) {
                sentiment = macro.fearGreed.value;
            }
            // Adjust for VIX (risk sentiment)
            if (macro.vix > 25) sentiment -= 10;
            else if (macro.vix < 18) sentiment += 10;
            break;

        case 'stock':
        case 'etf':
        case 'index':
            // Equities: VIX inverse + market breadth proxy
            sentiment = 50;
            if (macro.vix < 15) sentiment = 80;
            else if (macro.vix < 20) sentiment = 70;
            else if (macro.vix > 30) sentiment = 25;
            else if (macro.vix > 25) sentiment = 35;
            // Yield curve positive = optimistic
            if (macro.yieldCurve > 0.5) sentiment += 5;
            else if (macro.yieldCurve < 0) sentiment -= 10;
            break;

        case 'bond':
            // Bonds: inverse to stocks, flight to safety
            sentiment = 50;
            if (macro.vix > 30) sentiment = 80; // High fear = bonds up
            else if (macro.vix > 25) sentiment = 70;
            else if (macro.vix < 15) sentiment = 35;
            break;

        case 'commodity':
            // Commodities: dollar strength inverse, inflation proxy
            sentiment = 50;
            if (macro.dollarIndex > 0 && macro.dollarIndex < 100) sentiment = 65;
            else if (macro.dollarIndex > 105) sentiment = 40;
            // VIX impact is mixed for commodities
            break;

        case 'forex':
            // Forex: volatility can be good or bad, depends on pair
            sentiment = 50;
            if (macro.vix > 25) sentiment = 45; // Higher uncertainty
            else if (macro.vix < 18) sentiment = 60; // Cleaner trends
            break;

        default:
            sentiment = 50;
    }

    // Momentum adjustment: if asset is moving strongly, increase sentiment
    if (changePercent > 2) sentiment = Math.min(100, sentiment + 10);
    else if (changePercent < -2) sentiment = Math.max(0, sentiment - 10);

    return Math.max(0, Math.min(100, sentiment));
}

// ===== REAL FRACTAL SCORE =====
// Based on technical structure, not just price change
function calculateFractalScore(
    quote: RealQuote,
    rsi: number,
    trend: number,
    volatility: number
): number {
    let score = 50;

    // 1. RSI at key levels (30/50/70) = confluence
    if (rsi > 28 && rsi < 32) score += 15; // Near oversold
    else if (rsi > 48 && rsi < 52) score += 10; // At equilibrium
    else if (rsi > 68 && rsi < 72) score += 15; // Near overbought

    // 2. Price position in range (trend)
    // Near range extremes = potential reversal zones
    if (trend > 85 || trend < 15) score += 10; // At extremes
    else if (trend > 45 && trend < 55) score += 5; // At middle

    // 3. Volatility contraction = potential breakout
    if (volatility < 20) score += 15; // Low vol = compression
    else if (volatility > 70) score -= 10; // High vol = chaos

    // 4. ATR-based structure
    if (quote.atr && quote.atr > 0) {
        const atrPercent = (quote.atr / quote.price) * 100;
        if (atrPercent > 1 && atrPercent < 3) score += 10; // Sweet spot
    }

    // 5. Momentum confirmation
    if (quote.changePercent > 0 && rsi > 50) score += 5; // Aligned bullish
    else if (quote.changePercent < 0 && rsi < 50) score += 5; // Aligned bearish

    return Math.max(0, Math.min(100, score));
}

// ===== CONVERT TO MARKET DATA (FULLY INDIVIDUALIZED) =====
export function convertToMarketData(quotes: RealQuote[], macro: MacroData): (MarketData & {
    assetClass: string;
    atr: number;
    calculatedRsi: number;
})[] {
    return quotes.map(quote => {
        const rangePercent = ((quote.high - quote.low) / quote.price) * 100;

        // RSI from Yahoo or calculated
        const rsi = quote.rsi || 50;

        // Trend based on position in range
        const range = quote.high - quote.low;
        const positionInRange = range > 0 ? (quote.price - quote.low) / range : 0.5;
        const trend = positionInRange * 100;

        // Volatility
        const volatility = Math.min(100, rangePercent * 20);

        // FIXED: Sentiment is now asset-class specific
        const sentiment = calculateSentiment(quote.assetClass, macro, quote.changePercent);

        // FIXED: Fractal score is now calculated from real technical data
        const fractalScore = calculateFractalScore(quote, rsi, trend, volatility);

        return {
            symbol: quote.displaySymbol,
            price: quote.price,
            change: quote.changePercent,
            rsi: Math.max(0, Math.min(100, rsi)),
            trend: Math.max(0, Math.min(100, trend)),
            volatility: Math.max(0, Math.min(100, volatility)),
            volume: quote.volume,
            sentiment: Math.max(0, Math.min(100, sentiment)),
            fractalScore: Math.max(0, Math.min(100, fractalScore)),
            marketState: quote.marketState,
            assetClass: quote.assetClass,
            atr: quote.atr || 0,
            calculatedRsi: rsi,
        };
    });
}

// ===== ASSET-SPECIFIC AVERAGE VOLUMES =====
// Historical average volumes by asset type (approximations based on real market data)
const ASSET_AVG_VOLUMES: Record<string, number> = {
    // Mega cap stocks
    'AAPL': 80000000, 'MSFT': 30000000, 'GOOGL': 25000000, 'AMZN': 40000000,
    'META': 20000000, 'NVDA': 50000000, 'TSLA': 100000000, 'AMD': 60000000,
    // ETFs
    'SPY': 80000000, 'QQQ': 50000000, 'IWM': 30000000, 'DIA': 5000000,
    'TLT': 20000000, 'GLD': 10000000, 'XLF': 40000000, 'XLE': 15000000,
    // Crypto (24h volume in USD equivalent)
    'BTC': 30000000000, 'ETH': 15000000000, 'SOL': 3000000000, 'XRP': 1500000000,
    // Forex (very high liquidity)
    'EURUSD': 500000000, 'GBPUSD': 300000000, 'USDJPY': 300000000,
    // Commodities (futures)
    'GC': 200000, 'SI': 100000, 'CL': 500000, 'NG': 200000,
    // Default by asset class
    '_stock': 5000000, '_etf': 10000000, '_crypto': 1000000000,
    '_forex': 100000000, '_commodity': 100000, '_index': 1000000, '_bond': 1000000,
};

// ===== MARKET SESSIONS =====
function getMarketSession(timestamp?: number): { session: string; quality: number; openMarkets: string[] } {
    const now = timestamp ? new Date(timestamp) : new Date();
    const utcHour = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const time = utcHour + utcMinutes / 60;

    // Sessions (UTC times)
    const sessions = {
        sydney: { start: 22, end: 7, name: 'SYDNEY' },
        tokyo: { start: 0, end: 9, name: 'TOKYO' },
        london: { start: 8, end: 16, name: 'LONDON' },
        newYork: { start: 13, end: 22, name: 'NEW_YORK' },
    };

    const openMarkets: string[] = [];

    // Check each session (handling wrap-around for Sydney)
    if (time >= 22 || time < 7) openMarkets.push('SYDNEY');
    if (time >= 0 && time < 9) openMarkets.push('TOKYO');
    if (time >= 8 && time < 16) openMarkets.push('LONDON');
    if (time >= 13 && time < 22) openMarkets.push('NEW_YORK');

    // Calculate quality (overlaps are best)
    let quality = 50;
    if (openMarkets.length >= 2) quality = 85; // Overlap = high liquidity
    else if (openMarkets.includes('LONDON') || openMarkets.includes('NEW_YORK')) quality = 75;
    else if (openMarkets.length === 1) quality = 60;
    else quality = 30; // Weekend or dead zone

    // Weekend check
    const day = now.getUTCDay();
    if (day === 0 || day === 6) {
        quality = 20;
        openMarkets.length = 0;
    }

    return {
        session: openMarkets.length > 0 ? openMarkets.join('+') : 'CLOSED',
        quality,
        openMarkets,
    };
}

// ===== ASSET-SPECIFIC TIMING SCORE =====
function calculateTimingScore(assetClass: string, symbol: string, timestamp?: number): number {
    const { quality, openMarkets } = getMarketSession(timestamp);

    // Base quality
    let score = quality;

    // Adjust by asset class and relevant session
    switch (assetClass) {
        case 'forex':
            // Forex: best during London+NY overlap
            if (openMarkets.includes('LONDON') && openMarkets.includes('NEW_YORK')) score = 95;
            else if (openMarkets.includes('LONDON') || openMarkets.includes('NEW_YORK')) score = 80;
            else if (openMarkets.length > 0) score = 60;
            else score = 30;
            break;

        case 'crypto':
            // Crypto: 24/7 but higher volume during US hours
            if (openMarkets.includes('NEW_YORK')) score = 85;
            else if (openMarkets.includes('LONDON')) score = 75;
            else score = 65; // Always tradeable
            break;

        case 'stock':
        case 'etf':
        case 'index':
            // US equities: only during NY session
            if (openMarkets.includes('NEW_YORK')) score = 90;
            else if (openMarkets.includes('LONDON')) score = 40; // Pre-market
            else score = 20; // Closed
            break;

        case 'commodity':
            // Commodities: best during NY+London
            if (openMarkets.includes('NEW_YORK')) score = 85;
            else if (openMarkets.includes('LONDON')) score = 70;
            else score = 40;
            break;

        case 'bond':
            // Bonds: US session
            if (openMarkets.includes('NEW_YORK')) score = 85;
            else score = 30;
            break;

        default:
            score = quality;
    }

    return Math.max(0, Math.min(100, score));
}

// ===== ASSET-SPECIFIC FLOW SCORE =====
function calculateFlowScore(symbol: string, assetClass: string, currentVolume: number): number {
    // Get expected average volume for this specific asset
    const cleanSymbol = symbol.replace('=X', '').replace('-USD', '').replace('=F', '').replace('^', '');

    let avgVolume = ASSET_AVG_VOLUMES[cleanSymbol];

    // Fallback to asset class average if specific not found
    if (!avgVolume) {
        avgVolume = ASSET_AVG_VOLUMES[`_${assetClass}`] || 1000000;
    }

    // Calculate ratio
    const volumeRatio = currentVolume / avgVolume;

    // Score based on ratio (higher volume = better liquidity = higher score)
    let score: number;
    if (volumeRatio >= 2.0) score = 95; // 2x average = exceptional
    else if (volumeRatio >= 1.5) score = 85;
    else if (volumeRatio >= 1.0) score = 75; // At average = good
    else if (volumeRatio >= 0.7) score = 60;
    else if (volumeRatio >= 0.5) score = 45;
    else score = 30; // Low volume = caution

    return score;
}

// ===== CROSS-ASSET CORRELATION SCORE =====
// Real correlation factors between asset classes
const CORRELATION_MATRIX: Record<string, Record<string, number>> = {
    stock: { stock: 0.8, etf: 0.9, index: 0.95, bond: -0.3, commodity: 0.2, forex: 0.1, crypto: 0.4 },
    etf: { stock: 0.9, etf: 0.85, index: 0.9, bond: -0.2, commodity: 0.3, forex: 0.1, crypto: 0.35 },
    index: { stock: 0.95, etf: 0.9, index: 0.9, bond: -0.4, commodity: 0.2, forex: 0.15, crypto: 0.45 },
    bond: { stock: -0.3, etf: -0.2, index: -0.4, bond: 0.9, commodity: -0.1, forex: 0.3, crypto: -0.2 },
    commodity: { stock: 0.2, etf: 0.3, index: 0.2, bond: -0.1, commodity: 0.6, forex: -0.2, crypto: 0.3 },
    forex: { stock: 0.1, etf: 0.1, index: 0.15, bond: 0.3, commodity: -0.2, forex: 0.7, crypto: 0.2 },
    crypto: { stock: 0.4, etf: 0.35, index: 0.45, bond: -0.2, commodity: 0.3, forex: 0.2, crypto: 0.85 },
};

function calculateCrossAssetScore(
    assetClass: string,
    change: number,
    allQuotes: RealQuote[],
    regime: string
): number {
    // Get correlations for this asset class
    const correlations = CORRELATION_MATRIX[assetClass] || {};

    // Calculate how this asset is performing vs its correlated assets
    let alignmentScore = 0;
    let totalWeight = 0;

    for (const [otherClass, correlation] of Object.entries(correlations)) {
        if (otherClass === assetClass) continue;

        // Get average change for other asset class
        const otherAssets = allQuotes.filter(q => q.assetClass === otherClass);
        if (otherAssets.length === 0) continue;

        const avgOtherChange = otherAssets.reduce((sum, q) => sum + q.changePercent, 0) / otherAssets.length;

        // Check if correlation is being respected
        const expectedDirection = correlation > 0 ? avgOtherChange : -avgOtherChange;
        const actualAlignment = change * expectedDirection > 0 ? 1 : -1;

        // Weight by correlation strength
        const weight = Math.abs(correlation);
        alignmentScore += actualAlignment * weight;
        totalWeight += weight;
    }

    // Normalize to 0-100
    const normalizedAlignment = totalWeight > 0 ? alignmentScore / totalWeight : 0;
    let score = 50 + normalizedAlignment * 40; // Range: 10-90

    // Regime adjustment
    if (regime === 'STRESS') {
        // In stress, correlations break down - lower confidence
        score = score * 0.7 + 15;
    } else if (regime === 'RISK_OFF') {
        // Risk-off: negative correlations more reliable
        if (assetClass === 'bond' && change > 0) score += 10;
    }

    return Math.max(0, Math.min(100, score));
}

// ===== CALCULATE SCORE (FULLY INDIVIDUALIZED) =====
function calculateScore(
    quote: RealQuote,
    data: MarketData & { atr: number; calculatedRsi: number },
    macro: MacroData,
    regime: string,
    allQuotes: RealQuote[] = [],
    timestamp?: number
): { total: number; components: Record<string, number> } {

    // Base components
    const components: Record<string, number> = {};

    // 1. MACRO (15%) - Asset-class specific
    let macroScore = 50;

    // Different macro factors matter for different asset classes
    switch (quote.assetClass) {
        case 'stock':
        case 'etf':
        case 'index':
            // Equities: VIX inverse, yield curve matters
            if (macro.vix < 18) macroScore = 80;
            else if (macro.vix < 22) macroScore = 65;
            else if (macro.vix > 28) macroScore = 25;
            if (macro.yieldCurve > 0) macroScore += 10;
            if (macro.fearGreed && macro.fearGreed.value > 60) macroScore += 5;
            break;

        case 'bond':
            // Bonds: inverse to stocks, benefit from high VIX
            if (macro.vix > 25) macroScore = 80; // Flight to safety
            else if (macro.vix < 18) macroScore = 40;
            if (macro.yieldCurve < 0) macroScore += 10; // Inverted = more demand
            break;

        case 'commodity':
            // Commodities: inflation sensitive, dollar inverse
            if (macro.dollarIndex > 0 && macro.dollarIndex < 100) macroScore += 10;
            else if (macro.dollarIndex > 105) macroScore -= 10;
            break;

        case 'forex':
            // Forex: yield differentials, volatility
            if (macro.vix < 20) macroScore = 70; // Low vol = cleaner trends
            else if (macro.vix > 25) macroScore = 50; // Higher vol = choppier
            break;

        case 'crypto':
            // Crypto: risk sentiment, Fear & Greed specific to crypto
            if (macro.fearGreed) {
                // Fear & Greed index is already crypto-specific from alternative.me
                if (macro.fearGreed.value > 60) macroScore = 75;
                else if (macro.fearGreed.value < 30) macroScore = 60; // Potential contrarian
                else macroScore = 55;
            }
            if (macro.vix < 20) macroScore += 10; // Risk-on helps crypto
            break;
    }
    components.macro = Math.min(100, Math.max(0, macroScore));

    // 2. TREND (15%) - Individual asset
    components.trend = data.trend;

    // 3. MOMENTUM (10%) - Individual asset RSI
    let momentumScore = 50;
    const rsi = data.rsi;
    if (rsi > 50 && rsi < 70) momentumScore = 70;
    else if (rsi >= 70 && rsi < 80) momentumScore = 45; // Overbought
    else if (rsi >= 80) momentumScore = 30; // Extreme overbought
    else if (rsi <= 30 && rsi > 20) momentumScore = 65; // Oversold reversal
    else if (rsi <= 20) momentumScore = 50; // Extreme oversold - risky
    else momentumScore = 55;
    components.momentum = momentumScore;

    // 4. VOLATILITY (10%) - Individual asset
    let volScore = 100 - data.volatility;
    if (data.volatility < 20) volScore = 85; // Very low vol
    else if (data.volatility < 40) volScore = 70;
    else if (data.volatility > 70) volScore = 30; // High vol = risky
    components.volatility = Math.max(0, Math.min(100, volScore));

    // 5. FLOW (10%) - REAL: Compare with asset-specific average
    components.flow = calculateFlowScore(quote.symbol, quote.assetClass, quote.volume);

    // 6. TECHNICAL (10%) - Individual asset
    components.technical = (data.trend + data.rsi) / 2;

    // 7. FRACTAL/SMC (10%) - Individual asset
    components.fractal = data.fractalScore;

    // 8. CROSS-ASSET (5%) - REAL: Calculate correlations
    components.crossAsset = calculateCrossAssetScore(quote.assetClass, quote.changePercent, allQuotes, regime);

    // 9. TIMING (5%) - REAL: Market session analysis
    components.timing = calculateTimingScore(quote.assetClass, quote.symbol, timestamp);

    // 10. RISK/REWARD (10%) - Individual asset ATR
    let rrScore = 50;
    if (data.atr > 0) {
        const atrPercent = (data.atr / quote.price) * 100;
        // Good ATR means tradeable ranges
        if (atrPercent > 1 && atrPercent < 3) rrScore = 80; // Sweet spot
        else if (atrPercent >= 3 && atrPercent < 5) rrScore = 70;
        else if (atrPercent >= 5) rrScore = 50; // Too volatile
        else if (atrPercent < 0.5) rrScore = 40; // Too tight
        else rrScore = 60;
    }
    components.riskReward = rrScore;

    // Apply regime adjustments
    const adjustments = REGIME_ADJUSTMENTS[regime] || {};
    let adjustedTotal = 0;
    let totalWeight = 0;

    for (const [key, value] of Object.entries(components)) {
        const weight = WEIGHTS[key.toUpperCase() as keyof typeof WEIGHTS] || 0.1;
        const adjustment = adjustments[key.toUpperCase()] || 1.0;
        adjustedTotal += value * weight * adjustment;
        totalWeight += weight * adjustment;
    }

    const total = Math.min(100, Math.round((adjustedTotal / totalWeight)));

    return { total, components };
}


// ===== CALCULATE ENTRY/SL/TP =====
function calculateLevels(
    quote: RealQuote,
    direction: 'LONG' | 'SHORT',
    regime: string
): {
    entryZone: { low: number; high: number };
    stopLoss: number;
    takeProfits: { price: number; ratio: string; probability: number }[];
} {
    const price = quote.price;
    const atr = quote.atr || (price * 0.02); // Default 2% if no ATR

    // ATR multiplier by regime
    const slMult: Record<string, number> = {
        RISK_ON: 1.5,
        RISK_OFF: 2.0,
        TRANSITION: 2.5,
        STRESS: 3.0,
    };
    const mult = slMult[regime] || 2.0;

    if (direction === 'LONG') {
        const entryLow = price - (atr * 0.3);
        const entryHigh = price + (atr * 0.2);
        const stopLoss = price - (atr * mult);
        const slDistance = price - stopLoss;

        return {
            entryZone: { low: entryLow, high: entryHigh },
            stopLoss,
            takeProfits: [
                { price: price + (slDistance * 1.5), ratio: '1.5:1', probability: 70 },
                { price: price + (slDistance * 2.5), ratio: '2.5:1', probability: 50 },
                { price: price + (slDistance * 4.0), ratio: '4:1', probability: 30 },
            ],
        };
    } else {
        const entryLow = price - (atr * 0.2);
        const entryHigh = price + (atr * 0.3);
        const stopLoss = price + (atr * mult);
        const slDistance = stopLoss - price;

        return {
            entryZone: { low: entryLow, high: entryHigh },
            stopLoss,
            takeProfits: [
                { price: price - (slDistance * 1.5), ratio: '1.5:1', probability: 70 },
                { price: price - (slDistance * 2.5), ratio: '2.5:1', probability: 50 },
                { price: price - (slDistance * 4.0), ratio: '4:1', probability: 30 },
            ],
        };
    }
}

// ===== GENERATE ONE-LINER =====
function generateOneLiner(
    symbol: string,
    direction: 'LONG' | 'SHORT',
    entry: number,
    tp1: number,
    tp2: number,
    sl: number,
    size: string,
    score: number,
    validity: number
): string {
    const dir = direction === 'LONG' ? 'BUY' : 'SELL';
    const formatPrice = (p: number) => {
        if (p > 1000) return p.toFixed(2);
        if (p > 10) return p.toFixed(2);
        return p.toFixed(4);
    };

    return `${symbol}: ${dir} ${formatPrice(entry)}→${formatPrice(tp1)}/${formatPrice(tp2)} | SL ${formatPrice(sl)} | ${size} | S:${score} | ${validity}h`;
}

// ===== EVALUATE SIGNALS =====
export function evaluateRealSignals(
    quotes: RealQuote[],
    marketData: (MarketData & { atr: number; calculatedRsi: number })[],
    macro: MacroData,
    regime: string,
    minScore: number = 55,
    timestamp?: number
): TradeSignal[] {
    const signals: TradeSignal[] = [];

    quotes.forEach((quote, index) => {
        const data = marketData[index];
        if (!data) return;

        const { total: score, components } = calculateScore(quote, data, macro, regime, quotes, timestamp);

        if (score >= minScore) {
            const direction: 'LONG' | 'SHORT' = data.trend > 50 ? 'LONG' : 'SHORT';
            const levels = calculateLevels(quote, direction, regime);

            let confidence: 'MODERATE' | 'STRONG' | 'INSTITUTIONAL';
            if (score >= 80) confidence = 'INSTITUTIONAL';
            else if (score >= 70) confidence = 'STRONG';
            else confidence = 'MODERATE';

            // Key drivers
            const keyDrivers: string[] = [];
            const sortedComps = Object.entries(components).sort((a, b) => b[1] - a[1]);
            for (const [comp, value] of sortedComps.slice(0, 3)) {
                if (value >= 60) keyDrivers.push(`${comp}: ${value.toFixed(0)}/100`);
            }

            // Reasons
            const reasons: string[] = [];
            if (data.trend > 60) reasons.push('Strong Trend');
            if (data.rsi > 30 && data.rsi < 70) reasons.push('RSI Balanced');
            if (data.volatility < 50) reasons.push('Low Volatility');
            if (macro.fearGreed && macro.fearGreed.value > 50) reasons.push('Greed in Market');
            if (macro.vix < 20) reasons.push('Low VIX');

            // Risks
            const risks: string[] = [];
            if (regime === 'TRANSITION') risks.push('Regime em transição');
            if (data.volatility > 60) risks.push('Alta volatilidade');
            if (data.rsi > 70) risks.push('Sobrecomprado');
            if (data.rsi < 30) risks.push('Sobrevendido');

            // Position sizing
            const riskPercent = score >= 80 ? 0.5 : score >= 70 ? 0.3 : 0.2;
            const positionSize = `${riskPercent}R`;

            const validityHours = regime === 'STRESS' ? 6 : regime === 'TRANSITION' ? 12 : 24;

            const oneLiner = generateOneLiner(
                quote.displaySymbol,
                direction,
                (levels.entryZone.low + levels.entryZone.high) / 2,
                levels.takeProfits[0].price,
                levels.takeProfits[1].price,
                levels.stopLoss,
                positionSize,
                score,
                validityHours
            );

            signals.push({
                id: `${quote.displaySymbol}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                asset: quote.displaySymbol,
                timestamp: Date.now(),
                direction,
                score,
                confidence,
                reasons: reasons.slice(0, 4),
                entryPrice: quote.price,
                price: quote.price,
                marketState: quote.marketState,
                entryZone: levels.entryZone,
                stopLoss: levels.stopLoss,
                takeProfits: levels.takeProfits,
                positionSize,
                riskR: riskPercent,
                oneLiner,
                rationale: `${direction} ${quote.displaySymbol}: ${keyDrivers.join(', ')}`,
                keyDrivers,
                risks,
                validityHours,
            });
        }
    });

    return signals.sort((a, b) => b.score - a.score);
}

// ===== GENERATE EXECUTIVE SUMMARY =====
export function generateExecutiveSummary(
    signals: TradeSignal[],
    regime: string,
    macro: MacroData
): string {
    if (signals.length === 0) {
        return `Sem oportunidades qualificadas. Regime: ${regime}. VIX: ${macro.vix.toFixed(1)}. Aguardar setup.`;
    }

    const longs = signals.filter(s => s.direction === 'LONG').length;
    const shorts = signals.filter(s => s.direction === 'SHORT').length;
    const avgScore = signals.reduce((sum, s) => sum + s.score, 0) / signals.length;
    const topSignal = signals[0];

    return `${signals.length} oportunidades (${longs}L/${shorts}S). Score médio: ${avgScore.toFixed(0)}. ` +
        `Top: ${topSignal.asset} ${topSignal.direction} S:${topSignal.score}. ` +
        `Regime: ${regime}. VIX: ${macro.vix.toFixed(1)}.`;
}

// ===== ENHANCED ENGINE V2 =====
// Integrates COT, MTF, Technical, SMC for better accuracy

export interface EnhancedSignal extends TradeSignal {
    enhancedComponents: {
        cot: number;
        mtf: number;
        technicalEnhanced: number;
        smc: number;
    };
    dataQuality: {
        cotAvailable: boolean;
        mtfAvailable: boolean;
        technicalAvailable: boolean;
        smcAvailable: boolean;
    };
}

// Cache for enhanced data (avoid refetching)
const enhancedDataCache: {
    cot: Record<string, COTData>;
    mtf: Record<string, MTFData>;
    technical: Record<string, TechnicalData>;
    smc: Record<string, SMCData>;
    lastFetch: number;
} = {
    cot: {},
    mtf: {},
    technical: {},
    smc: {},
    lastFetch: 0,
};

// ===== ENHANCED SCORE CALCULATION =====
function calculateEnhancedScore(
    quote: RealQuote,
    data: MarketData & { atr: number; calculatedRsi: number },
    macro: MacroData,
    regime: string,
    allQuotes: RealQuote[],
    enhancedData: {
        cot?: COTData;
        mtf?: MTFData;
        technical?: TechnicalData;
        smc?: SMCData;
    }
): { total: number; components: Record<string, number>; enhancedComponents: Record<string, number> } {

    // Get base components first
    const direction: 'LONG' | 'SHORT' = data.trend > 50 ? 'LONG' : 'SHORT';

    // Standard components
    const components: Record<string, number> = {};

    // MACRO with COT integration
    components.macro = calculateEnhancedMacroScore(macro, quote.assetClass, enhancedData.cot);

    // TREND
    components.trend = data.trend;

    // MOMENTUM
    const rsi = data.rsi;
    let momentumScore = 50;
    if (rsi > 50 && rsi < 70) momentumScore = 70;
    else if (rsi >= 70 && rsi < 80) momentumScore = 45;
    else if (rsi >= 80) momentumScore = 30;
    else if (rsi <= 30 && rsi > 20) momentumScore = 65;
    else if (rsi <= 20) momentumScore = 50;
    else momentumScore = 55;
    components.momentum = momentumScore;

    // VOLATILITY
    let volScore = 100 - data.volatility;
    if (data.volatility < 20) volScore = 85;
    else if (data.volatility < 40) volScore = 70;
    else if (data.volatility > 70) volScore = 30;
    components.volatility = Math.max(0, Math.min(100, volScore));

    // FLOW
    components.flow = calculateFlowScore(quote.symbol, quote.assetClass, quote.volume);

    // TIMING
    components.timing = calculateTimingScore(quote.assetClass, quote.symbol);

    // CROSS-ASSET
    components.crossAsset = calculateCrossAssetScore(quote.assetClass, quote.changePercent, allQuotes, regime);

    // RISK/REWARD
    let rrScore = 50;
    if (data.atr > 0) {
        const atrPercent = (data.atr / quote.price) * 100;
        if (atrPercent > 1 && atrPercent < 3) rrScore = 80;
        else if (atrPercent >= 3 && atrPercent < 5) rrScore = 70;
        else if (atrPercent >= 5) rrScore = 50;
        else if (atrPercent < 0.5) rrScore = 40;
        else rrScore = 60;
    }
    components.riskReward = rrScore;

    // ENHANCED COMPONENTS
    const enhancedComponents: Record<string, number> = {};

    // COT Score
    enhancedComponents.cot = enhancedData.cot ? calculateCOTScore(enhancedData.cot, quote.assetClass) : 50;

    // MTF Score
    enhancedComponents.mtf = enhancedData.mtf ? calculateMTFScore(enhancedData.mtf) : 50;

    // Technical Enhanced Score (RSI, MACD, EMAs)
    enhancedComponents.technical = enhancedData.technical
        ? calculateEnhancedTechnicalScore(enhancedData.technical, direction)
        : (data.trend + data.rsi) / 2;

    // SMC Score (Order Blocks, FVGs, BOS/CHoCH)
    enhancedComponents.smc = enhancedData.smc
        ? calculateSMCScore(enhancedData.smc, quote.price, direction)
        : data.fractalScore;

    // Calculate weighted total with enhanced weights
    const adjustments = REGIME_ADJUSTMENTS[regime] || {};
    let weightedSum = 0;
    let totalWeight = 0;

    // Standard components with enhanced weights
    const componentWeights: Record<string, number> = {
        macro: ENHANCED_WEIGHTS.MACRO,
        trend: ENHANCED_WEIGHTS.TREND,
        momentum: ENHANCED_WEIGHTS.MOMENTUM,
        volatility: ENHANCED_WEIGHTS.VOLATILITY,
        flow: ENHANCED_WEIGHTS.FLOW,
        timing: ENHANCED_WEIGHTS.TIMING,
        crossAsset: ENHANCED_WEIGHTS.CROSS_ASSET,
        riskReward: ENHANCED_WEIGHTS.RISK_REWARD,
    };

    // Enhanced component weights
    const enhancedWeights: Record<string, number> = {
        cot: ENHANCED_WEIGHTS.COT,
        mtf: ENHANCED_WEIGHTS.MTF,
        technical: ENHANCED_WEIGHTS.TECHNICAL,
        smc: ENHANCED_WEIGHTS.SMC,
    };

    // Sum standard components
    for (const [key, value] of Object.entries(components)) {
        const weight = componentWeights[key] || 0;
        const adjustment = adjustments[key.toUpperCase()] || 1.0;
        weightedSum += value * weight * adjustment;
        totalWeight += weight * adjustment;
    }

    // Sum enhanced components
    for (const [key, value] of Object.entries(enhancedComponents)) {
        const weight = enhancedWeights[key] || 0;
        // No regime adjustment for enhanced components (they're already sophisticated)
        weightedSum += value * weight;
        totalWeight += weight;
    }

    const total = Math.min(100, Math.round(weightedSum / totalWeight));

    return { total, components, enhancedComponents };
}

// ===== EVALUATE ENHANCED SIGNALS =====
export async function evaluateEnhancedSignals(
    quotes: RealQuote[],
    marketData: (MarketData & { atr: number; calculatedRsi: number })[],
    macro: MacroData,
    regime: string,
    minScore: number = 55,
    fetchEnhanced: boolean = true
): Promise<EnhancedSignal[]> {

    const signals: EnhancedSignal[] = [];

    // Fetch enhanced data if enabled (with 5-minute cache)
    const now = Date.now();
    if (fetchEnhanced && now - enhancedDataCache.lastFetch > 5 * 60 * 1000) {
        // Fetch COT data for all
        const symbols = quotes.map(q => q.symbol);
        enhancedDataCache.cot = await fetchCOTData(symbols);
        enhancedDataCache.lastFetch = now;

        // Fetch MTF, Technical, SMC only for top candidates (to save API calls)
        const topCandidates = quotes
            .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
            .slice(0, 20);

        for (const quote of topCandidates) {
            const [mtf, tech, smc] = await Promise.all([
                fetchMTFData(quote.symbol),
                fetchTechnicalData(quote.symbol),
                fetchSMCData(quote.symbol),
            ]);

            if (mtf) enhancedDataCache.mtf[quote.symbol] = mtf;
            if (tech) enhancedDataCache.technical[quote.symbol] = tech;
            if (smc) enhancedDataCache.smc[quote.symbol] = smc;
        }
    }

    // Evaluate each quote
    quotes.forEach((quote, index) => {
        const data = marketData[index];
        if (!data) return;

        // Get enhanced data from cache
        const enhancedData = {
            cot: enhancedDataCache.cot[quote.symbol],
            mtf: enhancedDataCache.mtf[quote.symbol],
            technical: enhancedDataCache.technical[quote.symbol],
            smc: enhancedDataCache.smc[quote.symbol],
        };

        const { total: score, components, enhancedComponents } = calculateEnhancedScore(
            quote, data, macro, regime, quotes, enhancedData
        );

        if (score >= minScore) {
            const direction: 'LONG' | 'SHORT' = data.trend > 50 ? 'LONG' : 'SHORT';
            const levels = calculateLevels(quote, direction, regime);

            let confidence: 'MODERATE' | 'STRONG' | 'INSTITUTIONAL';
            if (score >= 80) confidence = 'INSTITUTIONAL';
            else if (score >= 70) confidence = 'STRONG';
            else confidence = 'MODERATE';

            // Enhanced key drivers with priority to enhanced components
            const keyDrivers: string[] = [];
            const allComps = { ...components, ...enhancedComponents };
            const sortedComps = Object.entries(allComps).sort((a, b) => b[1] - a[1]);
            for (const [comp, value] of sortedComps.slice(0, 4)) {
                if (value >= 55) {
                    const label = comp.toUpperCase();
                    keyDrivers.push(`${label}: ${value.toFixed(0)}`);
                }
            }

            // Enhanced reasons with MTF and COT info
            const reasons: string[] = [];
            if (enhancedData.mtf && enhancedData.mtf.alignment > 70) {
                reasons.push(`MTF Aligned (${enhancedData.mtf.alignment.toFixed(0)}%)`);
            }
            if (enhancedData.cot && enhancedData.cot.institutionalBias !== 'NEUTRAL') {
                reasons.push(`Inst. ${enhancedData.cot.institutionalBias}`);
            }
            if (enhancedData.smc && enhancedData.smc.smcBias !== 'NEUTRAL') {
                reasons.push(`SMC ${enhancedData.smc.smcBias}`);
            }
            if (data.trend > 60) reasons.push('Strong Trend');
            if (macro.vix < 20) reasons.push('Low VIX');

            // Enhanced risks
            const risks: string[] = [];
            if (regime === 'TRANSITION') risks.push('Regime em transição');
            if (data.volatility > 60) risks.push('Alta volatilidade');
            if (enhancedData.cot && enhancedData.cot.extremePosition) {
                risks.push('COT Extreme Position');
            }
            if (enhancedData.mtf && enhancedData.mtf.alignment < 50) {
                risks.push('MTF Conflicting');
            }

            const riskPercent = score >= 80 ? 0.5 : score >= 70 ? 0.3 : 0.2;
            const positionSize = `${riskPercent}R`;
            const validityHours = regime === 'STRESS' ? 6 : regime === 'TRANSITION' ? 12 : 24;

            const oneLiner = generateOneLiner(
                quote.displaySymbol,
                direction,
                (levels.entryZone.low + levels.entryZone.high) / 2,
                levels.takeProfits[0].price,
                levels.takeProfits[1].price,
                levels.stopLoss,
                positionSize,
                score,
                validityHours
            );

            signals.push({
                id: `${quote.displaySymbol}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                asset: quote.displaySymbol,
                timestamp: Date.now(),
                direction,
                score,
                confidence,
                reasons: reasons.slice(0, 5),
                entryPrice: quote.price,
                price: quote.price,
                marketState: quote.marketState,
                entryZone: levels.entryZone,
                stopLoss: levels.stopLoss,
                takeProfits: levels.takeProfits,
                positionSize,
                riskR: riskPercent,
                oneLiner,
                rationale: `${direction} ${quote.displaySymbol}: ${keyDrivers.join(', ')}`,
                keyDrivers,
                risks,
                validityHours,
                enhancedComponents: {
                    cot: enhancedComponents.cot,
                    mtf: enhancedComponents.mtf,
                    technicalEnhanced: enhancedComponents.technical,
                    smc: enhancedComponents.smc,
                },
                dataQuality: {
                    cotAvailable: !!enhancedData.cot,
                    mtfAvailable: !!enhancedData.mtf,
                    technicalAvailable: !!enhancedData.technical,
                    smcAvailable: !!enhancedData.smc,
                },
            });
        }
    });

    return signals.sort((a, b) => b.score - a.score);
}
