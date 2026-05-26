import { loadConfig } from './config.js';
import { createDbContext } from './db/client.js';
import { buildApp } from './app.js';
import { migrate } from './db/migrate.js';
import { startBalanceVerificationScheduler } from './jobs/balance-verification.js';
import { createLogger, getLogger } from './observability/logger.js';
import { IdempotencyRepository } from './repositories/idempotency.repo.js';
import { IdempotencyService } from './services/idempotency.service.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const dbContext = createDbContext(config);

  if (config.nodeEnv === 'development') {
    await migrate();
  }

  const app = await buildApp({ config, dbContext, logger });

  const idempotencyService = new IdempotencyService(new IdempotencyRepository());
  if (config.idempotencyCleanupIntervalMs > 0) {
    setInterval(() => {
      void idempotencyService.cleanupExpired(dbContext.db, config.idempotencyTtlHours);
    }, config.idempotencyCleanupIntervalMs);
  }

  const balanceScheduler = startBalanceVerificationScheduler(
    dbContext.db,
    config.balanceVerifyIntervalMs,
  );

  await app.listen({ port: config.port, host: config.host });
  logger.info({ port: config.port }, 'Ledger service listening');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    if (balanceScheduler) {
      clearInterval(balanceScheduler);
    }

    await app.close();
    await dbContext.pool.end();
    logger.info('Shutdown complete');
    process.exit(0);
  };

  const forceExit = setTimeout(() => {
    getLogger().error('Shutdown timeout exceeded');
    process.exit(1);
  }, config.shutdownTimeoutMs);
  forceExit.unref();

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
