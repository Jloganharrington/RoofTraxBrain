import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import { env } from '../env.js';

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle(pool, { schema });
export { schema };

export async function pingDb(): Promise<boolean> {
  const res = await pool.query('select 1 as ok');
  return res.rows[0]?.ok === 1;
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
