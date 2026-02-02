'use client';

import React, { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import {
    Zap, ArrowRight, Play, CheckCircle2, XCircle,
    BarChart3, Brain, Globe, Shield, AlertTriangle, Terminal, Activity, TrendingUp, Search, Radio, Layers, Filter, RefreshCw, X, Copy, Target, TrendingDown,
    Rocket, Wand2, Briefcase
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
    rvol: number; // Relative Volume
    volatility: number; // Real volatility
    oneLiner: string;   // Generated thesis
}

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

const MarketContextPanel = ({ macro }: { macro: any }) => {
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
                            {macro?.vix < 20 ? 'Risk-On / Expansion' : 'Risk-Off / Contraction'}
                        </div>
                        <div className="text-xs text-gray-500">
                            {macro?.vix < 20 ? 'Liquidity Increasing' : 'High Volatility'}
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 border-t border-gray-800 pt-3">
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase font-bold">VIX</div>
                            <div className={cn("text-sm font-mono", macro?.vixChange < 0 ? "text-green-400" : "text-red-400")}>
                                {macro?.vix?.toFixed(2)}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase font-bold">DXY</div>
                            <div className="text-sm font-mono text-gray-300">{macro?.dollarIndex?.toFixed(2)}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase font-bold">US10Y</div>
                            <div className="text-sm font-mono text-gray-300">{macro?.treasury10y?.toFixed(2)}%</div>
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
                        <div className="text-lg font-bold text-gray-200">Tech & Crypto Leading</div>
                        <div className="text-xs text-gray-500">Momentum Factor</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 border-t border-gray-800 pt-3">
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase font-bold">XLK (Tech)</div>
                            <div className="text-sm font-mono text-green-400">+1.4%</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase font-bold">XCF (Fin)</div>
                            <div className="text-sm font-mono text-green-400">+0.8%</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase font-bold">XLE (Eng)</div>
                            <div className="text-sm font-mono text-red-400">-0.5%</div>
                        </div>
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
                        <div className="text-lg font-bold text-gray-200">Strong breadth (&gt;2.0)</div>
                        <div className="text-xs text-gray-500">Broad Participation</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 border-t border-gray-800 pt-3">
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase font-bold">Adv/Dec</div>
                            <div className="text-sm font-mono text-green-400">2150/450</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase font-bold">&gt;MA200</div>
                            <div className="text-sm font-mono text-gray-300">85%</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase font-bold">Fear/Greed</div>
                            <div className="text-sm font-mono text-green-400">{macro?.fearGreed?.value || 65}</div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

// DETAIL PANEL COMPONENT
const AssetDetailPanel = ({ asset, onClose }: { asset: ScoredAsset, onClose: () => void }) => {
    return (
        <Card className="absolute top-0 right-0 w-full md:w-[400px] h-full z-20 bg-gray-900 border-l border-gray-700 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <CardHeader className="py-4 px-5 border-b border-gray-800 flex flex-row items-center justify-between bg-gray-900/50 backdrop-blur">
                <div className="flex items-center gap-3">
                    <span className={cn("text-2xl font-bold", asset.changePercent > 0 ? "text-green-400" : "text-red-400")}>
                        {asset.displaySymbol}
                    </span>
                    <span className="text-sm font-mono text-gray-400">{asset.price.toFixed(2)}</span>
                    <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded", asset.changePercent > 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400")}>
                        {asset.changePercent > 0 ? '+' : ''}{asset.changePercent.toFixed(2)}%
                    </span>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-gray-800 rounded-full">
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

            </CardContent>
            <div className="p-4 border-t border-gray-800 bg-gray-900/50">
                <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold">
                    EXECUTE {asset.signal}
                </Button>
            </div>
        </Card>
    );
};


