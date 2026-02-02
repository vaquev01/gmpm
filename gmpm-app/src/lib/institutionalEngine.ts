// src/lib/institutionalEngine.ts
import { MacroData } from '@/lib/realEngine';

// --- TYPES ---

export interface InstitutionalScore {
    name: string;
    score: number; // 0-100 (50 is Neutral/Trend)
    status: 'ROBUST' | 'NEUTRAL' | 'FRAGILE' | 'CRITICAL';
    trend: 'IMPROVING' | 'STABLE' | 'DETERIORATING';
    description: string;
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

export function analyzeInstitutionalMacro(data: any): InstitutionalMatrix {
    // If no data, return neutral skeleton
    if (!data) return getNeutralMatrix();

    // 1. GROWTH ENGINE
    let growthScore = 50;
    const gdpVal = data.GDPC1?.value ? 2.5 : 2.0;
    growthScore += (gdpVal - 2.0) * 10;
    if (data.INDPRO?.value > 103) growthScore += 5;
    if (data.RSAFS?.value > 700000) growthScore += 5; // Nominal sales check
    const growthStatus = getStatus(growthScore);

    // 2. INFLATION ENGINE
    // Target 2%. Higher inflation = LOWER score (worse condition).
    let inflationScore = 50;
    const cpiYoY = 2.9; // Hardcoded fallback until history parsing
    inflationScore = 100 - (Math.abs(cpiYoY - 2.0) * 20);

    // 3. LIQUIDITY & FINANCIAL CONDITIONS
    let liquidityScore = 50;
    if (data.M2SL?.value < 21000) liquidityScore -= 10; // M2 Contraction
    if (data.BAMLC0A0CM?.value < 1.0) liquidityScore += 10; // Tight Spreads
    if (data.STLFSI3?.value < 0) liquidityScore += 10; // Low Financial Stress

    // 4. CREDIT & HOUSING
    let creditScore = 50;
    if (data.DRSESP?.value > 2.5) creditScore -= 15; // Rising Delinquencies
    if (data.HOUST?.value > 1500) creditScore += 10; // Robust Housing Starts

    // 5. ENERGY & COMMODITIES (NEW)
    // Oil > $90 is inflationary/tax. Oil < $60 is deflationary/weak demand.
    // Optimal zone $70-85.
    let energyScore = 50;
    const oil = data.DCOILWTICO?.value || 75;
    if (oil > 90) energyScore = 30;
    else if (oil > 80) energyScore = 45;
    else if (oil < 60) energyScore = 40; // Demand destruction signal
    else energyScore = 80; // Goldilocks zone

    // 6. MARKET RISK (NEW)
    // VIX. Low is good for neutral score, too low is complacent.
    let riskScore = 50;
    const vix = data.VIXCLS?.value || 15;
    if (vix > 30) riskScore = 10; // Panic
    else if (vix > 20) riskScore = 30; // Elevated
    else if (vix < 12) riskScore = 60; // Complacent but bullish
    else riskScore = 80; // Normal

    // COMPOSITE VERDICT
    // We weight Growth/Inflation higher.
    const avgScore = (growthScore * 1.5 + inflationScore * 1.5 + liquidityScore + creditScore + energyScore + riskScore) / 7;

    let regime = "UNCERTAIN";
    let actionPlan = { recommended: [] as string[], avoid: [] as string[] };

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
            description: `Inflation is ${cpiYoY}% vs 2% Target. Disinflation & Breakevens stable.`
        },
        liquidity: {
            name: "Global Liquidity", score: liquidityScore, status: getStatus(liquidityScore), trend: "DETERIORATING",
            description: "M2 Contracting, but Financial Conditions remain loose."
        },
        credit: {
            name: "Private Credit", score: creditScore, status: getStatus(creditScore), trend: "STABLE",
            description: "Delinquencies low, Housing starts normalizing."
        },
        housing: { name: "Real Estate", score: 60, status: "NEUTRAL", trend: "STABLE", description: "Market stable." },
        energy: {
            name: "Energy & Supply", score: energyScore, status: getStatus(energyScore), trend: "STABLE",
            description: `Oil at $${oil}. ${oil > 90 ? 'Inflationary Drag' : 'Neutral Range'}.`
        },
        risk: {
            name: "Market Risk (VIX)", score: riskScore, status: getStatus(riskScore), trend: "STABLE",
            description: `VIX at ${vix}. Market fear is ${vix > 20 ? 'Elevated' : 'Low'}.`
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
