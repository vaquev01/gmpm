/**
 * GMPM v2.0 - Decision Engine API
 * Endpoint unificado que agrega todas as fontes de dados
 * 
 * GET /api/decision-engine
 * GET /api/decision-engine?symbol=EURUSD
 * GET /api/decision-engine?class=forex
 */

import { NextResponse } from 'next/server';
import {
    AssetAnalysis,
    DimensionInput,
    Direction,
    AssetClass,
    ActionDecision,
    DecisionEngineResponse,
    processMultipleAssets,
    generateEngineSummary,
} from '@/lib/decisionEngine';

// ============================================================================
// TYPES
// ============================================================================

interface RegimeSnapshot {
    regime: string;
    regimeConfidence: string;
    dominantDrivers: string[];
    axes: Record<string, { value: number; trend: string }>;
    mesoTilts: Array<{ assetClass: string; direction: string }>;
    mesoProhibitions: string[];
}

interface MesoData {
    regime: RegimeSnapshot;
    allowedInstruments: Array<{
        symbol: string;
        displaySymbol: string;
        name: string;
        assetClass: string;
        mesoDirection: string;
        mesoScore: number;
    }>;
    prohibitedInstruments: string[];
}

interface MarketAsset {
    symbol: string;
    displaySymbol: string;
    name: string;
    assetClass: string;
    price: number;
    change: number;
    signal: string;
    score: number;
    quality?: { status: string };
    breakdown?: { components?: Record<string, number> };
    high?: number;
    low?: number;
}

interface MicroAnalysis {
    symbol: string;
    recommendation: {
        action: string;
        bestSetup: {
            entry: number;
            stopLoss: number;
            takeProfit1: number;
            takeProfit2?: number;
            takeProfit3?: number;
            riskReward: number;
            direction: string;
        } | null;
    };
    technical: {
        trend: string;
        atr: number;
    };
}

interface LiquidityMapData {
    symbol: string;
    marketDirection: 'SEEKING_BUYSIDE' | 'SEEKING_SELLSIDE' | 'BALANCED';
    liquidityScore: number;
    buySideLiquidity: Array<{ level: number; strength: number }>;
    sellSideLiquidity: Array<{ level: number; strength: number }>;
}

interface CurrencyStrengthData {
    currencies: Array<{
        code: string;
        strength: number;
        strengthLabel: string;
        trend: string;
    }>;
    tradePlans: Array<{
        pair: string;
        direction: string;
        confidence: number;
        entry: number;
        stopLoss: number;
        takeProfit1: number;
    }>;
}

// ============================================================================
// HELPERS
// ============================================================================

const ASSET_UNIVERSE = [
    // Forex Majors
    { symbol: 'EURUSD=X', displaySymbol: 'EUR/USD', name: 'Euro/US Dollar', assetClass: 'FOREX' as AssetClass },
    { symbol: 'GBPUSD=X', displaySymbol: 'GBP/USD', name: 'British Pound/US Dollar', assetClass: 'FOREX' as AssetClass },
    { symbol: 'USDJPY=X', displaySymbol: 'USD/JPY', name: 'US Dollar/Japanese Yen', assetClass: 'FOREX' as AssetClass },
    { symbol: 'USDCHF=X', displaySymbol: 'USD/CHF', name: 'US Dollar/Swiss Franc', assetClass: 'FOREX' as AssetClass },
    { symbol: 'AUDUSD=X', displaySymbol: 'AUD/USD', name: 'Australian Dollar/US Dollar', assetClass: 'FOREX' as AssetClass },
    { symbol: 'USDCAD=X', displaySymbol: 'USD/CAD', name: 'US Dollar/Canadian Dollar', assetClass: 'FOREX' as AssetClass },
    { symbol: 'NZDUSD=X', displaySymbol: 'NZD/USD', name: 'New Zealand Dollar/US Dollar', assetClass: 'FOREX' as AssetClass },
    // Crypto
    { symbol: 'BTC-USD', displaySymbol: 'BTC/USD', name: 'Bitcoin', assetClass: 'CRYPTO' as AssetClass },
    { symbol: 'ETH-USD', displaySymbol: 'ETH/USD', name: 'Ethereum', assetClass: 'CRYPTO' as AssetClass },
    { symbol: 'SOL-USD', displaySymbol: 'SOL/USD', name: 'Solana', assetClass: 'CRYPTO' as AssetClass },
    // Commodities
    { symbol: 'GC=F', displaySymbol: 'GOLD', name: 'Gold Futures', assetClass: 'COMMODITY' as AssetClass },
    { symbol: 'SI=F', displaySymbol: 'SILVER', name: 'Silver Futures', assetClass: 'COMMODITY' as AssetClass },
    { symbol: 'CL=F', displaySymbol: 'OIL', name: 'Crude Oil Futures', assetClass: 'COMMODITY' as AssetClass },
    // Indices
    { symbol: 'ES=F', displaySymbol: 'S&P 500', name: 'E-mini S&P 500', assetClass: 'INDEX' as AssetClass },
    { symbol: 'NQ=F', displaySymbol: 'NASDAQ', name: 'E-mini NASDAQ', assetClass: 'INDEX' as AssetClass },
    { symbol: 'YM=F', displaySymbol: 'DOW', name: 'E-mini Dow Jones', assetClass: 'INDEX' as AssetClass },
];

