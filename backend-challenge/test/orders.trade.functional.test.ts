import { Order } from '../src/db/entities/order.entity';
import { useTestTransaction } from './helpers/database';
import { blankUserId, deposit, getPortfolio, postOrder } from './helpers/fixtures';
import { GGAL, PAMP, PGR } from './helpers/seed-orders';

/** Último `close` de PAMP en `database.sql`. */
const PAMP_CLOSE = 925.85;

describe('POST /orders: compras y ventas', () => {
  const ctx = useTestTransaction();

  /** Usuario sin órdenes previas, con los pesos indicados ya depositados. */
  async function userWithCash(pesos: number): Promise<number> {
    const { app, db } = ctx();
    const userId = await blankUserId(db);
    await deposit(app, userId, pesos);
    return userId;
  }

  const marketBuy = (userId: number, size: number, instrumentId = PAMP) =>
    postOrder(ctx().app, { userId, instrumentId, side: 'BUY', type: 'MARKET', size });

  describe('órdenes MARKET', () => {
    it('ejecuta una compra al último precio y la refleja en el portfolio', async () => {
      const { app, db } = ctx();
      const userId = await userWithCash(100000);

      const response = await marketBuy(userId, 10);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: expect.any(Number),
        userId,
        instrumentId: PAMP,
        side: 'BUY',
        type: 'MARKET',
        size: 10,
        price: PAMP_CLOSE,
        status: 'FILLED',
        datetime: expect.any(String),
      });

      const saved = await db.manager.findOneByOrFail(Order, { id: response.body.id });
      expect(saved).toMatchObject({
        userId,
        instrumentId: PAMP,
        side: 'BUY',
        type: 'MARKET',
        size: 10,
        status: 'FILLED',
      });
      expect(saved.price?.toFixed(2)).toBe('925.85');

      const portfolio = await getPortfolio(app, userId);
      expect(portfolio.cash).toEqual({ total: 90741.5, reserved: 0, available: 90741.5 });
      expect(portfolio.positions).toEqual([
        expect.objectContaining({ ticker: 'PAMP', quantity: 10, averagePrice: PAMP_CLOSE, marketValue: 9258.5 }),
      ]);
      expect(portfolio.totalAccountValue).toBe(100000);
    });

    it('ejecuta una venta y suma los pesos', async () => {
      const { app } = ctx();
      const userId = await userWithCash(100000);
      await marketBuy(userId, 10);

      const response = await postOrder(app, { userId, instrumentId: PAMP, side: 'SELL', type: 'MARKET', size: 4 });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ side: 'SELL', size: 4, price: PAMP_CLOSE, status: 'FILLED' });
      const portfolio = await getPortfolio(app, userId);
      expect(portfolio.positions).toEqual([expect.objectContaining({ ticker: 'PAMP', quantity: 6 })]);
      expect(portfolio.cash.total).toBe(94444.9);
    });

    it('graba como REJECTED una compra por más de lo disponible y no cambia el portfolio', async () => {
      const { app, db } = ctx();
      const userId = await userWithCash(1000);
      const before = await getPortfolio(app, userId);

      const response = await marketBuy(userId, 10);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        size: 10,
        price: PAMP_CLOSE,
        status: 'REJECTED',
        rejectionReason: 'INSUFFICIENT_FUNDS',
      });
      const saved = await db.manager.findOneByOrFail(Order, { id: response.body.id });
      expect(saved.status).toBe('REJECTED');
      expect(await getPortfolio(app, userId)).toEqual(before);
    });

    it('graba como REJECTED una venta de un activo que el usuario no tiene', async () => {
      const { app } = ctx();
      const userId = await userWithCash(100000);

      const response = await postOrder(app, { userId, instrumentId: GGAL, side: 'SELL', type: 'MARKET', size: 1 });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ status: 'REJECTED', rejectionReason: 'INSUFFICIENT_HOLDINGS' });
    });

    it('graba como REJECTED una venta por más acciones de las que tiene', async () => {
      const { app } = ctx();
      const userId = await userWithCash(100000);
      await marketBuy(userId, 10);

      const response = await postOrder(app, { userId, instrumentId: PAMP, side: 'SELL', type: 'MARKET', size: 11 });

      expect(response.body).toMatchObject({ status: 'REJECTED', rejectionReason: 'INSUFFICIENT_HOLDINGS' });
      expect((await getPortfolio(app, userId)).positions).toEqual([
        expect.objectContaining({ ticker: 'PAMP', quantity: 10 }),
      ]);
    });
  });

  describe('órdenes LIMIT', () => {
    const limitBuy = (userId: number, size: number, price: number, instrumentId = PAMP) =>
      postOrder(ctx().app, { userId, instrumentId, side: 'BUY', type: 'LIMIT', size, price });

    it('deja una compra en NEW al precio enviado y reserva los pesos', async () => {
      const { app } = ctx();
      const userId = await userWithCash(100000);

      const response = await limitBuy(userId, 10, 900);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ type: 'LIMIT', size: 10, price: 900, status: 'NEW' });
      expect(response.body).not.toHaveProperty('rejectionReason');
      const portfolio = await getPortfolio(app, userId);
      expect(portfolio.cash).toEqual({ total: 100000, reserved: 9000, available: 91000 });
      expect(portfolio.positions).toEqual([]);
      expect(portfolio.totalAccountValue).toBe(100000);
    });

    it('deja en NEW una compra con precio por encima del mercado', async () => {
      const userId = await userWithCash(100000);

      const response = await limitBuy(userId, 10, 1000);

      expect(response.body).toMatchObject({ price: 1000, status: 'NEW' });
    });

    it('deja una venta en NEW y reserva las acciones', async () => {
      const { app } = ctx();
      const userId = await userWithCash(100000);
      await marketBuy(userId, 10);

      const pending = await postOrder(app, {
        userId,
        instrumentId: PAMP,
        side: 'SELL',
        type: 'LIMIT',
        size: 10,
        price: 950,
      });
      const another = await postOrder(app, { userId, instrumentId: PAMP, side: 'SELL', type: 'MARKET', size: 1 });

      expect(pending.body).toMatchObject({ price: 950, status: 'NEW' });
      expect(another.body).toMatchObject({ status: 'REJECTED', rejectionReason: 'INSUFFICIENT_HOLDINGS' });
      expect((await getPortfolio(app, userId)).positions).toEqual([
        expect.objectContaining({ ticker: 'PAMP', quantity: 10 }),
      ]);
    });

    it('graba como REJECTED una compra que supera lo disponible', async () => {
      const userId = await userWithCash(1000);

      const response = await limitBuy(userId, 10, 900);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ status: 'REJECTED', rejectionReason: 'INSUFFICIENT_FUNDS' });
    });

    it('no deja usar los pesos reservados por otra orden pendiente', async () => {
      const userId = await userWithCash(10000);
      await limitBuy(userId, 10, 900);

      const tooMuch = await marketBuy(userId, 2);
      const affordable = await marketBuy(userId, 1);

      expect(tooMuch.body).toMatchObject({ status: 'REJECTED', rejectionReason: 'INSUFFICIENT_FUNDS' });
      expect(affordable.body.status).toBe('FILLED');
    });

    it('acepta una orden sobre un activo sin precio de mercado', async () => {
      const userId = await userWithCash(100000);

      const response = await limitBuy(userId, 10, 50, PGR);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ instrumentId: PGR, price: 50, status: 'NEW' });
    });
  });

  describe('órdenes por monto', () => {
    it('compra a mercado las acciones enteras que alcanza a cubrir el monto', async () => {
      const { app } = ctx();
      const userId = await userWithCash(100000);

      const response = await postOrder(app, {
        userId,
        instrumentId: PAMP,
        side: 'BUY',
        type: 'MARKET',
        amount: 10000,
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ size: 10, price: PAMP_CLOSE, status: 'FILLED' });
      expect((await getPortfolio(app, userId)).cash.total).toBe(90741.5);
    });

    it('usa el precio límite para calcular la cantidad', async () => {
      const { app } = ctx();
      const userId = await userWithCash(100000);

      const response = await postOrder(app, {
        userId,
        instrumentId: PAMP,
        side: 'BUY',
        type: 'LIMIT',
        price: 900,
        amount: 10000,
      });

      expect(response.body).toMatchObject({ size: 11, price: 900, status: 'NEW' });
      expect((await getPortfolio(app, userId)).cash.reserved).toBe(9900);
    });

    it('vende a mercado las acciones enteras que cubre el monto', async () => {
      const { app } = ctx();
      const userId = await userWithCash(100000);
      await marketBuy(userId, 10);

      const response = await postOrder(app, {
        userId,
        instrumentId: PAMP,
        side: 'SELL',
        type: 'MARKET',
        amount: 5000,
      });

      expect(response.body).toMatchObject({ side: 'SELL', size: 5, status: 'FILLED' });
    });
  });
});
