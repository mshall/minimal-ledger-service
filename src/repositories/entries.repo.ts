import { and, desc, eq, sql } from 'drizzle-orm';
import { entries } from '../db/schema.js';
import type { DbExecutor } from './accounts.repo.js';

export class EntriesRepository {
  async insertMany(db: DbExecutor, rows: (typeof entries.$inferInsert)[]): Promise<void> {
    if (rows.length > 0) {
      await db.insert(entries).values(rows);
    }
  }

  async findByTransactionId(
    db: DbExecutor,
    transactionId: string,
  ): Promise<(typeof entries.$inferSelect)[]> {
    return db
      .select()
      .from(entries)
      .where(eq(entries.transactionId, transactionId))
      .orderBy(entries.id);
  }

  async listByAccount(
    db: DbExecutor,
    accountId: string,
    limit: number,
    cursor?: { postedAt: Date; id: bigint },
  ): Promise<(typeof entries.$inferSelect)[]> {
    const conditions = [eq(entries.accountId, accountId)];
    if (cursor) {
      conditions.push(
        sql`(${entries.postedAt}, ${entries.id}) < (${cursor.postedAt}, ${cursor.id})`,
      );
    }

    return db
      .select()
      .from(entries)
      .where(and(...conditions))
      .orderBy(desc(entries.postedAt), desc(entries.id))
      .limit(limit);
  }

  async sumJournalByAccount(
    db: DbExecutor,
    accountId: string,
  ): Promise<{ debits: bigint; credits: bigint }> {
    const [row] = await db
      .select({
        debits: sql<bigint>`COALESCE(SUM(CASE WHEN ${entries.direction} = 'DEBIT' THEN ${entries.amount} ELSE 0 END), 0)`,
        credits: sql<bigint>`COALESCE(SUM(CASE WHEN ${entries.direction} = 'CREDIT' THEN ${entries.amount} ELSE 0 END), 0)`,
      })
      .from(entries)
      .where(eq(entries.accountId, accountId));

    return {
      debits: coerceBigInt(row?.debits),
      credits: coerceBigInt(row?.credits),
    };
  }
}

function coerceBigInt(value: bigint | string | number | null | undefined): bigint {
  if (value === null || value === undefined) {
    return 0n;
  }
  if (typeof value === 'bigint') {
    return value;
  }
  return BigInt(value);
}
