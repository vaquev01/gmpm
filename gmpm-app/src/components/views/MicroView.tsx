'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Crosshair, AlertTriangle, CheckCircle2, XCircle,
    Zap, ArrowUpRight, ArrowDownRight, RefreshCw,
    Clock, Eye, ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Types
interface Setup {
    id: string;
    symbol: string;
    displaySymbol: string;
    type: 'BREAKOUT' | 'PULLBACK' | 'REVERSAL' | 'CONTINUATION' | 'LIQUIDITY_GRAB';
    direction: 'LONG' | 'SHORT';
    timeframe: 'M15' | 'H1' | 'H4';
    entry: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2: number;
    takeProfit3: number;
    riskReward: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    confluences: string[];
    invalidation: string;
    thesis: string;
    mesoAlignment: boolean;
    technicalScore: number;
}

interface TechnicalAnalysis {
    trend: {
        h4: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
        h1: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
        m15: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
        alignment: 'ALIGNED' | 'CONFLICTING' | 'PARTIAL';
    };
    structure: {
        lastBOS: 'BULLISH' | 'BEARISH' | null;
        lastCHoCH: 'BULLISH' | 'BEARISH' | null;
        currentPhase: 'IMPULSE' | 'CORRECTION' | 'RANGING';
    };
    levels: {
        resistance: number[];
        support: number[];
        pivot: number;
        atr: number;
    };
    indicators: {
        rsi: number;
        rsiDivergence: 'BULLISH' | 'BEARISH' | null;
        ema21: number;
        ema50: number;
        ema200: number;
        macdSignal: 'BUY' | 'SELL' | 'NEUTRAL';
        bbPosition: 'UPPER' | 'MIDDLE' | 'LOWER';
    };
    volume: {
        relative: number;
        trend: 'INCREASING' | 'DECREASING' | 'STABLE';
        climax: boolean;
    };
    smc: {
        orderBlocks: { type: 'BULLISH' | 'BEARISH'; low: number; high: number; tested: boolean }[];
        fvgs: { type: 'BULLISH' | 'BEARISH'; low: number; high: number; filled: boolean }[];
        liquidityPools: { type: 'BUY_SIDE' | 'SELL_SIDE'; level: number; strength: 'STRONG' | 'MODERATE' | 'WEAK' }[];
        premiumDiscount: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';
    };
}

interface MicroAnalysis {
    symbol: string;
    displaySymbol: string;
    name?: string;
    assetClass?: string;
    price: number;
    technical: TechnicalAnalysis;
    setups: Setup[];
    recommendation: {
        action: 'EXECUTE' | 'WAIT' | 'AVOID';
        reason: string;
        bestSetup: Setup | null;
    };
    scenarioAnalysis?: {
        status: 'PRONTO' | 'DESENVOLVENDO' | 'CONTRA';
        statusReason: string;
        entryQuality: 'OTIMO' | 'BOM' | 'RUIM';
        timing: 'AGORA' | 'AGUARDAR' | 'PERDIDO';
    };
}

interface MicroData {
    success: boolean;
    timestamp: string;
    analyses: MicroAnalysis[];
    summary: {
        total: number;
        withSetups: number;
        executeReady: number;
        message: string;
    };
}

// Colors
const trendColors = {
    BULLISH: 'text-green-400 bg-green-500/20',
    BEARISH: 'text-red-400 bg-red-500/20',
    NEUTRAL: 'text-gray-400 bg-gray-500/20',
};

const actionColors = {
    EXECUTE: 'text-green-400 bg-green-500/20 border-green-500/30',
    WAIT: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
    AVOID: 'text-red-400 bg-red-500/20 border-red-500/30',
};

const confidenceColors = {
    HIGH: 'text-green-400',
    MEDIUM: 'text-yellow-400',
    LOW: 'text-gray-500',
};

