import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Metric, Spinner, ErrorBox, ProgressBar, TabBar, fmt, pctFmt, priceFmt, cleanSymbol } from '../ui/primitives';

// --- TYPES ---
interface LabAsset {
  symbol: string; name: string; price: number; changePercent: number;
  category: string;
  technicals: {
    rsi: number; macdSignal: string; trend: string;
    ema21: number; ema50: number; ema200: number;
    atr: number; bbPosition: string;
  };
  scoring: {
    total: number; technical: number; fundamental: number; momentum: number;
    risk: number; sentiment: number;
  };
  decision?: {
    action: string; direction: string; confidence: string; reason: string;
  };
}

interface BacktestResult {
  strategy: string; asset: string; period: string;
  totalTrades: number; winRate: number; profitFactor: number;
  totalReturn: number; maxDrawdown: number; sharpe: number;
  avgWin: number; avgLoss: number;
}

interface LabResponse {
  success: boolean; timestamp: string;
  assets: LabAsset[];
  backtests: BacktestResult[];
}

interface MesoAllowed {
  symbol: string; direction: 'LONG' | 'SHORT'; class: string; reason: string; score: number;
}

interface MesoData {
  success: boolean;
  microInputs?: { allowedInstruments: MesoAllowed[] };
}

interface LabApiReport {
  symbol: string; timestamp: string;
  meso?: { instrument: MesoAllowed | null };
  regime?: { regime: string };
  micro?: Record<string, unknown>;
  mtf?: Record<string, unknown>;
  modules?: { key: string; status: string; score: number; title: string; summary: string }[];
  decision?: { action: string; direction: string; confidence: string; reasoning: string; score: number };
}

interface MarketAsset {
  symbol: string; displaySymbol: string; price: number; changePercent: number;
  atr: number; rsi: number;
}

function useLab() {
  return useQuery<LabResponse>({
    queryKey: ['lab'],
    queryFn: async (): Promise<LabResponse> => {
      // Get allowed instruments from meso + market prices, then call /api/lab for top ones
      const [mesoRes, marketRes] = await Promise.all([
        fetch('/api/meso').then(r => r.json()),
        fetch('/api/market').then(r => r.json()),
      ]);
      const instruments: MesoAllowed[] = mesoRes.microInputs?.allowedInstruments || [];
      const marketAssets: MarketAsset[] = marketRes.assets || [];
      const priceMap = new Map(marketAssets.map((a: MarketAsset) => [a.symbol, a]));

      if (instruments.length === 0) {
        return { success: true, timestamp: new Date().toISOString(), assets: [], backtests: [] };
      }

      // Only fetch lab for instruments that have market data, top 6 by score
      const withMarket = instruments.filter(i => priceMap.has(i.symbol));
      const toFetch = [...withMarket].sort((a, b) => b.score - a.score).slice(0, 6);

      const reports = await Promise.allSettled(
        toFetch.map(async (inst) => {
          const r = await fetch(`/api/lab?symbol=${encodeURIComponent(inst.symbol)}`);
          const data = await r.json();
          return { inst, report: data.success ? (data.report as LabApiReport) : null };
        })
      );

      const assets: LabAsset[] = reports
        .filter((r): r is PromiseFulfilledResult<{ inst: MesoAllowed; report: LabApiReport | null }> => r.status === 'fulfilled')
        .map(({ value: { inst, report } }) => {
          const mkt = priceMap.get(inst.symbol);
          // Extract technicals from lab micro report if available
          const microData = report?.micro as Record<string, unknown> | undefined;
          const techFromLab = microData?.technical as Record<string, unknown> | undefined;
          const indicators = techFromLab?.indicators as Record<string, unknown> | undefined;
          const trend = techFromLab?.trend as Record<string, unknown> | undefined;

          return {
            symbol: mkt?.displaySymbol || inst.symbol,
            name: inst.reason,
            price: mkt?.price || 0,
            changePercent: mkt?.changePercent || 0,
            category: inst.class,
            technicals: {
              rsi: Number(indicators?.rsi ?? mkt?.rsi ?? 50),
              macdSignal: String(indicators?.macdSignal ?? 'NEUTRAL'),
              trend: String(trend?.alignment ?? 'NEUTRAL'),
              ema21: Number(indicators?.ema21 ?? 0),
              ema50: Number(indicators?.ema50 ?? 0),
              ema200: Number(indicators?.ema200 ?? 0),
              atr: Number(mkt?.atr ?? 0),
              bbPosition: String(indicators?.bbPosition ?? 'MIDDLE'),
            },
            scoring: {
              total: Math.min(100, Math.round(report?.decision?.score ?? inst.score)),
              technical: Math.round(report?.modules?.find(m => m.key === 'MICRO')?.score ?? 50),
              fundamental: Math.round(report?.modules?.find(m => m.key === 'MESO')?.score ?? 50),
              momentum: Math.round(report?.modules?.find(m => m.key === 'MTF')?.score ?? 50),
              risk: Math.round(report?.modules?.find(m => m.key === 'GUARDRAILS')?.score ?? 50),
              sentiment: Math.round(report?.modules?.find(m => m.key === 'REGIME')?.score ?? 50),
            },
            decision: report?.decision ? {
              action: report.decision.action,
              direction: report.decision.direction,
              confidence: report.decision.confidence,
              reason: report.decision.reasoning,
            } : undefined,
          };
        });

      return { success: true, timestamp: new Date().toISOString(), assets, backtests: [] };
    },
    staleTime: 60_000, refetchInterval: 120_000, retry: 1,
  });
}

