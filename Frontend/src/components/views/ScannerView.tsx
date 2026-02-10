import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Metric, Spinner, ErrorBox, ProgressBar, TabBar, fmt, pctFmt, priceFmt, cleanSymbol, pctColor } from '../ui/primitives';
import { useTerminal } from '../../store/useTerminal';
import { useRegime } from '../../hooks/useApi';

// --- TYPES ---
interface ScanResult {
  symbol: string; rawSymbol: string; name: string; assetClass: string;
  price: number; changePercent: number; history?: number[];
  score: number; tier: 'TIER_1' | 'TIER_2' | 'TIER_3';
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  mesoAligned: boolean; prohibited: boolean; reason?: string;
  rsi: number; atr: number; atrPercent: number; volumeRatio: number;
  opportunityStatus: 'READY' | 'WARMING' | 'COOLING' | 'PROHIBITED' | 'CAUTION';
  autoSafe: boolean;
  // Trust Score (Final) composite
  trustScore: number;
  riskLabel: 'LOW' | 'MED' | 'HIGH';
  // Trade levels
  entry: string; sl: string; tp: string; rr: string; rrNum: number;
  timeframe: string; confluenceCount: number;
  // Micro pipeline
  microAction?: 'EXECUTE' | 'WAIT' | 'AVOID';
  scenarioStatus?: 'PRONTO' | 'DESENVOLVENDO' | 'CONTRA';
  levelSource: 'MICRO' | 'SCAN';
  mesoDirection?: 'LONG' | 'SHORT';
  mesoClass?: string; mesoReason?: string;
  // Thesis
  oneLiner: string;
  breakdown: { components: Record<string, number>; details: Record<string, string> };
}

interface MarketAsset {
  symbol: string; displaySymbol?: string; name: string; price: number;
  changePercent: number; assetClass: string; sector?: string;
  atr?: number; rsi?: number; volume?: number; avgVolume?: number;
  high?: number; low?: number; open?: number; history?: number[];
  marketState?: string; quoteTimestamp?: string;
  quality?: { status: string; reasons: string[] };
}

interface MesoAllowed { symbol: string; direction: 'LONG' | 'SHORT'; class: string; reason: string; score: number; }

interface MesoData {
  success: boolean;
  microInputs?: { allowedInstruments: MesoAllowed[]; prohibitedInstruments: { symbol: string; reason: string }[] };
  classes?: { class: string; expectation: string; topPicks: string[] }[];
  executiveSummary?: { marketBias: string };
  microInputs2?: { favoredDirection: string; volatilityContext: string };
}

interface MicroSetup {
  type: string; direction: 'LONG' | 'SHORT'; timeframe: string;
  entry: number; stopLoss: number; takeProfit1: number; takeProfit2?: number; takeProfit3?: number;
  riskReward: number; confidence: string; confluences: string[];
  thesis: string; technicalScore: number; invalidation?: string; mesoAlignment?: boolean;
}

interface MicroAnalysis {
  symbol: string; displaySymbol: string; price: number;
  recommendation: { action: string; reason: string; bestSetup: MicroSetup | null; metrics?: { pWin: number; rrMin: number; evR: number; modelRisk: string } };
  setups: MicroSetup[];
  scenarioAnalysis?: { status: string; statusReason: string; entryQuality: string };
  technical?: { trend?: { h4: string; h1: string; m15: string; alignment: string }; indicators?: { rsi: number; macdSignal: string; bbPosition: string }; volume?: { relative: number; trend: string }; smc?: { premiumDiscount: string; orderBlocks: unknown[]; fvgs: unknown[]; liquidityPools: unknown[] }; levels?: { resistance: number[]; support: number[]; pivot: number; atr: number } };
}

interface MicroData { success: boolean; analyses: MicroAnalysis[] }

type SortKey = 'trust' | 'score' | 'change' | 'rsi' | 'atr' | 'name' | 'volume' | 'rr';
type SortDir = 'asc' | 'desc';
type RadarMode = 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE';

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

// --- EXECUTION WINDOW ---
function getExecWindow(): { label: string; status: 'PASS' | 'WARN' } {
  const h = new Date().getUTCHours();
  const good = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  const bad = [21, 22, 23, 0, 1, 2, 3];
  if (bad.includes(h)) return { label: 'OFF-HOURS', status: 'WARN' };
  if (good.includes(h)) return { label: 'PRIME', status: 'PASS' };
  return { label: 'TRANSITION', status: 'WARN' };
}

// --- CONFLUENCE + TRADE LEVELS ---
const fp = (p: number) => p < 10 ? p.toFixed(4) : p.toFixed(2);

function computeConfluence(a: MarketAsset) {
  const rsi = a.rsi ?? 50;
  const changeMag = Math.abs(a.changePercent);
  const volRatio = (a.volume && a.avgVolume && a.avgVolume > 0) ? a.volume / a.avgVolume : 1;
  const atr = a.atr ?? (a.price * 0.015);
  const atrPct = a.price > 0 ? atr / a.price : 0.015;

  const trendScore = changeMag > 3 ? 80 : changeMag > 1.5 ? 65 : changeMag > 0.5 ? 50 : 35;
  const momentumScore = rsi > 60 ? 70 : rsi < 40 ? 70 : 40;
  const volScore = volRatio > 2 ? 85 : volRatio > 1.5 ? 70 : volRatio > 1 ? 50 : 30;
  const rsiEdge = (rsi > 70 || rsi < 30) ? 75 : 40;

  const raw = trendScore * 0.3 + momentumScore * 0.25 + volScore * 0.25 + rsiEdge * 0.2;
  const score = Math.round(Math.max(0, Math.min(100, raw)));
  const direction: 'LONG' | 'SHORT' = a.changePercent >= 0 ? 'LONG' : 'SHORT';
  const volatility = atrPct * 100;
  const rvol = volRatio;

  const parts: string[] = [];
  if (trendScore >= 65) parts.push(`Strong ${direction.toLowerCase()} momentum (${changeMag.toFixed(1)}%)`);
  if (volScore >= 70) parts.push(`Above-avg volume (${volRatio.toFixed(1)}x)`);
  if (rsi > 70) parts.push('RSI overbought — caution');
  else if (rsi < 30) parts.push('RSI oversold — potential bounce');
  const oneLiner = parts.length > 0 ? parts.join('; ') : `Neutral confluence (score ${score})`;

  const confluenceCount = [trendScore, momentumScore, volScore, rsiEdge].filter(v => v > 60).length;

  return { score, direction, volatility, rvol, oneLiner, confluenceCount, rsi,
    components: { trend: trendScore, momentum: momentumScore, volume: volScore, rsiEdge },
  };
}

