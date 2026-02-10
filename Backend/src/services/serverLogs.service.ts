import { ServerLogRepository, type ServerLogEntryDTO } from '../repositories/serverLog.repository';

type LegacyResponse = {
  success?: unknown;
  entries?: unknown;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function normalizeLegacyEntry(v: unknown): ServerLogEntryDTO | null {
  if (!isRecord(v)) return null;
  if (typeof v.id !== 'string') return null;
  if (typeof v.ts !== 'number') return null;
  if (typeof v.level !== 'string') return null;
  if (typeof v.message !== 'string') return null;

  const level = v.level as ServerLogEntryDTO['level'];
  if (!['debug', 'info', 'warn', 'error'].includes(level)) return null;

  const details = typeof v.details === 'string' ? v.details : undefined;
  const source = typeof v.source === 'string' ? v.source : undefined;

  return {
    id: v.id,
    ts: v.ts,
    level,
    message: v.message,
    details,
    source,
  };
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const json = (await res.json()) as unknown;
    return { res, json };
  } finally {
    clearTimeout(t);
  }
}

async function fetchLegacyLogs(): Promise<ServerLogEntryDTO[]> {
  const base = process.env.LEGACY_BASE_URL || 'http://localhost:3000';

  try {
    const { res, json } = await fetchJsonWithTimeout(
      `${base}/api/server-logs`,
      {
        headers: { accept: 'application/json' },
      },
      1500
    );
    if (!res.ok) return [];
    if (!isRecord(json)) return [];

    const ok = (json as LegacyResponse).success === true;
    if (!ok) return [];

    const entries = (json as LegacyResponse).entries;
    if (!Array.isArray(entries)) return [];

    return entries.map(normalizeLegacyEntry).filter(Boolean) as ServerLogEntryDTO[];
  } catch {
    return [];
  }
}

async function clearLegacyLogs(): Promise<void> {
  const base = process.env.LEGACY_BASE_URL || 'http://localhost:3000';
  try {
    await fetchJsonWithTimeout(
      `${base}/api/server-logs`,
      {
        method: 'DELETE',
        headers: { accept: 'application/json' },
      },
      1500
    );
  } catch {
    return;
  }
}

export class ServerLogsService {
  constructor(private repo: ServerLogRepository) {}

  async listMerged(limit = 500): Promise<ServerLogEntryDTO[]> {
    const [db, legacy] = await Promise.all([this.repo.list(limit), fetchLegacyLogs()]);

    await this.repo.upsertMany(legacy);

    const map = new Map<string, ServerLogEntryDTO>();
    for (const e of [...db, ...legacy]) map.set(e.id, e);

    return [...map.values()].sort((a, b) => a.ts - b.ts);
  }

  async clearAll() {
    await Promise.all([this.repo.clear(), clearLegacyLogs()]);
  }
}
