import { NextResponse } from 'next/server';
import { serverLog } from '@/lib/serverLogs';

// Liquidity Map Types
interface LiquidityZone {
    priceLevel: number;
    volumeConcentration: number; // 0-100
    type: 'HIGH_VOLUME' | 'LOW_VOLUME' | 'POC';
    description: string;
}

interface EqualLevel {
    price: number;
    type: 'EQUAL_HIGHS' | 'EQUAL_LOWS';
    touches: number;
    strength: 'STRONG' | 'MODERATE' | 'WEAK';
    liquidityEstimate: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface VolumeProfileBar {
    priceRange: { low: number; high: number };
    volume: number;
    volumePercent: number;
    isBuyDominant: boolean;
}

interface LiquidityMapData {
    symbol: string;
    displaySymbol: string;
    assetClass: 'forex' | 'etf';
    currentPrice: number;
    atr: number;
    volumeProfile: VolumeProfileBar[];
    poc: { price: number; volume: number }; // Point of Control
    valueArea: { high: number; low: number }; // 70% of volume
    liquidityZones: LiquidityZone[];
    equalLevels: EqualLevel[];
    buySideLiquidity: { level: number; strength: number }[];
    sellSideLiquidity: { level: number; strength: number }[];
    marketDirection: 'SEEKING_BUYSIDE' | 'SEEKING_SELLSIDE' | 'BALANCED';
    timestamp: string;
}

// Forex pairs to analyze
const FOREX_SYMBOLS = [
    'EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'USDCHF=X', 'AUDUSD=X', 'USDCAD=X', 'NZDUSD=X',
    'EURGBP=X', 'EURJPY=X', 'GBPJPY=X'
];

// ETFs to analyze
const ETF_SYMBOLS = [
    'SPY', 'QQQ', 'IWM', 'DIA', 'GLD', 'SLV', 'TLT', 'XLF', 'XLE', 'XLK',
    'EEM', 'VXX', 'HYG', 'LQD', 'USO'
];

interface YahooCandle {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    timestamp: number;
}

async function fetchCandles(symbol: string, period: string = '1mo', interval: string = '1h'): Promise<YahooCandle[]> {
    try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const res = await fetch(
            `${baseUrl}/api/history?symbol=${encodeURIComponent(symbol)}&period=${period}&interval=${interval}`,
            { cache: 'no-store' }
        );
        
        if (!res.ok) return [];
        const data = await res.json();
        
        if (!data.success || !Array.isArray(data.candles)) return [];
        
        return data.candles.map((c: { open: number; high: number; low: number; close: number; volume: number; timestamp: number }) => ({
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume || 0,
            timestamp: c.timestamp
        }));
    } catch {
        return [];
    }
}

function calculateATR(candles: YahooCandle[], period: number = 14): number {
    if (candles.length < period + 1) return 0;
    
    let atrSum = 0;
    for (let i = 1; i <= period; i++) {
        const idx = candles.length - i;
        const prev = candles[idx - 1];
        const curr = candles[idx];
        const tr = Math.max(
            curr.high - curr.low,
            Math.abs(curr.high - prev.close),
            Math.abs(curr.low - prev.close)
        );
        atrSum += tr;
    }
    return atrSum / period;
}

