import { NextResponse } from 'next/server';
import { serverLog } from '@/lib/serverLogs';

// ============================================================================
// LIQUIDITY MAP - Extended for All MESO Assets
// ============================================================================
// This endpoint provides liquidity analysis for all monitored assets
// Key distinction:
// - ETFs: Real exchange volume (reliable, centralized)
// - CFDs/Forex: Synthetic volume (tick-based proxy, decentralized OTC)
// ============================================================================

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

// Liquidity Timing Analysis
interface LiquidityTiming {
    bestSession: 'LONDON' | 'NEW_YORK' | 'ASIA' | 'OVERLAP_LON_NY';
    avgTimeToLiquidityGrab: string; // e.g., "2-4 hours"
    historicalPattern: 'DAILY_SWEEP' | 'WEEKLY_SWEEP' | 'MONTHLY_SWEEP' | 'IRREGULAR';
    probabilityOfSweep: number; // 0-100
    nextLikelyWindow: string; // e.g., "London Open"
}

// Liquidity Source Info
interface LiquiditySource {
    type: 'EXCHANGE' | 'OTC_CFD' | 'FUTURES_PROXY';
    reliability: 'HIGH' | 'MEDIUM' | 'LOW';
    description: string;
    caveat?: string;
}

interface LiquidityMapData {
    symbol: string;
    displaySymbol: string;
    assetClass: 'forex' | 'etf' | 'crypto' | 'commodity' | 'index';
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
    timing: LiquidityTiming;
    source: LiquiditySource;
    cotData?: { // COT data for Forex
        commercialNet: number;
        nonCommercialNet: number;
        sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    };
    timestamp: string;
}

// Default symbols (fallback if MESO not available)
const DEFAULT_FOREX = [
    'EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'USDCHF=X', 'AUDUSD=X', 'USDCAD=X', 'NZDUSD=X',
    'EURGBP=X', 'EURJPY=X', 'GBPJPY=X'
];

const DEFAULT_ETF = [
    'SPY', 'QQQ', 'IWM', 'DIA', 'GLD', 'SLV', 'TLT', 'XLF', 'XLE', 'XLK',
    'EEM', 'VXX', 'HYG', 'LQD', 'USO'
];

