import { useState, useMemo } from 'react';
import { Card, Badge, Metric, Spinner, ErrorBox, ProgressBar, TabBar, fmt, priceFmt, cleanSymbol } from '../ui/primitives';
import { useTerminal } from '../../store/useTerminal';
import { useCurrencyStrength } from '../../hooks/useApi';

// --- TYPES ---
interface CurrencyStrength {
  code: string; name: string; country: string; flag: string; centralBank: string; region: string;
  strength: number; strengthLabel: 'STRONG' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'WEAK';
  bullishPairs: number; bearishPairs: number; totalPairs: number;
  trend: 'UP' | 'DOWN' | 'SIDEWAYS'; momentum: number;
  economicIndicators: {
    interestRate: number | null; inflation: number | null; gdpGrowth: number | null;
    unemployment: number | null; tradeBalance: number | null;
    sentiment: 'HAWKISH' | 'NEUTRAL' | 'DOVISH'; nextMeeting: string | null; recentEvents: string[];
  };
  flowAnalysis: {
    capitalFlow: 'INFLOW' | 'OUTFLOW' | 'NEUTRAL'; flowStrength: number;
    institutionalBias: 'LONG' | 'SHORT' | 'NEUTRAL'; retailSentiment: number;
    cot: { commercial: number; nonCommercial: number; retail: number };
  };
  correlations: { currency: string; correlation: number; relationship: string }[];
}

interface BestPair {
  symbol: string; base: string; quote: string; direction: 'LONG' | 'SHORT';
  differential: number; baseStrength: number; quoteStrength: number; confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  price?: number;
  tradePlan?: {
    entryZone: { from: number; to: number }; stopLoss: number; takeProfit: number;
    riskReward: number; horizon: string; executionWindow: string;
  };
}

interface CurrencyData {
  success: boolean; timestamp: string;
  currencies: CurrencyStrength[];
  globalFlow: { riskSentiment: string; dollarIndex: number | null; vix: number | null; dominantFlow: string; weakestCurrency: string };
  bestPairs: BestPair[];
  economicCalendar?: Record<string, { date: string; time: string; event: string; impact: string; previous: string | null; forecast: string | null; actual: string | null }[]>;
}

const CURRENCY_META: Record<string, { riskProfile: string; sessionHours: { start: number; end: number; name: string } }> = {
  USD: { riskProfile: 'SAFE_HAVEN', sessionHours: { start: 13, end: 22, name: 'New York' } },
  EUR: { riskProfile: 'RISK_NEUTRAL', sessionHours: { start: 7, end: 16, name: 'Frankfurt' } },
  GBP: { riskProfile: 'RISK_NEUTRAL', sessionHours: { start: 7, end: 16, name: 'London' } },
  JPY: { riskProfile: 'SAFE_HAVEN', sessionHours: { start: 0, end: 9, name: 'Tokyo' } },
  CHF: { riskProfile: 'SAFE_HAVEN', sessionHours: { start: 7, end: 16, name: 'Zurich' } },
  AUD: { riskProfile: 'RISK_ON', sessionHours: { start: 22, end: 7, name: 'Sydney' } },
  CAD: { riskProfile: 'RISK_ON', sessionHours: { start: 13, end: 22, name: 'Toronto' } },
  NZD: { riskProfile: 'RISK_ON', sessionHours: { start: 21, end: 6, name: 'Wellington' } },
};


const strengthColor = (l: string) => {
  if (l === 'STRONG') return 'text-emerald-400 bg-emerald-500/15';
  if (l === 'BULLISH') return 'text-emerald-300 bg-emerald-500/10';
  if (l === 'BEARISH') return 'text-orange-400 bg-orange-500/15';
  if (l === 'WEAK') return 'text-red-400 bg-red-500/15';
  return 'text-white/40 bg-white/5';
};

const strengthBarColor = (s: number) => {
  if (s >= 70) return 'bg-emerald-500';
  if (s >= 55) return 'bg-emerald-400';
  if (s >= 45) return 'bg-white/20';
  if (s >= 30) return 'bg-orange-500';
  return 'bg-red-500';
};

