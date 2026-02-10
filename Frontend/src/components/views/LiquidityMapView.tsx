import { useState } from 'react';
import { Card, Badge, Spinner, ErrorBox, ProgressBar, TabBar, fmt, priceFmt, cleanSymbol } from '../ui/primitives';
import { useTerminal } from '../../store/useTerminal';
import { useLiquidityMap } from '../../hooks/useApi';

// --- TYPES ---
interface EqualLevel {
  price: number; type: 'EQUAL_HIGHS' | 'EQUAL_LOWS'; touches: number;
  strength: 'STRONG' | 'MODERATE' | 'WEAK'; liquidityEstimate: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface VolumeProfileBar {
  priceRange: { low: number; high: number }; volume: number; volumePercent: number; isBuyDominant: boolean;
}

interface LiquidityTiming {
  bestSession: string; avgTimeToLiquidityGrab: string;
  historicalPattern: string; probabilityOfSweep: number; nextLikelyWindow: string;
}

interface LiquidityMapData {
  symbol: string; displaySymbol: string;
  assetClass: 'forex' | 'etf' | 'crypto' | 'commodity' | 'index';
  currentPrice: number; atr: number;
  volumeProfile: VolumeProfileBar[];
  poc: { price: number; volume: number };
  valueArea: { high: number; low: number };
  liquidityZones: { priceLevel: number; volumeConcentration: number; type: string; description: string }[];
  equalLevels: EqualLevel[];
  buySideLiquidity: { level: number; strength: number }[];
  sellSideLiquidity: { level: number; strength: number }[];
  marketDirection: 'SEEKING_BUYSIDE' | 'SEEKING_SELLSIDE' | 'BALANCED';
  timing: LiquidityTiming;
  source: { type: string; reliability: string; description: string; caveat?: string };
  cotData?: { commercialNet: number; nonCommercialNet: number; sentiment: string };
  timestamp: string;
}

interface ClassSummary {
  total: number; seekingBuyside: number; seekingSellside: number; balanced: number;
  topLiquidity: { symbol: string; direction: string; nearestLiquidity: string; timing?: string; probability?: number }[];
}

interface LiquidityTotalSummary {
  analyzed: number; fromMeso?: boolean; seekingBuyside: number; seekingSellside: number;
}

interface LiquidityMapSummary {
  forex: ClassSummary; etf: ClassSummary; crypto: ClassSummary;
  commodity: ClassSummary; index: ClassSummary;
  total: number | LiquidityTotalSummary;
}

interface LiquidityMapResponse {
  success: boolean; timestamp: string;
  forex: LiquidityMapData[]; etf: LiquidityMapData[]; crypto: LiquidityMapData[];
  commodity: LiquidityMapData[]; index: LiquidityMapData[]; all: LiquidityMapData[];
  summary: LiquidityMapSummary;
}

type AssetClassKey = 'all' | 'forex' | 'etf' | 'crypto' | 'commodity' | 'index';


const dirColor = (d: string) => {
  if (d.includes('BUYSIDE') || d === 'BULLISH') return 'text-emerald-400';
  if (d.includes('SELLSIDE') || d === 'BEARISH') return 'text-red-400';
  return 'text-white/40';
};

function GlobalSummary({ summary }: { summary: LiquidityMapSummary }) {
  // Collect all high-probability sweeps from class topLiquidity arrays
  const allSweeps = (['forex', 'etf', 'crypto', 'commodity', 'index'] as const)
    .flatMap(cls => (summary[cls]?.topLiquidity || []).filter(t => (t.probability || 0) >= 50));

  const totalBuyside = (['forex', 'etf', 'crypto', 'commodity', 'index'] as const)
    .reduce((s, c) => s + (summary[c]?.seekingBuyside || 0), 0);
  const totalSellside = (['forex', 'etf', 'crypto', 'commodity', 'index'] as const)
    .reduce((s, c) => s + (summary[c]?.seekingSellside || 0), 0);
  const globalDir = totalBuyside > totalSellside ? 'SEEKING_BUYSIDE' : totalSellside > totalBuyside ? 'SEEKING_SELLSIDE' : 'BALANCED';

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-5">
      <div className="flex flex-wrap gap-6 items-center mb-4">
        <div>
          <span className="text-[10px] text-white/30 uppercase block">Total Assets</span>
          <span className="text-xl font-black">{typeof summary.total === 'object' ? summary.total.analyzed : summary.total}</span>
        </div>
        <div>
          <span className="text-[10px] text-white/30 uppercase block">Global Direction</span>
          <span className={`text-lg font-black ${dirColor(globalDir)}`}>{globalDir.replace('SEEKING_', '')}</span>
        </div>
        <div>
          <span className="text-[10px] text-white/30 uppercase block">Buyside / Sellside</span>
          <span className="text-sm font-mono"><span className="text-emerald-400">{totalBuyside}</span> / <span className="text-red-400">{totalSellside}</span></span>
        </div>
      </div>

      {allSweeps.length > 0 && (
        <div>
          <div className="text-[10px] text-amber-400/60 uppercase font-bold mb-2">High Probability Sweeps</div>
          <div className="flex flex-wrap gap-2">
            {allSweeps.map((s, i) => (
              <div key={i} className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/15 rounded-lg px-3 py-1.5">
                <span className="font-mono text-xs font-bold">{cleanSymbol(s.symbol)}</span>
                <Badge text={s.direction.replace('SEEKING_', '')} variant={s.direction.includes('BUYSIDE') ? 'bullish' : 'bearish'} />
                {s.probability != null && <span className="text-[10px] font-mono text-amber-400">{s.probability}%</span>}
                {s.timing && <span className="text-[10px] text-white/25">{s.timing}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VolumeProfileVisual({ data }: { data: LiquidityMapData }) {
  const maxVol = Math.max(...data.volumeProfile.map(b => b.volume), 1);

  return (
    <div className="space-y-0.5">
      {data.volumeProfile.map((bar, i) => {
        const w = (bar.volume / maxVol) * 100;
        const isPOC = bar.priceRange.low <= data.poc.price && bar.priceRange.high >= data.poc.price;
        const isVA = bar.priceRange.low <= data.valueArea.high && bar.priceRange.high >= data.valueArea.low;

        return (
          <div key={i} className="flex items-center gap-2 text-[10px]">
            <span className="w-16 text-right font-mono text-white/25 shrink-0">{priceFmt(bar.priceRange.high)}</span>
            <div className="flex-1 h-3 bg-white/3 rounded-sm overflow-hidden relative">
              <div
                className={`h-full rounded-sm transition-all ${
                  isPOC ? 'bg-amber-500' : isVA ? (bar.isBuyDominant ? 'bg-emerald-500/60' : 'bg-red-500/60') : (bar.isBuyDominant ? 'bg-emerald-500/30' : 'bg-red-500/30')
                }`}
                style={{ width: `${w}%` }}
              />
            </div>
            <span className="w-10 font-mono text-white/15 shrink-0">{bar.volumePercent.toFixed(0)}%</span>
          </div>
        );
      })}
    </div>
  );
}

function AssetLiquidityCard({ data }: { data: LiquidityMapData }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black font-mono">{data.displaySymbol}</span>
              <span className="text-xs font-mono text-white/40">{priceFmt(data.currentPrice)}</span>
            </div>
            <div className="text-[10px] text-white/20">{data.assetClass.toUpperCase()} • ATR: {fmt(data.atr, 4)}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge text={data.marketDirection.replace('SEEKING_', '')} variant={data.marketDirection.includes('BUYSIDE') ? 'bullish' : data.marketDirection.includes('SELLSIDE') ? 'bearish' : 'neutral'} />
          <span className="text-[10px] text-amber-400 font-mono">{data.timing.probabilityOfSweep}%</span>
          <span className="text-white/20 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      <div className="flex gap-4 mt-2 text-[10px]">
        <span className="text-white/25">POC: <span className="font-mono text-amber-400">{priceFmt(data.poc.price)}</span></span>
        <span className="text-white/25">VA: <span className="font-mono">{priceFmt(data.valueArea.low)} - {priceFmt(data.valueArea.high)}</span></span>
        <span className="text-white/25">Source: <span className="text-white/35">{data.source.type} ({data.source.reliability})</span></span>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Volume Profile */}
          {data.volumeProfile.length > 0 && (
            <Card title="Volume Profile">
              <VolumeProfileVisual data={data} />
            </Card>
          )}

          {/* Liquidity Zones */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Buy-Side Liquidity">
              {data.buySideLiquidity.length === 0 ? <div className="text-sm text-white/20">None detected</div> : (
                <div className="space-y-1.5">
                  {data.buySideLiquidity.map((l, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span className="font-mono text-emerald-400">{fmt(l.level)}</span>
                      <ProgressBar value={l.strength} max={100} color="bg-emerald-500" />
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card title="Sell-Side Liquidity">
              {data.sellSideLiquidity.length === 0 ? <div className="text-sm text-white/20">None detected</div> : (
                <div className="space-y-1.5">
                  {data.sellSideLiquidity.map((l, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span className="font-mono text-red-400">{fmt(l.level)}</span>
                      <ProgressBar value={l.strength} max={100} color="bg-red-500" />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Equal Levels */}
          {data.equalLevels.length > 0 && (
            <Card title="Equal Highs/Lows">
              <div className="space-y-1.5">
                {data.equalLevels.map((el, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] p-2 rounded bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-2">
                      <Badge text={el.type.replace('EQUAL_', '')} variant={el.type === 'EQUAL_HIGHS' ? 'bullish' : 'bearish'} />
                      <span className="font-mono">{priceFmt(el.price)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white/25">{el.touches} touches</span>
                      <Badge text={el.strength} variant={el.strength === 'STRONG' ? 'success' : el.strength === 'MODERATE' ? 'warning' : 'default'} />
                      <Badge text={`LIQ: ${el.liquidityEstimate}`} variant={el.liquidityEstimate === 'HIGH' ? 'danger' : 'default'} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Timing */}
          <Card title="Sweep Timing">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
              <div><div className="text-[9px] text-white/25">Best Session</div><div className="font-bold">{data.timing.bestSession}</div></div>
              <div><div className="text-[9px] text-white/25">Avg Time to Grab</div><div className="font-bold">{data.timing.avgTimeToLiquidityGrab}</div></div>
              <div><div className="text-[9px] text-white/25">Pattern</div><div className="font-bold">{data.timing.historicalPattern}</div></div>
              <div><div className="text-[9px] text-white/25">Next Window</div><div className="font-bold text-amber-400">{data.timing.nextLikelyWindow}</div></div>
            </div>
          </Card>

          {/* COT Data */}
          {data.cotData && (
            <Card title="COT Positioning">
              <div className="grid grid-cols-3 gap-3 text-center text-[11px]">
                <div>
                  <div className="text-[9px] text-white/25">Commercial Net</div>
                  <div className={`font-mono font-bold ${data.cotData.commercialNet > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {data.cotData.commercialNet > 0 ? '+' : ''}{data.cotData.commercialNet}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-white/25">Non-Comm Net</div>
                  <div className={`font-mono font-bold ${data.cotData.nonCommercialNet > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {data.cotData.nonCommercialNet > 0 ? '+' : ''}{data.cotData.nonCommercialNet}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-white/25">Sentiment</div>
                  <Badge text={data.cotData.sentiment} variant={data.cotData.sentiment === 'BULLISH' ? 'bullish' : data.cotData.sentiment === 'BEARISH' ? 'bearish' : 'neutral'} />
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export function LiquidityMapView() {
  const { data, isLoading, isError, refetch } = useLiquidityMap();
  const { setView } = useTerminal();
  const [assetClass, setAssetClass] = useState<AssetClassKey>('all');

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-black tracking-tight">Liquidity Heatmap</h2>
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-6 h-6 border-2 border-white/10 border-t-amber-400 rounded-full animate-spin" />
          <p className="text-[11px] text-white/30">Loading liquidity data for all asset classes... This may take 20-30 seconds.</p>
        </div>
      </div>
    );
  }
  if (isError || !data?.success) return <ErrorBox message="Failed to load liquidity map" onRetry={() => refetch()} />;

  const assets = data[assetClass] || [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black tracking-tight">Liquidity Heatmap</h2>
        <TabBar
          tabs={[
            { id: 'all', label: `ALL (${data.all?.length || 0})` },
            { id: 'forex', label: `FX (${data.forex?.length || 0})` },
            { id: 'crypto', label: `CRYPTO (${data.crypto?.length || 0})` },
            { id: 'etf', label: `ETF (${data.etf?.length || 0})` },
            { id: 'commodity', label: `COMM (${data.commodity?.length || 0})` },
            { id: 'index', label: `IDX (${data.index?.length || 0})` },
          ]}
          active={assetClass}
          onChange={(id) => setAssetClass(id as AssetClassKey)}
        />
      </div>

      <GlobalSummary summary={data.summary} />

      {/* Class summaries */}
      {assetClass !== 'all' && (() => {
        const cs = data.summary[assetClass as Exclude<AssetClassKey, 'all'>];
        if (!cs) return null;
        return (
          <div className="grid grid-cols-4 gap-3">
            <Card><div className="text-center"><div className="text-[10px] text-white/25">Total</div><div className="text-xl font-black">{cs.total}</div></div></Card>
            <Card><div className="text-center"><div className="text-[10px] text-emerald-400/50">Seeking Buyside</div><div className="text-xl font-black text-emerald-400">{cs.seekingBuyside}</div></div></Card>
            <Card><div className="text-center"><div className="text-[10px] text-red-400/50">Seeking Sellside</div><div className="text-xl font-black text-red-400">{cs.seekingSellside}</div></div></Card>
            <Card><div className="text-center"><div className="text-[10px] text-white/25">Balanced</div><div className="text-xl font-black text-white/40">{cs.balanced}</div></div></Card>
          </div>
        );
      })()}

      <div className="space-y-3">
        {assets.map((a) => <AssetLiquidityCard key={a.symbol} data={a} />)}
        {assets.length === 0 && <div className="text-sm text-white/30 text-center py-8">No assets in this category</div>}
      </div>

      {/* Pipeline Context */}
      <div className="rounded-xl border border-white/6 bg-white/[0.02] p-4">
        <div className="text-[10px] text-white/20 uppercase font-bold tracking-wider mb-3">Related Views</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button onClick={() => setView('meso')} className="text-left rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 hover:bg-amber-500/10 transition-all group">
            <div className="text-xs font-bold text-amber-400">← MESO</div>
            <div className="text-[10px] text-white/30 mt-0.5">Asset class expectations & tilts</div>
          </button>
          <button onClick={() => setView('currency')} className="text-left rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 hover:bg-blue-500/10 transition-all group">
            <div className="text-xs font-bold text-blue-400">FX Strength</div>
            <div className="text-[10px] text-white/30 mt-0.5">Currency strength & COT data</div>
          </button>
          <button onClick={() => setView('signals')} className="text-left rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 hover:bg-emerald-500/10 transition-all group">
            <div className="text-xs font-bold text-emerald-400">Signals →</div>
            <div className="text-[10px] text-white/30 mt-0.5">Trade signals with liquidity context</div>
          </button>
          <button onClick={() => setView('micro')} className="text-left rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 hover:bg-amber-500/10 transition-all group">
            <div className="text-xs font-bold text-amber-400">MICRO →</div>
            <div className="text-[10px] text-white/30 mt-0.5">SMC setups on these instruments</div>
          </button>
        </div>
      </div>
    </div>
  );
}
