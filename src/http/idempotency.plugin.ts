import type { FastifyPluginAsync } from 'fastify';
import type { Database } from '../db/client.js';
import { IdempotencyConflictError, IdempotencyKeyRequiredError } from '../domain/errors.js';
import { IdempotencyRepository } from '../repositories/idempotency.repo.js';
import {
  hashRequestBody,
  IdempotencyService,
  type IdempotencyContext,
} from '../services/idempotency.service.js';

export type IdempotencyPluginOptions = {
  db: Database;
};

export const idempotencyPlugin: FastifyPluginAsync<IdempotencyPluginOptions> = async (
  fastify,
  opts,
) => {
  const idempotencyService = new IdempotencyService(new IdempotencyRepository());

  fastify.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'POST') {
      return;
    }

    const keyHeader = request.headers['idempotency-key'];
    const key = typeof keyHeader === 'string' ? keyHeader.trim() : undefined;
    if (!key || key.length === 0) {
      throw new IdempotencyKeyRequiredError();
    }

    const requestHash = hashRequestBody(request.body);
    const ctx: IdempotencyContext = { key, requestHash };
    request.idempotency = ctx;

    const lookup = await idempotencyService.findCached(opts.db, ctx);
    if (lookup === 'conflict') {
      throw new IdempotencyConflictError();
    }
    if (lookup) {
      request.idempotencyReplay = lookup;
      void reply.status(lookup.status).send(lookup.body);
    }
  });
};
