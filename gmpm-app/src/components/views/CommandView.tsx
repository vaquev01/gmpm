'use client';

import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import {
    getTrackingSummary,
    trackSignal,
    updateSignalPricesFromPriceMap,
    type TrackingSummary,
    type GateResultSummary,
} from '@/lib/signalTracker';
import type { RegimeSnapshot, AxisScore, GateSummary, TradeContext } from '@/lib/regimeEngine';
import { evaluateGates } from '@/lib/regimeEngine';
import { addSignal, calculateStats, type PerformanceStats } from '@/lib/signalHistory';
import {
    Zap, CheckCircle2, XCircle,
    Brain, Globe, Shield, Activity, TrendingUp, Search, Layers, RefreshCw, X, Target, TrendingDown,
    Rocket, Briefcase, AlertTriangle, ArrowUp, ArrowDown, Minus
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn, safeUUID } from '@/lib/utils';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

// --- TYPES ---

// ... 

interface RealAssetData {
    symbol: string;
    displaySymbol: string;
    name?: string; // NEW
    sector?: string; // NEW
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    rsi: number;
    high: number;
    low: number;
    avgVolume?: number;
    assetClass: string;
    marketState?: string;
    quoteTimestamp?: string;
    history?: number[];
    quality?: {
        status: 'OK' | 'PARTIAL' | 'STALE' | 'SUSPECT';
        reasons: string[];
        ageMin?: number;
    };
}

type MarketSnapshotResponse = {
    success: boolean;
    degraded?: boolean;
    fallback?: boolean;
    fallbackTimestamp?: string | null;
    qualitySummary?: Record<string, number> | null;
    tradeEnabled?: boolean;
    tradeDisabledReason?: string | null;
    tradeEnabledByClass?: Record<string, boolean> | null;
    tradeDisabledReasonByClass?: Record<string, string | null> | null;
    macro?: unknown;
    data?: RealAssetData[];
    count?: number;
};

type RadarMode = 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE';

interface ScoredAsset extends RealAssetData {
    score: number;
    regime: string;
    signal: 'LONG' | 'SHORT' | 'WAIT';
    conf: string;
    entry: string;
    tp: string;
    sl: string;
    rr: string;
    levelSource?: 'MICRO' | 'SCAN';
    microAction?: 'EXECUTE' | 'WAIT' | 'AVOID';
    scenarioStatus?: 'PRONTO' | 'DESENVOLVENDO' | 'CONTRA';
    mesoDirection?: 'LONG' | 'SHORT';
    mesoClass?: string;
    mesoReason?: string;
    mesoBlocked?: boolean;
    riskLabel?: 'LOW' | 'MED' | 'HIGH';
    trustScore?: number;
    // Liquidity integration
    liquidityScore?: number;
    liquidityBehavior?: 'AGGRESSIVE_HUNTER' | 'SELECTIVE_HUNTER' | 'PASSIVE' | 'UNPREDICTABLE';
    liquidityAlignment?: string;
    timeframe: string;      // H4, H1, M15
    confluenceCount: number; // Number of confluences > 60
    rvol: number; // Relative Volume
    volatility: number; // Real volatility
    oneLiner: string;   // Generated thesis
    breakdown: {
        components: Record<string, number>;
        details: Record<string, string>;
    };
    finalBreakdown?: {
        components: Record<string, number>;
        details: Record<string, string>;
    };
}

type SmcApiResponse = {
    success: boolean;
    timestamp?: string;
    symbol?: string;
    interval?: string;
    currentPrice?: number;
    candleCount?: number;
    analysis?: {
        trend?: string;
        lastBOS?: unknown;
        equilibrium?: number;
        currentZone?: string;
        premiumLevel?: number;
        discountLevel?: number;
        activeOrderBlocks?: number;
        nearestBullishOB?: { range: string; strength: number; tested: boolean } | null;
        nearestBearishOB?: { range: string; strength: number; tested: boolean } | null;
        unfilledFVGs?: number;
        nearestBullishFVG?: { range: string; size: string } | null;
        nearestBearishFVG?: { range: string; size: string } | null;
        nearestBuySideLiquidity?: string | null;
        nearestSellSideLiquidity?: string | null;
        bias?: string;
        biasStrength?: number;
        entryZones?: { low: number; high: number; type: string }[];
    };
    error?: string;
};

type OrderFlowApiResponse = {
    success: boolean;
    timestamp?: string;
    count?: number;
    data?: Array<{
        symbol: string;
        price: number;
        poc: number;
        vah: number;
        val: number;
        totalVolume: number;
        deltaPercent: number;
        whaleActivity: string;
        bias: string;
        strength: number;
        highVolumeNodes: { price: number; volume: number }[];
    }>;
    error?: string;
};

type OrderFlowItem = NonNullable<OrderFlowApiResponse['data']>[number];

// --- COMPONENTS ---

const Sparkline = ({ data, color = "text-green-500", height = "h-4" }: { data: number[], color?: string, height?: string }) => {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    return (
        <div className={`flex items-end gap-px ${height} w-12`}>
            {data.map((d, i) => (
                <div
                    key={i}
                    className={cn("w-0.5 opacity-80", color.replace('text-', 'bg-'))}
                    style={{ height: `${((d - min) / range) * 100}%` }}
                />
            ))}
        </div>
    );
};

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function normalize01(n: number, min: number, max: number) {
    if (!Number.isFinite(n)) return 0.5;
    if (max === min) return 0.5;
    return clamp((n - min) / (max - min), 0, 1);
}

function formatQuoteAge(iso?: string) {
    if (!iso) return 'N/A';
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return 'N/A';
    const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 1) return '<1m';
    if (mins < 60) return `${mins}m`;
    const hours = Math.round(mins / 60);
    return `${hours}h`;
}

function getQuoteAgeMinutes(iso?: string) {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return null;
    return Math.max(0, Math.round((Date.now() - t) / 60000));
}

function formatUsdCompact(value: number) {
    if (!Number.isFinite(value)) return 'N/A';
    const abs = Math.abs(value);
    if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return `$${value.toFixed(0)}`;
}

function computeLiquidityMetrics(asset: RealAssetData, flow?: OrderFlowItem | null) {
    const dollarVolFromQuote = (asset.volume || 0) * (asset.price || 0);

    // Yahoo often reports volume=0 for FX; treat major FX as deep but mark as assumed.
    if ((asset.assetClass === 'forex') && (!Number.isFinite(dollarVolFromQuote) || dollarVolFromQuote <= 0) && !flow?.totalVolume) {
        return { dollarVol: dollarVolFromQuote, liquidityScore: 75, depth: 'DEEP' as const, slippageRisk: 'LOW' as const, source: 'ASSUMED_FOREX' as const };
    }

    const dollarVol = flow?.totalVolume ? flow.totalVolume : dollarVolFromQuote;
    const base = Math.log10(Math.max(1, dollarVol));
    const rawScore = (base - 5) * 20; // 1e5 => 0, 1e10 => 100
    const liquidityScore = clamp(Math.round(rawScore), 0, 100);

    const depth = liquidityScore >= 75 ? 'DEEP' : liquidityScore >= 45 ? 'MODERATE' : 'THIN';
    const slippageRisk = liquidityScore >= 75 ? 'LOW' : liquidityScore >= 45 ? 'MEDIUM' : 'HIGH';

    return { dollarVol, liquidityScore, depth, slippageRisk, source: flow?.totalVolume ? ('ORDERFLOW' as const) : ('QUOTE_PROXY' as const) };
}

function computeConfluenceScore(asset: RealAssetData) {
    const rsi = Number.isFinite(asset.rsi) ? asset.rsi : 50;
    const changePct = Number.isFinite(asset.changePercent) ? asset.changePercent : 0;
    const dailyRange = (asset.high && asset.low) ? (asset.high - asset.low) : (asset.price * 0.015);
    const volatility = asset.price > 0 ? (dailyRange / asset.price) : 0;
    const rvol = (asset.volume && asset.avgVolume) ? (asset.volume / asset.avgVolume) : 1.0;

    const hist = Array.isArray(asset.history) ? asset.history.filter((v) => Number.isFinite(v)) : [];
    const last = hist.length > 0 ? hist[hist.length - 1] : asset.price;
    const first = hist.length > 0 ? hist[0] : asset.price;
    const histChangePct = (first > 0) ? ((last - first) / first) * 100 : 0;
    const momentum = clamp((histChangePct / 4) * 50 + 50, 0, 100);

    // RSI contribution: meaningful only at extremes; neutral near 50
    let rsiBull = 0;
    let rsiBear = 0;
    if (rsi <= 35) rsiBull = normalize01(35 - rsi, 0, 20); // 35->0, 15->1
    if (rsi >= 65) rsiBear = normalize01(rsi - 65, 0, 20); // 65->0, 85->1

    // Trend/momentum from 20-day history (if missing, it won't dominate)
    const trend = clamp(momentum, 0, 100);

    // Strength from daily change
    const changeStrength = clamp(50 + changePct * 8, 0, 100);

    // Volatility: prefer moderate; penalize chaos
    const volPct = volatility * 100;
    const volScore = clamp(100 - Math.abs(volPct - 1.5) * 25, 0, 100);

    // RVOL: reward >1.2, cap around 3
    const rvolScore = clamp(50 + (clamp(rvol, 0, 3) - 1) * 25, 0, 100);

    const liq = computeLiquidityMetrics(asset, null);
    const liqScore = liq.liquidityScore;
    const liqFactor = clamp(0.65 + (liqScore / 100) * 0.35, 0.65, 1);

    // Determine directional bias
    const biasBull = (trend / 100) * 0.45 + (changeStrength / 100) * 0.35 + rsiBull * 0.20;
    const biasBear = ((100 - trend) / 100) * 0.45 + ((100 - changeStrength) / 100) * 0.35 + rsiBear * 0.20;
    let direction: 'LONG' | 'SHORT' | 'WAIT' = biasBull > 0.62 ? 'LONG' : biasBear > 0.62 ? 'SHORT' : 'WAIT';

    // Freshness / market state gating: prevents stale quotes from looking like "top".
    const ageMin = getQuoteAgeMinutes(asset.quoteTimestamp);
    const sessionBound = asset.assetClass === 'stock' || asset.assetClass === 'etf' || asset.assetClass === 'index' || asset.assetClass === 'bond';
    const marketState = (asset.marketState || '').toUpperCase();
    const serverQuality = asset.quality?.status;
    const serverReasons = asset.quality?.reasons ?? [];

    let freshnessFactor = 1;
    if (sessionBound) {
        if (ageMin !== null && ageMin > 1440) freshnessFactor = 0.4;
        else if (ageMin !== null && ageMin > 360) freshnessFactor = 0.6;
        else if (ageMin !== null && ageMin > 120) freshnessFactor = 0.8;

        if (marketState && marketState !== 'REGULAR') {
            freshnessFactor = Math.min(freshnessFactor, 0.85);
        }

        // If too stale, don't emit a trade signal.
        if ((ageMin !== null && ageMin > 360) || (marketState && marketState !== 'REGULAR')) {
            direction = 'WAIT';
        }
    }

    // Liquidity gating: thin markets get score penalty and no signal.
    const minLiqByClass: Record<string, number> = {
        stock: 45,
        etf: 45,
        index: 35,
        bond: 35,
        commodity: 40,
        crypto: 35,
        forex: 60,
    };
    const minLiq = minLiqByClass[asset.assetClass] ?? 45;
    if (liqScore < minLiq) {
        direction = 'WAIT';
        freshnessFactor = Math.min(freshnessFactor, 0.75);
    }

    // Server-side quality is authoritative: fail-closed.
    if (serverQuality === 'SUSPECT') {
        direction = 'WAIT';
        freshnessFactor = Math.min(freshnessFactor, 0.5);
    }
    if (serverQuality === 'STALE') {
        direction = 'WAIT';
        freshnessFactor = Math.min(freshnessFactor, 0.7);
    }
    if (serverQuality === 'PARTIAL') {
        // Allow scoring for display, but do not emit a trade signal.
        direction = 'WAIT';
        freshnessFactor = Math.min(freshnessFactor, 0.85);
    }

    // Final score (0-100) emphasizes confluence and validity
    const directionalScore = direction === 'LONG'
        ? (trend * 0.45 + changeStrength * 0.25 + volScore * 0.15 + rvolScore * 0.15)
        : direction === 'SHORT'
            ? ((100 - trend) * 0.45 + (100 - changeStrength) * 0.25 + volScore * 0.15 + rvolScore * 0.15)
            : (trend * 0.35 + volScore * 0.25 + rvolScore * 0.20 + 20);

    // RSI edge: only if at extremes
    const rsiEdge = direction === 'LONG' ? (rsiBull * 15) : direction === 'SHORT' ? (rsiBear * 15) : 0;
    const score = clamp(Math.round((directionalScore * freshnessFactor * liqFactor) + rsiEdge), 1, 99);

    const components: Record<string, number> = {
        trend: Math.round(direction === 'SHORT' ? 100 - trend : trend),
        momentum: Math.round(direction === 'SHORT' ? 100 - changeStrength : changeStrength),
        volatility: Math.round(volScore),
        rvol: Math.round(rvolScore),
        liquidity: Math.round(liqScore),
        rsiEdge: Math.round(rsiEdge),
    };

    const details: Record<string, string> = {
        trend: `20d trend proxy: ${hist.length > 2 ? `${histChangePct.toFixed(1)}%` : 'N/A'}`,
        momentum: `1d change: ${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%`,
        volatility: `Day range: ${(volPct).toFixed(2)}%`,
        rvol: `RVOL: ${rvol.toFixed(2)}x (vol ${asset.volume || 0}, avg ${asset.avgVolume ? Math.round(asset.avgVolume) : 'N/A'})`,
        liquidity: `Dollar volume: ${formatUsdCompact((asset.volume || 0) * (asset.price || 0))} (proxy). Gate: min ${minLiq}.`,
        rsiEdge: `RSI(14): ${Math.round(rsi)} (edge only at extremes)`,
    };

    if (sessionBound) {
        details.rsiEdge = `${details.rsiEdge}. Market: ${marketState || 'N/A'}; Quote age: ${formatQuoteAge(asset.quoteTimestamp)}.`;
    }

    if (serverQuality) {
        details.rsiEdge = `${details.rsiEdge} Quality: ${serverQuality}${serverReasons.length > 0 ? ` (${serverReasons.join(', ')})` : ''}.`;
    }

    const drivers = Object.entries(components)
        .filter(([k]) => k !== 'rsiEdge')
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([k]) => k.toUpperCase());

    const oneLiner = direction === 'LONG'
        ? `Bullish confluence (${drivers.join(' + ') || 'signals'}). RSI ${Math.round(rsi)}${rsi <= 35 ? ' (oversold rebound)' : ''}.` 
        : direction === 'SHORT'
            ? `Bearish confluence (${drivers.join(' + ') || 'signals'}). RSI ${Math.round(rsi)}${rsi >= 65 ? ' (overbought fade)' : ''}.`
            : serverQuality && serverQuality !== 'OK'
                ? `Data quality is ${serverQuality}. Signals are disabled until data is reliable.`
                : liqScore < minLiq
                    ? `Liquidity is too thin for safe execution (liq ${liqScore} < ${minLiq}). Waiting.`
                    : `No clear confluence. RSI ${Math.round(rsi)} near neutral; waiting for confirmation.`;

    return {
        score,
        direction,
        volatility,
        rvol,
        breakdown: { components, details },
        oneLiner,
    };
}

