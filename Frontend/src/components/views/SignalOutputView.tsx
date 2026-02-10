import { useState } from 'react';
import { Card, Badge, Metric, Spinner, ErrorBox, ProgressBar, TabBar, fmt, pctFmt, cleanSymbol } from '../ui/primitives';
import { useMeso, useRegime } from '../../hooks/useApi';

// --- TYPES ---
interface TradeSignal {
  id: string; asset: string; direction: 'LONG' | 'SHORT';
  score: number; confidence: string;
  reason: string; assetClass: string;
  mesoAligned: boolean;
  timestamp: string;
}

interface MacroContext {
  regime: string; regimeConfidence?: string;
  vix?: number; yieldCurve?: number; dollarIndex?: number;
  fearGreed?: number;
}

function useSignalData() {
  const meso = useMeso();
  const regime = useRegime();

  // Only show meaningful signals (score >= 40) and sort by quality
  const allInstruments = meso.data?.microInputs?.allowedInstruments || [];
  const signals: TradeSignal[] = allInstruments
    .filter(a => a.score >= 40)
    .map((a, i) => ({
      id: `sig-${i}-${a.symbol}`,
      asset: a.symbol,
      direction: a.direction,
      score: Math.min(a.score, 100),
      confidence: a.score >= 75 ? 'HIGH' : a.score >= 55 ? 'MEDIUM' : 'LOW',
      reason: a.reason,
      assetClass: a.class,
      mesoAligned: true,
      timestamp: meso.data?.timestamp || new Date().toISOString(),
    }));

  const macro: MacroContext | undefined = meso.data ? {
    regime: regime.data?.snapshot?.regime || meso.data.executiveSummary.regimeLabel,
    regimeConfidence: regime.data?.snapshot?.regimeConfidence,
    vix: meso.data.executiveSummary.vix ?? undefined,
    yieldCurve: meso.data.executiveSummary.yieldCurve ?? undefined,
    dollarIndex: meso.data.executiveSummary.dollarIndex ?? undefined,
    fearGreed: (() => { const fg = meso.data.executiveSummary.fearGreed; return typeof fg === 'object' && fg !== null ? fg.value : fg ?? undefined; })(),
  } : undefined;

  const signalStats = {
    total: allInstruments.length,
    filtered: signals.length,
    high: signals.filter(s => s.confidence === 'HIGH').length,
    medium: signals.filter(s => s.confidence === 'MEDIUM').length,
    low: signals.filter(s => s.confidence === 'LOW').length,
  };

  return { signals, macro, warnings: meso.data?.summary?.riskWarnings || [], summary: meso.data?.executiveSummary.oneLineSummary, signalStats, isLoading: meso.isLoading, isError: meso.isError, refetch: meso.refetch };
}

const scoreColor = (s: number) => s >= 80 ? 'text-emerald-400' : s >= 60 ? 'text-amber-400' : 'text-red-400';
const dirBadge = (d: string): 'bullish' | 'bearish' => d === 'LONG' ? 'bullish' : 'bearish';

function MacroContextPanel({ macro }: { macro?: MacroContext }) {
  if (!macro) return null;
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4 flex flex-wrap gap-6 items-center">
      {macro.regime && (
        <div>
          <span className="text-[10px] text-white/30 uppercase block">Regime</span>
          <span className="text-sm font-black text-amber-400">{macro.regime}</span>
          {macro.regimeConfidence && <span className="text-[10px] text-white/20 ml-2">{macro.regimeConfidence}</span>}
        </div>
      )}
      {macro.vix != null && <Metric label="VIX" value={fmt(macro.vix, 1)} small />}
      {macro.yieldCurve != null && <Metric label="Curve" value={`${fmt(macro.yieldCurve)}%`} small />}
      {macro.dollarIndex != null && <Metric label="DXY" value={fmt(macro.dollarIndex, 1)} small />}
      {macro.fearGreed != null && <Metric label="F&G" value={macro.fearGreed} small />}
    </div>
  );
}

function SignalCard({ signal }: { signal: TradeSignal }) {
  return (
    <div className={`rounded-xl border p-4 transition-all ${
      signal.score >= 80 ? 'border-emerald-500/30 bg-emerald-500/5' :
      signal.score >= 60 ? 'border-amber-500/20 bg-amber-500/5' : 'border-white/8 bg-white/[0.02]'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`text-2xl font-black ${scoreColor(signal.score)}`}>{Math.round(signal.score)}</div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black font-mono">{cleanSymbol(signal.asset)}</span>
              <Badge text={signal.direction} variant={dirBadge(signal.direction)} />
              <Badge text={signal.confidence} variant={signal.confidence === 'HIGH' ? 'success' : signal.confidence === 'MEDIUM' ? 'warning' : 'default'} />
              <Badge text={signal.assetClass} variant="info" />
            </div>
            <div className="text-[10px] text-white/30 mt-0.5">
              {signal.mesoAligned && <span className="text-emerald-400 mr-2">MESO ALIGNED ✓</span>}
            </div>
          </div>
        </div>
      </div>
      <div className="text-[11px] text-white/40 mt-2">{signal.reason}</div>
      <div className="text-[10px] text-white/15 mt-1">{new Date(signal.timestamp).toLocaleString()}</div>
    </div>
  );
}

export function SignalOutputView() {
  const { signals, macro, warnings, summary, signalStats, isLoading, isError, refetch } = useSignalData();
  const [filter, setFilter] = useState<'all' | 'long' | 'short'>('all');

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorBox message="Failed to load signal data" onRetry={() => refetch()} />;

  const filtered = signals.filter(s => filter === 'all' || (filter === 'long' ? s.direction === 'LONG' : s.direction === 'SHORT'));
  const sorted = [...filtered].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight">Signal Output</h2>
          <div className="flex gap-3 text-[11px] mt-0.5">
            <span className="text-white/25">{signalStats.filtered}/{signalStats.total} instruments</span>
            <span className="text-emerald-400 font-bold">{signalStats.high} HIGH</span>
            <span className="text-amber-400 font-bold">{signalStats.medium} MED</span>
            <span className="text-white/30">{signalStats.low} LOW</span>
          </div>
        </div>
        <TabBar
          tabs={[
            { id: 'all', label: 'ALL' },
            { id: 'long', label: 'LONG' },
            { id: 'short', label: 'SHORT' },
          ]}
          active={filter}
          onChange={(id) => setFilter(id as 'all' | 'long' | 'short')}
        />
      </div>

      <MacroContextPanel macro={macro} />

      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/15 px-3 py-1.5 rounded-lg">⚠️ {w}</div>
          ))}
        </div>
      )}

      {summary && (
        <div className="text-sm text-white/40 bg-white/[0.02] border border-white/5 rounded-lg p-3">{summary}</div>
      )}

      <div className="space-y-3">
        {sorted.map((s) => <SignalCard key={s.id} signal={s} />)}
        {sorted.length === 0 && <div className="text-sm text-white/30 text-center py-8">No signals match filter</div>}
      </div>
    </div>
  );
}
