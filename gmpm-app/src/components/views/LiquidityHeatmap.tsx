'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
    Droplets, TrendingUp, RefreshCw, AlertTriangle,
    ArrowUp, ArrowDown, Minus, Target, Layers
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

interface LiquidityMapData {
    symbol: string;
    displaySymbol: string;
    assetClass: 'forex' | 'etf';
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
    timestamp: string;
}

interface LiquidityMapResponse {
    success: boolean;
    timestamp: string;
    forex: LiquidityMapData[];
    etf: LiquidityMapData[];
    summary: {
        forex: {
            total: number;
            seekingBuyside: number;
            seekingSellside: number;
            balanced: number;
            topLiquidity: { symbol: string; direction: string; nearestLiquidity: string }[];
        };
        etf: {
            total: number;
            seekingBuyside: number;
            seekingSellside: number;
            balanced: number;
            topLiquidity: { symbol: string; direction: string; nearestLiquidity: string }[];
        };
    };
}

const directionColors = {
    SEEKING_BUYSIDE: 'text-green-400 bg-green-500/20 border-green-500/30',
    SEEKING_SELLSIDE: 'text-red-400 bg-red-500/20 border-red-500/30',
    BALANCED: 'text-gray-400 bg-gray-500/20 border-gray-500/30',
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

// Main Component
export const LiquidityHeatmap = () => {
    const [data, setData] = useState<LiquidityMapResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'forex' | 'etf'>('forex');

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

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'forex' | 'etf')}>
                <TabsList className="bg-gray-900/80 border border-gray-800">
                    <TabsTrigger value="forex" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400">
                        <TrendingUp className="w-4 h-4 mr-2" />
                        Forex ({data.forex.length})
                    </TabsTrigger>
                    <TabsTrigger value="etf" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400">
                        <Layers className="w-4 h-4 mr-2" />
                        ETFs ({data.etf.length})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="forex" className="space-y-4 mt-4">
                    {/* Summary */}
                    <SummaryCard 
                        title="Resumo Forex" 
                        data={data.summary.forex}
                        icon={TrendingUp}
                    />
                    
                    {/* Grid of assets */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                        {data.forex.map(asset => (
                            <AssetLiquidityCard key={asset.symbol} data={asset} />
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="etf" className="space-y-4 mt-4">
                    {/* Summary */}
                    <SummaryCard 
                        title="Resumo ETFs" 
                        data={data.summary.etf}
                        icon={Layers}
                    />
                    
                    {/* Grid of assets */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                        {data.etf.map(asset => (
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
