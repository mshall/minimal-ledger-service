import { v7 as uuidv7 } from 'uuid';
import type { Database } from '../db/client.js';
import { applyEntryToBalance, mapAccountRow, type EntryDirection } from '../domain/account.js';
import {
  AccountFrozenError,
  AccountNotFoundError,
  CurrencyMismatchError,
  TransactionNotFoundError,
} from '../domain/errors.js';
import { assertSupportedCurrency, formatAmount, parseAmount } from '../domain/money.js';
import {
  assertTransactionBalanced,
  type PostingEntryInput,
  type PostTransactionInput,
} from '../domain/transaction.js';
import { AccountsRepository } from '../repositories/accounts.repo.js';
import { EntriesRepository } from '../repositories/entries.repo.js';
import { TransactionsRepository } from '../repositories/transactions.repo.js';
import {
  ledgerEntriesPostedTotal,
  ledgerTransactionsPostedTotal,
} from '../observability/metrics.js';
import type { IdempotencyContext } from './idempotency.service.js';
import { IdempotencyService } from './idempotency.service.js';

export type EntryResponse = {
  id: string;
  transaction_id: string;
  account_id: string;
  direction: EntryDirection;
  amount: string;
  currency: string;
  posted_at: string;
};

export type TransactionResponse = {
  id: string;
  status: 'POSTED' | 'REVERSED';
  description: string | null;
  external_ref: string | null;
  posted_at: string;
  entries: EntryResponse[];
};

export class TransactionsService {
  constructor(
    private readonly db: Database,
    private readonly accountsRepo: AccountsRepository,
    private readonly entriesRepo: EntriesRepository,
    private readonly transactionsRepo: TransactionsRepository,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  async postTransaction(
    input: PostTransactionInput,
    idempotency?: IdempotencyContext,
    responseForCache?: TransactionResponse,
  ): Promise<TransactionResponse> {
    assertTransactionBalanced(input.entries);

    const distinctAccountIds = [...new Set(input.entries.map((e) => e.accountId))].sort();

    const result = await this.db.transaction(async (tx) => {
      const lockedRows = await this.accountsRepo.findByIdsForUpdate(tx, distinctAccountIds);
      const accountMap = new Map(lockedRows.map((r) => [r.id, mapAccountRow(r)]));

      for (const accountId of distinctAccountIds) {
        const account = accountMap.get(accountId);
        if (!account) {
          throw new AccountNotFoundError(accountId);
        }
        if (account.status === 'FROZEN') {
          throw new AccountFrozenError(accountId);
        }
        if (account.status !== 'ACTIVE') {
          throw new AccountFrozenError(accountId);
        }
      }

      for (const entry of input.entries) {
        const account = accountMap.get(entry.accountId);
        if (!account) {
          throw new AccountNotFoundError(entry.accountId);
        }
        if (account.currency !== entry.currency) {
          throw new CurrencyMismatchError(entry.accountId, account.currency, entry.currency);
        }
      }

      const balanceDeltas = new Map<string, bigint>();
      for (const entry of input.entries) {
        const account = accountMap.get(entry.accountId);
        if (!account) {
          continue;
        }
        const balanceRow = await this.accountsRepo.getBalance(tx, entry.accountId);
        const current = balanceRow?.balance ?? 0n;
        const deltaKey = entry.accountId;
        const running = balanceDeltas.get(deltaKey) ?? current;
        const next = applyEntryToBalance(account.type, running, entry.direction, entry.amount);
        balanceDeltas.set(deltaKey, next);
      }

      const transactionId = uuidv7();
      const txn = await this.transactionsRepo.insert(tx, {
        id: transactionId,
        status: 'POSTED',
        description: input.description ?? null,
        externalRef: input.externalRef ?? null,
      });

      const entryRows = input.entries.map((e) => ({
        transactionId,
        accountId: e.accountId,
        direction: e.direction,
        amount: e.amount,
        currency: e.currency,
      }));

      await this.entriesRepo.insertMany(tx, entryRows);

      for (const [accountId, newBalance] of balanceDeltas) {
        const balanceRow = await this.accountsRepo.getBalance(tx, accountId);
        if (!balanceRow) {
          throw new AccountNotFoundError(accountId);
        }
        const updated = await this.accountsRepo.updateBalance(
          tx,
          accountId,
          newBalance,
          balanceRow.version,
        );
        if (!updated) {
          throw new Error(`Optimistic concurrency conflict on account ${accountId}`);
        }
      }

      const insertedEntries = await this.entriesRepo.findByTransactionId(tx, transactionId);
      const response: TransactionResponse = {
        id: txn.id,
        status: txn.status,
        description: txn.description,
        external_ref: txn.externalRef,
        posted_at: txn.postedAt.toISOString(),
        entries: insertedEntries.map((e) => ({
          id: e.id.toString(),
          transaction_id: e.transactionId,
          account_id: e.accountId,
          direction: e.direction,
          amount: formatAmount(e.amount),
          currency: e.currency.trim(),
          posted_at: e.postedAt.toISOString(),
        })),
      };

      if (idempotency) {
        await this.idempotencyService.persist(tx, idempotency, 201, responseForCache ?? response);
      }

      ledgerTransactionsPostedTotal.inc();
      ledgerEntriesPostedTotal.inc(input.entries.length);

      return response;
    });

    return result;
  }

  async getTransaction(transactionId: string): Promise<TransactionResponse> {
    const txn = await this.transactionsRepo.findById(this.db, transactionId);
    if (!txn) {
      throw new TransactionNotFoundError(transactionId);
    }
    const entryRows = await this.entriesRepo.findByTransactionId(this.db, transactionId);
    return {
      id: txn.id,
      status: txn.status,
      description: txn.description,
      external_ref: txn.externalRef,
      posted_at: txn.postedAt.toISOString(),
      entries: entryRows.map((e) => ({
        id: e.id.toString(),
        transaction_id: e.transactionId,
        account_id: e.accountId,
        direction: e.direction,
        amount: formatAmount(e.amount),
        currency: e.currency.trim(),
        posted_at: e.postedAt.toISOString(),
      })),
    };
  }

  static parsePostingEntries(
    entries: {
      account_id: string;
      direction: EntryDirection;
      amount: string;
      currency: string;
    }[],
  ): PostingEntryInput[] {
    return entries.map((e) => ({
      accountId: e.account_id,
      direction: e.direction,
      amount: parseAmount(e.amount),
      currency: assertSupportedCurrency(e.currency),
    }));
  }
}
