// src/app/api/fred/route.ts
// API Route para buscar dados do FRED (Federal Reserve Economic Data)

import { NextResponse } from 'next/server';

const FRED_API_KEY = 'd34af9497bff8446f34108d0649d3d98';
const FRED_BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';

interface FredObservation {
    date: string;
    value: string;
}

interface FredSeriesData {
    seriesId: string;
    name: string;
    value: number;
    date: string;
    unit: string;
}

// Séries do FRED que vamos buscar
const FRED_SERIES = {
    // 1. GROWTH & ACTIVITY
    GDP: { id: 'GDP', name: 'GDP', unit: 'Billions $' },
    GDPC1: { id: 'GDPC1', name: 'Real GDP', unit: 'Billions $' },
    INDPRO: { id: 'INDPRO', name: 'Industrial Production', unit: 'Index' },
    RSAFS: { id: 'RSAFS', name: 'Retail Sales', unit: 'Millions $' },
    PCEC96: { id: 'PCEC96', name: 'Real PCE', unit: 'Billions $' },
    AMTMNO: { id: 'AMTMNO', name: 'New Orders (Mfg)', unit: 'Millions $' },

    // 2. INFLATION
    CPIAUCSL: { id: 'CPIAUCSL', name: 'CPI', unit: 'Index' },
    CPILFESL: { id: 'CPILFESL', name: 'Core CPI', unit: 'Index' },
    PCEPI: { id: 'PCEPI', name: 'PCE', unit: 'Index' },
    PCEPILFE: { id: 'PCEPILFE', name: 'Core PCE', unit: 'Index' },
    T5YIE: { id: 'T5YIE', name: '5Y Breakeven Inflation', unit: '%' },

    // 3. LABOR MARKET
    UNRATE: { id: 'UNRATE', name: 'Unemployment Rate', unit: '%' },
    PAYEMS: { id: 'PAYEMS', name: 'Non-Farm Payrolls', unit: 'Thousands' },
    ICSA: { id: 'ICSA', name: 'Initial Claims', unit: 'Thousands' },
    JTSJOL: { id: 'JTSJOL', name: 'JOLTS Openings', unit: 'Thousands' },
    CIVPART: { id: 'CIVPART', name: 'Participation Rate', unit: '%' },

    // 4. RATES & CURVE
    FEDFUNDS: { id: 'FEDFUNDS', name: 'Fed Funds Rate', unit: '%' },
    DGS10: { id: 'DGS10', name: '10-Year Treasury', unit: '%' },
    DGS2: { id: 'DGS2', name: '2-Year Treasury', unit: '%' },
    T10Y2Y: { id: 'T10Y2Y', name: 'Yield Curve (10Y-2Y)', unit: '%' },
    T10Y3M: { id: 'T10Y3M', name: 'Yield Curve (10Y-3M)', unit: '%' },

    // 5. LIQUIDITY & FINANCIAL CONDITIONS
    M2SL: { id: 'M2SL', name: 'M2 Money Supply', unit: 'Billions $' },
    WALCL: { id: 'WALCL', name: 'Fed Total Assets', unit: 'Millions $' },
    RRPONTSYD: { id: 'RRPONTSYD', name: 'Reverse Repo (RRP)', unit: 'Billions $' },

    // 6. CREDIT & STRESS
    BAMLC0A0CM: { id: 'BAMLC0A0CM', name: 'Credit Spread (AAA)', unit: '%' },
    BAMLH0A0HYM2: { id: 'BAMLH0A0HYM2', name: 'High Yield Spread', unit: '%' },
    DRSESP: { id: 'DRSESP', name: 'Delinquency Rate (All Loans)', unit: '%' },
    STLFSI3: { id: 'STLFSI3', name: 'Financial Stress Index', unit: 'Index' },

    // 7. HOUSING
    HOUST: { id: 'HOUST', name: 'Housing Starts', unit: 'Thousands' },
    PERMIT: { id: 'PERMIT', name: 'Building Permits', unit: 'Thousands' },
    CSUSHPINSA: { id: 'CSUSHPINSA', name: 'Case-Shiller Home Price', unit: 'Index' },

    // 8. SENTIMENT & TRADE
    UMCSENT: { id: 'UMCSENT', name: 'Consumer Sentiment', unit: 'Index' },
    BOPTEXP: { id: 'BOPTEXP', name: 'Total Exports', unit: 'Millions $' },
    BOPTIMP: { id: 'BOPTIMP', name: 'Total Imports', unit: 'Millions $' },

    // 9. ENERGY & RISK
    DCOILWTICO: { id: 'DCOILWTICO', name: 'WTI Crude Oil', unit: '$' },
    VIXCLS: { id: 'VIXCLS', name: 'VIX Index', unit: 'Index' },
};

