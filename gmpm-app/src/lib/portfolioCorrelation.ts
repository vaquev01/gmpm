// src/lib/portfolioCorrelation.ts
// Sistema de correlação de portfólio e gestão de risco

import { TrackedSignal, getActiveSignals } from './signalTracker';

// ===== CORRELATION MATRIX =====
// Based on historical correlations between asset classes
const ASSET_CLASS_CORRELATIONS: Record<string, Record<string, number>> = {
    stock: { stock: 1.0, etf: 0.95, index: 0.98, forex: 0.15, crypto: 0.45, commodity: 0.25, bond: -0.35 },
    etf: { stock: 0.95, etf: 1.0, index: 0.92, forex: 0.12, crypto: 0.40, commodity: 0.30, bond: -0.30 },
    index: { stock: 0.98, etf: 0.92, index: 1.0, forex: 0.18, crypto: 0.50, commodity: 0.20, bond: -0.40 },
    forex: { stock: 0.15, etf: 0.12, index: 0.18, forex: 1.0, crypto: 0.25, commodity: -0.20, bond: 0.30 },
    crypto: { stock: 0.45, etf: 0.40, index: 0.50, forex: 0.25, crypto: 1.0, commodity: 0.35, bond: -0.25 },
    commodity: { stock: 0.25, etf: 0.30, index: 0.20, forex: -0.20, crypto: 0.35, commodity: 1.0, bond: -0.15 },
    bond: { stock: -0.35, etf: -0.30, index: -0.40, forex: 0.30, crypto: -0.25, commodity: -0.15, bond: 1.0 },
};

// Specific asset correlations (override class-level)
const SPECIFIC_CORRELATIONS: Record<string, Record<string, number>> = {
    'SPY': { 'QQQ': 0.95, 'IWM': 0.90, 'DIA': 0.95, 'AAPL': 0.85, 'MSFT': 0.88, 'GOOGL': 0.82, 'AMZN': 0.80 },
    'AAPL': { 'MSFT': 0.75, 'GOOGL': 0.68, 'META': 0.65, 'AMZN': 0.60 },
    'BTC': { 'ETH': 0.88, 'SOL': 0.82, 'XRP': 0.75 },
    'GC': { 'SI': 0.80, 'GLD': 0.99 }, // Gold and Silver
    'CL': { 'XLE': 0.85, 'USO': 0.95 }, // Oil
    'EURUSD': { 'GBPUSD': 0.75, 'USDJPY': -0.55, 'DXY': -0.98 },
};

