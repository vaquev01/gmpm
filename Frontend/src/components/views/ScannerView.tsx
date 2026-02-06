import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Metric, Spinner, ErrorBox, ProgressBar, TabBar, fmt, pctFmt, priceFmt, cleanSymbol } from '../ui/primitives';

// --- TYPES ---
interface ScanResult {
  symbol: string; name: string; assetClass: string;
  price: number; changePercent: number;
  score: number; tier: 'TIER_1' | 'TIER_2' | 'TIER_3';
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  mesoAligned: boolean;
  reason?: string;
}

interface MarketAsset {
  symbol: string; displaySymbol?: string; name: string; price: number; changePercent: number; assetClass: string; sector?: string;
}

interface MesoAllowed {
  symbol: string; direction: 'LONG' | 'SHORT'; class: string; reason: string; score: number;
}

interface MesoData {
  success: boolean;
  microInputs?: { allowedInstruments: MesoAllowed[]; prohibitedInstruments: { symbol: string; reason: string }[] };
  classes?: { class: string; expectation: string; topPicks: string[] }[];
}

function useScannerData() {
  const market = useQuery<{ success: boolean; assets?: MarketAsset[]; count: number }>({
    queryKey: ['market'], queryFn: () => fetch('/api/market').then(r => r.json()), staleTime: 30_000, refetchInterval: 60_000,
  });
  const meso = useQuery<MesoData>({
    queryKey: ['meso'], queryFn: () => fetch('/api/meso').then(r => r.json()), staleTime: 30_000, refetchInterval: 60_000,
  });

  const results = useMemo(() => {
    if (!market.data?.assets) return [];
    const allowed = new Map((meso.data?.microInputs?.allowedInstruments || []).map(a => [a.symbol, a]));
    const prohibited = new Set((meso.data?.microInputs?.prohibitedInstruments || []).map(p => p.symbol));

    // Build class expectation map from meso classes for enrichment
    const classExpectation = new Map<string, { expectation: string; topPicks: string[] }>();
    (meso.data?.classes || []).forEach(c => classExpectation.set(c.class.toLowerCase(), { expectation: c.expectation, topPicks: c.topPicks || [] }));

    return market.data.assets.map((a): ScanResult => {
      const mesoInfo = allowed.get(a.symbol);
      const isProhibited = prohibited.has(a.symbol);
      const changeMagnitude = Math.abs(a.changePercent);

      // Multi-factor scoring:
      // 1. MESO direct match (highest weight)
      // 2. Class expectation alignment
      // 3. Momentum (change magnitude)
      // 4. Prohibited penalty
      let baseScore: number;
      let reason: string | undefined;

      if (mesoInfo) {
        baseScore = mesoInfo.score;
        reason = mesoInfo.reason;
      } else {
        // Derive score from class expectation + momentum
        const cls = classExpectation.get(a.assetClass?.toLowerCase() || '');
        const isTopPick = cls?.topPicks.some(p => a.symbol.includes(p) || (a.displaySymbol && p.includes(a.displaySymbol || '')));
        const classBonus = cls?.expectation === 'BULLISH' ? 15 : cls?.expectation === 'BEARISH' ? 10 : 0;
        const topPickBonus = isTopPick ? 20 : 0;
        const momentumScore = changeMagnitude > 3 ? 55 : changeMagnitude > 1.5 ? 45 : changeMagnitude > 0.5 ? 35 : 25;
        baseScore = momentumScore + classBonus + topPickBonus;
        reason = cls ? `${cls.expectation} class (${a.assetClass})` : undefined;
      }

      const score = isProhibited ? Math.min(baseScore, 25) : Math.min(baseScore, 100);
      const tier = score >= 70 ? 'TIER_1' as const : score >= 50 ? 'TIER_2' as const : 'TIER_3' as const;
      const direction = mesoInfo ? mesoInfo.direction : (a.changePercent > 1 ? 'LONG' as const : a.changePercent < -1 ? 'SHORT' as const : 'NEUTRAL' as const);

      return {
        symbol: a.displaySymbol || a.symbol, name: a.name, assetClass: a.assetClass || a.sector || '',
        price: a.price, changePercent: a.changePercent,
        score, tier, direction,
        mesoAligned: !!mesoInfo,
        reason: isProhibited ? 'PROHIBITED by MESO' : reason,
      };
    });
  }, [market.data, meso.data]);

  const summary = useMemo(() => {
    const tier1 = results.filter(r => r.tier === 'TIER_1').length;
    const tier2 = results.filter(r => r.tier === 'TIER_2').length;
    const tier3 = results.filter(r => r.tier === 'TIER_3').length;
    const bullish = results.filter(r => r.direction === 'LONG').length;
    const bearish = results.filter(r => r.direction === 'SHORT').length;
    const top = [...results].sort((a, b) => b.score - a.score)[0];
    return { total: results.length, tier1, tier2, tier3, bullish, bearish, neutral: results.length - bullish - bearish, topOpportunity: top?.symbol || '--' };
  }, [results]);

  return { results, summary, isLoading: market.isLoading, isError: market.isError, refetch: market.refetch };
}