function GlobalFlowPanel({ flow }: { flow: CurrencyData['globalFlow'] }) {
  const sentColor = flow.riskSentiment === 'RISK_ON' ? 'text-emerald-400' : flow.riskSentiment === 'RISK_OFF' ? 'text-red-400' : 'text-white/40';
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-5 flex flex-wrap gap-6 items-center">
      <div><span className="text-[10px] text-white/30 uppercase block">Risk Sentiment</span><span className={`text-lg font-black ${sentColor}`}>{flow.riskSentiment.replace('_', ' ')}</span></div>
      {flow.dollarIndex != null && <Metric label="DXY" value={fmt(flow.dollarIndex, 1)} small />}
      {flow.vix != null && <Metric label="VIX" value={fmt(flow.vix, 1)} small />}
      <div><span className="text-[10px] text-white/30 uppercase block">Dominant Flow</span><span className="text-sm font-bold text-amber-400">{flow.dominantFlow}</span></div>
      <div><span className="text-[10px] text-white/30 uppercase block">Weakest</span><span className="text-sm font-bold text-red-400">{flow.weakestCurrency}</span></div>
    </div>
  );
}

function CurrencyRow({ cur, selected, onClick }: { cur: CurrencyStrength; selected: boolean; onClick: () => void }) {
  const meta = CURRENCY_META[cur.code];
  const riskColor = meta?.riskProfile === 'SAFE_HAVEN' ? 'text-blue-400 bg-blue-500/10' : meta?.riskProfile === 'RISK_ON' ? 'text-emerald-400 bg-emerald-500/10' : 'text-white/30 bg-white/5';

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
        selected ? 'border-amber-500/40 bg-amber-500/5' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{cur.flag}</span>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-black font-mono">{cur.code}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${strengthColor(cur.strengthLabel)}`}>{cur.strengthLabel}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded ${riskColor}`}>{meta?.riskProfile.replace('_', ' ') || ''}</span>
          </div>
          <div className="text-[10px] text-white/25">{cur.name} • {cur.centralBank}</div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="w-24">
          <div className="flex justify-between text-[9px] text-white/20 mb-0.5">
            <span>Strength</span><span className="font-mono">{cur.strength}</span>
          </div>
          <ProgressBar value={cur.strength} color={strengthBarColor(cur.strength)} />
        </div>

        <div className="text-center min-w-[40px]">
          <div className="text-[9px] text-white/20">MOM</div>
          <div className={`text-sm font-mono font-bold ${cur.momentum > 0 ? 'text-emerald-400' : cur.momentum < 0 ? 'text-red-400' : 'text-white/30'}`}>
            {cur.momentum > 0 ? '+' : ''}{cur.momentum}
          </div>
        </div>

        <div className="text-center min-w-[40px]">
          <div className="text-[9px] text-white/20">Trend</div>
          <div className={`text-sm font-bold ${cur.trend === 'UP' ? 'text-emerald-400' : cur.trend === 'DOWN' ? 'text-red-400' : 'text-white/30'}`}>
            {cur.trend === 'UP' ? '↑' : cur.trend === 'DOWN' ? '↓' : '→'}
          </div>
        </div>

        <div className="text-center min-w-[50px]">
          <div className="text-[9px] text-white/20">Pairs</div>
          <div className="text-[11px] font-mono">
            <span className="text-emerald-400">{cur.bullishPairs}</span>
            <span className="text-white/15">/</span>
            <span className="text-red-400">{cur.bearishPairs}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CurrencyDetail({ cur }: { cur: CurrencyStrength }) {
  const eco = cur.economicIndicators;
  const flow = cur.flowAnalysis;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card title="Economic Indicators">
        <div className="space-y-2 text-[11px]">
          {eco.interestRate != null && <div className="flex justify-between"><span className="text-white/30">Interest Rate</span><span className="font-mono font-bold">{eco.interestRate}%</span></div>}
          {eco.inflation != null && <div className="flex justify-between"><span className="text-white/30">Inflation</span><span className="font-mono font-bold">{eco.inflation}%</span></div>}
          {eco.gdpGrowth != null && <div className="flex justify-between"><span className="text-white/30">GDP Growth</span><span className="font-mono font-bold">{eco.gdpGrowth}%</span></div>}
          {eco.unemployment != null && <div className="flex justify-between"><span className="text-white/30">Unemployment</span><span className="font-mono font-bold">{eco.unemployment}%</span></div>}
          <div className="flex justify-between pt-2 border-t border-white/5">
            <span className="text-white/30">Central Bank</span>
            <Badge text={eco.sentiment} variant={eco.sentiment === 'HAWKISH' ? 'danger' : eco.sentiment === 'DOVISH' ? 'success' : 'default'} />
          </div>
          {eco.nextMeeting && <div className="text-[10px] text-white/20">Next: {eco.nextMeeting}</div>}
          {eco.recentEvents.length > 0 && (
            <div className="pt-2 border-t border-white/5">
              <div className="text-[10px] text-white/25 mb-1">Recent Events</div>
              {eco.recentEvents.map((e, i) => <div key={i} className="text-[10px] text-white/40 py-0.5">{e}</div>)}
            </div>
          )}
        </div>
      </Card>

      <Card title="Flow Analysis">
        <div className="space-y-2 text-[11px]">
          <div className="flex justify-between">
            <span className="text-white/30">Capital Flow</span>
            <Badge text={flow.capitalFlow} variant={flow.capitalFlow === 'INFLOW' ? 'success' : flow.capitalFlow === 'OUTFLOW' ? 'danger' : 'default'} />
          </div>
          <div className="flex justify-between"><span className="text-white/30">Flow Strength</span><span className="font-mono font-bold">{flow.flowStrength}</span></div>
          <div className="flex justify-between">
            <span className="text-white/30">Institutional</span>
            <Badge text={flow.institutionalBias} variant={flow.institutionalBias === 'LONG' ? 'bullish' : flow.institutionalBias === 'SHORT' ? 'bearish' : 'neutral'} />
          </div>
          <div className="flex justify-between"><span className="text-white/30">Retail Sentiment</span><span className="font-mono">{flow.retailSentiment}%</span></div>
          <div className="pt-2 border-t border-white/5">
            <div className="text-[10px] text-white/25 mb-1">COT Positioning</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><div className="text-[9px] text-white/20">Commercial</div><div className="font-mono font-bold">{flow.cot.commercial}</div></div>
              <div><div className="text-[9px] text-white/20">Non-Comm</div><div className="font-mono font-bold">{flow.cot.nonCommercial}</div></div>
              <div><div className="text-[9px] text-white/20">Retail</div><div className="font-mono font-bold">{flow.cot.retail}</div></div>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Correlations">
        <div className="space-y-1.5">
          {cur.correlations.map((c) => (
            <div key={c.currency} className="flex items-center justify-between text-[11px]">
              <span className="font-mono font-bold">{c.currency}</span>
              <div className="flex items-center gap-2">
                <span className={`font-mono ${c.correlation > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {c.correlation > 0 ? '+' : ''}{c.correlation.toFixed(2)}
                </span>
                <Badge text={c.relationship} variant={c.relationship === 'POSITIVE' ? 'success' : c.relationship === 'NEGATIVE' ? 'danger' : 'default'} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function BestPairsPanel({ pairs }: { pairs: BestPair[] }) {
  return (
    <Card title="Best Trade Opportunities" subtitle={`${pairs.length} pairs`}>
      <div className="space-y-3">
        {pairs.map((p) => (
          <div key={p.symbol} className="rounded-lg border border-white/8 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-lg font-black font-mono">{cleanSymbol(p.symbol)}</span>
                <Badge text={p.direction} variant={p.direction === 'LONG' ? 'bullish' : 'bearish'} />
                <Badge text={p.confidence} variant={p.confidence === 'HIGH' ? 'success' : p.confidence === 'MEDIUM' ? 'warning' : 'default'} />
              </div>
              {p.price != null && <span className="font-mono text-sm tabular-nums">{priceFmt(p.price)}</span>}
            </div>

            <div className="grid grid-cols-3 gap-3 text-center text-[11px] mb-3">
              <div>
                <div className="text-[9px] text-white/20">{p.base} Strength</div>
                <div className="font-mono font-bold">{p.baseStrength}</div>
              </div>
              <div>
                <div className="text-[9px] text-white/20">Differential</div>
                <div className="font-mono font-bold text-amber-400">{p.differential}</div>
              </div>
              <div>
                <div className="text-[9px] text-white/20">{p.quote} Strength</div>
                <div className="font-mono font-bold">{p.quoteStrength}</div>
              </div>
            </div>

            {p.tradePlan && (
              <div className="border-t border-white/5 pt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                <div>
                  <div className="text-[9px] text-white/20">Entry Zone</div>
                  <div className="font-mono">{priceFmt(p.tradePlan.entryZone.from)} - {priceFmt(p.tradePlan.entryZone.to)}</div>
                </div>
                <div>
                  <div className="text-[9px] text-white/20">Stop Loss</div>
                  <div className="font-mono text-red-400">{priceFmt(p.tradePlan.stopLoss)}</div>
                </div>
                <div>
                  <div className="text-[9px] text-white/20">Take Profit</div>
                  <div className="font-mono text-emerald-400">{priceFmt(p.tradePlan.takeProfit)}</div>
                </div>
                <div>
                  <div className="text-[9px] text-white/20">R:R</div>
                  <div className="font-mono font-bold text-amber-400">{fmt(p.tradePlan.riskReward, 1)}</div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function CurrencyStrengthView() {
  const { data, isLoading, isError, refetch } = useCurrencyStrength();
  const { setView } = useTerminal();
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const [tab, setTab] = useState('ranking');

  const selectedData = useMemo(() => selectedCurrency ? data?.currencies.find(c => c.code === selectedCurrency) : null, [selectedCurrency, data]);

  if (isLoading) return <Spinner />;
  if (isError || !data?.success) return <ErrorBox message="Failed to load currency data" onRetry={() => refetch()} />;

  const sorted = [...(data.currencies || [])].sort((a, b) => b.strength - a.strength);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black tracking-tight">Currency Strength</h2>
        <TabBar
          tabs={[
            { id: 'ranking', label: 'Ranking' },
            { id: 'pairs', label: 'Best Pairs' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      <GlobalFlowPanel flow={data.globalFlow} />

      {tab === 'ranking' && (
        <>
          <div className="space-y-2">
            {sorted.map((cur) => (
              <CurrencyRow
                key={cur.code}
                cur={cur}
                selected={selectedCurrency === cur.code}
                onClick={() => setSelectedCurrency(selectedCurrency === cur.code ? null : cur.code)}
              />
            ))}
          </div>

          {selectedData && <CurrencyDetail cur={selectedData} />}
        </>
      )}

      {tab === 'pairs' && data.bestPairs.length > 0 && <BestPairsPanel pairs={data.bestPairs} />}
      {tab === 'pairs' && data.bestPairs.length === 0 && (
        <div className="text-sm text-white/30 text-center py-8">No pairs data available</div>
      )}

      {/* Pipeline Context */}
      <div className="rounded-xl border border-white/6 bg-white/[0.02] p-4">
        <div className="text-[10px] text-white/20 uppercase font-bold tracking-wider mb-3">Related Views</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button onClick={() => setView('meso')} className="text-left rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 hover:bg-amber-500/10 transition-all group">
            <div className="text-xs font-bold text-amber-400">MESO ←</div>
            <div className="text-[10px] text-white/30 mt-0.5">FX class expectations & tilts</div>
          </button>
          <button onClick={() => setView('liquidity')} className="text-left rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 hover:bg-cyan-500/10 transition-all group">
            <div className="text-xs font-bold text-cyan-400">Liquidity Map →</div>
            <div className="text-[10px] text-white/30 mt-0.5">Volume profiles & sweep timing</div>
          </button>
          <button onClick={() => setView('signals')} className="text-left rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 hover:bg-emerald-500/10 transition-all group">
            <div className="text-xs font-bold text-emerald-400">Signals →</div>
            <div className="text-[10px] text-white/30 mt-0.5">Trade signals from allowed FX pairs</div>
          </button>
          <button onClick={() => setView('scanner')} className="text-left rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 hover:bg-emerald-500/10 transition-all group">
            <div className="text-xs font-bold text-emerald-400">Scanner →</div>
            <div className="text-[10px] text-white/30 mt-0.5">Multi-factor screening</div>
          </button>
        </div>
      </div>
    </div>
  );
}
