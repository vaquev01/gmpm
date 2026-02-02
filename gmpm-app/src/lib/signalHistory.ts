// ===== SIGNAL HISTORY MANAGER =====
// Track historical signals and performance metrics

export interface HistoricalSignal {
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    score: number;
    confidence: string;
    assetType: string;
    sector?: string;

    // Prices
    signalPrice: number;
    entryLow: number;
    entryHigh: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2?: number;

    // Timing
    timestamp: number;
    validityHours: number;

    // Result (filled when signal closes)
    status: 'ACTIVE' | 'WIN' | 'LOSS' | 'EXPIRED' | 'CANCELLED';
    exitPrice?: number;
    exitTimestamp?: number;
    pnlR?: number; // P&L in R multiples
    actualRR?: number;
    notes?: string;
}

export interface PerformanceStats {
    totalSignals: number;
    activeSignals: number;
    completedSignals: number;
    wins: number;
    losses: number;
    expired: number;
    winRate: number; // percentage
    avgWinR: number;
    avgLossR: number;
    avgRR: number;
    totalPnLR: number;
    profitFactor: number;
    expectancy: number;

    // By confidence
    byConfidence: {
        INSTITUTIONAL: { wins: number; total: number; winRate: number };
        STRONG: { wins: number; total: number; winRate: number };
        MODERATE: { wins: number; total: number; winRate: number };
    };

    // By direction
    byDirection: {
        LONG: { wins: number; total: number; winRate: number };
        SHORT: { wins: number; total: number; winRate: number };
    };

    // Recent performance
    last10WinRate: number;
    last30WinRate: number;
}

// Local storage key
const STORAGE_KEY = 'gmpm_signal_history';

// Get signals from localStorage
export function getSignalHistory(): HistoricalSignal[] {
    if (typeof window === 'undefined') return [];

    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

// Save signals to localStorage
function saveSignalHistory(signals: HistoricalSignal[]): void {
    if (typeof window === 'undefined') return;

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(signals));
    } catch (e) {
        console.error('Failed to save signal history:', e);
    }
}

// Add a new signal
export function addSignal(signal: Omit<HistoricalSignal, 'status'>): void {
    const signals = getSignalHistory();

    // Check if signal already exists
    if (signals.some(s => s.id === signal.id)) {
        return;
    }

    signals.unshift({ ...signal, status: 'ACTIVE' });

    // Keep only last 500 signals
    if (signals.length > 500) {
        signals.pop();
    }

    saveSignalHistory(signals);
}

// Update signal status
export function updateSignalStatus(
    id: string,
    status: HistoricalSignal['status'],
    exitPrice?: number,
    notes?: string
): void {
    const signals = getSignalHistory();
    const signal = signals.find(s => s.id === id);

    if (!signal) return;

    signal.status = status;
    signal.exitTimestamp = Date.now();

    if (exitPrice !== undefined) {
        signal.exitPrice = exitPrice;

        // Calculate P&L in R
        const entryAvg = (signal.entryLow + signal.entryHigh) / 2;
        const riskAmount = Math.abs(entryAvg - signal.stopLoss);
        const pnlAmount = signal.direction === 'LONG'
            ? exitPrice - entryAvg
            : entryAvg - exitPrice;

        signal.pnlR = riskAmount > 0 ? pnlAmount / riskAmount : 0;
        signal.actualRR = pnlAmount / riskAmount;
    }

    if (notes) {
        signal.notes = notes;
    }

    saveSignalHistory(signals);
}

// Mark signal as win
export function markAsWin(id: string, exitPrice: number, notes?: string): void {
    updateSignalStatus(id, 'WIN', exitPrice, notes);
}

// Mark signal as loss
export function markAsLoss(id: string, exitPrice: number, notes?: string): void {
    updateSignalStatus(id, 'LOSS', exitPrice, notes);
}

// Mark signal as expired
export function markAsExpired(id: string, notes?: string): void {
    updateSignalStatus(id, 'EXPIRED', undefined, notes);
}

