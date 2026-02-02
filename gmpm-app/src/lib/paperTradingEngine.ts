'use client';

// ===== PAPER TRADING ENGINE =====
// Simulates a broker environment with realistic order states

import { Signal } from '@/types';

// Simple ID generator to avoid external dependency
const generateId = () => Math.random().toString(36).substring(2, 15);

export type OrderStatus = 'PENDING' | 'SUBMITTED' | 'WORKING' | 'FILLED' | 'CANCELLED' | 'REJECTED';
export type OrderSide = 'BUY' | 'SELL';

export interface PaperOrder {
    id: string;
    signalId: string;
    symbol: string;
    side: OrderSide;
    quantity: number;
    price: number; // Limit price
    filledPrice?: number;
    filledQuantity: number;
    status: OrderStatus;
    submittedAt: number;
    filledAt?: number;
    commission: number;
}

export interface PaperAccount {
    balance: number; // Cash
    equity: number; // Cash + Unrealized PnL
    usedMargin: number;
    freeMargin: number;
    positions: PaperPosition[];
    orders: PaperOrder[];
    history: PaperTrade[];
}

export interface PaperPosition {
    symbol: string;
    side: OrderSide;
    quantity: number;
    avgEntryPrice: number;
    currentPrice: number;
    unrealizedPnL: number;
    marketValue: number;
}

export interface PaperTrade {
    id: string;
    symbol: string;
    side: OrderSide;
    quantity: number;
    price: number;
    timestamp: number;
    commission: number;
    realizedPnL?: number; // Only for closing trades
}

const STORAGE_KEY = 'gmpm_paper_account';

const DEFAULT_ACCOUNT: PaperAccount = {
    balance: 100000,
    equity: 100000,
    usedMargin: 0,
    freeMargin: 100000,
    positions: [],
    orders: [],
    history: []
};

// --- API ---

export function getPaperAccount(): PaperAccount {
    if (typeof window === 'undefined') return DEFAULT_ACCOUNT;
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : DEFAULT_ACCOUNT;
}

export function resetPaperAccount(initialBalance: number = 100000): void {
    const account: PaperAccount = {
        ...DEFAULT_ACCOUNT,
        balance: initialBalance,
        equity: initialBalance,
        freeMargin: initialBalance
    };
    saveAccount(account);
}

export function submitOrder(signal: Signal, quantity: number): PaperOrder {
    const account = getPaperAccount();

    // Simulate realistic delay (latency)
    const order: PaperOrder = {
        id: generateId(),
        signalId: signal.id,
        symbol: signal.asset,
        side: signal.direction === 'LONG' ? 'BUY' : 'SELL', // Simplification
        quantity,
        price: signal.entryPrice,
        filledQuantity: 0,
        status: 'PENDING',
        submittedAt: Date.now(),
        commission: 0
    };

    account.orders.push(order);
    saveAccount(account);

    // Async execution simulation
    setTimeout(() => processOrder(order.id), 1500); // 1.5s simulated acceptance delay

    return order;
}

// --- INTERNAL SIMULATION ---

function saveAccount(account: PaperAccount) {
    if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
    }
}

function processOrder(orderId: string) {
    const account = getPaperAccount();
    const orderIndex = account.orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return;

    const order = account.orders[orderIndex];

    // State Transition: PENDING -> SUBMITTED -> FILLED
    // In a real system, this would be WebSocket updates from broker

    // 1. Acknowledge
    order.status = 'WORKING';

    // 2. Fill (Instant for now, could be partial)
    const fillPrice = order.price; // Could add slippage here too
    const commission = 2.50; // Flat fee simulation

    order.status = 'FILLED';
    order.filledPrice = fillPrice;
    order.filledQuantity = order.quantity;
    order.filledAt = Date.now();
    order.commission = commission;

    // Update Account Balance & Positions
    account.balance -= commission;

    // Check if closing or opening
    const existingPosIndex = account.positions.findIndex(p => p.symbol === order.symbol);

    if (existingPosIndex === -1) {
        // New Position
        account.positions.push({
            symbol: order.symbol,
            side: order.side,
            quantity: order.quantity,
            avgEntryPrice: fillPrice,
            currentPrice: fillPrice,
            unrealizedPnL: 0,
            marketValue: fillPrice * order.quantity
        });
    } else {
        // Update Position (Simplification: Netting)
        // Complexity: handling opposite side orders to close
        // For MVP, assume we only ADD to positions or CLOSE manually
        const pos = account.positions[existingPosIndex];
        if (pos.side === order.side) {
            const totalCost = (pos.quantity * pos.avgEntryPrice) + (order.quantity * fillPrice);
            const totalQty = pos.quantity + order.quantity;
            pos.avgEntryPrice = totalCost / totalQty;
            pos.quantity = totalQty;
        } else {
            // Closing (Partial or Full)
            // Calculate realize PnL
            // ... (Omitted for brevity in MVP, logic needed here)
            // Hard close for now:
            account.positions.splice(existingPosIndex, 1);
        }
    }

    // Add to history
    account.history.push({
        id: generateId(),
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        price: fillPrice,
        timestamp: Date.now(),
        commission
    });

    account.orders[orderIndex] = order;
    saveAccount(account);
}
