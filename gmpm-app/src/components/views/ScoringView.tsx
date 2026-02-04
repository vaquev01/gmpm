import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { RegimeSnapshot } from '@/lib/regimeEngine';

interface ScoringViewProps {
    symbol: string;
    direction?: 'LONG' | 'SHORT';
}

type MicroMetrics = {
    pWin: number;
    rrMin: number;
    evR: number;
    modelRisk: 'LOW' | 'MED' | 'HIGH';
};

type MicroAnalysisLite = {
    symbol: string;
    displaySymbol: string;
    price: number;
    technical?: {
        indicators?: { rsi?: number };
        levels?: { atr?: number };
        smc?: {
            orderBlocks?: unknown[];
            fvgs?: unknown[];
            liquidityPools?: unknown[];
        };
    };
    recommendation?: {
        action?: 'EXECUTE' | 'WAIT' | 'AVOID';
        metrics?: Partial<MicroMetrics>;
        bestSetup?: { riskReward?: number } | null;
    };
    scenarioAnalysis?: {
        status?: 'PRONTO' | 'DESENVOLVENDO' | 'CONTRA';
        timing?: 'AGORA' | 'AGUARDAR' | 'PERDIDO';
        entryQuality?: 'OTIMO' | 'BOM' | 'RUIM';
        technicalAlignment?: number;
    };
};

type MicroApiResponse = {
    success: boolean;
    analyses?: MicroAnalysisLite[];
};

type TFTrend = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

type MtfApiResponse = {
    success: boolean;
    data?: {
        timeframes: Record<string, { trend: TFTrend; strength: number }>;
        confluence: {
            score: number;
            bias: 'LONG' | 'SHORT' | 'NEUTRAL';
            aligned: boolean;
            description: string;
        };
    };
};

type RegimeApiResponse = {
    success: boolean;
    snapshot?: RegimeSnapshot;
};

