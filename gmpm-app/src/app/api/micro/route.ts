import { NextResponse } from 'next/server';
import { serverLog } from '@/lib/serverLogs';

// Types
interface MesoInput {
    symbol: string;
    direction: 'LONG' | 'SHORT';
    class: string;
    reason: string;
}

type MTFTrend = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

type MTFSnapshot = {
    trends: {
        h4: MTFTrend;
        h1: MTFTrend;
        m15: MTFTrend;
    };
    alignment: 'ALIGNED' | 'CONFLICTING' | 'PARTIAL';
    confluenceScore: number;
    bias: 'LONG' | 'SHORT' | 'NEUTRAL';
};

interface TechnicalAnalysis {
    trend: {
        h4: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
        h1: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
        m15: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
        alignment: 'ALIGNED' | 'CONFLICTING' | 'PARTIAL';
    };
    structure: {
        lastBOS: 'BULLISH' | 'BEARISH' | null;
        lastCHoCH: 'BULLISH' | 'BEARISH' | null;
        currentPhase: 'IMPULSE' | 'CORRECTION' | 'RANGING';
    };
    levels: {
        resistance: number[];
        support: number[];
        pivot: number;
        atr: number;
    };
    indicators: {
        rsi: number;
        rsiDivergence: 'BULLISH' | 'BEARISH' | null;
        ema21: number;
        ema50: number;
        ema200: number;
        macdSignal: 'BUY' | 'SELL' | 'NEUTRAL';
        bbPosition: 'UPPER' | 'MIDDLE' | 'LOWER';
    };
    volume: {
        relative: number;
        trend: 'INCREASING' | 'DECREASING' | 'STABLE';
        climax: boolean;
    };
    smc: {
        orderBlocks: { type: 'BULLISH' | 'BEARISH'; low: number; high: number; tested: boolean }[];
        fvgs: { type: 'BULLISH' | 'BEARISH'; low: number; high: number; filled: boolean }[];
        liquidityPools: { type: 'BUY_SIDE' | 'SELL_SIDE'; level: number; strength: 'STRONG' | 'MODERATE' | 'WEAK' }[];
        premiumDiscount: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';
    };
}

async function fetchMTFSnapshot(symbol: string): Promise<MTFSnapshot | null> {
    try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const res = await fetch(`${baseUrl}/api/mtf?symbol=${encodeURIComponent(symbol)}&lite=1`, { cache: 'no-store' });
        if (!res.ok) return null;
        const json = await res.json();
        if (!json?.success || !json?.data?.timeframes) return null;

        const tf = json.data.timeframes as Record<string, { trend?: MTFTrend; strength?: number }>;
        const t4h = tf['4H']?.trend || 'NEUTRAL';
        const t1h = tf['1H']?.trend || 'NEUTRAL';
        const t15 = tf['15M']?.trend || 'NEUTRAL';
        const alignment = (t4h === t1h && t1h === t15)
            ? 'ALIGNED'
            : (t4h === t1h || t1h === t15 || t4h === t15)
                ? 'PARTIAL'
                : 'CONFLICTING';

        const confluenceScore = typeof json.data.confluence?.score === 'number' ? json.data.confluence.score : 50;
        const bias = (json.data.confluence?.bias as MTFSnapshot['bias']) || 'NEUTRAL';

        return {
            trends: { h4: t4h, h1: t1h, m15: t15 },
            alignment,
            confluenceScore,
            bias,
        };
    } catch {
        return null;
    }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
        while (true) {
            const idx = nextIndex;
            nextIndex += 1;
            if (idx >= items.length) return;
            results[idx] = await fn(items[idx]);
        }
    });

    await Promise.all(workers);
    return results;
}

interface SetupTrigger {
    price: number;
    condition: string;
    type: 'PRICE_BREAK' | 'CANDLE_CLOSE' | 'VOLUME_CONFIRM' | 'PATTERN_COMPLETE';
}

interface Setup {
    id: string;
    symbol: string;
    displaySymbol: string;
    type: 'BREAKOUT' | 'PULLBACK' | 'REVERSAL' | 'CONTINUATION' | 'LIQUIDITY_GRAB';
    direction: 'LONG' | 'SHORT';
    timeframe: 'M15' | 'H1' | 'H4';
    entry: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2: number;
    takeProfit3: number;
    riskReward: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    confluences: string[];
    invalidation: string;
    thesis: string;
    mesoAlignment: boolean;
    technicalScore: number;
    trigger?: SetupTrigger;
}

interface MicroAnalysis {
    symbol: string;
    displaySymbol: string;
    name?: string;
    assetClass?: string;
    price: number;
    technical: TechnicalAnalysis;
    setups: Setup[];
    recommendation: {
        action: 'EXECUTE' | 'WAIT' | 'AVOID';
        reason: string;
        bestSetup: Setup | null;
        trigger?: SetupTrigger;
        metrics?: {
            pWin: number;
            rrMin: number;
            evR: number;
            modelRisk: 'LOW' | 'MED' | 'HIGH';
        };
    };
    scenarioAnalysis?: {
        status: 'PRONTO' | 'DESENVOLVENDO' | 'CONTRA';
        statusReason: string;
        technicalAlignment: number;
        entryQuality: 'OTIMO' | 'BOM' | 'RUIM';
        timing: 'AGORA' | 'AGUARDAR' | 'PERDIDO';
        blockers: string[];
        catalysts: string[];
    };
    levelSources?: string[];
    adaptiveContext?: AdaptiveContext;
    // Liquidity integration
    liquidityAnalysis?: LiquidityAnalysis;
    liquidityTargets?: {
        primary: number;
        secondary: number;
        probability: number;
        alignment: string;
    };
}

// Adaptive Target Context from MACRO/MESO
interface AdaptiveContext {
    regime: string;
    volatilityContext: 'HIGH' | 'NORMAL' | 'LOW';
    classExpectation: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    classConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
    liquidityScore: number;
}

// Liquidity Analysis from /api/liquidity-map
interface LiquidityAnalysis {
    liquidityScore: number;
    toleranceProfile: {
        toleranceScore: number;
        behaviorPattern: 'AGGRESSIVE_HUNTER' | 'SELECTIVE_HUNTER' | 'PASSIVE' | 'UNPREDICTABLE';
        description: string;
    };
    priceTargets: {
        direction: 'LONG' | 'SHORT';
        primaryTarget: number;
        primaryProbability: number;
        secondaryTarget: number;
        invalidationLevel: number;
        timeHorizon: string;
        rationale: string[];
    };
    captureAnalysis: {
        targetZone: { price: number; type: 'BUYSIDE' | 'SELLSIDE'; strength: number };
        captureProbability: number;
        expectedTimeframe: string;
    }[];
    mtfLiquidity: {
        alignment: 'ALIGNED_BUYSIDE' | 'ALIGNED_SELLSIDE' | 'CONFLICTING' | 'NEUTRAL';
        strongestTimeframe: 'M15' | 'H1' | 'H4' | 'D1';
    };
    historicalBehavior: {
        sweepFrequency: number;
        fakeoutRate: number;
    };
}

