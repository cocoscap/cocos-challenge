import request from 'supertest';
import { Order } from '../src/db/entities/order.entity';
import { useTestTransaction } from './helpers/database';
import { blankUserId, deposit, getPortfolio, postOrder } from './helpers/fixtures';
import { PAMP } from './helpers/seed-orders';

describe('POST /orders/:orderId/cancel', () => {
  const ctx = useTestTransaction();

  const cancel = (orderId: number | string) => request(ctx().app).post(`/orders/${orderId}/cancel`);

  /** Usuario sin órdenes previas, con los pesos indicados ya depositados. */
  async function userWithCash(pesos: number): Promise<number> {
    const { app, db } = ctx();
    const userId = await blankUserId(db);
    await deposit(app, userId, pesos);
    return userId;
  }

  /** Compra límite de 10 PAMP a 900: queda en NEW y reserva 9000 pesos. */
  const limitBuy = (userId: number) =>
    postOrder(ctx().app, { userId, instrumentId: PAMP, side: 'BUY', type: 'LIMIT', size: 10, price: 900 });

  const marketBuy = (userId: number, size: number) =>
    postOrder(ctx().app, { userId, instrumentId: PAMP, side: 'BUY', type: 'MARKET', size });

  it('cancela una orden pendiente y devuelve la orden actualizada', async () => {
    const { db } = ctx();
    const userId = await userWithCash(100000);
    const { body: order } = await limitBuy(userId);

    const response = await cancel(order.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ...order, status: 'CANCELLED' });
    const saved = await db.manager.findOneByOrFail(Order, { id: order.id });
    expect(saved.status).toBe('CANCELLED');
  });

  it('libera los pesos que la orden tenía reservados', async () => {
    const { app } = ctx();
    const userId = await userWithCash(100000);
    const { body: order } = await limitBuy(userId);
    expect((await getPortfolio(app, userId)).cash).toEqual({ total: 100000, reserved: 9000, available: 91000 });

    await cancel(order.id);

    expect((await getPortfolio(app, userId)).cash).toEqual({ total: 100000, reserved: 0, available: 100000 });
  });

  it('libera las acciones que una venta pendiente tenía reservadas', async () => {
    const { app } = ctx();
    const userId = await userWithCash(100000);
    await marketBuy(userId, 10);
    const sell = { userId, instrumentId: PAMP, side: 'SELL' };
    const { body: pending } = await postOrder(app, { ...sell, type: 'LIMIT', size: 10, price: 950 });

    await cancel(pending.id);
    const afterCancel = await postOrder(app, { ...sell, type: 'MARKET', size: 10 });

    expect(afterCancel.body.status).toBe('FILLED');
  });

  it('responde 409 ORDER_NOT_CANCELLABLE si la orden ya se ejecutó, y no la modifica', async () => {
    const { db } = ctx();
    const userId = await userWithCash(100000);
    const { body: filled } = await marketBuy(userId, 1);

    const response = await cancel(filled.id);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: { code: 'ORDER_NOT_CANCELLABLE', message: expect.any(String) } });
    const saved = await db.manager.findOneByOrFail(Order, { id: filled.id });
    expect(saved.status).toBe('FILLED');
  });

  it('responde 409 si la orden ya estaba cancelada', async () => {
    const userId = await userWithCash(100000);
    const { body: order } = await limitBuy(userId);
    await cancel(order.id);

    const response = await cancel(order.id);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ORDER_NOT_CANCELLABLE');
  });

  it('responde 409 si la orden fue rechazada', async () => {
    const userId = await userWithCash(100);
    const { body: rejected } = await limitBuy(userId);
    expect(rejected.status).toBe('REJECTED');

    const response = await cancel(rejected.id);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ORDER_NOT_CANCELLABLE');
  });

  it('responde 404 ORDER_NOT_FOUND si la orden no existe', async () => {
    const response = await cancel(999999999);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'ORDER_NOT_FOUND', message: expect.any(String) } });
  });

  it.each(['abc', '0', '-1', '1.5'])('responde 400 si el id es %s', async (orderId) => {
    const response = await cancel(orderId);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual([{ field: 'orderId', message: expect.any(String) }]);
  });
});