function calculateVolumeProfile(candles: YahooCandle[], buckets: number = 20): {
    profile: VolumeProfileBar[];
    poc: { price: number; volume: number };
    valueArea: { high: number; low: number };
} {
    if (candles.length === 0) {
        return {
            profile: [],
            poc: { price: 0, volume: 0 },
            valueArea: { high: 0, low: 0 }
        };
    }
    
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const maxPrice = Math.max(...highs);
    const minPrice = Math.min(...lows);
    const range = maxPrice - minPrice;
    const bucketSize = range / buckets;
    
    // Initialize volume buckets
    const volumeBuckets: { low: number; high: number; buyVol: number; sellVol: number }[] = [];
    for (let i = 0; i < buckets; i++) {
        volumeBuckets.push({
            low: minPrice + i * bucketSize,
            high: minPrice + (i + 1) * bucketSize,
            buyVol: 0,
            sellVol: 0
        });
    }
    
    // Distribute volume across price buckets
    for (const candle of candles) {
        const isBullish = candle.close > candle.open;
        const vol = candle.volume || 1;
        
        // Distribute volume based on which buckets the candle touches
        for (const bucket of volumeBuckets) {
            const bucketMid = (bucket.low + bucket.high) / 2;
            if (candle.low <= bucketMid && candle.high >= bucketMid) {
                if (isBullish) {
                    bucket.buyVol += vol / 3; // Approximate distribution
                } else {
                    bucket.sellVol += vol / 3;
                }
            }
        }
    }
    
    // Calculate total volume and find POC
    const totalVolume = volumeBuckets.reduce((sum, b) => sum + b.buyVol + b.sellVol, 0);
    let pocBucket = volumeBuckets[0];
    let maxBucketVol = 0;
    
    for (const bucket of volumeBuckets) {
        const bucketVol = bucket.buyVol + bucket.sellVol;
        if (bucketVol > maxBucketVol) {
            maxBucketVol = bucketVol;
            pocBucket = bucket;
        }
    }
    
    // Calculate Value Area (70% of total volume around POC)
    const sortedByVol = [...volumeBuckets].sort((a, b) => 
        (b.buyVol + b.sellVol) - (a.buyVol + a.sellVol)
    );
    
    let accumulatedVol = 0;
    const targetVol = totalVolume * 0.7;
    const valueAreaBuckets: typeof volumeBuckets = [];
    
    for (const bucket of sortedByVol) {
        valueAreaBuckets.push(bucket);
        accumulatedVol += bucket.buyVol + bucket.sellVol;
        if (accumulatedVol >= targetVol) break;
    }
    
    const vaLow = Math.min(...valueAreaBuckets.map(b => b.low));
    const vaHigh = Math.max(...valueAreaBuckets.map(b => b.high));
    
    // Build profile bars
    const profile: VolumeProfileBar[] = volumeBuckets.map(bucket => ({
        priceRange: { low: bucket.low, high: bucket.high },
        volume: bucket.buyVol + bucket.sellVol,
        volumePercent: totalVolume > 0 ? ((bucket.buyVol + bucket.sellVol) / totalVolume) * 100 : 0,
        isBuyDominant: bucket.buyVol > bucket.sellVol
    }));
    
    return {
        profile,
        poc: { 
            price: (pocBucket.low + pocBucket.high) / 2, 
            volume: maxBucketVol 
        },
        valueArea: { high: vaHigh, low: vaLow }
    };
}

function findEqualLevels(candles: YahooCandle[], tolerance: number = 0.001): EqualLevel[] {
    if (candles.length < 10) return [];
    
    const highs: { price: number; index: number }[] = [];
    const lows: { price: number; index: number }[] = [];
    
    // Find swing highs and lows
    for (let i = 2; i < candles.length - 2; i++) {
        const curr = candles[i];
        const prev1 = candles[i - 1];
        const prev2 = candles[i - 2];
        const next1 = candles[i + 1];
        const next2 = candles[i + 2];
        
        // Swing high
        if (curr.high > prev1.high && curr.high > prev2.high &&
            curr.high > next1.high && curr.high > next2.high) {
            highs.push({ price: curr.high, index: i });
        }
        
        // Swing low
        if (curr.low < prev1.low && curr.low < prev2.low &&
            curr.low < next1.low && curr.low < next2.low) {
            lows.push({ price: curr.low, index: i });
        }
    }
    
    const equalLevels: EqualLevel[] = [];
    
    // Find equal highs (liquidity above)
    const highGroups = groupSimilarLevels(highs.map(h => h.price), tolerance);
    for (const group of highGroups) {
        if (group.length >= 2) {
            const avgPrice = group.reduce((a, b) => a + b, 0) / group.length;
            equalLevels.push({
                price: avgPrice,
                type: 'EQUAL_HIGHS',
                touches: group.length,
                strength: group.length >= 3 ? 'STRONG' : 'MODERATE',
                liquidityEstimate: group.length >= 3 ? 'HIGH' : 'MEDIUM'
            });
        }
    }
    
    // Find equal lows (liquidity below)
    const lowGroups = groupSimilarLevels(lows.map(l => l.price), tolerance);
    for (const group of lowGroups) {
        if (group.length >= 2) {
            const avgPrice = group.reduce((a, b) => a + b, 0) / group.length;
            equalLevels.push({
                price: avgPrice,
                type: 'EQUAL_LOWS',
                touches: group.length,
                strength: group.length >= 3 ? 'STRONG' : 'MODERATE',
                liquidityEstimate: group.length >= 3 ? 'HIGH' : 'MEDIUM'
            });
        }
    }
    
    return equalLevels.sort((a, b) => b.touches - a.touches);
}

