/**
 * Regime Engine - Framework Institucional
 * Macro → Meso → Micro → Execução
 * 
 * 6 Eixos: G (Growth), I (Inflation), L (Liquidity), C (Credit), D (Dollar), V (Volatility)
 * Hierarquia de dominância: L > C > V > G > I > D
 */

// =============================================================================
// TYPES
// =============================================================================

export type AxisDirection = '↑↑' | '↑' | '→' | '↓' | '↓↓';
export type ConfidenceLevel = 'OK' | 'PARTIAL' | 'STALE' | 'SUSPECT' | 'UNAVAILABLE';
export type RegimeType = 
    | 'GOLDILOCKS'      // G↑ I→ L↑ C→ - Risk-on, carry trades
    | 'REFLATION'       // G↑ I↑ - Commodities, value, short duration
    | 'STAGFLATION'     // G↓ I↑ L↓ - Defensivo, gold, cash
    | 'DEFLATION'       // G↓ I↓ L↓ C↓ - Cash, long duration, gold
    | 'LIQUIDITY_DRIVEN'// L↑↑ - Todos os ativos sobem
    | 'LIQUIDITY_DRAIN' // L↓↓ - Todos os ativos caem
    | 'CREDIT_STRESS'   // C↓↓ - Risk-off urgente
    | 'RISK_ON'         // Generic bullish
    | 'RISK_OFF'        // Generic bearish
    | 'NEUTRAL'         // Sem direção clara
    | 'UNKNOWN';        // Dados insuficientes

export interface AxisScore {
    axis: 'G' | 'I' | 'L' | 'C' | 'D' | 'V';
    name: string;
    score: number;           // -2 a +2 (normalizado)
    direction: AxisDirection;
    confidence: ConfidenceLevel;
    reasons: string[];       // Por que essa direção
    inputs: Record<string, number | string | null>; // Dados usados
    lastUpdate: string;      // ISO timestamp
}

export interface RegimeSnapshot {
    timestamp: string;
    regime: RegimeType;
    regimeConfidence: ConfidenceLevel;
    dominantDrivers: string[];  // Ex: ['L↓↓', 'V↑']
    axes: {
        G: AxisScore;
        I: AxisScore;
        L: AxisScore;
        C: AxisScore;
        D: AxisScore;
        V: AxisScore;
    };
    alerts: RegimeAlert[];
    mesoTilts: MesoTilt[];
    mesoProhibitions: string[];
    transitionWarning: string | null; // Se regime pode estar mudando
    lastConfirmedRegime: RegimeType;
    lastConfirmedAt: string;
}

export interface RegimeAlert {
    level: 'INFO' | 'WARNING' | 'CRITICAL';
    axis: 'G' | 'I' | 'L' | 'C' | 'D' | 'V' | 'SYSTEM';
    message: string;
    action: string;
}

export interface MesoTilt {
    rank: number;
    direction: 'LONG' | 'SHORT' | 'RELATIVE';
    asset: string;
    rationale: string;
    confidence: ConfidenceLevel;
}

// Gate types for EXECUTE flow
export type GateStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';

export interface GateResult {
    gate: 'MACRO' | 'MESO' | 'MICRO' | 'RISK' | 'EXECUTION';
    status: GateStatus;
    reasons: string[];
    inputs: Record<string, unknown>;
    confidence: ConfidenceLevel;
}

