'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    Globe, RefreshCw, TrendingUp, TrendingDown, Minus, Activity,
    DollarSign, Building2, BarChart3, ArrowUpRight, ArrowDownRight,
    AlertTriangle, Zap, Target
} from 'lucide-react';

interface CurrencyStrength {
    code: string;
    name: string;
    country: string;
    flag: string;
    centralBank: string;
    region: string;
    strength: number;
    strengthLabel: 'STRONG' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'WEAK';
    bullishPairs: number;
    bearishPairs: number;
    totalPairs: number;
    trend: 'UP' | 'DOWN' | 'SIDEWAYS';
    momentum: number;
    economicIndicators: {
        interestRate: number | null;
        inflation: number | null;
        gdpGrowth: number | null;
        unemployment: number | null;
        tradeBalance: number | null;
        sentiment: 'HAWKISH' | 'NEUTRAL' | 'DOVISH';
        nextMeeting: string | null;
        recentEvents: string[];
    };
    flowAnalysis: {
        capitalFlow: 'INFLOW' | 'OUTFLOW' | 'NEUTRAL';
        flowStrength: number;
        institutionalBias: 'LONG' | 'SHORT' | 'NEUTRAL';
        retailSentiment: number;
        cot: {
            commercial: number;
            nonCommercial: number;
            retail: number;
        };
    };
    correlations: Array<{
        currency: string;
        correlation: number;
        relationship: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
    }>;
}

