'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Layers, TrendingUp, BarChart3, PieChart,
    Droplets, AlertTriangle, CheckCircle2, XCircle, Target,
    Zap, Shield, DollarSign, Bitcoin, Gem, Building2, Factory,
    Fuel, Pill, ArrowUpRight, ArrowDownRight, ArrowRight, RefreshCw
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

interface MesoData {
    success: boolean;
    timestamp: string;
    regime: {
        type: string;
        confidence: string;
        drivers: string[];
    };
    classes: ClassAnalysis[];
    sectors: SectorAnalysis[];
    summary: {
        topOpportunities: { class: string; picks: string[]; confidence: string }[];
        riskWarnings: string[];
        tiltsActive: number;
        prohibitionsActive: number;
    };
    tilts: MesoTilt[];
    prohibitions: string[];
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
            "bg-gray-900/80 border transition-all hover:scale-[1.02]",
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
                                    {data.expectation}
                                </Badge>
                                <span className={cn("text-xs font-bold flex items-center gap-1", directionColors[data.direction])}>
                                    <DirectionIcon className="w-3 h-3" />
                                    {data.direction}
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
            <div className="flex items-center justify-between border-b border-gray-800 pb-6">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                        <Layers className="w-8 h-8 text-purple-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-100 tracking-tight flex items-center gap-3">
                            MESO ANALYSIS
                            <Badge variant="outline" className="border-purple-500 text-purple-400 bg-purple-500/10 text-[10px] tracking-widest">
                                SECTOR & CLASS ROTATION
                            </Badge>
                        </h1>
                        <p className="text-sm text-gray-500">Asset class expectations, sector momentum, and liquidity conditions</p>
                    </div>
                </div>
                <div className="flex gap-4">
                    <div className="text-right">
                        <div className="text-[10px] text-gray-500 uppercase font-bold">Regime</div>
                        <div className="text-sm font-bold text-purple-400">{data.regime.type}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] text-gray-500 uppercase font-bold">Last Update</div>
                        <div className="text-xs text-gray-300 font-mono">
                            {new Date(data.timestamp).toLocaleTimeString()}
                        </div>
                    </div>
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

            {/* Summary Bar */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="bg-gray-900/80 border-gray-800">
                    <CardContent className="p-4 text-center">
                        <div className="text-[10px] text-gray-500 uppercase">Bullish Classes</div>
                        <div className="text-2xl font-bold text-green-400">{bullishClasses}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gray-900/80 border-gray-800">
                    <CardContent className="p-4 text-center">
                        <div className="text-[10px] text-gray-500 uppercase">Bearish Classes</div>
                        <div className="text-2xl font-bold text-red-400">{bearishClasses}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gray-900/80 border-gray-800">
                    <CardContent className="p-4 text-center">
                        <div className="text-[10px] text-gray-500 uppercase">Avg Liquidity</div>
                        <div className={cn(
                            "text-2xl font-bold",
                            avgLiquidity > 60 ? "text-green-400" : avgLiquidity > 40 ? "text-yellow-400" : "text-red-400"
                        )}>{avgLiquidity}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gray-900/80 border-gray-800">
                    <CardContent className="p-4 text-center">
                        <div className="text-[10px] text-gray-500 uppercase">Active Tilts</div>
                        <div className="text-2xl font-bold text-purple-400">{data.summary.tiltsActive}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gray-900/80 border-gray-800">
                    <CardContent className="p-4 text-center">
                        <div className="text-[10px] text-gray-500 uppercase">Prohibitions</div>
                        <div className="text-2xl font-bold text-orange-400">{data.summary.prohibitionsActive}</div>
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
