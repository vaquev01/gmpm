'use client';

import { useState } from 'react';
import {
    runBacktest,
    DEFAULT_BACKTEST_CONFIG,
    BacktestConfig,
    BacktestResult,
    BacktestCandle,
} from '@/lib/backtestEngine';
import {
    Play, TrendingUp, TrendingDown, BarChart3, Target,
    AlertTriangle, Activity, RefreshCw, Settings, ChevronDown, ChevronUp, Sliders
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BTC-USD', 'ETH-USD', 'GC=F', 'CL=F'];
const PERIODS = ['1M', '3M', '6M', '1Y', '2Y'];

export const BacktestView = () => {
    const [symbol, setSymbol] = useState('SPY');
    const [period, setPeriod] = useState('6M');
    const [config, setConfig] = useState<BacktestConfig>(DEFAULT_BACKTEST_CONFIG);
    const [result, setResult] = useState<BacktestResult | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showTrades, setShowTrades] = useState(false);

    const runBacktestHandler = async () => {
        setIsRunning(true);
        setError(null);
        // setResult(null); // Keep previous result visible while loading new one? No, clear it to show action. Actually keeping it is better for comparison but let's clear for clarity.

        try {
            const response = await fetch(`/api/history?symbol=${symbol}&period=${period}`);
            const data = await response.json();

            if (!data.success) {
                setError(data.error || 'Failed to fetch data');
                return;
            }

            const candles: BacktestCandle[] = data.data.candles;
            const backtestResult = runBacktest(candles, config, symbol, period);
            setResult(backtestResult);

        } catch (err) {
            setError('Backtest failed: ' + (err as Error).message);
        } finally {
            setIsRunning(false);
        }
    };

    const getMetricColor = (value: number, threshold: number, inverse = false) => {
        if (inverse) {
            return value <= threshold ? 'text-green-400' : value <= threshold * 1.5 ? 'text-yellow-400' : 'text-red-400';
        }
        return value >= threshold ? 'text-green-400' : value >= threshold * 0.5 ? 'text-yellow-400' : 'text-red-400';
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-200px)]">

            {/* LEFT SIDEBAR: CONFIGURATION (25%) */}
            <div className="lg:col-span-3 space-y-6 flex flex-col h-full overflow-y-auto pr-2 border-r border-gray-800">
                <div>
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Sliders className="w-4 h-4" /> Configuration
                    </h3>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs text-gray-500 font-bold">ASSET & PERIOD</label>
                            <div className="grid grid-cols-2 gap-2">
                                <select
                                    value={symbol}
                                    onChange={(e) => setSymbol(e.target.value)}
                                    className="px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200"
                                >
                                    {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <select
                                    value={period}
                                    onChange={(e) => setPeriod(e.target.value)}
                                    className="px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200"
                                >
                                    {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-gray-500 font-bold">RISK MANAGEMENT</label>
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs text-gray-400">
                                    <span>Initial Capital</span>
                                    <span>${config.initialCapital.toLocaleString()}</span>
                                </div>
                                <input
                                    type="number"
                                    value={config.initialCapital}
                                    onChange={(e) => setConfig({ ...config, initialCapital: Number(e.target.value) })}
                                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200"
                                />

                                <div className="flex justify-between text-xs text-gray-400 mt-2">
                                    <span>Risk Per Trade (%)</span>
                                    <span>{config.riskPerTrade}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.1"
                                    max="5"
                                    step="0.1"
                                    value={config.riskPerTrade}
                                    onChange={(e) => setConfig({ ...config, riskPerTrade: Number(e.target.value) })}
                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-gray-500 font-bold">STRATEGY PARAMETERS</label>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <span className="text-xs text-gray-400 block mb-1">Min Score</span>
                                    <input
                                        type="number"
                                        value={config.minScore}
                                        onChange={(e) => setConfig({ ...config, minScore: Number(e.target.value) })}
                                        className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200"
                                    />
                                </div>
                                <div>
                                    <span className="text-xs text-gray-400 block mb-1">Stop %</span>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={config.stopLossPercent}
                                        onChange={(e) => setConfig({ ...config, stopLossPercent: Number(e.target.value) })}
                                        className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200"
                                    />
                                </div>
                            </div>
                        </div>

                        <Button
                            onClick={runBacktestHandler}
                            disabled={isRunning}
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold h-12 mt-4"
                        >
                            {isRunning ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                            {isRunning ? 'RUNNING...' : 'RUN SIMULATION'}
                        </Button>
                    </div>

                    {error && (
                        <div className="mt-4 bg-red-900/20 border border-red-500/50 p-3 rounded text-xs text-red-400">
                            {error}
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT MAIN AREA: RESULTS (75%) */}
            <div className="lg:col-span-9 space-y-6 overflow-y-auto h-full scrollbar-none pb-12">
                {!result ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 border-2 border-dashed border-gray-800 rounded-xl min-h-[400px]">
                        <Activity className="w-16 h-16 mb-4 opacity-20" />
                        <h3 className="text-xl font-bold opacity-50">Ready to Simulate</h3>
                        <p className="text-sm opacity-40 max-w-xs text-center mt-2">
                            Configure parameters on the left and click "Run Simulation" to generate performance data.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* 1. HERO: EQUITY CURVE */}
                        <Card className="bg-gray-900/50 border-gray-800">
                            <CardHeader className="pb-2">
                                <CardTitle className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <TrendingUp className="w-5 h-5 text-green-400" />
                                        <span className="text-gray-200">Equity Curve & Drawdown</span>
                                    </div>
                                    <div className={`text-2xl font-bold ${result.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {result.totalReturn >= 0 ? '+' : ''}{result.totalReturn.toFixed(2)}%
                                    </div>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-64 flex items-end gap-px w-full">
                                    {result.equityCurve.map((point, i) => {
                                        // Simple normalization for visualization
                                        // In real app use a charting lib like Recharts
                                        const min = Math.min(...result.equityCurve.map(p => p.equity)) * 0.99;
                                        const max = Math.max(...result.equityCurve.map(p => p.equity)) * 1.01;
                                        const range = max - min;
                                        const h = ((point.equity - min) / range) * 100;
                                        const isProfit = point.equity >= result.initialCapital;

                                        // Reduce density if too many points
                                        if (result.equityCurve.length > 200 && i % 2 !== 0) return null;

                                        return (
                                            <div
                                                key={i}
                                                className={`flex-1 min-w-[2px] rounded-t-sm transition-all hover:bg-white ${isProfit ? 'bg-green-500/80' : 'bg-red-500/80'}`}
                                                style={{ height: `${Math.max(2, h)}%` }}
                                                title={`${point.date}: $${point.equity.toFixed(0)}`}
                                            />
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>

                        {/* 2. KEY METRICS GRID */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <Card className="bg-gray-900/30 border-gray-800">
                                <CardContent className="p-4 text-center">
                                    <div className="text-xs text-gray-500 uppercase font-bold mb-1">Win Rate</div>
                                    <div className={`text-3xl font-bold ${getMetricColor(result.winRate, 50)}`}>
                                        {result.winRate.toFixed(1)}%
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-gray-900/30 border-gray-800">
                                <CardContent className="p-4 text-center">
                                    <div className="text-xs text-gray-500 uppercase font-bold mb-1">Profit Factor</div>
                                    <div className={`text-3xl font-bold ${getMetricColor(result.profitFactor, 1.5)}`}>
                                        {result.profitFactor.toFixed(2)}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-gray-900/30 border-gray-800">
                                <CardContent className="p-4 text-center">
                                    <div className="text-xs text-gray-500 uppercase font-bold mb-1">Drawdown</div>
                                    <div className={`text-3xl font-bold ${getMetricColor(result.maxDrawdown, 15, true)}`}>
                                        -{result.maxDrawdown.toFixed(1)}%
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-gray-900/30 border-gray-800">
                                <CardContent className="p-4 text-center">
                                    <div className="text-xs text-gray-500 uppercase font-bold mb-1">Trades</div>
                                    <div className="text-3xl font-bold text-white">
                                        {result.totalTrades}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* 3. TRADE LOG (Expandable) */}
                        <Card className="bg-gray-900/30 border-gray-800">
                            <div
                                className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-800/50"
                                onClick={() => setShowTrades(!showTrades)}
                            >
                                <h3 className="font-bold text-gray-300 flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-purple-400" />
                                    Execution Log
                                </h3>
                                {showTrades ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                            </div>

                            {showTrades && (
                                <div className="border-t border-gray-800 max-h-80 overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-900 text-gray-500 text-xs sticky top-0">
                                            <tr>
                                                <th className="text-left p-3 font-normal">Date (In/Out)</th>
                                                <th className="text-center p-3 font-normal">Dir</th>
                                                <th className="text-right p-3 font-normal">Price</th>
                                                <th className="text-right p-3 font-normal">Result</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-800">
                                            {result.trades.map((trade, i) => (
                                                <tr key={i} className="hover:bg-gray-800/30 transition-colors">
                                                    <td className="p-3 text-gray-400">
                                                        <div>{trade.entryDate}</div>
                                                        <div className="text-xs opacity-50">{trade.exitDate}</div>
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <span className={`text-xs font-bold px-2 py-1 rounded ${trade.direction === 'LONG' ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
                                                            {trade.direction}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-right text-gray-300 font-mono text-xs">
                                                        <div>Entry: {trade.entryPrice.toFixed(2)}</div>
                                                        <div>Exit: {trade.exitPrice.toFixed(2)}</div>
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <div className={`font-bold ${trade.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                            {trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(2)}%
                                                        </div>
                                                        <div className="text-xs text-gray-500">{trade.pnlR >= 0 ? '+' : ''}{trade.pnlR.toFixed(2)}R</div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>
                    </>
                )}
            </div>
        </div>
    );
};
