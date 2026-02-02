
// Mock Liquidity Engine for Institutional Macro Dashboard

export interface LiquidityData {
    netLiquidity: number; // in Trillions
    rrp: number; // Reverse Repo in Trillions
    tga: number; // Treasury General Account in Billions
    fedBalanceSheet: number; // in Trillions
    trend: 'EXPANDING' | 'CONTRACTING' | 'NEUTRAL';
    change24h: number | null; // Percent change
}

export function getLiquidityData(macro: unknown): LiquidityData | null {
    const input = (typeof macro === 'object' && macro !== null) ? (macro as Record<string, unknown>) : {};
    const dataObj = input['data'];
    const fred = (typeof dataObj === 'object' && dataObj !== null) ? (dataObj as Record<string, unknown>) : input;

    const walcl_m = Number((fred['WALCL'] as { value?: unknown } | undefined)?.value);
    const rrp_b = Number((fred['RRPONTSYD'] as { value?: unknown } | undefined)?.value);
    const tga_m = Number((fred['WTREGEN'] as { value?: unknown } | undefined)?.value);

    if (!Number.isFinite(walcl_m) || !Number.isFinite(rrp_b) || !Number.isFinite(tga_m)) {
        return null;
    }

    const fedTr = walcl_m / 1_000_000.0;
    const rrpTr = rrp_b / 1_000.0;
    const tgaB = tga_m / 1_000.0;
    const tgaTr = tgaB / 1_000.0;
    const netTr = fedTr - rrpTr - tgaTr;

    let trend: 'EXPANDING' | 'CONTRACTING' | 'NEUTRAL' = 'NEUTRAL';
    if (netTr >= 5.8) trend = 'EXPANDING';
    else if (netTr <= 5.2) trend = 'CONTRACTING';

    return {
        netLiquidity: netTr,
        rrp: rrpTr,
        tga: tgaB,
        fedBalanceSheet: fedTr,
        trend,
        change24h: null,
    };
}