const DEFAULT_CRYPTO = ['BTC-USD', 'ETH-USD'];
const DEFAULT_COMMODITY = ['GC=F', 'CL=F', 'SI=F'];
const DEFAULT_INDEX = ['^GSPC', '^DJI', '^IXIC'];

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
        const json = await res.json();
        
        // Handle both formats: data.candles or candles directly
        const candles = json.data?.candles || json.candles || [];
        if (!json.success || !Array.isArray(candles)) return [];
        
        return candles.map((c: { open: number; high: number; low: number; close: number; volume: number; timestamp: number }) => ({
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume || 1, // Use 1 as fallback for Forex (no volume data)
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

// Determine liquidity source type and reliability
function getLiquiditySource(assetClass: string, symbol: string): LiquiditySource {
    if (assetClass === 'etf') {
        return {
            type: 'EXCHANGE',
            reliability: 'HIGH',
            description: 'Volume real de bolsa (NYSE/NASDAQ). Dados centralizados e auditados.'
        };
    }
    
    if (assetClass === 'forex') {
        return {
            type: 'OTC_CFD',
            reliability: 'MEDIUM',
            description: 'Volume sintético baseado em tick count. Mercado OTC descentralizado.',
            caveat: 'Forex não tem volume centralizado. Use Equal Highs/Lows como proxy de liquidez.'
        };
    }
    
    if (assetClass === 'crypto') {
        return {
            type: 'EXCHANGE',
            reliability: 'MEDIUM',
            description: 'Volume agregado de exchanges. Pode incluir wash trading.',
            caveat: 'Volume pode ser inflado em algumas exchanges.'
        };
    }
    
    if (symbol.includes('=F')) {
        return {
            type: 'FUTURES_PROXY',
            reliability: 'HIGH',
            description: 'Volume de futuros (CME/COMEX). Dados centralizados e confiáveis.'
        };
    }
    
    return {
        type: 'EXCHANGE',
        reliability: 'MEDIUM',
        description: 'Volume de mercado'
    };
}

// Calculate liquidity timing analysis
function calculateLiquidityTiming(
    candles: YahooCandle[],
    equalLevels: EqualLevel[],
    assetClass: string
): LiquidityTiming {
    // Analyze when liquidity grabs typically occur
    const now = new Date();
    const hour = now.getUTCHours();
    
    // Session determination
    let bestSession: LiquidityTiming['bestSession'] = 'LONDON';
    if (assetClass === 'forex') {
        // Forex: London-NY overlap is most active
        bestSession = 'OVERLAP_LON_NY';
    } else if (assetClass === 'etf' || assetClass === 'index') {
        // US markets: NY session
        bestSession = 'NEW_YORK';
    } else if (assetClass === 'crypto') {
        // Crypto: Often during Asia or low-liquidity periods
        bestSession = 'ASIA';
    }
    
    // Determine next likely window based on current time
    let nextLikelyWindow = 'London Open (08:00 UTC)';
    if (hour >= 8 && hour < 13) {
        nextLikelyWindow = 'NY Open (13:00 UTC)';
    } else if (hour >= 13 && hour < 17) {
        nextLikelyWindow = 'NY Afternoon (15:00-17:00 UTC)';
    } else if (hour >= 17 && hour < 22) {
        nextLikelyWindow = 'Asia Open (00:00 UTC)';
    } else {
        nextLikelyWindow = 'London Open (08:00 UTC)';
    }
    
    // Historical pattern analysis (simplified)
    const strongLevels = equalLevels.filter(e => e.strength === 'STRONG').length;
    const totalLevels = equalLevels.length;
    
    let historicalPattern: LiquidityTiming['historicalPattern'] = 'IRREGULAR';
    let avgTime = '4-8 hours';
    let probability = 40;
    
    if (strongLevels >= 3) {
        historicalPattern = 'DAILY_SWEEP';
        avgTime = '2-4 hours';
        probability = 70;
    } else if (strongLevels >= 1) {
        historicalPattern = 'WEEKLY_SWEEP';
        avgTime = '1-2 days';
        probability = 55;
    } else if (totalLevels > 0) {
        historicalPattern = 'MONTHLY_SWEEP';
        avgTime = '1-2 weeks';
        probability = 35;
    }
    
    return {
        bestSession,
        avgTimeToLiquidityGrab: avgTime,
        historicalPattern,
        probabilityOfSweep: probability,
        nextLikelyWindow
    };
}

// Fetch COT data for Forex pairs
async function fetchCOTData(symbol: string): Promise<LiquidityMapData['cotData'] | undefined> {
    // Map forex symbols to COT currency codes
    const cotMap: Record<string, string> = {
        'EURUSD=X': 'EUR',
        'GBPUSD=X': 'GBP',
        'USDJPY=X': 'JPY',
        'AUDUSD=X': 'AUD',
        'USDCAD=X': 'CAD',
        'NZDUSD=X': 'NZD',
        'USDCHF=X': 'CHF'
    };
    
    const currency = cotMap[symbol];
    if (!currency) return undefined;
    
    try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const res = await fetch(`${baseUrl}/api/cot?currency=${currency}`, { cache: 'no-store' });
        if (!res.ok) return undefined;
        
        const data = await res.json();
        if (!data.success || !data.data) return undefined;
        
        const cot = data.data;
        const commercialNet = (cot.commercialLong || 0) - (cot.commercialShort || 0);
        const nonCommercialNet = (cot.nonCommercialLong || 0) - (cot.nonCommercialShort || 0);
        
        let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
        if (nonCommercialNet > 10000) sentiment = 'BULLISH';
        else if (nonCommercialNet < -10000) sentiment = 'BEARISH';
        
        return { commercialNet, nonCommercialNet, sentiment };
    } catch {
        return undefined;
    }
}

// Fetch MESO allowed instruments
async function fetchMesoInstruments(): Promise<{ symbol: string; class: string }[]> {
    try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const res = await fetch(`${baseUrl}/api/meso`, { cache: 'no-store' });
        if (!res.ok) return [];
        
        const data = await res.json();
        if (!data.success || !data.microInputs?.allowedInstruments) return [];
        
        return data.microInputs.allowedInstruments.map((i: { symbol: string; class: string }) => ({
            symbol: i.symbol,
            class: i.class.toLowerCase()
        }));
    } catch {
        return [];
    }
}

// Determine asset class from symbol
function getAssetClass(symbol: string): 'forex' | 'etf' | 'crypto' | 'commodity' | 'index' {
    if (symbol.includes('=X')) return 'forex';
    if (symbol.includes('-USD') && (symbol.startsWith('BTC') || symbol.startsWith('ETH'))) return 'crypto';
    if (symbol.includes('=F')) return 'commodity';
    if (symbol.startsWith('^')) return 'index';
    return 'etf';
}

async function analyzeLiquidity(
    symbol: string, 
    assetClass: 'forex' | 'etf' | 'crypto' | 'commodity' | 'index'
): Promise<LiquidityMapData | null> {
    const candles = await fetchCandles(symbol, '1mo', '1h');
    if (candles.length < 20) return null;
    
    const currentPrice = candles[candles.length - 1].close;
    const atr = calculateATR(candles);
    
    // Tolerance varies by asset class
    const toleranceMap: Record<string, number> = {
        forex: 0.0005,
        crypto: 0.01,
        etf: 0.005,
        commodity: 0.01,
        index: 0.005
    };
    const tolerance = toleranceMap[assetClass] || 0.005;
    
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
    
    // Get timing analysis
    const timing = calculateLiquidityTiming(candles, equalLevels, assetClass);
    
    // Get source info
    const source = getLiquiditySource(assetClass, symbol);
    
    // Get COT data for forex
    const cotData = assetClass === 'forex' ? await fetchCOTData(symbol) : undefined;
    
    return {
        symbol,
        displaySymbol: symbol.replace('=X', '').replace('-USD', '').replace('=F', '').replace('^', ''),
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
        timing,
        source,
        cotData,
        timestamp: new Date().toISOString()
    };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const symbolParam = searchParams.get('symbol');
        const assetClassParam = searchParams.get('class') as 'forex' | 'etf' | 'crypto' | 'commodity' | 'index' | 'all' | null;
        const useMeso = searchParams.get('meso') === 'true';
        
        // Single symbol analysis
        if (symbolParam) {
            const assetClass = assetClassParam && assetClassParam !== 'all' 
                ? assetClassParam 
                : getAssetClass(symbolParam);
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
        
        // Build symbol list - either from MESO or defaults
        type AssetClass = 'forex' | 'etf' | 'crypto' | 'commodity' | 'index';
        let symbols: { symbol: string; class: AssetClass }[] = [];
        
        if (useMeso) {
            // Fetch from MESO allowed instruments
            const mesoInstruments = await fetchMesoInstruments();
            symbols = mesoInstruments.map(i => ({
                symbol: i.symbol,
                class: getAssetClass(i.symbol)
            }));
        }
        
        // Add defaults if MESO empty or specific class requested
        if (symbols.length === 0 || !useMeso) {
            const includeAll = !assetClassParam || assetClassParam === 'all';
            
            if (includeAll || assetClassParam === 'forex') {
                symbols.push(...DEFAULT_FOREX.map(s => ({ symbol: s, class: 'forex' as const })));
            }
            if (includeAll || assetClassParam === 'etf') {
                symbols.push(...DEFAULT_ETF.map(s => ({ symbol: s, class: 'etf' as const })));
            }
            if (includeAll || assetClassParam === 'crypto') {
                symbols.push(...DEFAULT_CRYPTO.map(s => ({ symbol: s, class: 'crypto' as const })));
            }
            if (includeAll || assetClassParam === 'commodity') {
                symbols.push(...DEFAULT_COMMODITY.map(s => ({ symbol: s, class: 'commodity' as const })));
            }
            if (includeAll || assetClassParam === 'index') {
                symbols.push(...DEFAULT_INDEX.map(s => ({ symbol: s, class: 'index' as const })));
            }
        }
        
        // Remove duplicates
        const uniqueSymbols = Array.from(new Map(symbols.map(s => [s.symbol, s])).values());
        
        // Analyze in parallel with concurrency limit
        const results: LiquidityMapData[] = [];
        const batchSize = 5;
        
        for (let i = 0; i < uniqueSymbols.length; i += batchSize) {
            const batch = uniqueSymbols.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(s => analyzeLiquidity(s.symbol, s.class))
            );
            results.push(...batchResults.filter((r): r is LiquidityMapData => r !== null));
        }
        
        // Group by asset class
        const forexResults = results.filter(r => r.assetClass === 'forex');
        const etfResults = results.filter(r => r.assetClass === 'etf');
        const cryptoResults = results.filter(r => r.assetClass === 'crypto');
        const commodityResults = results.filter(r => r.assetClass === 'commodity');
        const indexResults = results.filter(r => r.assetClass === 'index');
        
        // Helper for summary calculation
        const calcSummary = (arr: LiquidityMapData[], decimals: number) => ({
            total: arr.length,
            seekingBuyside: arr.filter(r => r.marketDirection === 'SEEKING_BUYSIDE').length,
            seekingSellside: arr.filter(r => r.marketDirection === 'SEEKING_SELLSIDE').length,
            balanced: arr.filter(r => r.marketDirection === 'BALANCED').length,
            topLiquidity: arr
                .filter(r => r.equalLevels.length > 0)
                .sort((a, b) => (b.equalLevels[0]?.touches || 0) - (a.equalLevels[0]?.touches || 0))
                .slice(0, 3)
                .map(r => ({
                    symbol: r.displaySymbol,
                    direction: r.marketDirection,
                    nearestLiquidity: r.equalLevels[0]?.price.toFixed(decimals),
                    timing: r.timing.nextLikelyWindow,
                    probability: r.timing.probabilityOfSweep
                }))
        });
        
        const summary = {
            forex: calcSummary(forexResults, 5),
            etf: calcSummary(etfResults, 2),
            crypto: calcSummary(cryptoResults, 2),
            commodity: calcSummary(commodityResults, 2),
            index: calcSummary(indexResults, 2),
            total: {
                analyzed: results.length,
                fromMeso: useMeso,
                seekingBuyside: results.filter(r => r.marketDirection === 'SEEKING_BUYSIDE').length,
                seekingSellside: results.filter(r => r.marketDirection === 'SEEKING_SELLSIDE').length
            }
        };
        
        serverLog('info', 'liquidity_map_full', { 
            total: results.length,
            forex: forexResults.length, 
            etf: etfResults.length,
            crypto: cryptoResults.length,
            commodity: commodityResults.length,
            index: indexResults.length,
            useMeso
        }, 'api/liquidity-map');
        
        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            forex: forexResults,
            etf: etfResults,
            crypto: cryptoResults,
            commodity: commodityResults,
            index: indexResults,
            all: results,
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
