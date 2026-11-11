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

describe('computeAccountState: precio promedio de compra', () => {
  const averagePrice = (orders: Parameters<typeof computeAccountState>[0]) =>
    computeAccountState(orders).holdings.get(PAMP)?.averagePrice;

  it('pondera por cantidad dos compras a distinto precio', () => {
    const average = averagePrice([
      ledgerOrder({ side: 'BUY', status: 'FILLED', size: 10, price: new Decimal(100) }),
      ledgerOrder({ side: 'BUY', status: 'FILLED', size: 30, price: new Decimal(200) }),
    ]);

    expect(average?.toNumber()).toBe(175);
  });

  it('no cambia con una venta', () => {
    expect(averagePrice(seedOrders)?.toNumber()).toBe(930);
  });

  it('se reinicia con la primera compra después de cerrar la posición', () => {
    const average = averagePrice([
      ledgerOrder({ side: 'BUY', status: 'FILLED', size: 10, price: new Decimal(100) }),
      ledgerOrder({ side: 'SELL', status: 'FILLED', size: 10, price: new Decimal(120) }),
      ledgerOrder({ side: 'BUY', status: 'FILLED', size: 5, price: new Decimal(200) }),
    ]);

    expect(average?.toNumber()).toBe(200);
  });

  it('toma el precio de la compra cuando la tenencia venía negativa', () => {
    const state = computeAccountState([
      ledgerOrder({ side: 'BUY', status: 'FILLED', size: 20, price: new Decimal(1540) }),
      ledgerOrder({ side: 'SELL', status: 'FILLED', size: 30, price: new Decimal(1530) }),
      ledgerOrder({ side: 'BUY', status: 'FILLED', size: 15, price: new Decimal(1500) }),
    ]);

    expect(state.holdings.get(PAMP)).toMatchObject({ quantity: 5 });
    expect(state.holdings.get(PAMP)?.averagePrice.toNumber()).toBe(1500);
  });

  it('recorre las órdenes en orden cronológico aunque lleguen desordenadas', () => {
    const first = ledgerOrder({ side: 'BUY', status: 'FILLED', size: 10, price: new Decimal(100) });
    const second = ledgerOrder({ side: 'SELL', status: 'FILLED', size: 10, price: new Decimal(120) });
    const third = ledgerOrder({ side: 'BUY', status: 'FILLED', size: 5, price: new Decimal(200) });

    expect(averagePrice([third, first, second])?.toNumber()).toBe(200);
  });

  it('desempata por id las órdenes con la misma fecha', () => {
    const datetime = new Date('2024-05-01T10:00:00');
    const first = { ...ledgerOrder({ side: 'BUY', status: 'FILLED', size: 10, price: new Decimal(100) }), datetime };
    const second = { ...ledgerOrder({ side: 'SELL', status: 'FILLED', size: 10, price: new Decimal(120) }), datetime };
    const third = { ...ledgerOrder({ side: 'BUY', status: 'FILLED', size: 5, price: new Decimal(200) }), datetime };

    expect(averagePrice([third, second, first])?.toNumber()).toBe(200);
  });

  it('no usa las compras pendientes ni las canceladas', () => {
    const average = averagePrice([
      ledgerOrder({ side: 'BUY', status: 'FILLED', size: 10, price: new Decimal(100) }),
      ledgerOrder({ side: 'BUY', status: 'NEW', size: 10, price: new Decimal(500) }),
      ledgerOrder({ side: 'BUY', status: 'CANCELLED', size: 10, price: new Decimal(900) }),
    ]);

    expect(average?.toNumber()).toBe(100);
  });

  it('conserva los decimales del promedio', () => {
    const average = averagePrice([
      ledgerOrder({ side: 'BUY', status: 'FILLED', size: 1, price: new Decimal(100) }),
      ledgerOrder({ side: 'BUY', status: 'FILLED', size: 2, price: new Decimal('100.50') }),
    ]);

    expect(average?.toFixed(4)).toBe('100.3333');
  });
});
