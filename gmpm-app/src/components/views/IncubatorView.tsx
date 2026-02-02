
import React, { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { IncubatorPortfolio } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, TrendingUp, TrendingDown, Settings, DollarSign, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogTrigger,
} from "@/components/ui/dialog";

// Minimal mock ScoredAsset type if needed for type safety within this file scope until imported properly
// In a real scenario, this would import from the same place CommandView does, or useStore
interface RealAssetData {
    symbol: string;
    price: number;
    changePercent: number;
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
                const res = await fetch('/api/market?limit=280');
                const data = await res.json();
                if (data.success && data.data) {
                    const priceMap: Record<string, number> = {};
                    data.data.forEach((a: any) => priceMap[a.symbol] = a.price);
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
        let totalValue = 0;

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

                                    {/* ASSET LIST */}
                                    <div className="flex-1 p-4 space-y-3">
                                        {portfolio.assets.map(asset => {
                                            const curr = prices[asset.symbol] || asset.entryPrice;
                                            const change = ((curr - asset.entryPrice) / asset.entryPrice) * 100;
                                            const assetPnL = (curr - asset.entryPrice) * asset.lots * 100000;
                                            const aProfit = assetPnL >= 0;

                                            return (
                                                <div key={asset.symbol} className="flex justify-between items-center text-sm border-b border-gray-800/50 last:border-0 pb-2 last:pb-0">
                                                    <div>
                                                        <div className="font-bold text-gray-200">{asset.symbol}</div>
                                                        <div className="text-[10px] text-gray-500">
                                                            Entry: {asset.entryPrice.toFixed(4)} | Lot: {asset.lots}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className={cn("font-mono font-bold", aProfit ? "text-green-400" : "text-red-400")}>
                                                            {aProfit ? '+' : ''}{assetPnL.toFixed(0)}
                                                        </div>
                                                        <div className={cn("text-[10px] flex items-center justify-end gap-1", change >= 0 ? "text-green-500" : "text-red-500")}>
                                                            {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                            {change.toFixed(2)}%
                                                        </div>
                                                    </div>
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
                        <DialogTitle>It's time to refine.</DialogTitle>
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
