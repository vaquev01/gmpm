// src/lib/executionEngine.ts
// Execution Layer - Integração com Binance para trades reais

export interface OrderParams {
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'LIMIT' | 'MARKET' | 'STOP_MARKET' | 'TAKE_PROFIT_MARKET';
    quantity: number;
    price?: number;
    stopPrice?: number;
    timeInForce?: 'GTC' | 'IOC' | 'FOK';
}

export interface OrderResult {
    success: boolean;
    orderId?: string;
    status?: 'NEW' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELED' | 'REJECTED';
    filledQty?: number;
    avgPrice?: number;
    error?: string;
    timestamp?: string;
}

export interface TradeSetup {
    symbol: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLoss: number;
    takeProfits: { price: number; percent: number }[];
    riskPercent: number;
    equity: number;
}

export interface ExecutedTrade {
    id: string;
    setup: TradeSetup;
    entryOrder: OrderResult;
    slOrder: OrderResult;
    tpOrders: OrderResult[];
    status: 'PENDING' | 'ACTIVE' | 'CLOSED';
    realizedPnL?: number;
    timestamp: string;
}

// ===== POSITION SIZING =====

export function calculatePositionSize(
    equity: number,
    riskPercent: number,
    entryPrice: number,
    stopLoss: number
): { quantity: number; riskAmount: number; riskR: number } {
    const riskAmount = equity * (riskPercent / 100);
    const stopDistance = Math.abs(entryPrice - stopLoss);
    const stopPercent = (stopDistance / entryPrice) * 100;

    const quantity = riskAmount / stopDistance;
    const riskR = riskPercent;

    return {
        quantity: Math.floor(quantity * 100000) / 100000, // 5 decimais
        riskAmount: Math.round(riskAmount * 100) / 100,
        riskR: Math.round(stopPercent * 100) / 100,
    };
}

// ===== BINANCE API (TESTNET) =====

const BINANCE_TESTNET = 'https://testnet.binancefuture.com';
const BINANCE_MAINNET = 'https://fapi.binance.com';

interface BinanceCredentials {
    apiKey: string;
    secretKey: string;
    testnet: boolean;
}

// Armazena credenciais em memória (não persistido)
let credentials: BinanceCredentials | null = null;

export function setCredentials(creds: BinanceCredentials): void {
    credentials = creds;
}

export function hasCredentials(): boolean {
    return credentials !== null;
}

async function signRequest(params: Record<string, string | number>): Promise<string> {
    if (!credentials) throw new Error('Credenciais não configuradas');

    const timestamp = Date.now();
    const queryString = Object.entries({ ...params, timestamp })
        .map(([k, v]) => `${k}=${v}`)
        .join('&');

    // HMAC-SHA256 signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(credentials.secretKey),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        encoder.encode(queryString)
    );

    const signatureHex = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

    return `${queryString}&signature=${signatureHex}`;
}

