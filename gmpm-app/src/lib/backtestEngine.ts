// ===== BACKTEST ENGINE =====
// Simulate trading strategies on historical data

export interface BacktestCandle {
    date: string;
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface BacktestSignal {
    date: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    score: number;
}

export interface BacktestTrade {
    entryDate: string;
    exitDate: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    exitPrice: number;
    stopLoss: number;
    takeProfit: number;
    pnlPercent: number;
    pnlR: number;
    result: 'WIN' | 'LOSS' | 'BE';
    holdingDays: number;
}

export interface BacktestResult {
    symbol: string;
    period: string;
    startDate: string;
    endDate: string;

    // Performance
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    avgWinPercent: number;
    avgLossPercent: number;
    avgWinR: number;
    avgLossR: number;

    // Risk Metrics
    profitFactor: number;
    expectancy: number;
    expectancyR: number;
    maxDrawdown: number;
    maxConsecutiveLosses: number;
    sharpeRatio: number;
    sortinoRatio: number;

    // Capital
    initialCapital: number;
    finalCapital: number;
    totalReturn: number;
    annualizedReturn: number;

    // Comparison
    buyAndHoldReturn: number;
    alpha: number;

    // Details
    trades: BacktestTrade[];
    equityCurve: { date: string; equity: number; drawdown: number }[];
}

export interface BacktestConfig {
    initialCapital: number;
    riskPerTrade: number; // percentage of capital per trade
    maxPositions: number;
    minScore: number;
    stopLossPercent: number;
    takeProfitPercent: number;
    useTrailingStop: boolean;
    trailingStopPercent: number;
    // Execution Costs (Realism)
    slippageTicks: number; // Avg ticks lost per trade (volatility adjusted)
    commissionPerLot: number; // $ commission per lot/share
    spreadTicks: number; // Avg spread in ticks
}

// Generate signals from historical data using REAL v8.1 ENGINE
import { StrategyAdapter } from './strategyAdapter';
import { evaluateRealSignals, detectRegime, convertToMarketData } from './realEngine';

function generateBacktestSignals(candles: BacktestCandle[], config: BacktestConfig, symbol: string): BacktestSignal[] {
    const signals: BacktestSignal[] = [];

    // We need enough history for lookback (e.g. 20-50 candles)
    const startIdx = 50;

    for (let i = startIdx; i < candles.length - 1; i++) {
        const currentCandle = candles[i];

        // 1. Prepare Data using Adapter
        const macro = StrategyAdapter.generateMockMacro(candles, i);
        const quote = StrategyAdapter.convertToQuote(currentCandle, symbol);
        const indicators = StrategyAdapter.calculateIndicators(candles, i);

        // 2. Mock full market context (RealEngine expects array of quotes)
        // For backtest we only have focus symbol, so we pass just it
        const quotes = [quote];

        // 3. Convert to MarketData format needed by engine
        // We manually construct it because convertToMarketData calculates its own things,
        // but we want to inject our historical indicators
        const marketDataItem = {
            symbol: quote.displaySymbol,
            price: quote.price,
            change: quote.changePercent,
            rsi: indicators.rsi,
            trend: 50, // Default, will be recalculated if we used convertToMarketData fully
            volatility: 0, // Calculated below
            volume: quote.volume,
            sentiment: 50,
            fractalScore: 50,
            marketState: 'REGULAR',
            assetClass: quote.assetClass,
            atr: indicators.atr,
            calculatedRsi: indicators.rsi
        };

        // Recalculate derived metrics (Trend, Volatility, Fractal) using the Engine's own logic if possible, 
        // OR better: let's use the RealEngine's convertToMarketData but patch in our historical indicators
        // The issue is convertToMarketData assumes 'quote' has current live data.
        // Let's rely on our Adapter's indicators and minimal structure.

        // Calculate Trend/Vol manually for the single asset to pass to evaluate
        const range = currentCandle.high - currentCandle.low;
        const trend = range > 0 ? ((currentCandle.close - currentCandle.low) / range) * 100 : 50;
        const volatility = Math.min(100, (Math.abs(currentCandle.high - currentCandle.low) / currentCandle.close) * 100 * 20);

        marketDataItem.trend = trend;
        marketDataItem.volatility = volatility;

        // 4. Detect Regime (simulated)
        const regimeState = detectRegime(macro);

        // 5. Run Strategy
        // evaluateRealSignals expects arrays
        const realSignals = evaluateRealSignals(
            quotes,
            [marketDataItem],
            macro,
            regimeState.regime,
            config.minScore, // User defined threshold (e.g. 55 or 60)
            currentCandle.timestamp
        );

        // 6. Check if we got a signal
        const realSignal = realSignals.find(s => s.asset === symbol);

        if (realSignal) {
            // Check if signal direction matches our strategy filter if any
            // And push to backtest signals
            signals.push({
                date: currentCandle.date,
                direction: realSignal.direction,
                entryPrice: realSignal.entryZone.high, // Assume filled at top of zone for conservative entry
                stopLoss: realSignal.stopLoss,
                takeProfit: realSignal.takeProfits[0].price, // Target TP1 for backtest consistency
                score: realSignal.score
            });
        }
    }

    return signals;
}

// Execute backtest
export function runBacktest(
    candles: BacktestCandle[],
    config: BacktestConfig,
    symbol: string,
    period: string
): BacktestResult {
    const signals = generateBacktestSignals(candles, config, symbol);
    const trades: BacktestTrade[] = [];
    const equityCurve: { date: string; equity: number; drawdown: number }[] = [];

    let capital = config.initialCapital;
    let peakCapital = capital;
    let maxDrawdown = 0;
    let consecutiveLosses = 0;
    let maxConsecutiveLosses = 0;
    let currentPosition: { signal: BacktestSignal; entryIndex: number } | null = null;

    // Process each candle
    for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];

