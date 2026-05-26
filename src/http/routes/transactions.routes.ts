import type { FastifyPluginAsync } from 'fastify';
import type { Database } from '../../db/client.js';
import { AccountsRepository } from '../../repositories/accounts.repo.js';
import { EntriesRepository } from '../../repositories/entries.repo.js';
import { IdempotencyRepository } from '../../repositories/idempotency.repo.js';
import { TransactionsRepository } from '../../repositories/transactions.repo.js';
import { IdempotencyService } from '../../services/idempotency.service.js';
import { TransactionsService } from '../../services/transactions.service.js';
import { postTransactionRequestSchema } from '../schemas/transactions.schema.js';

export type TransactionsRoutesOptions = {
  db: Database;
};

export const transactionsRoutes: FastifyPluginAsync<TransactionsRoutesOptions> = async (
  fastify,
  opts,
) => {
  const service = new TransactionsService(
    opts.db,
    new AccountsRepository(),
    new EntriesRepository(),
    new TransactionsRepository(),
    new IdempotencyService(new IdempotencyRepository()),
  );

  fastify.post(
    '/v1/transactions',
    {
      schema: {
        tags: ['transactions'],
        description: 'Post a balanced double-entry transaction',
        body: {
          type: 'object',
          required: ['entries'],
          properties: {
            description: { type: 'string' },
            external_ref: { type: 'string' },
            entries: {
              type: 'array',
              minItems: 2,
              items: {
                type: 'object',
                required: ['account_id', 'direction', 'amount', 'currency'],
                properties: {
                  account_id: { type: 'string', format: 'uuid' },
                  direction: { type: 'string', enum: ['DEBIT', 'CREDIT'] },
                  amount: { type: 'string' },
                  currency: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (reply.sent) {
        return;
      }

      const body = postTransactionRequestSchema.parse(request.body);
      const entries = TransactionsService.parsePostingEntries(body.entries);
      const response = await service.postTransaction(
        {
          description: body.description,
          externalRef: body.external_ref,
          entries,
        },
        request.idempotency,
      );
      return reply.status(201).send(response);
    },
  );

  fastify.get(
    '/v1/transactions/:id',
    {
      schema: {
        tags: ['transactions'],
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      return service.getTransaction(id);
    },
  );
};
