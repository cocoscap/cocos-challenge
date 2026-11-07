import request from 'supertest';
import { useTestTransaction } from './helpers/database';
import { USER_WITH_ORDERS, blankUserId, countOrders, postOrder } from './helpers/fixtures';
import { ARS, PAMP, PGR } from './helpers/seed-orders';

describe('POST /orders: pedidos que no se graban', () => {
  const ctx = useTestTransaction();

  const marketBuy = { instrumentId: PAMP, side: 'BUY', type: 'MARKET', size: 10 };

  /** Envía el pedido y verifica que la tabla `orders` quede igual. */
  async function postWithoutSaving(body: object) {
    const { app, db } = ctx();
    const before = await countOrders(db);

    const response = await postOrder(app, body);

    expect(await countOrders(db)).toBe(before);
    return response;
  }

  describe('400 VALIDATION_ERROR', () => {
    it.each([
      ['cantidad y monto a la vez', { amount: 1000 }, 'size'],
      ['ni cantidad ni monto', { size: undefined }, 'size'],
      ['cantidad con fracciones', { size: 1.5 }, 'size'],
      ['orden MARKET con precio', { price: 900 }, 'price'],
      ['orden LIMIT sin precio', { type: 'LIMIT' }, 'price'],
      ['side que no existe', { side: 'HOLD' }, 'side'],
      ['type que no existe', { type: 'STOP' }, 'type'],
    ])('%s', async (_case, changes, field) => {
      const response = await postWithoutSaving({ userId: USER_WITH_ORDERS, ...marketBuy, ...changes });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual([{ field, message: expect.any(String) }]);
    });

    it('pedido sin cuerpo', async () => {
      const { app, db } = ctx();
      const before = await countOrders(db);

      const response = await request(app).post('/orders');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(await countOrders(db)).toBe(before);
    });
  });

  it('responde 404 USER_NOT_FOUND si el usuario no existe', async () => {
    const response = await postWithoutSaving({ userId: 999999999, ...marketBuy });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'USER_NOT_FOUND', message: expect.any(String) } });
  });

  it('responde 404 INSTRUMENT_NOT_FOUND si el instrumento no existe', async () => {
    const userId = await blankUserId(ctx().db);

    const response = await postWithoutSaving({ userId, ...marketBuy, instrumentId: 999999999 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'INSTRUMENT_NOT_FOUND', message: expect.any(String) } });
  });

  it.each(['BUY', 'SELL'])('responde 400 INSTRUMENT_NOT_TRADABLE si se envía un %s sobre el peso', async (side) => {
    const userId = await blankUserId(ctx().db);

    const response = await postWithoutSaving({ userId, ...marketBuy, side, instrumentId: ARS });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: { code: 'INSTRUMENT_NOT_TRADABLE', message: expect.any(String) } });
  });

  it('responde 422 NO_MARKET_PRICE en una orden MARKET sobre un activo sin precio', async () => {
    const userId = await blankUserId(ctx().db);

    const response = await postWithoutSaving({ userId, ...marketBuy, instrumentId: PGR });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: { code: 'NO_MARKET_PRICE', message: expect.any(String) } });
  });

  it('responde 422 AMOUNT_TOO_SMALL si el monto no alcanza para una acción a mercado', async () => {
    const userId = await blankUserId(ctx().db);

    const response = await postWithoutSaving({
      userId,
      instrumentId: PAMP,
      side: 'BUY',
      type: 'MARKET',
      amount: 500,
    });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: { code: 'AMOUNT_TOO_SMALL', message: expect.any(String) } });
  });

  it('responde 422 AMOUNT_TOO_SMALL si el monto no alcanza para una acción al precio límite', async () => {
    const userId = await blankUserId(ctx().db);

    const response = await postWithoutSaving({
      userId,
      instrumentId: PAMP,
      side: 'BUY',
      type: 'LIMIT',
      price: 900,
      amount: 500,
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('AMOUNT_TOO_SMALL');
  });
});
