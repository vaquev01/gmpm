import { useQuery } from '@tanstack/react-query';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export type HealthData = { ok: boolean; ts: number };

export type MacroData = {
  success: boolean;
  timestamp?: string;
  macro?: {
    vix: number;
    vixChange: number;
    treasury10y: number;
    treasury2y: number;
    treasury30y: number;
    yieldCurve: number;
    dollarIndex: number;
    dollarIndexChange: number;
    fearGreed: { value: number; classification: string; timestamp: string } | null;
  };
  cacheMode?: string;
};

export type MarketAsset = {
  symbol: string;
  displaySymbol?: string;
  name: string;
  price: number;
  changePercent: number;
  category?: string;
  assetClass?: string;
  sector?: string;
  atr?: number;
  rsi?: number;
  volume?: number;
  avgVolume?: number;
  high?: number;
  low?: number;
  open?: number;
  history?: number[];
  marketState?: string;
  quoteTimestamp?: string;
  quality?: { status: string; reasons: string[] };
};

export type MarketData = {
  success: boolean;
  timestamp?: string;
  count: number;
  degraded: boolean;
  assets?: MarketAsset[];
};

export type RegimeAxis = {
  score: number;
  direction: string;
  confidence: string;
  name?: string;
  axis?: string;
};

export type RegimeSnapshot = {
  regime: string;
  regimeConfidence: string;
  axes: Record<string, RegimeAxis>;
  timestamp: string;
};

export type RegimeData = {
  success: boolean;
  snapshot?: RegimeSnapshot;
};

export type TestSummary = {
  total: number;
  passed: number;
  failed: number;
  percentage: number;
};

export type TestData = {
  success: boolean;
  summary: TestSummary;
  tests: Array<{ name: string; passed: boolean }>;
};

export type FredSeries = {
  seriesId: string;
  name: string;
  value: number;
  date: string;
  unit: string;
};

export type FredData = {
  success: boolean;
  timestamp?: string;
  data?: Record<string, FredSeries>;
  summary?: {
    gdp?: { value: number | null; trend: string; lastUpdate?: string };
    inflation?: { cpi?: number | null; cpiYoY: number | null; coreCpi?: number | null; pce?: number | null; trend: string };
    employment?: { unemploymentRate: number | null; nfp?: number | null; initialClaims?: number | null; trend: string };
    rates?: { fedFunds: number | null; treasury10y?: number | null; treasury2y?: number | null; yieldCurve: number | null; curveStatus: string };
    credit?: { aaaSpread?: number | null; hySpread: number | null; condition: string };
    sentiment?: { consumerSentiment: number | null; condition: string };
  };
};

export function useHealth() {
  return useQuery<HealthData>({
    queryKey: ['health'],
    queryFn: () => apiFetch('/health'),
    refetchInterval: 10_000,
  });
}

