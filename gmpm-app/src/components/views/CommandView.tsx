'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
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
import { cn } from '@/lib/utils';
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

interface ScoredAsset extends RealAssetData {
    score: number;
    regime: string;
    signal: 'LONG' | 'SHORT' | 'WAIT';
    conf: string;
    entry: string;
    tp: string;
    sl: string;
    rr: string;
    timeframe: string;      // H4, H1, M15
    confluenceCount: number; // Number of confluences > 60
    rvol: number; // Relative Volume
    volatility: number; // Real volatility
    oneLiner: string;   // Generated thesis
    breakdown: {
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

// --- MICRO SETUPS PANEL (Pipeline Output) ---
const MicroSetupsPanel = ({ setups, onSelectAsset }: { 
    setups: {
        symbol: string;
        displaySymbol: string;
        action: 'EXECUTE' | 'WAIT' | 'AVOID';
        setup: {
            type: string;
            direction: 'LONG' | 'SHORT';
            entry: number;
            stopLoss: number;
            takeProfit1: number;
            riskReward: number;
            confidence: 'HIGH' | 'MEDIUM' | 'LOW';
            confluences: string[];
            thesis: string;
            technicalScore: number;
        } | null;
    }[];
    onSelectAsset: (symbol: string) => void;
}) => {
    const executeReady = setups.filter(s => s.action === 'EXECUTE' && s.setup);
    const waiting = setups.filter(s => s.action === 'WAIT' && s.setup);

    if (executeReady.length === 0 && waiting.length === 0) return null;

    return (
        <Card className="bg-gradient-to-r from-orange-950/30 to-gray-900 border-orange-500/30 mb-4">
            <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-orange-400">
                        <Zap className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">MICRO PIPELINE OUTPUT</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-green-400 font-bold">{executeReady.length} EXECUTE</span>
                        <span className="text-yellow-400">{waiting.length} WAIT</span>
                    </div>
                </div>

                {executeReady.length > 0 && (
                    <div className="space-y-2">
                        <div className="text-[10px] text-green-500 uppercase flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Ready to Execute (Full Pipeline ✓)
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {executeReady.slice(0, 6).map((s) => (
                                <div 
                                    key={s.symbol}
                                    onClick={() => onSelectAsset(s.displaySymbol)}
                                    className="bg-green-950/30 border border-green-500/30 rounded p-2 cursor-pointer hover:bg-green-950/50 transition-colors"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {s.setup?.direction === 'LONG' ? (
                                                <ArrowUp className="w-4 h-4 text-green-400" />
                                            ) : (
                                                <ArrowDown className="w-4 h-4 text-red-400" />
                                            )}
                                            <span className="font-bold text-gray-200">{s.displaySymbol}</span>
                                        </div>
                                        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded",
                                            s.setup?.confidence === 'HIGH' ? 'bg-green-500/20 text-green-400' :
                                            s.setup?.confidence === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400' :
                                            'bg-gray-500/20 text-gray-400'
                                        )}>
                                            {s.setup?.confidence}
                                        </span>
                                    </div>
                                    <div className="mt-1 text-[10px] text-gray-400">
                                        {s.setup?.type} | R:R {s.setup?.riskReward.toFixed(1)} | Score {s.setup?.technicalScore}
                                    </div>
                                    <div className="mt-1 text-[10px] text-gray-500 truncate">
                                        {s.setup?.confluences.slice(0, 2).join(' • ')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {waiting.length > 0 && executeReady.length > 0 && <div className="border-t border-gray-800 my-3" />}

                {waiting.length > 0 && (
                    <div className="space-y-2">
                        <div className="text-[10px] text-yellow-500 uppercase flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Waiting for Confirmation
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {waiting.slice(0, 8).map((s) => (
                                <span 
                                    key={s.symbol}
                                    onClick={() => onSelectAsset(s.displaySymbol)}
                                    className="text-[10px] bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 px-2 py-1 rounded cursor-pointer hover:bg-yellow-500/20"
                                >
                                    {s.displaySymbol} ({s.setup?.type})
                                </span>
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
    const now = new Date();
    const utcHour = now.getUTCHours();

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
    const isWeekendClose = now.getUTCDay() === 5 && utcHour >= 19;
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
                        <span className="text-[10px] font-mono text-gray-500">
                            {now.toUTCString().slice(17, 22)} UTC
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

    return (
        <Card data-testid="asset-detail-panel" className="h-full bg-gray-900 border-gray-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <CardHeader className="py-4 px-5 border-b border-gray-800 flex flex-row items-center justify-between bg-gray-900">
                <div className="flex items-center gap-3">
                    <span className={cn("text-2xl font-bold", asset.changePercent > 0 ? "text-green-400" : "text-red-400")}>
                        {asset.displaySymbol}
                    </span>
                    <span className="text-sm font-mono text-gray-400">{asset.price.toFixed(2)}</span>
                    <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded", asset.changePercent > 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400")}>
                        {asset.changePercent > 0 ? '+' : ''}{asset.changePercent.toFixed(2)}%
                    </span>
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
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-800/40 p-3 rounded-md border border-gray-700/50">
                        <div className="text-xs text-gray-500 uppercase font-bold mb-1">Score</div>
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
                    <div className="text-xs font-bold text-gray-300 uppercase tracking-wider">Why this score</div>
                    <div className="grid grid-cols-1 gap-2">
                        {Object.entries(asset.breakdown.components).map(([k, v]) => (
                            <div key={k} className="bg-gray-950/40 border border-gray-800 rounded p-2">
                                <div className="flex items-center justify-between">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold">{k}</div>
                                    <div className="text-[10px] font-mono text-gray-200">{v}</div>
                                </div>
                                <div className="text-[10px] font-mono text-gray-500 mt-1 break-words">{asset.breakdown.details[k]}</div>
                            </div>
                        ))}
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
    const [sortBy, setSortBy] = useState<'vol' | 'rsi' | 'rvol'>('vol');

    const fetchInFlightRef = useRef(false);

    // PORTFOLIO BUILDER STATE
    const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
    const [builderConfig, setBuilderConfig] = useState({ capital: 100000, leverage: 10, lots: 1.0 });

    // Real Data States
    const [assets, setAssets] = useState<ScoredAsset[]>([]);
    const [macro, setMacro] = useState<unknown>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
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
        setup: {
            type: string;
            direction: 'LONG' | 'SHORT';
            entry: number;
            stopLoss: number;
            takeProfit1: number;
            riskReward: number;
            confidence: 'HIGH' | 'MEDIUM' | 'LOW';
            confluences: string[];
            thesis: string;
            technicalScore: number;
        } | null;
    }[]>([]);

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
        const candidates = assets.filter(a => a.score > 60 && a.volatility < 0.015);
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
        // High Potential: Top 5 by Score
        const top5 = assets.slice(0, 5).map(a => a.symbol);
        setSelectedAssets(new Set(top5));
    };

    // SEND TO INCUBATOR
    const sendToIncubator = () => {
        if (selectedAssets.size === 0) return;

        const portfolioAssets = assets
            .filter(a => selectedAssets.has(a.symbol))
            .map(a => ({
                symbol: a.symbol,
                entryPrice: a.price,
                side: (a.signal === 'SHORT' ? 'SHORT' : 'LONG') as 'SHORT' | 'LONG', // Explicit cast for strict type safety
                lots: 1 // Default lot
            }));

        addPortfolio({
            id: crypto.randomUUID(),
            name: `Portfolio ${new Date().toLocaleTimeString()}`,
            createdAt: Date.now(),
            status: 'ACTIVE',
            config: { capital: builderConfig.capital, leverage: builderConfig.leverage, defaultLots: builderConfig.lots },
            assets: portfolioAssets
        });

        // Clear selection and notify (mock)
        setSelectedAssets(new Set());
        console.info('Portfolio sent to Incubator!'); // Replace with toast later
    };

    // FETCH REAL DATA
    const fetchData = useCallback(async () => {
        if (fetchInFlightRef.current) return;
        fetchInFlightRef.current = true;
        const start = performance.now();
        setRefreshing(true);
        try {
            const res = await fetch('/api/market', { cache: 'no-store' }); // Fetch ALL assets (278+)
            const data = await res.json();
            const latency = Math.round(performance.now() - start);

            if (data.success) {
                setFeedDegraded(Boolean(data.degraded));
                setFeedFallback(Boolean(data.fallback));
                setFeedFallbackTimestamp(typeof data.fallbackTimestamp === 'string' ? data.fallbackTimestamp : null);
                setQualitySummary((typeof data.qualitySummary === 'object' && data.qualitySummary !== null) ? (data.qualitySummary as Record<string, number>) : null);
                setTradeEnabled(typeof data.tradeEnabled === 'boolean' ? data.tradeEnabled : true);
                setTradeDisabledReason(typeof data.tradeDisabledReason === 'string' ? data.tradeDisabledReason : null);
                setTradeEnabledByClass((typeof data.tradeEnabledByClass === 'object' && data.tradeEnabledByClass !== null) ? (data.tradeEnabledByClass as Record<string, boolean>) : null);
                setTradeDisabledReasonByClass((typeof data.tradeDisabledReasonByClass === 'object' && data.tradeDisabledReasonByClass !== null) ? (data.tradeDisabledReasonByClass as Record<string, string | null>) : null);
                setMacro(data.macro);

                try {
                    const priceMap: Record<string, number> = {};
                    (data.data as RealAssetData[]).forEach((a) => {
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

                // --- PROFESSIONAL SCORING ENGINE ---
                const scored: ScoredAsset[] = data.data.map((asset: RealAssetData) => {
                    const confluence = computeConfluenceScore(asset);
                    const score = confluence.score;
                    const signal = confluence.direction;
                    const volatility = confluence.volatility;
                    const rvol = confluence.rvol;
                    const oneLiner = confluence.oneLiner;

                    // Professional Execution Levels (Dynamic R:R based on volatility)
                    const dailyRange = (asset.high && asset.low) ? (asset.high - asset.low) : (asset.price * 0.015);
                    const entry = asset.price;
                    
                    // Dynamic SL/TP based on asset class volatility
                    const volMultiplier = asset.assetClass === 'crypto' ? 1.5 : 
                        asset.assetClass === 'commodity' ? 1.2 : 1.0;
                    const atr = dailyRange * volMultiplier;
                    
                    // SL: Tighter for high-score setups, wider for lower scores
                    const slMultiplier = score > 70 ? 0.8 : score > 55 ? 1.0 : 1.2;
                    const sl = signal === 'LONG' ? entry - (atr * slMultiplier) : entry + (atr * slMultiplier);
                    
                    // TP: Dynamic based on trend strength and volatility
                    const tpMultiplier = score > 70 ? 2.5 : score > 55 ? 2.0 : 1.5;
                    const tp = signal === 'LONG' ? entry + (atr * tpMultiplier) : entry - (atr * tpMultiplier);
                    
                    // Calculate actual R:R
                    const risk = Math.abs(entry - sl);
                    const reward = Math.abs(tp - entry);
                    const rrValue = risk > 0 ? (reward / risk) : 0;
                    
                    // Determine timeframe based on volatility
                    const timeframe = dailyRange / entry > 0.03 ? 'H4' : 
                        dailyRange / entry > 0.015 ? 'H1' : 'M15';
                    
                    // Count confluences
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

                // Filter out non-tradable or flat assets for the scanner
                const validAssets = scored.filter(a => a.price > 0).sort((a, b) => b.score - a.score);

                // DEDUPLICATE: Ensure no symbols are repeated (fix for key collisions)
                const uniqueAssets = Array.from(new Map(validAssets.map(item => [item.symbol, item])).values());

                setAssets(uniqueAssets);
                setStats({ total: data.count, latency });
                setLastUpdated(new Date());
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

        const entry = asset.price;
        const dailyRange = (asset.high && asset.low) ? (asset.high - asset.low) : (asset.price * 0.015);
        const sl = asset.signal === 'LONG' ? entry - dailyRange : entry + dailyRange;

        const tp1 = asset.signal === 'LONG' ? entry + (dailyRange * 2) : entry - (dailyRange * 2);
        const tp2 = asset.signal === 'LONG' ? entry + (dailyRange * 3.5) : entry - (dailyRange * 3.5);
        const tp3 = asset.signal === 'LONG' ? entry + (dailyRange * 5) : entry - (dailyRange * 5);

        // EVALUATE GATES (Institutional Framework)
        let gatesResult: GateSummary | null = null;
        let gatesSummary: GateResultSummary[] = [];
        let gatesAllPass = true;

        if (regime) {
            const tradeContext: TradeContext = {
                symbol: asset.symbol,
                direction: asset.signal,
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

        const id = crypto.randomUUID();

        const confN = Number(String(asset.conf).replace('%', ''));
        const confidence = Number.isFinite(confN)
            ? (confN >= 80 ? 'INSTITUTIONAL' : confN >= 65 ? 'STRONG' : 'MODERATE')
            : 'MODERATE';

        trackSignal({
            id,
            asset: asset.displaySymbol,
            assetClass: asset.assetClass,
            direction: asset.signal,
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
            direction: asset.signal,
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
    }, [feedDegraded, feedFallback, tradeEnabledByClass, tradeEnabled, regime]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 15000); // Poll every 15s for real-time
        return () => clearInterval(interval);
    }, [fetchData]);

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
                
                // Process MICRO setups
                if (alive && microDataRes.success && Array.isArray(microDataRes.analyses)) {
                    const setups = microDataRes.analyses.map((a: { symbol: string; displaySymbol: string; recommendation: { action: string; bestSetup: unknown }; setups: unknown[] }) => ({
                        symbol: a.symbol,
                        displaySymbol: a.displaySymbol,
                        action: a.recommendation.action as 'EXECUTE' | 'WAIT' | 'AVOID',
                        setup: a.recommendation.bestSetup || (a.setups.length > 0 ? a.setups[0] : null),
                    }));
                    setMicroSetups(setups);
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

    const activeSignals = feedHealthy
        ? assets.filter(a => a.signal !== 'WAIT' && classGate(a.assetClass))
        : [];
    const scannerList = activeSignals.slice(0, 200); // Show up to 200 active signals
    const marketWatchList = assets; // Show all in sidebar (filtered)

    const selectedAssetData = selectedScannerAsset ? assets.find(a => a.symbol === selectedScannerAsset) : null;

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
            <MicroSetupsPanel setups={microSetups} onSelectAsset={setSelectedScannerAsset} />

            {/* 1. EXECUTION STATUS (Micro-Capital) */}
            <ExecutionStatusPanel />

            {/* 2. MARKET CONTEXT (Real Evidence) */}
            <MarketContextPanel macro={macro} assets={assets} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-280px)] min-h-[500px]">

                {/* ZONE A: MAIN SCANNER (8 cols) */}
                <div className="lg:col-span-8 flex flex-col gap-4">
                    <Card className="flex-1 bg-gray-900 border-gray-800 overflow-hidden flex flex-col">
                        <CardHeader className="py-3 px-4 border-b border-gray-800 bg-gray-900 flex flex-col gap-3">
                            <div className="flex flex-row items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Search className="w-4 h-4 text-purple-500" />
                                    <CardTitle className="text-sm font-bold text-gray-200 uppercase tracking-wider">Live Opportunity Scanner</CardTitle>
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
                        </CardHeader>

                        <CardContent className="p-0 overflow-y-auto bg-gray-900">
                            <Table>
                                <TableHeader className="bg-gray-950 text-[10px] uppercase sticky top-0 z-10">
                                    <TableRow className="hover:bg-transparent border-gray-800">
                                        <TableHead className="h-9 w-10 text-center text-gray-600">#</TableHead>
                                        <TableHead className="h-9 text-gray-400 font-bold w-16">Asset</TableHead>
                                        <TableHead className="h-9 text-gray-500 font-bold w-40 hidden md:table-cell">Name</TableHead>
                                        <TableHead className="h-9 text-gray-500 font-bold w-20 hidden md:table-cell">Type</TableHead>
                                        <TableHead className="h-9 text-gray-500 font-bold w-20 hidden md:table-cell">Sector</TableHead>
                                        <TableHead className="h-9 text-gray-400 font-bold text-center">Score</TableHead>
                                        <TableHead className="h-9 text-gray-400 font-bold">Trend</TableHead>
                                        <TableHead className="h-9 text-gray-400 font-bold">Signal</TableHead>
                                        <TableHead className="h-9 text-cyan-500 font-bold">TF</TableHead>
                                        <TableHead className="h-9 text-amber-500 font-bold">Conf</TableHead>

                                        <TableHead className="h-9 text-gray-300 font-bold border-l border-gray-800 pl-4">Entry</TableHead>
                                        <TableHead className="h-9 text-green-600 font-bold">Target</TableHead>
                                        <TableHead className="h-9 text-red-600 font-bold">Stop</TableHead>
                                        <TableHead className="h-9 text-purple-400 font-bold">R:R</TableHead>

                                        <TableHead className="h-9 text-gray-400 font-bold text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody className="text-xs font-mono">
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={10} className="h-24 text-center text-gray-500">Connecting to global markets...</TableCell>
                                        </TableRow>
                                    ) : scannerList.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={10} className="h-24 text-center text-gray-500">No high-confidence signals found based on current scoring.</TableCell>
                                        </TableRow>
                                    ) : (
                                        scannerList.map((row) => (
                                            <TableRow
                                                key={row.symbol}
                                                className={cn(
                                                    "border-gray-800 cursor-pointer transition-colors h-10 group",
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
                                                    <div>
                                                        {row.displaySymbol}
                                                        <div className="text-[9px] text-gray-600 font-normal md:hidden">{row.name?.substring(0, 10)}</div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-xs text-gray-500 hidden md:table-cell truncate max-w-[200px]" title={row.name}>{row.name}</TableCell>
                                                <TableCell className="text-xs text-gray-500 hidden md:table-cell uppercase">{row.assetClass}</TableCell>
                                                <TableCell className="text-xs text-gray-500 hidden md:table-cell uppercase">{row.sector}</TableCell>

                                                <TableCell className="text-center">
                                                    <span className={cn(
                                                        "px-1.5 py-0.5 rounded text-[10px] font-bold",
                                                        row.score > 80 ? "bg-green-500/20 text-green-400" :
                                                            row.score > 50 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"
                                                    )}>
                                                        {row.score}
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
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                {/* ZONE B: SIDEBAR (Market Watch - Real) */}
                <div className="lg:col-span-4 flex flex-col gap-4">
                    {selectedAssetData ? (
                        <AssetDetailPanel
                            key={selectedAssetData.symbol}
                            asset={selectedAssetData}
                            onClose={() => setSelectedScannerAsset(null)}
                            onExecute={executeSignal}
                        />
                    ) : (
                        <Card className="h-full bg-gray-900 border-gray-800 flex flex-col">
                            <CardHeader className="py-3 px-4 border-b border-gray-800 space-y-3">
                                <div className="flex justify-between items-center">
                                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Market Watch</div>
                                    <div className="text-[10px] font-mono text-gray-600">Updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : 'N/A'}</div>
                                    {/* Sort Controls */}
                                    <div className="flex gap-1 bg-gray-950 p-0.5 rounded border border-gray-800">
                                        <button onClick={() => setSortBy('vol')} className={cn("px-2 py-0.5 text-[9px] rounded font-bold uppercase transition-colors", sortBy === 'vol' ? "bg-gray-800 text-purple-400" : "text-gray-600 hover:text-gray-400")}>Vol</button>
                                        <button onClick={() => setSortBy('rsi')} className={cn("px-2 py-0.5 text-[9px] rounded font-bold uppercase transition-colors", sortBy === 'rsi' ? "bg-gray-800 text-blue-400" : "text-gray-600 hover:text-gray-400")}>RSI</button>
                                        <button onClick={() => setSortBy('rvol')} className={cn("px-2 py-0.5 text-[9px] rounded font-bold uppercase transition-colors", sortBy === 'rvol' ? "bg-gray-800 text-yellow-400" : "text-gray-600 hover:text-gray-400")}>RV</button>
                                    </div>
                                </div>
                                {/* FILTER INPUT */}
                                <div className="relative">
                                    <Search className="absolute left-2 top-2.5 w-3 h-3 text-gray-500" />
                                    <input
                                        className="w-full bg-gray-950 border border-gray-800 rounded text-xs py-2 pl-8 text-gray-300 focus:outline-none focus:border-purple-500 placeholder:text-gray-700 transition-colors"
                                        placeholder="Filter real assets..."
                                        value={filterText}
                                        onChange={(e) => setFilterText(e.target.value)}
                                    />
                                </div>
                            </CardHeader>
                            <CardContent className="p-0 overflow-y-auto flex-1 custom-scrollbar bg-gray-900">
                                {/* Functional List Rendering with REAL DATA */}
                                {loading && assets.length === 0 ? (
                                    <div className="p-8 text-center text-gray-500 text-xs">Loading Live Data...</div>
                                ) : (
                                    marketWatchList
                                        .filter(item => item.displaySymbol.toLowerCase().includes(filterText.toLowerCase()) || item.symbol.toLowerCase().includes(filterText.toLowerCase()))
                                        .sort((a, b) => {
                                            if (sortBy === 'vol') return Math.abs(b.changePercent) - Math.abs(a.changePercent);
                                            if (sortBy === 'rsi') return (b.rsi || 50) - (a.rsi || 50);
                                            if (sortBy === 'rvol') return b.rvol - a.rvol;
                                            return 0;
                                        })
                                        .map((item) => (
                                            <div key={item.symbol}
                                                data-testid="market-watch-item"
                                                className={cn("flex justify-between items-center px-4 py-3 border-b border-gray-800/50 cursor-pointer group transition-colors", selectedScannerAsset === item.symbol ? "bg-gray-800" : "hover:bg-gray-800/30")}
                                                onClick={() => setSelectedScannerAsset(item.symbol)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {/* Name & Sparkline */}
                                                    <div className="flex flex-col w-[70px]">
                                                        <span className="text-sm font-bold text-gray-200 group-hover:text-white leading-none">{item.displaySymbol}</span>
                                                        <Sparkline
                                                            data={(Array.isArray(item.history) && item.history.length > 2) ? item.history.slice(-12) : [item.price, item.price]}
                                                            color={item.changePercent < 0 ? "text-red-500" : "text-green-500"}
                                                            height="h-3"
                                                        />
                                                    </div>

                                                    {/* Advanced Indicators (RSI / RVol) */}
                                                    <div className="flex gap-2">
                                                        <div className={cn(
                                                            "px-1.5 py-0.5 rounded text-[9px] font-mono font-bold w-9 text-center",
                                                            (item.rsi || 50) > 70 ? "bg-red-500/20 text-red-500 border border-red-500/30" :
                                                                (item.rsi || 50) < 30 ? "bg-green-500/20 text-green-500 border border-green-500/30" : "bg-gray-800 text-gray-500"
                                                        )}>
                                                            RSI:{Math.round(item.rsi || 50)}
                                                        </div>
                                                        <div className={cn(
                                                            "px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-center",
                                                            "bg-gray-800 text-gray-500"
                                                        )}>
                                                            AGE:{formatQuoteAge(item.quoteTimestamp)}
                                                        </div>
                                                        <div className={cn(
                                                            "px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-center",
                                                            item.quality?.status === 'OK' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                                                item.quality?.status === 'PARTIAL' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                                                                    item.quality?.status === 'STALE' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                                                                        item.quality?.status === 'SUSPECT' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                                                                            'bg-gray-800 text-gray-500'
                                                        )}>
                                                            Q:{item.quality?.status ?? 'N/A'}
                                                        </div>
                                                        <div className={cn(
                                                            "px-1.5 py-0.5 rounded text-[9px] font-mono font-bold w-9 text-center",
                                                            item.rvol > 2.0 ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/30" : "bg-gray-800 text-gray-600"
                                                        )}>
                                                            RV:{item.rvol.toFixed(1)}x
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="text-right w-[80px]">
                                                    <span className="block text-xs font-mono font-bold text-gray-300">
                                                        {item.price < 1 ? item.price.toFixed(4) : item.price.toLocaleString()}
                                                    </span>
                                                    <span className={cn(
                                                        "block text-[10px] font-mono font-bold mt-0.5",
                                                        item.changePercent < 0 ? "text-red-400" : "text-green-400"
                                                    )}>
                                                        {item.changePercent > 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>

            </div>
        </div>
    );
};
