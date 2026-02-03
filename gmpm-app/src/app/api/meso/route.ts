import { NextResponse } from 'next/server';
import type { RegimeSnapshot } from '@/lib/regimeEngine';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';

// Fetch regime snapshot from our own API
async function fetchRegimeSnapshot(): Promise<RegimeSnapshot | null> {
    try {
        const res = await fetch(`${baseUrl}/api/regime`, { cache: 'no-store' });
        if (!res.ok) return null;
        const data = await res.json();
        return data.success ? data.snapshot : null;
    } catch {
        return null;
    }
}

// Fetch market data with real prices
interface MarketAsset {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    volume?: number;
    assetClass?: string;
}

interface MacroData {
    vix?: number;
    vixChange?: number;
    treasury10y?: number;
    treasury2y?: number;
    yieldCurve?: number;
    dollarIndex?: number;
    fearGreed?: number;
}

async function fetchMarketData(): Promise<{ assets: MarketAsset[], macro: MacroData }> {
    try {
        const res = await fetch(`${baseUrl}/api/market?limit=150`, { cache: 'no-store' });
        if (!res.ok) return { assets: [], macro: {} };
        const data = await res.json();
        return { 
            assets: data.assets || [], 
            macro: data.macro || {} 
        };
    } catch {
        return { assets: [], macro: {} };
    }
}

// Asset class definitions with sectors
const ASSET_CLASSES = {
    stocks: {
        name: 'Equities',
        sectors: ['Technology', 'Financials', 'Healthcare', 'Consumer', 'Energy', 'Industrials'],
        symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'JPM', 'V', 'JNJ', 'XOM'],
        benchmarks: ['^GSPC', '^DJI', '^IXIC'],
    },
    crypto: {
        name: 'Crypto',
        sectors: ['Layer 1', 'DeFi', 'Meme'],
        symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD'],
        benchmarks: ['BTC-USD'],
    },
    forex: {
        name: 'Forex',
        sectors: ['Majors', 'Commodity FX', 'EM FX'],
        symbols: ['EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'AUDUSD=X', 'USDCAD=X'],
        benchmarks: ['DX=F'],
    },
    commodities: {
        name: 'Commodities',
        sectors: ['Metals', 'Energy', 'Agriculture'],
        symbols: ['GC=F', 'SI=F', 'CL=F', 'NG=F', 'ZC=F'],
        benchmarks: ['GC=F', 'CL=F'],
    },
    bonds: {
        name: 'Fixed Income',
        sectors: ['Treasuries', 'Corporate', 'High Yield'],
        symbols: ['TLT', 'IEF', 'HYG', 'LQD', 'BND'],
        benchmarks: ['^TNX'],
    },
};

interface ClassAnalysis {
    class: string;
    name: string;
    expectation: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'MIXED';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    direction: 'LONG' | 'SHORT' | 'AVOID';
    drivers: string[];
    liquidityScore: number; // 0-100
    volatilityRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    topPicks: string[];
    avoidList: string[];
}

interface SectorAnalysis {
    sector: string;
    parentClass: string;
    expectation: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    momentum: number; // -100 to 100
    relativeStrength: number; // vs market
}