async function binanceRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE',
    params: Record<string, string | number> = {}
): Promise<{ success: boolean; data?: unknown; error?: string }> {
    if (!credentials) {
        return { success: false, error: 'Credenciais não configuradas' };
    }

    const baseUrl = credentials.testnet ? BINANCE_TESTNET : BINANCE_MAINNET;

    try {
        const signedQuery = await signRequest(params);
        const url = `${baseUrl}${endpoint}?${signedQuery}`;

        const response = await fetch(url, {
            method,
            headers: {
                'X-MBX-APIKEY': credentials.apiKey,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();

        if (!response.ok) {
            return { success: false, error: data.msg || 'Request failed' };
        }

        return { success: true, data };
    } catch (error) {
        return { success: false, error: String(error) };
    }
}

// ===== ORDER FUNCTIONS =====

export async function placeOrder(order: OrderParams): Promise<OrderResult> {
    const params: Record<string, string | number> = {
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity,
    };

    if (order.price) params.price = order.price;
    if (order.stopPrice) params.stopPrice = order.stopPrice;
    if (order.timeInForce) params.timeInForce = order.timeInForce;
    if (order.type === 'LIMIT') params.timeInForce = order.timeInForce || 'GTC';

    const result = await binanceRequest('/fapi/v1/order', 'POST', params);

    if (!result.success) {
        return { success: false, error: result.error };
    }

    const data = result.data as {
        orderId: number;
        status: string;
        executedQty: string;
        avgPrice: string;
        updateTime: number;
    };

    return {
        success: true,
        orderId: String(data.orderId),
        status: data.status as OrderResult['status'],
        filledQty: parseFloat(data.executedQty),
        avgPrice: parseFloat(data.avgPrice),
        timestamp: new Date(data.updateTime).toISOString(),
    };
}

export async function cancelOrder(symbol: string, orderId: string): Promise<OrderResult> {
    const result = await binanceRequest('/fapi/v1/order', 'DELETE', {
        symbol,
        orderId: parseInt(orderId),
    });

    if (!result.success) {
        return { success: false, error: result.error };
    }

    return { success: true, orderId, status: 'CANCELED' };
}

export async function getPositions(): Promise<{ symbol: string; positionAmt: number; entryPrice: number; unrealizedProfit: number }[]> {
    const result = await binanceRequest('/fapi/v2/positionRisk', 'GET');

    if (!result.success) return [];

    const positions = result.data as {
        symbol: string;
        positionAmt: string;
        entryPrice: string;
        unRealizedProfit: string;
    }[];

    return positions
        .filter(p => parseFloat(p.positionAmt) !== 0)
        .map(p => ({
            symbol: p.symbol,
            positionAmt: parseFloat(p.positionAmt),
            entryPrice: parseFloat(p.entryPrice),
            unrealizedProfit: parseFloat(p.unRealizedProfit),
        }));
}

export async function getAccountBalance(): Promise<{ availableBalance: number; totalBalance: number } | null> {
    const result = await binanceRequest('/fapi/v2/balance', 'GET');

    if (!result.success) return null;

    const balances = result.data as {
        asset: string;
        availableBalance: string;
        balance: string;
    }[];

    const usdt = balances.find(b => b.asset === 'USDT');

    if (!usdt) return null;

    return {
        availableBalance: parseFloat(usdt.availableBalance),
        totalBalance: parseFloat(usdt.balance),
    };
}

// ===== FULL TRADE EXECUTION =====

export async function executeTrade(setup: TradeSetup): Promise<ExecutedTrade> {
    const { quantity } = calculatePositionSize(
        setup.equity,
        setup.riskPercent,
        setup.entryPrice,
        setup.stopLoss
    );

    const id = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const trade: ExecutedTrade = {
        id,
        setup,
        entryOrder: { success: false },
        slOrder: { success: false },
        tpOrders: [],
        status: 'PENDING',
        timestamp: new Date().toISOString(),
    };

    // 1. Entry order
    trade.entryOrder = await placeOrder({
        symbol: setup.symbol,
        side: setup.direction === 'LONG' ? 'BUY' : 'SELL',
        type: 'LIMIT',
        quantity,
        price: setup.entryPrice,
        timeInForce: 'GTC',
    });

    if (!trade.entryOrder.success) {
        return trade;
    }

    // 2. Stop Loss
    trade.slOrder = await placeOrder({
        symbol: setup.symbol,
        side: setup.direction === 'LONG' ? 'SELL' : 'BUY',
        type: 'STOP_MARKET',
        quantity,
        stopPrice: setup.stopLoss,
    });

    // 3. Take Profits
    let remainingQty = quantity;
    for (const tp of setup.takeProfits) {
        const tpQty = Math.floor(quantity * tp.percent * 100000) / 100000;
        remainingQty -= tpQty;

        const tpOrder = await placeOrder({
            symbol: setup.symbol,
            side: setup.direction === 'LONG' ? 'SELL' : 'BUY',
            type: 'TAKE_PROFIT_MARKET',
            quantity: tpQty,
            stopPrice: tp.price,
        });

        trade.tpOrders.push(tpOrder);
    }

    trade.status = 'ACTIVE';

    // Salvar no localStorage
    saveTrade(trade);

    return trade;
}

// ===== STORAGE =====

const TRADES_KEY = 'gmpm_executed_trades';

function saveTrade(trade: ExecutedTrade): void {
    if (typeof window === 'undefined') return;

    const trades = getTrades();
    trades.push(trade);
    localStorage.setItem(TRADES_KEY, JSON.stringify(trades));
}

export function getTrades(): ExecutedTrade[] {
    if (typeof window === 'undefined') return [];

    const stored = localStorage.getItem(TRADES_KEY);
    if (!stored) return [];

    try {
        return JSON.parse(stored);
    } catch {
        return [];
    }
}

export function clearTrades(): void {
    if (typeof window !== 'undefined') {
        localStorage.removeItem(TRADES_KEY);
    }
}

// ===== SIMULATION MODE =====

export async function simulateTrade(setup: TradeSetup): Promise<ExecutedTrade> {
    const { quantity, riskAmount, riskR } = calculatePositionSize(
        setup.equity,
        setup.riskPercent,
        setup.entryPrice,
        setup.stopLoss
    );

    const id = `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Simular com delay realista
    await new Promise(resolve => setTimeout(resolve, 500));

    const trade: ExecutedTrade = {
        id,
        setup,
        entryOrder: {
            success: true,
            orderId: `sim_entry_${Date.now()}`,
            status: 'FILLED',
            filledQty: quantity,
            avgPrice: setup.entryPrice,
            timestamp: new Date().toISOString(),
        },
        slOrder: {
            success: true,
            orderId: `sim_sl_${Date.now()}`,
            status: 'NEW',
            timestamp: new Date().toISOString(),
        },
        tpOrders: setup.takeProfits.map((tp, i) => ({
            success: true,
            orderId: `sim_tp${i}_${Date.now()}`,
            status: 'NEW' as const,
            timestamp: new Date().toISOString(),
        })),
        status: 'ACTIVE',
        timestamp: new Date().toISOString(),
    };

    saveTrade(trade);

    console.log(`[SIMULATION] Trade executado:`, {
        symbol: setup.symbol,
        direction: setup.direction,
        quantity,
        riskAmount,
        riskR,
        entry: setup.entryPrice,
        sl: setup.stopLoss,
        tps: setup.takeProfits.map(tp => tp.price),
    });

    return trade;
}