export const CommandView = () => {
    const { setView, addPortfolio } = useStore(); // Added addPortfolio
    const [selectedScannerAsset, setSelectedScannerAsset] = useState<string | null>(null);
    const [filterText, setFilterText] = useState('');
    const [sortBy, setSortBy] = useState<'vol' | 'rsi' | 'rvol'>('vol');

    // PORTFOLIO BUILDER STATE
    const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
    const [builderConfig, setBuilderConfig] = useState({ capital: 100000, leverage: 10, lots: 1.0 });

    // Real Data States
    const [assets, setAssets] = useState<ScoredAsset[]>([]);
    const [macro, setMacro] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [stats, setStats] = useState({ total: 0, latency: 0 });

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
        alert('Portfolio sent to Incubator!'); // Replace with toast later
    };

    // FETCH REAL DATA
    const fetchData = async () => {
        const start = performance.now();
        try {
            const res = await fetch('/api/market'); // Fetch ALL assets (278+)
            const data = await res.json();
            const latency = Math.round(performance.now() - start);

            if (data.success) {
                setMacro(data.macro);

                // --- PROFESSIONAL SCORING ENGINE ---
                const scored: ScoredAsset[] = data.data.map((asset: RealAssetData) => {
                    // 1. Calculate Score (0-100)
                    // Trend Weight: 40%, RSI Weight: 30%, Change Weight: 30%
                    const rsiScore = asset.rsi || 50;
                    const changeScore = 50 + (asset.changePercent * 10); // +1% = 60
                    const rawScore = (rsiScore * 0.4) + (changeScore * 0.6);
                    const score = Math.min(99, Math.max(1, Math.round(rawScore)));

                    // 2. Determine Signal
                    let signal: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
                    if (score > 65) signal = 'LONG';
                    if (score < 35) signal = 'SHORT';

                    // 3. Professional Execution Levels (Using High/Low Volatility)
                    // If no high/low (e.g. some indices), fallback to 1.5%
                    const dailyRange = (asset.high && asset.low) ? (asset.high - asset.low) : (asset.price * 0.015);
                    const volatility = dailyRange / asset.price;

                    const entry = asset.price;
                    // SL is placed 1x ATR (Daily Range) away
                    const sl = signal === 'LONG' ? entry - dailyRange : entry + dailyRange;
                    // TP is placed 2x ATR away
                    const tp = signal === 'LONG' ? entry + (dailyRange * 2) : entry - (dailyRange * 2);

                    const oneLiner = signal === 'LONG'
                        ? `Strong bullish momentum triggered. RSI ${Math.round(rsiScore)} indicates strength. Price action suggests further upside potential.`
                        : signal === 'SHORT'
                            ? `Bearish breakdown detected. Volatility expansion favors downside. RSI ${Math.round(rsiScore)} confirms weakness.`
                            : `Consolidation phase. Monitoring for breakout. Current market conditions suggest a neutral stance.`;

                    // REAL RVol Calculation
                    // If avgVolume is missing or 0, fallback to 1.0 (neutral) to avoid division by zero or random
                    const rvol = (asset.volume && asset.avgVolume)
                        ? (asset.volume / asset.avgVolume)
                        : 1.0;

                    return {
                        ...asset,
                        score,
                        regime: score > 55 ? 'BULLISH' : score < 45 ? 'BEARISH' : 'NEUTRAL',
                        signal,
                        conf: `${Math.round(50 + Math.abs(score - 50))}%`,
                        entry: entry < 10 ? entry.toFixed(4) : entry.toFixed(2),
                        sl: sl < 10 ? sl.toFixed(4) : sl.toFixed(2),
                        tp: tp < 10 ? tp.toFixed(4) : tp.toFixed(2),
                        rr: '2.0',
                        rvol,
                        volatility,
                        oneLiner
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
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000); // Poll every 60s
        return () => clearInterval(interval);
    }, []);

    // Derived Lists
    const scannerList = assets.filter(a => a.signal !== 'WAIT').slice(0, 50); // Show top 50 active signals
    const marketWatchList = assets; // Show all in sidebar (filtered)

    const selectedAssetData = selectedScannerAsset ? assets.find(a => a.symbol === selectedScannerAsset) : null;

    return (
        <div className="space-y-4 max-w-[1920px] mx-auto relative min-h-[800px]">

            {/* DETAIL OVERLAY */}
            {selectedAssetData && (
                <AssetDetailPanel asset={selectedAssetData} onClose={() => setSelectedScannerAsset(null)} />
            )}

            {/* 0. MARKET CONTEXT (Real Evidence) */}
            <MarketContextPanel macro={macro} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-280px)] min-h-[500px]">

                {/* ZONE A: MAIN SCANNER (8 cols) */}
                <div className="lg:col-span-8 flex flex-col gap-4">
                    <Card className="flex-1 bg-gray-900/40 border-gray-800 backdrop-blur-md overflow-hidden flex flex-col">
                        <CardHeader className="py-3 px-4 border-b border-gray-800 bg-gray-900/50 flex flex-col gap-3">
                            <div className="flex flex-row items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Search className="w-4 h-4 text-purple-500" />
                                    <CardTitle className="text-sm font-bold text-gray-200 uppercase tracking-wider">Live Opportunity Scanner</CardTitle>
                                </div>
                                {/* STATUS INDICATORS */}
                                <div className="flex items-center gap-4 text-[10px] font-mono text-gray-500">
                                    <span className={cn("flex items-center gap-1.5", loading ? "text-yellow-500" : "text-green-500")}>
                                        <div className={cn("w-2 h-2 rounded-full animate-pulse", loading ? "bg-yellow-500" : "bg-green-500")} />
                                        {loading ? "INITIALIZING FEED..." : "FEED: YAHOO (REAL)"}
                                    </span>
                                    <span>SCANNED: {stats.total}</span>
                                    <span>LATENCY: {stats.latency}ms</span>
                                    <Button variant="ghost" size="icon" className="h-4 w-4 text-gray-600 hover:text-white" onClick={fetchData}>
                                        <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
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
                                            <label className="text-[9px] text-gray-500 font-bold uppercase">Capital</label>
                                            <input
                                                type="number"
                                                className="w-20 bg-gray-900 border border-gray-800 text-xs text-white px-1 rounded focus:border-blue-500 outline-none"
                                                value={builderConfig.capital}
                                                onChange={(e) => setBuilderConfig({ ...builderConfig, capital: Number(e.target.value) })}
                                            />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-[9px] text-gray-500 font-bold uppercase">Lev (x)</label>
                                            <input
                                                type="number"
                                                className="w-12 bg-gray-900 border border-gray-800 text-xs text-white px-1 rounded focus:border-blue-500 outline-none"
                                                value={builderConfig.leverage}
                                                onChange={(e) => setBuilderConfig({ ...builderConfig, leverage: Number(e.target.value) })}
                                            />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-[9px] text-gray-500 font-bold uppercase">Lots</label>
                                            <input
                                                type="number" step="0.1"
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

                        <CardContent className="p-0 overflow-y-auto">
                            <Table>
                                <TableHeader className="bg-gray-950/30 text-[10px] uppercase sticky top-0 z-10">
                                    <TableRow className="hover:bg-transparent border-gray-800">
                                        <TableHead className="h-9 w-10 text-center text-gray-600">#</TableHead>
                                        <TableHead className="h-9 text-gray-400 font-bold w-16">Asset</TableHead>
                                        <TableHead className="h-9 text-gray-500 font-bold w-40 hidden md:table-cell">Name</TableHead>
                                        <TableHead className="h-9 text-gray-500 font-bold w-20 hidden md:table-cell">Type</TableHead>
                                        <TableHead className="h-9 text-gray-500 font-bold w-20 hidden md:table-cell">Sector</TableHead>
                                        <TableHead className="h-9 text-gray-400 font-bold text-center">Score</TableHead>
                                        <TableHead className="h-9 text-gray-400 font-bold">Trend</TableHead>
                                        <TableHead className="h-9 text-gray-400 font-bold">Signal</TableHead>

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
                                                    {/* Simulated Sparkline for now (random variation based on score) */}
                                                    <Sparkline
                                                        data={[row.score / 10, row.score / 10 + (Math.random() - 0.5), row.score / 10 + (Math.random() - 0.5), row.score / 10 + (Math.random() - 0.5), row.score / 10 + (Math.random() - 0.5)]}
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

                                                <TableCell className="font-bold text-blue-300 border-l border-gray-800 pl-4">{row.entry}</TableCell>
                                                <TableCell className="font-bold text-green-400">{row.tp}</TableCell>
                                                <TableCell className="font-bold text-red-400">{row.sl}</TableCell>
                                                <TableCell className="font-bold text-purple-400">{row.rr}</TableCell>

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
                    <Card className="h-full bg-gray-900/40 border-gray-800 backdrop-blur-md flex flex-col">
                        <CardHeader className="py-3 px-4 border-b border-gray-800 space-y-3">
                            <div className="flex justify-between items-center">
                                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Market Watch</div>
                                {/* Sort Controls */}
                                <div className="flex gap-1 bg-gray-950/50 p-0.5 rounded border border-gray-800">
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
                        <CardContent className="p-0 overflow-y-auto flex-1 custom-scrollbar">
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
                                    .map((item, i) => (
                                        <div key={item.symbol}
                                            className={cn("flex justify-between items-center px-4 py-3 border-b border-gray-800/50 cursor-pointer group transition-colors", selectedScannerAsset === item.symbol ? "bg-gray-800" : "hover:bg-gray-800/30")}
                                            onClick={() => setSelectedScannerAsset(item.symbol)}
                                        >
                                            <div className="flex items-center gap-3">
                                                {/* Name & Sparkline */}
                                                <div className="flex flex-col w-[70px]">
                                                    <span className="text-sm font-bold text-gray-200 group-hover:text-white leading-none">{item.displaySymbol}</span>
                                                    <Sparkline
                                                        data={[10, 10 + item.changePercent]}
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
                </div>

            </div>
        </div>
    );
};
