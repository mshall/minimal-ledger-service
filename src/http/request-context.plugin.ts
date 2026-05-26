import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { IdempotencyContext } from '../services/idempotency.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    traceId: string;
    idempotency?: IdempotencyContext;
    idempotencyReplay?: { status: number; body: unknown };
  }
}

export const requestContextPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request) => {
    const incoming =
      (typeof request.headers['x-request-id'] === 'string'
        ? request.headers['x-request-id']
        : undefined) ?? randomUUID();
    const trace =
      (typeof request.headers['x-trace-id'] === 'string'
        ? request.headers['x-trace-id']
        : undefined) ?? incoming;

    request.requestId = incoming;
    request.traceId = trace;
    request.log = request.log.child({
      request_id: incoming,
      trace_id: trace,
    });
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? request.url;
    request.log.info({
      request_id: request.requestId,
      trace_id: request.traceId,
      route,
      method: request.method,
      status: reply.statusCode,
      duration_ms: reply.elapsedTime,
    });
  });
};
