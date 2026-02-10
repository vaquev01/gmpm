import { useState } from 'react';
import { Card, Badge, Metric, Spinner, ErrorBox, ProgressBar, TabBar, fmt, pctFmt, trendBadgeVariant, cleanSymbol } from '../ui/primitives';
import { useTerminal } from '../../store/useTerminal';
import { useMeso } from '../../hooks/useApi';

// --- TYPES (matching legacy MesoView) ---
interface ClassAnalysis {
  class: string; name: string;
  expectation: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'MIXED';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  direction: 'LONG' | 'SHORT' | 'AVOID';
  drivers: string[];
  liquidityScore: number;
  volatilityRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  topPicks: string[];
  avoidList: string[];
  performance: {
    avgChange: number;
    topPerformer: { symbol: string; change: number } | null;
    worstPerformer: { symbol: string; change: number } | null;
  };
}

interface SectorAnalysis {
  sector: string; parentClass: string;
  expectation: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  momentum: number; relativeStrength: number;
}

interface MesoTilt {
  rank: number; direction: 'LONG' | 'SHORT' | 'RELATIVE';
  asset: string; rationale: string; confidence: string;
}

interface TemporalFocus {
  weeklyThesis: string;
  dailyFocus: string[];
  keyLevels: { asset: string; level: number; type: 'support' | 'resistance'; significance: string }[];
  catalysts: { event: string; timing: string; impact: string; affectedClasses: string[] }[];
  actionPlan: { timeframe: string; action: string; rationale: string }[];
}

interface ExecutiveSummary {
  marketBias: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
  regimeLabel: string;
  vix: number | null; yieldCurve: number | null; dollarIndex: number | null;
  fearGreed: { value: number; classification: string } | number | null;
  classBreakdown: { bullish: string[]; bearish: string[]; neutral: string[] };
  oneLineSummary: string;
}

interface AllowedInstrument {
  symbol: string; direction: 'LONG' | 'SHORT'; class: string; reason: string; score: number;
}
interface ProhibitedInstrument { symbol: string; reason: string }

interface MesoData {
  success: boolean; timestamp: string;
  executiveSummary: ExecutiveSummary;
  regime: { type: string; confidence: string; drivers: string[]; axes: Record<string, { direction: string; label?: string; name?: string; score?: number; confidence?: string; reasons?: string[] }> };
  temporalFocus: TemporalFocus;
  classes: ClassAnalysis[];
  sectors: SectorAnalysis[];
  summary: {
    topOpportunities: { class: string; picks: string[]; confidence: string; currentPerformance: number }[];
    riskWarnings: string[];
    tiltsActive: number; prohibitionsActive: number;
  };
  tilts: MesoTilt[];
  prohibitions: string[];
  macro: { vix?: number; treasury10y?: number; treasury2y?: number; yieldCurve?: number; dollarIndex?: number; fearGreed?: { value: number; classification: string } | number | null };
  microInputs?: {
    allowedInstruments: AllowedInstrument[];
    prohibitedInstruments: ProhibitedInstrument[];
    favoredDirection?: 'LONG' | 'SHORT' | 'NEUTRAL';
    volatilityContext?: 'HIGH' | 'NORMAL' | 'LOW';
  };
}


const expectationVariant = (e: string): 'bullish' | 'bearish' | 'neutral' | 'warning' => {
  if (e === 'BULLISH') return 'bullish';
  if (e === 'BEARISH') return 'bearish';
  if (e === 'MIXED') return 'warning';
  return 'neutral';
};

const dirColor = (d: string) => d === 'LONG' ? 'text-emerald-400' : d === 'SHORT' ? 'text-red-400' : 'text-white/30';

