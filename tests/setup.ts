import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll } from 'vitest';
import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '../migrations');

let container: StartedPostgreSqlContainer | undefined;

async function applyMigrations(connectionString: string): Promise<void> {
  const pool = new pg.Pool({ connectionString });
  const client = await pool.connect();
  try {
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const raw = readFileSync(join(migrationsDir, file), 'utf8');
      const statements = raw
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const statement of statements) {
        await client.query(statement);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['LOG_LEVEL'] = 'silent';
  process.env['PORT'] = '0';
  process.env['BALANCE_VERIFY_INTERVAL_MS'] = '0';
  process.env['IDEMPOTENCY_CLEANUP_INTERVAL_MS'] = '0';

  let connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    connectionString = container.getConnectionUri();
    process.env['DATABASE_URL'] = connectionString;
  }

  await applyMigrations(connectionString);
}, 120_000);

afterAll(async () => {
  if (container) {
    await container.stop();
  }
}, 30_000);

export function getTestDatabaseUrl(): string {
  return process.env['DATABASE_URL'] ?? '';
}
