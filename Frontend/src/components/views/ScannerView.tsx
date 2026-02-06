import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Metric, Spinner, ErrorBox, ProgressBar, TabBar, fmt, pctFmt, priceFmt, cleanSymbol, pctColor } from '../ui/primitives';
import { useTerminal } from '../../store/useTerminal';

// --- TYPES ---
interface ScanResult {
  symbol: string; rawSymbol: string; name: string; assetClass: string;
  price: number; changePercent: number;
  score: number; tier: 'TIER_1' | 'TIER_2' | 'TIER_3';
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  mesoAligned: boolean;
  prohibited: boolean;
  reason?: string;
  rsi: number;
  atr: number;
  atrPercent: number;
  volumeRatio: number;
  opportunityStatus: 'READY' | 'WARMING' | 'COOLING' | 'PROHIBITED' | 'CAUTION';
  autoSafe: boolean;
}

interface MarketAsset {
  symbol: string; displaySymbol?: string; name: string; price: number;
  changePercent: number; assetClass: string; sector?: string;
  atr?: number; rsi?: number; volume?: number; avgVolume?: number;
  high?: number; low?: number; open?: number;
}

interface MesoAllowed {
  symbol: string; direction: 'LONG' | 'SHORT'; class: string; reason: string; score: number;
}

interface MesoData {
  success: boolean;
  microInputs?: { allowedInstruments: MesoAllowed[]; prohibitedInstruments: { symbol: string; reason: string }[] };
  classes?: { class: string; expectation: string; topPicks: string[] }[];
}

type SortKey = 'score' | 'change' | 'rsi' | 'atr' | 'name' | 'volume';
type SortDir = 'asc' | 'desc';

// --- OPPORTUNITY STATUS LOGIC ---
function deriveOpportunityStatus(r: { score: number; mesoAligned: boolean; prohibited: boolean; rsi: number; direction: string; changePercent: number }): ScanResult['opportunityStatus'] {
  if (r.prohibited) return 'PROHIBITED';
  if (r.score >= 70 && r.mesoAligned && r.rsi > 25 && r.rsi < 75 && r.direction !== 'NEUTRAL') return 'READY';
  if (r.score >= 50 && r.direction !== 'NEUTRAL') return 'WARMING';
  if (r.score < 40 || r.rsi > 80 || r.rsi < 20) return 'COOLING';
  return 'CAUTION';
}

function deriveAutoSafe(r: { score: number; mesoAligned: boolean; prohibited: boolean; rsi: number; direction: string }): boolean {
  return r.mesoAligned && r.score >= 65 && !r.prohibited && r.rsi > 30 && r.rsi < 70 && r.direction !== 'NEUTRAL';
}

// --- DATA HOOK ---
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

    const classExpectation = new Map<string, { expectation: string; topPicks: string[] }>();
    (meso.data?.classes || []).forEach(c => classExpectation.set(c.class.toLowerCase(), { expectation: c.expectation, topPicks: c.topPicks || [] }));

    return market.data.assets.map((a): ScanResult => {
      const mesoInfo = allowed.get(a.symbol);
      const isProhibited = prohibited.has(a.symbol);
      const changeMagnitude = Math.abs(a.changePercent);

      let baseScore: number;
      let reason: string | undefined;

      if (mesoInfo) {
        baseScore = mesoInfo.score;
        reason = mesoInfo.reason;
      } else {
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
      const rsi = a.rsi ?? 50;
      const atr = a.atr ?? 0;
      const atrPercent = a.price > 0 ? (atr / a.price) * 100 : 0;
      const volumeRatio = (a.volume && a.avgVolume && a.avgVolume > 0) ? a.volume / a.avgVolume : 1;

      const partial = { score, mesoAligned: !!mesoInfo, prohibited: isProhibited, rsi, direction, changePercent: a.changePercent };

      return {
        symbol: a.displaySymbol || a.symbol, rawSymbol: a.symbol,
        name: a.name, assetClass: a.assetClass || a.sector || '',
        price: a.price, changePercent: a.changePercent,
        score, tier, direction,
        mesoAligned: !!mesoInfo, prohibited: isProhibited,
        reason: isProhibited ? 'PROHIBITED by MESO' : reason,
        rsi, atr, atrPercent, volumeRatio,
        opportunityStatus: deriveOpportunityStatus(partial),
        autoSafe: deriveAutoSafe(partial),
      };
    });
  }, [market.data, meso.data]);

  const summary = useMemo(() => {
    const tier1 = results.filter(r => r.tier === 'TIER_1').length;
    const tier2 = results.filter(r => r.tier === 'TIER_2').length;
    const tier3 = results.filter(r => r.tier === 'TIER_3').length;
    const ready = results.filter(r => r.opportunityStatus === 'READY').length;
    const warming = results.filter(r => r.opportunityStatus === 'WARMING').length;
    const safe = results.filter(r => r.autoSafe).length;
    const bullish = results.filter(r => r.direction === 'LONG').length;
    const bearish = results.filter(r => r.direction === 'SHORT').length;
    const top = [...results].sort((a, b) => b.score - a.score)[0];
    const classes = [...new Set(results.map(r => r.assetClass).filter(Boolean))];
    return { total: results.length, tier1, tier2, tier3, ready, warming, safe, bullish, bearish, neutral: results.length - bullish - bearish, topOpportunity: top?.symbol || '--', classes };
  }, [results]);

  return { results, summary, isLoading: market.isLoading || meso.isLoading, isError: market.isError, refetch: market.refetch };
}

