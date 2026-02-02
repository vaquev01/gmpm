import { NextResponse } from 'next/server';

// ===== TELEGRAM ALERTS API =====
// Send trading signals to Telegram

interface TelegramMessage {
    symbol: string;
    direction: 'LONG' | 'SHORT';
    score: number;
    confidence: string;
    price: number;
    entryLow: number;
    entryHigh: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2?: number;
    drivers: string[];
    risks: string[];
    validityHours: number;
    positionSize?: string;
    oneLiner?: string;
}

// Format message for Telegram (Markdown)
function formatMessage(signal: TelegramMessage): string {
    const emoji = signal.direction === 'LONG' ? '🟢' : '🔴';
    const confEmoji = signal.confidence === 'INSTITUTIONAL' ? '🏦' : signal.confidence === 'STRONG' ? '💪' : '📊';

    let msg = `${emoji} *${signal.symbol}* ${signal.direction} ${confEmoji}\n\n`;
    msg += `📈 *Score:* ${signal.score}/100 (${signal.confidence})\n`;
    msg += `💰 *Price:* $${signal.price.toFixed(4)}\n\n`;

    msg += `🎯 *Entry Zone:* $${signal.entryLow.toFixed(4)} - $${signal.entryHigh.toFixed(4)}\n`;
    msg += `🛡️ *Stop Loss:* $${signal.stopLoss.toFixed(4)}\n`;
    msg += `✅ *TP1:* $${signal.takeProfit1.toFixed(4)}\n`;
    if (signal.takeProfit2) {
        msg += `✅ *TP2:* $${signal.takeProfit2.toFixed(4)}\n`;
    }
    msg += `\n`;

    if (signal.positionSize) {
        msg += `📐 *Size:* ${signal.positionSize}\n`;
    }
    msg += `⏱️ *Validity:* ${signal.validityHours}h\n\n`;

    if (signal.drivers.length > 0) {
        msg += `*Drivers:*\n`;
        signal.drivers.forEach(d => {
            msg += `  ✓ ${d}\n`;
        });
        msg += `\n`;
    }

    if (signal.risks.length > 0) {
        msg += `*Risks:*\n`;
        signal.risks.forEach(r => {
            msg += `  ⚠️ ${r}\n`;
        });
        msg += `\n`;
    }

    if (signal.oneLiner) {
        msg += `\`\`\`\n${signal.oneLiner}\n\`\`\`\n`;
    }

    msg += `\n_GMPM Signal System_ 🚀`;

    return msg;
}

// Send message to Telegram
async function sendToTelegram(botToken: string, chatId: string, message: string): Promise<boolean> {
    try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown',
                disable_web_page_preview: true,
            }),
        });

        const result = await response.json();
        return result.ok === true;
    } catch (error) {
        console.error('Telegram send error:', error);
        return false;
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { signal, botToken, chatId } = body;

        if (!signal || !botToken || !chatId) {
            return NextResponse.json({
                success: false,
                error: 'Missing required fields: signal, botToken, chatId',
            }, { status: 400 });
        }

        const message = formatMessage(signal);
        const sent = await sendToTelegram(botToken, chatId, message);

        return NextResponse.json({
            success: sent,
            message: sent ? 'Signal sent to Telegram' : 'Failed to send',
        });

    } catch (error) {
        console.error('Telegram API Error:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to send to Telegram',
        }, { status: 500 });
    }
}

// Test endpoint
export async function GET() {
    return NextResponse.json({
        success: true,
        info: {
            name: 'Telegram Alerts API',
            version: '1.0',
            description: 'Send trading signals to Telegram',
            usage: {
                method: 'POST',
                body: {
                    signal: {
                        symbol: 'AAPL',
                        direction: 'LONG',
                        score: 78,
                        confidence: 'STRONG',
                        price: 185.50,
                        entryLow: 184.80,
                        entryHigh: 186.20,
                        stopLoss: 182.00,
                        takeProfit1: 190.00,
                        takeProfit2: 195.00,
                        drivers: ['Strong trend', 'Volume surge'],
                        risks: ['VIX elevated'],
                        validityHours: 24,
                        positionSize: '0.5R',
                    },
                    botToken: 'YOUR_BOT_TOKEN',
                    chatId: 'YOUR_CHAT_ID',
                },
            },
            howToGetToken: [
                '1. Message @BotFather on Telegram',
                '2. Send /newbot and follow instructions',
                '3. Copy the bot token provided',
            ],
            howToGetChatId: [
                '1. Start a chat with your bot',
                '2. Send any message to the bot',
                '3. Visit: https://api.telegram.org/bot<TOKEN>/getUpdates',
                '4. Find your chat_id in the response',
            ],
        },
    });
}
