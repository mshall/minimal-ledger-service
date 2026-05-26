import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { verifyBalances } from '../../src/jobs/balance-verification.js';
import { createTestApp } from '../helpers.js';

describe('double-entry invariant (property)', () => {
  it('keeps journal and materialised balances aligned for random valid postings', async () => {
    const { app, dbContext } = await createTestApp();

    const asset = await request(app.server)
      .post('/v1/accounts')
      .set('Idempotency-Key', 'prop-asset')
      .send({ name: 'Prop Asset', type: 'ASSET', currency: 'USD' });
    const liability = await request(app.server)
      .post('/v1/accounts')
      .set('Idempotency-Key', 'prop-liab')
      .send({ name: 'Prop Liab', type: 'LIABILITY', currency: 'USD' });

    const assetId = asset.body.id as string;
    const liabilityId = liability.body.id as string;

    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 500 }), { minLength: 1, maxLength: 8 }),
        async (amounts) => {
          for (const [idx, amt] of amounts.entries()) {
            const amount = String(amt);
            await request(app.server)
              .post('/v1/transactions')
              .set('Idempotency-Key', `prop-${String(idx)}-${amount}-${String(Math.random())}`)
              .send({
                entries: [
                  { account_id: assetId, direction: 'DEBIT', amount, currency: 'USD' },
                  { account_id: liabilityId, direction: 'CREDIT', amount, currency: 'USD' },
                ],
              })
              .expect(201);
          }

          const balance = await request(app.server)
            .get(`/v1/accounts/${liabilityId}/balance`)
            .expect(200);

          expect(balance.body.balance).toBe(balance.body.journal_balance);

          const report = await verifyBalances(dbContext.db);
          expect(report.drifts).toHaveLength(0);
        },
      ),
      { numRuns: 5 },
    );

    await app.close();
    await dbContext.pool.end();
  }, 120_000);
});
