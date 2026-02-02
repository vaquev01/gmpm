// src/lib/institutionalEngine.ts

// --- TYPES ---

export interface InstitutionalScore {
    name: string;
    score: number; // 0-100 (50 is Neutral/Trend)
    status: 'ROBUST' | 'NEUTRAL' | 'FRAGILE' | 'CRITICAL';
    trend: 'IMPROVING' | 'STABLE' | 'DETERIORATING';
    description: string;
}

type FredSeriesLike = { value?: unknown };
type FredPayload = Record<string, FredSeriesLike | undefined>;
type MacroSummary = {
    gdp?: { trend?: unknown };
    inflation?: { cpiYoY?: unknown };
};

function asRecord(v: unknown): Record<string, unknown> {
    return (typeof v === 'object' && v !== null) ? (v as Record<string, unknown>) : {};
}

function getSeriesValue(payload: FredPayload, seriesId: string): number | null {
    const s = payload[seriesId];
    if (!s || typeof s !== 'object') return null;
    const raw = (s as FredSeriesLike).value;
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
}

export interface InstitutionalMatrix {
    growth: InstitutionalScore;
    inflation: InstitutionalScore;
    liquidity: InstitutionalScore;
    credit: InstitutionalScore;
    housing: InstitutionalScore;
    energy: InstitutionalScore; // NEW
    risk: InstitutionalScore;   // NEW
    overall: {
        score: number;
        regime: string; // e.g., "DISINFLATIONARY GROWTH"
        verdict: string;
        actionPlan: { recommended: string[]; avoid: string[] }; // NEW
    };
}

// --- LOGIC ---

