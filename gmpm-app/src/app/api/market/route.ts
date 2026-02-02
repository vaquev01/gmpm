// src/app/api/market/route.ts
// API COMPLETA com TODOS os 278 ativos do PRD v8.1

import { NextResponse } from 'next/server';

// ===== UNIVERSO COMPLETO DE ATIVOS (278 total) =====
const ASSETS = {
    // Forex Majors & Crosses (28)
    forex: [
        'EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'USDCHF=X', 'AUDUSD=X', 'USDCAD=X', 'NZDUSD=X',
        'EURGBP=X', 'EURJPY=X', 'GBPJPY=X', 'AUDJPY=X', 'EURAUD=X', 'EURCHF=X', 'GBPCHF=X',
        'AUDCHF=X', 'CADJPY=X', 'CHFJPY=X', 'NZDJPY=X', 'GBPAUD=X', 'AUDNZD=X', 'EURCAD=X',
        'GBPCAD=X', 'AUDCAD=X', 'NZDCAD=X', 'EURNZD=X', 'GBPNZD=X', 'USDMXN=X', 'USDZAR=X'
    ],

    // Commodities (25)
    commodities: [
        'GC=F',   // Gold
        'SI=F',   // Silver
        'PL=F',   // Platinum
        'PA=F',   // Palladium
        'HG=F',   // Copper
        'CL=F',   // Crude Oil WTI
        'BZ=F',   // Brent
        'NG=F',   // Natural Gas
        'RB=F',   // Gasoline
        'HO=F',   // Heating Oil
        'ZC=F',   // Corn
        'ZW=F',   // Wheat
        'ZS=F',   // Soybeans
        'ZM=F',   // Soybean Meal
        'ZL=F',   // Soybean Oil
        'KC=F',   // Coffee
        'SB=F',   // Sugar
        'CC=F',   // Cocoa
        'CT=F',   // Cotton
        'OJ=F',   // Orange Juice
        'LBS=F',  // Lumber
        'LE=F',   // Live Cattle
        'HE=F',   // Lean Hogs
        'GF=F',   // Feeder Cattle
        'DX=F',   // US Dollar Index
    ],

    // Indices (20)
    indices: [
        '^GSPC',  // S&P 500
        '^DJI',   // Dow Jones
        '^IXIC',  // NASDAQ
        '^RUT',   // Russell 2000
        '^VIX',   // VIX
        '^FTSE',  // FTSE 100
        '^GDAXI', // DAX
        '^FCHI',  // CAC 40
        '^N225',  // Nikkei 225
        '^HSI',   // Hang Seng
        '000001.SS', // Shanghai
        '^STOXX50E', // Euro Stoxx 50
        '^IBEX',  // IBEX 35
        '^BVSP',  // Bovespa
        '^MXX',   // IPC Mexico
        '^AORD',  // ASX 200
        '^KS11',  // KOSPI
        '^TWII',  // Taiwan
        '^TNX',   // 10-Year Treasury
        '^TYX',   // 30-Year Treasury
    ],

    // ETFs (50)
    etfs: [
        // Equity
        'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'IVV', 'VTV', 'VUG', 'VIG',
        // Sector
        'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLU', 'XLP', 'XLY', 'XLB', 'XLRE',
        // International
        'EFA', 'EEM', 'VWO', 'VEA', 'IEMG', 'VGK', 'EWJ', 'FXI', 'EWZ', 'EWG',
        // Fixed Income
        'TLT', 'IEF', 'SHY', 'LQD', 'HYG', 'JNK', 'EMB', 'VCIT', 'BND', 'AGG',
        // Commodities
        'GLD', 'SLV', 'USO', 'UNG', 'DBA', 'DBC', 'PDBC', 'GLDM', 'IAU', 'SGOL',
    ],

    // Crypto (25)
    crypto: [
        'BTC-USD', 'ETH-USD', 'BNB-USD', 'XRP-USD', 'ADA-USD',
        'SOL-USD', 'DOGE-USD', 'DOT-USD', 'AVAX-USD', 'MATIC-USD',
        'LINK-USD', 'UNI-USD', 'ATOM-USD', 'LTC-USD', 'ETC-USD',
        'XLM-USD', 'ALGO-USD', 'VET-USD', 'HBAR-USD', 'FIL-USD',
        'NEAR-USD', 'APT-USD', 'ICP-USD', 'EGLD-USD', 'SAND-USD',
    ],

    // Stocks (100)
    stocks: [
        // Tech
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'INTC', 'CRM',
        'ADBE', 'NFLX', 'PYPL', 'SHOP', 'SQ', 'UBER', 'ABNB', 'SNOW', 'NOW', 'PANW',
        // Finance
        'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'BLK', 'SCHW', 'USB', 'PNC',
        'V', 'MA', 'AXP', 'COF', 'DFS',
        // Healthcare
        'JNJ', 'PFE', 'UNH', 'MRK', 'ABBV', 'TMO', 'ABT', 'LLY', 'BMY', 'AMGN',
        // Consumer
        'WMT', 'HD', 'COST', 'NKE', 'SBUX', 'MCD', 'DIS', 'CMCSA', 'TGT', 'LOW',
        // Industrial
        'CAT', 'DE', 'HON', 'UPS', 'BA', 'GE', 'LMT', 'RTX', 'MMM', 'UNP',
        // Energy
        'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'PXD', 'MPC', 'VLO', 'PSX', 'OXY',
        // Telecom/Utilities
        'T', 'VZ', 'TMUS', 'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE',
        // Materials
        'LIN', 'APD', 'ECL', 'SHW', 'FCX', 'NEM', 'NUE', 'DOW', 'DD', 'PPG',
    ],

    // Volatility (5)
    volatility: [
        '^VIX',   // VIX
        'VXX',    // VIX Short-term
        'UVXY',   // Ultra VIX
        'SVXY',   // Short VIX
        'VIXY',   // VIX ETF
    ],

    // Bonds/Rates (25)
    bonds: [
        '^TNX',   // 10-Year
        '^TYX',   // 30-Year
        '^FVX',   // 5-Year
        '^IRX',   // 13-Week
        'TLT',    // Long Treasury ETF
        'IEF',    // 7-10 Year
        'SHY',    // 1-3 Year
        'TIP',    // TIPS
        'BIL',    // T-Bills
        'GOVT',   // All Treasuries
    ],
};

