// src/lib/riskManager.ts
// Institutional Risk Management System
// Kelly Criterion, Drawdown Control, Circuit Breakers, Correlation-Adjusted Risk

// =============================================================================
// TYPES
// =============================================================================

export interface KellyResult {
    fullKelly: number;          // Optimal fraction (can be > 1)
    halfKelly: number;          // Conservative (0.5x Kelly)
    quarterKelly: number;       // Ultra-conservative (0.25x Kelly)
    recommended: number;        // Based on model confidence
    maxPosition: number;        // Capped position size %
    edgeQuality: 'STRONG' | 'MODERATE' | 'WEAK' | 'NEGATIVE';
    reasoning: string;
}

export interface DrawdownState {
    currentDrawdown: number;    // Current DD from peak (%)
    maxDrawdown: number;        // Historical max DD (%)
    peakEquity: number;         // Highest equity achieved
    currentEquity: number;
    drawdownDuration: number;   // Days in current DD
    recoveryFactor: number;     // Profit / Max DD
    status: 'HEALTHY' | 'CAUTION' | 'WARNING' | 'CRITICAL' | 'CIRCUIT_BREAKER';
}

export interface CircuitBreaker {
    name: string;
    triggered: boolean;
    threshold: number;
    currentValue: number;
    action: 'REDUCE_SIZE' | 'HALT_NEW' | 'CLOSE_ALL' | 'ALERT_ONLY';
    message: string;
}

export interface CorrelationAdjustedRisk {
    baseRisk: number;           // Original position risk %
    adjustedRisk: number;       // After correlation adjustment
    correlationPenalty: number; // Reduction due to correlation
    diversificationBenefit: number;
    effectiveRisk: number;      // Final portfolio contribution
    explanation: string;
}

export interface RiskBudget {
    totalBudget: number;        // Max total risk (e.g., 6%)
    usedBudget: number;         // Currently deployed risk
    availableBudget: number;    // Remaining risk capacity
    reserveBuffer: number;      // Emergency reserve (e.g., 1%)
    utilizationRate: number;    // % of budget used
    status: 'UNDERUTILIZED' | 'OPTIMAL' | 'STRETCHED' | 'MAXED';
}

export interface InstitutionalRiskReport {
    timestamp: string;
    kelly: KellyResult;
    drawdown: DrawdownState;
    circuitBreakers: CircuitBreaker[];
    riskBudget: RiskBudget;
    recommendations: string[];
    alerts: { level: 'INFO' | 'WARNING' | 'CRITICAL'; message: string }[];
    tradingStatus: 'NORMAL' | 'REDUCED' | 'HALTED';
}

// =============================================================================
// CONSTANTS
// =============================================================================

const RISK_PARAMS = {
    // Kelly scaling based on model confidence
    KELLY_SCALE: {
        HIGH: 0.5,      // Half Kelly for high confidence
        MEDIUM: 0.25,   // Quarter Kelly for medium
        LOW: 0.1,       // Minimal for low confidence
    },
    
    // Position limits
    MAX_SINGLE_POSITION: 3,     // Max 3% per position
    MAX_CORRELATED_EXPOSURE: 8, // Max 8% in correlated assets
    
    // Drawdown thresholds
    DD_CAUTION: 5,      // 5% DD = caution
    DD_WARNING: 10,     // 10% DD = reduce size
    DD_CRITICAL: 15,    // 15% DD = halt new trades
    DD_CIRCUIT: 20,     // 20% DD = circuit breaker
    
    // Recovery requirements
    MIN_RECOVERY_DAYS: 3,       // Days of profit before resuming
    RECOVERY_WIN_RATE: 0.6,     // Min win rate during recovery
    
    // Risk budget
    TOTAL_RISK_BUDGET: 6,       // 6% total portfolio risk
    RESERVE_BUFFER: 1,          // 1% emergency reserve
    OPTIMAL_UTILIZATION: 0.7,   // 70% utilization is optimal
};

// =============================================================================
// KELLY CRITERION
// =============================================================================

/**
 * Calculate optimal position size using Kelly Criterion
 * f* = (bp - q) / b
 * where:
 *   f* = fraction of capital to bet
 *   b = odds (reward/risk ratio)
 *   p = probability of winning
 *   q = probability of losing (1-p)
 */
