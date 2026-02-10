import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Metric, Spinner, ErrorBox, ProgressBar, TabBar, fmt, priceFmt, cleanSymbol } from '../ui/primitives';

// --- TYPES ---
interface IncubatorPosition {
  id: string; symbol: string; direction: 'LONG' | 'SHORT';
  entryPrice: number; currentPrice: number; quantity: number;
  stopLoss: number; takeProfit: number;
  pnl: number; pnlPercent: number;
  score: number; riskProfile: 'SAFE' | 'MODERATE' | 'AGGRESSIVE';
  status: 'PRONTO' | 'DESENVOLVENDO' | 'CONTRA';
  statusReason: string;
  openedAt: string;
  assetClass: string;
}

interface IncubatorPortfolio {
  id: string; name: string;
  capital: number; leverage: number; defaultLots: number;
  positions: IncubatorPosition[];
  totalPnl: number; totalPnlPercent: number;
  winRate: number; positionCount: number;
}

interface IncubatorResponse {
  success: boolean; timestamp: string;
  portfolios: IncubatorPortfolio[];
  globalStats: {
    totalCapital: number; totalPnl: number; totalPnlPercent: number;
    totalPositions: number; avgWinRate: number;
  };
}

interface MarketAsset {
  symbol: string; displaySymbol: string; name: string; price: number;
  changePercent: number; assetClass: string; atr?: number;
}

interface MesoAllowed {
  symbol: string; direction: 'LONG' | 'SHORT'; class: string; reason: string; score: number;
}

function useIncubator() {
  return useQuery<IncubatorResponse>({
    queryKey: ['incubator'],
    queryFn: async (): Promise<IncubatorResponse> => {
      // Derive incubator from MESO allowed instruments + Market prices + Risk kelly
      const [mesoRes, marketRes, riskRes] = await Promise.all([
        fetch('/api/meso').then(r => r.json()),
        fetch('/api/market').then(r => r.json()),
        fetch('/api/risk').then(r => r.json()),
      ]);

      const allowed: MesoAllowed[] = mesoRes.microInputs?.allowedInstruments || [];
      const assets: MarketAsset[] = marketRes.assets || [];
      const kelly = riskRes.report?.kelly || {};
      const halfKelly = kelly.halfKelly ?? 0.15;

      // Match allowed instruments to market prices
      const priceMap = new Map(assets.map((a: MarketAsset) => [a.symbol, a]));

      // Only include instruments that have real market price data
      const withPrice = allowed.filter(inst => priceMap.has(inst.symbol));
      // Top 20 by score as "incubating" positions
      const topAllowed = [...withPrice].sort((a, b) => b.score - a.score).slice(0, 20);

      const positions: IncubatorPosition[] = topAllowed.map((inst, i) => {
        const asset = priceMap.get(inst.symbol);
        const price = asset?.price || 0;
        const changePct = asset?.changePercent || 0;
        const cappedScore = Math.min(inst.score, 100);
        // Simulate PnL from real market change
        const pnlPct = inst.direction === 'LONG' ? changePct : -changePct;
        const entryPrice = price > 0 ? price / (1 + changePct / 100) : 0;

        // Derive SL/TP from ATR-based percentage or fallback to score-dynamic R:R
        const atrPct = price > 0 ? (asset?.atr ?? price * 0.015) / price * 100 : 1.5;
        const slDistance = Math.min(Math.max(atrPct * 1.5, 0.5), 5);
        const rrMultiplier = cappedScore >= 80 ? 3 : cappedScore >= 70 ? 2.5 : cappedScore >= 60 ? 2 : 1.5;
        const tpDistance = slDistance * rrMultiplier;

        const stopLoss = inst.direction === 'LONG'
          ? entryPrice * (1 - slDistance / 100)
          : entryPrice * (1 + slDistance / 100);
        const takeProfit = inst.direction === 'LONG'
          ? entryPrice * (1 + tpDistance / 100)
          : entryPrice * (1 - tpDistance / 100);

        // P&L in dollars based on capital allocation
        const positionCapital = 100000 * (halfKelly / topAllowed.length);
        const pnlDollars = positionCapital * (pnlPct / 100);

        return {
          id: `pos-${i}`,
          symbol: asset?.displaySymbol || inst.symbol,
          direction: inst.direction,
          entryPrice,
          currentPrice: price,
          quantity: 1,
          stopLoss,
          takeProfit,
          pnl: pnlDollars,
          pnlPercent: pnlPct,
          score: cappedScore,
          riskProfile: classifyRiskProfile(cappedScore) as IncubatorPosition['riskProfile'],
          status: (cappedScore >= 80 ? 'PRONTO' : cappedScore >= 50 ? 'DESENVOLVENDO' : 'CONTRA') as IncubatorPosition['status'],
          statusReason: inst.reason,
          openedAt: new Date().toISOString(),
          assetClass: inst.class,
        };
      });

      const totalPnlDollars = positions.reduce((s, p) => s + p.pnl, 0);
      const totalPnlPct = positions.length > 0 ? (totalPnlDollars / 100000) * 100 : 0;

      const portfolio: IncubatorPortfolio = {
        id: 'main',
        name: 'Active Incubation',
        capital: 100000,
        leverage: 1,
        defaultLots: 1,
        positions,
        totalPnl: totalPnlDollars,
        totalPnlPercent: totalPnlPct,
        winRate: Math.round(halfKelly * 100),
        positionCount: positions.length,
      };

      return {
        success: true,
        timestamp: new Date().toISOString(),
        portfolios: positions.length > 0 ? [portfolio] : [],
        globalStats: {
          totalCapital: 100000,
          totalPnl: portfolio.totalPnl,
          totalPnlPercent: portfolio.totalPnlPercent,
          totalPositions: positions.length,
          avgWinRate: Math.round(halfKelly * 100),
        },
      };
    },
    staleTime: 30_000, refetchInterval: 60_000,
  });
}

