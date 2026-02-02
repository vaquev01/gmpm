// src/lib/smcEngine.ts
// Smart Money Concepts (SMC/ICT) Automatic Detection Engine

export interface Candle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface OrderBlock {
    type: 'BULLISH' | 'BEARISH';
    priceHigh: number;
    priceLow: number;
    strength: number; // 0-100
    tested: boolean;
    broken: boolean;
    index: number;
}

export interface FairValueGap {
    type: 'BULLISH' | 'BEARISH';
    high: number;
    low: number;
    size: number;
    sizePercent: number;
    filled: boolean;
    fillPercent: number;
    index: number;
}

export interface LiquidityLevel {
    type: 'BUY_SIDE' | 'SELL_SIDE';
    price: number;
    strength: number;
    swept: boolean;
    touchCount: number;
}

export interface BreakOfStructure {
    type: 'BULLISH_BOS' | 'BEARISH_BOS' | 'BULLISH_CHOCH' | 'BEARISH_CHOCH';
    price: number;
    index: number;
    significance: 'MAJOR' | 'MINOR';
}

export interface SMCAnalysis {
    // Structure
    trend: 'BULLISH' | 'BEARISH' | 'RANGING';
    structureBreaks: BreakOfStructure[];
    lastBOS: BreakOfStructure | null;

    // Order Blocks
    orderBlocks: OrderBlock[];
    activeOBs: OrderBlock[];
    nearestBullishOB: OrderBlock | null;
    nearestBearishOB: OrderBlock | null;

    // Fair Value Gaps
    fairValueGaps: FairValueGap[];
    unfilledFVGs: FairValueGap[];
    nearestBullishFVG: FairValueGap | null;
    nearestBearishFVG: FairValueGap | null;

    // Liquidity
    liquidityLevels: LiquidityLevel[];
    nearestBuySide: LiquidityLevel | null;
    nearestSellSide: LiquidityLevel | null;

    // Premium/Discount
    equilibrium: number;
    currentZone: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';
    premiumLevel: number;
    discountLevel: number;

    // Bias
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    biasStrength: number;
    entryZones: { low: number; high: number; type: string }[];
}

// ===== HELPER FUNCTIONS =====

function isSwingHigh(candles: Candle[], index: number, lookback: number = 3): boolean {
    if (index < lookback || index >= candles.length - lookback) return false;

    const high = candles[index].high;
    for (let i = index - lookback; i <= index + lookback; i++) {
        if (i !== index && candles[i].high >= high) return false;
    }
    return true;
}

function isSwingLow(candles: Candle[], index: number, lookback: number = 3): boolean {
    if (index < lookback || index >= candles.length - lookback) return false;

    const low = candles[index].low;
    for (let i = index - lookback; i <= index + lookback; i++) {
        if (i !== index && candles[i].low <= low) return false;
    }
    return true;
}

function isBullishCandle(candle: Candle): boolean {
    return candle.close > candle.open;
}

function isBearishCandle(candle: Candle): boolean {
    return candle.close < candle.open;
}

function getCandleBody(candle: Candle): number {
    return Math.abs(candle.close - candle.open);
}

function getCandleRange(candle: Candle): number {
    return candle.high - candle.low;
}

// ===== DETECTION FUNCTIONS =====

