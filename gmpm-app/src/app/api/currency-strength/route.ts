import { NextResponse } from 'next/server';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

// Currency metadata with country info
const CURRENCIES = {
    USD: { name: 'US Dollar', country: 'United States', flag: '🇺🇸', centralBank: 'Federal Reserve', region: 'North America' },
    EUR: { name: 'Euro', country: 'Eurozone', flag: '🇪🇺', centralBank: 'ECB', region: 'Europe' },
    GBP: { name: 'British Pound', country: 'United Kingdom', flag: '🇬🇧', centralBank: 'Bank of England', region: 'Europe' },
    JPY: { name: 'Japanese Yen', country: 'Japan', flag: '🇯🇵', centralBank: 'Bank of Japan', region: 'Asia' },
    CHF: { name: 'Swiss Franc', country: 'Switzerland', flag: '🇨🇭', centralBank: 'SNB', region: 'Europe' },
    AUD: { name: 'Australian Dollar', country: 'Australia', flag: '🇦🇺', centralBank: 'RBA', region: 'Oceania' },
    CAD: { name: 'Canadian Dollar', country: 'Canada', flag: '🇨🇦', centralBank: 'Bank of Canada', region: 'North America' },
    NZD: { name: 'New Zealand Dollar', country: 'New Zealand', flag: '🇳🇿', centralBank: 'RBNZ', region: 'Oceania' },
};

type CurrencyCode = keyof typeof CURRENCIES;

interface CurrencyStrength {
    code: CurrencyCode;
    name: string;
    country: string;
    flag: string;
    centralBank: string;
    region: string;
    strength: number;
    strengthLabel: 'STRONG' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'WEAK';
    bullishPairs: number;
    bearishPairs: number;
    totalPairs: number;
    trend: 'UP' | 'DOWN' | 'SIDEWAYS';
    momentum: number;
    economicIndicators: EconomicIndicators;
    flowAnalysis: FlowAnalysis;
    correlations: CurrencyCorrelation[];
}

interface EconomicIndicators {
    interestRate: number | null;
    inflation: number | null;
    gdpGrowth: number | null;
    unemployment: number | null;
    tradeBalance: number | null;
    sentiment: 'HAWKISH' | 'NEUTRAL' | 'DOVISH';
    nextMeeting: string | null;
    recentEvents: string[];
}

interface FlowAnalysis {
    capitalFlow: 'INFLOW' | 'OUTFLOW' | 'NEUTRAL';
    flowStrength: number;
    institutionalBias: 'LONG' | 'SHORT' | 'NEUTRAL';
    retailSentiment: number;
    cot: {
        commercial: number;
        nonCommercial: number;
        retail: number;
    };
}

interface CurrencyCorrelation {
    currency: CurrencyCode;
    correlation: number;
    relationship: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
}

interface ForexPair {
    symbol: string;
    base: CurrencyCode;
    quote: CurrencyCode;
    price: number;
    change: number;
    changePercent: number;
    signal: 'LONG' | 'SHORT';
    strength: number;
}

