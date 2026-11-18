import Decimal from 'decimal.js';
import request from 'supertest';
import { useTestTransaction } from './helpers/database';
import { USER_WITH_ORDERS, blankUserId, insertOrder } from './helpers/fixtures';
import { ARS, METR, PAMP } from './helpers/seed-orders';

describe('GET /users/:userId/portfolio', () => {
  const ctx = useTestTransaction();

  it('responde 200 con todo en cero para un usuario sin órdenes', async () => {
    const { app, db } = ctx();
    const userId = await blankUserId(db);

    const response = await request(app).get(`/users/${userId}/portfolio`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      userId,
      totalAccountValue: 0,
      cash: { total: 0, reserved: 0, available: 0 },
      positions: [],
    });
  });

  it('refleja las órdenes ejecutadas y pendientes del usuario', async () => {
    const { app, db } = ctx();
    const userId = await blankUserId(db);
    await insertOrder(db, { userId, instrumentId: ARS, side: 'CASH_IN', status: 'FILLED', size: 100000 });
    await insertOrder(db, {
      userId,
      instrumentId: PAMP,
      side: 'BUY',
      status: 'FILLED',
      size: 10,
      price: new Decimal(900),
    });
    await insertOrder(db, {
      userId,
      instrumentId: METR,
      side: 'BUY',
      status: 'NEW',
      type: 'LIMIT',
      size: 5,
      price: new Decimal(200),
    });

    const response = await request(app).get(`/users/${userId}/portfolio`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      userId,
      totalAccountValue: 100258.5,
      cash: { total: 91000, reserved: 1000, available: 90000 },
      positions: [
        {
          instrumentId: PAMP,
          ticker: 'PAMP',
          name: 'Pampa Holding S.A.',
          quantity: 10,
          lastPrice: 925.85,
          marketValue: 9258.5,
          averagePrice: 900,
          totalReturnPct: 2.87,
          dailyReturnPct: 0.44,
        },
      ],
    });
  });

  it('no lista una tenencia negativa ni la suma al valor de la cuenta', async () => {
    const { app, db } = ctx();
    const userId = await blankUserId(db);
    await insertOrder(db, { userId, instrumentId: ARS, side: 'CASH_IN', status: 'FILLED', size: 100000 });
    await insertOrder(db, {
      userId,
      instrumentId: PAMP,
      side: 'BUY',
      status: 'FILLED',
      size: 20,
      price: new Decimal(900),
    });
    await insertOrder(db, {
      userId,
      instrumentId: PAMP,
      side: 'SELL',
      status: 'FILLED',
      size: 30,
      price: new Decimal(950),
    });

    const response = await request(app).get(`/users/${userId}/portfolio`);

    expect(response.body.positions).toEqual([]);
    expect(response.body.cash.total).toBe(110500);
    expect(response.body.totalAccountValue).toBe(110500);
  });

  it('responde con la forma del portfolio para el usuario con órdenes de database.sql', async () => {
    const response = await request(ctx().app).get(`/users/${USER_WITH_ORDERS}/portfolio`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      userId: USER_WITH_ORDERS,
      totalAccountValue: expect.any(Number),
      cash: { total: expect.any(Number), reserved: expect.any(Number), available: expect.any(Number) },
    });
    expect(Array.isArray(response.body.positions)).toBe(true);
  });

  it('responde 404 USER_NOT_FOUND si el usuario no existe', async () => {
    const response = await request(ctx().app).get('/users/999999999/portfolio');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'USER_NOT_FOUND', message: expect.any(String) } });
  });

  it.each(['abc', '0', '-1', '1.5', '99999999999'])('responde 400 si el id es %s', async (userId) => {
    const response = await request(ctx().app).get(`/users/${userId}/portfolio`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual([{ field: 'userId', message: expect.any(String) }]);
  });
});
