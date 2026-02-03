// src/lib/continuousLearning.ts
// Sistema de Aprendizado Contínuo para o Motor de Cálculo
// Ajusta pesos dinamicamente com base nos resultados históricos

// ===== TIPOS =====
export interface SignalOutcome {
    id: string;
    asset: string;
    assetClass: string;
    direction: 'LONG' | 'SHORT';
    score: number;
    components: Record<string, number>;
    enhancedComponents?: Record<string, number>;
    regime: string;
    regimeType?: string; // From RegimeSnapshot (GOLDILOCKS, RISK_ON, etc.)
    sessionQuality?: 'OPTIMAL' | 'GOOD' | 'FAIR' | 'POOR'; // Trading session quality at entry
    entryHourUTC?: number; // Hour of entry (0-23 UTC)
    gatesAllPass?: boolean; // Whether all gates passed at entry
    outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
    pnlR: number;
    timestamp: number;
    exitTimestamp: number;
}

export interface ComponentPerformance {
    totalSignals: number;
    winRate: number;
    avgPnlR: number;
    avgScoreWhenWin: number;
    avgScoreWhenLoss: number;
    contribution: number; // How much this component contributed to wins
}

export interface LearningState {
    version: number;
    lastUpdated: number;
    totalSignals: number;
    totalWins: number;
    totalLosses: number;

    // Component-level performance
    componentPerformance: Record<string, ComponentPerformance>;

    // Regime-specific adjustments
    regimeAdjustments: Record<string, Record<string, number>>;

    // Asset-class specific adjustments
    assetClassAdjustments: Record<string, Record<string, number>>;

    // Optimized weights (learned)
    optimizedWeights: Record<string, number>;

    // Learning rate (how fast to adjust)
    learningRate: number;

    // Confidence in current weights (increases with more data)
    confidence: number;
}

// ===== DEFAULT WEIGHTS =====
const DEFAULT_WEIGHTS: Record<string, number> = {
    macro: 0.12,
    cot: 0.05,
    mtf: 0.08,
    trend: 0.10,
    momentum: 0.08,
    volatility: 0.08,
    flow: 0.10,
    technical: 0.12,
    smc: 0.10,
    crossAsset: 0.05,
    timing: 0.05,
    riskReward: 0.07,
};

// ===== STORAGE KEY =====
const STORAGE_KEY = 'gmpm_learning_state';

// ===== INITIALIZE LEARNING STATE =====
function initLearningState(): LearningState {
    return {
        version: 1,
        lastUpdated: Date.now(),
        totalSignals: 0,
        totalWins: 0,
        totalLosses: 0,
        componentPerformance: Object.keys(DEFAULT_WEIGHTS).reduce((acc, key) => {
            acc[key] = {
                totalSignals: 0,
                winRate: 0.5,
                avgPnlR: 0,
                avgScoreWhenWin: 50,
                avgScoreWhenLoss: 50,
                contribution: 0,
            };
            return acc;
        }, {} as Record<string, ComponentPerformance>),
        regimeAdjustments: {
            RISK_ON: {},
            RISK_OFF: {},
            TRANSITION: {},
            STRESS: {},
        },
        assetClassAdjustments: {
            stock: {},
            etf: {},
            index: {},
            forex: {},
            crypto: {},
            commodity: {},
            bond: {},
        },
        optimizedWeights: { ...DEFAULT_WEIGHTS },
        learningRate: 0.1, // 10% adjustment per batch
        confidence: 0, // Increases with data
    };
}

// ===== LOAD STATE =====
export function loadLearningState(): LearningState {
    if (typeof window === 'undefined') return initLearningState();

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return initLearningState();

    try {
        const parsed = JSON.parse(stored) as LearningState;
        // Merge with defaults in case new components were added
        return {
            ...initLearningState(),
            ...parsed,
            optimizedWeights: { ...DEFAULT_WEIGHTS, ...parsed.optimizedWeights },
        };
    } catch {
        return initLearningState();
    }
}