function deriveClassExpectation(
    assetClass: string,
    regime: RegimeSnapshot
): ClassAnalysis {
    const axes = regime.axes;
    const regimeType = regime.regime;
    const tilts = regime.mesoTilts;
    const prohibitions = regime.mesoProhibitions;

    let expectation: ClassAnalysis['expectation'] = 'NEUTRAL';
    let confidence: ClassAnalysis['confidence'] = 'MEDIUM';
    let direction: ClassAnalysis['direction'] = 'AVOID';
    const drivers: string[] = [];
    let liquidityScore = 50;
    let volatilityRisk: ClassAnalysis['volatilityRisk'] = 'MEDIUM';
    const topPicks: string[] = [];
    const avoidList: string[] = [];

    // Get class info
    const classInfo = ASSET_CLASSES[assetClass as keyof typeof ASSET_CLASSES];
    if (!classInfo) {
        return {
            class: assetClass,
            name: assetClass,
            expectation: 'NEUTRAL',
            confidence: 'LOW',
            direction: 'AVOID',
            drivers: ['Unknown asset class'],
            liquidityScore: 0,
            volatilityRisk: 'HIGH',
            topPicks: [],
            avoidList: [],
        };
    }

    // STOCKS
    if (assetClass === 'stocks') {
        // Growth positive = bullish stocks
        if (axes.G.direction === '↑↑' || axes.G.direction === '↑') {
            expectation = 'BULLISH';
            drivers.push('Growth expanding');
            direction = 'LONG';
        } else if (axes.G.direction === '↓↓' || axes.G.direction === '↓') {
            expectation = 'BEARISH';
            drivers.push('Growth contracting');
            direction = 'SHORT';
        }

        // Liquidity boost
        if (axes.L.direction === '↑↑' || axes.L.direction === '↑') {
            liquidityScore += 20;
            drivers.push('Liquidity supportive');
            if (expectation === 'NEUTRAL') expectation = 'BULLISH';
        } else if (axes.L.direction === '↓↓') {
            liquidityScore -= 30;
            drivers.push('Liquidity draining');
            if (expectation === 'BULLISH') expectation = 'MIXED';
        }

        // Volatility check
        if (axes.V.direction === '↑↑') {
            volatilityRisk = 'HIGH';
            drivers.push('Elevated volatility');
            confidence = 'LOW';
        } else if (axes.V.direction === '↓' || axes.V.direction === '↓↓') {
            volatilityRisk = 'LOW';
            liquidityScore += 10;
        }

        // Regime-specific
        if (regimeType === 'GOLDILOCKS' || regimeType === 'REFLATION') {
            expectation = 'BULLISH';
            confidence = 'HIGH';
            topPicks.push('NVDA', 'MSFT', 'AAPL');
        } else if (regimeType === 'STAGFLATION' || regimeType === 'DEFLATION') {
            expectation = 'BEARISH';
            avoidList.push('Growth stocks', 'High beta');
            topPicks.push('JNJ', 'PG'); // Defensive
        } else if (regimeType === 'RISK_OFF') {
            expectation = 'BEARISH';
            direction = 'AVOID';
            avoidList.push('All equities');
        }
    }

    // CRYPTO
    else if (assetClass === 'crypto') {
        // Crypto loves liquidity and risk-on
        if (axes.L.direction === '↑↑' || axes.L.direction === '↑') {
            expectation = 'BULLISH';
            drivers.push('Liquidity expansion');
            liquidityScore = 70;
        } else if (axes.L.direction === '↓↓') {
            expectation = 'BEARISH';
            drivers.push('Liquidity drain');
            liquidityScore = 20;
            direction = 'AVOID';
        }

        // Dollar strength hurts crypto
        if (axes.D.direction === '↑↑' || axes.D.direction === '↑') {
            if (expectation === 'BULLISH') expectation = 'MIXED';
            drivers.push('Dollar strength headwind');
        } else if (axes.D.direction === '↓↓' || axes.D.direction === '↓') {
            drivers.push('Dollar weakness tailwind');
            if (expectation === 'NEUTRAL') expectation = 'BULLISH';
        }

        volatilityRisk = 'HIGH'; // Crypto always high vol

        if (regimeType === 'GOLDILOCKS' || regimeType === 'REFLATION') {
            expectation = 'BULLISH';
            confidence = 'MEDIUM';
            direction = 'LONG';
            topPicks.push('BTC-USD', 'ETH-USD', 'SOL-USD');
        } else if (regimeType === 'RISK_OFF' || regimeType === 'LIQUIDITY_DRAIN') {
            expectation = 'BEARISH';
            direction = 'AVOID';
            avoidList.push('All crypto');
        }
    }

    // FOREX
    else if (assetClass === 'forex') {
        // Dollar direction is key
        if (axes.D.direction === '↑↑' || axes.D.direction === '↑') {
            drivers.push('USD strength');
            topPicks.push('USDJPY Long', 'EURUSD Short');
            avoidList.push('AUDUSD Long', 'Commodity FX Long');
        } else if (axes.D.direction === '↓↓' || axes.D.direction === '↓') {
            drivers.push('USD weakness');
            topPicks.push('EURUSD Long', 'GBPUSD Long');
            avoidList.push('USDJPY Long');
        }

        // Risk sentiment
        if (regimeType === 'RISK_ON' || regimeType === 'GOLDILOCKS') {
            expectation = 'BULLISH';
            drivers.push('Risk-on favors high-yielders');
            topPicks.push('AUDUSD', 'NZDUSD');
        } else if (regimeType === 'RISK_OFF') {
            expectation = 'MIXED';
            drivers.push('Safe haven flows');
            topPicks.push('USDJPY Short', 'USDCHF Short');
        }

        volatilityRisk = 'MEDIUM';
        liquidityScore = 80; // Forex always liquid
        direction = 'LONG'; // Always tradeable
        confidence = 'MEDIUM';
    }

    // COMMODITIES
    else if (assetClass === 'commodities') {
        // Inflation positive for commodities
        if (axes.I.direction === '↑↑' || axes.I.direction === '↑') {
            expectation = 'BULLISH';
            drivers.push('Inflation rising');
            topPicks.push('GC=F', 'SI=F'); // Gold, Silver
        } else if (axes.I.direction === '↓↓' || axes.I.direction === '↓') {
            drivers.push('Inflation cooling');
        }

        // Dollar inverse
        if (axes.D.direction === '↓↓' || axes.D.direction === '↓') {
            if (expectation !== 'BULLISH') expectation = 'BULLISH';
            drivers.push('Weak dollar supports commodities');
        } else if (axes.D.direction === '↑↑') {
            if (expectation === 'BULLISH') expectation = 'MIXED';
            drivers.push('Strong dollar headwind');
        }

        // Growth for energy
        if (axes.G.direction === '↑↑' || axes.G.direction === '↑') {
            topPicks.push('CL=F'); // Oil
            drivers.push('Growth supports energy demand');
        }

        if (regimeType === 'STAGFLATION') {
            expectation = 'BULLISH';
            confidence = 'HIGH';
            direction = 'LONG';
            topPicks.push('GC=F', 'CL=F');
        }

        volatilityRisk = 'MEDIUM';
        liquidityScore = 60;
    }

    // BONDS
    else if (assetClass === 'bonds') {
        // Inflation bad for bonds
        if (axes.I.direction === '↑↑' || axes.I.direction === '↑') {
            expectation = 'BEARISH';
            drivers.push('Rising inflation hurts bonds');
            direction = 'SHORT';
            avoidList.push('Long duration', 'TLT');
        } else if (axes.I.direction === '↓↓' || axes.I.direction === '↓') {
            expectation = 'BULLISH';
            drivers.push('Falling inflation supports bonds');
            direction = 'LONG';
            topPicks.push('TLT', 'IEF');
        }

        // Growth inverse (flight to safety)
        if (axes.G.direction === '↓↓') {
            if (expectation !== 'BULLISH') expectation = 'BULLISH';
            drivers.push('Growth concerns support bonds');
            topPicks.push('TLT');
        }

        if (regimeType === 'DEFLATION' || regimeType === 'RISK_OFF') {
            expectation = 'BULLISH';
            confidence = 'HIGH';
            direction = 'LONG';
        } else if (regimeType === 'REFLATION' || regimeType === 'STAGFLATION') {
            expectation = 'BEARISH';
            direction = 'AVOID';
        }

        volatilityRisk = 'LOW';
        liquidityScore = 90;
    }

    // Check regime tilts for this class
    const relevantTilts = tilts.filter(t =>
        t.asset.toLowerCase().includes(assetClass) ||
        classInfo.symbols.some(s => t.asset.includes(s))
    );

    if (relevantTilts.length > 0) {
        const topTilt = relevantTilts[0];
        if (topTilt.direction === 'LONG' && expectation !== 'BEARISH') {
            direction = 'LONG';
        } else if (topTilt.direction === 'SHORT' && expectation !== 'BULLISH') {
            direction = 'SHORT';
        }
    }

    // Check prohibitions
    const isProhibited = prohibitions.some(p =>
        p.toLowerCase().includes(assetClass) ||
        p.toLowerCase().includes(classInfo.name.toLowerCase())
    );

    if (isProhibited) {
        direction = 'AVOID';
        drivers.push('Regime prohibition active');
    }

    return {
        class: assetClass,
        name: classInfo.name,
        expectation,
        confidence,
        direction,
        drivers,
        liquidityScore: Math.max(0, Math.min(100, liquidityScore)),
        volatilityRisk,
        topPicks: [...new Set(topPicks)].slice(0, 3),
        avoidList: [...new Set(avoidList)].slice(0, 3),
    };
}

