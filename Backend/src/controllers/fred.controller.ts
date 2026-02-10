import type { Request, Response } from 'express';
import { getFredSnapshot } from '../services/fred.service';

export async function getFred(request: Request, res: Response) {
  try {
    const noCache = request.query.nocache === '1';
    const result = await getFredSnapshot(Boolean(noCache));

    res.status(result.status).json(result.payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ success: false, timestamp: new Date().toISOString(), error: msg });
  }
}
