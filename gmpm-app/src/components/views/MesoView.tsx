'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Layers, TrendingUp, BarChart3, PieChart,
    Droplets, AlertTriangle, CheckCircle2, XCircle, Target,
    Zap, Shield, DollarSign, Bitcoin, Gem, Building2, Fuel, Pill, Factory,
    ArrowUpRight, ArrowDownRight, ArrowRight, RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Types
interface ClassAnalysis {
    class: string;
    name: string;
    expectation: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'MIXED';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    direction: 'LONG' | 'SHORT' | 'AVOID';
    drivers: string[];
    liquidityScore: number;
    volatilityRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    topPicks: string[];
    avoidList: string[];
    performance: {
        avgChange: number;
        topPerformer: { symbol: string; change: number } | null;
        worstPerformer: { symbol: string; change: number } | null;
    };
}

interface SectorAnalysis {
    sector: string;
    parentClass: string;
    expectation: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    momentum: number;
    relativeStrength: number;
}

interface MesoTilt {
    rank: number;
    direction: 'LONG' | 'SHORT' | 'RELATIVE';
    asset: string;
    rationale: string;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface TemporalFocus {
    weeklyThesis: string;
    dailyFocus: string[];
    keyLevels: { asset: string; level: number; type: 'support' | 'resistance'; significance: string }[];
    catalysts: { event: string; timing: string; impact: string; affectedClasses: string[] }[];
    actionPlan: { timeframe: string; action: string; rationale: string }[];
}

interface ExecutiveSummary {
    marketBias: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
    regimeLabel: string;
    vix: number | null;
    yieldCurve: number | null;
    dollarIndex: number | null;
    fearGreed: number | null;
    classBreakdown: {
        bullish: string[];
        bearish: string[];
        neutral: string[];
    };
    oneLineSummary: string;
}

interface MesoData {
    success: boolean;
    timestamp: string;
    executiveSummary: ExecutiveSummary;
    regime: {
        type: string;
        confidence: string;
        drivers: string[];
        axes: Record<string, { direction: string; label: string }>;
    };
    temporalFocus: TemporalFocus;
    classes: ClassAnalysis[];
    sectors: SectorAnalysis[];
    summary: {
        topOpportunities: { class: string; picks: string[]; confidence: string; currentPerformance: number }[];
        riskWarnings: string[];
        tiltsActive: number;
        prohibitionsActive: number;
    };
    tilts: MesoTilt[];
    prohibitions: string[];
    macro: {
        vix?: number;
        treasury10y?: number;
        treasury2y?: number;
        yieldCurve?: number;
        dollarIndex?: number;
        fearGreed?: { value: number; classification: string; timestamp: string } | number | null;
    };
    microInputs?: {
        allowedInstruments: Array<{ symbol: string; direction: 'LONG' | 'SHORT'; class: string; reason: string; score: number }>;
        prohibitedInstruments: Array<{ symbol: string; reason: string }>;
        favoredDirection?: 'LONG' | 'SHORT' | 'NEUTRAL';
        volatilityContext?: 'HIGH' | 'NORMAL' | 'LOW';
    };
}

// Icons for asset classes
const classIcons: Record<string, React.ElementType> = {
    stocks: Building2,
    crypto: Bitcoin,
    forex: DollarSign,
    commodities: Gem,
    bonds: Shield,
};

// Colors for expectations
const expectationColors = {
    BULLISH: 'text-green-400 bg-green-500/20 border-green-500/30',
    BEARISH: 'text-red-400 bg-red-500/20 border-red-500/30',
    NEUTRAL: 'text-gray-400 bg-gray-500/20 border-gray-500/30',
    MIXED: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
};

const directionColors = {
    LONG: 'text-green-400',
    SHORT: 'text-red-400',
    AVOID: 'text-gray-500',
};

const directionLabel = (d: ClassAnalysis['direction']) => d === 'AVOID' ? 'NO-TRADE' : d;

const confidenceColors = {
    HIGH: 'text-green-400',
    MEDIUM: 'text-yellow-400',
    LOW: 'text-gray-500',
};

const volatilityColors = {
    LOW: 'text-green-400',
    MEDIUM: 'text-yellow-400',
    HIGH: 'text-red-400',
};

// Sector icons
const sectorIcons: Record<string, React.ElementType> = {
    'Technology': Zap,
    'Financials': Building2,
    'Energy': Fuel,
    'Healthcare': Pill,
    'Precious Metals': Gem,
    'Layer 1 Crypto': Bitcoin,
};

// Asset Class Card
const AssetClassCard = ({ data }: { data: ClassAnalysis }) => {
    const Icon = classIcons[data.class] || Layers;
    const DirectionIcon = data.direction === 'LONG' ? ArrowUpRight :
        data.direction === 'SHORT' ? ArrowDownRight : ArrowRight;

    return (
        <Card className={cn(
            "bg-gray-900/80 border transition-colors hover:bg-gray-900/90 hover:border-gray-700",
            expectationColors[data.expectation]
        )}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={cn("p-2 rounded-lg", expectationColors[data.expectation])}>
                            <Icon className="w-5 h-5" />
                        </div>
                        <div>
                            <CardTitle className="text-lg">{data.name}</CardTitle>
                            <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className={cn("text-[10px]", expectationColors[data.expectation])}>
                                    OUTLOOK {data.expectation}
                                </Badge>
                                <span className={cn("text-xs font-bold flex items-center gap-1", directionColors[data.direction])} title="Trade directive: what to do with this asset class">
                                    <DirectionIcon className="w-3 h-3" />
                                    DO {directionLabel(data.direction)}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] text-gray-500 uppercase">Confidence</div>
                        <div className={cn("text-sm font-bold", confidenceColors[data.confidence])}>
                            {data.confidence}
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {/* Liquidity Bar */}
                <div>
                    <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                        <span className="flex items-center gap-1">
                            <Droplets className="w-3 h-3" /> Liquidity Score
                        </span>
                        <span className="font-mono">{data.liquidityScore}/100</span>
                    </div>
                    <Progress
                        value={data.liquidityScore}
                        className="h-2 bg-gray-800"
                        indicatorClassName={cn(
                            data.liquidityScore > 70 ? "bg-green-500" :
                                data.liquidityScore > 40 ? "bg-yellow-500" : "bg-red-500"
                        )}
                    />
                </div>

                {/* Volatility Risk */}
                <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Volatility Risk</span>
                    <span className={cn("font-bold", volatilityColors[data.volatilityRisk])}>
                        {data.volatilityRisk}
                    </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px] border-t border-gray-800 pt-2">
                    <div className="text-center">
                        <div className="text-[10px] text-gray-500 uppercase">Avg Δ</div>
                        <div className={cn(
                            "font-mono font-bold tabular-nums",
                            data.performance.avgChange >= 0 ? "text-green-300" : "text-red-300"
                        )}>
                            {data.performance.avgChange >= 0 ? '+' : ''}{data.performance.avgChange.toFixed(2)}%
                        </div>
                    </div>
                    <div className="text-center">
                        <div className="text-[10px] text-gray-500 uppercase">Top</div>
                        <div className="font-mono text-gray-200 truncate">
                            {data.performance.topPerformer?.symbol || '—'}
                        </div>
                    </div>
                    <div className="text-center">
                        <div className="text-[10px] text-gray-500 uppercase">Worst</div>
                        <div className="font-mono text-gray-200 truncate">
                            {data.performance.worstPerformer?.symbol || '—'}
                        </div>
                    </div>
                </div>

