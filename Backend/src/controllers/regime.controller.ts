import { Request, Response } from 'express';
import { getRegimeSnapshot } from '../services/regime.service';

export async function regimeController(_req: Request, res: Response) {
  try {
    const result = await getRegimeSnapshot();
    res.status(result.status).json(result.payload);
  } catch (err) {
    console.error('[regime] controller error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
