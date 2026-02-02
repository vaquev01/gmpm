// src/app/api/orderflow/route.ts
// API de Order Flow usando Binance (gratuito, sem API key)

import { NextResponse } from 'next/server';

interface TradeData {
    price: number;
    qty: number;
    isBuyerMaker: boolean;
    time: number;
}

interface OrderFlowAnalysis {
    symbol: string;
    price: number;
    // Delta Analysis
    delta: number; // Positive = buying pressure
    deltaPercent: number;
    cumulativeDelta: number;
    deltaSignal: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
    // Volume Analysis
    totalVolume: number;
    buyVolume: number;
    sellVolume: number;
    volumeImbalance: number;
    // Aggression
    buyAggression: number;
    sellAggression: number;
    aggressionRatio: number;
    // Large Orders
    largeOrdersBuy: number;
    largeOrdersSell: number;
    whaleActivity: 'ACCUMULATING' | 'DISTRIBUTING' | 'NEUTRAL';
    // Levels
    highVolumeNodes: { price: number; volume: number }[];
    poc: number; // Point of Control
    vah: number; // Value Area High
    val: number; // Value Area Low
    // Summary
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    strength: number; // 0-100
}

const BINANCE_BASE = 'https://api.binance.com/api/v3';

// Mapear símbolos para Binance
function toBinanceSymbol(symbol: string): string {
    const mapping: Record<string, string> = {
        'BTC': 'BTCUSDT',
        'ETH': 'ETHUSDT',
        'SOL': 'SOLUSDT',
        'XRP': 'XRPUSDT',
        'ADA': 'ADAUSDT',
        'DOGE': 'DOGEUSDT',
        'AVAX': 'AVAXUSDT',
        'LINK': 'LINKUSDT',
        'DOT': 'DOTUSDT',
        'MATIC': 'MATICUSDT',
    };
    return mapping[symbol] || `${symbol}USDT`;
}

async function fetchRecentTrades(symbol: string, limit: number = 1000): Promise<TradeData[]> {
    try {
        const binanceSymbol = toBinanceSymbol(symbol);
        const url = `${BINANCE_BASE}/trades?symbol=${binanceSymbol}&limit=${limit}`;

        const response = await fetch(url, {
            next: { revalidate: 10 }, // Cache 10 segundos
        });

        if (!response.ok) return [];

        const data = await response.json();

        return data.map((t: { price: string; qty: string; isBuyerMaker: boolean; time: number }) => ({
            price: parseFloat(t.price),
            qty: parseFloat(t.qty),
            isBuyerMaker: t.isBuyerMaker,
            time: t.time,
        }));
    } catch {
        return [];
    }
}

async function fetchOrderBook(symbol: string): Promise<{ bids: [string, string][]; asks: [string, string][] } | null> {
    try {
        const binanceSymbol = toBinanceSymbol(symbol);
        const url = `${BINANCE_BASE}/depth?symbol=${binanceSymbol}&limit=100`;

        const response = await fetch(url, {
            next: { revalidate: 5 },
        });

        if (!response.ok) return null;

        return await response.json();
    } catch {
        return null;
    }
}

