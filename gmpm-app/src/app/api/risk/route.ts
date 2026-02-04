import { NextResponse } from 'next/server';
import { serverLog } from '@/lib/serverLogs';
import {
    calculateKellyFromTrades,
    calculateDrawdownState,
    calculateRiskBudget,
    generateRiskReport,
    calculateInstitutionalPositionSize,
    type InstitutionalRiskReport,
} from '@/lib/riskManager';

// Cache for risk report
let cachedReport: InstitutionalRiskReport | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

// Simulated historical data (in production, fetch from database)
function getSimulatedTrades(): { pnl: number; risk: number; date: string }[] {
    // Generate realistic trade history based on typical system performance
    const trades: { pnl: number; risk: number; date: string }[] = [];
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - 90); // 90 days history
    
    // Simulate ~60 trades over 90 days
    for (let i = 0; i < 60; i++) {
        const dayOffset = Math.floor(Math.random() * 90);
        const date = new Date(baseDate);
        date.setDate(date.getDate() + dayOffset);
        
        const risk = 1 + Math.random() * 1; // 1-2% risk per trade
        const isWin = Math.random() < 0.58; // 58% win rate
        
        let pnl: number;
        if (isWin) {
            // Win: 1.2-2.5R
            pnl = risk * (1.2 + Math.random() * 1.3);
        } else {
            // Loss: -0.8 to -1.0R (some with partial stops)
            pnl = -risk * (0.8 + Math.random() * 0.2);
        }
        
        trades.push({
            pnl,
            risk,
            date: date.toISOString(),
        });
    }
    
    return trades.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function getSimulatedEquityCurve(): { date: string; equity: number }[] {
    const trades = getSimulatedTrades();
    const curve: { date: string; equity: number }[] = [];
    let equity = 100000;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);
    
    // Daily equity curve
    for (let day = 0; day <= 90; day++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(currentDate.getDate() + day);
        const dateStr = currentDate.toISOString().split('T')[0];
        
        // Find trades on this day
        const dayTrades = trades.filter(t => t.date.startsWith(dateStr));
        for (const trade of dayTrades) {
            equity += (trade.pnl / 100) * equity;
        }
        
        curve.push({
            date: currentDate.toISOString(),
            equity: Math.round(equity * 100) / 100,
        });
    }
    
    return curve;
}

function getSimulatedPositions(): { symbol: string; risk: number; correlation: number }[] {
    // In production, fetch from portfolio manager
    return [
        { symbol: 'META', risk: 1.5, correlation: 0.85 },
        { symbol: 'GOOGL', risk: 1.2, correlation: 0.82 },
        { symbol: 'GC=F', risk: 0.8, correlation: -0.25 },
    ];
}

async function fetchVix(): Promise<number | undefined> {
    try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const res = await fetch(`${baseUrl}/api/macro`, { cache: 'no-store' });
        if (!res.ok) return undefined;
        const data = await res.json();
        return data?.macro?.vix;
    } catch {
        return undefined;
    }
}

export async function GET() {
    const now = Date.now();
    
    // Return cached if fresh
    if (cachedReport && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return NextResponse.json({
            success: true,
            cached: true,
            cacheAge: now - cacheTimestamp,
            report: cachedReport,
        });
    }
    
    try {
        const trades = getSimulatedTrades();
        const equityCurve = getSimulatedEquityCurve();
        const positions = getSimulatedPositions();
        const vix = await fetchVix();
        
        // Calculate daily/weekly P&L from equity curve
        const todayEquity = equityCurve[equityCurve.length - 1]?.equity || 100000;
        const yesterdayEquity = equityCurve[equityCurve.length - 2]?.equity || todayEquity;
        const weekAgoEquity = equityCurve[equityCurve.length - 8]?.equity || todayEquity;
        
        const dailyPnL = ((todayEquity - yesterdayEquity) / yesterdayEquity) * 100;
        const weeklyPnL = ((todayEquity - weekAgoEquity) / weekAgoEquity) * 100;
        
        // Count consecutive losses
        let consecutiveLosses = 0;
        for (let i = trades.length - 1; i >= 0; i--) {
            if (trades[i].pnl < 0) consecutiveLosses++;
            else break;
        }
        
        // Generate comprehensive report
        const report = generateRiskReport(
            trades,
            equityCurve,
            positions,
            dailyPnL,
            weeklyPnL,
            consecutiveLosses,
            'MEDIUM',
            vix
        );
        
        // Cache the report
        cachedReport = report;
        cacheTimestamp = now;
        
        serverLog(
            report.alerts.some(a => a.level === 'CRITICAL') ? 'warn' : 'info',
            'risk_report_generated',
            {
                tradingStatus: report.tradingStatus,
                kellyEdge: report.kelly.edgeQuality,
                drawdownStatus: report.drawdown.status,
                circuitBreakersTriggered: report.circuitBreakers.filter(b => b.triggered).length,
                riskBudgetStatus: report.riskBudget.status,
            },
            'api/risk'
        );
        
        return NextResponse.json({
            success: true,
            cached: false,
            report,
        });
    } catch (error) {
        serverLog('error', 'risk_report_error', { error: String(error) }, 'api/risk');
        
        return NextResponse.json({
            success: false,
            error: 'Failed to generate risk report',
        }, { status: 500 });
    }
}

// POST endpoint for position sizing calculation
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            equity = 100000,
            entryPrice,
            stopLoss,
            winRate = 0.55,
            avgWinR = 1.8,
            avgLossR = 1.0,
            modelConfidence = 'MEDIUM',
        } = body;
        
        if (!entryPrice || !stopLoss) {
            return NextResponse.json({
                success: false,
                error: 'entryPrice and stopLoss are required',
            }, { status: 400 });
        }
        
        // Get current state
        const equityCurve = getSimulatedEquityCurve();
        const positions = getSimulatedPositions();
        const drawdownState = calculateDrawdownState(equityCurve);
        
        // Calculate institutional position size
        const sizing = calculateInstitutionalPositionSize(
            equity,
            entryPrice,
            stopLoss,
            winRate,
            avgWinR,
            avgLossR,
            modelConfidence as 'HIGH' | 'MEDIUM' | 'LOW',
            drawdownState,
            positions
        );
        
        // Also calculate Kelly for reference
        const kelly = calculateKellyFromTrades(
            getSimulatedTrades(),
            modelConfidence as 'HIGH' | 'MEDIUM' | 'LOW'
        );
        
        serverLog('info', 'position_sizing_calculated', {
            entryPrice,
            stopLoss,
            riskPercent: sizing.riskPercent,
            quantity: sizing.quantity,
            kellyEdge: kelly.edgeQuality,
        }, 'api/risk');
        
        return NextResponse.json({
            success: true,
            sizing,
            kelly,
            drawdownStatus: drawdownState.status,
            riskBudget: calculateRiskBudget(positions),
        });
    } catch (error) {
        serverLog('error', 'position_sizing_error', { error: String(error) }, 'api/risk');
        
        return NextResponse.json({
            success: false,
            error: 'Failed to calculate position size',
        }, { status: 500 });
    }
}
