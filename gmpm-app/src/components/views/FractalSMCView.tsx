'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { analyzeSMC, type SMCAnalysis, type Candle } from '@/lib/smcEngine';
import { Loader2, ArrowUpCircle, ArrowDownCircle, Target, Layers, Zap, Crosshair } from 'lucide-react';

interface FractalSMCViewProps {
    symbol: string;
}

export const FractalSMCView = ({ symbol }: FractalSMCViewProps) => {
    const [analysis, setAnalysis] = useState<SMCAnalysis | null>(null);
    const [loading, setLoading] = useState(true);
    const [price, setPrice] = useState(0);

    useEffect(() => {
        fetchData();
    }, [symbol]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch real historical data
            const res = await fetch(`/api/history?symbol=${symbol}&period=6mo`);
            const data = await res.json();

            if (data.success && data.data.candles) {
                // Map API candles to SMC Engine format
                const candles: Candle[] = (data.data.candles as unknown[]).map((c: unknown) => {
                    const r = (typeof c === 'object' && c !== null) ? (c as Record<string, unknown>) : {};
                    const ts = typeof r.timestamp === 'number' ? r.timestamp : null;
                    const dt = typeof r.date === 'string' ? r.date : null;
                    return {
                        time: ts ?? (dt ? new Date(dt).getTime() : Date.now()),
                        open: Number(r.open),
                        high: Number(r.high),
                        low: Number(r.low),
                        close: Number(r.close),
                        volume: Number(r.volume),
                    };
                });

                const currentPrice = candles[candles.length - 1].close;
                setPrice(currentPrice);

                // Run the SMC Engine logic
                const smcResult = analyzeSMC(candles, currentPrice);
                setAnalysis(smcResult);
            }
        } catch (error) {
            console.error('Failed to fetch SMC data:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
                <span className="ml-2 text-pink-400">Analyzing Institutional Order Flow...</span>
            </div>
        );
    }

    if (!analysis) return <div className="text-center p-10 text-gray-500">Failed to load institutional data.</div>;

    return (
        <div className="space-y-6">
            {/* HEADER & BIAS METER */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Bias Card */}
                <Card className="md:col-span-2 bg-gray-900/50 border-gray-800 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xl font-bold flex items-center gap-2">
                            <Layers className="w-5 h-5 text-pink-500" />
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-pink-400 to-purple-400">
                                INSTITUTIONAL STRUCTURE ({symbol})
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <div className="text-sm text-gray-400">Market Structure</div>
                                <div className={`text-3xl font-bold ${analysis.trend === 'BULLISH' ? 'text-green-400' : analysis.trend === 'BEARISH' ? 'text-red-400' : 'text-yellow-400'}`}>
                                    {analysis.trend}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm text-gray-400">Current Zone</div>
                                <div className={`text-2xl font-bold flex items-center gap-2 justify-end ${analysis.currentZone === 'DISCOUNT' ? 'text-green-400' : analysis.currentZone === 'PREMIUM' ? 'text-red-400' : 'text-gray-300'}`}>
                                    {analysis.currentZone === 'DISCOUNT' ? <ArrowDownCircle className="w-5 h-5" /> : analysis.currentZone === 'PREMIUM' ? <ArrowUpCircle className="w-5 h-5" /> : null}
                                    {analysis.currentZone}
                                </div>
                            </div>
                        </div>

                        {/* Bias Strength Meter */}
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Institutional Bias Strength</span>
                                <span className="font-bold text-pink-400">{analysis.biasStrength}%</span>
                            </div>
                            <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-1000 ${analysis.bias === 'BULLISH' ? 'bg-gradient-to-r from-green-600 to-green-400' : analysis.bias === 'BEARISH' ? 'bg-gradient-to-r from-red-600 to-red-400' : 'bg-gray-500'}`}
                                    style={{ width: `${analysis.biasStrength}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                                <span>Weak</span>
                                <span>Strong</span>
                                <span>Institutional</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Key Levels Summary */}
                <Card className="bg-gray-900/50 border-gray-800 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold text-gray-200 flex items-center gap-2">
                            <Crosshair className="w-4 h-4 text-purple-400" />
                            KEY LEVELS
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                            <div className="text-xs text-gray-400 mb-1">Equilibrium (50%)</div>
                            <div className="text-lg font-mono text-white">{analysis.equilibrium.toFixed(2)}</div>
                        </div>
                        <div className="p-3 bg-green-900/20 rounded-lg border border-green-900/30">
                            <div className="text-xs text-green-400 mb-1">Discount (Buy Zone)</div>
                            <div className="text-lg font-mono text-green-300">{'<'} {analysis.discountLevel.toFixed(2)}</div>
                        </div>
                        <div className="p-3 bg-red-900/20 rounded-lg border border-red-900/30">
                            <div className="text-xs text-red-400 mb-1">Premium (Sell Zone)</div>
                            <div className="text-lg font-mono text-red-300">{'>'} {analysis.premiumLevel.toFixed(2)}</div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ORDER BLOCKS & FVGs GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Active Order Blocks */}
                <Card className="bg-gray-900/50 border-gray-800 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="text-base font-bold text-blue-400 flex items-center gap-2">
                            <Layers className="w-4 h-4" />
                            Active Order Blocks (OB)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {analysis.activeOBs.length === 0 ? (
                            <div className="text-sm text-gray-500 italic">No clean Order Blocks found nearby.</div>
                        ) : (
                            <div className="space-y-3">
                                {analysis.activeOBs.map((ob, i) => (
                                    <div key={i} className={`flex items-center justify-between p-3 rounded-md border ${ob.type === 'BULLISH' ? 'bg-green-900/10 border-green-900/30' : 'bg-red-900/10 border-red-900/30'}`}>
                                        <div className="flex flex-col">
                                            <span className={`text-xs font-bold ${ob.type === 'BULLISH' ? 'text-green-400' : 'text-red-400'}`}>
                                                {ob.type} OB
                                            </span>
                                            <span className="text-sm font-mono text-gray-300">
                                                {ob.priceLow.toFixed(2)} - {ob.priceHigh.toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-gray-500">Strength</div>
                                            <div className="text-sm font-bold text-white">{ob.strength.toFixed(0)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Fair Value Gaps */}
                <Card className="bg-gray-900/50 border-gray-800 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="text-base font-bold text-yellow-400 flex items-center gap-2">
                            <Zap className="w-4 h-4" />
                            Unfilled Gap (FVG)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {analysis.unfilledFVGs.length === 0 ? (
                            <div className="text-sm text-gray-500 italic">All recent gaps filled. Efficient market.</div>
                        ) : (
                            <div className="space-y-3">
                                {analysis.unfilledFVGs.map((fvg, i) => (
                                    <div key={i} className={`flex items-center justify-between p-3 rounded-md border ${fvg.type === 'BULLISH' ? 'bg-green-900/10 border-green-900/30' : 'bg-red-900/10 border-red-900/30'}`}>
                                        <div className="flex flex-col">
                                            <span className={`text-xs font-bold ${fvg.type === 'BULLISH' ? 'text-green-400' : 'text-red-400'}`}>
                                                {fvg.type} FVG
                                            </span>
                                            <span className="text-sm font-mono text-gray-300">
                                                {fvg.low.toFixed(2)} - {fvg.high.toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-gray-500">Gap Size</div>
                                            <div className="text-sm font-bold text-white">{fvg.sizePercent.toFixed(2)}%</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* LIQUIDITY POOLS */}
            <Card className="bg-gray-900/50 border-gray-800 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="text-base font-bold text-purple-400 flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        Liquidity Targets (Next Draws)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Sell Side (Above Price) */}
                        <div>
                            <div className="text-xs text-red-400 mb-2 font-bold uppercase tracking-wider">Sell-Side Liquidity (Stops Above)</div>
                            <div className="space-y-2">
                                {analysis.liquidityLevels
                                    .filter(l => l.type === 'SELL_SIDE' && l.price > price)
                                    .slice(0, 3)
                                    .reverse() // Show closest to price at bottom visually? Or top list sorted? let's stick to list
                                    .map((lvl, i) => (
                                        <div key={i} className="flex justify-between items-center p-2 bg-red-900/10 border-l-2 border-red-500">
                                            <span className="font-mono text-sm text-gray-300">{lvl.price.toFixed(2)}</span>
                                            <span className="text-xs text-red-300 bg-red-900/50 px-2 py-0.5 rounded-full">{lvl.strength > 70 ? 'MAJOR POOL' : 'Target'}</span>
                                        </div>
                                    ))
                                }
                                {analysis.liquidityLevels.filter(l => l.type === 'SELL_SIDE' && l.price > price).length === 0 && (
                                    <div className="text-xs text-gray-500">No immediate targets above.</div>
                                )}
                            </div>
                        </div>

                        {/* Buy Side (Below Price) */}
                        <div>
                            <div className="text-xs text-green-400 mb-2 font-bold uppercase tracking-wider">Buy-Side Liquidity (Stops Below)</div>
                            <div className="space-y-2">
                                {analysis.liquidityLevels
                                    .filter(l => l.type === 'BUY_SIDE' && l.price < price)
                                    .slice(0, 3)
                                    .map((lvl, i) => (
                                        <div key={i} className="flex justify-between items-center p-2 bg-green-900/10 border-l-2 border-green-500">
                                            <span className="font-mono text-sm text-gray-300">{lvl.price.toFixed(2)}</span>
                                            <span className="text-xs text-green-300 bg-green-900/50 px-2 py-0.5 rounded-full">{lvl.strength > 70 ? 'MAJOR POOL' : 'Target'}</span>
                                        </div>
                                    ))
                                }
                                {analysis.liquidityLevels.filter(l => l.type === 'BUY_SIDE' && l.price < price).length === 0 && (
                                    <div className="text-xs text-gray-500">No immediate targets below.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="mt-2 text-center">
                <p className="text-xs text-gray-600 font-mono">
                    * Analysis based on 6 Months Daily candles. Institutional algorithms target these levels.
                </p>
            </div>
        </div>
    );
};
