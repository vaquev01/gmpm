/**
 * @deprecated Este arquivo usa dados MOCK com Math.random().
 * Use realEngine.ts que busca dados reais do Yahoo Finance.
 * 
 * NÃO USE ESTE ARQUIVO EM PRODUÇÃO!
 */

import { MarketData, Signal } from '@/types';

// ⚠️ DEPRECATED - Este engine usa dados simulados
// Use: import { evaluateRealSignals } from './realEngine'

const WEIGHTS = {
    MACRO: 0.15,
    TREND: 0.15,
    MOMENTUM: 0.10,
    VOLATILITY: 0.10,
    FLOW: 0.10,
    TECHNICAL: 0.10,
    FRACTAL: 0.10,
    CROSS_ASSET: 0.05,
    TIMING: 0.05,
    RISK_REWARD: 0.10
};

const ASSETS = [
    'EUR/USD', 'GBP/JPY', 'USD/MXN', 'Gold', 'Oil', 'S&P 500', 'DAX', 'BTC', 'ETH', 'AAPL', 'TSLA'
];

/**
 * @deprecated Use fetchRealMarketData() from realEngine.ts instead
 */
export const generateMarketData = (): MarketData[] => {
    console.warn('⚠️ generateMarketData() is DEPRECATED - uses mock data. Use fetchRealMarketData() instead.');

    return ASSETS.map(symbol => {
        const trend = Math.random() * 100;
        const rsi = Math.random() * 100;
        const volatility = Math.random() * 100;
        const sentiment = Math.random() * 100;
        const fractalScore = Math.random() * 100;
        const change = (Math.random() - 0.5) * 5;

        return {
            symbol,
            price: Math.random() * 1000 + 100,
            change,
            rsi,
            trend,
            volatility,
            volume: Math.random() * 1000000,
            sentiment,
            fractalScore
        };
    });
};

/**
 * @deprecated Use calculateScore() from realEngine.ts instead
 */
export const calculateScore = (data: MarketData): number => {
    console.warn('⚠️ calculateScore() is DEPRECATED. Use realEngine.ts instead.');

    const macroScore = (data.sentiment * 0.5 + data.trend * 0.5) * WEIGHTS.MACRO;
    const trendScore = data.trend * WEIGHTS.TREND;
    const momentumScore = data.rsi * WEIGHTS.MOMENTUM;
    const volatilityScore = data.volatility * WEIGHTS.VOLATILITY;
    const flowScore = (Math.min(data.volume / 500000, 1) * 100) * WEIGHTS.FLOW;
    const technicalScore = (data.change > 0 ? 80 : 20) * WEIGHTS.TECHNICAL;
    const fractalScore = data.fractalScore * WEIGHTS.FRACTAL;
    const othersScore = 50 * (WEIGHTS.CROSS_ASSET + WEIGHTS.TIMING + WEIGHTS.RISK_REWARD);

    const totalScore = macroScore + trendScore + momentumScore + volatilityScore + flowScore + technicalScore + fractalScore + othersScore;

    return Math.min(Math.round(totalScore), 100);
};

/**
 * @deprecated Use evaluateRealSignals() from realEngine.ts instead
 */
export const evaluateSignals = (marketData: MarketData[]): Signal[] => {
    console.warn('⚠️ evaluateSignals() is DEPRECATED. Use evaluateRealSignals() from realEngine.ts instead.');

    const signals: Signal[] = [];

    marketData.forEach(data => {
        const score = calculateScore(data);

        if (score > 55) {
            const direction = data.trend > 50 ? 'LONG' : 'SHORT';

            let confidence: Signal['confidence'] = 'MODERATE';
            if (score > 75) confidence = 'STRONG';
            if (score > 85) confidence = 'INSTITUTIONAL';

            const reasons: string[] = [];
            if (data.fractalScore > 70) reasons.push('Fractal Confluence');
            if (data.trend > 70) reasons.push('Strong Trend');
            if (data.volatility > 70) reasons.push('High Volatility');

            signals.push({
                id: Math.random().toString(36).substring(7),
                asset: data.symbol,
                timestamp: Date.now(),
                direction,
                score,
                confidence,
                reasons,
                entryPrice: data.price,
                price: data.price
            });
        }
    });

    return signals;
};
