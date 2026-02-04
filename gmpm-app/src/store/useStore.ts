import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Asset, FeatureCategory, ScoreComponent, Timeframe, FractalConcept, ViewType, FactoryTab, MarketData, Signal, PortfolioConfig, IncubatorPortfolio } from '@/types';

interface AppState {
    view: ViewType;
    setView: (view: ViewType) => void;

    factoryTab: FactoryTab;
    setFactoryTab: (tab: FactoryTab) => void;

    assetUniverse: Asset[];
    featureCategories: FeatureCategory[];
    scoreComponents: ScoreComponent[];
    timeframes: Timeframe[];
    fractalConcepts: FractalConcept[];

    // Engine State
    marketData: MarketData[];
    activeSignals: Signal[];
    updateMarketData: (data: MarketData[]) => void;
    addSignal: (signal: Signal) => void;
    clearSignals: () => void;

    // Incubator State
    portfolios: IncubatorPortfolio[];
    addPortfolio: (portfolio: IncubatorPortfolio) => void;
    removePortfolio: (id: string) => void;
    updatePortfolioConfig: (id: string, config: Partial<PortfolioConfig>) => void;
}



export const useStore = create<AppState>()(
    persist(
        (set) => ({
            view: 'command',
            setView: (view) => set({ view }),

            factoryTab: 'paper',
            setFactoryTab: (tab) => set({ factoryTab: tab }),

            assetUniverse: [
                { class: 'Forex', count: 28, examples: 'EUR/USD, GBP/JPY, USD/MXN...' },
                { class: 'Commodities', count: 25, examples: 'Gold, Oil, Copper, Wheat...' },
                { class: 'Indices', count: 30, examples: 'S&P 500, DAX, Nikkei, Hang Seng...' },
                { class: 'Fixed Income', count: 20, examples: '10Y Treasury, Bund, Credit Spreads...' },
                { class: 'ETFs', count: 50, examples: 'SPY, QQQ, GLD, TLT, XLF...' },
                { class: 'Crypto', count: 15, examples: 'BTC, ETH, SOL, LINK...' },
                { class: 'Stocks', count: 100, examples: 'AAPL, MSFT, GOOGL, JPM...' },
                { class: 'Volatility', count: 10, examples: 'VIX, VDAX, MOVE...' }
            ],

            featureCategories: [
                { cat: 'Macro', count: 20, examples: 'Inflation, GDP, PMI, Fed stance' },
                { cat: 'Rates', count: 15, examples: 'Yields, curves, spreads, differentials' },
                { cat: 'Volatility', count: 15, examples: 'VIX, skew, IV/RV, term structure' },
                { cat: 'Flow', count: 15, examples: 'CFTC, ETF flows, gamma, sentiment' },
                { cat: 'Technical', count: 25, examples: 'Trend, momentum, structure, volume' },
                { cat: 'Fractal/SMC', count: 15, examples: 'Hurst, OB, FVG, BOS, liquidity' },
                { cat: 'Cross-Asset', count: 10, examples: 'Correlations, beta, factors' },
                { cat: 'Sentiment', count: 5, examples: 'News NLP, social, Fear/Greed' }
            ],

            scoreComponents: [
                { comp: 'Macro Alignment', weight: 15 },
                { comp: 'Trend Quality', weight: 15 },
                { comp: 'Momentum', weight: 10 },
                { comp: 'Volatility', weight: 10 },
                { comp: 'Flow/Positioning', weight: 10 },
                { comp: 'Technical Structure', weight: 10 },
                { comp: 'Fractal/SMC', weight: 10 },
                { comp: 'Cross-Asset', weight: 5 },
                { comp: 'Timing/Seasonal', weight: 5 },
                { comp: 'Risk/Reward', weight: 10 }
            ],

            timeframes: [
                { tf: 'Monthly', use: 'Macro trend', weight: 20 },
                { tf: 'Weekly', use: 'Intermediate', weight: 20 },
                { tf: 'Daily', use: 'Primary decision', weight: 30 },
                { tf: '4H', use: 'Timing', weight: 15 },
                { tf: '1H', use: 'Entry refinement', weight: 10 },
                { tf: '15M/5M', use: 'Execution', weight: 5 }
            ],

            fractalConcepts: [
                { concept: 'Hurst Exponent', desc: 'H>0.5=trending, H<0.5=mean-revert' },
                { concept: 'Fractal Dimension', desc: 'D≈1=smooth, D≈2=choppy' },
                { concept: 'Order Blocks', desc: 'Last candle before strong move' },
                { concept: 'Fair Value Gaps', desc: 'Imbalances to fill' },
                { concept: 'Break of Structure', desc: 'HH/HL or LH/LL confirmation' },
                { concept: 'Liquidity', desc: 'Equal highs/lows as targets' },
                { concept: 'Harmonic Patterns', desc: 'Gartley, Bat, Crab, Butterfly' }
            ],

            // Engine State
            marketData: [],
            activeSignals: [],
            updateMarketData: (marketData) => set({ marketData }),
            addSignal: (signal) => set((state) => ({ activeSignals: [signal, ...state.activeSignals].slice(0, 50) })),
            clearSignals: () => set({ activeSignals: [] }),

            // Incubator State
            portfolios: [],
            addPortfolio: (portfolio) => set((state) => ({ portfolios: [portfolio, ...state.portfolios] })),
            removePortfolio: (id) => set((state) => ({ portfolios: state.portfolios.filter(p => p.id !== id) })),
            updatePortfolioConfig: (id, config) => set((state) => ({
                portfolios: state.portfolios.map(p => p.id === id ? { ...p, config: { ...p.config, ...config } } : p)
            }))
        }),
        {
            name: 'gmpm-storage', // unique name
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({ portfolios: state.portfolios }), // Only save portfolios
        }
    )
);
