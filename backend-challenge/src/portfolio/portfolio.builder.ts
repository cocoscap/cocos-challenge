import type { AccountState } from '../account/account-state';
import type { LatestPrice } from '../market/market.repository';
import { dailyReturnPct, totalReturnPct } from '../market/returns';
import { CASH_INSTRUMENT_TYPE } from '../shared/domain';
import { ZERO, toApiNumber } from '../shared/numbers';

export interface PortfolioInstrument {
  id: number;
  ticker: string;
  name: string;
  type: string;
}

export interface PortfolioPosition {
  instrumentId: number;
  ticker: string;
  name: string;
  quantity: number;
  lastPrice: number | null;
  marketValue: number | null;
  averagePrice: number;
  totalReturnPct: number | null;
  dailyReturnPct: number | null;
}

export interface Portfolio {
  userId: number;
  totalAccountValue: number;
  cash: { total: number; reserved: number; available: number };
  positions: PortfolioPosition[];
}

interface BuildPortfolioInput {
  userId: number;
  state: AccountState;
  instruments: readonly PortfolioInstrument[];
  prices: ReadonlyMap<number, LatestPrice>;
}

const byTicker = (a: PortfolioInstrument, b: PortfolioInstrument) =>
  a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0;

/**
 * Arma la respuesta del portfolio a partir del estado de cuenta y de los últimos precios.
 * Lista solo activos con tenencia mayor a cero, ordenados por ticker.
 */
export function buildPortfolio({ userId, state, instruments, prices }: BuildPortfolioInput): Portfolio {
  const positions: PortfolioPosition[] = [];
  let positionsValue = ZERO;

  for (const instrument of [...instruments].sort(byTicker)) {
    const holding = state.holdings.get(instrument.id);
    if (instrument.type === CASH_INSTRUMENT_TYPE || !holding || holding.quantity <= 0) {
      continue;
    }

    const price = prices.get(instrument.id);
    const lastPrice = price?.close ?? null;
    const marketValue = lastPrice ? lastPrice.times(holding.quantity) : null;
    if (marketValue) {
      positionsValue = positionsValue.plus(marketValue);
    }

    positions.push({
      instrumentId: instrument.id,
      ticker: instrument.ticker,
      name: instrument.name,
      quantity: holding.quantity,
      lastPrice: toApiNumber(lastPrice),
      marketValue: toApiNumber(marketValue),
      averagePrice: toApiNumber(holding.averagePrice),
      totalReturnPct: toApiNumber(totalReturnPct(lastPrice, holding.averagePrice)),
      dailyReturnPct: toApiNumber(dailyReturnPct(lastPrice, price?.previousClose)),
    });
  }

  return {
    userId,
    totalAccountValue: toApiNumber(state.cash.total.plus(positionsValue)),
    cash: {
      total: toApiNumber(state.cash.total),
      reserved: toApiNumber(state.cash.reserved),
      available: toApiNumber(state.cash.available),
    },
    positions,
  };
}