        // Check if we have an open position
        if (currentPosition) {
            const signal = currentPosition.signal;
            let exitPrice: number | null = null;
            let exitReason: 'TP' | 'SL' | null = null;

            // Check stop loss
            if (signal.direction === 'LONG') {
                if (candle.low <= signal.stopLoss) {
                    exitPrice = signal.stopLoss;
                    exitReason = 'SL';
                } else if (candle.high >= signal.takeProfit) {
                    exitPrice = signal.takeProfit;
                    exitReason = 'TP';
                }
            } else {
                if (candle.high >= signal.stopLoss) {
                    exitPrice = signal.stopLoss;
                    exitReason = 'SL';
                } else if (candle.low <= signal.takeProfit) {
                    exitPrice = signal.takeProfit;
                    exitReason = 'TP';
                }
            }

            // Exit trade with REALISTIC EXECUTION MODEL
            if (exitPrice !== null) {
                // Adjust for Slippage & Spread (Penalty on both entry and exit)
                // Entry Penalty: Buy higher, Sell lower
                const entryPenalty = (config.spreadTicks * 0.0001) + (config.slippageTicks * 0.0001 * (candle.high - candle.low) / candle.close * 100);
                // Simplified volatility impact on slippage

                const adjustedEntryPrice = signal.direction === 'LONG'
                    ? signal.entryPrice + entryPenalty
                    : signal.entryPrice - entryPenalty;

                // Exit Penalty: Sell lower, Buy higher
                const exitPenalty = (config.spreadTicks * 0.0001) + (config.slippageTicks * 0.0001);

                const adjustedExitPrice = signal.direction === 'LONG'
                    ? exitPrice - exitPenalty
                    : exitPrice + exitPenalty;

                // Gross PnL
                let pnlPercent = signal.direction === 'LONG'
                    ? ((adjustedExitPrice - adjustedEntryPrice) / adjustedEntryPrice) * 100
                    : ((adjustedEntryPrice - adjustedExitPrice) / adjustedEntryPrice) * 100;

                // Apply Commission (approx % impact based on price)
                const commissionPercent = (config.commissionPerLot / 100000) * 100; // Assuming 100k standardized lot
                pnlPercent -= commissionPercent * 2; // Round trip

                const riskAmount = Math.abs(signal.entryPrice - signal.stopLoss);
                const pnlR = (adjustedExitPrice - adjustedEntryPrice) / riskAmount * (signal.direction === 'LONG' ? 1 : -1);

                const result: 'WIN' | 'LOSS' | 'BE' =
                    pnlPercent > 0.1 ? 'WIN' : pnlPercent < -0.1 ? 'LOSS' : 'BE';

                trades.push({
                    entryDate: signal.date,
                    exitDate: candle.date,
                    direction: signal.direction,
                    entryPrice: signal.entryPrice,
                    exitPrice,
                    stopLoss: signal.stopLoss,
                    takeProfit: signal.takeProfit,
                    pnlPercent,
                    pnlR,
                    result,
                    holdingDays: i - currentPosition.entryIndex,
                });

                // Update capital
                const positionSize = capital * (config.riskPerTrade / 100);
                capital += positionSize * (pnlPercent / 100);

                // Track consecutive losses
                if (result === 'LOSS') {
                    consecutiveLosses++;
                    maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
                } else {
                    consecutiveLosses = 0;
                }

                currentPosition = null;
            }
        }

