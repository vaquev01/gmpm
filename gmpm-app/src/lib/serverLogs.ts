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

type ServerLogStore = {
  seq: number;
  buffer: ServerLogEntry[];
};

const STORE_KEY = '__gmpm_server_logs_store__';

function getStore(): ServerLogStore {
  const g = globalThis as unknown as Record<string, unknown>;
  const existing = g[STORE_KEY];
  if (existing && typeof existing === 'object') {
    const s = existing as Partial<ServerLogStore>;
    if (typeof s.seq === 'number' && Array.isArray(s.buffer)) {
      return s as ServerLogStore;
    }
  }

  const store: ServerLogStore = { seq: 0, buffer: [] };
  g[STORE_KEY] = store;
  return store;
}

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
  const store = getStore();
  const id = `${entry.ts}-${store.seq++}`;
  store.buffer.push({ ...entry, id });
  if (store.buffer.length > MAX_ENTRIES) store.buffer.splice(0, store.buffer.length - MAX_ENTRIES);
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
  return getStore().buffer.slice();
}

export function clearServerLogs() {
  getStore().buffer.splice(0, getStore().buffer.length);
}