// Fetch liquidity analysis for a symbol
async function fetchLiquidityAnalysis(symbol: string): Promise<LiquidityAnalysis | null> {
    try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const res = await fetch(`${baseUrl}/api/liquidity-map?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
        if (!res.ok) return null;
        const json = await res.json();
        if (!json?.success || !json?.data) return null;
        
        const d = json.data;
        return {
            liquidityScore: d.liquidityScore || 50,
            toleranceProfile: d.toleranceProfile || { toleranceScore: 50, behaviorPattern: 'UNPREDICTABLE', description: '' },
            priceTargets: d.priceTargets || { direction: 'LONG', primaryTarget: 0, primaryProbability: 50, secondaryTarget: 0, invalidationLevel: 0, timeHorizon: '', rationale: [] },
            captureAnalysis: d.captureAnalysis || [],
            mtfLiquidity: d.mtfLiquidity || { alignment: 'NEUTRAL', strongestTimeframe: 'H1' },
            historicalBehavior: d.historicalBehavior || { sweepFrequency: 0, fakeoutRate: 50 }
        };
    } catch {
        return null;
    }
}

// Calculate adaptive multipliers based on MACRO/MESO context
// REALISTIC TARGETS: With ATR capped at 0.3-2% of price, multipliers give:
// SL: 0.5 * 1% = 0.5% risk, TP1: 1.0 * 1% = 1% reward (R:R 2:1)
function getAdaptiveMultipliers(context: AdaptiveContext, technical: TechnicalAnalysis): {
    slMultiplier: number;
    tp1Multiplier: number;
    tp2Multiplier: number;
    tp3Multiplier: number;
    useStructuralLevels: boolean;
} {
    // Base multipliers for conservative intraday/swing trading
    let slMultiplier = 0.5;   // 0.5 ATR stop (0.15% - 1% of price)
    let tp1Multiplier = 1.0;  // 1.0 ATR target (R:R 2:1)
    let tp2Multiplier = 1.5;  // 1.5 ATR extended
    let tp3Multiplier = 2.0;  // 2.0 ATR runner
    
    // MACRO REGIME ADJUSTMENTS
    if (context.regime === 'GOLDILOCKS' || context.regime === 'REFLATION') {
        // High conviction: slightly wider targets
        tp1Multiplier = 1.2;
        tp2Multiplier = 1.8;
        tp3Multiplier = 2.5;
        slMultiplier = 0.5;
    } else if (context.regime === 'RISK_OFF' || context.regime === 'LIQUIDITY_DRAIN') {
        // Conservative: tighter targets, wider stops
        tp1Multiplier = 0.8;
        tp2Multiplier = 1.2;
        tp3Multiplier = 1.5;
        slMultiplier = 0.7;
    } else if (context.regime === 'STAGFLATION') {
        // Uncertain: balanced approach
        tp1Multiplier = 1.0;
        tp2Multiplier = 1.5;
        tp3Multiplier = 2.0;
        slMultiplier = 0.6;
    }
    
    // MESO CLASS CONFIDENCE ADJUSTMENTS (smaller impact)
    if (context.classConfidence === 'HIGH') {
        tp1Multiplier *= 1.1;
        tp2Multiplier *= 1.1;
    } else if (context.classConfidence === 'LOW') {
        tp1Multiplier *= 0.9;
        slMultiplier *= 1.1;
    }
    
    // VOLATILITY CONTEXT ADJUSTMENTS
    if (context.volatilityContext === 'HIGH') {
        slMultiplier *= 1.2;
    } else if (context.volatilityContext === 'LOW') {
        slMultiplier *= 0.9;
    }
    
    // MICRO TECHNICAL ADJUSTMENTS
    if (technical.trend.alignment === 'ALIGNED') {
        tp2Multiplier *= 1.1;
        tp3Multiplier *= 1.15;
    }
    
    if (technical.volume.climax) {
        tp1Multiplier *= 0.9;
    }
    
    // Use structural levels if SMC data is strong
    const useStructuralLevels = 
        technical.smc.orderBlocks.length > 0 || 
        technical.smc.liquidityPools.length > 0 ||
        technical.levels.support.length >= 2;
    
    return { slMultiplier, tp1Multiplier, tp2Multiplier, tp3Multiplier, useStructuralLevels };
}

// Calculate smart levels using SMC and S/R
function calculateSmartLevels(
    price: number,
    atr: number,
    isLong: boolean,
    technical: TechnicalAnalysis,
    multipliers: { slMultiplier: number; tp1Multiplier: number; tp2Multiplier: number; tp3Multiplier: number; useStructuralLevels: boolean }
): { stopLoss: number; tp1: number; tp2: number; tp3: number; levelSources: string[] } {
    const { slMultiplier, tp1Multiplier, tp2Multiplier, tp3Multiplier, useStructuralLevels } = multipliers;
    const levelSources: string[] = [];
    
    // Default ATR-based levels
    let stopLoss = isLong ? price - (atr * slMultiplier) : price + (atr * slMultiplier);
    let tp1 = isLong ? price + (atr * tp1Multiplier) : price - (atr * tp1Multiplier);
    let tp2 = isLong ? price + (atr * tp2Multiplier) : price - (atr * tp2Multiplier);
    let tp3 = isLong ? price + (atr * tp3Multiplier) : price - (atr * tp3Multiplier);
    
    if (useStructuralLevels) {
        const { levels, smc } = technical;
        const maxTp1Dist = atr * tp1Multiplier * 2;
        const maxTp2Dist = atr * tp2Multiplier * 2;
        const maxTp3Dist = atr * tp3Multiplier * 2;
        const withinUp = (lvl: number, maxDist: number) => lvl > price && (lvl - price) <= maxDist;
        const withinDown = (lvl: number, maxDist: number) => lvl < price && (price - lvl) <= maxDist;
        
        // STOP LOSS: Use order blocks or support/resistance
        if (isLong) {
            // For longs, find nearest support below entry
            const supports = [...levels.support].filter(s => s < price).sort((a, b) => b - a);
            const bullishOBs = smc.orderBlocks.filter(ob => ob.type === 'BULLISH' && ob.high < price);
            
            if (bullishOBs.length > 0) {
                // Place SL below the order block
                const nearestOB = bullishOBs.sort((a, b) => b.high - a.high)[0];
                const obSL = nearestOB.low - (atr * 0.2);
                if (obSL > price - (atr * 2)) { // Don't use if too far
                    stopLoss = obSL;
                    levelSources.push('SL: Below Bullish OB');
                }
            } else if (supports.length > 0 && supports[0] > price - (atr * 2)) {
                stopLoss = supports[0] - (atr * 0.2);
                levelSources.push('SL: Below Support');
            } else {
                levelSources.push('SL: ATR-based');
            }
            
            // TAKE PROFITS: Use resistance levels and liquidity pools
            const resistances = [...levels.resistance].filter(r => r > price).sort((a, b) => a - b);
            const sellLiquidity = smc.liquidityPools.filter(lp => lp.type === 'SELL_SIDE' && lp.level > price);
            
            if (resistances.length >= 1) {
                const candidate = resistances[0];
                if (withinUp(candidate, maxTp1Dist)) {
                    tp1 = candidate;
                    levelSources.push('TP1: Resistance');
                } else {
                    levelSources.push('TP1: ATR-based (structural too far)');
                }
            }
            if (resistances.length >= 2) {
                const candidate = resistances[1];
                if (withinUp(candidate, maxTp2Dist)) {
                    tp2 = candidate;
                    levelSources.push('TP2: Resistance');
                } else {
                    levelSources.push('TP2: ATR-based (structural too far)');
                }
            }
            if (sellLiquidity.length > 0) {
                const liquidityTarget = sellLiquidity.sort((a, b) => a.level - b.level)[0].level;
                if (liquidityTarget > tp2 && withinUp(liquidityTarget, maxTp3Dist)) {
                    tp3 = liquidityTarget;
                    levelSources.push('TP3: Liquidity Pool');
                } else if (!withinUp(liquidityTarget, maxTp3Dist)) {
                    levelSources.push('TP3: ATR-based (liquidity too far)');
                }
            }
        } else {
            // For shorts, find nearest resistance above entry
            const resistances = [...levels.resistance].filter(r => r > price).sort((a, b) => a - b);
            const bearishOBs = smc.orderBlocks.filter(ob => ob.type === 'BEARISH' && ob.low > price);
            
            if (bearishOBs.length > 0) {
                const nearestOB = bearishOBs.sort((a, b) => a.low - b.low)[0];
                const obSL = nearestOB.high + (atr * 0.2);
                if (obSL < price + (atr * 2)) {
                    stopLoss = obSL;
                    levelSources.push('SL: Above Bearish OB');
                }
            } else if (resistances.length > 0 && resistances[0] < price + (atr * 2)) {
                stopLoss = resistances[0] + (atr * 0.2);
                levelSources.push('SL: Above Resistance');
            } else {
                levelSources.push('SL: ATR-based');
            }
            
            // TAKE PROFITS: Use support levels and liquidity pools
            const supports = [...levels.support].filter(s => s < price).sort((a, b) => b - a);
            const buyLiquidity = smc.liquidityPools.filter(lp => lp.type === 'BUY_SIDE' && lp.level < price);
            
            if (supports.length >= 1) {
                const candidate = supports[0];
                if (withinDown(candidate, maxTp1Dist)) {
                    tp1 = candidate;
                    levelSources.push('TP1: Support');
                } else {
                    levelSources.push('TP1: ATR-based (structural too far)');
                }
            }
            if (supports.length >= 2) {
                const candidate = supports[1];
                if (withinDown(candidate, maxTp2Dist)) {
                    tp2 = candidate;
                    levelSources.push('TP2: Support');
                } else {
                    levelSources.push('TP2: ATR-based (structural too far)');
                }
            }
            if (buyLiquidity.length > 0) {
                const liquidityTarget = buyLiquidity.sort((a, b) => b.level - a.level)[0].level;
                if (liquidityTarget < tp2 && withinDown(liquidityTarget, maxTp3Dist)) {
                    tp3 = liquidityTarget;
                    levelSources.push('TP3: Liquidity Pool');
                } else if (!withinDown(liquidityTarget, maxTp3Dist)) {
                    levelSources.push('TP3: ATR-based (liquidity too far)');
                }
            }
        }
    } else {
        levelSources.push('All levels: ATR-based');
    }
    
    return { stopLoss, tp1, tp2, tp3, levelSources };
}

// Fetch meso inputs with full context
async function fetchMesoInputs(): Promise<{ 
    instruments: MesoInput[]; 
    prohibited: string[];
    context: { favoredDirection: string; volatilityContext: string; regime: string; bias: string; classAnalysis?: Record<string, { expectation: string; confidence: string; liquidityScore: number }> };
}> {
    try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const res = await fetch(`${baseUrl}/api/meso`, { cache: 'no-store' });
        const data = await res.json();
        if (data.success) {
            return {
                instruments: data.microInputs?.allowedInstruments || [],
                prohibited: data.microInputs?.prohibitedInstruments?.map((p: { symbol: string }) => p.symbol) || [],
                context: {
                    favoredDirection: data.microInputs?.favoredDirection || 'NEUTRAL',
                    volatilityContext: data.microInputs?.volatilityContext || 'NORMAL',
                    regime: data.regime?.type || 'NEUTRAL',
                    bias: data.executiveSummary?.marketBias || 'NEUTRAL',
                    classAnalysis: data.classAnalysis?.reduce((acc: Record<string, { expectation: string; confidence: string; liquidityScore: number }>, cls: { class: string; expectation: string; confidence: string; liquidityScore: number }) => {
                        acc[cls.class] = { expectation: cls.expectation, confidence: cls.confidence, liquidityScore: cls.liquidityScore };
                        return acc;
                    }, {}) || {},
                }
            };
        }
    } catch (e) {
        serverLog('warn', 'micro_meso_inputs_fetch_failed', { error: String(e) }, 'api/micro');
    }
    return { instruments: [], prohibited: [], context: { favoredDirection: 'NEUTRAL', volatilityContext: 'NORMAL', regime: 'NEUTRAL', bias: 'NEUTRAL', classAnalysis: {} } };
}

// Fetch market data for symbols in batches to avoid URL length limits
async function fetchMarketData(symbols: string[]): Promise<Map<string, { price: number; high: number; low: number; volume: number; avgVolume: number; rsi: number; history: number[]; name?: string; assetClass?: string }>> {
    const result = new Map();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    if (symbols.length === 0) return result;
    
    // Batch symbols to avoid URL length limits (max 50 per request)
    const BATCH_SIZE = 50;
    const batches: string[][] = [];
    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        batches.push(symbols.slice(i, i + BATCH_SIZE));
    }
    
    // Process batches in parallel (max 3 concurrent)
    const batchResults = await mapWithConcurrency(batches, 3, async (batch) => {
        try {
            const symbolsParam = batch.map((s) => String(s || '').trim()).filter(Boolean).join(',');
            const res = await fetch(`${baseUrl}/api/market?symbols=${encodeURIComponent(symbolsParam)}&macro=0`, { cache: 'no-store' });
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
                return data.data;
            }
            return [];
        } catch (e) {
            serverLog('warn', 'micro_market_batch_failed', { error: String(e), batch: batch.slice(0, 5) }, 'api/micro');
            return [];
        }
    });
    
    // Merge all batch results
    const allAssets = batchResults.flat();
    
    for (const asset of allAssets) {
        const aSym = typeof asset.symbol === 'string' ? asset.symbol : '';
        const aDisp = typeof asset.displaySymbol === 'string' ? asset.displaySymbol : '';
        const normalize = (s: string) => s.replace('=X', '').replace('-USD', '').replace('=F', '');
        const aN = normalize(aSym || aDisp);
        const matches = symbols.some((s) => {
            const sN = normalize(s);
            return s === aSym || s === aDisp || sN === aN;
        });

        if (matches) {
            const payload = {
                price: asset.price,
                high: asset.high,
                low: asset.low,
                volume: asset.volume,
                avgVolume: typeof asset.avgVolume === 'number' && Number.isFinite(asset.avgVolume) ? asset.avgVolume : 0,
                rsi: asset.rsi,
                history: asset.history || [],
                name: typeof asset.name === 'string' ? asset.name : undefined,
                assetClass: typeof asset.assetClass === 'string' ? asset.assetClass : undefined,
            };

            if (aSym) result.set(aSym, payload);
            if (aDisp) result.set(aDisp, payload);
        }
    }
    
    return result;
}

// Calculate EMA
function calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < prices.length; i++) {
        ema = prices[i] * k + ema * (1 - k);
    }
    return ema;
}

// Determine trend from price vs EMAs (more sensitive)
function determineTrend(price: number, ema21: number, ema50: number): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    const threshold = price * 0.001; // 0.1% threshold
    if (price > ema21 + threshold) return 'BULLISH';
    if (price < ema21 - threshold) return 'BEARISH';
    if (ema21 > ema50 + threshold) return 'BULLISH';
    if (ema21 < ema50 - threshold) return 'BEARISH';
    return 'NEUTRAL';
}

// Generate technical analysis for a symbol
function generateTechnicalAnalysis(
    symbol: string,
    marketData: { price: number; high: number; low: number; volume: number; avgVolume: number; rsi: number; history: number[] },
    mtf?: MTFSnapshot | null
): TechnicalAnalysis {
    const { price, high, low, rsi, history } = marketData;
    
    // Calculate EMAs from history
    const ema21 = history.length > 0 ? calculateEMA(history, 21) : price;
    const ema50 = history.length > 0 ? calculateEMA(history, 50) : price;
    const ema200 = history.length > 0 ? calculateEMA(history, 200) : price;
    
    const h4Trend = mtf?.trends?.h4 ?? determineTrend(price, ema50, ema200);
    const h1Trend = mtf?.trends?.h1 ?? determineTrend(price, ema21, ema50);
    const m15Trend = mtf?.trends?.m15 ?? determineTrend(price, price * 0.999, ema21);

    const alignment = mtf?.alignment ?? (
        h4Trend === h1Trend && h1Trend === m15Trend ? 'ALIGNED' :
            h4Trend === h1Trend || h1Trend === m15Trend ? 'PARTIAL' : 'CONFLICTING'
    );
    
    // Structure analysis - ATR normalized as percentage of price
    const dailyRange = high - low;
    const dailyRangePercent = price > 0 ? (dailyRange / price) : 0.01;
    // Cap ATR between 0.3% and 2% of price for realistic targets
    const atrPercent = Math.max(0.003, Math.min(0.02, dailyRangePercent));
    const atr = price * atrPercent;
    
    // RSI divergence (simplified)
    const rsiDivergence = rsi < 30 && price > ema21 ? 'BULLISH' :
        rsi > 70 && price < ema21 ? 'BEARISH' : null;
    
    // MACD signal (simplified from EMAs)
    const macdSignal = ema21 > ema50 && price > ema21 ? 'BUY' :
        ema21 < ema50 && price < ema21 ? 'SELL' : 'NEUTRAL';
    
    // Bollinger position (simplified)
    const bbUpper = ema21 + 2 * atr;
    const bbLower = ema21 - 2 * atr;
    const bbPosition = price > bbUpper ? 'UPPER' : price < bbLower ? 'LOWER' : 'MIDDLE';
    
    // Volume analysis
    const avgVolume = (typeof marketData.avgVolume === 'number' && Number.isFinite(marketData.avgVolume) && marketData.avgVolume > 0)
        ? marketData.avgVolume
        : 0;
    const relativeVolume = avgVolume > 0 ? marketData.volume / avgVolume : 1;
    
    // SMC analysis (simplified)
    const equilibrium = (high + low) / 2;
    const premiumDiscount = price > equilibrium + atr * 0.5 ? 'PREMIUM' :
        price < equilibrium - atr * 0.5 ? 'DISCOUNT' : 'EQUILIBRIUM';
    
    // Generate key levels
    const pivot = (high + low + price) / 3;
    const r1 = 2 * pivot - low;
    const r2 = pivot + (high - low);
    const s1 = 2 * pivot - high;
    const s2 = pivot - (high - low);
    
    // Order blocks (simplified - looking for significant levels)
    const orderBlocks: TechnicalAnalysis['smc']['orderBlocks'] = [];
    if (price > ema50) {
        orderBlocks.push({ type: 'BULLISH', low: s1, high: s1 + atr * 0.3, tested: false });
    } else {
        orderBlocks.push({ type: 'BEARISH', low: r1 - atr * 0.3, high: r1, tested: false });
    }
    
    // FVGs (simplified)
    const fvgs: TechnicalAnalysis['smc']['fvgs'] = [];
    if (dailyRange > atr * 1.5) {
        fvgs.push({
            type: price > ema21 ? 'BULLISH' : 'BEARISH',
            low: low + atr * 0.3,
            high: low + atr * 0.6,
            filled: false
        });
    }
    
    // Liquidity pools
    const liquidityPools: TechnicalAnalysis['smc']['liquidityPools'] = [
        { type: 'BUY_SIDE', level: high + atr * 0.5, strength: 'MODERATE' },
        { type: 'SELL_SIDE', level: low - atr * 0.5, strength: 'MODERATE' },
    ];
    
    return {
        trend: { h4: h4Trend, h1: h1Trend, m15: m15Trend, alignment },
        structure: {
            lastBOS: h1Trend === 'BULLISH' ? 'BULLISH' : h1Trend === 'BEARISH' ? 'BEARISH' : null,
            lastCHoCH: null,
            currentPhase: alignment === 'ALIGNED' ? 'IMPULSE' : alignment === 'CONFLICTING' ? 'RANGING' : 'CORRECTION',
        },
        levels: {
            resistance: [r1, r2],
            support: [s1, s2],
            pivot,
            atr,
        },
        indicators: {
            rsi,
            rsiDivergence,
            ema21,
            ema50,
            ema200,
            macdSignal,
            bbPosition,
        },
        volume: {
            relative: relativeVolume,
            trend: relativeVolume > 1.2 ? 'INCREASING' : relativeVolume < 0.8 ? 'DECREASING' : 'STABLE',
            climax: relativeVolume > 2,
        },
        smc: {
            orderBlocks,
            fvgs,
            liquidityPools,
            premiumDiscount,
        },
    };
}

// Analyze scenario progress - MICRO refines MESO scenarios
interface ScenarioAnalysis {
    status: 'PRONTO' | 'DESENVOLVENDO' | 'CONTRA';
    statusReason: string;
    technicalAlignment: number; // 0-100
    entryQuality: 'OTIMO' | 'BOM' | 'RUIM';
    timing: 'AGORA' | 'AGUARDAR' | 'PERDIDO';
    blockers: string[];
    catalysts: string[];
}

function analyzeScenarioProgress(
    technical: TechnicalAnalysis,
    mesoDirection: 'LONG' | 'SHORT'
): ScenarioAnalysis {
    const { trend, indicators, smc, volume } = technical;
    const blockers: string[] = [];
    const catalysts: string[] = [];
    let alignmentScore = 50;
    
    // 1. Trend alignment with MESO direction
    const trendAligned = (mesoDirection === 'LONG' && (trend.h4 === 'BULLISH' || trend.h1 === 'BULLISH')) ||
        (mesoDirection === 'SHORT' && (trend.h4 === 'BEARISH' || trend.h1 === 'BEARISH'));
    const trendContra = (mesoDirection === 'LONG' && trend.h4 === 'BEARISH') ||
        (mesoDirection === 'SHORT' && trend.h4 === 'BULLISH');
    
    if (trendAligned) {
        alignmentScore += 20;
        catalysts.push('Tendência alinhada com MESO');
    } else if (trendContra) {
        alignmentScore -= 30;
        blockers.push('Tendência H4 contrária à direção MESO');
    }
    
    // 2. Price zone quality
    const inDiscountForLong = smc.premiumDiscount === 'DISCOUNT' && mesoDirection === 'LONG';
    const inPremiumForShort = smc.premiumDiscount === 'PREMIUM' && mesoDirection === 'SHORT';
    const inGoodZone = inDiscountForLong || inPremiumForShort;
    const inBadZone = (smc.premiumDiscount === 'PREMIUM' && mesoDirection === 'LONG') ||
        (smc.premiumDiscount === 'DISCOUNT' && mesoDirection === 'SHORT');
    
    if (inGoodZone) {
        alignmentScore += 15;
        catalysts.push(`Preço em zona ${smc.premiumDiscount.toLowerCase()} favorável`);
    } else if (inBadZone) {
        alignmentScore -= 15;
        blockers.push(`Preço em zona ${smc.premiumDiscount.toLowerCase()} desfavorável`);
    }
    
    // 3. Momentum/RSI alignment
    const rsiSupportsLong = indicators.rsi > 40 && indicators.rsi < 70 && mesoDirection === 'LONG';
    const rsiSupportsShort = indicators.rsi > 30 && indicators.rsi < 60 && mesoDirection === 'SHORT';
    const rsiOverboughtForLong = indicators.rsi > 70 && mesoDirection === 'LONG';
    const rsiOversoldForShort = indicators.rsi < 30 && mesoDirection === 'SHORT';
    
    if (rsiSupportsLong || rsiSupportsShort) {
        alignmentScore += 10;
        catalysts.push(`RSI ${indicators.rsi.toFixed(0)} suporta ${mesoDirection}`);
    }
    if (rsiOverboughtForLong) {
        blockers.push('RSI sobrecomprado - aguardar pullback');
        alignmentScore -= 10;
    }
    if (rsiOversoldForShort) {
        blockers.push('RSI sobrevendido - aguardar bounce');
        alignmentScore -= 10;
    }
    
    // 4. Volume confirmation
    if (volume.trend === 'INCREASING') {
        alignmentScore += 10;
        catalysts.push('Volume expandindo');
    } else if (volume.trend === 'DECREASING') {
        blockers.push('Volume contraindo - aguardar confirmação');
    }
    
    // 5. SMC structures
    if (smc.orderBlocks.length > 0) {
        const nearOB = smc.orderBlocks[0];
        if ((nearOB.type === 'BULLISH' && mesoDirection === 'LONG') ||
            (nearOB.type === 'BEARISH' && mesoDirection === 'SHORT')) {
            alignmentScore += 10;
            catalysts.push(`Próximo de ${nearOB.type} Order Block`);
        }
    }
    if (smc.liquidityPools.length > 0) {
        catalysts.push('Liquidez disponível para captura');
    }
    
    // Determine status based on alignment
    let status: ScenarioAnalysis['status'];
    let statusReason: string;
    let entryQuality: ScenarioAnalysis['entryQuality'];
    let timing: ScenarioAnalysis['timing'];
    
    if (alignmentScore >= 75 && blockers.length === 0) {
        status = 'PRONTO';
        statusReason = `Cenário MESO confirmado tecnicamente. ${catalysts.slice(0, 2).join(', ')}.`;
        entryQuality = 'OTIMO';
        timing = 'AGORA';
    } else if (alignmentScore >= 60 && blockers.length <= 1) {
        status = 'PRONTO';
        statusReason = `Setup válido com ressalvas. ${blockers[0] || 'Monitorar volume.'}`;
        entryQuality = 'BOM';
        timing = 'AGORA';
    } else if (alignmentScore >= 45 || (trendAligned && blockers.length <= 2)) {
        status = 'DESENVOLVENDO';
        statusReason = `Cenário em formação. Aguardar: ${blockers.slice(0, 2).join('; ') || 'confirmação técnica'}.`;
        entryQuality = 'RUIM';
        timing = 'AGUARDAR';
    } else {
        status = 'CONTRA';
        statusReason = `Técnico não suporta direção MESO. ${blockers.slice(0, 2).join('; ')}.`;
        entryQuality = 'RUIM';
        timing = 'PERDIDO';
    }
    
    return {
        status,
        statusReason,
        technicalAlignment: Math.max(0, Math.min(100, alignmentScore)),
        entryQuality,
        timing,
        blockers,
        catalysts,
    };
}

// Generate setups from technical analysis with ADAPTIVE TARGETS based on MACRO/MESO/MICRO
function generateSetups(
    symbol: string,
    displaySymbol: string,
    price: number,
    technical: TechnicalAnalysis,
    mesoDirection: 'LONG' | 'SHORT',
    mesoReason: string,
    adaptiveContext?: AdaptiveContext
): { setup: Setup | null; scenarioAnalysis: ScenarioAnalysis; levelSources?: string[] } {
    const { trend, levels, indicators, smc } = technical;
    const atr = levels.atr;
    
    // First: analyze if MESO scenario is developing correctly
    const scenarioAnalysis = analyzeScenarioProgress(technical, mesoDirection);
    
    // If scenario is CONTRA, don't generate setup
    if (scenarioAnalysis.status === 'CONTRA') {
        return { setup: null, scenarioAnalysis };
    }
    
    // Generate confluence list
    const confluences: string[] = [...scenarioAnalysis.catalysts];
    
    // Determine setup type
    let setupType: Setup['type'] = 'CONTINUATION';
    if (technical.structure.lastBOS) setupType = 'BREAKOUT';
    if (smc.premiumDiscount !== 'EQUILIBRIUM') setupType = 'PULLBACK';
    if (indicators.rsiDivergence) setupType = 'REVERSAL';
    if (smc.fvgs.length > 0 && !smc.fvgs[0].filled) setupType = 'LIQUIDITY_GRAB';
    
    const isLong = mesoDirection === 'LONG';
    const entry = price;
    
    // ============================================
    // ADAPTIVE TARGET CALCULATION (MACRO → MESO → MICRO)
    // ============================================
    let stopLoss: number, tp1: number, tp2: number, tp3: number;
    let levelSources: string[] = [];
    
    if (adaptiveContext) {
        // Use adaptive multipliers based on MACRO regime and MESO class context
        const multipliers = getAdaptiveMultipliers(adaptiveContext, technical);
        
        // Calculate smart levels using SMC and S/R when available
        const smartLevels = calculateSmartLevels(price, atr, isLong, technical, multipliers);
        
        stopLoss = smartLevels.stopLoss;
        tp1 = smartLevels.tp1;
        tp2 = smartLevels.tp2;
        tp3 = smartLevels.tp3;
        levelSources = smartLevels.levelSources;
        
        // Add adaptive context to confluences
        confluences.push(`Regime: ${adaptiveContext.regime}`);
        confluences.push(`Class: ${adaptiveContext.classExpectation} (${adaptiveContext.classConfidence})`);
        if (levelSources.some(s => s.includes('OB'))) confluences.push('Order Block confluence');
        if (levelSources.some(s => s.includes('Liquidity'))) confluences.push('Liquidity target');
    } else {
        // Fallback to simple ATR-based calculation
        stopLoss = isLong ? entry - atr : entry + atr;
        tp1 = isLong ? entry + atr * 2 : entry - atr * 2;
        tp2 = isLong ? entry + atr * 3 : entry - atr * 3;
        tp3 = isLong ? entry + atr * 4 : entry - atr * 4;
        levelSources = ['All levels: ATR-based (no context)'];
    }
    
    const risk = Math.abs(entry - stopLoss);
    const reward = Math.abs(tp1 - entry);
    const riskReward = risk > 0 ? reward / risk : 2;
    
    const confidence: Setup['confidence'] = scenarioAnalysis.technicalAlignment >= 75 ? 'HIGH' :
        scenarioAnalysis.technicalAlignment >= 60 ? 'MEDIUM' : 'LOW';
    
    // Generate thesis incorporating MESO reason, scenario status, and level sources
    const levelInfo = levelSources.length > 0 ? ` | Levels: ${levelSources.slice(0, 2).join(', ')}` : '';
    const thesis = `[${scenarioAnalysis.status}] ${mesoReason} | ` +
        `${mesoDirection} ${displaySymbol}: ${setupType} @ ${smc.premiumDiscount.toLowerCase()}. ` +
        `${scenarioAnalysis.statusReason}${levelInfo}`;
    
    const setup: Setup = {
        id: `${symbol}-${setupType}-${Date.now()}`,
        symbol,
        displaySymbol,
        type: setupType,
        direction: mesoDirection,
        timeframe: trend.alignment === 'ALIGNED' ? 'H1' : 'M15',
        entry,
        stopLoss,
        takeProfit1: tp1,
        takeProfit2: tp2,
        takeProfit3: tp3,
        riskReward,
        confidence,
        confluences,
        invalidation: isLong ? `Close below ${stopLoss.toFixed(4)}` : `Close above ${stopLoss.toFixed(4)}`,
        thesis,
        mesoAlignment: scenarioAnalysis.status === 'PRONTO',
        technicalScore: scenarioAnalysis.technicalAlignment,
    };
    
    return { setup, scenarioAnalysis, levelSources };
}

// Calculate trigger for WAIT status - tells user exactly what price/condition activates the setup
function calculateTrigger(setup: Setup, technical: TechnicalAnalysis): SetupTrigger {
    const { direction, entry, type } = setup;
    const { levels, indicators, smc, volume } = technical;
    const isLong = direction === 'LONG';
    
    // 1. Volume confirmation needed
    if (volume.trend === 'DECREASING' || volume.relative < 0.8) {
        return {
            price: entry,
            condition: `Aguardar volume > 1.2x média (atual: ${volume.relative.toFixed(1)}x). Candle de confirmação com volume.`,
            type: 'VOLUME_CONFIRM',
        };
    }
    
    // 2. Price needs to break key level
    if (type === 'BREAKOUT') {
        const breakLevel = isLong ? levels.resistance[0] : levels.support[0];
        return {
            price: breakLevel,
            condition: isLong 
                ? `Rompimento acima de ${breakLevel.toFixed(4)} com fechamento de candle H1.`
                : `Rompimento abaixo de ${breakLevel.toFixed(4)} com fechamento de candle H1.`,
            type: 'PRICE_BREAK',
        };
    }
    
    // 3. Pullback to zone
    if (type === 'PULLBACK' || smc.premiumDiscount === 'EQUILIBRIUM') {
        const targetZone = isLong ? levels.support[0] : levels.resistance[0];
        return {
            price: targetZone,
            condition: isLong
                ? `Aguardar pullback até ${targetZone.toFixed(4)} (zona de desconto). Entrada no toque/rejeição.`
                : `Aguardar pullback até ${targetZone.toFixed(4)} (zona premium). Entrada no toque/rejeição.`,
            type: 'PRICE_BREAK',
        };
    }
    
    // 4. Order Block test
    if (smc.orderBlocks.length > 0) {
        const ob = smc.orderBlocks[0];
        const obLevel = isLong ? ob.low : ob.high;
        return {
            price: obLevel,
            condition: `Aguardar teste do Order Block em ${obLevel.toFixed(4)}. Entrada na rejeição com candle de reversão.`,
            type: 'CANDLE_CLOSE',
        };
    }
    
    // 5. RSI divergence confirmation
    if (indicators.rsiDivergence) {
        return {
            price: entry,
            condition: `Divergência ${indicators.rsiDivergence} detectada. Aguardar candle de confirmação (engolfo/pinbar).`,
            type: 'PATTERN_COMPLETE',
        };
    }
    
    // 6. Generic - need more confluence
    const nearestLevel = isLong ? levels.support[0] : levels.resistance[0];
    return {
        price: nearestLevel,
        condition: `Preço atual em zona neutra. Aguardar aproximação de ${nearestLevel.toFixed(4)} ou rompimento de estrutura.`,
        type: 'PRICE_BREAK',
    };
}

// Generate recommendation
function generateRecommendation(setups: Setup[], technical?: TechnicalAnalysis): {
    action: 'EXECUTE' | 'WAIT' | 'AVOID';
    reason: string;
    bestSetup: Setup | null;
    trigger?: SetupTrigger;
    metrics?: NonNullable<MicroAnalysis['recommendation']['metrics']>;
} {
    if (setups.length === 0) {
        return {
            action: 'WAIT',
            reason: 'No valid setups found. Insufficient confluences or poor R:R.',
            bestSetup: null,
        };
    }
    
    // Sort by technical score
    const sorted = [...setups].sort((a, b) => b.technicalScore - a.technicalScore);
    const best = sorted[0];

    const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

    const estimateRecommendationMetrics = (): NonNullable<MicroAnalysis['recommendation']['metrics']> => {
        let pWin = 0.45;

        pWin += clamp((best.technicalScore - 50) * 0.003, -0.18, 0.18);

        if (best.confidence === 'HIGH') pWin += 0.08;
        else if (best.confidence === 'MEDIUM') pWin += 0.03;
        else pWin -= 0.05;

        pWin += clamp((best.confluences.length - 2) * 0.02, -0.06, 0.08);

        const hasRegime = best.confluences.some(c => c.startsWith('Regime:'));
        if (hasRegime) pWin += 0.02;

        const hasOB = best.confluences.some(c => c.toLowerCase().includes('order block'));
        if (hasOB) pWin += 0.02;

        const hasLiquidityTarget = best.confluences.some(c => c.toLowerCase().includes('liquidity'));
        if (hasLiquidityTarget) pWin += 0.01;

        pWin = clamp(pWin, 0.25, 0.78);

        let modelRisk: 'LOW' | 'MED' | 'HIGH' = 'MED';
        if (best.confidence === 'HIGH' && best.confluences.length >= 3) modelRisk = 'LOW';
        if (best.confidence === 'LOW' || best.confluences.length <= 1) modelRisk = 'HIGH';

        const rrBreakeven = (1 - pWin) / pWin;
        const buffer = modelRisk === 'LOW' ? 0.15 : modelRisk === 'MED' ? 0.30 : 0.50;
        const rrMin = clamp(rrBreakeven * (1 + buffer), 1.05, 4.0);

        const rr = Number.isFinite(best.riskReward) ? best.riskReward : 0;
        const evR = (pWin * rr) - (1 - pWin);

        return { pWin, rrMin, evR, modelRisk };
    };

    const metrics = estimateRecommendationMetrics();

    // Helper to build trigger when technical data available
    const buildTrigger = (): SetupTrigger | undefined => {
        if (technical && best) return calculateTrigger(best, technical);
        return undefined;
    };

    if (!Number.isFinite(best.riskReward) || best.riskReward <= 0) {
        return {
            action: 'WAIT',
            reason: 'R:R inválido para decisão (dados insuficientes).',
            bestSetup: best,
            trigger: buildTrigger(),
            metrics,
        };
    }

    if (best.riskReward < metrics.rrMin) {
        const action = metrics.evR < 0 ? 'AVOID' : 'WAIT';
        return {
            action,
            reason: `R:R abaixo do mínimo dinâmico. Min ${metrics.rrMin.toFixed(2)} (pWin ${(metrics.pWin * 100).toFixed(0)}%, EV ${metrics.evR.toFixed(2)}R). Atual ${best.riskReward.toFixed(2)}.`,
            bestSetup: best,
            trigger: action === 'WAIT' ? buildTrigger() : undefined,
            metrics,
        };
    }

    const minExecuteEV = metrics.modelRisk === 'LOW' ? 0.10 : metrics.modelRisk === 'MED' ? 0.15 : 0.25;
    if (metrics.evR < minExecuteEV) {
        return {
            action: 'WAIT',
            reason: `EV abaixo do mínimo para execução. EV ${metrics.evR.toFixed(2)}R (min ${minExecuteEV.toFixed(2)}R).`,
            bestSetup: best,
            trigger: buildTrigger(),
            metrics,
        };
    }
    
    // EXECUTE if: HIGH confidence OR (MEDIUM with 3+ confluences)
    if (best.confidence === 'HIGH' || (best.confidence === 'MEDIUM' && best.confluences.length >= 3)) {
        return {
            action: 'EXECUTE',
            reason: `${best.confidence} confidence ${best.type} setup. ${best.confluences.length} confluences. R:R ${best.riskReward.toFixed(1)} (min ${metrics.rrMin.toFixed(2)}, EV ${metrics.evR.toFixed(2)}R).`,
            bestSetup: best,
            metrics,
        };
    }
    
    if (best.confidence === 'MEDIUM') {
        return {
            action: 'WAIT',
            reason: `Medium confidence, ${best.confluences.length} confluences. EV ${metrics.evR.toFixed(2)}R. Await more confirmation.`,
            bestSetup: best,
            trigger: buildTrigger(),
            metrics,
        };
    }
    
    return {
        action: 'AVOID',
        reason: `Low confidence. EV ${metrics.evR.toFixed(2)}R. Risk not justified.`,
        bestSetup: best,
        metrics,
    };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const symbolOverride = searchParams.get('symbol');
        const directionOverride = searchParams.get('direction');

        // 1. Fetch MESO inputs with full context
        const mesoData = await fetchMesoInputs();
        const { instruments, prohibited, context } = mesoData;

        if (symbolOverride) {
            const mtf = await fetchMTFSnapshot(symbolOverride);
            const directionFromMtf: MesoInput['direction'] = mtf?.bias === 'SHORT' ? 'SHORT' : 'LONG';
            const direction: MesoInput['direction'] = (directionOverride === 'SHORT' || directionOverride === 'LONG')
                ? (directionOverride as MesoInput['direction'])
                : directionFromMtf;

            const marketData = await fetchMarketData([symbolOverride]);
            const data = marketData.get(symbolOverride) || Array.from(marketData.entries())[0]?.[1];
            if (!data) {
                return NextResponse.json({
                    success: true,
                    timestamp: new Date().toISOString(),
                    analyses: [],
                    mesoContext: context,
                    summary: {
                        total: 0,
                        withSetups: 0,
                        executeReady: 0,
                        regime: context.regime,
                        bias: context.bias,
                        message: `Symbol ${symbolOverride}: sem dados de mercado.`,
                    },
                    prohibited,
                });
            }

            const technical = generateTechnicalAnalysis(symbolOverride, data, mtf);
            const adaptiveContext: AdaptiveContext = {
                regime: context.regime,
                volatilityContext: (context.volatilityContext as 'HIGH' | 'NORMAL' | 'LOW') || 'NORMAL',
                classExpectation: 'NEUTRAL',
                classConfidence: 'MEDIUM',
                liquidityScore: 50,
            };

            const { setup, scenarioAnalysis, levelSources } = generateSetups(
                symbolOverride,
                symbolOverride,
                data.price,
                technical,
                direction,
                'LAB override',
                adaptiveContext
            );

            const setups: Setup[] = setup ? [setup] : [];

            let recommendation: MicroAnalysis['recommendation'];
            if (scenarioAnalysis.status === 'CONTRA') {
                recommendation = { action: 'AVOID', reason: scenarioAnalysis.statusReason, bestSetup: null };
            } else if (scenarioAnalysis.status === 'DESENVOLVENDO') {
                const base = generateRecommendation(setups, technical);
                recommendation = {
                    action: 'WAIT',
                    reason: `${scenarioAnalysis.statusReason} | ${base.reason}`,
                    bestSetup: base.bestSetup,
                    trigger: base.trigger,
                    metrics: base.metrics,
                };
            } else {
                const base = generateRecommendation(setups, technical);
                recommendation = {
                    action: base.action,
                    reason: `${scenarioAnalysis.statusReason} Timing: ${scenarioAnalysis.timing}. Qualidade: ${scenarioAnalysis.entryQuality}. | ${base.reason}`,
                    bestSetup: base.bestSetup,
                    trigger: base.trigger,
                    metrics: base.metrics,
                };
            }

            const analysis: MicroAnalysis = {
                symbol: symbolOverride,
                displaySymbol: symbolOverride.replace('=X', '').replace('-USD', '').replace('=F', ''),
                name: data.name,
                assetClass: data.assetClass,
                price: data.price,
                technical,
                setups,
                recommendation,
                scenarioAnalysis,
                levelSources: levelSources || [],
                adaptiveContext,
            };

            return NextResponse.json({
                success: true,
                timestamp: new Date().toISOString(),
                analyses: [analysis],
                mesoContext: context,
                summary: {
                    total: 1,
                    withSetups: setups.length,
                    executeReady: recommendation.action === 'EXECUTE' ? 1 : 0,
                    regime: context.regime,
                    bias: context.bias,
                    message: `LAB: ${symbolOverride} (${direction})`,
                },
                prohibited,
            });
        }
        
        // 2. Filter to only real instruments (not placeholders)
        const realInstruments = instruments.filter((i: MesoInput) => 
            i.symbol && 
            !i.symbol.includes('Neutral') && 
            !i.symbol.includes('Reduced') && 
            !i.symbol.includes('gates')
        );
        
        // If no real instruments from MESO, return early with clear message
        if (realInstruments.length === 0) {
            return NextResponse.json({
                success: true,
                timestamp: new Date().toISOString(),
                analyses: [],
                mesoContext: context,
                summary: {
                    total: 0,
                    withSetups: 0,
                    executeReady: 0,
                    regime: context.regime,
                    bias: context.bias,
                    message: `Regime ${context.regime}: Aguardando instrumentos de qualidade do MESO. Nenhuma classe com direção clara.`,
                },
                prohibited,
            });
        }
        
        // 3. Fetch market data for MESO-approved symbols only
        const symbols = realInstruments.map((i: MesoInput) => i.symbol);
        const marketData = await fetchMarketData(symbols);
        
        // 4. Generate technical analysis for MESO-approved instruments only
        const analyses: MicroAnalysis[] = [];

        const mtfBySymbol = new Map<string, MTFSnapshot | null>();
        const mtfSnapshots = await mapWithConcurrency(
            realInstruments,
            4,
            async (i: MesoInput) => ({ symbol: i.symbol, mtf: await fetchMTFSnapshot(i.symbol) })
        );
        for (const s of mtfSnapshots) mtfBySymbol.set(s.symbol, s.mtf);
        
        for (const input of realInstruments) {
            // Check if symbol is prohibited
            if (prohibited.includes(input.symbol)) continue;
            
            const data = marketData.get(input.symbol) || 
                Array.from(marketData.entries()).find(([k]) => k.includes(input.symbol) || input.symbol.includes(k))?.[1];
            
            if (!data) continue;

            const technical = generateTechnicalAnalysis(input.symbol, data, mtfBySymbol.get(input.symbol));
            
            // Build adaptive context from MACRO/MESO
            const classInfo = context.classAnalysis?.[input.class] as { expectation?: string; confidence?: string; liquidityScore?: number } | undefined;
            const adaptiveContext: AdaptiveContext = {
                regime: context.regime,
                volatilityContext: (context.volatilityContext as 'HIGH' | 'NORMAL' | 'LOW') || 'NORMAL',
                classExpectation: (classInfo?.expectation as 'BULLISH' | 'BEARISH' | 'NEUTRAL') || 'NEUTRAL',
                classConfidence: (classInfo?.confidence as 'HIGH' | 'MEDIUM' | 'LOW') || 'MEDIUM',
                liquidityScore: classInfo?.liquidityScore || 50,
            };
            
            // MICRO refines MESO scenario with ADAPTIVE TARGETS
            const { setup, scenarioAnalysis, levelSources } = generateSetups(
                input.symbol, 
                input.symbol, 
                data.price, 
                technical, 
                input.direction,
                input.reason,
                adaptiveContext
            );
            
            // Build setups array (may be empty if scenario is CONTRA)
            const setups: Setup[] = setup ? [setup] : [];
            
            // Generate recommendation based on scenario status + setup quality (RR/confluences)
            let recommendation: MicroAnalysis['recommendation'];
            if (scenarioAnalysis.status === 'CONTRA') {
                recommendation = {
                    action: 'AVOID',
                    reason: scenarioAnalysis.statusReason,
                    bestSetup: null,
                };
            } else if (scenarioAnalysis.status === 'DESENVOLVENDO') {
                const base = generateRecommendation(setups, technical);
                recommendation = {
                    action: 'WAIT',
                    reason: `${scenarioAnalysis.statusReason} | ${base.reason}`,
                    bestSetup: base.bestSetup,
                    trigger: base.trigger,
                    metrics: base.metrics,
                };
            } else {
                const base = generateRecommendation(setups, technical);
                recommendation = {
                    action: base.action,
                    reason: `${scenarioAnalysis.statusReason} Timing: ${scenarioAnalysis.timing}. Qualidade: ${scenarioAnalysis.entryQuality}. | ${base.reason}`,
                    bestSetup: base.bestSetup,
                    trigger: base.trigger,
                    metrics: base.metrics,
                };
            }

            // Fetch liquidity analysis for enhanced insights
            const liquidityAnalysis = await fetchLiquidityAnalysis(input.symbol);
            
            // Enhance setup with liquidity-based targets if available
            if (setup && liquidityAnalysis && liquidityAnalysis.priceTargets.primaryTarget > 0) {
                const liqDir = liquidityAnalysis.priceTargets.direction;
                const mesoDir = input.direction;
                
                // If liquidity direction aligns with MESO, use liquidity targets
                if (liqDir === mesoDir) {
                    const liqTP = liquidityAnalysis.priceTargets.primaryTarget;
                    const currentTP1 = setup.takeProfit1;
                    
                    // Use liquidity target if it's closer and has good probability
                    if (liquidityAnalysis.priceTargets.primaryProbability >= 60) {
                        const isTPBetter = mesoDir === 'LONG' 
                            ? (liqTP > data.price && liqTP < currentTP1 * 1.5)
                            : (liqTP < data.price && liqTP > currentTP1 * 0.67);
                        
                        if (isTPBetter) {
                            setup.takeProfit1 = liqTP;
                            setup.confluences.push(`TP1 ajustado por liquidez (${liquidityAnalysis.priceTargets.primaryProbability}% prob)`);
                        }
                    }
                    
                    // Add liquidity invalidation if better than current
                    const liqInv = liquidityAnalysis.priceTargets.invalidationLevel;
                    if (liqInv > 0) {
                        const isSLBetter = mesoDir === 'LONG'
                            ? (liqInv < data.price && liqInv > setup.stopLoss)
                            : (liqInv > data.price && liqInv < setup.stopLoss);
                        
                        if (isSLBetter) {
                            setup.stopLoss = liqInv;
                            setup.confluences.push('SL ajustado por nível de liquidez');
                        }
                    }
                }
                
                // Adjust stop based on tolerance profile
                const behavior = liquidityAnalysis.toleranceProfile.behaviorPattern;
                if (behavior === 'PASSIVE') {
                    // Passive assets need wider stops
                    setup.stopLoss = mesoDir === 'LONG' 
                        ? setup.stopLoss * 0.995 
                        : setup.stopLoss * 1.005;
                    setup.confluences.push('SL ampliado (ativo passivo em liquidez)');
                }
            }
            
            const analysis: MicroAnalysis = {
                symbol: input.symbol,
                displaySymbol: input.symbol.replace('=X', '').replace('-USD', '').replace('=F', ''),
                name: data.name,
                assetClass: data.assetClass,
                price: data.price,
                technical,
                setups,
                recommendation,
                scenarioAnalysis,
                levelSources: levelSources || [],
                adaptiveContext,
                liquidityAnalysis: liquidityAnalysis || undefined,
                liquidityTargets: liquidityAnalysis ? {
                    primary: liquidityAnalysis.priceTargets.primaryTarget,
                    secondary: liquidityAnalysis.priceTargets.secondaryTarget,
                    probability: liquidityAnalysis.priceTargets.primaryProbability,
                    alignment: liquidityAnalysis.mtfLiquidity.alignment
                } : undefined,
            };
            analyses.push(analysis);
        }

        // Calculate composite ranking score for each analysis
        const rankedAnalyses = analyses.map(a => {
            let rankScore = 0;
            
            // 1. Action priority (40 pts max)
            if (a.recommendation.action === 'EXECUTE') rankScore += 40;
            else if (a.recommendation.action === 'WAIT') rankScore += 20;
            // AVOID = 0
            
            // 2. Scenario status (25 pts max)
            if (a.scenarioAnalysis?.status === 'PRONTO') rankScore += 25;
            else if (a.scenarioAnalysis?.status === 'DESENVOLVENDO') rankScore += 10;
            // CONTRA = 0
            
            // 3. Technical score from setup (20 pts max)
            const techScore = a.recommendation?.bestSetup?.technicalScore || 0;
            rankScore += Math.min(20, techScore / 5); // 100 tech score = 20 pts
            
            // 4. Risk/Reward (10 pts max)
            const rr = a.recommendation?.metrics?.rrMin || 0;
            rankScore += Math.min(10, rr * 3); // 3+ RR = 10 pts
            
            // 5. Entry quality (5 pts max)
            if (a.scenarioAnalysis?.entryQuality === 'OTIMO') rankScore += 5;
            else if (a.scenarioAnalysis?.entryQuality === 'BOM') rankScore += 3;
            
            // 6. Liquidity Score (10 pts max) - NEW
            const liqScore = a.liquidityAnalysis?.liquidityScore || 50;
            rankScore += Math.min(10, liqScore / 10); // 100 liq score = 10 pts
            
            // 7. Liquidity MTF Alignment (5 pts max) - NEW
            const liqAlign = a.liquidityAnalysis?.mtfLiquidity?.alignment;
            if (liqAlign === 'ALIGNED_BUYSIDE' || liqAlign === 'ALIGNED_SELLSIDE') rankScore += 5;
            else if (liqAlign === 'CONFLICTING') rankScore -= 3;
            
            // 8. Liquidity Behavior Pattern (5 pts max) - NEW
            const behavior = a.liquidityAnalysis?.toleranceProfile?.behaviorPattern;
            if (behavior === 'AGGRESSIVE_HUNTER') rankScore += 5;
            else if (behavior === 'SELECTIVE_HUNTER') rankScore += 3;
            else if (behavior === 'PASSIVE') rankScore -= 2;
            
            return { ...a, rankScore: Math.round(rankScore) };
        });
        
        // Sort by composite rank score (highest first)
        rankedAnalyses.sort((a, b) => b.rankScore - a.rankScore);
        
        // Add rank position
        const finalAnalyses = rankedAnalyses.map((a, idx) => ({ ...a, rank: idx + 1 }));

        const executeReady = finalAnalyses.filter(a => a.recommendation.action === 'EXECUTE').length;
        const withSetups = finalAnalyses.filter(a => a.setups.length > 0).length;

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            analyses: finalAnalyses,
            mesoContext: context,
            summary: {
                total: finalAnalyses.length,
                withSetups,
                executeReady,
                regime: context.regime,
                bias: context.bias,
                message: executeReady > 0
                    ? `${executeReady} setup(s) MESO-validado(s) prontos (Regime: ${context.regime})`
                    : withSetups > 0
                        ? `${withSetups} setup(s) identificados, aguardando confirmação técnica`
                        : `Regime ${context.regime}: Nenhum setup de alta convicção no momento`,
            },
            prohibited,
            mesoInstruments: realInstruments.slice(0, 10),
        });
    } catch (error) {
        serverLog('error', 'micro_api_error', { error: String(error) }, 'api/micro');
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