function normalizeAssetClass(assetClass: string): AssetClass {
    const upper = assetClass.toUpperCase();
    if (upper === 'FOREX' || upper === 'FX') return 'FOREX';
    if (upper === 'CRYPTO' || upper === 'CRYPTOCURRENCY') return 'CRYPTO';
    if (upper === 'COMMODITY' || upper === 'COMMODITIES') return 'COMMODITY';
    if (upper === 'INDEX' || upper === 'INDICES') return 'INDEX';
    if (upper === 'STOCK' || upper === 'STOCKS' || upper === 'ETF') return 'STOCK';
    if (upper === 'BOND' || upper === 'BONDS') return 'BOND';
    return 'INDEX';
}

function signalToDirection(signal: string): Direction {
    if (signal === 'LONG' || signal === 'BUY') return 'LONG';
    if (signal === 'SHORT' || signal === 'SELL') return 'SHORT';
    return 'NEUTRAL';
}

async function fetchWithTimeout<T>(url: string, timeoutMs: number = 5000): Promise<T | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
        
        const res = await fetch(fullUrl, {
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store'
        });
        
        clearTimeout(timeoutId);
        
        if (!res.ok) return null;
        return await res.json() as T;
    } catch {
        clearTimeout(timeoutId);
        return null;
    }
}

// ============================================================================
// DATA FETCHERS
// ============================================================================

async function fetchRegimeData(): Promise<RegimeSnapshot | null> {
    return fetchWithTimeout<RegimeSnapshot>('/api/regime');
}

async function fetchMesoData(): Promise<MesoData | null> {
    return fetchWithTimeout<MesoData>('/api/meso');
}

async function fetchMarketData(): Promise<MarketAsset[]> {
    const data = await fetchWithTimeout<{ assets: MarketAsset[] }>('/api/market');
    return data?.assets || [];
}

async function fetchMicroData(symbols: string[]): Promise<Map<string, MicroAnalysis>> {
    const map = new Map<string, MicroAnalysis>();
    
    // Batch fetch (or individual if batch not available)
    const promises = symbols.slice(0, 20).map(async (symbol) => {
        const data = await fetchWithTimeout<MicroAnalysis>(`/api/micro?symbol=${encodeURIComponent(symbol)}`, 3000);
        if (data) {
            map.set(symbol, data);
        }
    });
    
    await Promise.allSettled(promises);
    return map;
}

async function fetchLiquidityData(symbols: string[]): Promise<Map<string, LiquidityMapData>> {
    const map = new Map<string, LiquidityMapData>();
    
    const promises = symbols.slice(0, 20).map(async (symbol) => {
        const data = await fetchWithTimeout<LiquidityMapData>(`/api/liquidity-map?symbol=${encodeURIComponent(symbol)}`, 3000);
        if (data) {
            map.set(symbol, data);
        }
    });
    
    await Promise.allSettled(promises);
    return map;
}

async function fetchCurrencyStrength(): Promise<CurrencyStrengthData | null> {
    return fetchWithTimeout<CurrencyStrengthData>('/api/currency-strength');
}

// ============================================================================
// ANALYSIS BUILDERS
// ============================================================================

