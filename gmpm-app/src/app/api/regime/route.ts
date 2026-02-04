import { NextResponse } from 'next/server';
import { calculateRegimeSnapshot, RegimeSnapshot, MacroInputs } from '@/lib/regimeEngine';
import { serverLog } from '@/lib/serverLogs';

// Cache for regime snapshot (avoid recalculating on every request)
let cachedSnapshot: RegimeSnapshot | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 15_000; // 15 seconds for real-time

// Fetch macro data from our own market API
async function fetchMacroInputs(): Promise<MacroInputs> {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    const fetchJsonWithTimeout = async (url: string, timeoutMs: number) => {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, {
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
            });
            const json = await res.json().catch(() => null);
            return { ok: res.ok, status: res.status, json };
        } finally {
            clearTimeout(t);
        }
    };

    try {
        const [macroRes, marketRes] = await Promise.all([
            fetchJsonWithTimeout(`${baseUrl}/api/macro`, 5000),
            fetchJsonWithTimeout(`${baseUrl}/api/market?limit=50&macro=0`, 6000),
        ]);

        const macroJson = (macroRes.json && typeof macroRes.json === 'object') ? (macroRes.json as Record<string, unknown>) : {};
        const marketJson = (marketRes.json && typeof marketRes.json === 'object') ? (marketRes.json as Record<string, unknown>) : {};

        if (!macroRes.ok) {
            serverLog('warn', 'regime_macro_fetch_failed', { status: macroRes.status }, 'api/regime');
        }
        if (!marketRes.ok) {
            serverLog('warn', 'regime_market_fetch_failed', { status: marketRes.status }, 'api/regime');
        }

        const macro = (macroJson && typeof macroJson.macro === 'object' && macroJson.macro !== null) ? (macroJson.macro as Record<string, unknown>) : {};
        const stats = (marketJson && typeof marketJson.stats === 'object' && marketJson.stats !== null) ? (marketJson.stats as Record<string, unknown>) : {};
        const assets = (marketJson && Array.isArray(marketJson.assets))
            ? (marketJson.assets as Array<Record<string, unknown>>)
            : (marketJson && Array.isArray(marketJson.data))
                ? (marketJson.data as Array<Record<string, unknown>>)
                : [];

        const fgRaw = (macro as Record<string, unknown>).fearGreed;
        const fearGreed = (typeof fgRaw === 'object' && fgRaw !== null)
            ? (() => {
                const r = fgRaw as Record<string, unknown>;
                const value = typeof r.value === 'number' ? r.value : null;
                const classification = typeof r.classification === 'string' ? r.classification : null;
                if (value === null || classification === null) return null;
                return { value, classification };
            })()
            : null;

        // Calculate adv/dec ratio
        const gainers = typeof stats.gainers === 'number' ? stats.gainers : 0;
        const losers = typeof stats.losers === 'number' ? stats.losers : 0;
        const advDecRatio = losers > 0 ? gainers / losers : (gainers > 0 ? 2 : 1);

        // Find DXY change from assets
        const dxyAsset = assets.find((a) => a?.symbol === 'DX=F' || a?.symbol === 'DX-Y.NYB');
        const dxyAssetChg = dxyAsset && typeof dxyAsset.changePercent === 'number' ? dxyAsset.changePercent : null;
        const macroDxyChg = typeof macro.dollarIndexChange === 'number' ? macro.dollarIndexChange : null;
        const dollarIndexChange = macroDxyChg ?? dxyAssetChg;

        const inputs: MacroInputs = {
            vix: typeof macro.vix === 'number' ? macro.vix : undefined,
            vixChange: typeof macro.vixChange === 'number' ? macro.vixChange : undefined,
            treasury10y: typeof macro.treasury10y === 'number' ? macro.treasury10y : undefined,
            treasury2y: typeof macro.treasury2y === 'number' ? macro.treasury2y : undefined,
            treasury30y: typeof macro.treasury30y === 'number' ? macro.treasury30y : undefined,
            yieldCurve: typeof macro.yieldCurve === 'number' ? macro.yieldCurve : undefined,
            dollarIndex: typeof macro.dollarIndex === 'number' ? macro.dollarIndex : undefined,
            dollarIndexChange: dollarIndexChange ?? undefined,
            fearGreed,
            advDecRatio,
            marketAvgChange: typeof stats.avgChange === 'number' ? stats.avgChange : undefined,
            dataTimestamp: typeof macroJson.timestamp === 'string' ? (macroJson.timestamp as string) : (typeof marketJson.timestamp === 'string' ? (marketJson.timestamp as string) : undefined),
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
