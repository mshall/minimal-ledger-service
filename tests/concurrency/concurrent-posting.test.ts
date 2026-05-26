import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { verifyBalances } from '../../src/jobs/balance-verification.js';
import { createTestApp } from '../helpers.js';

describe('concurrent posting', () => {
  it('handles 50 concurrent posts to the same account pair', async () => {
    const { app, dbContext } = await createTestApp();

    const debit = await request(app.server)
      .post('/v1/accounts')
      .set('Idempotency-Key', 'conc-debit')
      .send({ name: 'Concurrent Cash', type: 'ASSET', currency: 'USD' });
    const credit = await request(app.server)
      .post('/v1/accounts')
      .set('Idempotency-Key', 'conc-credit')
      .send({ name: 'Concurrent Wallet', type: 'LIABILITY', currency: 'USD' });

    const debitId = debit.body.id as string;
    const creditId = credit.body.id as string;
    const amount = '100';

    const workers = Array.from({ length: 50 }, (_, i) =>
      request(app.server)
        .post('/v1/transactions')
        .set('Idempotency-Key', `conc-txn-${String(i)}`)
        .send({
          entries: [
            { account_id: debitId, direction: 'DEBIT', amount, currency: 'USD' },
            { account_id: creditId, direction: 'CREDIT', amount, currency: 'USD' },
          ],
        }),
    );

    const results = await Promise.allSettled(workers);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const successes = fulfilled.filter((r) => r.status === 'fulfilled' && r.value.status === 201);

    expect(successes.length).toBe(50);

    const balance = await request(app.server).get(`/v1/accounts/${creditId}/balance`).expect(200);
    expect(balance.body.balance).toBe(String(50 * 100));
    expect(balance.body.journal_balance).toBe(balance.body.balance);

    const report = await verifyBalances(dbContext.db);
    expect(report.drifts).toHaveLength(0);

    await app.close();
    await dbContext.pool.end();
  }, 120_000);
});
