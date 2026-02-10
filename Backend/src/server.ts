import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { createApp } from './app';

const explicitEnv = process.env.ENV_FILE
  ? process.env.ENV_FILE
  : fileURLToPath(new URL('../.env', import.meta.url));

dotenv.config({ path: explicitEnv });

if (!process.env.FRED_API_KEY) {
  dotenv.config({
    path: fileURLToPath(new URL('../../gmpm-app/.env.local', import.meta.url)),
    override: false,
  });
}

const app = createApp();

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`[backend] listening on http://localhost:${port}`);
});