function computeTradeLevels(price: number, score: number, direction: 'LONG' | 'SHORT', high?: number, low?: number) {
  const dailyRange = (high && low) ? (high - low) : (price * 0.015);
  const drPct = price > 0 ? dailyRange / price : 0.015;
  const atrPct = Math.max(0.003, Math.min(0.02, Number.isFinite(drPct) ? drPct : 0.015));
  const atr = price * atrPct;
  const slMul = score > 70 ? 0.55 : score > 55 ? 0.65 : 0.8;
  const tpMul = score > 70 ? 1.15 : score > 55 ? 1.0 : 0.85;
  const sl = direction === 'LONG' ? price - (atr * slMul) : price + (atr * slMul);
  const tp = direction === 'LONG' ? price + (atr * tpMul) : price - (atr * tpMul);
  const risk = Math.abs(price - sl); const reward = Math.abs(tp - price);
  const rrNum = risk > 0 ? reward / risk : 0;
  const tf = atrPct > 0.015 ? 'H4' : atrPct > 0.008 ? 'H1' : 'M15';
  return { entry: fp(price), sl: fp(sl), tp: fp(tp), rr: rrNum.toFixed(1), rrNum, timeframe: tf };
}

// --- RISK LABEL ---
function computeRisk(opts: {
  mesoBlocked: boolean; microAction?: string; scenarioStatus?: string;
  rrNum: number; volatility: number; liquidity: number; execWindow: 'PASS' | 'WARN';
  levelSource: string; qualityOk: boolean;
}): 'LOW' | 'MED' | 'HIGH' {
  let pts = 0;
  if (opts.mesoBlocked) pts += 8;
  if (opts.microAction === 'AVOID') pts += 5;
  else if (opts.microAction === 'WAIT') pts += 2;
  if (opts.scenarioStatus === 'CONTRA') pts += 5;
  else if (opts.scenarioStatus === 'DESENVOLVENDO') pts += 2;
  if (!Number.isFinite(opts.rrNum) || opts.rrNum < 1.2) pts += 4;
  else if (opts.rrNum < 1.5) pts += 2;
  if (opts.volatility >= 5) pts += 3; else if (opts.volatility >= 3) pts += 2; else if (opts.volatility >= 1.8) pts += 1;
  if (opts.liquidity < 30) pts += 3; else if (opts.liquidity < 50) pts += 2;
  if (opts.execWindow === 'WARN') pts += 1;
  if (opts.levelSource !== 'MICRO') pts += 1;
  if (!opts.qualityOk) pts += 3;
  return pts <= 3 ? 'LOW' : pts <= 7 ? 'MED' : 'HIGH';
}

