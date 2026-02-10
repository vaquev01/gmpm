import { useState } from 'react';
import { Card, Badge, Metric, Spinner, ErrorBox, ProgressBar, TabBar, fmt, trendBadgeVariant } from '../ui/primitives';
import { useTerminal } from '../../store/useTerminal';
import { useFred, useMacro, useRegime, type MacroData, type FredData, type FredSeries, type RegimeData } from '../../hooks/useApi';

type MacroResponse = MacroData;
type FredSummary = NonNullable<FredData['summary']>;
type RegimeResponse = RegimeData;

function regimeColor(r: string) {
  if (r === 'GOLDILOCKS' || r === 'REFLATION') return 'text-emerald-400';
  if (r === 'STAGFLATION' || r === 'DEFLATION') return 'text-red-400';
  if (r === 'OVERHEATING') return 'text-amber-400';
  return 'text-blue-400';
}

function LiveTicker({ macro, fred }: { macro?: MacroResponse['macro']; fred?: FredSummary }) {
  if (!macro && !fred) return <div className="w-full bg-white/3 border-y border-white/6 py-2 h-8 animate-pulse rounded" />;
  const items = [
    fred?.gdp?.value != null && `GROWTH: Real GDP ${fmt(fred.gdp.value, 0)}B (${fred.gdp.trend})`,
    fred?.inflation?.cpiYoY != null && `INFLATION: CPI YoY ${fmt(fred.inflation.cpiYoY, 1)}% (${fred.inflation.trend})`,
    macro && `VIX: ${fmt(macro.vix, 1)}`,
    fred?.rates && `10Y: ${fmt(fred.rates.treasury10y)}% | Curve: ${fmt(fred.rates.yieldCurve)}% (${fred.rates.curveStatus})`,
    macro && `DXY: ${fmt(macro.dollarIndex, 1)}`,
    fred?.credit && `HY Spread: ${fmt(fred.credit.hySpread)}% (${fred.credit.condition})`,
    macro?.fearGreed && `Fear&Greed: ${macro.fearGreed.value} (${macro.fearGreed.classification})`,
  ].filter(Boolean);

  return (
    <div className="w-full bg-white/3 border-y border-white/6 py-2 overflow-hidden flex items-center gap-4 rounded">
      <div className="px-3 text-[10px] font-bold text-red-500 animate-pulse whitespace-nowrap shrink-0">LIVE</div>
      <div className="flex gap-10 overflow-x-auto whitespace-nowrap text-[11px] text-white/50 font-mono tabular-nums scrollbar-none">
        {items.map((item, i) => <span key={i}>{item}</span>)}
      </div>
    </div>
  );
}

