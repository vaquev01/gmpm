'use client';

// src/lib/signalBridge.ts
// Client-side bridge: mirrors signal tracking to the server-side persistent store
// This runs ALONGSIDE the existing localStorage-based signalTracker.ts
// so the UI stays fast while the server has a durable copy.

export interface ServerSignalInput {
    id: string;
    asset: string;
    assetClass: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLoss: number;
    takeProfits: { price: number; ratio: string }[];
    score: number;
    tier?: string;
    components: Record<string, number>;
    enhancedComponents?: Record<string, number>;
    regime: string;
    regimeType?: string;
    gates?: { gate: string; status: string; reasons: string[] }[];
    gatesAllPass?: boolean;
    validityHours: number;
}

// Track a signal on the server (non-blocking, fire-and-forget)
export function serverTrackSignal(input: ServerSignalInput): void {
    const now = Date.now();
    const body = {
        action: 'track',
        signal: {
            id: input.id,
            asset: input.asset,
            assetClass: input.assetClass,
            direction: input.direction,
            entryPrice: input.entryPrice,
            stopLoss: input.stopLoss,
            takeProfits: input.takeProfits,
            score: input.score,
            tier: input.tier || (input.score >= 85 ? 'A' : input.score >= 70 ? 'B' : input.score >= 55 ? 'C' : 'D'),
            components: input.components,
            enhancedComponents: input.enhancedComponents,
            regime: input.regime,
            regimeType: input.regimeType,
            gates: input.gates,
            gatesAllPass: input.gatesAllPass,
            status: 'ACTIVE' as const,
            currentPrice: input.entryPrice,
            currentPnL: 0,
            createdAt: now,
            expiresAt: now + input.validityHours * 3600000,
            telegramSent: false,
        },
    };

    fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }).catch((e) => console.warn('[signalBridge] track failed:', e));
}

// Close a signal on the server (non-blocking)
export function serverCloseSignal(id: string, exitPrice: number, exitReason: string): void {
    fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', id, exitPrice, exitReason }),
    }).catch((e) => console.warn('[signalBridge] close failed:', e));
}

// Bulk update prices on the server — call from the polling loop
export function serverUpdatePrices(prices: Record<string, number>): void {
    fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_update_prices', prices }),
    }).catch((e) => console.warn('[signalBridge] bulk_update failed:', e));
}

// Fetch server-side tracking summary
export async function fetchServerSignals(): Promise<{
    success: boolean;
    signals: unknown[];
    stats?: unknown;
}> {
    try {
        const res = await fetch('/api/signals?status=ACTIVE&stats=1');
        return await res.json();
    } catch {
        return { success: false, signals: [] };
    }
}

// Trigger the server-side monitor (call periodically)
export function triggerServerMonitor(scan = false): void {
    const url = scan ? '/api/monitor?scan=1' : '/api/monitor';
    fetch(url).catch((e) => console.warn('[signalBridge] monitor failed:', e));
}
