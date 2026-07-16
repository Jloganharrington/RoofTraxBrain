import { createApp } from './app.js';
import { env } from './env.js';
import { pingDb } from './db/client.js';

async function main(): Promise<void> {
  const app = createApp();

  try {
    const ok = await pingDb();
    console.log(`[brain] database connection: ${ok ? 'ok' : 'FAILED'}`);
  } catch (err) {
    console.error('[brain] database connection error:', (err as Error).message);
  }

  app.listen(env.PORT, () => {
    console.log(`[brain] rooftrax-brain listening on :${env.PORT} (${env.NODE_ENV})`);
  });
}

main().catch((err) => {
  console.error('[brain] fatal:', err);
  process.exit(1);
});
