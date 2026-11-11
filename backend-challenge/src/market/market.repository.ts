import Decimal from 'decimal.js';
import type { EntityManager } from 'typeorm';

export interface LatestPrice {
  instrumentId: number;
  /** Último precio del instrumento. */
  close: Decimal | null;
  previousClose: Decimal | null;
}

interface LatestPriceRow {
  instrumentid: number;
  close: string | null;
  previousclose: string | null;
}

const toDecimal = (value: string | null) => (value === null ? null : new Decimal(value));

/**
 * Trae, para cada instrumento pedido, su registro de `marketdata` con la fecha más reciente.
 * Los instrumentos sin registros no aparecen en el resultado.
 */
export async function findLatestPrices(
  manager: EntityManager,
  instrumentIds: readonly number[],
): Promise<Map<number, LatestPrice>> {
  if (instrumentIds.length === 0) {
    return new Map();
  }

  const rows: LatestPriceRow[] = await manager.query(
    `SELECT DISTINCT ON (instrumentid) instrumentid, close, previousclose
       FROM marketdata
      WHERE instrumentid = ANY($1::int[])
      ORDER BY instrumentid, date DESC NULLS LAST, id DESC`,
    [instrumentIds],
  );

  return new Map(
    rows.map((row) => [
      row.instrumentid,
      {
        instrumentId: row.instrumentid,
        close: toDecimal(row.close),
        previousClose: toDecimal(row.previousclose),
      },
    ]),
  );
}