function groupSimilarLevels(levels: number[], tolerance: number): number[][] {
    if (levels.length === 0) return [];
    
    const sorted = [...levels].sort((a, b) => a - b);
    const groups: number[][] = [[sorted[0]]];
    
    for (let i = 1; i < sorted.length; i++) {
        const lastGroup = groups[groups.length - 1];
        const lastPrice = lastGroup[lastGroup.length - 1];
        const pctDiff = Math.abs(sorted[i] - lastPrice) / lastPrice;
        
        if (pctDiff <= tolerance) {
            lastGroup.push(sorted[i]);
        } else {
            groups.push([sorted[i]]);
        }
    }
    
    return groups;
}

function identifyLiquidityZones(
    volumeProfile: VolumeProfileBar[],
    poc: { price: number; volume: number },
    currentPrice: number
): LiquidityZone[] {
    const zones: LiquidityZone[] = [];
    
    if (volumeProfile.length === 0) return zones;
    
    const maxVol = Math.max(...volumeProfile.map(b => b.volume));
    
    // POC zone
    zones.push({
        priceLevel: poc.price,
        volumeConcentration: 100,
        type: 'POC',
        description: 'Point of Control - highest volume concentration'
    });
    
    // High volume nodes (>50% of max)
    for (const bar of volumeProfile) {
        const midPrice = (bar.priceRange.low + bar.priceRange.high) / 2;
        const volPercent = (bar.volume / maxVol) * 100;
        
        if (volPercent > 50 && Math.abs(midPrice - poc.price) / poc.price > 0.005) {
            zones.push({
                priceLevel: midPrice,
                volumeConcentration: volPercent,
                type: 'HIGH_VOLUME',
                description: `High volume node - ${volPercent.toFixed(0)}% of max volume`
            });
        }
    }
    
    // Low volume nodes (<20% of max) - potential fast-move zones
    for (const bar of volumeProfile) {
        const midPrice = (bar.priceRange.low + bar.priceRange.high) / 2;
        const volPercent = (bar.volume / maxVol) * 100;
        
        if (volPercent < 20 && volPercent > 0) {
            zones.push({
                priceLevel: midPrice,
                volumeConcentration: volPercent,
                type: 'LOW_VOLUME',
                description: `Low volume gap - price may move fast through this zone`
            });
        }
    }
    
    return zones.sort((a, b) => Math.abs(currentPrice - a.priceLevel) - Math.abs(currentPrice - b.priceLevel));
}

function determineMarketDirection(
    currentPrice: number,
    equalLevels: EqualLevel[],
    poc: { price: number; volume: number }
): 'SEEKING_BUYSIDE' | 'SEEKING_SELLSIDE' | 'BALANCED' {
    const nearbyHighs = equalLevels.filter(e => 
        e.type === 'EQUAL_HIGHS' && 
        e.price > currentPrice &&
        (e.price - currentPrice) / currentPrice < 0.02
    );
    
    const nearbyLows = equalLevels.filter(e => 
        e.type === 'EQUAL_LOWS' && 
        e.price < currentPrice &&
        (currentPrice - e.price) / currentPrice < 0.02
    );
    
    const highLiqScore = nearbyHighs.reduce((sum, e) => sum + e.touches, 0);
    const lowLiqScore = nearbyLows.reduce((sum, e) => sum + e.touches, 0);
    
    // If price is above POC, more likely to seek buyside
    const abovePOC = currentPrice > poc.price;
    
    if (highLiqScore > lowLiqScore * 1.5 || (abovePOC && highLiqScore > 0)) {
        return 'SEEKING_BUYSIDE';
    } else if (lowLiqScore > highLiqScore * 1.5 || (!abovePOC && lowLiqScore > 0)) {
        return 'SEEKING_SELLSIDE';
    }
    
    return 'BALANCED';
}