async function analyzeOrderFlow(symbol: string): Promise<OrderFlowAnalysis | null> {
    const trades = await fetchRecentTrades(symbol);
    const orderBook = await fetchOrderBook(symbol);

    if (trades.length === 0) return null;

    const currentPrice = trades[trades.length - 1].price;

    // Delta Analysis
    let buyVolume = 0;
    let sellVolume = 0;
    let buyCount = 0;
    let sellCount = 0;
    let largeBuyOrders = 0;
    let largeSellOrders = 0;

    // Volume por preço
    const volumeByPrice: Record<number, { buy: number; sell: number }> = {};

    // Calcular threshold para ordens grandes (top 5% por tamanho)
    const sortedQty = trades.map(t => t.qty * t.price).sort((a, b) => b - a);
    const largeThreshold = sortedQty[Math.floor(sortedQty.length * 0.05)] || 0;

    for (const trade of trades) {
        const value = trade.qty * trade.price;
        const roundedPrice = Math.round(trade.price * 100) / 100;

        if (!volumeByPrice[roundedPrice]) {
            volumeByPrice[roundedPrice] = { buy: 0, sell: 0 };
        }

        // isBuyerMaker = false significa que o comprador agrediu (taker buy)
        if (!trade.isBuyerMaker) {
            buyVolume += value;
            buyCount++;
            volumeByPrice[roundedPrice].buy += value;
            if (value > largeThreshold) largeBuyOrders++;
        } else {
            sellVolume += value;
            sellCount++;
            volumeByPrice[roundedPrice].sell += value;
            if (value > largeThreshold) largeSellOrders++;
        }
    }

    const totalVolume = buyVolume + sellVolume;
    const delta = buyVolume - sellVolume;
    const deltaPercent = totalVolume > 0 ? (delta / totalVolume) * 100 : 0;

    // Delta cumulativo (último 1/3 vs primeiro 2/3)
    const splitIndex = Math.floor(trades.length * 2 / 3);
    let recentDelta = 0;
    for (let i = splitIndex; i < trades.length; i++) {
        const value = trades[i].qty * trades[i].price;
        recentDelta += trades[i].isBuyerMaker ? -value : value;
    }

    // Aggression
    const buyAggression = buyCount > 0 ? buyVolume / buyCount : 0;
    const sellAggression = sellCount > 0 ? sellVolume / sellCount : 0;
    const aggressionRatio = sellAggression > 0 ? buyAggression / sellAggression : 1;

    // Volume Imbalance
    const volumeImbalance = totalVolume > 0 ? (buyVolume - sellVolume) / totalVolume : 0;

    // High Volume Nodes e POC
    const priceVolumes = Object.entries(volumeByPrice)
        .map(([price, vol]) => ({
            price: parseFloat(price),
            volume: vol.buy + vol.sell,
        }))
        .sort((a, b) => b.volume - a.volume);

    const highVolumeNodes = priceVolumes.slice(0, 5);
    const poc = highVolumeNodes[0]?.price || currentPrice;

    // Value Area (70% do volume)
    const totalVol = priceVolumes.reduce((s, p) => s + p.volume, 0);
    let cumVol = 0;
    const valueAreaPrices: number[] = [];
    for (const pv of priceVolumes) {
        cumVol += pv.volume;
        valueAreaPrices.push(pv.price);
        if (cumVol >= totalVol * 0.7) break;
    }
    const vah = Math.max(...valueAreaPrices);
    const val = Math.min(...valueAreaPrices);

    // Whale Activity
    let whaleActivity: 'ACCUMULATING' | 'DISTRIBUTING' | 'NEUTRAL' = 'NEUTRAL';
    if (largeBuyOrders > largeSellOrders * 1.5) whaleActivity = 'ACCUMULATING';
    else if (largeSellOrders > largeBuyOrders * 1.5) whaleActivity = 'DISTRIBUTING';

    // Delta Signal
    let deltaSignal: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL' = 'NEUTRAL';
    if (deltaPercent > 20) deltaSignal = 'STRONG_BUY';
    else if (deltaPercent > 8) deltaSignal = 'BUY';
    else if (deltaPercent < -20) deltaSignal = 'STRONG_SELL';
    else if (deltaPercent < -8) deltaSignal = 'SELL';

    // Overall Bias
    let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 50;

    if (deltaPercent > 10 && aggressionRatio > 1.2 && whaleActivity !== 'DISTRIBUTING') {
        bias = 'BULLISH';
        strength = 50 + Math.min(deltaPercent, 40) + (aggressionRatio - 1) * 10;
    } else if (deltaPercent < -10 && aggressionRatio < 0.8 && whaleActivity !== 'ACCUMULATING') {
        bias = 'BEARISH';
        strength = 50 + Math.min(Math.abs(deltaPercent), 40) + (1 - aggressionRatio) * 10;
    }
    strength = Math.max(0, Math.min(100, strength));

    return {
        symbol,
        price: currentPrice,
        delta: Math.round(delta),
        deltaPercent: Math.round(deltaPercent * 100) / 100,
        cumulativeDelta: Math.round(recentDelta),
        deltaSignal,
        totalVolume: Math.round(totalVolume),
        buyVolume: Math.round(buyVolume),
        sellVolume: Math.round(sellVolume),
        volumeImbalance: Math.round(volumeImbalance * 1000) / 1000,
        buyAggression: Math.round(buyAggression * 100) / 100,
        sellAggression: Math.round(sellAggression * 100) / 100,
        aggressionRatio: Math.round(aggressionRatio * 100) / 100,
        largeOrdersBuy: largeBuyOrders,
        largeOrdersSell: largeSellOrders,
        whaleActivity,
        highVolumeNodes,
        poc,
        vah,
        val,
        bias,
        strength: Math.round(strength),
    };
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'BTC';
    const symbols = searchParams.get('symbols')?.split(',') || [symbol];

    try {
        const results = await Promise.all(symbols.slice(0, 5).map(analyzeOrderFlow));
        const validResults = results.filter((r): r is OrderFlowAnalysis => r !== null);

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            count: validResults.length,
            data: validResults,
        });
    } catch (error) {
        console.error('Order Flow API Error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to analyze order flow' },
            { status: 500 }
        );
    }
}
