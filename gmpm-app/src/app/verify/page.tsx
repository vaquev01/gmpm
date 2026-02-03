'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type CheckStatus = 'idle' | 'loading' | 'ok' | 'fail';

type CheckResult = {
  name: string;
  path: string;
  status: CheckStatus;
  httpStatus?: number;
  success?: boolean;
  ms?: number;
  summary?: string;
  error?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function fmt(v: unknown) {
  if (v === null || v === undefined) return 'N/A';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'N/A';
  if (typeof v === 'boolean') return String(v);
  return 'N/A';
}

function formatMs(ms?: number) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
  return `${ms.toFixed(0)}ms`;
}

function formatHttpStatus(httpStatus?: number) {
  if (typeof httpStatus !== 'number') return '—';
  return String(httpStatus);
}

export default function VerifyPage() {
  const initialChecks = useMemo<CheckResult[]>(
    () => [
      { name: 'FRED Macro', path: '/api/fred', status: 'idle' },
      { name: 'Market', path: '/api/market?limit=50', status: 'idle' },
      { name: 'News', path: '/api/news?limit=10', status: 'idle' },
      { name: 'Calendar', path: '/api/calendar?days=14', status: 'idle' },
      { name: 'Server Logs', path: '/api/server-logs', status: 'idle' },
      { name: 'Self Test', path: '/api/test', status: 'idle' },
    ],
    []
  );

  const [checks, setChecks] = useState<CheckResult[]>(initialChecks);
  const [lastRun, setLastRun] = useState<number | null>(null);

  const run = useCallback(async () => {
    setLastRun(Date.now());
    setChecks((prev) => prev.map((c) => ({ ...c, status: 'loading', error: undefined })));

    const results = await Promise.all(
      initialChecks.map(async (c) => {
        const start = performance.now();
        try {
          const res = await fetch(c.path, {
            headers: { accept: 'application/json' },
            cache: 'no-store',
          });
          const ms = performance.now() - start;

          const text = await res.text();
          let json: unknown = null;
          try {
            json = JSON.parse(text) as unknown;
          } catch {
            json = null;
          }

          const success = isRecord(json) && typeof json.success === 'boolean' ? json.success : undefined;
          const error = isRecord(json) ? (json.error ?? json.message) : undefined;

          let summary: string | undefined;
          if (c.path.startsWith('/api/fred')) {
            const rates = isRecord(json) && isRecord(json.summary) && isRecord(json.summary.rates)
              ? json.summary.rates
              : null;
            summary = rates
              ? `FF=${fmt(rates.fedFunds)} | 10Y=${fmt(rates.treasury10y)} | 2Y=${fmt(rates.treasury2y)} | Curve=${fmt(rates.curveStatus)}`
              : undefined;
          } else if (c.path.startsWith('/api/market')) {
            const macro = isRecord(json) && isRecord(json.macro) ? json.macro : null;
            const degraded = isRecord(json) && typeof json.degraded === 'boolean' ? json.degraded : undefined;
            const tradeEnabled = isRecord(json) && typeof json.tradeEnabled === 'boolean' ? json.tradeEnabled : undefined;
            const coverage = isRecord(json) && typeof json.coverage === 'number' ? json.coverage : undefined;
            const qs = isRecord(json) && isRecord(json.qualitySummary) ? json.qualitySummary : null;
            const okN = qs && typeof qs.OK === 'number' ? qs.OK : undefined;
            const staleN = qs && typeof qs.STALE === 'number' ? qs.STALE : undefined;
            const suspectN = qs && typeof qs.SUSPECT === 'number' ? qs.SUSPECT : undefined;

            const assets = isRecord(json) && Array.isArray(json.assets) ? (json.assets as unknown[]) : [];
            const first = assets.find((a) => isRecord(a) && typeof a.symbol === 'string') as Record<string, unknown> | undefined;
            const hasHistory = first && Array.isArray(first.history) && first.history.length > 5;
            const hasQuoteTs = first && typeof first.quoteTimestamp === 'string';

            summary = macro
              ? `VIX=${fmt(macro.vix)} | 10Y=${fmt(macro.treasury10y)} | 2Y=${fmt(macro.treasury2y)} | DXY=${fmt(macro.dollarIndex)} | degraded=${fmt(degraded)} tradeEnabled=${fmt(tradeEnabled)} cov=${fmt(coverage)} | Q(ok=${fmt(okN)} stale=${fmt(staleN)} suspect=${fmt(suspectN)}) | hist=${hasHistory ? 'yes' : 'no'} ts=${hasQuoteTs ? 'yes' : 'no'}`
              : undefined;
          } else if (c.path.startsWith('/api/news')) {
            const geo = isRecord(json) && Array.isArray(json.geopolitics) ? (json.geopolitics as unknown[]) : null;
            const tech = isRecord(json) && Array.isArray(json.technology) ? (json.technology as unknown[]) : null;
            const head = isRecord(json) && Array.isArray(json.headlines) ? (json.headlines as unknown[]) : null;
            summary = `geo=${geo ? geo.length : 'N/A'} tech=${tech ? tech.length : 'N/A'} headlines=${head ? head.length : 'N/A'}`;
          } else if (c.path.startsWith('/api/calendar')) {
            const s = isRecord(json) && isRecord(json.summary) ? json.summary : null;
            summary = s ? `Total=${fmt(s.total)} | High=${fmt(s.highImpact)}` : undefined;
          } else if (c.path.startsWith('/api/server-logs')) {
            const entries = isRecord(json) && Array.isArray(json.entries) ? (json.entries as unknown[]) : null;
            summary = entries ? `entries=${entries.length}` : undefined;
          } else if (c.path.startsWith('/api/test')) {
            const s = isRecord(json) && isRecord(json.summary) ? json.summary : null;
            summary = s ? `Passed=${fmt(s.passed)} | Failed=${fmt(s.failed)} | ${fmt(s.percentage)}%` : undefined;
          }

          const ok = res.ok && success === true;
          return {
            ...c,
            status: ok ? 'ok' : 'fail',
            httpStatus: res.status,
            success,
            ms,
            summary,
            error: ok ? undefined : (error ? String(error) : 'Request failed'),
          } satisfies CheckResult;
        } catch (e) {
          const ms = performance.now() - start;
          const msg = e instanceof Error ? e.message : String(e);
          return {
            ...c,
            status: 'fail',
            ms,
            error: msg,
          } satisfies CheckResult;
        }
      })
    );

    setChecks(results);
  }, [initialChecks]);

  useEffect(() => {
    const t = setTimeout(() => {
      void run();
    }, 0);
    return () => clearTimeout(t);
  }, [run]);

  const allOk = checks.length > 0 && checks.every((c) => c.status === 'ok');

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Verification</h1>
          <div className="text-sm text-gray-400">
            Link único para validar rapidamente APIs principais e detectar valores ausentes (N/A) sem dados simulados.
          </div>
          <div className="text-xs text-gray-500 mt-2 font-mono">
            {lastRun ? `Last run: ${new Date(lastRun).toLocaleString()}` : '—'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className={cn(
              'text-xs',
              allOk ? 'border-green-700 text-green-400 bg-green-950/30' : 'border-yellow-800 text-yellow-300 bg-yellow-950/20'
            )}
          >
            {allOk ? 'ALL OK' : 'CHECK'}
          </Badge>
          <Button onClick={run} className="text-xs">
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {checks.map((c) => (
          <Card key={c.path} className="bg-gray-900/40 border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between gap-3 text-sm">
                <span className="text-gray-200">{c.name}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] font-mono',
                    c.status === 'ok'
                      ? 'border-green-800 text-green-400 bg-green-950/30'
                      : c.status === 'fail'
                        ? 'border-red-900 text-red-300 bg-red-950/20'
                        : 'border-gray-700 text-gray-400 bg-gray-950/20'
                  )}
                >
                  {c.status.toUpperCase()}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-xs font-mono text-gray-400 break-all">{c.path}</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-gray-950/40 border border-gray-800 rounded p-2">
                  <div className="text-[10px] text-gray-500 uppercase">HTTP</div>
                  <div className="text-gray-200 font-mono">{formatHttpStatus(c.httpStatus)}</div>
                </div>
                <div className="bg-gray-950/40 border border-gray-800 rounded p-2">
                  <div className="text-[10px] text-gray-500 uppercase">success</div>
                  <div className="text-gray-200 font-mono">{typeof c.success === 'boolean' ? String(c.success) : '—'}</div>
                </div>
                <div className="bg-gray-950/40 border border-gray-800 rounded p-2">
                  <div className="text-[10px] text-gray-500 uppercase">time</div>
                  <div className="text-gray-200 font-mono">{formatMs(c.ms)}</div>
                </div>
              </div>
              {c.summary && <div className="text-xs text-gray-300">{c.summary}</div>}
              {c.error && <div className="text-xs text-red-300 break-words">{c.error}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-gray-900/30 border-gray-800">
        <CardContent className="p-4 text-xs text-gray-400 space-y-1">
          <div className="font-bold text-gray-300">Como usar</div>
          <div className="font-mono">1) Abre: http://localhost:3001/verify</div>
          <div className="font-mono">2) Confere se está ALL OK</div>
          <div className="font-mono">3) Se falhar FRED, verifica FRED_API_KEY em gmpm-app/.env.local e reinicia npm run dev</div>
        </CardContent>
      </Card>
    </div>
  );
}
