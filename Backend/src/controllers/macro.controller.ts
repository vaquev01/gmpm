import type { Request, Response } from 'express';
import { getMacroSnapshot } from '../services/macro.service';

export async function getMacro(request: Request, res: Response) {
  try {
    const noCache = request.query.nocache === '1';
    const result = await getMacroSnapshot(Boolean(noCache));

    const extra: Record<string, unknown> = {};
    if ('cached' in result) extra.cached = result.cached;
    if ('cacheAge' in result) extra.cacheAge = result.cacheAge;
    if ('cacheMode' in result) extra.cacheMode = result.cacheMode;

    res.status(result.status).json({ ...result.payload, ...extra });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ success: false, timestamp: new Date().toISOString(), error: msg });
  }
}