export function detectOrderBlocks(candles: Candle[], currentPrice: number): OrderBlock[] {
    const orderBlocks: OrderBlock[] = [];

    for (let i = 2; i < candles.length - 1; i++) {
        const prev = candles[i - 1];
        const current = candles[i];
        const next = candles[i + 1];

        // Bullish OB: Last bearish candle before strong bullish move
        if (isBearishCandle(prev) && isBullishCandle(current) && isBullishCandle(next)) {
            const moveSize = next.close - prev.close;
            const avgRange = candles.slice(Math.max(0, i - 10), i).reduce((s, c) => s + getCandleRange(c), 0) / 10;

            if (moveSize > avgRange * 2) {
                orderBlocks.push({
                    type: 'BULLISH',
                    priceHigh: prev.high,
                    priceLow: prev.low,
                    strength: Math.min(100, (moveSize / avgRange) * 25),
                    tested: currentPrice <= prev.high && currentPrice >= prev.low,
                    broken: currentPrice < prev.low,
                    index: i - 1,
                });
            }
        }

        // Bearish OB: Last bullish candle before strong bearish move
        if (isBullishCandle(prev) && isBearishCandle(current) && isBearishCandle(next)) {
            const moveSize = prev.close - next.close;
            const avgRange = candles.slice(Math.max(0, i - 10), i).reduce((s, c) => s + getCandleRange(c), 0) / 10;

            if (moveSize > avgRange * 2) {
                orderBlocks.push({
                    type: 'BEARISH',
                    priceHigh: prev.high,
                    priceLow: prev.low,
                    strength: Math.min(100, (moveSize / avgRange) * 25),
                    tested: currentPrice <= prev.high && currentPrice >= prev.low,
                    broken: currentPrice > prev.high,
                    index: i - 1,
                });
            }
        }
    }

    return orderBlocks;
}

export function detectFVGs(candles: Candle[], currentPrice: number): FairValueGap[] {
    const fvgs: FairValueGap[] = [];

    for (let i = 2; i < candles.length; i++) {
        const first = candles[i - 2];
        const second = candles[i - 1];
        const third = candles[i];

        // Bullish FVG: Gap between candle 1 high and candle 3 low
        if (third.low > first.high) {
            const gapSize = third.low - first.high;
            const gapPercent = (gapSize / second.close) * 100;

            // Check if filled
            let filled = false;
            let fillPercent = 0;

            for (let j = i + 1; j < candles.length; j++) {
                if (candles[j].low <= first.high) {
                    filled = true;
                    fillPercent = 100;
                    break;
                } else if (candles[j].low < third.low) {
                    fillPercent = Math.max(fillPercent, ((third.low - candles[j].low) / gapSize) * 100);
                }
            }

            if (gapPercent > 0.1) {
                fvgs.push({
                    type: 'BULLISH',
                    high: third.low,
                    low: first.high,
                    size: gapSize,
                    sizePercent: Math.round(gapPercent * 100) / 100,
                    filled,
                    fillPercent: Math.round(fillPercent),
                    index: i - 1,
                });
            }
        }

        // Bearish FVG: Gap between candle 3 high and candle 1 low
        if (third.high < first.low) {
            const gapSize = first.low - third.high;
            const gapPercent = (gapSize / second.close) * 100;

            let filled = false;
            let fillPercent = 0;

            for (let j = i + 1; j < candles.length; j++) {
                if (candles[j].high >= first.low) {
                    filled = true;
                    fillPercent = 100;
                    break;
                } else if (candles[j].high > third.high) {
                    fillPercent = Math.max(fillPercent, ((candles[j].high - third.high) / gapSize) * 100);
                }
            }

            if (gapPercent > 0.1) {
                fvgs.push({
                    type: 'BEARISH',
                    high: first.low,
                    low: third.high,
                    size: gapSize,
                    sizePercent: Math.round(gapPercent * 100) / 100,
                    filled,
                    fillPercent: Math.round(fillPercent),
                    index: i - 1,
                });
            }
        }
    }

    return fvgs;
}

