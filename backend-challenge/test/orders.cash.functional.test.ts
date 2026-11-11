import Decimal from 'decimal.js';
import { Order } from '../src/db/entities/order.entity';
import { useTestTransaction } from './helpers/database';
import { blankUserId, countOrders, deposit, getPortfolio, insertOrder, postOrder } from './helpers/fixtures';
import { ARS, PAMP } from './helpers/seed-orders';

describe('POST /orders: movimientos de efectivo', () => {
  const ctx = useTestTransaction();

  it('graba un depósito como FILLED sobre ARS con precio 1', async () => {
    const { app, db } = ctx();
    const userId = await blankUserId(db);

    const response = await postOrder(app, { userId, side: 'CASH_IN', size: 100000 });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(Number),
      userId,
      instrumentId: ARS,
      side: 'CASH_IN',
      type: 'MARKET',
      size: 100000,
      price: 1,
      status: 'FILLED',
      datetime: expect.any(String),
    });

    const saved = await db.manager.findOneByOrFail(Order, { id: response.body.id });
    expect(saved).toMatchObject({
      userId,
      instrumentId: ARS,
      side: 'CASH_IN',
      type: 'MARKET',
      size: 100000,
      status: 'FILLED',
    });
    expect(saved.price?.toFixed(2)).toBe('1.00');

    expect((await getPortfolio(app, userId)).cash).toEqual({ total: 100000, reserved: 0, available: 100000 });
  });

  it('devuelve la fecha de la orden en formato ISO 8601', async () => {
    const { app, db } = ctx();
    const userId = await blankUserId(db);

    const { body } = await postOrder(app, { userId, side: 'CASH_IN', size: 100 });

    expect(new Date(body.datetime).toISOString()).toBe(body.datetime);
  });

  it('graba un retiro como FILLED y descuenta los pesos', async () => {
    const { app, db } = ctx();
    const userId = await blankUserId(db);
    await deposit(app, userId, 100000);

    const response = await postOrder(app, { userId, side: 'CASH_OUT', size: 40000 });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ side: 'CASH_OUT', instrumentId: ARS, size: 40000, price: 1, status: 'FILLED' });
    expect(response.body).not.toHaveProperty('rejectionReason');
    expect((await getPortfolio(app, userId)).cash.total).toBe(60000);
  });

  it('permite retirar exactamente lo disponible', async () => {
    const { app, db } = ctx();
    const userId = await blankUserId(db);
    await deposit(app, userId, 100000);

    const response = await postOrder(app, { userId, side: 'CASH_OUT', size: 100000 });

    expect(response.body.status).toBe('FILLED');
    expect((await getPortfolio(app, userId)).cash.total).toBe(0);
  });

  it('graba como REJECTED un retiro por más de lo disponible', async () => {
    const { app, db } = ctx();
    const userId = await blankUserId(db);
    await deposit(app, userId, 100000);

    const response = await postOrder(app, { userId, side: 'CASH_OUT', size: 150000 });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ status: 'REJECTED', rejectionReason: 'INSUFFICIENT_FUNDS', size: 150000 });
    const saved = await db.manager.findOneByOrFail(Order, { id: response.body.id });
    expect(saved.status).toBe('REJECTED');
    expect((await getPortfolio(app, userId)).cash.total).toBe(100000);
  });

  it('no deja retirar los pesos reservados por una compra pendiente', async () => {
    const { app, db } = ctx();
    const userId = await blankUserId(db);
    await deposit(app, userId, 1000);
    await insertOrder(db, {
      userId,
      instrumentId: PAMP,
      side: 'BUY',
      status: 'NEW',
      type: 'LIMIT',
      size: 5,
      price: new Decimal(100),
    });

    const tooMuch = await postOrder(app, { userId, side: 'CASH_OUT', size: 600 });
    const allowed = await postOrder(app, { userId, side: 'CASH_OUT', size: 500 });

    expect(tooMuch.body).toMatchObject({ status: 'REJECTED', rejectionReason: 'INSUFFICIENT_FUNDS' });
    expect(allowed.body.status).toBe('FILLED');
  });

  it('responde 404 USER_NOT_FOUND y no graba nada si el usuario no existe', async () => {
    const { app, db } = ctx();
    const before = await countOrders(db);

    const response = await postOrder(app, { userId: 999999999, side: 'CASH_IN', size: 100 });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('USER_NOT_FOUND');
    expect(await countOrders(db)).toBe(before);
  });

  it('responde 400 y no graba nada si el movimiento trae campos de una orden de mercado', async () => {
    const { app, db } = ctx();
    const userId = await blankUserId(db);
    const before = await countOrders(db);

    const response = await postOrder(app, { userId, side: 'CASH_IN', size: 100, instrumentId: PAMP });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual([{ field: 'instrumentId', message: expect.any(String) }]);
    expect(await countOrders(db)).toBe(before);
  });
});
