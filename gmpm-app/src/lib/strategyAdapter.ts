
import { BacktestCandle } from './backtestEngine';
import { RealQuote, MacroData } from './realEngine';
import { MarketData } from '@/types';

// ===== STRATEGY ADAPTER =====
// Bridges historical data (BacktestCandle) to Real Engine requirements (RealQuote, Macro etc.)

export class StrategyAdapter {

    // Generate Mock Macro Data based on price action (since we don't have historical macro data)
    static generateMockMacro(candles: BacktestCandle[], currentIndex: number): MacroData {
        const lookback = 20;
        const slice = candles.slice(Math.max(0, currentIndex - lookback), currentIndex + 1);

        if (slice.length < 2) {
            return {
                vix: 20,
                vixChange: 0,
                treasury10y: 4.0,
                treasury2y: 4.2,
                treasury30y: 4.1,
                yieldCurve: -0.2, // Inverted default
                dollarIndex: 102,
                fearGreed: { value: 50, classification: 'Neutral', timestamp: 'N/A' }
            };
        }

        // 1. Calculate historical volatility as VIX proxy
        const returns = slice.map((c, i) => i > 0 ? (c.close - slice[i - 1].close) / slice[i - 1].close : 0).slice(1);
        const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / returns.length);
        const annualizedVol = stdDev * Math.sqrt(252) * 100;

        // VIX is roughly implied volatility. We'll map historical vol to a "VIX-like" reading
        // Low price vol != low VIX always, but it's a fair proxy for backtesting regime
        let simulatedVix = Math.max(10, Math.min(60, annualizedVol)); // Clamp 10-60

        // 2. Trend direction as Fear/Greed proxy
        const current = candles[currentIndex];
        const sma20 = slice.reduce((sum, c) => sum + c.close, 0) / slice.length;
        const distFromMa = (current.close - sma20) / sma20 * 100;

        let fearGreedValue = 50;
        if (distFromMa > 5) fearGreedValue = 85; // Extreme Greed
        else if (distFromMa > 2) fearGreedValue = 65; // Greed
        else if (distFromMa < -5) fearGreedValue = 15; // Extreme Fear
        else if (distFromMa < -2) fearGreedValue = 35; // Fear

        // 3. VIX Spike Detection (if price dropped hard)
        const dailyChange = (current.close - candles[currentIndex - 1].close) / candles[currentIndex - 1].close * 100;
        if (dailyChange < -2) simulatedVix += 5;

        return {
            vix: simulatedVix,
            vixChange: 0,
            treasury10y: 4.0, // Static assumption for backtest
            treasury2y: 4.2,
            treasury30y: 4.1,
            yieldCurve: -0.2,
            dollarIndex: 102,
            fearGreed: {
                value: fearGreedValue,
                classification: fearGreedValue > 60 ? 'Greed' : fearGreedValue < 40 ? 'Fear' : 'Neutral',
                timestamp: current.date
            }
        };
    }

    // Convert BacktestCandle to RealQuote structure
    static convertToQuote(candle: BacktestCandle, symbol: string): RealQuote {
        // Estimate market state
        // In backtest we assume market is OPEN for the candle duration
        return {
            symbol: symbol,
            displaySymbol: symbol,
            price: candle.close,
            change: candle.close - candle.open, // Approx change
            changePercent: ((candle.close - candle.open) / candle.open) * 100,
            volume: candle.volume,
            high: candle.high,
            low: candle.low,
            open: candle.open,
            previousClose: candle.open, // Approx
            marketState: 'REGULAR',
            assetClass: this.inferAssetClass(symbol)
        };
    }

    // Calculate Indicators (RSI, ATR etc) needed for MarketData
    static calculateIndicators(candles: BacktestCandle[], index: number): ComputedIndicators {
        const lookback = 14;
        if (index < lookback + 1) return { rsi: 50, atr: 0 };

        // RSI
        const slice = candles.slice(index - lookback, index + 1);
        let gains = 0;
        let losses = 0;

        for (let i = 1; i < slice.length; i++) {
            const change = slice[i].close - slice[i - 1].close;
            if (change >= 0) gains += change;
            else losses -= change;
        }

        const avgGain = gains / lookback;
        const avgLoss = losses / lookback;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));

        // ATR
        const trs = [];
        for (let i = 1; i < slice.length; i++) {
            const curr = slice[i];
            const prev = slice[i - 1];
            const hl = curr.high - curr.low;
            const hpc = Math.abs(curr.high - prev.close);
            const lpc = Math.abs(curr.low - prev.close);
            trs.push(Math.max(hl, hpc, lpc));
        }
        const atr = trs.reduce((sum, v) => sum + v, 0) / trs.length;

        return { rsi, atr };
    }

    // Helper to guess asset class from symbol (same logic as RealEngine essentially)
    private static inferAssetClass(symbol: string): string {
        if (['BTC', 'ETH', 'SOL', 'XRP'].some(c => symbol.includes(c))) return 'crypto';
        if (['EUR', 'GBP', 'JPY'].some(c => symbol.includes(c))) return 'forex';
        if (['GC', 'CL', 'SI', 'NG'].some(c => symbol.includes(c))) return 'commodity';
        if (['TNX', 'TLT'].some(c => symbol.includes(c))) return 'bond';
        if (['SPY', 'QQQ', 'IWM'].some(c => symbol.includes(c))) return 'etf';
        return 'stock';
    }
}

interface ComputedIndicators {
    rsi: number;
    atr: number;
}
