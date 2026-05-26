import { v7 as uuidv7 } from 'uuid';
import type { Database } from '../db/client.js';
import { balanceFromJournal, mapAccountRow, type Account } from '../domain/account.js';
import { assertSupportedCurrency } from '../domain/money.js';
import { AccountNotFoundError } from '../domain/errors.js';
import { AccountsRepository } from '../repositories/accounts.repo.js';
import { EntriesRepository } from '../repositories/entries.repo.js';
import type { IdempotencyContext } from './idempotency.service.js';
import { IdempotencyService } from './idempotency.service.js';

export type CreateAccountInput = {
  name: string;
  type: Account['type'];
  currency: string;
};

export type AccountResponse = {
  id: string;
  name: string;
  type: Account['type'];
  currency: string;
  status: Account['status'];
  created_at: string;
};

export type BalanceResponse = {
  account_id: string;
  currency: string;
  balance: string;
  journal_balance: string;
  as_of: string;
};

export class AccountsService {
  constructor(
    private readonly db: Database,
    private readonly accountsRepo: AccountsRepository,
    private readonly entriesRepo: EntriesRepository,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  toAccountResponse(account: Account): AccountResponse {
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      status: account.status,
      created_at: account.createdAt.toISOString(),
    };
  }

  async createAccount(
    input: CreateAccountInput,
    idempotency?: IdempotencyContext,
    responseForCache?: AccountResponse,
  ): Promise<AccountResponse> {
    const currency = assertSupportedCurrency(input.currency);
    const accountId = uuidv7();

    return this.db.transaction(async (tx) => {
      const row = await this.accountsRepo.insertAccount(tx, {
        id: accountId,
        name: input.name,
        type: input.type,
        currency,
        status: 'ACTIVE',
      });
      await this.accountsRepo.insertBalance(tx, {
        accountId,
        balance: 0n,
        version: 0n,
      });

      const response = this.toAccountResponse(mapAccountRow(row));

      if (idempotency) {
        await this.idempotencyService.persist(tx, idempotency, 201, responseForCache ?? response);
      }

      return response;
    });
  }

  async getAccount(accountId: string): Promise<Account> {
    const row = await this.accountsRepo.findById(this.db, accountId);
    if (!row) {
      throw new AccountNotFoundError(accountId);
    }
    return mapAccountRow(row);
  }

  async getBalance(accountId: string): Promise<BalanceResponse> {
    const account = await this.getAccount(accountId);
    const materialised = await this.accountsRepo.getBalance(this.db, accountId);
    if (!materialised) {
      throw new AccountNotFoundError(accountId);
    }

    const { debits, credits } = await this.entriesRepo.sumJournalByAccount(this.db, accountId);
    const journalBalance = balanceFromJournal(account.type, debits, credits);

    return {
      account_id: accountId,
      currency: account.currency,
      balance: materialised.balance.toString(),
      journal_balance: journalBalance.toString(),
      as_of: materialised.updatedAt.toISOString(),
    };
  }

  /** Used by balance verification job — compares materialised vs journal. */
  async computeJournalBalance(accountId: string, type: Account['type']): Promise<bigint> {
    const { debits, credits } = await this.entriesRepo.sumJournalByAccount(this.db, accountId);
    return balanceFromJournal(type, debits, credits);
  }
}