function buildMacroInput(regime: RegimeSnapshot | null, assetClass: AssetClass, direction: Direction): DimensionInput | null {
    if (!regime) return null;

    // Determine if macro supports this direction
    let macroDirection: Direction = 'NEUTRAL';
    let macroScore = 50;

    const regimeType = regime.regime;
    const axes = regime.axes || {};

    // Risk-on regimes favor LONG for risk assets
    const riskOnRegimes = ['GOLDILOCKS', 'REFLATION', 'RISK_ON'];
    const riskOffRegimes = ['STAGFLATION', 'DEFLATION', 'LIQUIDITY_DRAIN', 'CREDIT_STRESS', 'RISK_OFF'];

    if (assetClass === 'CRYPTO' || assetClass === 'INDEX' || assetClass === 'STOCK') {
        if (riskOnRegimes.includes(regimeType)) {
            macroDirection = 'LONG';
            macroScore = 75;
        } else if (riskOffRegimes.includes(regimeType)) {
            macroDirection = 'SHORT';
            macroScore = 70;
        }
    } else if (assetClass === 'COMMODITY') {
        // Gold benefits from inflation/uncertainty
        const inflationAxis = axes.I?.value || 0;
        if (inflationAxis > 0.3 || regimeType === 'STAGFLATION') {
            macroDirection = 'LONG';
            macroScore = 70;
        } else if (axes.D?.value > 0.5) {
            macroDirection = 'SHORT';
            macroScore = 65;
        }
    } else if (assetClass === 'FOREX') {
        // USD strength/weakness
        const dollarAxis = axes.D?.value || 0;
        if (Math.abs(dollarAxis) > 0.3) {
            macroDirection = dollarAxis > 0 ? 'SHORT' : 'LONG'; // For XXX/USD pairs
            macroScore = 65 + Math.abs(dollarAxis) * 20;
        }
    }

    const confidence = macroScore >= 70 ? 'HIGH' : macroScore >= 55 ? 'MEDIUM' : 'LOW';

    return {
        score: macroDirection === direction ? macroScore : macroDirection === 'NEUTRAL' ? 50 : 100 - macroScore,
        direction: macroDirection,
        confidence,
        timestamp: Date.now(),
        source: 'macro',
        details: `${regimeType} (${regime.regimeConfidence})`
    };
}

function buildMesoInput(meso: MesoData | null, symbol: string, direction: Direction): DimensionInput | null {
    if (!meso) return null;

    const allowed = meso.allowedInstruments?.find(i => i.symbol === symbol);
    const prohibited = meso.prohibitedInstruments?.includes(symbol);

    if (prohibited) {
        return {
            score: 20,
            direction: 'NEUTRAL',
            confidence: 'HIGH',
            timestamp: Date.now(),
            source: 'meso',
            details: 'Instrumento proibido pelo Meso'
        };
    }

    if (allowed) {
        const mesoDir = signalToDirection(allowed.mesoDirection);
        const aligned = mesoDir === direction;
        return {
            score: aligned ? allowed.mesoScore : 100 - allowed.mesoScore,
            direction: mesoDir,
            confidence: allowed.mesoScore >= 70 ? 'HIGH' : 'MEDIUM',
            timestamp: Date.now(),
            source: 'meso',
            details: `${allowed.mesoDirection} (score: ${allowed.mesoScore})`
        };
    }

    return null;
}

function buildMicroInput(micro: MicroAnalysis | null, direction: Direction): DimensionInput | null {
    if (!micro || !micro.recommendation) return null;

    const setup = micro.recommendation.bestSetup;
    const action = micro.recommendation.action;

    if (action === 'AVOID' || !setup) {
        return {
            score: 30,
            direction: 'NEUTRAL',
            confidence: 'LOW',
            timestamp: Date.now(),
            source: 'micro',
            details: 'Sem setup válido'
        };
    }

    const microDir = signalToDirection(setup.direction);
    const aligned = microDir === direction;
    const rr = setup.riskReward || 0;
    const baseScore = Math.min(90, 50 + rr * 15);

    return {
        score: aligned ? baseScore : 100 - baseScore,
        direction: microDir,
        confidence: rr >= 2.5 ? 'HIGH' : rr >= 1.5 ? 'MEDIUM' : 'LOW',
        timestamp: Date.now(),
        source: 'micro',
        details: `${action} - R:R ${rr.toFixed(1)}`
    };
}

function buildLiquidityInput(liquidity: LiquidityMapData | null, direction: Direction): DimensionInput | null {
    if (!liquidity) return null;

    let liqDirection: Direction = 'NEUTRAL';
    if (liquidity.marketDirection === 'SEEKING_BUYSIDE') {
        liqDirection = 'LONG';
    } else if (liquidity.marketDirection === 'SEEKING_SELLSIDE') {
        liqDirection = 'SHORT';
    }

    const aligned = liqDirection === direction;
    const score = aligned ? liquidity.liquidityScore : 100 - liquidity.liquidityScore;

    return {
        score,
        direction: liqDirection,
        confidence: liquidity.liquidityScore >= 70 ? 'HIGH' : liquidity.liquidityScore >= 50 ? 'MEDIUM' : 'LOW',
        timestamp: Date.now(),
        source: 'liquidityMap',
        details: liquidity.marketDirection
    };
}

