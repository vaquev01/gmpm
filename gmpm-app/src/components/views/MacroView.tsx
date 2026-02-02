'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Globe, Activity, BarChart2, Brain, ShieldAlert, Users, DollarSign, Scale,
    Droplets, MessageSquare, Rocket, CheckCircle2, XCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { analyzeInstitutionalMacro } from '@/lib/institutionalEngine';
import { getLiquidityData } from '@/lib/liquidityEngine';
import { getSocialSentiment } from '@/lib/sentimentEngine';
import type { InstitutionalMatrix } from '@/lib/institutionalEngine';

// --- TYPES ---
interface MacroData {
    summary: {
        gdp: { value: number | null; trend: string; lastUpdate: string };
        inflation: { cpi: number | null; cpiYoY: number | null; trend: string };
        employment: { unemploymentRate: number | null; nfp: number | null; trend: string };
        rates: { fedFunds: number | null; treasury10y: number | null; yieldCurve: number | null; curveStatus: string };
        credit: { aaaSpread: number | null; hySpread: number | null; condition: string };
        sentiment: { consumerSentiment: number | null; condition: string };
    };
    data?: unknown; // Raw FRED data
    timestamp: string;
}

// --- TICKER COMPONENT ---
const LiveTicker = ({ data }: { data: MacroData | null }) => {
    if (!data) return <div className="w-full bg-gray-900 border-y border-gray-800 py-2 h-8 animate-pulse" />;

    const gdpVal = data.summary.gdp.value !== null ? `${data.summary.gdp.value}` : 'N/A';
    const cpiVal = data.summary.inflation.cpi !== null ? `${data.summary.inflation.cpi}` : 'N/A';
    const y10 = data.summary.rates.treasury10y !== null ? `${data.summary.rates.treasury10y}` : 'N/A';
    const yc = data.summary.rates.yieldCurve !== null ? data.summary.rates.yieldCurve.toFixed(2) : 'N/A';
    const um = data.summary.sentiment.consumerSentiment !== null ? `${data.summary.sentiment.consumerSentiment}` : 'N/A';
    const hy = data.summary.credit.hySpread !== null ? data.summary.credit.hySpread.toFixed(2) : 'N/A';

    return (
        <div className="w-full bg-gray-900 border-y border-gray-800 py-2 overflow-hidden flex items-center relative gap-4">
            <div className="px-4 text-[10px] font-bold text-red-500 animate-pulse whitespace-nowrap z-10 bg-gray-900">LIVE FEED ●</div>
            <div className="flex gap-12 animate-[marquee_30s_linear_infinite] whitespace-nowrap text-xs text-gray-400 font-mono">
                <span><span className="text-green-500">GROWTH:</span> Real GDP {gdpVal}B ({data.summary.gdp.trend})</span>
                <span><span className="text-blue-500">INFLATION:</span> CPI {cpiVal} ({data.summary.inflation.trend})</span>
                <span><span className="text-red-500">RATES:</span> 10Y Yield {y10}% | Yield Curve: {yc}% ({data.summary.rates.curveStatus})</span>
                <span><span className="text-yellow-500">SENTIMENT:</span> Consumer Conf: {um} ({data.summary.sentiment.condition})</span>
                <span><span className="text-purple-500">CREDIT:</span> HY Spread {hy}% ({data.summary.credit.condition})</span>
            </div>
        </div>
    );
};

