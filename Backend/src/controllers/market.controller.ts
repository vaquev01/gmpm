import { Request, Response } from 'express';
import { getMarketSnapshot, MarketQueryParams } from '../services/market.service';

export async function marketController(req: Request, res: Response) {
  try {
    const limit = Math.max(0, Math.min(500, Number(req.query.limit) || 0));
    const assetClass = typeof req.query.assetClass === 'string' ? req.query.assetClass : null;
    const category = typeof req.query.category === 'string' ? req.query.category : null;
    const symbolsParam = typeof req.query.symbols === 'string' ? req.query.symbols : null;
    const includeMacro = req.query.includeMacro !== 'false';

    const params: MarketQueryParams = { limit, assetClass, category, symbolsParam, includeMacro };
    const result = await getMarketSnapshot(params);

    res.status(result.status).json(result.payload);
  } catch (err) {
    console.error('[market] controller error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
