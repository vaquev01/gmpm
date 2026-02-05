'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    Globe, RefreshCw, TrendingUp, TrendingDown, Minus, Activity,
    DollarSign, Building2, BarChart3, ArrowUpRight, ArrowDownRight,
    AlertTriangle, Zap, Target, Calendar, Package, Users, Map,
    Gauge, Scale, Wallet, Clock, Info, ChevronRight, ArrowLeftRight, Shield, Flame
} from 'lucide-react';

interface CurrencyStrength {
    code: string; name: string; country: string; flag: string; centralBank: string; region: string;
    strength: number; strengthLabel: 'STRONG' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'WEAK';
    bullishPairs: number; bearishPairs: number; totalPairs: number;
    trend: 'UP' | 'DOWN' | 'SIDEWAYS'; momentum: number;
    economicIndicators: {
        interestRate: number | null; inflation: number | null; gdpGrowth: number | null;
        unemployment: number | null; tradeBalance: number | null;
        sentiment: 'HAWKISH' | 'NEUTRAL' | 'DOVISH'; nextMeeting: string | null; recentEvents: string[];
    };
    flowAnalysis: {
        capitalFlow: 'INFLOW' | 'OUTFLOW' | 'NEUTRAL'; flowStrength: number;
        institutionalBias: 'LONG' | 'SHORT' | 'NEUTRAL'; retailSentiment: number;
        cot: { commercial: number; nonCommercial: number; retail: number; };
    };
    correlations: Array<{ currency: string; correlation: number; relationship: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'; }>;
}

interface BestPair {
    symbol: string; base: string; quote: string; direction: 'LONG' | 'SHORT';
    differential: number; baseStrength: number; quoteStrength: number; confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    price?: number;
    tradePlan?: {
        entryZone: { from: number; to: number };
        stopLoss: number;
        takeProfit: number;
        riskReward: number;
        horizon: string;
        executionWindow: string;
    };
}

interface EconomicEvent {
    date: string; time: string; event: string; impact: 'HIGH' | 'MEDIUM' | 'LOW';
    previous: string | null; forecast: string | null; actual: string | null;
}

interface CurrencyData {
    success: boolean; timestamp: string; currencies: CurrencyStrength[];
    globalFlow: { riskSentiment: string; dollarIndex: number | null; vix: number | null; dominantFlow: string; weakestCurrency: string; };
    bestPairs: BestPair[];
    economicCalendar?: Record<string, EconomicEvent[]>;
}

const CURRENCY_META: Record<string, {
    majorExports: string[]; majorImports: string[]; tradingPartners: string[];
    commodityExposure: { oil: number; gold: number; copper: number };
    riskProfile: string; sessionHours: { start: number; end: number; name: string }; keyIndicators: string[];
}> = {
    USD: { majorExports: ['Aircraft', 'Petroleum', 'Cars'], majorImports: ['Cars', 'Petroleum', 'Computers'], tradingPartners: ['China', 'Canada', 'Mexico'], commodityExposure: { oil: -0.3, gold: -0.2, copper: 0.1 }, riskProfile: 'SAFE_HAVEN', sessionHours: { start: 13, end: 22, name: 'New York' }, keyIndicators: ['NFP', 'CPI', 'Fed Decision', 'GDP'] },
    EUR: { majorExports: ['Cars', 'Medicaments', 'Parts'], majorImports: ['Petroleum', 'Cars', 'Gas'], tradingPartners: ['USA', 'China', 'UK'], commodityExposure: { oil: -0.4, gold: 0.1, copper: 0.2 }, riskProfile: 'RISK_NEUTRAL', sessionHours: { start: 7, end: 16, name: 'Frankfurt' }, keyIndicators: ['ECB Decision', 'PMI', 'CPI', 'ZEW'] },
    GBP: { majorExports: ['Gold', 'Cars', 'Turbines'], majorImports: ['Gold', 'Cars', 'Petroleum'], tradingPartners: ['USA', 'Germany', 'Netherlands'], commodityExposure: { oil: 0.3, gold: 0.2, copper: 0.1 }, riskProfile: 'RISK_NEUTRAL', sessionHours: { start: 7, end: 16, name: 'London' }, keyIndicators: ['BoE Decision', 'CPI', 'GDP', 'Employment'] },
    JPY: { majorExports: ['Cars', 'Parts', 'Circuits'], majorImports: ['Petroleum', 'Gas', 'Coal'], tradingPartners: ['China', 'USA', 'Korea'], commodityExposure: { oil: -0.6, gold: 0.3, copper: -0.2 }, riskProfile: 'SAFE_HAVEN', sessionHours: { start: 0, end: 9, name: 'Tokyo' }, keyIndicators: ['BoJ Decision', 'Tankan', 'CPI', 'GDP'] },
    CHF: { majorExports: ['Gold', 'Medicaments', 'Watches'], majorImports: ['Gold', 'Medicaments', 'Cars'], tradingPartners: ['Germany', 'USA', 'France'], commodityExposure: { oil: -0.1, gold: 0.5, copper: 0.0 }, riskProfile: 'SAFE_HAVEN', sessionHours: { start: 7, end: 16, name: 'Zurich' }, keyIndicators: ['SNB Decision', 'CPI', 'KOF'] },
    AUD: { majorExports: ['Iron Ore', 'Coal', 'Gas'], majorImports: ['Cars', 'Petroleum', 'Trucks'], tradingPartners: ['China', 'Japan', 'Korea'], commodityExposure: { oil: 0.2, gold: 0.4, copper: 0.6 }, riskProfile: 'RISK_ON', sessionHours: { start: 22, end: 7, name: 'Sydney' }, keyIndicators: ['RBA Decision', 'Employment', 'CPI'] },
    CAD: { majorExports: ['Petroleum', 'Cars', 'Gas'], majorImports: ['Cars', 'Trucks', 'Parts'], tradingPartners: ['USA', 'China', 'UK'], commodityExposure: { oil: 0.7, gold: 0.2, copper: 0.3 }, riskProfile: 'RISK_ON', sessionHours: { start: 13, end: 22, name: 'Toronto' }, keyIndicators: ['BoC Decision', 'Employment', 'CPI'] },
    NZD: { majorExports: ['Milk', 'Butter', 'Meat'], majorImports: ['Cars', 'Petroleum', 'Trucks'], tradingPartners: ['China', 'Australia', 'USA'], commodityExposure: { oil: -0.2, gold: 0.1, copper: 0.2 }, riskProfile: 'RISK_ON', sessionHours: { start: 21, end: 6, name: 'Wellington' }, keyIndicators: ['RBNZ Decision', 'GDP', 'Dairy'] },
};

export default function CurrencyStrengthView() {
    const [data, setData] = useState<CurrencyData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
    const [compareCurrency, setCompareCurrency] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/currency-strength', { cache: 'no-store' });
            const json = await res.json();
            if (json.success) { setData(json); setLastUpdated(new Date()); setError(null); }
            else { setError(json.error || 'Failed'); }
        } catch { setError('Network error'); } finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [fetchData]);

    const selectedData = useMemo(() => selectedCurrency ? data?.currencies.find(c => c.code === selectedCurrency) : null, [selectedCurrency, data]);
    const compareData = useMemo(() => compareCurrency ? data?.currencies.find(c => c.code === compareCurrency) : null, [compareCurrency, data]);

    const getStrengthColor = (l: string) => l === 'STRONG' ? 'text-green-400 bg-green-500/20' : l === 'BULLISH' ? 'text-emerald-400 bg-emerald-500/20' : l === 'BEARISH' ? 'text-orange-400 bg-orange-500/20' : l === 'WEAK' ? 'text-red-400 bg-red-500/20' : 'text-gray-400 bg-gray-500/20';
    const getStrengthBarColor = (s: number) => s >= 70 ? 'bg-green-500' : s >= 55 ? 'bg-emerald-500' : s >= 45 ? 'bg-gray-500' : s >= 30 ? 'bg-orange-500' : 'bg-red-500';
    const getRiskColor = (p: string) => p === 'SAFE_HAVEN' ? 'text-blue-400 bg-blue-500/20' : p === 'RISK_ON' ? 'text-green-400 bg-green-500/20' : 'text-gray-400 bg-gray-500/20';
    const fmtPrice = (p?: number) => {
        if (typeof p !== 'number' || !Number.isFinite(p)) return 'N/A';
        return p < 10 ? p.toFixed(5) : p.toFixed(2);
    };

    const idealPair = useMemo(() => {
        if (!data?.bestPairs?.length || !data?.globalFlow) return null;
        const direct = `${data.globalFlow.dominantFlow}${data.globalFlow.weakestCurrency}=X`;
        const inverse = `${data.globalFlow.weakestCurrency}${data.globalFlow.dominantFlow}=X`;
        return data.bestPairs.find(p => p.symbol === direct) || data.bestPairs.find(p => p.symbol === inverse) || null;
    }, [data]);

    if (loading && !data) return <div className="p-6 flex items-center justify-center h-[calc(100vh-200px)]"><RefreshCw className="w-8 h-8 animate-spin text-cyan-500" /></div>;
    if (error) return <div className="p-6"><Card className="bg-red-950/20 border-red-900/30"><CardContent className="p-6 text-center"><AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-4" /><p className="text-red-400">{error}</p><Button onClick={fetchData} className="mt-4">Retry</Button></CardContent></Card></div>;

    return (
        <div className="p-4 space-y-4 max-h-[calc(100vh-100px)] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3"><Globe className="w-6 h-6 text-cyan-500" /><h1 className="text-xl font-bold text-white">Currency Strength Analysis</h1></div>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500 font-mono">{lastUpdated?.toLocaleTimeString() || 'N/A'}</span>
                    <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="h-8"><RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /></Button>
                </div>
            </div>

            {/* Global Flow */}
            {data?.globalFlow && (
                <Card className="bg-gradient-to-r from-gray-900 via-gray-900 to-purple-900/20 border-gray-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3"><Activity className="w-4 h-4 text-purple-400" /><span className="text-xs font-bold text-purple-400 uppercase">Global FX Flow</span></div>
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                            <div className="bg-gray-950/50 rounded-lg p-3 border border-gray-800"><div className="text-[10px] text-gray-500 uppercase mb-1 flex items-center gap-1"><Shield className="w-3 h-3" />Risk</div><div className={cn("text-sm font-bold", data.globalFlow.riskSentiment === 'RISK_ON' ? "text-green-400" : data.globalFlow.riskSentiment === 'RISK_OFF' ? "text-red-400" : "text-gray-400")}>{data.globalFlow.riskSentiment}</div></div>
                            {data.globalFlow.dollarIndex && <div className="bg-gray-950/50 rounded-lg p-3 border border-gray-800"><div className="text-[10px] text-gray-500 uppercase mb-1 flex items-center gap-1"><DollarSign className="w-3 h-3" />DXY</div><div className="text-sm font-bold text-cyan-400">{data.globalFlow.dollarIndex.toFixed(2)}</div></div>}
                            {data.globalFlow.vix && <div className="bg-gray-950/50 rounded-lg p-3 border border-gray-800"><div className="text-[10px] text-gray-500 uppercase mb-1 flex items-center gap-1"><Gauge className="w-3 h-3" />VIX</div><div className={cn("text-sm font-bold", data.globalFlow.vix > 25 ? "text-red-400" : "text-green-400")}>{data.globalFlow.vix.toFixed(1)}</div></div>}
                            <div className="bg-gray-950/50 rounded-lg p-3 border border-green-900/30"><div className="text-[10px] text-gray-500 uppercase mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3 text-green-400" />Strongest</div><div className="text-sm font-bold text-green-400">{data.globalFlow.dominantFlow}</div></div>
                            <div className="bg-gray-950/50 rounded-lg p-3 border border-red-900/30"><div className="text-[10px] text-gray-500 uppercase mb-1 flex items-center gap-1"><TrendingDown className="w-3 h-3 text-red-400" />Weakest</div><div className="text-sm font-bold text-red-400">{data.globalFlow.weakestCurrency}</div></div>
                            <div className="bg-gray-950/50 rounded-lg p-3 border border-gray-800"><div className="text-[10px] text-gray-500 uppercase mb-1">Pairs</div><div className="text-sm font-bold text-white">{data.currencies.reduce((s, c) => s + c.totalPairs, 0) / 2}</div></div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* CONCLUSÕES E RECOMENDAÇÕES */}
            {data && (
                <Card className={cn(
                    "border-2",
                    data.globalFlow.riskSentiment === 'RISK_ON' ? "bg-green-950/20 border-green-500/40" :
                    data.globalFlow.riskSentiment === 'RISK_OFF' ? "bg-red-950/20 border-red-500/40" :
                    "bg-gray-900/50 border-gray-700"
                )}>
                    <CardHeader className="py-3 px-4 border-b border-gray-700">
                        <CardTitle className="text-sm font-bold uppercase flex items-center gap-2">
                            <Target className="w-4 h-4" />
                            🎯 CONCLUSÃO & RECOMENDAÇÕES - O Que Fazer Agora
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            {/* Market Conclusion */}
                            <div className="space-y-2">
                                <div className="text-[10px] text-gray-500 uppercase">Conclusão do Mercado</div>
                                <div className={cn(
                                    "text-lg font-bold",
                                    data.globalFlow.riskSentiment === 'RISK_ON' ? "text-green-400" :
                                    data.globalFlow.riskSentiment === 'RISK_OFF' ? "text-red-400" : "text-gray-400"
                                )}>
                                    {data.globalFlow.riskSentiment === 'RISK_ON' ? '🟢 APETITE POR RISCO' :
                                     data.globalFlow.riskSentiment === 'RISK_OFF' ? '🔴 AVERSÃO AO RISCO' :
                                     '⚪ MERCADO NEUTRO'}
                                </div>
                                <div className="text-[11px] text-gray-400">
                                    {data.globalFlow.riskSentiment === 'RISK_ON' ? 
                                        'Institucionais buscando retorno. Moedas de risco (AUD, NZD, CAD) em vantagem.' :
                                     data.globalFlow.riskSentiment === 'RISK_OFF' ? 
                                        'Fuga para segurança. Safe havens (USD, JPY, CHF) em vantagem.' :
                                        'Sem direção clara. Aguardar definição de fluxo.'}
                                </div>
                            </div>

                            {/* Main Recommendation */}
                            <div className="space-y-2">
                                <div className="text-[10px] text-gray-500 uppercase">Estratégia Principal</div>
                                <div className={cn(
                                    "p-3 rounded-lg border",
                                    "bg-gradient-to-r from-green-950/30 to-red-950/30 border-purple-500/30"
                                )}>
                                    <div className="text-center">
                                        <div className="flex items-center justify-center gap-2 mb-2">
                                            <span className="text-lg">{data.currencies.find(c => c.code === data.globalFlow.dominantFlow)?.flag}</span>
                                            <span className="text-white font-bold">COMPRAR {data.globalFlow.dominantFlow}</span>
                                            <span className="text-gray-500">/</span>
                                            <span className="text-white font-bold">VENDER {data.globalFlow.weakestCurrency}</span>
                                            <span className="text-lg">{data.currencies.find(c => c.code === data.globalFlow.weakestCurrency)?.flag}</span>
                                        </div>
                                        <div className="text-[11px] text-purple-400">
                                            Par negociável: {(idealPair?.symbol || `${data.globalFlow.dominantFlow}${data.globalFlow.weakestCurrency}=X`).replace('=X', '')} → {idealPair?.direction || 'LONG'}
                                        </div>

                                        {idealPair?.tradePlan && (
                                            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-left">
                                                <div className="bg-gray-950/40 rounded p-2 border border-gray-800">
                                                    <div className="text-gray-500">Entry</div>
                                                    <div className="text-cyan-400 font-mono font-bold">
                                                        {fmtPrice(idealPair.tradePlan.entryZone.from)} - {fmtPrice(idealPair.tradePlan.entryZone.to)}
                                                    </div>
                                                </div>
                                                <div className="bg-gray-950/40 rounded p-2 border border-gray-800">
                                                    <div className="text-gray-500">RR / Tempo</div>
                                                    <div className="text-purple-400 font-bold">RR {idealPair.tradePlan.riskReward} • {idealPair.tradePlan.horizon}</div>
                                                </div>
                                                <div className="bg-gray-950/40 rounded p-2 border border-gray-800">
                                                    <div className="text-gray-500">SL</div>
                                                    <div className="text-red-400 font-mono font-bold">{fmtPrice(idealPair.tradePlan.stopLoss)}</div>
                                                </div>
                                                <div className="bg-gray-950/40 rounded p-2 border border-gray-800">
                                                    <div className="text-gray-500">TP</div>
                                                    <div className="text-green-400 font-mono font-bold">{fmtPrice(idealPair.tradePlan.takeProfit)}</div>
                                                </div>
                                                <div className="col-span-2 bg-gray-950/40 rounded p-2 border border-gray-800">
                                                    <div className="text-gray-500">Execution Window</div>
                                                    <div className="text-gray-300">{idealPair.tradePlan.executionWindow}</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Risk Level */}
                            <div className="space-y-2">
                                <div className="text-[10px] text-gray-500 uppercase">Nível de Confiança</div>
                                <div className="space-y-2">
                                    {(() => {
                                        const strongest = data.currencies[0];
                                        const weakest = data.currencies[data.currencies.length - 1];
                                        const diff = strongest.strength - weakest.strength;
                                        const conf = diff >= 30 ? 'HIGH' : diff >= 15 ? 'MEDIUM' : 'LOW';
                                        return (
                                            <>
                                                <div className={cn(
                                                    "text-lg font-bold",
                                                    conf === 'HIGH' ? "text-green-400" :
                                                    conf === 'MEDIUM' ? "text-yellow-400" : "text-gray-400"
                                                )}>
                                                    {conf === 'HIGH' ? '✅ ALTA CONFIANÇA' :
                                                     conf === 'MEDIUM' ? '⚠️ MÉDIA CONFIANÇA' :
                                                     '❌ BAIXA CONFIANÇA'}
                                                </div>
                                                <div className="text-[11px] text-gray-400">
                                                    Diferencial de força: {diff} pontos
                                                </div>
                                                <div className="text-[10px] text-gray-500">
                                                    {conf === 'HIGH' ? 'Divergência forte. Bom momento para operar.' :
                                                     conf === 'MEDIUM' ? 'Divergência moderada. Operar com cautela.' :
                                                     'Divergência fraca. Melhor aguardar.'}
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>

                        {/* Top 3 Pairs to Trade */}
                        {data.bestPairs && data.bestPairs.length > 0 && (
                            <div className="border-t border-gray-800 pt-4">
                                <div className="text-[10px] text-gray-500 uppercase mb-3">🏆 TOP 3 PARES PARA OPERAR AGORA</div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    {data.bestPairs.slice(0, 3).map((pair, idx) => {
                                        const baseCurr = data.currencies.find(c => c.code === pair.base);
                                        const quoteCurr = data.currencies.find(c => c.code === pair.quote);
                                        return (
                                            <div key={pair.symbol} className={cn(
                                                "rounded-lg p-3 border",
                                                pair.direction === 'LONG' ? "bg-green-950/20 border-green-500/30" : "bg-red-950/20 border-red-500/30"
                                            )}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-lg font-bold text-white">#{idx + 1}</span>
                                                        <span className="font-bold text-white">{pair.symbol.replace('=X', '')}</span>
                                                    </div>
                                                    <span className={cn(
                                                        "text-xs font-bold px-2 py-1 rounded",
                                                        pair.direction === 'LONG' ? "bg-green-500/30 text-green-300" : "bg-red-500/30 text-red-300"
                                                    )}>
                                                        {pair.direction === 'LONG' ? '📈 COMPRAR' : '📉 VENDER'}
                                                    </span>
                                                </div>
                                                <div className="space-y-1 text-[10px]">
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-500">Força Base ({pair.base}):</span>
                                                        <span className="text-green-400 font-mono">{pair.baseStrength}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-500">Força Quote ({pair.quote}):</span>
                                                        <span className="text-red-400 font-mono">{pair.quoteStrength}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-500">Diferencial:</span>
                                                        <span className="text-purple-400 font-bold">Δ{pair.differential}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-500">Confiança:</span>
                                                        <span className={cn(
                                                            pair.confidence === 'HIGH' ? "text-green-400" :
                                                            pair.confidence === 'MEDIUM' ? "text-yellow-400" : "text-gray-400"
                                                        )}>{pair.confidence}</span>
                                                    </div>
                                                </div>
                                                <div className="mt-2 pt-2 border-t border-gray-800 text-[9px] text-gray-500">
                                                    💡 {pair.direction === 'LONG' ? 
                                                        `${baseCurr?.economicIndicators.sentiment === 'HAWKISH' ? 'BC Hawkish favorece' : 'Momentum positivo'}` :
                                                        `${quoteCurr?.economicIndicators.sentiment === 'DOVISH' ? 'BC Dovish favorece' : 'Momentum negativo'}`}
                                                </div>

                                                {pair.tradePlan && (
                                                    <div className="mt-2 pt-2 border-t border-gray-800 grid grid-cols-2 gap-2 text-[10px]">
                                                        <div>
                                                            <div className="text-gray-500">Entry</div>
                                                            <div className="text-cyan-400 font-mono">
                                                                {fmtPrice(pair.tradePlan.entryZone.from)} - {fmtPrice(pair.tradePlan.entryZone.to)}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="text-gray-500">RR / Time</div>
                                                            <div className="text-purple-400">
                                                                RR {pair.tradePlan.riskReward} • {pair.tradePlan.horizon}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="text-gray-500">SL</div>
                                                            <div className="text-red-400 font-mono">{fmtPrice(pair.tradePlan.stopLoss)}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-gray-500">TP</div>
                                                            <div className="text-green-400 font-mono">{fmtPrice(pair.tradePlan.takeProfit)}</div>
                                                        </div>
                                                        <div className="col-span-2">
                                                            <div className="text-gray-500">Execution Window</div>
                                                            <div className="text-gray-300">{pair.tradePlan.executionWindow}</div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Legend */}
                        <div className="mt-4 p-2 bg-gray-950/50 rounded border border-gray-800">
                            <div className="text-[9px] text-gray-500 text-center">
                                💡 <strong className="text-green-400">RISK ON</strong> = Comprar moedas de risco (AUD, NZD, CAD) | 
                                <strong className="text-red-400"> RISK OFF</strong> = Comprar safe havens (USD, JPY, CHF) | 
                                <strong className="text-purple-400"> Δ Diferencial</strong> = Quanto maior, melhor a oportunidade
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Strength Meter */}
                <div className={cn("space-y-4", selectedCurrency ? "lg:col-span-4" : "lg:col-span-6")}>
                    <Card className="bg-gray-900 border-gray-800">
                        <CardHeader className="py-3 px-4 border-b border-gray-800">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-bold text-gray-200 uppercase flex items-center gap-2"><BarChart3 className="w-4 h-4 text-cyan-400" />Strength Meter</CardTitle>
                                <div className="flex gap-1 text-[8px] text-gray-500">
                                    <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>70+</span>
                                    <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>55</span>
                                    <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>45</span>
                                    <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>30</span>
                                    <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>&lt;30</span>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-3">
                            <div className="space-y-2">
                                {data?.currencies.map((c, i) => {
                                    const meta = CURRENCY_META[c.code];
                                    return (
                                        <div key={c.code} onClick={() => setSelectedCurrency(c.code === selectedCurrency ? null : c.code)}
                                            className={cn("p-3 rounded-lg border cursor-pointer transition-all", selectedCurrency === c.code ? "bg-cyan-900/20 border-cyan-500/50" : "bg-gray-950/50 border-gray-800 hover:border-gray-700")}>
                                            <div className="flex items-center gap-3">
                                                <div className="text-xs text-gray-600 w-4">{i + 1}</div>
                                                <span className="text-2xl">{c.flag}</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-white">{c.code}</span>
                                                        <span className="text-[10px] text-gray-500 truncate">{c.name}</span>
                                                        {meta && <span className={cn("text-[9px] px-1.5 py-0.5 rounded", getRiskColor(meta.riskProfile))}>{meta.riskProfile.replace('_', ' ')}</span>}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                                                            <div className={cn("h-full rounded-full transition-all", getStrengthBarColor(c.strength))} style={{ width: `${c.strength}%` }} />
                                                        </div>
                                                        <span className={cn("text-[10px] font-mono w-8 text-right", c.strength >= 55 ? "text-green-400" : c.strength <= 45 ? "text-red-400" : "text-gray-400")}>{c.strength}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="flex items-center gap-1 justify-end">
                                                        {c.trend === 'UP' && <TrendingUp className="w-3 h-3 text-green-400" />}
                                                        {c.trend === 'DOWN' && <TrendingDown className="w-3 h-3 text-red-400" />}
                                                        {c.trend === 'SIDEWAYS' && <Minus className="w-3 h-3 text-gray-400" />}
                                                        <span className={cn("text-xs font-mono", c.momentum > 0 ? "text-green-400" : c.momentum < 0 ? "text-red-400" : "text-gray-400")}>{c.momentum > 0 ? '+' : ''}{c.momentum.toFixed(2)}%</span>
                                                    </div>
                                                    <div className="text-[10px] text-gray-600 mt-0.5"><span className="text-green-500">{c.bullishPairs}↑</span><span className="mx-1">/</span><span className="text-red-500">{c.bearishPairs}↓</span></div>
                                                </div>
                                                <ChevronRight className={cn("w-4 h-4 text-gray-600 transition-transform", selectedCurrency === c.code && "rotate-90 text-cyan-400")} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Detail Panel */}
                {selectedData && (
                    <div className="lg:col-span-8 space-y-4">
                        {/* Header */}
                        <Card className="bg-gradient-to-r from-gray-900 to-cyan-900/20 border-gray-800">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <span className="text-4xl">{selectedData.flag}</span>
                                        <div>
                                            <div className="flex items-center gap-2"><h2 className="text-xl font-bold text-white">{selectedData.code}</h2><span className={cn("text-xs font-bold px-2 py-0.5 rounded", getStrengthColor(selectedData.strengthLabel))}>{selectedData.strengthLabel}</span></div>
                                            <p className="text-sm text-gray-400">{selectedData.name} • {selectedData.country}</p>
                                            <p className="text-xs text-gray-500">{selectedData.centralBank}</p>
                                        </div>
                                    </div>
                                    <div className="text-right"><div className="text-3xl font-bold text-cyan-400">{selectedData.strength}</div><div className="text-xs text-gray-500">Strength</div></div>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Economic */}
                            <Card className="bg-gray-900 border-gray-800">
                                <CardHeader className="py-2 px-4 border-b border-gray-800"><CardTitle className="text-xs font-bold text-gray-200 uppercase flex items-center gap-2"><Building2 className="w-3 h-3 text-blue-400" />Economic Indicators</CardTitle></CardHeader>
                                <CardContent className="p-3">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-gray-950/50 rounded p-2"><div className="text-[9px] text-gray-500 uppercase">Rate</div><div className="text-base font-bold text-white">{selectedData.economicIndicators.interestRate?.toFixed(2)}%</div></div>
                                        <div className="bg-gray-950/50 rounded p-2"><div className="text-[9px] text-gray-500 uppercase">CPI</div><div className={cn("text-base font-bold", (selectedData.economicIndicators.inflation || 0) > 3 ? "text-red-400" : "text-green-400")}>{selectedData.economicIndicators.inflation?.toFixed(1)}%</div></div>
                                        <div className="bg-gray-950/50 rounded p-2"><div className="text-[9px] text-gray-500 uppercase">GDP</div><div className={cn("text-base font-bold", (selectedData.economicIndicators.gdpGrowth || 0) > 0 ? "text-green-400" : "text-red-400")}>{selectedData.economicIndicators.gdpGrowth?.toFixed(1)}%</div></div>
                                        <div className="bg-gray-950/50 rounded p-2"><div className="text-[9px] text-gray-500 uppercase">Unemp</div><div className="text-base font-bold text-white">{selectedData.economicIndicators.unemployment?.toFixed(1)}%</div></div>
                                    </div>
                                    <div className="mt-2 bg-gray-950/50 rounded p-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[9px] text-gray-500 uppercase">CB Stance</span>
                                            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", selectedData.economicIndicators.sentiment === 'HAWKISH' ? "bg-red-500/20 text-red-400" : selectedData.economicIndicators.sentiment === 'DOVISH' ? "bg-blue-500/20 text-blue-400" : "bg-gray-500/20 text-gray-400")}>{selectedData.economicIndicators.sentiment}</span>
                                        </div>
                                        {selectedData.economicIndicators.nextMeeting && <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-1"><Calendar className="w-3 h-3" />Next: {selectedData.economicIndicators.nextMeeting}</div>}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Flow */}
                            <Card className="bg-gray-900 border-gray-800">
                                <CardHeader className="py-2 px-4 border-b border-gray-800"><CardTitle className="text-xs font-bold text-gray-200 uppercase flex items-center gap-2"><Wallet className="w-3 h-3 text-green-400" />Capital Flow</CardTitle></CardHeader>
                                <CardContent className="p-3">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-gray-950/50 rounded p-2"><div className="text-[9px] text-gray-500 uppercase">Flow</div><div className={cn("text-sm font-bold flex items-center gap-1", selectedData.flowAnalysis.capitalFlow === 'INFLOW' ? "text-green-400" : selectedData.flowAnalysis.capitalFlow === 'OUTFLOW' ? "text-red-400" : "text-gray-400")}>{selectedData.flowAnalysis.capitalFlow === 'INFLOW' && <ArrowUpRight className="w-4 h-4" />}{selectedData.flowAnalysis.capitalFlow === 'OUTFLOW' && <ArrowDownRight className="w-4 h-4" />}{selectedData.flowAnalysis.capitalFlow}</div></div>
                                        <div className="bg-gray-950/50 rounded p-2"><div className="text-[9px] text-gray-500 uppercase">Inst. Bias</div><div className={cn("text-sm font-bold", selectedData.flowAnalysis.institutionalBias === 'LONG' ? "text-green-400" : selectedData.flowAnalysis.institutionalBias === 'SHORT' ? "text-red-400" : "text-gray-400")}>{selectedData.flowAnalysis.institutionalBias}</div></div>
                                    </div>
                                    <div className="mt-2 space-y-1.5"><div className="text-[9px] text-gray-500 uppercase">COT</div>
                                        {['commercial', 'nonCommercial', 'retail'].map(k => (<div key={k} className="flex items-center gap-2"><span className="text-[10px] text-gray-400 w-20 capitalize">{k.replace('nonC', 'Non-C')}</span><div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden"><div className={cn("h-full rounded-full", selectedData.flowAnalysis.cot[k as keyof typeof selectedData.flowAnalysis.cot] > 0 ? "bg-green-500" : "bg-red-500")} style={{ width: `${Math.min(100, Math.abs(selectedData.flowAnalysis.cot[k as keyof typeof selectedData.flowAnalysis.cot]) + 50)}%` }} /></div><span className={cn("text-[10px] font-mono w-10 text-right", selectedData.flowAnalysis.cot[k as keyof typeof selectedData.flowAnalysis.cot] > 0 ? "text-green-400" : "text-red-400")}>{selectedData.flowAnalysis.cot[k as keyof typeof selectedData.flowAnalysis.cot] > 0 ? '+' : ''}{selectedData.flowAnalysis.cot[k as keyof typeof selectedData.flowAnalysis.cot]}%</span></div>))}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Country */}
                        {CURRENCY_META[selectedData.code] && (
                            <Card className="bg-gray-900 border-gray-800">
                                <CardHeader className="py-2 px-4 border-b border-gray-800"><CardTitle className="text-xs font-bold text-gray-200 uppercase flex items-center gap-2"><Map className="w-3 h-3 text-purple-400" />Country Profile</CardTitle></CardHeader>
                                <CardContent className="p-3">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div><div className="text-[9px] text-gray-500 uppercase mb-1 flex items-center gap-1"><Package className="w-3 h-3" />Exports</div><div className="flex flex-wrap gap-1">{CURRENCY_META[selectedData.code].majorExports.map(e => <span key={e} className="text-[9px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded">{e}</span>)}</div></div>
                                        <div><div className="text-[9px] text-gray-500 uppercase mb-1 flex items-center gap-1"><Package className="w-3 h-3" />Imports</div><div className="flex flex-wrap gap-1">{CURRENCY_META[selectedData.code].majorImports.map(i => <span key={i} className="text-[9px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded">{i}</span>)}</div></div>
                                        <div><div className="text-[9px] text-gray-500 uppercase mb-1 flex items-center gap-1"><Users className="w-3 h-3" />Partners</div><div className="text-[10px] text-gray-400">{CURRENCY_META[selectedData.code].tradingPartners.join(' • ')}</div></div>
                                        <div><div className="text-[9px] text-gray-500 uppercase mb-1 flex items-center gap-1"><Clock className="w-3 h-3" />Session</div><div className="text-[10px] text-cyan-400">{CURRENCY_META[selectedData.code].sessionHours.name}</div></div>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-4">
                                        <div><div className="text-[9px] text-gray-500 uppercase mb-1 flex items-center gap-1"><Flame className="w-3 h-3" />Commodity</div><div className="flex gap-3">{Object.entries(CURRENCY_META[selectedData.code].commodityExposure).map(([c, v]) => <div key={c} className="flex items-center gap-1"><span className="text-[10px] text-gray-400 capitalize">{c}:</span><span className={cn("text-[10px] font-mono", v > 0 ? "text-green-400" : v < 0 ? "text-red-400" : "text-gray-400")}>{v > 0 ? '+' : ''}{(v * 100).toFixed(0)}%</span></div>)}</div></div>
                                        <div><div className="text-[9px] text-gray-500 uppercase mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" />Key Events</div><div className="flex flex-wrap gap-1">{CURRENCY_META[selectedData.code].keyIndicators.map(i => <span key={i} className="text-[9px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded">{i}</span>)}</div></div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Correlations */}
                        <Card className="bg-gray-900 border-gray-800">
                            <CardHeader className="py-2 px-4 border-b border-gray-800"><CardTitle className="text-xs font-bold text-gray-200 uppercase flex items-center gap-2"><Zap className="w-3 h-3 text-yellow-400" />Correlations</CardTitle></CardHeader>
                            <CardContent className="p-3">
                                <div className="grid grid-cols-7 gap-1">
                                    {selectedData.correlations.map(cor => {
                                        const o = data?.currencies.find(c => c.code === cor.currency);
                                        return (
                                            <div key={cor.currency} onClick={() => setCompareCurrency(cor.currency)} className="bg-gray-950/50 rounded p-2 text-center cursor-pointer hover:bg-gray-800 transition-all">
                                                <span className="text-lg">{o?.flag}</span>
                                                <div className="text-[10px] font-bold text-white">{cor.currency}</div>
                                                <div className={cn("text-[10px] font-mono mt-1", cor.correlation > 0.3 ? "text-green-400" : cor.correlation < -0.3 ? "text-red-400" : "text-gray-400")}>{cor.correlation > 0 ? '+' : ''}{cor.correlation.toFixed(2)}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Events */}
                        <Card className="bg-gray-900 border-gray-800">
                            <CardHeader className="py-2 px-4 border-b border-gray-800"><CardTitle className="text-xs font-bold text-gray-200 uppercase flex items-center gap-2"><Info className="w-3 h-3 text-blue-400" />Recent Events</CardTitle></CardHeader>
                            <CardContent className="p-3"><div className="space-y-1.5">{selectedData.economicIndicators.recentEvents.map((e, i) => <div key={i} className="text-xs text-gray-400 flex items-start gap-2 bg-gray-950/50 rounded p-2"><span className="text-cyan-400 mt-0.5">•</span>{e}</div>)}</div></CardContent>
                        </Card>

                        {/* Compare */}
                        {compareData && (
                            <Card className="bg-gradient-to-r from-gray-900 to-purple-900/20 border-purple-500/30">
                                <CardHeader className="py-2 px-4 border-b border-purple-500/30"><CardTitle className="text-xs font-bold text-purple-400 uppercase flex items-center gap-2"><Scale className="w-3 h-3" />{selectedData.code} vs {compareData.code}</CardTitle></CardHeader>
                                <CardContent className="p-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-gray-950/50 rounded p-3 text-center"><div className="flex items-center justify-center gap-2"><span className="text-2xl">{selectedData.flag}</span><span className="text-xl font-bold text-cyan-400">{selectedData.strength}</span></div><div className="text-xs text-gray-500 mt-1">Strength</div></div>
                                        <div className="bg-gray-950/50 rounded p-3 text-center"><div className="flex items-center justify-center gap-2"><span className="text-xl font-bold text-purple-400">{compareData.strength}</span><span className="text-2xl">{compareData.flag}</span></div><div className="text-xs text-gray-500 mt-1">Strength</div></div>
                                    </div>
                                    <div className="mt-3 bg-gray-950/50 rounded p-3 text-center">
                                        <div className="text-lg font-bold text-white">{selectedData.code}{compareData.code}</div>
                                        <div className={cn("text-sm font-bold mt-1", selectedData.strength > compareData.strength ? "text-green-400" : "text-red-400")}>{selectedData.strength > compareData.strength ? 'LONG' : 'SHORT'} (Δ{Math.abs(selectedData.strength - compareData.strength)})</div>
                                        <div className="text-xs text-gray-500 mt-1">Rate Δ: {((selectedData.economicIndicators.interestRate || 0) - (compareData.economicIndicators.interestRate || 0)).toFixed(2)}%</div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                )}

                {/* Best Pairs */}
                {!selectedCurrency && data?.bestPairs && data.bestPairs.length > 0 && (
                    <div className="lg:col-span-6 space-y-4">
                        <Card className="bg-gray-900 border-gray-800">
                            <CardHeader className="py-3 px-4 border-b border-gray-800"><CardTitle className="text-sm font-bold text-gray-200 uppercase flex items-center gap-2"><Target className="w-4 h-4 text-green-400" />Best Opportunities</CardTitle></CardHeader>
                            <CardContent className="p-3">
                                <div className="space-y-2">
                                    {data.bestPairs.map(p => (
                                        <div key={p.symbol} className="bg-gray-950/50 rounded-lg p-3 border border-gray-800">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2"><span className="text-sm font-bold text-white">{p.symbol.replace('=X', '')}</span><span className={cn("text-[10px] font-bold px-2 py-0.5 rounded", p.direction === 'LONG' ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400")}>{p.direction}</span></div>
                                                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded", p.confidence === 'HIGH' ? "bg-green-500/20 text-green-400" : p.confidence === 'MEDIUM' ? "bg-yellow-500/20 text-yellow-400" : "bg-gray-500/20 text-gray-400")}>{p.confidence}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-[10px] mb-2">
                                                <div className="flex items-center gap-2"><span className="text-green-400">{p.base}: {p.baseStrength}</span><ArrowLeftRight className="w-3 h-3 text-gray-600" /><span className="text-red-400">{p.quote}: {p.quoteStrength}</span></div>
                                                <span className="text-purple-400">Δ{p.differential}</span>
                                            </div>
                                            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-green-500 to-purple-500 rounded-full" style={{ width: `${Math.min(100, p.differential * 2)}%` }} /></div>

                                            {p.tradePlan && (
                                                <div className="mt-2 pt-2 border-t border-gray-800 grid grid-cols-2 gap-2 text-[10px]">
                                                    <div>
                                                        <div className="text-gray-500">Entry</div>
                                                        <div className="text-cyan-400 font-mono">
                                                            {fmtPrice(p.tradePlan.entryZone.from)} - {fmtPrice(p.tradePlan.entryZone.to)}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-gray-500">RR / Time</div>
                                                        <div className="text-purple-400">
                                                            RR {p.tradePlan.riskReward} • {p.tradePlan.horizon}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-gray-500">SL</div>
                                                        <div className="text-red-400 font-mono">{fmtPrice(p.tradePlan.stopLoss)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-gray-500">TP</div>
                                                        <div className="text-green-400 font-mono">{fmtPrice(p.tradePlan.takeProfit)}</div>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <div className="text-gray-500">Execution Window</div>
                                                        <div className="text-gray-300">{p.tradePlan.executionWindow}</div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>

            {/* Correlation Heatmap */}
            {data?.currencies && (
                <Card className="bg-gray-900 border-gray-800">
                    <CardHeader className="py-3 px-4 border-b border-gray-800">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-bold text-gray-200 uppercase flex items-center gap-2">
                                <Zap className="w-4 h-4 text-yellow-400" />
                                Correlation Heatmap
                            </CardTitle>
                            <div className="flex gap-2 text-[8px] text-gray-500">
                                <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded bg-green-600"></span>+0.6</span>
                                <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded bg-green-500/60"></span>+0.3</span>
                                <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded bg-gray-600"></span>0</span>
                                <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded bg-red-500/60"></span>-0.3</span>
                                <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded bg-red-600"></span>-0.6</span>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr>
                                        <th className="w-12"></th>
                                        {data.currencies.map(c => (
                                            <th key={c.code} className="text-center p-1">
                                                <div className="text-lg">{c.flag}</div>
                                                <div className="text-[9px] text-gray-400 font-bold">{c.code}</div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.currencies.map(row => (
                                        <tr key={row.code}>
                                            <td className="p-1">
                                                <div className="flex items-center gap-1">
                                                    <span className="text-lg">{row.flag}</span>
                                                    <span className="text-[9px] text-gray-400 font-bold">{row.code}</span>
                                                </div>
                                            </td>
                                            {data.currencies.map(col => {
                                                const corr = row.code === col.code ? 1 : (row.correlations.find(c => c.currency === col.code)?.correlation ?? 0);
                                                const bgColor = row.code === col.code ? 'bg-cyan-600' : 
                                                    corr >= 0.6 ? 'bg-green-600' : corr >= 0.3 ? 'bg-green-500/60' : 
                                                    corr >= 0 ? 'bg-gray-700' : corr >= -0.3 ? 'bg-red-500/60' : 'bg-red-600';
                                                return (
                                                    <td key={col.code} className="p-1">
                                                        <div 
                                                            className={cn("w-10 h-10 rounded flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-white/30 transition-all", bgColor)}
                                                            onClick={() => { if (row.code !== col.code) { setSelectedCurrency(row.code); setCompareCurrency(col.code); } }}
                                                            title={`${row.code}/${col.code}: ${corr.toFixed(2)}`}
                                                        >
                                                            <span className="text-[10px] font-mono text-white font-bold">
                                                                {row.code === col.code ? '1.00' : corr.toFixed(2)}
                                                            </span>
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-3 text-[10px] text-gray-500 text-center">
                            Click any cell to compare currencies • Positive correlation = move together • Negative = move opposite
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Economic Calendar */}
            {data?.economicCalendar && (
                <Card className="bg-gray-900 border-gray-800">
                    <CardHeader className="py-3 px-4 border-b border-gray-800">
                        <CardTitle className="text-sm font-bold text-gray-200 uppercase flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-blue-400" />
                            Economic Calendar - Upcoming Events
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {data.currencies.slice(0, 8).map(curr => {
                                const events = data.economicCalendar?.[curr.code] || [];
                                return (
                                    <div key={curr.code} className="bg-gray-950/50 rounded-lg border border-gray-800 overflow-hidden">
                                        <div className="bg-gray-800/50 px-3 py-2 flex items-center gap-2 border-b border-gray-700">
                                            <span className="text-lg">{curr.flag}</span>
                                            <span className="text-xs font-bold text-white">{curr.code}</span>
                                        </div>
                                        <div className="p-2 space-y-1.5 max-h-48 overflow-y-auto">
                                            {events.slice(0, 4).map((ev, i) => (
                                                <div key={i} className="bg-gray-900/50 rounded p-2">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-[9px] text-gray-500">{ev.date} {ev.time}</span>
                                                        <span className={cn("text-[8px] font-bold px-1.5 py-0.5 rounded", ev.impact === 'HIGH' ? "bg-red-500/20 text-red-400" : ev.impact === 'MEDIUM' ? "bg-yellow-500/20 text-yellow-400" : "bg-gray-500/20 text-gray-400")}>{ev.impact}</span>
                                                    </div>
                                                    <div className="text-[10px] font-medium text-white mb-1">{ev.event}</div>
                                                    <div className="flex items-center gap-2 text-[9px]">
                                                        <span className="text-gray-500">Prev: <span className="text-gray-400">{ev.previous || '-'}</span></span>
                                                        <span className="text-gray-500">Fcst: <span className="text-cyan-400">{ev.forecast || '-'}</span></span>
                                                    </div>
                                                </div>
                                            ))}
                                            {events.length === 0 && <div className="text-[10px] text-gray-500 text-center py-2">No events</div>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