export function detectLiquidity(candles: Candle[], currentPrice: number): LiquidityLevel[] {
    const levels: LiquidityLevel[] = [];
    const tolerance = currentPrice * 0.001; // 0.1% tolerance

    // Find swing highs (sell-side liquidity)
    for (let i = 3; i < candles.length - 3; i++) {
        if (isSwingHigh(candles, i)) {
            const price = candles[i].high;

            // Count touches
            let touchCount = 0;
            for (let j = i + 1; j < candles.length; j++) {
                if (Math.abs(candles[j].high - price) < tolerance) touchCount++;
            }

            const swept = candles.slice(i + 1).some(c => c.high > price + tolerance);

            levels.push({
                type: 'SELL_SIDE',
                price,
                strength: 50 + touchCount * 15,
                swept,
                touchCount,
            });
        }
    }

    // Find swing lows (buy-side liquidity)
    for (let i = 3; i < candles.length - 3; i++) {
        if (isSwingLow(candles, i)) {
            const price = candles[i].low;

            let touchCount = 0;
            for (let j = i + 1; j < candles.length; j++) {
                if (Math.abs(candles[j].low - price) < tolerance) touchCount++;
            }

            const swept = candles.slice(i + 1).some(c => c.low < price - tolerance);

            levels.push({
                type: 'BUY_SIDE',
                price,
                strength: 50 + touchCount * 15,
                swept,
                touchCount,
            });
        }
    }

    return levels;
}

export function detectStructure(candles: Candle[]): { trend: 'BULLISH' | 'BEARISH' | 'RANGING'; breaks: BreakOfStructure[] } {
    const breaks: BreakOfStructure[] = [];
    const swingHighs: { price: number; index: number }[] = [];
    const swingLows: { price: number; index: number }[] = [];

    // Find swings
    for (let i = 3; i < candles.length - 3; i++) {
        if (isSwingHigh(candles, i)) swingHighs.push({ price: candles[i].high, index: i });
        if (isSwingLow(candles, i)) swingLows.push({ price: candles[i].low, index: i });
    }

    // Detect BOS and CHoCH
    for (let i = 1; i < swingHighs.length; i++) {
        const current = swingHighs[i];
        const previous = swingHighs[i - 1];

        // Higher High = continuation
        if (current.price > previous.price) {
            breaks.push({
                type: 'BULLISH_BOS',
                price: previous.price,
                index: current.index,
                significance: current.price > previous.price * 1.01 ? 'MAJOR' : 'MINOR',
            });
        }
    }

    for (let i = 1; i < swingLows.length; i++) {
        const current = swingLows[i];
        const previous = swingLows[i - 1];

        // Lower Low = continuation / CHoCH
        if (current.price < previous.price) {
            breaks.push({
                type: 'BEARISH_BOS',
                price: previous.price,
                index: current.index,
                significance: current.price < previous.price * 0.99 ? 'MAJOR' : 'MINOR',
            });
        }
    }

    // Determine trend
    const recentBreaks = breaks.slice(-5);
    const bullishBreaks = recentBreaks.filter(b => b.type.includes('BULLISH')).length;
    const bearishBreaks = recentBreaks.filter(b => b.type.includes('BEARISH')).length;

    let trend: 'BULLISH' | 'BEARISH' | 'RANGING' = 'RANGING';
    if (bullishBreaks > bearishBreaks + 1) trend = 'BULLISH';
    else if (bearishBreaks > bullishBreaks + 1) trend = 'BEARISH';

    return { trend, breaks };
}

// ===== MAIN ANALYSIS FUNCTION =====

