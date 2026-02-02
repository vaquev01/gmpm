
// Mock Sentiment Engine for Institutional Macro Dashboard

export interface SentimentData {
    socialVolume: number | null; // Tweets/Posts per minute
    bullBearRatio: number; // > 1 is Bullish
    narrativeStrength: number | null; // 0-100 (Conviction)
    topNarratives: string[]; // Deterministic labels (not measured)
    retailPositioning: 'LONG' | 'SHORT' | 'NEUTRAL';
}

export function getSocialSentiment(macro: unknown): SentimentData | null {
    const input = (typeof macro === 'object' && macro !== null) ? (macro as Record<string, unknown>) : {};
    const dataObj = input['data'];
    const fred = (typeof dataObj === 'object' && dataObj !== null) ? (dataObj as Record<string, unknown>) : input;

    const vix = Number((fred['VIXCLS'] as { value?: unknown } | undefined)?.value);
    const umcsent = Number((fred['UMCSENT'] as { value?: unknown } | undefined)?.value);
    if (!Number.isFinite(vix) || !Number.isFinite(umcsent)) {
        return null;
    }

    // Deterministic proxy: higher VIX => lower bull/bear ratio; higher UMCSENT => higher ratio.
    const vixAdj = Math.max(0.2, Math.min(3.0, 2.6 - (vix - 12) * 0.08));
    const sentAdj = Math.max(0.2, Math.min(3.0, 0.6 + (umcsent - 60) * 0.02));
    const ratio = Math.max(0.2, Math.min(3.0, (vixAdj + sentAdj) / 2.0));

    const retailPositioning: 'LONG' | 'SHORT' | 'NEUTRAL' = ratio > 1.1 ? 'LONG' : ratio < 0.9 ? 'SHORT' : 'NEUTRAL';
    const topNarratives: string[] = [
        vix > 22 ? 'Volatility' : 'Risk-On',
        umcsent < 60 ? 'Consumer Weakness' : 'Consumer Resilience',
        'Rates',
    ];

    return {
        socialVolume: null,
        bullBearRatio: ratio,
        narrativeStrength: null,
        topNarratives,
        retailPositioning,
    };
}
