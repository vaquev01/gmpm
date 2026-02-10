import type { Request, Response, NextFunction } from 'express';

const LEGACY_BASE_URL = process.env.LEGACY_BASE_URL || 'http://localhost:3000';

function pickHeaders(req: Request) {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    if (k.toLowerCase() === 'host') continue;
    if (Array.isArray(v)) headers[k] = v.join(',');
    else headers[k] = String(v);
  }
  return headers;
}

export async function proxyToLegacy(req: Request, res: Response, next: NextFunction) {
  try {
    const url = new URL(req.originalUrl, LEGACY_BASE_URL);

    const method = req.method.toUpperCase();
    const hasBody = method !== 'GET' && method !== 'HEAD';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    let upstream: globalThis.Response;
    try {
      upstream = await fetch(url.toString(), {
        method,
        headers: {
          ...pickHeaders(req),
          accept: req.headers.accept || 'application/json',
        },
        body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('content-type', contentType);

    const text = await upstream.text();
    res.status(upstream.status).send(text);
  } catch (e) {
    next(e);
  }
}