                {/* Drivers */}
                <div className="border-t border-gray-800 pt-2">
                    <div className="text-[10px] text-gray-500 uppercase mb-1">Drivers</div>
                    <div className="flex flex-wrap gap-1">
                        {data.drivers.slice(0, 3).map((d, i) => (
                            <span key={i} className="text-[10px] bg-gray-800 px-2 py-0.5 rounded text-gray-300">
                                {d}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Top Picks & Avoid */}
                <div className="grid grid-cols-2 gap-2 border-t border-gray-800 pt-2">
                    <div>
                        <div className="text-[10px] text-green-500 uppercase mb-1 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Top Picks
                        </div>
                        {data.topPicks.length > 0 ? (
                            <div className="space-y-0.5">
                                {data.topPicks.map((p, i) => (
                                    <div key={i} className="text-xs font-mono text-gray-300">{p}</div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-xs text-gray-600">—</div>
                        )}
                    </div>
                    <div>
                        <div className="text-[10px] text-red-500 uppercase mb-1 flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> Avoid
                        </div>
                        {data.avoidList.length > 0 ? (
                            <div className="space-y-0.5">
                                {data.avoidList.map((a, i) => (
                                    <div key={i} className="text-xs font-mono text-gray-500">{a}</div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-xs text-gray-600">—</div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

// Sector Row
const SectorRow = ({ data }: { data: SectorAnalysis }) => {
    const Icon = sectorIcons[data.sector] || Factory;
    const momentumColor = data.momentum > 20 ? 'text-green-400' :
        data.momentum < -20 ? 'text-red-400' : 'text-gray-400';
    const rsColor = data.relativeStrength > 110 ? 'text-green-400' :
        data.relativeStrength < 90 ? 'text-red-400' : 'text-gray-400';

    return (
        <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border border-gray-800 hover:bg-gray-900/80 transition-colors">
            <div className="flex items-center gap-3">
                <Icon className={cn("w-5 h-5", momentumColor)} />
                <div>
                    <div className="text-sm font-bold text-gray-200">{data.sector}</div>
                    <div className="text-[10px] text-gray-500">{data.parentClass}</div>
                </div>
            </div>
            <div className="flex items-center gap-6">
                <div className="text-center">
                    <div className="text-[10px] text-gray-500 uppercase">Expectation</div>
                    <Badge variant="outline" className={cn("text-[10px]", expectationColors[data.expectation])}>
                        {data.expectation}
                    </Badge>
                </div>
                <div className="text-center min-w-[60px]">
                    <div className="text-[10px] text-gray-500 uppercase">Momentum</div>
                    <div className={cn("text-sm font-mono font-bold", momentumColor)}>
                        {data.momentum > 0 ? '+' : ''}{data.momentum}
                    </div>
                </div>
                <div className="text-center min-w-[60px]">
                    <div className="text-[10px] text-gray-500 uppercase">RS</div>
                    <div className={cn("text-sm font-mono font-bold", rsColor)}>
                        {data.relativeStrength}
                    </div>
                </div>
            </div>
        </div>
    );
};

const MicroUniversePanel = ({ data }: { data: MesoData }) => {
    const allowed = data.microInputs?.allowedInstruments || [];
    const prohibited = data.microInputs?.prohibitedInstruments || [];
    return (
        <Card className="bg-gray-900/80 border-gray-800">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-cyan-400">
                    <Zap className="w-5 h-5" /> MICRO Universe
                </CardTitle>
                <CardDescription>
                    Allowed instruments are the only symbols the MICRO layer will analyze.
                </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded border border-gray-800 bg-gray-950/30 p-3">
                    <div className="flex items-center justify-between">
                        <div className="text-[10px] uppercase font-bold text-gray-500">Allowed</div>
                        <div className="text-[10px] font-mono text-gray-400">{allowed.length}</div>
                    </div>
                    {allowed.length === 0 ? (
                        <div className="text-sm text-gray-500 mt-3">No allowed instruments.</div>
                    ) : (
                        <div className="mt-3 space-y-2">
                            {allowed.slice(0, 12).map((a) => (
                                <div key={a.symbol} className="flex items-start justify-between gap-3 rounded border border-gray-800 bg-gray-900/30 px-2 py-1.5">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-xs text-gray-200">{a.symbol}</span>
                                            <span className={cn(
                                                "text-[9px] font-bold px-1 py-0.5 rounded border",
                                                a.direction === 'LONG'
                                                    ? "bg-green-500/10 text-green-300 border-green-500/20"
                                                    : "bg-red-500/10 text-red-300 border-red-500/20"
                                            )}>
                                                {a.direction}
                                            </span>
                                            <span className="text-[9px] font-bold px-1 py-0.5 rounded border bg-cyan-500/10 text-cyan-300 border-cyan-500/20 font-mono tabular-nums">
                                                {Math.round(a.score)}
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-gray-500 truncate">{a.class}</div>
                                        <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{a.reason}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="rounded border border-gray-800 bg-gray-950/30 p-3">
                    <div className="flex items-center justify-between">
                        <div className="text-[10px] uppercase font-bold text-gray-500">Prohibited</div>
                        <div className="text-[10px] font-mono text-gray-400">{prohibited.length}</div>
                    </div>
                    {prohibited.length === 0 ? (
                        <div className="text-sm text-gray-500 mt-3">No prohibited instruments.</div>
                    ) : (
                        <div className="mt-3 space-y-2">
                            {prohibited.slice(0, 12).map((p) => (
                                <div key={p.symbol} className="rounded border border-gray-800 bg-gray-900/30 px-2 py-1.5">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-mono text-xs text-gray-300">{p.symbol}</span>
                                        <span className="text-[9px] font-bold px-1 py-0.5 rounded border bg-red-500/10 text-red-300 border-red-500/20">BLOCK</span>
                                    </div>
                                    <div className="text-[10px] text-gray-500 mt-1 line-clamp-2">{p.reason}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

// Liquidity Map
const LiquidityMap = ({ classes }: { classes: ClassAnalysis[] }) => {
    const sorted = [...classes].sort((a, b) => b.liquidityScore - a.liquidityScore);
    const maxScore = Math.max(...sorted.map(c => c.liquidityScore), 1);

    return (
        <Card className="bg-gray-900/80 border-gray-800">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-400">
                    <Droplets className="w-5 h-5" />
                    Liquidity Map by Asset Class
                </CardTitle>
                <CardDescription>Current liquidity conditions across markets</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {sorted.map(cls => {
                    const Icon = classIcons[cls.class] || Layers;
                    const width = (cls.liquidityScore / maxScore) * 100;

                    return (
                        <div key={cls.class} className="space-y-1">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Icon className="w-4 h-4 text-gray-400" />
                                    <span className="text-sm text-gray-300">{cls.name}</span>
                                </div>
                                <span className={cn(
                                    "text-xs font-mono font-bold",
                                    cls.liquidityScore > 70 ? "text-green-400" :
                                        cls.liquidityScore > 40 ? "text-yellow-400" : "text-red-400"
                                )}>
                                    {cls.liquidityScore}
                                </span>
                            </div>
                            <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                    className={cn(
                                        "h-full rounded-full transition-all",
                                        cls.liquidityScore > 70 ? "bg-gradient-to-r from-green-600 to-green-400" :
                                            cls.liquidityScore > 40 ? "bg-gradient-to-r from-yellow-600 to-yellow-400" :
                                                "bg-gradient-to-r from-red-600 to-red-400"
                                    )}
                                    style={{ width: `${width}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
};

// Tilts Panel
const TiltsPanel = ({ tilts, prohibitions }: { tilts: MesoTilt[]; prohibitions: string[] }) => {
    return (
        <Card className="bg-gray-900/80 border-gray-800">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-purple-400">
                    <Target className="w-5 h-5" />
                    Active Regime Tilts
                </CardTitle>
                <CardDescription>Current positioning recommendations from Regime Engine</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Tilts */}
                <div className="space-y-2">
                    {tilts.length === 0 ? (
                        <div className="text-center text-gray-500 py-4">No active tilts</div>
                    ) : (
                        tilts.slice(0, 6).map((tilt, i) => (
                            <div key={i} className="flex items-center justify-between p-2 bg-gray-800/50 rounded border border-gray-700">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono text-gray-500">#{tilt.rank}</span>
                                    <span className={cn(
                                        "text-xs font-bold px-2 py-0.5 rounded",
                                        tilt.direction === 'LONG' ? "bg-green-500/20 text-green-400" :
                                            tilt.direction === 'SHORT' ? "bg-red-500/20 text-red-400" :
                                                "bg-blue-500/20 text-blue-400"
                                    )}>
                                        {tilt.direction}
                                    </span>
                                    <span className="text-sm font-bold text-gray-200">{tilt.asset}</span>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] text-gray-500 max-w-[200px] truncate">{tilt.rationale}</div>
                                    <div className={cn("text-[10px] font-bold", confidenceColors[tilt.confidence])}>
                                        {tilt.confidence}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Prohibitions */}
                {prohibitions.length > 0 && (
                    <div className="border-t border-gray-800 pt-4">
                        <div className="text-[10px] uppercase text-red-500 font-bold mb-2 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Active Prohibitions
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {prohibitions.map((p, i) => (
                                <span key={i} className="text-xs bg-red-500/10 border border-red-500/30 text-red-400 px-2 py-1 rounded">
                                    {p}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

// Executive Summary Panel
const ExecutiveSummaryPanel = ({ data }: { data: MesoData }) => {
    const summary = data.executiveSummary;
    const temporal = data.temporalFocus;
    const biasColor = summary?.marketBias === 'RISK_ON' ? 'text-green-400 bg-green-500/20 border-green-500/30' :
        summary?.marketBias === 'RISK_OFF' ? 'text-red-400 bg-red-500/20 border-red-500/30' :
        'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';

    return (
        <Card className="bg-gradient-to-r from-purple-950/30 via-gray-900 to-gray-900 border-purple-500/30">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-purple-400">
                        <Target className="w-5 h-5" />
                        TESE DA SEMANA
                    </CardTitle>
                    <div className="flex items-center gap-3">
                        <Badge className={cn("text-sm px-3 py-1", biasColor)}>
                            {summary?.marketBias || 'NEUTRAL'}
                        </Badge>
                        <Badge variant="outline" className="text-purple-400 border-purple-500/50">
                            {summary?.regimeLabel || data.regime.type}
                        </Badge>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Weekly Thesis */}
                <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                    <p className="text-lg text-gray-200 leading-relaxed">
                        {temporal?.weeklyThesis || summary?.oneLineSummary || 'Análise em carregamento...'}
                    </p>
                </div>

                {/* Key Metrics Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-gray-800/30 rounded">
                        <div className="text-[10px] text-gray-500 uppercase">VIX</div>
                        <div className={cn("text-xl font-bold font-mono",
                            (data.macro?.vix || 0) > 25 ? "text-red-400" : (data.macro?.vix || 0) > 18 ? "text-yellow-400" : "text-green-400"
                        )}>
                            {data.macro?.vix?.toFixed(1) || '—'}
                        </div>
                    </div>
                    <div className="text-center p-3 bg-gray-800/30 rounded">
                        <div className="text-[10px] text-gray-500 uppercase">Yield Curve</div>
                        <div className={cn("text-xl font-bold font-mono",
                            (data.macro?.yieldCurve || 0) < 0 ? "text-red-400" : "text-green-400"
                        )}>
                            {data.macro?.yieldCurve?.toFixed(2) || '—'}%
                        </div>
                    </div>
                    <div className="text-center p-3 bg-gray-800/30 rounded">
                        <div className="text-[10px] text-gray-500 uppercase">Dollar Index</div>
                        <div className="text-xl font-bold font-mono text-blue-400">
                            {data.macro?.dollarIndex?.toFixed(1) || '—'}
                        </div>
                    </div>
                    <div className="text-center p-3 bg-gray-800/30 rounded">
                        <div className="text-[10px] text-gray-500 uppercase">Fear & Greed</div>
                        {(() => {
                            const fg = data.macro?.fearGreed;
                            const fgValue = typeof fg === 'object' && fg !== null ? fg.value : (typeof fg === 'number' ? fg : 50);
                            return (
                                <div className={cn("text-xl font-bold font-mono",
                                    fgValue > 60 ? "text-green-400" : fgValue < 40 ? "text-red-400" : "text-yellow-400"
                                )}>
                                    {fgValue || '—'}
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* Class Breakdown */}
                <div className="grid grid-cols-3 gap-4">
                    <div className="p-3 bg-green-500/10 rounded border border-green-500/20">
                        <div className="text-[10px] text-green-500 uppercase font-bold mb-2">BULLISH</div>
                        <div className="flex flex-wrap gap-1">
                            {summary?.classBreakdown?.bullish?.map((c, i) => (
                                <span key={i} className="text-xs bg-green-500/20 px-2 py-0.5 rounded text-green-300">{c}</span>
                            )) || <span className="text-xs text-gray-500">—</span>}
                        </div>
                    </div>
                    <div className="p-3 bg-red-500/10 rounded border border-red-500/20">
                        <div className="text-[10px] text-red-500 uppercase font-bold mb-2">BEARISH</div>
                        <div className="flex flex-wrap gap-1">
                            {summary?.classBreakdown?.bearish?.map((c, i) => (
                                <span key={i} className="text-xs bg-red-500/20 px-2 py-0.5 rounded text-red-300">{c}</span>
                            )) || <span className="text-xs text-gray-500">—</span>}
                        </div>
                    </div>
                    <div className="p-3 bg-gray-500/10 rounded border border-gray-500/20">
                        <div className="text-[10px] text-gray-500 uppercase font-bold mb-2">NEUTRO</div>
                        <div className="flex flex-wrap gap-1">
                            {summary?.classBreakdown?.neutral?.map((c, i) => (
                                <span key={i} className="text-xs bg-gray-500/20 px-2 py-0.5 rounded text-gray-300">{c}</span>
                            )) || <span className="text-xs text-gray-500">—</span>}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

// Daily Focus Panel
const DailyFocusPanel = ({ data }: { data: MesoData }) => {
    const temporal = data.temporalFocus;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Daily Focus */}
            <Card className="bg-gray-900/80 border-cyan-500/30">
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-cyan-400 text-base">
                        <Zap className="w-4 h-4" />
                        FOCO DO DIA
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-2">
                        {temporal?.dailyFocus?.map((focus, i) => (
                            <li key={i} className="flex items-start gap-2">
                                <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                                <span className="text-sm text-gray-300">{focus}</span>
                            </li>
                        )) || <li className="text-sm text-gray-500">Carregando...</li>}
                    </ul>
                </CardContent>
            </Card>

            {/* Action Plan */}
            <Card className="bg-gray-900/80 border-yellow-500/30">
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-yellow-400 text-base">
                        <Target className="w-4 h-4" />
                        PLANO DE AÇÃO
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {temporal?.actionPlan?.map((action, i) => (
                            <div key={i} className="p-2 bg-gray-800/50 rounded border-l-2 border-yellow-500">
                                <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="outline" className="text-[10px] text-yellow-400 border-yellow-500/50">
                                        {action.timeframe}
                                    </Badge>
                                </div>
                                <div className="text-sm font-medium text-gray-200">{action.action}</div>
                                <div className="text-[11px] text-gray-500 mt-1">{action.rationale}</div>
                            </div>
                        )) || <div className="text-sm text-gray-500">Carregando...</div>}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

// Regime Axes Display
const RegimeAxesPanel = ({ data }: { data: MesoData }) => {
    const axes = data.regime.axes;
    if (!axes) return null;

    const axisColor = (dir: string) => {
        if (dir.includes('↑↑')) return 'text-green-400 bg-green-500/20';
        if (dir.includes('↑')) return 'text-green-300 bg-green-500/10';
        if (dir.includes('↓↓')) return 'text-red-400 bg-red-500/20';
        if (dir.includes('↓')) return 'text-red-300 bg-red-500/10';
        return 'text-gray-400 bg-gray-500/10';
    };

    return (
        <div className="flex flex-wrap gap-2">
            {Object.entries(axes).map(([key, axis]) => (
                <div key={key} className={cn("px-3 py-1.5 rounded-lg flex items-center gap-2", axisColor(axis.direction))}>
                    <span className="text-[10px] uppercase font-bold opacity-70">{axis.label}</span>
                    <span className="text-lg font-bold">{axis.direction}</span>
                </div>
            ))}
        </div>
    );
};

// Main Component
export const MesoView = () => {
    const [data, setData] = useState<MesoData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch('/api/meso');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (json.success) {
                setData(json);
            } else {
                throw new Error(json.error || 'Unknown error');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to fetch');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, [fetchData]);

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center space-y-4">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-400 mx-auto" />
                    <div className="text-gray-400">Loading Meso Analysis...</div>
                </div>
            </div>
        );
    }

    if (error && !data) {
        return (
            <Card className="bg-red-950/20 border-red-900/40">
                <CardContent className="p-6 text-center">
                    <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                    <div className="text-red-400 font-bold">Failed to load Meso data</div>
                    <div className="text-sm text-gray-500 mt-1">{error}</div>
                    <button
                        onClick={fetchData}
                        className="mt-4 px-4 py-2 bg-red-500/20 border border-red-500/30 rounded text-red-400 hover:bg-red-500/30 transition-colors"
                    >
                        Retry
                    </button>
                </CardContent>
            </Card>
        );
    }

    if (!data) return null;

    // Summary stats
    const bullishClasses = data.classes.filter(c => c.expectation === 'BULLISH').length;
    const bearishClasses = data.classes.filter(c => c.expectation === 'BEARISH').length;
    const avgLiquidity = Math.round(data.classes.reduce((sum, c) => sum + c.liquidityScore, 0) / data.classes.length);

    return (
        <div className="space-y-6 max-w-[1700px] mx-auto pb-20">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                        <Layers className="w-8 h-8 text-purple-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-100 tracking-tight flex items-center gap-3">
                            MESO ANALYSIS
                        </h1>
                        <p className="text-xs text-gray-500">Foco semanal/diário por classe de ativos</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <RegimeAxesPanel data={data} />
                    <button
                        onClick={fetchData}
                        className="p-2 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
                        disabled={loading}
                        title="Refresh data"
                        aria-label="Refresh data"
                    >
                        <RefreshCw className={cn("w-4 h-4 text-gray-400", loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            <Card className="bg-gray-900/60 border-gray-800">
                <CardContent className="p-3 text-[11px] text-gray-400">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div className="font-mono text-gray-500">
                            OUTLOOK = cenário/viés do regime • DO = diretriz operacional
                        </div>NO-TRE
                        <div className="font-mono text-gray-500">
                            DO AVOID = não operar esta classe agora (MICRO tende a não focar nela)
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Executive Summary - Main Focus */}
            <ExecutiveSummaryPanel data={data} />

            {/* Daily Focus & Action Plan */}
            <DailyFocusPanel data={data} />

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Card className="bg-gray-900/80 border-gray-800">
                    <CardContent className="p-3 text-center">
                        <div className="text-[10px] text-gray-500 uppercase">Bullish</div>
                        <div className="text-xl font-bold text-green-400">{bullishClasses}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gray-900/80 border-gray-800">
                    <CardContent className="p-3 text-center">
                        <div className="text-[10px] text-gray-500 uppercase">Bearish</div>
                        <div className="text-xl font-bold text-red-400">{bearishClasses}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gray-900/80 border-gray-800">
                    <CardContent className="p-3 text-center">
                        <div className="text-[10px] text-gray-500 uppercase">Avg Liquidity</div>
                        <div className={cn(
                            "text-xl font-bold",
                            avgLiquidity > 60 ? "text-green-400" : avgLiquidity > 40 ? "text-yellow-400" : "text-red-400"
                        )}>{avgLiquidity}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gray-900/80 border-gray-800">
                    <CardContent className="p-3 text-center">
                        <div className="text-[10px] text-gray-500 uppercase">Tilts</div>
                        <div className="text-xl font-bold text-purple-400">{data.summary.tiltsActive}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gray-900/80 border-gray-800">
                    <CardContent className="p-3 text-center">
                        <div className="text-[10px] text-gray-500 uppercase">Proibições</div>
                        <div className="text-xl font-bold text-orange-400">{data.summary.prohibitionsActive}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="classes" className="space-y-6">
                <TabsList className="bg-gray-900 border border-gray-800">
                    <TabsTrigger value="classes" className="flex items-center gap-2">
                        <PieChart className="w-4 h-4" /> Asset Classes
                    </TabsTrigger>
                    <TabsTrigger value="sectors" className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4" /> Sectors
                    </TabsTrigger>
                    <TabsTrigger value="liquidity" className="flex items-center gap-2">
                        <Droplets className="w-4 h-4" /> Liquidity
                    </TabsTrigger>
                    <TabsTrigger value="tilts" className="flex items-center gap-2">
                        <Target className="w-4 h-4" /> Tilts
                    </TabsTrigger>
                    <TabsTrigger value="universe" className="flex items-center gap-2">
                        <Zap className="w-4 h-4" /> Micro Universe
                    </TabsTrigger>
                </TabsList>

                {/* Asset Classes Tab */}
                <TabsContent value="classes">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {data.classes.map(cls => (
                            <AssetClassCard key={cls.class} data={cls} />
                        ))}
                    </div>
                </TabsContent>

                {/* Sectors Tab */}
                <TabsContent value="sectors">
                    <Card className="bg-gray-900/80 border-gray-800">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-cyan-400">
                                <BarChart3 className="w-5 h-5" />
                                Sector Momentum & Relative Strength
                            </CardTitle>
                            <CardDescription>
                                Momentum: -100 to +100 | RS: Relative Strength vs Market (100 = neutral)
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {data.sectors
                                .sort((a, b) => b.momentum - a.momentum)
                                .map(sector => (
                                    <SectorRow key={sector.sector} data={sector} />
                                ))}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Liquidity Tab */}
                <TabsContent value="liquidity">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <LiquidityMap classes={data.classes} />

                        <Card className="bg-gray-900/80 border-gray-800">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-yellow-400">
                                    <AlertTriangle className="w-5 h-5" />
                                    Risk Warnings
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {data.summary.riskWarnings.length === 0 ? (
                                    <div className="text-center text-gray-500 py-8">
                                        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
                                        No active risk warnings
                                    </div>
                                ) : (
                                    data.summary.riskWarnings.map((warning, i) => (
                                        <div key={i} className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded">
                                            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                            <span className="text-sm text-red-300">{warning}</span>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Tilts Tab */}
                <TabsContent value="tilts">
                    <TiltsPanel tilts={data.tilts} prohibitions={data.prohibitions} />
                </TabsContent>

                <TabsContent value="universe">
                    <MicroUniversePanel data={data} />
                </TabsContent>
            </Tabs>

            {/* Top Opportunities Summary */}
            {data.summary.topOpportunities.length > 0 && (
                <Card className="bg-gradient-to-r from-green-950/20 to-gray-900 border-green-500/30">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-green-400">
                            <TrendingUp className="w-5 h-5" />
                            Top Opportunities
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {data.summary.topOpportunities.map((opp, i) => (
                                <div key={i} className="bg-gray-900/50 p-4 rounded border border-green-500/20">
                                    <div className="text-sm font-bold text-green-400">{opp.class}</div>
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {opp.picks.map((pick, j) => (
                                            <span key={j} className="text-xs font-mono bg-green-500/10 px-2 py-0.5 rounded text-green-300">
                                                {pick}
                                            </span>
                                        ))}
                                    </div>
                                    <div className={cn("text-[10px] mt-2", confidenceColors[opp.confidence as keyof typeof confidenceColors])}>
                                        {opp.confidence} confidence
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};
