// src/app/api/calendar/route.ts
// Economic Calendar - Real data from multiple sources

import { NextResponse } from 'next/server';

const FRED_API_KEY = process.env.FRED_API_KEY;
const FRED_RELEASES_URL = 'https://api.stlouisfed.org/fred/releases';
const FRED_RELEASE_DATES_URL = 'https://api.stlouisfed.org/fred/release/dates';

interface EconomicEvent {
    id: string;
    date: string;
    time: string;
    country: string;
    countryCode: string;
    currency: string;
    event: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
    previous: string | null;
    forecast: string | null;
    actual: string | null;
    unit: string;
    isUpcoming: boolean;
    tradingImplication: string;
}

// Real economic events from public sources
async function fetchUSEvents(): Promise<EconomicEvent[]> {
    // Use Federal Reserve Economic Data for US events
    const events: EconomicEvent[] = [];

    try {
        if (!FRED_API_KEY) return events;

        const releasesUrl = new URL(FRED_RELEASES_URL);
        releasesUrl.search = new URLSearchParams({
            api_key: FRED_API_KEY,
            file_type: 'json',
            limit: '20',
        }).toString();

        // FRED releases calendar
        const response = await fetch(releasesUrl.toString(), { next: { revalidate: 3600 } });

        if (response.ok) {
            const data = await response.json();
            const releases = data.releases || [];

            for (const release of releases.slice(0, 10)) {
                const releaseDatesUrl = new URL(FRED_RELEASE_DATES_URL);
                releaseDatesUrl.search = new URLSearchParams({
                    release_id: String(release.id),
                    api_key: FRED_API_KEY,
                    file_type: 'json',
                    limit: '1',
                    include_release_dates_with_no_data: 'true',
                    sort_order: 'desc',
                }).toString();

                // Get next release date
                const releaseDateResp = await fetch(releaseDatesUrl.toString(), { next: { revalidate: 3600 } });

                if (releaseDateResp.ok) {
                    const dateData = await releaseDateResp.json();
                    const releaseDates = dateData.release_dates || [];

                    if (releaseDates.length > 0) {
                        const releaseDate = releaseDates[0].date;

                        events.push({
                            id: `fred_${release.id}`,
                            date: releaseDate,
                            time: '08:30',
                            country: 'United States',
                            countryCode: 'US',
                            currency: 'USD',
                            event: release.name,
                            impact: determineImpact(release.name),
                            previous: null,
                            forecast: null,
                            actual: null,
                            unit: '',
                            isUpcoming: new Date(releaseDate) > new Date(),
                            tradingImplication: getImplicationFromEvent(release.name),
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error('FRED calendar error:', error);
    }

    return events;
}

function determineImpact(eventName: string): 'HIGH' | 'MEDIUM' | 'LOW' {
    const highImpact = [
        'Employment', 'Payroll', 'NFP', 'CPI', 'Inflation', 'GDP', 'FOMC', 'Fed',
        'Interest Rate', 'PCE', 'Retail Sales', 'ISM', 'Consumer Confidence'
    ];

    const mediumImpact = [
        'Housing', 'Durable Goods', 'Industrial', 'Producer Price', 'Trade Balance',
        'Jobless Claims', 'Manufacturing'
    ];

    const nameLower = eventName.toLowerCase();

    if (highImpact.some(h => nameLower.includes(h.toLowerCase()))) return 'HIGH';
    if (mediumImpact.some(m => nameLower.includes(m.toLowerCase()))) return 'MEDIUM';
    return 'LOW';
}

function getImplicationFromEvent(eventName: string): string {
    const implications: Record<string, string> = {
        'Employment': 'Higher than expected = USD bullish, stocks bullish',
        'CPI': 'Higher than expected = USD mixed (hawkish Fed), bonds bearish',
        'GDP': 'Higher than expected = USD bullish, stocks bullish',
        'FOMC': 'Hawkish = USD bullish, stocks bearish. Dovish = opposite',
        'Interest Rate': 'Rate hike = USD bullish, stocks bearish',
        'Retail Sales': 'Higher than expected = USD bullish, consumer stocks bullish',
        'Consumer Confidence': 'Higher = risk-on, stocks bullish',
        'Housing': 'Higher = economy strong, financials bullish',
        'ISM': 'Above 50 = expansion, stocks bullish',
    };

    for (const [key, impl] of Object.entries(implications)) {
        if (eventName.toLowerCase().includes(key.toLowerCase())) return impl;
    }

    return 'Monitor for surprise deviation from expectations';
}

// Get upcoming major scheduled events (static but regularly updated patterns)
function getScheduledEvents(): EconomicEvent[] {
    const today = new Date();
    const events: EconomicEvent[] = [];

    // Major recurring US events (approximate schedules)
    const recurringEvents = [
        { name: 'US Non-Farm Payrolls', day: 'first_friday', impact: 'HIGH' as const, currency: 'USD' },
        { name: 'FOMC Interest Rate Decision', day: 'fomc_meeting', impact: 'HIGH' as const, currency: 'USD' },
        { name: 'US CPI (Inflation)', day: 'mid_month', impact: 'HIGH' as const, currency: 'USD' },
        { name: 'US Retail Sales', day: 'mid_month', impact: 'MEDIUM' as const, currency: 'USD' },
        { name: 'ECB Interest Rate Decision', day: 'ecb_meeting', impact: 'HIGH' as const, currency: 'EUR' },
        { name: 'BOE Interest Rate Decision', day: 'boe_meeting', impact: 'HIGH' as const, currency: 'GBP' },
        { name: 'BOJ Interest Rate Decision', day: 'boj_meeting', impact: 'HIGH' as const, currency: 'JPY' },
        { name: 'US Weekly Jobless Claims', day: 'thursday', impact: 'MEDIUM' as const, currency: 'USD' },
    ];

    // Calculate next occurrence
    for (const event of recurringEvents) {
        let nextDate: Date;

        switch (event.day) {
            case 'first_friday':
                nextDate = getNextFirstFriday(today);
                break;
            case 'thursday':
                nextDate = getNextWeekday(today, 4);
                break;
            case 'mid_month':
                nextDate = getNextMidMonth(today);
                break;
            default:
                nextDate = new Date(today);
                nextDate.setDate(today.getDate() + 7);
        }

        events.push({
            id: `sched_${event.name.replace(/\s/g, '_').toLowerCase()}`,
            date: nextDate.toISOString().split('T')[0],
            time: event.currency === 'USD' ? '08:30' : event.currency === 'EUR' ? '07:45' : '03:00',
            country: getCurrencyCountry(event.currency),
            countryCode: getCountryCode(event.currency),
            currency: event.currency,
            event: event.name,
            impact: event.impact,
            previous: null,
            forecast: null,
            actual: null,
            unit: '',
            isUpcoming: true,
            tradingImplication: getImplicationFromEvent(event.name),
        });
    }

    return events;
}

function getNextFirstFriday(from: Date): Date {
    const result = new Date(from.getFullYear(), from.getMonth(), 1);
    while (result.getDay() !== 5) {
        result.setDate(result.getDate() + 1);
    }
    if (result < from) {
        result.setMonth(result.getMonth() + 1);
        result.setDate(1);
        while (result.getDay() !== 5) {
            result.setDate(result.getDate() + 1);
        }
    }
    return result;
}

function getNextWeekday(from: Date, weekday: number): Date {
    const result = new Date(from);
    result.setDate(from.getDate() + ((weekday - from.getDay() + 7) % 7 || 7));
    return result;
}

function getNextMidMonth(from: Date): Date {
    const result = new Date(from.getFullYear(), from.getMonth(), 15);
    if (result < from) {
        result.setMonth(result.getMonth() + 1);
    }
    return result;
}

function getCurrencyCountry(currency: string): string {
    const map: Record<string, string> = {
        'USD': 'United States', 'EUR': 'Eurozone', 'GBP': 'United Kingdom',
        'JPY': 'Japan', 'AUD': 'Australia', 'CAD': 'Canada', 'CHF': 'Switzerland',
    };
    return map[currency] || currency;
}

function getCountryCode(currency: string): string {
    const map: Record<string, string> = {
        'USD': 'US', 'EUR': 'EU', 'GBP': 'GB', 'JPY': 'JP',
        'AUD': 'AU', 'CAD': 'CA', 'CHF': 'CH',
    };
    return map[currency] || currency;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7');
    const impactFilter = searchParams.get('impact')?.toUpperCase();

    try {
        // Fetch from multiple sources
        const [fredEvents, scheduledEvents] = await Promise.all([
            fetchUSEvents(),
            Promise.resolve(getScheduledEvents()),
        ]);

        // Combine and dedupe
        const allEvents = [...fredEvents, ...scheduledEvents];
        const uniqueEvents = Array.from(
            new Map(allEvents.map(e => [e.id, e])).values()
        );

        // Filter by date range
        const now = new Date();
        const endDate = new Date();
        endDate.setDate(now.getDate() + days);

        let filteredEvents = uniqueEvents.filter(e => {
            const eventDate = new Date(e.date);
            return eventDate >= now && eventDate <= endDate;
        });

        // Filter by impact if specified
        if (impactFilter && ['HIGH', 'MEDIUM', 'LOW'].includes(impactFilter)) {
            filteredEvents = filteredEvents.filter(e => e.impact === impactFilter);
        }

        // Sort by date
        filteredEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Summary
        const highImpact = filteredEvents.filter(e => e.impact === 'HIGH');
        const byDay = filteredEvents.reduce((acc, e) => {
            acc[e.date] = (acc[e.date] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            range: { start: now.toISOString().split('T')[0], end: endDate.toISOString().split('T')[0] },
            summary: {
                total: filteredEvents.length,
                highImpact: highImpact.length,
                nextHighImpact: highImpact[0]?.event || null,
                nextHighImpactDate: highImpact[0]?.date || null,
                eventsByDay: byDay,
            },
            events: filteredEvents,
        });
    } catch (error) {
        console.error('Calendar API Error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch calendar' },
            { status: 500 }
        );
    }
}
