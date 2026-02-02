'use client';

import React, { useState, useEffect } from 'react';
import { getPaperAccount, resetPaperAccount, PaperAccount } from '@/lib/paperTradingEngine';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Play, RotateCcw, DollarSign, Wallet } from 'lucide-react';

export const PaperTradingView = () => {
    const [account, setAccount] = useState<PaperAccount | null>(null);
    const [lastUpdate, setLastUpdate] = useState(() => Date.now());

    useEffect(() => {
        // Polling loop for real-time order updates
        const interval = setInterval(() => {
            setAccount(getPaperAccount());
            setLastUpdate(Date.now());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const handleReset = () => {
        if (confirm('Reset paper trading account to $100,000?')) {
            resetPaperAccount();
        }
    };

    if (!account) return <div className="p-4 text-gray-400">Loading Broker Simulator...</div>;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'FILLED': return 'bg-green-900/50 text-green-400 border-green-800';
            case 'WORKING': return 'bg-yellow-900/50 text-yellow-400 border-yellow-800';
            case 'PENDING': return 'bg-gray-800 text-gray-400 border-gray-700';
            case 'REJECTED': return 'bg-red-900/50 text-red-400 border-red-800';
            default: return 'bg-gray-800 text-gray-300';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Wallet className="w-6 h-6 text-purple-400" />
                        PAPER TRADING INCUBATOR
                    </h2>
                    <p className="text-gray-400 text-sm mt-1">
                        Simulação realista de execução de ordens com latência e comissões
                    </p>
                </div>
                <button
                    onClick={handleReset}
                    className="flex items-center gap-2 px-3 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg border border-red-900/50 text-sm transition-colors"
                >
                    <RotateCcw className="w-4 h-4" /> Reset Account
                </button>
            </div>

            {/* Account Header */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-gray-900/50 border-gray-800">
                    <CardContent className="p-4">
                        <div className="text-xs text-gray-400 uppercase tracking-widest mb-1">Total Equity</div>
                        <div className="text-2xl font-bold text-white flex items-baseline gap-1">
                            <span className="text-lg text-gray-500">$</span>
                            {account.equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-gray-900/50 border-gray-800">
                    <CardContent className="p-4">
                        <div className="text-xs text-gray-400 uppercase tracking-widest mb-1">Free Margin</div>
                        <div className="text-2xl font-bold text-green-400 flex items-baseline gap-1">
                            <span className="text-lg text-green-500/50">$</span>
                            {account.freeMargin.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-gray-900/50 border-gray-800">
                    <CardContent className="p-4">
                        <div className="text-xs text-gray-400 uppercase tracking-widest mb-1">Open PnL</div>
                        <div className="text-2xl font-bold text-gray-300 flex items-baseline gap-1">
                            {/* Calculated from positions */}
                            $0.00 <span className="text-xs font-normal text-gray-500">(Flat)</span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-gray-900/50 border-gray-800">
                    <CardContent className="p-4">
                        <div className="text-xs text-gray-400 uppercase tracking-widest mb-1">Active Orders</div>
                        <div className="text-2xl font-bold text-blue-400 flex items-center gap-2">
                            {account.orders.filter(o => ['WORKING', 'PENDING'].includes(o.status)).length}
                            <ActivityIndicator active={true} />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Order Blotter */}
                <div className="lg:col-span-2">
                    <Card className="bg-gray-900/50 border-gray-800 h-[500px] flex flex-col">
                        <CardHeader className="py-3 border-b border-gray-800">
                            <CardTitle className="text-sm font-bold text-gray-300 flex items-center gap-2">
                                <DollarSign className="w-4 h-4" />
                                ORDER BLOTTER
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 p-0">
                            <div className="h-full overflow-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-gray-500 bg-gray-900/50 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-2 font-medium">Time</th>
                                            <th className="px-4 py-2 font-medium">ID</th>
                                            <th className="px-4 py-2 font-medium">Side</th>
                                            <th className="px-4 py-2 font-medium">Symbol</th>
                                            <th className="px-4 py-2 font-medium text-right">Qty</th>
                                            <th className="px-4 py-2 font-medium text-right">Price</th>
                                            <th className="px-4 py-2 font-medium text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800">
                                        {account.orders.slice().reverse().map(order => (
                                            <tr key={order.id} className="hover:bg-gray-800/30 transition-colors">
                                                <td className="px-4 py-2 text-gray-400 font-mono text-xs">
                                                    {new Date(order.submittedAt).toLocaleTimeString()}
                                                </td>
                                                <td className="px-4 py-2 text-gray-500 font-mono text-xs truncate max-w-[80px]">
                                                    {order.id.split('-')[0]}
                                                </td>
                                                <td className={`px-4 py-2 font-bold ${order.side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                                                    {order.side}
                                                </td>
                                                <td className="px-4 py-2 font-medium text-gray-200">
                                                    {order.symbol}
                                                </td>
                                                <td className="px-4 py-2 text-right text-gray-300">
                                                    {order.quantity}
                                                </td>
                                                <td className="px-4 py-2 text-right font-mono text-gray-300">
                                                    {order.filledPrice ? order.filledPrice.toFixed(2) : order.price.toFixed(2)}
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                    <Badge variant="outline" className={`text-[10px] h-5 ${getStatusColor(order.status)}`}>
                                                        {order.status}
                                                    </Badge>
                                                </td>
                                            </tr>
                                        ))}
                                        {account.orders.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-12 text-center text-gray-500 italic">
                                                    No orders submitted yet. Wait for signals.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Positions & Exposure */}
                <div className="space-y-6">
                    <Card className="bg-gray-900/50 border-gray-800 h-[500px] flex flex-col">
                        <CardHeader className="py-3 border-b border-gray-800">
                            <CardTitle className="text-sm font-bold text-gray-300">POSITIONS</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 p-0">
                            <div className="h-full overflow-auto">
                                <div className="divide-y divide-gray-800">
                                    {account.positions.map((pos, i) => (
                                        <div key={i} className="p-4 hover:bg-gray-800/20">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <span className="font-bold text-white block">{pos.symbol}</span>
                                                    <span className={`text-xs ${pos.side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                                                        {pos.side} {pos.quantity} @ {pos.avgEntryPrice.toFixed(2)}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="block font-bold text-gray-200">
                                                        ${(pos.currentPrice * pos.quantity).toLocaleString()}
                                                    </span>
                                                    <span className="text-xs text-gray-500">Mkt Value</span>
                                                </div>
                                            </div>
                                            {/* PnL Bar (Simulated) */}
                                            <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden mt-2">
                                                <div className="bg-gray-600 h-full w-1/2 ml-auto mr-auto opacity-50"></div>
                                                {/* Placeholder PnL visualization */}
                                            </div>
                                        </div>
                                    ))}
                                    {account.positions.length === 0 && (
                                        <div className="p-8 text-center text-gray-500 text-sm">
                                            No active positions.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

const ActivityIndicator = ({ active }: { active: boolean }) => (
    <span className={`relative flex h-3 w-3 ${active ? '' : 'hidden'}`}>
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
    </span>
);
