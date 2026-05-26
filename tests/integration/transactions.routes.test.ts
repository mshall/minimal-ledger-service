import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { accounts } from '../../src/db/schema.js';
import { createTestApp } from '../helpers.js';

async function createPair(app: Awaited<ReturnType<typeof createTestApp>>['app']) {
  const debit = await request(app.server)
    .post('/v1/accounts')
    .set('Idempotency-Key', `pair-debit-${String(Date.now())}-${Math.random()}`)
    .send({ name: 'Cash', type: 'ASSET', currency: 'USD' });
  const credit = await request(app.server)
    .post('/v1/accounts')
    .set('Idempotency-Key', `pair-credit-${String(Date.now())}-${Math.random()}`)
    .send({ name: 'Wallet', type: 'LIABILITY', currency: 'USD' });
  return {
    debitId: debit.body.id as string,
    creditId: credit.body.id as string,
  };
}

describe('transactions routes', () => {
  it('posts a balanced transaction', async () => {
    const { app, dbContext } = await createTestApp();
    const { debitId, creditId } = await createPair(app);

    const res = await request(app.server)
      .post('/v1/transactions')
      .set('Idempotency-Key', 'txn-happy-1')
      .send({
        description: 'Funding',
        entries: [
          { account_id: debitId, direction: 'DEBIT', amount: '10000', currency: 'USD' },
          { account_id: creditId, direction: 'CREDIT', amount: '10000', currency: 'USD' },
        ],
      })
      .expect(201);

    expect(res.body.entries).toHaveLength(2);
    expect(res.body.status).toBe('POSTED');

    const balance = await request(app.server).get(`/v1/accounts/${creditId}/balance`).expect(200);
    expect(balance.body.balance).toBe('10000');
    expect(balance.body.journal_balance).toBe('10000');

    await app.close();
    await dbContext.pool.end();
  });

  it('rejects unbalanced transaction', async () => {
    const { app, dbContext } = await createTestApp();
    const { debitId, creditId } = await createPair(app);

    const res = await request(app.server)
      .post('/v1/transactions')
      .set('Idempotency-Key', 'txn-unbalanced')
      .send({
        entries: [
          { account_id: debitId, direction: 'DEBIT', amount: '10000', currency: 'USD' },
          { account_id: creditId, direction: 'CREDIT', amount: '5000', currency: 'USD' },
        ],
      })
      .expect(422);

    expect(res.body.code).toBe('unbalanced_transaction');

    await app.close();
    await dbContext.pool.end();
  });

  it('rejects currency mismatch on account', async () => {
    const { app, dbContext } = await createTestApp();
    const usd = await request(app.server)
      .post('/v1/accounts')
      .set('Idempotency-Key', 'usd-acct')
      .send({ name: 'USD', type: 'ASSET', currency: 'USD' });
    const eur = await request(app.server)
      .post('/v1/accounts')
      .set('Idempotency-Key', 'eur-acct')
      .send({ name: 'EUR', type: 'LIABILITY', currency: 'EUR' });

    const res = await request(app.server)
      .post('/v1/transactions')
      .set('Idempotency-Key', 'txn-ccy-mismatch')
      .send({
        entries: [
          {
            account_id: usd.body.id,
            direction: 'DEBIT',
            amount: '100',
            currency: 'USD',
          },
          {
            account_id: eur.body.id,
            direction: 'CREDIT',
            amount: '100',
            currency: 'EUR',
          },
        ],
      })
      .expect(422);

    expect(res.body.code).toBe('currency_mismatch');

    await app.close();
    await dbContext.pool.end();
  });

  it('rejects posting to frozen account', async () => {
    const { app, dbContext } = await createTestApp();
    const { debitId, creditId } = await createPair(app);

    await dbContext.db.update(accounts).set({ status: 'FROZEN' }).where(eq(accounts.id, creditId));

    const res = await request(app.server)
      .post('/v1/transactions')
      .set('Idempotency-Key', 'txn-frozen')
      .send({
        entries: [
          { account_id: debitId, direction: 'DEBIT', amount: '100', currency: 'USD' },
          { account_id: creditId, direction: 'CREDIT', amount: '100', currency: 'USD' },
        ],
      })
      .expect(409);

    expect(res.body.code).toBe('account_frozen');

    await app.close();
    await dbContext.pool.end();
  });

  it('allows multi-currency legs when each currency balances', async () => {
    const { app, dbContext } = await createTestApp();

    const usdAsset = await request(app.server)
      .post('/v1/accounts')
      .set('Idempotency-Key', 'mca-usd-a')
      .send({ name: 'USD Asset', type: 'ASSET', currency: 'USD' });
    const usdLiab = await request(app.server)
      .post('/v1/accounts')
      .set('Idempotency-Key', 'mca-usd-l')
      .send({ name: 'USD Liab', type: 'LIABILITY', currency: 'USD' });
    const eurAsset = await request(app.server)
      .post('/v1/accounts')
      .set('Idempotency-Key', 'mca-eur-a')
      .send({ name: 'EUR Asset', type: 'ASSET', currency: 'EUR' });
    const eurLiab = await request(app.server)
      .post('/v1/accounts')
      .set('Idempotency-Key', 'mca-eur-l')
      .send({ name: 'EUR Liab', type: 'LIABILITY', currency: 'EUR' });

    await request(app.server)
      .post('/v1/transactions')
      .set('Idempotency-Key', 'txn-multi-ccy')
      .send({
        entries: [
          {
            account_id: usdAsset.body.id,
            direction: 'DEBIT',
            amount: '100',
            currency: 'USD',
          },
          {
            account_id: usdLiab.body.id,
            direction: 'CREDIT',
            amount: '100',
            currency: 'USD',
          },
          {
            account_id: eurAsset.body.id,
            direction: 'DEBIT',
            amount: '200',
            currency: 'EUR',
          },
          {
            account_id: eurLiab.body.id,
            direction: 'CREDIT',
            amount: '200',
            currency: 'EUR',
          },
        ],
      })
      .expect(201);

    await app.close();
    await dbContext.pool.end();
  });
});
