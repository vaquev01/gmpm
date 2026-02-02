// src/lib/monteCarloEngine.ts
// Monte Carlo Simulation para análise de robustez estatística

// ===== TYPES =====
export interface MonteCarloConfig {
    simulations: number;      // Number of simulations to run
    tradeCount: number;       // Trades per simulation
    confidenceLevel: number;  // e.g., 0.95 for 95%
    initialCapital: number;
    riskPerTrade: number;     // As percentage of capital
}

export interface MonteCarloResult {
    simulations: number;
    medianReturn: number;
    meanReturn: number;
    stdDev: number;
    percentile5: number;      // 5th percentile (worst cases)
    percentile95: number;     // 95th percentile (best cases)
    maxDrawdownMean: number;
    maxDrawdown95: number;    // 95th percentile of max drawdowns
    probabilityOfProfit: number;
    probabilityOfDoubling: number;
    probabilityOfRuin: number; // Probability of losing 50%+
    equityCurves: number[][];  // Sample of equity curves
    returnDistribution: { bucket: string; count: number }[];
}

export interface HistoricalTrade {
    pnlR: number;       // P&L in R multiples
    winLoss: 'WIN' | 'LOSS' | 'BREAKEVEN';
}

// ===== DEFAULT CONFIG =====
export const DEFAULT_MONTE_CARLO_CONFIG: MonteCarloConfig = {
    simulations: 1000,
    tradeCount: 100,
    confidenceLevel: 0.95,
    initialCapital: 100000,
    riskPerTrade: 1, // 1% of capital
};

// ===== RANDOM NUMBER GENERATOR =====
function random(): number {
    return Math.random();
}

// ===== BOOTSTRAP SAMPLE =====
function bootstrapSample<T>(data: T[], sampleSize: number): T[] {
    const sample: T[] = [];
    for (let i = 0; i < sampleSize; i++) {
        const idx = Math.floor(random() * data.length);
        sample.push(data[idx]);
    }
    return sample;
}

// ===== CALCULATE MAX DRAWDOWN =====
function calculateMaxDrawdown(equityCurve: number[]): number {
    let peak = equityCurve[0];
    let maxDD = 0;

    for (const value of equityCurve) {
        if (value > peak) peak = value;
        const dd = (peak - value) / peak;
        if (dd > maxDD) maxDD = dd;
    }

    return maxDD;
}

// ===== RUN MONTE CARLO SIMULATION =====
export function runMonteCarloSimulation(
    trades: HistoricalTrade[],
    config: Partial<MonteCarloConfig> = {}
): MonteCarloResult {
    const fullConfig = { ...DEFAULT_MONTE_CARLO_CONFIG, ...config };

    if (trades.length < 10) {
        // Not enough data
        return {
            simulations: 0,
            medianReturn: 0,
            meanReturn: 0,
            stdDev: 0,
            percentile5: 0,
            percentile95: 0,
            maxDrawdownMean: 0,
            maxDrawdown95: 0,
            probabilityOfProfit: 0,
            probabilityOfDoubling: 0,
            probabilityOfRuin: 0,
            equityCurves: [],
            returnDistribution: [],
        };
    }

    const finalReturns: number[] = [];
    const maxDrawdowns: number[] = [];
    const sampleEquityCurves: number[][] = [];

    // Run simulations
    for (let sim = 0; sim < fullConfig.simulations; sim++) {
        // Bootstrap sample of trades
        const sampledTrades = bootstrapSample(trades, fullConfig.tradeCount);

        // Simulate equity curve
        let equity = fullConfig.initialCapital;
        const riskAmount = fullConfig.initialCapital * (fullConfig.riskPerTrade / 100);
        const equityCurve: number[] = [equity];

        for (const trade of sampledTrades) {
            const pnl = trade.pnlR * riskAmount;
            equity += pnl;
            equityCurve.push(Math.max(0, equity));

            // Stop if ruined
            if (equity <= 0) break;
        }

        const finalReturn = (equity - fullConfig.initialCapital) / fullConfig.initialCapital * 100;
        finalReturns.push(finalReturn);
        maxDrawdowns.push(calculateMaxDrawdown(equityCurve));

        // Store some sample curves for visualization
        if (sim < 50) {
            sampleEquityCurves.push(equityCurve);
        }
    }

    // Sort for percentiles
    finalReturns.sort((a, b) => a - b);
    maxDrawdowns.sort((a, b) => a - b);

    // Calculate statistics
    const mean = finalReturns.reduce((a, b) => a + b, 0) / finalReturns.length;
    const median = finalReturns[Math.floor(finalReturns.length / 2)];
    const variance = finalReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / finalReturns.length;
    const stdDev = Math.sqrt(variance);

    const idx5 = Math.floor(finalReturns.length * 0.05);
    const idx95 = Math.floor(finalReturns.length * 0.95);

    const profitable = finalReturns.filter(r => r > 0).length;
    const doubled = finalReturns.filter(r => r >= 100).length;
    const ruined = finalReturns.filter(r => r <= -50).length;

    // Return distribution
    const buckets = [
        { min: -100, max: -50, label: '-100% to -50%' },
        { min: -50, max: -25, label: '-50% to -25%' },
        { min: -25, max: 0, label: '-25% to 0%' },
        { min: 0, max: 25, label: '0% to 25%' },
        { min: 25, max: 50, label: '25% to 50%' },
        { min: 50, max: 100, label: '50% to 100%' },
        { min: 100, max: 200, label: '100% to 200%' },
        { min: 200, max: Infinity, label: '200%+' },
    ];

    const returnDistribution = buckets.map(bucket => ({
        bucket: bucket.label,
        count: finalReturns.filter(r => r >= bucket.min && r < bucket.max).length,
    }));

    return {
        simulations: fullConfig.simulations,
        medianReturn: median,
        meanReturn: mean,
        stdDev,
        percentile5: finalReturns[idx5],
        percentile95: finalReturns[idx95],
        maxDrawdownMean: maxDrawdowns.reduce((a, b) => a + b, 0) / maxDrawdowns.length * 100,
        maxDrawdown95: maxDrawdowns[idx95] * 100,
        probabilityOfProfit: profitable / fullConfig.simulations,
        probabilityOfDoubling: doubled / fullConfig.simulations,
        probabilityOfRuin: ruined / fullConfig.simulations,
        equityCurves: sampleEquityCurves,
        returnDistribution,
    };
}