interface BestPair {
    symbol: string;
    base: string;
    quote: string;
    direction: 'LONG' | 'SHORT';
    differential: number;
    baseStrength: number;
    quoteStrength: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface CurrencyData {
    success: boolean;
    timestamp: string;
    currencies: CurrencyStrength[];
    globalFlow: {
        riskSentiment: string;
        dollarIndex: number | null;
        vix: number | null;
        dominantFlow: string;
        weakestCurrency: string;
    };
    bestPairs: BestPair[];
    summary: {
        strongestCurrencies: CurrencyStrength[];
        weakestCurrencies: CurrencyStrength[];
        neutralCurrencies: CurrencyStrength[];
    };
}

export default function CurrencyStrengthView() {
    const [data, setData] = useState<CurrencyData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/currency-strength', { cache: 'no-store' });
            const json = await res.json();
            if (json.success) {
                setData(json);
                setLastUpdated(new Date());
                setError(null);
            } else {
                setError(json.error || 'Failed to fetch data');
            }
        } catch (err) {
            setError('Network error');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const getStrengthColor = (label: string) => {
        switch (label) {
            case 'STRONG': return 'text-green-400 bg-green-500/20 border-green-500/30';
            case 'BULLISH': return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
            case 'NEUTRAL': return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
            case 'BEARISH': return 'text-orange-400 bg-orange-500/20 border-orange-500/30';
            case 'WEAK': return 'text-red-400 bg-red-500/20 border-red-500/30';
            default: return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
        }
    };

    const getStrengthBarColor = (strength: number) => {
        if (strength >= 70) return 'bg-green-500';
        if (strength >= 55) return 'bg-blue-500';
        if (strength >= 45) return 'bg-gray-500';
        if (strength >= 30) return 'bg-orange-500';
        return 'bg-red-500';
    };

    const selectedData = selectedCurrency 
        ? data?.currencies.find(c => c.code === selectedCurrency) 
        : null;

    if (loading && !data) {
        return (
            <div className="p-6 flex items-center justify-center h-[calc(100vh-200px)]">
                <div className="text-center">
                    <RefreshCw className="w-8 h-8 animate-spin text-cyan-500 mx-auto mb-4" />
                    <p className="text-gray-400">Loading currency analysis...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6">
                <Card className="bg-red-950/20 border-red-900/30">
                    <CardContent className="p-6 text-center">
                        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-4" />
                        <p className="text-red-400">{error}</p>
                        <Button onClick={fetchData} className="mt-4">Retry</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Globe className="w-6 h-6 text-cyan-500" />
                    <h1 className="text-xl font-bold text-white">Currency Strength Analysis</h1>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500 font-mono">
                        Updated: {lastUpdated?.toLocaleTimeString() || 'N/A'}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchData}
                        disabled={loading}
                        className="h-8"
                    >
                        <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Global Flow Summary */}
            {data?.globalFlow && (
                <Card className="bg-gray-900 border-gray-800">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Activity className="w-4 h-4 text-purple-400" />
                                <span className="text-sm font-bold text-purple-400 uppercase">Global FX Flow</span>
                            </div>
                            <div className="flex items-center gap-4 text-xs">
                                {data.globalFlow.dollarIndex && (
                                    <span className="text-gray-400">
                                        DXY: <span className="text-white font-bold">{data.globalFlow.dollarIndex.toFixed(2)}</span>
                                    </span>
                                )}
                                {data.globalFlow.vix && (
                                    <span className="text-gray-400">
                                        VIX: <span className={cn("font-bold", data.globalFlow.vix > 25 ? "text-red-400" : "text-green-400")}>
                                            {data.globalFlow.vix.toFixed(1)}
                                        </span>
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-gray-950/50 rounded p-3">
                                <div className="text-[10px] text-gray-500 uppercase mb-1">Risk Sentiment</div>
                                <div className={cn(
                                    "text-sm font-bold",
                                    data.globalFlow.riskSentiment === 'RISK_ON' ? "text-green-400" :
                                    data.globalFlow.riskSentiment === 'RISK_OFF' ? "text-red-400" : "text-gray-400"
                                )}>
                                    {data.globalFlow.riskSentiment}
                                </div>
                            </div>
                            <div className="bg-gray-950/50 rounded p-3">
                                <div className="text-[10px] text-gray-500 uppercase mb-1">Strongest</div>
                                <div className="text-sm font-bold text-green-400 flex items-center gap-1">
                                    <TrendingUp className="w-3 h-3" />
                                    {data.globalFlow.dominantFlow}
                                </div>
                            </div>
                            <div className="bg-gray-950/50 rounded p-3">
                                <div className="text-[10px] text-gray-500 uppercase mb-1">Weakest</div>
                                <div className="text-sm font-bold text-red-400 flex items-center gap-1">
                                    <TrendingDown className="w-3 h-3" />
                                    {data.globalFlow.weakestCurrency}
                                </div>
                            </div>
                            <div className="bg-gray-950/50 rounded p-3">
                                <div className="text-[10px] text-gray-500 uppercase mb-1">Active Pairs</div>
                                <div className="text-sm font-bold text-cyan-400">
                                    {data.currencies.reduce((sum, c) => sum + c.totalPairs, 0) / 2}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Currency Strength Cards */}
                <div className={cn("space-y-4", selectedCurrency ? "lg:col-span-7" : "lg:col-span-12")}>
                    <Card className="bg-gray-900 border-gray-800">
                        <CardHeader className="py-3 px-4 border-b border-gray-800">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-bold text-gray-200 uppercase flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 text-cyan-400" />
                                    Currency Strength Meter
                                </CardTitle>
                                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Strong</span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Bullish</span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500"></span> Neutral</span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"></span> Bearish</span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Weak</span>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4">
                            <div className="space-y-3">
                                {data?.currencies.map((currency) => (
                                    <div
                                        key={currency.code}
                                        onClick={() => setSelectedCurrency(currency.code === selectedCurrency ? null : currency.code)}
                                        className={cn(
                                            "p-3 rounded-lg border cursor-pointer transition-all",
                                            selectedCurrency === currency.code 
                                                ? "bg-purple-900/20 border-purple-500/50" 
                                                : "bg-gray-950/50 border-gray-800 hover:border-gray-700"
                                        )}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-3">
                                                <span className="text-2xl">{currency.flag}</span>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-white">{currency.code}</span>
                                                        <span className="text-xs text-gray-500">{currency.name}</span>
                                                    </div>
                                                    <div className="text-[10px] text-gray-600">{currency.country} • {currency.centralBank}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="text-right">
                                                    <div className="flex items-center gap-1">
                                                        {currency.trend === 'UP' && <TrendingUp className="w-3 h-3 text-green-400" />}
                                                        {currency.trend === 'DOWN' && <TrendingDown className="w-3 h-3 text-red-400" />}
                                                        {currency.trend === 'SIDEWAYS' && <Minus className="w-3 h-3 text-gray-400" />}
                                                        <span className={cn(
                                                            "text-xs font-mono",
                                                            currency.momentum > 0 ? "text-green-400" : currency.momentum < 0 ? "text-red-400" : "text-gray-400"
                                                        )}>
                                                            {currency.momentum > 0 ? '+' : ''}{currency.momentum.toFixed(2)}%
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-gray-600">
                                                        {currency.bullishPairs}↑ / {currency.bearishPairs}↓
                                                    </div>
                                                </div>
                                                <div className={cn(
                                                    "px-2 py-1 rounded text-xs font-bold border",
                                                    getStrengthColor(currency.strengthLabel)
                                                )}>
                                                    {currency.strength}
                                                </div>
                                            </div>
                                        </div>
                                        {/* Strength Bar */}
                                        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                            <div 
                                                className={cn("h-full rounded-full transition-all", getStrengthBarColor(currency.strength))}
                                                style={{ width: `${currency.strength}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Best Trading Opportunities */}
                    {data?.bestPairs && data.bestPairs.length > 0 && (
                        <Card className="bg-gray-900 border-gray-800">
                            <CardHeader className="py-3 px-4 border-b border-gray-800">
                                <CardTitle className="text-sm font-bold text-gray-200 uppercase flex items-center gap-2">
                                    <Target className="w-4 h-4 text-green-400" />
                                    Best Trading Opportunities
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {data.bestPairs.slice(0, 6).map((pair) => (
                                        <div key={pair.symbol} className="bg-gray-950/50 rounded-lg p-3 border border-gray-800">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm font-bold text-white">{pair.symbol.replace('=X', '')}</span>
                                                <span className={cn(
                                                    "text-xs font-bold px-2 py-0.5 rounded",
                                                    pair.direction === 'LONG' ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                                                )}>
                                                    {pair.direction}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-[10px]">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-green-400">{pair.base}: {pair.baseStrength}</span>
                                                    <span className="text-gray-600">vs</span>
                                                    <span className="text-red-400">{pair.quote}: {pair.quoteStrength}</span>
                                                </div>
                                                <span className={cn(
                                                    "px-1.5 py-0.5 rounded",
                                                    pair.confidence === 'HIGH' ? "bg-green-500/20 text-green-400" :
                                                    pair.confidence === 'MEDIUM' ? "bg-yellow-500/20 text-yellow-400" :
                                                    "bg-gray-500/20 text-gray-400"
                                                )}>
                                                    {pair.confidence}
                                                </span>
                                            </div>
                                            <div className="mt-2 h-1 bg-gray-800 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-purple-500 rounded-full"
                                                    style={{ width: `${Math.min(100, pair.differential * 2)}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Currency Detail Panel */}
                {selectedData && (
                    <div className="lg:col-span-5 space-y-4">
                        {/* Economic Indicators */}
                        <Card className="bg-gray-900 border-gray-800">
                            <CardHeader className="py-3 px-4 border-b border-gray-800">
                                <CardTitle className="text-sm font-bold text-gray-200 uppercase flex items-center gap-2">
                                    <Building2 className="w-4 h-4 text-blue-400" />
                                    {selectedData.flag} {selectedData.code} - Economic Indicators
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4">
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <div className="bg-gray-950/50 rounded p-3">
                                        <div className="text-[10px] text-gray-500 uppercase mb-1">Interest Rate</div>
                                        <div className="text-lg font-bold text-white">
                                            {selectedData.economicIndicators.interestRate?.toFixed(2)}%
                                        </div>
                                    </div>
                                    <div className="bg-gray-950/50 rounded p-3">
                                        <div className="text-[10px] text-gray-500 uppercase mb-1">Inflation (CPI)</div>
                                        <div className={cn(
                                            "text-lg font-bold",
                                            (selectedData.economicIndicators.inflation || 0) > 3 ? "text-red-400" : "text-green-400"
                                        )}>
                                            {selectedData.economicIndicators.inflation?.toFixed(1)}%
                                        </div>
                                    </div>
                                    <div className="bg-gray-950/50 rounded p-3">
                                        <div className="text-[10px] text-gray-500 uppercase mb-1">GDP Growth</div>
                                        <div className={cn(
                                            "text-lg font-bold",
                                            (selectedData.economicIndicators.gdpGrowth || 0) > 0 ? "text-green-400" : "text-red-400"
                                        )}>
                                            {selectedData.economicIndicators.gdpGrowth?.toFixed(1)}%
                                        </div>
                                    </div>
                                    <div className="bg-gray-950/50 rounded p-3">
                                        <div className="text-[10px] text-gray-500 uppercase mb-1">Unemployment</div>
                                        <div className="text-lg font-bold text-white">
                                            {selectedData.economicIndicators.unemployment?.toFixed(1)}%
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-gray-950/50 rounded p-3 mb-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] text-gray-500 uppercase">Central Bank Stance</span>
                                        <span className={cn(
                                            "text-xs font-bold px-2 py-0.5 rounded",
                                            selectedData.economicIndicators.sentiment === 'HAWKISH' ? "bg-red-500/20 text-red-400" :
                                            selectedData.economicIndicators.sentiment === 'DOVISH' ? "bg-blue-500/20 text-blue-400" :
                                            "bg-gray-500/20 text-gray-400"
                                        )}>
                                            {selectedData.economicIndicators.sentiment}
                                        </span>
                                    </div>
                                    {selectedData.economicIndicators.nextMeeting && (
                                        <div className="text-xs text-gray-400">
                                            Next meeting: <span className="text-white">{selectedData.economicIndicators.nextMeeting}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <div className="text-[10px] text-gray-500 uppercase">Recent Events</div>
                                    {selectedData.economicIndicators.recentEvents.map((event, i) => (
                                        <div key={i} className="text-xs text-gray-400 flex items-start gap-2">
                                            <span className="text-cyan-400">•</span>
                                            {event}
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Flow Analysis */}
                        <Card className="bg-gray-900 border-gray-800">
                            <CardHeader className="py-3 px-4 border-b border-gray-800">
                                <CardTitle className="text-sm font-bold text-gray-200 uppercase flex items-center gap-2">
                                    <DollarSign className="w-4 h-4 text-green-400" />
                                    Capital Flow Analysis
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4">
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <div className="bg-gray-950/50 rounded p-3">
                                        <div className="text-[10px] text-gray-500 uppercase mb-1">Capital Flow</div>
                                        <div className={cn(
                                            "text-sm font-bold flex items-center gap-1",
                                            selectedData.flowAnalysis.capitalFlow === 'INFLOW' ? "text-green-400" :
                                            selectedData.flowAnalysis.capitalFlow === 'OUTFLOW' ? "text-red-400" : "text-gray-400"
                                        )}>
                                            {selectedData.flowAnalysis.capitalFlow === 'INFLOW' && <ArrowUpRight className="w-4 h-4" />}
                                            {selectedData.flowAnalysis.capitalFlow === 'OUTFLOW' && <ArrowDownRight className="w-4 h-4" />}
                                            {selectedData.flowAnalysis.capitalFlow}
                                        </div>
                                    </div>
                                    <div className="bg-gray-950/50 rounded p-3">
                                        <div className="text-[10px] text-gray-500 uppercase mb-1">Institutional Bias</div>
                                        <div className={cn(
                                            "text-sm font-bold",
                                            selectedData.flowAnalysis.institutionalBias === 'LONG' ? "text-green-400" :
                                            selectedData.flowAnalysis.institutionalBias === 'SHORT' ? "text-red-400" : "text-gray-400"
                                        )}>
                                            {selectedData.flowAnalysis.institutionalBias}
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-gray-950/50 rounded p-3">
                                    <div className="text-[10px] text-gray-500 uppercase mb-2">COT Positioning</div>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-gray-400">Commercial</span>
                                            <span className={cn(
                                                "text-xs font-mono",
                                                selectedData.flowAnalysis.cot.commercial > 0 ? "text-green-400" : "text-red-400"
                                            )}>
                                                {selectedData.flowAnalysis.cot.commercial > 0 ? '+' : ''}{selectedData.flowAnalysis.cot.commercial}%
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-gray-400">Non-Commercial</span>
                                            <span className={cn(
                                                "text-xs font-mono",
                                                selectedData.flowAnalysis.cot.nonCommercial > 0 ? "text-green-400" : "text-red-400"
                                            )}>
                                                {selectedData.flowAnalysis.cot.nonCommercial > 0 ? '+' : ''}{selectedData.flowAnalysis.cot.nonCommercial}%
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-gray-400">Retail</span>
                                            <span className={cn(
                                                "text-xs font-mono",
                                                selectedData.flowAnalysis.cot.retail > 0 ? "text-green-400" : "text-red-400"
                                            )}>
                                                {selectedData.flowAnalysis.cot.retail > 0 ? '+' : ''}{selectedData.flowAnalysis.cot.retail}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Correlations */}
                        <Card className="bg-gray-900 border-gray-800">
                            <CardHeader className="py-3 px-4 border-b border-gray-800">
                                <CardTitle className="text-sm font-bold text-gray-200 uppercase flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-yellow-400" />
                                    Currency Correlations
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4">
                                <div className="space-y-2">
                                    {selectedData.correlations.map((corr) => (
                                        <div key={corr.currency} className="flex items-center justify-between p-2 bg-gray-950/50 rounded">
                                            <span className="text-xs text-white font-bold">{corr.currency}</span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-24 h-2 bg-gray-800 rounded-full overflow-hidden">
                                                    <div 
                                                        className={cn(
                                                            "h-full rounded-full",
                                                            corr.correlation > 0 ? "bg-green-500" : "bg-red-500"
                                                        )}
                                                        style={{ 
                                                            width: `${Math.abs(corr.correlation) * 100}%`,
                                                            marginLeft: corr.correlation < 0 ? 'auto' : 0
                                                        }}
                                                    />
                                                </div>
                                                <span className={cn(
                                                    "text-xs font-mono w-12 text-right",
                                                    corr.correlation > 0 ? "text-green-400" : "text-red-400"
                                                )}>
                                                    {corr.correlation > 0 ? '+' : ''}{corr.correlation.toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}