export function calculateKelly(
    winRate: number,
    avgWin: number,
    avgLoss: number,
    modelConfidence: 'HIGH' | 'MEDIUM' | 'LOW'
): KellyResult {
    // Validate inputs
    const p = Math.max(0.01, Math.min(0.99, winRate));
    const q = 1 - p;
    const b = Math.abs(avgWin / avgLoss);
    
    // Full Kelly: f* = (bp - q) / b
    const fullKelly = ((b * p) - q) / b;
    
    // Scaled versions
    const halfKelly = fullKelly * 0.5;
    const quarterKelly = fullKelly * 0.25;
    
    // Determine edge quality
    let edgeQuality: KellyResult['edgeQuality'];
    let reasoning: string;
    
    if (fullKelly <= 0) {
        edgeQuality = 'NEGATIVE';
        reasoning = `Negative edge detected (Kelly=${(fullKelly*100).toFixed(2)}%). DO NOT TRADE.`;
    } else if (fullKelly < 0.05) {
        edgeQuality = 'WEAK';
        reasoning = `Weak edge (Kelly=${(fullKelly*100).toFixed(2)}%). Very small positions only.`;
    } else if (fullKelly < 0.15) {
        edgeQuality = 'MODERATE';
        reasoning = `Moderate edge (Kelly=${(fullKelly*100).toFixed(2)}%). Use half/quarter Kelly.`;
    } else {
        edgeQuality = 'STRONG';
        reasoning = `Strong edge (Kelly=${(fullKelly*100).toFixed(2)}%). Half Kelly recommended.`;
    }
    
    // Select recommended size based on confidence
    const kellyScale = RISK_PARAMS.KELLY_SCALE[modelConfidence];
    let recommended = Math.max(0, fullKelly * kellyScale);
    
    // Cap at max single position
    const maxPosition = Math.min(recommended * 100, RISK_PARAMS.MAX_SINGLE_POSITION);
    recommended = maxPosition / 100;
    
    return {
        fullKelly: Math.max(0, fullKelly),
        halfKelly: Math.max(0, halfKelly),
        quarterKelly: Math.max(0, quarterKelly),
        recommended,
        maxPosition,
        edgeQuality,
        reasoning,
    };
}

/**
 * Calculate Kelly from historical trades
 */
export function calculateKellyFromTrades(
    trades: { pnl: number; risk: number }[],
    modelConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM'
): KellyResult {
    if (trades.length < 10) {
        return {
            fullKelly: 0,
            halfKelly: 0,
            quarterKelly: 0,
            recommended: 0.005, // 0.5% default for insufficient data
            maxPosition: 0.5,
            edgeQuality: 'WEAK',
            reasoning: 'Insufficient trade history (<10 trades). Using minimum size.',
        };
    }
    
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);
    
    const winRate = wins.length / trades.length;
    const avgWin = wins.length > 0 
        ? wins.reduce((sum, t) => sum + t.pnl / t.risk, 0) / wins.length 
        : 1;
    const avgLoss = losses.length > 0 
        ? Math.abs(losses.reduce((sum, t) => sum + t.pnl / t.risk, 0) / losses.length)
        : 1;
    
    return calculateKelly(winRate, avgWin, avgLoss, modelConfidence);
}

// =============================================================================
// DRAWDOWN MANAGEMENT
// =============================================================================

/**
 * Calculate current drawdown state
 */
