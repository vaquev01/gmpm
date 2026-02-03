'use client';

import { useEffect } from 'react';
import { useLogStore, type LogLevel } from '@/store/useLogStore';

function safeSerialize(v: unknown): string {
  if (v instanceof Error) {
    return `${v.name}: ${v.message}${v.stack ? `\n${v.stack}` : ''}`;
  }

  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || v === null || v === undefined) return String(v);

  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(
      v,
      (_key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[Circular]';
          seen.add(value);
        }
        if (typeof value === 'bigint') return value.toString();
        if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
        return value;
      },
      2
    );
  } catch {
    return Object.prototype.toString.call(v);
  }
}

function normalizeArgs(args: unknown[]): { message: string; details?: string } {
  if (args.length === 0) return { message: '' };
  const [first, ...rest] = args;
  const message = safeSerialize(first);
  if (rest.length === 0) return { message };
  const details = rest.map(safeSerialize).join('\n');
  return { message, details };
}

export function ClientLogCapture() {
  const add = useLogStore((s) => s.add);

  useEffect(() => {
    const originals: Partial<Record<LogLevel, (...args: unknown[]) => void>> = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
    };

    const consoleRef = console as unknown as Record<LogLevel, (...args: unknown[]) => void>;

    const patch = (level: LogLevel) => {
      const original = originals[level];
      if (!original) return;
      consoleRef[level] = (...args: unknown[]) => {
        try {
          const { message, details } = normalizeArgs(args);
          add({
            ts: Date.now(),
            level,
            message,
            details,
            source: 'console',
          });
        } catch {
          // ignore
        }
        original(...args);
      };
    };

    patch('log');
    patch('info');
    patch('warn');
    patch('error');

    const onError = (event: ErrorEvent) => {
      const err = event.error;
      const message = err instanceof Error ? `${err.name}: ${err.message}` : (event.message || 'Unknown error');
      const details = err instanceof Error ? err.stack : undefined;
      add({ ts: Date.now(), level: 'error', message, details, source: 'window' });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? `${reason.name}: ${reason.message}` : 'Unhandled promise rejection';
      const details = reason instanceof Error ? reason.stack : safeSerialize(reason);
      add({ ts: Date.now(), level: 'error', message, details, source: 'window' });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);

      if (originals.log) console.log = originals.log;
      if (originals.info) console.info = originals.info;
      if (originals.warn) console.warn = originals.warn;
      if (originals.error) console.error = originals.error;
    };
  }, [add]);

  return null;
}
