'use client';

// ===== STRESS TEST ENGINE =====
// Simulates extreme market scenarios ("Black Swans") on the portfolio

import { calculatePortfolioRisk } from './portfolioCorrelation';

export interface StressScenario {
    name: string;
    description: string;
    marketShock: number; // % drop in market
    volatilitySpike: number; // % increase in VIX/Spread
    correlationShock: boolean; // Panic -> Correlation goes to 1
    liquidityCrunch: boolean; // Spreads widen massively
}

export interface StressResult {
    scenario: string;
    portfolioImpact: number; // Estimated % loss
    survivability: 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL';
    maxDrawdown: number;
    warnings: string[];
}

const SCENARIOS: StressScenario[] = [
    {
        name: 'Flash Crash',
        description: 'Instant -10% market drop in 5 mins',
        marketShock: -10,
        volatilitySpike: 300,
        correlationShock: false,
        liquidityCrunch: true
    },
    {
        name: 'Global Recession',
        description: 'Slow bleed -30% over 6 months',
        marketShock: -30,
        volatilitySpike: 50,
        correlationShock: true, // Asset classes correlate in panic
        liquidityCrunch: false
    },
    {
        name: 'Liquidity Crisis',
        description: 'Spreads widen 5x, slippage massive',
        marketShock: -5,
        volatilitySpike: 500,
        correlationShock: false,
        liquidityCrunch: true
    },
    {
        name: 'Interest Rate Shock',
        description: 'Rates +200bps overnight',
        marketShock: -15, // Impact on tech/growth
        volatilitySpike: 100,
        correlationShock: false,
        liquidityCrunch: false
    }
];

export function runStressTest(currentCapital: number, exposure: number): StressResult[] {
    // This function estimates the impact of scenarios on the CURRENT portfolio
    // For MVP, we simulate impact based on beta/exposure
    // In production, this would simulate each open position individually

    return SCENARIOS.map(scenario => {
        let estimatedLoss = 0;

        // 1. Beta Impact (Market Shock)
        // Assume portfolio beta is 1.0 for simplification (should be calculated)
        let portfolioBeta = 1.0;
        if (scenario.correlationShock) portfolioBeta = 1.5; // Correlations break down

        estimatedLoss += Math.abs(scenario.marketShock) * portfolioBeta * (exposure / currentCapital);

        // 2. Liquidity Cost (Slippage)
        if (scenario.liquidityCrunch) {
            // Assume 2% slippage cost on entire exposure if forced to close
            estimatedLoss += 2.0;
        }

        // 3. Volatility Cost (Option/Premium decay or widened stops)
        // Simplified heuristic
        estimatedLoss += scenario.volatilitySpike * 0.01;

        // Cap loss at 100% (ruin)
        const totalImpactPercent = Math.min(100, estimatedLoss);

        // Determine survivability
        let survivability: 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL' = 'HIGH';
        if (totalImpactPercent > 5 && totalImpactPercent <= 15) survivability = 'MEDIUM';
        if (totalImpactPercent > 15 && totalImpactPercent <= 30) survivability = 'LOW';
        if (totalImpactPercent > 30) survivability = 'CRITICAL';

        const warnings = [];
        if (totalImpactPercent > 20) warnings.push('Portfolio likely to hit Stop-Out level');
        if (scenario.liquidityCrunch) warnings.push('Execution warnings: Stops may not trigger');

        return {
            scenario: scenario.name,
            portfolioImpact: -totalImpactPercent,
            survivability,
            maxDrawdown: totalImpactPercent * 1.5, // Estimation
            warnings
        };
    });
}
