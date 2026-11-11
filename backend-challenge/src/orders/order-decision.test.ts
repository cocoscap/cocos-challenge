import Decimal from 'decimal.js';
import { ARS, GGAL, PAMP, ledgerOrder, seedOrders } from '../../test/helpers/seed-orders';
import { computeAccountState } from '../account/account-state';
import { AppError } from '../shared/errors';
import { decideOrder, resolveSize } from './order-decision';

const d = (value: string | number) => new Decimal(value);
const pampClose = d('925.85');

const deposit = (size: number) =>
  ledgerOrder({ side: 'CASH_IN', status: 'FILLED', instrumentId: ARS, size, price: d(1) });

/** Usuario con 1000 pesos disponibles y sin acciones. */
const withThousandPesos = computeAccountState([deposit(1000)]);

/** Usuario con 40 PAMP y pesos de sobra. */
const withFortyPamp = computeAccountState([
  deposit(100000),
  ledgerOrder({ side: 'BUY', status: 'FILLED', size: 40, price: d(900) }),
]);

describe('resolveSize', () => {
  it('usa la cantidad enviada', () => {
    expect(resolveSize({ size: 7 }, pampClose)).toBe(7);
  });

  it('calcula las acciones que alcanza a cubrir un monto en una orden a mercado', () => {
    expect(resolveSize({ amount: 10000 }, pampClose)).toBe(10);
  });

  it('calcula las acciones que alcanza a cubrir un monto al precio límite', () => {
    expect(resolveSize({ amount: 10000 }, d(900))).toBe(11);
  });

  it('descarta la fracción de acción', () => {
    expect(resolveSize({ amount: 5000 }, pampClose)).toBe(5);
  });

  it('usa todas las acciones cuando el monto es un múltiplo exacto del precio', () => {
    expect(resolveSize({ amount: 1851.7 }, pampClose)).toBe(2);
  });

  it('falla con AMOUNT_TOO_SMALL si el monto no alcanza para una acción', () => {
    const attempt = () => resolveSize({ amount: 500 }, pampClose);

    expect(attempt).toThrow(AppError);
    expect(attempt).toThrow(expect.objectContaining({ status: 422, code: 'AMOUNT_TOO_SMALL' }));
  });

  it('falla si la cantidad resultante no entra en la columna size', () => {
    const attempt = () => resolveSize({ amount: 99999999 }, d('0.01'));

    expect(attempt).toThrow(expect.objectContaining({ status: 400, code: 'VALIDATION_ERROR' }));
  });
});

describe('decideOrder: compras', () => {
  const buy = (size: number, price: Decimal, state = withThousandPesos) =>
    decideOrder({ side: 'BUY', type: 'MARKET', instrumentId: PAMP, size, price, state });

  it('rechaza una compra por más de lo disponible', () => {
    expect(buy(15, d(100))).toEqual({ status: 'REJECTED', rejectionReason: 'INSUFFICIENT_FUNDS' });
  });

  it('acepta una compra por exactamente lo disponible', () => {
    expect(buy(10, d(100))).toEqual({ status: 'FILLED' });
  });

  it('rechaza una compra que supera lo disponible por un centavo', () => {
    expect(buy(1, d('1000.01'))).toEqual({ status: 'REJECTED', rejectionReason: 'INSUFFICIENT_FUNDS' });
  });

  it('no deja usar los pesos reservados por compras pendientes', () => {
    // El usuario 1 tiene 753.000 pesos totales, pero solo 627.500 disponibles.
    const state = computeAccountState(seedOrders);

    expect(buy(100, d(7000), state)).toEqual({ status: 'REJECTED', rejectionReason: 'INSUFFICIENT_FUNDS' });
    expect(buy(100, d(6275), state)).toEqual({ status: 'FILLED' });
  });

  it('no exige tener acciones para comprar', () => {
    expect(buy(1, d(100))).toEqual({ status: 'FILLED' });
  });
});