// --- HELPER: Derive Logic ---
const deriveOracleConclusion = (data: MacroData | null, matrix: InstitutionalMatrix | null) => {
    if (!data || !matrix) return {
        headline: "INITIALIZING ORACLE...",
        summary: "Connecting to global macro feeds...",
        sentiment: "NEUTRAL",
        riskLevel: "ANALYZING",
        tradeBias: "WAIT",
        actionPlan: { recommended: ["Loading..."], avoid: ["Loading..."] }
    };

    // Use Institutional Engine for the Verdict
    return {
        headline: matrix.overall.regime,
        summary: matrix.overall.verdict,
        sentiment: matrix.overall.score > 60 ? "BULLISH" : matrix.overall.score < 40 ? "BEARISH" : "NEUTRAL",
        riskLevel: matrix.liquidity.status === 'CRITICAL' ? "CRITICAL" : matrix.inflation.status === 'CRITICAL' ? "HIGH" : "MODERATE",
        tradeBias: matrix.growth.score > 55 ? "LONG EQUITIES" : "DEFENSIVE / QUALITY",
        actionPlan: matrix.overall.actionPlan || { recommended: [], avoid: [] }
    };
};

type MetricCardProps = {
    icon: React.ElementType;
    label: string;
    value: string | number;
    trend: string;
    status: string;
    color?: string;
};

const MetricCard = ({ icon: Icon, label, value, trend, status, color = "text-blue-500" }: MetricCardProps) => (
    <div className="bg-gray-800/40 p-4 rounded-lg border border-gray-700/50 flex items-center justify-between hover:bg-gray-800/60 transition-colors">
        <div className="flex items-center gap-3">
            <div className={`p-2 rounded-md bg-opacity-20 ${color.replace('text-', 'bg-')}`}>
                <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
                <div className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">{label}</div>
                <div className="text-xl font-bold text-gray-100">{value}</div>
            </div>
        </div>
        <div className="text-right">
            <Badge variant="outline" className={`${status.includes('EXPANDING') || status.includes('COOLING') || status === 'NORMAL' || status === 'OPTIMISTIC' ? 'border-green-500 text-green-500' : 'border-gray-600 text-gray-400'}`}>
                {status}
            </Badge>
            <div className="text-xs text-gray-500 mt-1">{trend}</div>
        </div>
    </div>
);