export const ScoringView = ({ symbol, direction }: ScoringViewProps) => {
    const { scoreComponents } = useStore();

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [micro, setMicro] = useState<MicroAnalysisLite | null>(null);
    const [mtf, setMtf] = useState<MtfApiResponse['data'] | null>(null);
    const [regime, setRegime] = useState<RegimeSnapshot | null>(null);

    useEffect(() => {
        let alive = true;
        const run = async () => {
            try {
                setLoading(true);
                setError(null);
                const microUrl = direction
                    ? `/api/micro?symbol=${encodeURIComponent(symbol)}&direction=${encodeURIComponent(direction)}`
                    : `/api/micro?symbol=${encodeURIComponent(symbol)}`;
                const [microRes, mtfRes, regimeRes] = await Promise.all([
                    fetch(microUrl, { cache: 'no-store' }),
                    fetch(`/api/mtf?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' }),
                    fetch('/api/regime', { cache: 'no-store' }),
                ]);

                const microJson = (await microRes.json()) as MicroApiResponse;
                const mtfJson = (await mtfRes.json()) as MtfApiResponse;
                const regimeJson = (await regimeRes.json()) as RegimeApiResponse;
                if (!alive) return;

                setMicro(microJson?.success ? (microJson.analyses?.[0] || null) : null);
                setMtf(mtfJson?.success ? (mtfJson.data || null) : null);
                setRegime(regimeJson?.success ? (regimeJson.snapshot || null) : null);
            } catch (e) {
                if (!alive) return;
                setMicro(null);
                setMtf(null);
                setRegime(null);
                setError(e instanceof Error ? e.message : 'Failed to load lab scores');
            } finally {
                if (!alive) return;
                setLoading(false);
            }
        };
        run();
        return () => { alive = false; };
    }, [symbol, direction]);

    const componentScores = useMemo(() => {
        const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
        const out: Record<string, number> = {};

        const metrics = micro?.recommendation?.metrics;
        const rrRaw = micro?.recommendation?.bestSetup?.riskReward;
        const rr = (typeof rrRaw === 'number' && Number.isFinite(rrRaw)) ? rrRaw : Number.NaN;

        const rrMinRaw = metrics?.rrMin;
        const rrMin = (typeof rrMinRaw === 'number' && Number.isFinite(rrMinRaw)) ? rrMinRaw : Number.NaN;

        const evRRaw = metrics?.evR;
        const evR = (typeof evRRaw === 'number' && Number.isFinite(evRRaw)) ? evRRaw : Number.NaN;

        const pWinRaw = metrics?.pWin;
        const pWin = (typeof pWinRaw === 'number' && Number.isFinite(pWinRaw)) ? pWinRaw : Number.NaN;

        const timing = micro?.scenarioAnalysis?.timing as string | undefined;
        const entryQuality = micro?.scenarioAnalysis?.entryQuality as string | undefined;
        const techAlignRaw = micro?.scenarioAnalysis?.technicalAlignment;
        const techAlign = (typeof techAlignRaw === 'number' && Number.isFinite(techAlignRaw)) ? techAlignRaw : 50;

        const rsiRaw = micro?.technical?.indicators?.rsi;
        const rsi = (typeof rsiRaw === 'number' && Number.isFinite(rsiRaw)) ? rsiRaw : 50;

        const atrRaw = micro?.technical?.levels?.atr;
        const atr = (typeof atrRaw === 'number' && Number.isFinite(atrRaw)) ? atrRaw : 0;

        const priceRaw = micro?.price;
        const price = (typeof priceRaw === 'number' && Number.isFinite(priceRaw)) ? priceRaw : 0;
        const atrPct = price > 0 ? (atr / price) * 100 : 1;

        const mtfScoreRaw = mtf?.confluence?.score;
        const mtfScore = (typeof mtfScoreRaw === 'number' && Number.isFinite(mtfScoreRaw)) ? mtfScoreRaw : 50;
        const mtfAligned = Boolean(mtf?.confluence?.aligned);

        const axes = regime?.axes;
        const macroFail = Boolean(axes && (axes?.L?.direction === '↓↓' || axes?.C?.direction === '↓↓'));
        const macroWarn = Boolean(axes && (axes?.V?.direction === '↑↑'));
        const macroScore = macroFail ? 25 : macroWarn ? 55 : 75;

        const momentumScore = clamp(100 - Math.abs(rsi - 50) * 2, 0, 100);
        const volatilityScore = clamp(100 - (atrPct - 0.3) * 18, 0, 100);

        const timingScore = timing === 'AGORA' ? 80 : timing === 'AGUARDAR' ? 60 : timing === 'PERDIDO' ? 25 : 50;
        const entryScore = entryQuality === 'OTIMO' ? 85 : entryQuality === 'BOM' ? 70 : 45;
        const timingSeasonalScore = Math.round((timingScore * 0.6) + (entryScore * 0.4));
        const structureScore = clamp(techAlign, 0, 100);
        const trendQuality = clamp(mtfScore + (mtfAligned ? 5 : -5), 0, 100);

        const rrScore = Number.isFinite(rr)
            ? clamp(50 + (rr - 1) * 25, 0, 100)
            : 45;
        const rrMinPenalty = (Number.isFinite(rr) && Number.isFinite(rrMin) && rr < rrMin) ? 18 : 0;
        const evBonus = Number.isFinite(evR) ? clamp(evR * 25, -20, 25) : 0;
        const rrAdjusted = clamp(rrScore - rrMinPenalty + evBonus, 0, 100);

        const flowScore = 50;
        const crossAssetScore = 50;

        const smc = micro?.technical?.smc;
        const hasOB = Array.isArray(smc?.orderBlocks) && smc.orderBlocks.length > 0;
        const hasFvg = Array.isArray(smc?.fvgs) && smc.fvgs.length > 0;
        const hasLp = Array.isArray(smc?.liquidityPools) && smc.liquidityPools.length > 0;
        const smcScore = clamp(50 + (hasOB ? 15 : 0) + (hasFvg ? 8 : 0) + (hasLp ? 8 : 0), 0, 100);

        for (const comp of scoreComponents) {
            const name = comp.comp;
            if (name === 'Macro Alignment') out[name] = macroScore;
            else if (name === 'Trend Quality') out[name] = trendQuality;
            else if (name === 'Momentum') out[name] = momentumScore;
            else if (name === 'Volatility') out[name] = volatilityScore;
            else if (name === 'Flow/Positioning') out[name] = flowScore;
            else if (name === 'Technical Structure') out[name] = structureScore;
            else if (name === 'Fractal/SMC') out[name] = smcScore;
            else if (name === 'Cross-Asset') out[name] = crossAssetScore;
            else if (name === 'Timing/Seasonal') out[name] = timingSeasonalScore;
            else if (name === 'Risk/Reward') out[name] = rrAdjusted;
            else out[name] = 50;
        }

        if (Number.isFinite(pWin)) out.__pWin = pWin;
        if (Number.isFinite(evR)) out.__evR = evR;
        if (Number.isFinite(rrMin)) out.__rrMin = rrMin;
        if (Number.isFinite(rr)) out.__rr = rr;

        return out;
    }, [micro, mtf, regime, scoreComponents]);

    const overallScore = useMemo(() => {
        const totalWeight = scoreComponents.reduce((sum, c) => sum + (c.weight || 0), 0) || 1;
        const weighted = scoreComponents.reduce((sum, c) => {
            const v = componentScores[c.comp];
            return sum + (Number.isFinite(v) ? v : 0) * (c.weight || 0);
        }, 0);
        return Math.round(weighted / totalWeight);
    }, [scoreComponents, componentScores]);

    return (
        <Card className="bg-gray-900/50 border-gray-800 backdrop-blur-sm">
            <CardHeader>
                <CardTitle className="text-xl font-bold text-orange-400">
                    Asset Scoring System (0-100)
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950/30 p-3">
                    <div>
                        <div className="text-[10px] uppercase text-gray-500 font-bold">Overall</div>
                        <div className={cn(
                            "text-2xl font-bold",
                            overallScore >= 75 ? 'text-green-400' : overallScore >= 55 ? 'text-amber-400' : 'text-red-400'
                        )}>
                            {loading ? '...' : overallScore}
                        </div>
                        {micro?.recommendation?.action && (
                            <div className="text-[10px] font-mono text-gray-500 mt-1">
                                MICRO: {micro.recommendation.action}
                                {micro?.scenarioAnalysis?.status ? ` | ${micro.scenarioAnalysis.status}` : ''}
                            </div>
                        )}
                    </div>
                    <div className="text-right">
                        {error ? (
                            <div className="text-[10px] font-mono text-red-400">{error}</div>
                        ) : (
                            <div className="text-[10px] font-mono text-gray-500">
                                {componentScores.__pWin != null ? `pWin ${(componentScores.__pWin * 100).toFixed(0)}%` : 'pWin n/a'}
                                {componentScores.__rrMin != null ? ` | rrMin ${Number(componentScores.__rrMin).toFixed(2)}` : ''}
                                {componentScores.__evR != null ? ` | EV ${Number(componentScores.__evR).toFixed(2)}R` : ''}
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-3">
                    {scoreComponents.map((score, i) => {
                        const val = componentScores[score.comp] ?? 50;
                        return (
                            <div
                                key={i}
                                className="bg-gray-800/50 rounded-lg p-3 flex flex-col md:flex-row md:items-center justify-between gap-2"
                            >
                                <span className="text-gray-100 font-medium md:w-1/3 text-xs">{score.comp}</span>

                                <div className="flex-1 flex items-center gap-3 w-full">
                                    <Progress
                                        value={val}
                                        className="h-2 bg-gray-700/50"
                                        indicatorClassName={val > 70 ? "bg-green-500" : val > 50 ? "bg-yellow-500" : "bg-red-500"}
                                    />
                                    <span className={`text-xs font-bold w-8 text-right ${val > 70 ? "text-green-400" : val > 50 ? "text-yellow-400" : "text-red-400"}`}>
                                        {val}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center text-sm pt-4 border-t border-gray-800">
                    <div className="bg-red-900/20 border border-red-900/30 rounded-lg p-4">
                        <div className="text-xl font-bold text-red-400 mb-1">0 - 54</div>
                        <div className="text-gray-500 font-medium tracking-wider">NO TRADE</div>
                    </div>
                    <div className="bg-yellow-900/20 border border-yellow-900/30 rounded-lg p-4">
                        <div className="text-xl font-bold text-yellow-400 mb-1">55 - 74</div>
                        <div className="text-gray-500 font-medium tracking-wider">MODERATE</div>
                    </div>
                    <div className="bg-green-900/20 border border-green-900/30 rounded-lg p-4">
                        <div className="text-xl font-bold text-green-400 mb-1">75 - 100</div>
                        <div className="text-gray-500 font-medium tracking-wider">STRONG</div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
