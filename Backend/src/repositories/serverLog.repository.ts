import { prisma } from '../db/prisma';

export type ServerLogEntryDTO = {
  id: string;
  ts: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  details?: string;
  source?: string;
};

export class ServerLogRepository {
  async list(limit = 500): Promise<ServerLogEntryDTO[]> {
    const rows = await prisma.serverLog.findMany({
      orderBy: { ts: 'asc' },
      take: Math.max(1, Math.min(limit, 500)),
    });

    return rows.map((r) => ({
      id: r.id,
      ts: Number(r.ts),
      level: r.level,
      message: r.message,
      details: r.details ?? undefined,
      source: r.source ?? undefined,
    }));
  }

  async upsertMany(entries: ServerLogEntryDTO[]) {
    if (entries.length === 0) return;

    await prisma.$transaction(
      entries.map((e) =>
        prisma.serverLog.upsert({
          where: { id: e.id },
          create: {
            id: e.id,
            ts: BigInt(e.ts),
            level: e.level,
            message: e.message,
            details: e.details ?? null,
            source: e.source ?? null,
          },
          update: {
            ts: BigInt(e.ts),
            level: e.level,
            message: e.message,
            details: e.details ?? null,
            source: e.source ?? null,
          },
        })
      )
    );
  }

  async clear() {
    await prisma.serverLog.deleteMany();
  }
}
