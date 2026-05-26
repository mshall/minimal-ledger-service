import { createHash } from 'node:crypto';
import type { IdempotencyRepository } from '../repositories/idempotency.repo.js';
import type { DbExecutor } from '../repositories/accounts.repo.js';
import { IdempotencyConflictError } from '../domain/errors.js';

export type IdempotencyContext = {
  key: string;
  requestHash: string;
};

export type CachedIdempotencyResponse = {
  status: number;
  body: unknown;
};

/** Canonical JSON: sorted keys recursively, no whitespace. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
  return `{${parts.join(',')}}`;
}

export function hashRequestBody(body: unknown): string {
  return createHash('sha256').update(canonicalize(body)).digest('hex');
}

export class IdempotencyService {
  constructor(private readonly repo: IdempotencyRepository) {}

  async findCached(
    db: DbExecutor,
    ctx: IdempotencyContext,
  ): Promise<CachedIdempotencyResponse | 'conflict' | undefined> {
    const existing = await this.repo.findByKey(db, ctx.key);
    if (!existing) {
      return undefined;
    }
    if (existing.requestHash !== ctx.requestHash) {
      return 'conflict';
    }
    return { status: existing.responseStatus, body: existing.responseBody };
  }

  assertNoConflict(existing: CachedIdempotencyResponse | 'conflict' | undefined): void {
    if (existing === 'conflict') {
      throw new IdempotencyConflictError();
    }
  }

  async persist(
    db: DbExecutor,
    ctx: IdempotencyContext,
    status: number,
    body: unknown,
  ): Promise<void> {
    await this.repo.insert(db, {
      key: ctx.key,
      requestHash: ctx.requestHash,
      responseStatus: status,
      responseBody: body,
    });
  }

  async cleanupExpired(db: DbExecutor, ttlHours: number): Promise<number> {
    const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000);
    return this.repo.deleteOlderThan(db, cutoff);
  }
}
