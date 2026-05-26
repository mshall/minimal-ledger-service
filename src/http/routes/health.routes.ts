import type { FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import { checkDbConnectivity } from '../../db/client.js';
import {
  getMetricsRegistry,
  getMetricsText,
  updatePoolMetrics,
} from '../../observability/metrics.js';

export type HealthRoutesOptions = {
  pool: pg.Pool;
};

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (fastify, opts) => {
  fastify.get('/healthz', async () => ({ status: 'ok' }));

  fastify.get('/readyz', async (_request, reply) => {
    const ok = await checkDbConnectivity(opts.pool);
    if (!ok) {
      return reply.status(503).send({ status: 'unavailable' });
    }
    return { status: 'ready' };
  });

  fastify.get('/metrics', async (_request, reply) => {
    updatePoolMetrics(opts.pool);
    const metrics = await getMetricsText();
    return reply.header('Content-Type', getMetricsRegistry().contentType).send(metrics);
  });
};
