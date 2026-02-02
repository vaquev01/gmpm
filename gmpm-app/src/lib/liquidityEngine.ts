
// Mock Liquidity Engine for Institutional Macro Dashboard

export interface LiquidityData {
    netLiquidity: number; // in Trillions
    rrp: number; // Reverse Repo in Trillions
    tga: number; // Treasury General Account in Billions
    fedBalanceSheet: number; // in Trillions
    trend: 'EXPANDING' | 'CONTRACTING' | 'NEUTRAL';
    change24h: number; // Percent change
}

export function getLiquidityData(macroRegime: string): LiquidityData {
    // Basic simulation logic based on regime
    let baseLiq = 6.2; // Base Net Liquidity
    let trend: 'EXPANDING' | 'CONTRACTING' | 'NEUTRAL' = 'NEUTRAL';
    let change = 0;

    if (macroRegime.includes('EXPANSION') || macroRegime.includes('LOWER')) {
        baseLiq = 6.45;
        trend = 'EXPANDING';
        change = 1.2;
    } else if (macroRegime.includes('RECESSION') || macroRegime.includes('INFLATION')) {
        baseLiq = 5.9;
        trend = 'CONTRACTING';
        change = -0.8;
    }

    // Add some noise
    const noise = (Math.random() - 0.5) * 0.05;

    return {
        netLiquidity: baseLiq + noise,
        rrp: 0.45 + noise * 0.1,
        tga: 750 + noise * 100,
        fedBalanceSheet: 7.3 + noise * 0.2,
        trend,
        change24h: change + (Math.random() * 0.4 - 0.2)
    };
}