function buildCurrencyStrengthInput(
    currencyData: CurrencyStrengthData | null,
    symbol: string,
    direction: Direction
): DimensionInput | null {
    if (!currencyData) return null;

    // Extract base and quote from symbol
    const cleanSymbol = symbol.replace('=X', '').replace('-', '');
    let base = '';
    let quote = '';

    // Common forex pairs
    if (cleanSymbol.length >= 6) {
        base = cleanSymbol.slice(0, 3);
        quote = cleanSymbol.slice(3, 6);
    } else {
        return null; // Not a forex pair
    }

    const baseStrength = currencyData.currencies?.find(c => c.code === base);
    const quoteStrength = currencyData.currencies?.find(c => c.code === quote);

    if (!baseStrength || !quoteStrength) return null;

    const delta = baseStrength.strength - quoteStrength.strength;
    const csDirection: Direction = delta > 10 ? 'LONG' : delta < -10 ? 'SHORT' : 'NEUTRAL';
    const aligned = csDirection === direction;
    const confidence = Math.abs(delta) > 40 ? 'HIGH' : Math.abs(delta) > 20 ? 'MEDIUM' : 'LOW';

    return {
        score: aligned ? 50 + Math.abs(delta) : 50 - Math.abs(delta) / 2,
        direction: csDirection,
        confidence,
        timestamp: Date.now(),
        source: 'currencyStrength',
        details: `${base}: ${baseStrength.strength.toFixed(0)} vs ${quote}: ${quoteStrength.strength.toFixed(0)}`
    };
}