const pnlColor = (v: number) => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-white/40';
const statusConfig: Record<string, { color: string; bg: string }> = {
  PRONTO: { color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/25' },
  DESENVOLVENDO: { color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/25' },
  CONTRA: { color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/25' },
};
const riskConfig: Record<string, { color: string; bg: string }> = {
  SAFE: { color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  MODERATE: { color: 'text-amber-400', bg: 'bg-amber-500/10' },
  AGGRESSIVE: { color: 'text-red-400', bg: 'bg-red-500/10' },
};

function classifyRiskProfile(score: number): string {
  if (score >= 75) return 'SAFE';
  if (score >= 55) return 'MODERATE';
  return 'AGGRESSIVE';
}

function calculateDynamicRR(score: number) {
  if (score >= 80) return { rr: 3, lotMultiplier: 1.0, maxRisk: 2.0 };
  if (score >= 70) return { rr: 2.5, lotMultiplier: 0.8, maxRisk: 1.5 };
  if (score >= 60) return { rr: 2, lotMultiplier: 0.6, maxRisk: 1.0 };
  if (score >= 50) return { rr: 2, lotMultiplier: 0.4, maxRisk: 0.75 };
  return { rr: 3, lotMultiplier: 0.25, maxRisk: 0.5 };
}

function GlobalStats({ stats }: { stats: IncubatorResponse['globalStats'] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      <Card><Metric label="Total Capital" value={`$${fmt(stats.totalCapital, 0)}`} small /></Card>
      <Card><Metric label="Total P&L" value={`${stats.totalPnl > 0 ? '+' : ''}$${fmt(stats.totalPnl, 0)}`} small color={pnlColor(stats.totalPnl)} /></Card>
      <Card><Metric label="P&L %" value={`${stats.totalPnlPercent > 0 ? '+' : ''}${fmt(stats.totalPnlPercent, 2)}%`} small color={pnlColor(stats.totalPnlPercent)} /></Card>
      <Card><Metric label="Positions" value={stats.totalPositions} small /></Card>
      <Card><Metric label="Avg Win Rate" value={`${fmt(stats.avgWinRate, 1)}%`} small color={stats.avgWinRate >= 50 ? 'text-emerald-400' : 'text-red-400'} /></Card>
    </div>
  );
}

function PositionRow({ pos }: { pos: IncubatorPosition }) {
  const st = statusConfig[pos.status] || statusConfig.DESENVOLVENDO;
  const rk = riskConfig[pos.riskProfile] || riskConfig.MODERATE;
  const dynamicRR = calculateDynamicRR(pos.score);

  return (
    <div className={`rounded-lg border p-3 ${st.bg}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-black">{cleanSymbol(pos.symbol)}</span>
          <Badge text={pos.direction} variant={pos.direction === 'LONG' ? 'bullish' : 'bearish'} />
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${st.bg} ${st.color}`}>{pos.status}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${rk.bg} ${rk.color}`}>{pos.riskProfile}</span>
        </div>
        <div className={`text-lg font-black font-mono ${pnlColor(pos.pnlPercent)}`}>
          {pos.pnlPercent > 0 ? '+' : ''}{fmt(pos.pnlPercent, 2)}%
        </div>
      </div>

      <div className="grid grid-cols-6 gap-2 text-[11px] text-center">
        <div><div className="text-[9px] text-white/20">Entry</div><div className="font-mono">{priceFmt(pos.entryPrice)}</div></div>
        <div><div className="text-[9px] text-white/20">Current</div><div className="font-mono">{priceFmt(pos.currentPrice)}</div></div>
        <div><div className="text-[9px] text-white/20">Stop</div><div className="font-mono text-red-400/70">{priceFmt(pos.stopLoss)}</div></div>
        <div><div className="text-[9px] text-white/20">TP</div><div className="font-mono text-emerald-400/70">{priceFmt(pos.takeProfit)}</div></div>
        <div><div className="text-[9px] text-white/20">Score</div><div className="font-mono font-bold">{pos.score}</div></div>
        <div><div className="text-[9px] text-white/20">P&L</div><div className={`font-mono font-bold ${pnlColor(pos.pnl)}`}>${fmt(pos.pnl, 0)}</div></div>
      </div>

      <div className="flex items-center gap-4 mt-2 text-[10px] text-white/20">
        <span>Dyn R:R {dynamicRR.rr}:1</span>
        <span>Lots x{dynamicRR.lotMultiplier}</span>
        <span>Max Risk {dynamicRR.maxRisk}%</span>
        <span className="text-white/15">{pos.statusReason}</span>
      </div>
    </div>
  );
}

function PortfolioCard({ portfolio }: { portfolio: IncubatorPortfolio }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card
      title={portfolio.name}
      subtitle={`$${fmt(portfolio.capital, 0)} • ${portfolio.leverage}x leverage • ${portfolio.defaultLots} lots`}
      action={
        <div className="flex items-center gap-3">
          <span className={`text-lg font-black font-mono ${pnlColor(portfolio.totalPnlPercent)}`}>
            {portfolio.totalPnlPercent > 0 ? '+' : ''}{fmt(portfolio.totalPnlPercent, 2)}%
          </span>
          <button onClick={() => setExpanded(!expanded)} className="text-white/20 text-xs hover:text-white/40">
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      }
    >
      <div className="flex gap-4 text-[11px] mb-3">
        <span className="text-white/30">Positions: <span className="font-bold text-white/60">{portfolio.positionCount}</span></span>
        <span className="text-white/30">Win Rate: <span className={`font-bold ${portfolio.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(portfolio.winRate, 1)}%</span></span>
        <span className="text-white/30">Total P&L: <span className={`font-bold ${pnlColor(portfolio.totalPnl)}`}>${fmt(portfolio.totalPnl, 0)}</span></span>
      </div>

      {expanded && (
        <div className="space-y-2">
          {portfolio.positions.length === 0 ? (
            <div className="text-sm text-white/20 py-4 text-center">No positions in this portfolio</div>
          ) : (
            portfolio.positions.map((pos) => <PositionRow key={pos.id} pos={pos} />)
          )}
        </div>
      )}
    </Card>
  );
}

export function IncubatorView() {
  const { data, isLoading, isError, refetch } = useIncubator();

  if (isLoading) return <Spinner />;
  if (isError || !data?.success) return <ErrorBox message="Failed to load incubator data" onRetry={() => refetch()} />;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-black tracking-tight">Strategy Incubator & P&L</h2>
        <Badge text="SIMULATED" variant="warning" />
      </div>

      <GlobalStats stats={data.globalStats} />

      <div className="space-y-5">
        {data.portfolios.map((p) => <PortfolioCard key={p.id} portfolio={p} />)}
        {data.portfolios.length === 0 && (
          <div className="text-sm text-white/30 text-center py-8">
            No portfolios yet. Strategies will appear here once signals are tracked.
          </div>
        )}
      </div>
    </div>
  );
}
