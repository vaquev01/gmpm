'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLogStore, type LogEntry, type LogLevel } from '@/store/useLogStore';

function formatTs(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function entryToText(e: LogEntry) {
  const head = `[${formatTs(e.ts)}] ${e.level.toUpperCase()}${e.source ? ` (${e.source})` : ''}: ${e.message}`;
  return e.details ? `${head}\n${e.details}` : head;
}

const LEVELS: LogLevel[] = ['error', 'warn', 'info', 'log'];

export default function LogsPage() {
  const entries = useLogStore((s) => s.entries);
  const clear = useLogStore((s) => s.clear);

  type ServerEntry = { id: string; ts: number; level: string; message: string; details?: string; source?: string };

  const [serverEntries, setServerEntries] = useState<
    ServerEntry[]
  >([]);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [level, setLevel] = useState<LogLevel | 'all'>('all');
  const [query, setQuery] = useState('');

  const fetchServerLogs = useCallback(async () => {
    setServerLoading(true);
    setServerError(null);
    try {
      const res = await fetch('/api/server-logs', { cache: 'no-store' });
      const json = (await res.json()) as unknown;
      const ok = typeof json === 'object' && json !== null && (json as { success?: unknown }).success === true;
      if (!ok) {
        const err = typeof json === 'object' && json !== null ? (json as { error?: unknown }).error : undefined;
        setServerError(typeof err === 'string' ? err : `Failed to load server logs (HTTP ${res.status})`);
        setServerEntries([]);
      } else {
        const list = (json as { entries?: unknown }).entries;
        setServerEntries(Array.isArray(list) ? (list as ServerEntry[]) : []);
      }
    } catch (e) {
      setServerError(e instanceof Error ? e.message : String(e));
      setServerEntries([]);
    } finally {
      setServerLoading(false);
    }
  }, []);

  const clearServerLogs = useCallback(async () => {
    setServerLoading(true);
    setServerError(null);
    try {
      await fetch('/api/server-logs', { method: 'DELETE' });
      await fetchServerLogs();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : String(e));
    } finally {
      setServerLoading(false);
    }
  }, [fetchServerLogs]);

  useEffect(() => {
    void fetchServerLogs();
    const t = setInterval(() => void fetchServerLogs(), 15000);
    return () => clearInterval(t);
  }, [fetchServerLogs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => (level === 'all' ? true : e.level === level))
      .filter((e) => {
        if (!q) return true;
        const hay = `${e.message}\n${e.details ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice()
      .reverse();
  }, [entries, level, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: entries.length };
    for (const l of LEVELS) c[l] = 0;
    for (const e of entries) c[e.level] = (c[e.level] ?? 0) + 1;
    return c as Record<'all' | LogLevel, number>;
  }, [entries]);

  const copyAll = async () => {
    const text = filtered.map(entryToText).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 lg:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Logs</h1>
          <div className="text-sm text-gray-400">
            Console do app (client): captura <span className="font-mono">console.error/warn</span>,{' '}
            <span className="font-mono">window.onerror</span> e <span className="font-mono">unhandledrejection</span>.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" className="text-xs" onClick={copyAll} disabled={filtered.length === 0}>
            Copy
          </Button>
          <Button variant="destructive" className="text-xs" onClick={clear} disabled={entries.length === 0}>
            Clear
          </Button>
        </div>
      </div>

      <Card className="bg-gray-900/40 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-gray-200">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={level === 'all' ? 'default' : 'outline'}
              className="text-xs"
              onClick={() => setLevel('all')}
            >
              All ({counts.all})
            </Button>
            {LEVELS.map((l) => (
              <Button
                key={l}
                size="sm"
                variant={level === l ? 'default' : 'outline'}
                className="text-xs"
                onClick={() => setLevel(l)}
              >
                {l.toUpperCase()} ({counts[l]})
              </Button>
            ))}
          </div>

          <input
            className="w-full bg-gray-950 border border-gray-800 rounded text-xs py-2 px-3 text-gray-300 focus:outline-none focus:border-purple-500 placeholder:text-gray-700 transition-colors"
            placeholder="Search message/details..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card className="bg-gray-900/40 border-gray-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm text-gray-200">Server Logs</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="text-xs" onClick={fetchServerLogs} disabled={serverLoading}>
                Refresh
              </Button>
              <Button variant="destructive" className="text-xs" onClick={clearServerLogs} disabled={serverLoading}>
                Clear
              </Button>
            </div>
          </div>
          <div className="text-xs text-gray-500 font-mono">
            Source: /api/server-logs (in-memory buffer; shows degraded/fallback/gates from backend).
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {serverError && <div className="text-xs text-red-300 break-words">{serverError}</div>}
          {serverEntries.length === 0 ? (
            <div className="text-xs text-gray-500">{serverLoading ? 'Loading...' : 'No server logs yet.'}</div>
          ) : (
            <div className="space-y-2">
              {serverEntries
                .slice()
                .reverse()
                .slice(0, 80)
                .map((e) => (
                  <Card key={e.id} className="bg-gray-900/30 border-gray-800">
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-mono text-gray-500">{formatTs(e.ts)}</div>
                        <div className="flex items-center gap-2">
                          {e.source && (
                            <Badge variant="outline" className="text-[10px] border-gray-700 text-gray-400 bg-gray-950/20">
                              {e.source}
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] font-mono',
                              e.level === 'error'
                                ? 'border-red-900 text-red-300 bg-red-950/20'
                                : e.level === 'warn'
                                  ? 'border-yellow-900 text-yellow-300 bg-yellow-950/20'
                                  : e.level === 'info'
                                    ? 'border-blue-900 text-blue-300 bg-blue-950/20'
                                    : 'border-gray-700 text-gray-400 bg-gray-950/20'
                            )}
                          >
                            {String(e.level).toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2">
                      <div className="text-xs text-gray-200 whitespace-pre-wrap break-words">{e.message}</div>
                      {e.details && (
                        <pre className="text-[11px] text-gray-400 whitespace-pre-wrap break-words bg-gray-950/30 border border-gray-800 rounded p-3 overflow-auto">
                          {e.details}
                        </pre>
                      )}
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-xs text-gray-500">No logs captured yet.</div>
        ) : (
          filtered.map((e) => (
            <Card key={e.id} className="bg-gray-900/30 border-gray-800">
              <CardHeader className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-mono text-gray-500">{formatTs(e.ts)}</div>
                  <div className="flex items-center gap-2">
                    {e.source && (
                      <Badge variant="outline" className="text-[10px] border-gray-700 text-gray-400 bg-gray-950/20">
                        {e.source}
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] font-mono',
                        e.level === 'error'
                          ? 'border-red-900 text-red-300 bg-red-950/20'
                          : e.level === 'warn'
                            ? 'border-yellow-900 text-yellow-300 bg-yellow-950/20'
                            : e.level === 'info'
                              ? 'border-blue-900 text-blue-300 bg-blue-950/20'
                              : 'border-gray-700 text-gray-400 bg-gray-950/20'
                      )}
                    >
                      {e.level.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className="text-xs text-gray-200 whitespace-pre-wrap break-words">{e.message}</div>
                {e.details && (
                  <pre className="text-[11px] text-gray-400 whitespace-pre-wrap break-words bg-gray-950/30 border border-gray-800 rounded p-3 overflow-auto">
                    {e.details}
                  </pre>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