describe('decideOrder: ventas', () => {
  const sell = (size: number, state = withFortyPamp, instrumentId = PAMP) =>
    decideOrder({ side: 'SELL', type: 'MARKET', instrumentId, size, price: pampClose, state });

  it('rechaza una venta por más acciones de las que tiene', () => {
    expect(sell(100)).toEqual({ status: 'REJECTED', rejectionReason: 'INSUFFICIENT_HOLDINGS' });
  });

  it('acepta una venta por exactamente las acciones que tiene', () => {
    expect(sell(40)).toEqual({ status: 'FILLED' });
  });

  it('rechaza una venta de un activo que no tiene', () => {
    expect(sell(1, withFortyPamp, GGAL)).toEqual({ status: 'REJECTED', rejectionReason: 'INSUFFICIENT_HOLDINGS' });
  });

  it('no deja vender las acciones reservadas por ventas pendientes', () => {
    const state = computeAccountState([
      deposit(100000),
      ledgerOrder({ side: 'BUY', status: 'FILLED', size: 40, price: d(900) }),
      ledgerOrder({ side: 'SELL', status: 'NEW', size: 40, price: d(950) }),
    ]);

    expect(sell(10, state)).toEqual({ status: 'REJECTED', rejectionReason: 'INSUFFICIENT_HOLDINGS' });
  });

  it('no exige tener pesos para vender', () => {
    const state = computeAccountState([ledgerOrder({ side: 'BUY', status: 'FILLED', size: 40, price: d(900) })]);

    expect(state.cash.available.isNegative()).toBe(true);
    expect(sell(10, state)).toEqual({ status: 'FILLED' });
  });
});

describe('decideOrder: estado de una orden aceptada', () => {
  it('ejecuta las órdenes MARKET', () => {
    const decision = decideOrder({
      side: 'BUY',
      type: 'MARKET',
      instrumentId: PAMP,
      size: 1,
      price: d(100),
      state: withThousandPesos,
    });

    expect(decision).toEqual({ status: 'FILLED' });
  });

  it('deja pendientes las órdenes LIMIT', () => {
    const decision = decideOrder({
      side: 'BUY',
      type: 'LIMIT',
      instrumentId: PAMP,
      size: 1,
      price: d(100),
      state: withThousandPesos,
    });

    expect(decision).toEqual({ status: 'NEW' });
  });

  it('deja pendiente una compra LIMIT aunque su precio supere el de mercado', () => {
    const decision = decideOrder({
      side: 'BUY',
      type: 'LIMIT',
      instrumentId: PAMP,
      size: 1,
      price: d(1000),
      state: withThousandPesos,
    });

    expect(decision).toEqual({ status: 'NEW' });
  });

  it('rechaza una orden LIMIT que no se puede cubrir', () => {
    const decision = decideOrder({
      side: 'BUY',
      type: 'LIMIT',
      instrumentId: PAMP,
      size: 20,
      price: d(100),
      state: withThousandPesos,
    });

    expect(decision).toEqual({ status: 'REJECTED', rejectionReason: 'INSUFFICIENT_FUNDS' });
  });
});

describe('decideOrder: movimientos de efectivo', () => {
  const cash = (side: 'CASH_IN' | 'CASH_OUT', size: number, state = withThousandPesos) =>
    decideOrder({ side, type: 'MARKET', instrumentId: ARS, size, price: d(1), state });

  it('ejecuta siempre un depósito', () => {
    expect(cash('CASH_IN', 5000000)).toEqual({ status: 'FILLED' });
  });

  it('ejecuta un retiro por hasta lo disponible', () => {
    expect(cash('CASH_OUT', 1000)).toEqual({ status: 'FILLED' });
  });

  it('rechaza un retiro por más de lo disponible', () => {
    expect(cash('CASH_OUT', 1001)).toEqual({ status: 'REJECTED', rejectionReason: 'INSUFFICIENT_FUNDS' });
  });

  it('no deja retirar los pesos reservados', () => {
    const state = computeAccountState([
      deposit(1000),
      ledgerOrder({ side: 'BUY', status: 'NEW', size: 5, price: d(100) }),
    ]);

    expect(cash('CASH_OUT', 600, state)).toEqual({ status: 'REJECTED', rejectionReason: 'INSUFFICIENT_FUNDS' });
    expect(cash('CASH_OUT', 500, state)).toEqual({ status: 'FILLED' });
  });
});