// --- STATUS STYLING ---
const statusConfig: Record<string, { label: string; color: string; bg: string; pulse?: boolean }> = {
  READY: { label: 'READY', color: 'text-emerald-400', bg: 'bg-emerald-500', pulse: true },
  WARMING: { label: 'WARMING', color: 'text-amber-400', bg: 'bg-amber-500' },
  COOLING: { label: 'COOLING', color: 'text-blue-400', bg: 'bg-blue-500' },
  CAUTION: { label: 'CAUTION', color: 'text-white/40', bg: 'bg-white/40' },
  PROHIBITED: { label: 'PROHIBITED', color: 'text-red-400', bg: 'bg-red-500' },
};

const tierColors: Record<string, string> = {
  TIER_1: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  TIER_2: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  TIER_3: 'bg-white/5 text-white/40 border-white/15',
};

const scoreColor = (s: number) => s >= 80 ? 'text-emerald-400' : s >= 60 ? 'text-amber-400' : s >= 40 ? 'text-white/50' : 'text-red-400';
const rsiColor = (v: number) => v > 70 ? 'text-red-400' : v < 30 ? 'text-emerald-400' : 'text-white/50';

// --- SORT BUTTON ---
function SortBtn({ label, sortKey, current, dir, onSort }: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${
        active ? 'bg-white/10 text-amber-400' : 'text-white/30 hover:text-white/60 hover:bg-white/5'
      }`}
    >
      {label} {active && (dir === 'desc' ? '↓' : '↑')}
    </button>
  );
}

// --- SCAN RESULT ROW ---
function ScanResultRow({ result, selected, onSelect, onIncubate }: {
  result: ScanResult; selected: boolean;
  onSelect: (sym: string) => void; onIncubate: (sym: string) => void;
}) {
  const st = statusConfig[result.opportunityStatus];

  return (
    <div className={`rounded-xl border bg-white/[0.02] p-4 transition-all ${
      result.prohibited ? 'border-red-500/15 opacity-50' :
      result.opportunityStatus === 'READY' ? 'border-emerald-500/25 bg-emerald-500/[0.03]' :
      result.tier === 'TIER_1' ? 'border-emerald-500/15' :
      result.tier === 'TIER_2' ? 'border-amber-500/10' : 'border-white/6'
    } ${selected ? 'ring-1 ring-amber-400/40' : ''}`}>

      {/* Row 1: Main info */}
      <div className="flex items-center gap-3">
        {/* Checkbox */}
        <button onClick={() => onSelect(result.rawSymbol)} className={`w-4 h-4 rounded border shrink-0 transition-colors ${
          selected ? 'bg-amber-400 border-amber-400' : 'border-white/20 hover:border-white/40'
        }`}>
          {selected && <svg className="w-4 h-4 text-black" viewBox="0 0 16 16" fill="currentColor"><path d="M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z"/></svg>}
        </button>

        {/* Score */}
        <div className={`text-2xl font-black font-mono w-10 text-center ${scoreColor(result.score)}`}>{Math.round(result.score)}</div>

        {/* Live status dot */}
        <div className="flex flex-col items-center w-5 shrink-0">
          <span className={`w-2 h-2 rounded-full ${st.bg} ${st.pulse ? 'animate-pulse' : ''}`} />
          <span className={`text-[7px] font-bold mt-0.5 ${st.color}`}>{st.label.slice(0, 3)}</span>
        </div>

        {/* Symbol & info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-black font-mono">{cleanSymbol(result.symbol)}</span>
            <Badge text={result.direction} variant={result.direction === 'LONG' ? 'bullish' : result.direction === 'SHORT' ? 'bearish' : 'neutral'} />
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${tierColors[result.tier]}`}>{result.tier.replace('_', ' ')}</span>
            {result.mesoAligned && <Badge text="MESO ✓" variant="success" />}
            {result.autoSafe && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">SAFE</span>}
            {result.prohibited && <Badge text="PROHIBITED" variant="danger" />}
          </div>
          <div className="text-[10px] text-white/25 truncate">{result.name} • {result.assetClass}</div>
        </div>

        {/* Technicals mini */}
        <div className="hidden sm:grid grid-cols-3 gap-3 text-center text-[10px] shrink-0">
          <div>
            <div className="text-[8px] text-white/15">RSI</div>
            <div className={`font-mono font-bold ${rsiColor(result.rsi)}`}>{Math.round(result.rsi)}</div>
          </div>
          <div>
            <div className="text-[8px] text-white/15">ATR%</div>
            <div className="font-mono text-white/40">{result.atrPercent.toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-[8px] text-white/15">Vol</div>
            <div className={`font-mono ${result.volumeRatio > 1.5 ? 'text-amber-400' : 'text-white/30'}`}>{result.volumeRatio.toFixed(1)}x</div>
          </div>
        </div>

        {/* Price */}
        <div className="text-right shrink-0 w-24">
          <div className="text-sm font-mono tabular-nums">{priceFmt(result.price)}</div>
          <div className={`text-[11px] font-mono font-bold ${pctColor(result.changePercent)}`}>{pctFmt(result.changePercent)}</div>
        </div>

        {/* Incubate button */}
        {!result.prohibited && (
          <button
            onClick={(e) => { e.stopPropagation(); onIncubate(result.rawSymbol); }}
            className="shrink-0 text-[9px] font-bold px-2 py-1.5 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/15 transition-colors"
            title="Send to Incubator"
          >
            ⟶ INC
          </button>
        )}
      </div>

      {/* Row 2: Reason */}
      {result.reason && <div className="text-[10px] text-white/30 mt-2 ml-[7.5rem]">{result.reason}</div>}
    </div>
  );
}