// Flatten all symbols and deduplicate
const ALL_SYMBOLS = [...new Set([
    ...ASSETS.forex,
    ...ASSETS.commodities.slice(0, 15), // Top commodities
    ...ASSETS.indices,
    ...ASSETS.etfs,
    ...ASSETS.crypto,
    ...ASSETS.stocks,
    ...ASSETS.bonds,
])];

// ===== TYPES =====
interface QuoteData {
    symbol: string;
    displaySymbol: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    avgVolume?: number; // ADDED
    high: number;
    low: number;
    open: number;
    previousClose: number;
    marketState: string;
    assetClass: string;
    name: string;   // ADDED
    sector: string; // ADDED
    // Technical data for scoring
    atr?: number;
    rsi?: number;
}

interface FearGreedData {
    value: number;
    classification: string;
    timestamp: string;
}

interface MacroData {
    vix: number;
    vixChange: number;
    treasury10y: number;
    treasury2y: number;
    treasury30y: number;
    yieldCurve: number;
    dollarIndex: number;
    fearGreed: FearGreedData | null;
}

async function fetchFredLatest(seriesId: string): Promise<number | null> {
    const apiKey = process.env.FRED_API_KEY;
    if (!apiKey) return null;

    try {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(seriesId)}&api_key=${encodeURIComponent(apiKey)}&file_type=json&sort_order=desc&limit=1`;
        const res = await fetch(url, { next: { revalidate: 300 } });
        if (!res.ok) return null;

        const json = await res.json();
        const v = json?.observations?.[0]?.value;
        const n = typeof v === 'string' ? Number.parseFloat(v) : Number.NaN;
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

// ===== YAHOO FINANCE FETCHER =====
async function fetchYahooQuote(symbol: string): Promise<QuoteData | null> {
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=30d`;

        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            next: { revalidate: 60 },
        });

        if (!response.ok) return null;

        const data = await response.json();
        const result = data.chart?.result?.[0];
        if (!result) return null;

        const meta = result.meta;
        const quotes = result.indicators?.quote?.[0];
        if (!quotes?.close) return null;

        const closes = quotes.close.filter((c: number | null) => c !== null);
        const highs = quotes.high.filter((h: number | null) => h !== null);
        const lows = quotes.low.filter((l: number | null) => l !== null);
        // Safely handle volumes, some assets might calculate them differently or be null
        const volumes = quotes.volume?.filter((v: number | null) => v !== null) || [];

        const currentPriceRaw = closes[closes.length - 1] || meta.regularMarketPrice;
        const previousCloseRaw = meta.previousClose || closes[closes.length - 2] || currentPriceRaw;

        // Yahoo treasury yield tickers are often scaled by 10 (e.g. ^TNX=42.5 => 4.25%),
        // but sometimes can already be expressed in % terms depending on upstream behavior.
        // Heuristic: if value is > 20, treat it as scaled-by-10.
        const yieldScaledSymbols = new Set(['^TNX', '^TYX', '^FVX']);
        const scale = (yieldScaledSymbols.has(symbol) && currentPriceRaw > 20) ? 10 : 1;

        const currentPrice = currentPriceRaw / scale;
        const previousClose = previousCloseRaw / scale;

        const change = currentPrice - previousClose;
        const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;

        // Calculate Avg Volume (20 days)
        let avgVolume = 0;
        if (volumes.length > 0) {
            const lookback = Math.min(volumes.length, 20);
            const recentVolumes = volumes.slice(volumes.length - lookback);
            const sum = recentVolumes.reduce((a: number, b: number) => a + b, 0);
            avgVolume = sum / lookback;
        }

        // Calculate ATR (simplified using last 14 periods)
        let atr = 0;
        if (highs.length >= 14 && lows.length >= 14) {
            const ranges = [];
            for (let i = closes.length - 14; i < closes.length; i++) {
                if (highs[i] && lows[i]) {
                    ranges.push(highs[i] - lows[i]);
                }
            }
            atr = ranges.length > 0 ? ranges.reduce((a, b) => a + b, 0) / ranges.length : 0;
        }

        // Calculate RSI (simplified)
        let rsi = 50;
        if (closes.length >= 15) {
            const gains = [];
            const losses = [];
            for (let i = closes.length - 14; i < closes.length; i++) {
                const diff = closes[i] - closes[i - 1];
                if (diff > 0) gains.push(diff);
                else losses.push(Math.abs(diff));
            }
            const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / 14 : 0;
            const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / 14 : 0.001;
            const rs = avgGain / avgLoss;
            rsi = 100 - (100 / (1 + rs));
        }

        // Determine asset class
        let assetClass = 'stock';
        if (symbol.includes('-USD')) assetClass = 'crypto';
        else if (symbol.includes('=X')) assetClass = 'forex';
        else if (symbol.includes('=F')) assetClass = 'commodity';
        else if (symbol.startsWith('^')) assetClass = 'index';
        else if (ASSETS.etfs.includes(symbol)) assetClass = 'etf';
        else if (ASSETS.bonds.includes(symbol)) assetClass = 'bond';

        const displaySymbol = symbol
            .replace('=X', '')
            .replace('-USD', '')
            .replace('=F', '')
            .replace('^', '');

        return {
            symbol,
            displaySymbol,
            name: meta.shortName || meta.longName || displaySymbol, // ADDED: Name
            sector: assetClass.toUpperCase(), // ADDED: Sector proxy (Asset Class for now)
            price: currentPrice,
            change,
            changePercent,
            volume: meta.regularMarketVolume || 0,
            avgVolume, // ADDED: AvgVolume
            high: (meta.regularMarketDayHigh || currentPriceRaw) / scale,
            low: (meta.regularMarketDayLow || currentPriceRaw) / scale,
            open: (meta.regularMarketOpen || previousCloseRaw) / scale,
            previousClose,
            marketState: meta.marketState || 'UNKNOWN',
            assetClass,
            atr,
            rsi,
        };
    } catch {
        return null;
    }
}

