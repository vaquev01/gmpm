// src/lib/portfolioManager.ts
// Portfolio Manager do PRD v8.1

export interface Position {
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    currentPrice: number;
    size: number;
    riskR: number;
    stopLoss: number;
    takeProfits: { price: number; hitPercent: number }[];
    openedAt: string;
    unrealizedPnL: number;
    unrealizedPnLPercent: number;
    status: 'OPEN' | 'PARTIAL' | 'CLOSED';
}

export interface PortfolioState {
    equity: number;
    positions: Position[];
    totalRisk: number;
    availableRisk: number;
    healthScore: number;
    exposure: {
        byAssetClass: Record<string, number>;
        byDirection: { long: number; short: number };
        correlation: number;
    };
}

const INITIAL_EQUITY = 100000; // Capital inicial
const MAX_RISK = 6; // Máximo 6% de risco total
const MAX_SINGLE_POSITION = 2; // Máximo 2% por posição

// ===== PORTFOLIO CLASS =====
class PortfolioManager {
    private state: PortfolioState;

    constructor() {
        this.state = {
            equity: INITIAL_EQUITY,
            positions: [],
            totalRisk: 0,
            availableRisk: MAX_RISK,
            healthScore: 100,
            exposure: {
                byAssetClass: {},
                byDirection: { long: 0, short: 0 },
                correlation: 0,
            },
        };

        // Carregar do localStorage se existir
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('gmpm_portfolio');
            if (saved) {
                try {
                    this.state = JSON.parse(saved);
                } catch {
                    // ignore
                }
            }
        }
    }

    getState(): PortfolioState {
        return { ...this.state };
    }

    addPosition(position: Omit<Position, 'id' | 'unrealizedPnL' | 'unrealizedPnLPercent' | 'status'>): Position {
        const id = `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const newPosition: Position = {
            ...position,
            id,
            unrealizedPnL: 0,
            unrealizedPnLPercent: 0,
            status: 'OPEN',
        };

        this.state.positions.push(newPosition);
        this.state.totalRisk += position.riskR;
        this.state.availableRisk = MAX_RISK - this.state.totalRisk;

        this.updateExposure();
        this.save();

        return newPosition;
    }

    updatePosition(id: string, currentPrice: number): void {
        const position = this.state.positions.find(p => p.id === id);
        if (!position) return;

        position.currentPrice = currentPrice;

        if (position.direction === 'LONG') {
            position.unrealizedPnL = (currentPrice - position.entryPrice) * position.size;
            position.unrealizedPnLPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
        } else {
            position.unrealizedPnL = (position.entryPrice - currentPrice) * position.size;
            position.unrealizedPnLPercent = ((position.entryPrice - currentPrice) / position.entryPrice) * 100;
        }

        this.calculateHealthScore();
        this.save();
    }

    closePosition(id: string): void {
        const index = this.state.positions.findIndex(p => p.id === id);
        if (index === -1) return;

        const position = this.state.positions[index];
        position.status = 'CLOSED';

        this.state.equity += position.unrealizedPnL;
        this.state.totalRisk -= position.riskR;
        this.state.availableRisk = MAX_RISK - this.state.totalRisk;

        this.state.positions.splice(index, 1);
        this.updateExposure();
        this.save();
    }

    updateExposure(): void {
        const byAssetClass: Record<string, number> = {};
        let longExposure = 0;
        let shortExposure = 0;

        for (const pos of this.state.positions) {
            const value = pos.currentPrice * pos.size;
            const assetClass = this.getAssetClass(pos.symbol);

            byAssetClass[assetClass] = (byAssetClass[assetClass] || 0) + value;

            if (pos.direction === 'LONG') longExposure += value;
            else shortExposure += value;
        }

        this.state.exposure = {
            byAssetClass,
            byDirection: { long: longExposure, short: shortExposure },
            correlation: this.calculateCorrelation(),
        };
    }

    calculateHealthScore(): void {
        let score = 100;

        // Penalizar por risco total alto
        if (this.state.totalRisk > MAX_RISK * 0.8) score -= 20;
        else if (this.state.totalRisk > MAX_RISK * 0.5) score -= 10;

        // Penalizar por posições com drawdown
        for (const pos of this.state.positions) {
            if (pos.unrealizedPnLPercent < -10) score -= 15;
            else if (pos.unrealizedPnLPercent < -5) score -= 10;
            else if (pos.unrealizedPnLPercent < -2) score -= 5;
        }

        // Penalizar por correlação alta
        if (this.state.exposure.correlation > 0.7) score -= 15;

        this.state.healthScore = Math.max(0, Math.min(100, score));
    }

    calculateCorrelation(): number {
        // Simplificado: assumir correlação baseada na exposição direcional
        const { long, short } = this.state.exposure.byDirection;
        if (long === 0 && short === 0) return 0;

        const netExposure = long - short;
        const totalExposure = long + short;

        return totalExposure > 0 ? Math.abs(netExposure / totalExposure) : 0;
    }

    getAssetClass(symbol: string): string {
        if (symbol.includes('/') || symbol.endsWith('USD') || symbol.endsWith('JPY')) return 'forex';
        if (['BTC', 'ETH', 'SOL', 'XRP', 'ADA'].some(c => symbol.includes(c))) return 'crypto';
        if (['GC', 'SI', 'CL', 'NG'].some(c => symbol.includes(c))) return 'commodities';
        if (symbol.startsWith('^')) return 'indices';
        return 'stocks';
    }

    canOpenPosition(riskR: number): { allowed: boolean; reason?: string } {
        if (riskR > MAX_SINGLE_POSITION) {
            return { allowed: false, reason: `Risco ${riskR}% excede máximo por posição (${MAX_SINGLE_POSITION}%)` };
        }

        if (this.state.totalRisk + riskR > MAX_RISK) {
            return { allowed: false, reason: `Risco total excederia ${MAX_RISK}%` };
        }

        if (this.state.healthScore < 50) {
            return { allowed: false, reason: 'Health score muito baixo. Feche posições em drawdown primeiro.' };
        }

        return { allowed: true };
    }

    defenseMode(): { action: string; positionsToClose: string[] }[] {
        const actions: { action: string; positionsToClose: string[] }[] = [];

        // Identificar posições com alto drawdown
        const badPositions = this.state.positions
            .filter(p => p.unrealizedPnLPercent < -5)
            .sort((a, b) => a.unrealizedPnLPercent - b.unrealizedPnLPercent);

        if (badPositions.length > 0) {
            actions.push({
                action: 'Fechar posições com drawdown > 5%',
                positionsToClose: badPositions.map(p => p.id),
            });
        }

        // Se risco total muito alto
        if (this.state.totalRisk > MAX_RISK * 0.9) {
            const oldestPositions = [...this.state.positions]
                .sort((a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime())
                .slice(0, 2);

            actions.push({
                action: 'Reduzir exposição: fechar posições mais antigas',
                positionsToClose: oldestPositions.map(p => p.id),
            });
        }

        return actions;
    }

    private save(): void {
        if (typeof window !== 'undefined') {
            localStorage.setItem('gmpm_portfolio', JSON.stringify(this.state));
        }
    }
}

// Singleton - only create on client side
let portfolioInstance: PortfolioManager | null = null;

export function getPortfolioManager(): PortfolioManager {
    // Only create instance on client side
    if (typeof window === 'undefined') {
        // Return a dummy state for SSR
        return {
            getState: () => ({
                equity: 100000,
                positions: [],
                totalRisk: 0,
                availableRisk: 6,
                healthScore: 100,
                exposure: {
                    byAssetClass: {},
                    byDirection: { long: 0, short: 0 },
                    correlation: 0,
                },
            }),
            addPosition: () => ({} as Position),
            updatePosition: () => { },
            closePosition: () => { },
            canOpenPosition: () => ({ allowed: true }),
            defenseMode: () => [],
        } as unknown as PortfolioManager;
    }

    if (!portfolioInstance) {
        portfolioInstance = new PortfolioManager();
    }
    return portfolioInstance;
}

export function resetPortfolio(): void {
    if (typeof window !== 'undefined') {
        localStorage.removeItem('gmpm_portfolio');
    }
    portfolioInstance = null;
}
