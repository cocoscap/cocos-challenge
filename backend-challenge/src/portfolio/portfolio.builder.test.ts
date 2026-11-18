import Decimal from 'decimal.js';
import { ARS, BMA, METR, PAMP, ledgerOrder, seedOrders } from '../../test/helpers/seed-orders';
import { computeAccountState } from '../account/account-state';
import type { LatestPrice } from '../market/market.repository';
import { buildPortfolio } from './portfolio.builder';

const instruments = [
  { id: PAMP, ticker: 'PAMP', name: 'Pampa Holding S.A.', type: 'ACCIONES' },
  { id: METR, ticker: 'METR', name: 'MetroGAS S.A.', type: 'ACCIONES' },
  { id: BMA, ticker: 'BMA', name: 'Banco Macro S.A.', type: 'ACCIONES' },
  { id: ARS, ticker: 'ARS', name: 'PESOS', type: 'MONEDA' },
];

function price(instrumentId: number, close: string, previousClose: string | null): [number, LatestPrice] {
  return [
    instrumentId,
    {
      instrumentId,
      close: new Decimal(close),
      previousClose: previousClose === null ? null : new Decimal(previousClose),
    },
  ];
}

/** Últimos precios de `database.sql`. */
const prices = new Map([
  price(PAMP, '925.85', '921.80'),
  price(METR, '229.50', '232.00'),
  price(BMA, '1502.80', '1520.25'),
]);

const deposit = (size: number) =>
  ledgerOrder({ side: 'CASH_IN', status: 'FILLED', instrumentId: ARS, size, price: new Decimal(1) });

describe('buildPortfolio', () => {
  it('arma el portfolio del usuario 1 con los datos de database.sql', () => {
    const portfolio = buildPortfolio({ userId: 1, state: computeAccountState(seedOrders), instruments, prices });

    expect(portfolio).toEqual({
      userId: 1,
      totalAccountValue: 904784,
      cash: { total: 753000, reserved: 125500, available: 627500 },
      positions: [
        {
          instrumentId: METR,
          ticker: 'METR',
          name: 'MetroGAS S.A.',
          quantity: 500,
          lastPrice: 229.5,
          marketValue: 114750,
          averagePrice: 250,
          totalReturnPct: -8.2,
          dailyReturnPct: -1.08,
        },
        {
          instrumentId: PAMP,
          ticker: 'PAMP',
          name: 'Pampa Holding S.A.',
          quantity: 40,
          lastPrice: 925.85,
          marketValue: 37034,
          averagePrice: 930,
          totalReturnPct: -0.45,
          dailyReturnPct: 0.44,
        },
      ],
    });
  });

  it('no lista una tenencia negativa', () => {
    const portfolio = buildPortfolio({ userId: 1, state: computeAccountState(seedOrders), instruments, prices });

    expect(portfolio.positions.map((position) => position.ticker)).not.toContain('BMA');
  });

  it('no lista una posición cerrada', () => {
    const state = computeAccountState([
      deposit(5000),
      ledgerOrder({ side: 'BUY', status: 'FILLED', size: 10, price: new Decimal(100) }),
      ledgerOrder({ side: 'SELL', status: 'FILLED', size: 10, price: new Decimal(120) }),
    ]);

    const portfolio = buildPortfolio({ userId: 2, state, instruments, prices });

    expect(portfolio.positions).toEqual([]);
    expect(portfolio.totalAccountValue).toBe(5200);
  });

  it('no lista el efectivo como posición', () => {
    const state = computeAccountState([
      deposit(5000),
      ledgerOrder({ side: 'BUY', status: 'FILLED', instrumentId: ARS, size: 10, price: new Decimal(1) }),
    ]);

    const portfolio = buildPortfolio({ userId: 2, state, instruments, prices });

    expect(portfolio.positions).toEqual([]);
  });

  it('lista una posición sin precio con valores en null y no la suma al valor de la cuenta', () => {
    const state = computeAccountState([
      deposit(1000),
      ledgerOrder({ side: 'BUY', status: 'FILLED', size: 2, price: new Decimal(100) }),
    ]);

    const portfolio = buildPortfolio({ userId: 2, state, instruments, prices: new Map() });

    expect(portfolio.positions).toEqual([
      {
        instrumentId: PAMP,
        ticker: 'PAMP',
        name: 'Pampa Holding S.A.',
        quantity: 2,
        lastPrice: null,
        marketValue: null,
        averagePrice: 100,
        totalReturnPct: null,
        dailyReturnPct: null,
      },
    ]);
    expect(portfolio.totalAccountValue).toBe(800);
  });

  it('deja el retorno diario en null si falta el cierre anterior', () => {
    const state = computeAccountState([
      deposit(1000),
      ledgerOrder({ side: 'BUY', status: 'FILLED', size: 1, price: new Decimal(900) }),
    ]);

    const portfolio = buildPortfolio({
      userId: 2,
      state,
      instruments,
      prices: new Map([price(PAMP, '925.85', null)]),
    });

    expect(portfolio.positions[0]).toMatchObject({ lastPrice: 925.85, totalReturnPct: 2.87, dailyReturnPct: null });
  });

  it('cuenta los pesos reservados dentro del valor de la cuenta', () => {
    const state = computeAccountState([
      deposit(1000),
      ledgerOrder({ side: 'BUY', status: 'NEW', size: 5, price: new Decimal(100) }),
    ]);

    const portfolio = buildPortfolio({ userId: 2, state, instruments, prices });

    expect(portfolio.cash).toEqual({ total: 1000, reserved: 500, available: 500 });
    expect(portfolio.totalAccountValue).toBe(1000);
    expect(portfolio.positions).toEqual([]);
  });

  it('devuelve todo en cero para un usuario sin órdenes', () => {
    const portfolio = buildPortfolio({ userId: 3, state: computeAccountState([]), instruments, prices });

    expect(portfolio).toEqual({
      userId: 3,
      totalAccountValue: 0,
      cash: { total: 0, reserved: 0, available: 0 },
      positions: [],
    });
  });
});
