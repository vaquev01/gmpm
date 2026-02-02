'use client';

import { useState } from 'react';
import {
    loadLearningState,
    getLearningInsights,
    resetLearning,
    exportLearningData,
    importLearningData,
    type LearningState,
    type LearningInsight,
} from '@/lib/continuousLearning';
import {
    Brain, TrendingUp, TrendingDown, AlertTriangle,
    RefreshCw, Download, Upload, Trash2, BarChart3, Target
} from 'lucide-react';

export const LearningInsightsView = () => {
    const [state, setState] = useState<LearningState | null>(() => {
        try {
            return loadLearningState();
        } catch {
            return null;
        }
    });
    const [insights, setInsights] = useState<LearningInsight | null>(() => {
        try {
            return getLearningInsights();
        } catch {
            return null;
        }
    });
    const [showImport, setShowImport] = useState(false);
    const [importData, setImportData] = useState('');

    function refreshData() {
        setState(loadLearningState());
        setInsights(getLearningInsights());
    }

    const handleExport = () => {
        const data = exportLearningData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gmpm-learning-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    };

    const handleImport = () => {
        if (importLearningData(importData)) {
            refreshData();
            setShowImport(false);
            setImportData('');
        }
    };

    const handleReset = () => {
        if (confirm('Resetar todo o aprendizado? Esta ação não pode ser desfeita.')) {
            resetLearning();
            refreshData();
        }
    };

    if (!state) return null;

    const winRate = state.totalSignals > 0
        ? ((state.totalWins / state.totalSignals) * 100).toFixed(1)
        : '0.0';

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Brain className="w-6 h-6 text-purple-400" />
                        APRENDIZADO CONTÍNUO
                    </h2>
                    <p className="text-gray-400 text-sm mt-1">
                        O sistema aprende e ajusta pesos com base nos resultados
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={refreshData}
                        className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg flex items-center gap-1"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                        onClick={handleExport}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1"
                    >
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                    <button
                        onClick={() => setShowImport(!showImport)}
                        className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg flex items-center gap-1"
                    >
                        <Upload className="w-4 h-4" />
                        Import
                    </button>
                    <button
                        onClick={handleReset}
                        className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg flex items-center gap-1"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Import Panel */}
            {showImport && (
                <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                    <textarea
                        value={importData}
                        onChange={(e) => setImportData(e.target.value)}
                        placeholder="Cole o JSON de aprendizado aqui..."
                        className="w-full h-32 bg-gray-800 border border-gray-600 rounded-lg p-3 text-sm font-mono"
                    />
                    <button
                        onClick={handleImport}
                        className="mt-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg"
                    >
                        Importar Dados
                    </button>
                </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-5 gap-3">
                <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 text-center">
                    <div className="text-xs text-gray-400 mb-1">Data Points</div>
                    <div className="text-2xl font-bold text-blue-400">{state.totalSignals}</div>
                </div>
                <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 text-center">
                    <div className="text-xs text-gray-400 mb-1">Win Rate</div>
                    <div className={`text-2xl font-bold ${Number(winRate) >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                        {winRate}%
                    </div>
                </div>
                <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 text-center">
                    <div className="text-xs text-gray-400 mb-1">Wins</div>
                    <div className="text-2xl font-bold text-green-400">{state.totalWins}</div>
                </div>
                <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 text-center">
                    <div className="text-xs text-gray-400 mb-1">Losses</div>
                    <div className="text-2xl font-bold text-red-400">{state.totalLosses}</div>
                </div>
                <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 text-center">
                    <div className="text-xs text-gray-400 mb-1">Confidence</div>
                    <div className="text-2xl font-bold text-purple-400">
                        {(state.confidence * 100).toFixed(0)}%
                    </div>
                </div>
            </div>

            {/* Learning Progress */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                <h3 className="text-purple-400 font-bold mb-3 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    PROGRESSO DO APRENDIZADO
                </h3>
                <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-purple-600 to-blue-500 transition-all duration-500"
                        style={{ width: `${Math.min(100, state.totalSignals)}%` }}
                    />
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-2">
                    <span>{state.totalSignals} sinais registrados</span>
                    <span>Meta: 100 para confiança total</span>
                </div>
            </div>

            {insights && (
                <>
                    {/* Top & Worst Performers */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                            <h3 className="text-green-400 font-bold mb-3 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4" />
                                TOP PERFORMERS
                            </h3>
                            {insights.topPerformers.length > 0 ? (
                                <div className="space-y-2">
                                    {insights.topPerformers.map((perf, i) => (
                                        <div key={i} className="flex justify-between items-center">
                                            <span className="text-gray-300">{perf.component.toUpperCase()}</span>
                                            <span className="text-green-400 font-bold">{perf.score}/100</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-gray-500 text-sm">Dados insuficientes</p>
                            )}
                        </div>

                        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                            <h3 className="text-red-400 font-bold mb-3 flex items-center gap-2">
                                <TrendingDown className="w-4 h-4" />
                                BAIXA PERFORMANCE
                            </h3>
                            {insights.worstPerformers.length > 0 ? (
                                <div className="space-y-2">
                                    {insights.worstPerformers.map((perf, i) => (
                                        <div key={i} className="flex justify-between items-center">
                                            <span className="text-gray-300">{perf.component.toUpperCase()}</span>
                                            <span className="text-red-400 font-bold">{perf.score}/100</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-gray-500 text-sm">Dados insuficientes</p>
                            )}
                        </div>
                    </div>

                    {/* Optimized Weights */}
                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                        <h3 className="text-cyan-400 font-bold mb-3 flex items-center gap-2">
                            <Target className="w-4 h-4" />
                            PESOS OTIMIZADOS
                        </h3>
                        <div className="grid grid-cols-4 gap-2">
                            {Object.entries(state.optimizedWeights)
                                .sort((a, b) => b[1] - a[1])
                                .map(([comp, weight]) => (
                                    <div key={comp} className="flex items-center gap-2">
                                        <div
                                            className="h-2 bg-cyan-500 rounded"
                                            style={{ width: `${weight * 300}px` }}
                                        />
                                        <span className="text-xs text-gray-400">
                                            {comp}: {(weight * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                ))}
                        </div>
                    </div>

                    {/* Recommendations */}
                    {insights.recommendations.length > 0 && (
                        <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-4">
                            <h3 className="text-amber-400 font-bold mb-3 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" />
                                RECOMENDAÇÕES DO SISTEMA
                            </h3>
                            <ul className="space-y-2">
                                {insights.recommendations.map((rec, i) => (
                                    <li key={i} className="text-amber-300 text-sm flex items-start gap-2">
                                        <span className="text-amber-500">•</span>
                                        {rec}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Regime Best Components */}
                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                        <h3 className="text-blue-400 font-bold mb-3">
                            MELHORES COMPONENTES POR REGIME
                        </h3>
                        <div className="grid grid-cols-4 gap-4">
                            {Object.entries(insights.regimeBest).map(([regime, comps]) => (
                                <div key={regime}>
                                    <div className="text-xs text-gray-400 mb-1">{regime}</div>
                                    <div className="text-sm text-blue-300">
                                        {comps.length > 0 ? comps.slice(0, 2).join(', ') : '-'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
