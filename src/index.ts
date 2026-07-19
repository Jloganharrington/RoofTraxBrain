import { createApp } from './app.js';
import { env } from './env.js';
import { pingDb, db } from './db/client.js';
import { companiesTable } from './db/schema.js';
import { seed } from './config/seed.js';

async function autoSeedIfEmpty(): Promise<void> {
  try {
    const rows = await db.select().from(companiesTable).limit(1);
    if (rows.length === 0) {
      console.log('[brain] empty database detected — running seed...');
      await seed();
    }
  } catch (err) {
    // Table may not exist yet on very first boot before schema is applied.
    console.warn('[brain] auto-seed check skipped:', (err as Error).message);
  }
}

async function main(): Promise<void> {
  const app = createApp();

  try {
    const ok = await pingDb();
    console.log(`[brain] database connection: ${ok ? 'ok' : 'FAILED'}`);
    if (ok) await autoSeedIfEmpty();
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
