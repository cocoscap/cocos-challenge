import Decimal from 'decimal.js';
import type { Db } from '../src/db/db';
import { MarketData } from '../src/db/entities/market-data.entity';
import { findLatestPrices } from '../src/market/market.repository';
import { useTestTransaction } from './helpers/database';
import { METR, PAMP, PGR } from './helpers/seed-orders';

function insertPrice(db: Db, date: string, close: string) {
  return db.manager.save(MarketData, {
    instrumentId: PAMP,
    date,
    close: new Decimal(close),
    previousClose: new Decimal('925.85'),
  });
}

describe('findLatestPrices', () => {
  const ctx = useTestTransaction();

  it('devuelve el registro con la fecha más reciente de cada instrumento', async () => {
    const prices = await findLatestPrices(ctx().db.manager, [PAMP, METR]);

    expect(prices.size).toBe(2);
    expect(prices.get(PAMP)?.close?.toFixed(2)).toBe('925.85');
    expect(prices.get(PAMP)?.previousClose?.toFixed(2)).toBe('921.80');
    expect(prices.get(METR)?.close?.toFixed(2)).toBe('229.50');
    expect(prices.get(METR)?.previousClose?.toFixed(2)).toBe('232.00');
  });

  it('usa un registro nuevo cuando su fecha es posterior', async () => {
    const { db } = ctx();
    await insertPrice(db, '2023-07-17', '940.10');

    const prices = await findLatestPrices(db.manager, [PAMP]);

    expect(prices.get(PAMP)?.close?.toFixed(2)).toBe('940.10');
  });

  it('a igual fecha usa el registro cargado último', async () => {
    const { db } = ctx();
    await insertPrice(db, '2023-07-17', '940.10');
    await insertPrice(db, '2023-07-17', '941.00');

    const prices = await findLatestPrices(db.manager, [PAMP]);

    expect(prices.get(PAMP)?.close?.toFixed(2)).toBe('941.00');
  });

  it('no devuelve nada para un instrumento sin registros', async () => {
    const prices = await findLatestPrices(ctx().db.manager, [PGR]);

    expect(prices.has(PGR)).toBe(false);
  });

  it('devuelve un mapa vacío si no se piden instrumentos', async () => {
    const prices = await findLatestPrices(ctx().db.manager, []);

    expect(prices.size).toBe(0);
  });
});
