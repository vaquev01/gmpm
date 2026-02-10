import { useState } from 'react';
import { Card, Badge, Spinner, ErrorBox, ProgressBar, TabBar, fmt, priceFmt, cleanSymbol } from '../ui/primitives';
import { useTerminal } from '../../store/useTerminal';
import { useMicro, useMeso } from '../../hooks/useApi';

// --- TYPES (matching legacy MicroView) ---
interface Setup {
  id: string; symbol: string; displaySymbol: string;
  type: 'BREAKOUT' | 'PULLBACK' | 'REVERSAL' | 'CONTINUATION' | 'LIQUIDITY_GRAB';
  direction: 'LONG' | 'SHORT';
  timeframe: 'M15' | 'H1' | 'H4';
  entry: number; stopLoss: number; takeProfit1: number; takeProfit2: number; takeProfit3: number;
  riskReward: number; confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confluences: string[]; invalidation: string; thesis: string;
  mesoAlignment: boolean; technicalScore: number;
}

interface TechnicalAnalysis {
  trend: { h4: string; h1: string; m15: string; alignment: string };
  structure: { lastBOS: string | null; lastCHoCH: string | null; currentPhase: string };
  levels: { resistance: number[]; support: number[]; pivot: number; atr: number };
  indicators: { rsi: number; rsiDivergence: string | null; ema21: number; ema50: number; ema200: number; macdSignal: string; bbPosition: string };
  volume: { relative: number; trend: string; climax: boolean };
  smc: {
    orderBlocks: { type: string; low: number; high: number; tested: boolean }[];
    fvgs: { type: string; low: number; high: number; filled: boolean }[];
    liquidityPools: { type: string; level: number; strength: string }[];
    premiumDiscount: string;
  };
}

interface MicroAnalysis {
  symbol: string; displaySymbol: string; name?: string; assetClass?: string;
  price: number; technical: TechnicalAnalysis; setups: Setup[];
  recommendation: { action: string; reason: string; bestSetup: Setup | null };
  scenarioAnalysis?: { status: string; statusReason: string; entryQuality: string; timing: string };
}

interface MicroData {
  success: boolean; timestamp: string;
  analyses: MicroAnalysis[];
  summary: { total: number; withSetups: number; executeReady: number; message: string };
}

const trendColor = (t: string) => t === 'BULLISH' ? 'text-emerald-400 bg-emerald-500/15' : t === 'BEARISH' ? 'text-red-400 bg-red-500/15' : 'text-white/40 bg-white/5';
const actionColor = (a: string) => a === 'EXECUTE' ? 'border-emerald-500/30 bg-emerald-500/10' : a === 'WAIT' ? 'border-amber-500/30 bg-amber-500/10' : 'border-red-500/30 bg-red-500/10';
const actionTextColor = (a: string) => a === 'EXECUTE' ? 'text-emerald-400' : a === 'WAIT' ? 'text-amber-400' : 'text-red-400';
const setupColors: Record<string, string> = {
  BREAKOUT: 'bg-blue-500/15 text-blue-400',
  PULLBACK: 'bg-violet-500/15 text-violet-400',
  REVERSAL: 'bg-orange-500/15 text-orange-400',
  CONTINUATION: 'bg-cyan-500/15 text-cyan-400',
  LIQUIDITY_GRAB: 'bg-pink-500/15 text-pink-400',
};

function MTFPanel({ trend }: { trend: TechnicalAnalysis['trend'] }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {(['h4', 'h1', 'm15'] as const).map((tf) => (
        <div key={tf} className="text-center">
          <div className="text-[9px] text-white/25 uppercase">{tf}</div>
          <div className={`text-[11px] font-bold px-2 py-0.5 rounded ${trendColor(trend[tf])}`}>{trend[tf]}</div>
        </div>
      ))}
      <div className="text-center">
        <div className="text-[9px] text-white/25 uppercase">Align</div>
        <div className={`text-[11px] font-bold px-2 py-0.5 rounded ${
          trend.alignment === 'ALIGNED' ? 'text-emerald-400 bg-emerald-500/15' :
          trend.alignment === 'PARTIAL' ? 'text-amber-400 bg-amber-500/15' : 'text-red-400 bg-red-500/15'
        }`}>{trend.alignment}</div>
      </div>
    </div>
  );
}

