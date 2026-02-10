// src/app/api/signals/route.ts
// CRUD API for persistent signal tracking

import { NextResponse } from 'next/server';
import {
    getSignals,
    getActiveSignals,
    saveSignal,
    updateSignal,
    bulkUpdateSignals,
    addOutcome,
    getOutcomes,
    getOutcomeStats,
    addAuditEntry,
    getAuditEntries,
    type PersistedSignal,
    type TradeOutcome,
} from '@/lib/serverStore';

export const dynamic = 'force-dynamic';

// GET /api/signals — list signals
// ?status=ACTIVE — filter by status
// ?stats=1 — include outcome stats
// ?audit=1&limit=50 — get audit log
export async function GET(request: Request) {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const wantStats = url.searchParams.get('stats') === '1';
    const wantAudit = url.searchParams.get('audit') === '1';
    const wantOutcomes = url.searchParams.get('outcomes') === '1';
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);

    if (wantAudit) {
        return NextResponse.json({
            success: true,
            entries: getAuditEntries(limit),
        });
    }

    if (wantOutcomes) {
        return NextResponse.json({
            success: true,
            outcomes: getOutcomes().slice(-limit),
            stats: getOutcomeStats(),
        });
    }

    let signals: PersistedSignal[];
    if (status === 'ACTIVE') {
        signals = getActiveSignals();
    } else if (status) {
        signals = getSignals().filter(s => s.status === status);
    } else {
        signals = getSignals().slice(-limit);
    }

    const response: Record<string, unknown> = {
        success: true,
        count: signals.length,
        signals,
    };

    if (wantStats) {
        response.stats = getOutcomeStats();
    }

    return NextResponse.json(response);
}

