'use client';

import { useState, useEffect } from 'react';
import {
    calculatePortfolioRisk,
    type PortfolioRisk,
} from '@/lib/portfolioCorrelation';
import {
    getTrackingSummary,
    getAllTrackedSignals,
    updateSignalPrices,
    type TrackedSignal,
    type TrackingSummary,
} from '@/lib/signalTracker';
import {
    runMonteCarloSimulation,
    calculateKellyCriterion,
    type MonteCarloResult,
} from '@/lib/monteCarloEngine';
import { loadLearningState } from '@/lib/continuousLearning';
import {
    Shield, AlertTriangle, BarChart3,
    RefreshCw, Activity, PieChart, Zap, Flame
} from 'lucide-react';
import { runStressTest, type StressResult } from '@/lib/stressTestEngine';

export const RiskDashboardView = () => {
    const [portfolioRisk, setPortfolioRisk] = useState<PortfolioRisk | null>(null);
    const [trackingSummary, setTrackingSummary] = useState<TrackingSummary | null>(null);
    const [signals, setSignals] = useState<TrackedSignal[]>([]);
    const [monteCarloResult, setMonteCarloResult] = useState<MonteCarloResult | null>(null);
    const [kelly, setKelly] = useState<{ kelly: number; halfKelly: number; quarterKelly: number } | null>(null);
    const [stressResults, setStressResults] = useState<StressResult[]>([]);
    const [loading, setLoading] = useState(true);

    async function refreshAll() {
        setLoading(true);

        // Update signal prices
        await updateSignalPrices();

        // Load data
        setSignals(getAllTrackedSignals());
        setTrackingSummary(getTrackingSummary());
        setPortfolioRisk(calculatePortfolioRisk());

        // Fetch server-side outcome stats for Monte Carlo + Kelly
        try {
            const serverRes = await fetch('/api/signals?outcomes=1', { cache: 'no-store' });
            const serverData = await serverRes.json();
            if (serverData.success && Array.isArray(serverData.outcomes) && serverData.outcomes.length >= 5) {
                const trades = serverData.outcomes.map((o: { pnlR: number; outcome: string }) => ({
                    pnlR: o.pnlR,
                    winLoss: o.outcome === 'WIN' ? 'WIN' as const : 'LOSS' as const,
                }));
                if (trades.length >= 10) {
                    setMonteCarloResult(runMonteCarloSimulation(trades, { simulations: 500 }));
                    setKelly(calculateKellyCriterion(trades));
                }
            } else {
                // Fallback: use local learning state
                const learningState = loadLearningState();
                if (learningState.totalSignals > 10) {
                    const trades = [];
                    const avgWinR = 1.5;
                    const avgLossR = -1;
                    for (let i = 0; i < learningState.totalWins; i++) {
                        trades.push({ pnlR: avgWinR, winLoss: 'WIN' as const });
                    }
                    for (let i = 0; i < learningState.totalLosses; i++) {
                        trades.push({ pnlR: avgLossR, winLoss: 'LOSS' as const });
                    }
                    if (trades.length >= 10) {
                        setMonteCarloResult(runMonteCarloSimulation(trades, { simulations: 500 }));
                        setKelly(calculateKellyCriterion(trades));
                    }
                }
            }
        } catch {
            // Fallback to learning state if server unavailable
            const learningState = loadLearningState();
            if (learningState.totalSignals > 10) {
                const trades = [];
                for (let i = 0; i < learningState.totalWins; i++) trades.push({ pnlR: 1.5, winLoss: 'WIN' as const });
                for (let i = 0; i < learningState.totalLosses; i++) trades.push({ pnlR: -1, winLoss: 'LOSS' as const });
                if (trades.length >= 10) {
                    setMonteCarloResult(runMonteCarloSimulation(trades, { simulations: 500 }));
                    setKelly(calculateKellyCriterion(trades));
                }
            }
        }

        // Fetch real risk data for capital/exposure from /api/risk
        let capital = 100000;
        let exposure = 0;
        try {
            const riskRes = await fetch('/api/risk', { cache: 'no-store' });
            const riskData = await riskRes.json();
            if (riskData.success && riskData.report) {
                capital = riskData.report.positionSizing?.accountBalance || 100000;
                // Calculate exposure from active positions
                const activeSignals = getAllTrackedSignals().filter(s => s.status === 'ACTIVE');
                if (activeSignals.length > 0 && riskData.report.positionSizing?.suggestedSize) {
                    exposure = activeSignals.length * (riskData.report.positionSizing.suggestedSize * capital / 100);
                } else {
                    exposure = capital * 0.3; // Conservative 30% default
                }
            }
        } catch {
            exposure = capital * 0.3;
        }
        setStressResults(runStressTest(capital, exposure));

        setLoading(false);
    }

    useEffect(() => {
        const t = setTimeout(() => {
            void refreshAll();
        }, 0);
        return () => clearTimeout(t);
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="w-8 h-8 animate-spin text-purple-400" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Shield className="w-6 h-6 text-cyan-400" />
                        RISK DASHBOARD
                    </h2>
                    <p className="text-gray-400 text-sm mt-1">
                        Monitoramento de risco e análise estatística do portfólio
                    </p>
                </div>
                <button
                    onClick={refreshAll}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg flex items-center gap-2"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {/* Tracking Summary */}
            {trackingSummary && (
                <div className="grid grid-cols-6 gap-3">
                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 text-center">
                        <div className="text-xs text-gray-400 mb-1">Ativos</div>
                        <div className="text-2xl font-bold text-blue-400">{trackingSummary.activeCount}</div>
                    </div>
                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 text-center">
                        <div className="text-xs text-gray-400 mb-1">Fechados Hoje</div>
                        <div className="text-2xl font-bold text-gray-300">{trackingSummary.closedToday}</div>
                    </div>
                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 text-center">
                        <div className="text-xs text-gray-400 mb-1">Win Rate</div>
                        <div className={`text-2xl font-bold ${trackingSummary.winRate >= 0.5 ? 'text-green-400' : 'text-red-400'}`}>
                            {(trackingSummary.winRate * 100).toFixed(0)}%
                        </div>
                    </div>
                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 text-center">
                        <div className="text-xs text-gray-400 mb-1">Avg PnL (R)</div>
                        <div className={`text-2xl font-bold ${trackingSummary.avgPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {trackingSummary.avgPnL.toFixed(2)}R
                        </div>
                    </div>
                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 text-center">
                        <div className="text-xs text-gray-400 mb-1">Wins</div>
                        <div className="text-2xl font-bold text-green-400">{trackingSummary.totalWins}</div>
                    </div>
                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 text-center">
                        <div className="text-xs text-gray-400 mb-1">Losses</div>
                        <div className="text-2xl font-bold text-red-400">{trackingSummary.totalLosses}</div>
                    </div>
                </div>
            )}

            {/* Kelly Sizing */}
            {kelly && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                    <h3 className="text-emerald-400 font-bold mb-3 flex items-center gap-2">
                        <Zap className="w-4 h-4" />
                        KELLY SIZING
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-gray-800/40 rounded p-3 text-center">
                            <div className="text-xs text-gray-400 mb-1">Full Kelly</div>
                            <div className="text-lg font-bold text-emerald-300">{kelly.kelly.toFixed(1)}%</div>
                        </div>
                        <div className="bg-gray-800/40 rounded p-3 text-center">
                            <div className="text-xs text-gray-400 mb-1">Half Kelly</div>
                            <div className="text-lg font-bold text-emerald-300">{kelly.halfKelly.toFixed(1)}%</div>
                        </div>
                        <div className="bg-gray-800/40 rounded p-3 text-center">
                            <div className="text-xs text-gray-400 mb-1">Quarter Kelly</div>
                            <div className="text-lg font-bold text-emerald-300">{kelly.quarterKelly.toFixed(1)}%</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Portfolio Risk */}
            {portfolioRisk && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Diversification Score */}
                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                        <h3 className="text-cyan-400 font-bold mb-3 flex items-center gap-2">
                            <PieChart className="w-4 h-4" />
                            DIVERSIFICAÇÃO
                        </h3>
                        <div className="flex items-center gap-4">
                            <div className={`text-4xl font-bold ${portfolioRisk.diversificationScore >= 70 ? 'text-green-400' :
                                portfolioRisk.diversificationScore >= 40 ? 'text-yellow-400' : 'text-red-400'
                                }`}>
                                {portfolioRisk.diversificationScore.toFixed(0)}
                            </div>
                            <div className="flex-1">
                                <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-500 ${portfolioRisk.diversificationScore >= 70 ? 'bg-green-500' :
                                            portfolioRisk.diversificationScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                                            }`}
                                        style={{ width: `${portfolioRisk.diversificationScore}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs text-gray-500 mt-1">
                                    <span>Concentrado</span>
                                    <span>Diversificado</span>
                                </div>
                            </div>
                        </div>

                        {/* Direction Balance */}
                        <div className="mt-4 flex gap-2">
                            <div className="flex-1 bg-green-900/30 rounded p-2 text-center">
                                <div className="text-xs text-gray-400">LONG</div>
                                <div className="text-lg font-bold text-green-400">{portfolioRisk.directionBalance.long}</div>
                            </div>
                            <div className="flex-1 bg-red-900/30 rounded p-2 text-center">
                                <div className="text-xs text-gray-400">SHORT</div>
                                <div className="text-lg font-bold text-red-400">{portfolioRisk.directionBalance.short}</div>
                            </div>
                        </div>
                    </div>

                    {/* Warnings & Suggestions */}
                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                        <h3 className="text-amber-400 font-bold mb-3 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            ALERTAS
                        </h3>
                        {portfolioRisk.warnings.length > 0 ? (
                            <ul className="space-y-2">
                                {portfolioRisk.warnings.map((w, i) => (
                                    <li key={i} className="text-amber-300 text-sm">{w}</li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-gray-500 text-sm">Nenhum alerta</p>
                        )}

                        {portfolioRisk.suggestions.length > 0 && (
                            <div className="mt-4">
                                <h4 className="text-xs text-gray-400 mb-2">SUGESTÕES</h4>
                                <ul className="space-y-1">
                                    {portfolioRisk.suggestions.slice(0, 3).map((s, i) => (
                                        <li key={i} className="text-gray-300 text-sm">{s}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Correlation Heat Map */}
            {portfolioRisk && portfolioRisk.correlationMatrix.length > 0 && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                    <h3 className="text-purple-400 font-bold mb-3 flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        CORRELAÇÕES
                    </h3>
                    <div className="grid grid-cols-4 gap-2">
                        {portfolioRisk.correlationMatrix.slice(0, 8).map((c, i) => (
                            <div
                                key={i}
                                className={`p-2 rounded text-center ${c.riskLevel === 'CRITICAL' ? 'bg-red-900/50 border border-red-700' :
                                    c.riskLevel === 'HIGH' ? 'bg-orange-900/50 border border-orange-700' :
                                        c.riskLevel === 'MEDIUM' ? 'bg-yellow-900/50 border border-yellow-700' :
                                            'bg-gray-800/50 border border-gray-700'
                                    }`}
                            >
                                <div className="text-xs text-gray-400 truncate">
                                    {c.asset1} / {c.asset2}
                                </div>
                                <div className={`font-bold ${c.riskLevel === 'CRITICAL' ? 'text-red-400' :
                                    c.riskLevel === 'HIGH' ? 'text-orange-400' :
                                        c.riskLevel === 'MEDIUM' ? 'text-yellow-400' : 'text-gray-400'
                                    }`}>
                                    {(c.correlation * 100).toFixed(0)}%
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Monte Carlo */}
            {monteCarloResult && monteCarloResult.simulations > 0 && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                    <h3 className="text-green-400 font-bold mb-3 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4" />
                        MONTE CARLO ({monteCarloResult.simulations} simulações)
                    </h3>
                    <div className="grid grid-cols-5 gap-3">
                        <div className="text-center">
                            <div className="text-xs text-gray-400 mb-1">Retorno Médio</div>
                            <div className={`text-lg font-bold ${monteCarloResult.meanReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {monteCarloResult.meanReturn.toFixed(1)}%
                            </div>
                        </div>
                        <div className="text-center">
                            <div className="text-xs text-gray-400 mb-1">5º Percentil</div>
                            <div className="text-lg font-bold text-red-400">
                                {monteCarloResult.percentile5.toFixed(1)}%
                            </div>
                        </div>
                        <div className="text-center">
                            <div className="text-xs text-gray-400 mb-1">95º Percentil</div>
                            <div className="text-lg font-bold text-green-400">
                                {monteCarloResult.percentile95.toFixed(1)}%
                            </div>
                        </div>
                        <div className="text-center">
                            <div className="text-xs text-gray-400 mb-1">Prob. Lucro</div>
                            <div className={`text-lg font-bold ${monteCarloResult.probabilityOfProfit >= 0.6 ? 'text-green-400' : 'text-yellow-400'}`}>
                                {(monteCarloResult.probabilityOfProfit * 100).toFixed(0)}%
                            </div>
                        </div>
                        <div className="text-center">
                            <div className="text-xs text-gray-400 mb-1">Max DD (95%)</div>
                            <div className="text-lg font-bold text-red-400">
                                {monteCarloResult.maxDrawdown95.toFixed(1)}%
                            </div>
                        </div>
                    </div>
                </div>
            )}



            {/* Stress Tests */}
            {
                stressResults.length > 0 && (
                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                        <h3 className="text-red-500 font-bold mb-3 flex items-center gap-2">
                            <Flame className="w-4 h-4" />
                            STRESS TESTS (Black Swan Scenarios)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {stressResults.map((stress, i) => (
                                <div key={i} className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/50">
                                    <div className="text-sm font-bold text-gray-200 mb-1">{stress.scenario}</div>

                                    <div className="flex justify-between items-end mb-2">
                                        <div className="text-xs text-gray-500">Impact</div>
                                        <div className={`text-lg font-bold ${stress.survivability === 'CRITICAL' ? 'text-red-500' :
                                            stress.survivability === 'LOW' ? 'text-orange-500' :
                                                'text-yellow-500'
                                            }`}>
                                            {stress.portfolioImpact.toFixed(1)}%
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-500">Survivability</span>
                                            <span className={`font-bold ${stress.survivability === 'HIGH' ? 'text-green-400' :
                                                stress.survivability === 'MEDIUM' ? 'text-yellow-400' :
                                                    'text-red-400'
                                                }`}>{stress.survivability}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-500">Max DD Estimate</span>
                                            <span className="text-gray-300">{stress.maxDrawdown.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                    {stress.warnings.length > 0 && (
                                        <div className="mt-2 text-[10px] text-red-400 bg-red-900/20 px-2 py-1 rounded">
                                            ! {stress.warnings[0]}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }

            {/* Active Signals */}
            {
                signals.filter(s => s.status === 'ACTIVE').length > 0 && (
                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                        <h3 className="text-blue-400 font-bold mb-3 flex items-center gap-2">
                            <Zap className="w-4 h-4" />
                            SINAIS ATIVOS ({signals.filter(s => s.status === 'ACTIVE').length})
                        </h3>
                        <div className="space-y-2">
                            {signals.filter(s => s.status === 'ACTIVE').map(signal => (
                                <div key={signal.id} className="flex items-center justify-between bg-gray-800/50 rounded p-3">
                                    <div className="flex items-center gap-3">
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${signal.direction === 'LONG' ? 'bg-green-600' : 'bg-red-600'
                                            }`}>
                                            {signal.direction}
                                        </span>
                                        <span className="font-bold">{signal.asset}</span>
                                        <span className="text-gray-400 text-sm">@{signal.entryPrice.toFixed(2)}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-gray-400 text-sm">
                                            Now: {signal.currentPrice.toFixed(2)}
                                        </span>
                                        <span className={`font-bold ${signal.currentPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {signal.currentPnL >= 0 ? '+' : ''}{signal.currentPnL.toFixed(2)}R
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }
        </div >
    );
};