function IndicatorsPanel({ ind, vol }: { ind: TechnicalAnalysis['indicators']; vol: TechnicalAnalysis['volume'] }) {
  const rsiColor = ind.rsi > 70 ? 'text-red-400' : ind.rsi < 30 ? 'text-emerald-400' : 'text-white/70';
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-2 bg-white/[0.03] rounded-lg">
          <div className="text-[9px] text-white/25">RSI</div>
          <div className={`text-lg font-bold font-mono ${rsiColor}`}>{Math.round(ind.rsi)}</div>
          {ind.rsiDivergence && (
            <div className={`text-[9px] font-bold ${ind.rsiDivergence === 'BULLISH' ? 'text-emerald-400' : 'text-red-400'}`}>
              {ind.rsiDivergence} DIV
            </div>
          )}
        </div>
        <div className="text-center p-2 bg-white/[0.03] rounded-lg">
          <div className="text-[9px] text-white/25">MACD</div>
          <div className={`text-sm font-bold ${ind.macdSignal === 'BUY' ? 'text-emerald-400' : ind.macdSignal === 'SELL' ? 'text-red-400' : 'text-white/40'}`}>
            {ind.macdSignal}
          </div>
        </div>
        <div className="text-center p-2 bg-white/[0.03] rounded-lg">
          <div className="text-[9px] text-white/25">Bollinger</div>
          <div className={`text-sm font-bold ${ind.bbPosition === 'UPPER' ? 'text-red-400' : ind.bbPosition === 'LOWER' ? 'text-emerald-400' : 'text-white/40'}`}>
            {ind.bbPosition}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="text-center"><span className="text-white/25">EMA21</span><div className="font-mono">{fmt(ind.ema21)}</div></div>
        <div className="text-center"><span className="text-white/25">EMA50</span><div className="font-mono">{fmt(ind.ema50)}</div></div>
        <div className="text-center"><span className="text-white/25">EMA200</span><div className="font-mono">{fmt(ind.ema200)}</div></div>
      </div>
      <div className="border-t border-white/5 pt-2 flex items-center justify-between text-[11px]">
        <span className="text-white/25">Rel Volume</span>
        <span className={`font-mono font-bold ${vol.relative > 1.5 ? 'text-emerald-400' : vol.relative < 0.5 ? 'text-red-400' : 'text-white/50'}`}>
          {vol.relative.toFixed(2)}x
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-white/25">Vol Trend</span>
        <span className={`font-bold ${vol.trend === 'INCREASING' ? 'text-emerald-400' : vol.trend === 'DECREASING' ? 'text-red-400' : 'text-white/40'}`}>
          {vol.trend}{vol.climax ? ' (CLIMAX)' : ''}
        </span>
      </div>
    </div>
  );
}

