// src/app/api/fred/route.ts
// API Route para buscar dados do FRED (Federal Reserve Economic Data)

import { NextResponse } from 'next/server';

const FRED_API_KEY = process.env.FRED_API_KEY;
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

async function fetchFredObservations(seriesId: string, limit: number): Promise<FredObservation[] | null> {
    try {
        if (!FRED_API_KEY) return null;

        const url = new URL(FRED_BASE_URL);
        url.search = new URLSearchParams({
            series_id: seriesId,
            api_key: FRED_API_KEY,
            file_type: 'json',
            sort_order: 'desc',
            limit: String(Math.max(1, limit)),
        }).toString();

        const response = await fetch(url.toString(), {
            next: { revalidate: 3600 },
        });

        if (!response.ok) return null;

        const data = await response.json();
        const observations = data.observations as FredObservation[];
        if (!observations || observations.length === 0) return null;

        return observations;
    } catch {
        return null;
    }
}

async function fetchFredSeriesWithStatus(
    seriesId: string,
    onNonOk?: (status: number, message?: string) => void
): Promise<FredSeriesData | null> {
    try {
        if (!FRED_API_KEY) return null;

        const url = new URL(FRED_BASE_URL);
        url.search = new URLSearchParams({
            series_id: seriesId,
            api_key: FRED_API_KEY,
            file_type: 'json',
            sort_order: 'desc',
            limit: '1',
        }).toString();

        const response = await fetch(url.toString(), { next: { revalidate: 3600 } });
        if (!response.ok) {
            let msg: string | undefined;
            try {
                const text = await response.text();
                try {
                    const json = JSON.parse(text);
                    msg = json?.error_message || json?.error || undefined;
                } catch {
                    msg = text?.slice(0, 300) || undefined;
                }
            } catch {
                msg = undefined;
            }

            onNonOk?.(response.status, msg);
            return null;
        }

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
    WTREGEN: { id: 'WTREGEN', name: 'Treasury General Account (TGA)', unit: 'Millions $' },

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

export async function GET() {
    try {
        if (!FRED_API_KEY) {
            return NextResponse.json(
                { success: false, error: 'Missing FRED_API_KEY' },
                { status: 500 }
            );
        }

        // Buscar todas as séries em paralelo
        const seriesIds = Object.keys(FRED_SERIES);
        let firstNonOkStatus: number | null = null;
        let firstNonOkMessage: string | null = null;
        const noteNonOk = (s: number, msg?: string) => {
            if (firstNonOkStatus === null) {
                firstNonOkStatus = s;
                firstNonOkMessage = msg || null;
            }
        };

        const results: Array<FredSeriesData | null> = [];
        const batchSize = 6;
        for (let i = 0; i < seriesIds.length; i += batchSize) {
            const batch = seriesIds.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map((id) => fetchFredSeriesWithStatus(id, noteNonOk)));
            results.push(...batchResults);
        }

        // Filtrar nulls e criar objeto
        const data: Record<string, FredSeriesData> = {};
        for (const result of results) {
            if (result) {
                data[result.seriesId] = result;
            }
        }

        if (Object.keys(data).length === 0) {
            const statusHint = firstNonOkStatus !== null ? ` Last HTTP status: ${firstNonOkStatus}.` : '';
            const messageHint = firstNonOkMessage ? ` Message: ${firstNonOkMessage}` : '';
            return NextResponse.json(
                {
                    success: false,
                    error: `No FRED series could be fetched. Check FRED_API_KEY validity, rate limits, or network connectivity.${statusHint}${messageHint}`,
                },
                { status: 502 }
            );
        }

        // Calcular métricas derivadas
        const cpiValue = Number.isFinite(data.CPIAUCSL?.value) ? data.CPIAUCSL!.value : null;

        const cpiObs = await fetchFredObservations('CPIAUCSL', 13);
        const cpiObsPrev12 = cpiObs && cpiObs.length >= 13 ? parseFloat(cpiObs[12].value) : NaN;

        const prevCpi = Number.isFinite(cpiObsPrev12) && cpiObsPrev12 > 0 ? cpiObsPrev12 : null;
        const cpiYoY = (cpiValue !== null && prevCpi !== null && prevCpi > 0)
            ? ((cpiValue - prevCpi) / prevCpi) * 100
            : null;

        const gdpValue = Number.isFinite(data.GDPC1?.value) ? data.GDPC1!.value : null;
        const gdpObs = await fetchFredObservations('GDPC1', 5);
        const gdpObsPrev4 = gdpObs && gdpObs.length >= 5 ? parseFloat(gdpObs[4].value) : NaN;
        const prevGdp = Number.isFinite(gdpObsPrev4) && gdpObsPrev4 > 0 ? gdpObsPrev4 : null;
        const gdpYoY = (gdpValue !== null && prevGdp !== null && prevGdp > 0)
            ? ((gdpValue - prevGdp) / prevGdp) * 100
            : null;

        const dgs10 = Number.isFinite(data.DGS10?.value) ? data.DGS10!.value : null;
        const dgs2 = Number.isFinite(data.DGS2?.value) ? data.DGS2!.value : null;
        const yieldCurve = (dgs10 !== null && dgs2 !== null) ? (dgs10 - dgs2) : null;

        // Determinar trends
        const gdpTrend = (gdpYoY !== null)
            ? (gdpYoY > 2 ? 'EXPANDING' : gdpYoY < 1 ? 'SLOWING' : 'STABLE')
            : 'UNKNOWN';

        const inflationTrend = (cpiYoY !== null)
            ? (cpiYoY > 3 ? 'RISING' : cpiYoY < 2 ? 'FALLING' : 'STABLE')
            : 'UNKNOWN';

        const unrate = Number.isFinite(data.UNRATE?.value) ? data.UNRATE!.value : null;
        const employmentTrend = (unrate !== null) ? (unrate < 4.5 ? 'STRONG' : 'MODERATE') : 'UNKNOWN';

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            data,
            summary: {
                gdp: {
                    value: gdpValue,
                    trend: gdpTrend,
                    lastUpdate: data.GDPC1?.date || '',
                },
                inflation: {
                    cpi: cpiValue,
                    cpiYoY,
                    coreCpi: Number.isFinite(data.CPILFESL?.value) ? data.CPILFESL!.value : null,
                    pce: Number.isFinite(data.PCEPI?.value) ? data.PCEPI!.value : null,
                    trend: inflationTrend,
                },
                employment: {
                    unemploymentRate: unrate,
                    nfp: Number.isFinite(data.PAYEMS?.value) ? data.PAYEMS!.value : null,
                    initialClaims: Number.isFinite(data.ICSA?.value) ? data.ICSA!.value : null,
                    trend: employmentTrend,
                },
                rates: {
                    fedFunds: Number.isFinite(data.FEDFUNDS?.value) ? data.FEDFUNDS!.value : null,
                    treasury10y: dgs10,
                    treasury2y: dgs2,
                    yieldCurve,
                    curveStatus: (yieldCurve === null) ? 'UNKNOWN' : yieldCurve < 0 ? 'INVERTED' : yieldCurve < 0.5 ? 'FLAT' : 'NORMAL',
                },
                credit: {
                    aaaSpread: Number.isFinite(data.BAMLC0A0CM?.value) ? data.BAMLC0A0CM!.value : null,
                    hySpread: Number.isFinite(data.BAMLH0A0HYM2?.value) ? data.BAMLH0A0HYM2!.value : null,
                    condition: Number.isFinite(data.BAMLH0A0HYM2?.value) ? (data.BAMLH0A0HYM2!.value > 5 ? 'STRESSED' : 'NORMAL') : 'UNKNOWN',
                },
                sentiment: {
                    consumerSentiment: Number.isFinite(data.UMCSENT?.value) ? data.UMCSENT!.value : null,
                    condition: Number.isFinite(data.UMCSENT?.value) ? (data.UMCSENT!.value > 80 ? 'OPTIMISTIC' : data.UMCSENT!.value < 60 ? 'PESSIMISTIC' : 'NEUTRAL') : 'UNKNOWN',
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
