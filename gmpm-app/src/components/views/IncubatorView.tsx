
import React, { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { IncubatorPortfolio } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, Settings, DollarSign, Wallet, Shield, Zap, Target, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";

// Risk Profile Classification based on score
function classifyRiskProfile(score: number): 'SAFE' | 'MODERATE' | 'AGGRESSIVE' {
    if (score >= 75) return 'SAFE';
    if (score >= 55) return 'MODERATE';
    return 'AGGRESSIVE';
}

// Dynamic R:R based on score for efficient bankroll management
function calculateDynamicRR(score: number): { rr: number; lotMultiplier: number; maxRisk: number } {
    // Higher score = better R:R and larger position allowed
    if (score >= 80) {
        return { rr: 3, lotMultiplier: 1.0, maxRisk: 2.0 }; // SAFE: 3:1 R:R, full lots, 2% risk
    } else if (score >= 70) {
        return { rr: 2.5, lotMultiplier: 0.8, maxRisk: 1.5 }; // SAFE: 2.5:1 R:R, 80% lots, 1.5% risk
    } else if (score >= 60) {
        return { rr: 2, lotMultiplier: 0.6, maxRisk: 1.0 }; // MODERATE: 2:1 R:R, 60% lots, 1% risk
    } else if (score >= 50) {
        return { rr: 2, lotMultiplier: 0.4, maxRisk: 0.75 }; // MODERATE: 2:1 R:R, 40% lots, 0.75% risk
    } else {
        return { rr: 3, lotMultiplier: 0.25, maxRisk: 0.5 }; // AGGRESSIVE: Need 3:1 to compensate, 25% lots, 0.5% risk
    }
}

// Status badge component
function StatusBadge({ status }: { status?: string }) {
    if (!status) return null;
    const config = {
        'PRONTO': { color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: CheckCircle },
        'DESENVOLVENDO': { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: Clock },
        'CONTRA': { color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: AlertTriangle },
    }[status] || { color: 'bg-gray-500/20 text-gray-400', icon: Target };
    const Icon = config.icon;
    return (
        <Badge className={cn("text-[9px] px-1.5 py-0.5 border", config.color)}>
            <Icon className="w-2.5 h-2.5 mr-1" />
            {status}
        </Badge>
    );
}

// Risk profile badge
function RiskBadge({ profile, score }: { profile?: string; score?: number }) {
    const effectiveProfile = profile || (score ? classifyRiskProfile(score) : 'MODERATE');
    const config = {
        'SAFE': { color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: Shield },
        'MODERATE': { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: Target },
        'AGGRESSIVE': { color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: Zap },
    }[effectiveProfile] || { color: 'bg-gray-500/20 text-gray-400', icon: Target };
    const Icon = config.icon;
    return (
        <Badge className={cn("text-[9px] px-1.5 py-0.5 border", config.color)}>
            <Icon className="w-2.5 h-2.5 mr-1" />
            {effectiveProfile}
        </Badge>
    );
}


export const IncubatorView = () => {
    const { portfolios, removePortfolio, updatePortfolioConfig } = useStore();
    const [prices, setPrices] = useState<Record<string, number>>({});

    const [editingPortfolioId, setEditingPortfolioId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ capital: 0, leverage: 1, lots: 0 });

    const handleEditClick = (p: IncubatorPortfolio) => {
        setEditingPortfolioId(p.id);
        setEditForm({
            capital: p.config.capital,
            leverage: p.config.leverage,
            lots: p.config.defaultLots
        });
    };

    const handleSaveConfig = () => {
        if (!editingPortfolioId) return;
        updatePortfolioConfig(editingPortfolioId, {
            capital: editForm.capital,
            leverage: editForm.leverage,
            defaultLots: editForm.lots
        });
        setEditingPortfolioId(null);
    };

    // Fetch real prices for PnL calculation
    useEffect(() => {
        const fetchPrices = async () => {
            // In a real app, we might just subscribe to the store's marketData if it's populated globally
            // For now, let's assume we can fetch or use what's in store.
            // If store doesn't persist full marketData, we do a lightweight fetch here.
            try {
                const res = await fetch('/api/market?limit=280&macro=0');
                const data = await res.json();
                if (data.success && data.data) {
                    const priceMap: Record<string, number> = {};
                    (data.data as unknown[]).forEach((a: unknown) => {
                        const r = (typeof a === 'object' && a !== null) ? (a as Record<string, unknown>) : {};
                        const symbol = typeof r.symbol === 'string' ? r.symbol : null;
                        const price = typeof r.price === 'number' ? r.price : Number(r.price);
                        if (symbol && Number.isFinite(price)) {
                            priceMap[symbol] = price;
                        }
                    });
                    setPrices(priceMap);
                }
            } catch (e) { console.error("Incubator price fetch error", e); }
        };

        fetchPrices();
        const interval = setInterval(fetchPrices, 15000); // 15s updates for incubator
        return () => clearInterval(interval);
    }, []);

    // PnL Calculator
    const calculatePortfolioPnL = (p: IncubatorPortfolio) => {
        let totalPnL = 0;

        p.assets.forEach(a => {
            const currentPrice = prices[a.symbol] || a.entryPrice;
            const diff = currentPrice - a.entryPrice;
            // Profit = (Diff * Lots * Leverage * 1000 [Standard Lot Proxy]) 
            // Simplified: (Diff / Entry) * CapitalAllocated
            // Let's use the explicit logic from the prompt: "lots default"
            const lotValue = 100000; // Standard Lot Size
            const rawPnL = diff * a.lots * lotValue;
            if (a.side === 'SHORT') totalPnL -= rawPnL;
            else totalPnL += rawPnL;
        });

        return totalPnL;
    };


    return (
        <div className="space-y-6 max-w-[1920px] mx-auto p-6 h-[calc(100vh-100px)] overflow-y-auto">

            {/* HERDER */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-100 tracking-tight flex items-center gap-3">
                        <Wallet className="w-8 h-8 text-blue-500" />
                        Incubator
                    </h1>
                    <p className="text-gray-500 mt-1">Simulate, Track, and Validate Strategies before Execution.</p>
                </div>
                <div className="flex gap-4">
                    <div className="bg-blue-900/20 px-4 py-2 rounded-lg border border-blue-800">
                        <div className="text-[10px] uppercase text-blue-400 font-bold">Active Portfolios</div>
                        <div className="text-2xl font-mono text-white">{portfolios.length}</div>
                    </div>
                </div>
            </div>

            {portfolios.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[400px] border-2 border-dashed border-gray-800 rounded-xl bg-gray-900/20">
                    <Wallet className="w-16 h-16 text-gray-700 mb-4" />
                    <h3 className="text-xl font-bold text-gray-400">Incubator is Empty</h3>
                    <p className="text-gray-600 max-w-md text-center mt-2">
                        Go to the <span className="text-blue-400 font-mono">COMMAND</span> view and use the Portfolio Builder to send assets here.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {portfolios.map(portfolio => {
                        const pnl = calculatePortfolioPnL(portfolio);
                        const isProfit = pnl >= 0;
                        const avgFinal = portfolio.assets.length > 0
                            ? Math.round(portfolio.assets.reduce((sum, a) => sum + (a.finalScore ?? a.technicalScore ?? 50), 0) / portfolio.assets.length)
                            : 0;

                        return (
                            <Card key={portfolio.id} className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-all flex flex-col">
                                <CardHeader className="pb-2 border-b border-gray-800 bg-gray-950/30">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                                                {portfolio.name}
                                                <span className="text-[10px] bg-gray-800 px-2 py-0.5 rounded text-gray-400 font-normal">
                                                    {new Date(portfolio.createdAt).toLocaleDateString()}
                                                </span>
                                                <span className={cn(
                                                    "text-[10px] font-bold px-2 py-0.5 rounded border",
                                                    avgFinal >= 80 ? "bg-green-500/10 text-green-300 border-green-500/20" :
                                                        avgFinal >= 65 ? "bg-yellow-500/10 text-yellow-200 border-yellow-500/20" :
                                                            "bg-gray-700/20 text-gray-300 border-gray-700/30"
                                                )}>
                                                    FINAL {avgFinal}
                                                </span>
                                            </CardTitle>
                                            <div className="text-xs text-gray-500 mt-1 flex gap-3">
                                                <span>Capital: ${portfolio.config.capital.toLocaleString()}</span>
                                                <span>Lev: {portfolio.config.leverage}x</span>
                                                <span>Lots: {portfolio.config.defaultLots}</span>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={() => removePortfolio(portfolio.id)} className="text-gray-600 hover:text-red-400 -mt-1 -mr-2">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1 p-0 flex flex-col">
                                    {/* PNL HERO */}
                                    <div className="p-4 bg-gray-950/50 flex justify-between items-center shadow-inner">
                                        <div className="text-xs font-bold text-gray-500 uppercase">Unrealized PnL</div>
                                        <div className={cn("text-2xl font-mono font-bold", isProfit ? "text-green-400" : "text-red-400")}>
                                            {isProfit ? '+' : ''}${pnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                        </div>
                                    </div>

                                    {/* ASSET LIST - Enhanced with SCAN data */}
                                    <div className="flex-1 p-4 space-y-3 max-h-[400px] overflow-y-auto">
                                        {portfolio.assets.map(asset => {
                                            const curr = prices[asset.symbol] || asset.entryPrice;
                                            const assetPnL = (curr - asset.entryPrice) * asset.lots * 100000;
                                            const finalPnL = asset.side === 'SHORT' ? -assetPnL : assetPnL;
                                            
                                            // Dynamic R:R based on score
                                            const finalScore = asset.finalScore ?? asset.technicalScore ?? 50;
                                            const scanScore = asset.scanScore;
                                            const microScore = asset.technicalScore;

                                            const { rr, maxRisk } = calculateDynamicRR(finalScore);
                                            const effectiveRR = asset.riskReward || rr;
                                            const riskProfile = asset.riskProfile || classifyRiskProfile(finalScore);

                                            return (
                                                <div key={asset.symbol} className="border border-gray-800 rounded-lg p-3 bg-gray-950/50 hover:bg-gray-900/50 transition-all">
                                                    {/* Header Row */}
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-gray-200">{asset.symbol}</span>
                                                            <Badge className={cn("text-[9px] px-1.5", 
                                                                asset.side === 'LONG' ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                                                            )}>
                                                                {asset.side}
                                                            </Badge>
                                                            <StatusBadge status={asset.scenarioStatus} />
                                                            <RiskBadge profile={riskProfile} score={finalScore} />
                                                        </div>
                                                        <div className={cn("font-mono font-bold text-lg", finalPnL >= 0 ? "text-green-400" : "text-red-400")}>
                                                            {finalPnL >= 0 ? '+' : ''}${finalPnL.toFixed(0)}
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Score & R:R Row */}
                                                    <div className="grid grid-cols-5 gap-2 mb-2 text-[10px]">
                                                        <div className="bg-gray-800/50 rounded px-2 py-1 text-center">
                                                            <div className="text-gray-500 uppercase">Final</div>
                                                            <div className={cn("font-bold font-mono",
                                                                finalScore >= 80 ? "text-green-400" : finalScore >= 65 ? "text-yellow-400" : "text-red-400"
                                                            )}>{finalScore}</div>
                                                            <div className="text-[9px] text-gray-600 mt-0.5 font-mono">
                                                                MICRO {microScore ?? '—'}
                                                            </div>
                                                        </div>
                                                        <div className="bg-gray-800/50 rounded px-2 py-1 text-center">
                                                            <div className="text-gray-500 uppercase">Scan</div>
                                                            <div className={cn("font-bold font-mono",
                                                                typeof scanScore === 'number' && scanScore >= 80 ? "text-green-400" :
                                                                    typeof scanScore === 'number' && scanScore >= 55 ? "text-yellow-400" :
                                                                        "text-gray-400"
                                                            )}>{typeof scanScore === 'number' ? scanScore : '—'}</div>
                                                        </div>
                                                        <div className="bg-gray-800/50 rounded px-2 py-1 text-center">
                                                            <div className="text-gray-500 uppercase">R:R</div>
                                                            <div className="font-bold font-mono text-blue-400">{effectiveRR.toFixed(1)}:1</div>
                                                        </div>
                                                        <div className="bg-gray-800/50 rounded px-2 py-1 text-center">
                                                            <div className="text-gray-500 uppercase">Lots</div>
                                                            <div className="font-bold font-mono text-purple-400">{asset.lots.toFixed(2)}</div>
                                                        </div>
                                                        <div className="bg-gray-800/50 rounded px-2 py-1 text-center">
                                                            <div className="text-gray-500 uppercase">Max Risk</div>
                                                            <div className="font-bold font-mono text-orange-400">{maxRisk}%</div>
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Levels Row */}
                                                    <div className="grid grid-cols-3 gap-2 mb-2 text-[10px]">
                                                        <div className="text-center">
                                                            <div className="text-gray-500">Entry</div>
                                                            <div className="font-mono text-gray-300">{asset.entryPrice.toFixed(4)}</div>
                                                        </div>
                                                        <div className="text-center">
                                                            <div className="text-red-500">SL</div>
                                                            <div className="font-mono text-red-400">{asset.stopLoss?.toFixed(4) || '—'}</div>
                                                        </div>
                                                        <div className="text-center">
                                                            <div className="text-green-500">TP1</div>
                                                            <div className="font-mono text-green-400">{asset.takeProfit1?.toFixed(4) || '—'}</div>
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Price Progress Bar */}
                                                    {asset.stopLoss && asset.takeProfit1 && (
                                                        <div className="mb-2">
                                                            <div className="flex justify-between text-[9px] text-gray-500 mb-1">
                                                                <span>SL</span>
                                                                <span className="text-gray-400">Current: {curr.toFixed(4)}</span>
                                                                <span>TP1</span>
                                                            </div>
                                                            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                                                {(() => {
                                                                    const range = Math.abs(asset.takeProfit1 - asset.stopLoss);
                                                                    const progress = asset.side === 'LONG' 
                                                                        ? ((curr - asset.stopLoss) / range) * 100
                                                                        : ((asset.stopLoss - curr) / range) * 100;
                                                                    const clampedProgress = Math.max(0, Math.min(100, progress));
                                                                    return (
                                                                        <div 
                                                                            className={cn("h-full transition-all",
                                                                                clampedProgress < 30 ? "bg-red-500" : 
                                                                                clampedProgress < 70 ? "bg-yellow-500" : "bg-green-500"
                                                                            )}
                                                                            style={{ width: `${clampedProgress}%` }}
                                                                        />
                                                                    );
                                                                })()}
                                                            </div>
                                                        </div>
                                                    )}
                                                    
                                                    {/* Thesis */}
                                                    {asset.thesis && (
                                                        <div className="text-[10px] text-gray-500 bg-gray-800/30 rounded p-2 line-clamp-2">
                                                            {asset.thesis}
                                                        </div>
                                                    )}
                                                    
                                                    {/* Confluences */}
                                                    {asset.confluences && asset.confluences.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                            {asset.confluences.slice(0, 3).map((c, i) => (
                                                                <span key={i} className="text-[9px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded">
                                                                    {c}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>

                                    {/* CONFIG BUTTON */}
                                    <div className="p-2 border-t border-gray-800 bg-gray-900/50 text-center">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full text-xs text-gray-500 hover:text-white"
                                            onClick={() => handleEditClick(portfolio)}
                                        >
                                            <Settings className="w-3 h-3 mr-2" /> Configure Parameters
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}

            {/* EDIT CONFIG DIALOG */}
            <Dialog open={!!editingPortfolioId} onOpenChange={(open) => !open && setEditingPortfolioId(null)}>
                <DialogContent className="bg-gray-900 border-gray-800 text-white">
                    <DialogHeader>
                        <DialogTitle>It&apos;s time to refine.</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Adjust your risk parameters for this portfolio. Changes affect PnL calculations immediately.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right text-sm font-bold text-gray-400">Capital</label>
                            <div className="col-span-3 relative">
                                <DollarSign className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-500" />
                                <input
                                    type="number"
                                    className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 pl-8 text-sm text-white focus:border-blue-500 outline-none"
                                    value={editForm.capital}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        setEditForm(prev => ({ ...prev, capital: isNaN(val) ? 0 : val }));
                                    }}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right text-sm font-bold text-gray-400">Leverage</label>
                            <div className="col-span-3">
                                <input
                                    type="number"
                                    className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                                    value={editForm.leverage}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        setEditForm(prev => ({ ...prev, leverage: isNaN(val) ? 1 : val }));
                                    }}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right text-sm font-bold text-gray-400">Std Lots</label>
                            <div className="col-span-3">
                                <input
                                    type="number"
                                    step="0.1"
                                    className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                                    value={editForm.lots}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        setEditForm(prev => ({ ...prev, lots: isNaN(val) ? 0 : val }));
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingPortfolioId(null)} className="border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800">
                            Cancel
                        </Button>
                        <Button onClick={handleSaveConfig} className="bg-blue-600 hover:bg-blue-500 text-white font-bold">
                            Save Configuration
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
