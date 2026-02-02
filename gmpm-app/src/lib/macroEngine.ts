// src/lib/macroEngine.ts
// Engine de dados macroeconômicos usando fontes públicas gratuitas

import { MacroData } from './realEngine';

// ===== TIPOS DO PRD =====
export interface MacroIndicators {
    // Growth
    gdp: { value: number; trend: 'EXPANDING' | 'SLOWING' | 'CONTRACTING'; updated: string };

    // Inflation
    cpi: { value: number; trend: 'RISING' | 'STABLE' | 'FALLING'; updated: string };
    pce: { value: number; trend: 'RISING' | 'STABLE' | 'FALLING'; updated: string };

    // Employment
    unemployment: { value: number; trend: 'IMPROVING' | 'STABLE' | 'DETERIORATING'; updated: string };
    nfp: { value: number; trend: 'STRONG' | 'MODERATE' | 'WEAK'; updated: string };

    // Monetary
    fedFunds: { value: number; bias: 'HAWKISH' | 'NEUTRAL' | 'DOVISH'; updated: string };

    // Credit
    creditSpread: { value: number; condition: 'TIGHT' | 'NORMAL' | 'WIDE'; updated: string };

    // Sentiment
    consumerConfidence: { value: number; trend: 'OPTIMISTIC' | 'NEUTRAL' | 'PESSIMISTIC'; updated: string };
}

export type ScenarioType = 'DISINFLATION' | 'REACCELERATION' | 'RISK_OFF' | 'CARRY' | 'SHOCK' | 'GOLDILOCKS' | 'STAGFLATION';

export interface ScenarioAnalysis {
    current: ScenarioType;
    probability: number;
    description: string;
    sequence: ScenarioType[];
    nextPrediction: ScenarioType;
    nextProbability: number;
}

export interface Thesis {
    statement: string;
    confidence: number;
    validUntil: string;
    invalidationConditions: string[];
    keyRisks: string[];
    tradeBias: 'LONG_BIAS' | 'SHORT_BIAS' | 'NEUTRAL';
}

// ===== DADOS MACRO ESTIMADOS (baseado em dados públicos disponíveis) =====
// Nota: Em produção, estes seriam atualizados via scraping ou FRED API
const LATEST_MACRO: MacroIndicators = {
    gdp: { value: 2.8, trend: 'EXPANDING', updated: '2026-01-31' },
    cpi: { value: 2.9, trend: 'STABLE', updated: '2026-01-31' },
    pce: { value: 2.6, trend: 'STABLE', updated: '2026-01-31' },
    unemployment: { value: 4.1, trend: 'STABLE', updated: '2026-01-31' },
    nfp: { value: 256000, trend: 'STRONG', updated: '2026-01-31' },
    fedFunds: { value: 4.5, bias: 'HAWKISH', updated: '2026-01-31' },
    creditSpread: { value: 1.2, condition: 'NORMAL', updated: '2026-01-31' },
    consumerConfidence: { value: 104, trend: 'NEUTRAL', updated: '2026-01-31' },
};

// ===== SCENARIO ENGINE =====
export function determineScenario(macro: MacroIndicators, vix: number, fearGreed: number): ScenarioAnalysis {
    let scenario: ScenarioType = 'GOLDILOCKS';
    let probability = 60;
    let description = '';

    // DISINFLATION: Inflação caindo + crescimento ok
    if (macro.cpi.trend === 'FALLING' && macro.gdp.trend === 'EXPANDING') {
        scenario = 'DISINFLATION';
        probability = 75;
        description = 'Inflação cedendo com crescimento resiliente. Ambiente favorável para risk assets.';
    }
    // REACCELERATION: Inflação persistente + crescimento forte
    else if (macro.cpi.trend === 'RISING' && macro.gdp.trend === 'EXPANDING') {
        scenario = 'REACCELERATION';
        probability = 70;
        description = 'Inflação reacelerando. Fed pode manter postura hawkish. Pressão em duration.';
    }
    // RISK_OFF: VIX alto + Fear & Greed baixo
    else if (vix > 25 || fearGreed < 30) {
        scenario = 'RISK_OFF';
        probability = 80;
        description = 'Flight to quality em curso. Favorecer JPY, CHF, Gold, Treasuries.';
    }
    // SHOCK: VIX muito alto + credit spreads widening
    else if (vix > 35 && macro.creditSpread.condition === 'WIDE') {
        scenario = 'SHOCK';
        probability = 85;
        description = 'Stress sistêmico detectado. Modo de preservação de capital.';
    }
    // CARRY: Diferencial de taxas favorável
    else if (macro.fedFunds.value > 4 && vix < 18) {
        scenario = 'CARRY';
        probability = 65;
        description = 'Carry trade favorável. Long risk com funding em moedas de baixo yield.';
    }
    // STAGFLATION: Inflação alta + crescimento fraco
    else if (macro.cpi.trend === 'RISING' && macro.gdp.trend === 'SLOWING') {
        scenario = 'STAGFLATION';
        probability = 70;
        description = 'Estagflação. Ambiente difícil. Favorecer commodities e inflation hedges.';
    }
    // GOLDILOCKS: Tudo equilibrado
    else if (macro.cpi.trend === 'STABLE' && macro.gdp.trend === 'EXPANDING' && vix < 20) {
        scenario = 'GOLDILOCKS';
        probability = 75;
        description = 'Goldilocks: baixa inflação, crescimento moderado, vol baixa. Risk on.';
    }

    // Sequência e previsão
    const sequenceMap: Record<ScenarioType, ScenarioType[]> = {
        GOLDILOCKS: ['GOLDILOCKS', 'DISINFLATION', 'CARRY'],
        DISINFLATION: ['DISINFLATION', 'GOLDILOCKS', 'CARRY'],
        REACCELERATION: ['REACCELERATION', 'RISK_OFF', 'STAGFLATION'],
        RISK_OFF: ['RISK_OFF', 'SHOCK', 'DISINFLATION'],
        CARRY: ['CARRY', 'GOLDILOCKS', 'RISK_OFF'],
        SHOCK: ['SHOCK', 'RISK_OFF', 'DISINFLATION'],
        STAGFLATION: ['STAGFLATION', 'SHOCK', 'RISK_OFF'],
    };

    const sequence = sequenceMap[scenario];
    const nextPrediction = sequence[1];
    const nextProbability = probability * 0.6;

    return {
        current: scenario,
        probability,
        description,
        sequence,
        nextPrediction,
        nextProbability,
    };
}

