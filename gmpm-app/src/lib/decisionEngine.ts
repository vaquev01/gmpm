/**
 * GMPM v2.0 - Decision Engine
 * Motor de Decisão Unificado para Trading Institucional
 * 
 * Princípio: CONFIANÇA = f(QUANTIDADE_DADOS × QUALIDADE_DADOS × ALINHAMENTO)
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type AssetClass = 'FOREX' | 'CRYPTO' | 'COMMODITY' | 'INDEX' | 'STOCK' | 'BOND';
export type Direction = 'LONG' | 'SHORT' | 'NEUTRAL';
export type ConfidenceTier = 'A' | 'B' | 'C' | 'D' | 'F';
export type CoverageTier = 'FULL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL';
export type ActionType = 'EXECUTE_FULL' | 'EXECUTE_STANDARD' | 'EXECUTE_REDUCED' | 'WATCH_ONLY' | 'SKIP';
export type Alignment = 'ALIGNED' | 'CONFLICTING' | 'NEUTRAL';
export type DataQuality = 'FRESH' | 'RECENT' | 'STALE' | 'UNAVAILABLE';

export interface CoverageScore {
    available: boolean;
    quality: DataQuality;
    lastUpdate: number;
    score: number;
}

export interface DataCoverage {
    asset: string;
    assetClass: AssetClass;
    dimensions: {
        macro: CoverageScore;
        meso: CoverageScore;
        micro: CoverageScore;
        liquidityMap: CoverageScore;
        currencyStrength: CoverageScore;
        fundamentals: CoverageScore;
        sentiment: CoverageScore;
        calendar: CoverageScore;
    };
    totalCoverage: number;
    coverageTier: CoverageTier;
    maxConfidencePossible: number;
}

export interface DimensionInput {
    score: number | null;
    direction: Direction;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    timestamp: number;
    source: string;
    details?: string;
}

export interface AssetAnalysis {
    symbol: string;
    displaySymbol: string;
    name?: string;
    assetClass: AssetClass;
    direction: Direction;
    price: number;
    
    macro: DimensionInput | null;
    meso: DimensionInput | null;
    micro: DimensionInput | null;
    liquidityMap: DimensionInput | null;
    currencyStrength: DimensionInput | null;
    fundamentals: DimensionInput | null;
    sentiment: DimensionInput | null;
    
    dataTimestamps: Record<string, number>;
}

export interface UnifiedScore {
    score: number;
    coverageTier: CoverageTier;
    alignment: Alignment;
    confidenceCap: number;
    breakdown: Record<string, number | null>;
    weights: Record<string, number>;
    freshnessFactor: number;
    alignmentFactor: number;
}

export interface EvidenceItem {
    source: string;
    factor: string;
    impact: 'STRONG' | 'MODERATE' | 'WEAK';
    direction: 'SUPPORTING' | 'OPPOSING';
    score?: number;
}

export interface TradePlan {
    entry: { price: number; type: 'LIMIT' | 'MARKET' | 'STOP' };
    stopLoss: { price: number; atrMultiple: number; riskPercent: number };
    targets: { tp1: number; tp2: number; tp3: number };
    riskReward: number;
    positionSize: {
        percent: number;
        kellyAdjusted: number;
        tierAdjusted: number;
        final: number;
    };
    maxHoldTime: string;
}

export interface ActionDecision {
    asset: string;
    displaySymbol: string;
    name?: string;
    assetClass: AssetClass;
    timestamp: number;
    
    tier: ConfidenceTier;
    tierLabel: string;
    action: ActionType;
    direction: Direction;
    price: number;
    
    unifiedScore: number;
    coverageTier: CoverageTier;
    alignment: Alignment;
    
    tradePlan: TradePlan | null;
    
    evidence: {
        supporting: EvidenceItem[];
        opposing: EvidenceItem[];
        missing: string[];
    };
    
    warnings: string[];
    blockers: string[];
    
    decisionPath: string[];
    
    // Original data for compatibility
    originalScore?: number;
    originalSignal?: string;
    breakdown?: Record<string, number>;
}

export interface DecisionEngineResponse {
    timestamp: number;
    regime: {
        type: string;
        confidence: string;
        dominantDrivers: string[];
    } | null;
    decisions: ActionDecision[];
    summary: {
        tierA: number;
        tierB: number;
        tierC: number;
        tierD: number;
        tierF: number;
        topPicks: string[];
        marketBias: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
    };
    dataHealth: {
        feedStatus: 'HEALTHY' | 'DEGRADED' | 'DOWN';
        lastMacroUpdate: number;
        lastMesoUpdate: number;
        staleAssets: string[];
    };
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const COVERAGE_CONFIDENCE_CAP: Record<CoverageTier, number> = {
    FULL: 100,
    HIGH: 85,
    MEDIUM: 70,
    LOW: 55,
    MINIMAL: 40
};

export const TIER_CONFIG: Record<ConfidenceTier, {
    scoreRange: [number, number];
    action: ActionType;
    positionMultiplier: number;
    label: string;
    description: string;
}> = {
    A: {
        scoreRange: [85, 100],
        action: 'EXECUTE_FULL',
        positionMultiplier: 1.0,
        label: 'PRIME EXECUTION',
        description: 'Confluência máxima. Todas as camadas alinhadas. Dados completos e frescos.'
    },
    B: {
        scoreRange: [70, 84],
        action: 'EXECUTE_STANDARD',
        positionMultiplier: 0.75,
        label: 'HIGH CONFIDENCE',
        description: 'Boa confluência. Maioria das camadas alinhadas. Poucos gaps de dados.'
    },
    C: {
        scoreRange: [55, 69],
        action: 'EXECUTE_REDUCED',
        positionMultiplier: 0.5,
        label: 'MODERATE',
        description: 'Confluência parcial. Algumas camadas conflitantes ou ausentes.'
    },
    D: {
        scoreRange: [40, 54],
        action: 'WATCH_ONLY',
        positionMultiplier: 0.25,
        label: 'WATCH ONLY',
        description: 'Confluência fraca. Muitos gaps de dados ou conflitos.'
    },
    F: {
        scoreRange: [0, 39],
        action: 'SKIP',
        positionMultiplier: 0,
        label: 'NO TRADE',
        description: 'Sem confluência. Dados insuficientes ou altamente conflitantes.'
    }
};

export const WEIGHTS_BY_CLASS: Record<AssetClass, Record<string, number>> = {
    FOREX: {
        macro: 0.20,
        meso: 0.15,
        micro: 0.20,
        liquidityMap: 0.15,
        currencyStrength: 0.20,
        fundamentals: 0.10,
        sentiment: 0.00
    },
    CRYPTO: {
        macro: 0.25,
        meso: 0.15,
        micro: 0.25,
        liquidityMap: 0.15,
        currencyStrength: 0.00,
        fundamentals: 0.00,
        sentiment: 0.20
    },
    COMMODITY: {
        macro: 0.25,
        meso: 0.15,
        micro: 0.20,
        liquidityMap: 0.10,
        currencyStrength: 0.10,
        fundamentals: 0.15,
        sentiment: 0.05
    },
    INDEX: {
        macro: 0.30,
        meso: 0.20,
        micro: 0.20,
        liquidityMap: 0.10,
        currencyStrength: 0.00,
        fundamentals: 0.05,
        sentiment: 0.15
    },
    STOCK: {
        macro: 0.20,
        meso: 0.20,
        micro: 0.25,
        liquidityMap: 0.10,
        currencyStrength: 0.00,
        fundamentals: 0.15,
        sentiment: 0.10
    },
    BOND: {
        macro: 0.35,
        meso: 0.20,
        micro: 0.15,
        liquidityMap: 0.05,
        currencyStrength: 0.00,
        fundamentals: 0.20,
        sentiment: 0.05
    }
};

export const STALE_THRESHOLDS: Record<string, number> = {
    macro: 1800_000,
    meso: 900_000,
    micro: 120_000,
    liquidityMap: 300_000,
    currencyStrength: 300_000,
    fundamentals: 3600_000,
    sentiment: 600_000,
    prices: 60_000
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

function scoreDimension(input: DimensionInput | null, source: string): CoverageScore {
    if (!input || input.score === null) {
        return { available: false, quality: 'UNAVAILABLE', lastUpdate: 0, score: 0 };
    }

    const age = Date.now() - input.timestamp;
    const threshold = STALE_THRESHOLDS[source] || 300_000;

    let quality: DataQuality;
    if (age < threshold * 0.5) {
        quality = 'FRESH';
    } else if (age < threshold) {
        quality = 'RECENT';
    } else {
        quality = 'STALE';
    }

    return {
        available: true,
        quality,
        lastUpdate: input.timestamp,
        score: input.score
    };
}

function getCoverageTier(ratio: number): CoverageTier {
    if (ratio >= 0.85) return 'FULL';
    if (ratio >= 0.70) return 'HIGH';
    if (ratio >= 0.50) return 'MEDIUM';
    if (ratio >= 0.30) return 'LOW';
    return 'MINIMAL';
}

export function calculateDataCoverage(analysis: AssetAnalysis): DataCoverage {
    const dimensions = {
        macro: scoreDimension(analysis.macro, 'macro'),
        meso: scoreDimension(analysis.meso, 'meso'),
        micro: scoreDimension(analysis.micro, 'micro'),
        liquidityMap: scoreDimension(analysis.liquidityMap, 'liquidityMap'),
        currencyStrength: scoreDimension(analysis.currencyStrength, 'currencyStrength'),
        fundamentals: scoreDimension(analysis.fundamentals, 'fundamentals'),
        sentiment: scoreDimension(analysis.sentiment, 'sentiment'),
        calendar: { available: false, quality: 'UNAVAILABLE' as DataQuality, lastUpdate: 0, score: 0 }
    };

    const availableCount = Object.values(dimensions).filter(d => d.available).length;
    const totalPossible = 8;
    const coverageRatio = availableCount / totalPossible;

    const totalCoverage = Math.round(coverageRatio * 100);
    const coverageTier = getCoverageTier(coverageRatio);
    const maxConfidencePossible = COVERAGE_CONFIDENCE_CAP[coverageTier];

    return {
        asset: analysis.symbol,
        assetClass: analysis.assetClass,
        dimensions,
        totalCoverage,
        coverageTier,
        maxConfidencePossible
    };
}

function calculateAlignmentFactor(analysis: AssetAnalysis): number {
    const direction = analysis.direction;
    let aligned = 0;
    let conflicting = 0;
    let total = 0;

    const dimensions = [
        analysis.macro,
        analysis.meso,
        analysis.micro,
        analysis.liquidityMap,
        analysis.currencyStrength,
        analysis.sentiment
    ];

    for (const dim of dimensions) {
        if (dim && dim.direction !== 'NEUTRAL') {
            total++;
            if (dim.direction === direction) {
                aligned++;
            } else {
                conflicting++;
            }
        }
    }

    if (total === 0) return 1.0;

    const alignmentRatio = (aligned - conflicting) / total;

    if (alignmentRatio > 0.6) return 1.2;
    if (alignmentRatio > 0.3) return 1.1;
    if (alignmentRatio > 0) return 1.0;
    if (alignmentRatio > -0.3) return 0.9;
    if (alignmentRatio > -0.6) return 0.8;
    return 0.7;
}

function calculateFreshnessFactor(timestamps: Record<string, number>): number {
    const now = Date.now();
    let penalty = 0;
    let count = 0;

    for (const [source, timestamp] of Object.entries(timestamps)) {
        if (!timestamp) continue;

        const age = now - timestamp;
        const threshold = STALE_THRESHOLDS[source] || 300_000;

        if (age > threshold * 2) {
            penalty += 0.15;
        } else if (age > threshold) {
            penalty += 0.08;
        }
        count++;
    }

    if (count === 0) return 0.7;

    return Math.max(0.6, 1 - penalty);
}

export function calculateUnifiedScore(analysis: AssetAnalysis): UnifiedScore {
    const coverage = calculateDataCoverage(analysis);
    const weights = WEIGHTS_BY_CLASS[analysis.assetClass] || WEIGHTS_BY_CLASS.INDEX;

    const inputs: Record<string, number | null> = {
        macro: analysis.macro?.score ?? null,
        meso: analysis.meso?.score ?? null,
        micro: analysis.micro?.score ?? null,
        liquidityMap: analysis.liquidityMap?.score ?? null,
        currencyStrength: analysis.currencyStrength?.score ?? null,
        fundamentals: analysis.fundamentals?.score ?? null,
        sentiment: analysis.sentiment?.score ?? null
    };

    let baseScore = 0;
    let totalWeight = 0;

    for (const [key, value] of Object.entries(inputs)) {
        if (value !== null && weights[key]) {
            baseScore += value * weights[key];
            totalWeight += weights[key];
        }
    }

    baseScore = totalWeight > 0 ? baseScore / totalWeight : 0;

    const alignmentFactor = calculateAlignmentFactor(analysis);
    const freshnessFactor = calculateFreshnessFactor(analysis.dataTimestamps);

    const rawScore = baseScore * alignmentFactor * freshnessFactor;
    const cappedScore = Math.min(rawScore, coverage.maxConfidencePossible);

    return {
        score: Math.round(cappedScore),
        coverageTier: coverage.coverageTier,
        alignment: alignmentFactor > 1 ? 'ALIGNED' : alignmentFactor < 1 ? 'CONFLICTING' : 'NEUTRAL',
        confidenceCap: coverage.maxConfidencePossible,
        breakdown: inputs,
        weights,
        freshnessFactor,
        alignmentFactor
    };
}

export function determineConfidenceTier(score: number): ConfidenceTier {
    if (score >= 85) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 40) return 'D';
    return 'F';
}

function downgradeTier(
    current: ConfidenceTier,
    maxTier: ConfidenceTier | null = null,
    levels: number = 0
): ConfidenceTier {
    const tierOrder: ConfidenceTier[] = ['A', 'B', 'C', 'D', 'F'];
    let currentIndex = tierOrder.indexOf(current);

    if (levels > 0) {
        currentIndex = Math.min(currentIndex + levels, 4);
    }

    if (maxTier) {
        const maxIndex = tierOrder.indexOf(maxTier);
        currentIndex = Math.max(currentIndex, maxIndex);
    }

    return tierOrder[currentIndex];
}

export function applyTierOverrides(
    tier: ConfidenceTier,
    analysis: AssetAnalysis,
    regimeSnapshot: { regime?: string; axes?: Record<string, { value: number }> } | null
): { tier: ConfidenceTier; overrideReasons: string[] } {
    let currentTier = tier;
    const overrideReasons: string[] = [];

    // Override 1: Regime crítico
    if (regimeSnapshot?.regime === 'LIQUIDITY_DRAIN' || regimeSnapshot?.regime === 'CREDIT_STRESS') {
        if (analysis.direction === 'LONG' && analysis.assetClass !== 'BOND') {
            currentTier = downgradeTier(currentTier, 'D');
            overrideReasons.push('Regime crítico: LIQUIDITY_DRAIN/CREDIT_STRESS ativo');
        }
    }

    // Override 2: Currency strength conflitante (para FX)
    if (analysis.assetClass === 'FOREX' && analysis.currencyStrength) {
        if (analysis.currencyStrength.direction !== analysis.direction &&
            analysis.currencyStrength.direction !== 'NEUTRAL') {
            currentTier = downgradeTier(currentTier, null, 1);
            overrideReasons.push('Currency strength oposta à direção');
        }
    }

    // Override 3: Liquidez conflitante
    if (analysis.liquidityMap) {
        if (analysis.liquidityMap.direction !== analysis.direction &&
            analysis.liquidityMap.direction !== 'NEUTRAL') {
            currentTier = downgradeTier(currentTier, null, 1);
            overrideReasons.push('Liquidez do mercado oposta à direção');
        }
    }

    // Override 4: Macro vs Micro conflito
    if (analysis.macro && analysis.micro) {
        if (analysis.macro.direction !== 'NEUTRAL' &&
            analysis.micro.direction !== 'NEUTRAL' &&
            analysis.macro.direction !== analysis.micro.direction) {
            currentTier = downgradeTier(currentTier, 'D');
            overrideReasons.push('Conflito macro vs micro');
        }
    }

    // Override 5: Dados muito antigos
    const now = Date.now();
    const oldestAcceptable = 4 * 60 * 60 * 1000; // 4 horas
    const hasStaleData = Object.entries(analysis.dataTimestamps).some(([, ts]) => {
        return ts && (now - ts) > oldestAcceptable;
    });
    if (hasStaleData) {
        currentTier = downgradeTier(currentTier, 'C');
        overrideReasons.push('Dados desatualizados (> 4h)');
    }

    return { tier: currentTier, overrideReasons };
}

export function generateEvidence(analysis: AssetAnalysis): {
    supporting: EvidenceItem[];
    opposing: EvidenceItem[];
    missing: string[];
} {
    const supporting: EvidenceItem[] = [];
    const opposing: EvidenceItem[] = [];
    const missing: string[] = [];
    const direction = analysis.direction;

    const dimensions = [
        { name: 'macro', data: analysis.macro, label: 'Regime Macro' },
        { name: 'meso', data: analysis.meso, label: 'Análise Meso' },
        { name: 'micro', data: analysis.micro, label: 'Setup Técnico' },
        { name: 'liquidityMap', data: analysis.liquidityMap, label: 'Mapa de Liquidez' },
        { name: 'currencyStrength', data: analysis.currencyStrength, label: 'Força da Moeda' },
        { name: 'fundamentals', data: analysis.fundamentals, label: 'Fundamentais' },
        { name: 'sentiment', data: analysis.sentiment, label: 'Sentimento' }
    ];

    for (const dim of dimensions) {
        if (!dim.data || dim.data.score === null) {
            missing.push(dim.label);
            continue;
        }

        const impact = dim.data.confidence === 'HIGH' ? 'STRONG' :
            dim.data.confidence === 'MEDIUM' ? 'MODERATE' : 'WEAK';

        const details = dim.data.details || `${dim.data.direction} (${dim.data.score})`;

        const item: EvidenceItem = {
            source: dim.name,
            factor: `${dim.label}: ${details}`,
            impact,
            direction: dim.data.direction === direction ? 'SUPPORTING' :
                dim.data.direction === 'NEUTRAL' ? 'SUPPORTING' : 'OPPOSING',
            score: dim.data.score
        };

        if (item.direction === 'SUPPORTING') {
            supporting.push(item);
        } else {
            opposing.push(item);
        }
    }

    return { supporting, opposing, missing };
}

function getMaxHoldTime(assetClass: AssetClass): string {
    switch (assetClass) {
        case 'CRYPTO': return '48h';
        case 'FOREX': return '24h';
        case 'COMMODITY': return '24h';
        case 'INDEX': return '8h';
        case 'STOCK': return '5d';
        case 'BOND': return '5d';
        default: return '24h';
    }
}

export function generateTradePlan(
    analysis: AssetAnalysis,
    tier: ConfidenceTier,
    microData: {
        entry?: number;
        entryType?: 'LIMIT' | 'MARKET' | 'STOP';
        stopLoss?: number;
        takeProfit1?: number;
        takeProfit2?: number;
        takeProfit3?: number;
        riskReward?: number;
        atr?: number;
    } | null
): TradePlan | null {
    if (tier === 'F') return null;

    const config = TIER_CONFIG[tier];
    const basePositionPercent = 1.5;

    const entry = microData?.entry ?? analysis.price;
    const atr = microData?.atr ?? (analysis.price * 0.01);

    // Calculate stop loss
    const slMultiplier = tier === 'C' ? 1.5 : 1.0;
    const defaultSL = analysis.direction === 'LONG'
        ? entry - (atr * slMultiplier)
        : entry + (atr * slMultiplier);
    const stopLoss = microData?.stopLoss ?? defaultSL;

    // Calculate targets
    const defaultTP1 = analysis.direction === 'LONG'
        ? entry + (atr * 2)
        : entry - (atr * 2);
    const defaultTP2 = analysis.direction === 'LONG'
        ? entry + (atr * 3)
        : entry - (atr * 3);
    const defaultTP3 = analysis.direction === 'LONG'
        ? entry + (atr * 4.5)
        : entry - (atr * 4.5);

    const targets = {
        tp1: microData?.takeProfit1 ?? defaultTP1,
        tp2: microData?.takeProfit2 ?? defaultTP2,
        tp3: microData?.takeProfit3 ?? defaultTP3
    };

    // Calculate risk/reward
    const risk = Math.abs(entry - stopLoss);
    const reward = Math.abs(targets.tp1 - entry);
    const riskReward = microData?.riskReward ?? (risk > 0 ? reward / risk : 0);

    // Calculate position size
    const riskPercent = entry > 0 ? (risk / entry) * 100 : 1;

    return {
        entry: {
            price: entry,
            type: microData?.entryType || 'LIMIT'
        },
        stopLoss: {
            price: stopLoss,
            atrMultiple: slMultiplier,
            riskPercent
        },
        targets,
        riskReward: Math.round(riskReward * 100) / 100,
        positionSize: {
            percent: basePositionPercent,
            kellyAdjusted: basePositionPercent * 0.25,
            tierAdjusted: basePositionPercent * config.positionMultiplier,
            final: Math.min(basePositionPercent * config.positionMultiplier * 0.25, 2.0)
        },
        maxHoldTime: getMaxHoldTime(analysis.assetClass)
    };
}

// ============================================================================
// MAIN DECISION ENGINE
// ============================================================================

export function processAssetDecision(
    analysis: AssetAnalysis,
    regimeSnapshot: { regime?: string; axes?: Record<string, { value: number }> } | null,
    microData: {
        entry?: number;
        entryType?: 'LIMIT' | 'MARKET' | 'STOP';
        stopLoss?: number;
        takeProfit1?: number;
        takeProfit2?: number;
        takeProfit3?: number;
        riskReward?: number;
        atr?: number;
    } | null
): ActionDecision {
    const decisionPath: string[] = [];
    const warnings: string[] = [];
    const blockers: string[] = [];

    // Step 1: Calculate unified score
    decisionPath.push('Calculando unified score...');
    const unifiedScore = calculateUnifiedScore(analysis);
    decisionPath.push(`Score base: ${unifiedScore.score}, Coverage: ${unifiedScore.coverageTier}`);

    // Step 2: Determine initial tier
    let tier = determineConfidenceTier(unifiedScore.score);
    decisionPath.push(`Tier inicial: ${tier}`);

    // Step 3: Apply overrides
    const { tier: finalTier, overrideReasons } = applyTierOverrides(tier, analysis, regimeSnapshot);
    if (overrideReasons.length > 0) {
        tier = finalTier;
        decisionPath.push(`Tier após overrides: ${tier} (${overrideReasons.join(', ')})`);
        warnings.push(...overrideReasons);
    }

    // Step 4: Get action type
    const config = TIER_CONFIG[tier];
    const action = config.action;
    decisionPath.push(`Action: ${action}`);

    // Step 5: Generate evidence
    const evidence = generateEvidence(analysis);

    // Step 6: Generate trade plan
    const tradePlan = generateTradePlan(analysis, tier, microData);
    if (action.startsWith('EXECUTE') && !tradePlan) {
        blockers.push('Trade plan não pôde ser gerado');
    }

    // Validate trade plan coherence
    if (tradePlan) {
        const { entry, stopLoss, targets } = tradePlan;
        const coherent = analysis.direction === 'LONG'
            ? (stopLoss.price < entry.price && targets.tp1 > entry.price)
            : (stopLoss.price > entry.price && targets.tp1 < entry.price);

        if (!coherent) {
            blockers.push('Trade plan incoerente');
        }

        if (tradePlan.riskReward < 1.5) {
            warnings.push(`R:R baixo (${tradePlan.riskReward})`);
        }
    }

    // Step 7: Build final decision
    return {
        asset: analysis.symbol,
        displaySymbol: analysis.displaySymbol,
        name: analysis.name,
        assetClass: analysis.assetClass,
        timestamp: Date.now(),
        tier,
        tierLabel: config.label,
        action: blockers.length > 0 ? 'SKIP' : action,
        direction: analysis.direction,
        price: analysis.price,
        unifiedScore: unifiedScore.score,
        coverageTier: unifiedScore.coverageTier,
        alignment: unifiedScore.alignment,
        tradePlan,
        evidence,
        warnings,
        blockers,
        decisionPath
    };
}

export function processMultipleAssets(
    analyses: AssetAnalysis[],
    regimeSnapshot: { regime?: string; axes?: Record<string, { value: number }> } | null,
    microDataMap: Record<string, {
        entry?: number;
        stopLoss?: number;
        takeProfit1?: number;
        takeProfit2?: number;
        takeProfit3?: number;
        riskReward?: number;
        atr?: number;
    } | null>
): ActionDecision[] {
    const decisions = analyses.map(analysis =>
        processAssetDecision(analysis, regimeSnapshot, microDataMap[analysis.symbol] || null)
    );

    return sortByPriority(decisions);
}

function sortByPriority(decisions: ActionDecision[]): ActionDecision[] {
    const tierOrder: Record<ConfidenceTier, number> = { A: 0, B: 1, C: 2, D: 3, F: 4 };

    return decisions.sort((a, b) => {
        // 1. Por tier
        if (tierOrder[a.tier] !== tierOrder[b.tier]) {
            return tierOrder[a.tier] - tierOrder[b.tier];
        }

        // 2. Por score
        if (a.unifiedScore !== b.unifiedScore) {
            return b.unifiedScore - a.unifiedScore;
        }

        // 3. Por R:R
        const rrA = a.tradePlan?.riskReward || 0;
        const rrB = b.tradePlan?.riskReward || 0;
        return rrB - rrA;
    });
}

export function generateEngineSummary(decisions: ActionDecision[], regimeSnapshot: { regime?: string } | null): DecisionEngineResponse['summary'] {
    const tierCounts = { A: 0, B: 0, C: 0, D: 0, F: 0 };

    for (const d of decisions) {
        tierCounts[d.tier]++;
    }

    const topPicks = decisions
        .filter(d => d.tier === 'A' || d.tier === 'B')
        .slice(0, 5)
        .map(d => d.displaySymbol);

    let marketBias: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL' = 'NEUTRAL';
    if (regimeSnapshot?.regime) {
        if (['GOLDILOCKS', 'REFLATION', 'RISK_ON'].includes(regimeSnapshot.regime)) {
            marketBias = 'RISK_ON';
        } else if (['STAGFLATION', 'DEFLATION', 'LIQUIDITY_DRAIN', 'CREDIT_STRESS', 'RISK_OFF'].includes(regimeSnapshot.regime)) {
            marketBias = 'RISK_OFF';
        }
    }

    return {
        tierA: tierCounts.A,
        tierB: tierCounts.B,
        tierC: tierCounts.C,
        tierD: tierCounts.D,
        tierF: tierCounts.F,
        topPicks,
        marketBias
    };
}
