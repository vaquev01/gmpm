// src/lib/telegramAlert.ts
// Server-side Telegram alert helper — sends signals automatically

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

export function isTelegramConfigured(): boolean {
    return BOT_TOKEN.length > 10 && CHAT_ID.length > 0;
}

export async function sendTelegramAlert(message: string): Promise<boolean> {
    if (!isTelegramConfigured()) return false;
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'Markdown',
                disable_web_page_preview: true,
            }),
        });
        const data = await res.json();
        return data.ok === true;
    } catch (e) {
        console.error('[Telegram] send error:', e);
        return false;
    }
}

export interface SignalAlertData {
    asset: string;
    direction: 'LONG' | 'SHORT';
    tier: string;
    score: number;
    regime: string;
    entry: number;
    stopLoss: number;
    tp1: number;
    tp2?: number;
    tp3?: number;
    rr: number;
    drivers: string[];
    warnings: string[];
    riskPercent?: number;
}

export function formatSignalAlert(signal: SignalAlertData): string {
    const emoji = signal.direction === 'LONG' ? '🟢' : '🔴';
    const tierEmoji = signal.tier === 'A' ? '🏆' : signal.tier === 'B' ? '💪' : signal.tier === 'C' ? '📊' : '👁️';

    let msg = `${emoji} *${signal.asset}* ${signal.direction} — Tier ${signal.tier} ${tierEmoji}\n\n`;
    msg += `📈 *Score:* ${signal.score}/100\n`;
    msg += `🌍 *Regime:* ${signal.regime}\n\n`;

    msg += `🎯 *Entry:* $${fmtPrice(signal.entry)}\n`;
    msg += `🛡️ *Stop Loss:* $${fmtPrice(signal.stopLoss)}\n`;
    msg += `✅ *TP1:* $${fmtPrice(signal.tp1)}\n`;
    if (signal.tp2) msg += `✅ *TP2:* $${fmtPrice(signal.tp2)}\n`;
    if (signal.tp3) msg += `✅ *TP3:* $${fmtPrice(signal.tp3)}\n`;
    msg += `📐 *R:R:* ${signal.rr.toFixed(1)}\n`;
    if (signal.riskPercent) msg += `⚖️ *Risk:* ${signal.riskPercent.toFixed(2)}%\n`;
    msg += `\n`;

    if (signal.drivers.length > 0) {
        msg += `*Drivers:*\n`;
        for (const d of signal.drivers.slice(0, 5)) {
            msg += `  ✓ ${d}\n`;
        }
        msg += `\n`;
    }

    if (signal.warnings.length > 0) {
        msg += `*Warnings:*\n`;
        for (const w of signal.warnings.slice(0, 3)) {
            msg += `  ⚠️ ${w}\n`;
        }
        msg += `\n`;
    }

    msg += `_GMPM Signal System v2.0_ 🚀`;
    return msg;
}

export function formatCloseAlert(asset: string, direction: string, reason: string, pnlR: number): string {
    const emoji = pnlR > 0 ? '✅' : pnlR < 0 ? '❌' : '➖';
    const pnlStr = pnlR > 0 ? `+${pnlR.toFixed(2)}R` : `${pnlR.toFixed(2)}R`;
    return `${emoji} *${asset}* ${direction} CLOSED\n\n` +
        `📊 *Result:* ${pnlStr}\n` +
        `📝 *Reason:* ${reason}\n\n` +
        `_GMPM Signal System_ 🚀`;
}

function fmtPrice(p: number): string {
    if (p >= 1000) return p.toFixed(2);
    if (p >= 1) return p.toFixed(4);
    return p.toFixed(6);
}
