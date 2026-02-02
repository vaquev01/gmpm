// src/app/api/cot/route.ts
// COT Data - Fetching real data from CFTC

import { NextResponse } from 'next/server';

interface COTData {
    instrument: string;
    reportDate: string;
    // Commercial (Hedgers)
    commercialLong: number;
    commercialShort: number;
    commercialNet: number;
    commercialChange: number;
    // Non-Commercial (Speculators)
    nonCommercialLong: number;
    nonCommercialShort: number;
    nonCommercialNet: number;
    nonCommercialChange: number;
    // Open Interest
    openInterest: number;
    openInterestChange: number;
    // Analysis
    positioningBias: 'EXTREMELY_LONG' | 'LONG' | 'NEUTRAL' | 'SHORT' | 'EXTREMELY_SHORT';
    percentileLong: number;
    signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

// CFTC API endpoint (real data, updated weekly on Fridays)
const CFTC_API = 'https://publicreporting.cftc.gov/resource/6dca-aqww.json';

// Instrument mapping to CFTC contract codes
const INSTRUMENT_MAP: Record<string, { name: string; code: string }> = {
    'EUR': { name: 'EURO FX', code: '099741' },
    'GBP': { name: 'BRITISH POUND', code: '096742' },
    'JPY': { name: 'JAPANESE YEN', code: '097741' },
    'AUD': { name: 'AUSTRALIAN DOLLAR', code: '232741' },
    'CAD': { name: 'CANADIAN DOLLAR', code: '090741' },
    'CHF': { name: 'SWISS FRANC', code: '092741' },
    'NZD': { name: 'NEW ZEALAND DOLLAR', code: '112741' },
    'MXN': { name: 'MEXICAN PESO', code: '095741' },
    'GOLD': { name: 'GOLD', code: '088691' },
    'SILVER': { name: 'SILVER', code: '084691' },
    'CRUDE': { name: 'CRUDE OIL', code: '067651' },
    'NATGAS': { name: 'NATURAL GAS', code: '023651' },
    'SP500': { name: 'E-MINI S&P 500', code: '13874A' },
    'NASDAQ': { name: 'E-MINI NASDAQ', code: '209742' },
    'DOW': { name: 'E-MINI DOW', code: '12460+' },
    'VIX': { name: 'VIX FUTURES', code: '1170E1' },
    'CORN': { name: 'CORN', code: '002602' },
    'WHEAT': { name: 'WHEAT', code: '001602' },
    'SOYBEANS': { name: 'SOYBEANS', code: '005602' },
    'COPPER': { name: 'COPPER', code: '085692' },
    '10Y': { name: '10-YR TREASURY', code: '043602' },
    '2Y': { name: '2-YR TREASURY', code: '042601' },
    'BTC': { name: 'BITCOIN', code: '133741' },
};

async function fetchCOTData(contractCode: string): Promise<COTData | null> {
    try {
        // Query CFTC API for specific contract
        const query = `$where=cftc_contract_market_code='${contractCode}'&$order=report_date_as_yyyy_mm_dd DESC&$limit=2`;
        const url = `${CFTC_API}?${query}`;

        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            next: { revalidate: 3600 }, // Cache 1 hour
        });

        if (!response.ok) return null;

        const data = await response.json();

        if (!data || data.length === 0) return null;

        const latest = data[0];
        const previous = data[1];

        // Parse values
        const commLong = parseInt(latest.comm_positions_long_all || '0');
        const commShort = parseInt(latest.comm_positions_short_all || '0');
        const nonCommLong = parseInt(latest.noncomm_positions_long_all || '0');
        const nonCommShort = parseInt(latest.noncomm_positions_short_all || '0');
        const oi = parseInt(latest.open_interest_all || '0');

        // Previous week for change calculation
        const prevNonCommNet = previous
            ? parseInt(previous.noncomm_positions_long_all || '0') - parseInt(previous.noncomm_positions_short_all || '0')
            : 0;
        const prevCommNet = previous
            ? parseInt(previous.comm_positions_long_all || '0') - parseInt(previous.comm_positions_short_all || '0')
            : 0;
        const prevOI = previous ? parseInt(previous.open_interest_all || '0') : 0;

        const nonCommNet = nonCommLong - nonCommShort;
        const commNet = commLong - commShort;

        // Calculate percentile (simplified - would need historical data for accurate)
        const maxPosition = Math.max(nonCommLong, nonCommShort);
        const percentileLong = maxPosition > 0 ? (nonCommLong / maxPosition) * 100 : 50;

        // Determine positioning bias
        let positioningBias: COTData['positioningBias'] = 'NEUTRAL';
        if (percentileLong > 80) positioningBias = 'EXTREMELY_LONG';
        else if (percentileLong > 60) positioningBias = 'LONG';
        else if (percentileLong < 20) positioningBias = 'EXTREMELY_SHORT';
        else if (percentileLong < 40) positioningBias = 'SHORT';

        // Signal based on extreme positioning (contrarian)
        let signal: COTData['signal'] = 'NEUTRAL';
        if (positioningBias === 'EXTREMELY_LONG') signal = 'BEARISH'; // Contrarian
        else if (positioningBias === 'EXTREMELY_SHORT') signal = 'BULLISH'; // Contrarian
        else if (nonCommNet > prevNonCommNet && nonCommNet > 0) signal = 'BULLISH';
        else if (nonCommNet < prevNonCommNet && nonCommNet < 0) signal = 'BEARISH';

        return {
            instrument: latest.market_and_exchange_names || '',
            reportDate: latest.report_date_as_yyyy_mm_dd || '',
            commercialLong: commLong,
            commercialShort: commShort,
            commercialNet: commNet,
            commercialChange: commNet - prevCommNet,
            nonCommercialLong: nonCommLong,
            nonCommercialShort: nonCommShort,
            nonCommercialNet: nonCommNet,
            nonCommercialChange: nonCommNet - prevNonCommNet,
            openInterest: oi,
            openInterestChange: oi - prevOI,
            positioningBias,
            percentileLong: Math.round(percentileLong),
            signal,
        };
    } catch (error) {
        console.error('COT fetch error:', error);
        return null;
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const instruments = searchParams.get('instruments')?.split(',') || ['EUR', 'GOLD', 'SP500', 'CRUDE', 'BTC'];

    try {
        const results: COTData[] = [];

        for (const instrument of instruments.slice(0, 10)) {
            const mapping = INSTRUMENT_MAP[instrument.toUpperCase()];
            if (mapping) {
                const data = await fetchCOTData(mapping.code);
                if (data) {
                    results.push(data);
                }
            }
        }

        // Summary analysis
        const bullishCount = results.filter(r => r.signal === 'BULLISH').length;
        const bearishCount = results.filter(r => r.signal === 'BEARISH').length;

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            source: 'CFTC Commitments of Traders',
            count: results.length,
            summary: {
                bullish: bullishCount,
                bearish: bearishCount,
                neutral: results.length - bullishCount - bearishCount,
                overallBias: bullishCount > bearishCount ? 'RISK_ON' : bearishCount > bullishCount ? 'RISK_OFF' : 'MIXED',
            },
            data: results,
        });
    } catch (error) {
        console.error('COT API Error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch COT data' },
            { status: 500 }
        );
    }
}
