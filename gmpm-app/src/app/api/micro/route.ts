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
}

// Fetch meso inputs with full context
async function fetchMesoInputs(): Promise<{ 
    instruments: MesoInput[]; 
    prohibited: string[];
    context: { favoredDirection: string; volatilityContext: string; regime: string; bias: string };
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
                }
            };
        }
    } catch (e) {
        console.error('Failed to fetch meso inputs:', e);
    }
    return { instruments: [], prohibited: [], context: { favoredDirection: 'NEUTRAL', volatilityContext: 'NORMAL', regime: 'NEUTRAL', bias: 'NEUTRAL' } };
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
    
    // Structure analysis
    const dailyRange = high - low;
    const atr = dailyRange > 0 ? dailyRange : price * 0.01;
    
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

// Generate setups from technical analysis
function generateSetups(
    symbol: string,
    displaySymbol: string,
    price: number,
    technical: TechnicalAnalysis,
    mesoDirection: 'LONG' | 'SHORT'
): Setup[] {
    const setups: Setup[] = [];
    const { trend, levels, indicators, smc, volume } = technical;
    const atr = levels.atr;
    
    // Check alignment with meso
    const mesoAligned = (mesoDirection === 'LONG' && trend.h4 === 'BULLISH') ||
        (mesoDirection === 'SHORT' && trend.h4 === 'BEARISH');
    
    // Generate confluence list
    const confluences: string[] = [];
    if (trend.alignment === 'ALIGNED') confluences.push('Multi-TF alignment');
    if (indicators.rsiDivergence) confluences.push(`RSI ${indicators.rsiDivergence} divergence`);
    if (indicators.macdSignal !== 'NEUTRAL') confluences.push(`MACD ${indicators.macdSignal}`);
    if (smc.premiumDiscount === 'DISCOUNT' && mesoDirection === 'LONG') confluences.push('Discount zone');
    if (smc.premiumDiscount === 'PREMIUM' && mesoDirection === 'SHORT') confluences.push('Premium zone');
    if (volume.trend === 'INCREASING') confluences.push('Volume expanding');
    if (smc.orderBlocks.length > 0) confluences.push(`Near ${smc.orderBlocks[0].type} OB`);
    
    // Calculate technical score
    let technicalScore = 50;
    if (trend.alignment === 'ALIGNED') technicalScore += 15;
    if (mesoAligned) technicalScore += 10;
    if (indicators.rsiDivergence) technicalScore += 10;
    if (volume.trend === 'INCREASING') technicalScore += 5;
    if (smc.premiumDiscount === 'DISCOUNT' && mesoDirection === 'LONG') technicalScore += 10;
    if (smc.premiumDiscount === 'PREMIUM' && mesoDirection === 'SHORT') technicalScore += 10;
    
    // Add more confluences based on available data
    if (indicators.rsi > 50 && mesoDirection === 'LONG') confluences.push('RSI bullish bias');
    if (indicators.rsi < 50 && mesoDirection === 'SHORT') confluences.push('RSI bearish bias');
    if (indicators.bbPosition === 'LOWER' && mesoDirection === 'LONG') confluences.push('Bollinger lower band');
    if (indicators.bbPosition === 'UPPER' && mesoDirection === 'SHORT') confluences.push('Bollinger upper band');
    if (trend.h4 !== 'NEUTRAL') confluences.push(`H4 ${trend.h4.toLowerCase()}`);
    if (smc.liquidityPools.length > 0) confluences.push('Liquidity pool nearby');
    
    // Add score for meso direction alignment
    if (mesoDirection === 'LONG' && indicators.rsi > 40 && indicators.rsi < 70) technicalScore += 5;
    if (mesoDirection === 'SHORT' && indicators.rsi > 30 && indicators.rsi < 60) technicalScore += 5;
    
    // Relax criteria - generate setups with lower threshold
    if (technicalScore < 55 || confluences.length < 1) {
        return [];
    }
    
    // Determine setup type
    let setupType: Setup['type'] = 'CONTINUATION';
    if (technical.structure.lastBOS) setupType = 'BREAKOUT';
    if (smc.premiumDiscount !== 'EQUILIBRIUM') setupType = 'PULLBACK';
    if (indicators.rsiDivergence) setupType = 'REVERSAL';
    if (smc.fvgs.length > 0 && !smc.fvgs[0].filled) setupType = 'LIQUIDITY_GRAB';
    
    // Calculate entry, SL, TPs based on direction
    // SL = 1 ATR, TP1 = 2 ATR (R:R = 2:1)
    const isLong = mesoDirection === 'LONG';
    const entry = price;
    const stopLoss = isLong ? entry - atr : entry + atr;
    const tp1 = isLong ? entry + atr * 2 : entry - atr * 2;
    const tp2 = isLong ? entry + atr * 3 : entry - atr * 3;
    const tp3 = isLong ? entry + atr * 4 : entry - atr * 4;
    
    const risk = Math.abs(entry - stopLoss);
    const reward = Math.abs(tp1 - entry);
    const riskReward = risk > 0 ? reward / risk : 2; // Default to 2 if no risk
    
    const confidence: Setup['confidence'] = technicalScore >= 80 ? 'HIGH' :
        technicalScore >= 65 ? 'MEDIUM' : 'LOW';
    
    // Generate thesis
    const thesis = `${mesoDirection} ${displaySymbol}: ${setupType} setup at ${smc.premiumDiscount.toLowerCase()} zone. ` +
        `${confluences.slice(0, 3).join(', ')}. ` +
        `R:R ${riskReward.toFixed(1)}. ` +
        `${mesoAligned ? 'Aligned with MESO.' : 'MESO neutral.'}`;
    
    setups.push({
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
        mesoAlignment: mesoAligned,
        technicalScore,
    });
    
    return setups;
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
            
            // MESO already filtered, so direction is trusted
            const setups = generateSetups(input.symbol, input.symbol, data.price, technical, input.direction);
            
            // Add MESO conviction bonus
            for (const setup of setups) {
                setup.technicalScore = Math.min(100, setup.technicalScore + 15);
                setup.confluences.push('MESO direção confirmada');
                setup.mesoAlignment = true;
            }
            
            const recommendation = generateRecommendation(setups);
            
            // Include MESO reason in thesis
            if (recommendation.bestSetup) {
                recommendation.bestSetup.thesis = `${input.reason} | ${recommendation.bestSetup.thesis}`;
            }
            
            analyses.push({
                symbol: input.symbol,
                displaySymbol: input.symbol.replace('=X', '').replace('-USD', '').replace('=F', ''),
                price: data.price,
                technical,
                setups,
                recommendation,
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
