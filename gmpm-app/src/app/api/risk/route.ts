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
import {
    getRealTradesForRisk,
    getRealEquityCurve,
    getActiveSignals as getActiveServerSignals,
    getOutcomeStats,
} from '@/lib/serverStore';

// Cache for risk report
let cachedReport: InstitutionalRiskReport | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

// Get real trades from persistent store, with conservative fallback for empty history
function getTrades(): { pnl: number; risk: number; date: string }[] {
    const real = getRealTradesForRisk();
    if (real.length >= 5) return real;
    // Fallback: return conservative defaults when not enough data
    return [{ pnl: 0, risk: 1.5, date: new Date().toISOString() }];
}

function getEquityCurve(): { date: string; equity: number }[] {
    const real = getRealEquityCurve();
    if (real.length >= 2) return real;
    // Fallback: flat equity curve
    return [
        { date: new Date(Date.now() - 86400000).toISOString(), equity: 100000 },
        { date: new Date().toISOString(), equity: 100000 },
    ];
}

function getPositionsFromActiveSignals(): { symbol: string; risk: number; correlation: number }[] {
    const active = getActiveServerSignals();
    return active.map(s => ({
        symbol: s.asset,
        risk: s.components?.riskPercent ?? 1.5,
        correlation: 0.5, // Conservative default; real correlation engine can be added later
    }));
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
        const trades = getTrades();
        return NextResponse.json({
            success: true,
            cached: true,
            cacheAge: now - cacheTimestamp,
            dataSource: trades.length > 1 ? 'REAL' : 'INSUFFICIENT_DATA',
            report: cachedReport,
        });
    }
    
    try {
        const trades = getTrades();
        const equityCurve = getEquityCurve();
        const positions = getPositionsFromActiveSignals();
        const stats = getOutcomeStats();
        const hasRealData = trades.length > 1;
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
            dataSource: hasRealData ? 'REAL' : 'INSUFFICIENT_DATA',
            outcomeStats: stats,
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
        const equityCurve = getEquityCurve();
        const positions = getPositionsFromActiveSignals();
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
            getTrades(),
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
