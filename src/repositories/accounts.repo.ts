import { eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import { accountBalances, accounts } from '../db/schema.js';

export type DbExecutor = NodePgDatabase<typeof schema>;

export class AccountsRepository {
  async insertAccount(
    db: DbExecutor,
    row: typeof accounts.$inferInsert,
  ): Promise<typeof accounts.$inferSelect> {
    const [created] = await db.insert(accounts).values(row).returning();
    if (!created) {
      throw new Error('Failed to insert account');
    }
    return created;
  }

  async insertBalance(db: DbExecutor, row: typeof accountBalances.$inferInsert): Promise<void> {
    await db.insert(accountBalances).values(row);
  }

  async findById(
    db: DbExecutor,
    accountId: string,
  ): Promise<typeof accounts.$inferSelect | undefined> {
    const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    return row;
  }

  async findByIdsForUpdate(
    db: DbExecutor,
    accountIds: string[],
  ): Promise<(typeof accounts.$inferSelect)[]> {
    if (accountIds.length === 0) {
      return [];
    }
    return db
      .select()
      .from(accounts)
      .where(inArray(accounts.id, accountIds))
      .orderBy(accounts.id)
      .for('update');
  }

  async getBalance(
    db: DbExecutor,
    accountId: string,
  ): Promise<typeof accountBalances.$inferSelect | undefined> {
    const [row] = await db
      .select()
      .from(accountBalances)
      .where(eq(accountBalances.accountId, accountId))
      .limit(1);
    return row;
  }

  async updateBalance(
    db: DbExecutor,
    accountId: string,
    balance: bigint,
    expectedVersion: bigint,
  ): Promise<boolean> {
    const result = await db
      .update(accountBalances)
      .set({
        balance,
        version: expectedVersion + 1n,
        updatedAt: sql`now()`,
      })
      .where(
        sql`${accountBalances.accountId} = ${accountId} AND ${accountBalances.version} = ${expectedVersion}`,
      )
      .returning();
    return result.length > 0;
  }

  async listAllAccountIds(db: DbExecutor): Promise<string[]> {
    const rows = await db.select({ id: accounts.id }).from(accounts);
    return rows.map((r) => r.id);
  }
}