export function analyzeInstitutionalMacro(data: unknown): InstitutionalMatrix {
    // If no data, return neutral skeleton
    if (!data) return getNeutralMatrix();

    const input = asRecord(data);
    const dataObj = input.data;
    const fredDataRaw = (typeof dataObj === 'object' && dataObj !== null) ? dataObj : data;
    const fredData = asRecord(fredDataRaw) as unknown as FredPayload;

    const summaryObj = input.summary;
    const summary = (typeof summaryObj === 'object' && summaryObj !== null) ? (summaryObj as MacroSummary) : null;

    // 1. GROWTH ENGINE
    let growthScore = 50;
    if (summary?.gdp?.trend === 'EXPANDING') growthScore = 70;
    else if (summary?.gdp?.trend === 'SLOWING') growthScore = 45;

    if ((getSeriesValue(fredData, 'INDPRO') ?? -1e9) > 103) growthScore += 5;
    if ((getSeriesValue(fredData, 'RSAFS') ?? -1e9) > 700000) growthScore += 5; // Nominal sales check
    const growthStatus = getStatus(growthScore);

    // 2. INFLATION ENGINE
    // Target 2%. Higher inflation = LOWER score (worse condition).
    let inflationScore = 50;
    const cpiYoY = Number(summary?.inflation?.cpiYoY);
    if (Number.isFinite(cpiYoY)) {
        inflationScore = 100 - (Math.abs(cpiYoY - 2.0) * 20);
    }

    // 3. LIQUIDITY & FINANCIAL CONDITIONS
    let liquidityScore = 50;
    if ((getSeriesValue(fredData, 'M2SL') ?? 1e9) < 21000) liquidityScore -= 10; // M2 Contraction
    if ((getSeriesValue(fredData, 'BAMLC0A0CM') ?? 1e9) < 1.0) liquidityScore += 10; // Tight Spreads
    if ((getSeriesValue(fredData, 'STLFSI3') ?? 1e9) < 0) liquidityScore += 10; // Low Financial Stress

    // 4. CREDIT & HOUSING
    let creditScore = 50;
    if ((getSeriesValue(fredData, 'DRSESP') ?? -1e9) > 2.5) creditScore -= 15; // Rising Delinquencies
    if ((getSeriesValue(fredData, 'HOUST') ?? -1e9) > 1500) creditScore += 10; // Robust Housing Starts

    // 5. ENERGY & COMMODITIES (NEW)
    // Oil > $90 is inflationary/tax. Oil < $60 is deflationary/weak demand.
    // Optimal zone $70-85.
    let energyScore = 50;
    const oilValue = getSeriesValue(fredData, 'DCOILWTICO');
    const oil = oilValue !== null ? oilValue : NaN;
    if (oilValue === null) energyScore = 50;
    else if (oil > 90) energyScore = 30;
    else if (oil > 80) energyScore = 45;
    else if (oil < 60) energyScore = 40; // Demand destruction signal
    else energyScore = 80; // Goldilocks zone

    // 6. MARKET RISK (NEW)
    // VIX. Low is good for neutral score, too low is complacent.
    let riskScore = 50;
    const vixValue = getSeriesValue(fredData, 'VIXCLS');
    const vix = vixValue !== null ? vixValue : NaN;
    if (vixValue === null) riskScore = 50;
    else if (vix > 30) riskScore = 10; // Panic
    else if (vix > 20) riskScore = 30; // Elevated
    else if (vix < 12) riskScore = 60; // Complacent but bullish
    else riskScore = 80; // Normal

    // COMPOSITE VERDICT
    // We weight Growth/Inflation higher.
    const avgScore = (growthScore * 1.5 + inflationScore * 1.5 + liquidityScore + creditScore + energyScore + riskScore) / 7;

    let regime = "UNCERTAIN";
    const actionPlan = { recommended: [] as string[], avoid: [] as string[] };

    if (avgScore > 65) {
        regime = "ROBUST EXPANSION";
        actionPlan.recommended = ["Cyclical Stocks (Industrials, Energy)", "Small Caps (IWM)", "Short Duration Credit"];
        actionPlan.avoid = ["Long Duration Treasuries (TLT)", "Utilities", "Cash"];
    }
    else if (growthScore > 60 && inflationScore > 60) {
        regime = "GOLDILOCKS";
        actionPlan.recommended = ["Growth Equities (QQQ)", "Emerging Markets", "High Yield Credit"];
        actionPlan.avoid = ["Consumer Staples", "Gold", "Volatility (VIX)"];
    }
    else if (growthScore > 60 && inflationScore < 40) {
        regime = "REFLATIONARY";
        actionPlan.recommended = ["Commodities", "Value Stocks", "TIPS"];
        actionPlan.avoid = ["Nominal Bonds", "Tech Growth"];
    }
    else if (growthScore < 40 && inflationScore < 40) {
        regime = "STAGFLATIONARY";
        actionPlan.recommended = ["Energy/Commodities", "Gold", "Short Equities"];
        actionPlan.avoid = ["Consumer Discretionary", "Tech", "Long Duration Bonds"];
    }
    else if (growthScore < 40 && inflationScore > 60) {
        regime = "RECESSIONARY";
        actionPlan.recommended = ["Long Treasuries (TLT)", "Gold", "Healthcare/Utilities"];
        actionPlan.avoid = ["Cyclicals", "Small Caps", "High Yield"];
    }
    else {
        regime = "TRANSITIONAL (Mid-Cycle)";
        actionPlan.recommended = ["Quality Factors (Qual)", "Dividend Growers", "Short Term Bills"];
        actionPlan.avoid = ["Speculative Tech", "Deep Junk Credit"];
    }

    return {
        growth: {
            name: "Structural Growth", score: growthScore, status: growthStatus, trend: "STABLE",
            description: `Real Activity is ${growthStatus.toLowerCase()}. Ind Production & Retail Sales supporting.`
        },
        inflation: {
            name: "Price Stability", score: inflationScore, status: getStatus(inflationScore), trend: "IMPROVING",
            description: Number.isFinite(cpiYoY)
                ? `Inflation is ${cpiYoY}% vs 2% Target. Disinflation & Breakevens stable.`
                : "Inflation data unavailable."
        },
        liquidity: {
            name: "Global Liquidity", score: liquidityScore, status: getStatus(liquidityScore), trend: "DETERIORATING",
            description: "M2 Contracting, but Financial Conditions remain loose."
        },
        credit: {
            name: "Private Credit", score: creditScore, status: getStatus(creditScore), trend: "STABLE",
            description: "Delinquencies low, Housing starts normalizing."
        },
        housing: {
            name: "Real Estate",
            score: (getSeriesValue(fredData, 'HOUST') ?? -1e9) > 1500 ? 70 : 55,
            status: getStatus((getSeriesValue(fredData, 'HOUST') ?? -1e9) > 1500 ? 70 : 55),
            trend: "STABLE",
            description: "Housing starts proxy for activity."
        },
        energy: {
            name: "Energy & Supply", score: energyScore, status: getStatus(energyScore), trend: "STABLE",
            description: oilValue !== null
                ? `Oil at $${oil}. ${oil > 90 ? 'Inflationary Drag' : 'Neutral Range'}.`
                : 'Oil data unavailable.'
        },
        risk: {
            name: "Market Risk (VIX)", score: riskScore, status: getStatus(riskScore), trend: "STABLE",
            description: vixValue !== null
                ? `VIX at ${vix}. Market fear is ${vix > 20 ? 'Elevated' : 'Low'}.`
                : 'VIX data unavailable.'
        },
        overall: {
            score: avgScore,
            regime,
            verdict: `Institutional models detect ${regime}. Energy ${oil > 90 ? 'Headwind' : 'Stable'}. Allocation: ${growthScore > 50 ? 'Overweight Equities' : 'Defense'}.`,
            actionPlan
        }
    };
}

function getStatus(score: number): 'ROBUST' | 'NEUTRAL' | 'FRAGILE' | 'CRITICAL' {
    if (score >= 70) return 'ROBUST';
    if (score >= 45) return 'NEUTRAL';
    if (score >= 25) return 'FRAGILE';
    return 'CRITICAL';
}

function getNeutralMatrix(): InstitutionalMatrix {
    const neutralStart = { name: "Loading", score: 50, status: "NEUTRAL" as const, trend: "STABLE" as const, description: "Initializing..." };
    return {
        growth: neutralStart, inflation: neutralStart, liquidity: neutralStart, credit: neutralStart,
        housing: neutralStart, energy: neutralStart, risk: neutralStart,

        overall: {
            score: 50,
            regime: "ANALYZING",
            verdict: "System Initializing...",
            actionPlan: { recommended: [], avoid: [] }
        }
    };
}
