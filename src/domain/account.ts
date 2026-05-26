import type { AccountRow } from '../db/schema.js';
import { addAmounts, subtractAmounts } from './money.js';

export type AccountType = AccountRow['type'];
export type AccountStatus = AccountRow['status'];
export type EntryDirection = 'DEBIT' | 'CREDIT';

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  status: AccountStatus;
  createdAt: Date;
};

export function mapAccountRow(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currency: row.currency.trim(),
    status: row.status,
    createdAt: row.createdAt,
  };
}

/** Normal-balance side: DEBIT for ASSET/EXPENSE, CREDIT for LIABILITY/EQUITY/INCOME. */
export function normalBalanceSide(type: AccountType): EntryDirection {
  return type === 'ASSET' || type === 'EXPENSE' ? 'DEBIT' : 'CREDIT';
}

/**
 * Signed balance from journal aggregates (debits and credits in minor units).
 */
export function balanceFromJournal(type: AccountType, debits: bigint, credits: bigint): bigint {
  if (normalBalanceSide(type) === 'DEBIT') {
    return subtractAmounts(debits, credits);
  }
  return subtractAmounts(credits, debits);
}

/**
 * Apply an entry to a materialised balance using account normal-balance rules.
 */
export function applyEntryToBalance(
  type: AccountType,
  currentBalance: bigint,
  direction: EntryDirection,
  amount: bigint,
): bigint {
  const isDebitNormal = normalBalanceSide(type) === 'DEBIT';
  const increasesBalance =
    (direction === 'DEBIT' && isDebitNormal) || (direction === 'CREDIT' && !isDebitNormal);

  if (increasesBalance) {
    return addAmounts(currentBalance, amount);
  }
  return subtractAmounts(currentBalance, amount);
}

export function assertAccountActive(account: Account): void {
  if (account.status !== 'ACTIVE') {
    throw new Error(`Account ${account.id} is not active`);
  }
}