const setupTypeLabels = {
    BREAKOUT: { label: 'Breakout', color: 'bg-blue-500/20 text-blue-400' },
    PULLBACK: { label: 'Pullback', color: 'bg-purple-500/20 text-purple-400' },
    REVERSAL: { label: 'Reversal', color: 'bg-orange-500/20 text-orange-400' },
    CONTINUATION: { label: 'Continuation', color: 'bg-cyan-500/20 text-cyan-400' },
    LIQUIDITY_GRAB: { label: 'Liq Grab', color: 'bg-pink-500/20 text-pink-400' },
};

// Multi-Timeframe Panel
const MTFPanel = ({ trend }: { trend: TechnicalAnalysis['trend'] }) => {
    return (
        <div className="grid grid-cols-4 gap-2">
            {(['h4', 'h1', 'm15'] as const).map(tf => (
                <div key={tf} className="text-center">
                    <div className="text-[10px] text-gray-500 uppercase">{tf}</div>
                    <div className={cn("text-sm font-bold px-2 py-0.5 rounded", trendColors[trend[tf]])}>
                        {trend[tf]}
                    </div>
                </div>
            ))}
            <div className="text-center">
                <div className="text-[10px] text-gray-500 uppercase">Align</div>
                <div className={cn("text-sm font-bold px-2 py-0.5 rounded",
                    trend.alignment === 'ALIGNED' ? 'text-green-400 bg-green-500/20' :
                    trend.alignment === 'PARTIAL' ? 'text-yellow-400 bg-yellow-500/20' :
                    'text-red-400 bg-red-500/20'
                )}>
                    {trend.alignment}
                </div>
            </div>
        </div>
    );
};