// --- FILTER BAR ---
function FilterBar({ filters, summary, onChange }: {
  filters: FilterState; summary: ReturnType<typeof useScannerData>['summary'];
  onChange: (f: Partial<FilterState>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Tier tabs */}
      <div className="flex items-center gap-0.5 bg-white/3 p-0.5 rounded-lg border border-white/6">
        {[
          { id: 'all', label: `ALL ${summary.total}` },
          { id: 'TIER_1', label: `T1 ${summary.tier1}` },
          { id: 'TIER_2', label: `T2 ${summary.tier2}` },
          { id: 'TIER_3', label: `T3 ${summary.tier3}` },
        ].map(t => (
          <button key={t.id} onClick={() => onChange({ tier: t.id })}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-colors ${
              filters.tier === t.id ? 'bg-white/10 text-amber-400' : 'text-white/30 hover:text-white/60'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-0.5 bg-white/3 p-0.5 rounded-lg border border-white/6">
        {[
          { id: 'all', label: 'ALL' },
          { id: 'READY', label: `READY ${summary.ready}` },
          { id: 'WARMING', label: `WARM ${summary.warming}` },
        ].map(t => (
          <button key={t.id} onClick={() => onChange({ status: t.id })}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-colors ${
              filters.status === t.id ? 'bg-white/10 text-emerald-400' : 'text-white/30 hover:text-white/60'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* Direction */}
      <div className="flex items-center gap-0.5 bg-white/3 p-0.5 rounded-lg border border-white/6">
        {['all', 'LONG', 'SHORT'].map(d => (
          <button key={d} onClick={() => onChange({ direction: d })}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-colors ${
              filters.direction === d ? 'bg-white/10 text-amber-400' : 'text-white/30 hover:text-white/60'
            }`}>{d === 'all' ? 'ALL' : d}</button>
        ))}
      </div>

      {/* Class */}
      <select
        value={filters.assetClass}
        onChange={e => onChange({ assetClass: e.target.value })}
        className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white/3 border border-white/6 text-white/50 outline-none cursor-pointer"
      >
        <option value="all">All Classes</option>
        {summary.classes.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      {/* Toggle buttons */}
      <button onClick={() => onChange({ autoSafeOnly: !filters.autoSafeOnly })}
        className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
          filters.autoSafeOnly ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-white/3 text-white/30 border-white/6 hover:text-white/60'
        }`}>
        🛡 SAFE ({summary.safe})
      </button>

      <button onClick={() => onChange({ hideProhibited: !filters.hideProhibited })}
        className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
          filters.hideProhibited ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-white/3 text-white/30 border-white/6 hover:text-white/60'
        }`}>
        {filters.hideProhibited ? '✕ HIDE' : '⊘ SHOW'} PROHIBITED
      </button>

      <button onClick={() => onChange({ mesoOnly: !filters.mesoOnly })}
        className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
          filters.mesoOnly ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-white/3 text-white/30 border-white/6 hover:text-white/60'
        }`}>
        MESO ONLY
      </button>
    </div>
  );
}

interface FilterState {
  tier: string;
  status: string;
  direction: string;
  assetClass: string;
  autoSafeOnly: boolean;
  hideProhibited: boolean;
  mesoOnly: boolean;
}

const defaultFilters: FilterState = {
  tier: 'all', status: 'all', direction: 'all', assetClass: 'all',
  autoSafeOnly: false, hideProhibited: true, mesoOnly: false,
};

// --- MAIN VIEW ---
export function ScannerView() {
  const { results, summary, isLoading, isError, refetch } = useScannerData();
  const { setView } = useTerminal();
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [incubated, setIncubated] = useState<Set<string>>(new Set());

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }, [sortKey]);

  const handleSelect = useCallback((sym: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym); else next.add(sym);
      return next;
    });
  }, []);

  const handleIncubate = useCallback((sym: string) => {
    setIncubated(prev => new Set(prev).add(sym));
  }, []);

  const handleBulkIncubate = useCallback(() => {
    setIncubated(prev => {
      const next = new Set(prev);
      selected.forEach(s => next.add(s));
      return next;
    });
    setSelected(new Set());
  }, [selected]);

  const handleAutoIncubate = useCallback(() => {
    const safeSymbols = results.filter(r => r.autoSafe).map(r => r.rawSymbol);
    setIncubated(prev => {
      const next = new Set(prev);
      safeSymbols.forEach(s => next.add(s));
      return next;
    });
  }, [results]);

  const handleSelectAll = useCallback(() => {
    const filtered = applyFilters(results, filters);
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.rawSymbol)));
  }, [results, filters, selected]);

  const updateFilters = useCallback((partial: Partial<FilterState>) => {
    setFilters(prev => ({ ...prev, ...partial }));
  }, []);

  if (isLoading) return (
    <div className="space-y-4">
      <h2 className="text-xl font-black tracking-tight">Live Opportunity Scanner</h2>
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="w-6 h-6 border-2 border-white/10 border-t-amber-400 rounded-full animate-spin" />
        <p className="text-[11px] text-white/30">Scanning markets & MESO alignment...</p>
      </div>
    </div>
  );
  if (isError) return <ErrorBox message="Failed to load scanner data" onRetry={() => refetch()} />;

  const filtered = applyFilters(results, filters);
  const sorted = applySort(filtered, sortKey, sortDir);
  const readyCount = results.filter(r => r.opportunityStatus === 'READY').length;
  const incubatedCount = incubated.size;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-black tracking-tight">Live Opportunity Scanner</h2>
          <span className={`w-2 h-2 rounded-full ${readyCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-white/20'}`} />
          <span className="text-[10px] text-white/30">{readyCount} ready</span>
        </div>
        <div className="flex items-center gap-2">
          {incubatedCount > 0 && (
            <button onClick={() => setView('incubator')}
              className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors">
              View Incubator ({incubatedCount})
            </button>
          )}
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <Card className="!p-3"><Metric label="Scanned" value={summary.total} small /></Card>
        <Card className="!p-3"><Metric label="READY" value={summary.ready} small color="text-emerald-400" /></Card>
        <Card className="!p-3"><Metric label="WARMING" value={summary.warming} small color="text-amber-400" /></Card>
        <Card className="!p-3"><Metric label="Auto Safe" value={summary.safe} small color="text-emerald-300" /></Card>
        <Card className="!p-3"><Metric label="Long / Short" value={`${summary.bullish} / ${summary.bearish}`} small /></Card>
        <Card className="!p-3"><Metric label="Top Pick" value={cleanSymbol(summary.topOpportunity)} small color="text-amber-400" /></Card>
      </div>

      {/* Filters */}
      <FilterBar filters={filters} summary={summary} onChange={updateFilters} />

      {/* Sort bar + bulk actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-white/20 mr-1">Sort:</span>
          <SortBtn label="Score" sortKey="score" current={sortKey} dir={sortDir} onSort={handleSort} />
          <SortBtn label="Change%" sortKey="change" current={sortKey} dir={sortDir} onSort={handleSort} />
          <SortBtn label="RSI" sortKey="rsi" current={sortKey} dir={sortDir} onSort={handleSort} />
          <SortBtn label="ATR%" sortKey="atr" current={sortKey} dir={sortDir} onSort={handleSort} />
          <SortBtn label="Volume" sortKey="volume" current={sortKey} dir={sortDir} onSort={handleSort} />
          <SortBtn label="Name" sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSelectAll}
            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white/3 text-white/30 border border-white/6 hover:text-white/60 transition-colors">
            {selected.size === filtered.length && filtered.length > 0 ? 'Deselect All' : 'Select All'}
          </button>
          {selected.size > 0 && (
            <button onClick={handleBulkIncubate}
              className="text-[10px] font-bold px-3 py-1 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors">
              ⟶ Incubate Selected ({selected.size})
            </button>
          )}
          <button onClick={handleAutoIncubate}
            className="text-[10px] font-bold px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors">
            ⚡ Auto-Incubate Safe ({summary.safe})
          </button>
        </div>
      </div>

      {/* Results count */}
      <div className="text-[10px] text-white/20">
        Showing {sorted.length} of {results.length} • {incubatedCount > 0 && <span className="text-amber-400">{incubatedCount} incubated</span>}
      </div>

      {/* Results list */}
      <div className="space-y-2">
        {sorted.map(r => (
          <ScanResultRow key={r.rawSymbol} result={r}
            selected={selected.has(r.rawSymbol)}
            onSelect={handleSelect}
            onIncubate={handleIncubate}
          />
        ))}
        {sorted.length === 0 && (
          <div className="text-sm text-white/30 text-center py-8">No results match current filters</div>
        )}
      </div>
    </div>
  );
}

