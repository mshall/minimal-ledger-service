import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { accountBalances } from '../../src/db/schema.js';
import { verifyBalances } from '../../src/jobs/balance-verification.js';
import { createTestApp } from '../helpers.js';

describe('balance verification', () => {
  it('detects drift when materialised balance is corrupted', async () => {
    const { app, dbContext } = await createTestApp();

    const created = await request(app.server)
      .post('/v1/accounts')
      .set('Idempotency-Key', 'verify-acct')
      .send({ name: 'Verify', type: 'LIABILITY', currency: 'USD' })
      .expect(201);

    const accountId = created.body.id as string;

    const asset = await request(app.server)
      .post('/v1/accounts')
      .set('Idempotency-Key', 'verify-asset')
      .send({ name: 'Asset', type: 'ASSET', currency: 'USD' });

    await request(app.server)
      .post('/v1/transactions')
      .set('Idempotency-Key', 'verify-txn')
      .send({
        entries: [
          { account_id: asset.body.id, direction: 'DEBIT', amount: '500', currency: 'USD' },
          { account_id: accountId, direction: 'CREDIT', amount: '500', currency: 'USD' },
        ],
      })
      .expect(201);

    await dbContext.db
      .update(accountBalances)
      .set({ balance: 999999n })
      .where(eq(accountBalances.accountId, accountId));

    const report = await verifyBalances(dbContext.db);
    expect(report.drifts.length).toBeGreaterThan(0);
    expect(report.drifts.some((d) => d.accountId === accountId)).toBe(true);

    await app.close();
    await dbContext.pool.end();
  });
});