function RegimePanel({ data }: { data: RegimeResponse }) {
  const s = data.snapshot;
  if (!s) return null;
  const axes = Object.entries(s.axes || {});

  return (
    <Card title="Regime Analysis" subtitle={`Updated ${new Date(s.timestamp).toLocaleTimeString()}`}>
      <div className="flex items-center gap-3 mb-5">
        <span className={`text-2xl font-black ${regimeColor(s.regime)}`}>{s.regime}</span>
        <Badge text={s.regimeConfidence} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {axes.map(([name, axis]) => {
          const dirColor = axis.score > 0 || axis.direction.includes('↑') ? 'text-emerald-400'
            : axis.score < 0 || axis.direction.includes('↓') ? 'text-red-400' : 'text-white/40';
          return (
            <div key={name} className="rounded-lg bg-white/[0.04] p-3 border border-white/5">
              <div className="text-[10px] text-white/35 uppercase font-bold tracking-wider mb-1.5">{axis.name || name}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black tabular-nums">{fmt(axis.score, 1)}</span>
                <span className={`text-[11px] font-bold ${dirColor}`}>{axis.direction}</span>
              </div>
              <ProgressBar value={Math.abs(axis.score)} max={100} color={axis.score > 0 ? 'bg-emerald-500' : 'bg-red-500'} />
              <div className="text-[9px] text-white/20 mt-1">{axis.confidence}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function EconomicDashboard({ fred }: { fred: FredSummary }) {
  const sections = [
    {
      title: 'Growth', icon: '📊',
      metrics: [
        { label: 'Real GDP', value: fred.gdp?.value != null ? `${fmt(fred.gdp.value, 0)}B` : '--', trend: fred.gdp?.trend || 'UNKNOWN' },
      ],
    },
    {
      title: 'Inflation', icon: '🔥',
      metrics: [
        { label: 'CPI YoY', value: fred.inflation?.cpiYoY != null ? `${fmt(fred.inflation.cpiYoY, 1)}%` : '--', trend: fred.inflation?.trend || 'UNKNOWN' },
        { label: 'Core CPI', value: fred.inflation?.coreCpi != null ? `${fmt(fred.inflation.coreCpi, 1)}` : '--', trend: '' },
        { label: 'PCE', value: fred.inflation?.pce != null ? `${fmt(fred.inflation.pce, 1)}` : '--', trend: '' },
      ],
    },
    {
      title: 'Employment', icon: '👷',
      metrics: [
        { label: 'Unemployment', value: fred.employment?.unemploymentRate != null ? `${fred.employment.unemploymentRate}%` : '--', trend: fred.employment?.trend || 'UNKNOWN' },
        { label: 'NFP', value: fred.employment?.nfp != null ? `${fmt(fred.employment.nfp, 0)}K` : '--', trend: '' },
        { label: 'Init Claims', value: fred.employment?.initialClaims != null ? `${fmt(fred.employment.initialClaims, 0)}K` : '--', trend: '' },
      ],
    },
    {
      title: 'Rates', icon: '🏛️',
      metrics: [
        { label: 'Fed Funds', value: fred.rates?.fedFunds != null ? `${fred.rates.fedFunds}%` : '--', trend: '' },
        { label: '10Y', value: fred.rates?.treasury10y != null ? `${fred.rates.treasury10y}%` : '--', trend: '' },
        { label: 'Yield Curve', value: fred.rates?.yieldCurve != null ? `${fmt(fred.rates.yieldCurve)}%` : '--', trend: fred.rates?.curveStatus || 'UNKNOWN' },
      ],
    },
    {
      title: 'Credit', icon: '💳',
      metrics: [
        { label: 'AAA Spread', value: fred.credit?.aaaSpread != null ? `${fmt(fred.credit.aaaSpread)}%` : '--', trend: '' },
        { label: 'HY Spread', value: fred.credit?.hySpread != null ? `${fmt(fred.credit.hySpread)}%` : '--', trend: fred.credit?.condition || 'UNKNOWN' },
      ],
    },
    {
      title: 'Sentiment', icon: '🧠',
      metrics: [
        { label: 'U. Michigan', value: fred.sentiment?.consumerSentiment != null ? `${fred.sentiment.consumerSentiment}` : '--', trend: fred.sentiment?.condition || 'UNKNOWN' },
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {sections.map((s) => (
        <Card key={s.title} title={`${s.icon} ${s.title}`}>
          <div className="space-y-3">
            {s.metrics.map((m) => (
              <div key={m.label} className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-white/30 uppercase">{m.label}</div>
                  <div className="text-lg font-bold tabular-nums">{m.value}</div>
                </div>
                {m.trend && <Badge text={m.trend} variant={trendBadgeVariant(m.trend)} />}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function FredSeriesTable({ data }: { data: Record<string, FredSeries> }) {
  const entries = Object.values(data).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Card title="All FRED Series" subtitle={`${entries.length} series loaded`}>
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#08080c]">
            <tr className="text-left text-[10px] text-white/25 uppercase">
              <th className="pb-2 pr-3">Series</th>
              <th className="pb-2 pr-3">Name</th>
              <th className="pb-2 pr-3 text-right">Value</th>
              <th className="pb-2 pr-3">Unit</th>
              <th className="pb-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((s) => (
              <tr key={s.seriesId} className="border-t border-white/4 hover:bg-white/3">
                <td className="py-1.5 pr-3 font-mono text-[11px] text-amber-400/80 font-bold">{s.seriesId}</td>
                <td className="py-1.5 pr-3 text-white/50 text-xs">{s.name}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums font-bold">{fmt(s.value, s.value > 100 ? 0 : 2)}</td>
                <td className="py-1.5 pr-3 text-[10px] text-white/25">{s.unit}</td>
                <td className="py-1.5 text-[10px] text-white/25">{s.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function MacroView() {
  const fred = useFred();
  const macro = useMacro();
  const regime = useRegime();
  const { setView } = useTerminal();
  const [tab, setTab] = useState('overview');

  if (fred.isLoading && macro.isLoading) return <Spinner />;
  if (fred.isError) return <ErrorBox message="Failed to load FRED data" onRetry={() => fred.refetch()} />;

  const summary = fred.data?.summary;
  const m = macro.data?.macro;

  return (
    <div className="space-y-5">
      <LiveTicker macro={m} fred={summary || undefined} />

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black tracking-tight">Macro Oracle</h2>
        <TabBar
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'regime', label: 'Regime' },
            { id: 'series', label: 'All Series' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {/* Real-time market metrics */}
      {m && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <Card><Metric label="VIX" value={fmt(m.vix, 1)} sub={`${m.vixChange > 0 ? '+' : ''}${fmt(m.vixChange)}%`} color={m.vix > 25 ? 'text-red-400' : m.vix < 18 ? 'text-emerald-400' : 'text-amber-400'} /></Card>
          <Card><Metric label="10Y Treasury" value={`${fmt(m.treasury10y)}%`} /></Card>
          <Card><Metric label="2Y Treasury" value={`${fmt(m.treasury2y)}%`} /></Card>
          <Card><Metric label="30Y Treasury" value={`${fmt(m.treasury30y)}%`} /></Card>
          <Card><Metric label="Yield Curve" value={`${fmt(m.yieldCurve)}%`} color={m.yieldCurve < 0 ? 'text-red-400' : 'text-emerald-400'} sub={m.yieldCurve < 0 ? 'INVERTED' : 'NORMAL'} /></Card>
          <Card><Metric label="Dollar Index" value={fmt(m.dollarIndex, 1)} sub={`${m.dollarIndexChange > 0 ? '+' : ''}${fmt(m.dollarIndexChange)}%`} /></Card>
          <Card><Metric label="Fear & Greed" value={m.fearGreed?.value ?? '--'} sub={m.fearGreed?.classification || ''} color={m.fearGreed && m.fearGreed.value < 30 ? 'text-red-400' : m.fearGreed && m.fearGreed.value > 60 ? 'text-emerald-400' : 'text-amber-400'} /></Card>
        </div>
      )}

      {tab === 'overview' && summary && <EconomicDashboard fred={summary} />}
      {tab === 'regime' && regime.data && <RegimePanel data={regime.data} />}
      {tab === 'series' && fred.data?.data && <FredSeriesTable data={fred.data.data} />}

      {/* Flow Navigation: Macro → Meso + Aggregators */}
      <div className="rounded-xl border border-white/6 bg-white/[0.02] p-4">
        <div className="text-[10px] text-white/20 uppercase font-bold tracking-wider mb-3">Next in Pipeline</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button onClick={() => setView('meso')} className="text-left rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 hover:bg-amber-500/10 transition-all group">
            <div className="text-xs font-bold text-amber-400 group-hover:text-amber-300">MESO Analysis →</div>
            <div className="text-[10px] text-white/30 mt-0.5">Drill into asset classes, sectors, tilts & allowed instruments</div>
          </button>
          <button onClick={() => setView('currency')} className="text-left rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 hover:bg-blue-500/10 transition-all group">
            <div className="text-xs font-bold text-blue-400 group-hover:text-blue-300">FX Strength →</div>
            <div className="text-[10px] text-white/30 mt-0.5">Currency strength, COT positioning & best pairs</div>
          </button>
          <button onClick={() => setView('liquidity')} className="text-left rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 hover:bg-cyan-500/10 transition-all group">
            <div className="text-xs font-bold text-cyan-400 group-hover:text-cyan-300">Liquidity Map →</div>
            <div className="text-[10px] text-white/30 mt-0.5">Volume profiles, sweep zones & execution timing</div>
          </button>
        </div>
      </div>
    </div>
  );
}
