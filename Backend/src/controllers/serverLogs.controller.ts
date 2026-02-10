import type { Request, Response } from 'express';
import { ServerLogRepository } from '../repositories/serverLog.repository';
import { ServerLogsService } from '../services/serverLogs.service';

const service = new ServerLogsService(new ServerLogRepository());

export async function getServerLogs(_req: Request, res: Response) {
  try {
    const entries = await service.listMerged(500);
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      entries,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: msg,
    });
  }
}

export async function deleteServerLogs(_req: Request, res: Response) {
  try {
    await service.clearAll();
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: msg,
    });
  }
}