async function analyzeLiquidity(symbol: string, assetClass: 'forex' | 'etf'): Promise<LiquidityMapData | null> {
    const candles = await fetchCandles(symbol, '1mo', '1h');
    if (candles.length < 20) return null;
    
    const currentPrice = candles[candles.length - 1].close;
    const atr = calculateATR(candles);
    const tolerance = assetClass === 'forex' ? 0.0005 : 0.005; // Tighter for forex
    
    const { profile, poc, valueArea } = calculateVolumeProfile(candles);
    const equalLevels = findEqualLevels(candles, tolerance);
    const liquidityZones = identifyLiquidityZones(profile, poc, currentPrice);
    const marketDirection = determineMarketDirection(currentPrice, equalLevels, poc);
    
    // Extract buy-side and sell-side liquidity
    const buySideLiquidity = equalLevels
        .filter(e => e.type === 'EQUAL_HIGHS')
        .map(e => ({ level: e.price, strength: e.touches * 20 }))
        .slice(0, 5);
    
    const sellSideLiquidity = equalLevels
        .filter(e => e.type === 'EQUAL_LOWS')
        .map(e => ({ level: e.price, strength: e.touches * 20 }))
        .slice(0, 5);
    
    return {
        symbol,
        displaySymbol: symbol.replace('=X', '').replace('-USD', '').replace('=F', ''),
        assetClass,
        currentPrice,
        atr,
        volumeProfile: profile,
        poc,
        valueArea,
        liquidityZones,
        equalLevels,
        buySideLiquidity,
        sellSideLiquidity,
        marketDirection,
        timestamp: new Date().toISOString()
    };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const symbolParam = searchParams.get('symbol');
        const assetClassParam = searchParams.get('class') as 'forex' | 'etf' | null;
        
        // Single symbol analysis
        if (symbolParam) {
            const assetClass = assetClassParam || (symbolParam.includes('=X') ? 'forex' : 'etf');
            const data = await analyzeLiquidity(symbolParam, assetClass);
            
            if (!data) {
                return NextResponse.json({
                    success: false,
                    error: `Failed to analyze liquidity for ${symbolParam}`
                }, { status: 400 });
            }
            
            serverLog('info', 'liquidity_map_single', { symbol: symbolParam }, 'api/liquidity-map');
            
            return NextResponse.json({
                success: true,
                timestamp: new Date().toISOString(),
                data
            });
        }
        
        // Full analysis for forex and/or ETFs
        const includeForex = !assetClassParam || assetClassParam === 'forex';
        const includeETF = !assetClassParam || assetClassParam === 'etf';
        
        const symbols: { symbol: string; class: 'forex' | 'etf' }[] = [];
        if (includeForex) {
            symbols.push(...FOREX_SYMBOLS.map(s => ({ symbol: s, class: 'forex' as const })));
        }
        if (includeETF) {
            symbols.push(...ETF_SYMBOLS.map(s => ({ symbol: s, class: 'etf' as const })));
        }
        
        // Analyze in parallel with concurrency limit
        const results: LiquidityMapData[] = [];
        const batchSize = 5;
        
        for (let i = 0; i < symbols.length; i += batchSize) {
            const batch = symbols.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(s => analyzeLiquidity(s.symbol, s.class))
            );
            results.push(...batchResults.filter((r): r is LiquidityMapData => r !== null));
        }
        
        // Sort by market direction relevance
        const forexResults = results.filter(r => r.assetClass === 'forex');
        const etfResults = results.filter(r => r.assetClass === 'etf');
        
        // Calculate summary
        const summary = {
            forex: {
                total: forexResults.length,
                seekingBuyside: forexResults.filter(r => r.marketDirection === 'SEEKING_BUYSIDE').length,
                seekingSellside: forexResults.filter(r => r.marketDirection === 'SEEKING_SELLSIDE').length,
                balanced: forexResults.filter(r => r.marketDirection === 'BALANCED').length,
                topLiquidity: forexResults
                    .filter(r => r.equalLevels.length > 0)
                    .sort((a, b) => b.equalLevels[0]?.touches - a.equalLevels[0]?.touches)
                    .slice(0, 3)
                    .map(r => ({
                        symbol: r.displaySymbol,
                        direction: r.marketDirection,
                        nearestLiquidity: r.equalLevels[0]?.price.toFixed(5)
                    }))
            },
            etf: {
                total: etfResults.length,
                seekingBuyside: etfResults.filter(r => r.marketDirection === 'SEEKING_BUYSIDE').length,
                seekingSellside: etfResults.filter(r => r.marketDirection === 'SEEKING_SELLSIDE').length,
                balanced: etfResults.filter(r => r.marketDirection === 'BALANCED').length,
                topLiquidity: etfResults
                    .filter(r => r.equalLevels.length > 0)
                    .sort((a, b) => b.equalLevels[0]?.touches - a.equalLevels[0]?.touches)
                    .slice(0, 3)
                    .map(r => ({
                        symbol: r.displaySymbol,
                        direction: r.marketDirection,
                        nearestLiquidity: r.equalLevels[0]?.price.toFixed(2)
                    }))
            }
        };
        
        serverLog('info', 'liquidity_map_full', { 
            forexCount: forexResults.length, 
            etfCount: etfResults.length 
        }, 'api/liquidity-map');
        
        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            forex: forexResults,
            etf: etfResults,
            summary
        });
        
    } catch (error) {
        serverLog('error', 'liquidity_map_error', { error: String(error) }, 'api/liquidity-map');
        return NextResponse.json({
            success: false,
            error: String(error)
        }, { status: 500 });
    }
}
