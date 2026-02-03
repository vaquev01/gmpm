import { NextResponse } from 'next/server';

// Types
interface MesoInput {
    symbol: string;
    direction: 'LONG' | 'SHORT';
    class: string;
    reason: string;
}

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
}

interface MicroAnalysis {
    symbol: string;
    displaySymbol: string;
    price: number;
    technical: TechnicalAnalysis;
    setups: Setup[];
    recommendation: {
        action: 'EXECUTE' | 'WAIT' | 'AVOID';
        reason: string;
        bestSetup: Setup | null;
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
}

// Adaptive Target Context from MACRO/MESO
interface AdaptiveContext {
    regime: string;
    volatilityContext: 'HIGH' | 'NORMAL' | 'LOW';
    classExpectation: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    classConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
    liquidityScore: number;
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
                tp1 = resistances[0];
                levelSources.push('TP1: Resistance');
            }
            if (resistances.length >= 2) {
                tp2 = resistances[1];
                levelSources.push('TP2: Resistance');
            }
            if (sellLiquidity.length > 0) {
                const liquidityTarget = sellLiquidity.sort((a, b) => a.level - b.level)[0].level;
                if (liquidityTarget > tp2) {
                    tp3 = liquidityTarget;
                    levelSources.push('TP3: Liquidity Pool');
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
                tp1 = supports[0];
                levelSources.push('TP1: Support');
            }
            if (supports.length >= 2) {
                tp2 = supports[1];
                levelSources.push('TP2: Support');
            }
            if (buyLiquidity.length > 0) {
                const liquidityTarget = buyLiquidity.sort((a, b) => b.level - a.level)[0].level;
                if (liquidityTarget < tp2) {
                    tp3 = liquidityTarget;
                    levelSources.push('TP3: Liquidity Pool');
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
        console.error('Failed to fetch meso inputs:', e);
    }
    return { instruments: [], prohibited: [], context: { favoredDirection: 'NEUTRAL', volatilityContext: 'NORMAL', regime: 'NEUTRAL', bias: 'NEUTRAL', classAnalysis: {} } };
}

// Fetch market data for a symbol
async function fetchMarketData(symbols: string[]): Promise<Map<string, { price: number; high: number; low: number; volume: number; rsi: number; history: number[] }>> {
    const result = new Map();
    try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const res = await fetch(`${baseUrl}/api/market?limit=300`, { cache: 'no-store' });
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
            for (const asset of data.data) {
                if (symbols.some(s => asset.symbol?.includes(s) || asset.displaySymbol?.includes(s))) {
                    result.set(asset.displaySymbol || asset.symbol, {
                        price: asset.price,
                        high: asset.high,
                        low: asset.low,
                        volume: asset.volume,
                        rsi: asset.rsi,
                        history: asset.history || [],
                    });
                }
            }
        }
    } catch (e) {
        console.error('Failed to fetch market data:', e);
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

// Calculate ATR
function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
    if (highs.length < period + 1) return (highs[0] - lows[0]) || 0;
    const trs: number[] = [];
    for (let i = 1; i < highs.length && i <= period; i++) {
        const tr = Math.max(
            highs[i] - lows[i],
            Math.abs(highs[i] - closes[i - 1]),
            Math.abs(lows[i] - closes[i - 1])
        );
        trs.push(tr);
    }
    return trs.reduce((a, b) => a + b, 0) / trs.length;
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
    marketData: { price: number; high: number; low: number; volume: number; rsi: number; history: number[] }
): TechnicalAnalysis {
    const { price, high, low, rsi, history } = marketData;
    
    // Calculate EMAs from history
    const ema21 = history.length > 0 ? calculateEMA(history, 21) : price;
    const ema50 = history.length > 0 ? calculateEMA(history, 50) : price;
    const ema200 = history.length > 0 ? calculateEMA(history, 200) : price;
    
    // Simulate multi-timeframe (in real app, fetch different TF data)
    const h4Trend = determineTrend(price, ema50, ema200);
    const h1Trend = determineTrend(price, ema21, ema50);
    const m15Trend = determineTrend(price, price * 0.999, ema21); // Simplified
    
    const alignment = h4Trend === h1Trend && h1Trend === m15Trend ? 'ALIGNED' :
        h4Trend === h1Trend || h1Trend === m15Trend ? 'PARTIAL' : 'CONFLICTING';
    
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
    const avgVolume = history.length > 0 ? history.reduce((a, b) => a + b, 0) / history.length : 1;
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

// Generate recommendation
function generateRecommendation(setups: Setup[]): {
    action: 'EXECUTE' | 'WAIT' | 'AVOID';
    reason: string;
    bestSetup: Setup | null;
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
    
    // EXECUTE if: HIGH confidence OR (MEDIUM with 3+ confluences)
    if (best.confidence === 'HIGH' || (best.confidence === 'MEDIUM' && best.confluences.length >= 3)) {
        return {
            action: 'EXECUTE',
            reason: `${best.confidence} confidence ${best.type} setup. ${best.confluences.length} confluences. R:R ${best.riskReward.toFixed(1)}.`,
            bestSetup: best,
        };
    }
    
    if (best.confidence === 'MEDIUM') {
        return {
            action: 'WAIT',
            reason: `Medium confidence, ${best.confluences.length} confluences. Await more confirmation.`,
            bestSetup: best,
        };
    }
    
    return {
        action: 'AVOID',
        reason: `Low confidence. Risk not justified.`,
        bestSetup: best,
    };
}

export async function GET() {
    try {
        // 1. Fetch MESO inputs with full context
        const mesoData = await fetchMesoInputs();
        const { instruments, prohibited, context } = mesoData;
        
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
        
        for (const input of realInstruments) {
            // Check if symbol is prohibited
            if (prohibited.includes(input.symbol)) continue;
            
            const data = marketData.get(input.symbol) || 
                Array.from(marketData.entries()).find(([k]) => k.includes(input.symbol) || input.symbol.includes(k))?.[1];
            
            if (!data) continue;
            
            const technical = generateTechnicalAnalysis(input.symbol, data);
            
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
            
            // Generate recommendation based on scenario status
            let recommendation;
            if (scenarioAnalysis.status === 'PRONTO' && setup) {
                recommendation = {
                    action: 'EXECUTE' as const,
                    reason: `${scenarioAnalysis.statusReason} Timing: ${scenarioAnalysis.timing}. Qualidade: ${scenarioAnalysis.entryQuality}.`,
                    bestSetup: setup,
                };
            } else if (scenarioAnalysis.status === 'DESENVOLVENDO') {
                recommendation = {
                    action: 'WAIT' as const,
                    reason: scenarioAnalysis.statusReason,
                    bestSetup: setup,
                };
            } else {
                recommendation = {
                    action: 'AVOID' as const,
                    reason: scenarioAnalysis.statusReason,
                    bestSetup: null,
                };
            }
            
            analyses.push({
                symbol: input.symbol,
                displaySymbol: input.symbol.replace('=X', '').replace('-USD', '').replace('=F', ''),
                price: data.price,
                technical,
                setups,
                recommendation,
                scenarioAnalysis,
                levelSources: levelSources || [],
                adaptiveContext,
            });
        }
        
        // 5. Sort by MESO score first, then by technical score
        analyses.sort((a, b) => {
            const order = { EXECUTE: 0, WAIT: 1, AVOID: 2 };
            const orderDiff = order[a.recommendation.action] - order[b.recommendation.action];
            if (orderDiff !== 0) return orderDiff;
            return (b.recommendation.bestSetup?.technicalScore || 0) - (a.recommendation.bestSetup?.technicalScore || 0);
        });
        
        const executeReady = analyses.filter(a => a.recommendation.action === 'EXECUTE').length;
        const withSetups = analyses.filter(a => a.setups.length > 0).length;
        
        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            analyses,
            mesoContext: context,
            summary: {
                total: analyses.length,
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
        console.error('Micro API error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