export function useMacro() {
  return useQuery<MacroData>({
    queryKey: ['macro'],
    queryFn: () => apiFetch('/macro'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useMarket() {
  return useQuery<MarketData>({
    queryKey: ['market'],
    queryFn: () => apiFetch('/market'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useRegime() {
  return useQuery<RegimeData>({
    queryKey: ['regime'],
    queryFn: () => apiFetch('/regime'),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useTest() {
  return useQuery<TestData>({
    queryKey: ['test'],
    queryFn: () => apiFetch('/test'),
    staleTime: 300_000,
  });
}

export function useFred() {
  return useQuery<FredData>({
    queryKey: ['fred'],
    queryFn: () => apiFetch('/fred'),
    refetchInterval: 300_000,
    staleTime: 120_000,
  });
}

// --- MESO ---

export type MesoAllowed = {
  symbol: string; direction: 'LONG' | 'SHORT'; class: string; reason: string; score: number;
};

export type MesoProhibited = { symbol: string; reason: string };

export type MesoExecutiveSummary = {
  marketBias: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
  regimeLabel: string;
  vix: number | null; yieldCurve: number | null; dollarIndex: number | null;
  fearGreed: { value: number; classification: string } | number | null;
  classBreakdown: { bullish: string[]; bearish: string[]; neutral: string[] };
  oneLineSummary: string;
};

export type MesoClassAnalysis = {
  class: string; name: string;
  expectation: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'MIXED';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  direction: 'LONG' | 'SHORT' | 'AVOID';
  drivers: string[];
  liquidityScore: number;
  volatilityRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  topPicks: string[];
  avoidList: string[];
  performance: {
    avgChange: number;
    topPerformer: { symbol: string; change: number } | null;
    worstPerformer: { symbol: string; change: number } | null;
  };
};

export type MesoSectorAnalysis = {
  sector: string; parentClass: string;
  expectation: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  momentum: number; relativeStrength: number;
};

export type MesoTilt = {
  rank: number; direction: 'LONG' | 'SHORT' | 'RELATIVE';
  asset: string; rationale: string; confidence: string;
};

export type MesoTemporalFocus = {
  weeklyThesis: string;
  dailyFocus: string[];
  keyLevels: { asset: string; level: number; type: 'support' | 'resistance'; significance: string }[];
  catalysts: { event: string; timing: string; impact: string; affectedClasses: string[] }[];
  actionPlan: { timeframe: string; action: string; rationale: string }[];
};

export type MesoData = {
  success: boolean; timestamp: string;
  executiveSummary: MesoExecutiveSummary;
  regime: { type: string; confidence: string; drivers: string[]; axes: Record<string, { direction: string; label?: string; name?: string; score?: number; confidence?: string; reasons?: string[] }> };
  temporalFocus: MesoTemporalFocus;
  classes: MesoClassAnalysis[];
  sectors: MesoSectorAnalysis[];
  summary: {
    topOpportunities: { class: string; picks: string[]; confidence: string; currentPerformance: number }[];
    riskWarnings: string[];
    tiltsActive: number; prohibitionsActive: number;
  };
  tilts: MesoTilt[];
  prohibitions: string[];
  macro: { vix?: number; treasury10y?: number; treasury2y?: number; yieldCurve?: number; dollarIndex?: number; fearGreed?: { value: number; classification: string } | number | null };
  microInputs?: {
    allowedInstruments: MesoAllowed[];
    prohibitedInstruments: MesoProhibited[];
    favoredDirection?: 'LONG' | 'SHORT' | 'NEUTRAL';
    volatilityContext?: 'HIGH' | 'NORMAL' | 'LOW';
  };
};

export function useMeso() {
  return useQuery<MesoData>({
    queryKey: ['meso'],
    queryFn: () => apiFetch('/meso'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// --- MICRO ---

export type MicroSetup = {
  id: string; symbol: string; displaySymbol: string;
  type: 'BREAKOUT' | 'PULLBACK' | 'REVERSAL' | 'CONTINUATION' | 'LIQUIDITY_GRAB';
  direction: 'LONG' | 'SHORT';
  timeframe: 'M15' | 'H1' | 'H4';
  entry: number; stopLoss: number; takeProfit1: number; takeProfit2: number; takeProfit3: number;
  riskReward: number; confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confluences: string[]; invalidation: string; thesis: string;
  mesoAlignment: boolean; technicalScore: number;
};

export type MicroTechnicalAnalysis = {
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
};

export type MicroAnalysis = {
  symbol: string; displaySymbol: string; name?: string; assetClass?: string;
  price: number; technical: MicroTechnicalAnalysis; setups: MicroSetup[];
  recommendation: { action: string; reason: string; bestSetup: MicroSetup | null };
  scenarioAnalysis?: { status: string; statusReason: string; entryQuality: string; timing: string };
};

export type MicroData = {
  success: boolean; timestamp: string;
  analyses: MicroAnalysis[];
  summary: { total: number; withSetups: number; executeReady: number; message: string };
};

export function useMicro() {
  return useQuery<MicroData>({
    queryKey: ['micro'],
    queryFn: async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      try {
        return await apiFetch<MicroData>('/micro');
      } finally {
        clearTimeout(timeout);
      }
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });
}

// --- RISK ---

export type KellyData = {
  fullKelly: number; halfKelly: number; quarterKelly: number;
  recommended: number; maxPosition: number;
  edgeQuality: string; reasoning: string;
};

export type DrawdownData = {
  currentDrawdown: number; maxDrawdown: number;
  peakEquity: number; currentEquity: number;
  drawdownDuration: number; recoveryFactor: number;
  status: string;
};

export type CircuitBreaker = {
  name: string; triggered: boolean;
  threshold: number; currentValue: number;
  action: string; message: string;
};

export type RiskBudget = {
  totalBudget: number; usedBudget: number; availableBudget: number;
  reserveBuffer: number; utilizationRate: number; status: string;
};

export type RiskReport = {
  timestamp: string;
  kelly: KellyData;
  drawdown: DrawdownData;
  circuitBreakers: CircuitBreaker[];
  riskBudget: RiskBudget;
  recommendations: string[];
  alerts: string[];
  tradingStatus: string;
};

export type RiskResponse = {
  success: boolean;
  report: RiskReport;
};

export function useRisk() {
  return useQuery<RiskResponse>({
    queryKey: ['risk'],
    queryFn: () => apiFetch('/risk'),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

// --- CURRENCY STRENGTH ---

export type CurrencyStrengthItem = {
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
};

export type CurrencyBestPair = {
  symbol: string; base: string; quote: string; direction: 'LONG' | 'SHORT';
  differential: number; baseStrength: number; quoteStrength: number; confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  price?: number;
  tradePlan?: {
    entryZone: { from: number; to: number }; stopLoss: number; takeProfit: number;
    riskReward: number; horizon: string; executionWindow: string;
  };
};

export type CurrencyData = {
  success: boolean; timestamp: string;
  currencies: CurrencyStrengthItem[];
  globalFlow: { riskSentiment: string; dollarIndex: number | null; vix: number | null; dominantFlow: string; weakestCurrency: string };
  bestPairs: CurrencyBestPair[];
  economicCalendar?: Record<string, { date: string; time: string; event: string; impact: string; previous: string | null; forecast: string | null; actual: string | null }[]>;
};

export function useCurrencyStrength() {
  return useQuery<CurrencyData>({
    queryKey: ['currency-strength'],
    queryFn: () => apiFetch('/currency-strength'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// --- LIQUIDITY MAP ---

export type LiquidityMapAsset = {
  symbol: string; displaySymbol: string;
  assetClass: 'forex' | 'etf' | 'crypto' | 'commodity' | 'index';
  currentPrice: number; atr: number;
  volumeProfile: { priceRange: { low: number; high: number }; volume: number; volumePercent: number; isBuyDominant: boolean }[];
  poc: { price: number; volume: number };
  valueArea: { high: number; low: number };
  liquidityZones: { priceLevel: number; volumeConcentration: number; type: string; description: string }[];
  equalLevels: { price: number; type: 'EQUAL_HIGHS' | 'EQUAL_LOWS'; touches: number; strength: 'STRONG' | 'MODERATE' | 'WEAK'; liquidityEstimate: 'HIGH' | 'MEDIUM' | 'LOW' }[];
  buySideLiquidity: { level: number; strength: number }[];
  sellSideLiquidity: { level: number; strength: number }[];
  marketDirection: 'SEEKING_BUYSIDE' | 'SEEKING_SELLSIDE' | 'BALANCED';
  timing: { bestSession: string; avgTimeToLiquidityGrab: string; historicalPattern: string; probabilityOfSweep: number; nextLikelyWindow: string };
  source: { type: string; reliability: string; description: string; caveat?: string };
  cotData?: { commercialNet: number; nonCommercialNet: number; sentiment: string };
  timestamp: string;
};

export type LiquidityClassSummary = {
  total: number; seekingBuyside: number; seekingSellside: number; balanced: number;
  topLiquidity: { symbol: string; direction: string; nearestLiquidity: string; timing?: string; probability?: number }[];
};

export type LiquidityMapSummary = {
  forex: LiquidityClassSummary; etf: LiquidityClassSummary; crypto: LiquidityClassSummary;
  commodity: LiquidityClassSummary; index: LiquidityClassSummary;
  total: number | { analyzed: number; fromMeso?: boolean; seekingBuyside: number; seekingSellside: number };
};

export type LiquidityMapResponse = {
  success: boolean; timestamp: string;
  forex: LiquidityMapAsset[]; etf: LiquidityMapAsset[]; crypto: LiquidityMapAsset[];
  commodity: LiquidityMapAsset[]; index: LiquidityMapAsset[]; all: LiquidityMapAsset[];
  summary: LiquidityMapSummary;
};

export function useLiquidityMap() {
  return useQuery<LiquidityMapResponse>({
    queryKey: ['liquidity-map'],
    queryFn: async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      try {
        return await apiFetch<LiquidityMapResponse>('/liquidity-map');
      } finally {
        clearTimeout(timeout);
      }
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });
}
