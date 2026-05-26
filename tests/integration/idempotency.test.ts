import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers.js';

describe('idempotency', () => {
  it('replays cached response byte-for-byte', async () => {
    const { app, dbContext } = await createTestApp();
    const body = { name: 'Replay wallet', type: 'LIABILITY', currency: 'GBP' };
    const key = 'replay-key-1';

    const first = await request(app.server)
      .post('/v1/accounts')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);

    const second = await request(app.server)
      .post('/v1/accounts')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);

    expect(second.body).toEqual(first.body);
    expect(second.headers['content-type']).toBe(first.headers['content-type']);

    await app.close();
    await dbContext.pool.end();
  });

  it('returns conflict when same key has different body', async () => {
    const { app, dbContext } = await createTestApp();
    const key = 'conflict-key-1';

    await request(app.server)
      .post('/v1/accounts')
      .set('Idempotency-Key', key)
      .send({ name: 'First', type: 'ASSET', currency: 'USD' })
      .expect(201);

    const conflict = await request(app.server)
      .post('/v1/accounts')
      .set('Idempotency-Key', key)
      .send({ name: 'Second', type: 'ASSET', currency: 'USD' })
      .expect(409);

    expect(conflict.body.code).toBe('idempotency_conflict');

    await app.close();
    await dbContext.pool.end();
  });
});
