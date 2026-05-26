import { z } from 'zod';

export const accountTypeSchema = z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']);

export const accountStatusSchema = z.enum(['ACTIVE', 'FROZEN', 'CLOSED']);

export const createAccountRequestSchema = z.object({
  name: z.string().min(1).max(100),
  type: accountTypeSchema,
  currency: z.string().length(3),
});

export const accountResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: accountTypeSchema,
  currency: z.string().length(3),
  status: accountStatusSchema,
  created_at: z.string().datetime(),
});

export const balanceResponseSchema = z.object({
  account_id: z.string().uuid(),
  currency: z.string().length(3),
  balance: z.string(),
  journal_balance: z.string(),
  as_of: z.string().datetime(),
});

export const entryStatementSchema = z.object({
  id: z.string(),
  transaction_id: z.string().uuid(),
  account_id: z.string().uuid(),
  direction: z.enum(['DEBIT', 'CREDIT']),
  amount: z.string(),
  currency: z.string().length(3),
  posted_at: z.string().datetime(),
});

export const entriesListResponseSchema = z.object({
  entries: z.array(entryStatementSchema),
  next_cursor: z.string().nullable(),
});

export type CreateAccountRequest = z.infer<typeof createAccountRequestSchema>;
export type AccountResponse = z.infer<typeof accountResponseSchema>;