function ExecutiveBanner({ data }: { data: ExecutiveSummary }) {
  const biasColor = data.marketBias === 'RISK_ON' ? 'border-emerald-500/40 bg-emerald-500/5'
    : data.marketBias === 'RISK_OFF' ? 'border-red-500/40 bg-red-500/5' : 'border-white/10 bg-white/3';

  return (
    <div className={`rounded-xl border p-5 ${biasColor}`}>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Badge text={data.marketBias.replace('_', ' ')} variant={data.marketBias === 'RISK_ON' ? 'success' : data.marketBias === 'RISK_OFF' ? 'danger' : 'default'} />
            <Badge text={data.regimeLabel} variant="info" />
          </div>
          <p className="text-sm text-white/70 mt-2">{data.oneLineSummary}</p>
        </div>
        <div className="flex gap-6 text-center">
          {data.vix != null && <Metric label="VIX" value={fmt(data.vix, 1)} small />}
          {data.yieldCurve != null && <Metric label="Curve" value={`${fmt(data.yieldCurve)}%`} small color={data.yieldCurve < 0 ? 'text-red-400' : 'text-emerald-400'} />}
          {data.dollarIndex != null && <Metric label="DXY" value={fmt(data.dollarIndex, 1)} small />}
          {data.fearGreed != null && <Metric label="F&G" value={typeof data.fearGreed === 'object' ? data.fearGreed.value : data.fearGreed} sub={typeof data.fearGreed === 'object' ? data.fearGreed.classification : ''} small color={((typeof data.fearGreed === 'object' ? data.fearGreed.value : data.fearGreed) ?? 50) < 30 ? 'text-red-400' : ((typeof data.fearGreed === 'object' ? data.fearGreed.value : data.fearGreed) ?? 50) > 60 ? 'text-emerald-400' : 'text-amber-400'} />}
        </div>
      </div>
      <div className="flex gap-4 mt-3 text-[11px]">
        {data.classBreakdown.bullish.length > 0 && (
          <span className="text-emerald-400">Bullish: {data.classBreakdown.bullish.join(', ')}</span>
        )}
        {data.classBreakdown.bearish.length > 0 && (
          <span className="text-red-400">Bearish: {data.classBreakdown.bearish.join(', ')}</span>
        )}
        {data.classBreakdown.neutral.length > 0 && (
          <span className="text-white/30">Neutral: {data.classBreakdown.neutral.join(', ')}</span>
        )}
      </div>
    </div>
  );
}