// --- TRUST SCORE ---
function computeTrustScore(opts: {
  scanScore: number; microScore: number; mesoScore: number; macroScore: number;
  liquidityScore: number; riskLabel: 'LOW' | 'MED' | 'HIGH'; qualityOk: boolean;
}): number {
  const riskPen = opts.riskLabel === 'LOW' ? 0 : opts.riskLabel === 'MED' ? 6 : 14;
  const qualPen = opts.qualityOk ? 0 : 5;
  const raw = opts.scanScore * 0.30 + opts.microScore * 0.35 + opts.mesoScore * 0.15 + opts.macroScore * 0.10 + opts.liquidityScore * 0.10 - riskPen - qualPen;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// --- DATA HOOK ---
function useScannerData() {
  const market = useQuery<{ success: boolean; data?: MarketAsset[]; assets?: MarketAsset[]; count: number }>({
    queryKey: ['market-scanner'], queryFn: () => fetch('/api/market?macro=0').then(r => r.json()), staleTime: 15_000, refetchInterval: 30_000,
  });
  const meso = useQuery<MesoData>({
    queryKey: ['meso'], queryFn: () => fetch('/api/meso').then(r => r.json()), staleTime: 30_000, refetchInterval: 60_000,
  });
  const micro = useQuery<MicroData>({
    queryKey: ['micro'],
    queryFn: async () => { const c = new AbortController(); const t = setTimeout(() => c.abort(), 120_000); try { const r = await fetch('/api/micro', { signal: c.signal }); return r.json(); } finally { clearTimeout(t); } },
    staleTime: 60_000, refetchInterval: 120_000, retry: 1,
  });
  const regime = useRegime();

  const execWindow = getExecWindow();

  const results = useMemo(() => {
    const rawAssets = market.data?.data || market.data?.assets || [];
    if (rawAssets.length === 0) return [];
    const allowed = new Map((meso.data?.microInputs?.allowedInstruments || []).map(a => [a.symbol, a]));
    const prohibited = new Set((meso.data?.microInputs?.prohibitedInstruments || []).map(p => p.symbol));
    const classExpectation = new Map<string, { expectation: string; topPicks: string[] }>();
    (meso.data?.classes || []).forEach(c => classExpectation.set(c.class.toLowerCase(), { expectation: c.expectation, topPicks: c.topPicks || [] }));

    // Build micro lookup
    const microBySymbol = new Map<string, MicroAnalysis>();
    (micro.data?.analyses || []).forEach(a => { microBySymbol.set(a.symbol, a); });

    return rawAssets.filter(a => a.price > 0).map((a): ScanResult => {
      const mesoInfo = allowed.get(a.symbol);
      const isProhibited = prohibited.has(a.symbol);
      const changeMag = Math.abs(a.changePercent);

      // Base score
      let baseScore: number;
      let reason: string | undefined;
      if (mesoInfo) { baseScore = mesoInfo.score; reason = mesoInfo.reason; }
      else {
        const cls = classExpectation.get(a.assetClass?.toLowerCase() || '');
        const isTopPick = cls?.topPicks.some(p => a.symbol.includes(p) || (a.displaySymbol && p.includes(a.displaySymbol || '')));
        const cBonus = cls?.expectation === 'BULLISH' ? 15 : cls?.expectation === 'BEARISH' ? 10 : 0;
        const tpBonus = isTopPick ? 20 : 0;
        const momScore = changeMag > 3 ? 55 : changeMag > 1.5 ? 45 : changeMag > 0.5 ? 35 : 25;
        baseScore = momScore + cBonus + tpBonus;
        reason = cls ? `${cls.expectation} class (${a.assetClass})` : undefined;
      }

      const scanScore = isProhibited ? Math.min(baseScore, 25) : Math.min(baseScore, 100);
      const tier = scanScore >= 70 ? 'TIER_1' as const : scanScore >= 50 ? 'TIER_2' as const : 'TIER_3' as const;
      const baseDir = mesoInfo ? mesoInfo.direction : (a.changePercent > 1 ? 'LONG' as const : a.changePercent < -1 ? 'SHORT' as const : 'NEUTRAL' as const);
      const rsi = a.rsi ?? 50;
      const atr = a.atr ?? 0;
      const atrPct = a.price > 0 ? (atr / a.price) * 100 : 0;
      const volRatio = (a.volume && a.avgVolume && a.avgVolume > 0) ? a.volume / a.avgVolume : 1;

      // Micro integration
      const ma = microBySymbol.get(a.symbol);
      const bestSetup = ma?.recommendation?.bestSetup || (ma?.setups?.[0] ?? null);
      const microAction = (ma?.recommendation?.action as 'EXECUTE' | 'WAIT' | 'AVOID') || undefined;
      const scenarioStatus = (ma?.scenarioAnalysis?.status as 'PRONTO' | 'DESENVOLVENDO' | 'CONTRA') || undefined;
      const microMetrics = ma?.recommendation?.metrics;

      // Direction: prefer micro setup
      const direction = bestSetup ? bestSetup.direction : baseDir;
      const levelSource: 'MICRO' | 'SCAN' = bestSetup ? 'MICRO' : 'SCAN';

      // Trade levels: prefer MICRO if available
      let entry: string, sl: string, tp: string, rr: string, rrNum: number, timeframe: string;
      if (bestSetup) {
        entry = fp(bestSetup.entry); sl = fp(bestSetup.stopLoss); tp = fp(bestSetup.takeProfit1);
        rrNum = bestSetup.riskReward ?? 0; rr = rrNum.toFixed(1);
        timeframe = bestSetup.timeframe || 'H1';
      } else {
        const levels = computeTradeLevels(a.price, scanScore, direction === 'NEUTRAL' ? 'LONG' : direction, a.high, a.low);
        entry = levels.entry; sl = levels.sl; tp = levels.tp; rr = levels.rr; rrNum = levels.rrNum; timeframe = levels.timeframe;
      }

      // Confluence
      const conf = computeConfluence(a);
      const confluenceCount = bestSetup?.confluences?.length ?? conf.confluenceCount;
      const oneLiner = bestSetup?.thesis || conf.oneLiner;

      // Meso scores
      const mesoDirection = mesoInfo?.direction;
      const mesoClass = mesoInfo?.class;
      const mesoReason = mesoInfo?.reason;

      let mesoScore = 30;
      if (isProhibited) mesoScore = 0;
      else if (mesoInfo) mesoScore = (direction === mesoInfo.direction) ? 80 : 35;

      // Micro score
      let microScore = 50;
      if (bestSetup?.technicalScore) microScore = bestSetup.technicalScore;
      const actionScore = microAction === 'EXECUTE' ? 85 : microAction === 'WAIT' ? 60 : microAction === 'AVOID' ? 20 : 50;
      const scenScore = scenarioStatus === 'PRONTO' ? 80 : scenarioStatus === 'DESENVOLVENDO' ? 60 : scenarioStatus === 'CONTRA' ? 30 : 50;
      microScore = Math.round(microScore * 0.6 + actionScore * 0.2 + scenScore * 0.2);
      if (microMetrics && Number.isFinite(microMetrics.evR)) {
        microScore += Math.max(-10, Math.min(10, microMetrics.evR * 20));
        if (microMetrics.modelRisk === 'LOW') microScore += 3;
        else if (microMetrics.modelRisk === 'HIGH') microScore -= 4;
      }
      if (Number.isFinite(rrNum)) {
        const rrTarget = microMetrics?.rrMin ?? 1.5;
        microScore += Math.max(-8, Math.min(8, (rrNum - rrTarget) * 10));
      }
      microScore = Math.max(0, Math.min(100, Math.round(microScore)));

      // Dynamic macroScore from regime data
      let macroScore = 50;
      const snap = regime.data?.snapshot;
      if (snap) {
        const axes = Object.values(snap.axes || {});
        const avgAxes = axes.length > 0 ? axes.reduce((s, ax) => s + (ax.score ?? 50), 0) / axes.length : 50;
        const confBonus = snap.regimeConfidence === 'HIGH' ? 10 : snap.regimeConfidence === 'LOW' ? -10 : 0;
        const regimeBonus = snap.regime === 'RISK_ON' ? 8 : snap.regime === 'RISK_OFF' ? -8 : 0;
        macroScore = Math.max(0, Math.min(100, Math.round(avgAxes + confBonus + regimeBonus)));
      }
      const liquidityScore = conf.components.volume;

      const qualityOk = !a.quality || a.quality.status === 'OK';
      const riskLabel = computeRisk({
        mesoBlocked: isProhibited, microAction, scenarioStatus,
        rrNum, volatility: conf.volatility, liquidity: liquidityScore,
        execWindow: execWindow.status, levelSource, qualityOk,
      });

      const trustScore = computeTrustScore({ scanScore, microScore, mesoScore, macroScore, liquidityScore, riskLabel, qualityOk });

      const partial = { score: scanScore, mesoAligned: !!mesoInfo, prohibited: isProhibited, rsi, direction, changePercent: a.changePercent };

      const breakdown = {
        components: { scan: scanScore, micro: microScore, meso: mesoScore, macro: macroScore, liquidity: liquidityScore, riskPenalty: -(riskLabel === 'LOW' ? 0 : riskLabel === 'MED' ? 6 : 14) },
        details: { scan: 'Price/volume confluence', micro: `Action=${microAction || 'N/A'} Scenario=${scenarioStatus || 'N/A'}`, meso: mesoInfo ? `${mesoInfo.direction} aligned` : 'No MESO data', macro: 'Regime gate', liquidity: `Volume ${volRatio.toFixed(1)}x`, riskPenalty: `Risk=${riskLabel}` },
      };

      return {
        symbol: a.displaySymbol || a.symbol, rawSymbol: a.symbol,
        name: a.name, assetClass: a.assetClass || a.sector || '',
        price: a.price, changePercent: a.changePercent, history: a.history,
        score: scanScore, tier, direction,
        mesoAligned: !!mesoInfo, prohibited: isProhibited,
        reason: isProhibited ? 'PROHIBITED by MESO' : reason,
        rsi, atr, atrPercent: atrPct, volumeRatio: volRatio,
        opportunityStatus: deriveOpportunityStatus(partial),
        autoSafe: deriveAutoSafe(partial),
        trustScore, riskLabel,
        entry, sl, tp, rr, rrNum, timeframe, confluenceCount,
        microAction, scenarioStatus, levelSource,
        mesoDirection, mesoClass, mesoReason,
        oneLiner, breakdown,
      };
    }).sort((a, b) => b.trustScore - a.trustScore);
  }, [market.data, meso.data, micro.data, regime.data, execWindow.status]);

  const summary = useMemo(() => {
    const tier1 = results.filter(r => r.tier === 'TIER_1').length;
    const tier2 = results.filter(r => r.tier === 'TIER_2').length;
    const tier3 = results.filter(r => r.tier === 'TIER_3').length;
    const ready = results.filter(r => r.opportunityStatus === 'READY').length;
    const warming = results.filter(r => r.opportunityStatus === 'WARMING').length;
    const safe = results.filter(r => r.autoSafe).length;
    const bullish = results.filter(r => r.direction === 'LONG').length;
    const bearish = results.filter(r => r.direction === 'SHORT').length;
    const top = results[0];
    const classes = [...new Set(results.map(r => r.assetClass).filter(Boolean))];
    const microReady = results.filter(r => r.microAction === 'EXECUTE').length;
    const lowRisk = results.filter(r => r.riskLabel === 'LOW').length;
    return { total: results.length, tier1, tier2, tier3, ready, warming, safe, bullish, bearish, neutral: results.length - bullish - bearish, topOpportunity: top?.symbol || '--', classes, microReady, lowRisk };
  }, [results]);

  return { results, summary, isLoading: market.isLoading || meso.isLoading, isError: market.isError, refetch: market.refetch, microLoading: micro.isLoading, execWindow };
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
const trustColor = (s: number) => s >= 80 ? 'text-emerald-400' : s >= 65 ? 'text-amber-400' : 'text-white/40';
const rsiColor = (v: number) => v > 70 ? 'text-red-400' : v < 30 ? 'text-emerald-400' : 'text-white/50';
const riskBadge = (r: string) => r === 'LOW' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : r === 'MED' ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' : 'bg-red-500/15 text-red-400 border-red-500/25';
const microBadge = (a?: string) => a === 'EXECUTE' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : a === 'WAIT' ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' : a === 'AVOID' ? 'bg-red-500/15 text-red-400 border-red-500/25' : 'bg-white/5 text-white/30 border-white/10';
const scenarioBadge = (s?: string) => s === 'PRONTO' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : s === 'DESENVOLVENDO' ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' : s === 'CONTRA' ? 'bg-red-500/15 text-red-400 border-red-500/25' : '';

// --- SPARKLINE ---
function Sparkline({ data, color = 'text-emerald-500', h = 16, w = 60 }: { data: number[]; color?: string; h?: number; w?: number }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data); const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return <svg viewBox={`0 0 ${w} ${h}`} className={`${color} shrink-0`} width={w} height={h}><polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={pts} /></svg>;
}

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

// --- TOP GUARANTEED PANEL ---
function TopPanel({ title, color, results, onSelect }: { title: string; color: string; results: ScanResult[]; onSelect: (s: string) => void }) {
  if (results.length === 0) return (
    <div className={`rounded-lg border p-2 ${color}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider">{title}</div>
      <div className="text-[10px] text-white/30 mt-1 font-mono">Sem candidatos no momento.</div>
    </div>
  );
  return (
    <div className={`rounded-lg border p-2 ${color}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider">{title}</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {results.map(r => (
          <button key={r.rawSymbol} onClick={() => onSelect(r.rawSymbol)}
            className="text-left rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-1.5 hover:bg-white/[0.05] transition-colors">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-black font-mono">{cleanSymbol(r.symbol)}</span>
              <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${r.direction === 'LONG' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-red-500/10 text-red-300 border-red-500/20'}`}>{r.direction}</span>
              {r.microAction && <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${microBadge(r.microAction)}`}>{r.microAction}</span>}
              {r.scenarioStatus && <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${scenarioBadge(r.scenarioStatus)}`}>{r.scenarioStatus}</span>}
              <span className="text-[9px] font-mono text-white/30">RR {r.rr}</span>
              <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${riskBadge(r.riskLabel)}`}>{r.riskLabel}</span>
            </div>
            <div className="text-[9px] font-mono text-white/25 mt-0.5">Final {r.trustScore} | S {r.score}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- ASSET DETAIL PANEL ---
function DetailPanel({ result, onClose }: { result: ScanResult; onClose: () => void }) {
  const st = statusConfig[result.opportunityStatus];
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${st.bg} ${st.pulse ? 'animate-pulse' : ''}`} />
          <span className="text-lg font-black font-mono">{cleanSymbol(result.symbol)}</span>
          <Badge text={result.direction} variant={result.direction === 'LONG' ? 'bullish' : result.direction === 'SHORT' ? 'bearish' : 'neutral'} />
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 text-xs font-bold px-2 py-1 rounded hover:bg-white/5">✕</button>
      </div>

      <div className="text-[10px] text-white/40 italic">{result.oneLiner}</div>

      {/* Score breakdown */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-white/6 p-2">
          <div className="text-[9px] text-white/25 uppercase font-bold">Trust Score</div>
          <div className={`text-2xl font-black font-mono ${trustColor(result.trustScore)}`}>{result.trustScore}</div>
        </div>
        <div className="rounded-lg border border-white/6 p-2">
          <div className="text-[9px] text-white/25 uppercase font-bold">Scan Score</div>
          <div className={`text-2xl font-black font-mono ${scoreColor(result.score)}`}>{result.score}</div>
        </div>
      </div>

      {/* Breakdown bars */}
      <div className="space-y-1">
        {Object.entries(result.breakdown.components).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-white/30 uppercase w-16 text-right">{k}</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className={`h-full rounded-full ${v >= 0 ? 'bg-emerald-500/50' : 'bg-red-500/50'}`} style={{ width: `${Math.min(100, Math.abs(v))}%` }} />
            </div>
            <span className="text-[9px] font-mono text-white/40 w-8">{Math.round(v)}</span>
          </div>
        ))}
      </div>

      <div className="text-[9px] text-white/20 space-y-0.5">
        {Object.entries(result.breakdown.details).map(([k, v]) => (
          <div key={k}><span className="text-white/30 font-bold uppercase">{k}:</span> {v}</div>
        ))}
      </div>

      {/* Trade Plan */}
      <div className="rounded-lg border border-white/6 p-2">
        <div className="text-[9px] font-bold text-white/30 uppercase mb-1">Execution Plan ({result.levelSource})</div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div><div className="text-[8px] text-white/20">Entry</div><div className="text-[11px] font-mono font-bold text-blue-300">{result.entry}</div></div>
          <div><div className="text-[8px] text-white/20">Stop</div><div className="text-[11px] font-mono font-bold text-red-400">{result.sl}</div></div>
          <div><div className="text-[8px] text-white/20">Target</div><div className="text-[11px] font-mono font-bold text-emerald-400">{result.tp}</div></div>
          <div><div className="text-[8px] text-white/20">R:R</div><div className={`text-[11px] font-mono font-bold ${result.rrNum >= 2 ? 'text-emerald-400' : result.rrNum >= 1.5 ? 'text-amber-400' : 'text-red-400'}`}>{result.rr}</div></div>
        </div>
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap gap-1.5">
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${riskBadge(result.riskLabel)}`}>RISK {result.riskLabel}</span>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${tierColors[result.tier]}`}>{result.tier.replace('_', ' ')}</span>
        {result.microAction && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${microBadge(result.microAction)}`}>{result.microAction}</span>}
        {result.scenarioStatus && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${scenarioBadge(result.scenarioStatus)}`}>{result.scenarioStatus}</span>}
        {result.levelSource === 'MICRO' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/25">MICRO LEVELS</span>}
        {result.mesoAligned && <Badge text="MESO ✓" variant="success" />}
        {result.autoSafe && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">AUTO SAFE</span>}
        <span className="text-[9px] font-mono text-white/25">TF {result.timeframe}</span>
        <span className="text-[9px] font-mono text-white/25">Conf {result.confluenceCount}</span>
      </div>

      {/* Technicals */}
      <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
        <div className="rounded-lg border border-white/6 p-1.5">
          <div className="text-[8px] text-white/20">RSI</div>
          <div className={`font-mono font-bold ${rsiColor(result.rsi)}`}>{Math.round(result.rsi)}</div>
        </div>
        <div className="rounded-lg border border-white/6 p-1.5">
          <div className="text-[8px] text-white/20">ATR%</div>
          <div className="font-mono text-white/40">{result.atrPercent.toFixed(1)}%</div>
        </div>
        <div className="rounded-lg border border-white/6 p-1.5">
          <div className="text-[8px] text-white/20">RVOL</div>
          <div className={`font-mono ${result.volumeRatio > 1.5 ? 'text-amber-400' : 'text-white/30'}`}>{result.volumeRatio.toFixed(1)}x</div>
        </div>
        <div className="rounded-lg border border-white/6 p-1.5">
          <div className="text-[8px] text-white/20">Price</div>
          <div className="font-mono text-white/60">{priceFmt(result.price)}</div>
        </div>
      </div>
    </div>
  );
}