function deriveSectorAnalysis(regime: RegimeSnapshot): SectorAnalysis[] {
    const sectors: SectorAnalysis[] = [];
    const regimeType = regime.regime;
    const axes = regime.axes;

    // Tech sector
    let techMomentum = 0;
    if (axes.G.direction === '↑↑') techMomentum += 40;
    else if (axes.G.direction === '↑') techMomentum += 20;
    else if (axes.G.direction === '↓') techMomentum -= 20;
    else if (axes.G.direction === '↓↓') techMomentum -= 40;

    if (axes.L.direction === '↑↑') techMomentum += 30;
    else if (axes.L.direction === '↓↓') techMomentum -= 30;

    sectors.push({
        sector: 'Technology',
        parentClass: 'stocks',
        expectation: techMomentum > 20 ? 'BULLISH' : techMomentum < -20 ? 'BEARISH' : 'NEUTRAL',
        momentum: techMomentum,
        relativeStrength: regimeType === 'GOLDILOCKS' ? 120 : regimeType === 'RISK_OFF' ? 70 : 100,
    });

    // Financials
    let finMomentum = 0;
    if (axes.G.direction === '↑↑' || axes.G.direction === '↑') finMomentum += 25;
    if (axes.I.direction === '↑') finMomentum += 15; // Higher rates help banks
    if (axes.C.direction === '↓↓') finMomentum -= 40; // Credit stress bad

    sectors.push({
        sector: 'Financials',
        parentClass: 'stocks',
        expectation: finMomentum > 15 ? 'BULLISH' : finMomentum < -15 ? 'BEARISH' : 'NEUTRAL',
        momentum: finMomentum,
        relativeStrength: regimeType === 'CREDIT_STRESS' ? 50 : 100,
    });

    // Energy
    let energyMomentum = 0;
    if (axes.G.direction === '↑↑' || axes.G.direction === '↑') energyMomentum += 30;
    if (axes.I.direction === '↑↑' || axes.I.direction === '↑') energyMomentum += 25;

    sectors.push({
        sector: 'Energy',
        parentClass: 'stocks',
        expectation: energyMomentum > 20 ? 'BULLISH' : energyMomentum < -20 ? 'BEARISH' : 'NEUTRAL',
        momentum: energyMomentum,
        relativeStrength: regimeType === 'STAGFLATION' ? 130 : regimeType === 'DEFLATION' ? 60 : 100,
    });

    // Healthcare (defensive)
    let healthMomentum = 0;
    if (axes.G.direction === '↓↓' || axes.G.direction === '↓') healthMomentum += 20;
    if (axes.V.direction === '↑↑') healthMomentum += 15;

    sectors.push({
        sector: 'Healthcare',
        parentClass: 'stocks',
        expectation: healthMomentum > 10 ? 'BULLISH' : 'NEUTRAL',
        momentum: healthMomentum,
        relativeStrength: regimeType === 'RISK_OFF' ? 120 : 100,
    });

    // Gold/Metals
    let metalsMomentum = 0;
    if (axes.I.direction === '↑↑' || axes.I.direction === '↑') metalsMomentum += 35;
    if (axes.D.direction === '↓↓' || axes.D.direction === '↓') metalsMomentum += 25;
    if (axes.V.direction === '↑↑') metalsMomentum += 20;

    sectors.push({
        sector: 'Precious Metals',
        parentClass: 'commodities',
        expectation: metalsMomentum > 25 ? 'BULLISH' : metalsMomentum < -25 ? 'BEARISH' : 'NEUTRAL',
        momentum: metalsMomentum,
        relativeStrength: regimeType === 'STAGFLATION' ? 140 : 100,
    });

    // Layer 1 Crypto
    let l1Momentum = 0;
    if (axes.L.direction === '↑↑') l1Momentum += 40;
    else if (axes.L.direction === '↑') l1Momentum += 20;
    else if (axes.L.direction === '↓↓') l1Momentum -= 40;

    if (axes.D.direction === '↓↓' || axes.D.direction === '↓') l1Momentum += 20;

    sectors.push({
        sector: 'Layer 1 Crypto',
        parentClass: 'crypto',
        expectation: l1Momentum > 20 ? 'BULLISH' : l1Momentum < -20 ? 'BEARISH' : 'NEUTRAL',
        momentum: l1Momentum,
        relativeStrength: regimeType === 'GOLDILOCKS' ? 150 : regimeType === 'RISK_OFF' ? 40 : 100,
    });

    return sectors;
}

