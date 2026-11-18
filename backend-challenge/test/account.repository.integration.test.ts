import { findLedgerOrders } from '../src/account/account.repository';
import { useTestTransaction } from './helpers/database';
import { USER_WITH_ORDERS, blankUserId, insertOrder } from './helpers/fixtures';
import { PAMP } from './helpers/seed-orders';

describe('findLedgerOrders', () => {
  const ctx = useTestTransaction();

  it('devuelve solo las órdenes FILLED y NEW del usuario', async () => {
    const { db } = ctx();
    const userId = await blankUserId(db);
    const filled = await insertOrder(db, { userId, instrumentId: PAMP, side: 'BUY', status: 'FILLED' });
    const pending = await insertOrder(db, { userId, instrumentId: PAMP, side: 'BUY', status: 'NEW', type: 'LIMIT' });
    await insertOrder(db, { userId, instrumentId: PAMP, side: 'BUY', status: 'CANCELLED', type: 'LIMIT' });
    await insertOrder(db, { userId, instrumentId: PAMP, side: 'SELL', status: 'REJECTED' });

    const orders = await findLedgerOrders(db.manager, userId);

    expect(orders.map((order) => order.id)).toEqual([filled.id, pending.id]);
  });

  it('ordena por fecha y, a igual fecha, por id', async () => {
    const { db } = ctx();
    const userId = await blankUserId(db);
    const base = { userId, instrumentId: PAMP, side: 'BUY', status: 'FILLED' };
    const late = await insertOrder(db, { ...base, datetime: new Date('2024-03-02T10:00:00') });
    const early = await insertOrder(db, { ...base, datetime: new Date('2024-03-01T10:00:00') });
    const sameAsLate = await insertOrder(db, { ...base, datetime: new Date('2024-03-02T10:00:00') });

    const orders = await findLedgerOrders(db.manager, userId);

    expect(orders.map((order) => order.id)).toEqual([early.id, late.id, sameAsLate.id]);
  });

  it('no trae órdenes de otros usuarios', async () => {
    const { db } = ctx();
    const userId = await blankUserId(db);
    await insertOrder(db, { userId, instrumentId: PAMP, side: 'BUY', status: 'FILLED' });

    const orders = await findLedgerOrders(db.manager, USER_WITH_ORDERS);

    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((order) => order.userId === USER_WITH_ORDERS)).toBe(true);
  });

  it('devuelve una lista vacía para un usuario sin órdenes', async () => {
    const { db } = ctx();
    const userId = await blankUserId(db);

    expect(await findLedgerOrders(db.manager, userId)).toEqual([]);
  });
});