function SMCPanel({ smc, levels }: { smc: TechnicalAnalysis['smc']; levels: TechnicalAnalysis['levels'] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/25 uppercase">Premium/Discount</span>
        <span className={`text-sm font-bold px-2 py-0.5 rounded ${
          smc.premiumDiscount === 'DISCOUNT' ? 'bg-emerald-500/15 text-emerald-400' :
          smc.premiumDiscount === 'PREMIUM' ? 'bg-red-500/15 text-red-400' : 'bg-white/5 text-white/40'
        }`}>{smc.premiumDiscount}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[11px]">
        <div>
          <div className="text-white/25 mb-1">Order Blocks</div>
          {smc.orderBlocks.length > 0 ? smc.orderBlocks.map((ob, i) => (
            <div key={i} className={`font-mono ${ob.type === 'BULLISH' ? 'text-emerald-400' : 'text-red-400'}`}>
              {ob.type}: {priceFmt(ob.low)}-{priceFmt(ob.high)}
            </div>
          )) : <div className="text-white/15">None nearby</div>}
        </div>
        <div>
          <div className="text-white/25 mb-1">FVGs</div>
          {smc.fvgs.length > 0 ? smc.fvgs.map((fvg, i) => (
            <div key={i} className={`font-mono ${fvg.type === 'BULLISH' ? 'text-emerald-400' : 'text-red-400'}`}>
              {fvg.type}: {priceFmt(fvg.low)}-{priceFmt(fvg.high)}
            </div>
          )) : <div className="text-white/15">None unfilled</div>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[11px] border-t border-white/5 pt-2">
        <div>
          <div className="text-white/25 mb-1">Resistance</div>
          {levels.resistance.map((r, i) => <div key={i} className="font-mono text-red-400">R{i+1}: {priceFmt(r)}</div>)}
        </div>
        <div>
          <div className="text-white/25 mb-1">Support</div>
          {levels.support.map((s, i) => <div key={i} className="font-mono text-emerald-400">S{i+1}: {priceFmt(s)}</div>)}
        </div>
      </div>

      <div className="text-[11px] border-t border-white/5 pt-2">
        <div className="text-white/25 mb-1">Liquidity Pools</div>
        <div className="grid grid-cols-2 gap-2">
          {smc.liquidityPools.map((lp, i) => (
            <div key={i} className={`font-mono ${lp.type === 'BUY_SIDE' ? 'text-emerald-400' : 'text-red-400'}`}>
              {lp.type}: {priceFmt(lp.level)} ({lp.strength})
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] border-t border-white/5 pt-2">
        <span className="text-white/25">Pivot</span>
        <span className="font-mono font-bold">{priceFmt(levels.pivot)}</span>
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-white/25">ATR</span>
        <span className="font-mono font-bold">{fmt(levels.atr, 4)}</span>
      </div>
    </div>
  );
}

function SetupCard({ setup }: { setup: Setup }) {
  const typeStyle = setupColors[setup.type] || 'bg-white/5 text-white/40';
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${typeStyle}`}>{setup.type}</span>
          <Badge text={setup.direction} variant={setup.direction === 'LONG' ? 'bullish' : 'bearish'} />
          <Badge text={setup.timeframe} variant="default" />
        </div>
        <div className="flex items-center gap-2">
          <Badge text={setup.confidence} variant={setup.confidence === 'HIGH' ? 'success' : setup.confidence === 'MEDIUM' ? 'warning' : 'default'} />
          {setup.mesoAlignment && <Badge text="MESO ✓" variant="success" />}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-center text-[11px] mb-3">
        <div><div className="text-white/25">Entry</div><div className="font-mono font-bold text-amber-400">{priceFmt(setup.entry)}</div></div>
        <div><div className="text-white/25">Stop</div><div className="font-mono font-bold text-red-400">{priceFmt(setup.stopLoss)}</div></div>
        <div><div className="text-white/25">TP1</div><div className="font-mono font-bold text-emerald-400">{priceFmt(setup.takeProfit1)}</div></div>
        <div><div className="text-white/25">TP2</div><div className="font-mono font-bold text-emerald-400">{priceFmt(setup.takeProfit2)}</div></div>
        <div><div className="text-white/25">TP3</div><div className="font-mono font-bold text-emerald-400">{priceFmt(setup.takeProfit3)}</div></div>
      </div>

      <div className="flex items-center gap-4 text-[11px] mb-3">
        <span>R:R <span className="font-mono font-bold text-amber-400">{fmt(setup.riskReward, 1)}</span></span>
        <span>Score <span className="font-mono font-bold text-blue-400">{setup.technicalScore}</span></span>
      </div>

      <div className="text-[11px] text-white/40 mb-2">{setup.thesis}</div>

      {setup.confluences.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {setup.confluences.map((c, i) => (
            <span key={i} className="text-[9px] bg-white/5 px-1.5 py-0.5 rounded text-white/40">{c}</span>
          ))}
        </div>
      )}

      <div className="text-[10px] text-red-400/60">Invalidation: {setup.invalidation}</div>
    </div>
  );
}

function AnalysisCard({ analysis }: { analysis: MicroAnalysis }) {
  const [expanded, setExpanded] = useState(false);
  const rec = analysis.recommendation;
  const sc = analysis.scenarioAnalysis;

  return (
    <div className={`rounded-xl border ${actionColor(rec.action)} p-4`}>
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black font-mono">{analysis.displaySymbol}</span>
              <span className="text-sm font-mono text-white/40">{priceFmt(analysis.price)}</span>
            </div>
            {analysis.name && <div className="text-[10px] text-white/25">{analysis.name} • {analysis.assetClass}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {sc && (
            <Badge text={sc.status} variant={sc.status === 'PRONTO' ? 'success' : sc.status === 'DESENVOLVENDO' ? 'warning' : 'danger'} />
          )}
          <div className={`text-sm font-black ${actionTextColor(rec.action)}`}>{rec.action}</div>
          <span className="text-white/20 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      <div className="text-[11px] text-white/40 mt-1">{rec.reason}</div>

      {expanded && (
        <div className="mt-4 space-y-4">
          {sc && (
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 bg-white/[0.03] rounded">
                <div className="text-[9px] text-white/25">Entry Quality</div>
                <div className={`text-sm font-bold ${sc.entryQuality === 'OTIMO' ? 'text-emerald-400' : sc.entryQuality === 'BOM' ? 'text-amber-400' : 'text-red-400'}`}>{sc.entryQuality}</div>
              </div>
              <div className="text-center p-2 bg-white/[0.03] rounded">
                <div className="text-[9px] text-white/25">Timing</div>
                <div className={`text-sm font-bold ${sc.timing === 'AGORA' ? 'text-emerald-400' : sc.timing === 'AGUARDAR' ? 'text-amber-400' : 'text-red-400'}`}>{sc.timing}</div>
              </div>
              <div className="text-center p-2 bg-white/[0.03] rounded">
                <div className="text-[9px] text-white/25">Reason</div>
                <div className="text-[10px] text-white/40">{sc.statusReason}</div>
              </div>
            </div>
          )}

          <MTFPanel trend={analysis.technical.trend} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Indicators & Volume"><IndicatorsPanel ind={analysis.technical.indicators} vol={analysis.technical.volume} /></Card>
            <Card title="SMC & Structure"><SMCPanel smc={analysis.technical.smc} levels={analysis.technical.levels} /></Card>
          </div>

          {analysis.setups.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-white/30 uppercase mb-2">Setups ({analysis.setups.length})</h4>
              <div className="space-y-3">
                {analysis.setups.map((s) => <SetupCard key={s.id} setup={s} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MicroFallback() {
  // When /api/micro fails, show a simplified view from /api/meso allowed instruments
  const { data: meso, isLoading } = useMeso();

  if (isLoading) return <Spinner />;
  const instruments = meso?.microInputs?.allowedInstruments || [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black tracking-tight">Micro Analysis</h2>
        <Badge text="FALLBACK MODE" variant="warning" />
      </div>

      <div className="text-sm text-amber-400/70 bg-amber-500/10 border border-amber-500/15 rounded-lg p-3">
        Full micro analysis is temporarily unavailable (endpoint slow/error). Showing MESO-derived instrument universe instead.
      </div>

      {instruments.length === 0 ? (
        <div className="text-sm text-white/30 text-center py-8">No allowed instruments from MESO layer</div>
      ) : (
        <div className="space-y-2">
          {instruments.map((inst) => (
            <div key={inst.symbol} className={`rounded-xl border p-4 ${inst.direction === 'LONG' ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`text-2xl font-black ${inst.score >= 70 ? 'text-emerald-400' : inst.score >= 50 ? 'text-amber-400' : 'text-white/40'}`}>{Math.round(inst.score)}</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black font-mono">{cleanSymbol(inst.symbol)}</span>
                      <Badge text={inst.direction} variant={inst.direction === 'LONG' ? 'bullish' : 'bearish'} />
                      <Badge text={inst.class} variant="info" />
                    </div>
                    <div className="text-[10px] text-white/30 mt-0.5">{inst.reason}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MicroView() {
  const { data, isLoading, isError, refetch } = useMicro();
  const { setView } = useTerminal();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-black tracking-tight">Micro Analysis</h2>
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-6 h-6 border-2 border-white/10 border-t-amber-400 rounded-full animate-spin" />
          <p className="text-[11px] text-white/30">Loading deep micro analysis... This may take up to 60 seconds.</p>
        </div>
      </div>
    );
  }

  if (isError || !data?.success) return <MicroFallback />;

  const executeReady = data.analyses.filter(a => a.recommendation.action === 'EXECUTE');
  const waiting = data.analyses.filter(a => a.recommendation.action === 'WAIT');
  const avoid = data.analyses.filter(a => a.recommendation.action === 'AVOID');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black tracking-tight">Micro Analysis</h2>
        <div className="flex gap-3 text-[11px]">
          <span className="text-emerald-400 font-bold">{executeReady.length} EXECUTE</span>
          <span className="text-amber-400 font-bold">{waiting.length} WAIT</span>
          <span className="text-red-400 font-bold">{avoid.length} AVOID</span>
          <span className="text-white/30">{data.summary.total} total</span>
        </div>
      </div>

      <div className="text-sm text-white/40 bg-white/[0.02] border border-white/5 rounded-lg p-3">
        {data.summary.message}
      </div>

      {executeReady.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-emerald-400/60 uppercase mb-3">Execute Ready</h3>
          <div className="space-y-3">
            {executeReady.map((a) => <AnalysisCard key={a.symbol} analysis={a} />)}
          </div>
        </div>
      )}

      {waiting.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-amber-400/60 uppercase mb-3">Waiting</h3>
          <div className="space-y-3">
            {waiting.map((a) => <AnalysisCard key={a.symbol} analysis={a} />)}
          </div>
        </div>
      )}

      {avoid.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-red-400/60 uppercase mb-3">Avoid</h3>
          <div className="space-y-3">
            {avoid.map((a) => <AnalysisCard key={a.symbol} analysis={a} />)}
          </div>
        </div>
      )}

      {/* Flow Navigation: Micro → Execution */}
      <div className="rounded-xl border border-white/6 bg-white/[0.02] p-4">
        <div className="text-[10px] text-white/20 uppercase font-bold tracking-wider mb-3">Execute & Manage</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button onClick={() => setView('signals')} className="text-left rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 hover:bg-emerald-500/10 transition-all group">
            <div className="text-xs font-bold text-emerald-400 group-hover:text-emerald-300">Signals →</div>
            <div className="text-[10px] text-white/30 mt-0.5">Actionable trade signals</div>
          </button>
          <button onClick={() => setView('scanner')} className="text-left rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 hover:bg-emerald-500/10 transition-all group">
            <div className="text-xs font-bold text-emerald-400 group-hover:text-emerald-300">Scanner →</div>
            <div className="text-[10px] text-white/30 mt-0.5">Tier screening all assets</div>
          </button>
          <button onClick={() => setView('risk')} className="text-left rounded-lg border border-red-500/20 bg-red-500/5 p-3 hover:bg-red-500/10 transition-all group">
            <div className="text-xs font-bold text-red-400 group-hover:text-red-300">Risk →</div>
            <div className="text-[10px] text-white/30 mt-0.5">Kelly, drawdown & budget</div>
          </button>
          <button onClick={() => setView('lab')} className="text-left rounded-lg border border-white/10 bg-white/[0.03] p-3 hover:bg-white/[0.06] transition-all group">
            <div className="text-xs font-bold text-white/60 group-hover:text-white/80">Lab →</div>
            <div className="text-[10px] text-white/30 mt-0.5">Deep analysis per symbol</div>
          </button>
        </div>
      </div>
    </div>
  );
}
