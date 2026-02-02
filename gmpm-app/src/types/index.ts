export interface Asset {
    class: string;
    count: number;
    examples: string;
}

export interface FeatureCategory {
    cat: string;
    count: number;
    examples: string;
}

export interface ScoreComponent {
    comp: string;
    weight: number; // percentage as number
}

export interface Timeframe {
    tf: string;
    use: string;
    weight: number; // percentage as number
}

export interface FractalConcept {
    concept: string;
    desc: string;
}


export type ViewType = 'command' | 'macro' | 'lab' | 'factory' | 'incubator' | 'universe';

export type FactoryTab = 'backtest' | 'paper' | 'learning' | 'risk';

export interface MarketData {
    symbol: string;
    price: number;
    change: number;
    // Indicators (0-100 normalized)
    rsi: number;
    trend: number; // 0=bearish, 100=bullish
    volatility: number;
    volume: number;
    sentiment: number;
    // Fractal
    fractalScore: number;
    // Real data fields
    marketState?: string; // REGULAR, PRE, POST, CLOSED
}

export interface Signal {
    id: string;
    asset: string;
    timestamp: number;
    direction: 'LONG' | 'SHORT';
    score: number;
    confidence: 'MODERATE' | 'STRONG' | 'INSTITUTIONAL';
    reasons: string[];
    entryPrice: number;
    price?: number; // Current price
    marketState?: string;
}

// --- INCUBATOR TYPES ---
export interface PortfolioConfig {
    capital: number;
    leverage: number;
    defaultLots: number;
}

export interface TrackedAsset {
    symbol: string;
    entryPrice: number;
    side: 'LONG' | 'SHORT';
    lots: number;
}

export interface IncubatorPortfolio {
    id: string;
    name: string;
    createdAt: number; // timestamp
    status: 'ACTIVE' | 'CLOSED';
    config: PortfolioConfig;
    assets: TrackedAsset[];
}
