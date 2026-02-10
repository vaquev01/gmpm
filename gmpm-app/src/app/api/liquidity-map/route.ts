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

// ============================================================================
// LIQUIDITY TOLERANCE & BEHAVIOR ANALYSIS
// ============================================================================

// How much an asset tolerates leaving liquidity behind before reversing
interface LiquidityToleranceProfile {
    toleranceScore: number; // 0-100: 0=always captures, 100=often ignores
    avgSkippedLiquidity: number; // Average % of liquidity left behind
    maxSkippedLiquidity: number; // Maximum observed skip
    behaviorPattern: 'AGGRESSIVE_HUNTER' | 'SELECTIVE_HUNTER' | 'PASSIVE' | 'UNPREDICTABLE';
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    description: string;
}

// Probability of reaching specific liquidity zones
interface LiquidityCaptureAnalysis {
    targetZone: { price: number; type: 'BUYSIDE' | 'SELLSIDE'; strength: number };
    distancePercent: number;
    captureProbability: number; // 0-100%
    expectedTimeframe: string; // e.g., "4-8 hours", "1-2 days"
    riskToReward: number;
    confidenceFactors: string[];
    warningFactors: string[];
}

// Investment size impact on liquidity
interface InvestmentSizeAnalysis {
    tier: 'RETAIL' | 'SMALL_INST' | 'MEDIUM_INST' | 'LARGE_INST';
    investmentRange: string; // e.g., "$1K-$10K"
    slippageEstimate: number; // Expected slippage %
    liquidityAdequacy: 'EXCELLENT' | 'GOOD' | 'ADEQUATE' | 'POOR' | 'INSUFFICIENT';
    maxPositionSize: number; // Max recommended position
    avgDailyVolume: number;
    volumeParticipation: number; // % of daily volume your trade represents
    recommendation: string;
}

// Historical liquidity behavior patterns
interface HistoricalLiquidityBehavior {
    sweepFrequency: number; // Sweeps per week
    avgSweepMagnitude: number; // Average % move after sweep
    avgRetracementAfterSweep: number; // How much it retraces after capturing
    preferredSweepSession: 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OVERLAP';
    typicalSweepDuration: string; // How long sweeps take
    fakeoutRate: number; // % of sweeps that are fakeouts
    patterns: {
        mondayBias: 'BUYSIDE' | 'SELLSIDE' | 'NEUTRAL';
        fridayBias: 'BUYSIDE' | 'SELLSIDE' | 'NEUTRAL';
        monthEndBias: 'BUYSIDE' | 'SELLSIDE' | 'NEUTRAL';
    };
    recentSweeps: {
        timestamp: string;
        type: 'BUYSIDE' | 'SELLSIDE';
        magnitude: number;
        wasSuccessful: boolean;
    }[];
}

// Expected price targets based on liquidity
interface LiquidityPriceTarget {
    direction: 'LONG' | 'SHORT';
    primaryTarget: number;
    primaryProbability: number;
    secondaryTarget: number;
    secondaryProbability: number;
    invalidationLevel: number;
    timeHorizon: string;
    rationale: string[];
    riskFactors: string[];
}

