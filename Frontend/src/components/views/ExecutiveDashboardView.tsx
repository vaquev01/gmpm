import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Metric, Spinner, StatusDot, ProgressBar, fmt, pctFmt, pctColor, priceFmt, trendBadgeVariant } from '../ui/primitives';
import { useTerminal } from '../../store/useTerminal';

function useHealth() {
  return useQuery<{ ok: boolean; ts: number }>({ queryKey: ['health'], queryFn: () => fetch('/api/health').then(r => r.json()), refetchInterval: 10_000 });
}
function useTest() {
  return useQuery<{ success: boolean; summary: { total: number; passed: number; failed: number; percentage: number }; tests: { name: string; passed: boolean }[] }>({
    queryKey: ['test'], queryFn: () => fetch('/api/test').then(r => r.json()), staleTime: 300_000,
  });
}
function useMacro() {
  return useQuery<{ success: boolean; macro?: { vix: number; vixChange: number; treasury10y: number; treasury2y: number; yieldCurve: number; dollarIndex: number; dollarIndexChange: number; fearGreed: { value: number; classification: string } | null } }>({
    queryKey: ['macro'], queryFn: () => fetch('/api/macro').then(r => r.json()), staleTime: 30_000, refetchInterval: 60_000,
  });
}
function useRegime() {
  return useQuery<{ success: boolean; snapshot?: { regime: string; regimeConfidence: string; axes: Record<string, { axis?: string; name?: string; score: number; direction: string; confidence: string }>; timestamp: string } }>({
    queryKey: ['regime'], queryFn: () => fetch('/api/regime').then(r => r.json()), staleTime: 15_000, refetchInterval: 30_000,
  });
}
function useMarket() {
  return useQuery<{ success: boolean; count: number; degraded: boolean; assets?: { symbol: string; displaySymbol?: string; name: string; price: number; changePercent: number; assetClass: string }[] }>({
    queryKey: ['market'], queryFn: () => fetch('/api/market').then(r => r.json()), staleTime: 30_000, refetchInterval: 60_000,
  });
}
function useFred() {
  return useQuery<{ success: boolean; summary?: { gdp: { trend: string }; inflation: { cpiYoY: number | null; trend: string }; employment: { unemploymentRate: number | null; trend: string }; rates: { fedFunds: number | null; yieldCurve: number | null; curveStatus: string }; credit: { hySpread: number | null; condition: string }; sentiment: { consumerSentiment: number | null; condition: string } } }>({
    queryKey: ['fred'], queryFn: () => fetch('/api/fred').then(r => r.json()), staleTime: 120_000, refetchInterval: 300_000,
  });
}

function regimeColor(r: string) {
  if (r === 'GOLDILOCKS' || r === 'REFLATION') return 'text-emerald-400';
  if (r === 'STAGFLATION' || r === 'DEFLATION') return 'text-red-400';
  if (r === 'OVERHEATING') return 'text-amber-400';
  return 'text-blue-400';
}