function buildSentimentInput(assetClass: AssetClass): DimensionInput | null {
    // Placeholder - would integrate with Fear & Greed, Funding rates, etc.
    if (assetClass !== 'CRYPTO') return null;

    // Simulated sentiment for now
    return {
        score: 55,
        direction: 'NEUTRAL',
        confidence: 'LOW',
        timestamp: Date.now(),
        source: 'sentiment',
        details: 'Sentimento neutro'
    };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const filterSymbol = searchParams.get('symbol');
    const filterClass = searchParams.get('class');

    try {
        // 1. Fetch all data sources in parallel
        const [regime, meso, marketAssets, currencyStrength] = await Promise.all([
            fetchRegimeData(),
            fetchMesoData(),
            fetchMarketData(),
            fetchCurrencyStrength()
        ]);

        // 2. Build asset list
        let assets = marketAssets.length > 0
            ? marketAssets.map(a => ({
                symbol: a.symbol,
                displaySymbol: a.displaySymbol,
                name: a.name,
                assetClass: normalizeAssetClass(a.assetClass),
                price: a.price,
                signal: a.signal,
                score: a.score,
                quality: a.quality,
                breakdown: a.breakdown,
                high: a.high,
                low: a.low
            }))
            : ASSET_UNIVERSE.map(a => ({
                ...a,
                price: 0,
                signal: 'WAIT',
                score: 50,
                quality: { status: 'OK' },
                breakdown: undefined as Record<string, number> | undefined,
                high: undefined as number | undefined,
                low: undefined as number | undefined
            }));

        // Apply filters
        if (filterSymbol) {
            assets = assets.filter(a =>
                a.symbol.toLowerCase().includes(filterSymbol.toLowerCase()) ||
                a.displaySymbol.toLowerCase().includes(filterSymbol.toLowerCase())
            );
        }
        if (filterClass) {
            const normalizedClass = normalizeAssetClass(filterClass);
            assets = assets.filter(a => a.assetClass === normalizedClass);
        }

        // 3. Fetch micro and liquidity data for all assets
        const symbols = assets.map(a => a.symbol);
        const [microDataMap, liquidityDataMap] = await Promise.all([
            fetchMicroData(symbols),
            fetchLiquidityData(symbols)
        ]);

        // 4. Build AssetAnalysis for each asset
        const analyses: AssetAnalysis[] = assets.map(asset => {
            const direction = signalToDirection(asset.signal);
            const micro = microDataMap.get(asset.symbol) || null;
            const liquidity = liquidityDataMap.get(asset.symbol) || null;

            const now = Date.now();

            return {
                symbol: asset.symbol,
                displaySymbol: asset.displaySymbol,
                name: asset.name,
                assetClass: asset.assetClass,
                direction: direction !== 'NEUTRAL' ? direction : 'LONG', // Default to LONG if neutral
                price: asset.price,

                macro: buildMacroInput(regime, asset.assetClass, direction),
                meso: buildMesoInput(meso, asset.symbol, direction),
                micro: buildMicroInput(micro, direction),
                liquidityMap: buildLiquidityInput(liquidity, direction),
                currencyStrength: buildCurrencyStrengthInput(currencyStrength, asset.symbol, direction),
                fundamentals: null, // Not yet implemented
                sentiment: buildSentimentInput(asset.assetClass),

                dataTimestamps: {
                    macro: regime ? now : 0,
                    meso: meso ? now : 0,
                    micro: micro ? now : 0,
                    liquidityMap: liquidity ? now : 0,
                    currencyStrength: currencyStrength ? now : 0
                }
            };
        });

        // 5. Build micro data map for trade plans
        const microTradeDataMap: Record<string, {
            entry?: number;
            stopLoss?: number;
            takeProfit1?: number;
            takeProfit2?: number;
            takeProfit3?: number;
            riskReward?: number;
            atr?: number;
        } | null> = {};

        for (const [symbol, micro] of microDataMap.entries()) {
            if (micro?.recommendation?.bestSetup) {
                const setup = micro.recommendation.bestSetup;
                microTradeDataMap[symbol] = {
                    entry: setup.entry,
                    stopLoss: setup.stopLoss,
                    takeProfit1: setup.takeProfit1,
                    takeProfit2: setup.takeProfit2,
                    takeProfit3: setup.takeProfit3,
                    riskReward: setup.riskReward,
                    atr: micro.technical?.atr
                };
            } else {
                microTradeDataMap[symbol] = null;
            }
        }

        // 6. Process all assets through Decision Engine
        const regimeSnapshot = regime ? {
            regime: regime.regime,
            axes: Object.fromEntries(
                Object.entries(regime.axes || {}).map(([k, v]) => [k, { value: v.value }])
            )
        } : null;

        const decisions: ActionDecision[] = processMultipleAssets(
            analyses,
            regimeSnapshot,
            microTradeDataMap
        );

        // 7. Enrich decisions with original data for compatibility
        const enrichedDecisions = decisions.map(d => {
            const original = assets.find(a => a.symbol === d.asset);
            // Normalize breakdown - handle both { components: {...} } and direct Record<string, number>
            const rawBreakdown = original?.breakdown;
            const normalizedBreakdown: Record<string, number> | undefined = rawBreakdown
                ? (typeof rawBreakdown === 'object' && 'components' in rawBreakdown && rawBreakdown.components
                    ? rawBreakdown.components as Record<string, number>
                    : rawBreakdown as Record<string, number>)
                : undefined;
            return {
                ...d,
                originalScore: original?.score,
                originalSignal: original?.signal,
                breakdown: normalizedBreakdown
            };
        });

        // 8. Generate summary
        const summary = generateEngineSummary(enrichedDecisions, regimeSnapshot);

        // 9. Check data health
        const staleAssets = analyses
            .filter(a => {
                const timestamps = Object.values(a.dataTimestamps);
                return timestamps.some(t => t && (Date.now() - t) > 300_000);
            })
            .map(a => a.symbol);

        const response: DecisionEngineResponse = {
            timestamp: Date.now(),
            regime: regime ? {
                type: regime.regime,
                confidence: regime.regimeConfidence,
                dominantDrivers: regime.dominantDrivers || []
            } : null,
            decisions: enrichedDecisions,
            summary,
            dataHealth: {
                feedStatus: marketAssets.length > 0 ? 'HEALTHY' : 'DEGRADED',
                lastMacroUpdate: regime ? Date.now() : 0,
                lastMesoUpdate: meso ? Date.now() : 0,
                staleAssets
            }
        };

        return NextResponse.json(response);

    } catch (error) {
        console.error('[Decision Engine] Error:', error);
        return NextResponse.json(
            {
                timestamp: Date.now(),
                regime: null,
                decisions: [],
                summary: {
                    tierA: 0,
                    tierB: 0,
                    tierC: 0,
                    tierD: 0,
                    tierF: 0,
                    topPicks: [],
                    marketBias: 'NEUTRAL' as const
                },
                dataHealth: {
                    feedStatus: 'DOWN' as const,
                    lastMacroUpdate: 0,
                    lastMesoUpdate: 0,
                    staleAssets: []
                },
                error: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
