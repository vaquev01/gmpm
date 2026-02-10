import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        ok: true,
        ts: Date.now(),
        uptime: process.uptime(),
        version: '2.0.0',
    });
}