// ===== CALCULATE EXPECTANCY FROM TRADES =====
export function calculateExpectancy(trades: HistoricalTrade[]): {
    expectancy: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    edgeRatio: number;
} {
    if (trades.length === 0) {
        return { expectancy: 0, winRate: 0, avgWin: 0, avgLoss: 0, profitFactor: 0, edgeRatio: 0 };
    }

    const wins = trades.filter(t => t.pnlR > 0);
    const losses = trades.filter(t => t.pnlR < 0);

    const winRate = wins.length / trades.length;
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlR, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnlR, 0) / losses.length) : 0;

    const expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss);
    const profitFactor = avgLoss > 0 ? (winRate * avgWin) / ((1 - winRate) * avgLoss) : 0;
    const edgeRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    return { expectancy, winRate, avgWin, avgLoss, profitFactor, edgeRatio };
}

// ===== CALCULATE KELLY CRITERION =====
export function calculateKellyCriterion(trades: HistoricalTrade[]): {
    kelly: number;
    halfKelly: number;
    quarterKelly: number;
} {
    const { winRate, avgWin, avgLoss } = calculateExpectancy(trades);

    if (avgLoss === 0) return { kelly: 0, halfKelly: 0, quarterKelly: 0 };

    // Kelly = W - (L / R) where W = win rate, L = loss rate, R = avg win / avg loss
    const R = avgWin / avgLoss;
    const kelly = winRate - ((1 - winRate) / R);

    return {
        kelly: Math.max(0, kelly * 100),
        halfKelly: Math.max(0, kelly * 50),
        quarterKelly: Math.max(0, kelly * 25),
    };
}

// ===== WALK FORWARD TEST =====
export interface WalkForwardResult {
    periods: {
        start: number;
        end: number;
        inSampleWinRate: number;
        outSampleWinRate: number;
        efficiency: number; // outSample / inSample
    }[];
    avgEfficiency: number;
    isRobust: boolean;
}

export function runWalkForwardTest(
    trades: HistoricalTrade[],
    inSampleRatio: number = 0.7,
    periods: number = 5
): WalkForwardResult {
    if (trades.length < periods * 20) {
        return { periods: [], avgEfficiency: 0, isRobust: false };
    }

    const periodSize = Math.floor(trades.length / periods);
    const results: WalkForwardResult['periods'] = [];

    for (let i = 0; i < periods; i++) {
        const periodStart = i * periodSize;
        const periodEnd = Math.min((i + 1) * periodSize, trades.length);
        const periodTrades = trades.slice(periodStart, periodEnd);

        const inSampleSize = Math.floor(periodTrades.length * inSampleRatio);
        const inSample = periodTrades.slice(0, inSampleSize);
        const outSample = periodTrades.slice(inSampleSize);

        const inSampleWins = inSample.filter(t => t.pnlR > 0).length;
        const outSampleWins = outSample.filter(t => t.pnlR > 0).length;

        const inSampleWinRate = inSample.length > 0 ? inSampleWins / inSample.length : 0;
        const outSampleWinRate = outSample.length > 0 ? outSampleWins / outSample.length : 0;
        const efficiency = inSampleWinRate > 0 ? outSampleWinRate / inSampleWinRate : 0;

        results.push({
            start: periodStart,
            end: periodEnd,
            inSampleWinRate: inSampleWinRate * 100,
            outSampleWinRate: outSampleWinRate * 100,
            efficiency,
        });
    }

    const avgEfficiency = results.reduce((s, r) => s + r.efficiency, 0) / results.length;

    return {
        periods: results,
        avgEfficiency,
        isRobust: avgEfficiency >= 0.7, // At least 70% efficiency = robust
    };
}