// --- SCAN RESULT ROW (ENHANCED) ---
function ScanResultRow({ result, selected, active, onSelect, onIncubate, onDetail }: {
  result: ScanResult; selected: boolean; active: boolean;
  onSelect: (sym: string) => void; onIncubate: (sym: string) => void; onDetail: (sym: string) => void;
}) {
  const st = statusConfig[result.opportunityStatus];

  return (
    <div onClick={() => onDetail(result.rawSymbol)}
      className={`rounded-xl border bg-white/[0.02] p-3 transition-all cursor-pointer ${
      result.prohibited ? 'border-red-500/15 opacity-50' :
      result.opportunityStatus === 'READY' ? 'border-emerald-500/25 bg-emerald-500/[0.03]' :
      result.tier === 'TIER_1' ? 'border-emerald-500/15' :
      result.tier === 'TIER_2' ? 'border-amber-500/10' : 'border-white/6'
    } ${active ? 'ring-1 ring-violet-400/40' : ''} ${selected ? 'ring-1 ring-amber-400/40' : ''} hover:bg-white/[0.04]`}>

      <div className="flex items-center gap-2.5">
        {/* Checkbox */}
        <button onClick={(e) => { e.stopPropagation(); onSelect(result.rawSymbol); }} className={`w-4 h-4 rounded border shrink-0 transition-colors ${
          selected ? 'bg-amber-400 border-amber-400' : 'border-white/20 hover:border-white/40'
        }`}>
          {selected && <svg className="w-4 h-4 text-black" viewBox="0 0 16 16" fill="currentColor"><path d="M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z"/></svg>}
        </button>

        {/* Trust Score (big) */}
        <div className="flex flex-col items-center w-11 shrink-0">
          <div className={`text-lg font-black font-mono leading-none ${trustColor(result.trustScore)}`}>{result.trustScore}</div>
          <div className="text-[7px] text-white/20 font-bold">FINAL</div>
        </div>

        {/* Live status dot */}
        <div className="flex flex-col items-center w-5 shrink-0">
          <span className={`w-2 h-2 rounded-full ${st.bg} ${st.pulse ? 'animate-pulse' : ''}`} />
          <span className={`text-[7px] font-bold mt-0.5 ${st.color}`}>{st.label.slice(0, 3)}</span>
        </div>

        {/* Symbol & badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-sm font-black font-mono">{cleanSymbol(result.symbol)}</span>
            <Badge text={result.direction} variant={result.direction === 'LONG' ? 'bullish' : result.direction === 'SHORT' ? 'bearish' : 'neutral'} />
            <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${riskBadge(result.riskLabel)}`}>RISK {result.riskLabel}</span>
            {result.microAction && <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${microBadge(result.microAction)}`}>{result.microAction === 'AVOID' ? 'NO-TRADE' : result.microAction}</span>}
            {result.scenarioStatus && <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${scenarioBadge(result.scenarioStatus)}`}>{result.scenarioStatus}</span>}
            {result.levelSource === 'MICRO' && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/20">MICRO</span>}
            {result.mesoAligned && <span className="text-[8px] text-emerald-400/60">MESO</span>}
            {result.autoSafe && <span className="text-[8px] font-bold px-1 rounded bg-emerald-500/15 text-emerald-300">SAFE</span>}
          </div>
          <div className="text-[9px] text-white/20 truncate mt-0.5">{result.name} • {result.assetClass} • S{result.score} • TF {result.timeframe} • Conf {result.confluenceCount}</div>
        </div>

        {/* Technicals mini + sparkline */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          <Sparkline data={result.history || [result.price, result.price]} color={result.changePercent >= 0 ? 'text-emerald-500' : 'text-red-500'} />
          <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
            <div><div className="text-[7px] text-white/15">RSI</div><div className={`font-mono font-bold ${rsiColor(result.rsi)}`}>{Math.round(result.rsi)}</div></div>
            <div><div className="text-[7px] text-white/15">RV</div><div className={`font-mono ${result.volumeRatio > 1.5 ? 'text-amber-400' : 'text-white/30'}`}>{result.volumeRatio.toFixed(1)}x</div></div>
            <div><div className="text-[7px] text-white/15">R:R</div><div className={`font-mono font-bold ${result.rrNum >= 2 ? 'text-emerald-400' : result.rrNum >= 1.5 ? 'text-amber-400' : 'text-red-400'}`}>{result.rr}</div></div>
          </div>
        </div>

        {/* Price */}
        <div className="text-right shrink-0 w-20">
          <div className="text-sm font-mono tabular-nums">{priceFmt(result.price)}</div>
          <div className={`text-[10px] font-mono font-bold ${pctColor(result.changePercent)}`}>{pctFmt(result.changePercent)}</div>
        </div>

        {/* Incubate */}
        {!result.prohibited && (
          <button onClick={(e) => { e.stopPropagation(); onIncubate(result.rawSymbol); }}
            className="shrink-0 text-[9px] font-bold px-2 py-1.5 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/15 transition-colors" title="Send to Incubator">
            INC
          </button>
        )}
      </div>

      {/* One-liner thesis */}
      {result.oneLiner && <div className="text-[9px] text-white/25 mt-1.5 ml-[6.5rem] italic truncate">{result.oneLiner}</div>}
    </div>
  );
}

// --- FILTER BAR (ENHANCED) ---
function FilterBar({ filters, summary, onChange, searchText, onSearch }: {
  filters: FilterState; summary: ReturnType<typeof useScannerData>['summary'];
  onChange: (f: Partial<FilterState>) => void;
  searchText: string; onSearch: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <input value={searchText} onChange={e => onSearch(e.target.value)} placeholder="Search symbol, class, action..."
        className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-white/3 border border-white/6 text-white/60 outline-none w-44 focus:border-amber-500/40" />

      {/* Tier tabs */}
      <div className="flex items-center gap-0.5 bg-white/3 p-0.5 rounded-lg border border-white/6">
        {[
          { id: 'all', label: `ALL ${summary.total}` },
          { id: 'TIER_1', label: `T1 ${summary.tier1}` },
          { id: 'TIER_2', label: `T2 ${summary.tier2}` },
        ].map(t => (
          <button key={t.id} onClick={() => onChange({ tier: t.id })}
            className={`text-[10px] font-bold px-2 py-1 rounded-md transition-colors ${
              filters.tier === t.id ? 'bg-white/10 text-amber-400' : 'text-white/30 hover:text-white/60'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-0.5 bg-white/3 p-0.5 rounded-lg border border-white/6">
        {[{ id: 'all', label: 'ALL' }, { id: 'READY', label: `RDY ${summary.ready}` }, { id: 'WARMING', label: `WRM ${summary.warming}` }].map(t => (
          <button key={t.id} onClick={() => onChange({ status: t.id })}
            className={`text-[10px] font-bold px-2 py-1 rounded-md transition-colors ${
              filters.status === t.id ? 'bg-white/10 text-emerald-400' : 'text-white/30 hover:text-white/60'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* Micro action */}
      <select value={filters.microAction} onChange={e => onChange({ microAction: e.target.value })} title="Filter micro action"
        className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white/3 border border-white/6 text-white/50 outline-none cursor-pointer">
        <option value="all">Micro: All</option>
        <option value="EXECUTE">EXECUTE ({summary.microReady})</option>
        <option value="WAIT">WAIT</option>
        <option value="AVOID">AVOID</option>
      </select>

      {/* Risk */}
      <select value={filters.riskFilter} onChange={e => onChange({ riskFilter: e.target.value })} title="Filter risk level"
        className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white/3 border border-white/6 text-white/50 outline-none cursor-pointer">
        <option value="all">Risk: All</option>
        <option value="LOW">LOW ({summary.lowRisk})</option>
        <option value="MED">MED</option>
        <option value="HIGH">HIGH</option>
      </select>

      {/* Direction */}
      <div className="flex items-center gap-0.5 bg-white/3 p-0.5 rounded-lg border border-white/6">
        {['all', 'LONG', 'SHORT'].map(d => (
          <button key={d} onClick={() => onChange({ direction: d })}
            className={`text-[10px] font-bold px-2 py-1 rounded-md transition-colors ${
              filters.direction === d ? 'bg-white/10 text-amber-400' : 'text-white/30 hover:text-white/60'
            }`}>{d === 'all' ? 'ALL' : d}</button>
        ))}
      </div>

      {/* Class */}
      <select value={filters.assetClass} onChange={e => onChange({ assetClass: e.target.value })} title="Filter asset class"
        className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white/3 border border-white/6 text-white/50 outline-none cursor-pointer">
        <option value="all">All Classes</option>
        {summary.classes.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      {/* Toggles */}
      <button onClick={() => onChange({ autoSafeOnly: !filters.autoSafeOnly })}
        className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors ${
          filters.autoSafeOnly ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-white/3 text-white/30 border-white/6 hover:text-white/60'
        }`}>SAFE ({summary.safe})</button>

      <button onClick={() => onChange({ hideProhibited: !filters.hideProhibited })}
        className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors ${
          filters.hideProhibited ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-white/3 text-white/30 border-white/6 hover:text-white/60'
        }`}>{filters.hideProhibited ? 'HIDE' : 'SHOW'} PROHIB</button>

      <button onClick={() => onChange({ mesoOnly: !filters.mesoOnly })}
        className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors ${
          filters.mesoOnly ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-white/3 text-white/30 border-white/6 hover:text-white/60'
        }`}>MESO ONLY</button>
    </div>
  );
}

interface FilterState {
  tier: string; status: string; direction: string; assetClass: string;
  autoSafeOnly: boolean; hideProhibited: boolean; mesoOnly: boolean;
  microAction: string; riskFilter: string;
}

const defaultFilters: FilterState = {
  tier: 'all', status: 'all', direction: 'all', assetClass: 'all',
  autoSafeOnly: false, hideProhibited: true, mesoOnly: false,
  microAction: 'all', riskFilter: 'all',
};

// --- MAIN VIEW ---
export function ScannerView() {
  const { results, summary, isLoading, isError, refetch, microLoading, execWindow } = useScannerData();
  const { setView } = useTerminal();
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [sortKey, setSortKey] = useState<SortKey>('trust');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [incubated, setIncubated] = useState<Set<string>>(new Set());
  const [radarMode, setRadarMode] = useState<RadarMode>('BALANCED');
  const [searchText, setSearchText] = useState('');
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);

  const cycleRadar = useCallback(() => {
    setRadarMode(m => m === 'CONSERVATIVE' ? 'BALANCED' : m === 'BALANCED' ? 'AGGRESSIVE' : 'CONSERVATIVE');
  }, []);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }, [sortKey]);

  const handleSelect = useCallback((sym: string) => {
    setSelected(prev => { const n = new Set(prev); if (n.has(sym)) n.delete(sym); else n.add(sym); return n; });
  }, []);

  const handleIncubate = useCallback((sym: string) => {
    setIncubated(prev => new Set(prev).add(sym));
  }, []);

  const handleBulkIncubate = useCallback(() => {
    setIncubated(prev => { const n = new Set(prev); selected.forEach(s => n.add(s)); return n; });
    setSelected(new Set());
  }, [selected]);

  const handleAutoIncubate = useCallback(() => {
    const safeSymbols = results.filter(r => r.autoSafe).map(r => r.rawSymbol);
    setIncubated(prev => { const n = new Set(prev); safeSymbols.forEach(s => n.add(s)); return n; });
  }, [results]);

  const handleSelectAll = useCallback(() => {
    const filtered = applyFilters(results, filters, searchText);
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.rawSymbol)));
  }, [results, filters, selected, searchText]);

  const updateFilters = useCallback((partial: Partial<FilterState>) => {
    setFilters(prev => ({ ...prev, ...partial }));
  }, []);

  // Top Garantido: MICRO + EXECUTE + PRONTO + LOW risk
  const topGuaranteed = useMemo(() => {
    return results
      .filter(r => !r.prohibited && r.microAction === 'EXECUTE' && r.scenarioStatus === 'PRONTO' && r.riskLabel === 'LOW' && r.rrNum >= 1.5)
      .sort((a, b) => b.trustScore - a.trustScore)
      .slice(0, 3);
  }, [results]);

  // Muito Confiáveis: MICRO + not AVOID + not CONTRA + not HIGH risk
  const veryReliable = useMemo(() => {
    const topSet = new Set(topGuaranteed.map(r => r.rawSymbol));
    const minTrust = radarMode === 'CONSERVATIVE' ? 70 : radarMode === 'BALANCED' ? 55 : 35;
    return results
      .filter(r => !topSet.has(r.rawSymbol) && !r.prohibited && r.microAction !== 'AVOID' && r.scenarioStatus !== 'CONTRA' && r.riskLabel !== 'HIGH' && r.trustScore >= minTrust)
      .sort((a, b) => b.trustScore - a.trustScore)
      .slice(0, 10);
  }, [results, topGuaranteed, radarMode]);

  const detailResult = detailSymbol ? results.find(r => r.rawSymbol === detailSymbol) : null;

  if (isLoading) return (
    <div className="space-y-4">
      <h2 className="text-xl font-black tracking-tight">Live Opportunity Scanner</h2>
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="w-6 h-6 border-2 border-white/10 border-t-amber-400 rounded-full animate-spin" />
        <p className="text-[11px] text-white/30">Scanning markets, MESO & MICRO pipeline...</p>
      </div>
    </div>
  );
  if (isError) return <ErrorBox message="Failed to load scanner data" onRetry={() => refetch()} />;

  const filtered = applyFilters(results, filters, searchText);
  const sorted = applySort(filtered, sortKey, sortDir);
  const readyCount = results.filter(r => r.opportunityStatus === 'READY').length;
  const incubatedCount = incubated.size;

  return (
    <div className="space-y-4">
      {/* Header + Radar Mode + Exec Window */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-black tracking-tight">Live Opportunity Scanner</h2>
          <span className={`w-2 h-2 rounded-full ${readyCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-white/20'}`} />
          <span className="text-[10px] text-white/30">{readyCount} ready</span>
          {microLoading && <span className="text-[9px] text-violet-400 animate-pulse">MICRO loading...</span>}
        </div>
        <div className="flex items-center gap-2">
          {/* Radar mode */}
          <button onClick={cycleRadar}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
              radarMode === 'CONSERVATIVE' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' :
              radarMode === 'BALANCED' ? 'bg-violet-500/15 text-violet-400 border-violet-500/25' :
              'bg-amber-500/15 text-amber-400 border-amber-500/25'
            }`}>MODE: {radarMode}</button>
          {/* Exec window */}
          <span className={`text-[9px] font-bold px-2 py-1 rounded-lg border ${
            execWindow.status === 'PASS' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
          }`}>{execWindow.label}</span>
          {incubatedCount > 0 && (
            <button onClick={() => setView('incubator')}
              className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors">
              Incubator ({incubatedCount})
            </button>
          )}
        </div>
      </div>

      {/* Summary metrics (enhanced) */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        <Card className="!p-2.5"><Metric label="Scanned" value={summary.total} small /></Card>
        <Card className="!p-2.5"><Metric label="READY" value={summary.ready} small color="text-emerald-400" /></Card>
        <Card className="!p-2.5"><Metric label="MICRO RDY" value={summary.microReady} small color="text-violet-400" /></Card>
        <Card className="!p-2.5"><Metric label="LOW Risk" value={summary.lowRisk} small color="text-emerald-300" /></Card>
        <Card className="!p-2.5"><Metric label="Auto Safe" value={summary.safe} small color="text-emerald-300" /></Card>
        <Card className="!p-2.5"><Metric label="Long / Short" value={`${summary.bullish}/${summary.bearish}`} small /></Card>
        <Card className="!p-2.5"><Metric label="Top Pick" value={cleanSymbol(summary.topOpportunity)} small color="text-amber-400" /></Card>
        <Card className="!p-2.5"><Metric label="WARMING" value={summary.warming} small color="text-amber-400" /></Card>
      </div>

      {/* Top Garantido + Muito Confiáveis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <TopPanel title="Top Garantido (1-3)" color="border-emerald-500/20 bg-emerald-500/[0.03]" results={topGuaranteed} onSelect={setDetailSymbol} />
        {radarMode !== 'CONSERVATIVE' && (
          <TopPanel title="Muito Confiáveis (5-10)" color="border-violet-500/20 bg-violet-500/[0.03]" results={veryReliable} onSelect={setDetailSymbol} />
        )}
      </div>

      {/* Filters */}
      <FilterBar filters={filters} summary={summary} onChange={updateFilters} searchText={searchText} onSearch={setSearchText} />

      {/* Sort bar + bulk actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-white/20 mr-1">Sort:</span>
          <SortBtn label="Final" sortKey="trust" current={sortKey} dir={sortDir} onSort={handleSort} />
          <SortBtn label="Scan" sortKey="score" current={sortKey} dir={sortDir} onSort={handleSort} />
          <SortBtn label="R:R" sortKey="rr" current={sortKey} dir={sortDir} onSort={handleSort} />
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
              Incubate Selected ({selected.size})
            </button>
          )}
          <button onClick={handleAutoIncubate}
            className="text-[10px] font-bold px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors">
            Auto-Incubate Safe ({summary.safe})
          </button>
        </div>
      </div>

      {/* Results count */}
      <div className="text-[10px] text-white/20">
        Showing {sorted.length} of {results.length} • {incubatedCount > 0 && <span className="text-amber-400">{incubatedCount} incubated</span>}
      </div>

      {/* Main layout: List + Detail Panel */}
      <div className="flex gap-4">
        {/* Results list */}
        <div className={`space-y-2 ${detailResult ? 'flex-1 min-w-0' : 'w-full'}`}>
          {sorted.map(r => (
            <ScanResultRow key={r.rawSymbol} result={r}
              selected={selected.has(r.rawSymbol)}
              active={detailSymbol === r.rawSymbol}
              onSelect={handleSelect}
              onIncubate={handleIncubate}
              onDetail={setDetailSymbol}
            />
          ))}
          {sorted.length === 0 && (
            <div className="text-sm text-white/30 text-center py-8">No results match current filters</div>
          )}
        </div>

        {/* Detail Panel */}
        {detailResult && (
          <div className="w-80 shrink-0 hidden lg:block sticky top-4 self-start">
            <DetailPanel result={detailResult} onClose={() => setDetailSymbol(null)} />
          </div>
        )}
      </div>
    </div>
  );
}

// --- HELPERS ---
function applyFilters(results: ScanResult[], f: FilterState, search: string): ScanResult[] {
  const q = search.trim().toLowerCase();
  return results.filter(r => {
    if (q) {
      const hay = [r.symbol, r.rawSymbol, r.name, r.assetClass, r.direction, r.microAction, r.scenarioStatus, r.riskLabel, r.levelSource].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.tier !== 'all' && r.tier !== f.tier) return false;
    if (f.status !== 'all' && r.opportunityStatus !== f.status) return false;
    if (f.direction !== 'all' && r.direction !== f.direction) return false;
    if (f.assetClass !== 'all' && r.assetClass !== f.assetClass) return false;
    if (f.microAction !== 'all' && (r.microAction || '') !== f.microAction) return false;
    if (f.riskFilter !== 'all' && r.riskLabel !== f.riskFilter) return false;
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
      case 'trust': diff = a.trustScore - b.trustScore; break;
      case 'score': diff = a.score - b.score; break;
      case 'rr': diff = a.rrNum - b.rrNum; break;
      case 'change': diff = Math.abs(a.changePercent) - Math.abs(b.changePercent); break;
      case 'rsi': diff = Math.abs(a.rsi - 50) - Math.abs(b.rsi - 50); break;
      case 'atr': diff = a.atrPercent - b.atrPercent; break;
      case 'volume': diff = a.volumeRatio - b.volumeRatio; break;
      case 'name': diff = a.symbol.localeCompare(b.symbol); break;
    }
    return dir === 'desc' ? -diff : diff;
  });
  return sorted;
}
