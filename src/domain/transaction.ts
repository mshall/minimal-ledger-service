import type { EntryDirection } from './account.js';
import { UnbalancedTransactionError } from './errors.js';
import { addAmounts, type CurrencyCode } from './money.js';

export type PostingEntryInput = {
  accountId: string;
  direction: EntryDirection;
  amount: bigint;
  currency: CurrencyCode;
};

export type PostTransactionInput = {
  description?: string | undefined;
  externalRef?: string | undefined;
  entries: PostingEntryInput[];
};

/**
 * App-side double-entry check per currency before hitting the deferred DB trigger.
 */
export function assertTransactionBalanced(entries: PostingEntryInput[]): void {
  const totals = new Map<string, { debits: bigint; credits: bigint }>();

  for (const entry of entries) {
    const key = entry.currency;
    const bucket = totals.get(key) ?? { debits: 0n, credits: 0n };
    if (entry.direction === 'DEBIT') {
      bucket.debits = addAmounts(bucket.debits, entry.amount);
    } else {
      bucket.credits = addAmounts(bucket.credits, entry.amount);
    }
    totals.set(key, bucket);
  }

  for (const [currency, { debits, credits }] of totals) {
    if (debits !== credits) {
      throw new UnbalancedTransactionError(currency);
    }
  }
}