async function fetchFredSeries(seriesId: string): Promise<FredSeriesData | null> {
    try {
        const url = `${FRED_BASE_URL}?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`;

        const response = await fetch(url, {
            next: { revalidate: 3600 }, // Cache por 1 hora
        });

        if (!response.ok) return null;

        const data = await response.json();
        const observations = data.observations as FredObservation[];

        if (!observations || observations.length === 0) return null;

        const latest = observations[0];
        const value = parseFloat(latest.value);

        if (isNaN(value)) return null;

        const series = FRED_SERIES[seriesId as keyof typeof FRED_SERIES];

        return {
            seriesId,
            name: series?.name || seriesId,
            value,
            date: latest.date,
            unit: series?.unit || '',
        };
    } catch {
        return null;
    }
}

export async function GET() {
    try {
        // Buscar todas as séries em paralelo
        const seriesIds = Object.keys(FRED_SERIES);
        const results = await Promise.all(seriesIds.map(fetchFredSeries));

        // Filtrar nulls e criar objeto
        const data: Record<string, FredSeriesData> = {};
        for (const result of results) {
            if (result) {
                data[result.seriesId] = result;
            }
        }

        // Calcular métricas derivadas
        const cpiValue = data.CPIAUCSL?.value || 0;
        const prevCpi = cpiValue * 0.97; // Aproximar CPI anterior (3% YoY)
        const cpiYoY = cpiValue > 0 ? ((cpiValue - prevCpi) / prevCpi) * 100 : 0;

        const yieldCurve = (data.DGS10?.value || 0) - (data.DGS2?.value || 0);

        // Determinar trends
        const gdpTrend = (data.GDPC1?.value || 0) > 20000 ? 'EXPANDING' : 'SLOWING';
        const inflationTrend = cpiYoY > 3 ? 'RISING' : cpiYoY < 2 ? 'FALLING' : 'STABLE';
        const employmentTrend = (data.UNRATE?.value || 5) < 4.5 ? 'STRONG' : 'MODERATE';

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            data,
            summary: {
                gdp: {
                    value: data.GDPC1?.value || 0,
                    trend: gdpTrend,
                    lastUpdate: data.GDPC1?.date || '',
                },
                inflation: {
                    cpi: data.CPIAUCSL?.value || 0,
                    cpiYoY,
                    coreCpi: data.CPILFESL?.value || 0,
                    pce: data.PCEPI?.value || 0,
                    trend: inflationTrend,
                },
                employment: {
                    unemploymentRate: data.UNRATE?.value || 0,
                    nfp: data.PAYEMS?.value || 0,
                    initialClaims: data.ICSA?.value || 0,
                    trend: employmentTrend,
                },
                rates: {
                    fedFunds: data.FEDFUNDS?.value || 0,
                    treasury10y: data.DGS10?.value || 0,
                    treasury2y: data.DGS2?.value || 0,
                    yieldCurve,
                    curveStatus: yieldCurve < 0 ? 'INVERTED' : yieldCurve < 0.5 ? 'FLAT' : 'NORMAL',
                },
                credit: {
                    aaaSpread: data.BAMLC0A0CM?.value || 0,
                    hySpread: data.BAMLH0A0HYM2?.value || 0,
                    condition: (data.BAMLH0A0HYM2?.value || 0) > 5 ? 'STRESSED' : 'NORMAL',
                },
                sentiment: {
                    consumerSentiment: data.UMCSENT?.value || 0,
                    condition: (data.UMCSENT?.value || 50) > 80 ? 'OPTIMISTIC' : (data.UMCSENT?.value || 50) < 60 ? 'PESSIMISTIC' : 'NEUTRAL',
                },
            },
        });
    } catch (error) {
        console.error('FRED API Error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch FRED data' },
            { status: 500 }
        );
    }
}