// Generate weekly/daily focus based on regime and market conditions
function generateTemporalFocus(
    regime: RegimeSnapshot,
    macro: MacroData,
    classAnalysis: ClassAnalysis[]
): {
    weeklyThesis: string;
    dailyFocus: string[];
    keyLevels: { asset: string; level: number; type: 'support' | 'resistance'; significance: string }[];
    catalysts: { event: string; timing: string; impact: string; affectedClasses: string[] }[];
    actionPlan: { timeframe: string; action: string; rationale: string }[];
} {
    const regimeType = regime.regime;
    const vix = macro.vix || 20;
    const yieldCurve = macro.yieldCurve || 0;
    
    // Weekly thesis based on regime
    let weeklyThesis = '';
    const dailyFocus: string[] = [];
    
    switch (regimeType) {
        case 'GOLDILOCKS':
            weeklyThesis = 'Ambiente favorável para risco. Crescimento saudável com inflação controlada. Priorizar long em equities e crypto. Bonds neutro a negativo.';
            dailyFocus.push('Buscar pullbacks em tech leaders para entrada');
            dailyFocus.push('Monitorar BTC como termômetro de apetite a risco');
            dailyFocus.push('Evitar shorts - tendência de alta predomina');
            break;
        case 'REFLATION':
            weeklyThesis = 'Economia acelerando com inflação subindo. Favorecer commodities, energy e value stocks. Evitar bonds de longa duration.';
            dailyFocus.push('Ouro e prata como hedge de inflação');
            dailyFocus.push('Energy stocks em momentum positivo');
            dailyFocus.push('Reduzir exposição a growth stocks');
            break;
        case 'STAGFLATION':
            weeklyThesis = 'Cenário adverso: inflação alta com crescimento fraco. Defensivo é a palavra. Ouro, cash e utilities. Evitar risco.';
            dailyFocus.push('Gold como proteção principal');
            dailyFocus.push('Evitar equities cíclicas');
            dailyFocus.push('Considerar shorts táticos em tech');
            break;
        case 'DEFLATION':
            weeklyThesis = 'Risco de contração econômica. Flight to quality para treasuries. Evitar commodities e crypto.';
            dailyFocus.push('Long TLT e bonds de qualidade');
            dailyFocus.push('Evitar todo risco cíclico');
            dailyFocus.push('Cash é posição válida');
            break;
        case 'RISK_OFF':
            weeklyThesis = 'Aversão a risco elevada. Preservação de capital é prioridade. Treasuries, USD e ouro. Evitar equities e crypto.';
            dailyFocus.push('Reduzir exposição imediatamente');
            dailyFocus.push('Safe havens: USD, JPY, CHF, Gold');
            dailyFocus.push('Não tentar pegar facas caindo');
            break;
        case 'RISK_ON':
            weeklyThesis = 'Apetite por risco retornando. Momento de aumentar exposição gradualmente. Favorece equities e crypto.';
            dailyFocus.push('Aumentar beta gradualmente');
            dailyFocus.push('Crypto pode liderar o rally');
            dailyFocus.push('Reduzir hedges defensivos');
            break;
        default:
            weeklyThesis = 'Regime misto - cautela recomendada. Manter posições balanceadas e aguardar definição de tendência.';
            dailyFocus.push('Manter stops apertados');
            dailyFocus.push('Tamanho de posição reduzido');
            dailyFocus.push('Aguardar confirmação de direção');
    }
    
    // Key levels based on VIX
    const keyLevels: { asset: string; level: number; type: 'support' | 'resistance'; significance: string }[] = [];
    
    if (vix < 15) {
        keyLevels.push({ asset: 'VIX', level: 12, type: 'support', significance: 'Complacência extrema - risco de spike' });
        keyLevels.push({ asset: 'SPX', level: 5000, type: 'resistance', significance: 'Nível psicológico' });
    } else if (vix > 25) {
        keyLevels.push({ asset: 'VIX', level: 30, type: 'resistance', significance: 'Pico de medo - possível reversão' });
        keyLevels.push({ asset: 'SPX', level: 4500, type: 'support', significance: 'Suporte técnico importante' });
    }
    
    if (yieldCurve < -0.5) {
        keyLevels.push({ asset: '10Y-2Y Spread', level: -0.5, type: 'support', significance: 'Inversão profunda - sinal recessivo' });
    }
    
    // Catalysts for the week
    const catalysts: { event: string; timing: string; impact: string; affectedClasses: string[] }[] = [
        { 
            event: 'Fed Minutes / Decisão de Juros', 
            timing: 'Verificar calendário', 
            impact: vix > 20 ? 'ALTO' : 'MÉDIO',
            affectedClasses: ['bonds', 'stocks', 'forex']
        },
        { 
            event: 'Dados de Inflação (CPI/PCE)', 
            timing: 'Verificar calendário', 
            impact: 'ALTO',
            affectedClasses: ['bonds', 'commodities', 'forex']
        },
        { 
            event: 'Earnings Season', 
            timing: 'Contínuo', 
            impact: 'ALTO para stocks individuais',
            affectedClasses: ['stocks']
        },
    ];
    
    // Action plan based on conviction
    const bullishClasses = classAnalysis.filter(c => c.expectation === 'BULLISH' && c.confidence !== 'LOW');
    const bearishClasses = classAnalysis.filter(c => c.expectation === 'BEARISH');
    
    const actionPlan: { timeframe: string; action: string; rationale: string }[] = [];
    
    if (bullishClasses.length > 0) {
        const topBullish = bullishClasses[0];
        actionPlan.push({
            timeframe: 'Esta semana',
            action: `Aumentar exposição em ${topBullish.name}`,
            rationale: topBullish.drivers.join('; ')
        });
    }
    
    if (bearishClasses.length > 0) {
        const topBearish = bearishClasses[0];
        actionPlan.push({
            timeframe: 'Esta semana',
            action: `Reduzir/evitar ${topBearish.name}`,
            rationale: topBearish.drivers.join('; ')
        });
    }
    
    actionPlan.push({
        timeframe: 'Diário',
        action: vix > 25 ? 'Stops mais largos, tamanho reduzido' : 'Gestão normal de risco',
        rationale: `VIX em ${vix.toFixed(1)} - ${vix > 25 ? 'volatilidade elevada' : 'volatilidade normal'}`
    });
    
    return { weeklyThesis, dailyFocus, keyLevels, catalysts, actionPlan };
}

