export type ServerLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type ServerLogEntry = {
  id: string;
  ts: number;
  level: ServerLogLevel;
  message: string;
  details?: string;
  source?: string;
};

const MAX_ENTRIES = 500;

let seq = 0;

const buffer: ServerLogEntry[] = [];

function safeString(v: unknown): string {
  if (v instanceof Error) {
    return `${v.name}: ${v.message}${v.stack ? `\n${v.stack}` : ''}`;
  }
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || v === null || v === undefined) return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return Object.prototype.toString.call(v);
  }
}

export function addServerLog(entry: Omit<ServerLogEntry, 'id'>) {
  const id = `${entry.ts}-${seq++}`;
  buffer.push({ ...entry, id });
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
}

export function serverLog(level: ServerLogLevel, message: string, details?: unknown, source?: string) {
  addServerLog({
    ts: Date.now(),
    level,
    message,
    details: details === undefined ? undefined : safeString(details),
    source,
  });
}

export function getServerLogs(): ServerLogEntry[] {
  return buffer.slice();
}

export function clearServerLogs() {
  buffer.splice(0, buffer.length);
}
