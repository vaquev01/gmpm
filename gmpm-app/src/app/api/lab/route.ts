import { NextResponse } from 'next/server';

type MesoAllowedInstrument = {
    symbol: string;
    direction: 'LONG' | 'SHORT';
    class: string;
    reason: string;
    score: number;
};

type MesoApiResponse = {
    success?: boolean;
    microInputs?: {
        allowedInstruments: MesoAllowedInstrument[];
        prohibitedInstruments: Array<{ symbol: string; reason: string }>;
    };
};

type LabModuleStatus = 'PASS' | 'WARN' | 'FAIL';

type LabModule = {
    key: 'MESO' | 'REGIME' | 'MTF' | 'MICRO' | 'GUARDRAILS';
    status: LabModuleStatus;
    score: number; // 0-100
    title: string;
    summary: string;
};

type LabDecision = {
    action: 'EXECUTE';
    timing: 'NOW' | 'SOON' | 'LATER';
    score: number; // 0-100
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    risk: 'NORMAL' | 'ELEVATED';
    reason: string;
};

type LabLevels = {
    entry: number | null;
    stopLoss: number | null;
    takeProfits: number[];
    timeframe: string | null;
    setupType: string | null;
    setupConfidence: string | null;
};

type LabMetrics = {
    rr: number | null;
    rrMin: number | null;
    evR: number | null;
};