// POST /api/signals — create or update a signal
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action } = body;

        if (action === 'track') {
            // Track a new signal
            const signal = body.signal as PersistedSignal;
            if (!signal?.id || !signal?.asset) {
                return NextResponse.json({ success: false, error: 'Missing signal.id or signal.asset' }, { status: 400 });
            }
            saveSignal(signal);
            addAuditEntry({
                action: 'SIGNAL_TRACKED',
                signalId: signal.id,
                details: {
                    asset: signal.asset,
                    direction: signal.direction,
                    score: signal.score,
                    tier: signal.tier,
                    regime: signal.regime,
                    gatesAllPass: signal.gatesAllPass,
                },
            });
            return NextResponse.json({ success: true, signal });
        }

        if (action === 'update') {
            // Update existing signal
            const { id, patch } = body;
            if (!id) {
                return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });
            }
            const updated = updateSignal(id, patch);
            if (!updated) {
                return NextResponse.json({ success: false, error: 'Signal not found' }, { status: 404 });
            }
            return NextResponse.json({ success: true, signal: updated });
        }

        if (action === 'close') {
            // Close signal and record outcome
            const { id, exitPrice, exitReason } = body;
            if (!id) {
                return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });
            }
            const signals = getSignals();
            const signal = signals.find(s => s.id === id);
            if (!signal) {
                return NextResponse.json({ success: false, error: 'Signal not found' }, { status: 404 });
            }

            const now = Date.now();
            const slDistance = Math.abs(signal.entryPrice - signal.stopLoss);
            const priceDiff = signal.direction === 'LONG'
                ? (exitPrice - signal.entryPrice)
                : (signal.entryPrice - exitPrice);
            const pnlR = slDistance > 0 ? priceDiff / slDistance : 0;
            const outcome: 'WIN' | 'LOSS' | 'BREAKEVEN' =
                pnlR > 0.1 ? 'WIN' : pnlR < -0.1 ? 'LOSS' : 'BREAKEVEN';

            const newStatus = exitReason === 'HIT_SL' ? 'HIT_SL' as const
                : exitReason === 'HIT_TP1' ? 'HIT_TP1' as const
                : exitReason === 'HIT_TP2' ? 'HIT_TP2' as const
                : exitReason === 'HIT_TP3' ? 'HIT_TP3' as const
                : exitReason === 'EXPIRED' ? 'EXPIRED' as const
                : 'CANCELLED' as const;

            updateSignal(id, {
                status: newStatus,
                closedAt: now,
                closedPrice: exitPrice,
                currentPrice: exitPrice,
                currentPnL: pnlR,
            });

            const tradeOutcome: TradeOutcome = {
                id: `outcome-${now}-${Math.random().toString(36).slice(2, 8)}`,
                signalId: signal.id,
                asset: signal.asset,
                assetClass: signal.assetClass,
                direction: signal.direction,
                entryPrice: signal.entryPrice,
                exitPrice,
                stopLoss: signal.stopLoss,
                score: signal.score,
                tier: signal.tier,
                regime: signal.regime,
                regimeType: signal.regimeType,
                components: signal.components,
                outcome,
                pnlR,
                pnlPercent: (priceDiff / signal.entryPrice) * 100,
                riskPercent: signal.components?.riskPercent ?? 1.5,
                holdTimeMs: now - signal.createdAt,
                entryTimestamp: signal.createdAt,
                exitTimestamp: now,
                exitReason: exitReason || newStatus,
                gatesAllPass: signal.gatesAllPass,
            };

            addOutcome(tradeOutcome);

            addAuditEntry({
                action: 'SIGNAL_CLOSED',
                signalId: signal.id,
                details: {
                    asset: signal.asset,
                    outcome,
                    pnlR: Math.round(pnlR * 100) / 100,
                    exitReason,
                    holdTimeMs: tradeOutcome.holdTimeMs,
                },
            });

            return NextResponse.json({ success: true, outcome: tradeOutcome });
        }

        if (action === 'bulk_update_prices') {
            // Update prices for all active signals
            const { prices } = body as { prices: Record<string, number> };
            if (!prices || typeof prices !== 'object') {
                return NextResponse.json({ success: false, error: 'Missing prices map' }, { status: 400 });
            }

            const active = getActiveSignals();
            const now = Date.now();
            const closedSignals: { signal: PersistedSignal; reason: string; exitPrice: number }[] = [];
            const updates: { id: string; patch: Partial<PersistedSignal> }[] = [];

            for (const signal of active) {
                const price = prices[signal.asset];
                if (!price) continue;

                const slDistance = Math.abs(signal.entryPrice - signal.stopLoss);
                const priceDiff = signal.direction === 'LONG'
                    ? (price - signal.entryPrice)
                    : (signal.entryPrice - price);
                const pnlR = slDistance > 0 ? priceDiff / slDistance : 0;

                // Check SL hit
                const slHit = signal.direction === 'LONG'
                    ? price <= signal.stopLoss
                    : price >= signal.stopLoss;

                // Check TP hits (check highest first)
                let tpHit: string | null = null;
                const tps = signal.takeProfits || [];
                for (let i = tps.length - 1; i >= 0; i--) {
                    const tp = tps[i];
                    const hit = signal.direction === 'LONG'
                        ? price >= tp.price
                        : price <= tp.price;
                    if (hit) {
                        tpHit = `HIT_TP${i + 1}`;
                        break;
                    }
                }

                // Check expiry
                const expired = now > signal.expiresAt;

                if (slHit) {
                    closedSignals.push({ signal, reason: 'HIT_SL', exitPrice: signal.stopLoss });
                    updates.push({ id: signal.id, patch: { status: 'HIT_SL', closedAt: now, closedPrice: signal.stopLoss, currentPrice: price, currentPnL: pnlR } });
                } else if (tpHit) {
                    const status = tpHit as PersistedSignal['status'];
                    closedSignals.push({ signal, reason: tpHit, exitPrice: price });
                    updates.push({ id: signal.id, patch: { status, closedAt: now, closedPrice: price, currentPrice: price, currentPnL: pnlR } });
                } else if (expired) {
                    closedSignals.push({ signal, reason: 'EXPIRED', exitPrice: price });
                    updates.push({ id: signal.id, patch: { status: 'EXPIRED', closedAt: now, closedPrice: price, currentPrice: price, currentPnL: pnlR } });
                } else {
                    updates.push({ id: signal.id, patch: { currentPrice: price, currentPnL: pnlR } });
                }
            }

            if (updates.length > 0) {
                bulkUpdateSignals(updates);
            }

            // Record outcomes for closed signals
            for (const { signal, reason, exitPrice } of closedSignals) {
                const slDistance = Math.abs(signal.entryPrice - signal.stopLoss);
                const priceDiff = signal.direction === 'LONG'
                    ? (exitPrice - signal.entryPrice)
                    : (signal.entryPrice - exitPrice);
                const pnlR = slDistance > 0 ? priceDiff / slDistance : 0;
                const outcome: 'WIN' | 'LOSS' | 'BREAKEVEN' =
                    pnlR > 0.1 ? 'WIN' : pnlR < -0.1 ? 'LOSS' : 'BREAKEVEN';

                addOutcome({
                    id: `outcome-${now}-${Math.random().toString(36).slice(2, 8)}`,
                    signalId: signal.id,
                    asset: signal.asset,
                    assetClass: signal.assetClass,
                    direction: signal.direction,
                    entryPrice: signal.entryPrice,
                    exitPrice,
                    stopLoss: signal.stopLoss,
                    score: signal.score,
                    tier: signal.tier,
                    regime: signal.regime,
                    regimeType: signal.regimeType,
                    components: signal.components,
                    outcome,
                    pnlR,
                    pnlPercent: (priceDiff / signal.entryPrice) * 100,
                    riskPercent: signal.components?.riskPercent ?? 1.5,
                    holdTimeMs: now - signal.createdAt,
                    entryTimestamp: signal.createdAt,
                    exitTimestamp: now,
                    exitReason: reason,
                    gatesAllPass: signal.gatesAllPass,
                });

                addAuditEntry({
                    action: 'SIGNAL_AUTO_CLOSED',
                    signalId: signal.id,
                    details: { asset: signal.asset, outcome, pnlR: Math.round(pnlR * 100) / 100, reason },
                });
            }

            return NextResponse.json({
                success: true,
                updated: updates.length,
                closed: closedSignals.length,
                closedDetails: closedSignals.map(c => ({
                    id: c.signal.id,
                    asset: c.signal.asset,
                    reason: c.reason,
                })),
            });
        }

        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
