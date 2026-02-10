import type { Request, Response } from 'express';
import { runSelfTestSuite } from '../services/selfTest.service';

export async function getSelfTest(_req: Request, res: Response) {
  try {
    const { summary, tests } = runSelfTestSuite();
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary,
      tests,
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
