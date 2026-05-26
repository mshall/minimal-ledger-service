import { z } from 'zod';

export const entryInputSchema = z.object({
  account_id: z.string().uuid(),
  direction: z.enum(['DEBIT', 'CREDIT']),
  amount: z.string().regex(/^\d+$/),
  currency: z.string().length(3),
});

export const postTransactionRequestSchema = z.object({
  description: z.string().max(500).optional(),
  external_ref: z.string().max(200).optional(),
  entries: z.array(entryInputSchema).min(2),
});

export const entryResponseSchema = z.object({
  id: z.string(),
  transaction_id: z.string().uuid(),
  account_id: z.string().uuid(),
  direction: z.enum(['DEBIT', 'CREDIT']),
  amount: z.string(),
  currency: z.string().length(3),
  posted_at: z.string().datetime(),
});

export const transactionResponseSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['POSTED', 'REVERSED']),
  description: z.string().nullable(),
  external_ref: z.string().nullable(),
  posted_at: z.string().datetime(),
  entries: z.array(entryResponseSchema),
});

export type PostTransactionRequest = z.infer<typeof postTransactionRequestSchema>;