// Calculate class performance from real market data
function calculateClassPerformance(
    classKey: string,
    assets: MarketAsset[]
): { avgChange: number; topPerformer: { symbol: string; change: number } | null; worstPerformer: { symbol: string; change: number } | null; count: number } {
    const classInfo = ASSET_CLASSES[classKey as keyof typeof ASSET_CLASSES];
    if (!classInfo) return { avgChange: 0, topPerformer: null, worstPerformer: null, count: 0 };
    
    const classAssets = assets.filter(a => 
        classInfo.symbols.includes(a.symbol) || 
        classInfo.benchmarks.includes(a.symbol) ||
        a.assetClass === classKey
    );
    
    if (classAssets.length === 0) return { avgChange: 0, topPerformer: null, worstPerformer: null, count: 0 };
    
    const avgChange = classAssets.reduce((sum, a) => sum + (a.changePercent || 0), 0) / classAssets.length;
    
    const sorted = [...classAssets].sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));
    
    return {
        avgChange,
        topPerformer: sorted[0] ? { symbol: sorted[0].symbol, change: sorted[0].changePercent } : null,
        worstPerformer: sorted[sorted.length - 1] ? { symbol: sorted[sorted.length - 1].symbol, change: sorted[sorted.length - 1].changePercent } : null,
        count: classAssets.length
    };
}

