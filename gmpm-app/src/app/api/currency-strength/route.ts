import { NextResponse } from 'next/server';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

// Currency metadata with comprehensive country info
const CURRENCIES = {
    USD: { 
        name: 'US Dollar', 
        country: 'United States', 
        flag: '🇺🇸', 
        centralBank: 'Federal Reserve',
        centralBankShort: 'FED',
        region: 'North America',
        majorExports: ['Aircraft', 'Refined Petroleum', 'Cars', 'Integrated Circuits', 'Gas Turbines'],
        majorImports: ['Cars', 'Crude Petroleum', 'Computers', 'Broadcasting Equipment', 'Packaged Medicaments'],
        tradingPartners: ['China', 'Canada', 'Mexico', 'Japan', 'Germany'],
        commodityExposure: { oil: -0.3, gold: -0.2, copper: 0.1 },
        riskProfile: 'SAFE_HAVEN',
        sessionHours: { start: 13, end: 22, name: 'New York' },
    },
    EUR: { 
        name: 'Euro', 
        country: 'Eurozone', 
        flag: '🇪🇺', 
        centralBank: 'European Central Bank',
        centralBankShort: 'ECB',
        region: 'Europe',
        majorExports: ['Cars', 'Packaged Medicaments', 'Vehicle Parts', 'Planes', 'Blood Products'],
        majorImports: ['Crude Petroleum', 'Cars', 'Petroleum Gas', 'Packaged Medicaments', 'Computers'],
        tradingPartners: ['USA', 'China', 'UK', 'Switzerland', 'Russia'],
        commodityExposure: { oil: -0.4, gold: 0.1, copper: 0.2 },
        riskProfile: 'RISK_NEUTRAL',
        sessionHours: { start: 7, end: 16, name: 'London' },
    },
    GBP: { 
        name: 'British Pound', 
        country: 'United Kingdom', 
        flag: '🇬🇧', 
        centralBank: 'Bank of England',
        centralBankShort: 'BOE',
        region: 'Europe',
        majorExports: ['Gold', 'Cars', 'Gas Turbines', 'Packaged Medicaments', 'Crude Petroleum'],
        majorImports: ['Gold', 'Cars', 'Crude Petroleum', 'Packaged Medicaments', 'Broadcasting Equipment'],
        tradingPartners: ['USA', 'Germany', 'Netherlands', 'France', 'Ireland'],
        commodityExposure: { oil: 0.3, gold: 0.2, copper: 0.1 },
        riskProfile: 'RISK_NEUTRAL',
        sessionHours: { start: 7, end: 16, name: 'London' },
    },
    JPY: { 
        name: 'Japanese Yen', 
        country: 'Japan', 
        flag: '🇯🇵', 
        centralBank: 'Bank of Japan',
        centralBankShort: 'BOJ',
        region: 'Asia',
        majorExports: ['Cars', 'Vehicle Parts', 'Integrated Circuits', 'Machinery', 'Iron Products'],
        majorImports: ['Crude Petroleum', 'Petroleum Gas', 'Coal', 'Integrated Circuits', 'Broadcasting Equipment'],
        tradingPartners: ['China', 'USA', 'South Korea', 'Taiwan', 'Hong Kong'],
        commodityExposure: { oil: -0.6, gold: 0.3, copper: -0.2 },
        riskProfile: 'SAFE_HAVEN',
        sessionHours: { start: 0, end: 9, name: 'Tokyo' },
    },
    CHF: { 
        name: 'Swiss Franc', 
        country: 'Switzerland', 
        flag: '🇨🇭', 
        centralBank: 'Swiss National Bank',
        centralBankShort: 'SNB',
        region: 'Europe',
        majorExports: ['Gold', 'Packaged Medicaments', 'Watches', 'Jewellery', 'Orthopedic Appliances'],
        majorImports: ['Gold', 'Packaged Medicaments', 'Cars', 'Jewellery', 'Blood Products'],
        tradingPartners: ['Germany', 'USA', 'France', 'Italy', 'UK'],
        commodityExposure: { oil: -0.1, gold: 0.5, copper: 0.0 },
        riskProfile: 'SAFE_HAVEN',
        sessionHours: { start: 7, end: 16, name: 'Zurich' },
    },
    AUD: { 
        name: 'Australian Dollar', 
        country: 'Australia', 
        flag: '🇦🇺', 
        centralBank: 'Reserve Bank of Australia',
        centralBankShort: 'RBA',
        region: 'Oceania',
        majorExports: ['Iron Ore', 'Coal', 'Petroleum Gas', 'Gold', 'Aluminium Ore'],
        majorImports: ['Cars', 'Refined Petroleum', 'Delivery Trucks', 'Computers', 'Telephones'],
        tradingPartners: ['China', 'Japan', 'South Korea', 'USA', 'India'],
        commodityExposure: { oil: 0.2, gold: 0.4, copper: 0.6 },
        riskProfile: 'RISK_ON',
        sessionHours: { start: 22, end: 7, name: 'Sydney' },
    },
    CAD: { 
        name: 'Canadian Dollar', 
        country: 'Canada', 
        flag: '🇨🇦', 
        centralBank: 'Bank of Canada',
        centralBankShort: 'BOC',
        region: 'North America',
        majorExports: ['Crude Petroleum', 'Cars', 'Petroleum Gas', 'Gold', 'Vehicle Parts'],
        majorImports: ['Cars', 'Delivery Trucks', 'Vehicle Parts', 'Computers', 'Refined Petroleum'],
        tradingPartners: ['USA', 'China', 'UK', 'Japan', 'Mexico'],
        commodityExposure: { oil: 0.7, gold: 0.2, copper: 0.3 },
        riskProfile: 'RISK_ON',
        sessionHours: { start: 13, end: 22, name: 'Toronto' },
    },
    NZD: { 
        name: 'New Zealand Dollar', 
        country: 'New Zealand', 
        flag: '🇳🇿', 
        centralBank: 'Reserve Bank of New Zealand',
        centralBankShort: 'RBNZ',
        region: 'Oceania',
        majorExports: ['Concentrated Milk', 'Butter', 'Sheep Meat', 'Rough Wood', 'Cheese'],
        majorImports: ['Cars', 'Crude Petroleum', 'Delivery Trucks', 'Computers', 'Refined Petroleum'],
        tradingPartners: ['China', 'Australia', 'USA', 'Japan', 'South Korea'],
        commodityExposure: { oil: -0.2, gold: 0.1, copper: 0.2 },
        riskProfile: 'RISK_ON',
        sessionHours: { start: 21, end: 6, name: 'Wellington' },
    },
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

function getFxExecutionWindow(): string {
    const utcHour = new Date().getUTCHours();
    if (utcHour >= 22 || utcHour < 2) return 'ASIA (agora - 3h)';
    if (utcHour >= 2 && utcHour < 7) return 'ASIA→LONDON (pré-abertura)';
    if (utcHour >= 7 && utcHour < 12) return 'LONDON (agora - 4h)';
    if (utcHour >= 12 && utcHour < 16) return 'LONDON→NEW YORK (overlap)';
    if (utcHour >= 16 && utcHour < 21) return 'NEW YORK (agora - 4h)';
    return 'FIM DE NY / AFTER HOURS';
}

function roundPrice(p: number): number {
    if (!Number.isFinite(p)) return 0;
    return p < 10 ? Number(p.toFixed(5)) : Number(p.toFixed(2));
}

function buildTradePlan(price: number, direction: TradeDirection, confidence: 'HIGH' | 'MEDIUM' | 'LOW'): TradePlan {
    const slPct = confidence === 'HIGH' ? 0.35 : confidence === 'MEDIUM' ? 0.5 : 0.7;
    const rrTarget = confidence === 'HIGH' ? 2.0 : confidence === 'MEDIUM' ? 1.6 : 1.3;
    const entryBandPct = 0.05;

    const entryFrom = price * (1 - entryBandPct / 100);
    const entryTo = price * (1 + entryBandPct / 100);

    const stopLoss = direction === 'LONG'
        ? price * (1 - slPct / 100)
        : price * (1 + slPct / 100);

    const takeProfit = direction === 'LONG'
        ? price * (1 + (slPct * rrTarget) / 100)
        : price * (1 - (slPct * rrTarget) / 100);

    const slDist = Math.abs(price - stopLoss);
    const tpDist = Math.abs(takeProfit - price);
    const riskReward = slDist > 0 ? tpDist / slDist : rrTarget;

    const horizon = confidence === 'HIGH' ? '4-12h' : confidence === 'MEDIUM' ? '12-24h' : '1-3 dias';

    return {
        entryZone: { from: roundPrice(entryFrom), to: roundPrice(entryTo) },
        stopLoss: roundPrice(stopLoss),
        takeProfit: roundPrice(takeProfit),
        riskReward: Math.round(riskReward * 100) / 100,
        horizon,
        executionWindow: getFxExecutionWindow(),
    };
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

interface EconomicEvent {
    date: string;
    time: string;
    event: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
    previous: string | null;
    forecast: string | null;
    actual: string | null;
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

type TradeDirection = 'LONG' | 'SHORT';

interface TradePlan {
    entryZone: { from: number; to: number };
    stopLoss: number;
    takeProfit: number;
    riskReward: number;
    horizon: string;
    executionWindow: string;
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
function getCorrelations(currency: CurrencyCode): CurrencyCorrelation[] {
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

function getEconomicCalendar(currency: CurrencyCode): EconomicEvent[] {
    const now = new Date();
    const events: Record<CurrencyCode, EconomicEvent[]> = {
        USD: [
            { date: formatDate(addDays(now, 1)), time: '13:30', event: 'Initial Jobless Claims', impact: 'MEDIUM', previous: '215K', forecast: '220K', actual: null },
            { date: formatDate(addDays(now, 2)), time: '13:30', event: 'Core PCE Price Index m/m', impact: 'HIGH', previous: '0.2%', forecast: '0.3%', actual: null },
            { date: formatDate(addDays(now, 5)), time: '15:00', event: 'ISM Manufacturing PMI', impact: 'HIGH', previous: '47.8', forecast: '48.5', actual: null },
            { date: formatDate(addDays(now, 7)), time: '13:30', event: 'Non-Farm Payrolls', impact: 'HIGH', previous: '275K', forecast: '200K', actual: null },
            { date: formatDate(addDays(now, 14)), time: '13:30', event: 'CPI m/m', impact: 'HIGH', previous: '0.3%', forecast: '0.2%', actual: null },
        ],
        EUR: [
            { date: formatDate(addDays(now, 1)), time: '10:00', event: 'German IFO Business Climate', impact: 'MEDIUM', previous: '85.2', forecast: '85.8', actual: null },
            { date: formatDate(addDays(now, 3)), time: '10:00', event: 'CPI Flash Estimate y/y', impact: 'HIGH', previous: '2.8%', forecast: '2.6%', actual: null },
            { date: formatDate(addDays(now, 6)), time: '12:45', event: 'ECB Interest Rate Decision', impact: 'HIGH', previous: '4.50%', forecast: '4.25%', actual: null },
            { date: formatDate(addDays(now, 8)), time: '09:00', event: 'German Manufacturing PMI', impact: 'MEDIUM', previous: '42.5', forecast: '43.0', actual: null },
        ],
        GBP: [
            { date: formatDate(addDays(now, 2)), time: '07:00', event: 'GDP m/m', impact: 'HIGH', previous: '0.1%', forecast: '0.2%', actual: null },
            { date: formatDate(addDays(now, 4)), time: '09:30', event: 'Services PMI', impact: 'MEDIUM', previous: '53.8', forecast: '54.0', actual: null },
            { date: formatDate(addDays(now, 10)), time: '12:00', event: 'BoE Interest Rate Decision', impact: 'HIGH', previous: '5.25%', forecast: '5.25%', actual: null },
            { date: formatDate(addDays(now, 12)), time: '07:00', event: 'CPI y/y', impact: 'HIGH', previous: '4.0%', forecast: '3.8%', actual: null },
        ],
        JPY: [
            { date: formatDate(addDays(now, 1)), time: '00:30', event: 'Tokyo Core CPI y/y', impact: 'HIGH', previous: '2.5%', forecast: '2.4%', actual: null },
            { date: formatDate(addDays(now, 5)), time: '00:50', event: 'Tankan Manufacturing Index', impact: 'HIGH', previous: '13', forecast: '12', actual: null },
            { date: formatDate(addDays(now, 8)), time: '04:00', event: 'BoJ Policy Rate', impact: 'HIGH', previous: '0.10%', forecast: '0.10%', actual: null },
            { date: formatDate(addDays(now, 15)), time: '00:50', event: 'Trade Balance', impact: 'MEDIUM', previous: '-0.66T', forecast: '-0.50T', actual: null },
        ],
        CHF: [
            { date: formatDate(addDays(now, 3)), time: '08:30', event: 'CPI m/m', impact: 'HIGH', previous: '0.0%', forecast: '0.1%', actual: null },
            { date: formatDate(addDays(now, 7)), time: '08:00', event: 'KOF Economic Barometer', impact: 'MEDIUM', previous: '101.5', forecast: '102.0', actual: null },
            { date: formatDate(addDays(now, 12)), time: '08:30', event: 'SNB Interest Rate Decision', impact: 'HIGH', previous: '1.75%', forecast: '1.50%', actual: null },
        ],
        AUD: [
            { date: formatDate(addDays(now, 1)), time: '00:30', event: 'Employment Change', impact: 'HIGH', previous: '15.2K', forecast: '20.0K', actual: null },
            { date: formatDate(addDays(now, 4)), time: '03:30', event: 'RBA Interest Rate Decision', impact: 'HIGH', previous: '4.35%', forecast: '4.35%', actual: null },
            { date: formatDate(addDays(now, 9)), time: '00:30', event: 'CPI q/q', impact: 'HIGH', previous: '0.6%', forecast: '0.5%', actual: null },
            { date: formatDate(addDays(now, 11)), time: '00:30', event: 'Retail Sales m/m', impact: 'MEDIUM', previous: '0.3%', forecast: '0.4%', actual: null },
        ],
        CAD: [
            { date: formatDate(addDays(now, 2)), time: '13:30', event: 'GDP m/m', impact: 'HIGH', previous: '0.2%', forecast: '0.1%', actual: null },
            { date: formatDate(addDays(now, 5)), time: '14:45', event: 'BoC Interest Rate Decision', impact: 'HIGH', previous: '5.00%', forecast: '4.75%', actual: null },
            { date: formatDate(addDays(now, 8)), time: '13:30', event: 'Employment Change', impact: 'HIGH', previous: '21.8K', forecast: '15.0K', actual: null },
            { date: formatDate(addDays(now, 14)), time: '13:30', event: 'CPI m/m', impact: 'HIGH', previous: '0.3%', forecast: '0.2%', actual: null },
        ],
        NZD: [
            { date: formatDate(addDays(now, 2)), time: '21:45', event: 'GDP q/q', impact: 'HIGH', previous: '-0.3%', forecast: '0.1%', actual: null },
            { date: formatDate(addDays(now, 6)), time: '02:00', event: 'RBNZ Interest Rate Decision', impact: 'HIGH', previous: '5.50%', forecast: '5.50%', actual: null },
            { date: formatDate(addDays(now, 10)), time: '21:45', event: 'Trade Balance', impact: 'MEDIUM', previous: '-1.2B', forecast: '-1.0B', actual: null },
            { date: formatDate(addDays(now, 13)), time: '21:45', event: 'CPI q/q', impact: 'HIGH', previous: '0.5%', forecast: '0.4%', actual: null },
        ],
    };
    return events[currency] || [];
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
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

        const assets = marketData.success && Array.isArray(marketData.assets) 
            ? marketData.assets 
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
            curr.correlations = getCorrelations(curr.code);
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
                const direction: TradeDirection = baseStrength > quoteStrength ? 'LONG' : 'SHORT';
                const confidence: 'HIGH' | 'MEDIUM' | 'LOW' = differential >= 30 ? 'HIGH' : differential >= 20 ? 'MEDIUM' : 'LOW';
                bestPairs.push({
                    symbol: pair.symbol,
                    base: pair.base,
                    quote: pair.quote,
                    direction,
                    differential,
                    baseStrength,
                    quoteStrength,
                    confidence,
                    price: pair.price,
                    tradePlan: buildTradePlan(pair.price, direction, confidence),
                });
            }
        }
        bestPairs.sort((a, b) => b.differential - a.differential);

        // Build economic calendar
        const economicCalendar: Record<string, EconomicEvent[]> = {};
        for (const code of Object.keys(CURRENCIES) as CurrencyCode[]) {
            economicCalendar[code] = getEconomicCalendar(code);
        }

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            currencies,
            forexPairs: forexPairs.slice(0, 30),
            globalFlow,
            bestPairs: bestPairs.slice(0, 10),
            economicCalendar,
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
