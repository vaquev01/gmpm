'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FractalSMCView } from './FractalSMCView';
import { ScoringView } from './ScoringView';
import { MultiTimeframeView } from './MultiTimeframeView';
import { Brain, ChevronDown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

type MesoAllowedInstrument = {
    symbol: string;
    direction: 'LONG' | 'SHORT';
    class: string;
    reason: string;
    score: number;
};

type MesoApiResponse = {
    success: boolean;
    microInputs?: {
        allowedInstruments: MesoAllowedInstrument[];
        prohibitedInstruments: Array<{ symbol: string; reason: string }>;
    };
};

export const LabView = () => {
    const [allowed, setAllowed] = useState<MesoAllowedInstrument[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState('SPY');
    const [filterText, setFilterText] = useState('');
    const [details, setDetails] = useState<MesoAllowedInstrument | null>(null);
    const [labLoading, setLabLoading] = useState(false);
    const [labError, setLabError] = useState<string | null>(null);
    const [labReport, setLabReport] = useState<unknown | null>(null);
    const [mainLabLoading, setMainLabLoading] = useState(false);
    const [mainLabError, setMainLabError] = useState<string | null>(null);
    const [mainLabReport, setMainLabReport] = useState<unknown | null>(null);

    const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

    useEffect(() => {
        let alive = true;
        const run = async () => {
            try {
                setLoading(true);
                const res = await fetch('/api/meso', { cache: 'no-store' });
                const json = (await res.json()) as MesoApiResponse;
                if (!alive) return;
                const next = json?.success ? (json.microInputs?.allowedInstruments || []) : [];
                setAllowed(next);
                if (next.length > 0) {
                    setSelectedAsset((prev) => (next.some((i) => i.symbol === prev) ? prev : next[0].symbol));
                }
            } catch {
                if (!alive) return;
                setAllowed([]);
            } finally {
                if (!alive) return;
                setLoading(false);
            }
        };
        run();
        return () => { alive = false; };
    }, []);

    const selected = useMemo(() => allowed.find((i) => i.symbol === selectedAsset) || null, [allowed, selectedAsset]);

    useEffect(() => {
        if (!selectedAsset) {
            setMainLabLoading(false);
            setMainLabError(null);
            setMainLabReport(null);
            return;
        }

        const symbol = selectedAsset;
        let alive = true;

        const run = async () => {
            try {
                setMainLabLoading(true);
                setMainLabError(null);
                setMainLabReport(null);

                const res = await fetch(`/api/lab?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
                const json: unknown = await res.json();
                if (!alive) return;

                if (!res.ok) {
                    setMainLabError(`HTTP ${res.status}`);
                    return;
                }

                if (isRecord(json) && json.success === true) {
                    setMainLabReport((json as Record<string, unknown>).report ?? null);
                    return;
                }

                const errMsg = isRecord(json) && typeof json.error === 'string' ? json.error : 'Failed to load lab report';
                setMainLabError(errMsg);
            } catch (e) {
                if (!alive) return;
                setMainLabError(e instanceof Error ? e.message : String(e));
            } finally {
                if (!alive) return;
                setMainLabLoading(false);
            }
        };

        run();
        return () => {
            alive = false;
        };
    }, [selectedAsset]);

    useEffect(() => {
        if (!details?.symbol) {
            setLabLoading(false);
            setLabError(null);
            setLabReport(null);
            return;
        }

        const symbol = details.symbol;

        if (isRecord(mainLabReport) && typeof mainLabReport.symbol === 'string' && mainLabReport.symbol === symbol) {
            setLabLoading(false);
            setLabError(null);
            setLabReport(mainLabReport);
            return;
        }

        let alive = true;

        const run = async () => {
            try {
                setLabLoading(true);
                setLabError(null);
                setLabReport(null);

                const res = await fetch(`/api/lab?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
                const json: unknown = await res.json();

                if (!alive) return;
                if (!res.ok) {
                    setLabError(`HTTP ${res.status}`);
                    return;
                }

                if (isRecord(json) && json.success === true) {
                    setLabReport((json as Record<string, unknown>).report ?? null);
                    return;
                }

                const errMsg = isRecord(json) && typeof json.error === 'string' ? json.error : 'Failed to load lab report';
                setLabError(errMsg);
            } catch (e) {
                if (!alive) return;
                setLabError(e instanceof Error ? e.message : String(e));
            } finally {
                if (!alive) return;
                setLabLoading(false);
            }
        };

        run();
        return () => {
            alive = false;
        };
    }, [details?.symbol, mainLabReport]);

    const filteredAllowed = useMemo(() => {
        const q = filterText.trim().toLowerCase();
        if (!q) return allowed;
        return allowed.filter((a) => {
            const sym = a.symbol.toLowerCase();
            const cls = a.class.toLowerCase();
            const dir = a.direction.toLowerCase();
            return sym.includes(q) || cls.includes(q) || dir.includes(q);
        });
    }, [allowed, filterText]);

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto">

            {/* TOP BAR: ASSET SELECTION */}
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
                        <Brain className="w-8 h-8 text-blue-500" />
                        LAB
                    </h2>
                    <div className="h-8 w-px bg-gray-800" />

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="min-w-[200px] justify-between bg-gray-900 border-gray-700 text-lg h-10">
                                {selectedAsset}
                                <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-gray-900 border-gray-800">
                            {allowed.length === 0 ? (
                                <DropdownMenuItem
                                    key="__empty"
                                    onClick={() => {}}
                                    className="text-gray-400 focus:bg-gray-800 focus:text-white cursor-default"
                                >
                                    {loading ? 'Loading MESO universe...' : 'MESO universe empty'}
                                </DropdownMenuItem>
                            ) : allowed.map((asset) => (
                                <DropdownMenuItem
                                    key={asset.symbol}
                                    onClick={() => setSelectedAsset(asset.symbol)}
                                    className="text-gray-200 focus:bg-gray-800 focus:text-white cursor-pointer"
                                >
                                    <div className="flex items-center justify-between w-full gap-3">
                                        <span className="font-mono">{asset.symbol}</span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${asset.direction === 'LONG' ? 'bg-green-500/10 text-green-300 border-green-500/20' : 'bg-red-500/10 text-red-300 border-red-500/20'}`}>
                                            {asset.direction}
                                        </span>
                                    </div>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div className="flex gap-2">
                    <span className="text-xs text-gray-500 uppercase tracking-widest self-center">
                        Analyst Workstation (v8.1)
                    </span>
                </div>
            </div>

            {/* MAIN CONTENT: UNIFIED PATIENT VIEW */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-200px)]">

                <div className="lg:col-span-3 space-y-3 overflow-y-auto scrollbar-none pr-1">
                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                            <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">MESO Universe</div>
                            <div className="text-[10px] font-mono text-gray-500">{filteredAllowed.length}/{allowed.length}</div>
                        </div>
                        <div className="mt-2">
                            <input
                                value={filterText}
                                onChange={(e) => setFilterText(e.target.value)}
                                placeholder="Filter (symbol, class, direction)"
                                className="w-full bg-gray-950/40 border border-gray-800 text-xs text-white px-2 py-1.5 rounded focus:border-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        {filteredAllowed.length === 0 ? (
                            <div className="text-xs font-mono text-gray-500">No instruments.</div>
                        ) : (
                            filteredAllowed.map((a) => (
                                <div
                                    key={a.symbol}
                                    className={cn(
                                        "group flex items-stretch gap-2 rounded-lg border p-2 transition-colors",
                                        a.symbol === selectedAsset
                                            ? "bg-blue-900/15 border-blue-500/30"
                                            : "bg-gray-900/40 border-gray-800 hover:border-gray-700"
                                    )}
                                >
                                    <button
                                        onClick={() => setSelectedAsset(a.symbol)}
                                        className="flex-1 text-left"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-mono text-sm text-gray-200">{a.symbol}</span>
                                            <span className={cn(
                                                "text-[10px] font-bold px-2 py-0.5 rounded border",
                                                a.direction === 'LONG'
                                                    ? 'bg-green-500/10 text-green-300 border-green-500/20'
                                                    : 'bg-red-500/10 text-red-300 border-red-500/20'
                                            )}>
                                                {a.direction}
                                            </span>
                                        </div>
                                        <div className="mt-1 flex items-center justify-between">
                                            <span className="text-[10px] text-gray-500 truncate max-w-[150px]">{a.class}</span>
                                            <span className="text-[10px] font-mono text-gray-500">{Math.round(a.score)}</span>
                                        </div>
                                    </button>

                                    <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        className="self-center text-gray-400 hover:text-white"
                                        onClick={() => setDetails(a)}
                                        title="Details"
                                        aria-label="Open MESO details"
                                    >
                                        <Info className="w-3 h-3" />
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="lg:col-span-9 grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
                    <div className="lg:col-span-8 space-y-6 overflow-y-auto scrollbar-none pr-2">
                        <FractalSMCView symbol={selectedAsset} />
                    </div>

                    <div className="lg:col-span-4 space-y-6 flex flex-col h-full overflow-y-auto scrollbar-none pb-12">
                        <div className="flex-shrink-0">
                            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                                <div className="flex items-center justify-between">
                                    <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">Lab Decision</div>
                                    <div className="text-[10px] font-mono text-gray-500">{selectedAsset}</div>
                                </div>

                                {mainLabLoading ? (
                                    <div className="text-sm text-gray-300 mt-2">Loading...</div>
                                ) : mainLabError ? (
                                    <div className="text-sm text-red-300 mt-2">{mainLabError}</div>
                                ) : (
                                    (() => {
                                        if (!isRecord(mainLabReport)) {
                                            return <div className="text-sm text-gray-400 mt-2">No data.</div>;
                                        }

                                        const decision = isRecord(mainLabReport.decision) ? mainLabReport.decision : null;
                                        const timing = decision && typeof decision.timing === 'string' ? decision.timing : null;
                                        const confidence = decision && typeof decision.confidence === 'string' ? decision.confidence : null;
                                        const score = decision && typeof decision.score === 'number' ? decision.score : null;
                                        const risk = decision && typeof decision.risk === 'string' ? decision.risk : null;

                                        const levels = isRecord(mainLabReport.levels) ? mainLabReport.levels : null;
                                        const entry = levels && typeof levels.entry === 'number' ? levels.entry : null;
                                        const stopLoss = levels && typeof levels.stopLoss === 'number' ? levels.stopLoss : null;
                                        const takeProfits = levels && Array.isArray(levels.takeProfits) ? levels.takeProfits.filter((x) => typeof x === 'number') : [];
                                        const setupType = levels && typeof levels.setupType === 'string' ? levels.setupType : null;
                                        const setupTf = levels && typeof levels.timeframe === 'string' ? levels.timeframe : null;
                                        const setupConf = levels && typeof levels.setupConfidence === 'string' ? levels.setupConfidence : null;

                                        const metrics = isRecord(mainLabReport.metrics) ? mainLabReport.metrics : null;
                                        const rr = metrics && typeof metrics.rr === 'number' ? metrics.rr : null;
                                        const rrMin = metrics && typeof metrics.rrMin === 'number' ? metrics.rrMin : null;
                                        const evR = metrics && typeof metrics.evR === 'number' ? metrics.evR : null;

                                        const modulesRaw = mainLabReport.modules;
                                        const modules = Array.isArray(modulesRaw) ? modulesRaw : [];

                                        const timingBadge = timing === 'NOW'
                                            ? 'bg-green-500/10 text-green-300 border-green-500/20'
                                            : timing === 'SOON'
                                                ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20'
                                                : 'bg-gray-500/10 text-gray-300 border-gray-500/20';

                                        const riskBadge = risk === 'ELEVATED'
                                            ? 'bg-red-500/10 text-red-300 border-red-500/20'
                                            : 'bg-gray-500/10 text-gray-300 border-gray-500/20';

                                        return (
                                            <div className="mt-3 space-y-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border', timingBadge)}>
                                                        {timing || '-'}
                                                    </span>
                                                    <div className="text-[10px] font-mono text-gray-500">
                                                        {score != null ? `Score ${Math.round(score)}` : '-'}
                                                        {confidence ? ` | ${confidence}` : ''}
                                                    </div>
                                                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border', riskBadge)}>
                                                        {risk || '-'}
                                                    </span>
                                                </div>

                                                <div className="rounded border border-gray-800 bg-gray-950/30 p-3">
                                                    <div className="text-[10px] uppercase font-bold text-gray-500">Execution Levels</div>
                                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                                        <div className="text-[10px] text-gray-500">Entry</div>
                                                        <div className="text-[10px] font-mono text-gray-200 text-right">{entry != null ? entry.toFixed(4) : '-'}</div>
                                                        <div className="text-[10px] text-gray-500">Stop</div>
                                                        <div className="text-[10px] font-mono text-gray-200 text-right">{stopLoss != null ? stopLoss.toFixed(4) : '-'}</div>
                                                    </div>
                                                    <div className="mt-2">
                                                        <div className="text-[10px] text-gray-500">TP</div>
                                                        <div className="text-[10px] font-mono text-gray-200 mt-1 break-words">
                                                            {takeProfits.length > 0 ? takeProfits.map((x) => x.toFixed(4)).join(' / ') : '-'}
                                                        </div>
                                                    </div>
                                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                                        <div className="text-[10px] text-gray-500">Setup</div>
                                                        <div className="text-[10px] font-mono text-gray-200 text-right">{setupType || '-'}</div>
                                                        <div className="text-[10px] text-gray-500">TF / Conf</div>
                                                        <div className="text-[10px] font-mono text-gray-200 text-right">{`${setupTf || '-'} / ${setupConf || '-'}`}</div>
                                                    </div>
                                                </div>

                                                <div className="rounded border border-gray-800 bg-gray-950/30 p-3">
                                                    <div className="text-[10px] uppercase font-bold text-gray-500">Metrics</div>
                                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                                        <div className="text-[10px] text-gray-500">RR</div>
                                                        <div className="text-[10px] font-mono text-gray-200 text-right">{rr != null ? rr.toFixed(2) : '-'}</div>
                                                        <div className="text-[10px] text-gray-500">RR min</div>
                                                        <div className="text-[10px] font-mono text-gray-200 text-right">{rrMin != null ? rrMin.toFixed(2) : '-'}</div>
                                                        <div className="text-[10px] text-gray-500">EV</div>
                                                        <div className="text-[10px] font-mono text-gray-200 text-right">{evR != null ? `${evR.toFixed(2)}R` : '-'}</div>
                                                    </div>
                                                </div>

                                                <div className="rounded border border-gray-800 bg-gray-950/30 p-3">
                                                    <div className="text-[10px] uppercase font-bold text-gray-500">Modules</div>
                                                    <div className="mt-2 space-y-2">
                                                        {modules.length === 0 ? (
                                                            <div className="text-sm text-gray-400">No modules.</div>
                                                        ) : (
                                                            modules.map((m, idx) => {
                                                                const mod = isRecord(m) ? m : null;
                                                                const title = mod && typeof mod.title === 'string' ? mod.title : 'Module';
                                                                const status = mod && typeof mod.status === 'string' ? mod.status : '-';
                                                                const s = mod && typeof mod.score === 'number' ? mod.score : null;
                                                                const badgeClass = status === 'PASS'
                                                                    ? 'bg-green-500/10 text-green-300 border-green-500/20'
                                                                    : status === 'WARN'
                                                                        ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20'
                                                                        : status === 'FAIL'
                                                                            ? 'bg-red-500/10 text-red-300 border-red-500/20'
                                                                            : 'bg-gray-500/10 text-gray-300 border-gray-500/20';

                                                                return (
                                                                    <div key={idx} className="flex items-center justify-between gap-2">
                                                                        <div className="text-[10px] text-gray-300 truncate">{title}</div>
                                                                        <div className="flex items-center gap-2">
                                                                            {s != null ? (
                                                                                <div className="text-[10px] font-mono text-gray-500">{Math.round(s)}</div>
                                                                            ) : null}
                                                                            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border', badgeClass)}>
                                                                                {status}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()
                                )}
                            </div>
                        </div>

                        <div className="flex-shrink-0">
                            <ScoringView symbol={selectedAsset} direction={selected?.direction} />
                        </div>

                        <div className="flex-shrink-0">
                            <MultiTimeframeView symbol={selectedAsset} />
                        </div>

                        <div className="flex-shrink-0 opacity-80 hover:opacity-100 transition-opacity">
                            <div className="text-xs text-gray-500 uppercase font-bold mb-2 flex items-center gap-2">
                                <Brain className="w-3 h-3" /> Raw Feature Vector
                            </div>
                            <div className="bg-gray-900/50 p-4 rounded border border-gray-800 font-mono text-xs text-green-400 overflow-hidden">
                                [0.82, -0.45, 1.20, 0.05, -0.90, 0.33, ...]
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Dialog open={!!details} onOpenChange={(open) => !open && setDetails(null)}>
                <DialogContent className="bg-gray-900 border-gray-800 text-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center justify-between">
                            <span className="font-mono">{details?.symbol}</span>
                            {details?.direction ? (
                                <span className={cn(
                                    "text-[10px] font-bold px-2 py-0.5 rounded border",
                                    details.direction === 'LONG'
                                        ? 'bg-green-500/10 text-green-300 border-green-500/20'
                                        : 'bg-red-500/10 text-red-300 border-red-500/20'
                                )}>
                                    {details.direction}
                                </span>
                            ) : null}
                        </DialogTitle>
                        <DialogDescription className="text-gray-400">
                            MESO selection details
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded border border-gray-800 bg-gray-950/30 p-3">
                                <div className="text-[10px] uppercase font-bold text-gray-500">Class</div>
                                <div className="text-sm text-gray-200 mt-1">{details?.class || '-'}</div>
                            </div>
                            <div className="rounded border border-gray-800 bg-gray-950/30 p-3">
                                <div className="text-[10px] uppercase font-bold text-gray-500">Conviction</div>
                                <div className="text-sm font-mono text-gray-200 mt-1">{details ? Math.round(details.score) : '-'}</div>
                            </div>
                        </div>

                        <div className="rounded border border-gray-800 bg-gray-950/30 p-3">
                            <div className="text-[10px] uppercase font-bold text-gray-500">Reason</div>
                            <div className="text-sm text-gray-200 mt-1">{details?.reason || '-'}</div>
                        </div>

                        <div className="rounded border border-gray-800 bg-gray-950/30 p-3">
                            <div className="text-[10px] uppercase font-bold text-gray-500">Lab Report</div>
                            {labLoading ? (
                                <div className="text-sm text-gray-300 mt-1">Loading...</div>
                            ) : labError ? (
                                <div className="text-sm text-red-300 mt-1">{labError}</div>
                            ) : (
                                (() => {
                                    if (!isRecord(labReport)) {
                                        return <div className="text-sm text-gray-400 mt-1">No data.</div>;
                                    }

                                    const decision = isRecord(labReport.decision) ? labReport.decision : null;
                                    const timing = decision && typeof decision.timing === 'string' ? decision.timing : null;
                                    const confidence = decision && typeof decision.confidence === 'string' ? decision.confidence : null;
                                    const score = decision && typeof decision.score === 'number' ? decision.score : null;
                                    const risk = decision && typeof decision.risk === 'string' ? decision.risk : null;
                                    const reason = decision && typeof decision.reason === 'string' ? decision.reason : null;

                                    const summary = isRecord(labReport.summary) ? labReport.summary : null;
                                    const direction = summary && typeof summary.direction === 'string' ? summary.direction : null;

                                    const modulesRaw = labReport.modules;
                                    const modules = Array.isArray(modulesRaw) ? modulesRaw : [];

                                    const levels = isRecord(labReport.levels) ? labReport.levels : null;
                                    const entry = levels && typeof levels.entry === 'number' ? levels.entry : null;
                                    const stopLoss = levels && typeof levels.stopLoss === 'number' ? levels.stopLoss : null;
                                    const takeProfits = levels && Array.isArray(levels.takeProfits) ? levels.takeProfits.filter((x) => typeof x === 'number') : [];

                                    const metrics = isRecord(labReport.metrics) ? labReport.metrics : null;
                                    const rr = metrics && typeof metrics.rr === 'number' ? metrics.rr : null;
                                    const rrMin = metrics && typeof metrics.rrMin === 'number' ? metrics.rrMin : null;
                                    const evR = metrics && typeof metrics.evR === 'number' ? metrics.evR : null;

                                    return (
                                        <div className="space-y-2 mt-2">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="rounded border border-gray-800 bg-gray-950/30 p-3">
                                                    <div className="text-[10px] uppercase font-bold text-gray-500">Direction</div>
                                                    <div className="text-sm font-mono text-gray-200 mt-1">{direction || '-'}</div>
                                                </div>
                                                <div className="rounded border border-gray-800 bg-gray-950/30 p-3">
                                                    <div className="text-[10px] uppercase font-bold text-gray-500">Decision</div>
                                                    <div className="text-sm font-mono text-gray-200 mt-1">{timing || '-'}</div>
                                                    <div className="text-[10px] text-gray-500 mt-1">
                                                        {score != null ? `Score ${Math.round(score)}` : '-'}
                                                        {confidence ? ` | ${confidence}` : ''}
                                                        {risk ? ` | ${risk}` : ''}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="rounded border border-gray-800 bg-gray-950/30 p-3">
                                                <div className="text-[10px] uppercase font-bold text-gray-500">Modules</div>
                                                <div className="mt-2 space-y-2">
                                                    {modules.length === 0 ? (
                                                        <div className="text-sm text-gray-400">No modules.</div>
                                                    ) : (
                                                        modules.slice(0, 8).map((m, idx) => {
                                                            const mod = isRecord(m) ? m : null;
                                                            const title = mod && typeof mod.title === 'string' ? mod.title : 'Module';
                                                            const status = mod && typeof mod.status === 'string' ? mod.status : '-';
                                                            const s = mod && typeof mod.score === 'number' ? mod.score : null;
                                                            const sum = mod && typeof mod.summary === 'string' ? mod.summary : '';
                                                            const badgeClass = status === 'PASS'
                                                                ? 'bg-green-500/10 text-green-300 border-green-500/20'
                                                                : status === 'WARN'
                                                                    ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20'
                                                                    : status === 'FAIL'
                                                                        ? 'bg-red-500/10 text-red-300 border-red-500/20'
                                                                        : 'bg-gray-500/10 text-gray-300 border-gray-500/20';

                                                            return (
                                                                <div key={idx} className="rounded border border-gray-800 bg-gray-950/30 p-2">
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <div className="text-sm text-gray-200">{title}</div>
                                                                        <div className="flex items-center gap-2">
                                                                            {s != null ? (
                                                                                <div className="text-[10px] font-mono text-gray-500">{Math.round(s)}</div>
                                                                            ) : null}
                                                                            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border', badgeClass)}>
                                                                                {status}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    {sum ? (
                                                                        <div className="text-[10px] text-gray-400 mt-1">{sum}</div>
                                                                    ) : null}
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>

                                            <div className="rounded border border-gray-800 bg-gray-950/30 p-3">
                                                <div className="text-[10px] uppercase font-bold text-gray-500">Execution Levels</div>
                                                <div className="mt-2 grid grid-cols-2 gap-2">
                                                    <div className="text-[10px] text-gray-500">Entry</div>
                                                    <div className="text-[10px] font-mono text-gray-200 text-right">{entry != null ? entry.toFixed(4) : '-'}</div>
                                                    <div className="text-[10px] text-gray-500">Stop</div>
                                                    <div className="text-[10px] font-mono text-gray-200 text-right">{stopLoss != null ? stopLoss.toFixed(4) : '-'}</div>
                                                </div>
                                                <div className="mt-2">
                                                    <div className="text-[10px] text-gray-500">TP</div>
                                                    <div className="text-[10px] font-mono text-gray-200 mt-1 break-words">
                                                        {takeProfits.length > 0 ? takeProfits.map((x) => x.toFixed(4)).join(' / ') : '-'}
                                                    </div>
                                                </div>
                                                <div className="mt-2 grid grid-cols-2 gap-2">
                                                    <div className="text-[10px] text-gray-500">RR</div>
                                                    <div className="text-[10px] font-mono text-gray-200 text-right">{rr != null ? rr.toFixed(2) : '-'}</div>
                                                    <div className="text-[10px] text-gray-500">EV</div>
                                                    <div className="text-[10px] font-mono text-gray-200 text-right">{evR != null ? `${evR.toFixed(2)}R` : '-'}</div>
                                                    <div className="text-[10px] text-gray-500">RR min</div>
                                                    <div className="text-[10px] font-mono text-gray-200 text-right">{rrMin != null ? rrMin.toFixed(2) : '-'}</div>
                                                </div>
                                            </div>

                                            <div className="rounded border border-gray-800 bg-gray-950/30 p-3">
                                                <div className="text-[10px] uppercase font-bold text-gray-500">Why</div>
                                                <div className="text-sm text-gray-200 mt-1">{reason || '-'}</div>
                                            </div>
                                        </div>
                                    );
                                })()
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
