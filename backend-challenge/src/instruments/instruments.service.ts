import type { Db } from '../db/db';
import { findLatestPrices } from '../market/market.repository';
import { dailyReturnPct } from '../market/returns';
import { toApiNumber } from '../shared/numbers';
import { searchInstruments } from './instruments.repository';

export interface InstrumentResult {
  id: number;
  ticker: string;
  name: string;
  type: string;
  lastPrice: number | null;
  dailyReturnPct: number | null;
}

/** Busca activos y les suma su último precio y su retorno diario. */
export async function searchInstrumentsWithPrices(db: Db, text: string, limit: number): Promise<InstrumentResult[]> {
  const instruments = await searchInstruments(db.manager, text, limit);
  const prices = await findLatestPrices(
    db.manager,
    instruments.map((instrument) => instrument.id),
  );

  return instruments.map((instrument) => {
    const price = prices.get(instrument.id);

    return {
      id: instrument.id,
      ticker: instrument.ticker,
      name: instrument.name,
      type: instrument.type,
      lastPrice: toApiNumber(price?.close),
      dailyReturnPct: toApiNumber(dailyReturnPct(price?.close, price?.previousClose)),
    };
  });
}