// Simulated economic data (in production, fetch from FRED API or similar)
function getEconomicIndicators(currency: CurrencyCode): EconomicIndicators {
    const indicators: Record<CurrencyCode, EconomicIndicators> = {
        USD: {
            interestRate: 5.25,
            inflation: 3.2,
            gdpGrowth: 2.1,
            unemployment: 3.7,
            tradeBalance: -68.5,
            sentiment: 'HAWKISH',
            nextMeeting: '2026-03-19',
            recentEvents: ['Fed mantém taxa em 5.25%', 'CPI abaixo do esperado', 'NFP forte']
        },
        EUR: {
            interestRate: 4.50,
            inflation: 2.8,
            gdpGrowth: 0.5,
            unemployment: 6.4,
            tradeBalance: 28.3,
            sentiment: 'NEUTRAL',
            nextMeeting: '2026-03-07',
            recentEvents: ['ECB sinaliza cortes em breve', 'PMI Alemão fraco', 'Inflação recuando']
        },
        GBP: {
            interestRate: 5.25,
            inflation: 4.0,
            gdpGrowth: 0.2,
            unemployment: 4.2,
            tradeBalance: -15.2,
            sentiment: 'HAWKISH',
            nextMeeting: '2026-03-21',
            recentEvents: ['BoE preocupado com inflação', 'PIB estagnado', 'Varejo fraco']
        },
        JPY: {
            interestRate: 0.10,
            inflation: 2.6,
            gdpGrowth: 1.9,
            unemployment: 2.4,
            tradeBalance: -2.1,
            sentiment: 'DOVISH',
            nextMeeting: '2026-03-15',
            recentEvents: ['BoJ mantém política ultra-dovish', 'Intervenção possível', 'Yen em mínimas']
        },
        CHF: {
            interestRate: 1.75,
            inflation: 1.3,
            gdpGrowth: 1.2,
            unemployment: 2.1,
            tradeBalance: 5.8,
            sentiment: 'NEUTRAL',
            nextMeeting: '2026-03-20',
            recentEvents: ['SNB estável', 'Safe haven ativo', 'Inflação controlada']
        },
        AUD: {
            interestRate: 4.35,
            inflation: 3.4,
            gdpGrowth: 1.5,
            unemployment: 3.9,
            tradeBalance: 8.2,
            sentiment: 'NEUTRAL',
            nextMeeting: '2026-03-18',
            recentEvents: ['RBA em pausa', 'Commodities suportando', 'China demanda fraca']
        },
        CAD: {
            interestRate: 5.00,
            inflation: 2.9,
            gdpGrowth: 1.1,
            unemployment: 5.8,
            tradeBalance: -1.2,
            sentiment: 'NEUTRAL',
            nextMeeting: '2026-03-12',
            recentEvents: ['BoC sinaliza cortes', 'Petróleo volátil', 'Housing cooling']
        },
        NZD: {
            interestRate: 5.50,
            inflation: 4.7,
            gdpGrowth: 0.8,
            unemployment: 4.0,
            tradeBalance: -1.5,
            sentiment: 'HAWKISH',
            nextMeeting: '2026-04-10',
            recentEvents: ['RBNZ hawkish', 'Dairy prices up', 'Housing recovering']
        },
    };
    return indicators[currency];
}

// Simulated flow analysis
function getFlowAnalysis(currency: CurrencyCode, strength: number): FlowAnalysis {
    const isStrong = strength >= 55;
    const isWeak = strength <= 45;
    
    return {
        capitalFlow: isStrong ? 'INFLOW' : isWeak ? 'OUTFLOW' : 'NEUTRAL',
        flowStrength: Math.abs(strength - 50) * 2,
        institutionalBias: isStrong ? 'LONG' : isWeak ? 'SHORT' : 'NEUTRAL',
        retailSentiment: Math.round(100 - strength + (Math.random() * 20 - 10)),
        cot: {
            commercial: Math.round((strength - 50) * 1.5),
            nonCommercial: Math.round((strength - 50) * 2),
            retail: Math.round((50 - strength) * 1.2),
        },
    };
}

// Calculate correlations between currencies
function getCorrelations(currency: CurrencyCode, strengths: Map<CurrencyCode, number>): CurrencyCorrelation[] {
    const correlationMatrix: Record<string, number> = {
        'USD-EUR': -0.85, 'USD-GBP': -0.75, 'USD-JPY': 0.20, 'USD-CHF': -0.90,
        'USD-AUD': -0.70, 'USD-CAD': -0.60, 'USD-NZD': -0.65,
        'EUR-GBP': 0.80, 'EUR-JPY': -0.30, 'EUR-CHF': 0.85, 'EUR-AUD': 0.55,
        'EUR-CAD': 0.45, 'EUR-NZD': 0.50,
        'GBP-JPY': -0.25, 'GBP-CHF': 0.70, 'GBP-AUD': 0.60, 'GBP-CAD': 0.50,
        'GBP-NZD': 0.55,
        'JPY-CHF': 0.40, 'JPY-AUD': -0.50, 'JPY-CAD': -0.35, 'JPY-NZD': -0.45,
        'CHF-AUD': -0.55, 'CHF-CAD': -0.45, 'CHF-NZD': -0.50,
        'AUD-CAD': 0.75, 'AUD-NZD': 0.90,
        'CAD-NZD': 0.70,
    };

    const result: CurrencyCorrelation[] = [];
    const currencies = Object.keys(CURRENCIES) as CurrencyCode[];
    
    for (const other of currencies) {
        if (other === currency) continue;
        
        const key1 = `${currency}-${other}`;
        const key2 = `${other}-${currency}`;
        let corr = correlationMatrix[key1] ?? correlationMatrix[key2] ?? 0;
        if (correlationMatrix[key2] && !correlationMatrix[key1]) corr = -corr;
        
        result.push({
            currency: other,
            correlation: Math.round(corr * 100) / 100,
            relationship: corr > 0.3 ? 'POSITIVE' : corr < -0.3 ? 'NEGATIVE' : 'NEUTRAL',
        });
    }
    
    return result.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}