// --- INSTITUTIONAL GATES PANEL (Binary Decision Framework) ---
const InstitutionalGatesPanel = ({ 
    regime, 
    mesoData, 
    microSetups 
}: { 
    regime: RegimeSnapshot | null;
    mesoData: {
        favoredDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
        volatilityContext: 'HIGH' | 'NORMAL' | 'LOW';
        marketBias: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
        allowedInstruments: { symbol: string; direction: 'LONG' | 'SHORT' }[];
        prohibitedInstruments: { symbol: string }[];
    } | null;
    microSetups: { action: 'EXECUTE' | 'WAIT' | 'AVOID'; setup: unknown }[];
}) => {
    // Calculate gate statuses
    const macroGate = {
        status: !regime ? 'LOADING' : 
            regime.regimeConfidence === 'UNAVAILABLE' ? 'FAIL' :
            regime.axes.L.direction === '↓↓' || regime.axes.C.direction === '↓↓' ? 'FAIL' :
            regime.regimeConfidence === 'OK' ? 'PASS' : 'WARN',
        label: 'MACRO',
        detail: regime ? `${regime.regime} (${regime.regimeConfidence})` : 'Loading...',
    };

    const mesoGate = {
        status: !mesoData ? 'LOADING' :
            mesoData.allowedInstruments.length === 0 ? 'FAIL' :
            mesoData.volatilityContext === 'HIGH' ? 'WARN' : 'PASS',
        label: 'MESO',
        detail: mesoData ? `${mesoData.allowedInstruments.length} allowed, ${mesoData.prohibitedInstruments.length} blocked` : 'Loading...',
    };

    const executeCount = microSetups.filter(s => s.action === 'EXECUTE').length;
    const microGate = {
        status: microSetups.length === 0 ? 'LOADING' :
            executeCount === 0 ? 'WARN' : 'PASS',
        label: 'MICRO',
        detail: `${executeCount} ready, ${microSetups.filter(s => s.action === 'WAIT').length} waiting`,
    };

    const now = new Date();
    const hour = now.getUTCHours();
    const goodHours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    const badHours = [21, 22, 23, 0, 1, 2, 3];
    const execGate = {
        status: badHours.includes(hour) ? 'WARN' : goodHours.includes(hour) ? 'PASS' : 'WARN',
        label: 'EXEC',
        detail: goodHours.includes(hour) ? 'Optimal window' : badHours.includes(hour) ? 'Low liquidity' : 'Fair liquidity',
    };

    const riskGate = {
        status: mesoData?.volatilityContext === 'HIGH' ? 'WARN' : 'PASS',
        label: 'RISK',
        detail: mesoData ? `Vol: ${mesoData.volatilityContext}` : 'OK',
    };

    const gates = [macroGate, mesoGate, microGate, riskGate, execGate];
    const allPass = gates.every(g => g.status === 'PASS');
    const anyFail = gates.some(g => g.status === 'FAIL');
    const anyLoading = gates.some(g => g.status === 'LOADING');

    const gateColors = {
        PASS: 'bg-green-500/20 border-green-500/50 text-green-400',
        WARN: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400',
        FAIL: 'bg-red-500/20 border-red-500/50 text-red-400',
        LOADING: 'bg-gray-500/20 border-gray-500/50 text-gray-400',
    };

    const statusIcon = {
        PASS: <CheckCircle2 className="w-4 h-4" />,
        WARN: <AlertTriangle className="w-4 h-4" />,
        FAIL: <XCircle className="w-4 h-4" />,
        LOADING: <RefreshCw className="w-4 h-4 animate-spin" />,
    };

    return (
        <Card className={cn(
            "border-2 mb-4 transition-all",
            anyLoading ? "bg-gray-900/80 border-gray-700" :
            allPass ? "bg-green-950/30 border-green-500/50" :
            anyFail ? "bg-red-950/30 border-red-500/50" :
            "bg-yellow-950/30 border-yellow-500/50"
        )}>
            <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-purple-400" />
                        <span className="text-sm font-bold uppercase tracking-wider text-purple-400">
                            INSTITUTIONAL GATES
                        </span>
                    </div>
                    <div className={cn(
                        "text-sm font-bold px-3 py-1 rounded-full",
                        anyLoading ? "bg-gray-500/20 text-gray-400" :
                        allPass ? "bg-green-500/20 text-green-400" :
                        anyFail ? "bg-red-500/20 text-red-400" :
                        "bg-yellow-500/20 text-yellow-400"
                    )}>
                        {anyLoading ? 'LOADING' : allPass ? 'ALL PASS ✓' : anyFail ? 'BLOCKED' : 'CAUTION'}
                    </div>
                </div>

                <div className="grid grid-cols-5 gap-2">
                    {gates.map((gate) => (
                        <div 
                            key={gate.label}
                            className={cn(
                                "p-2 rounded border text-center transition-all",
                                gateColors[gate.status as keyof typeof gateColors]
                            )}
                        >
                            <div className="flex items-center justify-center gap-1 mb-1">
                                {statusIcon[gate.status as keyof typeof statusIcon]}
                                <span className="text-xs font-bold">{gate.label}</span>
                            </div>
                            <div className="text-[9px] opacity-80 truncate" title={gate.detail}>
                                {gate.detail}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Pipeline Summary */}
                <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-4">
                        <span className="text-gray-500">
                            MACRO → MESO → MICRO → EXEC
                        </span>
                        {regime && (
                            <span className="text-gray-400">
                                Regime: <span className="text-purple-400 font-bold">{regime.regime}</span>
                            </span>
                        )}
                        {mesoData && (
                            <span className="text-gray-400">
                                Bias: <span className={cn("font-bold",
                                    mesoData.marketBias === 'RISK_ON' ? 'text-green-400' :
                                    mesoData.marketBias === 'RISK_OFF' ? 'text-red-400' : 'text-gray-400'
                                )}>{mesoData.marketBias}</span>
                            </span>
                        )}
                    </div>
                    <div className="text-gray-500">
                        Live
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

// --- MICRO SETUPS PANEL (Pipeline Output) - PROFESSIONAL EXECUTION OUTPUT ---
const MicroSetupsPanel = ({ setups, fullAnalyses, onSelectAsset }: { 
    setups: {
        symbol: string;
        displaySymbol: string;
        action: 'EXECUTE' | 'WAIT' | 'AVOID';
        setup: {
            type: string;
            direction: 'LONG' | 'SHORT';
            timeframe: string;
            entry: number;
            stopLoss: number;
            takeProfit1: number;
            takeProfit2?: number;
            takeProfit3?: number;
            riskReward: number;
            confidence: 'HIGH' | 'MEDIUM' | 'LOW';
            confluences: string[];
            thesis: string;
            technicalScore: number;
            invalidation?: string;
            mesoAlignment?: boolean;
        } | null;
    }[];
    fullAnalyses?: {
        symbol: string;
        displaySymbol: string;
        price: number;
        technical: {
            trend: { h4: string; h1: string; m15: string; alignment: string };
            structure: { lastBOS: string | null; lastCHoCH: string | null; currentPhase: string };
            levels: { resistance: number[]; support: number[]; pivot: number; atr: number };
            indicators: { rsi: number; rsiDivergence: string | null; ema21: number; ema50: number; ema200: number; macdSignal: string; bbPosition: string };
            volume: { relative: number; trend: string; climax: boolean };
            smc: { orderBlocks: { type: string; low: number; high: number }[]; fvgs: { type: string }[]; liquidityPools: { type: string; level: number }[]; premiumDiscount: string };
        };
    }[];
    onSelectAsset: (symbol: string) => void;
}) => {
    const [expandedSetup, setExpandedSetup] = React.useState<string | null>(null);
    const executeReady = setups.filter(s => s.action === 'EXECUTE' && s.setup);
    const waiting = setups.filter(s => s.action === 'WAIT' && s.setup);

    if (executeReady.length === 0 && waiting.length === 0) return null;

    const formatPrice = (price: number) => price < 10 ? price.toFixed(4) : price.toFixed(2);

    return (
        <Card className="bg-gradient-to-br from-orange-950/40 via-gray-900 to-purple-950/30 border-orange-500/40 mb-4">
            <CardContent className="p-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                            <Zap className="w-5 h-5 text-orange-400" />
                        </div>
                        <div>
                            <span className="text-sm font-bold uppercase tracking-wider text-orange-400">MICRO EXECUTION OUTPUT</span>
                            <div className="text-[10px] text-gray-500">Technical Analysis → Execution Plan</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-center">
                            <div className="text-lg font-bold text-green-400">{executeReady.length}</div>
                            <div className="text-[9px] text-gray-500 uppercase">Execute</div>
                        </div>
                        <div className="text-center">
                            <div className="text-lg font-bold text-yellow-400">{waiting.length}</div>
                            <div className="text-[9px] text-gray-500 uppercase">Wait</div>
                        </div>
                    </div>
                </div>

                {/* Execute Ready - Full Cards */}
                {executeReady.length > 0 && (
                    <div className="space-y-3">
                        <div className="text-[10px] text-green-500 uppercase flex items-center gap-1 font-bold">
                            <CheckCircle2 className="w-3 h-3" /> READY TO EXECUTE — Full Pipeline Validated
                        </div>
                        
                        {executeReady.map((s) => {
                            const analysis = fullAnalyses?.find(a => a.symbol === s.symbol || a.displaySymbol === s.displaySymbol);
                            const isExpanded = expandedSetup === s.symbol;
                            
                            return (
                                <div 
                                    key={s.symbol}
                                    className={cn(
                                        "bg-gradient-to-r from-green-950/40 to-gray-900/80 border rounded-lg overflow-hidden transition-all",
                                        isExpanded ? "border-green-500/60" : "border-green-500/30"
                                    )}
                                >
                                    {/* Main Row - Always visible */}
                                    <div 
                                        className="p-3 cursor-pointer hover:bg-green-950/30 transition-colors"
                                        onClick={() => setExpandedSetup(isExpanded ? null : s.symbol)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "w-10 h-10 rounded-lg flex items-center justify-center",
                                                    s.setup?.direction === 'LONG' ? "bg-green-500/20" : "bg-red-500/20"
                                                )}>
                                                    {s.setup?.direction === 'LONG' ? (
                                                        <ArrowUp className="w-6 h-6 text-green-400" />
                                                    ) : (
                                                        <ArrowDown className="w-6 h-6 text-red-400" />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-lg text-white">{s.displaySymbol}</span>
                                                        <span className={cn(
                                                            "text-xs font-bold px-2 py-0.5 rounded",
                                                            s.setup?.direction === 'LONG' ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                                                        )}>
                                                            {s.setup?.direction}
                                                        </span>
                                                        <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                                                            {s.setup?.timeframe || 'H1'}
                                                        </span>
                                                    </div>
                                                    <div className="text-[11px] text-gray-400 mt-0.5">
                                                        {s.setup?.type} Setup • Score {s.setup?.technicalScore}/100 • {s.setup?.confluences.length} confluences
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-4">
                                                {/* R:R Badge */}
                                                <div className="text-center">
                                                    <div className={cn(
                                                        "text-xl font-bold",
                                                        (s.setup?.riskReward || 0) >= 2.5 ? "text-green-400" :
                                                        (s.setup?.riskReward || 0) >= 2.0 ? "text-purple-400" : "text-amber-400"
                                                    )}>
                                                        {s.setup?.riskReward.toFixed(1)}
                                                    </div>
                                                    <div className="text-[9px] text-gray-500 uppercase">R:R</div>
                                                </div>
                                                
                                                {/* Confidence */}
                                                <div className={cn(
                                                    "px-3 py-1 rounded-lg text-xs font-bold",
                                                    s.setup?.confidence === 'HIGH' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                                    s.setup?.confidence === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                                                    'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                                                )}>
                                                    {s.setup?.confidence}
                                                </div>
                                                
                                                {/* Expand Icon */}
                                                <div className={cn("transition-transform", isExpanded && "rotate-180")}>
                                                    <ArrowDown className="w-4 h-4 text-gray-500" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Expanded Content */}
                                    {isExpanded && (
                                        <div className="border-t border-green-500/20 bg-gray-950/50 p-4">
                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                                
                                                {/* Column 1: Technical Analysis */}
                                                <div className="space-y-3">
                                                    <div className="text-[10px] text-purple-400 uppercase font-bold flex items-center gap-1">
                                                        <Brain className="w-3 h-3" /> Technical Analysis
                                                    </div>
                                                    
                                                    {/* MTF Trend */}
                                                    <div className="bg-gray-900/60 rounded p-2">
                                                        <div className="text-[9px] text-gray-500 uppercase mb-1">Multi-Timeframe Trend</div>
                                                        <div className="grid grid-cols-3 gap-1 text-[10px]">
                                                            {['H4', 'H1', 'M15'].map((tf) => {
                                                                const trend = analysis?.technical?.trend?.[tf.toLowerCase() as 'h4' | 'h1' | 'm15'] || 'NEUTRAL';
                                                                return (
                                                                    <div key={tf} className={cn(
                                                                        "text-center py-1 rounded",
                                                                        trend === 'BULLISH' ? 'bg-green-500/20 text-green-400' :
                                                                        trend === 'BEARISH' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'
                                                                    )}>
                                                                        <div className="font-bold">{tf}</div>
                                                                        <div className="text-[9px]">{trend.slice(0, 4)}</div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                        <div className={cn(
                                                            "text-center text-[9px] mt-1 font-bold",
                                                            analysis?.technical?.trend?.alignment === 'ALIGNED' ? 'text-green-400' :
                                                            analysis?.technical?.trend?.alignment === 'PARTIAL' ? 'text-yellow-400' : 'text-red-400'
                                                        )}>
                                                            {analysis?.technical?.trend?.alignment || 'PARTIAL'}
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Indicators */}
                                                    <div className="bg-gray-900/60 rounded p-2">
                                                        <div className="text-[9px] text-gray-500 uppercase mb-1">Indicators</div>
                                                        <div className="space-y-1 text-[10px]">
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-500">RSI</span>
                                                                <span className={cn(
                                                                    "font-mono",
                                                                    (analysis?.technical?.indicators?.rsi || 50) > 70 ? 'text-red-400' :
                                                                    (analysis?.technical?.indicators?.rsi || 50) < 30 ? 'text-green-400' : 'text-gray-300'
                                                                )}>
                                                                    {analysis?.technical?.indicators?.rsi?.toFixed(1) || 'N/A'}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-500">MACD</span>
                                                                <span className={cn(
                                                                    "font-mono",
                                                                    analysis?.technical?.indicators?.macdSignal === 'BUY' ? 'text-green-400' :
                                                                    analysis?.technical?.indicators?.macdSignal === 'SELL' ? 'text-red-400' : 'text-gray-400'
                                                                )}>
                                                                    {analysis?.technical?.indicators?.macdSignal || 'NEUTRAL'}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-500">BB Zone</span>
                                                                <span className="font-mono text-gray-300">{analysis?.technical?.indicators?.bbPosition || 'MIDDLE'}</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-500">Volume</span>
                                                                <span className={cn(
                                                                    "font-mono",
                                                                    analysis?.technical?.volume?.trend === 'INCREASING' ? 'text-green-400' : 'text-gray-400'
                                                                )}>
                                                                    {analysis?.technical?.volume?.trend || 'STABLE'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    {/* SMC */}
                                                    <div className="bg-gray-900/60 rounded p-2">
                                                        <div className="text-[9px] text-gray-500 uppercase mb-1">Smart Money Concepts</div>
                                                        <div className="space-y-1 text-[10px]">
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-500">Zone</span>
                                                                <span className={cn(
                                                                    "font-mono font-bold",
                                                                    analysis?.technical?.smc?.premiumDiscount === 'DISCOUNT' ? 'text-green-400' :
                                                                    analysis?.technical?.smc?.premiumDiscount === 'PREMIUM' ? 'text-red-400' : 'text-gray-400'
                                                                )}>
                                                                    {analysis?.technical?.smc?.premiumDiscount || 'EQUILIBRIUM'}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-500">Order Blocks</span>
                                                                <span className="font-mono text-gray-300">{analysis?.technical?.smc?.orderBlocks?.length || 0} active</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-500">FVGs</span>
                                                                <span className="font-mono text-gray-300">{analysis?.technical?.smc?.fvgs?.length || 0} unfilled</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-500">Liquidity</span>
                                                                <span className="font-mono text-gray-300">{analysis?.technical?.smc?.liquidityPools?.length || 0} pools</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {/* Column 2: Execution Plan */}
                                                <div className="space-y-3">
                                                    <div className="text-[10px] text-blue-400 uppercase font-bold flex items-center gap-1">
                                                        <Target className="w-3 h-3" /> Execution Plan
                                                    </div>
                                                    
                                                    {/* Entry */}
                                                    <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-blue-400 font-bold text-xs">ENTRY</span>
                                                            <span className="font-mono text-white text-lg font-bold">{formatPrice(s.setup?.entry || 0)}</span>
                                                        </div>
                                                        <div className="text-[9px] text-gray-500 mt-1">Current: {formatPrice(analysis?.price || s.setup?.entry || 0)}</div>
                                                    </div>
                                                    
                                                    {/* Stop Loss */}
                                                    <div className="bg-red-500/10 border border-red-500/30 rounded p-3">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-red-400 font-bold text-xs">STOP LOSS</span>
                                                            <span className="font-mono text-white text-lg font-bold">{formatPrice(s.setup?.stopLoss || 0)}</span>
                                                        </div>
                                                        <div className="text-[9px] text-gray-500 mt-1">
                                                            Risk: {((Math.abs((s.setup?.entry || 0) - (s.setup?.stopLoss || 0)) / (s.setup?.entry || 1)) * 100).toFixed(2)}%
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Take Profits */}
                                                    <div className="bg-green-500/10 border border-green-500/30 rounded p-3 space-y-2">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-green-400 font-bold text-xs">TP1 (50%)</span>
                                                            <span className="font-mono text-white font-bold">{formatPrice(s.setup?.takeProfit1 || 0)}</span>
                                                        </div>
                                                        {s.setup?.takeProfit2 && (
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-green-400/70 text-xs">TP2 (30%)</span>
                                                                <span className="font-mono text-gray-300">{formatPrice(s.setup.takeProfit2)}</span>
                                                            </div>
                                                        )}
                                                        {s.setup?.takeProfit3 && (
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-green-400/50 text-xs">TP3 (20%)</span>
                                                                <span className="font-mono text-gray-400">{formatPrice(s.setup.takeProfit3)}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Invalidation */}
                                                    {s.setup?.invalidation && (
                                                        <div className="bg-orange-500/10 border border-orange-500/30 rounded p-2">
                                                            <div className="text-[9px] text-orange-400 uppercase font-bold">Invalidation</div>
                                                            <div className="text-[10px] text-gray-300 mt-1">{s.setup.invalidation}</div>
                                                        </div>
                                                    )}
                                                </div>
                                                
                                                {/* Column 3: Thesis & Confluences */}
                                                <div className="space-y-3">
                                                    <div className="text-[10px] text-amber-400 uppercase font-bold flex items-center gap-1">
                                                        <Brain className="w-3 h-3" /> Trade Thesis
                                                    </div>
                                                    
                                                    {/* Thesis */}
                                                    <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3">
                                                        <p className="text-[11px] text-gray-300 leading-relaxed">{s.setup?.thesis}</p>
                                                    </div>
                                                    
                                                    {/* Confluences */}
                                                    <div className="bg-gray-900/60 rounded p-2">
                                                        <div className="text-[9px] text-gray-500 uppercase mb-2">Confluences ({s.setup?.confluences.length})</div>
                                                        <div className="flex flex-wrap gap-1">
                                                            {s.setup?.confluences.map((c, i) => (
                                                                <span key={i} className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">
                                                                    {c}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Key Levels */}
                                                    <div className="bg-gray-900/60 rounded p-2">
                                                        <div className="text-[9px] text-gray-500 uppercase mb-1">Key Levels</div>
                                                        <div className="space-y-1 text-[10px]">
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-500">R1</span>
                                                                <span className="font-mono text-red-400">{formatPrice(analysis?.technical?.levels?.resistance?.[0] || 0)}</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-500">Pivot</span>
                                                                <span className="font-mono text-gray-300">{formatPrice(analysis?.technical?.levels?.pivot || 0)}</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-500">S1</span>
                                                                <span className="font-mono text-green-400">{formatPrice(analysis?.technical?.levels?.support?.[0] || 0)}</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-500">ATR</span>
                                                                <span className="font-mono text-gray-300">{formatPrice(analysis?.technical?.levels?.atr || 0)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    {/* MESO Alignment */}
                                                    <div className={cn(
                                                        "rounded p-2 text-center",
                                                        s.setup?.mesoAlignment ? "bg-green-500/10 border border-green-500/30" : "bg-yellow-500/10 border border-yellow-500/30"
                                                    )}>
                                                        <div className="text-[10px] font-bold">
                                                            {s.setup?.mesoAlignment ? (
                                                                <span className="text-green-400">✓ MESO ALIGNED</span>
                                                            ) : (
                                                                <span className="text-yellow-400">⚠ MESO NEUTRAL</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {/* Action Button */}
                                            <div className="mt-4 pt-3 border-t border-gray-800 flex justify-between items-center">
                                                <div className="text-[10px] text-gray-500">
                                                    Structure: {analysis?.technical?.structure?.currentPhase || 'N/A'} | 
                                                    Last BOS: {analysis?.technical?.structure?.lastBOS || 'None'}
                                                </div>
                                                <Button 
                                                    size="sm" 
                                                    onClick={(e) => { e.stopPropagation(); onSelectAsset(s.displaySymbol); }}
                                                    className="bg-green-600 hover:bg-green-500 text-white font-bold"
                                                >
                                                    <Zap className="w-4 h-4 mr-1" /> View Full Analysis
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Waiting Setups - Compact */}
                {waiting.length > 0 && (
                    <div className={cn("space-y-2", executeReady.length > 0 && "mt-4 pt-4 border-t border-gray-800")}>
                        <div className="text-[10px] text-yellow-500 uppercase flex items-center gap-1 font-bold">
                            <AlertTriangle className="w-3 h-3" /> WAITING FOR CONFIRMATION
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                            {waiting.map((s) => (
                                <div 
                                    key={s.symbol}
                                    onClick={() => onSelectAsset(s.displaySymbol)}
                                    className="bg-yellow-950/20 border border-yellow-500/30 rounded p-2 cursor-pointer hover:bg-yellow-950/30 transition-colors"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {s.setup?.direction === 'LONG' ? (
                                                <ArrowUp className="w-3 h-3 text-green-400" />
                                            ) : (
                                                <ArrowDown className="w-3 h-3 text-red-400" />
                                            )}
                                            <span className="font-bold text-sm text-gray-200">{s.displaySymbol}</span>
                                        </div>
                                        <span className="text-[9px] text-yellow-400 font-mono">{s.setup?.type}</span>
                                    </div>
                                    <div className="mt-1 text-[9px] text-gray-500">
                                        R:R {s.setup?.riskReward.toFixed(1)} • Score {s.setup?.technicalScore} • {s.setup?.confluences.length} conf
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

// --- FOCUS 24H PANEL (Meso → Micro) ---
const Focus24hPanel = ({ mesoData }: { 
    mesoData: {
        weeklyThesis: string;
        dailyFocus: string[];
        favoredDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
        volatilityContext: 'HIGH' | 'NORMAL' | 'LOW';
        allowedInstruments: { symbol: string; direction: 'LONG' | 'SHORT'; class: string; reason: string }[];
        prohibitedInstruments: { symbol: string; reason: string }[];
        marketBias: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
    } | null 
}) => {
    if (!mesoData) return null;

    const biasColor = mesoData.marketBias === 'RISK_ON' ? 'text-green-400 bg-green-500/20' :
        mesoData.marketBias === 'RISK_OFF' ? 'text-red-400 bg-red-500/20' : 'text-yellow-400 bg-yellow-500/20';
    
    const dirColor = mesoData.favoredDirection === 'LONG' ? 'text-green-400' :
        mesoData.favoredDirection === 'SHORT' ? 'text-red-400' : 'text-gray-400';

    const volColor = mesoData.volatilityContext === 'HIGH' ? 'text-red-400' :
        mesoData.volatilityContext === 'LOW' ? 'text-green-400' : 'text-yellow-400';

    return (
        <Card className="bg-gradient-to-r from-cyan-950/30 to-gray-900 border-cyan-500/30 mb-4">
            <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-cyan-400">
                        <Target className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">FOCO 24H</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded", biasColor)}>
                            {mesoData.marketBias}
                        </span>
                        <span className={cn("text-[10px] font-mono", dirColor)}>
                            Favored: {mesoData.favoredDirection}
                        </span>
                        <span className={cn("text-[10px] font-mono", volColor)}>
                            Vol: {mesoData.volatilityContext}
                        </span>
                    </div>
                </div>

                {/* Daily Focus */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2">
                        <div className="text-[10px] text-gray-500 uppercase mb-2">Thesis</div>
                        <p className="text-sm text-gray-200 leading-relaxed">{mesoData.weeklyThesis}</p>
                        
                        {mesoData.dailyFocus.length > 0 && (
                            <div className="mt-3">
                                <div className="text-[10px] text-gray-500 uppercase mb-1">Daily Focus</div>
                                <ul className="space-y-1">
                                    {mesoData.dailyFocus.map((f, i) => (
                                        <li key={i} className="text-[11px] text-gray-400 flex items-start gap-1">
                                            <CheckCircle2 className="w-3 h-3 text-cyan-400 mt-0.5 flex-shrink-0" />
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    <div className="space-y-3">
                        {/* Allowed */}
                        <div>
                            <div className="text-[10px] text-green-500 uppercase mb-1 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Monitorar ({mesoData.allowedInstruments.length})
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {mesoData.allowedInstruments.slice(0, 6).map((inst, i) => (
                                    <span key={i} className={cn(
                                        "text-[10px] px-1.5 py-0.5 rounded font-mono",
                                        inst.direction === 'LONG' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                                    )}>
                                        {inst.symbol.split(' ')[0]}
                                    </span>
                                ))}
                                {mesoData.allowedInstruments.length > 6 && (
                                    <span className="text-[10px] text-gray-500">+{mesoData.allowedInstruments.length - 6}</span>
                                )}
                            </div>
                        </div>

                        {/* Prohibited */}
                        {mesoData.prohibitedInstruments.length > 0 && (
                            <div>
                                <div className="text-[10px] text-red-500 uppercase mb-1 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> Evitar ({mesoData.prohibitedInstruments.length})
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {mesoData.prohibitedInstruments.slice(0, 4).map((inst, i) => (
                                        <span key={i} className="text-[10px] bg-red-500/10 border border-red-500/30 text-red-400 px-1.5 py-0.5 rounded">
                                            {inst.symbol}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

// --- REGIME PANEL (Framework Institucional) ---
const AxisBadge = ({ axis }: { axis: AxisScore }) => {
    const directionIcon = axis.direction.includes('↑') 
        ? <ArrowUp className="w-3 h-3" /> 
        : axis.direction.includes('↓') 
            ? <ArrowDown className="w-3 h-3" /> 
            : <Minus className="w-3 h-3" />;
    
    const directionColor = axis.direction.includes('↑↑') 
        ? 'text-green-400 bg-green-500/20' 
        : axis.direction.includes('↑') 
            ? 'text-green-300 bg-green-500/10'
            : axis.direction.includes('↓↓')
                ? 'text-red-400 bg-red-500/20'
                : axis.direction.includes('↓')
                    ? 'text-red-300 bg-red-500/10'
                    : 'text-gray-400 bg-gray-500/10';

    const confColor = axis.confidence === 'OK' 
        ? 'border-green-500/30' 
        : axis.confidence === 'PARTIAL' 
            ? 'border-yellow-500/30' 
            : 'border-red-500/30';

    return (
        <div className={cn("rounded border px-2 py-1", confColor)}>
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-gray-400">{axis.axis}</span>
                <span className={cn("text-xs font-mono flex items-center gap-0.5 px-1 rounded", directionColor)}>
                    {directionIcon} {axis.direction}
                </span>
            </div>
            <div className="text-[9px] text-gray-500 truncate mt-0.5" title={axis.reasons.join('; ')}>
                {axis.reasons[0] || axis.name}
            </div>
        </div>
    );
};

const RegimePanel = ({ regime, loading }: { regime: RegimeSnapshot | null; loading: boolean }) => {
    if (loading || !regime) {
        return (
            <Card className="bg-gray-900/50 border-gray-800 mb-4">
                <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-gray-500">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span className="text-xs">Loading regime analysis...</span>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const regimeColors: Record<string, string> = {
        GOLDILOCKS: 'text-green-400 bg-green-500/10',
        REFLATION: 'text-amber-400 bg-amber-500/10',
        STAGFLATION: 'text-red-400 bg-red-500/10',
        DEFLATION: 'text-blue-400 bg-blue-500/10',
        LIQUIDITY_DRIVEN: 'text-cyan-400 bg-cyan-500/10',
        LIQUIDITY_DRAIN: 'text-red-500 bg-red-500/20',
        CREDIT_STRESS: 'text-red-500 bg-red-500/20',
        RISK_ON: 'text-green-400 bg-green-500/10',
        RISK_OFF: 'text-orange-400 bg-orange-500/10',
        NEUTRAL: 'text-gray-400 bg-gray-500/10',
        UNKNOWN: 'text-gray-500 bg-gray-500/10',
    };

    const criticalAlerts = regime.alerts.filter(a => a.level === 'CRITICAL');
    const warnings = regime.alerts.filter(a => a.level === 'WARNING');

    return (
        <div className="space-y-3 mb-4">
            {/* ALERTS */}
            {criticalAlerts.length > 0 && (
                <Card className="bg-red-950/30 border-red-900/50">
                    <CardContent className="p-3">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                            <div className="space-y-1">
                                {criticalAlerts.map((a, i) => (
                                    <div key={i} className="text-xs">
                                        <span className="text-red-300 font-bold">{a.message}</span>
                                        <span className="text-red-200/70 ml-2">→ {a.action}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* MAIN REGIME + AXES */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                {/* Regime Summary */}
                <Card className="lg:col-span-4 bg-gray-900/80 border-gray-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3 text-blue-400">
                            <Globe className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">Regime Engine</span>
                            <span className={cn("ml-auto text-[10px] px-1.5 py-0.5 rounded font-mono",
                                regime.regimeConfidence === 'OK' ? 'bg-green-500/20 text-green-400' :
                                regime.regimeConfidence === 'PARTIAL' ? 'bg-yellow-500/20 text-yellow-400' :
                                'bg-red-500/20 text-red-400'
                            )}>{regime.regimeConfidence}</span>
                        </div>
                        <div className={cn("text-lg font-bold px-2 py-1 rounded inline-block mb-2", regimeColors[regime.regime] || regimeColors.NEUTRAL)}>
                            {regime.regime.replace(/_/g, ' ')}
                        </div>
                        <div className="text-[10px] text-gray-500 mb-3">
                            Drivers: {regime.dominantDrivers.join(', ') || 'None'}
                        </div>
                        {warnings.length > 0 && (
                            <div className="border-t border-gray-800 pt-2 mt-2 space-y-1">
                                {warnings.slice(0, 2).map((w, i) => (
                                    <div key={i} className="text-[10px] text-yellow-300/80 flex items-start gap-1">
                                        <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                        <span>{w.message}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* 6 Axes */}
                <Card className="lg:col-span-5 bg-gray-900/80 border-gray-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3 text-purple-400">
                            <Activity className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">State Variables (6 Axes)</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <AxisBadge axis={regime.axes.G} />
                            <AxisBadge axis={regime.axes.I} />
                            <AxisBadge axis={regime.axes.L} />
                            <AxisBadge axis={regime.axes.C} />
                            <AxisBadge axis={regime.axes.D} />
                            <AxisBadge axis={regime.axes.V} />
                        </div>
                    </CardContent>
                </Card>

                {/* Meso Tilts & Prohibitions */}
                <Card className="lg:col-span-3 bg-gray-900/80 border-gray-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3 text-amber-400">
                            <Target className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">Meso Tilts</span>
                        </div>
                        <div className="space-y-1 mb-3">
                            {regime.mesoTilts.slice(0, 3).map((t, i) => (
                                <div key={i} className="text-[10px] flex items-center gap-1">
                                    <span className={cn("font-bold",
                                        t.direction === 'LONG' ? 'text-green-400' :
                                        t.direction === 'SHORT' ? 'text-red-400' : 'text-gray-400'
                                    )}>{t.direction}</span>
                                    <span className="text-gray-300 truncate">{t.asset}</span>
                                </div>
                            ))}
                        </div>
                        {regime.mesoProhibitions.length > 0 && (
                            <div className="border-t border-gray-800 pt-2">
                                <div className="text-[9px] text-red-400 font-bold mb-1">PROIBIÇÕES:</div>
                                {regime.mesoProhibitions.slice(0, 2).map((p, i) => (
                                    <div key={i} className="text-[9px] text-red-300/70 truncate">{p}</div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

// --- EXECUTION STATUS PANEL (Micro-Capital Framework) ---
const ExecutionStatusPanel = () => {
    const [mounted, setMounted] = useState(false);
    const [timeStr, setTimeStr] = useState('--:-- UTC');
    
    useEffect(() => {
        setMounted(true);
        const update = () => {
            const now = new Date();
            setTimeStr(`${now.toUTCString().slice(17, 22)} UTC`);
        };
        update();
        const interval = setInterval(update, 30000);
        return () => clearInterval(interval);
    }, []);

    const now = new Date();
    const utcHour = mounted ? now.getUTCHours() : 12; // Default to noon for SSR

    // Trading sessions (UTC)
    const sessions = {
        tokyo: { start: 0, end: 9, name: 'Tokyo', emoji: '🇯🇵' },
        london: { start: 7, end: 16, name: 'London', emoji: '🇬🇧' },
        ny: { start: 13, end: 22, name: 'New York', emoji: '🇺🇸' },
    };

    const activeSessions: string[] = [];
    if (utcHour >= sessions.tokyo.start && utcHour < sessions.tokyo.end) activeSessions.push('Tokyo');
    if (utcHour >= sessions.london.start && utcHour < sessions.london.end) activeSessions.push('London');
    if (utcHour >= sessions.ny.start && utcHour < sessions.ny.end) activeSessions.push('NY');

    // Best trading windows
    const isLondonNYOverlap = utcHour >= 13 && utcHour < 16;
    const isRollover = utcHour >= 21 && utcHour <= 23;
    const isWeekendClose = mounted && now.getUTCDay() === 5 && utcHour >= 19;
    const isLowLiquidity = utcHour >= 22 || utcHour < 5;

    let sessionQuality: 'OPTIMAL' | 'GOOD' | 'FAIR' | 'POOR' = 'FAIR';
    let qualityReason = 'Normal liquidity';

    if (isLondonNYOverlap) {
        sessionQuality = 'OPTIMAL';
        qualityReason = 'London/NY overlap - best spreads';
    } else if (activeSessions.includes('London') || activeSessions.includes('NY')) {
        sessionQuality = 'GOOD';
        qualityReason = `${activeSessions.join(' + ')} session active`;
    } else if (isRollover) {
        sessionQuality = 'POOR';
        qualityReason = 'Rollover period - spreads elevated';
    } else if (isWeekendClose) {
        sessionQuality = 'POOR';
        qualityReason = 'Weekend close - liquidity dropping';
    } else if (isLowLiquidity) {
        sessionQuality = 'FAIR';
        qualityReason = 'Low liquidity period';
    }

    const qualityColors = {
        OPTIMAL: 'text-green-400 bg-green-500/20',
        GOOD: 'text-blue-400 bg-blue-500/20',
        FAIR: 'text-yellow-400 bg-yellow-500/20',
        POOR: 'text-red-400 bg-red-500/20',
    };

    return (
        <Card className="bg-gray-900/80 border-gray-800">
            <CardContent className="p-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Execution Window</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-gray-500" suppressHydrationWarning>
                            {timeStr}
                        </span>
                        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", qualityColors[sessionQuality])}>
                            {sessionQuality}
                        </span>
                    </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="text-[10px] text-gray-500">
                            Active: <span className="text-gray-300 font-mono">{activeSessions.length > 0 ? activeSessions.join(' + ') : 'None'}</span>
                        </div>
                        <div className="text-[10px] text-gray-500">
                            {qualityReason}
                        </div>
                    </div>
                    {(isRollover || isWeekendClose) && (
                        <div className="text-[10px] text-red-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Avoid new entries
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

// --- CURRENCY STRENGTH PANEL (Forex Analysis) ---
const CurrencyStrengthPanel = ({ assets, macro }: { assets: ScoredAsset[]; macro: unknown }) => {
    const forexAssets = assets.filter(a => a.assetClass === 'forex');
    if (forexAssets.length === 0) return null;

    const m = (typeof macro === 'object' && macro !== null) ? (macro as Record<string, unknown>) : {};
    const dollarIndex = typeof m.dollarIndex === 'number' ? m.dollarIndex : null;

    // Extract currency pairs and calculate strength
    const currencies: Record<string, { strength: number; pairs: number; bullish: number; bearish: number }> = {};
    
    const currencyList = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'];
    currencyList.forEach(c => currencies[c] = { strength: 50, pairs: 0, bullish: 0, bearish: 0 });

    forexAssets.forEach(asset => {
        const sym = asset.symbol.replace('=X', '').toUpperCase();
        const base = sym.slice(0, 3);
        const quote = sym.slice(3, 6);
        
        if (currencies[base]) {
            currencies[base].pairs++;
            if (asset.signal === 'LONG') currencies[base].bullish++;
            else currencies[base].bearish++;
        }
        if (currencies[quote]) {
            currencies[quote].pairs++;
            if (asset.signal === 'LONG') currencies[quote].bearish++;
            else currencies[quote].bullish++;
        }
    });

    // Calculate strength score (0-100)
    Object.keys(currencies).forEach(c => {
        const cur = currencies[c];
        if (cur.pairs > 0) {
            const bullishRatio = cur.bullish / cur.pairs;
            cur.strength = Math.round(50 + (bullishRatio - 0.5) * 100);
        }
    });

    // Sort by strength
    const sorted = Object.entries(currencies)
        .filter(([_, v]) => v.pairs > 0)
        .sort((a, b) => b[1].strength - a[1].strength);

    const getStrengthColor = (s: number) => {
        if (s >= 70) return 'text-green-400 bg-green-500/20';
        if (s >= 55) return 'text-blue-400 bg-blue-500/20';
        if (s >= 45) return 'text-gray-400 bg-gray-500/20';
        if (s >= 30) return 'text-orange-400 bg-orange-500/20';
        return 'text-red-400 bg-red-500/20';
    };

    const getStrengthLabel = (s: number) => {
        if (s >= 70) return 'STRONG';
        if (s >= 55) return 'BULLISH';
        if (s >= 45) return 'NEUTRAL';
        if (s >= 30) return 'BEARISH';
        return 'WEAK';
    };

    const currencyFlags: Record<string, string> = {
        USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
        CHF: '🇨🇭', AUD: '🇦🇺', CAD: '🇨🇦', NZD: '🇳🇿'
    };

    return (
        <Card className="bg-gray-900 border-gray-800 mb-4">
            <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Currency Strength Meter</span>
                    </div>
                    {dollarIndex && (
                        <div className="text-[11px] font-mono text-gray-400">
                            DXY: <span className="text-white font-bold">{dollarIndex.toFixed(2)}</span>
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                    {sorted.map(([currency, data]) => (
                        <div key={currency} className="flex flex-col items-center p-2 rounded border border-gray-800 bg-gray-950/50">
                            <span className="text-lg">{currencyFlags[currency] || '🏳️'}</span>
                            <span className="text-[11px] font-bold text-white">{currency}</span>
                            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded mt-1", getStrengthColor(data.strength))}>
                                {data.strength}
                            </span>
                            <span className="text-[9px] text-gray-500 mt-0.5">{getStrengthLabel(data.strength)}</span>
                            <div className="text-[9px] text-gray-600 mt-1">
                                <span className="text-green-500">{data.bullish}↑</span>
                                <span className="mx-1">/</span>
                                <span className="text-red-500">{data.bearish}↓</span>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-3 text-[10px] text-gray-500 flex items-center gap-4">
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span> 70+ Strong
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span> 55-70 Bullish
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-gray-500"></span> 45-55 Neutral
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-orange-500"></span> 30-45 Bearish
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span> &lt;30 Weak
                    </span>
                </div>
            </CardContent>
        </Card>
    );
};

const MarketContextPanel = ({ macro, assets }: { macro: unknown; assets: ScoredAsset[] }) => {
    const m = (typeof macro === 'object' && macro !== null) ? (macro as Record<string, unknown>) : {};
    const vix = typeof m.vix === 'number' ? m.vix : null;
    const vixChange = typeof m.vixChange === 'number' ? m.vixChange : null;
    const dollarIndex = typeof m.dollarIndex === 'number' ? m.dollarIndex : null;
    const treasury10y = typeof m.treasury10y === 'number' ? m.treasury10y : null;
    const fgObj = (typeof m.fearGreed === 'object' && m.fearGreed !== null) ? (m.fearGreed as Record<string, unknown>) : null;
    const fearGreedValue = fgObj && typeof fgObj.value === 'number' ? fgObj.value : null;

    const list = Array.isArray(assets) ? assets : [];
    const adv = list.filter(a => (a.changePercent || 0) > 0).length;
    const dec = list.filter(a => (a.changePercent || 0) < 0).length;
    const breadthRatio = (adv > 0 && dec > 0) ? (adv / dec) : (adv > 0 && dec === 0) ? Infinity : 1;
    const breadthTitle = (adv === 0 && dec === 0)
        ? 'Breadth N/A'
        : (breadthRatio >= 2 ? 'Strong breadth' : breadthRatio >= 1 ? 'Balanced breadth' : 'Weak breadth');
    const breadthSubtitle = (adv === 0 && dec === 0)
        ? 'No market snapshot'
        : `${adv} adv / ${dec} dec`;

    const upPct = list.length > 0 ? (adv / list.length) * 100 : null;

    const byGroup = new Map<string, { sum: number; count: number }>();
    for (const a of list) {
        const key = (a.sector && a.sector !== 'N/A') ? a.sector : a.assetClass;
        const prev = byGroup.get(key) || { sum: 0, count: 0 };
        byGroup.set(key, { sum: prev.sum + (a.changePercent || 0), count: prev.count + 1 });
    }
    const groups = Array.from(byGroup.entries())
        .map(([k, v]) => ({ key: k, avg: v.count > 0 ? (v.sum / v.count) : 0 }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 3);

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {/* MACRO */}
            <Card className="bg-blue-950/20 border-blue-900/30">
                <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2 text-blue-400">
                        <Globe className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Macro Scenario</span>
                    </div>
                    <div className="flex justify-between items-end mb-3">
                        <div className="text-lg font-bold text-gray-200">
                            {vix !== null && vix < 20 ? 'Risk-On / Expansion' : 'Risk-Off / Contraction'}
                        </div>
                        <div className="text-xs text-gray-500">
                            {vix !== null && vix < 20 ? 'Liquidity Increasing' : 'High Volatility'}
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 border-t border-gray-800 pt-3">
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase font-bold">VIX</div>
                            <div className={cn("text-sm font-mono", vixChange !== null && vixChange < 0 ? "text-green-400" : "text-red-400")}>
                                {vix !== null ? vix.toFixed(2) : 'N/A'}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase font-bold">DXY</div>
                            <div className="text-sm font-mono text-gray-300">{dollarIndex !== null ? dollarIndex.toFixed(2) : 'N/A'}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase font-bold">US10Y</div>
                            <div className="text-sm font-mono text-gray-300">{treasury10y !== null ? `${treasury10y.toFixed(2)}%` : 'N/A'}</div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* SECTOR */}
            <Card className="bg-purple-950/20 border-purple-900/30">
                <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2 text-purple-400">
                        <Layers className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Sector Rotation</span>
                    </div>
                    <div className="flex justify-between items-end mb-3">
                        <div className="text-lg font-bold text-gray-200">{groups.length > 0 ? `${groups[0].key} Leading` : 'N/A'}</div>
                        <div className="text-xs text-gray-500">{groups.length > 0 ? 'Avg move by group' : 'No market snapshot'}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 border-t border-gray-800 pt-3">
                        {groups.length > 0 ? groups.map((g) => (
                            <div key={g.key}>
                                <div className="text-[10px] text-gray-500 uppercase font-bold">{g.key}</div>
                                <div className={cn("text-sm font-mono", g.avg >= 0 ? "text-green-400" : "text-red-400")}>
                                    {g.avg >= 0 ? '+' : ''}{g.avg.toFixed(1)}%
                                </div>
                            </div>
                        )) : (
                            <div className="col-span-3 text-xs text-gray-500">N/A</div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* BREADTH */}
            <Card className="bg-orange-950/20 border-orange-900/30">
                <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2 text-orange-400">
                        <Activity className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Market Breadth</span>
                    </div>
                    <div className="flex justify-between items-end mb-3">
                        <div className="text-lg font-bold text-gray-200">{breadthTitle}</div>
                        <div className="text-xs text-gray-500">{breadthSubtitle}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 border-t border-gray-800 pt-3">
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase font-bold">Adv/Dec</div>
                            <div className="text-sm font-mono text-green-400">{adv === 0 && dec === 0 ? 'N/A' : `${adv}/${dec}`}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase font-bold">Up %</div>
                            <div className="text-sm font-mono text-gray-300">{upPct === null ? 'N/A' : `${upPct.toFixed(0)}%`}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase font-bold">Fear/Greed</div>
                            <div className="text-sm font-mono text-green-400">{fearGreedValue !== null ? fearGreedValue : 'N/A'}</div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

// DETAIL PANEL COMPONENT
const AssetDetailPanel = ({
    asset,
    onClose,
    onExecute,
}: {
    asset: ScoredAsset;
    onClose: () => void;
    onExecute: (asset: ScoredAsset) => void;
}) => {
    const [smc, setSmc] = useState<SmcApiResponse | null>(null);
    const [smcLoading, setSmcLoading] = useState(true);
    const [smcError, setSmcError] = useState<string | null>(null);
    const [flow, setFlow] = useState<OrderFlowItem | null>(null);
    const [flowLoading, setFlowLoading] = useState(asset.assetClass === 'crypto');
    const [flowError, setFlowError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        const ac = new AbortController();

        fetch(`/api/smc?symbol=${encodeURIComponent(asset.symbol)}&interval=1d`, { signal: ac.signal })
            .then((r) => r.json())
            .then((j: SmcApiResponse) => {
                if (!alive) return;
                if (j && j.success) setSmc(j);
                else setSmcError(j?.error || 'Failed to load SMC');
            })
            .catch((e) => {
                if (!alive) return;
                setSmcError(e instanceof Error ? e.message : 'Failed to load SMC');
            })
            .finally(() => {
                if (!alive) return;
                setSmcLoading(false);
            });

        if (asset.assetClass === 'crypto') {
            fetch(`/api/orderflow?symbol=${encodeURIComponent(asset.displaySymbol)}`, { signal: ac.signal })
                .then((r) => r.json())
                .then((j: OrderFlowApiResponse) => {
                    if (!alive) return;
                    if (j && j.success && Array.isArray(j.data) && j.data[0]) setFlow(j.data[0] as OrderFlowItem);
                    else setFlowError(j?.error || 'Failed to load order flow');
                })
                .catch((e) => {
                    if (!alive) return;
                    setFlowError(e instanceof Error ? e.message : 'Failed to load order flow');
                })
                .finally(() => {
                    if (!alive) return;
                    setFlowLoading(false);
                });
        }

        return () => {
            alive = false;
            ac.abort();
        };
    }, [asset.symbol, asset.assetClass, asset.displaySymbol]);

    const liq = computeLiquidityMetrics(asset, flow);
    const isTradeable = asset.signal !== 'WAIT' && asset.quality?.status === 'OK';
    const finalScore = typeof asset.trustScore === 'number' && Number.isFinite(asset.trustScore) ? asset.trustScore : asset.score;
    const instrumentType = asset.symbol.endsWith('-USD') ? 'CRYPTO'
        : asset.symbol.endsWith('=X') ? 'FX'
            : asset.symbol.endsWith('=F') ? 'FUT'
                : asset.symbol.startsWith('^') ? 'INDEX'
                    : 'SPOT';

    return (
        <Card data-testid="asset-detail-panel" className="h-full bg-gray-900 border-gray-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <CardHeader className="py-4 px-5 border-b border-gray-800 flex flex-row items-center justify-between bg-gray-900">
                <div className="flex flex-col">
                    <div className="flex items-center gap-3">
                        <span className={cn("text-2xl font-bold", asset.changePercent > 0 ? "text-green-400" : "text-red-400")}>
                            {asset.displaySymbol}
                        </span>
                        <span className="text-sm font-mono text-gray-400">{asset.price.toFixed(2)}</span>
                        <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded", asset.changePercent > 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400")}>
                            {asset.changePercent > 0 ? '+' : ''}{asset.changePercent.toFixed(2)}%
                        </span>
                    </div>
                    <div className="mt-1 text-[10px] font-mono text-gray-500 flex items-center gap-2 flex-wrap">
                        <span className="text-gray-300">{asset.symbol}</span>
                        <span className="text-gray-700">|</span>
                        <span className="text-gray-400">{instrumentType}</span>
                        <span className="text-gray-700">|</span>
                        <span className="uppercase text-gray-400">{asset.assetClass || '—'}</span>
                        {asset.name ? (
                            <>
                                <span className="text-gray-700">|</span>
                                <span className="text-gray-500">{asset.name}</span>
                            </>
                        ) : null}
                    </div>
                </div>
                <Button data-testid="close-asset-detail" variant="ghost" size="icon" onClick={onClose} className="hover:bg-gray-800 rounded-full">
                    <X className="w-5 h-5 text-gray-400" />
                </Button>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-5 space-y-6">

                {/* 1. THESIS */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                        <Brain className="w-4 h-4" /> AI Generated Thesis
                    </div>
                    <div className="bg-amber-900/10 border border-amber-900/30 p-3 rounded-md">
                        <p className="text-sm text-gray-300 leading-relaxed font-mono">
                            {asset.oneLiner}
                        </p>
                    </div>
                    <div className="text-[10px] font-mono text-gray-500 flex justify-between">
                        <span>Quote age</span>
                        <span className="text-gray-300">{formatQuoteAge(asset.quoteTimestamp)}</span>
                    </div>
                    <div className="text-[10px] font-mono text-gray-500 flex justify-between">
                        <span>Quality</span>
                        <span className={cn(
                            "font-bold",
                            asset.quality?.status === 'OK' ? 'text-green-400' :
                                asset.quality?.status === 'PARTIAL' ? 'text-yellow-400' :
                                    asset.quality?.status === 'STALE' ? 'text-orange-400' :
                                        asset.quality?.status === 'SUSPECT' ? 'text-red-400' : 'text-gray-300'
                        )}>{asset.quality?.status ?? 'N/A'}</span>
                    </div>
                    {asset.quality?.reasons?.length ? (
                        <div className="text-[10px] font-mono text-gray-500 break-words">
                            Reasons: {asset.quality.reasons.join(', ')}
                        </div>
                    ) : null}
                </div>

                {/* 2. SCORE & SIGNAL */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gray-800/40 p-3 rounded-md border border-gray-700/50">
                        <div className="text-xs text-gray-500 uppercase font-bold mb-1">Final</div>
                        <div className="text-2xl font-bold text-white flex items-center gap-2">
                            {finalScore}
                            <span className="text-xs font-normal text-gray-500">/ 100</span>
                        </div>
                        <div className="w-full bg-gray-700 h-1.5 mt-2 rounded-full overflow-hidden">
                            <div className={cn("h-full", finalScore > 50 ? "bg-green-500" : "bg-red-500")} style={{ width: `${finalScore}%` }} />
                        </div>
                    </div>
                    <div className="bg-gray-800/40 p-3 rounded-md border border-gray-700/50">
                        <div className="text-xs text-gray-500 uppercase font-bold mb-1">Scan</div>
                        <div className="text-2xl font-bold text-white flex items-center gap-2">
                            {asset.score}
                            <span className="text-xs font-normal text-gray-500">/ 100</span>
                        </div>
                        <div className="w-full bg-gray-700 h-1.5 mt-2 rounded-full overflow-hidden">
                            <div className={cn("h-full", asset.score > 50 ? "bg-green-500" : "bg-red-500")} style={{ width: `${asset.score}%` }} />
                        </div>
                    </div>
                    <div className="bg-gray-800/40 p-3 rounded-md border border-gray-700/50">
                        <div className="text-xs text-gray-500 uppercase font-bold mb-1">Signal</div>
                        <div className={cn("text-2xl font-bold", asset.signal === 'LONG' ? "text-green-400" : asset.signal === 'SHORT' ? "text-red-400" : "text-gray-400")}>
                            {asset.signal}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Confidence: {asset.conf}</div>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-purple-400 text-xs font-bold uppercase tracking-wider">
                        <Layers className="w-4 h-4" /> Liquidity Map
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div data-testid="liquidity-score" className="bg-gray-950/40 border border-gray-800 rounded p-3">
                            <div className="text-[10px] text-gray-500 uppercase font-bold">Liquidity score</div>
                            <div className="text-2xl font-bold text-white flex items-baseline gap-2">
                                {liq.liquidityScore}
                                <span className="text-xs font-mono text-gray-500">/100</span>
                            </div>
                            <div className="text-[10px] font-mono text-gray-500 mt-1">Depth: <span className="text-gray-200">{liq.depth}</span></div>
                            <div className="text-[10px] font-mono text-gray-500">Slippage risk: <span className="text-gray-200">{liq.slippageRisk}</span></div>
                            <div className="text-[10px] font-mono text-gray-500">Dollar vol: <span className="text-gray-200">{formatUsdCompact(liq.dollarVol)}</span></div>
                            <div className="text-[10px] font-mono text-gray-500">Source: <span className="text-gray-200">{liq.source}</span></div>
                        </div>
                        <div className="bg-gray-950/40 border border-gray-800 rounded p-3">
                            <div className="text-[10px] text-gray-500 uppercase font-bold">Key levels</div>
                            <div className="mt-2 space-y-1 text-[11px] font-mono text-gray-300">
                                <div className="flex justify-between"><span className="text-gray-500">Buy-side</span><span>{smc?.analysis?.nearestBuySideLiquidity ?? 'N/A'}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">Sell-side</span><span>{smc?.analysis?.nearestSellSideLiquidity ?? 'N/A'}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">Zone</span><span>{smc?.analysis?.currentZone ?? 'N/A'}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">Equilibrium</span><span>{smc?.analysis?.equilibrium?.toFixed?.(2) ?? 'N/A'}</span></div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        <div className="bg-gray-950/40 border border-gray-800 rounded p-3">
                            <div className="flex items-center justify-between">
                                <div className="text-[10px] text-gray-500 uppercase font-bold">SMC snapshot</div>
                                <div className="text-[10px] font-mono text-gray-500">
                                    {smcLoading ? 'loading...' : smcError ? 'error' : smc?.timestamp ? new Date(smc.timestamp).toLocaleTimeString() : 'ok'}
                                </div>
                            </div>
                            {smcError ? (
                                <div className="text-[11px] font-mono text-gray-500 mt-2">{smcError}</div>
                            ) : (
                                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-mono">
                                    <div className="flex justify-between"><span className="text-gray-500">Bias</span><span className="text-gray-200">{smc?.analysis?.bias ?? 'N/A'}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-500">Strength</span><span className="text-gray-200">{smc?.analysis?.biasStrength ?? 'N/A'}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-500">OBs active</span><span className="text-gray-200">{smc?.analysis?.activeOrderBlocks ?? 'N/A'}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-500">FVGs unfilled</span><span className="text-gray-200">{smc?.analysis?.unfilledFVGs ?? 'N/A'}</span></div>
                                    <div className="col-span-2 text-gray-500">
                                        Nearest OB: <span className="text-gray-200">{smc?.analysis?.nearestBullishOB?.range || smc?.analysis?.nearestBearishOB?.range || 'N/A'}</span>
                                    </div>
                                    <div className="col-span-2 text-gray-500">
                                        Nearest FVG: <span className="text-gray-200">{smc?.analysis?.nearestBullishFVG?.range || smc?.analysis?.nearestBearishFVG?.range || 'N/A'}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {asset.assetClass === 'crypto' && (
                            <div className="bg-gray-950/40 border border-gray-800 rounded p-3">
                                <div className="flex items-center justify-between">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold">Order flow (crypto)</div>
                                    <div className="text-[10px] font-mono text-gray-500">
                                        {flowLoading ? 'loading...' : flowError ? 'error' : 'ok'}
                                    </div>
                                </div>
                                {flowError ? (
                                    <div className="text-[11px] font-mono text-gray-500 mt-2">{flowError}</div>
                                ) : flow ? (
                                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-mono">
                                        <div className="flex justify-between"><span className="text-gray-500">POC</span><span className="text-gray-200">{flow.poc.toFixed(2)}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500">VAH/VAL</span><span className="text-gray-200">{flow.vah.toFixed(2)} / {flow.val.toFixed(2)}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500">Delta</span><span className="text-gray-200">{flow.deltaPercent.toFixed(2)}%</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500">Whales</span><span className="text-gray-200">{flow.whaleActivity}</span></div>
                                        <div className="col-span-2 text-gray-500">
                                            HVNs: <span className="text-gray-200">{flow.highVolumeNodes?.slice(0, 3).map((n: { price: number; volume: number }) => n.price.toFixed(2)).join(', ') || 'N/A'}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-[11px] font-mono text-gray-500 mt-2">N/A</div>
                                )}
                            </div>
                        )}

                        {smc?.analysis?.entryZones?.length ? (
                            <div className="bg-gray-950/40 border border-gray-800 rounded p-3">
                                <div className="text-[10px] text-gray-500 uppercase font-bold">Liquidity zones (entry)</div>
                                <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] font-mono text-gray-300">
                                    {smc.analysis.entryZones.slice(0, 6).map((z, i) => (
                                        <div key={i} className="flex justify-between">
                                            <span className="text-gray-500">{z.type}</span>
                                            <span>{z.low.toFixed(2)} - {z.high.toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* 3. EXECUTION PLAN */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-wider">
                        <Target className="w-4 h-4" /> Execution Plan
                    </div>
                    <div className="grid grid-cols-1 gap-3 text-sm">
                        <div className="flex justify-between items-center p-3 bg-blue-500/10 border border-blue-500/20 rounded-md">
                            <span className="text-blue-300 font-bold">ENTRY ZONE</span>
                            <span className="font-mono text-white">{asset.entry}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-red-500/10 border border-red-500/20 rounded-md">
                            <span className="text-red-300 font-bold">STOP LOSS (Risks)</span>
                            <span className="font-mono text-white">{asset.sl}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-green-500/10 border border-green-500/20 rounded-md">
                            <span className="text-green-300 font-bold">TARGET (Profit)</span>
                            <span className="font-mono text-white">{asset.tp}</span>
                        </div>
                    </div>
                </div>

                {/* 4. STATS GRID */}
                <div className="grid grid-cols-3 gap-2 pt-2">
                    <div className="bg-gray-800/30 p-2 rounded text-center">
                        <div className="text-[10px] text-gray-500">RSI (14)</div>
                        <div className={cn("font-bold", asset.rsi > 70 ? "text-red-400" : asset.rsi < 30 ? "text-green-400" : "text-white")}>{Math.round(asset.rsi)}</div>
                    </div>
                    <div className="bg-gray-800/30 p-2 rounded text-center">
                        <div className="text-[10px] text-gray-500">Volatility</div>
                        <div className="font-bold text-white">{(asset.volatility * 100).toFixed(2)}%</div>
                    </div>
                    <div className="bg-gray-800/30 p-2 rounded text-center">
                        <div className="text-[10px] text-gray-500">R/R</div>
                        <div className="font-bold text-purple-400">{asset.rr}</div>
                    </div>
                </div>

                <div className="space-y-2 pt-2">
                    <div className="text-xs font-bold text-gray-300 uppercase tracking-wider">Why scan vs final</div>
                    <div className="grid grid-cols-1 gap-2">
                        <div className="bg-gray-950/40 border border-gray-800 rounded p-2">
                            <div className="text-[10px] text-gray-500 uppercase font-bold">Scan (market confluence)</div>
                            <div className="mt-2 grid grid-cols-1 gap-2">
                                {Object.entries(asset.breakdown.components).map(([k, v]) => (
                                    <div key={k} className="bg-gray-900/40 border border-gray-800 rounded p-2">
                                        <div className="flex items-center justify-between">
                                            <div className="text-[10px] text-gray-500 uppercase font-bold">{k}</div>
                                            <div className="text-[10px] font-mono text-gray-200">{v}</div>
                                        </div>
                                        <div className="text-[10px] font-mono text-gray-500 mt-1 break-words">{asset.breakdown.details[k]}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {asset.finalBreakdown ? (
                            <div className="bg-gray-950/40 border border-gray-800 rounded p-2">
                                <div className="text-[10px] text-gray-500 uppercase font-bold">Final (macro + meso + micro overlays)</div>
                                <div className="mt-2 grid grid-cols-1 gap-2">
                                    {Object.entries(asset.finalBreakdown.components).map(([k, v]) => (
                                        <div key={k} className="bg-gray-900/40 border border-gray-800 rounded p-2">
                                            <div className="flex items-center justify-between">
                                                <div className="text-[10px] text-gray-500 uppercase font-bold">{k}</div>
                                                <div className={cn(
                                                    "text-[10px] font-mono",
                                                    v < 0 ? "text-red-300" : "text-gray-200"
                                                )}>{v}</div>
                                            </div>
                                            <div className="text-[10px] font-mono text-gray-500 mt-1 break-words">{asset.finalBreakdown?.details[k]}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>

            </CardContent>
            <div className="p-4 border-t border-gray-800 bg-gray-900">
                <Button
                    data-testid="execute-signal"
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold"
                    disabled={!isTradeable}
                    onClick={() => {
                        if (!isTradeable) return;
                        onExecute(asset);
                        onClose();
                    }}
                >
                    EXECUTE {asset.signal}
                </Button>
            </div>
        </Card>
    );
};


export const CommandView = () => {
    const { addPortfolio } = useStore(); // Added addPortfolio
    const [selectedScannerAsset, setSelectedScannerAsset] = useState<string | null>(null);
    const [filterText, setFilterText] = useState('');
    const [sortBy, setSortBy] = useState<'trust' | 'score' | 'vol' | 'rsi' | 'rvol' | 'rr'>('trust');
    const [filterClass, setFilterClass] = useState<string>('ALL');
    const [filterMicro, setFilterMicro] = useState<'ALL' | 'EXECUTE' | 'WAIT' | 'AVOID'>('ALL');
    const [filterScenario, setFilterScenario] = useState<'ALL' | 'PRONTO' | 'DESENVOLVENDO' | 'CONTRA'>('ALL');
    const [filterRisk, setFilterRisk] = useState<'ALL' | 'LOW' | 'MED' | 'HIGH'>('ALL');

    const fetchInFlightRef = useRef(false);
    const fullUniverseInFlightRef = useRef(false);
    const fullUniverseLoadedRef = useRef(false);
    const macroInFlightRef = useRef(false);

    // PORTFOLIO BUILDER STATE
    const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
    const [builderConfig, setBuilderConfig] = useState({ capital: 100000, leverage: 10, lots: 1.0 });

    // Real Data States
    const [assets, setAssets] = useState<ScoredAsset[]>([]);
    const [macro, setMacro] = useState<unknown>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const scannerTableScrollRef = useRef<HTMLDivElement | null>(null);
    const [scannerTableScrollTop, setScannerTableScrollTop] = useState(0);
    const [scannerTableViewportHeight, setScannerTableViewportHeight] = useState(600);
    const [scannerTableRowHeight, setScannerTableRowHeight] = useState(64);
    const scannerTableScrollRafRef = useRef<number | null>(null);
    const scannerTableMeasuredRowHeightRef = useRef<number>(64);
    const scannerTableLastFilterKeyRef = useRef<string>('');
    const scannerTableRowMeasuredRef = useRef<boolean>(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [stats, setStats] = useState({ total: 0, latency: 0 });
    const [feedDegraded, setFeedDegraded] = useState(false);
    const [feedFallback, setFeedFallback] = useState(false);
    const [feedFallbackTimestamp, setFeedFallbackTimestamp] = useState<string | null>(null);
    const [qualitySummary, setQualitySummary] = useState<Record<string, number> | null>(null);
    const [tradeEnabled, setTradeEnabled] = useState(true);
    const [tradeDisabledReason, setTradeDisabledReason] = useState<string | null>(null);
    const [tradeEnabledByClass, setTradeEnabledByClass] = useState<Record<string, boolean> | null>(null);
    const [tradeDisabledReasonByClass, setTradeDisabledReasonByClass] = useState<Record<string, string | null> | null>(null);

    const [trackingSummary, setTrackingSummary] = useState<TrackingSummary | null>(null);
    const [perfStats, setPerfStats] = useState<PerformanceStats | null>(null);

    // REGIME ENGINE STATE
    const [regime, setRegime] = useState<RegimeSnapshot | null>(null);
    const [regimeLoading, setRegimeLoading] = useState(true);

    // MESO LAYER STATE (24h Focus)
    const [mesoData, setMesoData] = useState<{
        weeklyThesis: string;
        dailyFocus: string[];
        favoredDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
        volatilityContext: 'HIGH' | 'NORMAL' | 'LOW';
        allowedInstruments: { symbol: string; direction: 'LONG' | 'SHORT'; class: string; reason: string }[];
        prohibitedInstruments: { symbol: string; reason: string }[];
        marketBias: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
    } | null>(null);

    // MICRO LAYER STATE (Setups from technical analysis)
    const [microSetups, setMicroSetups] = useState<{
        symbol: string;
        displaySymbol: string;
        action: 'EXECUTE' | 'WAIT' | 'AVOID';
        metrics?: {
            pWin: number;
            rrMin: number;
            evR: number;
            modelRisk: 'LOW' | 'MED' | 'HIGH';
        };
        setup: {
            type: string;
            direction: 'LONG' | 'SHORT';
            timeframe: string;
            entry: number;
            stopLoss: number;
            takeProfit1: number;
            takeProfit2?: number;
            takeProfit3?: number;
            riskReward: number;
            confidence: 'HIGH' | 'MEDIUM' | 'LOW';
            confluences: string[];
            thesis: string;
            technicalScore: number;
            invalidation?: string;
            mesoAlignment?: boolean;
        } | null;
    }[]>([]);

    const [radarMode, setRadarMode] = useState<RadarMode>('BALANCED');

    const cycleRadarMode = useCallback(() => {
        setRadarMode((m) => (m === 'CONSERVATIVE' ? 'BALANCED' : m === 'BALANCED' ? 'AGGRESSIVE' : 'CONSERVATIVE'));
    }, []);

    // MICRO FULL ANALYSES (Technical data for expanded view)
    const [microAnalyses, setMicroAnalyses] = useState<{
        symbol: string;
        displaySymbol: string;
        price: number;
        technical: {
            trend: { h4: string; h1: string; m15: string; alignment: string };
            structure: { lastBOS: string | null; lastCHoCH: string | null; currentPhase: string };
            levels: { resistance: number[]; support: number[]; pivot: number; atr: number };
            indicators: { rsi: number; rsiDivergence: string | null; ema21: number; ema50: number; ema200: number; macdSignal: string; bbPosition: string };
            volume: { relative: number; trend: string; climax: boolean };
            smc: { orderBlocks: { type: string; low: number; high: number }[]; fvgs: { type: string }[]; liquidityPools: { type: string; level: number }[]; premiumDiscount: string };
        };
        scenarioAnalysis?: {
            status: 'PRONTO' | 'DESENVOLVENDO' | 'CONTRA';
            statusReason: string;
            technicalAlignment: number;
            entryQuality: 'OTIMO' | 'BOM' | 'RUIM';
            timing: string;
            blockers: string[];
            catalysts: string[];
        };
        liquidityAnalysis?: {
            liquidityScore: number;
            toleranceProfile: {
                toleranceScore: number;
                behaviorPattern: 'AGGRESSIVE_HUNTER' | 'SELECTIVE_HUNTER' | 'PASSIVE' | 'UNPREDICTABLE';
                description: string;
            };
            mtfLiquidity: {
                alignment: 'ALIGNED_BUYSIDE' | 'ALIGNED_SELLSIDE' | 'CONFLICTING' | 'NEUTRAL';
                strongestTimeframe: string;
            };
        };
    }[]>([]);

    const microSetupBySymbol = useMemo(() => {
        return new Map(
            microSetups
                .filter(s => s.setup)
                .map(s => [s.symbol, s.setup!])
        );
    }, [microSetups]);

    // TOGGLE SELECTION
    const toggleSelection = (symbol: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newSet = new Set(selectedAssets);
        if (newSet.has(symbol)) newSet.delete(symbol);
        else newSet.add(symbol);
        setSelectedAssets(newSet);
    };

    // AUTO BUILDERS
    const autoBuildSafe = () => {
        // Safe: Score > 60, Low Volatility (<1.5%), Diversified Sectors
        const candidates = assets.filter(a => (a.trustScore ?? a.score) > 70 && a.volatility < 0.015);
        const uniqueSectors = new Set();
        const selected = new Set<string>();

        // Pick best per sector
        candidates.forEach(a => {
            // Primitive sector proxy via assetClass
            const sector = a.assetClass;
            if (!uniqueSectors.has(sector) && selected.size < 5) {
                uniqueSectors.add(sector);
                selected.add(a.symbol);
            }
        });
        setSelectedAssets(selected);
    };

    const autoBuildHigh = () => {
        // High Potential: Top 5 by Final
        const top5 = [...assets]
            .sort((a, b) => (b.trustScore ?? b.score) - (a.trustScore ?? a.score))
            .slice(0, 5)
            .map(a => a.symbol);
        setSelectedAssets(new Set(top5));
    };

    // SEND TO INCUBATOR
    const sendToIncubator = () => {
        if (selectedAssets.size === 0) return;

        // Enrich assets with SCAN/MICRO data
        const portfolioAssets = assets
            .filter(a => selectedAssets.has(a.symbol))
            .map(a => {
                // Find matching MICRO analysis
                const microAnalysis = microAnalyses.find(m => m.symbol === a.symbol);
                const microSetup = microSetups.find(m => m.symbol === a.symbol);
                const setup = microSetup?.setup;
                const finalScore = typeof a.trustScore === 'number' && Number.isFinite(a.trustScore) ? a.trustScore : undefined;
                
                // Calculate risk profile and dynamic R:R based on score
                const score = setup?.technicalScore || 50;
                const riskProfile = score >= 75 ? 'SAFE' : score >= 55 ? 'MODERATE' : 'AGGRESSIVE';
                
                // Dynamic lot sizing based on score
                const lotMultiplier = score >= 80 ? 1.0 : score >= 70 ? 0.8 : score >= 60 ? 0.6 : score >= 50 ? 0.4 : 0.25;
                const adjustedLots = builderConfig.lots * lotMultiplier;
                
                return {
                    symbol: a.symbol,
                    entryPrice: setup?.entry || a.price,
                    side: (setup?.direction || (a.signal === 'SHORT' ? 'SHORT' : 'LONG')) as 'SHORT' | 'LONG',
                    lots: adjustedLots,
                    // SCAN/MICRO enrichment
                    scanScore: a.score,
                    finalScore,
                    stopLoss: setup?.stopLoss,
                    takeProfit1: setup?.takeProfit1,
                    takeProfit2: setup?.takeProfit2,
                    riskReward: setup?.riskReward,
                    technicalScore: setup?.technicalScore,
                    scenarioStatus: microAnalysis?.scenarioAnalysis?.status as 'PRONTO' | 'DESENVOLVENDO' | 'CONTRA' | undefined,
                    entryQuality: microAnalysis?.scenarioAnalysis?.entryQuality as 'OTIMO' | 'BOM' | 'RUIM' | undefined,
                    riskProfile: riskProfile as 'SAFE' | 'MODERATE' | 'AGGRESSIVE',
                    confluences: setup?.confluences,
                    thesis: setup?.thesis,
                    mesoReason: mesoData?.allowedInstruments.find(i => i.symbol === a.symbol)?.reason,
                };
            });

        addPortfolio({
            id: safeUUID(),
            name: `Portfolio ${new Date().toLocaleTimeString()}`,
            createdAt: Date.now(),
            status: 'ACTIVE',
            config: { capital: builderConfig.capital, leverage: builderConfig.leverage, defaultLots: builderConfig.lots },
            assets: portfolioAssets
        });

        // Clear selection and notify (mock)
        setSelectedAssets(new Set());
        console.info('Portfolio sent to Incubator with SCAN data!');
    };

    // FETCH REAL DATA
    const fetchData = useCallback(async () => {
        if (fetchInFlightRef.current) return;
        fetchInFlightRef.current = true;
        const start = performance.now();
        setRefreshing(true);
        try {
            const fetchJsonWithTimeout = async (url: string, timeoutMs: number) => {
                const controller = new AbortController();
                const t = window.setTimeout(() => controller.abort(), timeoutMs);
                try {
                    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
                    return await res.json();
                } finally {
                    window.clearTimeout(t);
                }
            };

            const applySnapshot = (snapshot: MarketSnapshotResponse, latency: number) => {
                setFeedDegraded(Boolean(snapshot.degraded));
                setFeedFallback(Boolean(snapshot.fallback));
                setFeedFallbackTimestamp(typeof snapshot.fallbackTimestamp === 'string' ? snapshot.fallbackTimestamp : null);
                setQualitySummary((typeof snapshot.qualitySummary === 'object' && snapshot.qualitySummary !== null) ? (snapshot.qualitySummary as Record<string, number>) : null);
                setTradeEnabled(typeof snapshot.tradeEnabled === 'boolean' ? snapshot.tradeEnabled : true);
                setTradeDisabledReason(typeof snapshot.tradeDisabledReason === 'string' ? snapshot.tradeDisabledReason : null);
                setTradeEnabledByClass((typeof snapshot.tradeEnabledByClass === 'object' && snapshot.tradeEnabledByClass !== null) ? (snapshot.tradeEnabledByClass as Record<string, boolean>) : null);
                setTradeDisabledReasonByClass((typeof snapshot.tradeDisabledReasonByClass === 'object' && snapshot.tradeDisabledReasonByClass !== null) ? (snapshot.tradeDisabledReasonByClass as Record<string, string | null>) : null);

                const rawAssets = Array.isArray(snapshot.data) ? snapshot.data : [];

                try {
                    const priceMap: Record<string, number> = {};
                    rawAssets.forEach((a) => {
                        if (a && typeof a.displaySymbol === 'string' && typeof a.price === 'number' && Number.isFinite(a.price)) {
                            priceMap[a.displaySymbol] = a.price;
                        }
                    });
                    updateSignalPricesFromPriceMap(priceMap);
                    setTrackingSummary(getTrackingSummary());
                    setPerfStats(calculateStats());
                } catch {
                    // ignore
                }

                const scored: ScoredAsset[] = rawAssets.map((asset: RealAssetData) => {
                    const confluence = computeConfluenceScore(asset);
                    const score = confluence.score;
                    const signal = confluence.direction;
                    const volatility = confluence.volatility;
                    const rvol = confluence.rvol;
                    const oneLiner = confluence.oneLiner;

                    const dailyRange = (asset.high && asset.low) ? (asset.high - asset.low) : (asset.price * 0.015);
                    const entry = asset.price;
                    const dailyRangePercent = entry > 0 ? (dailyRange / entry) : 0.015;
                    const safeDailyRangePercent = Number.isFinite(dailyRangePercent) ? dailyRangePercent : 0.015;
                    const atrPercent = Math.max(0.003, Math.min(0.02, safeDailyRangePercent));
                    const atr = entry * atrPercent;

                    const slMultiplier = score > 70 ? 0.55 : score > 55 ? 0.65 : 0.8;
                    const sl = signal === 'LONG' ? entry - (atr * slMultiplier) : entry + (atr * slMultiplier);

                    const tpMultiplier = score > 70 ? 1.15 : score > 55 ? 1.0 : 0.85;
                    const tp = signal === 'LONG' ? entry + (atr * tpMultiplier) : entry - (atr * tpMultiplier);

                    const risk = Math.abs(entry - sl);
                    const reward = Math.abs(tp - entry);
                    const rrValue = risk > 0 ? (reward / risk) : 0;

                    const timeframe = atrPercent > 0.015 ? 'H4' :
                        atrPercent > 0.008 ? 'H1' : 'M15';

                    const confluenceCount = confluence.breakdown?.components ?
                        Object.values(confluence.breakdown.components).filter((v): v is number => typeof v === 'number' && v > 60).length : 0;

                    return {
                        ...asset,
                        score,
                        regime: score > 55 ? 'BULLISH' : score < 45 ? 'BEARISH' : 'NEUTRAL',
                        signal,
                        conf: `${Math.round(50 + Math.abs(score - 50))}%`,
                        entry: entry < 10 ? entry.toFixed(4) : entry.toFixed(2),
                        sl: sl < 10 ? sl.toFixed(4) : sl.toFixed(2),
                        tp: tp < 10 ? tp.toFixed(4) : tp.toFixed(2),
                        rr: rrValue.toFixed(1),
                        timeframe,
                        confluenceCount,
                        rvol,
                        volatility,
                        oneLiner,
                        breakdown: confluence.breakdown,
                    };
                });

                const validAssets = scored.filter(a => a.price > 0).sort((a, b) => b.score - a.score);
                const uniqueAssets = Array.from(new Map(validAssets.map(item => [item.symbol, item])).values());

                setAssets(uniqueAssets);
                setStats({ total: typeof snapshot.count === 'number' ? snapshot.count : uniqueAssets.length, latency });
                setLastUpdated(new Date());
            };

            let data: MarketSnapshotResponse;
            try {
                data = (await fetchJsonWithTimeout('/api/market?limit=120&macro=0', 12_000)) as MarketSnapshotResponse;
            } catch (e) {
                console.warn('Market feed fetch timeout/error; falling back to smaller snapshot', e);
                data = (await fetchJsonWithTimeout('/api/market?limit=60&macro=0', 12_000)) as MarketSnapshotResponse;
            }
            const latency = Math.round(performance.now() - start);

            if (data.success) {
                applySnapshot(data, latency);

                if (!macroInFlightRef.current) {
                    macroInFlightRef.current = true;
                    void (async () => {
                        try {
                            const m = (await fetchJsonWithTimeout('/api/macro', 6_000)) as Record<string, unknown>;
                            const macroPayload = (typeof m === 'object' && m !== null) ? (m as Record<string, unknown>) : {};
                            const macroValue = (typeof macroPayload.macro === 'object' && macroPayload.macro !== null) ? macroPayload.macro : null;
                            if (macroValue) setMacro(macroValue);
                        } catch {
                            // ignore
                        } finally {
                            macroInFlightRef.current = false;
                        }
                    })();
                }

                if (!fullUniverseLoadedRef.current && !fullUniverseInFlightRef.current) {
                    fullUniverseInFlightRef.current = true;
                    void (async () => {
                        try {
                            const full = (await fetchJsonWithTimeout('/api/market?macro=0', 45_000)) as MarketSnapshotResponse;
                            if (full.success && Array.isArray(full.data) && full.data.length > (Array.isArray(data.data) ? data.data.length : 0)) {
                                applySnapshot(full, latency);
                                fullUniverseLoadedRef.current = true;
                            }
                        } catch {
                            // ignore
                        } finally {
                            fullUniverseInFlightRef.current = false;
                        }
                    })();
                }
            }
        } catch (e) {
            console.error("Feed Error", e);
        } finally {
            setLoading(false);
            setRefreshing(false);
            fetchInFlightRef.current = false;
        }
}, []);

const executeSignal = useCallback((asset: ScoredAsset) => {
    if (feedDegraded || feedFallback) return;

    const classAllowed = tradeEnabledByClass
        ? Boolean(tradeEnabledByClass[asset.assetClass])
        : tradeEnabled;

    if (!tradeEnabled || !classAllowed) return;
    if (asset.signal === 'WAIT') return;
    if (asset.quality?.status !== 'OK') return;

    const ms = microSetupBySymbol.get(asset.symbol);
    const entry = ms?.entry ?? asset.price;
    const direction = ms?.direction ?? asset.signal;
    const sl = ms?.stopLoss ?? (() => {
        const dailyRange = (asset.high && asset.low) ? (asset.high - asset.low) : (asset.price * 0.015);
        const dailyRangePercent = entry > 0 ? (dailyRange / entry) : 0.015;
        const safeDailyRangePercent = Number.isFinite(dailyRangePercent) ? dailyRangePercent : 0.015;
        const atrPercent = Math.max(0.003, Math.min(0.02, safeDailyRangePercent));
        const atr = entry * atrPercent;
        const slMultiplier = asset.score > 70 ? 0.55 : asset.score > 55 ? 0.65 : 0.8;
        return direction === 'LONG' ? entry - (atr * slMultiplier) : entry + (atr * slMultiplier);
    })();
    const tp1 = ms?.takeProfit1 ?? (() => {
        const dailyRange = (asset.high && asset.low) ? (asset.high - asset.low) : (asset.price * 0.015);
        const dailyRangePercent = entry > 0 ? (dailyRange / entry) : 0.015;
        const safeDailyRangePercent = Number.isFinite(dailyRangePercent) ? dailyRangePercent : 0.015;
        const atrPercent = Math.max(0.003, Math.min(0.02, safeDailyRangePercent));
        const atr = entry * atrPercent;
        const tp1Multiplier = asset.score > 70 ? 1.15 : asset.score > 55 ? 1.0 : 0.85;
        return direction === 'LONG' ? entry + (atr * tp1Multiplier) : entry - (atr * tp1Multiplier);
    })();
    const tp2 = ms?.takeProfit2 ?? (() => {
        const dailyRange = (asset.high && asset.low) ? (asset.high - asset.low) : (asset.price * 0.015);
        const dailyRangePercent = entry > 0 ? (dailyRange / entry) : 0.015;
        const safeDailyRangePercent = Number.isFinite(dailyRangePercent) ? dailyRangePercent : 0.015;
        const atrPercent = Math.max(0.003, Math.min(0.02, safeDailyRangePercent));
        const atr = entry * atrPercent;
        const tp1Multiplier = asset.score > 70 ? 1.15 : asset.score > 55 ? 1.0 : 0.85;
        return direction === 'LONG' ? entry + (atr * (tp1Multiplier * 1.5)) : entry - (atr * (tp1Multiplier * 1.5));
    })();
    const tp3 = ms?.takeProfit3 ?? (() => {
        const dailyRange = (asset.high && asset.low) ? (asset.high - asset.low) : (asset.price * 0.015);
        const dailyRangePercent = entry > 0 ? (dailyRange / entry) : 0.015;
        const safeDailyRangePercent = Number.isFinite(dailyRangePercent) ? dailyRangePercent : 0.015;
        const atrPercent = Math.max(0.003, Math.min(0.02, safeDailyRangePercent));
        const atr = entry * atrPercent;
        const tp1Multiplier = asset.score > 70 ? 1.15 : asset.score > 55 ? 1.0 : 0.85;
        return direction === 'LONG' ? entry + (atr * (tp1Multiplier * 2.0)) : entry - (atr * (tp1Multiplier * 2.0));
    })();

    // EVALUATE GATES (Institutional Framework)
    let gatesResult: GateSummary | null = null;
    let gatesSummary: GateResultSummary[] = [];
    let gatesAllPass = true;

    if (regime) {
        const tradeContext: TradeContext = {
            symbol: asset.symbol,
            direction,
            assetClass: asset.assetClass,
            score: asset.score,
            signal: asset.signal,
            quality: asset.quality,
            liquidityScore: asset.breakdown?.components?.liquidity,
            entryPrice: entry,
            stopPrice: sl,
            targetPrice: tp1,
            currentHour: new Date().getUTCHours(),
        };

        gatesResult = evaluateGates(regime, tradeContext);
        gatesAllPass = gatesResult.allPass;
        gatesSummary = Object.values(gatesResult.gates).map(g => ({
            gate: g.gate,
            status: g.status as 'PASS' | 'FAIL' | 'WARN' | 'SKIP',
            reasons: g.reasons,
        }));

        // Log gate evaluation for observability
        if (!gatesAllPass) {
            console.info(`[GATES] ${asset.displaySymbol} blocked:`, gatesResult.blockingReasons);
        } else if (gatesResult.warnings.length > 0) {
            console.info(`[GATES] ${asset.displaySymbol} warnings:`, gatesResult.warnings);
        }
    }

        const id = safeUUID();

        const confN = Number(String(asset.conf).replace('%', ''));
        const confidence = Number.isFinite(confN)
            ? (confN >= 80 ? 'INSTITUTIONAL' : confN >= 65 ? 'STRONG' : 'MODERATE')
            : 'MODERATE';

        trackSignal({
            id,
            asset: asset.displaySymbol,
            assetClass: asset.assetClass,
            direction,
            price: entry,
            stopLoss: sl,
            takeProfits: [
                { price: tp1, ratio: '1.5R' },
                { price: tp2, ratio: '2.5R' },
                { price: tp3, ratio: '4.0R' },
            ],
            score: asset.score,
            components: asset.breakdown.components,
            regime: asset.regime,
            regimeType: regime?.regime,
            gates: gatesSummary,
            gatesAllPass,
            validityHours: asset.assetClass === 'crypto' || asset.assetClass === 'forex' ? 6 : 24,
        });

        addSignal({
            id,
            symbol: asset.displaySymbol,
            direction,
            score: asset.score,
            confidence,
            assetType: asset.assetClass,
            sector: asset.sector,
            signalPrice: entry,
            entryLow: entry,
            entryHigh: entry,
            stopLoss: sl,
            takeProfit1: tp1,
            takeProfit2: tp2,
            timestamp: Date.now(),
            validityHours: asset.assetClass === 'crypto' || asset.assetClass === 'forex' ? 6 : 24,
        });

        try {
            setTrackingSummary(getTrackingSummary());
            setPerfStats(calculateStats());
        } catch {
            // ignore
        }
    }, [feedDegraded, feedFallback, tradeEnabledByClass, tradeEnabled, regime, microSetupBySymbol]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 15000); // Poll every 15s for real-time
        return () => clearInterval(interval);
    }, [fetchData]);

    useEffect(() => {
        const el = scannerTableScrollRef.current;
        if (!el) return;
        const update = () => setScannerTableViewportHeight(el.clientHeight || 600);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // FETCH REGIME + MESO + MICRO (Full Pipeline)
    useEffect(() => {
        let alive = true;
        const fetchFullPipeline = async () => {
            try {
                // Fetch all three in parallel
                const [regimeRes, mesoRes, microRes] = await Promise.all([
                    fetch('/api/regime', { cache: 'no-store' }),
                    fetch('/api/meso', { cache: 'no-store' }),
                    fetch('/api/micro', { cache: 'no-store' })
                ]);
                
                const regimeData = await regimeRes.json();
                const mesoDataRes = await mesoRes.json();
                const microDataRes = await microRes.json();
                
                if (alive && regimeData.success && regimeData.snapshot) {
                    setRegime(regimeData.snapshot as RegimeSnapshot);
                }
                
                if (alive && mesoDataRes.success) {
                    setMesoData({
                        weeklyThesis: mesoDataRes.temporalFocus?.weeklyThesis || '',
                        dailyFocus: mesoDataRes.temporalFocus?.dailyFocus || [],
                        favoredDirection: mesoDataRes.microInputs?.favoredDirection || 'NEUTRAL',
                        volatilityContext: mesoDataRes.microInputs?.volatilityContext || 'NORMAL',
                        allowedInstruments: mesoDataRes.microInputs?.allowedInstruments || [],
                        prohibitedInstruments: mesoDataRes.microInputs?.prohibitedInstruments || [],
                        marketBias: mesoDataRes.executiveSummary?.marketBias || 'NEUTRAL',
                    });
                }
                
                // Process MICRO setups and full analyses
                if (alive && microDataRes.success && Array.isArray(microDataRes.analyses)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const setups = microDataRes.analyses.map((a: any) => ({
                        symbol: a.symbol,
                        displaySymbol: a.displaySymbol,
                        action: a.recommendation.action as 'EXECUTE' | 'WAIT' | 'AVOID',
                        metrics: a.recommendation.metrics,
                        setup: a.recommendation.bestSetup || (a.setups.length > 0 ? a.setups[0] : null),
                    }));
                    setMicroSetups(setups);
                    
                    // Store full analyses for expanded view (including scenarioAnalysis + liquidityAnalysis)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const analyses = microDataRes.analyses.map((a: any) => ({
                        symbol: a.symbol,
                        displaySymbol: a.displaySymbol,
                        price: a.price,
                        technical: a.technical,
                        scenarioAnalysis: a.scenarioAnalysis,
                        liquidityAnalysis: a.liquidityAnalysis,
                    }));
                    setMicroAnalyses(analyses);
                }
            } catch (e) {
                console.error('Pipeline fetch error', e);
            } finally {
                if (alive) setRegimeLoading(false);
            }
        };
        fetchFullPipeline();
        const interval = setInterval(fetchFullPipeline, 30000); // Sync every 30s
        return () => { alive = false; clearInterval(interval); };
    }, []);

    // Derived Lists
    const feedHealthy = !feedDegraded && !feedFallback;
    const classGate = (assetClass: string) => {
        if (!tradeEnabledByClass) return tradeEnabled;
        return Boolean(tradeEnabledByClass[assetClass]);
    };

    const pipelineUniverseSymbols = useMemo(() => {
        const s = new Set<string>();
        (mesoData?.allowedInstruments || []).forEach(i => {
            if (i && typeof i.symbol === 'string') s.add(i.symbol);
        });
        microSetups.forEach(m => {
            if (m && typeof m.symbol === 'string') s.add(m.symbol);
        });
        return s;
    }, [mesoData, microSetups]);

    const activeSignals = feedHealthy
        ? assets.filter(a => (a.signal !== 'WAIT' || pipelineUniverseSymbols.has(a.symbol)) && classGate(a.assetClass))
        : [];

    const scannerUniverse = assets.filter(a => classGate(a.assetClass));
    const scannerList = scannerUniverse;

    const microActionBySymbol = useMemo(() => {
        return new Map(microSetups.map(s => [s.symbol, s.action]));
    }, [microSetups]);

    const microMetricsBySymbol = useMemo(() => {
        return new Map(microSetups.map(s => [s.symbol, s.metrics]));
    }, [microSetups]);

    const microAnalysisBySymbol = useMemo(() => {
        return new Map(microAnalyses.map(a => [a.symbol, a]));
    }, [microAnalyses]);

    const mesoAllowedBySymbol = useMemo(() => {
        return new Map((mesoData?.allowedInstruments || []).map(i => [i.symbol, i]));
    }, [mesoData]);

    const mesoProhibitedBySymbol = useMemo(() => {
        return new Map((mesoData?.prohibitedInstruments || []).map(i => [i.symbol, i]));
    }, [mesoData]);

    const scannerRows = useMemo(() => {
        const formatPrice = (price: number) => price < 10 ? price.toFixed(4) : price.toFixed(2);

        const macroGateStatus = !regime ? 'LOADING' :
            regime.regimeConfidence === 'UNAVAILABLE' ? 'FAIL' :
            regime.axes.L.direction === '↓↓' || regime.axes.C.direction === '↓↓' ? 'FAIL' :
            regime.regimeConfidence === 'OK' ? 'PASS' : 'WARN';

        const now = new Date();
        const hour = now.getUTCHours();
        const goodHours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
        const badHours = [21, 22, 23, 0, 1, 2, 3];
        const execWindow: 'PASS' | 'WARN' = badHours.includes(hour) ? 'WARN' : goodHours.includes(hour) ? 'PASS' : 'WARN';

        return scannerList.map((row) => {
            const ms = microSetupBySymbol.get(row.symbol);

            const microAction = microActionBySymbol.get(row.symbol);
            const microMetrics = microMetricsBySymbol.get(row.symbol);
            const analysis = microAnalysisBySymbol.get(row.symbol);
            const scenarioStatus = analysis?.scenarioAnalysis?.status as ScoredAsset['scenarioStatus'] | undefined;

            const mesoAllowed = mesoAllowedBySymbol.get(row.symbol);
            const mesoProhibited = mesoProhibitedBySymbol.get(row.symbol);
            const mesoDirection = mesoAllowed?.direction as ScoredAsset['mesoDirection'] | undefined;
            const mesoClass = typeof mesoAllowed?.class === 'string' ? mesoAllowed.class : undefined;
            const mesoReason = typeof mesoAllowed?.reason === 'string' ? mesoAllowed.reason : undefined;
            const mesoBlocked = Boolean(mesoProhibited);

            // Extract liquidity data from MICRO analysis
            const liquidityScore = analysis?.liquidityAnalysis?.liquidityScore;
            const liquidityBehavior = analysis?.liquidityAnalysis?.toleranceProfile?.behaviorPattern as ScoredAsset['liquidityBehavior'];
            const liquidityAlignment = analysis?.liquidityAnalysis?.mtfLiquidity?.alignment;

            const baseRow = !ms ? {
                    ...row,
                    levelSource: 'SCAN' as const,
                    microAction,
                    scenarioStatus,
                    mesoDirection,
                    mesoClass,
                    mesoReason,
                    mesoBlocked,
                    liquidityScore,
                    liquidityBehavior,
                    liquidityAlignment,
                }
                : {
                ...row,
                signal: ms.direction,
                timeframe: ms.timeframe || row.timeframe,
                confluenceCount: Array.isArray(ms.confluences) ? ms.confluences.length : row.confluenceCount,
                entry: formatPrice(ms.entry),
                sl: formatPrice(ms.stopLoss),
                tp: formatPrice(ms.takeProfit1),
                rr: (ms.riskReward ?? Number(row.rr)).toFixed(1),
                levelSource: 'MICRO' as const,
                microAction,
                scenarioStatus,
                mesoDirection,
                mesoClass,
                mesoReason,
                mesoBlocked,
                liquidityScore,
                liquidityBehavior,
                liquidityAlignment,
            };

            const rrNum = Number.parseFloat(baseRow.rr);
            const liq = baseRow.breakdown?.components?.liquidity ?? 0;
            const vol = baseRow.volatility ?? 0;

            let riskPoints = 0;
            if (macroGateStatus === 'FAIL') riskPoints += 5;
            else if (macroGateStatus === 'WARN') riskPoints += 1;

            if (baseRow.mesoBlocked) riskPoints += 8;

            if (baseRow.levelSource !== 'MICRO') riskPoints += 1;

            if (baseRow.microAction === 'AVOID') riskPoints += 5;
            else if (baseRow.microAction === 'WAIT') riskPoints += 2;

            if (baseRow.scenarioStatus === 'CONTRA') riskPoints += 5;
            else if (baseRow.scenarioStatus === 'DESENVOLVENDO') riskPoints += 2;

            if (microMetrics && Number.isFinite(microMetrics.rrMin)) {
                if (!Number.isFinite(rrNum) || rrNum < microMetrics.rrMin) riskPoints += 4;
            } else {
                if (!Number.isFinite(rrNum) || rrNum < 1.2) riskPoints += 4;
                else if (rrNum < 1.5) riskPoints += 2;
                else if (rrNum < 1.8) riskPoints += 1;
            }

            if (microMetrics && Number.isFinite(microMetrics.evR) && microMetrics.evR < 0) riskPoints += 2;

            if (vol >= 5) riskPoints += 3;
            else if (vol >= 3) riskPoints += 2;
            else if (vol >= 1.8) riskPoints += 1;

            if (liq < 30) riskPoints += 3;
            else if (liq < 50) riskPoints += 2;
            else if (liq < 60) riskPoints += 1;

            if (execWindow === 'WARN') riskPoints += 1;

            const riskLabel: ScoredAsset['riskLabel'] = riskPoints <= 3 ? 'LOW' : riskPoints <= 7 ? 'MED' : 'HIGH';

            const scanScore = typeof baseRow.score === 'number' && Number.isFinite(baseRow.score) ? baseRow.score : 0;

            const macroScore = macroGateStatus === 'PASS' ? 80 : macroGateStatus === 'WARN' ? 55 : macroGateStatus === 'FAIL' ? 20 : 50;

            let mesoScore = 30;
            if (baseRow.mesoBlocked) mesoScore = 0;
            else if (baseRow.mesoDirection) mesoScore = baseRow.signal === baseRow.mesoDirection ? 80 : 35;

            const actionScore = baseRow.microAction === 'EXECUTE' ? 85 : baseRow.microAction === 'WAIT' ? 60 : baseRow.microAction === 'AVOID' ? 20 : 50;
            const scenarioScore = baseRow.scenarioStatus === 'PRONTO' ? 80 : baseRow.scenarioStatus === 'DESENVOLVENDO' ? 60 : baseRow.scenarioStatus === 'CONTRA' ? 30 : 50;

            let microScore = 50;
            if (ms && typeof ms.technicalScore === 'number' && Number.isFinite(ms.technicalScore)) microScore = ms.technicalScore;
            microScore = Math.round(microScore * 0.6 + actionScore * 0.2 + scenarioScore * 0.2);

            if (microMetrics && Number.isFinite(microMetrics.evR)) {
                microScore += Math.max(-10, Math.min(10, microMetrics.evR * 20));
                if (microMetrics.modelRisk === 'LOW') microScore += 3;
                else if (microMetrics.modelRisk === 'HIGH') microScore -= 4;
            }

            if (Number.isFinite(rrNum)) {
                const rrTarget = microMetrics && Number.isFinite(microMetrics.rrMin) ? microMetrics.rrMin : 1.5;
                microScore += Math.max(-8, Math.min(8, (rrNum - rrTarget) * 10));
            }

            microScore = Math.max(0, Math.min(100, Math.round(microScore)));

            const riskPenalty = riskLabel === 'LOW' ? 0 : riskLabel === 'MED' ? 6 : 14;
            const qualityPenalty = baseRow.quality?.status === 'OK'
                ? 0
                : baseRow.quality?.status === 'PARTIAL'
                    ? 3
                    : baseRow.quality?.status === 'STALE'
                        ? 8
                        : baseRow.quality?.status === 'SUSPECT'
                            ? 15
                            : 0;

            // Liquidity bonus based on advanced liquidity analysis
            let liquidityBonus = 0;
            if (baseRow.liquidityScore && baseRow.liquidityScore >= 80) liquidityBonus += 5;
            if (baseRow.liquidityBehavior === 'AGGRESSIVE_HUNTER') liquidityBonus += 3;
            else if (baseRow.liquidityBehavior === 'PASSIVE') liquidityBonus -= 2;
            if (baseRow.liquidityAlignment === 'ALIGNED_BUYSIDE' || baseRow.liquidityAlignment === 'ALIGNED_SELLSIDE') liquidityBonus += 2;

            const finalScore = Math.round(
                scanScore * 0.30 +
                microScore * 0.35 +
                mesoScore * 0.15 +
                macroScore * 0.10 +
                (baseRow.liquidityScore ?? 50) * 0.10 + // 10% weight for liquidity
                liquidityBonus -
                riskPenalty -
                qualityPenalty
            );

            const trustScore = Math.max(0, Math.min(100, finalScore));

            const finalBreakdown = {
                components: {
                    scan: Math.round(scanScore),
                    micro: Math.round(microScore),
                    meso: Math.round(mesoScore),
                    macro: Math.round(macroScore),
                    liquidity: Math.round((baseRow.liquidityScore ?? 50) * 0.10 + liquidityBonus),
                    riskPenalty: -riskPenalty,
                    qualityPenalty: -qualityPenalty,
                },
                details: {
                    scan: 'Price/volume/liquidity confluence from the global scanner',
                    micro: 'Execution readiness: setup technicalScore + action/scenario + EV/RR adjustments',
                    meso: 'Universe gate: allowed vs blocked + alignment with MESO direction',
                    macro: 'Regime gate: liquidity/credit stress and regime confidence',
                    liquidity: `Advanced liquidity: score=${baseRow.liquidityScore ?? 'N/A'}, behavior=${baseRow.liquidityBehavior ?? 'N/A'}, MTF=${baseRow.liquidityAlignment ?? 'N/A'}`,
                    riskPenalty: `Penalty from riskLabel=${riskLabel} + volatility/liquidity/EV/RR window`,
                    qualityPenalty: `Penalty from quote quality status=${baseRow.quality?.status ?? 'N/A'}`,
                },
            };

            return { ...baseRow, riskLabel, trustScore, finalBreakdown };
        });
    }, [scannerList, microSetupBySymbol, microActionBySymbol, microMetricsBySymbol, microAnalysisBySymbol, mesoAllowedBySymbol, mesoProhibitedBySymbol, regime]);

    const visibleScannerRows = useMemo(() => {
        const minTrust = radarMode === 'CONSERVATIVE' ? 70 : radarMode === 'BALANCED' ? 55 : 35;
        const allowRisk: Array<NonNullable<ScoredAsset['riskLabel']>> = radarMode === 'CONSERVATIVE'
            ? ['LOW']
            : radarMode === 'BALANCED'
                ? ['LOW', 'MED']
                : ['LOW', 'MED', 'HIGH'];

        return scannerRows
            .filter(r => !r.mesoBlocked)
            .filter(r => Boolean(r.mesoDirection))
            .filter(r => r.levelSource === 'MICRO')
            .filter(r => r.microAction !== 'AVOID')
            .filter(r => r.scenarioStatus !== 'CONTRA')
            .filter(r => !r.riskLabel || allowRisk.includes(r.riskLabel))
            .filter(r => (r.trustScore ?? 0) >= minTrust);
    }, [scannerRows, radarMode]);

    const tableRows = useMemo(() => {
        const q = filterText.trim().toLowerCase();
        const filtered0 = q
            ? scannerRows.filter(r => {
                const hay = [
                    r.displaySymbol,
                    r.symbol,
                    r.name,
                    r.assetClass,
                    r.sector,
                    r.signal,
                    r.levelSource,
                    r.microAction,
                    r.scenarioStatus,
                    r.mesoDirection,
                    r.riskLabel,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();

                return hay.includes(q);
            })
            : scannerRows;

        const filtered = filtered0
            .filter((r) => filterClass === 'ALL' ? true : r.assetClass === filterClass)
            .filter((r) => filterMicro === 'ALL' ? true : (r.microAction || 'WAIT') === filterMicro)
            .filter((r) => filterScenario === 'ALL' ? true : (r.scenarioStatus || 'DESENVOLVENDO') === filterScenario)
            .filter((r) => filterRisk === 'ALL' ? true : (r.riskLabel || 'MED') === filterRisk);

        const sorted = [...filtered];
        if (sortBy === 'trust') {
            sorted.sort((a, b) => (b.trustScore ?? 0) - (a.trustScore ?? 0));
        } else if (sortBy === 'score') {
            sorted.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        } else if (sortBy === 'rr') {
            sorted.sort((a, b) => {
                const ra = Number.parseFloat(String(a.rr));
                const rb = Number.parseFloat(String(b.rr));
                return (Number.isFinite(rb) ? rb : 0) - (Number.isFinite(ra) ? ra : 0);
            });
        } else if (sortBy === 'vol') {
            sorted.sort((a, b) => (b.volatility ?? 0) - (a.volatility ?? 0));
        } else if (sortBy === 'rsi') {
            sorted.sort((a, b) => {
                const da = Math.abs(((a.rsi ?? 50) as number) - 50);
                const db = Math.abs(((b.rsi ?? 50) as number) - 50);
                return db - da;
            });
        } else if (sortBy === 'rvol') {
            sorted.sort((a, b) => (b.rvol ?? 0) - (a.rvol ?? 0));
        }

        return sorted;
    }, [scannerRows, filterText, sortBy, filterClass, filterMicro, filterScenario, filterRisk]);

    useEffect(() => {
        const key = `${filterText}|${sortBy}|${filterClass}|${filterMicro}|${filterScenario}|${filterRisk}`;
        if (scannerTableLastFilterKeyRef.current && scannerTableLastFilterKeyRef.current !== key) {
            const el = scannerTableScrollRef.current;
            if (el) el.scrollTop = 0;
            setScannerTableScrollTop(0);
        }
        scannerTableLastFilterKeyRef.current = key;
    }, [filterText, sortBy, filterClass, filterMicro, filterScenario, filterRisk]);

    const onScannerTableScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const next = e.currentTarget.scrollTop;
        if (scannerTableScrollRafRef.current !== null) {
            cancelAnimationFrame(scannerTableScrollRafRef.current);
        }
        scannerTableScrollRafRef.current = requestAnimationFrame(() => {
            setScannerTableScrollTop(next);
            scannerTableScrollRafRef.current = null;
        });
    }, []);

    const measureScannerTableRow = useCallback((node: HTMLTableRowElement | null) => {
        if (!node || scannerTableRowMeasuredRef.current) return;
        const h = Math.round(node.getBoundingClientRect().height);
        if (h > 0 && h !== scannerTableMeasuredRowHeightRef.current) {
            scannerTableMeasuredRowHeightRef.current = h;
            scannerTableRowMeasuredRef.current = true;
            // Use setTimeout to avoid state update during render
            setTimeout(() => setScannerTableRowHeight(h), 0);
        }
    }, []);

    const virtualScanner = useMemo(() => {
        const total = tableRows.length;
        const rowH = Math.max(1, scannerTableRowHeight);
        const overscan = 10;
        if (total === 0) {
            return { start: 0, end: 0, topPad: 0, bottomPad: 0, rows: [] as typeof tableRows };
        }
        const rawStart = Math.max(0, Math.floor(scannerTableScrollTop / rowH) - overscan);
        const start = Math.min(total - 1, rawStart);
        const rawEnd = Math.ceil((scannerTableScrollTop + scannerTableViewportHeight) / rowH) + overscan;
        const end = Math.min(total, Math.max(start + 1, rawEnd));
        const topPad = start * rowH;
        const bottomPad = (total - end) * rowH;
        return { start, end, topPad, bottomPad, rows: tableRows.slice(start, end) };
    }, [tableRows, scannerTableScrollTop, scannerTableViewportHeight, scannerTableRowHeight]);

    const assetClassOptions = useMemo(() => {
        const set = new Set<string>();
        scannerRows.forEach((r) => {
            if (r && typeof r.assetClass === 'string') set.add(r.assetClass);
        });
        return Array.from(set.values()).sort();
    }, [scannerRows]);

    const microCandidateCounts = useMemo(() => {
        const candidates = scannerRows
            .filter(r => !r.mesoBlocked)
            .filter(r => Boolean(r.mesoDirection))
            .filter(r => r.levelSource === 'MICRO');

        const byAction = candidates.reduce(
            (acc, r) => {
                const a = r.microAction || 'WAIT';
                acc[a] = (acc[a] || 0) + 1;
                return acc;
            },
            {} as Record<'EXECUTE' | 'WAIT' | 'AVOID', number>
        );

        return {
            total: candidates.length,
            execute: byAction.EXECUTE || 0,
            wait: byAction.WAIT || 0,
            avoid: byAction.AVOID || 0,
        };
    }, [scannerRows]);

    const topGuaranteed = useMemo(() => {
        return visibleScannerRows
            .filter(r => r.microAction === 'EXECUTE')
            .filter(r => r.scenarioStatus === 'PRONTO')
            .filter(r => r.riskLabel === 'LOW')
            .sort((a, b) => (b.trustScore ?? 0) - (a.trustScore ?? 0))
            .slice(0, 3);
    }, [visibleScannerRows]);

    const veryReliable = useMemo(() => {
        const topSet = new Set(topGuaranteed.map(r => r.symbol));
        return visibleScannerRows
            .filter(r => !topSet.has(r.symbol))
            .sort((a, b) => (b.trustScore ?? 0) - (a.trustScore ?? 0))
            .slice(0, 10);
    }, [visibleScannerRows, topGuaranteed]);

    const selectedAssetData = selectedScannerAsset
        ? (scannerRows.find(a => a.symbol === selectedScannerAsset) || assets.find(a => a.symbol === selectedScannerAsset) || null)
        : null;

    const instrumentTypeLabel = (symbol: string) => {
        if (symbol.endsWith('-USD')) return 'CRYPTO';
        if (symbol.endsWith('=X')) return 'FX';
        if (symbol.endsWith('=F')) return 'FUT';
        if (symbol.startsWith('^')) return 'INDEX';
        return 'SPOT';
    };

    const fallbackInstrumentName = (symbol: string) => {
        const map: Record<string, string> = {
            'GC=F': 'Gold Futures',
            'SI=F': 'Silver Futures',
            'CL=F': 'Crude Oil Futures',
            'BZ=F': 'Brent Crude Futures',
            'NG=F': 'Natural Gas Futures',
            'RB=F': 'RBOB Gasoline Futures',
            'HG=F': 'Copper Futures',
            'ZC=F': 'Corn Futures',
            'ZW=F': 'Wheat Futures',
            'ZS=F': 'Soybean Futures',
        };
        return map[symbol] || '';
    };

    const fallbackInstrumentShortName = (symbol: string) => {
        const map: Record<string, string> = {
            'GC=F': 'Gold',
            'SI=F': 'Silver',
            'CL=F': 'Crude',
            'BZ=F': 'Brent',
            'NG=F': 'NatGas',
            'RB=F': 'Gasoline',
            'HG=F': 'Copper',
            'ZC=F': 'Corn',
            'ZW=F': 'Wheat',
            'ZS=F': 'Soybean',
        };
        return map[symbol] || '';
    };

    const shortInstrumentName = (symbol: string, name?: string) => {
        const fromMap = fallbackInstrumentShortName(symbol);
        if (fromMap) return fromMap;
        const raw = (name || fallbackInstrumentName(symbol) || '').trim();
        if (!raw) return '';
        const cleaned = raw
            .replace(/\bFutures?\b/gi, '')
            .replace(/\bIndex\b/gi, '')
            .replace(/\bETF\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
        const parts = cleaned.split(' ').filter(Boolean);
        if (parts.length <= 2) return cleaned;
        return parts.slice(0, 2).join(' ');
    };

    return (
        <div className="space-y-4 max-w-[1920px] mx-auto relative min-h-[800px]">

            {((!feedHealthy) || !tradeEnabled) && (
                <Card className="bg-yellow-950/20 border border-yellow-900/40">
                    <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="text-sm text-yellow-200">
                            <div className="font-bold text-yellow-300">Signals disabled (fail-closed)</div>
                            <div className="text-xs text-yellow-200/80 font-mono break-words">
                                degraded={String(feedDegraded)} fallback={String(feedFallback)} tradeEnabled={String(tradeEnabled)}{tradeDisabledReason ? ` reason=${tradeDisabledReason}` : ''}{feedFallbackTimestamp ? ` fallbackTimestamp=${feedFallbackTimestamp}` : ''}
                            </div>
                        </div>
                        {qualitySummary && (
                            <div className="text-[10px] font-mono text-gray-300 grid grid-cols-2 gap-x-4 gap-y-1">
                                <div>OK: <span className="text-green-400">{qualitySummary.OK ?? 0}</span></div>
                                <div>PARTIAL: <span className="text-yellow-400">{qualitySummary.PARTIAL ?? 0}</span></div>
                                <div>STALE: <span className="text-orange-400">{qualitySummary.STALE ?? 0}</span></div>
                                <div>SUSPECT: <span className="text-red-400">{qualitySummary.SUSPECT ?? 0}</span></div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {feedHealthy && tradeEnabledByClass && tradeDisabledReasonByClass && (
                <Card className="bg-gray-900 border border-gray-800">
                    <CardContent className="p-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Trade gates by asset class</div>
                            <div className="text-[10px] font-mono text-gray-400 break-words">
                                Disabled classes show reasons; enabled classes can emit signals.
                            </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                            {Object.entries(tradeEnabledByClass).map(([cls, enabled]) => (
                                <div key={cls} className={cn(
                                    "rounded border px-2 py-1",
                                    enabled ? "border-green-900/50 bg-green-950/20" : "border-yellow-900/50 bg-yellow-950/10"
                                )}>
                                    <div className="flex items-center justify-between">
                                        <div className="text-[10px] text-gray-500 uppercase font-bold">{cls}</div>
                                        <div className={cn(
                                            "text-[10px] font-mono font-bold",
                                            enabled ? "text-green-400" : "text-yellow-400"
                                        )}>{enabled ? 'ENABLED' : 'DISABLED'}</div>
                                    </div>
                                    {!enabled && tradeDisabledReasonByClass[cls] && (
                                        <div className="mt-1 text-[10px] font-mono text-gray-500 break-words">
                                            {tradeDisabledReasonByClass[cls]}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* 0. INSTITUTIONAL GATES (Binary Decision Framework) */}
            <InstitutionalGatesPanel regime={regime} mesoData={mesoData} microSetups={microSetups} />

            {/* 0.1. REGIME ENGINE (Institutional Framework) */}
            <RegimePanel regime={regime} loading={regimeLoading} />

            {/* 0.5. FOCUS 24H (Meso → Micro) */}
            <Focus24hPanel mesoData={mesoData} />

            {/* 0.6. MICRO PIPELINE OUTPUT (Setups prontos) */}
            <MicroSetupsPanel setups={microSetups} fullAnalyses={microAnalyses} onSelectAsset={setSelectedScannerAsset} />

            {/* 1. EXECUTION STATUS (Micro-Capital) */}
            <ExecutionStatusPanel />

            {/* 2. MARKET CONTEXT (Real Evidence) */}
            <MarketContextPanel macro={macro} assets={assets} />

            {/* 2.5. CURRENCY STRENGTH (Forex Analysis) */}
            <CurrencyStrengthPanel assets={assets} macro={macro} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-240px)] min-h-[500px]">

                {/* UNIFIED SCANNER - Full Width or with Detail Panel */}
                <div className={cn("flex flex-col gap-4 transition-all duration-300 min-h-0", selectedAssetData ? "lg:col-span-8" : "lg:col-span-12")}>
                    <Card className="flex-1 bg-gray-900 border-gray-800 overflow-hidden flex flex-col">
                        <CardHeader className="py-3 px-4 border-b border-gray-800 bg-gray-900 flex flex-col gap-3">
                            <div className="flex flex-row items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Search className="w-4 h-4 text-purple-500" />
                                    <CardTitle className="text-sm font-bold text-gray-200 uppercase tracking-wider">Live Opportunity Scanner</CardTitle>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={cycleRadarMode}
                                        className={cn(
                                            "h-7 text-[10px] font-bold border-gray-800",
                                            radarMode === 'CONSERVATIVE'
                                                ? "bg-green-950/10 text-green-300 hover:bg-green-900/20"
                                                : radarMode === 'BALANCED'
                                                    ? "bg-purple-950/10 text-purple-300 hover:bg-purple-900/20"
                                                    : "bg-amber-950/10 text-amber-300 hover:bg-amber-900/20"
                                        )}
                                    >
                                        MODE: {radarMode}
                                    </Button>
                                </div>
                                {/* STATUS INDICATORS */}
                                <div className="flex items-center gap-4 text-[10px] font-mono text-gray-500">
                                    <span className={cn("flex items-center gap-1.5", (loading || refreshing) ? "text-yellow-500" : "text-green-500")}>
                                        <div className={cn("w-2 h-2 rounded-full animate-pulse", (loading || refreshing) ? "bg-yellow-500" : "bg-green-500")} />
                                        {loading ? "INITIALIZING FEED..." : refreshing ? "UPDATING..." : (!feedHealthy) ? "FEED: FAIL-CLOSED" : "FEED: YAHOO (REAL)"}
                                    </span>
                                    <span>SCANNED: {stats.total}</span>
                                    <span>ACTIVE: {activeSignals.length}</span>
                                    <span data-testid="tracked-count">TRACKED: {trackingSummary?.activeCount ?? 0}</span>
                                    <span>EXP: {perfStats ? `${perfStats.expectancy.toFixed(2)}R` : 'N/A'}</span>
                                    <span>LATENCY: {stats.latency}ms</span>
                                    <span>UPDATED: {lastUpdated ? lastUpdated.toLocaleTimeString() : 'N/A'}</span>
                                    <Button variant="ghost" size="icon" className="h-4 w-4 text-gray-600 hover:text-white" onClick={fetchData}>
                                        <RefreshCw className={cn("w-3 h-3", (loading || refreshing) && "animate-spin")} />
                                    </Button>
                                </div>
                            </div>

                            {/* PORTFOLIO BUILDER TOOLBAR */}
                            <div className="flex items-center justify-between bg-gray-950/50 p-2 rounded-lg border border-gray-800/50">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="sm" onClick={autoBuildSafe} className="h-7 text-xs border-green-900/50 bg-green-950/10 text-green-400 hover:text-green-300 hover:bg-green-900/20">
                                            <Shield className="w-3 h-3 mr-1.5" /> Auto Safe
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={autoBuildHigh} className="h-7 text-xs border-purple-900/50 bg-purple-950/10 text-purple-400 hover:text-purple-300 hover:bg-purple-900/20">
                                            <Rocket className="w-3 h-3 mr-1.5" /> Auto High Pot
                                        </Button>
                                    </div>

                                    {/* CONFIG INPUTS */}
                                    <div className="flex items-center gap-2 px-3 border-l border-gray-800">
                                        <div className="flex flex-col">
                                            <label htmlFor="builder-capital" className="text-[9px] text-gray-500 font-bold uppercase">Capital</label>
                                            <input
                                                id="builder-capital"
                                                type="number"
                                                aria-label="Capital"
                                                placeholder="100000"
                                                className="w-20 bg-gray-900 border border-gray-800 text-xs text-white px-1 rounded focus:border-blue-500 outline-none"
                                                value={builderConfig.capital}
                                                onChange={(e) => setBuilderConfig({ ...builderConfig, capital: Number(e.target.value) })}
                                            />
                                        </div>
                                        <div className="flex flex-col">
                                            <label htmlFor="builder-leverage" className="text-[9px] text-gray-500 font-bold uppercase">Lev (x)</label>
                                            <input
                                                id="builder-leverage"
                                                type="number"
                                                aria-label="Leverage"
                                                placeholder="1"
                                                className="w-12 bg-gray-900 border border-gray-800 text-xs text-white px-1 rounded focus:border-blue-500 outline-none"
                                                value={builderConfig.leverage}
                                                onChange={(e) => setBuilderConfig({ ...builderConfig, leverage: Number(e.target.value) })}
                                            />
                                        </div>
                                        <div className="flex flex-col">
                                            <label htmlFor="builder-lots" className="text-[9px] text-gray-500 font-bold uppercase">Lots</label>
                                            <input
                                                id="builder-lots"
                                                type="number" step="0.1"
                                                aria-label="Lots"
                                                placeholder="1"
                                                className="w-12 bg-gray-900 border border-gray-800 text-xs text-white px-1 rounded focus:border-blue-500 outline-none"
                                                value={builderConfig.lots}
                                                onChange={(e) => setBuilderConfig({ ...builderConfig, lots: Number(e.target.value) })}
                                            />
                                        </div>
                                    </div>

                                    <span className="text-xs text-gray-600 px-1">|</span>
                                    <span className="text-xs text-gray-400">Selected: <span className="text-white font-bold">{selectedAssets.size}</span></span>

                                    <div className="flex items-center gap-2 px-3 border-l border-gray-800">
                                        <input
                                            value={filterText}
                                            onChange={(e) => setFilterText(e.target.value)}
                                            placeholder="Filter... (symbol, class, micro, meso, risk)"
                                            className="w-56 bg-gray-900 border border-gray-800 text-xs text-white px-2 py-1 rounded focus:border-purple-500 outline-none"
                                        />
                                        <select
                                            value={filterClass}
                                            onChange={(e) => setFilterClass(e.target.value)}
                                            aria-label="Filter asset class"
                                            title="Filter asset class"
                                            className="bg-gray-900 border border-gray-800 text-xs text-white px-2 py-1 rounded focus:border-purple-500 outline-none"
                                        >
                                            <option value="ALL">Class: All</option>
                                            {assetClassOptions.map((c) => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                        <select
                                            value={filterMicro}
                                            onChange={(e) => setFilterMicro(e.target.value as typeof filterMicro)}
                                            aria-label="Filter micro action"
                                            title="Filter micro action"
                                            className="bg-gray-900 border border-gray-800 text-xs text-white px-2 py-1 rounded focus:border-purple-500 outline-none"
                                        >
                                            <option value="ALL">Micro: All</option>
                                            <option value="EXECUTE">Micro: EXECUTE</option>
                                            <option value="WAIT">Micro: WAIT</option>
                                            <option value="AVOID">Micro: NO-TRADE</option>
                                        </select>
                                        <select
                                            value={filterScenario}
                                            onChange={(e) => setFilterScenario(e.target.value as typeof filterScenario)}
                                            aria-label="Filter scenario"
                                            title="Filter scenario"
                                            className="bg-gray-900 border border-gray-800 text-xs text-white px-2 py-1 rounded focus:border-purple-500 outline-none"
                                        >
                                            <option value="ALL">Scenario: All</option>
                                            <option value="PRONTO">Scenario: PRONTO</option>
                                            <option value="DESENVOLVENDO">Scenario: DESENVOLVENDO</option>
                                            <option value="CONTRA">Scenario: CONTRA</option>
                                        </select>
                                        <select
                                            value={filterRisk}
                                            onChange={(e) => setFilterRisk(e.target.value as typeof filterRisk)}
                                            aria-label="Filter risk"
                                            title="Filter risk"
                                            className="bg-gray-900 border border-gray-800 text-xs text-white px-2 py-1 rounded focus:border-purple-500 outline-none"
                                        >
                                            <option value="ALL">Risk: All</option>
                                            <option value="LOW">Risk: LOW</option>
                                            <option value="MED">Risk: MED</option>
                                            <option value="HIGH">Risk: HIGH</option>
                                        </select>
                                        <select
                                            value={sortBy}
                                            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                                            aria-label="Sort rows"
                                            title="Sort rows"
                                            className="bg-gray-900 border border-gray-800 text-xs text-white px-2 py-1 rounded focus:border-purple-500 outline-none"
                                        >
                                            <option value="trust">Sort: Final</option>
                                            <option value="score">Sort: Scan</option>
                                            <option value="rr">Sort: RR</option>
                                            <option value="vol">Sort: Vol</option>
                                            <option value="rsi">Sort: RSI</option>
                                            <option value="rvol">Sort: RVOL</option>
                                        </select>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-[10px] text-gray-400 hover:text-white"
                                            onClick={() => {
                                                setFilterText('');
                                                setFilterClass('ALL');
                                                setFilterMicro('ALL');
                                                setFilterScenario('ALL');
                                                setFilterRisk('ALL');
                                                setSortBy('trust');
                                            }}
                                        >
                                            Reset
                                        </Button>
                                    </div>
                                </div>

                                <Button
                                    size="sm"
                                    onClick={sendToIncubator}
                                    disabled={selectedAssets.size === 0}
                                    className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed px-4"
                                >
                                    <Briefcase className="w-3 h-3 mr-1.5" /> Send to Incubator
                                </Button>
                            </div>

                            <div className={cn("grid gap-2", radarMode === 'CONSERVATIVE' ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2")}> 
                                <div className="rounded-lg border border-green-900/30 bg-green-950/10 p-2">
                                    <div className="flex items-center justify-between">
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-green-300">Top Garantido (1–3)</div>
                                        <div className="text-[10px] font-mono text-gray-400">agora</div>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {topGuaranteed.length === 0 ? (
                                            <div className="text-[10px] font-mono text-gray-500">Sem picks LOW risk com EXECUTE+PRONTO.</div>
                                        ) : (
                                            topGuaranteed.map(r => (
                                                <button
                                                    key={r.symbol}
                                                    onClick={() => setSelectedScannerAsset(r.symbol)}
                                                    className="text-left rounded border border-green-900/40 bg-gray-950/40 px-2 py-1 hover:bg-gray-900/60 transition-colors"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-gray-100">{r.displaySymbol}</span>
                                                        {shortInstrumentName(r.symbol, r.name) ? (
                                                            <span className="text-[10px] text-gray-500">— {shortInstrumentName(r.symbol, r.name)}</span>
                                                        ) : null}
                                                        <span className="text-[9px] font-bold px-1 py-0.5 rounded border bg-gray-800/40 text-gray-300 border-gray-700/40" title={r.symbol}>
                                                            {instrumentTypeLabel(r.symbol)}
                                                        </span>
                                                        <span className="text-[9px] font-bold px-1 py-0.5 rounded border bg-gray-800/40 text-gray-300 border-gray-700/40 font-mono tabular-nums" title="Scan score">
                                                            S {r.score}
                                                        </span>
                                                        <span className={cn(
                                                            "text-[9px] font-bold px-1 py-0.5 rounded border",
                                                            r.signal === 'LONG'
                                                                ? "bg-green-500/10 text-green-300 border-green-500/20"
                                                                : "bg-red-500/10 text-red-300 border-red-500/20"
                                                        )}>{r.signal}</span>
                                                        <span className="text-[9px] font-bold px-1 py-0.5 rounded border bg-green-500/10 text-green-300 border-green-500/20">EXECUTE</span>
                                                        <span className="text-[9px] font-bold px-1 py-0.5 rounded border bg-green-500/10 text-green-300 border-green-500/20">PRONTO</span>
                                                        <span className="text-[9px] font-bold px-1 py-0.5 rounded border bg-gray-700/20 text-gray-300 border-gray-700/30">RR {r.rr}</span>
                                                        <span className="text-[9px] font-bold px-1 py-0.5 rounded border bg-green-500/10 text-green-300 border-green-500/20">LOW</span>
                                                    </div>
                                                    <div className="mt-0.5 text-[10px] font-mono text-gray-500 flex items-center gap-2">
                                                        <span>Final {r.trustScore ?? 'N/A'}</span>
                                                        <span className="text-gray-700">|</span>
                                                        <span className="text-gray-400">{r.symbol}</span>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {radarMode !== 'CONSERVATIVE' && (
                                <div className="rounded-lg border border-purple-900/30 bg-purple-950/10 p-2">
                                    <div className="flex items-center justify-between">
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-purple-300">Muito Confiáveis (5–10)</div>
                                        <div className="text-[10px] font-mono text-gray-400">lista</div>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {veryReliable.length === 0 ? (
                                            <div className="text-[10px] font-mono text-gray-500">Sem candidatos MICRO confiáveis no momento.</div>
                                        ) : (
                                            veryReliable.map(r => (
                                                <button
                                                    key={r.symbol}
                                                    onClick={() => setSelectedScannerAsset(r.symbol)}
                                                    className="text-left rounded border border-purple-900/40 bg-gray-950/40 px-2 py-1 hover:bg-gray-900/60 transition-colors"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-gray-100">{r.displaySymbol}</span>
                                                        {shortInstrumentName(r.symbol, r.name) ? (
                                                            <span className="text-[10px] text-gray-500">— {shortInstrumentName(r.symbol, r.name)}</span>
                                                        ) : null}
                                                        <span className="text-[9px] font-bold px-1 py-0.5 rounded border bg-gray-800/40 text-gray-300 border-gray-700/40" title={r.symbol}>
                                                            {instrumentTypeLabel(r.symbol)}
                                                        </span>
                                                        <span className="text-[9px] font-bold px-1 py-0.5 rounded border bg-gray-800/40 text-gray-300 border-gray-700/40 font-mono tabular-nums" title="Scan score">
                                                            S {r.score}
                                                        </span>
                                                        <span className={cn(
                                                            "text-[9px] font-bold px-1 py-0.5 rounded border",
                                                            r.signal === 'LONG'
                                                                ? "bg-green-500/10 text-green-300 border-green-500/20"
                                                                : "bg-red-500/10 text-red-300 border-red-500/20"
                                                        )}>{r.signal}</span>
                                                        {r.microAction ? (
                                                            <span className={cn(
                                                                "text-[9px] font-bold px-1 py-0.5 rounded border",
                                                                r.microAction === 'EXECUTE'
                                                                    ? "bg-green-500/10 text-green-300 border-green-500/20"
                                                                    : "bg-amber-500/10 text-amber-300 border-amber-500/20"
                                                            )}>{r.microAction}</span>
                                                        ) : null}
                                                        {r.scenarioStatus ? (
                                                            <span className={cn(
                                                                "text-[9px] font-bold px-1 py-0.5 rounded border",
                                                                r.scenarioStatus === 'PRONTO'
                                                                    ? "bg-green-500/10 text-green-300 border-green-500/20"
                                                                    : r.scenarioStatus === 'DESENVOLVENDO'
                                                                        ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                                                                        : "bg-red-500/10 text-red-300 border-red-500/20"
                                                            )}>{r.scenarioStatus}</span>
                                                        ) : null}
                                                        <span className="text-[9px] font-bold px-1 py-0.5 rounded border bg-gray-700/20 text-gray-300 border-gray-700/30">RR {r.rr}</span>
                                                        {r.riskLabel ? (
                                                            <span className={cn(
                                                                "text-[9px] font-bold px-1 py-0.5 rounded border",
                                                                r.riskLabel === 'LOW'
                                                                    ? "bg-green-500/10 text-green-300 border-green-500/20"
                                                                    : r.riskLabel === 'MED'
                                                                        ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                                                                        : "bg-red-500/10 text-red-300 border-red-500/20"
                                                            )}>{r.riskLabel}</span>
                                                        ) : null}
                                                    </div>
                                                    <div className="mt-0.5 text-[10px] font-mono text-gray-500 flex items-center gap-2">
                                                        <span>Final {r.trustScore ?? 'N/A'}</span>
                                                        <span className="text-gray-700">|</span>
                                                        <span className="text-gray-400">{r.symbol}</span>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                                )}
                            </div>
                        </CardHeader>

                        <CardContent ref={scannerTableScrollRef} onScroll={onScannerTableScroll} className="p-0 flex-1 min-h-0 overflow-auto bg-gray-900">
                            <Table className="min-w-[1180px]">
                                <TableHeader className="bg-gray-950 text-[11px] uppercase sticky top-0 z-10">
                                    <TableRow className="hover:bg-transparent border-gray-800">
                                        <TableHead className="h-9 w-8 text-center text-gray-600">#</TableHead>
                                        <TableHead className="h-9 text-gray-400 font-bold w-56">Asset</TableHead>
                                        <TableHead className="h-9 text-cyan-400 font-bold w-20">Price</TableHead>
                                        <TableHead className="h-9 text-blue-400 font-bold w-10 text-center">RSI</TableHead>
                                        <TableHead className="h-9 text-yellow-400 font-bold w-10 text-center">RV</TableHead>
                                        <TableHead className="h-9 text-gray-400 font-bold text-center w-16" title="Scan score: 80+ HIGH (verde), 50-80 MED (amarelo), <50 LOW (vermelho)">
                                            <div className="leading-none">Scan</div>
                                            <div className="text-[9px] text-gray-600 font-normal normal-case flex items-center justify-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-green-500" title="80+"></span>
                                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" title="50-80"></span>
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="<50"></span>
                                            </div>
                                        </TableHead>
                                        <TableHead className="h-9 text-gray-200 font-bold text-center w-16" title="Final score: 80+ ALTA confiança (verde), 65-80 MÉDIA (amarelo), <65 BAIXA (cinza)">
                                            <div className="leading-none">Final</div>
                                            <div className="text-[9px] text-gray-600 font-normal normal-case flex items-center justify-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-green-500" title="80+ Alta"></span>
                                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" title="65-80 Média"></span>
                                                <span className="w-1.5 h-1.5 rounded-full bg-gray-500" title="<65 Baixa"></span>
                                            </div>
                                        </TableHead>
                                        <TableHead className="h-9 text-gray-400 font-bold w-16">Trend</TableHead>
                                        <TableHead className="h-9 text-gray-400 font-bold w-14">Signal</TableHead>
                                        <TableHead className="h-9 text-cyan-500 font-bold w-10">TF</TableHead>
                                        <TableHead className="h-9 text-amber-500 font-bold w-10">Conf</TableHead>
                                        <TableHead className="h-9 text-gray-300 font-bold border-l border-gray-800 pl-3 w-16">Entry</TableHead>
                                        <TableHead className="h-9 text-green-600 font-bold w-16">Target</TableHead>
                                        <TableHead className="h-9 text-red-600 font-bold w-16">Stop</TableHead>
                                        <TableHead className="h-9 text-purple-400 font-bold w-10">R:R</TableHead>
                                        <TableHead className="h-9 text-gray-400 font-bold text-center w-10">Act</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody className="text-[13px] font-mono">
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={16} className="h-24 text-center text-gray-500">Connecting to global markets...</TableCell>
                                        </TableRow>
                                    ) : tableRows.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={16} className="h-24 text-center text-gray-500">
                                                <div>No rows match current filters.</div>
                                                {microCandidateCounts.total > 0 && (
                                                    <div className="mt-1 text-[11px] font-mono text-gray-600">
                                                        MICRO candidates: {microCandidateCounts.total} (EXECUTE {microCandidateCounts.execute}, WAIT {microCandidateCounts.wait}, AVOID {microCandidateCounts.avoid}).
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        <>
                                            {virtualScanner.topPad > 0 ? (
                                                <TableRow aria-hidden="true" className="border-0 hover:bg-transparent">
                                                    <TableCell colSpan={16} className="p-0" style={{ height: virtualScanner.topPad }} />
                                                </TableRow>
                                            ) : null}

                                            {virtualScanner.rows.map((row, i) => (
                                                <TableRow
                                                    ref={i === 0 ? measureScannerTableRow : undefined}
                                                    data-testid="market-watch-item"
                                                    key={row.symbol}
                                                    className={cn(
                                                        "border-gray-800 cursor-pointer transition-colors h-12 group",
                                                        selectedScannerAsset === row.symbol ? "bg-purple-900/40" : "hover:bg-gray-800/40"
                                                    )}
                                                    onClick={() => setSelectedScannerAsset(row.symbol)}
                                                >
                                                <TableCell className="text-center p-0" onClick={(e) => e.stopPropagation()}>
                                                    <div
                                                        onClick={(e) => toggleSelection(row.symbol, e)}
                                                        className={cn(
                                                            "w-4 h-4 mx-auto border rounded flex items-center justify-center transition-all cursor-pointer",
                                                            selectedAssets.has(row.symbol) ? "bg-blue-500 border-blue-500" : "border-gray-700 hover:border-gray-500"
                                                        )}
                                                    >
                                                        {selectedAssets.has(row.symbol) && <CheckCircle2 className="w-3 h-3 text-white" />}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-bold text-gray-200 group-hover:text-white transition-colors">
                                                    <div className="flex flex-col leading-tight">
                                                        <div className="flex items-center gap-1 flex-wrap">
                                                            <span>{row.displaySymbol}</span>
                                                            {shortInstrumentName(row.symbol, row.name) ? (
                                                                <span className="text-[10px] font-normal text-gray-500">— {shortInstrumentName(row.symbol, row.name)}</span>
                                                            ) : null}
                                                            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-gray-800/40 text-gray-300 border border-gray-700/40" title={row.symbol}>
                                                                {instrumentTypeLabel(row.symbol)}
                                                            </span>
                                                            <span className={cn(
                                                                "text-[9px] font-bold px-1 py-0.5 rounded border font-mono tabular-nums",
                                                                row.score >= 80 ? "bg-green-500/10 text-green-300 border-green-500/20" :
                                                                    row.score >= 55 ? "bg-amber-500/10 text-amber-300 border-amber-500/20" :
                                                                        "bg-gray-800/40 text-gray-300 border-gray-700/40"
                                                            )} title="Scan score">
                                                                S {row.score}
                                                            </span>
                                                            <span className={cn(
                                                                "text-[9px] font-bold px-1 py-0.5 rounded border font-mono tabular-nums",
                                                                (row.trustScore ?? 0) >= 80 ? "bg-green-500/10 text-green-300 border-green-500/20" :
                                                                    (row.trustScore ?? 0) >= 65 ? "bg-amber-500/10 text-amber-300 border-amber-500/20" :
                                                                        "bg-gray-800/40 text-gray-300 border-gray-700/40"
                                                            )} title="Final score">
                                                                F {row.trustScore ?? '-'}
                                                            </span>
                                                        {row.levelSource === 'MICRO' ? (
                                                            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/20">MICRO</span>
                                                        ) : (
                                                            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-gray-700/20 text-gray-500 border border-gray-700/30">SCAN</span>
                                                        )}
                                                        {row.mesoBlocked ? (
                                                            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20">BLOCK</span>
                                                        ) : row.mesoDirection ? (
                                                            <span className={cn(
                                                                "text-[9px] font-bold px-1 py-0.5 rounded border",
                                                                row.mesoDirection === 'LONG'
                                                                    ? "bg-green-500/10 text-green-300 border-green-500/20"
                                                                    : "bg-red-500/10 text-red-300 border-red-500/20"
                                                            )}>MESO {row.mesoDirection}</span>
                                                        ) : null}
                                                        {row.microAction ? (
                                                            <span className={cn(
                                                                "text-[9px] font-bold px-1 py-0.5 rounded border",
                                                                row.microAction === 'EXECUTE'
                                                                    ? "bg-green-500/10 text-green-300 border-green-500/20"
                                                                    : row.microAction === 'WAIT'
                                                                        ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                                                                        : "bg-gray-700/20 text-gray-400 border-gray-700/30"
                                                            )}>{row.microAction === 'AVOID' ? 'NO-TRADE' : row.microAction}</span>
                                                        ) : null}
                                                        {row.scenarioStatus ? (
                                                            <span className={cn(
                                                                "text-[9px] font-bold px-1 py-0.5 rounded border",
                                                                row.scenarioStatus === 'PRONTO'
                                                                    ? "bg-green-500/10 text-green-300 border-green-500/20"
                                                                    : row.scenarioStatus === 'DESENVOLVENDO'
                                                                        ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                                                                        : "bg-red-500/10 text-red-300 border-red-500/20"
                                                            )}>{row.scenarioStatus}</span>
                                                        ) : null}
                                                        {row.riskLabel ? (
                                                            <span className={cn(
                                                                "text-[9px] font-bold px-1 py-0.5 rounded border",
                                                                row.riskLabel === 'LOW'
                                                                    ? "bg-green-500/10 text-green-300 border-green-500/20"
                                                                    : row.riskLabel === 'MED'
                                                                        ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                                                                        : "bg-red-500/10 text-red-300 border-red-500/20"
                                                            )}>RISK {row.riskLabel}</span>
                                                        ) : null}
                                                        </div>
                                                        <div className="mt-0.5 text-[9px] text-gray-500 font-mono tabular-nums flex items-center gap-2">
                                                            <span className="text-gray-400">{row.symbol}</span>
                                                            <span className="text-gray-600">|</span>
                                                            <span className="uppercase">{row.assetClass || '—'}</span>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-cyan-300">{row.price.toFixed(row.price < 10 ? 4 : 2)}</span>
                                                        <div className="flex items-center gap-1">
                                                            <span className={cn("text-[9px] font-bold", row.changePercent >= 0 ? "text-green-500" : "text-red-500")}>
                                                                {row.changePercent >= 0 ? '▲' : '▼'} {Math.abs(row.changePercent).toFixed(2)}%
                                                            </span>
                                                            {/* Price vs Entry radar */}
                                                            {row.entry && (
                                                                <span className={cn("text-[8px] px-1 rounded", 
                                                                    Math.abs(row.price - parseFloat(row.entry)) / row.price < 0.005 ? "bg-green-500/30 text-green-400" :
                                                                    Math.abs(row.price - parseFloat(row.entry)) / row.price < 0.01 ? "bg-yellow-500/30 text-yellow-400" :
                                                                    "bg-gray-500/20 text-gray-500"
                                                                )}>
                                                                    {Math.abs(row.price - parseFloat(row.entry)) / row.price < 0.005 ? '● ZONE' :
                                                                     Math.abs(row.price - parseFloat(row.entry)) / row.price < 0.01 ? '○ NEAR' : ''}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                {/* RSI Indicator */}
                                                <TableCell className="text-center">
                                                    <span className={cn(
                                                        "px-1 py-0.5 rounded text-[9px] font-bold",
                                                        (row.rsi || 50) > 70 ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                                                        (row.rsi || 50) < 30 ? "bg-green-500/20 text-green-400 border border-green-500/30" :
                                                        "bg-gray-800/50 text-gray-500"
                                                    )}>
                                                        {Math.round(row.rsi || 50)}
                                                    </span>
                                                </TableCell>
                                                {/* Relative Volume */}
                                                <TableCell className="text-center">
                                                    <span className={cn(
                                                        "px-1 py-0.5 rounded text-[9px] font-bold",
                                                        (row.rvol || 1) > 2.0 ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" :
                                                        (row.rvol || 1) > 1.5 ? "bg-blue-500/20 text-blue-400" :
                                                        "bg-gray-800/50 text-gray-600"
                                                    )}>
                                                        {(row.rvol || 1).toFixed(1)}x
                                                    </span>
                                                </TableCell>
                                                {/* Score */}
                                                <TableCell className="text-center">
                                                    <span className={cn(
                                                        "px-1.5 py-0.5 rounded text-[10px] font-bold",
                                                        row.score > 80 ? "bg-green-500/20 text-green-400" :
                                                            row.score > 50 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"
                                                    )}>
                                                        {row.score}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <span className={cn(
                                                        "px-1.5 py-0.5 rounded text-[10px] font-bold border",
                                                        (row.trustScore ?? 0) > 80 ? "bg-green-500/15 text-green-300 border-green-500/20" :
                                                            (row.trustScore ?? 0) > 65 ? "bg-yellow-500/10 text-yellow-200 border-yellow-500/20" :
                                                                "bg-gray-800/40 text-gray-300 border-gray-700/40"
                                                    )}>
                                                        {row.trustScore ?? '-'}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <Sparkline
                                                        data={(Array.isArray(row.history) && row.history.length > 2) ? row.history.slice(-12) : [row.price, row.price]}
                                                        color={row.score > 50 ? "text-green-500" : "text-red-500"}
                                                        height="h-3"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <span className={cn("font-bold flex items-center gap-1", row.signal === 'LONG' ? "text-green-400" : "text-red-400")}>
                                                        {row.signal === 'LONG' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                        {row.signal}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-[10px] font-mono text-cyan-400">{row.timeframe || 'H1'}</span>
                                                </TableCell>
                                                <TableCell>
                                                    <span className={cn(
                                                        "px-1.5 py-0.5 rounded text-[10px] font-bold",
                                                        (row.confluenceCount || 0) >= 4 ? "bg-green-500/20 text-green-400" :
                                                        (row.confluenceCount || 0) >= 2 ? "bg-amber-500/20 text-amber-400" : "bg-gray-500/20 text-gray-400"
                                                    )}>
                                                        {row.confluenceCount || 0}
                                                    </span>
                                                </TableCell>

                                                <TableCell className="font-bold text-blue-300 border-l border-gray-800 pl-4">{row.entry}</TableCell>
                                                <TableCell className="font-bold text-green-400">{row.tp}</TableCell>
                                                <TableCell className="font-bold text-red-400">{row.sl}</TableCell>
                                                <TableCell className={cn(
                                                    "font-bold",
                                                    parseFloat(row.rr) >= 2.5 ? "text-green-400" :
                                                    parseFloat(row.rr) >= 2.0 ? "text-purple-400" :
                                                    parseFloat(row.rr) >= 1.5 ? "text-amber-400" : "text-red-400"
                                                )}>{row.rr}</TableCell>

                                                <TableCell className="text-right p-0 pr-2">
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-blue-500/20 hover:text-blue-400">
                                                        <Zap className="w-3 h-3" />
                                                    </Button>
                                                </TableCell>
                                                </TableRow>
                                            ))}

                                            {virtualScanner.bottomPad > 0 ? (
                                                <TableRow aria-hidden="true" className="border-0 hover:bg-transparent">
                                                    <TableCell colSpan={16} className="p-0" style={{ height: virtualScanner.bottomPad }} />
                                                </TableRow>
                                            ) : null}
                                        </>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                {/* DETAIL PANEL - Only shows when asset is selected */}
                {selectedAssetData && (
                    <div className="lg:col-span-4 flex flex-col gap-4 min-h-0">
                        <AssetDetailPanel
                            key={selectedAssetData.symbol}
                            asset={selectedAssetData}
                            onClose={() => setSelectedScannerAsset(null)}
                            onExecute={executeSignal}
                        />
                    </div>
                )}

            </div>
        </div>
    );
};