// ===== TYPES =====
export interface CorrelationResult {
    asset1: string;
    asset2: string;
    correlation: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface PortfolioRisk {
    diversificationScore: number; // 0-100
    correlationMatrix: CorrelationResult[];
    maxCorrelation: number;
    warnings: string[];
    suggestions: string[];
    assetClassDistribution: Record<string, number>;
    directionBalance: { long: number; short: number };
    concentrationRisk: number; // 0-100
}

// ===== GET CORRELATION BETWEEN TWO ASSETS =====
export function getCorrelation(asset1: string, asset2: string, class1: string, class2: string): number {
    // Check specific first
    const specific = SPECIFIC_CORRELATIONS[asset1]?.[asset2] ||
        SPECIFIC_CORRELATIONS[asset2]?.[asset1];
    if (specific !== undefined) return specific;

    // Same asset = 1.0
    if (asset1 === asset2) return 1.0;

    // Fall back to class-level
    return ASSET_CLASS_CORRELATIONS[class1]?.[class2] || 0;
}

// ===== CALCULATE PORTFOLIO RISK =====
export function calculatePortfolioRisk(signals?: TrackedSignal[]): PortfolioRisk {
    const activeSignals = signals || getActiveSignals();

    if (activeSignals.length === 0) {
        return {
            diversificationScore: 100,
            correlationMatrix: [],
            maxCorrelation: 0,
            warnings: [],
            suggestions: ['Nenhum sinal ativo. Aguardando oportunidades.'],
            assetClassDistribution: {},
            directionBalance: { long: 0, short: 0 },
            concentrationRisk: 0,
        };
    }

    // Calculate correlation matrix
    const correlations: CorrelationResult[] = [];
    let maxCorrelation = 0;

    for (let i = 0; i < activeSignals.length; i++) {
        for (let j = i + 1; j < activeSignals.length; j++) {
            const s1 = activeSignals[i];
            const s2 = activeSignals[j];

            let correlation = getCorrelation(s1.asset, s2.asset, s1.assetClass, s2.assetClass);

            // If opposite directions, effective correlation is negative
            if (s1.direction !== s2.direction) {
                correlation = -correlation;
            }

            const absCorr = Math.abs(correlation);
            maxCorrelation = Math.max(maxCorrelation, absCorr);

            let riskLevel: CorrelationResult['riskLevel'] = 'LOW';
            if (absCorr >= 0.9) riskLevel = 'CRITICAL';
            else if (absCorr >= 0.7) riskLevel = 'HIGH';
            else if (absCorr >= 0.5) riskLevel = 'MEDIUM';

            correlations.push({
                asset1: s1.asset,
                asset2: s2.asset,
                correlation,
                riskLevel,
            });
        }
    }

    // Asset class distribution
    const assetClassDistribution: Record<string, number> = {};
    for (const signal of activeSignals) {
        assetClassDistribution[signal.assetClass] = (assetClassDistribution[signal.assetClass] || 0) + 1;
    }

    // Direction balance
    const longs = activeSignals.filter(s => s.direction === 'LONG').length;
    const shorts = activeSignals.filter(s => s.direction === 'SHORT').length;

    // Calculate diversification score
    const numClasses = Object.keys(assetClassDistribution).length;
    const avgCorrelation = correlations.length > 0
        ? correlations.reduce((sum, c) => sum + Math.abs(c.correlation), 0) / correlations.length
        : 0;

    let diversificationScore = 100;
    diversificationScore -= avgCorrelation * 40; // Penalize high correlation
    diversificationScore -= (maxCorrelation > 0.8 ? 20 : 0); // Penalize extreme correlation
    diversificationScore -= Math.max(0, (6 - numClasses) * 5); // Bonus for more classes (up to 6)
    diversificationScore = Math.max(0, Math.min(100, diversificationScore));

    // Concentration risk
    const maxConcentration = Math.max(...Object.values(assetClassDistribution)) / activeSignals.length;
    const concentrationRisk = maxConcentration * 100;

    // Generate warnings
    const warnings: string[] = [];
    const criticalCorr = correlations.filter(c => c.riskLevel === 'CRITICAL');
    const highCorr = correlations.filter(c => c.riskLevel === 'HIGH');

    if (criticalCorr.length > 0) {
        warnings.push(`⚠️ ${criticalCorr.length} par(es) com correlação crítica (>90%)`);
    }
    if (highCorr.length > 0) {
        warnings.push(`⚠️ ${highCorr.length} par(es) com correlação alta (>70%)`);
    }
    if (concentrationRisk > 60) {
        const topClass = Object.entries(assetClassDistribution).sort((a, b) => b[1] - a[1])[0];
        warnings.push(`⚠️ Concentração alta em ${topClass[0]} (${concentrationRisk.toFixed(0)}%)`);
    }
    if (longs > 0 && shorts === 0) {
        warnings.push('⚠️ 100% LONG - considere hedging');
    } else if (shorts > 0 && longs === 0) {
        warnings.push('⚠️ 100% SHORT - considere hedging');
    }

    // Generate suggestions
    const suggestions: string[] = [];

    if (numClasses === 1) {
        suggestions.push('Diversifique entre asset classes diferentes');
    }
    if (criticalCorr.length > 0) {
        for (const c of criticalCorr) {
            suggestions.push(`Considere fechar ${c.asset1} ou ${c.asset2} (corr: ${(c.correlation * 100).toFixed(0)}%)`);
        }
    }
    if (diversificationScore < 50) {
        suggestions.push('Portfólio pouco diversificado - reduza correlações');
    }

    // Default good message
    if (warnings.length === 0 && diversificationScore >= 70) {
        suggestions.push('✅ Portfólio bem diversificado');
    }

    return {
        diversificationScore,
        correlationMatrix: correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)),
        maxCorrelation,
        warnings,
        suggestions,
        assetClassDistribution,
        directionBalance: { long: longs, short: shorts },
        concentrationRisk,
    };
}

// ===== CHECK IF NEW SIGNAL WOULD INCREASE RISK =====
export function checkSignalRisk(newAsset: string, newClass: string, newDirection: 'LONG' | 'SHORT'): {
    canAdd: boolean;
    riskIncrease: number;
    conflicts: string[];
} {
    const activeSignals = getActiveSignals();
    const conflicts: string[] = [];
    let maxRiskIncrease = 0;

    for (const signal of activeSignals) {
        const correlation = getCorrelation(newAsset, signal.asset, newClass, signal.assetClass);
        const effectiveCorr = newDirection === signal.direction ? correlation : -correlation;

        if (effectiveCorr > 0.7) {
            conflicts.push(`${signal.asset} (${(effectiveCorr * 100).toFixed(0)}% corr)`);
            maxRiskIncrease = Math.max(maxRiskIncrease, effectiveCorr);
        }
    }

    return {
        canAdd: maxRiskIncrease < 0.9,
        riskIncrease: maxRiskIncrease * 100,
        conflicts,
    };
}

// ===== MAX POSITIONS BY CLASS =====
const MAX_POSITIONS_BY_CLASS: Record<string, number> = {
    stock: 5,
    etf: 3,
    index: 2,
    forex: 4,
    crypto: 3,
    commodity: 3,
    bond: 2,
};

export function canAddPosition(assetClass: string): { allowed: boolean; current: number; max: number } {
    const activeSignals = getActiveSignals();
    const currentInClass = activeSignals.filter(s => s.assetClass === assetClass).length;
    const maxAllowed = MAX_POSITIONS_BY_CLASS[assetClass] || 3;

    return {
        allowed: currentInClass < maxAllowed,
        current: currentInClass,
        max: maxAllowed,
    };
}
