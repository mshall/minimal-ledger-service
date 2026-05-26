import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { AppConfig } from './config.js';
import type { DbContext } from './db/client.js';
import { errorHandler } from './http/error-handler.js';
import { idempotencyPlugin } from './http/idempotency.plugin.js';
import { requestContextPlugin } from './http/request-context.plugin.js';
import { accountsRoutes } from './http/routes/accounts.routes.js';
import { healthRoutes } from './http/routes/health.routes.js';
import { transactionsRoutes } from './http/routes/transactions.routes.js';
import { httpRequestDurationSeconds, httpRequestsTotal } from './observability/metrics.js';
import type { Logger } from 'pino';

export type AppDependencies = {
  config: AppConfig;
  dbContext: DbContext;
  logger: Logger;
};

export async function buildApp(deps: AppDependencies) {
  const app = Fastify({
    loggerInstance: deps.logger,
    requestIdHeader: 'x-request-id',
    genReqId: (req) => {
      const header = req.headers['x-request-id'];
      return typeof header === 'string' ? header : randomUUID();
    },
  });

  app.setErrorHandler(errorHandler);

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Minimal Ledger Service',
        description: 'Production-grade double-entry ledger API',
        version: '1.0.0',
      },
      servers: [{ url: `http://localhost:${String(deps.config.port)}` }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  await app.register(requestContextPlugin);

  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? request.url;
    const labels = {
      method: request.method,
      route,
      status: String(reply.statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, reply.elapsedTime / 1000);
  });

  await app.register(idempotencyPlugin, { db: deps.dbContext.db });
  await app.register(healthRoutes, { pool: deps.dbContext.pool });
  await app.register(accountsRoutes, { db: deps.dbContext.db });
  await app.register(transactionsRoutes, { db: deps.dbContext.db });

  return app;
}