// Calculate performance statistics
export function calculateStats(): PerformanceStats {
    const signals = getSignalHistory();

    const completed = signals.filter(s => ['WIN', 'LOSS', 'EXPIRED'].includes(s.status));
    const wins = completed.filter(s => s.status === 'WIN');
    const losses = completed.filter(s => s.status === 'LOSS');
    const expired = completed.filter(s => s.status === 'EXPIRED');
    const active = signals.filter(s => s.status === 'ACTIVE');

    const totalWinR = wins.reduce((sum, s) => sum + (s.pnlR || 0), 0);
    const totalLossR = Math.abs(losses.reduce((sum, s) => sum + (s.pnlR || 0), 0));

    const avgWinR = wins.length > 0 ? totalWinR / wins.length : 0;
    const avgLossR = losses.length > 0 ? totalLossR / losses.length : 0;

    const winRate = completed.length > 0 ? (wins.length / completed.length) * 100 : 0;
    const profitFactor = totalLossR > 0 ? totalWinR / totalLossR : totalWinR > 0 ? Infinity : 0;
    const expectancy = completed.length > 0
        ? (winRate / 100 * avgWinR) - ((100 - winRate) / 100 * avgLossR)
        : 0;

    // By confidence
    const byConfidence = {
        INSTITUTIONAL: calculateWinRateForGroup(completed.filter(s => s.confidence === 'INSTITUTIONAL')),
        STRONG: calculateWinRateForGroup(completed.filter(s => s.confidence === 'STRONG')),
        MODERATE: calculateWinRateForGroup(completed.filter(s => s.confidence === 'MODERATE')),
    };

    // By direction
    const byDirection = {
        LONG: calculateWinRateForGroup(completed.filter(s => s.direction === 'LONG')),
        SHORT: calculateWinRateForGroup(completed.filter(s => s.direction === 'SHORT')),
    };

    // Recent performance
    const last10 = completed.slice(0, 10);
    const last30 = completed.slice(0, 30);
    const last10WinRate = last10.length > 0
        ? (last10.filter(s => s.status === 'WIN').length / last10.length) * 100
        : 0;
    const last30WinRate = last30.length > 0
        ? (last30.filter(s => s.status === 'WIN').length / last30.length) * 100
        : 0;

    return {
        totalSignals: signals.length,
        activeSignals: active.length,
        completedSignals: completed.length,
        wins: wins.length,
        losses: losses.length,
        expired: expired.length,
        winRate,
        avgWinR,
        avgLossR,
        avgRR: avgLossR > 0 ? avgWinR / avgLossR : 0,
        totalPnLR: totalWinR - totalLossR,
        profitFactor,
        expectancy,
        byConfidence,
        byDirection,
        last10WinRate,
        last30WinRate,
    };
}

function calculateWinRateForGroup(group: HistoricalSignal[]): { wins: number; total: number; winRate: number } {
    const wins = group.filter(s => s.status === 'WIN').length;
    return {
        wins,
        total: group.length,
        winRate: group.length > 0 ? (wins / group.length) * 100 : 0,
    };
}

// Delete a signal
export function deleteSignal(id: string): void {
    const signals = getSignalHistory();
    const filtered = signals.filter(s => s.id !== id);
    saveSignalHistory(filtered);
}

// Clear all history
export function clearHistory(): void {
    saveSignalHistory([]);
}

// Export history as JSON
export function exportHistory(): string {
    const signals = getSignalHistory();
    const stats = calculateStats();

    return JSON.stringify({
        exportDate: new Date().toISOString(),
        stats,
        signals,
    }, null, 2);
}

// Check for expired signals
export function checkExpiredSignals(): void {
    const signals = getSignalHistory();
    const now = Date.now();
    let changed = false;

    signals.forEach(signal => {
        if (signal.status === 'ACTIVE') {
            const expiryTime = signal.timestamp + (signal.validityHours * 60 * 60 * 1000);
            if (now > expiryTime) {
                signal.status = 'EXPIRED';
                signal.exitTimestamp = expiryTime;
                changed = true;
            }
        }
    });

    if (changed) {
        saveSignalHistory(signals);
    }
}
