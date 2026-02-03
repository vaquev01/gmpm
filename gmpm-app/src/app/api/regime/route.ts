import { NextResponse } from 'next/server';
import { calculateRegimeSnapshot, RegimeSnapshot, MacroInputs } from '@/lib/regimeEngine';
import { serverLog } from '@/lib/serverLogs';

// Cache for regime snapshot (avoid recalculating on every request)
let cachedSnapshot: RegimeSnapshot | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

// Fetch macro data from our own market API
async function fetchMacroInputs(): Promise<MacroInputs> {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';
    
    try {
        const res = await fetch(`${baseUrl}/api/market?limit=50`, {
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!res.ok) {
            serverLog('warn', 'regime_market_fetch_failed', { status: res.status }, 'api/regime');
            return {};
        }

        const data = await res.json();
        
        if (!data.success) {
            serverLog('warn', 'regime_market_not_success', { data }, 'api/regime');
            return {};
        }

        const macro = data.macro || {};
        const stats = data.stats || {};
        const assets = data.assets || [];

        // Calculate adv/dec ratio
        const gainers = stats.gainers || 0;
        const losers = stats.losers || 0;
        const advDecRatio = losers > 0 ? gainers / losers : (gainers > 0 ? 2 : 1);

        // Find DXY change from assets
        const dxyAsset = assets.find((a: { symbol: string }) => a.symbol === 'DX=F' || a.symbol === 'DX-Y.NYB');
        const dollarIndexChange = dxyAsset?.changePercent || null;

        const inputs: MacroInputs = {
            vix: macro.vix || undefined,
            vixChange: macro.vixChange || undefined,
            treasury10y: macro.treasury10y || undefined,
            treasury2y: macro.treasury2y || undefined,
            treasury30y: macro.treasury30y || undefined,
            yieldCurve: macro.yieldCurve || undefined,
            dollarIndex: macro.dollarIndex || undefined,
            dollarIndexChange: dollarIndexChange ?? undefined,
            fearGreed: macro.fearGreed || null,
            advDecRatio,
            marketAvgChange: stats.avgChange || undefined,
            dataTimestamp: data.timestamp,
        };

        return inputs;
    } catch (error) {
        serverLog('error', 'regime_market_fetch_error', { error: String(error) }, 'api/regime');
        return {};
    }
}

export async function GET() {
    const now = Date.now();

    // Return cached if fresh
    if (cachedSnapshot && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return NextResponse.json({
            success: true,
            cached: true,
            cacheAge: now - cacheTimestamp,
            snapshot: cachedSnapshot,
        });
    }

    try {
        const inputs = await fetchMacroInputs();
        const snapshot = calculateRegimeSnapshot(inputs);

        // Update cache
        cachedSnapshot = snapshot;
        cacheTimestamp = now;

        serverLog(
            snapshot.alerts.some(a => a.level === 'CRITICAL') ? 'warn' : 'info',
            'regime_snapshot',
            {
                regime: snapshot.regime,
                confidence: snapshot.regimeConfidence,
                drivers: snapshot.dominantDrivers,
                alerts: snapshot.alerts.length,
                axes: {
                    G: snapshot.axes.G.direction,
                    I: snapshot.axes.I.direction,
                    L: snapshot.axes.L.direction,
                    C: snapshot.axes.C.direction,
                    D: snapshot.axes.D.direction,
                    V: snapshot.axes.V.direction,
                },
            },
            'api/regime'
        );

        return NextResponse.json({
            success: true,
            cached: false,
            snapshot,
        });
    } catch (error) {
        serverLog('error', 'regime_snapshot_error', { error: String(error) }, 'api/regime');

        // Return degraded snapshot if we have cache
        if (cachedSnapshot) {
            return NextResponse.json({
                success: true,
                cached: true,
                degraded: true,
                cacheAge: now - cacheTimestamp,
                snapshot: cachedSnapshot,
            });
        }

        return NextResponse.json(
            { success: false, error: 'Failed to calculate regime' },
            { status: 500 }
        );
    }
}
