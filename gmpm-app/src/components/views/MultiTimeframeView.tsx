import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface MultiTimeframeViewProps {
    symbol: string;
}

type TFTrend = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

type TFData = {
    trend: TFTrend;
    strength: number;
};

type MtfApiData = {
    success: boolean;
    data?: {
        timeframes: Record<string, TFData>;
        confluence: {
            score: number;
            bias: 'LONG' | 'SHORT' | 'NEUTRAL';
            aligned: boolean;
            description: string;
        };
    };
};

export const MultiTimeframeView = ({ symbol }: MultiTimeframeViewProps) => {
    const [data, setData] = useState<MtfApiData['data'] | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let alive = true;
        const run = async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/mtf?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
                const json = (await res.json()) as MtfApiData;
                if (!alive) return;
                setData(json?.success ? (json.data || null) : null);
            } catch {
                if (!alive) return;
                setData(null);
            } finally {
                if (!alive) return;
                setLoading(false);
            }
        };
        run();
        return () => { alive = false; };
    }, [symbol]);

    const rows = useMemo(() => {
        const tf = data?.timeframes || {};
        const order = ['1D', '4H', '1H', '15M'];
        return order
            .filter((k) => Boolean(tf[k]))
            .map((k) => ({ tf: k, ...(tf[k] as TFData) }));
    }, [data]);

    return (
        <Card className="bg-gray-900/50 border-gray-800 backdrop-blur-sm">
            <CardHeader>
                <CardTitle className="text-xl font-bold text-green-400">
                    Multi-Timeframe Confluence
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="rounded-lg border border-gray-800 bg-gray-950/30 p-3">
                    <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-gray-300">{symbol}</div>
                        <div className="text-[10px] font-mono text-gray-500">
                            {loading ? 'loading...' : data ? `score ${data.confluence.score}` : 'n/a'}
                        </div>
                    </div>
                    {data ? (
                        <div className="mt-1 text-[11px] text-gray-400">
                            <span className="font-mono">Bias:</span> <span className="font-bold text-gray-200">{data.confluence.bias}</span>
                            <span className="mx-2 text-gray-700">|</span>
                            <span className={cn("font-bold", data.confluence.aligned ? 'text-green-400' : 'text-amber-400')}>
                                {data.confluence.aligned ? 'ALIGNED' : 'MIXED'}
                            </span>
                        </div>
                    ) : null}
                </div>

                {rows.length === 0 ? (
                    <div className="text-xs font-mono text-gray-500">No MTF data.</div>
                ) : (
                    rows.map((r) => (
                        <div
                            key={r.tf}
                            className="group bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-green-900/50 rounded-lg p-4 transition-all duration-200"
                        >
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-3">
                                    <span className="font-bold text-lg text-white w-16 group-hover:text-green-300 transition-colors">
                                        {r.tf}
                                    </span>
                                    <span className={cn(
                                        "text-[10px] font-bold px-2 py-0.5 rounded border",
                                        r.trend === 'BULLISH'
                                            ? 'bg-green-500/10 text-green-300 border-green-500/20'
                                            : r.trend === 'BEARISH'
                                                ? 'bg-red-500/10 text-red-300 border-red-500/20'
                                                : 'bg-gray-700/20 text-gray-300 border-gray-700/30'
                                    )}>
                                        {r.trend}
                                    </span>
                                </div>
                                <span className="text-sm font-bold text-green-400 self-end md:self-auto">
                                    {r.strength}%
                                </span>
                            </div>

                            <div className="relative pt-1">
                                <Progress value={r.strength} className="h-2 bg-gray-700/50" indicatorClassName="bg-green-500" />
                            </div>
                        </div>
                    ))
                )}

                <div className="mt-8 text-center bg-gray-800/30 p-4 rounded-lg border border-gray-700/30">
                    <div className="flex items-center justify-center gap-2 text-xs md:text-sm font-mono text-gray-400 overflow-x-auto">
                        <span>MONTHLY</span>
                        <span>→</span>
                        <span>WEEKLY</span>
                        <span>→</span>
                        <span>DAILY</span>
                        <span>→</span>
                        <span className="text-green-400 font-bold">H4 (Timing)</span>
                        <span>→</span>
                        <span>H1</span>
                        <span>→</span>
                        <span>M15</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Top-Down Analysis Flow</p>
                </div>
            </CardContent>
        </Card>
    );
};