const rsiColor = (v: number) => v > 70 ? 'text-red-400' : v < 30 ? 'text-emerald-400' : 'text-white/50';
const scoreColor = (v: number) => v >= 80 ? 'text-emerald-400' : v >= 60 ? 'text-amber-400' : v >= 40 ? 'text-white/50' : 'text-red-400';

function AssetAnalysisTable({ assets }: { assets: LabAsset[] }) {
  const [sortBy, setSortBy] = useState<'score' | 'rsi' | 'change'>('score');

  const sorted = [...assets].sort((a, b) => {
    if (sortBy === 'score') return b.scoring.total - a.scoring.total;
    if (sortBy === 'rsi') return a.technicals.rsi - b.technicals.rsi;
    return b.changePercent - a.changePercent;
  });

  return (
    <Card title="Asset Analysis" subtitle={`${assets.length} assets`}
      action={
        <div className="flex gap-1">
          {(['score', 'rsi', 'change'] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)}
              className={`text-[10px] px-2 py-0.5 rounded ${sortBy === s ? 'bg-white/10 text-amber-400' : 'text-white/25 hover:text-white/50'}`}>
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      }
    >
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#08080c]">
            <tr className="text-left text-[10px] text-white/20 uppercase">
              <th className="pb-2 pr-3">Asset</th>
              <th className="pb-2 pr-3 text-right">Price</th>
              <th className="pb-2 pr-3 text-right">Chg%</th>
              <th className="pb-2 pr-3 text-right">Score</th>
              <th className="pb-2 pr-3 text-right">RSI</th>
              <th className="pb-2 pr-3">MACD</th>
              <th className="pb-2 pr-3">Trend</th>
              <th className="pb-2 pr-3">BB</th>
              <th className="pb-2 pr-3 text-right">ATR</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <tr key={a.symbol} className="border-t border-white/3 hover:bg-white/3">
                <td className="py-1.5 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold">{cleanSymbol(a.symbol)}</span>
                    {a.decision && <Badge text={a.decision.action} variant={a.decision.action === 'EXECUTE' ? 'success' : a.decision.action === 'WAIT' ? 'warning' : 'danger'} />}
                  </div>
                  <div className="text-[9px] text-white/20">{a.category}{a.decision?.direction ? ` • ${a.decision.direction}` : ''}</div>
                </td>
                <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{priceFmt(a.price)}</td>
                <td className={`py-1.5 pr-3 text-right font-mono tabular-nums ${a.changePercent > 0 ? 'text-emerald-400' : a.changePercent < 0 ? 'text-red-400' : 'text-white/30'}`}>
                  {pctFmt(a.changePercent)}
                </td>
                <td className={`py-1.5 pr-3 text-right font-mono font-bold ${scoreColor(a.scoring.total)}`}>{a.scoring.total}</td>
                <td className={`py-1.5 pr-3 text-right font-mono ${rsiColor(a.technicals.rsi)}`}>{Math.round(a.technicals.rsi)}</td>
                <td className="py-1.5 pr-3">
                  <Badge text={a.technicals.macdSignal} variant={a.technicals.macdSignal === 'BUY' ? 'bullish' : a.technicals.macdSignal === 'SELL' ? 'bearish' : 'neutral'} />
                </td>
                <td className="py-1.5 pr-3">
                  <Badge text={a.technicals.trend} variant={a.technicals.trend === 'BULLISH' ? 'bullish' : a.technicals.trend === 'BEARISH' ? 'bearish' : 'neutral'} />
                </td>
                <td className="py-1.5 pr-3 text-[10px] text-white/30">{a.technicals.bbPosition}</td>
                <td className="py-1.5 text-right font-mono text-xs text-white/30">{fmt(a.technicals.atr, 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ScoringBreakdown({ assets }: { assets: LabAsset[] }) {
  const top10 = [...assets].sort((a, b) => b.scoring.total - a.scoring.total).slice(0, 10);

  return (
    <Card title="Scoring Breakdown (Top 10)">
      <div className="space-y-3">
        {top10.map((a) => (
          <div key={a.symbol} className="rounded-lg bg-white/[0.02] border border-white/5 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold">{cleanSymbol(a.symbol)}</span>
                <span className={`text-lg font-black ${scoreColor(a.scoring.total)}`}>{a.scoring.total}</span>
              </div>
              <span className="text-xs text-white/20">{a.name}</span>
            </div>
            <div className="grid grid-cols-5 gap-2 text-[11px]">
              {(['technical', 'fundamental', 'momentum', 'risk', 'sentiment'] as const).map((key) => (
                <div key={key} className="text-center">
                  <div className="text-[9px] text-white/20 uppercase">{key.slice(0, 4)}</div>
                  <div className={`font-mono font-bold ${scoreColor(a.scoring[key])}`}>{a.scoring[key]}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function BacktestTable({ backtests }: { backtests: BacktestResult[] }) {
  if (backtests.length === 0) return <Card title="Backtests"><div className="text-sm text-white/20">No backtest results available</div></Card>;

  return (
    <Card title="Backtest Results" subtitle={`${backtests.length} strategies tested`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] text-white/20 uppercase">
              <th className="pb-2 pr-3">Strategy</th>
              <th className="pb-2 pr-3">Asset</th>
              <th className="pb-2 pr-3">Period</th>
              <th className="pb-2 pr-3 text-right">Trades</th>
              <th className="pb-2 pr-3 text-right">Win%</th>
              <th className="pb-2 pr-3 text-right">PF</th>
              <th className="pb-2 pr-3 text-right">Return</th>
              <th className="pb-2 pr-3 text-right">Max DD</th>
              <th className="pb-2 text-right">Sharpe</th>
            </tr>
          </thead>
          <tbody>
            {backtests.map((bt, i) => (
              <tr key={i} className="border-t border-white/3 hover:bg-white/3">
                <td className="py-1.5 pr-3 text-xs font-bold">{bt.strategy}</td>
                <td className="py-1.5 pr-3 font-mono text-xs">{bt.asset}</td>
                <td className="py-1.5 pr-3 text-[10px] text-white/30">{bt.period}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{bt.totalTrades}</td>
                <td className={`py-1.5 pr-3 text-right font-mono ${bt.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(bt.winRate, 1)}%</td>
                <td className={`py-1.5 pr-3 text-right font-mono ${bt.profitFactor >= 1.5 ? 'text-emerald-400' : bt.profitFactor >= 1 ? 'text-amber-400' : 'text-red-400'}`}>{fmt(bt.profitFactor, 2)}</td>
                <td className={`py-1.5 pr-3 text-right font-mono font-bold ${bt.totalReturn > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{bt.totalReturn > 0 ? '+' : ''}{fmt(bt.totalReturn, 1)}%</td>
                <td className="py-1.5 pr-3 text-right font-mono text-red-400">{fmt(bt.maxDrawdown, 1)}%</td>
                <td className={`py-1.5 text-right font-mono ${bt.sharpe >= 1 ? 'text-emerald-400' : 'text-white/40'}`}>{fmt(bt.sharpe, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function LabView() {
  const { data, isLoading, isError, refetch } = useLab();
  const [tab, setTab] = useState('analysis');

  if (isLoading) return <Spinner />;
  if (isError || !data?.success) return <ErrorBox message="Failed to load lab data" onRetry={() => refetch()} />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black tracking-tight">Analyst Workstation</h2>
        <TabBar
          tabs={[
            { id: 'analysis', label: 'Analysis' },
            { id: 'scoring', label: 'Scoring' },
            { id: 'backtest', label: 'Backtest' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'analysis' && <AssetAnalysisTable assets={data.assets} />}
      {tab === 'scoring' && <ScoringBreakdown assets={data.assets} />}
      {tab === 'backtest' && <BacktestTable backtests={data.backtests} />}
    </div>
  );
}