// ===== SAVE STATE =====
export function saveLearningState(state: LearningState): void {
    if (typeof window === 'undefined') return;

    state.lastUpdated = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ===== RECORD SIGNAL OUTCOME =====
export function recordOutcome(outcome: SignalOutcome): LearningState {
    const state = loadLearningState();

    state.totalSignals++;
    if (outcome.outcome === 'WIN') state.totalWins++;
    else if (outcome.outcome === 'LOSS') state.totalLosses++;

    // Combine standard and enhanced components
    const allComponents = {
        ...outcome.components,
        ...(outcome.enhancedComponents || {}),
    };

    // Update component performance
    for (const [comp, score] of Object.entries(allComponents)) {
        if (!state.componentPerformance[comp]) {
            state.componentPerformance[comp] = {
                totalSignals: 0,
                winRate: 0.5,
                avgPnlR: 0,
                avgScoreWhenWin: 50,
                avgScoreWhenLoss: 50,
                contribution: 0,
            };
        }

        const perf = state.componentPerformance[comp];
        perf.totalSignals++;

        // Update averages with exponential moving average
        const alpha = 0.1; // EMA factor

        if (outcome.outcome === 'WIN') {
            perf.avgScoreWhenWin = (1 - alpha) * perf.avgScoreWhenWin + alpha * score;
            perf.contribution = (1 - alpha) * perf.contribution + alpha * (score / 100);
        } else if (outcome.outcome === 'LOSS') {
            perf.avgScoreWhenLoss = (1 - alpha) * perf.avgScoreWhenLoss + alpha * score;
            perf.contribution = (1 - alpha) * perf.contribution - alpha * (score / 100) * 0.5;
        }

        perf.avgPnlR = (1 - alpha) * perf.avgPnlR + alpha * outcome.pnlR;

        // Calculate win rate
        const wins = Object.values(state.componentPerformance)
            .filter(p => p.avgScoreWhenWin > p.avgScoreWhenLoss).length;
        perf.winRate = wins / Object.keys(state.componentPerformance).length;
    }

    // Update regime adjustments
    if (!state.regimeAdjustments[outcome.regime]) {
        state.regimeAdjustments[outcome.regime] = {};
    }

    for (const [comp, score] of Object.entries(allComponents)) {
        const regimeAdj = state.regimeAdjustments[outcome.regime];
        if (!regimeAdj[comp]) regimeAdj[comp] = 1.0;

        // If component scored high and we won, increase its regime weight
        if (outcome.outcome === 'WIN' && score > 60) {
            regimeAdj[comp] = Math.min(1.5, regimeAdj[comp] * (1 + state.learningRate * 0.1));
        } else if (outcome.outcome === 'LOSS' && score > 60) {
            // High-scoring component but we lost - decrease weight
            regimeAdj[comp] = Math.max(0.5, regimeAdj[comp] * (1 - state.learningRate * 0.1));
        }
    }

    // Update asset class adjustments
    if (!state.assetClassAdjustments[outcome.assetClass]) {
        state.assetClassAdjustments[outcome.assetClass] = {};
    }

    for (const [comp, score] of Object.entries(allComponents)) {
        const classAdj = state.assetClassAdjustments[outcome.assetClass];
        if (!classAdj[comp]) classAdj[comp] = 1.0;

        if (outcome.outcome === 'WIN' && score > 60) {
            classAdj[comp] = Math.min(1.5, classAdj[comp] * (1 + state.learningRate * 0.1));
        } else if (outcome.outcome === 'LOSS' && score > 60) {
            classAdj[comp] = Math.max(0.5, classAdj[comp] * (1 - state.learningRate * 0.1));
        }
    }

    // Update confidence
    state.confidence = Math.min(1, state.totalSignals / 100); // Full confidence after 100 signals

    saveLearningState(state);
    return state;
}

// ===== OPTIMIZE WEIGHTS =====
export function optimizeWeights(): LearningState {
    const state = loadLearningState();

    if (state.totalSignals < 10) {
        // Not enough data, use defaults
        return state;
    }

    // Calculate optimal weights based on component contribution
    const contributions: Record<string, number> = {};
    let totalContribution = 0;

    for (const [comp, perf] of Object.entries(state.componentPerformance)) {
        // Contribution score based on win rate difference and PnL
        const winsVsLosses = perf.avgScoreWhenWin - perf.avgScoreWhenLoss;
        const pnlContrib = perf.avgPnlR > 0 ? 1 + perf.avgPnlR * 0.1 : 1 - Math.abs(perf.avgPnlR) * 0.05;

        contributions[comp] = Math.max(0.01, (perf.contribution + 0.5) * pnlContrib * (1 + winsVsLosses / 100));
        totalContribution += contributions[comp];
    }

    // Normalize to weights that sum to 1
    for (const comp of Object.keys(contributions)) {
        const newWeight = contributions[comp] / totalContribution;
        const defaultWeight = DEFAULT_WEIGHTS[comp] || 0.05;

        // Blend with default weights based on confidence
        state.optimizedWeights[comp] =
            state.confidence * newWeight + (1 - state.confidence) * defaultWeight;
    }

    // Ensure weights sum to 1
    const totalWeight = Object.values(state.optimizedWeights).reduce((a, b) => a + b, 0);
    for (const comp of Object.keys(state.optimizedWeights)) {
        state.optimizedWeights[comp] /= totalWeight;
    }

    saveLearningState(state);
    return state;
}

// ===== GET ADJUSTED WEIGHTS =====
export function getAdjustedWeights(
    regime: string,
    assetClass: string
): Record<string, number> {
    const state = loadLearningState();
    const adjustedWeights: Record<string, number> = {};

    for (const [comp, baseWeight] of Object.entries(state.optimizedWeights)) {
        let weight = baseWeight;

        // Apply regime adjustment
        const regimeAdj = state.regimeAdjustments[regime]?.[comp] || 1.0;
        weight *= regimeAdj;

        // Apply asset class adjustment
        const classAdj = state.assetClassAdjustments[assetClass]?.[comp] || 1.0;
        weight *= classAdj;

        adjustedWeights[comp] = weight;
    }

    // Normalize
    const total = Object.values(adjustedWeights).reduce((a, b) => a + b, 0);
    for (const comp of Object.keys(adjustedWeights)) {
        adjustedWeights[comp] /= total;
    }

    return adjustedWeights;
}

// ===== GET LEARNING INSIGHTS =====
export interface LearningInsight {
    topPerformers: { component: string; score: number }[];
    worstPerformers: { component: string; score: number }[];
    regimeBest: Record<string, string[]>;
    assetClassBest: Record<string, string[]>;
    recommendations: string[];
    confidence: number;
    dataPoints: number;
}

export function getLearningInsights(): LearningInsight {
    const state = loadLearningState();

    // Sort components by contribution
    const sortedComponents = Object.entries(state.componentPerformance)
        .sort((a, b) => b[1].contribution - a[1].contribution);

    const topPerformers = sortedComponents.slice(0, 3).map(([comp, perf]) => ({
        component: comp,
        score: Math.round((perf.contribution + 0.5) * 100),
    }));

    const worstPerformers = sortedComponents.slice(-3).map(([comp, perf]) => ({
        component: comp,
        score: Math.round((perf.contribution + 0.5) * 100),
    }));

    // Best components per regime
    const regimeBest: Record<string, string[]> = {};
    for (const [regime, adjustments] of Object.entries(state.regimeAdjustments)) {
        const sorted = Object.entries(adjustments)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([comp]) => comp);
        regimeBest[regime] = sorted;
    }

    // Best components per asset class
    const assetClassBest: Record<string, string[]> = {};
    for (const [assetClass, adjustments] of Object.entries(state.assetClassAdjustments)) {
        const sorted = Object.entries(adjustments)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([comp]) => comp);
        assetClassBest[assetClass] = sorted;
    }

    // Generate recommendations
    const recommendations: string[] = [];

    if (state.confidence < 0.5) {
        recommendations.push(`Mais dados necessários: ${state.totalSignals}/100 para confiança total`);
    }

    if (state.totalWins / Math.max(1, state.totalSignals) < 0.5) {
        recommendations.push('Win rate abaixo de 50% - considere aumentar score mínimo');
    }

    const topComp = sortedComponents[0];
    if (topComp && topComp[1].contribution > 0.3) {
        recommendations.push(`${topComp[0].toUpperCase()} é altamente preditivo - aumente peso`);
    }

    const worstComp = sortedComponents[sortedComponents.length - 1];
    if (worstComp && worstComp[1].contribution < -0.1) {
        recommendations.push(`${worstComp[0].toUpperCase()} tem baixa contribuição - revise lógica`);
    }

    return {
        topPerformers,
        worstPerformers,
        regimeBest,
        assetClassBest,
        recommendations,
        confidence: state.confidence,
        dataPoints: state.totalSignals,
    };
}

// ===== EXPORT LEARNING DATA =====
export function exportLearningData(): string {
    const state = loadLearningState();
    return JSON.stringify(state, null, 2);
}

// ===== IMPORT LEARNING DATA =====
export function importLearningData(jsonData: string): boolean {
    try {
        const data = JSON.parse(jsonData) as LearningState;
        if (data.version && data.optimizedWeights) {
            saveLearningState(data);
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

// ===== RESET LEARNING =====
export function resetLearning(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
}

// ===== AUTO-LEARN FROM HISTORY =====
export function learnFromHistory(outcomes: SignalOutcome[]): LearningState {
    let state = loadLearningState();

    for (const outcome of outcomes) {
        state = recordOutcome(outcome);
    }

    // Optimize weights after batch processing
    state = optimizeWeights();

    return state;
}