// --- HELPERS ---
function applyFilters(results: ScanResult[], f: FilterState): ScanResult[] {
  return results.filter(r => {
    if (f.tier !== 'all' && r.tier !== f.tier) return false;
    if (f.status !== 'all' && r.opportunityStatus !== f.status) return false;
    if (f.direction !== 'all' && r.direction !== f.direction) return false;
    if (f.assetClass !== 'all' && r.assetClass !== f.assetClass) return false;
    if (f.autoSafeOnly && !r.autoSafe) return false;
    if (f.hideProhibited && r.prohibited) return false;
    if (f.mesoOnly && !r.mesoAligned) return false;
    return true;
  });
}

function applySort(results: ScanResult[], key: SortKey, dir: SortDir): ScanResult[] {
  const sorted = [...results].sort((a, b) => {
    let diff = 0;
    switch (key) {
      case 'score': diff = a.score - b.score; break;
      case 'change': diff = Math.abs(a.changePercent) - Math.abs(b.changePercent); break;
      case 'rsi': diff = a.rsi - b.rsi; break;
      case 'atr': diff = a.atrPercent - b.atrPercent; break;
      case 'volume': diff = a.volumeRatio - b.volumeRatio; break;
      case 'name': diff = a.symbol.localeCompare(b.symbol); break;
    }
    return dir === 'desc' ? -diff : diff;
  });
  return sorted;
}
