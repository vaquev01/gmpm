
// Mock Sentiment Engine for Institutional Macro Dashboard

export interface SentimentData {
    socialVolume: number; // Tweets/Posts per minute
    bullBearRatio: number; // > 1 is Bullish
    narrativeStrength: number; // 0-100 (Conviction)
    topNarratives: string[];
    retailPositioning: 'LONG' | 'SHORT' | 'NEUTRAL';
}

export function getSocialSentiment(riskScore: number): SentimentData {
    // Risk Score (0-100) from Institutional Engine
    // High Risk Score = Bullish Sentiment/Risk On

    let narratives = ["AI", "Crypto", "Fed Pause"];
    let ratio = 1.2;

    if (riskScore > 60) {
        narratives = ["Soft Landing", "AI Boom", "Tech Rally"];
        ratio = 2.5;
    } else if (riskScore < 40) {
        narratives = ["Recession Fear", "Sticky Inflation", "Geopolitics"];
        ratio = 0.6;
    }

    return {
        socialVolume: Math.floor(1500 + Math.random() * 500),
        bullBearRatio: ratio + (Math.random() * 0.4 - 0.2),
        narrativeStrength: 65 + Math.floor(Math.random() * 20),
        topNarratives: narratives,
        retailPositioning: ratio > 1 ? 'LONG' : 'SHORT'
    };
}
