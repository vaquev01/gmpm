import { Router } from 'express';
import { proxyToLegacy } from './proxy.routes';
import { serverLogsRouter } from './serverLogs.routes';
import { testRouter } from './test.routes';
import { fredRouter } from './fred.routes';
import { macroRouter } from './macro.routes';
import marketRouter from './market.routes';
import regimeRouter from './regime.routes';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

apiRouter.use('/server-logs', serverLogsRouter);

apiRouter.use('/test', testRouter);

apiRouter.use('/fred', fredRouter);
apiRouter.use('/macro', macroRouter);
apiRouter.use('/market', marketRouter);
apiRouter.use('/regime', regimeRouter);

apiRouter.use(proxyToLegacy);
