import { eq } from 'drizzle-orm';
import { transactions } from '../db/schema.js';
import type { DbExecutor } from './accounts.repo.js';

export class TransactionsRepository {
  async insert(
    db: DbExecutor,
    row: typeof transactions.$inferInsert,
  ): Promise<typeof transactions.$inferSelect> {
    const [created] = await db.insert(transactions).values(row).returning();
    if (!created) {
      throw new Error('Failed to insert transaction');
    }
    return created;
  }

  async findById(
    db: DbExecutor,
    transactionId: string,
  ): Promise<typeof transactions.$inferSelect | undefined> {
    const [row] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .limit(1);
    return row;
  }
}
