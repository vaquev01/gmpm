type CacheEntry = {
  ts: number;
  status: number;
  data: unknown;
};

type YahooJsonResult = {
  ok: boolean;
  status: number;
  data: unknown | null;
  cached: boolean;
  stale: boolean;
};

const cache = new Map<string, CacheEntry>();
const lastOk = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<YahooJsonResult>>();
const ERROR_CACHE_MS = 10_000; // Cache errors for only 10s so retries recover fast

const maxConcurrency = Math.max(1, Number(process.env.YAHOO_MAX_CONCURRENCY || 20));
let active = 0;
const queue: Array<{ resolve: () => void }> = [];

async function acquire(queueTimeoutMs?: number) {
  if (active < maxConcurrency) {
    active += 1;
    return;
  }

  const ticket = { resolve: () => {} };
  const p = new Promise<void>((resolve) => {
    ticket.resolve = resolve;
    queue.push(ticket);
  });

  if (queueTimeoutMs && queueTimeoutMs > 0) {
    let t: ReturnType<typeof setTimeout> | null = null;
    const timeoutP = new Promise<'timeout'>((resolve) => {
      t = setTimeout(() => resolve('timeout'), queueTimeoutMs);
    });
    const r = await Promise.race([
      p.then(() => 'acquired' as const),
      timeoutP,
    ]);
    if (t) clearTimeout(t);
    if (r === 'timeout') {
      const idx = queue.indexOf(ticket);
      if (idx >= 0) queue.splice(idx, 1);
      throw new Error('YAHOO_QUEUE_TIMEOUT');
    }
  } else {
    await p;
  }

  active += 1;
}

function release() {
  active = Math.max(0, active - 1);
  const next = queue.shift();
  if (next) next.resolve();
}

function isOkStatus(status: number) {
  return status >= 200 && status < 300;
}

export async function yahooFetchJson(url: string, ttlMs: number, timeoutMs: number = 12_000, queueTimeoutMs?: number): Promise<YahooJsonResult> {
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && (now - cached.ts) < ttlMs) {
    return {
      ok: isOkStatus(cached.status),
      status: cached.status,
      data: cached.data,
      cached: true,
      stale: false,
    };
  }

  const inflight = inFlight.get(url);
  if (inflight) return inflight;

  const p: Promise<YahooJsonResult> = (async () => {
    let acquired = false;
    try {
      await acquire(queueTimeoutMs);
      acquired = true;
    } catch {
      const okCached = lastOk.get(url);
      if (okCached) {
        cache.set(url, { ts: now, status: okCached.status, data: okCached.data });
        return { ok: true, status: 200, data: okCached.data, cached: true, stale: true };
      }
      return { ok: false, status: 0, data: null, cached: false, stale: false };
    }
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: controller.signal,
        });

        const status = res.status;

        if (!res.ok) {
          const okCached = lastOk.get(url);
          if (okCached) {
            cache.set(url, { ts: now, status: okCached.status, data: okCached.data });
            return { ok: true, status: 200, data: okCached.data, cached: true, stale: true };
          }

          cache.set(url, { ts: now - ttlMs + ERROR_CACHE_MS, status, data: null });
          return { ok: false, status, data: null, cached: false, stale: false };
        }

        const data = (await res.json()) as unknown;
        const entry: CacheEntry = { ts: now, status, data };
        cache.set(url, entry);
        lastOk.set(url, entry);
        return { ok: true, status, data, cached: false, stale: false };
      } finally {
        clearTimeout(t);
      }
    } catch {
      const okCached = lastOk.get(url);
      if (okCached) {
        cache.set(url, { ts: now, status: okCached.status, data: okCached.data });
        return { ok: true, status: 200, data: okCached.data, cached: true, stale: true };
      }
      cache.set(url, { ts: now - ttlMs + ERROR_CACHE_MS, status: 0, data: null });
      return { ok: false, status: 0, data: null, cached: false, stale: false };
    } finally {
      if (acquired) release();
      inFlight.delete(url);
    }
  })();

  inFlight.set(url, p);
  return p;
}
