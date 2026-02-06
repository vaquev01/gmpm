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
  name: string;
  price: number;
  changePercent: number;
  category: string;
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
    gdp?: { value: number | null; trend: string };
    inflation?: { cpiYoY: number | null; trend: string };
    employment?: { unemploymentRate: number | null; trend: string };
    rates?: { fedFunds: number | null; yieldCurve: number | null; curveStatus: string };
    credit?: { hySpread: number | null; condition: string };
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