function getStrengthLabel(s: number): CurrencyStrength['strengthLabel'] {
    if (s >= 70) return 'STRONG';
    if (s >= 55) return 'BULLISH';
    if (s >= 45) return 'NEUTRAL';
    if (s >= 30) return 'BEARISH';
    return 'WEAK';
}

export async function GET() {
    try {
        // Fetch market data for forex pairs
        const [marketRes, macroRes] = await Promise.all([
            fetch(`${baseUrl}/api/market?limit=150`, { cache: 'no-store' }),
            fetch(`${baseUrl}/api/macro`, { cache: 'no-store' }),
        ]);

        const marketData = await marketRes.json().catch(() => ({ success: false }));
        const macroData = await macroRes.json().catch(() => ({}));

        const assets = marketData.success && Array.isArray(marketData.snapshot?.assets) 
            ? marketData.snapshot.assets 
            : [];

        // Filter forex pairs
        const forexPairs: ForexPair[] = assets
            .filter((a: Record<string, unknown>) => 
                typeof a.symbol === 'string' && a.symbol.includes('=X'))
            .map((a: Record<string, unknown>) => {
                const symbol = String(a.symbol).replace('=X', '');
                const base = symbol.slice(0, 3).toUpperCase() as CurrencyCode;
                const quote = symbol.slice(3, 6).toUpperCase() as CurrencyCode;
                const price = typeof a.price === 'number' ? a.price : 0;
                const change = typeof a.change === 'number' ? a.change : 0;
                const changePercent = typeof a.changePercent === 'number' ? a.changePercent : 0;
                
                return {
                    symbol: String(a.symbol),
                    base,
                    quote,
                    price,
                    change,
                    changePercent,
                    signal: changePercent >= 0 ? 'LONG' : 'SHORT' as const,
                    strength: 50 + Math.min(25, Math.max(-25, changePercent * 10)),
                };
            });

        // Calculate currency strength
        const currencyStats: Record<CurrencyCode, { bullish: number; bearish: number; total: number; momentum: number }> = {
            USD: { bullish: 0, bearish: 0, total: 0, momentum: 0 },
            EUR: { bullish: 0, bearish: 0, total: 0, momentum: 0 },
            GBP: { bullish: 0, bearish: 0, total: 0, momentum: 0 },
            JPY: { bullish: 0, bearish: 0, total: 0, momentum: 0 },
            CHF: { bullish: 0, bearish: 0, total: 0, momentum: 0 },
            AUD: { bullish: 0, bearish: 0, total: 0, momentum: 0 },
            CAD: { bullish: 0, bearish: 0, total: 0, momentum: 0 },
            NZD: { bullish: 0, bearish: 0, total: 0, momentum: 0 },
        };

        for (const pair of forexPairs) {
            if (currencyStats[pair.base]) {
                currencyStats[pair.base].total++;
                currencyStats[pair.base].momentum += pair.changePercent;
                if (pair.signal === 'LONG') currencyStats[pair.base].bullish++;
                else currencyStats[pair.base].bearish++;
            }
            if (currencyStats[pair.quote]) {
                currencyStats[pair.quote].total++;
                currencyStats[pair.quote].momentum -= pair.changePercent;
                if (pair.signal === 'LONG') currencyStats[pair.quote].bearish++;
                else currencyStats[pair.quote].bullish++;
            }
        }

        const strengths = new Map<CurrencyCode, number>();
        const currencies: CurrencyStrength[] = [];

        for (const [code, meta] of Object.entries(CURRENCIES)) {
            const stats = currencyStats[code as CurrencyCode];
            const bullishRatio = stats.total > 0 ? stats.bullish / stats.total : 0.5;
            const strength = Math.round(50 + (bullishRatio - 0.5) * 100);
            strengths.set(code as CurrencyCode, strength);

            const trend: CurrencyStrength['trend'] = 
                stats.momentum > 0.5 ? 'UP' : stats.momentum < -0.5 ? 'DOWN' : 'SIDEWAYS';

            currencies.push({
                code: code as CurrencyCode,
                name: meta.name,
                country: meta.country,
                flag: meta.flag,
                centralBank: meta.centralBank,
                region: meta.region,
                strength,
                strengthLabel: getStrengthLabel(strength),
                bullishPairs: stats.bullish,
                bearishPairs: stats.bearish,
                totalPairs: stats.total,
                trend,
                momentum: Math.round(stats.momentum * 100) / 100,
                economicIndicators: getEconomicIndicators(code as CurrencyCode),
                flowAnalysis: getFlowAnalysis(code as CurrencyCode, strength),
                correlations: [],
            });
        }

        // Add correlations
        for (const curr of currencies) {
            curr.correlations = getCorrelations(curr.code, strengths);
        }

        // Sort by strength
        currencies.sort((a, b) => b.strength - a.strength);

        // Global flow analysis
        const globalFlow = {
            riskSentiment: macroData.vix < 20 ? 'RISK_ON' : macroData.vix > 30 ? 'RISK_OFF' : 'NEUTRAL',
            dollarIndex: macroData.dollarIndex || null,
            vix: macroData.vix || null,
            dominantFlow: currencies[0].code,
            weakestCurrency: currencies[currencies.length - 1].code,
            majorTrends: [
                { pair: 'EURUSD', direction: strengths.get('EUR')! > strengths.get('USD')! ? 'UP' : 'DOWN' },
                { pair: 'USDJPY', direction: strengths.get('USD')! > strengths.get('JPY')! ? 'UP' : 'DOWN' },
                { pair: 'GBPUSD', direction: strengths.get('GBP')! > strengths.get('USD')! ? 'UP' : 'DOWN' },
            ],
        };

        // Best pairs to trade (based on strength differential)
        const bestPairs = [];
        for (const pair of forexPairs) {
            const baseStrength = strengths.get(pair.base) || 50;
            const quoteStrength = strengths.get(pair.quote) || 50;
            const differential = Math.abs(baseStrength - quoteStrength);
            
            if (differential >= 15) {
                bestPairs.push({
                    symbol: pair.symbol,
                    base: pair.base,
                    quote: pair.quote,
                    direction: baseStrength > quoteStrength ? 'LONG' : 'SHORT',
                    differential,
                    baseStrength,
                    quoteStrength,
                    confidence: differential >= 30 ? 'HIGH' : differential >= 20 ? 'MEDIUM' : 'LOW',
                });
            }
        }
        bestPairs.sort((a, b) => b.differential - a.differential);

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            currencies,
            forexPairs: forexPairs.slice(0, 30),
            globalFlow,
            bestPairs: bestPairs.slice(0, 10),
            summary: {
                strongestCurrencies: currencies.filter(c => c.strengthLabel === 'STRONG' || c.strengthLabel === 'BULLISH'),
                weakestCurrencies: currencies.filter(c => c.strengthLabel === 'WEAK' || c.strengthLabel === 'BEARISH'),
                neutralCurrencies: currencies.filter(c => c.strengthLabel === 'NEUTRAL'),
            },
        });
    } catch (error) {
        console.error('[CURRENCY-STRENGTH] Error:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to analyze currency strength',
        }, { status: 500 });
    }
}
