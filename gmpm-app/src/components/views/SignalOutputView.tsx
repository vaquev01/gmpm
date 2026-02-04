'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import {
    fetchRealMarketData,
    convertToMarketData,
    evaluateRealSignals,
    detectRegime,
    generateExecutiveSummary,
    MacroData,
    TradeSignal
} from '@/lib/realEngine';
import {
    determineScenario,
    generateThesis,
    getMacroIndicators,
    ScenarioAnalysis,
    Thesis
} from '@/lib/macroEngine';
import {
    getPortfolioManager,
    PortfolioState,
} from '@/lib/portfolioManager';
import {
    addSignal,
    calculateStats,
    getSignalHistory,
    markAsWin,
    markAsLoss,
    PerformanceStats,
    HistoricalSignal,
} from '@/lib/signalHistory';
import {
    Play, Pause, RefreshCw, TrendingUp,
    AlertCircle, Activity, Thermometer, BarChart3,
    Copy, Download, ChevronDown, ChevronUp, Target, Shield,
    Briefcase, AlertTriangle, CheckCircle, XCircle,
    DollarSign, Percent, TrendingDown as TrendDown,
    Send, History, Bell, Layers
} from 'lucide-react';

interface FredSummary {
    gdp: { value: number | null; trend: string };
    inflation: { cpiYoY: number | null; trend: string };
    employment: { unemploymentRate: number | null; trend: string };
    rates: { fedFunds: number | null; yieldCurve: number | null; curveStatus: string };
    credit: { hySpread: number | null; condition: string };
    sentiment: { consumerSentiment: number | null; condition: string };
}