        // Look for new entry
        if (!currentPosition) {
            const todaySignal = signals.find(s => s.date === candle.date);
            if (todaySignal) {
                currentPosition = { signal: todaySignal, entryIndex: i };
            }
        }

        // Update equity curve
        if (capital > peakCapital) peakCapital = capital;
        const currentDD = ((peakCapital - capital) / peakCapital) * 100;
        maxDrawdown = Math.max(maxDrawdown, currentDD);

        equityCurve.push({
            date: candle.date,
            equity: capital,
            drawdown: currentDD,
        });
    }

    // Calculate statistics
    const wins = trades.filter(t => t.result === 'WIN');
    const losses = trades.filter(t => t.result === 'LOSS');

    const avgWinPercent = wins.length > 0
        ? wins.reduce((sum, t) => sum + t.pnlPercent, 0) / wins.length
        : 0;
    const avgLossPercent = losses.length > 0
        ? Math.abs(losses.reduce((sum, t) => sum + t.pnlPercent, 0) / losses.length)
        : 0;

    const avgWinR = wins.length > 0
        ? wins.reduce((sum, t) => sum + t.pnlR, 0) / wins.length
        : 0;
    const avgLossR = losses.length > 0
        ? Math.abs(losses.reduce((sum, t) => sum + t.pnlR, 0) / losses.length)
        : 0;

    const totalWinPnl = wins.reduce((sum, t) => sum + t.pnlPercent, 0);
    const totalLossPnl = Math.abs(losses.reduce((sum, t) => sum + t.pnlPercent, 0));

    const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    const profitFactor = totalLossPnl > 0 ? totalWinPnl / totalLossPnl : totalWinPnl > 0 ? Infinity : 0;

    const expectancy = trades.length > 0
        ? (winRate / 100 * avgWinPercent) - ((100 - winRate) / 100 * avgLossPercent)
        : 0;
    const expectancyR = trades.length > 0
        ? (winRate / 100 * avgWinR) - ((100 - winRate) / 100 * avgLossR)
        : 0;

    // Calculate Sharpe and Sortino
    const returns = trades.map(t => t.pnlPercent);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdDev = returns.length > 1
        ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1))
        : 0;
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252 / (returns.length || 1)) : 0;

    const negativeReturns = returns.filter(r => r < 0);
    const downDev = negativeReturns.length > 1
        ? Math.sqrt(negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / (negativeReturns.length - 1))
        : 0;
    const sortinoRatio = downDev > 0 ? (avgReturn / downDev) * Math.sqrt(252 / (returns.length || 1)) : 0;

    // Buy and hold comparison
    const buyAndHoldReturn = candles.length > 1
        ? ((candles[candles.length - 1].close - candles[0].close) / candles[0].close) * 100
        : 0;

    const totalReturn = ((capital - config.initialCapital) / config.initialCapital) * 100;
    const daysInPeriod = candles.length;
    const annualizedReturn = daysInPeriod > 0
        ? (Math.pow(capital / config.initialCapital, 252 / daysInPeriod) - 1) * 100
        : 0;

    return {
        symbol,
        period,
        startDate: candles[0]?.date || '',
        endDate: candles[candles.length - 1]?.date || '',

        totalTrades: trades.length,
        winningTrades: wins.length,
        losingTrades: losses.length,
        winRate,
        avgWinPercent,
        avgLossPercent,
        avgWinR,
        avgLossR,

        profitFactor,
        expectancy,
        expectancyR,
        maxDrawdown,
        maxConsecutiveLosses,
        sharpeRatio,
        sortinoRatio,

        initialCapital: config.initialCapital,
        finalCapital: capital,
        totalReturn,
        annualizedReturn,

        buyAndHoldReturn,
        alpha: totalReturn - buyAndHoldReturn,

        trades,
        equityCurve,
    };
}

// Default config
export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
    initialCapital: 100000,
    riskPerTrade: 1, // 1% per trade
    maxPositions: 1,
    minScore: 50, // Relaxed for demonstration (was 60)
    stopLossPercent: 1.5,
    takeProfitPercent: 3, // 2:1 R:R
    useTrailingStop: false,
    trailingStopPercent: 1.5,
    // Realism Defaults
    slippageTicks: 2,
    commissionPerLot: 2, // $2 per turn
    spreadTicks: 1,
};