const tierColors: Record<string, string> = {
  TIER_1: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  TIER_2: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  TIER_3: 'bg-white/5 text-white/40 border-white/15',
};

const scoreColor = (s: number) => s >= 80 ? 'text-emerald-400' : s >= 60 ? 'text-amber-400' : s >= 40 ? 'text-white/50' : 'text-red-400';

function ScanResultCard({ result }: { result: ScanResult }) {
  return (
    <div className={`rounded-xl border bg-white/[0.02] p-4 ${
      result.tier === 'TIER_1' ? 'border-emerald-500/20' : result.tier === 'TIER_2' ? 'border-amber-500/15' : 'border-white/6'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`text-2xl font-black font-mono ${scoreColor(result.score)}`}>{Math.round(result.score)}</div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black font-mono">{cleanSymbol(result.symbol)}</span>
              <Badge text={result.direction} variant={result.direction === 'LONG' ? 'bullish' : result.direction === 'SHORT' ? 'bearish' : 'neutral'} />
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${tierColors[result.tier]}`}>{result.tier.replace('_', ' ')}</span>
              {result.mesoAligned && <Badge text="MESO ✓" variant="success" />}
            </div>
            <div className="text-[10px] text-white/25">{result.name} • {result.assetClass}</div>
            {result.reason && <div className="text-[10px] text-white/30 mt-0.5">{result.reason}</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-mono tabular-nums">{priceFmt(result.price)}</div>
          <div className={`text-[11px] font-mono ${result.changePercent > 0 ? 'text-emerald-400' : result.changePercent < 0 ? 'text-red-400' : 'text-white/30'}`}>
            {pctFmt(result.changePercent)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ScannerView() {
  const { results, summary, isLoading, isError, refetch } = useScannerData();
  const [tierFilter, setTierFilter] = useState('all');

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorBox message="Failed to load scanner data" onRetry={() => refetch()} />;

  const filtered = results.filter(r =>
    tierFilter === 'all' || r.tier === tierFilter
  );
  const sorted = [...filtered].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black tracking-tight">Tier Scanner</h2>
        <TabBar
          tabs={[
            { id: 'all', label: `ALL (${results.length})` },
            { id: 'TIER_1', label: `T1 (${summary.tier1})` },
            { id: 'TIER_2', label: `T2 (${summary.tier2})` },
            { id: 'TIER_3', label: `T3 (${summary.tier3})` },
          ]}
          active={tierFilter}
          onChange={setTierFilter}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card><Metric label="Total Scanned" value={summary.total} small /></Card>
        <Card><Metric label="Bullish" value={summary.bullish} small color="text-emerald-400" /></Card>
        <Card><Metric label="Bearish" value={summary.bearish} small color="text-red-400" /></Card>
        <Card><Metric label="Neutral" value={summary.neutral} small /></Card>
        <Card><Metric label="Top Pick" value={summary.topOpportunity || '--'} small color="text-amber-400" /></Card>
      </div>

      <div className="space-y-3">
        {sorted.map((r) => <ScanResultCard key={r.symbol} result={r} />)}
        {sorted.length === 0 && <div className="text-sm text-white/30 text-center py-8">No results match filter</div>}
      </div>
    </div>
  );
}