export function analyzeSMC(candles: Candle[], currentPrice: number): SMCAnalysis {
    // Structure
    const { trend, breaks } = detectStructure(candles);
    const lastBOS = breaks[breaks.length - 1] || null;

    // Order Blocks
    const orderBlocks = detectOrderBlocks(candles, currentPrice);
    const activeOBs = orderBlocks.filter(ob => !ob.broken);
    const nearestBullishOB = activeOBs
        .filter(ob => ob.type === 'BULLISH' && ob.priceHigh < currentPrice)
        .sort((a, b) => b.priceHigh - a.priceHigh)[0] || null;
    const nearestBearishOB = activeOBs
        .filter(ob => ob.type === 'BEARISH' && ob.priceLow > currentPrice)
        .sort((a, b) => a.priceLow - b.priceLow)[0] || null;

    // FVGs
    const fairValueGaps = detectFVGs(candles, currentPrice);
    const unfilledFVGs = fairValueGaps.filter(fvg => !fvg.filled);
    const nearestBullishFVG = unfilledFVGs
        .filter(fvg => fvg.type === 'BULLISH' && fvg.high < currentPrice)
        .sort((a, b) => b.high - a.high)[0] || null;
    const nearestBearishFVG = unfilledFVGs
        .filter(fvg => fvg.type === 'BEARISH' && fvg.low > currentPrice)
        .sort((a, b) => a.low - b.low)[0] || null;

    // Liquidity
    const liquidityLevels = detectLiquidity(candles, currentPrice);
    const nearestBuySide = liquidityLevels
        .filter(l => l.type === 'BUY_SIDE' && l.price < currentPrice && !l.swept)
        .sort((a, b) => b.price - a.price)[0] || null;
    const nearestSellSide = liquidityLevels
        .filter(l => l.type === 'SELL_SIDE' && l.price > currentPrice && !l.swept)
        .sort((a, b) => a.price - b.price)[0] || null;

    // Premium/Discount
    const high = Math.max(...candles.slice(-50).map(c => c.high));
    const low = Math.min(...candles.slice(-50).map(c => c.low));
    const range = high - low;
    const equilibrium = low + range * 0.5;
    const premiumLevel = low + range * 0.75;
    const discountLevel = low + range * 0.25;

    let currentZone: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM' = 'EQUILIBRIUM';
    if (currentPrice > premiumLevel) currentZone = 'PREMIUM';
    else if (currentPrice < discountLevel) currentZone = 'DISCOUNT';

    // Bias
    let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    let biasStrength = 50;

    if (trend === 'BULLISH' && currentZone === 'DISCOUNT') {
        bias = 'BULLISH';
        biasStrength = 75 + (nearestBullishOB ? 10 : 0) + (nearestBullishFVG ? 10 : 0);
    } else if (trend === 'BEARISH' && currentZone === 'PREMIUM') {
        bias = 'BEARISH';
        biasStrength = 75 + (nearestBearishOB ? 10 : 0) + (nearestBearishFVG ? 10 : 0);
    } else if (trend === 'BULLISH') {
        bias = 'BULLISH';
        biasStrength = 60;
    } else if (trend === 'BEARISH') {
        bias = 'BEARISH';
        biasStrength = 60;
    }

    // Entry zones
    const entryZones: { low: number; high: number; type: string }[] = [];
    if (nearestBullishOB) entryZones.push({ low: nearestBullishOB.priceLow, high: nearestBullishOB.priceHigh, type: 'Bullish OB' });
    if (nearestBearishOB) entryZones.push({ low: nearestBearishOB.priceLow, high: nearestBearishOB.priceHigh, type: 'Bearish OB' });
    if (nearestBullishFVG) entryZones.push({ low: nearestBullishFVG.low, high: nearestBullishFVG.high, type: 'Bullish FVG' });
    if (nearestBearishFVG) entryZones.push({ low: nearestBearishFVG.low, high: nearestBearishFVG.high, type: 'Bearish FVG' });

    return {
        trend,
        structureBreaks: breaks.slice(-10),
        lastBOS,
        orderBlocks: orderBlocks.slice(-10),
        activeOBs: activeOBs.slice(-5),
        nearestBullishOB,
        nearestBearishOB,
        fairValueGaps: fairValueGaps.slice(-10),
        unfilledFVGs: unfilledFVGs.slice(-5),
        nearestBullishFVG,
        nearestBearishFVG,
        liquidityLevels: liquidityLevels.slice(-10),
        nearestBuySide,
        nearestSellSide,
        equilibrium,
        currentZone,
        premiumLevel,
        discountLevel,
        bias,
        biasStrength: Math.min(100, biasStrength),
        entryZones,
    };
}
