// src/lib/signalTracker.ts
// Sistema de tracking automático de sinais - monitora SL/TP em tempo real

import { recordOutcome, type SignalOutcome } from './continuousLearning';

// ===== TIPOS =====
export interface TrackedSignal {
    id: string;
    asset: string;
    assetClass: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLoss: number;
    takeProfits: { price: number; ratio: string }[];
    score: number;
    components: Record<string, number>;
    enhancedComponents?: Record<string, number>;
    regime: string;
    status: 'ACTIVE' | 'HIT_SL' | 'HIT_TP1' | 'HIT_TP2' | 'HIT_TP3' | 'EXPIRED' | 'CANCELLED';
    currentPrice: number;
    currentPnL: number; // em R múltiplos
    createdAt: number;
    expiresAt: number;
    closedAt?: number;
    closedPrice?: number;
    tpHitLevel?: number;
}

export interface TrackingState {
    signals: TrackedSignal[];
    lastUpdate: number;
    pollInterval: number; // ms
}

// ===== STORAGE KEY =====
const STORAGE_KEY = 'gmpm_tracked_signals';

// ===== INICIALIZAR STATE =====
function initTrackingState(): TrackingState {
    return {
        signals: [],
        lastUpdate: Date.now(),
        pollInterval: 60000, // 1 minuto
    };
}

// ===== LOAD STATE =====
export function loadTrackingState(): TrackingState {
    if (typeof window === 'undefined') return initTrackingState();

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return initTrackingState();

    try {
        return JSON.parse(stored) as TrackingState;
    } catch {
        return initTrackingState();
    }
}