// ===== THESIS GENERATOR =====
export function generateThesis(
    scenario: ScenarioAnalysis,
    macro: MacroIndicators,
    vix: number,
    fearGreed: number
): Thesis {
    const theses: Record<ScenarioType, string> = {
        GOLDILOCKS: `Ambiente Goldilocks: inflação em ${macro.cpi.value}% (estável), crescimento em ${macro.gdp.value}%, VIX em ${vix}. Condições ideais para risk assets. USD neutro a fraco.`,
        DISINFLATION: `Desinflação em curso: CPI caindo para ${macro.cpi.value}%. Fed deve pivotar para neutro. Favorecer equities, EM, commodities. Short USD.`,
        REACCELERATION: `Reaceleração inflacionária: CPI em ${macro.cpi.value}% e subindo. Fed hawkish. Favorecer USD, short duration. Cautela com growth stocks.`,
        RISK_OFF: `Risk-off ativo: VIX em ${vix}, Fear & Greed em ${fearGreed}. Reduzir exposição a risco. Favorecer JPY, CHF, Gold, Treasuries de curto prazo.`,
        CARRY: `Carry trade favorável: Fed Funds em ${macro.fedFunds.value}% com vol baixa (VIX ${vix}). Long high-yield vs low-yield. Favorecer BRL, MXN, TRY vs JPY, CHF.`,
        SHOCK: `ALERTA: Stress sistêmico. VIX em ${vix}. Preservar capital é prioridade. Apenas hedges e posições defensivas.`,
        STAGFLATION: `Estagflação: Crescimento em ${macro.gdp.value}% (desacelerando) + inflação em ${macro.cpi.value}% (persistente). Favorecer commodities, Gold, TIPS.`,
    };

    const invalidations: Record<ScenarioType, string[]> = {
        GOLDILOCKS: [`VIX > 25 por 3 dias`, `CPI > ${macro.cpi.value + 0.5}%`, `Unemployment > ${macro.unemployment.value + 0.5}%`],
        DISINFLATION: [`CPI para de cair`, `GDP < 2%`, `Choque externo`],
        REACCELERATION: [`CPI começa a cair`, `Fed pivot dovish`, `Recessão técnica`],
        RISK_OFF: [`VIX < 18 por 5 dias`, `Fear & Greed > 50`, `Credit spreads tightening`],
        CARRY: [`VIX > 22`, `Carry trade unwind`, `BoJ intervém`],
        SHOCK: [`VIX volta para < 25`, `Fed intervém`, `Credit markets estabilizam`],
        STAGFLATION: [`CPI cai abaixo de 2.5%`, `GDP acelera`, `Produtividade sobe`],
    };

    const biasMap: Record<ScenarioType, 'LONG_BIAS' | 'SHORT_BIAS' | 'NEUTRAL'> = {
        GOLDILOCKS: 'LONG_BIAS',
        DISINFLATION: 'LONG_BIAS',
        REACCELERATION: 'NEUTRAL',
        RISK_OFF: 'SHORT_BIAS',
        CARRY: 'LONG_BIAS',
        SHOCK: 'SHORT_BIAS',
        STAGFLATION: 'NEUTRAL',
    };

    const validHours = scenario.current === 'SHOCK' ? 6 : scenario.current === 'RISK_OFF' ? 12 : 24;
    const validUntil = new Date(Date.now() + validHours * 60 * 60 * 1000).toISOString();

    return {
        statement: theses[scenario.current],
        confidence: scenario.probability,
        validUntil,
        invalidationConditions: invalidations[scenario.current],
        keyRisks: [`Cenário pode mudar para ${scenario.nextPrediction}`, 'Evento não antecipado'],
        tradeBias: biasMap[scenario.current],
    };
}

// ===== GET MACRO DATA =====
export function getMacroIndicators(): MacroIndicators {
    return LATEST_MACRO;
}

// ===== UPDATE MACRO FROM VIX/FEAR&GREED =====
export function enrichMacroData(baseMacro: MacroData): MacroData & { indicators: MacroIndicators; scenario: ScenarioAnalysis; thesis: Thesis } {
    const indicators = getMacroIndicators();
    const scenario = determineScenario(indicators, baseMacro.vix, baseMacro.fearGreed?.value || 50);
    const thesis = generateThesis(scenario, indicators, baseMacro.vix, baseMacro.fearGreed?.value || 50);

    return {
        ...baseMacro,
        indicators,
        scenario,
        thesis,
    };
}
