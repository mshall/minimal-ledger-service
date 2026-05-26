import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  char,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const accountTypeEnum = pgEnum('account_type', [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'INCOME',
  'EXPENSE',
]);

export const accountStatusEnum = pgEnum('account_status', ['ACTIVE', 'FROZEN', 'CLOSED']);

export const txnStatusEnum = pgEnum('txn_status', ['POSTED', 'REVERSED']);

export const entryDirectionEnum = pgEnum('entry_direction', ['DEBIT', 'CREDIT']);

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  type: accountTypeEnum('type').notNull(),
  currency: char('currency', { length: 3 }).notNull(),
  status: accountStatusEnum('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accountBalances = pgTable('account_balances', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id),
  balance: bigint('balance', { mode: 'bigint' })
    .notNull()
    .default(sql`0`),
  version: bigint('version', { mode: 'bigint' })
    .notNull()
    .default(sql`0`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey(),
  status: txnStatusEnum('status').notNull().default('POSTED'),
  description: text('description'),
  externalRef: text('external_ref'),
  postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
});

export const entries = pgTable(
  'entries',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    direction: entryDirectionEnum('direction').notNull(),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('entries_account_posted_idx').on(table.accountId, table.postedAt),
    index('entries_txn_idx').on(table.transactionId),
  ],
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text('key').primaryKey(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status').notNull(),
    responseBody: jsonb('response_body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idempotency_keys_created_at_idx').on(table.createdAt)],
);

export const accountsRelations = relations(accounts, ({ one }) => ({
  balance: one(accountBalances, {
    fields: [accounts.id],
    references: [accountBalances.accountId],
  }),
}));

export const transactionsRelations = relations(transactions, ({ many }) => ({
  entries: many(entries),
}));

export const entriesRelations = relations(entries, ({ one }) => ({
  transaction: one(transactions, {
    fields: [entries.transactionId],
    references: [transactions.id],
  }),
  account: one(accounts, {
    fields: [entries.accountId],
    references: [accounts.id],
  }),
}));

export type AccountRow = typeof accounts.$inferSelect;
export type AccountBalanceRow = typeof accountBalances.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type EntryRow = typeof entries.$inferSelect;
export type IdempotencyKeyRow = typeof idempotencyKeys.$inferSelect;