export function ExecutiveDashboardView() {
  const health = useHealth();
  const test = useTest();
  const macro = useMacro();
  const regime = useRegime();
  const market = useMarket();
  const fred = useFred();
  const { setView } = useTerminal();

  const m = macro.data?.macro;
  const s = regime.data?.snapshot;
  const fr = fred.data?.summary;

  return (
    <div className="space-y-5">
      {/* System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="System Status">
          <div className="flex items-center gap-6">
            <StatusDot ok={!!health.data?.ok} label={health.isLoading ? 'Connecting...' : health.isError ? 'Offline' : 'Backend Online'} />
            {test.data && (
              <StatusDot ok={test.data.summary.failed === 0} label={`Self-Test: ${test.data.summary.passed}/${test.data.summary.total}`} />
            )}
          </div>
        </Card>

        {/* Regime Hero */}
        {s && (
          <Card className="lg:col-span-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-[10px] text-white/25 uppercase mb-0.5">Current Regime</div>
                  <div className={`text-3xl font-black ${regimeColor(s.regime)}`}>{s.regime}</div>
                </div>
                <Badge text={s.regimeConfidence} />
              </div>
              <button onClick={() => setView('macro')} className="text-[11px] text-amber-400/60 hover:text-amber-400 transition-colors">
                View Details →
              </button>
            </div>
            <div className="flex gap-4 mt-3">
              {Object.entries(s.axes).slice(0, 6).map(([name, axis]) => (
                <div key={name} className="text-center">
                  <div className="text-[9px] text-white/20 uppercase">{axis.name || name}</div>
                  <div className={`text-sm font-bold tabular-nums ${
                    axis.score > 0 || axis.direction.includes('↑') ? 'text-emerald-400' :
                    axis.score < 0 || axis.direction.includes('↓') ? 'text-red-400' : 'text-white/40'
                  }`}>{fmt(axis.score, 1)}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Quick Macro Metrics */}
      {m && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <Card><Metric label="VIX" value={fmt(m.vix, 1)} sub={`${m.vixChange > 0 ? '+' : ''}${fmt(m.vixChange)}%`} color={m.vix > 25 ? 'text-red-400' : m.vix < 18 ? 'text-emerald-400' : 'text-amber-400'} /></Card>
          <Card><Metric label="10Y" value={`${fmt(m.treasury10y)}%`} /></Card>
          <Card><Metric label="2Y" value={`${fmt(m.treasury2y)}%`} /></Card>
          <Card><Metric label="Yield Curve" value={`${fmt(m.yieldCurve)}%`} color={m.yieldCurve < 0 ? 'text-red-400' : 'text-emerald-400'} sub={m.yieldCurve < 0 ? 'INVERTED' : 'NORMAL'} /></Card>
          <Card><Metric label="DXY" value={fmt(m.dollarIndex, 1)} sub={`${m.dollarIndexChange > 0 ? '+' : ''}${fmt(m.dollarIndexChange)}%`} /></Card>
          <Card><Metric label="Fear & Greed" value={m.fearGreed?.value ?? '--'} sub={m.fearGreed?.classification || ''} color={m.fearGreed && m.fearGreed.value < 30 ? 'text-red-400' : m.fearGreed && m.fearGreed.value > 60 ? 'text-emerald-400' : 'text-amber-400'} /></Card>
          <Card><Metric label="Assets" value={market.data?.count ?? '--'} sub={market.data?.degraded ? 'DEGRADED' : 'OK'} /></Card>
        </div>
      )}

      {/* FRED Economic Summary */}
      {fr && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card>
            <div className="text-[10px] text-white/25 uppercase mb-1">Growth</div>
            <Badge text={fr.gdp?.trend || '--'} variant={trendBadgeVariant(fr.gdp?.trend || '')} />
          </Card>
          <Card>
            <div className="text-[10px] text-white/25 uppercase mb-1">Inflation</div>
            <div className="text-sm font-bold mb-1">{fr.inflation?.cpiYoY != null ? `${fr.inflation.cpiYoY.toFixed(1)}% YoY` : '--'}</div>
            <Badge text={fr.inflation?.trend || '--'} variant={trendBadgeVariant(fr.inflation?.trend || '')} />
          </Card>
          <Card>
            <div className="text-[10px] text-white/25 uppercase mb-1">Employment</div>
            <div className="text-sm font-bold mb-1">{fr.employment?.unemploymentRate != null ? `${fr.employment.unemploymentRate}%` : '--'}</div>
            <Badge text={fr.employment?.trend || '--'} variant={trendBadgeVariant(fr.employment?.trend || '')} />
          </Card>
          <Card>
            <div className="text-[10px] text-white/25 uppercase mb-1">Fed Funds</div>
            <div className="text-sm font-bold mb-1">{fr.rates?.fedFunds != null ? `${fr.rates.fedFunds}%` : '--'}</div>
            <Badge text={fr.rates?.curveStatus || '--'} variant={trendBadgeVariant(fr.rates?.curveStatus || '')} />
          </Card>
          <Card>
            <div className="text-[10px] text-white/25 uppercase mb-1">Credit</div>
            <div className="text-sm font-bold mb-1">{fr.credit?.hySpread != null ? `${fr.credit.hySpread.toFixed(2)}%` : '--'}</div>
            <Badge text={fr.credit?.condition || '--'} variant={trendBadgeVariant(fr.credit?.condition || '')} />
          </Card>
          <Card>
            <div className="text-[10px] text-white/25 uppercase mb-1">Sentiment</div>
            <div className="text-sm font-bold mb-1">{fr.sentiment?.consumerSentiment ?? '--'}</div>
            <Badge text={fr.sentiment?.condition || '--'} variant={trendBadgeVariant(fr.sentiment?.condition || '')} />
          </Card>
        </div>
      )}

      {/* Pipeline: Macro → Meso → Micro */}
      <div className="space-y-3">
        <div className="text-[10px] text-white/20 uppercase font-bold tracking-wider px-1">Analysis Pipeline</div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { id: 'macro' as const, label: 'MACRO', desc: 'FRED + Regime + VIX + DXY + F&G', color: 'border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/10', textColor: 'text-amber-400', step: '1' },
            { id: 'meso' as const, label: 'MESO', desc: 'Asset classes, sectors, tilts & allowed instruments', color: 'border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/10', textColor: 'text-amber-400', step: '2' },
            { id: 'micro' as const, label: 'MICRO', desc: 'Individual setups, SMC, MTF & execution', color: 'border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/10', textColor: 'text-amber-400', step: '3' },
          ].map((nav) => (
            <button key={nav.id} onClick={() => setView(nav.id)} className={`text-left rounded-xl border p-4 transition-all group ${nav.color}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-mono font-bold ${nav.textColor} bg-white/5 px-1.5 py-0.5 rounded`}>STEP {nav.step}</span>
                <span className={`text-sm font-black ${nav.textColor}`}>{nav.label}</span>
              </div>
              <div className="text-[10px] text-white/30">{nav.desc}</div>
            </button>
          ))}
        </div>

        {/* Aggregating analyses */}
        <div className="text-[10px] text-white/20 uppercase font-bold tracking-wider px-1 mt-4">Specific Analyses</div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setView('currency')} className="text-left rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 hover:bg-blue-500/10 transition-all group">
            <div className="text-sm font-bold text-blue-400 group-hover:text-blue-300">FX Strength</div>
            <div className="text-[10px] text-white/30 mt-0.5">Currency strength, COT positioning & best pair selection</div>
          </button>
          <button onClick={() => setView('liquidity')} className="text-left rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 hover:bg-cyan-500/10 transition-all group">
            <div className="text-sm font-bold text-cyan-400 group-hover:text-cyan-300">Liquidity Map</div>
            <div className="text-[10px] text-white/30 mt-0.5">Volume profiles, sweep zones & execution windows</div>
          </button>
        </div>

        {/* Execution & Risk */}
        <div className="text-[10px] text-white/20 uppercase font-bold tracking-wider px-1 mt-4">Execution & Risk</div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { id: 'signals' as const, label: 'Signals', desc: 'Trade signals from MESO', color: 'border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10', textColor: 'text-emerald-400' },
            { id: 'scanner' as const, label: 'Scanner', desc: 'Multi-factor tier screening', color: 'border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10', textColor: 'text-emerald-400' },
            { id: 'incubator' as const, label: 'Incubator', desc: 'Strategy P&L tracking', color: 'border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10', textColor: 'text-emerald-400' },
            { id: 'risk' as const, label: 'Risk', desc: 'Kelly + DD + circuit breakers', color: 'border-red-500/20 bg-red-500/5 hover:bg-red-500/10', textColor: 'text-red-400' },
            { id: 'lab' as const, label: 'Lab', desc: 'Analyst workstation', color: 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]', textColor: 'text-white/60' },
          ].map((nav) => (
            <button key={nav.id} onClick={() => setView(nav.id)} className={`text-left rounded-xl border p-3 transition-all group ${nav.color}`}>
              <div className={`text-xs font-bold ${nav.textColor}`}>{nav.label}</div>
              <div className="text-[10px] text-white/25 mt-0.5">{nav.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Top Market Movers */}
      {market.data?.assets && market.data.assets.length > 0 && (
        <Card title="Top Market Movers" action={
          <button onClick={() => setView('macro')} className="text-[11px] text-amber-400/60 hover:text-amber-400">View All →</button>
        }>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {[...market.data.assets].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)).slice(0, 12).map((a) => (
              <div key={a.symbol} className="rounded-lg bg-white/[0.02] border border-white/5 p-3 text-center">
                <div className="font-mono text-xs font-bold">{a.displaySymbol || a.symbol}</div>
                <div className="text-sm font-mono tabular-nums mt-0.5">{priceFmt(a.price)}</div>
                <div className={`text-[11px] font-mono font-bold ${pctColor(a.changePercent)}`}>{pctFmt(a.changePercent)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