export const SignalOutputView = () => {
    const { updateMarketData } = useStore();
    const [signals, setSignals] = useState<TradeSignal[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [macro, setMacro] = useState<MacroData | null>(null);
    const [regime, setRegime] = useState<{ regime: string; description: string; confidence: number } | null>(null);
    const [stats, setStats] = useState<{ totalAssets: number; gainers: number; losers: number; avgChange: number } | null>(null);
    const [summary, setSummary] = useState<string>('');
    const [expandedSignal, setExpandedSignal] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // NEW: PRD v8.1 features
    const [scenario, setScenario] = useState<ScenarioAnalysis | null>(null);
    const [thesis, setThesis] = useState<Thesis | null>(null);
    const [portfolio, setPortfolio] = useState<PortfolioState | null>(null);
    const [fredData, setFredData] = useState<FredSummary | null>(null);
    const [showPortfolio, setShowPortfolio] = useState(false);
    const [showThesis, setShowThesis] = useState(true);

    // Phase 1: Institutional Features
    const [perfStats, setPerfStats] = useState<PerformanceStats | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [showTelegramConfig, setShowTelegramConfig] = useState(false);
    const [telegramToken, setTelegramToken] = useState('');
    const [telegramChatId, setTelegramChatId] = useState('');
    const [sendingTelegram, setSendingTelegram] = useState<string | null>(null);

    const historySignals: HistoricalSignal[] = showHistory ? getSignalHistory() : [];

    const promptExitPrice = (label: string, fallback: number) => {
        const raw = prompt(label, String(fallback));
        if (!raw) return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    };

    const handleMarkWin = (s: HistoricalSignal) => {
        const exitPx = promptExitPrice(`Exit price for WIN (${s.symbol})`, s.takeProfit1);
        if (exitPx == null) return;
        markAsWin(s.id, exitPx);
        setPerfStats(calculateStats());
    };

    const handleMarkLoss = (s: HistoricalSignal) => {
        const exitPx = promptExitPrice(`Exit price for LOSS (${s.symbol})`, s.stopLoss);
        if (exitPx == null) return;
        markAsLoss(s.id, exitPx);
        setPerfStats(calculateStats());
    };

    // Load performance stats on mount
    useEffect(() => {
        setPerfStats(calculateStats());
    }, [signals]);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            // Fetch market data
            const response = await fetchRealMarketData();
            if (!response || response.data.length === 0) {
                setError('Não foi possível obter dados do mercado');
                return;
            }

            setMacro(response.macro);
            setStats(response.stats);

            const detectedRegime = detectRegime(response.macro);
            setRegime(detectedRegime);

            // Fetch FRED data
            try {
                const fredResponse = await fetch('/api/fred');
                const fredJson = await fredResponse.json();
                if (fredJson.success) {
                    setFredData(fredJson.summary);
                }
            } catch {
                // Continue without FRED data
            }

            // Determine scenario and thesis
            const macroIndicators = getMacroIndicators();
            const detectedScenario = determineScenario(
                macroIndicators,
                response.macro.vix,
                response.macro.fearGreed?.value || 50
            );
            setScenario(detectedScenario);

            const generatedThesis = generateThesis(
                detectedScenario,
                macroIndicators,
                response.macro.vix,
                response.macro.fearGreed?.value || 50
            );
            setThesis(generatedThesis);

            // Update portfolio
            const portfolioMgr = getPortfolioManager();
            setPortfolio(portfolioMgr.getState());

            // Convert and evaluate
            const marketData = convertToMarketData(response.data, response.macro);
            updateMarketData(marketData);

            const evaluatedSignals = evaluateRealSignals(
                response.data,
                marketData,
                response.macro,
                detectedRegime.regime,
                55
            );
            setSignals(evaluatedSignals);

            const execSummary = generateExecutiveSummary(evaluatedSignals, detectedRegime.regime, response.macro);
            setSummary(execSummary);

            setLastUpdate(new Date());
        } catch (err) {
            setError('Erro ao buscar dados do mercado');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [updateMarketData]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isRunning) interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, [isRunning, fetchData]);

    const copyOneLiner = (oneLiner: string, id: string) => {
        navigator.clipboard.writeText(oneLiner);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const exportJSON = () => {
        const exportData = {
            timestamp: new Date().toISOString(),
            regime,
            scenario,
            thesis,
            macro,
            fredData,
            portfolio,
            stats,
            summary,
            signals: signals.map(s => ({
                symbol: s.asset,
                direction: s.direction,
                score: s.score,
                confidence: s.confidence,
                price: s.price,
                entryZone: s.entryZone,
                stopLoss: s.stopLoss,
                takeProfits: s.takeProfits,
                positionSize: s.positionSize,
                oneLiner: s.oneLiner,
                rationale: s.rationale,
                keyDrivers: s.keyDrivers,
                risks: s.risks,
                validityHours: s.validityHours,
            })),
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gmpm_output_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    };

    const getConfidenceColor = (c: string) => {
        if (c === 'INSTITUTIONAL') return 'text-purple-400 bg-purple-400/20 border-purple-400/30';
        if (c === 'STRONG') return 'text-green-400 bg-green-400/20 border-green-400/30';
        return 'text-yellow-400 bg-yellow-400/20 border-yellow-400/30';
    };

    const getRegimeColor = (r: string) => {
        if (r === 'RISK_ON') return 'bg-green-500/20 text-green-400 border-green-500';
        if (r === 'RISK_OFF') return 'bg-orange-500/20 text-orange-400 border-orange-500';
        if (r === 'STRESS') return 'bg-red-500/20 text-red-400 border-red-500';
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500';
    };

    const getScenarioColor = (s: string) => {
        const colors: Record<string, string> = {
            GOLDILOCKS: 'text-emerald-400 bg-emerald-400/20',
            DISINFLATION: 'text-green-400 bg-green-400/20',
            REACCELERATION: 'text-orange-400 bg-orange-400/20',
            RISK_OFF: 'text-red-400 bg-red-400/20',
            CARRY: 'text-blue-400 bg-blue-400/20',
            SHOCK: 'text-red-500 bg-red-500/20',
            STAGFLATION: 'text-amber-400 bg-amber-400/20',
        };
        return colors[s] || 'text-gray-400 bg-gray-400/20';
    };

    const formatPrice = (p: number) => {
        if (p > 1000) return p.toFixed(2);
        if (p > 10) return p.toFixed(2);
        return p.toFixed(4);
    };

    // Asset classification helper
    const getAssetInfo = (symbol: string): { type: string; typeIcon: string; typeColor: string; sector: string | null } => {
        // SECTORS mapping
        const SECTORS: Record<string, string> = {
            // Energy
            'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy', 'SLB': 'Energy', 'OXY': 'Energy',
            'EOG': 'Energy', 'PXD': 'Energy', 'MPC': 'Energy', 'VLO': 'Energy', 'PSX': 'Energy',
            'XLE': 'Energy', 'CL': 'Energy', 'NG': 'Energy', 'BZ': 'Energy',
            // Technology
            'AAPL': 'Tech', 'MSFT': 'Tech', 'GOOGL': 'Tech', 'AMZN': 'Tech', 'META': 'Tech',
            'NVDA': 'Tech', 'AMD': 'Tech', 'INTC': 'Tech', 'CRM': 'Tech', 'ADBE': 'Tech',
            'NFLX': 'Tech', 'PYPL': 'Tech', 'SHOP': 'Tech', 'SQ': 'Tech', 'NOW': 'Tech',
            'XLK': 'Tech', 'QQQ': 'Tech',
            // Financial
            'JPM': 'Finance', 'BAC': 'Finance', 'WFC': 'Finance', 'GS': 'Finance', 'MS': 'Finance',
            'C': 'Finance', 'BLK': 'Finance', 'V': 'Finance', 'MA': 'Finance', 'AXP': 'Finance',
            'XLF': 'Finance',
            // Healthcare
            'JNJ': 'Health', 'PFE': 'Health', 'UNH': 'Health', 'MRK': 'Health', 'ABBV': 'Health',
            'LLY': 'Health', 'ABT': 'Health', 'TMO': 'Health', 'BMY': 'Health', 'AMGN': 'Health',
            'XLV': 'Health',
            // Consumer
            'WMT': 'Consumer', 'HD': 'Consumer', 'COST': 'Consumer', 'NKE': 'Consumer', 'SBUX': 'Consumer',
            'MCD': 'Consumer', 'DIS': 'Consumer', 'TGT': 'Consumer', 'LOW': 'Consumer',
            'XLY': 'Consumer', 'XLP': 'Consumer',
            // Industrial
            'CAT': 'Industrial', 'DE': 'Industrial', 'HON': 'Industrial', 'UPS': 'Industrial',
            'BA': 'Industrial', 'GE': 'Industrial', 'LMT': 'Industrial', 'RTX': 'Industrial',
            'XLI': 'Industrial',
            // Real Estate
            'XLRE': 'Real Estate',
            // Utilities
            'XLU': 'Utilities', 'NEE': 'Utilities', 'DUK': 'Utilities', 'SO': 'Utilities',
            // Materials
            'XLB': 'Materials', 'LIN': 'Materials', 'APD': 'Materials', 'FCX': 'Materials',
            // Telecom
            'T': 'Telecom', 'VZ': 'Telecom', 'TMUS': 'Telecom', 'CMCSA': 'Telecom',
            // Precious Metals
            'GC': 'Precious Metals', 'SI': 'Precious Metals', 'GLD': 'Precious Metals', 'SLV': 'Precious Metals',
            // Agriculture
            'ZC': 'Agriculture', 'ZW': 'Agriculture', 'ZS': 'Agriculture', 'DBA': 'Agriculture',
        };

        // TYPE classification
        const ETFs = ['SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLU', 'XLP', 'XLY', 'XLB', 'XLRE', 'EFA', 'EEM', 'TLT', 'IEF', 'GLD', 'SLV', 'USO', 'UNG', 'VWO', 'EWZ', 'EWJ', 'FXI', 'HYG', 'LQD', 'EMB', 'VGK', 'VEA'];
        const CRYPTO = ['BTC', 'ETH', 'BNB', 'XRP', 'ADA', 'SOL', 'DOGE', 'DOT', 'AVAX', 'MATIC', 'LINK', 'UNI', 'ATOM', 'LTC'];
        const FOREX = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY'];
        const COMMODITIES = ['CL', 'NG', 'GC', 'SI', 'HG', 'ZC', 'ZW', 'ZS', 'KC', 'SB', 'CC', 'CT'];
        const INDICES = ['GSPC', 'DJI', 'IXIC', 'RUT', 'VIX', 'FTSE', 'GDAXI', 'N225', 'HSI', 'STOXX50E'];
        const BONDS = ['TNX', 'TYX', 'TLT', 'IEF', 'SHY', 'BND', 'AGG'];

        let type = 'Stock';
        let typeIcon = '📈';
        let typeColor = 'bg-blue-500/20 text-blue-400';

        const cleanSymbol = symbol.toUpperCase();

        if (CRYPTO.some(c => cleanSymbol.includes(c))) {
            type = 'Crypto';
            typeIcon = '₿';
            typeColor = 'bg-orange-500/20 text-orange-400';
        } else if (ETFs.includes(cleanSymbol)) {
            type = 'ETF';
            typeIcon = '📦';
            typeColor = 'bg-purple-500/20 text-purple-400';
        } else if (FOREX.some(f => cleanSymbol.includes(f))) {
            type = 'Forex';
            typeIcon = '💱';
            typeColor = 'bg-cyan-500/20 text-cyan-400';
        } else if (COMMODITIES.some(c => cleanSymbol.includes(c))) {
            type = 'Commodity';
            typeIcon = '🛢️';
            typeColor = 'bg-amber-500/20 text-amber-400';
        } else if (INDICES.some(i => cleanSymbol.includes(i))) {
            type = 'Index';
            typeIcon = '📊';
            typeColor = 'bg-pink-500/20 text-pink-400';
        } else if (BONDS.some(b => cleanSymbol.includes(b))) {
            type = 'Bond';
            typeIcon = '🏦';
            typeColor = 'bg-teal-500/20 text-teal-400';
        }

        const sector = SECTORS[cleanSymbol] || null;

        return { type, typeIcon, typeColor, sector };
    };

    // Send signal to Telegram
    const sendToTelegram = async (signal: TradeSignal) => {
        if (!telegramToken || !telegramChatId) {
            setShowTelegramConfig(true);
            return;
        }

        setSendingTelegram(signal.id);
        try {
            const response = await fetch('/api/telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    signal: {
                        symbol: signal.asset,
                        direction: signal.direction,
                        score: signal.score,
                        confidence: signal.confidence,
                        price: signal.price || 0,
                        entryLow: signal.entryZone.low,
                        entryHigh: signal.entryZone.high,
                        stopLoss: signal.stopLoss,
                        takeProfit1: signal.takeProfits[0]?.price || 0,
                        takeProfit2: signal.takeProfits[1]?.price,
                        drivers: signal.keyDrivers,
                        risks: signal.risks,
                        validityHours: signal.validityHours,
                        positionSize: signal.positionSize,
                        oneLiner: signal.oneLiner,
                    },
                    botToken: telegramToken,
                    chatId: telegramChatId,
                }),
            });
            const result = await response.json();
            if (!result.success) {
                console.error('Telegram error:', result.error);
            }
        } catch (err) {
            console.error('Failed to send to Telegram:', err);
        } finally {
            setSendingTelegram(null);
        }
    };

    // Save signal to history
    const saveSignalToHistory = (signal: TradeSignal) => {
        const assetInfo = getAssetInfo(signal.asset);
        addSignal({
            id: signal.id,
            symbol: signal.asset,
            direction: signal.direction,
            score: signal.score,
            confidence: signal.confidence,
            assetType: assetInfo.type,
            sector: assetInfo.sector || undefined,
            signalPrice: signal.price || 0,
            entryLow: signal.entryZone.low,
            entryHigh: signal.entryZone.high,
            stopLoss: signal.stopLoss,
            takeProfit1: signal.takeProfits[0]?.price || 0,
            takeProfit2: signal.takeProfits[1]?.price,
            timestamp: Date.now(),
            validityHours: signal.validityHours,
        });
        setPerfStats(calculateStats());
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Activity className="w-6 h-6 text-amber-400" />
                        GMPM PRD v8.1 - Sistema Completo
                    </h2>
                    <p className="text-gray-400 text-sm mt-1">
                        {signals.length} oportunidades | {stats?.totalAssets || 0} ativos | Cenário: {scenario?.current || 'N/A'}
                    </p>
                </div>

                <div className="flex gap-2">
                    <button onClick={() => setShowThesis(!showThesis)} className={`px-3 py-2 rounded-lg text-sm ${showThesis ? 'bg-amber-600' : 'bg-gray-700'}`}>
                        Thesis
                    </button>
                    <button onClick={() => setShowPortfolio(!showPortfolio)} className={`px-3 py-2 rounded-lg text-sm flex items-center gap-1 ${showPortfolio ? 'bg-blue-600' : 'bg-gray-700'}`}>
                        <Briefcase className="w-4 h-4" /> Portfolio
                    </button>
                    <button onClick={() => setShowHistory(!showHistory)} className={`px-3 py-2 rounded-lg text-sm flex items-center gap-1 ${showHistory ? 'bg-purple-600' : 'bg-gray-700'}`}>
                        <History className="w-4 h-4" /> Stats
                    </button>
                    <button onClick={() => setShowTelegramConfig(!showTelegramConfig)} className={`px-3 py-2 rounded-lg text-sm flex items-center gap-1 ${telegramToken ? 'bg-cyan-600' : 'bg-gray-700'}`}>
                        <Bell className="w-4 h-4" /> Telegram
                    </button>
                    <button onClick={exportJSON} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm flex items-center gap-1">
                        <Download className="w-4 h-4" /> Export
                    </button>
                    <button
                        onClick={fetchData}
                        disabled={isLoading}
                        aria-label="Refresh"
                        title="Refresh"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-lg flex items-center gap-2"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={() => setIsRunning(!isRunning)}
                        aria-label={isRunning ? 'Pause auto-refresh' : 'Start auto-refresh'}
                        title={isRunning ? 'Pause auto-refresh' : 'Start auto-refresh'}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 ${isRunning ? 'bg-red-600' : 'bg-green-600'}`}
                    >
                        {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* TELEGRAM CONFIG PANEL */}
            {showTelegramConfig && (
                <div className="bg-cyan-900/30 border border-cyan-500/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Bell className="w-5 h-5 text-cyan-400" />
                        <span className="text-cyan-400 font-bold">TELEGRAM ALERTS</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-gray-400">Bot Token</label>
                            <input
                                type="password"
                                value={telegramToken}
                                onChange={(e) => setTelegramToken(e.target.value)}
                                placeholder="123456:ABC-DEF..."
                                className="w-full mt-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-400">Chat ID</label>
                            <input
                                type="text"
                                value={telegramChatId}
                                onChange={(e) => setTelegramChatId(e.target.value)}
                                placeholder="-1001234567890"
                                className="w-full mt-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white"
                            />
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        💡 Crie um bot com @BotFather e obtenha o chat_id via /getUpdates
                    </p>
                </div>
            )}

            {/* PERFORMANCE STATS PANEL */}
            {showHistory && perfStats && (
                <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <History className="w-5 h-5 text-purple-400" />
                            <span className="text-purple-400 font-bold">PERFORMANCE HISTÓRICO</span>
                        </div>
                        <span className="text-xs text-gray-400">{perfStats.totalSignals} sinais rastreados</span>
                    </div>
                    <div className="grid grid-cols-6 gap-3 text-sm">
                        <div className="bg-gray-900/50 rounded p-2 text-center">
                            <div className="text-xs text-gray-400">Win Rate</div>
                            <div className={`text-lg font-bold ${perfStats.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                                {perfStats.winRate.toFixed(1)}%
                            </div>
                        </div>
                        <div className="bg-gray-900/50 rounded p-2 text-center">
                            <div className="text-xs text-gray-400">Wins</div>
                            <div className="text-lg font-bold text-green-400">{perfStats.wins}</div>
                        </div>
                        <div className="bg-gray-900/50 rounded p-2 text-center">
                            <div className="text-xs text-gray-400">Losses</div>
                            <div className="text-lg font-bold text-red-400">{perfStats.losses}</div>
                        </div>
                        <div className="bg-gray-900/50 rounded p-2 text-center">
                            <div className="text-xs text-gray-400">Profit Factor</div>
                            <div className={`text-lg font-bold ${perfStats.profitFactor >= 1.5 ? 'text-green-400' : perfStats.profitFactor >= 1 ? 'text-yellow-400' : 'text-red-400'}`}>
                                {perfStats.profitFactor === Infinity ? '∞' : perfStats.profitFactor.toFixed(2)}
                            </div>
                        </div>
                        <div className="bg-gray-900/50 rounded p-2 text-center">
                            <div className="text-xs text-gray-400">Expectancy</div>
                            <div className={`text-lg font-bold ${perfStats.expectancy >= 0.3 ? 'text-green-400' : perfStats.expectancy >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                                {perfStats.expectancy.toFixed(2)}R
                            </div>
                        </div>
                        <div className="bg-gray-900/50 rounded p-2 text-center">
                            <div className="text-xs text-gray-400">Total P&L</div>
                            <div className={`text-lg font-bold ${perfStats.totalPnLR >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {perfStats.totalPnLR >= 0 ? '+' : ''}{perfStats.totalPnLR.toFixed(1)}R
                            </div>
                        </div>
                    </div>

                    {/* History list */}
                    <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-xs text-gray-400">HISTÓRICO (últimos 12)</div>
                            <div className="text-xs text-gray-500">Ações: Win/Loss (manual)</div>
                        </div>
                        <div className="space-y-2">
                            {historySignals.slice(0, 12).map((s) => (
                                <div key={s.id} className="flex items-center justify-between bg-gray-900/40 border border-gray-800 rounded p-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-white font-mono text-xs">{s.symbol}</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded ${s.direction === 'LONG' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                            {s.direction}
                                        </span>
                                        <span className="text-[10px] text-gray-500">{s.status}</span>
                                        {typeof s.pnlR === 'number' && (
                                            <span className={`text-[10px] font-bold ${s.pnlR >= 0 ? 'text-green-400' : 'text-red-400'}`}>{s.pnlR.toFixed(2)}R</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {s.status === 'ACTIVE' && (
                                            <>
                                                <button
                                                    onClick={() => handleMarkWin(s)}
                                                    className="px-2 py-1 text-[10px] bg-green-600/30 hover:bg-green-600/40 text-green-300 rounded"
                                                >
                                                    WIN
                                                </button>
                                                <button
                                                    onClick={() => handleMarkLoss(s)}
                                                    className="px-2 py-1 text-[10px] bg-red-600/30 hover:bg-red-600/40 text-red-300 rounded"
                                                >
                                                    LOSS
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {historySignals.length === 0 && (
                                <div className="text-xs text-gray-500">Nenhum histórico salvo ainda (use &quot;Save&quot; nos sinais).</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* THESIS PANEL */}
            {showThesis && thesis && (
                <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/20 border border-amber-500/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-amber-400" />
                            <span className="text-amber-400 font-bold">THESIS DO MERCADO</span>
                            <span className={`px-2 py-0.5 rounded text-xs ${getScenarioColor(scenario?.current || '')}`}>
                                {scenario?.current}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${thesis.tradeBias === 'LONG_BIAS' ? 'bg-green-500/30 text-green-400' :
                                thesis.tradeBias === 'SHORT_BIAS' ? 'bg-red-500/30 text-red-400' :
                                    'bg-gray-500/30 text-gray-400'
                                }`}>{thesis.tradeBias}</span>
                            <span className="text-sm text-gray-400">{thesis.confidence}% conf.</span>
                        </div>
                    </div>
                    <p className="text-white text-sm mb-3">{thesis.statement}</p>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                            <div className="text-red-400 font-medium mb-1">⚠️ Invalidação</div>
                            {thesis.invalidationConditions.map((c, i) => (
                                <div key={i} className="text-gray-400">• {c}</div>
                            ))}
                        </div>
                        <div>
                            <div className="text-blue-400 font-medium mb-1">🎯 Próximo Cenário</div>
                            <div className="text-gray-400">{scenario?.nextPrediction} ({scenario?.nextProbability.toFixed(0)}%)</div>
                        </div>
                    </div>
                </div>
            )}

            {/* PORTFOLIO PANEL */}
            {showPortfolio && portfolio && (
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Briefcase className="w-5 h-5 text-blue-400" />
                            <span className="text-blue-400 font-bold">PORTFOLIO STATUS</span>
                        </div>
                        <div className={`flex items-center gap-2 px-2 py-1 rounded ${portfolio.healthScore >= 80 ? 'bg-green-500/20 text-green-400' :
                            portfolio.healthScore >= 50 ? 'bg-yellow-500/20 text-yellow-400' :
                                'bg-red-500/20 text-red-400'
                            }`}>
                            {portfolio.healthScore >= 80 ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                            Health: {portfolio.healthScore}/100
                        </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-sm">
                        <div className="bg-gray-900/50 rounded p-2">
                            <div className="text-gray-400 text-xs flex items-center gap-1"><DollarSign className="w-3 h-3" /> Equity</div>
                            <div className="text-white font-bold">${portfolio.equity.toLocaleString()}</div>
                        </div>
                        <div className="bg-gray-900/50 rounded p-2">
                            <div className="text-gray-400 text-xs flex items-center gap-1"><Percent className="w-3 h-3" /> Risk Used</div>
                            <div className="text-orange-400 font-bold">{portfolio.totalRisk.toFixed(1)}%</div>
                        </div>
                        <div className="bg-gray-900/50 rounded p-2">
                            <div className="text-gray-400 text-xs">Available Risk</div>
                            <div className="text-green-400 font-bold">{portfolio.availableRisk.toFixed(1)}%</div>
                        </div>
                        <div className="bg-gray-900/50 rounded p-2">
                            <div className="text-gray-400 text-xs">Positions</div>
                            <div className="text-white font-bold">{portfolio.positions.length}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* MACRO DASHBOARD */}
            {macro && (
                <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2">
                        <div className="text-xs text-gray-400">VIX</div>
                        <div className={`text-lg font-bold ${macro.vix > 25 ? 'text-red-400' : macro.vix < 18 ? 'text-green-400' : 'text-yellow-400'}`}>
                            {macro.vix.toFixed(1)}
                        </div>
                    </div>

                    {macro.fearGreed && (
                        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2">
                            <div className="text-xs text-gray-400 flex items-center gap-1"><Thermometer className="w-3 h-3" /> F&G</div>
                            <div className={`text-lg font-bold ${macro.fearGreed.value > 60 ? 'text-green-400' : macro.fearGreed.value < 40 ? 'text-red-400' : 'text-yellow-400'}`}>
                                {macro.fearGreed.value}
                            </div>
                        </div>
                    )}

                    {fredData && (
                        <>
                            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2">
                                <div className="text-xs text-gray-400">Fed Funds</div>
                                <div className="text-lg font-bold text-white">{fredData.rates.fedFunds === null ? 'N/A' : `${fredData.rates.fedFunds.toFixed(2)}%`}</div>
                            </div>
                            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2">
                                <div className="text-xs text-gray-400">Yield Curve</div>
                                {fredData.rates.yieldCurve === null ? (
                                    <div className="text-lg font-bold text-gray-400">N/A</div>
                                ) : (
                                    <div className={`text-lg font-bold ${fredData.rates.yieldCurve >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {fredData.rates.yieldCurve > 0 ? '+' : ''}{fredData.rates.yieldCurve.toFixed(2)}
                                    </div>
                                )}
                            </div>
                            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2">
                                <div className="text-xs text-gray-400">Unemployment</div>
                                <div className="text-lg font-bold text-white">{fredData.employment.unemploymentRate === null ? 'N/A' : `${fredData.employment.unemploymentRate.toFixed(1)}%`}</div>
                            </div>
                        </>
                    )}

                    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2">
                        <div className="text-xs text-gray-400">Market</div>
                        <div className="text-lg font-bold text-white">{stats?.gainers || 0}↑ {stats?.losers || 0}↓</div>
                    </div>

                    {regime && (
                        <div className={`border rounded-lg p-2 ${getRegimeColor(regime.regime)}`}>
                            <div className="text-xs opacity-70">Regime</div>
                            <div className="text-lg font-bold">{regime.regime}</div>
                        </div>
                    )}
                </div>
            )}

            {/* SUMMARY */}
            {summary && (
                <div className="bg-gray-800/30 border border-gray-700 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">RESUMO EXECUTIVO</div>
                    <div className="text-white text-sm">{summary}</div>
                    {lastUpdate && <div className="text-xs text-gray-500 mt-1">{lastUpdate.toLocaleTimeString('pt-BR')}</div>}
                </div>
            )}

            {error && (
                <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    <span className="text-red-400">{error}</span>
                </div>
            )}

            {/* SIGNALS */}
            <div className="space-y-2">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" /> Oportunidades (Score ≥ 55)
                </h3>

                {signals.length === 0 && !isLoading && (
                    <div className="text-center py-8 text-gray-400 bg-gray-800/30 rounded-lg">
                        <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                        <p>Nenhum sinal qualificado</p>
                    </div>
                )}

                <div className="grid gap-2">
                    {signals.slice(0, 20).map((signal) => {
                        // Asset classification
                        const assetInfo = getAssetInfo(signal.asset);

                        return (
                            <div key={signal.id} className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
                                <div className="p-3 cursor-pointer" onClick={() => setExpandedSignal(expandedSignal === signal.id ? null : signal.id)}>
                                    {/* TOP ROW: Asset name, direction, type, sector */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <div className="text-xl font-bold text-white">{signal.asset}</div>
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1 ${signal.direction === 'LONG' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                                {signal.direction === 'LONG' ? <TrendingUp className="w-3 h-3" /> : <TrendDown className="w-3 h-3" />}
                                                {signal.direction}
                                            </span>
                                            <span className={`px-2 py-0.5 rounded text-xs border ${getConfidenceColor(signal.confidence)}`}>{signal.confidence}</span>

                                            {/* NEW: Asset Type Badge */}
                                            <span className={`px-2 py-0.5 rounded text-xs ${assetInfo.typeColor}`}>
                                                {assetInfo.typeIcon} {assetInfo.type}
                                            </span>

                                            {/* NEW: Sector Badge */}
                                            {assetInfo.sector && (
                                                <span className="px-2 py-0.5 rounded text-xs bg-gray-700/50 text-gray-300">
                                                    {assetInfo.sector}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-xl font-bold text-amber-400">{signal.score}<span className="text-sm text-gray-500">/100</span></div>
                                            {expandedSignal === signal.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                        </div>
                                    </div>

                                    {/* BOTTOM ROW: Price, change, entry summary, validity */}
                                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                                        <span className="text-white font-medium">${formatPrice(signal.price || 0)}</span>
                                        <span className="text-gray-500">|</span>
                                        <span className={signal.direction === 'LONG' ? 'text-green-400' : 'text-red-400'}>
                                            Entry: {formatPrice(signal.entryZone.low)}-{formatPrice(signal.entryZone.high)}
                                        </span>
                                        <span className="text-gray-500">|</span>
                                        <span className="text-red-400">SL: {formatPrice(signal.stopLoss)}</span>
                                        <span className="text-gray-500">|</span>
                                        <span className="text-green-400">TP1: {formatPrice(signal.takeProfits[0]?.price || 0)}</span>
                                        <span className="text-gray-500">|</span>
                                        <span>⏱️ {signal.validityHours}h</span>
                                        <span className="text-gray-500">|</span>
                                        <span className="text-purple-400">Size: {signal.positionSize}</span>
                                    </div>
                                </div>

                                {expandedSignal === signal.id && (
                                    <div className="border-t border-gray-700 p-3 space-y-3 bg-gray-900/30">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => saveSignalToHistory(signal)}
                                                className="px-3 py-1.5 bg-purple-700/30 hover:bg-purple-700/40 text-purple-200 rounded text-xs flex items-center gap-2"
                                                title="Save to history"
                                            >
                                                <Layers className="w-3 h-3" /> Save
                                            </button>
                                            <button
                                                onClick={() => sendToTelegram(signal)}
                                                disabled={sendingTelegram === signal.id}
                                                className="px-3 py-1.5 bg-cyan-700/30 hover:bg-cyan-700/40 disabled:opacity-50 text-cyan-200 rounded text-xs flex items-center gap-2"
                                                title="Send to Telegram"
                                            >
                                                <Send className="w-3 h-3" />
                                                {sendingTelegram === signal.id ? 'Sending...' : 'Telegram'}
                                            </button>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 bg-gray-900 px-2 py-1 rounded text-xs text-amber-400 font-mono">{signal.oneLiner}</code>
                                            <button
                                                onClick={() => copyOneLiner(signal.oneLiner, signal.id)}
                                                aria-label="Copy one-liner"
                                                title="Copy one-liner"
                                                className="p-1 bg-gray-700 hover:bg-gray-600 rounded"
                                            >
                                                <Copy className={`w-3 h-3 ${copiedId === signal.id ? 'text-green-400' : 'text-gray-400'}`} />
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-4 gap-2 text-xs">
                                            <div className="bg-blue-500/10 border border-blue-500/30 rounded p-2">
                                                <div className="text-blue-400 flex items-center gap-1"><Target className="w-3 h-3" /> Entry</div>
                                                <div className="text-white">{formatPrice(signal.entryZone.low)} - {formatPrice(signal.entryZone.high)}</div>
                                            </div>
                                            <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
                                                <div className="text-red-400 flex items-center gap-1"><Shield className="w-3 h-3" /> SL</div>
                                                <div className="text-white">{formatPrice(signal.stopLoss)}</div>
                                            </div>
                                            {signal.takeProfits.slice(0, 2).map((tp, i) => (
                                                <div key={i} className="bg-green-500/10 border border-green-500/30 rounded p-2">
                                                    <div className="text-green-400">TP{i + 1} ({tp.ratio})</div>
                                                    <div className="text-white">{formatPrice(tp.price)}</div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 text-xs">
                                            <div>
                                                <div className="text-gray-400 mb-1">DRIVERS</div>
                                                {signal.keyDrivers.map((d, i) => (
                                                    <div key={i} className="text-green-400">✓ {d}</div>
                                                ))}
                                            </div>
                                            <div>
                                                <div className="text-gray-400 mb-1">RISKS</div>
                                                {signal.risks.map((r, i) => (
                                                    <div key={i} className="text-orange-400">⚠ {r}</div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
