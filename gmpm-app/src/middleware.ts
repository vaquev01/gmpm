// src/middleware.ts
// Basic authentication middleware for GMPM Terminal
// Set GMPM_AUTH_USER and GMPM_AUTH_PASS in .env.local to enable

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const user = process.env.GMPM_AUTH_USER;
    const pass = process.env.GMPM_AUTH_PASS;

    // Skip auth if not configured
    if (!user || !pass) return NextResponse.next();

    // Skip auth for health endpoint (monitoring)
    if (request.nextUrl.pathname === '/api/health') return NextResponse.next();

    const authHeader = request.headers.get('authorization');
    if (authHeader) {
        const [scheme, encoded] = authHeader.split(' ');
        if (scheme === 'Basic' && encoded) {
            const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
            const [u, p] = decoded.split(':');
            if (u === user && p === pass) {
                return NextResponse.next();
            }
        }
    }

    // Check for auth cookie (set after first successful login)
    const authCookie = request.cookies.get('gmpm_auth');
    if (authCookie?.value === Buffer.from(`${user}:${pass}`).toString('base64')) {
        return NextResponse.next();
    }

    return new NextResponse('Authentication required', {
        status: 401,
        headers: {
            'WWW-Authenticate': 'Basic realm="GMPM Terminal"',
        },
    });
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
