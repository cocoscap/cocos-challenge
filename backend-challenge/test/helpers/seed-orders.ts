import Decimal from 'decimal.js';
import type { LedgerOrder } from '../../src/account/account-state';

/** Ids de instrumentos en `database.sql`. */
export const ARS = 66;
export const PAMP = 47;
export const LOMA = 45;
export const BMA = 31;
export const METR = 54;
/** Instrumento sin registros en `marketdata`. */
export const PGR = 3;

function order(
  id: number,
  instrumentId: number,
  size: number,
  price: number,
  side: string,
  status: string,
  datetime: string,
): LedgerOrder {
  return { id, instrumentId, size, price: new Decimal(price), side, status, datetime: new Date(datetime) };
}

/** Las once órdenes del usuario 1 de `database.sql`, en el mismo orden. */
export const seedOrders: LedgerOrder[] = [
  order(1, ARS, 1_000_000, 1, 'CASH_IN', 'FILLED', '2023-07-12T12:11:20'),
  order(2, PAMP, 50, 930, 'BUY', 'FILLED', '2023-07-12T12:31:20'),
  order(3, PAMP, 50, 920, 'BUY', 'CANCELLED', '2023-07-12T14:21:20'),
  order(4, PAMP, 10, 940, 'SELL', 'FILLED', '2023-07-12T14:51:20'),
  order(5, LOMA, 50, 710, 'BUY', 'NEW', '2023-07-12T15:14:20'),
  order(6, PAMP, 100, 950, 'SELL', 'REJECTED', '2023-07-12T16:11:20'),
  order(7, BMA, 60, 1500, 'BUY', 'NEW', '2023-07-13T11:13:20'),
  order(8, ARS, 100_000, 1, 'CASH_OUT', 'FILLED', '2023-07-13T12:31:20'),
  order(9, BMA, 20, 1540, 'BUY', 'FILLED', '2023-07-13T12:51:20'),
  order(10, METR, 500, 250, 'BUY', 'FILLED', '2023-07-13T14:11:20'),
  order(11, BMA, 30, 1530, 'SELL', 'FILLED', '2023-07-13T15:13:20'),
];

let nextId = 1000;

/** Arma una orden de prueba; cada una queda después de la anterior en el tiempo. */
export function ledgerOrder(values: Partial<LedgerOrder> & Pick<LedgerOrder, 'side' | 'status'>): LedgerOrder {
  const id = nextId++;
  return {
    id,
    instrumentId: PAMP,
    size: 1,
    price: new Decimal(100),
    datetime: new Date(Date.UTC(2024, 0, 1) + id * 1000),
    ...values,
  };
}