type LabReport = {
    symbol: string;
    timestamp: string;
    meso: {
        instrument: MesoAllowedInstrument | null;
        prohibitedReason: string | null;
    };
    regime: unknown | null;
    mtf: unknown | null;
    micro: unknown | null;
    summary: {
        direction: 'LONG' | 'SHORT' | null;
        microAction: 'EXECUTE' | 'WAIT' | 'AVOID' | null;
        microReason: string | null;
        evR: number | null;
        rrMin: number | null;
        rr: number | null;
        mtfBias: 'LONG' | 'SHORT' | 'NEUTRAL' | null;
        mtfScore: number | null;
        regime: string | null;
    };
    decision: LabDecision;
    modules: LabModule[];
    levels: LabLevels;
    metrics: LabMetrics;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function statusFromScore(score: number): LabModuleStatus {
    if (score >= 70) return 'PASS';
    if (score >= 45) return 'WARN';
    return 'FAIL';
}

function moduleScoreForStatus(status: LabModuleStatus): number {
    if (status === 'PASS') return 85;
    if (status === 'WARN') return 60;
    return 35;
}

async function fetchJson(url: string): Promise<unknown> {
    const res = await fetch(url, {
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
        throw new Error(`Request failed ${res.status} for ${url}`);
    }

    return (await res.json()) as unknown;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const symbol = searchParams.get('symbol');

        if (!symbol) {
            return NextResponse.json({ success: false, error: 'Missing symbol' }, { status: 400 });
        }

        const origin = new URL(request.url).origin;
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || origin;

        const mesoUrl = `${baseUrl}/api/meso`;
        const mesoRaw = await fetchJson(mesoUrl);
        const meso = (isRecord(mesoRaw) ? (mesoRaw as MesoApiResponse) : {}) as MesoApiResponse;

        const allowed = meso?.success ? (meso.microInputs?.allowedInstruments || []) : [];
        const prohibited = meso?.success ? (meso.microInputs?.prohibitedInstruments || []) : [];

        const instrument = allowed.find((i) => i.symbol === symbol) || null;
        const prohibitedReason = prohibited.find((p) => p.symbol === symbol)?.reason || null;

        const direction = instrument?.direction || null;

        const [regimeRes, mtfRes, microRes] = await Promise.all([
            fetchJson(`${baseUrl}/api/regime`),
            fetchJson(`${baseUrl}/api/mtf?symbol=${encodeURIComponent(symbol)}`),
            fetchJson(
                `${baseUrl}/api/micro?symbol=${encodeURIComponent(symbol)}${direction ? `&direction=${encodeURIComponent(direction)}` : ''}`
            ),
        ]);

        const regime = isRecord(regimeRes) ? (regimeRes['snapshot'] ?? null) : null;
        const mtf = isRecord(mtfRes) ? (mtfRes['data'] ?? null) : null;

        let micro: unknown | null = null;
        let microAction: 'EXECUTE' | 'WAIT' | 'AVOID' | null = null;
        let microReason: string | null = null;
        let evR: number | null = null;
        let rrMin: number | null = null;
        let rr: number | null = null;
        let entry: number | null = null;
        let stopLoss: number | null = null;
        const takeProfits: number[] = [];
        let setupType: string | null = null;
        let setupTimeframe: string | null = null;
        let setupConfidence: string | null = null;

        if (isRecord(microRes)) {
            const analyses = microRes['analyses'];
            if (Array.isArray(analyses) && analyses.length > 0) {
                micro = analyses[0] as unknown;

                if (isRecord(micro)) {
                    const rec = micro['recommendation'];
                    if (isRecord(rec)) {
                        const action = rec['action'];
                        const reason = rec['reason'];
                        microAction = (action === 'EXECUTE' || action === 'WAIT' || action === 'AVOID') ? action : null;
                        microReason = typeof reason === 'string' ? reason : null;

                        const metrics = rec['metrics'];
                        if (isRecord(metrics)) {
                            const ev = metrics['evR'];
                            const rrMinRaw = metrics['rrMin'];
                            evR = typeof ev === 'number' && Number.isFinite(ev) ? ev : null;
                            rrMin = typeof rrMinRaw === 'number' && Number.isFinite(rrMinRaw) ? rrMinRaw : null;
                        }
                    }

                    const bestSetup = (isRecord(micro['recommendation']) && isRecord((micro['recommendation'] as Record<string, unknown>)['bestSetup']))
                        ? ((micro['recommendation'] as Record<string, unknown>)['bestSetup'] as Record<string, unknown>)
                        : null;
                    if (bestSetup) {
                        const rrRaw = bestSetup['riskReward'];
                        rr = typeof rrRaw === 'number' && Number.isFinite(rrRaw) ? rrRaw : null;

                        const entryRaw = bestSetup['entry'];
                        const slRaw = bestSetup['stopLoss'];
                        const tp1Raw = bestSetup['takeProfit1'];
                        const tp2Raw = bestSetup['takeProfit2'];
                        const tp3Raw = bestSetup['takeProfit3'];
                        entry = typeof entryRaw === 'number' && Number.isFinite(entryRaw) ? entryRaw : null;
                        stopLoss = typeof slRaw === 'number' && Number.isFinite(slRaw) ? slRaw : null;
                        if (typeof tp1Raw === 'number' && Number.isFinite(tp1Raw)) takeProfits.push(tp1Raw);
                        if (typeof tp2Raw === 'number' && Number.isFinite(tp2Raw)) takeProfits.push(tp2Raw);
                        if (typeof tp3Raw === 'number' && Number.isFinite(tp3Raw)) takeProfits.push(tp3Raw);

                        const typeRaw = bestSetup['type'];
                        const tfRaw = bestSetup['timeframe'];
                        const confRaw = bestSetup['confidence'];
                        setupType = typeof typeRaw === 'string' ? typeRaw : null;
                        setupTimeframe = typeof tfRaw === 'string' ? tfRaw : null;
                        setupConfidence = typeof confRaw === 'string' ? confRaw : null;
                    }
                }
            }
        }

        const mtfBias: 'LONG' | 'SHORT' | 'NEUTRAL' | null = (() => {
            if (!isRecord(mtf)) return null;
            const confluence = mtf['confluence'];
            if (!isRecord(confluence)) return null;
            const bias = confluence['bias'];
            return bias === 'LONG' || bias === 'SHORT' || bias === 'NEUTRAL' ? bias : null;
        })();

        const mtfScore: number | null = (() => {
            if (!isRecord(mtf)) return null;
            const confluence = mtf['confluence'];
            if (!isRecord(confluence)) return null;
            const score = confluence['score'];
            return typeof score === 'number' && Number.isFinite(score) ? clamp(score, 0, 100) : null;
        })();

        const regimeName: string | null = (() => {
            if (!isRecord(regime)) return null;
            const r = regime['regime'];
            return typeof r === 'string' ? r : null;
        })();

        const regimeAlertsCount: number = (() => {
            if (!isRecord(regime)) return 0;
            const alerts = regime['alerts'];
            return Array.isArray(alerts) ? alerts.length : 0;
        })();

        const regimeCritical: boolean = (() => {
            if (!isRecord(regime)) return false;
            const alerts = regime['alerts'];
            if (!Array.isArray(alerts)) return false;
            return alerts.some((a) => isRecord(a) && a['level'] === 'CRITICAL');
        })();

        const mesoScore = instrument?.score != null && Number.isFinite(instrument.score) ? clamp(instrument.score, 0, 100) : 0;

        const mtfModuleScore = mtfScore ?? 50;
        const mtfAlignmentPenalty = (direction && mtfBias && mtfBias !== 'NEUTRAL' && mtfBias !== direction) ? 12 : 0;
        const mtfScoreAdj = clamp(mtfModuleScore - mtfAlignmentPenalty, 0, 100);

        const microBaseScore = microAction === 'EXECUTE' ? 88 : microAction === 'WAIT' ? 62 : microAction === 'AVOID' ? 38 : 50;
        const microEVBoost = evR == null ? 0 : clamp(evR * 20, -15, 15);
        const microRRBoost = (rr != null && rrMin != null && rrMin > 0)
            ? clamp(((rr / rrMin) - 1) * 25, -15, 15)
            : 0;
        const microScore = clamp(microBaseScore + microEVBoost + microRRBoost, 0, 100);

        const guardrailsStatus: LabModuleStatus = (() => {
            if (evR != null && evR < 0) return 'FAIL';
            if (rr != null && rrMin != null && rrMin > 0 && rr < rrMin) return 'WARN';
            if (microAction === 'AVOID') return 'WARN';
            return 'PASS';
        })();

        const mesoModule: LabModule = {
            key: 'MESO',
            status: instrument ? 'PASS' : 'FAIL',
            score: instrument ? 85 : 20,
            title: 'MESO',
            summary: instrument
                ? `${instrument.direction} ${instrument.class} (conviction ${Math.round(mesoScore)})`
                : (prohibitedReason ? `Not allowed: ${prohibitedReason}` : 'Not present in MESO universe'),
        };

        const regimeModule: LabModule = {
            key: 'REGIME',
            status: regimeCritical ? 'WARN' : (regimeAlertsCount > 0 ? 'WARN' : 'PASS'),
            score: regimeCritical ? 55 : (regimeAlertsCount > 0 ? 65 : 80),
            title: 'Macro Regime',
            summary: regimeName ? `${regimeName}${regimeAlertsCount > 0 ? ` (${regimeAlertsCount} alerts)` : ''}` : 'No regime data',
        };

        const mtfModule: LabModule = {
            key: 'MTF',
            status: statusFromScore(mtfScoreAdj),
            score: mtfScoreAdj,
            title: 'MTF Confluence',
            summary: `Bias ${mtfBias || '-'} | Score ${mtfScoreAdj.toFixed(0)}${mtfAlignmentPenalty > 0 ? ' (direction conflict)' : ''}`,
        };

        const microModule: LabModule = {
            key: 'MICRO',
            status: microAction === 'EXECUTE' ? 'PASS' : microAction === 'WAIT' ? 'WARN' : microAction === 'AVOID' ? 'FAIL' : 'WARN',
            score: microScore,
            title: 'Micro Setup',
            summary: microAction ? `${microAction}${microReason ? ` | ${microReason}` : ''}` : 'No micro analysis',
        };

        const guardrailsModule: LabModule = {
            key: 'GUARDRAILS',
            status: guardrailsStatus,
            score: moduleScoreForStatus(guardrailsStatus),
            title: 'Guardrails (EV/RR)',
            summary: `EV ${evR != null ? `${evR.toFixed(2)}R` : '-'} | RR ${rr != null ? rr.toFixed(2) : '-'} (min ${rrMin != null ? rrMin.toFixed(2) : '-'})`,
        };

        const modules: LabModule[] = [mesoModule, regimeModule, mtfModule, microModule, guardrailsModule];

        const totalScore = clamp(
            (mesoScore * 0.30) + (mtfScoreAdj * 0.25) + (microScore * 0.45),
            0,
            100
        );

        const risk: LabDecision['risk'] = (microAction === 'AVOID' || guardrailsStatus === 'FAIL' || mtfAlignmentPenalty > 0) ? 'ELEVATED' : 'NORMAL';
        const confidence: LabDecision['confidence'] = totalScore >= 80 ? 'HIGH' : totalScore >= 65 ? 'MEDIUM' : 'LOW';
        const timing: LabDecision['timing'] = (() => {
            if (!instrument) return 'LATER';
            if (microAction === 'EXECUTE' && totalScore >= 70) return 'NOW';
            if (microAction === 'WAIT' && totalScore >= 65) return 'SOON';
            if (totalScore >= 75) return 'SOON';
            return 'LATER';
        })();

        const decisionReason = `${timing} | score ${Math.round(totalScore)} | MESO ${Math.round(mesoScore)} / MTF ${Math.round(mtfScoreAdj)} / MICRO ${Math.round(microScore)}`;

        const report: LabReport = {
            symbol,
            timestamp: new Date().toISOString(),
            meso: {
                instrument,
                prohibitedReason,
            },
            regime,
            mtf,
            micro,
            summary: {
                direction,
                microAction,
                microReason,
                evR,
                rrMin,
                rr,
                mtfBias,
                mtfScore: mtfScoreAdj,
                regime: regimeName,
            },
            decision: {
                action: 'EXECUTE',
                timing,
                score: totalScore,
                confidence,
                risk,
                reason: decisionReason,
            },
            modules,
            levels: {
                entry,
                stopLoss,
                takeProfits,
                timeframe: setupTimeframe,
                setupType,
                setupConfidence,
            },
            metrics: {
                rr,
                rrMin,
                evR,
            },
        };

        return NextResponse.json({ success: true, report });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