export const MacroView = () => {
    const [data, setData] = useState<MacroData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchWithTimeout = async (url: string, timeoutMs: number) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
        try {
            return await fetch(url, { signal: controller.signal });
        } finally {
            clearTimeout(id);
        }
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                setError(null);
                const res = await fetchWithTimeout('/api/fred', 12000);
                if (!res.ok) {
                    const msg = `Macro feed error (/api/fred): HTTP ${res.status}`;
                    setError(msg);
                    setData(null);
                    return;
                }
                const json = await res.json();
                if (json && json.success) {
                    setData(json);
                    setError(null);
                } else {
                    const msg = (json && json.error) ? String(json.error) : 'Unknown macro feed error';
                    setError(msg);
                    setData(null);
                }
            } catch (e) {
                const msg = (e instanceof Error) ? e.message : String(e);
                setError(`Failed to fetch macro data: ${msg}`);
                setData(null);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const institutional = (() => {
        try {
            return data ? analyzeInstitutionalMacro(data) : null;
        } catch (e) {
            console.error('Institutional macro analysis failed', e);
            return null;
        }
    })();
    const oracle = deriveOracleConclusion(data, institutional);

    // MOCK DATA FOR MISSING SECTIONS
    const geopoliticalData = [
        { region: "Middle East", risks: ["Supply Chain Route Disruption", "Energy Price Volatility"], status: "CRITICAL", impact: "HIGH" },
        { region: "Eastern Europe", risks: ["Protracted Conflict", "Commodity Constraints"], status: "STABLE_HIGH", impact: "MEDIUM" },
        { region: "Asia-Pacific", risks: ["Trade Fragments", "Tech War"], status: "ELEVATED", impact: "MEDIUM" }
    ];

    return (
        <div className="space-y-6 max-w-[1700px] mx-auto pb-20">
            {!loading && error && (
                <Card className="bg-red-950/20 border border-red-900/40">
                    <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="text-sm text-red-200">
                            <div className="font-bold text-red-300">Macro feed failed</div>
                            <div className="text-xs text-red-200/80 font-mono break-words">{error}</div>
                            <div className="text-xs text-gray-400 mt-2">
                                Set <span className="font-mono text-gray-300">FRED_API_KEY</span> in <span className="font-mono text-gray-300">gmpm-app/.env.local</span> and restart <span className="font-mono text-gray-300">npm run dev</span>.
                            </div>
                        </div>
                        <button
                            className="px-4 py-2 rounded bg-red-600/30 border border-red-600/50 text-red-100 hover:bg-red-600/40 transition-colors text-xs font-bold"
                            onClick={() => {
                                setLoading(true);
                                setError(null);
                                (async () => {
                                    try {
                                        const res = await fetchWithTimeout('/api/fred', 12000);
                                        if (!res.ok) {
                                            setError(`Macro feed error (/api/fred): HTTP ${res.status}`);
                                            setData(null);
                                            return;
                                        }
                                        const json = await res.json();
                                        if (json && json.success) {
                                            setData(json);
                                            setError(null);
                                        } else {
                                            setError((json && json.error) ? String(json.error) : 'Unknown macro feed error');
                                            setData(null);
                                        }
                                    } catch (e) {
                                        const msg = (e instanceof Error) ? e.message : String(e);
                                        setError(`Failed to fetch macro data: ${msg}`);
                                        setData(null);
                                    } finally {
                                        setLoading(false);
                                    }
                                })();
                            }}
                        >
                            RETRY
                        </button>
                    </CardContent>
                </Card>
            )}

            {/* HEADER */}
            <div className="flex flex-col gap-0 border-b border-gray-800 pb-0">
                <div className="flex items-center justify-between pb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                            <Globe className="w-8 h-8 text-indigo-400" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-100 tracking-tight flex items-center gap-3">
                                GLOBAL MACRO ORACLE
                                <Badge variant="outline" className="border-indigo-500 text-indigo-400 bg-indigo-500/10 text-[10px] tracking-widest">
                                    INSTITUTIONAL GRADE
                                </Badge>
                            </h1>
                            <p className="text-sm text-gray-500">Real-time holistic intelligence system: Parsing global data feeds...</p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="text-right hidden md:block">
                            <div className="text-[10px] text-gray-500 uppercase font-bold">System Status</div>
                            <div className="text-xs text-green-400 font-mono flex items-center gap-2 justify-end">
                                OPERATIONAL <Activity className="w-3 h-3" />
                            </div>
                        </div>
                        <div className="text-right hidden md:block">
                            <div className="text-[10px] text-gray-500 uppercase font-bold">Last Fetch</div>
                            <div className="text-xs text-gray-300 font-mono">{loading ? "SYNCING..." : (data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : "N/A")}</div>
                        </div>
                    </div>
                </div>

                <LiveTicker data={data} />
            </div>

            {/* ORACLE SYNTHESIS (REAL-TIME DERIVED) */}
            <Card className="bg-gradient-to-br from-gray-900 to-indigo-950/20 border-indigo-500/30 mb-6 shadow-2xl shadow-indigo-900/10 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Brain className="w-64 h-64 text-indigo-500 rotate-12" />
                </div>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-indigo-400">
                        <Brain className="w-5 h-5" />
                        ORACLE SYNTHESIS (LIVE)
                    </CardTitle>
                </CardHeader>
                <CardContent className="relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* LEFT: VERDICT */}
                        <div className="flex-1 space-y-4 lg:col-span-2">
                            {loading ? (
                                <div className="space-y-2 animate-pulse">
                                    <div className="h-8 bg-gray-800 rounded w-3/4"></div>
                                    <div className="h-4 bg-gray-800 rounded w-full"></div>
                                </div>
                            ) : (
                                <>
                                    <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 uppercase tracking-tight">
                                        {oracle.headline}
                                    </h2>
                                    <div className="p-4 bg-black/40 rounded border-l-2 border-indigo-500 font-mono text-sm leading-relaxed text-indigo-100 shadow-inner">
                                        <span className="text-indigo-500 mr-2">{'>'}</span>
                                        {oracle.summary}
                                        <span className="animate-pulse ml-1 inline-block w-2 h-4 bg-indigo-500 align-middle"></span>
                                    </div>

                                    {/* STRATEGIC ACTION PLAN */}
                                    {oracle.actionPlan && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                            <div className="bg-emerald-950/20 border border-emerald-900/30 p-3 rounded">
                                                <div className="text-[10px] font-bold text-emerald-500 uppercase mb-2 flex items-center gap-2">
                                                    <CheckCircle2 className="w-3 h-3" /> Recommended Positioning
                                                </div>
                                                <ul className="space-y-1">
                                                    {oracle.actionPlan.recommended.map((item: string, i: number) => (
                                                        <li key={i} className="text-xs text-gray-300 flex items-center gap-2">
                                                            <span className="w-1 h-1 rounded-full bg-emerald-500"></span> {item}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <div className="bg-red-950/20 border border-red-900/30 p-3 rounded">
                                                <div className="text-[10px] font-bold text-red-500 uppercase mb-2 flex items-center gap-2">
                                                    <XCircle className="w-3 h-3" /> Avoid / Underweight
                                                </div>
                                                <ul className="space-y-1">
                                                    {oracle.actionPlan.avoid.map((item: string, i: number) => (
                                                        <li key={i} className="text-xs text-gray-300 flex items-center gap-2">
                                                            <span className="w-1 h-1 rounded-full bg-red-500"></span> {item}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* RIGHT: METRICS */}
                        <div className="flex flex-col gap-3 min-w-[240px]">

                            <div className="bg-gray-900/80 p-3 rounded border border-gray-700/50 flex justify-between items-center backdrop-blur-sm">
                                <span className="text-[10px] text-gray-500 uppercase font-bold">Sentiment</span>
                                <span className={cn("font-bold font-mono text-sm", oracle.sentiment === 'BULLISH' ? "text-green-400" : "text-yellow-400")}>{oracle.sentiment}</span>
                            </div>
                            <div className="bg-gray-900/80 p-3 rounded border border-gray-700/50 flex justify-between items-center backdrop-blur-sm">
                                <span className="text-[10px] text-gray-500 uppercase font-bold">Risk</span>
                                <span className={cn("font-bold font-mono text-sm", oracle.riskLevel === 'CRITICAL' ? "text-red-400" : oracle.riskLevel === 'HIGH' ? "text-orange-400" : "text-yellow-400")}>{oracle.riskLevel}</span>
                            </div>
                            <div className="bg-gray-900/80 p-3 rounded border border-gray-700/50 flex justify-between items-center backdrop-blur-sm">
                                <span className="text-[10px] text-gray-500 uppercase font-bold">Bias</span>
                                <span className="text-blue-400 font-bold font-mono text-xs text-right whitespace-normal max-w-[120px]">{oracle.tradeBias}</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* TABS CONTAINER */}
            <Tabs defaultValue="overview" className="space-y-6">
                <TabsList className="bg-gray-900 border border-gray-800">
                    <TabsTrigger value="overview">OVERVIEW & CORE</TabsTrigger>
                    <TabsTrigger value="liquidity">LIQUIDITY & FLOWS</TabsTrigger>
                    <TabsTrigger value="sentiment">SENTIMENT & NARRATIVE</TabsTrigger>
                    <TabsTrigger value="innovation">INNOVATION & CAPEX</TabsTrigger>
                </TabsList>

                {/* TAB 1: OVERVIEW */}
                <TabsContent value="overview" className="space-y-6">

                    {/* INSTITUTIONAL SCOREBOARD */}
                    <Card className="bg-gray-900/50 border-gray-800 mb-6">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-indigo-400">
                                <Scale className="w-5 h-5" />
                                INSTITUTIONAL SCOREBOARD
                            </CardTitle>
                            <CardDescription>20-Point Quantitative Matrix Assessment</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {institutional ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        {[institutional.growth, institutional.inflation, institutional.energy, institutional.housing].map((item, i) => (
                                            <div key={i} className="space-y-1">
                                                <div className="flex justify-between items-end">
                                                    <span className="text-sm font-bold text-gray-200">{item.name}</span>
                                                    <span className={cn("text-xs font-mono", item.status === 'ROBUST' ? "text-green-400" : item.status === 'CRITICAL' ? "text-red-400" : "text-yellow-400")}>
                                                        {item.status} ({item.score.toFixed(0)}/100)
                                                    </span>
                                                </div>
                                                <Progress value={item.score} className="h-2" indicatorClassName={cn(item.status === 'ROBUST' ? "bg-green-500" : item.status === 'CRITICAL' ? "bg-red-500" : "bg-yellow-500")} />
                                                <p className="text-[10px] text-gray-500">{item.description}</p>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="space-y-4">
                                        {[institutional.liquidity, institutional.credit, institutional.risk].map((item, i) => (
                                            <div key={i} className="space-y-1">
                                                <div className="flex justify-between items-end">
                                                    <span className="text-sm font-bold text-gray-200">{item.name}</span>
                                                    <span className={cn("text-xs font-mono", item.status === 'ROBUST' ? "text-green-400" : item.status === 'CRITICAL' ? "text-red-400" : "text-yellow-400")}>
                                                        {item.status} ({item.score.toFixed(0)}/100)
                                                    </span>
                                                </div>
                                                <Progress value={item.score} className="h-2" indicatorClassName={cn(item.status === 'ROBUST' ? "bg-green-500" : item.status === 'CRITICAL' ? "bg-red-500" : "bg-yellow-500")} />
                                                <p className="text-[10px] text-gray-500">{item.description}</p>
                                            </div>
                                        ))}
                                        <div className="mt-4 p-3 bg-gray-800/50 rounded border border-gray-700">
                                            <div className="text-xs text-gray-500 uppercase font-bold text-center mb-1">matrix verdict</div>
                                            <div className="text-center font-bold text-white text-lg">{institutional.overall.regime}</div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-500">Loading Matrix...</div>
                            )}
                        </CardContent>
                    </Card>

                    <div>
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Activity className="w-4 h-4" /> Economic Core Data (Real-Time)
                        </h3>
                        {loading ? (
                            <div className="text-center text-gray-500 py-10">Syncing with Federal Reserve Database...</div>
                        ) : !data ? (
                            <div className="text-center text-gray-500 py-10">Macro feed unavailable.</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <MetricCard icon={Users} label="US GDP (Real)" value={data.summary.gdp.value !== null ? `$${data.summary.gdp.value}B` : 'N/A'} trend={data.summary.gdp.trend} status={data.summary.gdp.trend} color="text-emerald-500" />
                                <MetricCard icon={DollarSign} label="CPI Inflation" value={data.summary.inflation.cpi !== null ? data.summary.inflation.cpi : 'N/A'} trend={data.summary.inflation.trend} status={data.summary.inflation.trend === 'FALLING' ? "COOLING" : data.summary.inflation.trend === 'UNKNOWN' ? "UNKNOWN" : "HEATING"} color="text-red-500" />
                                <MetricCard icon={Scale} label="Fed Funds Rate" value={data.summary.rates.fedFunds !== null ? `${data.summary.rates.fedFunds}%` : 'N/A'} trend={data.summary.rates.curveStatus} status={data.summary.rates.curveStatus} color="text-blue-500" />
                                <MetricCard icon={Activity} label="Consumer Sentiment" value={data.summary.sentiment.consumerSentiment !== null ? data.summary.sentiment.consumerSentiment : 'N/A'} trend={data.summary.sentiment.condition} status={data.summary.sentiment.condition} color="text-yellow-500" />
                            </div>
                        )}
                    </div>

                    {/* GEOPOLITICAL RADAR (Static for now) */}
                    <Card className="bg-gray-900/50 border-gray-800 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500/50 to-transparent animate-pulse" />
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-red-500">
                                    <ShieldAlert className="w-5 h-5" />
                                    GEOPOLITICAL RADAR
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="relative flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                    </span>
                                    <span className="text-xs font-mono text-red-400">STATIC</span>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                {geopoliticalData.map((geo, i) => (
                                    <div key={i} className="bg-gray-800/30 p-4 rounded border-l-4 border-red-900/50 relative group hover:bg-gray-800/50 transition-colors">
                                        <div className="absolute top-2 right-2 flex gap-0.5">
                                            {[1, 2, 3, 4, 5].map((level) => (
                                                <div key={level} className={cn("w-1 h-3 rounded-full", (geo.status === 'CRITICAL' && level <= 5) ? "bg-red-500" : (geo.status === 'STABLE_HIGH' && level <= 4) ? "bg-orange-500" : (geo.status === 'ELEVATED' && level <= 3) ? "bg-yellow-500" : "bg-gray-700")} />
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-2 mb-3">
                                            {geo.status === 'CRITICAL' && <ShieldAlert className="w-4 h-4 text-red-500 animate-pulse" />}
                                            <div className="text-base font-bold text-gray-200">{geo.region}</div>
                                        </div>
                                        <div className="space-y-2">
                                            {geo.risks.map((risk, j) => (
                                                <div key={j} className="text-xs text-gray-400 flex items-center gap-2 border-l border-gray-700 pl-2">
                                                    <Activity className="w-3 h-3 text-red-900" />
                                                    {risk}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="liquidity">
                    {data ? (() => {
                        const liquidity = getLiquidityData(data);
                        if (!liquidity) {
                            return <div className="text-center text-gray-500">Liquidity data unavailable.</div>;
                        }
                        return (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Card className="bg-gray-900 border-gray-800">
                                    <CardHeader>
                                        <CardTitle className="text-blue-400 flex items-center gap-2">
                                            <Droplets className="w-5 h-5" /> Global Liquidity Matrix
                                        </CardTitle>
                                        <CardDescription>Tracing capital availability across the system.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <div className="flex items-end justify-between border-b border-gray-800 pb-4">
                                            <div>
                                                <div className="text-sm text-gray-400">Net Liquidity (Global)</div>
                                                <div className="text-3xl font-bold text-white">${liquidity.netLiquidity.toFixed(2)}T</div>
                                            </div>
                                            <Badge variant="outline" className={cn(liquidity.trend === 'EXPANDING' ? "text-green-500 border-green-500" : "text-red-500 border-red-500")}>
                                                {liquidity.trend}
                                            </Badge>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-3 bg-gray-950 rounded">
                                                <div className="text-xs text-gray-500">Reverse Repo (RRP)</div>
                                                <div className="text-lg font-mono text-gray-200">${liquidity.rrp.toFixed(2)}T</div>
                                            </div>
                                            <div className="p-3 bg-gray-950 rounded">
                                                <div className="text-xs text-gray-500">TGA Balance</div>
                                                <div className="text-lg font-mono text-gray-200">${liquidity.tga.toFixed(0)}B</div>
                                            </div>
                                        </div>
                                        <div className="text-xs text-gray-500 italic text-center">
                                            *Fed Balance Sheet: ${liquidity.fedBalanceSheet.toFixed(2)}T
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="bg-blue-950/10 border-blue-900/30">
                                    <CardHeader>
                                        <CardTitle className="text-gray-300">Flow Dynamics</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="h-[200px] flex items-center justify-center text-gray-600 border border-dashed border-gray-800 rounded bg-gray-900/50">
                                            <BarChart2 className="w-6 h-6 mr-2" /> Flow Chart Visualization
                                        </div>
                                        <p className="mt-4 text-sm text-gray-400">
                                            Institutional flows are currently {liquidity.trend.toLowerCase()} relative to last week ({liquidity.change24h === null ? 'N/A' : `${liquidity.change24h > 0 ? '+' : ''}${liquidity.change24h.toFixed(2)}%`}).
                                            {liquidity.trend === 'EXPANDING' ? " Risk assets generally favored." : " Caution advised in high-beta assets."}
                                        </p>
                                    </CardContent>
                                </Card>
                            </div>
                        );
                    })() : <div className="text-center text-gray-500">Loading Liquidity Data...</div>}
                </TabsContent>

                <TabsContent value="sentiment">
                    {data ? (() => {
                        const sentiment = getSocialSentiment(data);
                        if (!sentiment) {
                            return <div className="text-center text-gray-500">Sentiment proxy unavailable.</div>;
                        }
                        return (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <Card className="bg-gray-900 border-gray-800 md:col-span-2">
                                    <CardHeader>
                                        <CardTitle className="text-yellow-500 flex items-center gap-2">
                                            <MessageSquare className="w-5 h-5" /> Social Sentiment Engine
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <div className="flex items-center gap-8">
                                            <div>
                                                <div className="text-xs text-gray-400 uppercase">Bull/Bear Ratio</div>
                                                <div className={cn("text-3xl font-bold font-mono", sentiment.bullBearRatio > 1 ? "text-green-500" : "text-red-500")}>
                                                    {sentiment.bullBearRatio.toFixed(2)}
                                                </div>
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span>Bearish</span>
                                                    <span>Bullish</span>
                                                </div>
                                                <Progress value={Math.min(100, Math.max(0, sentiment.bullBearRatio * 50))} className="h-3 bg-gray-800" indicatorClassName={sentiment.bullBearRatio > 1 ? "bg-green-500" : "bg-red-500"} />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-gray-800 pt-4">
                                            {sentiment.topNarratives.map((n, i) => (
                                                <div key={i} className="text-center p-2 bg-gray-950 rounded border border-gray-800">
                                                    <div className="text-[10px] text-gray-500">Narrative {i + 1}</div>
                                                    <div className="font-bold text-gray-200">#{n}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="bg-gray-900 border-gray-800">
                                    <CardHeader>
                                        <CardTitle className="text-gray-300">Retail Positioning</CardTitle>
                                    </CardHeader>
                                    <CardContent className="text-center space-y-4">
                                        <div className={cn("inline-block p-4 rounded-full bg-opacity-10 mb-2", sentiment.retailPositioning === 'LONG' ? "bg-green-500 text-green-500" : "bg-red-500 text-red-500")}>
                                            <Users className="w-8 h-8" />
                                        </div>
                                        <div>
                                            <div className="text-2xl font-bold text-white">{sentiment.retailPositioning}</div>
                                            <div className="text-xs text-gray-500">Retail Consensus</div>
                                        </div>
                                        <div className="border-t border-gray-800 pt-4 text-left">
                                            <div className="text-xs text-gray-500 flex justify-between">
                                                <span>Conviction</span>
                                                <span className="text-white">{sentiment.narrativeStrength === null ? 'N/A' : `${sentiment.narrativeStrength}/100`}</span>
                                            </div>
                                            <Progress value={sentiment.narrativeStrength ?? 0} className="h-1 mt-1 bg-gray-800" />
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        );
                    })() : <div className="text-center text-gray-500">Loading Sentiment Data...</div>}
                </TabsContent>
                <TabsContent value="innovation">
                    <div className="p-10 text-center text-gray-500 bg-gray-900/30 rounded border border-gray-800">
                        <Rocket className="w-10 h-10 mx-auto mb-2 text-gray-600" />
                        <h3 className="text-lg font-bold text-gray-300">Innovation Tracker</h3>
                        <p>Fetching Patent & VC data...</p>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
};