// SMC Panel
const SMCPanel = ({ smc, levels }: { smc: TechnicalAnalysis['smc']; levels: TechnicalAnalysis['levels'] }) => {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 uppercase">Premium/Discount</span>
                <span className={cn("text-sm font-bold px-2 py-0.5 rounded",
                    smc.premiumDiscount === 'DISCOUNT' ? 'bg-green-500/20 text-green-400' :
                    smc.premiumDiscount === 'PREMIUM' ? 'bg-red-500/20 text-red-400' :
                    'bg-gray-500/20 text-gray-400'
                )}>
                    {smc.premiumDiscount}
                </span>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                    <div className="text-gray-500">Order Blocks</div>
                    {smc.orderBlocks.length > 0 ? (
                        smc.orderBlocks.map((ob, i) => (
                            <div key={i} className={cn("font-mono", ob.type === 'BULLISH' ? 'text-green-400' : 'text-red-400')}>
                                {ob.type}: {ob.low.toFixed(2)}-{ob.high.toFixed(2)}
                            </div>
                        ))
                    ) : (
                        <div className="text-gray-600">None nearby</div>
                    )}
                </div>
                <div>
                    <div className="text-gray-500">FVGs</div>
                    {smc.fvgs.length > 0 ? (
                        smc.fvgs.map((fvg, i) => (
                            <div key={i} className={cn("font-mono", fvg.type === 'BULLISH' ? 'text-green-400' : 'text-red-400')}>
                                {fvg.type}: {fvg.low.toFixed(2)}-{fvg.high.toFixed(2)}
                            </div>
                        ))
                    ) : (
                        <div className="text-gray-600">None unfilled</div>
                    )}
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-[11px] border-t border-gray-800 pt-2">
                <div>
                    <div className="text-gray-500">Resistance</div>
                    {levels.resistance.map((r, i) => (
                        <div key={i} className="font-mono text-red-400">R{i+1}: {r.toFixed(2)}</div>
                    ))}
                </div>
                <div>
                    <div className="text-gray-500">Support</div>
                    {levels.support.map((s, i) => (
                        <div key={i} className="font-mono text-green-400">S{i+1}: {s.toFixed(2)}</div>
                    ))}
                </div>
            </div>
            
            <div className="text-[11px] border-t border-gray-800 pt-2">
                <div className="text-gray-500">Liquidity Pools</div>
                <div className="grid grid-cols-2 gap-2 mt-1">
                    {smc.liquidityPools.map((lp, i) => (
                        <div key={i} className={cn("font-mono",
                            lp.type === 'BUY_SIDE' ? 'text-green-400' : 'text-red-400'
                        )}>
                            {lp.type}: {lp.level.toFixed(2)} ({lp.strength})
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// Indicators Panel
const IndicatorsPanel = ({ indicators, volume }: { indicators: TechnicalAnalysis['indicators']; volume: TechnicalAnalysis['volume'] }) => {
    const rsiColor = indicators.rsi > 70 ? 'text-red-400' : indicators.rsi < 30 ? 'text-green-400' : 'text-gray-300';
    
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-2 bg-gray-800/30 rounded">
                    <div className="text-[10px] text-gray-500">RSI</div>
                    <div className={cn("text-lg font-bold font-mono", rsiColor)}>{Math.round(indicators.rsi)}</div>
                    {indicators.rsiDivergence && (
                        <div className={cn("text-[10px]", indicators.rsiDivergence === 'BULLISH' ? 'text-green-400' : 'text-red-400')}>
                            {indicators.rsiDivergence} DIV
                        </div>
                    )}
                </div>
                <div className="text-center p-2 bg-gray-800/30 rounded">
                    <div className="text-[10px] text-gray-500">MACD</div>
                    <div className={cn("text-sm font-bold",
                        indicators.macdSignal === 'BUY' ? 'text-green-400' :
                        indicators.macdSignal === 'SELL' ? 'text-red-400' : 'text-gray-400'
                    )}>
                        {indicators.macdSignal}
                    </div>
                </div>
                <div className="text-center p-2 bg-gray-800/30 rounded">
                    <div className="text-[10px] text-gray-500">BB</div>
                    <div className={cn("text-sm font-bold",
                        indicators.bbPosition === 'UPPER' ? 'text-red-400' :
                        indicators.bbPosition === 'LOWER' ? 'text-green-400' : 'text-gray-400'
                    )}>
                        {indicators.bbPosition}
                    </div>
                </div>
            </div>
            
            <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div className="text-center">
                    <div className="text-gray-500">EMA 21</div>
                    <div className="font-mono text-gray-300">{indicators.ema21.toFixed(2)}</div>
                </div>
                <div className="text-center">
                    <div className="text-gray-500">EMA 50</div>
                    <div className="font-mono text-gray-300">{indicators.ema50.toFixed(2)}</div>
                </div>
                <div className="text-center">
                    <div className="text-gray-500">EMA 200</div>
                    <div className="font-mono text-gray-300">{indicators.ema200.toFixed(2)}</div>
                </div>
            </div>
            
            <div className="border-t border-gray-800 pt-2">
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-500">Relative Volume</span>
                    <span className={cn("font-mono font-bold",
                        volume.relative > 1.5 ? 'text-green-400' :
                        volume.relative < 0.5 ? 'text-red-400' : 'text-gray-300'
                    )}>
                        {volume.relative.toFixed(2)}x
                    </span>
                </div>
                <div className="flex items-center justify-between text-[11px] mt-1">
                    <span className="text-gray-500">Volume Trend</span>
                    <span className={cn("font-bold",
                        volume.trend === 'INCREASING' ? 'text-green-400' :
                        volume.trend === 'DECREASING' ? 'text-red-400' : 'text-gray-400'
                    )}>
                        {volume.trend}
                    </span>
                </div>
                {volume.climax && (
                    <div className="text-[10px] text-orange-400 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Volume Climax
                    </div>
                )}
            </div>
        </div>
    );
};

// Setup Card
const SetupCard = ({ setup, expanded, onToggle }: { setup: Setup; expanded: boolean; onToggle: () => void }) => {
    const DirectionIcon = setup.direction === 'LONG' ? ArrowUpRight : ArrowDownRight;
    const typeInfo = setupTypeLabels[setup.type];
    
    return (
        <Card className={cn(
            "border transition-all cursor-pointer",
            setup.confidence === 'HIGH' ? 'bg-green-950/20 border-green-500/30' :
            setup.confidence === 'MEDIUM' ? 'bg-yellow-950/20 border-yellow-500/30' :
            'bg-gray-900/50 border-gray-700'
        )} onClick={onToggle}>
            <CardContent className="p-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <DirectionIcon className={cn("w-5 h-5", setup.direction === 'LONG' ? 'text-green-400' : 'text-red-400')} />
                        <div>
                            <div className="font-bold text-gray-200">{setup.displaySymbol}</div>
                            <div className="flex items-center gap-1">
                                <Badge className={cn("text-[10px]", typeInfo.color)}>{typeInfo.label}</Badge>
                                <span className="text-[10px] text-gray-500">{setup.timeframe}</span>
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className={cn("text-sm font-bold", confidenceColors[setup.confidence])}>
                            {setup.confidence}
                        </div>
                        <div className="text-[10px] text-gray-500">
                            R:R {setup.riskReward.toFixed(1)} | Score {setup.technicalScore}
                        </div>
                    </div>
                </div>
                
                {expanded && (
                    <div className="mt-3 pt-3 border-t border-gray-800 space-y-3">
                        <p className="text-sm text-gray-300">{setup.thesis}</p>
                        
                        <div className="grid grid-cols-4 gap-2 text-center">
                            <div className="bg-blue-500/10 p-2 rounded">
                                <div className="text-[10px] text-blue-400">Entry</div>
                                <div className="font-mono text-sm text-white">{setup.entry.toFixed(4)}</div>
                            </div>
                            <div className="bg-red-500/10 p-2 rounded">
                                <div className="text-[10px] text-red-400">Stop</div>
                                <div className="font-mono text-sm text-white">{setup.stopLoss.toFixed(4)}</div>
                            </div>
                            <div className="bg-green-500/10 p-2 rounded">
                                <div className="text-[10px] text-green-400">TP1</div>
                                <div className="font-mono text-sm text-white">{setup.takeProfit1.toFixed(4)}</div>
                            </div>
                            <div className="bg-green-500/10 p-2 rounded">
                                <div className="text-[10px] text-green-400">TP2</div>
                                <div className="font-mono text-sm text-white">{setup.takeProfit2.toFixed(4)}</div>
                            </div>
                        </div>
                        
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase mb-1">Confluences</div>
                            <div className="flex flex-wrap gap-1">
                                {setup.confluences.map((c, i) => (
                                    <span key={i} className="text-[10px] bg-gray-800 px-2 py-0.5 rounded text-gray-300">
                                        {c}
                                    </span>
                                ))}
                            </div>
                        </div>
                        
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="text-gray-500">Invalidation:</span>
                            <span className="text-red-400 font-mono">{setup.invalidation}</span>
                        </div>
                        
                        {setup.mesoAlignment && (
                            <div className="flex items-center gap-1 text-[10px] text-green-400">
                                <CheckCircle2 className="w-3 h-3" /> Aligned with MESO layer
                            </div>
                        )}
                    </div>
                )}
                
                <ChevronRight className={cn("w-4 h-4 text-gray-500 mx-auto mt-2 transition-transform", expanded && "rotate-90")} />
            </CardContent>
        </Card>
    );
};

// Analysis Card
const AnalysisCard = ({ analysis }: { analysis: MicroAnalysis }) => {
    const [expanded, setExpanded] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');

    const best = analysis.recommendation.bestSetup;
    const fallbackInstrumentName = (symbol: string) => {
        const map: Record<string, string> = {
            'GC=F': 'Gold Futures',
            'SI=F': 'Silver Futures',
            'CL=F': 'Crude Oil Futures',
            'BZ=F': 'Brent Crude Futures',
            'NG=F': 'Natural Gas Futures',
            'RB=F': 'RBOB Gasoline Futures',
            'HG=F': 'Copper Futures',
            'ZC=F': 'Corn Futures',
            'ZW=F': 'Wheat Futures',
            'ZS=F': 'Soybean Futures',
        };
        return map[symbol] || '';
    };

    const fallbackInstrumentShortName = (symbol: string) => {
        const map: Record<string, string> = {
            'GC=F': 'Gold',
            'SI=F': 'Silver',
            'CL=F': 'Crude',
            'BZ=F': 'Brent',
            'NG=F': 'NatGas',
            'RB=F': 'Gasoline',
            'HG=F': 'Copper',
            'ZC=F': 'Corn',
            'ZW=F': 'Wheat',
            'ZS=F': 'Soybean',
        };
        return map[symbol] || '';
    };

    const shortInstrumentName = (symbol: string, name?: string) => {
        const fromMap = fallbackInstrumentShortName(symbol);
        if (fromMap) return fromMap;
        const raw = (name || fallbackInstrumentName(symbol) || '').trim();
        if (!raw) return '';
        const cleaned = raw
            .replace(/\bFutures?\b/gi, '')
            .replace(/\bIndex\b/gi, '')
            .replace(/\bETF\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
        const parts = cleaned.split(' ').filter(Boolean);
        if (parts.length <= 2) return cleaned;
        return parts.slice(0, 2).join(' ');
    };
    const instrumentType = analysis.symbol.endsWith('-USD') ? 'CRYPTO'
        : analysis.symbol.endsWith('=X') ? 'FX'
            : analysis.symbol.endsWith('=F') ? 'FUT'
                : analysis.symbol.startsWith('^') ? 'INDEX'
                    : 'SPOT';
    const timing = analysis.recommendation.action === 'EXECUTE'
        ? 'AGORA'
        : analysis.scenarioAnalysis?.timing === 'PERDIDO'
            ? 'PERDIDO'
            : 'AGUARDAR';
    const statusReason = analysis.scenarioAnalysis?.statusReason;
    
    return (
        <Card className={cn("border", actionColors[analysis.recommendation.action])}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex items-baseline gap-2">
                            <div className="text-2xl font-bold text-gray-100">{analysis.displaySymbol}</div>
                            {shortInstrumentName(analysis.symbol, analysis.name) ? (
                                <div className="text-[12px] text-gray-500">— {shortInstrumentName(analysis.symbol, analysis.name)}</div>
                            ) : null}
                        </div>
                        <Badge className={cn("text-sm", actionColors[analysis.recommendation.action])}>
                            {analysis.recommendation.action === 'AVOID' ? 'NO-TRADE' : analysis.recommendation.action}
                        </Badge>
                        {best ? (
                            <div className="hidden md:flex items-center gap-2 text-[10px] font-mono text-gray-400">
                                <span className="px-1.5 py-0.5 rounded border border-gray-700/50 bg-gray-900/40 text-cyan-300">{best.timeframe}</span>
                                <span className="px-1.5 py-0.5 rounded border border-gray-700/50 bg-gray-900/40 text-purple-300">RR {best.riskReward.toFixed(1)}</span>
                                <span className={cn(
                                    "px-1.5 py-0.5 rounded border border-gray-700/50 bg-gray-900/40",
                                    best.technicalScore >= 80 ? 'text-green-300' : best.technicalScore >= 65 ? 'text-yellow-300' : 'text-red-300'
                                )}>
                                    Score {best.technicalScore}
                                </span>
                                <span className="px-1.5 py-0.5 rounded border border-gray-700/50 bg-gray-900/40 text-amber-300">Conf {best.confluences.length}</span>
                            </div>
                        ) : null}
                    </div>
                    <div className="text-right">
                        <div className="text-lg font-mono tabular-nums text-gray-200">{analysis.price.toFixed(4)}</div>
                        <div className="text-[10px] text-gray-500">{analysis.setups.length} setup(s)</div>
                    </div>
                </div>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-[10px] font-mono text-gray-500">
                    <div className="rounded border border-gray-800 bg-gray-950/30 px-2 py-1">
                        <span className="text-gray-400">Instrument</span> {analysis.symbol} | {instrumentType} | {(analysis.assetClass || '—').toUpperCase()}
                    </div>
                    <div className="rounded border border-gray-800 bg-gray-950/30 px-2 py-1">
                        <span className="text-gray-400">What to do</span> {analysis.recommendation.action === 'AVOID' ? 'NO-TRADE' : analysis.recommendation.action} • {timing}
                    </div>
                    <div className="rounded border border-gray-800 bg-gray-950/30 px-2 py-1 line-clamp-1" title={statusReason || ''}>
                        <span className="text-gray-400">Why</span> {statusReason || analysis.recommendation.reason}
                    </div>
                </div>
                {(analysis.name || fallbackInstrumentName(analysis.symbol)) ? (
                    <div className="mt-2 text-[10px] text-gray-600">{analysis.name || fallbackInstrumentName(analysis.symbol)}</div>
                ) : null}
                <p className="text-sm text-gray-400 mt-2">{analysis.recommendation.reason}</p>
            </CardHeader>
            
            <CardContent className="pt-0">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="bg-gray-800/50 mb-3">
                        <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                        <TabsTrigger value="smc" className="text-xs">SMC</TabsTrigger>
                        <TabsTrigger value="indicators" className="text-xs">Indicators</TabsTrigger>
                        <TabsTrigger value="setups" className="text-xs">Setups ({analysis.setups.length})</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="overview" className="space-y-3">
                        <MTFPanel trend={analysis.technical.trend} />
                        
                        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                            <div className="p-2 bg-gray-800/30 rounded">
                                <div className="text-gray-500">Phase</div>
                                <div className="font-bold text-gray-200">{analysis.technical.structure.currentPhase}</div>
                            </div>
                            <div className="p-2 bg-gray-800/30 rounded">
                                <div className="text-gray-500">Last BOS</div>
                                <div className={cn("font-bold",
                                    analysis.technical.structure.lastBOS === 'BULLISH' ? 'text-green-400' :
                                    analysis.technical.structure.lastBOS === 'BEARISH' ? 'text-red-400' : 'text-gray-400'
                                )}>
                                    {analysis.technical.structure.lastBOS || 'N/A'}
                                </div>
                            </div>
                            <div className="p-2 bg-gray-800/30 rounded">
                                <div className="text-gray-500">ATR</div>
                                <div className="font-mono text-gray-200">{analysis.technical.levels.atr.toFixed(4)}</div>
                            </div>
                        </div>
                    </TabsContent>
                    
                    <TabsContent value="smc">
                        <SMCPanel smc={analysis.technical.smc} levels={analysis.technical.levels} />
                    </TabsContent>
                    
                    <TabsContent value="indicators">
                        <IndicatorsPanel indicators={analysis.technical.indicators} volume={analysis.technical.volume} />
                    </TabsContent>
                    
                    <TabsContent value="setups" className="space-y-2">
                        {analysis.setups.length > 0 ? (
                            analysis.setups.map(setup => (
                                <SetupCard 
                                    key={setup.id} 
                                    setup={setup} 
                                    expanded={expanded} 
                                    onToggle={() => setExpanded(!expanded)} 
                                />
                            ))
                        ) : (
                            <div className="text-center py-6 text-gray-500">
                                <XCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <div>No valid setups found</div>
                                <div className="text-[11px]">Insufficient confluences or poor R:R</div>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
};

// Main Component
export const MicroView = () => {
    const [data, setData] = useState<MicroData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch('/api/micro');
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
        const interval = setInterval(fetchData, 30000); // 30s refresh for micro
        return () => clearInterval(interval);
    }, [fetchData]);

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center space-y-4">
                    <RefreshCw className="w-8 h-8 animate-spin text-orange-400 mx-auto" />
                    <div className="text-gray-400">Loading Micro Analysis...</div>
                </div>
            </div>
        );
    }

    if (error && !data) {
        return (
            <Card className="bg-red-950/20 border-red-900/40">
                <CardContent className="p-6 text-center">
                    <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                    <div className="text-red-400 font-bold">Failed to load Micro data</div>
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

    const executeReady = data.analyses.filter(a => a.recommendation.action === 'EXECUTE');
    const waiting = data.analyses.filter(a => a.recommendation.action === 'WAIT');
    const avoid = data.analyses.filter(a => a.recommendation.action === 'AVOID');

    return (
        <div className="space-y-6 max-w-[1700px] mx-auto pb-20 h-[calc(100vh-140px)] overflow-y-auto pr-2">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
                        <Crosshair className="w-8 h-8 text-orange-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-100 tracking-tight flex items-center gap-3">
                            MICRO ANALYSIS
                            <Badge variant="outline" className="border-orange-500 text-orange-400 bg-orange-500/10 text-[10px] tracking-widest">
                                SETUPS & EXECUTION
                            </Badge>
                        </h1>
                        <p className="text-xs text-gray-500">Análise técnica completa • Intraday a 48h</p>
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

            {/* Summary */}
            <Card className="bg-gray-900/80 border-gray-800">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                            <div className="text-center">
                                <div className="text-3xl font-bold text-green-400">{executeReady.length}</div>
                                <div className="text-[10px] text-gray-500 uppercase">Execute Ready</div>
                            </div>
                            <div className="text-center">
                                <div className="text-3xl font-bold text-yellow-400">{waiting.length}</div>
                                <div className="text-[10px] text-gray-500 uppercase">Waiting</div>
                            </div>
                            <div className="text-center">
                                <div className="text-3xl font-bold text-gray-500">{avoid.length}</div>
                                <div className="text-[10px] text-gray-500 uppercase">No-Trade</div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-sm text-gray-300">{data.summary.message}</div>
                            <div className="text-[10px] text-gray-500">Analyzing {data.summary.total} instruments from MESO</div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Execute Ready */}
            {executeReady.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-green-400">
                        <Zap className="w-5 h-5" />
                        <span className="text-sm font-bold uppercase tracking-wider">Ready to Execute</span>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {executeReady.map(a => (
                            <AnalysisCard key={a.symbol} analysis={a} />
                        ))}
                    </div>
                </div>
            )}

            {/* Waiting */}
            {waiting.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-yellow-400">
                        <Clock className="w-5 h-5" />
                        <span className="text-sm font-bold uppercase tracking-wider">Waiting for Confirmation</span>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {waiting.map(a => (
                            <AnalysisCard key={a.symbol} analysis={a} />
                        ))}
                    </div>
                </div>
            )}

            {/* No Setups Message */}
            {data.analyses.length === 0 && (
                <Card className="bg-gray-900/50 border-gray-800">
                    <CardContent className="p-8 text-center">
                        <Eye className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                        <div className="text-lg text-gray-400">No instruments to analyze</div>
                        <div className="text-sm text-gray-500 mt-1">
                            MESO layer has no allowed instruments. Check regime and meso analysis.
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Avoid */}
            {avoid.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-red-400">
                        <AlertTriangle className="w-5 h-5" />
                        <span className="text-sm font-bold uppercase tracking-wider">No-Trade / Blocked</span>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 opacity-90">
                        {avoid.slice(0, 8).map(a => (
                            <AnalysisCard key={a.symbol} analysis={a} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
