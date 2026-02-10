// src/app/api/monitor/route.ts
// Server-side signal monitor — call periodically (e.g. every 30s) to:
// 1. Fetch current prices for all active signals
// 2. Check SL/TP/expiry hits
// 3. Send Telegram alerts for closures
// 4. Optionally scan for new Tier A/B opportunities

import { NextResponse } from 'next/server';
import { serverLog } from '@/lib/serverLogs';
import {
    getActiveSignals,
    bulkUpdateSignals,
    addOutcome,
    addAuditEntry,
    type PersistedSignal,
    type TradeOutcome,
} from '@/lib/serverStore';
import {
    sendTelegramAlert,
    formatCloseAlert,
    formatSignalAlert,
    isTelegramConfigured,
    type SignalAlertData,
} from '@/lib/telegramAlert';

export const dynamic = 'force-dynamic';

// Prevent concurrent monitor runs
let isRunning = false;
let lastRunTimestamp = 0;

// GET /api/monitor — run one monitoring cycle
// ?scan=1 — also scan for new opportunities and alert Tier A/B
export async function GET(request: Request) {
    if (isRunning) {
        return NextResponse.json({ success: true, skipped: true, reason: 'already_running' });
    }

    isRunning = true;
    const startTime = Date.now();

    try {
        const url = new URL(request.url);
        const wantScan = url.searchParams.get('scan') === '1';
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

        // 1. Get active signals
        const active = getActiveSignals();
        if (active.length === 0 && !wantScan) {
            lastRunTimestamp = Date.now();
            return NextResponse.json({
                success: true,
                activeSignals: 0,
                updated: 0,
                closed: 0,
                telegramConfigured: isTelegramConfigured(),
                duration: Date.now() - startTime,
            });
        }

        // 2. Fetch current market prices
        const prices: Record<string, number> = {};
        if (active.length > 0) {
            try {
                const res = await fetch(`${baseUrl}/api/market?limit=300&macro=0`, {
                    cache: 'no-store',
                    signal: AbortSignal.timeout(15000),
                });
                if (res.ok) {
                    const data = await res.json();
                    const assets = data.assets || data.data || [];
                    for (const a of assets) {
                        if (a.symbol && typeof a.price === 'number' && a.price > 0) {
                            prices[a.symbol] = a.price;
                            // Also key by displaySymbol since signals use displaySymbol as asset id
                            if (a.displaySymbol && a.displaySymbol !== a.symbol) {
                                prices[a.displaySymbol] = a.price;
                            }
                        }
                    }
                }
            } catch (e) {
                serverLog('warn', 'monitor_price_fetch_failed', { error: String(e) }, 'api/monitor');
            }
        }

        // 3. Process active signals
        const now = Date.now();
        const closedSignals: { signal: PersistedSignal; reason: string; exitPrice: number; pnlR: number }[] = [];
        const updates: { id: string; patch: Partial<PersistedSignal> }[] = [];

        for (const signal of active) {
            const price = prices[signal.asset];
            if (!price) continue;

            const slDistance = Math.abs(signal.entryPrice - signal.stopLoss);
            const priceDiff = signal.direction === 'LONG'
                ? (price - signal.entryPrice)
                : (signal.entryPrice - price);
            const pnlR = slDistance > 0 ? priceDiff / slDistance : 0;

            const slHit = signal.direction === 'LONG'
                ? price <= signal.stopLoss
                : price >= signal.stopLoss;

            let tpHit: string | null = null;
            const tps = signal.takeProfits || [];
            for (let i = tps.length - 1; i >= 0; i--) {
                const hit = signal.direction === 'LONG'
                    ? price >= tps[i].price
                    : price <= tps[i].price;
                if (hit) { tpHit = `HIT_TP${i + 1}`; break; }
            }

            const expired = now > signal.expiresAt;

            if (slHit) {
                const ep = signal.stopLoss;
                const slPnlR = signal.direction === 'LONG'
                    ? (ep - signal.entryPrice) / slDistance
                    : (signal.entryPrice - ep) / slDistance;
                closedSignals.push({ signal, reason: 'HIT_SL', exitPrice: ep, pnlR: slPnlR });
                updates.push({ id: signal.id, patch: { status: 'HIT_SL', closedAt: now, closedPrice: ep, currentPrice: price, currentPnL: slPnlR } });
            } else if (tpHit) {
                closedSignals.push({ signal, reason: tpHit, exitPrice: price, pnlR });
                updates.push({ id: signal.id, patch: { status: tpHit as PersistedSignal['status'], closedAt: now, closedPrice: price, currentPrice: price, currentPnL: pnlR } });
            } else if (expired) {
                closedSignals.push({ signal, reason: 'EXPIRED', exitPrice: price, pnlR });
                updates.push({ id: signal.id, patch: { status: 'EXPIRED', closedAt: now, closedPrice: price, currentPrice: price, currentPnL: pnlR } });
            } else {
                updates.push({ id: signal.id, patch: { currentPrice: price, currentPnL: pnlR } });
            }
        }

        if (updates.length > 0) {
            bulkUpdateSignals(updates);
        }

        // 4. Record outcomes & send Telegram alerts for closed signals
        for (const { signal, reason, exitPrice, pnlR } of closedSignals) {
            const priceDiff = signal.direction === 'LONG'
                ? (exitPrice - signal.entryPrice)
                : (signal.entryPrice - exitPrice);
            const outcome: 'WIN' | 'LOSS' | 'BREAKEVEN' =
                pnlR > 0.1 ? 'WIN' : pnlR < -0.1 ? 'LOSS' : 'BREAKEVEN';

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
                exitReason: reason,
                gatesAllPass: signal.gatesAllPass,
            };

            addOutcome(tradeOutcome);

            addAuditEntry({
                action: 'MONITOR_CLOSED_SIGNAL',
                signalId: signal.id,
                details: { asset: signal.asset, outcome, pnlR: Math.round(pnlR * 100) / 100, reason },
            });

            // Telegram alert for closed signals
            if (isTelegramConfigured()) {
                const msg = formatCloseAlert(signal.asset, signal.direction, reason, pnlR);
                await sendTelegramAlert(msg).catch(() => { /* non-blocking */ });
            }
        }

        // 5. Optionally scan for new Tier A/B opportunities
        const newOpportunities: { asset: string; tier: string; score: number }[] = [];
        if (wantScan) {
            try {
                const decRes = await fetch(`${baseUrl}/api/decision-engine`, {
                    cache: 'no-store',
                    signal: AbortSignal.timeout(30000),
                });
                if (decRes.ok) {
                    const decData = await decRes.json();
                    const decisions = decData.decisions || [];
                    const tierAB = decisions.filter((d: { tier: string; score: number }) =>
                        (d.tier === 'A' || d.tier === 'B') && d.score >= 70
                    );

                    // Only alert for new ones (not already tracked)
                    const activeSymbols = new Set(active.map(s => s.asset));
                    const novel = tierAB.filter((d: { asset: string }) => !activeSymbols.has(d.asset));

                    for (const d of novel.slice(0, 3)) {
                        newOpportunities.push({ asset: d.asset, tier: d.tier, score: d.score });

                        if (isTelegramConfigured() && d.tradePlan) {
                            const alertData: SignalAlertData = {
                                asset: d.asset,
                                direction: d.direction || 'LONG',
                                tier: d.tier,
                                score: d.score,
                                regime: d.regime?.type || 'UNKNOWN',
                                entry: d.tradePlan?.entry?.price || 0,
                                stopLoss: d.tradePlan?.stopLoss?.price || 0,
                                tp1: d.tradePlan?.targets?.tp1 || 0,
                                tp2: d.tradePlan?.targets?.tp2,
                                tp3: d.tradePlan?.targets?.tp3,
                                rr: d.tradePlan?.riskReward || 0,
                                drivers: (d.evidence?.supporting || []).map((e: { factor: string }) => e.factor).slice(0, 5),
                                warnings: (d.warnings || []).slice(0, 3),
                                riskPercent: d.tradePlan?.positionSize?.final,
                            };
                            const msg = formatSignalAlert(alertData);
                            await sendTelegramAlert(msg).catch(() => { /* non-blocking */ });
                        }
                    }
                }
            } catch (e) {
                serverLog('warn', 'monitor_scan_failed', { error: String(e) }, 'api/monitor');
            }
        }

        lastRunTimestamp = Date.now();

        serverLog('info', 'monitor_cycle_complete', {
            activeSignals: active.length,
            updated: updates.length,
            closed: closedSignals.length,
            newOpportunities: newOpportunities.length,
            duration: Date.now() - startTime,
        }, 'api/monitor');

        return NextResponse.json({
            success: true,
            activeSignals: active.length,
            updated: updates.length,
            closed: closedSignals.length,
            closedDetails: closedSignals.map(c => ({
                asset: c.signal.asset,
                reason: c.reason,
                pnlR: Math.round(c.pnlR * 100) / 100,
            })),
            newOpportunities,
            telegramConfigured: isTelegramConfigured(),
            duration: Date.now() - startTime,
            lastRun: lastRunTimestamp,
        });
    } catch (error) {
        serverLog('error', 'monitor_error', { error: String(error) }, 'api/monitor');
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Monitor error',
        }, { status: 500 });
    } finally {
        isRunning = false;
    }
}