// ===== SAVE STATE =====
export function saveTrackingState(state: TrackingState): void {
    if (typeof window === 'undefined') return;
    state.lastUpdate = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ===== ADD SIGNAL TO TRACKING =====
export function trackSignal(signal: {
    id: string;
    asset: string;
    assetClass: string;
    direction: 'LONG' | 'SHORT';
    price: number;
    stopLoss: number;
    takeProfits: { price: number; ratio: string }[];
    score: number;
    components: Record<string, number>;
    enhancedComponents?: Record<string, number>;
    regime: string;
    validityHours: number;
}): TrackedSignal {
    const state = loadTrackingState();

    const trackedSignal: TrackedSignal = {
        id: signal.id,
        asset: signal.asset,
        assetClass: signal.assetClass,
        direction: signal.direction,
        entryPrice: signal.price,
        stopLoss: signal.stopLoss,
        takeProfits: signal.takeProfits.map(tp => ({ price: tp.price, ratio: tp.ratio })),
        score: signal.score,
        components: signal.components,
        enhancedComponents: signal.enhancedComponents,
        regime: signal.regime,
        status: 'ACTIVE',
        currentPrice: signal.price,
        currentPnL: 0,
        createdAt: Date.now(),
        expiresAt: Date.now() + signal.validityHours * 60 * 60 * 1000,
    };

    // Remove duplicates
    state.signals = state.signals.filter(s => s.id !== signal.id);
    state.signals.push(trackedSignal);

    saveTrackingState(state);
    return trackedSignal;
}

// ===== UPDATE SIGNAL PRICES =====
export async function updateSignalPrices(): Promise<TrackedSignal[]> {
    const state = loadTrackingState();
    const activeSignals = state.signals.filter(s => s.status === 'ACTIVE');

    if (activeSignals.length === 0) return [];

    // Fetch current prices
    const symbols = [...new Set(activeSignals.map(s => s.asset))];
    const priceMap: Record<string, number> = {};

    try {
        const response = await fetch('/api/market');
        if (response.ok) {
            const data = await response.json();
            for (const quote of data.data || []) {
                priceMap[quote.displaySymbol] = quote.price;
            }
        }
    } catch (error) {
        console.error('Failed to fetch prices for tracking:', error);
        return state.signals;
    }

    const now = Date.now();
    const updated: TrackedSignal[] = [];

    // Update each signal
    for (const signal of state.signals) {
        if (signal.status !== 'ACTIVE') {
            updated.push(signal);
            continue;
        }

        const currentPrice = priceMap[signal.asset];
        if (!currentPrice) {
            updated.push(signal);
            continue;
        }

        signal.currentPrice = currentPrice;

        // Calculate PnL in R multiples
        const slDistance = Math.abs(signal.entryPrice - signal.stopLoss);
        const priceDiff = signal.direction === 'LONG'
            ? currentPrice - signal.entryPrice
            : signal.entryPrice - currentPrice;
        signal.currentPnL = slDistance > 0 ? priceDiff / slDistance : 0;

        // Check if expired
        if (now > signal.expiresAt) {
            signal.status = 'EXPIRED';
            signal.closedAt = now;
            signal.closedPrice = currentPrice;

            // Record outcome
            const outcome: SignalOutcome = {
                id: signal.id,
                asset: signal.asset,
                assetClass: signal.assetClass,
                direction: signal.direction,
                score: signal.score,
                components: signal.components,
                enhancedComponents: signal.enhancedComponents,
                regime: signal.regime,
                outcome: signal.currentPnL > 0.5 ? 'WIN' : signal.currentPnL < -0.5 ? 'LOSS' : 'BREAKEVEN',
                pnlR: signal.currentPnL,
                timestamp: signal.createdAt,
                exitTimestamp: now,
            };
            recordOutcome(outcome);
        }
        // Check SL hit
        else if (
            (signal.direction === 'LONG' && currentPrice <= signal.stopLoss) ||
            (signal.direction === 'SHORT' && currentPrice >= signal.stopLoss)
        ) {
            signal.status = 'HIT_SL';
            signal.closedAt = now;
            signal.closedPrice = currentPrice;

            const outcome: SignalOutcome = {
                id: signal.id,
                asset: signal.asset,
                assetClass: signal.assetClass,
                direction: signal.direction,
                score: signal.score,
                components: signal.components,
                enhancedComponents: signal.enhancedComponents,
                regime: signal.regime,
                outcome: 'LOSS',
                pnlR: -1,
                timestamp: signal.createdAt,
                exitTimestamp: now,
            };
            recordOutcome(outcome);
        }
        // Check TP1
        else if (
            (signal.direction === 'LONG' && currentPrice >= signal.takeProfits[0]?.price) ||
            (signal.direction === 'SHORT' && currentPrice <= signal.takeProfits[0]?.price)
        ) {
            // Check TP3 first (highest)
            if (
                signal.takeProfits[2] &&
                ((signal.direction === 'LONG' && currentPrice >= signal.takeProfits[2].price) ||
                    (signal.direction === 'SHORT' && currentPrice <= signal.takeProfits[2].price))
            ) {
                signal.status = 'HIT_TP3';
                signal.tpHitLevel = 3;
                signal.currentPnL = 4;
            }
            // Check TP2
            else if (
                signal.takeProfits[1] &&
                ((signal.direction === 'LONG' && currentPrice >= signal.takeProfits[1].price) ||
                    (signal.direction === 'SHORT' && currentPrice <= signal.takeProfits[1].price))
            ) {
                signal.status = 'HIT_TP2';
                signal.tpHitLevel = 2;
                signal.currentPnL = 2.5;
            }
            // TP1
            else {
                signal.status = 'HIT_TP1';
                signal.tpHitLevel = 1;
                signal.currentPnL = 1.5;
            }

            signal.closedAt = now;
            signal.closedPrice = currentPrice;

            const outcome: SignalOutcome = {
                id: signal.id,
                asset: signal.asset,
                assetClass: signal.assetClass,
                direction: signal.direction,
                score: signal.score,
                components: signal.components,
                enhancedComponents: signal.enhancedComponents,
                regime: signal.regime,
                outcome: 'WIN',
                pnlR: signal.currentPnL,
                timestamp: signal.createdAt,
                exitTimestamp: now,
            };
            recordOutcome(outcome);
        }

        updated.push(signal);
    }

    state.signals = updated;
    saveTrackingState(state);

    return updated;
}

// ===== GET ACTIVE SIGNALS =====
export function getActiveSignals(): TrackedSignal[] {
    const state = loadTrackingState();
    return state.signals.filter(s => s.status === 'ACTIVE');
}

// ===== GET ALL SIGNALS =====
export function getAllTrackedSignals(): TrackedSignal[] {
    const state = loadTrackingState();
    return state.signals.sort((a, b) => b.createdAt - a.createdAt);
}

// ===== CANCEL SIGNAL =====
export function cancelSignal(id: string): void {
    const state = loadTrackingState();
    const signal = state.signals.find(s => s.id === id);
    if (signal && signal.status === 'ACTIVE') {
        signal.status = 'CANCELLED';
        signal.closedAt = Date.now();
        saveTrackingState(state);
    }
}

// ===== CLEAR OLD SIGNALS =====
export function clearOldSignals(daysOld: number = 7): void {
    const state = loadTrackingState();
    const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;
    state.signals = state.signals.filter(s =>
        s.status === 'ACTIVE' || (s.closedAt && s.closedAt > cutoff)
    );
    saveTrackingState(state);
}

// ===== GET TRACKING SUMMARY =====
export interface TrackingSummary {
    activeCount: number;
    closedToday: number;
    avgPnL: number;
    winRate: number;
    totalWins: number;
    totalLosses: number;
    bestTrade: TrackedSignal | null;
    worstTrade: TrackedSignal | null;
}

export function getTrackingSummary(): TrackingSummary {
    const state = loadTrackingState();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();

    const active = state.signals.filter(s => s.status === 'ACTIVE');
    const closedToday = state.signals.filter(s =>
        s.closedAt && s.closedAt >= todayStart && s.status !== 'ACTIVE'
    );
    const closed = state.signals.filter(s => s.status !== 'ACTIVE' && s.status !== 'CANCELLED');

    const wins = closed.filter(s => s.status.startsWith('HIT_TP'));
    const losses = closed.filter(s => s.status === 'HIT_SL');

    const avgPnL = closed.length > 0
        ? closed.reduce((sum, s) => sum + s.currentPnL, 0) / closed.length
        : 0;

    const sorted = [...closed].sort((a, b) => b.currentPnL - a.currentPnL);

    return {
        activeCount: active.length,
        closedToday: closedToday.length,
        avgPnL,
        winRate: closed.length > 0 ? wins.length / closed.length : 0,
        totalWins: wins.length,
        totalLosses: losses.length,
        bestTrade: sorted[0] || null,
        worstTrade: sorted[sorted.length - 1] || null,
    };
}