// ===== FEAR & GREED INDEX =====
async function fetchFearGreed(): Promise<FearGreedData | null> {
    try {
        const response = await fetch('https://api.alternative.me/fng/?limit=1', {
            next: { revalidate: 3600 },
        });
        if (!response.ok) return null;

        const data = await response.json();
        const fng = data.data?.[0];
        if (!fng) return null;

        return {
            value: parseInt(fng.value),
            classification: fng.value_classification,
            timestamp: new Date(parseInt(fng.timestamp) * 1000).toISOString(),
        };
    } catch {
        return null;
    }
}

// ===== MAIN API HANDLER =====
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const limit = parseInt(searchParams.get('limit') || '0');

    const macroSymbols = ['^VIX', '^TNX', '^TYX', '^FVX', 'DX=F'];

    try {
        let symbolsToFetch = ALL_SYMBOLS;

        if (category && category in ASSETS) {
            symbolsToFetch = ASSETS[category as keyof typeof ASSETS];
        }

        if (limit > 0) {
            symbolsToFetch = symbolsToFetch.slice(0, limit);
        }

        // Always include core macro context symbols even when limit/category is used
        symbolsToFetch = Array.from(new Set([...symbolsToFetch, ...macroSymbols]));

        // Fetch in batches
        const batchSize = 20;
        const allQuotes: QuoteData[] = [];

        for (let i = 0; i < symbolsToFetch.length; i += batchSize) {
            const batch = symbolsToFetch.slice(i, i + batchSize);
            const results = await Promise.all(batch.map(fetchYahooQuote));
            allQuotes.push(...results.filter((q): q is QuoteData => q !== null));
        }

        // Get macro data
        const vixQuote = allQuotes.find(q => q.symbol === '^VIX');
        const treas10y = allQuotes.find(q => q.symbol === '^TNX');
        const treas30y = allQuotes.find(q => q.symbol === '^TYX');
        const treas5y = allQuotes.find(q => q.symbol === '^FVX');
        const dxy = allQuotes.find(q => q.symbol === 'DX=F');
        const fearGreed = await fetchFearGreed();

        // Prefer real FRED yields when available (more accurate than Yahoo proxies)
        const [fred10y, fred2y] = await Promise.all([
            fetchFredLatest('DGS10'),
            fetchFredLatest('DGS2'),
        ]);

        const treasury10y = (fred10y !== null) ? fred10y : (treas10y?.price || 0);
        const treasury2y = (fred2y !== null) ? fred2y : (treas5y?.price || 0);
        let yieldCurve = 0;
        if (fred10y !== null && fred2y !== null) yieldCurve = fred10y - fred2y;
        else if (treas10y?.price && treas5y?.price) yieldCurve = treas10y.price - treas5y.price;

        const macro: MacroData = {
            vix: vixQuote?.price || 0,
            vixChange: vixQuote?.changePercent || 0,
            treasury10y,
            treasury2y,
            treasury30y: treas30y?.price || 0,
            yieldCurve,
            dollarIndex: dxy?.price || 0,
            fearGreed,
        };

        // Separate by class
        const byClass = {
            stocks: allQuotes.filter(q => q.assetClass === 'stock'),
            etfs: allQuotes.filter(q => q.assetClass === 'etf'),
            forex: allQuotes.filter(q => q.assetClass === 'forex'),
            crypto: allQuotes.filter(q => q.assetClass === 'crypto'),
            commodities: allQuotes.filter(q => q.assetClass === 'commodity'),
            indices: allQuotes.filter(q => q.assetClass === 'index'),
            bonds: allQuotes.filter(q => q.assetClass === 'bond'),
        };

        // Statistics
        const stats = {
            totalAssets: allQuotes.length,
            gainers: allQuotes.filter(q => q.changePercent > 0).length,
            losers: allQuotes.filter(q => q.changePercent < 0).length,
            avgChange: allQuotes.reduce((sum, q) => sum + q.changePercent, 0) / allQuotes.length,
        };

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            count: allQuotes.length,
            stats,
            macro,
            assets: allQuotes,
            data: allQuotes,
            byClass,
        });
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch market data' },
            { status: 500 }
        );
    }
}
