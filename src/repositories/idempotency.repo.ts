import { eq, lt } from 'drizzle-orm';
import { idempotencyKeys } from '../db/schema.js';
import type { DbExecutor } from './accounts.repo.js';

export type IdempotencyRecord = {
  key: string;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
};

export class IdempotencyRepository {
  async findByKey(db: DbExecutor, key: string): Promise<IdempotencyRecord | undefined> {
    const [row] = await db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, key))
      .limit(1);
    if (!row) {
      return undefined;
    }
    return {
      key: row.key,
      requestHash: row.requestHash,
      responseStatus: row.responseStatus,
      responseBody: row.responseBody,
    };
  }

  async insert(
    db: DbExecutor,
    record: {
      key: string;
      requestHash: string;
      responseStatus: number;
      responseBody: unknown;
    },
  ): Promise<void> {
    await db.insert(idempotencyKeys).values({
      key: record.key,
      requestHash: record.requestHash,
      responseStatus: record.responseStatus,
      responseBody: record.responseBody,
    });
  }

  async deleteOlderThan(db: DbExecutor, cutoff: Date): Promise<number> {
    const result = await db
      .delete(idempotencyKeys)
      .where(lt(idempotencyKeys.createdAt, cutoff))
      .returning({ key: idempotencyKeys.key });
    return result.length;
  }
}
