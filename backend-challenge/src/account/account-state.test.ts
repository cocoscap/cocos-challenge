import Decimal from 'decimal.js';
import { ARS, BMA, LOMA, METR, PAMP, ledgerOrder, seedOrders } from '../../test/helpers/seed-orders';
import { computeAccountState } from './account-state';

describe('computeAccountState: pesos', () => {
  it('calcula los pesos totales del usuario 1 con sus órdenes ejecutadas', () => {
    const { cash } = computeAccountState(seedOrders);

    expect(cash.total.toNumber()).toBe(753000);
  });

  it('reserva los pesos de las compras pendientes', () => {
    const { cash } = computeAccountState(seedOrders);

    expect(cash.reserved.toNumber()).toBe(125500);
  });

  it('deja disponibles los pesos totales menos los reservados', () => {
    const { cash } = computeAccountState(seedOrders);

    expect(cash.available.toNumber()).toBe(627500);
  });

  it('devuelve cero para un usuario sin órdenes', () => {
    const { cash } = computeAccountState([]);

    expect(cash.total.toNumber()).toBe(0);
    expect(cash.reserved.toNumber()).toBe(0);
    expect(cash.available.toNumber()).toBe(0);
  });

  it('suma los depósitos y resta los retiros usando size', () => {
    const { cash } = computeAccountState([
      ledgerOrder({ side: 'CASH_IN', status: 'FILLED', instrumentId: ARS, size: 1000, price: new Decimal(1) }),
      ledgerOrder({ side: 'CASH_OUT', status: 'FILLED', instrumentId: ARS, size: 300, price: new Decimal(1) }),
    ]);

    expect(cash.total.toNumber()).toBe(700);
  });

  it('resta size × price en una compra y lo suma en una venta', () => {
    const { cash } = computeAccountState([
      ledgerOrder({ side: 'CASH_IN', status: 'FILLED', instrumentId: ARS, size: 1000, price: new Decimal(1) }),
      ledgerOrder({ side: 'BUY', status: 'FILLED', size: 3, price: new Decimal('100.50') }),
      ledgerOrder({ side: 'SELL', status: 'FILLED', size: 1, price: new Decimal('110.25') }),
    ]);

    expect(cash.total.toFixed(2)).toBe('808.75');
  });

  it('ignora las órdenes canceladas y rechazadas', () => {
    const { cash } = computeAccountState([
      ledgerOrder({ side: 'CASH_IN', status: 'FILLED', instrumentId: ARS, size: 1000, price: new Decimal(1) }),
      ledgerOrder({ side: 'BUY', status: 'CANCELLED', size: 5, price: new Decimal(100) }),
      ledgerOrder({ side: 'SELL', status: 'REJECTED', size: 5, price: new Decimal(100) }),
    ]);

    expect(cash.total.toNumber()).toBe(1000);
    expect(cash.reserved.toNumber()).toBe(0);
  });

  it('deja de reservar una compra que sale de NEW', () => {
    const withCancelledLimit = seedOrders.map((order) => (order.id === 5 ? { ...order, status: 'CANCELLED' } : order));

    const { cash } = computeAccountState(withCancelledLimit);

    expect(cash.reserved.toNumber()).toBe(125500 - 35500);
    expect(cash.total.toNumber()).toBe(753000);
  });
});

describe('computeAccountState: tenencias', () => {
  it('calcula la tenencia del usuario 1 con sus compras y ventas ejecutadas', () => {
    const { holdings } = computeAccountState(seedOrders);

    expect(holdings.get(PAMP)?.quantity).toBe(40);
    expect(holdings.get(METR)?.quantity).toBe(500);
  });

  it('deja una tenencia negativa cuando se ejecutó una venta mayor a lo comprado', () => {
    const { holdings } = computeAccountState(seedOrders);

    expect(holdings.get(BMA)?.quantity).toBe(-10);
  });

  it('no suma tenencia por una compra pendiente', () => {
    const { holdings } = computeAccountState(seedOrders);

    expect(holdings.has(LOMA)).toBe(false);
  });

  it('reserva las acciones de una venta pendiente', () => {
    const { holdings } = computeAccountState([
      ledgerOrder({ side: 'BUY', status: 'FILLED', size: 40 }),
      ledgerOrder({ side: 'SELL', status: 'NEW', size: 15 }),
    ]);

    expect(holdings.get(PAMP)).toMatchObject({ quantity: 40, reserved: 15, available: 25 });
  });

  it('deja de reservar una venta que sale de NEW', () => {
    const { holdings } = computeAccountState([
      ledgerOrder({ side: 'BUY', status: 'FILLED', size: 40 }),
      ledgerOrder({ side: 'SELL', status: 'CANCELLED', size: 15 }),
    ]);

    expect(holdings.get(PAMP)).toMatchObject({ quantity: 40, reserved: 0, available: 40 });
  });

  it('separa las tenencias por instrumento', () => {
    const { holdings } = computeAccountState([
      ledgerOrder({ side: 'BUY', status: 'FILLED', instrumentId: PAMP, size: 5 }),
      ledgerOrder({ side: 'BUY', status: 'FILLED', instrumentId: METR, size: 7 }),
      ledgerOrder({ side: 'SELL', status: 'FILLED', instrumentId: METR, size: 2 }),
    ]);

    expect(holdings.get(PAMP)?.quantity).toBe(5);
    expect(holdings.get(METR)?.quantity).toBe(5);
  });

  it('no crea tenencias por los movimientos de efectivo', () => {
    const { holdings } = computeAccountState(seedOrders);

    expect(holdings.has(ARS)).toBe(false);
  });

  it('no tiene tenencias un usuario sin órdenes', () => {
    expect(computeAccountState([]).holdings.size).toBe(0);
  });
});
