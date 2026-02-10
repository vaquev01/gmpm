import express from 'express';
import cors from 'cors';
import { apiRouter } from './routes';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  app.use('/api', apiRouter);

  return app;
}
