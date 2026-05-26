import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers.js';

describe('accounts routes', () => {
  it('creates and fetches an account', async () => {
    const { app, dbContext } = await createTestApp();

    const createRes = await request(app.server)
      .post('/v1/accounts')
      .set('Idempotency-Key', 'acct-create-1')
      .send({ name: 'Customer wallet', type: 'LIABILITY', currency: 'USD' })
      .expect(201);

    expect(createRes.body).toMatchObject({
      name: 'Customer wallet',
      type: 'LIABILITY',
      currency: 'USD',
      status: 'ACTIVE',
    });

    const id = createRes.body.id as string;
    const getRes = await request(app.server).get(`/v1/accounts/${id}`).expect(200);
    expect(getRes.body.id).toBe(id);

    await app.close();
    await dbContext.pool.end();
  });

  it('rejects unsupported currency', async () => {
    const { app, dbContext } = await createTestApp();

    await request(app.server)
      .post('/v1/accounts')
      .set('Idempotency-Key', 'acct-bad-currency')
      .send({ name: 'Bad', type: 'ASSET', currency: 'ZZZ' })
      .expect(422);

    await app.close();
    await dbContext.pool.end();
  });

  it('returns 400 without idempotency key on POST', async () => {
    const { app, dbContext } = await createTestApp();

    await request(app.server)
      .post('/v1/accounts')
      .send({ name: 'No key', type: 'ASSET', currency: 'USD' })
      .expect(400);

    await app.close();
    await dbContext.pool.end();
  });
});
