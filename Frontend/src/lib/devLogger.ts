/**
 * Client-side dev logger — captures unhandled errors, promise rejections,
 * and provides a simple console overlay for diagnostics.
 */

interface LogEntry {
  level: 'error' | 'warn' | 'info';
  message: string;
  timestamp: number;
  source?: string;
}

const MAX_ENTRIES = 100;
const entries: LogEntry[] = [];

function push(entry: LogEntry) {
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
}

export function getDevLogs(): readonly LogEntry[] {
  return entries;
}

export function clearDevLogs() {
  entries.length = 0;
}

export function devLog(level: LogEntry['level'], message: string, source?: string) {
  push({ level, message, timestamp: Date.now(), source });
  if (level === 'error') console.error(`[GMPM] ${source || ''}:`, message);
  else if (level === 'warn') console.warn(`[GMPM] ${source || ''}:`, message);
}

export function initDevLogger() {
  window.addEventListener('error', (e) => {
    push({
      level: 'error',
      message: `${e.message} at ${e.filename}:${e.lineno}:${e.colno}`,
      timestamp: Date.now(),
      source: 'window.onerror',
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
    push({
      level: 'error',
      message: msg,
      timestamp: Date.now(),
      source: 'unhandledrejection',
    });
  });

  // Expose to console for debugging
  (window as unknown as Record<string, unknown>).__GMPM_LOGS = {
    get: getDevLogs,
    clear: clearDevLogs,
  };

  devLog('info', 'GMPM dev logger initialized', 'init');
}
