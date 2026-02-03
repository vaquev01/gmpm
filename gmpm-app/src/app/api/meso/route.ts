import { NextResponse } from 'next/server';
import type { RegimeSnapshot } from '@/lib/regimeEngine';

// Fetch regime snapshot from our own API
async function fetchRegimeSnapshot(): Promise<RegimeSnapshot | null> {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';
    try {
        const res = await fetch(`${baseUrl}/api/regime`, { cache: 'no-store' });
        if (!res.ok) return null;
        const data = await res.json();
        return data.success ? data.snapshot : null;
    } catch {
        return null;
    }
}

// Asset class definitions with sectors
const ASSET_CLASSES = {
    stocks: {
        name: 'Equities',
        sectors: ['Technology', 'Financials', 'Healthcare', 'Consumer', 'Energy', 'Industrials'],
        symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'JPM', 'V', 'JNJ', 'XOM'],
    },
    crypto: {
        name: 'Crypto',
        sectors: ['Layer 1', 'DeFi', 'Meme', 'Stablecoins'],
        symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD'],
    },
    forex: {
        name: 'Forex',
        sectors: ['Majors', 'Commodity FX', 'EM FX'],
        symbols: ['EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'AUDUSD=X', 'USDCAD=X'],
    },
    commodities: {
        name: 'Commodities',
        sectors: ['Metals', 'Energy', 'Agriculture'],
        symbols: ['GC=F', 'SI=F', 'CL=F', 'NG=F', 'ZC=F'],
    },
    bonds: {
        name: 'Fixed Income',
        sectors: ['Treasuries', 'Corporate', 'High Yield'],
        symbols: ['TLT', 'IEF', 'HYG', 'LQD', 'BND'],
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

export async function GET() {
    try {
        // Fetch regime snapshot
        const regime = await fetchRegimeSnapshot();

        if (!regime) {
            return NextResponse.json({
                success: false,
                error: 'Failed to get regime snapshot',
            }, { status: 500 });
        }

        // Analyze each asset class
        const classAnalysis: ClassAnalysis[] = Object.keys(ASSET_CLASSES).map(cls =>
            deriveClassExpectation(cls, regime)
        );

        // Sector analysis
        const sectorAnalysis = deriveSectorAnalysis(regime);

        // Sort by conviction (liquidityScore * confidence multiplier)
        const confidenceMultiplier = { HIGH: 1.5, MEDIUM: 1.0, LOW: 0.5 };
        classAnalysis.sort((a, b) => {
            const scoreA = a.liquidityScore * confidenceMultiplier[a.confidence];
            const scoreB = b.liquidityScore * confidenceMultiplier[b.confidence];
            return scoreB - scoreA;
        });

        // Top opportunities across all classes
        const topOpportunities = classAnalysis
            .filter(c => c.direction === 'LONG' && c.expectation === 'BULLISH')
            .slice(0, 3)
            .map(c => ({
                class: c.name,
                picks: c.topPicks,
                confidence: c.confidence,
            }));

        // Risk warnings
        const riskWarnings = classAnalysis
            .filter(c => c.direction === 'AVOID' || c.volatilityRisk === 'HIGH')
            .map(c => `${c.name}: ${c.drivers[0] || 'High risk'}`);

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            regime: {
                type: regime.regime,
                confidence: regime.regimeConfidence,
                drivers: regime.dominantDrivers,
            },
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
        });
    } catch (error) {
        console.error('Meso API error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