export async function GET() {
    try {
        // Fetch regime snapshot AND market data in parallel
        const [regime, marketData] = await Promise.all([
            fetchRegimeSnapshot(),
            fetchMarketData()
        ]);

        if (!regime) {
            return NextResponse.json({
                success: false,
                error: 'Failed to get regime snapshot',
            }, { status: 500 });
        }

        const { assets, macro } = marketData;

        // Analyze each asset class with real performance data
        const classAnalysis: (ClassAnalysis & { 
            performance: { avgChange: number; topPerformer: { symbol: string; change: number } | null; worstPerformer: { symbol: string; change: number } | null };
        })[] = Object.keys(ASSET_CLASSES).map(cls => {
            const baseAnalysis = deriveClassExpectation(cls, regime);
            const performance = calculateClassPerformance(cls, assets);
            return { ...baseAnalysis, performance };
        });

        // Sector analysis
        const sectorAnalysis = deriveSectorAnalysis(regime);

        // Sort by conviction (liquidityScore * confidence multiplier)
        const confidenceMultiplier = { HIGH: 1.5, MEDIUM: 1.0, LOW: 0.5 };
        classAnalysis.sort((a, b) => {
            const scoreA = a.liquidityScore * confidenceMultiplier[a.confidence];
            const scoreB = b.liquidityScore * confidenceMultiplier[b.confidence];
            return scoreB - scoreA;
        });

        // Generate temporal focus
        const temporalFocus = generateTemporalFocus(regime, macro, classAnalysis);

        // Top opportunities across all classes
        const topOpportunities = classAnalysis
            .filter(c => c.direction === 'LONG' && c.expectation === 'BULLISH')
            .slice(0, 3)
            .map(c => ({
                class: c.name,
                picks: c.topPicks,
                confidence: c.confidence,
                currentPerformance: c.performance.avgChange,
            }));

        // Risk warnings
        const riskWarnings = classAnalysis
            .filter(c => c.direction === 'AVOID' || c.volatilityRisk === 'HIGH')
            .map(c => `${c.name}: ${c.drivers[0] || 'High risk'}`);

        // Executive summary
        const bullishCount = classAnalysis.filter(c => c.expectation === 'BULLISH').length;
        const bearishCount = classAnalysis.filter(c => c.expectation === 'BEARISH').length;
        
        let marketBias: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL' = 'NEUTRAL';
        if (bullishCount >= 3) marketBias = 'RISK_ON';
        else if (bearishCount >= 3) marketBias = 'RISK_OFF';

        const executiveSummary = {
            marketBias,
            regimeLabel: regime.regime,
            vix: macro.vix || null,
            yieldCurve: macro.yieldCurve || null,
            dollarIndex: macro.dollarIndex || null,
            fearGreed: macro.fearGreed || null,
            classBreakdown: {
                bullish: classAnalysis.filter(c => c.expectation === 'BULLISH').map(c => c.name),
                bearish: classAnalysis.filter(c => c.expectation === 'BEARISH').map(c => c.name),
                neutral: classAnalysis.filter(c => c.expectation === 'NEUTRAL' || c.expectation === 'MIXED').map(c => c.name),
            },
            oneLineSummary: temporalFocus.weeklyThesis,
        };

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            executiveSummary,
            regime: {
                type: regime.regime,
                confidence: regime.regimeConfidence,
                drivers: regime.dominantDrivers,
                axes: {
                    G: { direction: regime.axes.G.direction, label: 'Growth' },
                    I: { direction: regime.axes.I.direction, label: 'Inflation' },
                    L: { direction: regime.axes.L.direction, label: 'Liquidity' },
                    C: { direction: regime.axes.C.direction, label: 'Credit' },
                    D: { direction: regime.axes.D.direction, label: 'Dollar' },
                    V: { direction: regime.axes.V.direction, label: 'Volatility' },
                },
            },
            temporalFocus,
            classes: classAnalysis,
            sectors: sectorAnalysis,
            summary: {
                topOpportunities,
                riskWarnings,
                tiltsActive: regime.mesoTilts.length,
                prohibitionsActive: regime.mesoProhibitions.length,
            },
            tilts: regime.mesoTilts,
            prohibitions: regime.mesoProhibitions,
            macro: {
                vix: macro.vix,
                treasury10y: macro.treasury10y,
                treasury2y: macro.treasury2y,
                yieldCurve: macro.yieldCurve,
                dollarIndex: macro.dollarIndex,
                fearGreed: macro.fearGreed,
            },
        });
    } catch (error) {
        console.error('Meso API error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