// Multi-timeframe liquidity analysis
interface MultiTimeframeLiquidity {
    m15: { bias: 'BUYSIDE' | 'SELLSIDE' | 'NEUTRAL'; nearestLiquidity: number; distance: number };
    h1: { bias: 'BUYSIDE' | 'SELLSIDE' | 'NEUTRAL'; nearestLiquidity: number; distance: number };
    h4: { bias: 'BUYSIDE' | 'SELLSIDE' | 'NEUTRAL'; nearestLiquidity: number; distance: number };
    d1: { bias: 'BUYSIDE' | 'SELLSIDE' | 'NEUTRAL'; nearestLiquidity: number; distance: number };
    alignment: 'ALIGNED_BUYSIDE' | 'ALIGNED_SELLSIDE' | 'CONFLICTING' | 'NEUTRAL';
    strongestTimeframe: 'M15' | 'H1' | 'H4' | 'D1';
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
    // NEW: Enhanced liquidity analysis
    toleranceProfile: LiquidityToleranceProfile;
    captureAnalysis: LiquidityCaptureAnalysis[];
    investmentAnalysis: InvestmentSizeAnalysis[];
    historicalBehavior: HistoricalLiquidityBehavior;
    priceTargets: LiquidityPriceTarget;
    mtfLiquidity: MultiTimeframeLiquidity;
    liquidityScore: number; // Overall 0-100 score for trade quality based on liquidity
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

// Fetch MESO allowed instruments (cached 5 min to avoid cascade per-symbol)
let _mesoCache: { ts: number; data: { symbol: string; class: string }[] } | null = null;
const MESO_CACHE_TTL = 5 * 60_000;

async function fetchMesoInstruments(): Promise<{ symbol: string; class: string }[]> {
    if (_mesoCache && (Date.now() - _mesoCache.ts) < MESO_CACHE_TTL) return _mesoCache.data;
    try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const res = await fetch(`${baseUrl}/api/meso`, { cache: 'no-store' });
        if (!res.ok) return _mesoCache?.data || [];
        
        const data = await res.json();
        if (!data.success || !data.microInputs?.allowedInstruments) return _mesoCache?.data || [];
        
        const instruments = data.microInputs.allowedInstruments.map((i: { symbol: string; class: string }) => ({
            symbol: i.symbol,
            class: i.class.toLowerCase()
        }));
        _mesoCache = { ts: Date.now(), data: instruments };
        return instruments;
    } catch {
        return _mesoCache?.data || [];
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

// ============================================================================
// ADVANCED LIQUIDITY ANALYSIS FUNCTIONS
// ============================================================================

// Calculate Liquidity Tolerance Profile - how much the asset tolerates leaving liquidity
function calculateLiquidityTolerance(
    candles: YahooCandle[],
    equalLevels: EqualLevel[],
    _atr: number // Prefixed with _ to indicate intentionally unused but kept for future use
): LiquidityToleranceProfile {
    void _atr;
    if (candles.length < 50 || equalLevels.length === 0) {
        return {
            toleranceScore: 50,
            avgSkippedLiquidity: 0,
            maxSkippedLiquidity: 0,
            behaviorPattern: 'UNPREDICTABLE',
            confidenceLevel: 'LOW',
            description: 'Dados insuficientes para análise de tolerância'
        };
    }

    // Analyze how often price reaches liquidity zones vs passes them
    let sweepCount = 0;
    let skipCount = 0;
    let totalSkipDistance = 0;
    let maxSkip = 0;

    for (const level of equalLevels) {
        const isHigh = level.type === 'EQUAL_HIGHS';
        let swept = false;
        let minDistanceToLevel = Infinity;

        for (let i = Math.max(0, candles.length - 100); i < candles.length; i++) {
            const c = candles[i];
            if (isHigh && c.high >= level.price) {
                swept = true;
                sweepCount++;
                break;
            }
            if (!isHigh && c.low <= level.price) {
                swept = true;
                sweepCount++;
                break;
            }
            // Track how close it got
            const dist = isHigh 
                ? Math.abs(c.high - level.price) / level.price * 100
                : Math.abs(c.low - level.price) / level.price * 100;
            minDistanceToLevel = Math.min(minDistanceToLevel, dist);
        }

        if (!swept && minDistanceToLevel < 2) { // Got within 2% but didn't sweep
            skipCount++;
            totalSkipDistance += minDistanceToLevel;
            maxSkip = Math.max(maxSkip, minDistanceToLevel);
        }
    }

    const totalLevels = equalLevels.length;
    const sweepRate = totalLevels > 0 ? (sweepCount / totalLevels) * 100 : 50;
    const avgSkip = skipCount > 0 ? totalSkipDistance / skipCount : 0;

    // Calculate tolerance score (0 = aggressive hunter, 100 = passive)
    const toleranceScore = Math.min(100, Math.max(0, 100 - sweepRate + (skipCount * 5)));

    let behaviorPattern: LiquidityToleranceProfile['behaviorPattern'] = 'UNPREDICTABLE';
    if (sweepRate >= 70) behaviorPattern = 'AGGRESSIVE_HUNTER';
    else if (sweepRate >= 50) behaviorPattern = 'SELECTIVE_HUNTER';
    else if (sweepRate >= 30) behaviorPattern = 'PASSIVE';

    const descriptions: Record<typeof behaviorPattern, string> = {
        'AGGRESSIVE_HUNTER': `Este ativo caça liquidez agressivamente (${sweepRate.toFixed(0)}% dos níveis foram varridos). Alta probabilidade de atingir zonas de liquidez.`,
        'SELECTIVE_HUNTER': `Este ativo é seletivo na captura de liquidez (${sweepRate.toFixed(0)}% dos níveis). Tende a buscar apenas níveis mais fortes.`,
        'PASSIVE': `Este ativo frequentemente deixa liquidez para trás (apenas ${sweepRate.toFixed(0)}% capturado). Use stops mais largos.`,
        'UNPREDICTABLE': `Padrão de captura inconsistente. Comportamento imprevisível em relação a zonas de liquidez.`
    };

    return {
        toleranceScore: Math.round(toleranceScore),
        avgSkippedLiquidity: avgSkip,
        maxSkippedLiquidity: maxSkip,
        behaviorPattern,
        confidenceLevel: totalLevels >= 5 ? 'HIGH' : totalLevels >= 3 ? 'MEDIUM' : 'LOW',
        description: descriptions[behaviorPattern]
    };
}

// Calculate capture probability for each liquidity zone
function calculateCaptureAnalysis(
    currentPrice: number,
    equalLevels: EqualLevel[],
    atr: number,
    toleranceProfile: LiquidityToleranceProfile,
    marketDirection: 'SEEKING_BUYSIDE' | 'SEEKING_SELLSIDE' | 'BALANCED'
): LiquidityCaptureAnalysis[] {
    const analyses: LiquidityCaptureAnalysis[] = [];

    // Analyze top 5 nearest levels
    const sortedLevels = [...equalLevels]
        .map(l => ({ ...l, distance: Math.abs(l.price - currentPrice) / currentPrice * 100 }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5);

    for (const level of sortedLevels) {
        const isBuyside = level.type === 'EQUAL_HIGHS';
        const distancePercent = level.distance;
        const atrDistance = Math.abs(level.price - currentPrice) / atr;

        // Base probability from tolerance profile
        let baseProbability = 100 - toleranceProfile.toleranceScore;

        // Adjust by level strength
        if (level.strength === 'STRONG') baseProbability += 15;
        else if (level.strength === 'MODERATE') baseProbability += 5;

        // Adjust by market direction alignment
        if ((isBuyside && marketDirection === 'SEEKING_BUYSIDE') ||
            (!isBuyside && marketDirection === 'SEEKING_SELLSIDE')) {
            baseProbability += 20;
        } else if (marketDirection !== 'BALANCED') {
            baseProbability -= 15;
        }

        // Adjust by distance (closer = higher probability)
        if (distancePercent < 0.5) baseProbability += 15;
        else if (distancePercent < 1) baseProbability += 10;
        else if (distancePercent > 3) baseProbability -= 20;

        // Clamp probability
        const captureProbability = Math.min(95, Math.max(5, baseProbability));

        // Calculate timeframe
        let expectedTimeframe = '1-2 semanas';
        if (atrDistance < 1) expectedTimeframe = '2-4 horas';
        else if (atrDistance < 2) expectedTimeframe = '4-8 horas';
        else if (atrDistance < 3) expectedTimeframe = '1-2 dias';
        else if (atrDistance < 5) expectedTimeframe = '3-5 dias';

        // Risk to reward (simplified: distance to level / ATR as stop)
        const riskToReward = distancePercent / (atr / currentPrice * 100);

        const confidenceFactors: string[] = [];
        const warningFactors: string[] = [];

        if (level.strength === 'STRONG') confidenceFactors.push('Nível forte com múltiplos toques');
        if (toleranceProfile.behaviorPattern === 'AGGRESSIVE_HUNTER') confidenceFactors.push('Ativo caça liquidez agressivamente');
        if (marketDirection !== 'BALANCED' && ((isBuyside && marketDirection === 'SEEKING_BUYSIDE') || (!isBuyside && marketDirection === 'SEEKING_SELLSIDE'))) {
            confidenceFactors.push('Direção do mercado alinhada');
        }
        if (distancePercent < 1) confidenceFactors.push('Nível muito próximo');

        if (toleranceProfile.behaviorPattern === 'PASSIVE') warningFactors.push('Ativo frequentemente ignora liquidez');
        if (distancePercent > 2) warningFactors.push('Distância considerável do preço atual');
        if (level.strength === 'WEAK') warningFactors.push('Nível fraco, menor probabilidade');

        analyses.push({
            targetZone: {
                price: level.price,
                type: isBuyside ? 'BUYSIDE' : 'SELLSIDE',
                strength: level.touches * 20
            },
            distancePercent,
            captureProbability: Math.round(captureProbability),
            expectedTimeframe,
            riskToReward: Math.round(riskToReward * 100) / 100,
            confidenceFactors,
            warningFactors
        });
    }

    return analyses.sort((a, b) => b.captureProbability - a.captureProbability);
}

// Calculate investment size analysis
function calculateInvestmentAnalysis(
    candles: YahooCandle[],
    currentPrice: number,
    assetClass: string
): InvestmentSizeAnalysis[] {
    // Calculate average daily volume
    const recentCandles = candles.slice(-24); // Last 24 hours
    const avgVolume = recentCandles.reduce((sum, c) => sum + c.volume, 0) / recentCandles.length;
    const avgDailyVolume = avgVolume * 24; // Approximate daily volume
    const avgDailyValue = avgDailyVolume * currentPrice;

    // Investment tiers
    const tiers: { 
        tier: InvestmentSizeAnalysis['tier']; 
        min: number; 
        max: number; 
        range: string 
    }[] = [
        { tier: 'RETAIL', min: 1000, max: 10000, range: '$1K - $10K' },
        { tier: 'SMALL_INST', min: 10000, max: 100000, range: '$10K - $100K' },
        { tier: 'MEDIUM_INST', min: 100000, max: 1000000, range: '$100K - $1M' },
        { tier: 'LARGE_INST', min: 1000000, max: 10000000, range: '$1M - $10M' }
    ];

    return tiers.map(({ tier, min, max, range }) => {
        const midInvestment = (min + max) / 2;
        const volumeParticipation = avgDailyValue > 0 ? (midInvestment / avgDailyValue) * 100 : 100;

        // Slippage estimate based on participation rate
        let slippageEstimate = 0.01; // 0.01% base
        if (volumeParticipation > 10) slippageEstimate = 0.5;
        else if (volumeParticipation > 5) slippageEstimate = 0.25;
        else if (volumeParticipation > 1) slippageEstimate = 0.1;
        else if (volumeParticipation > 0.5) slippageEstimate = 0.05;

        // Adjust by asset class
        if (assetClass === 'crypto') slippageEstimate *= 2;
        if (assetClass === 'forex') slippageEstimate *= 0.5;

        // Determine adequacy
        let liquidityAdequacy: InvestmentSizeAnalysis['liquidityAdequacy'] = 'EXCELLENT';
        if (volumeParticipation > 10) liquidityAdequacy = 'INSUFFICIENT';
        else if (volumeParticipation > 5) liquidityAdequacy = 'POOR';
        else if (volumeParticipation > 2) liquidityAdequacy = 'ADEQUATE';
        else if (volumeParticipation > 0.5) liquidityAdequacy = 'GOOD';

        // Max position (1% of daily volume for minimal impact)
        const maxPositionSize = avgDailyValue * 0.01;

        const recommendations: Record<typeof liquidityAdequacy, string> = {
            'EXCELLENT': 'Liquidez excelente. Execute sem preocupações de slippage.',
            'GOOD': 'Boa liquidez. Pequeno impacto esperado, use limit orders.',
            'ADEQUATE': 'Liquidez adequada. Divida a ordem em partes menores.',
            'POOR': 'Liquidez fraca. Alto risco de slippage, considere reduzir tamanho.',
            'INSUFFICIENT': 'Liquidez insuficiente. Não recomendado para este tamanho de posição.'
        };

        return {
            tier,
            investmentRange: range,
            slippageEstimate: Math.round(slippageEstimate * 100) / 100,
            liquidityAdequacy,
            maxPositionSize: Math.round(maxPositionSize),
            avgDailyVolume: Math.round(avgDailyVolume),
            volumeParticipation: Math.round(volumeParticipation * 100) / 100,
            recommendation: recommendations[liquidityAdequacy]
        };
    });
}

// Calculate historical liquidity behavior
function calculateHistoricalBehavior(
    candles: YahooCandle[],
    equalLevels: EqualLevel[],
    atr: number,
    assetClass: string
): HistoricalLiquidityBehavior {
    const recentSweeps: HistoricalLiquidityBehavior['recentSweeps'] = [];
    let sweepCount = 0;
    let totalMagnitude = 0;
    let totalRetracement = 0;

    // Analyze sweeps in historical data
    for (let i = 10; i < candles.length - 5; i++) {
        const prevHigh = Math.max(...candles.slice(i - 10, i).map(c => c.high));
        const prevLow = Math.min(...candles.slice(i - 10, i).map(c => c.low));
        const curr = candles[i];
        const nextCandles = candles.slice(i + 1, i + 6);

        // Check for buyside sweep
        if (curr.high > prevHigh * 1.001) {
            const magnitude = (curr.high - prevHigh) / prevHigh * 100;
            const retracementLow = Math.min(...nextCandles.map(c => c.low));
            const retracement = (curr.high - retracementLow) / curr.high * 100;
            const wasSuccessful = retracement > magnitude * 0.5;

            if (magnitude > 0.1) {
                sweepCount++;
                totalMagnitude += magnitude;
                totalRetracement += retracement;
                if (recentSweeps.length < 5) {
                    recentSweeps.push({
                        timestamp: new Date(curr.timestamp * 1000).toISOString(),
                        type: 'BUYSIDE',
                        magnitude: Math.round(magnitude * 100) / 100,
                        wasSuccessful
                    });
                }
            }
        }

        // Check for sellside sweep
        if (curr.low < prevLow * 0.999) {
            const magnitude = (prevLow - curr.low) / prevLow * 100;
            const retracementHigh = Math.max(...nextCandles.map(c => c.high));
            const retracement = (retracementHigh - curr.low) / curr.low * 100;
            const wasSuccessful = retracement > magnitude * 0.5;

            if (magnitude > 0.1) {
                sweepCount++;
                totalMagnitude += magnitude;
                totalRetracement += retracement;
                if (recentSweeps.length < 5) {
                    recentSweeps.push({
                        timestamp: new Date(curr.timestamp * 1000).toISOString(),
                        type: 'SELLSIDE',
                        magnitude: Math.round(magnitude * 100) / 100,
                        wasSuccessful
                    });
                }
            }
        }
    }

    // Calculate weekly sweep frequency
    const weeksOfData = candles.length / (24 * 7); // Assuming hourly candles
    const sweepFrequency = weeksOfData > 0 ? sweepCount / weeksOfData : 0;

    // Fakeout rate
    const successfulSweeps = recentSweeps.filter(s => s.wasSuccessful).length;
    const fakeoutRate = recentSweeps.length > 0 
        ? ((recentSweeps.length - successfulSweeps) / recentSweeps.length) * 100 
        : 50;

    // Determine preferred session based on asset class
    const sessionMap: Record<string, HistoricalLiquidityBehavior['preferredSweepSession']> = {
        forex: 'OVERLAP',
        etf: 'NEW_YORK',
        crypto: 'ASIA',
        commodity: 'NEW_YORK',
        index: 'NEW_YORK'
    };

    // Analyze day-of-week patterns (simplified)
    const mondayCandles = candles.filter(c => new Date(c.timestamp * 1000).getDay() === 1);
    const fridayCandles = candles.filter(c => new Date(c.timestamp * 1000).getDay() === 5);

    const mondayBullish = mondayCandles.filter(c => c.close > c.open).length / (mondayCandles.length || 1);
    const fridayBullish = fridayCandles.filter(c => c.close > c.open).length / (fridayCandles.length || 1);

    return {
        sweepFrequency: Math.round(sweepFrequency * 10) / 10,
        avgSweepMagnitude: sweepCount > 0 ? Math.round(totalMagnitude / sweepCount * 100) / 100 : 0,
        avgRetracementAfterSweep: sweepCount > 0 ? Math.round(totalRetracement / sweepCount * 100) / 100 : 0,
        preferredSweepSession: sessionMap[assetClass] || 'NEW_YORK',
        typicalSweepDuration: sweepFrequency > 5 ? '2-4 horas' : sweepFrequency > 2 ? '4-8 horas' : '1-2 dias',
        fakeoutRate: Math.round(fakeoutRate),
        patterns: {
            mondayBias: mondayBullish > 0.55 ? 'BUYSIDE' : mondayBullish < 0.45 ? 'SELLSIDE' : 'NEUTRAL',
            fridayBias: fridayBullish > 0.55 ? 'BUYSIDE' : fridayBullish < 0.45 ? 'SELLSIDE' : 'NEUTRAL',
            monthEndBias: 'NEUTRAL' // Would need more data to determine
        },
        recentSweeps
    };
}

// Calculate liquidity-based price targets
function calculateLiquidityPriceTargets(
    currentPrice: number,
    equalLevels: EqualLevel[],
    marketDirection: 'SEEKING_BUYSIDE' | 'SEEKING_SELLSIDE' | 'BALANCED',
    toleranceProfile: LiquidityToleranceProfile,
    atr: number
): LiquidityPriceTarget {
    const buysideLevels = equalLevels
        .filter(e => e.type === 'EQUAL_HIGHS' && e.price > currentPrice)
        .sort((a, b) => a.price - b.price);

    const sellsideLevels = equalLevels
        .filter(e => e.type === 'EQUAL_LOWS' && e.price < currentPrice)
        .sort((a, b) => b.price - a.price);

    // Determine direction based on market direction and available liquidity
    let direction: 'LONG' | 'SHORT' = 'LONG';
    let primaryTarget = currentPrice + atr * 2;
    let secondaryTarget = currentPrice + atr * 3;
    let invalidationLevel = currentPrice - atr;
    let primaryProbability = 50;
    let secondaryProbability = 30;

    if (marketDirection === 'SEEKING_BUYSIDE' && buysideLevels.length > 0) {
        direction = 'LONG';
        primaryTarget = buysideLevels[0].price;
        secondaryTarget = buysideLevels[1]?.price || primaryTarget * 1.01;
        invalidationLevel = sellsideLevels[0]?.price || currentPrice - atr;
        primaryProbability = 100 - toleranceProfile.toleranceScore + (buysideLevels[0].touches * 5);
        secondaryProbability = primaryProbability * 0.6;
    } else if (marketDirection === 'SEEKING_SELLSIDE' && sellsideLevels.length > 0) {
        direction = 'SHORT';
        primaryTarget = sellsideLevels[0].price;
        secondaryTarget = sellsideLevels[1]?.price || primaryTarget * 0.99;
        invalidationLevel = buysideLevels[0]?.price || currentPrice + atr;
        primaryProbability = 100 - toleranceProfile.toleranceScore + (sellsideLevels[0].touches * 5);
        secondaryProbability = primaryProbability * 0.6;
    } else if (buysideLevels.length > 0 && sellsideLevels.length > 0) {
        // Balanced - choose side with stronger liquidity
        const buysideStrength = buysideLevels.reduce((sum, l) => sum + l.touches, 0);
        const sellsideStrength = sellsideLevels.reduce((sum, l) => sum + l.touches, 0);

        if (buysideStrength >= sellsideStrength) {
            direction = 'LONG';
            primaryTarget = buysideLevels[0].price;
            secondaryTarget = buysideLevels[1]?.price || primaryTarget * 1.01;
            invalidationLevel = sellsideLevels[0]?.price || currentPrice - atr;
        } else {
            direction = 'SHORT';
            primaryTarget = sellsideLevels[0].price;
            secondaryTarget = sellsideLevels[1]?.price || primaryTarget * 0.99;
            invalidationLevel = buysideLevels[0]?.price || currentPrice + atr;
        }
        primaryProbability = 45;
        secondaryProbability = 25;
    }

    // Clamp probabilities
    primaryProbability = Math.min(85, Math.max(15, primaryProbability));
    secondaryProbability = Math.min(70, Math.max(10, secondaryProbability));

    // Calculate time horizon
    const distancePct = Math.abs(primaryTarget - currentPrice) / currentPrice * 100;
    let timeHorizon = '1-2 semanas';
    if (distancePct < 0.5) timeHorizon = '4-8 horas';
    else if (distancePct < 1) timeHorizon = '1-2 dias';
    else if (distancePct < 2) timeHorizon = '3-5 dias';

    const rationale: string[] = [];
    const riskFactors: string[] = [];

    if (marketDirection !== 'BALANCED') {
        rationale.push(`Mercado buscando liquidez ${direction === 'LONG' ? 'acima (buyside)' : 'abaixo (sellside)'}`);
    }
    if (toleranceProfile.behaviorPattern === 'AGGRESSIVE_HUNTER') {
        rationale.push('Ativo historicamente captura liquidez de forma agressiva');
    }
    if (direction === 'LONG' && buysideLevels[0]?.strength === 'STRONG') {
        rationale.push('Nível de liquidez forte com múltiplos toques');
    }
    if (direction === 'SHORT' && sellsideLevels[0]?.strength === 'STRONG') {
        rationale.push('Nível de liquidez forte com múltiplos toques');
    }

    if (toleranceProfile.behaviorPattern === 'PASSIVE') {
        riskFactors.push('Ativo pode não capturar a liquidez');
    }
    if (distancePct > 2) {
        riskFactors.push('Distância considerável até o alvo');
    }
    if (marketDirection === 'BALANCED') {
        riskFactors.push('Direção do mercado indefinida');
    }

    return {
        direction,
        primaryTarget: Math.round(primaryTarget * 10000) / 10000,
        primaryProbability: Math.round(primaryProbability),
        secondaryTarget: Math.round(secondaryTarget * 10000) / 10000,
        secondaryProbability: Math.round(secondaryProbability),
        invalidationLevel: Math.round(invalidationLevel * 10000) / 10000,
        timeHorizon,
        rationale,
        riskFactors
    };
}

// Multi-timeframe liquidity analysis
async function calculateMTFLiquidity(
    symbol: string,
    currentPrice: number
): Promise<MultiTimeframeLiquidity> {
    const defaultBias = { bias: 'NEUTRAL' as const, nearestLiquidity: currentPrice, distance: 0 };

    // Fetch different timeframes
    const [m15Candles, h1Candles, h4Candles, d1Candles] = await Promise.all([
        fetchCandles(symbol, '5d', '15m'),
        fetchCandles(symbol, '1mo', '1h'),
        fetchCandles(symbol, '3mo', '4h'),
        fetchCandles(symbol, '1y', '1d')
    ]);

    const analyzeTimeframe = (candles: YahooCandle[], tolerance: number) => {
        if (candles.length < 20) return defaultBias;

        const levels = findEqualLevels(candles, tolerance);
        const buyside = levels.filter(l => l.type === 'EQUAL_HIGHS' && l.price > currentPrice);
        const sellside = levels.filter(l => l.type === 'EQUAL_LOWS' && l.price < currentPrice);

        const nearestBuy = buyside.sort((a, b) => a.price - b.price)[0];
        const nearestSell = sellside.sort((a, b) => b.price - a.price)[0];

        let bias: 'BUYSIDE' | 'SELLSIDE' | 'NEUTRAL' = 'NEUTRAL';
        let nearestLiquidity = currentPrice;
        let distance = 0;

        if (nearestBuy && nearestSell) {
            const buyDist = (nearestBuy.price - currentPrice) / currentPrice;
            const sellDist = (currentPrice - nearestSell.price) / currentPrice;
            if (buyDist < sellDist) {
                bias = 'BUYSIDE';
                nearestLiquidity = nearestBuy.price;
                distance = buyDist * 100;
            } else {
                bias = 'SELLSIDE';
                nearestLiquidity = nearestSell.price;
                distance = sellDist * 100;
            }
        } else if (nearestBuy) {
            bias = 'BUYSIDE';
            nearestLiquidity = nearestBuy.price;
            distance = ((nearestBuy.price - currentPrice) / currentPrice) * 100;
        } else if (nearestSell) {
            bias = 'SELLSIDE';
            nearestLiquidity = nearestSell.price;
            distance = ((currentPrice - nearestSell.price) / currentPrice) * 100;
        }

        return { bias, nearestLiquidity: Math.round(nearestLiquidity * 10000) / 10000, distance: Math.round(distance * 100) / 100 };
    };

    const m15 = analyzeTimeframe(m15Candles, 0.001);
    const h1 = analyzeTimeframe(h1Candles, 0.002);
    const h4 = analyzeTimeframe(h4Candles, 0.005);
    const d1 = analyzeTimeframe(d1Candles, 0.01);

    // Determine alignment
    const biases = [m15.bias, h1.bias, h4.bias, d1.bias];
    const buysideCount = biases.filter(b => b === 'BUYSIDE').length;
    const sellsideCount = biases.filter(b => b === 'SELLSIDE').length;

    let alignment: MultiTimeframeLiquidity['alignment'] = 'NEUTRAL';
    if (buysideCount >= 3) alignment = 'ALIGNED_BUYSIDE';
    else if (sellsideCount >= 3) alignment = 'ALIGNED_SELLSIDE';
    else if (buysideCount >= 1 && sellsideCount >= 1) alignment = 'CONFLICTING';

    // Determine strongest timeframe (by distance - closer = more relevant)
    const timeframes = [
        { tf: 'M15' as const, dist: m15.distance },
        { tf: 'H1' as const, dist: h1.distance },
        { tf: 'H4' as const, dist: h4.distance },
        { tf: 'D1' as const, dist: d1.distance }
    ];
    const strongest = timeframes.filter(t => t.dist > 0).sort((a, b) => a.dist - b.dist)[0];

    return {
        m15,
        h1,
        h4,
        d1,
        alignment,
        strongestTimeframe: strongest?.tf || 'H1'
    };
}

// Calculate overall liquidity score
function calculateLiquidityScore(
    toleranceProfile: LiquidityToleranceProfile,
    captureAnalysis: LiquidityCaptureAnalysis[],
    mtfLiquidity: MultiTimeframeLiquidity,
    historicalBehavior: HistoricalLiquidityBehavior
): number {
    let score = 50; // Base score

    // Tolerance profile contribution (max 25 pts)
    if (toleranceProfile.behaviorPattern === 'AGGRESSIVE_HUNTER') score += 25;
    else if (toleranceProfile.behaviorPattern === 'SELECTIVE_HUNTER') score += 15;
    else if (toleranceProfile.behaviorPattern === 'PASSIVE') score += 5;

    // Capture probability contribution (max 20 pts)
    if (captureAnalysis.length > 0) {
        const topCapture = captureAnalysis[0].captureProbability;
        score += (topCapture / 100) * 20;
    }

    // MTF alignment contribution (max 15 pts)
    if (mtfLiquidity.alignment === 'ALIGNED_BUYSIDE' || mtfLiquidity.alignment === 'ALIGNED_SELLSIDE') {
        score += 15;
    } else if (mtfLiquidity.alignment === 'CONFLICTING') {
        score -= 5;
    }

    // Historical behavior contribution (max 10 pts)
    if (historicalBehavior.fakeoutRate < 30) score += 10;
    else if (historicalBehavior.fakeoutRate < 50) score += 5;
    else score -= 5;

    return Math.min(100, Math.max(0, Math.round(score)));
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
    
    // ============================================================================
    // ADVANCED LIQUIDITY ANALYSIS
    // ============================================================================
    
    // 1. Liquidity Tolerance Profile - how much this asset tolerates leaving liquidity
    const toleranceProfile = calculateLiquidityTolerance(candles, equalLevels, atr);
    
    // 2. Capture Analysis - probability of reaching each liquidity zone
    const captureAnalysis = calculateCaptureAnalysis(
        currentPrice, equalLevels, atr, toleranceProfile, marketDirection
    );
    
    // 3. Investment Size Analysis - slippage and adequacy per investment tier
    const investmentAnalysis = calculateInvestmentAnalysis(candles, currentPrice, assetClass);
    
    // 4. Historical Behavior - sweep patterns and frequency
    const historicalBehavior = calculateHistoricalBehavior(candles, equalLevels, atr, assetClass);
    
    // 5. Price Targets - expected targets based on liquidity
    const priceTargets = calculateLiquidityPriceTargets(
        currentPrice, equalLevels, marketDirection, toleranceProfile, atr
    );
    
    // 6. Multi-Timeframe Liquidity Analysis
    const mtfLiquidity = await calculateMTFLiquidity(symbol, currentPrice);
    
    // 7. Overall Liquidity Score
    const liquidityScore = calculateLiquidityScore(
        toleranceProfile, captureAnalysis, mtfLiquidity, historicalBehavior
    );
    
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
        // Advanced analysis
        toleranceProfile,
        captureAnalysis,
        investmentAnalysis,
        historicalBehavior,
        priceTargets,
        mtfLiquidity,
        liquidityScore,
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