export interface GateSummary {
    timestamp: string;
    allPass: boolean;
    gates: {
        macro: GateResult;
        meso: GateResult;
        micro: GateResult;
        risk: GateResult;
        execution: GateResult;
    };
    overallConfidence: ConfidenceLevel;
    blockingReasons: string[];
    warnings: string[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

const AXIS_NAMES: Record<string, string> = {
    G: 'Growth (Crescimento)',
    I: 'Inflation (Inflação)',
    L: 'Liquidity (Liquidez)',
    C: 'Credit (Crédito)',
    D: 'Dollar (Dólar)',
    V: 'Volatility (Volatilidade)',
};

// Thresholds for score → direction
const DIRECTION_THRESHOLDS = {
    STRONG_UP: 1.0,
    UP: 0.3,
    DOWN: -0.3,
    STRONG_DOWN: -1.0,
};

// VIX percentiles (approximated from historical data)
const VIX_PERCENTILES = {
    p20: 13,
    p50: 17,
    p70: 22,
    p80: 25,
    p90: 30,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function scoreToDirection(score: number): AxisDirection {
    if (score >= DIRECTION_THRESHOLDS.STRONG_UP) return '↑↑';
    if (score >= DIRECTION_THRESHOLDS.UP) return '↑';
    if (score <= DIRECTION_THRESHOLDS.STRONG_DOWN) return '↓↓';
    if (score <= DIRECTION_THRESHOLDS.DOWN) return '↓';
    return '→';
}

function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

function zscore(value: number, mean: number, std: number): number {
    if (std === 0) return 0;
    return (value - mean) / std;
}

function getWorstConfidence(...levels: ConfidenceLevel[]): ConfidenceLevel {
    const order: ConfidenceLevel[] = ['UNAVAILABLE', 'SUSPECT', 'STALE', 'PARTIAL', 'OK'];
    let worst = 'OK' as ConfidenceLevel;
    for (const level of levels) {
        if (order.indexOf(level) < order.indexOf(worst)) {
            worst = level;
        }
    }
    return worst;
}

// =============================================================================
// AXIS CALCULATORS
// =============================================================================

export interface MacroInputs {
    vix?: number;
    vixChange?: number;
    treasury10y?: number;
    treasury2y?: number;
    treasury30y?: number;
    yieldCurve?: number;
    dollarIndex?: number;
    dollarIndexChange?: number;
    fearGreed?: { value: number; classification: string } | null;
    // Credit proxies (from HY ETF spreads if available)
    hySpreadProxy?: number;
    // Market breadth
    advDecRatio?: number;
    marketAvgChange?: number;
    // Timestamps for staleness
    dataTimestamp?: string;

    // ===== REAL FRED DATA (eliminates proxy dependency) =====
    // Growth (G axis)
    gdpYoY?: number;              // Real GDP YoY % change
    industrialProduction?: number; // INDPRO index (proxy for ISM PMI)
    nfpValue?: number;             // PAYEMS current (thousands)
    nfpPrevValue?: number;         // PAYEMS previous month (thousands)
    initialClaims?: number;        // ICSA (thousands)
    consumerSentiment?: number;    // UMCSENT index
    // Inflation (I axis)
    cpiYoY?: number;               // CPI Year-over-Year %
    corePceYoY?: number;           // Core PCE YoY % (Fed's preferred)
    breakeven5y?: number;          // T5YIE - 5Y Breakeven Inflation %
    // Liquidity (L axis)
    fedBalanceSheet?: number;      // WALCL - Fed Total Assets (millions $)
    fedBalanceSheetPrev?: number;  // Previous WALCL for change calc
    reverseRepo?: number;          // RRPONTSYD (billions $)
    tga?: number;                  // WTREGEN - Treasury General Account (millions $)
    m2MoneySupply?: number;        // M2SL (billions $)
    // Credit (C axis)
    hySpread?: number;             // BAMLH0A0HYM2 - HY OAS spread %
    aaaSpread?: number;            // BAMLC0A0CM - AAA spread %
    financialStressIndex?: number; // STLFSI3 index
    delinquencyRate?: number;      // DRSESP %
}

/**
 * G (Growth) - Real economic data from FRED
 * Primary: GDP YoY, Industrial Production, NFP change
 * Secondary: Initial Claims, Consumer Sentiment
 * Tertiary fallback: Fear/Greed, market breadth
 */
function calculateGrowthAxis(inputs: MacroInputs): AxisScore {
    const reasons: string[] = [];
    const usedInputs: Record<string, number | string | null> = {};
    let score = 0;
    let realDataPoints = 0;
    let proxyDataPoints = 0;
    let confidence: ConfidenceLevel = 'OK';

    // PRIMARY: Real GDP YoY (weight 0.35)
    if (inputs.gdpYoY != null) {
        usedInputs['gdpYoY'] = inputs.gdpYoY;
        // GDP YoY: >3% = strong, 1-3% = moderate, <1% = weak, <0 = contraction
        const gdpScore = clamp((inputs.gdpYoY - 2) / 1.5, -2, 2);
        score += gdpScore * 0.35;
        realDataPoints++;
        reasons.push(`Real GDP YoY: ${inputs.gdpYoY > 0 ? '+' : ''}${inputs.gdpYoY.toFixed(1)}% (${inputs.gdpYoY > 3 ? 'STRONG' : inputs.gdpYoY > 1 ? 'MODERATE' : inputs.gdpYoY > 0 ? 'WEAK' : 'CONTRACTION'})`);
    }

    // PRIMARY: NFP change month-over-month (weight 0.25)
    if (inputs.nfpValue != null && inputs.nfpPrevValue != null && inputs.nfpPrevValue > 0) {
        const nfpChange = inputs.nfpValue - inputs.nfpPrevValue;
        usedInputs['nfpChange'] = nfpChange;
        // NFP change: >200K = strong, 100-200K = moderate, <100K = weak, <0 = contraction
        const nfpScore = clamp((nfpChange - 150) / 100, -2, 2);
        score += nfpScore * 0.25;
        realDataPoints++;
        reasons.push(`NFP change: ${nfpChange > 0 ? '+' : ''}${nfpChange.toFixed(0)}K jobs (${nfpChange > 200 ? 'STRONG' : nfpChange > 100 ? 'MODERATE' : nfpChange > 0 ? 'SOFT' : 'NEGATIVE'})`);
    }

    // SECONDARY: Initial Claims (weight 0.15) — inverse: low claims = strong growth
    if (inputs.initialClaims != null) {
        usedInputs['initialClaims'] = inputs.initialClaims;
        // Claims: <220K = very strong, 220-280K = normal, >280K = weakening, >350K = stress
        const claimsScore = clamp((250 - inputs.initialClaims) / 50, -2, 2);
        score += claimsScore * 0.15;
        realDataPoints++;
        reasons.push(`Initial Claims: ${inputs.initialClaims.toFixed(0)}K (${inputs.initialClaims < 220 ? 'STRONG' : inputs.initialClaims < 280 ? 'NORMAL' : 'ELEVATED'})`);
    }

    // SECONDARY: Consumer Sentiment (weight 0.10)
    if (inputs.consumerSentiment != null) {
        usedInputs['consumerSentiment'] = inputs.consumerSentiment;
        // UMCSENT: historical avg ~85, >90 = optimistic, <70 = pessimistic
        const sentScore = clamp((inputs.consumerSentiment - 80) / 15, -2, 2);
        score += sentScore * 0.10;
        realDataPoints++;
        reasons.push(`Consumer Sentiment: ${inputs.consumerSentiment.toFixed(1)}`);
    }

    // TERTIARY FALLBACK: Fear/Greed (weight 0.10, only if lacking real data)
    if (realDataPoints < 2 && inputs.fearGreed?.value != null) {
        const fg = inputs.fearGreed.value;
        usedInputs['fearGreed'] = fg;
        const fgScore = (fg - 50) / 25;
        score += fgScore * 0.10;
        proxyDataPoints++;
        reasons.push(`Fear/Greed fallback: ${fg} (${inputs.fearGreed.classification})`);
    }

    // TERTIARY FALLBACK: Market breadth (weight 0.05, only if lacking real data)
    if (realDataPoints < 2 && inputs.advDecRatio != null && inputs.advDecRatio > 0) {
        usedInputs['advDecRatio'] = inputs.advDecRatio;
        const breadthScore = clamp((inputs.advDecRatio - 1) * 2, -2, 2);
        score += breadthScore * 0.05;
        proxyDataPoints++;
        reasons.push(`Breadth fallback: Adv/Dec ${inputs.advDecRatio.toFixed(2)}`);
    }

    // Confidence assessment
    if (realDataPoints >= 3) {
        confidence = 'OK';
    } else if (realDataPoints >= 1) {
        confidence = 'PARTIAL';
        reasons.push(`${realDataPoints} real data source(s) — add more FRED series for full accuracy`);
    } else if (proxyDataPoints > 0) {
        confidence = 'STALE';
        reasons.push('Using market proxies only — FRED data unavailable');
    } else {
        confidence = 'UNAVAILABLE';
        reasons.push('No growth data available');
    }

    score = clamp(score, -2, 2);

    return {
        axis: 'G',
        name: AXIS_NAMES.G,
        score,
        direction: scoreToDirection(score),
        confidence,
        reasons,
        inputs: usedInputs,
        lastUpdate: new Date().toISOString(),
    };
}

/**
 * I (Inflation) - Real inflation data from FRED
 * Primary: CPI YoY, Core PCE YoY
 * Secondary: 5Y Breakeven inflation (market-implied)
 * Tertiary: Yield curve, 10Y yield (fallback only)
 */
function calculateInflationAxis(inputs: MacroInputs): AxisScore {
    const reasons: string[] = [];
    const usedInputs: Record<string, number | string | null> = {};
    let score = 0;
    let realDataPoints = 0;
    let proxyDataPoints = 0;
    let confidence: ConfidenceLevel = 'OK';

    // PRIMARY: CPI Year-over-Year (weight 0.35)
    if (inputs.cpiYoY != null) {
        usedInputs['cpiYoY'] = inputs.cpiYoY;
        // Fed target = 2%. >3% = elevated, >5% = high, <1% = disinflation
        const cpiScore = clamp((inputs.cpiYoY - 2.5) / 1.5, -2, 2);
        score += cpiScore * 0.35;
        realDataPoints++;
        reasons.push(`CPI YoY: ${inputs.cpiYoY.toFixed(1)}% (${inputs.cpiYoY > 4 ? 'HIGH' : inputs.cpiYoY > 2.5 ? 'ABOVE TARGET' : inputs.cpiYoY > 1.5 ? 'AT TARGET' : 'LOW'})`);
    }

    // PRIMARY: Core PCE YoY — Fed's preferred measure (weight 0.30)
    if (inputs.corePceYoY != null) {
        usedInputs['corePceYoY'] = inputs.corePceYoY;
        const pceScore = clamp((inputs.corePceYoY - 2.5) / 1.5, -2, 2);
        score += pceScore * 0.30;
        realDataPoints++;
        reasons.push(`Core PCE YoY: ${inputs.corePceYoY.toFixed(1)}% (Fed target: 2%)`);
    }

    // SECONDARY: 5Y Breakeven inflation — market-implied (weight 0.20)
    if (inputs.breakeven5y != null) {
        usedInputs['breakeven5y'] = inputs.breakeven5y;
        // Breakeven: ~2.0-2.5% = anchored, >3% = unanchored, <1.5% = deflation fear
        const beScore = clamp((inputs.breakeven5y - 2.2) / 0.8, -2, 2);
        score += beScore * 0.20;
        realDataPoints++;
        reasons.push(`5Y Breakeven: ${inputs.breakeven5y.toFixed(2)}% (${inputs.breakeven5y > 2.8 ? 'UNANCHORED' : inputs.breakeven5y > 2 ? 'ANCHORED' : 'LOW'})`);
    }

    // TERTIARY FALLBACK: Yield curve (weight 0.10, only if lacking real data)
    if (realDataPoints < 2 && inputs.yieldCurve != null) {
        usedInputs['yieldCurve'] = inputs.yieldCurve;
        const curveScore = clamp(inputs.yieldCurve / 1.0, -2, 2);
        score += curveScore * 0.10;
        proxyDataPoints++;
        reasons.push(`Yield curve fallback: ${inputs.yieldCurve > 0 ? '+' : ''}${inputs.yieldCurve.toFixed(2)}%`);
    }

    // TERTIARY FALLBACK: 10Y yield level (weight 0.05, only if lacking real data)
    if (realDataPoints < 2 && inputs.treasury10y != null && inputs.treasury10y > 0) {
        usedInputs['treasury10y'] = inputs.treasury10y;
        const yieldScore = clamp((inputs.treasury10y - 3.5) / 1.5, -2, 2);
        score += yieldScore * 0.05;
        proxyDataPoints++;
        reasons.push(`10Y yield fallback: ${inputs.treasury10y.toFixed(2)}%`);
    }

    // Confidence assessment
    if (realDataPoints >= 2) {
        confidence = 'OK';
    } else if (realDataPoints >= 1) {
        confidence = 'PARTIAL';
        reasons.push('Partial inflation data — waiting for more FRED updates');
    } else if (proxyDataPoints > 0) {
        confidence = 'STALE';
        reasons.push('Using yield proxies only — CPI/PCE data unavailable');
    } else {
        confidence = 'UNAVAILABLE';
        reasons.push('No inflation data available');
    }

    score = clamp(score, -2, 2);

    return {
        axis: 'I',
        name: AXIS_NAMES.I,
        score,
        direction: scoreToDirection(score),
        confidence,
        reasons,
        inputs: usedInputs,
        lastUpdate: new Date().toISOString(),
    };
}

/**
 * L (Liquidity) - MOST IMPORTANT AXIS — Real Fed data from FRED
 * Net Liquidity ≈ Fed Balance Sheet − Reverse Repo − TGA
 * Primary: WALCL (Fed BS) change, RRPONTSYD, TGA
 * Secondary: M2 Money Supply
 * Tertiary fallback: VIX (stress indicator only, NOT liquidity proxy)
 */
function calculateLiquidityAxis(inputs: MacroInputs): AxisScore {
    const reasons: string[] = [];
    const usedInputs: Record<string, number | string | null> = {};
    let score = 0;
    let realDataPoints = 0;
    let proxyDataPoints = 0;
    let confidence: ConfidenceLevel = 'OK';

    // PRIMARY: Fed Balance Sheet change (weight 0.35)
    // Net liquidity = WALCL − RRP − TGA
    // If both current and previous are available, calculate change
    if (inputs.fedBalanceSheet != null) {
        usedInputs['fedBalanceSheet'] = inputs.fedBalanceSheet;

        if (inputs.fedBalanceSheetPrev != null && inputs.fedBalanceSheetPrev > 0) {
            const bsChange = ((inputs.fedBalanceSheet - inputs.fedBalanceSheetPrev) / inputs.fedBalanceSheetPrev) * 100;
            usedInputs['fedBSChange%'] = bsChange;
            // BS expanding = liquidity injection, contracting = drainage
            // Typical QE = +0.5%/week, QT = -0.2%/week
            const bsScore = clamp(bsChange / 0.3, -2, 2);
            score += bsScore * 0.35;
            realDataPoints++;
            reasons.push(`Fed BS: $${(inputs.fedBalanceSheet / 1e6).toFixed(2)}T (${bsChange > 0 ? '+' : ''}${bsChange.toFixed(2)}% chg → ${bsChange > 0.1 ? 'EXPANDING' : bsChange < -0.1 ? 'CONTRACTING' : 'FLAT'})`);
        } else {
            // Use absolute level — compare to historical norms
            // Post-2020 norm: ~$7-8T, pre-2020: ~$4T
            const levelScore = clamp((inputs.fedBalanceSheet / 1e6 - 7) / 1.5, -2, 2);
            score += levelScore * 0.20;
            realDataPoints++;
            reasons.push(`Fed BS level: $${(inputs.fedBalanceSheet / 1e6).toFixed(2)}T`);
        }
    }

    // PRIMARY: Reverse Repo — draining = liquidity releasing (weight 0.25)
    if (inputs.reverseRepo != null) {
        usedInputs['reverseRepo'] = inputs.reverseRepo;
        // RRP declining = liquidity moving into market (positive)
        // RRP rising = liquidity parking at Fed (negative for markets)
        // Post-2022: RRP went from $2.5T to ~$0.5T (bullish drain)
        // Score based on absolute level: <$500B = depleted (neutral), $500B-$1.5T = draining, >$1.5T = absorbing
        const rrpScore = clamp((800 - inputs.reverseRepo) / 500, -2, 2);
        score += rrpScore * 0.25;
        realDataPoints++;
        reasons.push(`Reverse Repo: $${inputs.reverseRepo.toFixed(0)}B (${inputs.reverseRepo < 300 ? 'DEPLETED' : inputs.reverseRepo < 800 ? 'LOW' : inputs.reverseRepo < 1500 ? 'MODERATE' : 'HIGH — absorbing liquidity'})`);
    }

    // SECONDARY: TGA (Treasury General Account) — high TGA drains, low TGA releases (weight 0.15)
    if (inputs.tga != null) {
        usedInputs['tga'] = inputs.tga;
        // TGA normal range: $500B-$800B. Very high (>$800B) = draining. Low (<$200B) = releasing.
        const tgaInBillions = inputs.tga / 1000;
        const tgaScore = clamp((600 - tgaInBillions) / 300, -2, 2);
        score += tgaScore * 0.15;
        realDataPoints++;
        reasons.push(`TGA: $${tgaInBillions.toFixed(0)}B (${tgaInBillions > 800 ? 'HIGH — draining' : tgaInBillions > 400 ? 'NORMAL' : 'LOW — releasing'})`);
    }

    // SECONDARY: M2 Money Supply growth (weight 0.10)
    if (inputs.m2MoneySupply != null) {
        usedInputs['m2MoneySupply'] = inputs.m2MoneySupply;
        // M2 > $21T (2024 level). Growing = inflationary/liquidity positive
        // Compare to ~$21T baseline
        const m2Score = clamp((inputs.m2MoneySupply / 1000 - 21) / 1, -2, 2);
        score += m2Score * 0.10;
        realDataPoints++;
        reasons.push(`M2: $${(inputs.m2MoneySupply / 1000).toFixed(1)}T`);
    }

    // TERTIARY FALLBACK: VIX as stress indicator (weight 0.10, reduced from 0.4)
    // Only used when no real liquidity data is available
    if (realDataPoints < 2 && inputs.vix != null && inputs.vix > 0) {
        usedInputs['vix_fallback'] = inputs.vix;
        const vixScore = clamp((20 - inputs.vix) / 7, -2, 2);
        score += vixScore * 0.10;
        proxyDataPoints++;
        reasons.push(`VIX stress fallback: ${inputs.vix.toFixed(1)} (proxy only — NOT direct liquidity measure)`);
    }

    // Confidence assessment
    if (realDataPoints >= 3) {
        confidence = 'OK';
    } else if (realDataPoints >= 1) {
        confidence = 'PARTIAL';
        reasons.push(`${realDataPoints} real liquidity source(s) available`);
    } else if (proxyDataPoints > 0) {
        confidence = 'STALE';
        reasons.push('⚠️ Using VIX as proxy — FRED liquidity data unavailable');
    } else {
        confidence = 'UNAVAILABLE';
        reasons.push('No liquidity data available');
    }

    score = clamp(score, -2, 2);

    return {
        axis: 'L',
        name: AXIS_NAMES.L,
        score,
        direction: scoreToDirection(score),
        confidence,
        reasons,
        inputs: usedInputs,
        lastUpdate: new Date().toISOString(),
    };
}

/**
 * C (Credit) - Real credit data from FRED
 * Primary: BAMLH0A0HYM2 (HY OAS spread), BAMLC0A0CM (AAA spread)
 * Secondary: STLFSI3 (Financial Stress Index), Delinquency Rate
 * Tertiary fallback: VIX (only when no real credit data)
 */
function calculateCreditAxis(inputs: MacroInputs): AxisScore {
    const reasons: string[] = [];
    const usedInputs: Record<string, number | string | null> = {};
    let score = 0;
    let realDataPoints = 0;
    let proxyDataPoints = 0;
    let confidence: ConfidenceLevel = 'OK';

    // PRIMARY: HY OAS Spread (weight 0.40) — THE key credit indicator
    if (inputs.hySpread != null) {
        usedInputs['hySpread'] = inputs.hySpread;
        // HY OAS: <3% = very tight (risk-on), 3-4% = normal, 4-6% = widening, >6% = stress, >8% = crisis
        const hyScore = clamp((4.0 - inputs.hySpread) / 1.5, -2, 2);
        score += hyScore * 0.40;
        realDataPoints++;
        reasons.push(`HY Spread: ${inputs.hySpread.toFixed(2)}% (${inputs.hySpread < 3 ? 'TIGHT' : inputs.hySpread < 4.5 ? 'NORMAL' : inputs.hySpread < 6 ? 'WIDENING' : 'STRESS'})`);
    }

    // PRIMARY: AAA Spread (weight 0.20) — investment grade stress
    if (inputs.aaaSpread != null) {
        usedInputs['aaaSpread'] = inputs.aaaSpread;
        // AAA OAS: <0.8% = very tight, 0.8-1.2% = normal, >1.5% = stress
        const aaaScore = clamp((1.0 - inputs.aaaSpread) / 0.5, -2, 2);
        score += aaaScore * 0.20;
        realDataPoints++;
        reasons.push(`AAA Spread: ${inputs.aaaSpread.toFixed(2)}%`);
    }

    // SECONDARY: Financial Stress Index (weight 0.20)
    if (inputs.financialStressIndex != null) {
        usedInputs['financialStressIndex'] = inputs.financialStressIndex;
        // STLFSI3: 0 = average, negative = below-avg stress (good), >1 = elevated, >2 = crisis
        const fsiScore = clamp(-inputs.financialStressIndex / 1.0, -2, 2);
        score += fsiScore * 0.20;
        realDataPoints++;
        reasons.push(`Fin Stress Index: ${inputs.financialStressIndex.toFixed(2)} (${inputs.financialStressIndex < -0.5 ? 'CALM' : inputs.financialStressIndex < 0.5 ? 'NORMAL' : inputs.financialStressIndex < 1.5 ? 'ELEVATED' : 'CRISIS'})`);
    }

    // SECONDARY: Delinquency Rate (weight 0.10)
    if (inputs.delinquencyRate != null) {
        usedInputs['delinquencyRate'] = inputs.delinquencyRate;
        // Historical avg ~2-3%, >4% = concerning, >5% = stress
        const delScore = clamp((3.0 - inputs.delinquencyRate) / 1.0, -2, 2);
        score += delScore * 0.10;
        realDataPoints++;
        reasons.push(`Delinquency: ${inputs.delinquencyRate.toFixed(1)}%`);
    }

    // TERTIARY FALLBACK: VIX (weight 0.10, only when no real credit data)
    if (realDataPoints < 1 && inputs.vix != null && inputs.vix > 0) {
        usedInputs['vix_credit_fallback'] = inputs.vix;
        const vixScore = clamp((20 - inputs.vix) / 8, -2, 2);
        score += vixScore * 0.10;
        proxyDataPoints++;
        reasons.push(`VIX credit fallback: ${inputs.vix.toFixed(1)} (proxy only — NOT credit spread)`);
    }

    // Legacy fallback for hySpreadProxy (bps from ETF)
    if (realDataPoints < 1 && inputs.hySpreadProxy != null) {
        usedInputs['hySpreadProxy'] = inputs.hySpreadProxy;
        const spreadScore = clamp((400 - inputs.hySpreadProxy) / 150, -2, 2);
        score += spreadScore * 0.10;
        proxyDataPoints++;
        reasons.push(`HY ETF proxy: ${inputs.hySpreadProxy}bps`);
    }

    // Confidence assessment
    if (realDataPoints >= 2) {
        confidence = 'OK';
    } else if (realDataPoints >= 1) {
        confidence = 'PARTIAL';
        reasons.push('Partial credit data from FRED');
    } else if (proxyDataPoints > 0) {
        confidence = 'STALE';
        reasons.push('⚠️ Using VIX/ETF proxy — real HY OAS data unavailable');
    } else {
        confidence = 'UNAVAILABLE';
        reasons.push('No credit data available');
    }

    score = clamp(score, -2, 2);

    return {
        axis: 'C',
        name: AXIS_NAMES.C,
        score,
        direction: scoreToDirection(score),
        confidence,
        reasons,
        inputs: usedInputs,
        lastUpdate: new Date().toISOString(),
    };
}

/**
 * D (Dollar) - DXY based
 */
function calculateDollarAxis(inputs: MacroInputs): AxisScore {
    const reasons: string[] = [];
    const usedInputs: Record<string, number | string | null> = {};
    let score = 0;
    let dataPoints = 0;
    let confidence: ConfidenceLevel = 'OK';

    if (inputs.dollarIndex != null && inputs.dollarIndex > 0) {
        usedInputs['dollarIndex'] = inputs.dollarIndex;
        // DXY historical average ~100, >105 = strong, <95 = weak
        const dxyScore = clamp((inputs.dollarIndex - 100) / 5, -2, 2);
        score += dxyScore * 0.6;
        dataPoints++;
        reasons.push(`DXY: ${inputs.dollarIndex.toFixed(2)}`);
    }

    if (inputs.dollarIndexChange != null) {
        usedInputs['dollarIndexChange'] = inputs.dollarIndexChange;
        const changeScore = clamp(inputs.dollarIndexChange / 0.5, -2, 2);
        score += changeScore * 0.4;
        dataPoints++;
        reasons.push(`DXY change: ${inputs.dollarIndexChange > 0 ? '+' : ''}${inputs.dollarIndexChange.toFixed(2)}%`);
    }

    if (dataPoints === 0) {
        confidence = 'UNAVAILABLE';
        reasons.push('No dollar data available');
    } else if (dataPoints < 2) {
        confidence = 'PARTIAL';
    }

    score = clamp(score, -2, 2);

    return {
        axis: 'D',
        name: AXIS_NAMES.D,
        score,
        direction: scoreToDirection(score),
        confidence,
        reasons,
        inputs: usedInputs,
        lastUpdate: new Date().toISOString(),
    };
}

/**
 * V (Volatility) - VIX based with percentile ranking
 */
function calculateVolatilityAxis(inputs: MacroInputs): AxisScore {
    const reasons: string[] = [];
    const usedInputs: Record<string, number | string | null> = {};
    let score = 0;
    let percentile = 50;
    let confidence: ConfidenceLevel = 'OK';

    if (inputs.vix != null && inputs.vix > 0) {
        usedInputs['vix'] = inputs.vix;

        // Calculate percentile
        if (inputs.vix <= VIX_PERCENTILES.p20) percentile = 20;
        else if (inputs.vix <= VIX_PERCENTILES.p50) percentile = 50;
        else if (inputs.vix <= VIX_PERCENTILES.p70) percentile = 70;
        else if (inputs.vix <= VIX_PERCENTILES.p80) percentile = 80;
        else if (inputs.vix <= VIX_PERCENTILES.p90) percentile = 90;
        else percentile = 95;

        usedInputs['vixPercentile'] = percentile;

        // Score: high vol = positive score (means "vol is up")
        score = clamp((inputs.vix - 17) / 7, -2, 2);

        reasons.push(`VIX: ${inputs.vix.toFixed(1)} (${percentile}th percentile)`);

        if (percentile >= 80) {
            reasons.push('⚠️ High vol regime - reduce sizing');
        } else if (percentile <= 20) {
            reasons.push('Vol compressed - tail risk accumulating');
        }
    } else {
        confidence = 'UNAVAILABLE';
        reasons.push('No volatility data available');
    }

    if (inputs.vixChange != null) {
        usedInputs['vixChange'] = inputs.vixChange;
        if (Math.abs(inputs.vixChange) > 10) {
            reasons.push(`VIX spike: ${inputs.vixChange > 0 ? '+' : ''}${inputs.vixChange.toFixed(1)}%`);
        }
    }

    return {
        axis: 'V',
        name: AXIS_NAMES.V,
        score,
        direction: scoreToDirection(score),
        confidence,
        reasons,
        inputs: usedInputs,
        lastUpdate: new Date().toISOString(),
    };
}

// =============================================================================
// REGIME CLASSIFICATION
// =============================================================================

function classifyRegime(axes: RegimeSnapshot['axes']): { regime: RegimeType; confidence: ConfidenceLevel; drivers: string[] } {
    const G = axes.G.direction;
    const I = axes.I.direction;
    const L = axes.L.direction;
    const C = axes.C.direction;
    const D = axes.D.direction;
    const V = axes.V.direction;

    const drivers: string[] = [];
    let regime: RegimeType = 'NEUTRAL';

    // Dominance hierarchy: L > C > V
    // Check for dominant conditions first

    // L↓↓ dominates everything - Liquidity Drain
    if (L === '↓↓') {
        regime = 'LIQUIDITY_DRAIN';
        drivers.push('L↓↓ (Liquidity Drain dominates)');
        return { regime, confidence: axes.L.confidence, drivers };
    }

    // L↑↑ dominates - Liquidity Driven rally
    if (L === '↑↑') {
        regime = 'LIQUIDITY_DRIVEN';
        drivers.push('L↑↑ (Liquidity Driven rally)');
        return { regime, confidence: axes.L.confidence, drivers };
    }

    // C stress dominates
    if (C === '↓↓' || (C === '↓' && V === '↑↑')) {
        regime = 'CREDIT_STRESS';
        drivers.push('C stress (Credit conditions deteriorating)');
        if (V === '↑↑' || V === '↑') drivers.push(`V${V}`);
        return { regime, confidence: getWorstConfidence(axes.C.confidence, axes.V.confidence), drivers };
    }

    // V extreme affects sizing but doesn't change regime classification
    if (V === '↑↑') {
        drivers.push('V↑↑ (High vol - sizing impact)');
    }

    // Growth-Inflation matrix
    const gUp = G === '↑' || G === '↑↑';
    const gDown = G === '↓' || G === '↓↓';
    const iUp = I === '↑' || I === '↑↑';
    const iDown = I === '↓' || I === '↓↓';
    const lUp = L === '↑';
    const lDown = L === '↓';

    if (gUp && !iUp && lUp) {
        regime = 'GOLDILOCKS';
        drivers.push('G↑', 'I neutral/↓', 'L↑');
    } else if (gUp && iUp) {
        regime = 'REFLATION';
        drivers.push('G↑', 'I↑');
    } else if (gDown && iUp) {
        regime = 'STAGFLATION';
        drivers.push('G↓', 'I↑');
        if (lDown) drivers.push('L↓');
    } else if (gDown && (iDown || I === '→')) {
        regime = 'DEFLATION';
        drivers.push('G↓', 'I↓/→');
    } else if (gUp || lUp) {
        regime = 'RISK_ON';
        if (gUp) drivers.push('G↑');
        if (lUp) drivers.push('L↑');
    } else if (gDown || lDown) {
        regime = 'RISK_OFF';
        if (gDown) drivers.push('G↓');
        if (lDown) drivers.push('L↓');
    }

    // Add dollar driver if extreme
    if (D === '↑↑' || D === '↓↓') {
        drivers.push(`D${D}`);
    }

    const confidence = getWorstConfidence(
        axes.G.confidence,
        axes.I.confidence,
        axes.L.confidence,
        axes.C.confidence
    );

    return { regime, confidence, drivers };
}

// =============================================================================
// MESO TILTS
// =============================================================================

function generateMesoTilts(regime: RegimeType, axes: RegimeSnapshot['axes']): MesoTilt[] {
    const tilts: MesoTilt[] = [];
    const D = axes.D.direction;

    switch (regime) {
        case 'GOLDILOCKS':
            tilts.push({ rank: 1, direction: 'LONG', asset: 'High-beta FX (AUD, NZD)', rationale: 'Risk-on + carry', confidence: 'PARTIAL' });
            tilts.push({ rank: 2, direction: 'SHORT', asset: 'JPY', rationale: 'Safe haven unwind', confidence: 'PARTIAL' });
            tilts.push({ rank: 3, direction: 'LONG', asset: 'Equities/Risk Assets', rationale: 'Growth + liquidity support', confidence: 'PARTIAL' });
            break;
        case 'REFLATION':
            tilts.push({ rank: 1, direction: 'LONG', asset: 'Commodities', rationale: 'Inflation hedge + growth', confidence: 'PARTIAL' });
            tilts.push({ rank: 2, direction: 'LONG', asset: 'Commodity FX (AUD, CAD)', rationale: 'Terms of trade improvement', confidence: 'PARTIAL' });
            tilts.push({ rank: 3, direction: 'LONG', asset: 'XAU/USD', rationale: 'Inflation protection', confidence: 'PARTIAL' });
            break;
        case 'STAGFLATION':
            tilts.push({ rank: 1, direction: 'LONG', asset: 'XAU/USD', rationale: 'Defensivo + inflation hedge', confidence: 'PARTIAL' });
            tilts.push({ rank: 2, direction: 'LONG', asset: 'USD', rationale: 'Safe haven + yield', confidence: 'PARTIAL' });
            tilts.push({ rank: 3, direction: 'SHORT', asset: 'Risk assets', rationale: 'Growth concerns', confidence: 'PARTIAL' });
            break;
        case 'DEFLATION':
        case 'CREDIT_STRESS':
            tilts.push({ rank: 1, direction: 'LONG', asset: 'JPY, CHF', rationale: 'Safe havens', confidence: 'PARTIAL' });
            tilts.push({ rank: 2, direction: 'LONG', asset: 'XAU/USD', rationale: 'Crisis hedge', confidence: 'PARTIAL' });
            tilts.push({ rank: 3, direction: 'SHORT', asset: 'High-beta (AUD, EM)', rationale: 'Risk-off', confidence: 'PARTIAL' });
            break;
        case 'LIQUIDITY_DRIVEN':
            tilts.push({ rank: 1, direction: 'LONG', asset: 'Risk assets', rationale: 'Liquidity supports all', confidence: 'PARTIAL' });
            tilts.push({ rank: 2, direction: 'SHORT', asset: 'USD', rationale: 'Dollar liquidity abundant', confidence: 'PARTIAL' });
            tilts.push({ rank: 3, direction: 'LONG', asset: 'XAU/USD', rationale: 'Real rates down', confidence: 'PARTIAL' });
            break;
        case 'LIQUIDITY_DRAIN':
            tilts.push({ rank: 1, direction: 'LONG', asset: 'USD', rationale: 'Dollar shortage', confidence: 'PARTIAL' });
            tilts.push({ rank: 2, direction: 'SHORT', asset: 'All risk assets', rationale: 'Liquidity withdrawal', confidence: 'PARTIAL' });
            tilts.push({ rank: 3, direction: 'LONG', asset: 'Cash', rationale: 'Preserve capital', confidence: 'PARTIAL' });
            break;
        default:
            tilts.push({ rank: 1, direction: 'RELATIVE', asset: 'Neutral/Reduced', rationale: 'No clear regime', confidence: 'PARTIAL' });
    }

    // Adjust for dollar strength
    if (D === '↑↑') {
        tilts.forEach(t => {
            if (t.asset.includes('USD') && t.direction === 'SHORT') {
                t.rationale += ' (CAUTION: USD strong)';
            }
        });
    }

    return tilts;
}

function generateMesoProhibitions(regime: RegimeType, axes: RegimeSnapshot['axes']): string[] {
    const prohibitions: string[] = [];
    const V = axes.V.direction;
    const vScore = axes.V.score;

    // V-based prohibitions
    if (V === '↑↑' || vScore > 1.0) {
        prohibitions.push('Não adicionar risco enquanto VIX > 25');
        prohibitions.push('Sizing máximo 50% do normal');
    }

    // Regime-based prohibitions
    switch (regime) {
        case 'STAGFLATION':
        case 'DEFLATION':
        case 'CREDIT_STRESS':
            prohibitions.push('Não long risk assets (AUD, EM, equities)');
            prohibitions.push('Não short safe havens (JPY, CHF, Gold)');
            break;
        case 'LIQUIDITY_DRAIN':
            prohibitions.push('Não adicionar exposição em nenhum ativo');
            prohibitions.push('Não short USD');
            break;
        case 'REFLATION':
            prohibitions.push('Não long duration (bonds)');
            break;
    }

    // Always
    if (prohibitions.length === 0) {
        prohibitions.push('Respeitar gates de execução');
    }

    return prohibitions;
}

// =============================================================================
// ALERTS
// =============================================================================

function generateAlerts(axes: RegimeSnapshot['axes'], regime: RegimeType): RegimeAlert[] {
    const alerts: RegimeAlert[] = [];

    void regime;

    // Liquidity alerts (highest priority)
    if (axes.L.direction === '↓↓') {
        alerts.push({
            level: 'CRITICAL',
            axis: 'L',
            message: 'Liquidity Drain - All assets at risk',
            action: 'Reduce risk 50%, no new positions',
        });
    } else if (axes.L.direction === '↓') {
        alerts.push({
            level: 'WARNING',
            axis: 'L',
            message: 'Liquidity tightening',
            action: 'Monitor Fed, reduce sizing',
        });
    }

    // Credit alerts
    if (axes.C.direction === '↓↓') {
        alerts.push({
            level: 'CRITICAL',
            axis: 'C',
            message: 'Credit stress - correlations will spike',
            action: 'Risk-off, close correlated positions',
        });
    }

    // Volatility alerts
    const vPercentile = axes.V.inputs['vixPercentile'];
    if (typeof vPercentile === 'number' && vPercentile >= 80) {
        alerts.push({
            level: 'WARNING',
            axis: 'V',
            message: `VIX at ${vPercentile}th percentile`,
            action: 'Reduce position sizes by 50%',
        });
    } else if (typeof vPercentile === 'number' && vPercentile <= 20) {
        alerts.push({
            level: 'INFO',
            axis: 'V',
            message: 'Vol compressed - tail risk accumulating',
            action: 'Consider hedges, be aware of gamma',
        });
    }

    // Confidence alerts
    const lowConfidence = Object.values(axes).filter(a => a.confidence === 'UNAVAILABLE' || a.confidence === 'SUSPECT');
    if (lowConfidence.length >= 3) {
        alerts.push({
            level: 'WARNING',
            axis: 'SYSTEM',
            message: 'Multiple axes with low confidence data',
            action: 'Treat regime classification with caution',
        });
    }

    return alerts;
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

export function calculateRegimeSnapshot(inputs: MacroInputs): RegimeSnapshot {
    const timestamp = new Date().toISOString();

    // Calculate all axes
    const axes = {
        G: calculateGrowthAxis(inputs),
        I: calculateInflationAxis(inputs),
        L: calculateLiquidityAxis(inputs),
        C: calculateCreditAxis(inputs),
        D: calculateDollarAxis(inputs),
        V: calculateVolatilityAxis(inputs),
    };

    // Classify regime
    const { regime, confidence: regimeConfidence, drivers } = classifyRegime(axes);

    // Generate meso layer
    const mesoTilts = generateMesoTilts(regime, axes);
    const mesoProhibitions = generateMesoProhibitions(regime, axes);

    // Generate alerts
    const alerts = generateAlerts(axes, regime);

    // Detect regime transitions using stored history
    const transitionWarning = detectRegimeTransition(regime, axes);
    
    return {
        timestamp,
        regime,
        regimeConfidence,
        dominantDrivers: drivers,
        axes,
        alerts,
        mesoTilts,
        mesoProhibitions,
        transitionWarning,
        lastConfirmedRegime: regime,
        lastConfirmedAt: timestamp,
    };
}

// =============================================================================
// REGIME TRANSITION DETECTION
// =============================================================================

// Store recent regime readings for transition detection
const regimeHistory: { timestamp: number; regime: RegimeType; axes: Record<string, number> }[] = [];
const MAX_HISTORY_LENGTH = 20;
const TRANSITION_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Detect if regime is transitioning based on axis momentum
 */
function detectRegimeTransition(
    currentRegime: RegimeType,
    axes: RegimeSnapshot['axes']
): string | null {
    const now = Date.now();
    
    // Add current reading to history
    regimeHistory.push({
        timestamp: now,
        regime: currentRegime,
        axes: {
            G: axes.G.score,
            I: axes.I.score,
            L: axes.L.score,
            C: axes.C.score,
            D: axes.D.score,
            V: axes.V.score,
        },
    });
    
    // Trim old history
    while (regimeHistory.length > MAX_HISTORY_LENGTH) {
        regimeHistory.shift();
    }
    
    // Need at least 3 readings for transition detection
    if (regimeHistory.length < 3) return null;
    
    // Filter to recent window
    const recentHistory = regimeHistory.filter(h => now - h.timestamp < TRANSITION_WINDOW_MS);
    if (recentHistory.length < 3) return null;
    
    // Check for regime instability (multiple changes)
    const regimeChanges = new Set(recentHistory.map(h => h.regime));
    if (regimeChanges.size >= 3) {
        return `⚠️ Regime instável: ${regimeChanges.size} regimes diferentes nas últimas 4h. Reduzir exposição.`;
    }
    
    // Check for axis momentum (trending towards transition)
    const oldestReading = recentHistory[0];
    const latestReading = recentHistory[recentHistory.length - 1];
    
    const axisMomentum: Record<string, number> = {};
    for (const axis of ['G', 'I', 'L', 'C', 'V'] as const) {
        axisMomentum[axis] = latestReading.axes[axis] - oldestReading.axes[axis];
    }
    
    // Critical transitions to watch
    const warnings: string[] = [];
    
    // Liquidity deteriorating rapidly
    if (axisMomentum.L < -0.5 && axes.L.score < 0) {
        warnings.push('Liquidez deteriorando → possível LIQUIDITY_DRAIN');
    }
    
    // Credit stress building
    if (axisMomentum.C < -0.4 && axes.C.score < -0.3) {
        warnings.push('Stress de crédito aumentando → possível CREDIT_STRESS');
    }
    
    // Volatility spiking
    if (axisMomentum.V > 0.5 && axes.V.score > 0.5) {
        warnings.push('Volatilidade subindo rapidamente → reduzir sizing');
    }
    
    // Growth collapsing
    if (axisMomentum.G < -0.5 && axes.G.score < -0.3) {
        warnings.push('Crescimento deteriorando → possível DEFLATION/STAGFLATION');
    }
    
    // Moving from risk-off to risk-on
    if (axisMomentum.L > 0.4 && axisMomentum.G > 0.3 && currentRegime !== 'GOLDILOCKS') {
        warnings.push('Melhora em L e G → possível transição para RISK_ON/GOLDILOCKS');
    }
    
    if (warnings.length > 0) {
        return `🔄 TRANSIÇÃO: ${warnings.join('; ')}`;
    }
    
    return null;
}

// =============================================================================
// GATE EVALUATION
// =============================================================================

export interface TradeContext {
    symbol: string;
    direction: 'LONG' | 'SHORT';
    assetClass: string;
    score: number;
    signal: string;
    quality?: { status: string; reasons?: string[] };
    liquidityScore?: number;
    entryPrice?: number;
    stopPrice?: number;
    targetPrice?: number;
    spreadCost?: number;
    accountRiskPercent?: number;
    totalOpenRiskPercent?: number;
    correlatedExposure?: number;
    currentHour?: number; // 0-23 UTC
    hasUpcomingNews?: boolean;
}

export function evaluateGates(
    regime: RegimeSnapshot,
    trade: TradeContext
): GateSummary {
    const timestamp = new Date().toISOString();
    const blockingReasons: string[] = [];
    const warnings: string[] = [];

    // --- MACRO GATE ---
    const macroGate = evaluateMacroGate(regime, trade);
    if (macroGate.status === 'FAIL') blockingReasons.push(...macroGate.reasons);
    if (macroGate.status === 'WARN') warnings.push(...macroGate.reasons);

    // --- MESO GATE ---
    const mesoGate = evaluateMesoGate(regime, trade);
    if (mesoGate.status === 'FAIL') blockingReasons.push(...mesoGate.reasons);
    if (mesoGate.status === 'WARN') warnings.push(...mesoGate.reasons);

    // --- MICRO GATE ---
    const microGate = evaluateMicroGate(trade);
    if (microGate.status === 'FAIL') blockingReasons.push(...microGate.reasons);
    if (microGate.status === 'WARN') warnings.push(...microGate.reasons);

    // --- RISK GATE ---
    const riskGate = evaluateRiskGate(regime, trade);
    if (riskGate.status === 'FAIL') blockingReasons.push(...riskGate.reasons);
    if (riskGate.status === 'WARN') warnings.push(...riskGate.reasons);

    // --- EXECUTION GATE ---
    const executionGate = evaluateExecutionGate(trade);
    if (executionGate.status === 'FAIL') blockingReasons.push(...executionGate.reasons);
    if (executionGate.status === 'WARN') warnings.push(...executionGate.reasons);

    const allPass = blockingReasons.length === 0;
    const overallConfidence = getWorstConfidence(
        macroGate.confidence,
        mesoGate.confidence,
        microGate.confidence,
        riskGate.confidence,
        executionGate.confidence
    );

    return {
        timestamp,
        allPass,
        gates: {
            macro: macroGate,
            meso: mesoGate,
            micro: microGate,
            risk: riskGate,
            execution: executionGate,
        },
        overallConfidence,
        blockingReasons,
        warnings,
    };
}

function evaluateMacroGate(regime: RegimeSnapshot, trade: TradeContext): GateResult {
    const reasons: string[] = [];
    let status: GateStatus = 'PASS';

    // Check if regime allows this direction
    const dangerousRegimes: RegimeType[] = ['LIQUIDITY_DRAIN', 'CREDIT_STRESS', 'DEFLATION'];
    const riskOnAssets = ['AUD', 'NZD', 'CAD', 'EM', 'stock', 'crypto'];
    const isRiskOn = riskOnAssets.some(a => trade.symbol.includes(a) || trade.assetClass === a);

    if (dangerousRegimes.includes(regime.regime) && isRiskOn && trade.direction === 'LONG') {
        status = 'FAIL';
        reasons.push(`Regime ${regime.regime} não permite LONG em ${trade.assetClass}`);
    }

    // Check dominant drivers
    if (regime.axes.L.direction === '↓↓') {
        status = 'FAIL';
        reasons.push('L↓↓ (Liquidity Drain) - não adicionar posições');
    }

    if (regime.axes.C.direction === '↓↓') {
        status = 'FAIL';
        reasons.push('C↓↓ (Credit Stress) - risk-off obrigatório');
    }

    // Confidence check
    if (regime.regimeConfidence === 'UNAVAILABLE' || regime.regimeConfidence === 'SUSPECT') {
        if (status === 'PASS') status = 'WARN';
        reasons.push('Regime confidence baixa - proceder com cautela');
    }

    if (reasons.length === 0) {
        reasons.push(`Regime ${regime.regime} compatível com ${trade.direction} ${trade.assetClass}`);
    }

    return {
        gate: 'MACRO',
        status,
        reasons,
        inputs: { regime: regime.regime, regimeConfidence: regime.regimeConfidence },
        confidence: regime.regimeConfidence,
    };
}

function evaluateMesoGate(regime: RegimeSnapshot, trade: TradeContext): GateResult {
    const reasons: string[] = [];
    let status: GateStatus = 'PASS';

    // Check prohibitions
    for (const prohibition of regime.mesoProhibitions) {
        const lower = prohibition.toLowerCase();

        if (lower.includes('não') || lower.includes('not')) {
            if (lower.includes('risk') && trade.assetClass !== 'forex') {
                if (trade.direction === 'LONG') {
                    status = 'WARN';
                    reasons.push(`Proibição ativa: ${prohibition}`);
                }
            }
            if (lower.includes('usd') && trade.symbol.includes('USD')) {
                if ((lower.includes('short') && trade.direction === 'SHORT') ||
                    (lower.includes('long') && trade.direction === 'LONG')) {
                    status = 'WARN';
                    reasons.push(`Proibição ativa: ${prohibition}`);
                }
            }
        }
    }

    // Check if aligned with tilts (bonus, not blocking)
    const alignedTilt = regime.mesoTilts.find(t =>
        trade.symbol.includes(t.asset.split(' ')[0]) ||
        t.asset.toLowerCase().includes(trade.assetClass)
    );

    if (alignedTilt) {
        reasons.push(`Alinhado com tilt: ${alignedTilt.asset} (${alignedTilt.rationale})`);
    }

    if (reasons.length === 0) {
        reasons.push('Nenhuma proibição meso ativa');
    }

    return {
        gate: 'MESO',
        status,
        reasons,
        inputs: { tilts: regime.mesoTilts.length, prohibitions: regime.mesoProhibitions.length },
        confidence: 'PARTIAL',
    };
}

function evaluateMicroGate(trade: TradeContext): GateResult {
    const reasons: string[] = [];
    let status: GateStatus = 'PASS';

    // Signal quality
    if (trade.signal === 'WAIT') {
        status = 'FAIL';
        reasons.push('Signal is WAIT - no trade');
    }

    // R:R check
    if (trade.entryPrice && trade.stopPrice && trade.targetPrice) {
        const risk = Math.abs(trade.entryPrice - trade.stopPrice);
        const reward = Math.abs(trade.targetPrice - trade.entryPrice);
        const rr = risk > 0 ? reward / risk : 0;

        if (rr < 2.0) {
            status = 'FAIL';
            reasons.push(`R:R ${rr.toFixed(2)} < 2.0 mínimo`);
        } else {
            reasons.push(`R:R ${rr.toFixed(2)} ✓`);
        }
    }

    // Quality check
    if (trade.quality?.status === 'SUSPECT' || trade.quality?.status === 'STALE') {
        status = 'FAIL';
        reasons.push(`Data quality ${trade.quality.status}`);
    }

    // Liquidity check
    if (trade.liquidityScore != null && trade.liquidityScore < 40) {
        status = 'FAIL';
        reasons.push(`Liquidity score ${trade.liquidityScore} < 40`);
    }

    // Score check
    if (trade.score < 50) {
        if (status === 'PASS') status = 'WARN';
        reasons.push(`Score ${trade.score} abaixo de 50`);
    }

    if (reasons.length === 0) {
        reasons.push('Micro criteria OK');
    }

    return {
        gate: 'MICRO',
        status,
        reasons,
        inputs: { score: trade.score, signal: trade.signal, quality: trade.quality?.status },
        confidence: trade.quality?.status === 'OK' ? 'OK' : 'PARTIAL',
    };
}

function evaluateRiskGate(regime: RegimeSnapshot, trade: TradeContext): GateResult {
    const reasons: string[] = [];
    let status: GateStatus = 'PASS';

    // Per-trade risk
    if (trade.accountRiskPercent != null && trade.accountRiskPercent > 2) {
        status = 'FAIL';
        reasons.push(`Risk ${trade.accountRiskPercent.toFixed(1)}% > 2% máximo`);
    }

    // Total open risk
    if (trade.totalOpenRiskPercent != null && trade.totalOpenRiskPercent > 5) {
        status = 'FAIL';
        reasons.push(`Total open risk ${trade.totalOpenRiskPercent.toFixed(1)}% > 5% máximo`);
    }

    // Correlated exposure
    if (trade.correlatedExposure != null && trade.correlatedExposure > 3) {
        if (status === 'PASS') status = 'WARN';
        reasons.push(`Correlated exposure ${trade.correlatedExposure.toFixed(1)}% > 3%`);
    }

    // Vol-adjusted sizing
    const vPercentile = regime.axes.V.inputs['vixPercentile'];
    if (typeof vPercentile === 'number' && vPercentile >= 80) {
        if (status === 'PASS') status = 'WARN';
        reasons.push(`V ${vPercentile}th percentile - sizing deve ser 50%`);
    }

    if (reasons.length === 0) {
        reasons.push('Risk limits OK');
    }

    return {
        gate: 'RISK',
        status,
        reasons,
        inputs: {
            accountRisk: trade.accountRiskPercent,
            totalRisk: trade.totalOpenRiskPercent,
            vPercentile,
        },
        confidence: 'OK',
    };
}

function evaluateExecutionGate(trade: TradeContext): GateResult {
    const reasons: string[] = [];
    let status: GateStatus = 'PASS';

    // Trading hours (UTC)
    const hour = trade.currentHour ?? new Date().getUTCHours();
    const goodHours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16]; // London + NY overlap
    const badHours = [21, 22, 23, 0, 1, 2, 3]; // Rollover + low liquidity

    if (badHours.includes(hour)) {
        if (status === 'PASS') status = 'WARN';
        reasons.push(`Horário ${hour}:00 UTC - spread elevado/rollover`);
    } else if (goodHours.includes(hour)) {
        reasons.push(`Horário ${hour}:00 UTC ✓ (London/NY)`);
    }

    // News blackout
    if (trade.hasUpcomingNews) {
        if (status === 'PASS') status = 'WARN';
        reasons.push('News de alto impacto próximo - aguardar');
    }

    // Cost vs target
    if (trade.spreadCost != null && trade.targetPrice != null && trade.entryPrice != null) {
        const targetMove = Math.abs(trade.targetPrice - trade.entryPrice);
        const costRatio = trade.spreadCost / targetMove;

        if (costRatio > 0.1) {
            status = 'FAIL';
            reasons.push(`Spread cost ${(costRatio * 100).toFixed(1)}% > 10% do target`);
        } else {
            reasons.push(`Spread cost ${(costRatio * 100).toFixed(1)}% do target ✓`);
        }
    }

    if (reasons.length === 0) {
        reasons.push('Execution conditions OK');
    }

    return {
        gate: 'EXECUTION',
        status,
        reasons,
        inputs: { hour, hasNews: trade.hasUpcomingNews, spreadCost: trade.spreadCost },
        confidence: 'OK',
    };
}

// =============================================================================
// EXPORTS FOR TESTING
// =============================================================================

export const __test__ = {
    scoreToDirection,
    clamp,
    zscore,
    getWorstConfidence,
    calculateGrowthAxis,
    calculateInflationAxis,
    calculateLiquidityAxis,
    calculateCreditAxis,
    calculateDollarAxis,
    calculateVolatilityAxis,
    classifyRegime,
};
