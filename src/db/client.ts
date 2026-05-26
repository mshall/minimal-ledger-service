import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { AppConfig } from '../config.js';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export type DbContext = {
  db: Database;
  pool: pg.Pool;
};

export function createDbContext(config: AppConfig): DbContext {
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 20,
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export async function checkDbConnectivity(pool: pg.Pool): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    return true;
  } finally {
    client.release();
  }
}