export function calculateDrawdownState(
    equityCurve: { date: string; equity: number }[]
): DrawdownState {
    if (equityCurve.length === 0) {
        return {
            currentDrawdown: 0,
            maxDrawdown: 0,
            peakEquity: 100000,
            currentEquity: 100000,
            drawdownDuration: 0,
            recoveryFactor: 0,
            status: 'HEALTHY',
        };
    }
    
    let peak = equityCurve[0].equity;
    let maxDD = 0;
    let ddStartIdx = -1;
    
    for (let i = 0; i < equityCurve.length; i++) {
        const eq = equityCurve[i].equity;
        if (eq > peak) {
            peak = eq;
            ddStartIdx = -1;
        }
        const dd = ((peak - eq) / peak) * 100;
        if (dd > 0 && ddStartIdx === -1) ddStartIdx = i;
        if (dd > maxDD) maxDD = dd;
    }
    
    const currentEquity = equityCurve[equityCurve.length - 1].equity;
    const peakEquity = peak;
    const currentDrawdown = ((peakEquity - currentEquity) / peakEquity) * 100;
    
    // Calculate duration in days
    let drawdownDuration = 0;
    if (ddStartIdx >= 0 && currentDrawdown > 0) {
        const startDate = new Date(equityCurve[ddStartIdx].date);
        const endDate = new Date(equityCurve[equityCurve.length - 1].date);
        drawdownDuration = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    
    // Recovery factor = total profit / max DD
    const totalReturn = ((currentEquity - equityCurve[0].equity) / equityCurve[0].equity) * 100;
    const recoveryFactor = maxDD > 0 ? totalReturn / maxDD : 0;
    
    // Determine status
    let status: DrawdownState['status'];
    if (currentDrawdown >= RISK_PARAMS.DD_CIRCUIT) {
        status = 'CIRCUIT_BREAKER';
    } else if (currentDrawdown >= RISK_PARAMS.DD_CRITICAL) {
        status = 'CRITICAL';
    } else if (currentDrawdown >= RISK_PARAMS.DD_WARNING) {
        status = 'WARNING';
    } else if (currentDrawdown >= RISK_PARAMS.DD_CAUTION) {
        status = 'CAUTION';
    } else {
        status = 'HEALTHY';
    }
    
    return {
        currentDrawdown,
        maxDrawdown: maxDD,
        peakEquity,
        currentEquity,
        drawdownDuration,
        recoveryFactor,
        status,
    };
}

/**
 * Get position size multiplier based on drawdown
 */
export function getDrawdownSizeMultiplier(drawdownState: DrawdownState): number {
    switch (drawdownState.status) {
        case 'CIRCUIT_BREAKER':
            return 0; // No new trades
        case 'CRITICAL':
            return 0.25; // 25% of normal size
        case 'WARNING':
            return 0.5; // 50% of normal size
        case 'CAUTION':
            return 0.75; // 75% of normal size
        default:
            return 1.0; // Full size
    }
}

// =============================================================================
// CIRCUIT BREAKERS
// =============================================================================

/**
 * Check all circuit breakers
 */
export function checkCircuitBreakers(
    drawdownState: DrawdownState,
    dailyPnL: number,
    weeklyPnL: number,
    consecutiveLosses: number,
    vix?: number
): CircuitBreaker[] {
    const breakers: CircuitBreaker[] = [];
    
    // 1. Max Drawdown Circuit Breaker
    breakers.push({
        name: 'MAX_DRAWDOWN',
        triggered: drawdownState.currentDrawdown >= RISK_PARAMS.DD_CIRCUIT,
        threshold: RISK_PARAMS.DD_CIRCUIT,
        currentValue: drawdownState.currentDrawdown,
        action: 'HALT_NEW',
        message: drawdownState.currentDrawdown >= RISK_PARAMS.DD_CIRCUIT
            ? `CIRCUIT BREAKER: Drawdown ${drawdownState.currentDrawdown.toFixed(1)}% exceeds ${RISK_PARAMS.DD_CIRCUIT}% limit. HALTING all new trades.`
            : `Drawdown at ${drawdownState.currentDrawdown.toFixed(1)}% (limit: ${RISK_PARAMS.DD_CIRCUIT}%)`,
    });
    
    // 2. Daily Loss Limit (-3%)
    const dailyLimit = -3;
    breakers.push({
        name: 'DAILY_LOSS',
        triggered: dailyPnL <= dailyLimit,
        threshold: dailyLimit,
        currentValue: dailyPnL,
        action: 'HALT_NEW',
        message: dailyPnL <= dailyLimit
            ? `DAILY LIMIT HIT: ${dailyPnL.toFixed(2)}% loss today. No new trades until tomorrow.`
            : `Daily P&L: ${dailyPnL >= 0 ? '+' : ''}${dailyPnL.toFixed(2)}%`,
    });
    
    // 3. Weekly Loss Limit (-5%)
    const weeklyLimit = -5;
    breakers.push({
        name: 'WEEKLY_LOSS',
        triggered: weeklyPnL <= weeklyLimit,
        threshold: weeklyLimit,
        currentValue: weeklyPnL,
        action: 'REDUCE_SIZE',
        message: weeklyPnL <= weeklyLimit
            ? `WEEKLY WARNING: ${weeklyPnL.toFixed(2)}% loss this week. Reduce position sizes by 50%.`
            : `Weekly P&L: ${weeklyPnL >= 0 ? '+' : ''}${weeklyPnL.toFixed(2)}%`,
    });
    
    // 4. Consecutive Losses (5 in a row)
    const maxConsecutiveLosses = 5;
    breakers.push({
        name: 'CONSECUTIVE_LOSSES',
        triggered: consecutiveLosses >= maxConsecutiveLosses,
        threshold: maxConsecutiveLosses,
        currentValue: consecutiveLosses,
        action: 'HALT_NEW',
        message: consecutiveLosses >= maxConsecutiveLosses
            ? `LOSING STREAK: ${consecutiveLosses} consecutive losses. Pause and review strategy.`
            : `Consecutive losses: ${consecutiveLosses}`,
    });
    
    // 5. VIX Spike (>35)
    if (vix !== undefined) {
        const vixThreshold = 35;
        breakers.push({
            name: 'VIX_SPIKE',
            triggered: vix >= vixThreshold,
            threshold: vixThreshold,
            currentValue: vix,
            action: 'REDUCE_SIZE',
            message: vix >= vixThreshold
                ? `HIGH VOLATILITY: VIX at ${vix.toFixed(1)}. Reduce all position sizes by 50%.`
                : `VIX: ${vix.toFixed(1)}`,
        });
    }
    
    return breakers;
}

// =============================================================================
// CORRELATION-ADJUSTED RISK
// =============================================================================

/**
 * Adjust position risk based on portfolio correlation
 */
export function calculateCorrelationAdjustedRisk(
    newPositionRisk: number,
    existingPositions: { symbol: string; risk: number; correlation: number }[],
    maxCorrelatedExposure: number = RISK_PARAMS.MAX_CORRELATED_EXPOSURE
): CorrelationAdjustedRisk {
    if (existingPositions.length === 0) {
        return {
            baseRisk: newPositionRisk,
            adjustedRisk: newPositionRisk,
            correlationPenalty: 0,
            diversificationBenefit: 0,
            effectiveRisk: newPositionRisk,
            explanation: 'First position - no correlation adjustment needed.',
        };
    }
    
    // Calculate weighted average correlation with existing positions
    let totalCorrelation = 0;
    let totalRisk = 0;
    
    for (const pos of existingPositions) {
        totalCorrelation += pos.correlation * pos.risk;
        totalRisk += pos.risk;
    }
    
    const avgCorrelation = totalRisk > 0 ? totalCorrelation / totalRisk : 0;
    
    // High correlation = need to reduce risk
    // Low/negative correlation = diversification benefit
    let correlationPenalty = 0;
    let diversificationBenefit = 0;
    
    if (avgCorrelation > 0.5) {
        // High correlation - penalize
        correlationPenalty = newPositionRisk * avgCorrelation * 0.5;
    } else if (avgCorrelation < 0) {
        // Negative correlation - benefit
        diversificationBenefit = newPositionRisk * Math.abs(avgCorrelation) * 0.2;
    }
    
    // Check if adding this position would exceed correlated exposure limit
    const correlatedExposure = existingPositions
        .filter(p => p.correlation > 0.6)
        .reduce((sum, p) => sum + p.risk, 0);
    
    let adjustedRisk = newPositionRisk - correlationPenalty + diversificationBenefit;
    
    if (correlatedExposure + newPositionRisk > maxCorrelatedExposure) {
        // Cap the position to stay within correlated exposure limit
        const maxAllowed = Math.max(0, maxCorrelatedExposure - correlatedExposure);
        adjustedRisk = Math.min(adjustedRisk, maxAllowed);
    }
    
    // Effective portfolio risk contribution
    // Uses simplified sqrt(sum of squared risks) for diversified portfolio
    const existingRiskSq = existingPositions.reduce((sum, p) => sum + p.risk * p.risk, 0);
    const newRiskSq = adjustedRisk * adjustedRisk;
    const correlationFactor = 1 + avgCorrelation; // 0-2 range
    const effectiveRisk = Math.sqrt(existingRiskSq + newRiskSq * correlationFactor) - Math.sqrt(existingRiskSq);
    
    let explanation: string;
    if (correlationPenalty > 0) {
        explanation = `High correlation (${(avgCorrelation*100).toFixed(0)}%) with existing positions. Risk reduced by ${correlationPenalty.toFixed(2)}%.`;
    } else if (diversificationBenefit > 0) {
        explanation = `Diversification benefit from low/negative correlation (${(avgCorrelation*100).toFixed(0)}%).`;
    } else {
        explanation = `Moderate correlation (${(avgCorrelation*100).toFixed(0)}%). Standard risk allocation.`;
    }
    
    return {
        baseRisk: newPositionRisk,
        adjustedRisk: Math.max(0.1, adjustedRisk),
        correlationPenalty,
        diversificationBenefit,
        effectiveRisk,
        explanation,
    };
}

// =============================================================================
// RISK BUDGET
// =============================================================================

/**
 * Calculate risk budget status
 */
export function calculateRiskBudget(
    currentPositions: { risk: number }[],
    totalBudget: number = RISK_PARAMS.TOTAL_RISK_BUDGET,
    reserveBuffer: number = RISK_PARAMS.RESERVE_BUFFER
): RiskBudget {
    const usedBudget = currentPositions.reduce((sum, p) => sum + p.risk, 0);
    const effectiveBudget = totalBudget - reserveBuffer;
    const availableBudget = Math.max(0, effectiveBudget - usedBudget);
    const utilizationRate = usedBudget / effectiveBudget;
    
    let status: RiskBudget['status'];
    if (utilizationRate < 0.3) {
        status = 'UNDERUTILIZED';
    } else if (utilizationRate <= RISK_PARAMS.OPTIMAL_UTILIZATION) {
        status = 'OPTIMAL';
    } else if (utilizationRate < 1) {
        status = 'STRETCHED';
    } else {
        status = 'MAXED';
    }
    
    return {
        totalBudget,
        usedBudget,
        availableBudget,
        reserveBuffer,
        utilizationRate,
        status,
    };
}

// =============================================================================
// COMPREHENSIVE RISK REPORT
// =============================================================================

/**
 * Generate comprehensive institutional risk report
 */
export function generateRiskReport(
    trades: { pnl: number; risk: number; date: string }[],
    equityCurve: { date: string; equity: number }[],
    currentPositions: { symbol: string; risk: number; correlation: number }[],
    dailyPnL: number,
    weeklyPnL: number,
    consecutiveLosses: number,
    modelConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM',
    vix?: number
): InstitutionalRiskReport {
    const kelly = calculateKellyFromTrades(trades, modelConfidence);
    const drawdown = calculateDrawdownState(equityCurve);
    const circuitBreakers = checkCircuitBreakers(drawdown, dailyPnL, weeklyPnL, consecutiveLosses, vix);
    const riskBudget = calculateRiskBudget(currentPositions);
    
    const recommendations: string[] = [];
    const alerts: InstitutionalRiskReport['alerts'] = [];
    
    // Kelly recommendations
    if (kelly.edgeQuality === 'NEGATIVE') {
        recommendations.push('STOP TRADING: Negative edge detected. Review strategy before continuing.');
        alerts.push({ level: 'CRITICAL', message: kelly.reasoning });
    } else if (kelly.edgeQuality === 'WEAK') {
        recommendations.push(`Use minimum position size (${kelly.maxPosition.toFixed(2)}% max).`);
        alerts.push({ level: 'WARNING', message: kelly.reasoning });
    }
    
    // Drawdown recommendations
    if (drawdown.status === 'CIRCUIT_BREAKER') {
        recommendations.push('CIRCUIT BREAKER ACTIVE: No new trades allowed until recovery.');
        alerts.push({ level: 'CRITICAL', message: `Drawdown at ${drawdown.currentDrawdown.toFixed(1)}%` });
    } else if (drawdown.status === 'CRITICAL') {
        recommendations.push('Reduce position sizes to 25% of normal.');
        recommendations.push(`Drawdown recovery needed: ${(drawdown.currentDrawdown - RISK_PARAMS.DD_CAUTION).toFixed(1)}% to exit caution zone.`);
        alerts.push({ level: 'CRITICAL', message: `Critical drawdown: ${drawdown.currentDrawdown.toFixed(1)}%` });
    } else if (drawdown.status === 'WARNING') {
        recommendations.push('Reduce position sizes to 50% of normal.');
        alerts.push({ level: 'WARNING', message: `Warning: Drawdown at ${drawdown.currentDrawdown.toFixed(1)}%` });
    }
    
    // Circuit breaker alerts
    const triggeredBreakers = circuitBreakers.filter(b => b.triggered);
    for (const breaker of triggeredBreakers) {
        alerts.push({ 
            level: breaker.action === 'HALT_NEW' || breaker.action === 'CLOSE_ALL' ? 'CRITICAL' : 'WARNING',
            message: breaker.message 
        });
    }
    
    // Risk budget recommendations
    if (riskBudget.status === 'MAXED') {
        recommendations.push('Risk budget exhausted. Close positions before opening new ones.');
        alerts.push({ level: 'WARNING', message: 'Risk budget at 100% utilization' });
    } else if (riskBudget.status === 'UNDERUTILIZED' && drawdown.status === 'HEALTHY') {
        recommendations.push(`Opportunity: ${riskBudget.availableBudget.toFixed(2)}% risk budget available.`);
    }
    
    // Determine trading status
    let tradingStatus: InstitutionalRiskReport['tradingStatus'] = 'NORMAL';
    if (triggeredBreakers.some(b => b.action === 'HALT_NEW' || b.action === 'CLOSE_ALL')) {
        tradingStatus = 'HALTED';
    } else if (triggeredBreakers.some(b => b.action === 'REDUCE_SIZE') || drawdown.status !== 'HEALTHY') {
        tradingStatus = 'REDUCED';
    }
    
    return {
        timestamp: new Date().toISOString(),
        kelly,
        drawdown,
        circuitBreakers,
        riskBudget,
        recommendations,
        alerts,
        tradingStatus,
    };
}

// =============================================================================
// POSITION SIZING CALCULATOR
// =============================================================================

/**
 * Calculate optimal position size with all institutional factors
 */
export function calculateInstitutionalPositionSize(
    equity: number,
    entryPrice: number,
    stopLoss: number,
    winRate: number,
    avgWinR: number,
    avgLossR: number,
    modelConfidence: 'HIGH' | 'MEDIUM' | 'LOW',
    drawdownState: DrawdownState,
    existingPositions: { symbol: string; risk: number; correlation: number }[],
    _newPositionCorrelation?: number // Reserved for future use
): {
    positionSize: number;
    riskPercent: number;
    quantity: number;
    factors: Record<string, number>;
    reasoning: string[];
} {
    void _newPositionCorrelation;
    const reasoning: string[] = [];
    const factors: Record<string, number> = {};
    
    // 1. Base Kelly calculation
    const kelly = calculateKelly(winRate, avgWinR, avgLossR, modelConfidence);
    factors.kellyBase = kelly.recommended * 100;
    reasoning.push(`Kelly base: ${(kelly.recommended * 100).toFixed(2)}% (${kelly.edgeQuality})`);
    
    // 2. Drawdown adjustment
    const ddMultiplier = getDrawdownSizeMultiplier(drawdownState);
    factors.drawdownMultiplier = ddMultiplier;
    if (ddMultiplier < 1) {
        reasoning.push(`Drawdown adjustment: ${(ddMultiplier * 100).toFixed(0)}% (status: ${drawdownState.status})`);
    }
    
    // 3. Correlation adjustment
    const corrAdj = calculateCorrelationAdjustedRisk(
        kelly.recommended * 100,
        existingPositions
    );
    factors.correlationAdjustment = corrAdj.adjustedRisk / (kelly.recommended * 100 || 1);
    if (corrAdj.correlationPenalty > 0) {
        reasoning.push(`Correlation penalty: -${corrAdj.correlationPenalty.toFixed(2)}%`);
    }
    
    // 4. Risk budget check
    const riskBudget = calculateRiskBudget(existingPositions);
    const budgetCap = riskBudget.availableBudget;
    factors.budgetAvailable = budgetCap;
    
    // Calculate final risk %
    let riskPercent = kelly.recommended * 100 * ddMultiplier;
    riskPercent = Math.min(riskPercent, corrAdj.adjustedRisk);
    riskPercent = Math.min(riskPercent, budgetCap);
    riskPercent = Math.min(riskPercent, RISK_PARAMS.MAX_SINGLE_POSITION);
    riskPercent = Math.max(0, riskPercent);
    
    factors.finalRisk = riskPercent;
    reasoning.push(`Final risk: ${riskPercent.toFixed(2)}% of equity`);
    
    // Calculate position size
    const riskAmount = equity * (riskPercent / 100);
    const stopDistance = Math.abs(entryPrice - stopLoss);
    const quantity = stopDistance > 0 ? riskAmount / stopDistance : 0;
    const positionSize = quantity * entryPrice;
    
    return {
        positionSize,
        riskPercent,
        quantity: Math.floor(quantity * 100000) / 100000,
        factors,
        reasoning,
    };
}

export const RISK_PARAMS_EXPORT = RISK_PARAMS;
