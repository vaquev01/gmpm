// src/lib/serverStore.ts
// Server-side persistent store using JSON files
// Replaces localStorage for data that needs to be accessed by API routes

import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.data');

function ensureDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function filePath(collection: string): string {
    return path.join(DATA_DIR, `${collection}.json`);
}

// ===== GENERIC CRUD =====

export function readCollection<T>(collection: string): T[] {
    ensureDir();
    const fp = filePath(collection);
    if (!fs.existsSync(fp)) return [];
    try {
        const raw = fs.readFileSync(fp, 'utf-8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function writeCollection<T>(collection: string, data: T[]): void {
    ensureDir();
    fs.writeFileSync(filePath(collection), JSON.stringify(data, null, 2), 'utf-8');
}

export function readSingleton<T>(collection: string, fallback: T): T {
    ensureDir();
    const fp = filePath(collection);
    if (!fs.existsSync(fp)) return fallback;
    try {
        const raw = fs.readFileSync(fp, 'utf-8');
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

export function writeSingleton<T>(collection: string, data: T): void {
    ensureDir();
    fs.writeFileSync(filePath(collection), JSON.stringify(data, null, 2), 'utf-8');
}

// ===== SIGNAL TYPES =====

export interface PersistedSignal {
    id: string;
    asset: string;
    assetClass: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLoss: number;
    takeProfits: { price: number; ratio: string }[];
    score: number;
    tier: string;
    components: Record<string, number>;
    enhancedComponents?: Record<string, number>;
    regime: string;
    regimeType?: string;
    gates?: { gate: string; status: string; reasons: string[] }[];
    gatesAllPass?: boolean;
    status: 'ACTIVE' | 'HIT_SL' | 'HIT_TP1' | 'HIT_TP2' | 'HIT_TP3' | 'EXPIRED' | 'CANCELLED';
    currentPrice: number;
    currentPnL: number;
    createdAt: number;
    expiresAt: number;
    closedAt?: number;
    closedPrice?: number;
    tpHitLevel?: number;
    cancelReason?: string;
    telegramSent?: boolean;
}

export interface TradeOutcome {
    id: string;
    signalId: string;
    asset: string;
    assetClass: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    exitPrice: number;
    stopLoss: number;
    score: number;
    tier: string;
    regime: string;
    regimeType?: string;
    components: Record<string, number>;
    outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
    pnlR: number;
    pnlPercent: number;
    riskPercent: number;
    holdTimeMs: number;
    entryTimestamp: number;
    exitTimestamp: number;
    exitReason: string;
    gatesAllPass?: boolean;
    sessionQuality?: string;
}

export interface LearningWeights {
    version: number;
    lastUpdated: number;
    totalOutcomes: number;
    totalWins: number;
    totalLosses: number;
    optimizedWeights: Record<string, number>;
    regimeAdjustments: Record<string, Record<string, number>>;
    assetClassAdjustments: Record<string, Record<string, number>>;
    confidence: number;
    learningRate: number;
}

// ===== SIGNAL STORE =====

const SIGNALS_COLLECTION = 'signals';
const OUTCOMES_COLLECTION = 'outcomes';
const LEARNING_COLLECTION = 'learning';
const AUDIT_COLLECTION = 'audit';

export function getSignals(): PersistedSignal[] {
    return readCollection<PersistedSignal>(SIGNALS_COLLECTION);
}

export function getActiveSignals(): PersistedSignal[] {
    return getSignals().filter(s => s.status === 'ACTIVE');
}

export function saveSignal(signal: PersistedSignal): void {
    const signals = getSignals();
    const idx = signals.findIndex(s => s.id === signal.id);
    if (idx >= 0) {
        signals[idx] = signal;
    } else {
        signals.push(signal);
    }
    // Keep last 500 signals max
    const trimmed = signals.slice(-500);
    writeCollection(SIGNALS_COLLECTION, trimmed);
}

export function updateSignal(id: string, patch: Partial<PersistedSignal>): PersistedSignal | null {
    const signals = getSignals();
    const idx = signals.findIndex(s => s.id === id);
    if (idx < 0) return null;
    signals[idx] = { ...signals[idx], ...patch };
    writeCollection(SIGNALS_COLLECTION, signals);
    return signals[idx];
}

export function bulkUpdateSignals(updates: { id: string; patch: Partial<PersistedSignal> }[]): void {
    const signals = getSignals();
    for (const { id, patch } of updates) {
        const idx = signals.findIndex(s => s.id === id);
        if (idx >= 0) {
            signals[idx] = { ...signals[idx], ...patch };
        }
    }
    writeCollection(SIGNALS_COLLECTION, signals);
}

// ===== OUTCOME STORE =====

export function getOutcomes(): TradeOutcome[] {
    return readCollection<TradeOutcome>(OUTCOMES_COLLECTION);
}

export function addOutcome(outcome: TradeOutcome): void {
    const outcomes = getOutcomes();
    outcomes.push(outcome);
    // Keep last 1000 outcomes
    const trimmed = outcomes.slice(-1000);
    writeCollection(OUTCOMES_COLLECTION, trimmed);
}

export function getOutcomeStats() {
    const outcomes = getOutcomes();
    if (outcomes.length === 0) {
        return {
            total: 0,
            wins: 0,
            losses: 0,
            breakeven: 0,
            winRate: 0,
            avgPnlR: 0,
            avgWinR: 0,
            avgLossR: 0,
            profitFactor: 0,
            expectancy: 0,
            maxConsecutiveLosses: 0,
            byRegime: {} as Record<string, { total: number; wins: number; winRate: number; avgPnlR: number }>,
            byAssetClass: {} as Record<string, { total: number; wins: number; winRate: number; avgPnlR: number }>,
        };
    }

    const wins = outcomes.filter(o => o.outcome === 'WIN');
    const losses = outcomes.filter(o => o.outcome === 'LOSS');
    const avgWinR = wins.length > 0 ? wins.reduce((s, o) => s + o.pnlR, 0) / wins.length : 0;
    const avgLossR = losses.length > 0 ? Math.abs(losses.reduce((s, o) => s + o.pnlR, 0) / losses.length) : 0;
    const totalPnlR = outcomes.reduce((s, o) => s + o.pnlR, 0);

    // Max consecutive losses
    let maxConsec = 0;
    let curConsec = 0;
    for (const o of outcomes) {
        if (o.outcome === 'LOSS') { curConsec++; maxConsec = Math.max(maxConsec, curConsec); }
        else { curConsec = 0; }
    }

    // Group by regime
    const byRegime: Record<string, { total: number; wins: number; winRate: number; avgPnlR: number }> = {};
    for (const o of outcomes) {
        const key = o.regimeType || o.regime || 'UNKNOWN';
        if (!byRegime[key]) byRegime[key] = { total: 0, wins: 0, winRate: 0, avgPnlR: 0 };
        byRegime[key].total++;
        if (o.outcome === 'WIN') byRegime[key].wins++;
    }
    for (const key of Object.keys(byRegime)) {
        const g = byRegime[key];
        g.winRate = g.total > 0 ? (g.wins / g.total) * 100 : 0;
        g.avgPnlR = outcomes.filter(o => (o.regimeType || o.regime) === key).reduce((s, o) => s + o.pnlR, 0) / g.total;
    }

    // Group by asset class
    const byAssetClass: Record<string, { total: number; wins: number; winRate: number; avgPnlR: number }> = {};
    for (const o of outcomes) {
        const key = o.assetClass || 'UNKNOWN';
        if (!byAssetClass[key]) byAssetClass[key] = { total: 0, wins: 0, winRate: 0, avgPnlR: 0 };
        byAssetClass[key].total++;
        if (o.outcome === 'WIN') byAssetClass[key].wins++;
    }
    for (const key of Object.keys(byAssetClass)) {
        const g = byAssetClass[key];
        g.winRate = g.total > 0 ? (g.wins / g.total) * 100 : 0;
        g.avgPnlR = outcomes.filter(o => o.assetClass === key).reduce((s, o) => s + o.pnlR, 0) / g.total;
    }

    return {
        total: outcomes.length,
        wins: wins.length,
        losses: losses.length,
        breakeven: outcomes.filter(o => o.outcome === 'BREAKEVEN').length,
        winRate: (wins.length / outcomes.length) * 100,
        avgPnlR: totalPnlR / outcomes.length,
        avgWinR,
        avgLossR,
        profitFactor: avgLossR > 0 ? (avgWinR * wins.length) / (avgLossR * losses.length) : 0,
        expectancy: totalPnlR / outcomes.length,
        maxConsecutiveLosses: maxConsec,
        byRegime,
        byAssetClass,
    };
}

// ===== LEARNING STORE =====

const DEFAULT_LEARNING: LearningWeights = {
    version: 1,
    lastUpdated: 0,
    totalOutcomes: 0,
    totalWins: 0,
    totalLosses: 0,
    optimizedWeights: {},
    regimeAdjustments: {},
    assetClassAdjustments: {},
    confidence: 0,
    learningRate: 0.05,
};

export function getLearningWeights(): LearningWeights {
    return readSingleton(LEARNING_COLLECTION, DEFAULT_LEARNING);
}

export function saveLearningWeights(weights: LearningWeights): void {
    writeSingleton(LEARNING_COLLECTION, weights);
}

// ===== AUDIT LOG =====

export interface AuditEntry {
    id: string;
    timestamp: number;
    action: string;
    signalId?: string;
    details: Record<string, unknown>;
}

export function addAuditEntry(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
    const entries = readCollection<AuditEntry>(AUDIT_COLLECTION);
    entries.push({
        ...entry,
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
    });
    // Keep last 2000 audit entries
    const trimmed = entries.slice(-2000);
    writeCollection(AUDIT_COLLECTION, trimmed);
}

export function getAuditEntries(limit = 100): AuditEntry[] {
    return readCollection<AuditEntry>(AUDIT_COLLECTION).slice(-limit);
}

// ===== TRADE HISTORY FOR RISK API =====
// Returns real trade data formatted for the risk calculations

export function getRealTradesForRisk(): { pnl: number; risk: number; date: string }[] {
    const outcomes = getOutcomes();
    return outcomes.map(o => ({
        pnl: o.pnlR * o.riskPercent,
        risk: o.riskPercent,
        date: new Date(o.exitTimestamp).toISOString(),
    }));
}

export function getRealEquityCurve(initialEquity = 100000): { date: string; equity: number }[] {
    const outcomes = getOutcomes().sort((a, b) => a.exitTimestamp - b.exitTimestamp);
    const curve: { date: string; equity: number }[] = [];
    let equity = initialEquity;

    for (const o of outcomes) {
        equity += (o.pnlR * o.riskPercent / 100) * equity;
        curve.push({
            date: new Date(o.exitTimestamp).toISOString(),
            equity: Math.round(equity * 100) / 100,
        });
    }

    return curve;
}
