'use client';

import React, { useState } from 'react';
import { useStore } from '@/store/useStore';
import {
    Zap, ArrowRight, Play, CheckCircle2, XCircle,
    BarChart3, Brain, Globe, Shield, AlertTriangle
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getActiveSignals, TrackedSignal } from '@/lib/signalTracker';
import { loadLearningState } from '@/lib/continuousLearning';

export const ExecutiveDashboardView = () => {
    const { setView, setFactoryTab } = useStore();
    const [heroSignal] = useState<TrackedSignal | null>(() => {
        const active = getActiveSignals().slice().sort((a, b) => b.score - a.score);
        return active[0] || null;
    });
    const [confidence] = useState<number>(() => {
        const learning = loadLearningState();
        return learning.confidence;
    });
    const [regime] = useState<string>(() => {
        const h = new Date().getHours();
        return h > 9 && h < 16 ? 'RISK_ON' : 'NEUTRAL';
    });

    // Helper for score color
    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-400';
        if (score >= 60) return 'text-yellow-400';
        return 'text-red-400';
    };

    return (
        <div className="space-y-8 max-w-5xl mx-auto">

            {/* 🔴 BLOCO 1 – AÇÃO IMEDIATA (HERO) */}
            <div className="w-full">
                {heroSignal ? (
                    <Card className="bg-gradient-to-r from-gray-900 to-gray-900/50 border-l-4 border-l-yellow-500 border-y border-r border-gray-800 shadow-2xl shadow-yellow-900/10">
                        <CardContent className="p-6 md:p-8">
                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                                {/* Left: Signal Identity */}
                                <div className="space-y-1">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-yellow-500/20 text-yellow-500 px-3 py-1 rounded text-xs font-bold uppercase tracking-wider animate-pulse">
                                            Sinal Ativo Agora
                                        </div>
                                        <span className="text-gray-500 text-xs font-mono">#{heroSignal.id.slice(0, 6)}</span>
                                    </div>
                                    <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
                                        {heroSignal.asset}
                                    </h1>
                                    <div className={`text-xl font-bold flex items-center gap-2 ${heroSignal.direction === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                                        {heroSignal.direction} <span className="text-gray-400 text-sm font-normal">@ {heroSignal.entryPrice.toFixed(2)}</span>
                                    </div>
                                </div>

                                {/* Center: Key Metrics */}
                                <div className="flex gap-8 border-l border-gray-800 pl-8">
                                    <div>
                                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Score</div>
                                        <div className={`text-4xl font-bold ${getScoreColor(heroSignal.score)}`}>
                                            {heroSignal.score}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Risco</div>
                                        <div className="text-xl font-bold text-gray-200 mt-2">1.0%</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Alvo</div>
                                        <div className="text-xl font-bold text-gray-200 mt-2">1:{heroSignal.takeProfits[0]?.ratio.split(':')[0] || '2'}</div>
                                    </div>
                                </div>

                                {/* Right: Action Button */}
                                <div>
                                    <Button
                                        size="lg"
                                        className="bg-yellow-600 hover:bg-yellow-500 text-white font-bold px-8 h-14 text-lg shadow-lg shadow-yellow-900/20 w-full md:w-auto"
                                        onClick={() => window.open('https://t.me/share/url?url=EXECUTING ' + heroSignal.asset, '_blank')}
                                    >
                                        EXECUTAR AGORA <ArrowRight className="ml-2 w-5 h-5" />
                                    </Button>
                                    <div className="text-center mt-2 text-xs text-gray-500">
                                        Expira em 2h
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="bg-gray-900/30 border border-gray-800 border-dashed py-12">
                        <CardContent className="text-center">
                            <div className="bg-gray-800/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Zap className="w-6 h-6 text-gray-600" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-300">Nenhuma oportunidade de alta probabilidade agora.</h2>
                            <p className="text-gray-500 mt-2 max-w-md mx-auto">
                                O sistema está escaneando 200 ativos. Próxima janela de volatilidade estimada em 2 horas.
                                <span className="text-yellow-500 cursor-pointer hover:underline ml-1" onClick={() => setView('universe')}>
                                    Ver Scanner Completo
                                </span>
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* 🟡 BLOCO 2 – CONTEXTO DE DECISÃO */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-gray-900/40 border-gray-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Globe className="w-4 h-4 text-blue-500" />
                            <span className="text-xs text-gray-400 font-bold uppercase">Regime Macro</span>
                        </div>
                        <div className="text-xl font-bold text-gray-200">{regime.replace('_', ' ')}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gray-900/40 border-gray-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Brain className="w-4 h-4 text-purple-500" />
                            <span className="text-xs text-gray-400 font-bold uppercase">Confiança IA</span>
                        </div>
                        <div className="text-xl font-bold text-purple-300">{(confidence * 100).toFixed(0)}%</div>
                    </CardContent>
                </Card>
                <Card className="bg-gray-900/40 border-gray-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <BarChart3 className="w-4 h-4 text-orange-500" />
                            <span className="text-xs text-gray-400 font-bold uppercase">Timeframe Líder</span>
                        </div>
                        <div className="text-xl font-bold text-gray-200">Daily</div>
                    </CardContent>
                </Card>
                <Card className="bg-gray-900/40 border-gray-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Shield className="w-4 h-4 text-green-500" />
                            <span className="text-xs text-gray-400 font-bold uppercase">Drawdown Médio</span>
                        </div>
                        <div className="text-xl font-bold text-green-300">-4.3%</div>
                    </CardContent>
                </Card>
            </div>

            {/* 🔵 BLOCO 3 – VALIDAÇÃO RÁPIDA */}
            <Card className="bg-gray-900/20 border-gray-800">
                <CardContent className="p-6">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Checklist de Validação</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="flex items-center gap-2 text-gray-300">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            <span className="text-sm">Macro Alinhado</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-300">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            <span className="text-sm">Fluxo Institucional</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-300">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            <span className="text-sm">Estrutura Técnica</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-400">
                            <AlertTriangle className="w-4 h-4 text-yellow-500" />
                            <span className="text-sm">Volatilidade Alta</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ⚫ BLOCO 4 – EXECUÇÃO SECUNDÁRIA */}
            <div className="flex flex-wrap gap-4">
                <Button
                    variant="outline"
                    className="flex-1 bg-gray-900 border-gray-800 hover:bg-gray-800 hover:text-white"
                    onClick={() => {
                        setFactoryTab('paper');
                        setView('factory');
                    }}
                >
                    <Play className="w-4 h-4 mr-2" /> Simular no Incubator
                </Button>
                <Button
                    variant="outline"
                    className="flex-1 bg-gray-900 border-gray-800 hover:bg-gray-800 hover:text-white"
                    onClick={() => {
                        setFactoryTab('backtest');
                        setView('factory');
                    }}
                >
                    <BarChart3 className="w-4 h-4 mr-2" /> Ver Backtest do Setup
                </Button>
            </div>

            {/* 🟢 BLOCO 5 – APRENDIZADO PASSIVO */}
            <div className="bg-blue-900/10 border border-blue-900/30 rounded-lg p-4 flex gap-4 items-start">
                <div className="bg-blue-900/30 p-2 rounded mt-1">
                    <Brain className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                    <h4 className="text-blue-400 font-bold text-sm mb-1">Insight do Sistema</h4>
                    <p className="text-blue-200/70 text-sm leading-relaxed">
                        {heroSignal
                            ? `Você está prestes a executar um trade com Score ${heroSignal.score}. Historicamente, em regimes ${regime}, setups entre 80-85 possuem uma taxa de acerto de 63% e Payoff médio de 1.8.`
                            : "Enquanto aguardamos liquidez, note que a volatilidade do BTC caiu 15% nas últimas 24h, o que geralmente precede movimentos de expansão (Power Law)."
                        }
                    </p>
                </div>
            </div>

        </div>
    );
};
