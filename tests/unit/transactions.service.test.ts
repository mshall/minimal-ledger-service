import { describe, expect, it, vi } from 'vitest';
import { TransactionsService } from '../../src/services/transactions.service.js';
import {
  AccountFrozenError,
  AccountNotFoundError,
  CurrencyMismatchError,
  UnbalancedTransactionError,
} from '../../src/domain/errors.js';
import type { Database } from '../../src/db/client.js';

function createTransactionalDb(): Database {
  return {
    transaction: vi.fn(async (callback: (tx: Database) => Promise<unknown>) =>
      callback({} as Database),
    ),
  } as unknown as Database;
}

describe('TransactionsService', () => {
  it('rejects unbalanced transactions before DB work', async () => {
    const db = createTransactionalDb();
    const service = new TransactionsService(
      db,
      { findByIdsForUpdate: vi.fn() } as never,
      { insertMany: vi.fn() } as never,
      { insert: vi.fn() } as never,
      { persist: vi.fn() } as never,
    );

    await expect(
      service.postTransaction({
        entries: [
          { accountId: 'a', direction: 'DEBIT', amount: 100n, currency: 'USD' },
          { accountId: 'b', direction: 'CREDIT', amount: 50n, currency: 'USD' },
        ],
      }),
    ).rejects.toBeInstanceOf(UnbalancedTransactionError);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects frozen accounts inside transaction', async () => {
    const accountId = '01920f3a-7b8a-7000-8000-000000000001';
    const db = createTransactionalDb();
    const accountsRepo = {
      findByIdsForUpdate: vi.fn().mockResolvedValue([
        {
          id: accountId,
          name: 'Frozen',
          type: 'LIABILITY',
          currency: 'USD',
          status: 'FROZEN',
          createdAt: new Date(),
        },
      ]),
      getBalance: vi.fn(),
      updateBalance: vi.fn(),
    };

    const service = new TransactionsService(
      db,
      accountsRepo as never,
      { insertMany: vi.fn(), findByTransactionId: vi.fn() } as never,
      { insert: vi.fn() } as never,
      { persist: vi.fn() } as never,
    );

    await expect(
      service.postTransaction({
        entries: [
          { accountId, direction: 'DEBIT', amount: 100n, currency: 'USD' },
          { accountId, direction: 'CREDIT', amount: 100n, currency: 'USD' },
        ],
      }),
    ).rejects.toBeInstanceOf(AccountFrozenError);
  });

  it('rejects currency mismatch', async () => {
    const debitId = '01920f3a-7b8a-7000-8000-000000000001';
    const creditId = '01920f3a-7b8a-7000-8000-000000000002';
    const db = createTransactionalDb();
    const accountsRepo = {
      findByIdsForUpdate: vi.fn().mockResolvedValue([
        {
          id: debitId,
          name: 'USD',
          type: 'ASSET',
          currency: 'USD',
          status: 'ACTIVE',
          createdAt: new Date(),
        },
        {
          id: creditId,
          name: 'EUR',
          type: 'LIABILITY',
          currency: 'EUR',
          status: 'ACTIVE',
          createdAt: new Date(),
        },
      ]),
      getBalance: vi.fn().mockResolvedValue({ balance: 0n, version: 0n }),
      updateBalance: vi.fn(),
    };

    const service = new TransactionsService(
      db,
      accountsRepo as never,
      { insertMany: vi.fn(), findByTransactionId: vi.fn() } as never,
      { insert: vi.fn() } as never,
      { persist: vi.fn() } as never,
    );

    await expect(
      service.postTransaction({
        entries: [
          { accountId: debitId, direction: 'DEBIT', amount: 100n, currency: 'USD' },
          { accountId: creditId, direction: 'CREDIT', amount: 100n, currency: 'USD' },
        ],
      }),
    ).rejects.toBeInstanceOf(CurrencyMismatchError);
  });

  it('rejects missing accounts', async () => {
    const missing = '01920f3a-7b8a-7000-8000-000000000099';
    const db = createTransactionalDb();
    const accountsRepo = {
      findByIdsForUpdate: vi.fn().mockResolvedValue([]),
    };
    const service = new TransactionsService(
      db,
      accountsRepo as never,
      { insertMany: vi.fn() } as never,
      { insert: vi.fn() } as never,
      { persist: vi.fn() } as never,
    );

    await expect(
      service.postTransaction({
        entries: [
          { accountId: missing, direction: 'DEBIT', amount: 100n, currency: 'USD' },
          { accountId: missing, direction: 'CREDIT', amount: 100n, currency: 'USD' },
        ],
      }),
    ).rejects.toBeInstanceOf(AccountNotFoundError);
  });
});
