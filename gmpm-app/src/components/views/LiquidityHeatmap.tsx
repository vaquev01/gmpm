'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
    Droplets, TrendingUp, RefreshCw, AlertTriangle,
    ArrowUp, ArrowDown, Minus, Target, Layers, Clock,
    AlertCircle, CheckCircle, Bitcoin, BarChart3, Activity, Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Types
interface EqualLevel {
    price: number;
    type: 'EQUAL_HIGHS' | 'EQUAL_LOWS';
    touches: number;
    strength: 'STRONG' | 'MODERATE' | 'WEAK';
    liquidityEstimate: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface VolumeProfileBar {
    priceRange: { low: number; high: number };
    volume: number;
    volumePercent: number;
    isBuyDominant: boolean;
}

interface LiquidityTiming {
    bestSession: 'LONDON' | 'NEW_YORK' | 'ASIA' | 'OVERLAP_LON_NY';
    avgTimeToLiquidityGrab: string;
    historicalPattern: 'DAILY_SWEEP' | 'WEEKLY_SWEEP' | 'MONTHLY_SWEEP' | 'IRREGULAR';
    probabilityOfSweep: number;
    nextLikelyWindow: string;
}

interface LiquiditySource {
    type: 'EXCHANGE' | 'OTC_CFD' | 'FUTURES_PROXY';
    reliability: 'HIGH' | 'MEDIUM' | 'LOW';
    description: string;
    caveat?: string;
}

interface LiquidityMapData {
    symbol: string;
    displaySymbol: string;
    assetClass: 'forex' | 'etf' | 'crypto' | 'commodity' | 'index';
    currentPrice: number;
    atr: number;
    volumeProfile: VolumeProfileBar[];
    poc: { price: number; volume: number };
    valueArea: { high: number; low: number };
    liquidityZones: {
        priceLevel: number;
        volumeConcentration: number;
        type: 'HIGH_VOLUME' | 'LOW_VOLUME' | 'POC';
        description: string;
    }[];
    equalLevels: EqualLevel[];
    buySideLiquidity: { level: number; strength: number }[];
    sellSideLiquidity: { level: number; strength: number }[];
    marketDirection: 'SEEKING_BUYSIDE' | 'SEEKING_SELLSIDE' | 'BALANCED';
    timing: LiquidityTiming;
    source: LiquiditySource;
    cotData?: {
        commercialNet: number;
        nonCommercialNet: number;
        sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    };
    timestamp: string;
}

type AssetClassKey = 'forex' | 'etf' | 'crypto' | 'commodity' | 'index' | 'all';

interface ClassSummary {
    total: number;
    seekingBuyside: number;
    seekingSellside: number;
    balanced: number;
    topLiquidity: { 
        symbol: string; 
        direction: string; 
        nearestLiquidity: string;
        timing?: string;
        probability?: number;
    }[];
}

interface LiquidityMapResponse {
    success: boolean;
    timestamp: string;
    forex: LiquidityMapData[];
    etf: LiquidityMapData[];
    crypto: LiquidityMapData[];
    commodity: LiquidityMapData[];
    index: LiquidityMapData[];
    all: LiquidityMapData[];
    summary: {
        forex: ClassSummary;
        etf: ClassSummary;
        crypto: ClassSummary;
        commodity: ClassSummary;
        index: ClassSummary;
        total: {
            analyzed: number;
            fromMeso: boolean;
            seekingBuyside: number;
            seekingSellside: number;
        };
    };
}

const directionColors = {
    SEEKING_BUYSIDE: 'text-green-400 bg-green-500/20 border-green-500/30',
    SEEKING_SELLSIDE: 'text-red-400 bg-red-500/20 border-red-500/30',
    BALANCED: 'text-gray-400 bg-gray-500/20 border-gray-500/30',
};

// Generate actionable conclusion for each asset
function generateConclusion(data: LiquidityMapData): {
    action: 'WAIT_LONG' | 'WAIT_SHORT' | 'MONITOR' | 'NO_TRADE';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    summary: string;
    entryZone?: { from: number; to: number };
    stopLoss?: number;
    takeProfit?: number;
    riskReward?: number;
    target: string;
    invalidation: string;
    timing: string;
    horizon?: string;
} {
    const roundPrice = (p: number) => (p < 10 ? Number(p.toFixed(5)) : Number(p.toFixed(2)));
    const band = Math.max(data.atr * 0.1, data.currentPrice * 0.001);
    const slBuffer = Math.max(data.atr * 0.25, data.currentPrice * 0.002);

    const nearestBuy = data.buySideLiquidity[0];
    const nearestSell = data.sellSideLiquidity[0];
    const distToBuy = nearestBuy ? ((nearestBuy.level - data.currentPrice) / data.currentPrice * 100) : null;
    const distToSell = nearestSell ? ((data.currentPrice - nearestSell.level) / data.currentPrice * 100) : null;
    const sweepProb = data.timing?.probabilityOfSweep || 0;
    
    // Determine action based on market direction and liquidity proximity
    if (data.marketDirection === 'SEEKING_BUYSIDE' && nearestBuy && distToBuy !== null && distToBuy < 2) {
        const entryFrom = nearestBuy.level - band;
        const entryTo = nearestBuy.level + band * 0.25;
        const stopLoss = nearestBuy.level + slBuffer;
        const takeProfit = data.poc.price < entryFrom ? data.poc.price : (data.valueArea.low < entryFrom ? data.valueArea.low : (data.currentPrice - data.atr));
        const entryMid = (entryFrom + entryTo) / 2;
        const rr = Math.abs(entryMid - takeProfit) / Math.abs(stopLoss - entryMid);

        return {
            action: 'WAIT_SHORT',
            confidence: sweepProb >= 60 ? 'HIGH' : sweepProb >= 40 ? 'MEDIUM' : 'LOW',
            summary: `Buy-side acima (${nearestBuy.level.toFixed(data.currentPrice < 10 ? 4 : 2)}). Esperar sweep acima e entrar SHORT na reversão (rejeição).`,
            entryZone: { from: roundPrice(entryFrom), to: roundPrice(entryTo) },
            stopLoss: roundPrice(stopLoss),
            takeProfit: roundPrice(takeProfit),
            riskReward: Math.round(rr * 100) / 100,
            target: `${roundPrice(takeProfit)}`,
            invalidation: `Fechamento acima de ${roundPrice(stopLoss)}`,
            timing: data.timing?.nextLikelyWindow || 'Próxima sessão',
            horizon: data.timing?.avgTimeToLiquidityGrab || '2-6h',
        };
    }
    
    if (data.marketDirection === 'SEEKING_SELLSIDE' && nearestSell && distToSell !== null && distToSell < 2) {
        const entryFrom = nearestSell.level - band * 0.25;
        const entryTo = nearestSell.level + band;
        const stopLoss = nearestSell.level - slBuffer;
        const takeProfit = data.poc.price > entryTo ? data.poc.price : (data.valueArea.high > entryTo ? data.valueArea.high : (data.currentPrice + data.atr));
        const entryMid = (entryFrom + entryTo) / 2;
        const rr = Math.abs(takeProfit - entryMid) / Math.abs(entryMid - stopLoss);

        return {
            action: 'WAIT_LONG',
            confidence: sweepProb >= 60 ? 'HIGH' : sweepProb >= 40 ? 'MEDIUM' : 'LOW',
            summary: `Sell-side abaixo (${nearestSell.level.toFixed(data.currentPrice < 10 ? 4 : 2)}). Esperar sweep abaixo e entrar LONG na reversão (reclaim).`,
            entryZone: { from: roundPrice(entryFrom), to: roundPrice(entryTo) },
            stopLoss: roundPrice(stopLoss),
            takeProfit: roundPrice(takeProfit),
            riskReward: Math.round(rr * 100) / 100,
            target: `${roundPrice(takeProfit)}`,
            invalidation: `Fechamento abaixo de ${roundPrice(stopLoss)}`,
            timing: data.timing?.nextLikelyWindow || 'Próxima sessão',
            horizon: data.timing?.avgTimeToLiquidityGrab || '2-6h',
        };
    }
    
    if (data.marketDirection !== 'BALANCED' && (distToBuy || distToSell)) {
        return {
            action: 'MONITOR',
            confidence: 'MEDIUM',
            summary: `Liquidez detectada mas distante. Aguardar aproximação do preço às zonas de liquidez.`,
            target: data.marketDirection === 'SEEKING_BUYSIDE' ? `${nearestBuy?.level.toFixed(2) || 'N/A'}` : `${nearestSell?.level.toFixed(2) || 'N/A'}`,
            invalidation: 'N/A - Aguardar',
            timing: '2-4 horas'
        };
    }
    
    return {
        action: 'NO_TRADE',
        confidence: 'LOW',
        summary: 'Sem liquidez clara detectada. Melhor aguardar formação de novas zonas.',
        target: 'N/A',
        invalidation: 'N/A',
        timing: 'Indefinido'
    };
}

// Actionable Insights Panel - Enhanced Version
const ActionableInsightsPanel = ({ assets }: { assets: LiquidityMapData[] }) => {
    const opportunities = assets
        .map(a => ({ asset: a, conclusion: generateConclusion(a) }))
        .filter(x => x.conclusion.action !== 'NO_TRADE')
        .sort((a, b) => {
            const confOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
            const actOrder = { WAIT_LONG: 0, WAIT_SHORT: 0, MONITOR: 1, NO_TRADE: 2 };
            return (confOrder[a.conclusion.confidence] - confOrder[b.conclusion.confidence]) ||
                   (actOrder[a.conclusion.action] - actOrder[b.conclusion.action]);
        });

    const actionable = opportunities.filter(x => x.conclusion.action === 'WAIT_LONG' || x.conclusion.action === 'WAIT_SHORT');
    const topPicks = actionable.filter(x => x.conclusion.confidence === 'HIGH').slice(0, 3);
    const watchlist = actionable.filter(x => x.conclusion.confidence === 'MEDIUM').slice(0, 6);
    
    // Market overview
    const seekingBuy = assets.filter(a => a.marketDirection === 'SEEKING_BUYSIDE').length;
    const seekingSell = assets.filter(a => a.marketDirection === 'SEEKING_SELLSIDE').length;
    const marketBias = seekingBuy > seekingSell ? 'BULLISH' : seekingSell > seekingBuy ? 'BEARISH' : 'NEUTRAL';

    return (
        <div className="space-y-4">
            {/* Market Conclusion */}
            <Card className={cn(
                "border-2",
                marketBias === 'BULLISH' ? "bg-green-950/20 border-green-500/40" :
                marketBias === 'BEARISH' ? "bg-red-950/20 border-red-500/40" :
                "bg-gray-900/50 border-gray-700"
            )}>
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-bold uppercase flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        📊 CONCLUSÃO GERAL DO MERCADO
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <div className="text-[10px] text-gray-500 uppercase">Viés Predominante</div>
                            <div className={cn(
                                "text-xl font-bold",
                                marketBias === 'BULLISH' ? "text-green-400" :
                                marketBias === 'BEARISH' ? "text-red-400" : "text-gray-400"
                            )}>
                                {marketBias === 'BULLISH' ? '🟣 LIQUIDEZ ACIMA (BUY-SIDE DOMINANTE)' :
                                 marketBias === 'BEARISH' ? '🟡 LIQUIDEZ ABAIXO (SELL-SIDE DOMINANTE)' :
                                 '⚪ MERCADO EQUILIBRADO'}
                            </div>
                            <div className="text-[11px] text-gray-400">
                                {seekingBuy} ativos buscando liquidez acima | {seekingSell} abaixo
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-[10px] text-gray-500 uppercase">O Que Isso Significa</div>
                            <div className="text-[11px] text-gray-300">
                                {marketBias === 'BULLISH' ? 
                                    '• Muitos ativos buscando stops acima (buy-side)\n• Plano principal: esperar sweep acima e procurar SHORT na rejeição\n• Alternativa: se houver reclaim/continuação, operar pullback LONG' :
                                 marketBias === 'BEARISH' ? 
                                    '• Muitos ativos buscando stops abaixo (sell-side)\n• Plano principal: esperar sweep abaixo e procurar LONG no reclaim\n• Alternativa: se houver continuação, operar pullback SHORT' :
                                    '• Mercado sem direção clara\n• Aguardar definição de bias\n• Operar apenas níveis muito claros'}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-[10px] text-gray-500 uppercase">Recomendação</div>
                            <div className={cn(
                                "p-2 rounded border text-[11px] font-medium",
                                marketBias === 'BULLISH' ? "bg-green-500/10 border-green-500/30 text-green-300" :
                                marketBias === 'BEARISH' ? "bg-red-500/10 border-red-500/30 text-red-300" :
                                "bg-yellow-500/10 border-yellow-500/30 text-yellow-300"
                            )}>
                                {marketBias === 'BULLISH' ? 
                                    '✓ Priorizar SHORT após sweep acima (rejeição)' :
                                 marketBias === 'BEARISH' ? 
                                    '✓ Priorizar LONG após sweep abaixo (reclaim)' :
                                    '⚠️ Reduzir exposição e aguardar clareza'}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Top Picks */}
            {topPicks.length > 0 && (
                <Card className="bg-gradient-to-r from-green-950/30 via-gray-900 to-green-950/30 border-green-500/40">
                    <CardHeader className="py-3 px-4 border-b border-green-500/20">
                        <CardTitle className="text-sm font-bold text-green-300 uppercase flex items-center gap-2">
                            <Target className="w-4 h-4" />
                            🎯 TOP OPORTUNIDADES (Alta Confiança)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {topPicks.map(({ asset, conclusion }, idx) => (
                                <div key={asset.symbol} className="bg-gray-900/80 rounded-lg p-4 border border-green-500/20">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg font-bold text-white">#{idx + 1}</span>
                                            <span className="font-bold text-green-400">{asset.displaySymbol}</span>
                                        </div>
                                        <Badge className={cn(
                                            "text-[10px]",
                                            conclusion.action === 'WAIT_LONG' ? "bg-green-500/30 text-green-300" :
                                            "bg-red-500/30 text-red-300"
                                        )}>
                                            {conclusion.action === 'WAIT_LONG' ? '📈 LONG' : '📉 SHORT'}
                                        </Badge>
                                    </div>
                                    
                                    <div className="space-y-2 text-[11px]">
                                        <div className="p-2 bg-gray-950/50 rounded">
                                            <div className="text-gray-400 mb-1">📋 Plano de Ação:</div>
                                            <div className="text-gray-200">{conclusion.summary}</div>
                                        </div>

                                        {conclusion.entryZone && typeof conclusion.stopLoss === 'number' && typeof conclusion.takeProfit === 'number' && (
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <span className="text-gray-500">Entry:</span>
                                                    <div className="text-cyan-400 font-mono font-bold">{conclusion.entryZone.from} - {conclusion.entryZone.to}</div>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500">RR / Tempo:</span>
                                                    <div className="text-purple-400">{conclusion.riskReward ? `RR ${conclusion.riskReward}` : 'RR'} • {conclusion.horizon || conclusion.timing}</div>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500">SL:</span>
                                                    <div className="text-red-400 font-mono font-bold">{conclusion.stopLoss}</div>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500">TP:</span>
                                                    <div className="text-green-400 font-mono font-bold">{conclusion.takeProfit}</div>
                                                </div>
                                            </div>
                                        )}
                                        
                                        <div className="pt-2 border-t border-gray-800">
                                            <span className="text-gray-500">🚫 Invalidação:</span>
                                            <div className="text-red-400 font-mono text-[10px]">{conclusion.invalidation}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Watchlist */}
            {watchlist.length > 0 && (
                <Card className="bg-gray-900/50 border-yellow-500/30">
                    <CardHeader className="py-3 px-4 border-b border-yellow-500/20">
                        <CardTitle className="text-sm font-bold text-yellow-300 uppercase flex items-center gap-2">
                            <Eye className="w-4 h-4" />
                            👀 WATCHLIST (Monitorar)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {watchlist.map(({ asset, conclusion }) => (
                                <div key={asset.symbol} className="bg-gray-900/80 rounded p-3 border border-gray-700">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-bold text-white text-sm">{asset.displaySymbol}</span>
                                        <Badge variant="outline" className="text-[8px] border-yellow-500/50 text-yellow-400">
                                            {conclusion.action === 'WAIT_LONG' ? 'LONG' : 
                                             conclusion.action === 'WAIT_SHORT' ? 'SHORT' : 'WATCH'}
                                        </Badge>
                                    </div>
                                    <div className="text-[10px] text-gray-400">{conclusion.summary.slice(0, 60)}...</div>
                                    {conclusion.entryZone && (
                                        <div className="mt-2 text-[9px] space-y-1">
                                            <div>
                                                <span className="text-gray-500">Entry: </span>
                                                <span className="text-cyan-400 font-mono">{conclusion.entryZone.from}-{conclusion.entryZone.to}</span>
                                            </div>
                                            <div>
                                                <span className="text-gray-500">TP/SL: </span>
                                                <span className="text-green-400 font-mono">{conclusion.takeProfit}</span>
                                                <span className="text-gray-600"> / </span>
                                                <span className="text-red-400 font-mono">{conclusion.stopLoss}</span>
                                            </div>
                                            <div>
                                                <span className="text-gray-500">Tempo: </span>
                                                <span className="text-purple-400">{conclusion.horizon || conclusion.timing}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Legend */}
            <div className="p-3 bg-gray-950/50 rounded-lg border border-gray-800">
                <div className="text-[10px] text-gray-400 text-center space-x-4">
                    <span>💡 <strong className="text-green-400">LONG</strong> = Sweep abaixo + reclaim (reversão)</span>
                    <span>|</span>
                    <span><strong className="text-red-400">SHORT</strong> = Sweep acima + rejeição (reversão)</span>
                    <span>|</span>
                    <span><strong className="text-yellow-400">WATCH</strong> = Aguardar aproximação do preço</span>
                </div>
            </div>
        </div>
    );
};

const directionIcons = {
    SEEKING_BUYSIDE: ArrowUp,
    SEEKING_SELLSIDE: ArrowDown,
    BALANCED: Minus,
};

const directionLabels = {
    SEEKING_BUYSIDE: 'Buscando Liquidez Acima',
    SEEKING_SELLSIDE: 'Buscando Liquidez Abaixo',
    BALANCED: 'Equilibrado',
};

// Volume Profile Bar Component
const VolumeBar = ({ bar, maxVolume, currentPrice }: { 
    bar: VolumeProfileBar; 
    maxVolume: number;
    currentPrice: number;
}) => {
    const midPrice = (bar.priceRange.low + bar.priceRange.high) / 2;
    const isCurrentLevel = currentPrice >= bar.priceRange.low && currentPrice <= bar.priceRange.high;
    const width = (bar.volume / maxVolume) * 100;
    
    return (
        <div className={cn(
            "flex items-center gap-2 py-0.5",
            isCurrentLevel && "bg-blue-500/10 rounded"
        )}>
            <div className="w-16 text-[10px] text-right font-mono text-gray-500">
                {midPrice.toFixed(midPrice < 10 ? 4 : 2)}
            </div>
            <div className="flex-1 h-3 bg-gray-800/50 rounded overflow-hidden">
                <div 
                    className={cn(
                        "h-full rounded transition-all",
                        bar.isBuyDominant ? "bg-green-500/60" : "bg-red-500/60"
                    )}
                    style={{ width: `${width}%` }}
                />
            </div>
            <div className="w-10 text-[10px] text-gray-500">
                {bar.volumePercent.toFixed(1)}%
            </div>
        </div>
    );
};

// Asset Liquidity Card
const AssetLiquidityCard = ({ data }: { data: LiquidityMapData }) => {
    const DirIcon = directionIcons[data.marketDirection];
    const conclusion = generateConclusion(data);
    const maxVolume = Math.max(...data.volumeProfile.map(b => b.volume), 1);
    
    // Get top 10 volume bars around current price
    const sortedBars = [...data.volumeProfile].sort((a, b) => {
        const aMid = (a.priceRange.low + a.priceRange.high) / 2;
        const bMid = (b.priceRange.low + b.priceRange.high) / 2;
        return Math.abs(aMid - data.currentPrice) - Math.abs(bMid - data.currentPrice);
    }).slice(0, 12);
    
    // Sort by price for display
    const displayBars = sortedBars.sort((a, b) => 
        (b.priceRange.low + b.priceRange.high) / 2 - (a.priceRange.low + a.priceRange.high) / 2
    );
    
    return (
        <Card className="bg-gray-900/80 border-gray-800">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-gray-100">{data.displaySymbol}</span>
                        <Badge variant="outline" className="text-[9px]">
                            {data.assetClass.toUpperCase()}
                        </Badge>
                        {conclusion.action !== 'NO_TRADE' && (
                            <Badge className={cn(
                                "text-[9px]",
                                conclusion.action === 'WAIT_LONG' ? "bg-green-500/20 text-green-400" :
                                conclusion.action === 'WAIT_SHORT' ? "bg-red-500/20 text-red-400" :
                                "bg-yellow-500/20 text-yellow-400"
                            )}>
                                {conclusion.action === 'WAIT_LONG' ? 'PLAN LONG' :
                                 conclusion.action === 'WAIT_SHORT' ? 'PLAN SHORT' :
                                 'MONITORAR'}
                            </Badge>
                        )}
                    </div>
                    <Badge className={cn("text-[10px]", directionColors[data.marketDirection])}>
                        <DirIcon className="w-3 h-3 mr-1" />
                        {directionLabels[data.marketDirection]}
                    </Badge>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-gray-500">
                    <span>Preço: <span className="text-gray-300 font-mono">{data.currentPrice.toFixed(data.currentPrice < 10 ? 5 : 2)}</span></span>
                    <span>ATR: <span className="text-gray-300 font-mono">{data.atr.toFixed(data.atr < 1 ? 5 : 2)}</span></span>
                    <span>POC: <span className="text-cyan-400 font-mono">{data.poc.price.toFixed(data.poc.price < 10 ? 5 : 2)}</span></span>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {conclusion.action !== 'NO_TRADE' && conclusion.entryZone && conclusion.stopLoss && conclusion.takeProfit && (
                    <div className="bg-gray-950/40 rounded-lg border border-gray-800 p-3">
                        <div className="text-[10px] text-gray-500 uppercase mb-2 flex items-center justify-between">
                            <span>Trade Plan</span>
                            <span className={cn(
                                conclusion.confidence === 'HIGH' ? 'text-green-400' : conclusion.confidence === 'MEDIUM' ? 'text-yellow-400' : 'text-gray-400'
                            )}>Conf: {conclusion.confidence}{typeof conclusion.riskReward === 'number' ? ` • RR ${conclusion.riskReward}` : ''}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div>
                                <div className="text-gray-500">Entry</div>
                                <div className="text-cyan-400 font-mono">
                                    {conclusion.entryZone.from} - {conclusion.entryZone.to}
                                </div>
                            </div>
                            <div>
                                <div className="text-gray-500">Time</div>
                                <div className="text-purple-400">{conclusion.horizon || conclusion.timing}</div>
                            </div>
                            <div>
                                <div className="text-gray-500">SL</div>
                                <div className="text-red-400 font-mono">{conclusion.stopLoss}</div>
                            </div>
                            <div>
                                <div className="text-gray-500">TP</div>
                                <div className="text-green-400 font-mono">{conclusion.takeProfit}</div>
                            </div>
                        </div>
                        <div className="mt-2 text-[10px] text-gray-400">{conclusion.summary}</div>
                    </div>
                )}

                {/* Volume Profile */}
                <div>
                    <div className="text-[10px] text-gray-500 uppercase mb-1">Volume Profile</div>
                    <div className="space-y-0.5">
                        {displayBars.map((bar, i) => (
                            <VolumeBar 
                                key={i} 
                                bar={bar} 
                                maxVolume={maxVolume}
                                currentPrice={data.currentPrice}
                            />
                        ))}
                    </div>
                </div>
                
                {/* Value Area */}
                <div className="flex items-center justify-between text-[11px] border-t border-gray-800 pt-2">
                    <div>
                        <span className="text-gray-500">Value Area: </span>
                        <span className="text-gray-300 font-mono">
                            {data.valueArea.low.toFixed(data.valueArea.low < 10 ? 4 : 2)} - {data.valueArea.high.toFixed(data.valueArea.high < 10 ? 4 : 2)}
                        </span>
                    </div>
                </div>
                
                {/* Equal Levels (Liquidity) */}
                {data.equalLevels.length > 0 && (
                    <div className="border-t border-gray-800 pt-2">
                        <div className="text-[10px] text-gray-500 uppercase mb-1">Zonas de Liquidez</div>
                        <div className="grid grid-cols-2 gap-2">
                            {/* Buy Side */}
                            <div>
                                <div className="text-[9px] text-green-400 mb-1">▲ BUY SIDE (Equal Highs)</div>
                                {data.buySideLiquidity.slice(0, 3).map((liq, i) => (
                                    <div key={i} className="flex items-center justify-between text-[10px]">
                                        <span className="font-mono text-gray-300">{liq.level.toFixed(liq.level < 10 ? 5 : 2)}</span>
                                        <Progress value={liq.strength} className="w-12 h-1.5" />
                                    </div>
                                ))}
                                {data.buySideLiquidity.length === 0 && (
                                    <div className="text-[10px] text-gray-600">Nenhuma detectada</div>
                                )}
                            </div>
                            {/* Sell Side */}
                            <div>
                                <div className="text-[9px] text-red-400 mb-1">▼ SELL SIDE (Equal Lows)</div>
                                {data.sellSideLiquidity.slice(0, 3).map((liq, i) => (
                                    <div key={i} className="flex items-center justify-between text-[10px]">
                                        <span className="font-mono text-gray-300">{liq.level.toFixed(liq.level < 10 ? 5 : 2)}</span>
                                        <Progress value={liq.strength} className="w-12 h-1.5" />
                                    </div>
                                ))}
                                {data.sellSideLiquidity.length === 0 && (
                                    <div className="text-[10px] text-gray-600">Nenhuma detectada</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Timing Analysis */}
                {data.timing && (
                    <div className="border-t border-gray-800 pt-2">
                        <div className="text-[10px] text-gray-500 uppercase mb-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Timing de Liquidez
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div>
                                <span className="text-gray-500">Próx. Janela: </span>
                                <span className="text-cyan-400">{data.timing.nextLikelyWindow}</span>
                            </div>
                            <div>
                                <span className="text-gray-500">Prob. Sweep: </span>
                                <span className={cn(
                                    data.timing.probabilityOfSweep >= 60 ? 'text-green-400' :
                                    data.timing.probabilityOfSweep >= 40 ? 'text-yellow-400' : 'text-gray-400'
                                )}>{data.timing.probabilityOfSweep}%</span>
                            </div>
                            <div>
                                <span className="text-gray-500">Padrão: </span>
                                <span className="text-gray-300">{data.timing.historicalPattern.replace('_', ' ')}</span>
                            </div>
                            <div>
                                <span className="text-gray-500">Tempo Médio: </span>
                                <span className="text-gray-300">{data.timing.avgTimeToLiquidityGrab}</span>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Source Info */}
                {data.source && (
                    <div className="border-t border-gray-800 pt-2">
                        <div className="flex items-center gap-2 text-[10px]">
                            {data.source.reliability === 'HIGH' ? (
                                <CheckCircle className="w-3 h-3 text-green-400" />
                            ) : data.source.reliability === 'MEDIUM' ? (
                                <AlertCircle className="w-3 h-3 text-yellow-400" />
                            ) : (
                                <AlertTriangle className="w-3 h-3 text-red-400" />
                            )}
                            <span className="text-gray-500">
                                {data.source.type === 'EXCHANGE' ? 'Volume Real (Bolsa)' :
                                 data.source.type === 'OTC_CFD' ? 'Volume Sintético (CFD/OTC)' :
                                 'Volume Futuros (Proxy)'}
                            </span>
                            <Badge variant="outline" className={cn(
                                "text-[8px]",
                                data.source.reliability === 'HIGH' ? 'border-green-500 text-green-400' :
                                data.source.reliability === 'MEDIUM' ? 'border-yellow-500 text-yellow-400' :
                                'border-red-500 text-red-400'
                            )}>
                                {data.source.reliability}
                            </Badge>
                        </div>
                        {data.source.caveat && (
                            <div className="text-[9px] text-yellow-500/70 mt-1 italic">
                                ⚠️ {data.source.caveat}
                            </div>
                        )}
                    </div>
                )}
                
                {/* COT Data (Forex only) */}
                {data.cotData && (
                    <div className="border-t border-gray-800 pt-2">
                        <div className="text-[10px] text-gray-500 uppercase mb-1">COT (Posicionamento Institucional)</div>
                        <div className="flex items-center justify-between text-[10px]">
                            <div>
                                <span className="text-gray-500">Especuladores: </span>
                                <span className={cn(
                                    data.cotData.nonCommercialNet > 0 ? 'text-green-400' : 'text-red-400'
                                )}>
                                    {data.cotData.nonCommercialNet > 0 ? '+' : ''}{(data.cotData.nonCommercialNet / 1000).toFixed(1)}K
                                </span>
                            </div>
                            <Badge className={cn(
                                "text-[9px]",
                                data.cotData.sentiment === 'BULLISH' ? 'bg-green-500/20 text-green-400' :
                                data.cotData.sentiment === 'BEARISH' ? 'bg-red-500/20 text-red-400' :
                                'bg-gray-500/20 text-gray-400'
                            )}>
                                {data.cotData.sentiment}
                            </Badge>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

// Summary Card
const SummaryCard = ({ 
    title, 
    data, 
    icon: Icon 
}: { 
    title: string; 
    data: LiquidityMapResponse['summary']['forex']; 
    icon: React.ElementType;
}) => (
    <Card className="bg-gray-900/80 border-gray-800">
        <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
                <Icon className="w-4 h-4 text-blue-400" />
                {title}
            </CardTitle>
        </CardHeader>
        <CardContent>
            <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="text-center">
                    <div className="text-xl font-bold text-gray-100">{data.total}</div>
                    <div className="text-[9px] text-gray-500 uppercase">Total</div>
                </div>
                <div className="text-center">
                    <div className="text-xl font-bold text-green-400">{data.seekingBuyside}</div>
                    <div className="text-[9px] text-gray-500 uppercase">Buy Side</div>
                </div>
                <div className="text-center">
                    <div className="text-xl font-bold text-red-400">{data.seekingSellside}</div>
                    <div className="text-[9px] text-gray-500 uppercase">Sell Side</div>
                </div>
                <div className="text-center">
                    <div className="text-xl font-bold text-gray-400">{data.balanced}</div>
                    <div className="text-[9px] text-gray-500 uppercase">Balanced</div>
                </div>
            </div>
            
            {data.topLiquidity.length > 0 && (
                <div className="border-t border-gray-800 pt-2">
                    <div className="text-[10px] text-gray-500 uppercase mb-1">Top Liquidity Targets</div>
                    {data.topLiquidity.map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-[11px] py-0.5">
                            <span className="font-bold text-gray-200">{item.symbol}</span>
                            <Badge className={cn(
                                "text-[9px]",
                                item.direction === 'SEEKING_BUYSIDE' ? 'bg-green-500/20 text-green-400' :
                                item.direction === 'SEEKING_SELLSIDE' ? 'bg-red-500/20 text-red-400' :
                                'bg-gray-500/20 text-gray-400'
                            )}>
                                {item.direction === 'SEEKING_BUYSIDE' ? '▲' : item.direction === 'SEEKING_SELLSIDE' ? '▼' : '—'} {item.nearestLiquidity}
                            </Badge>
                        </div>
                    ))}
                </div>
            )}
        </CardContent>
    </Card>
);

// Asset class config
const assetClassConfig: Record<AssetClassKey, { label: string; icon: React.ElementType; color: string }> = {
    forex: { label: 'Forex', icon: TrendingUp, color: 'blue' },
    etf: { label: 'ETFs', icon: Layers, color: 'purple' },
    crypto: { label: 'Crypto', icon: Bitcoin, color: 'orange' },
    commodity: { label: 'Commodities', icon: BarChart3, color: 'yellow' },
    index: { label: 'Índices', icon: Target, color: 'cyan' },
    all: { label: 'Todos', icon: Droplets, color: 'gray' }
};

// Main Component
export const LiquidityHeatmap = () => {
    const [data, setData] = useState<LiquidityMapResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<AssetClassKey>('forex');

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/liquidity-map');
            const json = await res.json();
            if (json.success) {
                setData(json);
            } else {
                setError(json.error || 'Failed to fetch liquidity map');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to fetch');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000); // 60s refresh
        return () => clearInterval(interval);
    }, [fetchData]);

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center space-y-4">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-400 mx-auto" />
                    <div className="text-gray-400">Carregando Mapa de Liquidez...</div>
                    <div className="text-[11px] text-gray-500">Analisando volume profile e zonas de liquidez</div>
                </div>
            </div>
        );
    }

    if (error && !data) {
        return (
            <Card className="bg-red-950/20 border-red-900/40">
                <CardContent className="p-6 text-center">
                    <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                    <div className="text-red-400 font-bold">Falha ao carregar Mapa de Liquidez</div>
                    <div className="text-sm text-gray-500 mt-1">{error}</div>
                    <button
                        onClick={fetchData}
                        className="mt-4 px-4 py-2 bg-red-500/20 border border-red-500/30 rounded text-red-400 hover:bg-red-500/30 transition-colors"
                    >
                        Tentar Novamente
                    </button>
                </CardContent>
            </Card>
        );
    }

    if (!data) return null;

    return (
        <div className="space-y-6 max-w-[1700px] mx-auto pb-20">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                        <Droplets className="w-8 h-8 text-blue-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-100 tracking-tight flex items-center gap-3">
                            LIQUIDITY MAP
                            <Badge variant="outline" className="border-blue-500 text-blue-400 bg-blue-500/10 text-[10px] tracking-widest">
                                VOLUME PROFILE
                            </Badge>
                        </h1>
                        <p className="text-xs text-gray-500">Zonas de liquidez • Equal Highs/Lows • POC</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <div className="text-[10px] text-gray-500 uppercase">Last Update</div>
                        <div className="text-xs text-gray-300 font-mono">
                            {new Date(data.timestamp).toLocaleTimeString()}
                        </div>
                    </div>
                    <button
                        onClick={fetchData}
                        className="p-2 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
                        disabled={loading}
                        title="Refresh data"
                    >
                        <RefreshCw className={cn("w-4 h-4 text-gray-400", loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Global Summary */}
            <Card className="bg-gray-900/80 border-gray-800">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-gray-100">{data.summary.total.analyzed}</div>
                                <div className="text-[9px] text-gray-500 uppercase">Ativos Analisados</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-green-400">{data.summary.total.seekingBuyside}</div>
                                <div className="text-[9px] text-gray-500 uppercase">Buscando Buy Side</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-red-400">{data.summary.total.seekingSellside}</div>
                                <div className="text-[9px] text-gray-500 uppercase">Buscando Sell Side</div>
                            </div>
                        </div>
                        <div className="text-right text-[10px] text-gray-500">
                            <div>Fonte: {data.summary.total.fromMeso ? 'MESO Allowed' : 'Default Universe'}</div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Actionable Insights - O que fazer com as informações */}
            <ActionableInsightsPanel assets={data.all} />

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AssetClassKey)}>
                <TabsList className="bg-gray-900/80 border border-gray-800 flex-wrap">
                    {(['forex', 'etf', 'crypto', 'commodity', 'index', 'all'] as AssetClassKey[]).map(cls => {
                        const config = assetClassConfig[cls];
                        const Icon = config.icon;
                        const count = cls === 'all' ? data.all.length : data[cls]?.length || 0;
                        return (
                            <TabsTrigger 
                                key={cls} 
                                value={cls} 
                                className={`data-[state=active]:bg-${config.color}-500/20 data-[state=active]:text-${config.color}-400`}
                            >
                                <Icon className="w-4 h-4 mr-1" />
                                {config.label} ({count})
                            </TabsTrigger>
                        );
                    })}
                </TabsList>

                {(['forex', 'etf', 'crypto', 'commodity', 'index'] as const).map(cls => (
                    <TabsContent key={cls} value={cls} className="space-y-4 mt-4">
                        <SummaryCard 
                            title={`Resumo ${assetClassConfig[cls].label}`}
                            data={data.summary[cls]}
                            icon={assetClassConfig[cls].icon}
                        />
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                            {data[cls].map(asset => (
                                <AssetLiquidityCard key={asset.symbol} data={asset} />
                            ))}
                        </div>
                        {data[cls].length === 0 && (
                            <Card className="bg-gray-900/50 border-gray-800">
                                <CardContent className="p-6 text-center text-gray-500">
                                    Nenhum ativo {assetClassConfig[cls].label} disponível
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>
                ))}

                <TabsContent value="all" className="space-y-4 mt-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                        {data.all.map(asset => (
                            <AssetLiquidityCard key={asset.symbol} data={asset} />
                        ))}
                    </div>
                </TabsContent>
            </Tabs>

            {/* Legend */}
            <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-3">
                    <div className="flex items-center justify-center gap-6 text-[10px]">
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-green-500/60 rounded" />
                            <span className="text-gray-400">Volume Comprador</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-red-500/60 rounded" />
                            <span className="text-gray-400">Volume Vendedor</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Target className="w-3 h-3 text-cyan-400" />
                            <span className="text-gray-400">POC (Point of Control)</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <ArrowUp className="w-3 h-3 text-green-400" />
                            <span className="text-gray-400">Equal Highs (Stop Hunts)</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <ArrowDown className="w-3 h-3 text-red-400" />
                            <span className="text-gray-400">Equal Lows (Stop Hunts)</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default LiquidityHeatmap;