function AssetClassCard({ data }: { data: ClassAnalysis }) {
  const expColor = data.expectation === 'BULLISH' ? 'border-l-emerald-500' : data.expectation === 'BEARISH' ? 'border-l-red-500' : data.expectation === 'MIXED' ? 'border-l-amber-500' : 'border-l-white/20';
  const liqColor = data.liquidityScore > 70 ? 'bg-emerald-500' : data.liquidityScore > 40 ? 'bg-amber-500' : 'bg-red-500';
  const volColor = data.volatilityRisk === 'HIGH' ? 'text-red-400' : data.volatilityRisk === 'LOW' ? 'text-emerald-400' : 'text-amber-400';

  return (
    <div className={`rounded-xl border border-white/8 bg-white/[0.03] p-4 border-l-4 ${expColor}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-bold">{data.name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <Badge text={data.expectation} variant={expectationVariant(data.expectation)} />
            <span className={`text-[11px] font-bold ${dirColor(data.direction)}`}>
              {data.direction === 'AVOID' ? 'NO-TRADE' : `DO ${data.direction}`}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-white/30 uppercase">Confidence</div>
          <div className={`text-sm font-bold ${data.confidence === 'HIGH' ? 'text-emerald-400' : data.confidence === 'MEDIUM' ? 'text-amber-400' : 'text-white/30'}`}>
            {data.confidence}
          </div>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-[10px] text-white/30 mb-1">
          <span>Liquidity</span><span className="font-mono">{data.liquidityScore}/100</span>
        </div>
        <ProgressBar value={data.liquidityScore} color={liqColor} />
      </div>

      <div className="flex items-center justify-between text-[11px] mb-3">
        <span className="text-white/30">Vol Risk</span>
        <span className={`font-bold ${volColor}`}>{data.volatilityRisk}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px] border-t border-white/6 pt-2 mb-3">
        <div className="text-center">
          <div className="text-[10px] text-white/25">Avg Change</div>
          <div className={`font-mono font-bold tabular-nums ${data.performance.avgChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {pctFmt(data.performance.avgChange)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-white/25">Top</div>
          <div className="font-mono text-white/60 truncate">{data.performance.topPerformer?.symbol || '--'}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-white/25">Worst</div>
          <div className="font-mono text-white/60 truncate">{data.performance.worstPerformer?.symbol || '--'}</div>
        </div>
      </div>

      {data.drivers.length > 0 && (
        <div className="border-t border-white/6 pt-2 mb-3">
          <div className="text-[10px] text-white/25 mb-1">DRIVERS</div>
          <div className="flex flex-wrap gap-1">
            {data.drivers.slice(0, 4).map((d, i) => (
              <span key={i} className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-white/50">{d}</span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 border-t border-white/6 pt-2">
        <div>
          <div className="text-[10px] text-emerald-500/70 uppercase mb-1">Top Picks</div>
          {data.topPicks.length > 0 ? data.topPicks.map((p, i) => (
            <div key={i} className="text-[11px] font-mono text-white/60">{p}</div>
          )) : <div className="text-[11px] text-white/20">--</div>}
        </div>
        <div>
          <div className="text-[10px] text-red-500/70 uppercase mb-1">Avoid</div>
          {data.avoidList.length > 0 ? data.avoidList.map((a, i) => (
            <div key={i} className="text-[11px] font-mono text-white/40">{a}</div>
          )) : <div className="text-[11px] text-white/20">--</div>}
        </div>
      </div>
    </div>
  );
}

function SectorsPanel({ sectors }: { sectors: SectorAnalysis[] }) {
  return (
    <Card title="Sector Analysis" subtitle={`${sectors.length} sectors`}>
      <div className="space-y-2">
        {sectors.map((s) => {
          const momColor = s.momentum > 20 ? 'text-emerald-400' : s.momentum < -20 ? 'text-red-400' : 'text-white/40';
          const rsColor = s.relativeStrength > 110 ? 'text-emerald-400' : s.relativeStrength < 90 ? 'text-red-400' : 'text-white/40';
          return (
            <div key={s.sector} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors">
              <div>
                <div className="text-sm font-bold">{s.sector}</div>
                <div className="text-[10px] text-white/25">{s.parentClass}</div>
              </div>
              <div className="flex items-center gap-5">
                <Badge text={s.expectation} variant={expectationVariant(s.expectation)} />
                <div className="text-center min-w-[50px]">
                  <div className="text-[9px] text-white/25">MOM</div>
                  <div className={`text-sm font-mono font-bold ${momColor}`}>{s.momentum > 0 ? '+' : ''}{s.momentum}</div>
                </div>
                <div className="text-center min-w-[50px]">
                  <div className="text-[9px] text-white/25">RS</div>
                  <div className={`text-sm font-mono font-bold ${rsColor}`}>{s.relativeStrength}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TiltsPanel({ tilts, prohibitions }: { tilts: MesoTilt[]; prohibitions: string[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Active Tilts" subtitle={`${tilts.length} active`}>
        {tilts.length === 0 ? <div className="text-sm text-white/20">No active tilts</div> : (
          <div className="space-y-2">
            {tilts.map((t, i) => (
              <div key={i} className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-white/25">#{t.rank}</span>
                    <span className="text-sm font-bold font-mono">{t.asset}</span>
                    <span className={`text-[10px] font-bold ${dirColor(t.direction)}`}>{t.direction}</span>
                  </div>
                  <Badge text={t.confidence} variant={t.confidence === 'HIGH' ? 'success' : t.confidence === 'MEDIUM' || t.confidence === 'PARTIAL' ? 'warning' : 'default'} />
                </div>
                <div className="text-[11px] text-white/40">{t.rationale}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Prohibitions" subtitle={`${prohibitions.length} active`}>
        {prohibitions.length === 0 ? <div className="text-sm text-white/20">No prohibitions</div> : (
          <div className="space-y-1">
            {prohibitions.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-red-400/80 p-2 rounded bg-red-500/5 border border-red-500/10">
                <span className="text-red-500">⛔</span> {p}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function TemporalPanel({ temporal }: { temporal: TemporalFocus }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card title="Weekly Thesis">
        <p className="text-sm text-white/60">{temporal.weeklyThesis}</p>
        {temporal.dailyFocus.length > 0 && (
          <div className="mt-3">
            <div className="text-[10px] text-white/25 uppercase mb-1">Daily Focus</div>
            {temporal.dailyFocus.map((f, i) => (
              <div key={i} className="text-[11px] text-white/50 py-0.5">{f}</div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Key Levels">
        {temporal.keyLevels.length === 0 ? <div className="text-sm text-white/20">No key levels</div> : (
          <div className="space-y-1.5">
            {temporal.keyLevels.map((l, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="font-mono font-bold">{l.asset}</span>
                <div className="flex items-center gap-2">
                  <Badge text={l.type.toUpperCase()} variant={l.type === 'support' ? 'success' : 'danger'} />
                  <span className="font-mono tabular-nums">{fmt(l.level, l.level > 100 ? 0 : 2)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Catalysts">
        {temporal.catalysts.length === 0 ? <div className="text-sm text-white/20">No catalysts</div> : (
          <div className="space-y-2">
            {temporal.catalysts.map((c, i) => (
              <div key={i} className="p-2 rounded bg-white/[0.02] border border-white/5">
                <div className="text-[11px] font-bold">{c.event}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-white/30">{c.timing}</span>
                  <Badge text={c.impact} variant={c.impact === 'HIGH' ? 'danger' : c.impact === 'MEDIUM' ? 'warning' : 'default'} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function MicroUniversePanel({ data }: { data: MesoData }) {
  const allowed = data.microInputs?.allowedInstruments || [];
  const prohibited = data.microInputs?.prohibitedInstruments || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Allowed Instruments" subtitle={`${allowed.length} instruments`}>
        {allowed.length === 0 ? <div className="text-sm text-white/20">None</div> : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {allowed.map((a) => (
              <div key={a.symbol} className="flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold">{cleanSymbol(a.symbol)}</span>
                    <Badge text={a.direction} variant={a.direction === 'LONG' ? 'bullish' : 'bearish'} />
                    <span className="text-[10px] font-mono font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">{Math.round(a.score)}</span>
                  </div>
                  <div className="text-[10px] text-white/30 mt-0.5">{a.class}</div>
                  <div className="text-[10px] text-white/25 mt-0.5 line-clamp-2">{a.reason}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Prohibited Instruments" subtitle={`${prohibited.length} blocked`}>
        {prohibited.length === 0 ? <div className="text-sm text-white/20">None</div> : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {prohibited.map((p) => (
              <div key={p.symbol} className="rounded-lg border border-red-500/10 bg-red-500/5 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-white/60">{cleanSymbol(p.symbol)}</span>
                  <Badge text="BLOCKED" variant="danger" />
                </div>
                <div className="text-[10px] text-white/25 mt-1">{p.reason}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export function MesoView() {
  const { data, isLoading, isError, refetch } = useMeso();
  const { setView } = useTerminal();
  const [tab, setTab] = useState('classes');

  if (isLoading) return <Spinner />;
  if (isError || !data?.success) return <ErrorBox message="Failed to load Meso analysis" onRetry={() => refetch()} />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black tracking-tight">Meso Analysis</h2>
        <TabBar
          tabs={[
            { id: 'classes', label: 'Asset Classes' },
            { id: 'sectors', label: 'Sectors' },
            { id: 'tilts', label: 'Tilts' },
            { id: 'temporal', label: 'Temporal' },
            { id: 'universe', label: 'Micro Universe' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      <ExecutiveBanner data={data.executiveSummary} />

      {/* Summary bar */}
      {data.summary && (
        <div className="flex gap-4 flex-wrap">
          {data.summary.riskWarnings.map((w, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/15 px-3 py-1.5 rounded-lg">
              ⚠️ {w}
            </div>
          ))}
        </div>
      )}

      {tab === 'classes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.classes.map((c) => <AssetClassCard key={c.class} data={c} />)}
        </div>
      )}

      {tab === 'sectors' && <SectorsPanel sectors={data.sectors} />}
      {tab === 'tilts' && <TiltsPanel tilts={data.tilts} prohibitions={data.prohibitions} />}
      {tab === 'temporal' && <TemporalPanel temporal={data.temporalFocus} />}
      {tab === 'universe' && <MicroUniversePanel data={data} />}

      {/* Flow Navigation: Meso → Micro + Aggregators + Execution */}
      <div className="rounded-xl border border-white/6 bg-white/[0.02] p-4">
        <div className="text-[10px] text-white/20 uppercase font-bold tracking-wider mb-3">Next in Pipeline</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button onClick={() => setView('micro')} className="text-left rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 hover:bg-amber-500/10 transition-all group">
            <div className="text-xs font-bold text-amber-400 group-hover:text-amber-300">MICRO Analysis →</div>
            <div className="text-[10px] text-white/30 mt-0.5">Deep technical analysis on allowed instruments</div>
          </button>
          <button onClick={() => setView('signals')} className="text-left rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 hover:bg-emerald-500/10 transition-all group">
            <div className="text-xs font-bold text-emerald-400 group-hover:text-emerald-300">Signals →</div>
            <div className="text-[10px] text-white/30 mt-0.5">Trade signals from {data.microInputs?.allowedInstruments?.length || 0} allowed instruments</div>
          </button>
          <button onClick={() => setView('currency')} className="text-left rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 hover:bg-blue-500/10 transition-all group">
            <div className="text-xs font-bold text-blue-400 group-hover:text-blue-300">FX Strength →</div>
            <div className="text-[10px] text-white/30 mt-0.5">Currency strength & COT for FX pairs</div>
          </button>
          <button onClick={() => setView('liquidity')} className="text-left rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 hover:bg-cyan-500/10 transition-all group">
            <div className="text-xs font-bold text-cyan-400 group-hover:text-cyan-300">Liquidity Map →</div>
            <div className="text-[10px] text-white/30 mt-0.5">Volume profiles & sweep timing for all classes</div>
          </button>
        </div>
      </div>
    </div>
  );
}
