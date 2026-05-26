import type { FastifyPluginAsync } from 'fastify';
import { Buffer } from 'node:buffer';
import { AccountsRepository } from '../../repositories/accounts.repo.js';
import { EntriesRepository } from '../../repositories/entries.repo.js';
import { IdempotencyRepository } from '../../repositories/idempotency.repo.js';
import { AccountsService } from '../../services/accounts.service.js';
import { IdempotencyService } from '../../services/idempotency.service.js';
import type { Database } from '../../db/client.js';
import { createAccountRequestSchema } from '../schemas/accounts.schema.js';

export type AccountsRoutesOptions = {
  db: Database;
};

function encodeCursor(postedAt: Date, id: bigint): string {
  return Buffer.from(
    JSON.stringify({ postedAt: postedAt.toISOString(), id: id.toString() }),
    'utf8',
  ).toString('base64url');
}

function decodeCursor(cursor: string): { postedAt: Date; id: bigint } | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      postedAt: string;
      id: string;
    };
    return { postedAt: new Date(parsed.postedAt), id: BigInt(parsed.id) };
  } catch {
    return undefined;
  }
}

export const accountsRoutes: FastifyPluginAsync<AccountsRoutesOptions> = async (fastify, opts) => {
  const accountsRepo = new AccountsRepository();
  const entriesRepo = new EntriesRepository();
  const idempotencyService = new IdempotencyService(new IdempotencyRepository());
  const service = new AccountsService(opts.db, accountsRepo, entriesRepo, idempotencyService);

  fastify.post(
    '/v1/accounts',
    {
      schema: {
        tags: ['accounts'],
        description: 'Create a ledger account',
        body: {
          type: 'object',
          required: ['name', 'type', 'currency'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            type: {
              type: 'string',
              enum: ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'],
            },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              type: { type: 'string' },
              currency: { type: 'string' },
              status: { type: 'string' },
              created_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (reply.sent) {
        return;
      }

      const body = createAccountRequestSchema.parse(request.body);
      const response = await service.createAccount(
        { name: body.name, type: body.type, currency: body.currency },
        request.idempotency,
      );
      return reply.status(201).send(response);
    },
  );

  fastify.get(
    '/v1/accounts/:id',
    {
      schema: {
        tags: ['accounts'],
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const account = await service.getAccount(id);
      return service.toAccountResponse(account);
    },
  );

  fastify.get(
    '/v1/accounts/:id/balance',
    {
      schema: {
        tags: ['accounts'],
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      return service.getBalance(id);
    },
  );

  fastify.get(
    '/v1/accounts/:id/entries',
    {
      schema: {
        tags: ['accounts'],
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            cursor: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const query = request.query as { limit?: number; cursor?: string };
      const limit = query.limit ?? 50;

      await service.getAccount(id);

      const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
      const rows = await entriesRepo.listByAccount(opts.db, id, limit, cursor);

      const entries = rows.map((e) => ({
        id: e.id.toString(),
        transaction_id: e.transactionId,
        account_id: e.accountId,
        direction: e.direction,
        amount: e.amount.toString(),
        currency: e.currency.trim(),
        posted_at: e.postedAt.toISOString(),
      }));

      const last = rows.at(-1);
      const next_cursor =
        rows.length === limit && last ? encodeCursor(last.postedAt, last.id) : null;

      return { entries, next_cursor };
    },
  );
};
