import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDbContext } from '../src/db/client.js';
import { createLogger } from '../src/observability/logger.js';
import { getTestDatabaseUrl } from './setup.js';

export async function createTestApp() {
  process.env['DATABASE_URL'] = getTestDatabaseUrl();
  const config = loadConfig();
  const dbContext = createDbContext(config);
  const logger = createLogger(config);
  const app = await buildApp({ config, dbContext, logger });
  await app.ready();
  return { app, dbContext, config };
}
