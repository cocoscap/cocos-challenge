import Decimal from 'decimal.js';
import type { AccountState } from '../account/account-state';
import { MAX_SIZE, type OrderSide, type OrderType } from '../shared/domain';
import { amountTooSmall, validationError } from '../shared/errors';

export type RejectionReason = 'INSUFFICIENT_FUNDS' | 'INSUFFICIENT_HOLDINGS';

export interface OrderDecision {
  status: 'FILLED' | 'NEW' | 'REJECTED';
  rejectionReason?: RejectionReason;
}

/**
 * Cantidad de acciones de la orden: la que se envió o, si se envió un monto,
 * las acciones enteras que ese monto alcanza a cubrir al precio de la orden.
 */
export function resolveSize(request: { size?: number; amount?: number }, price: Decimal): number {
  if (request.size !== undefined) {
    return request.size;
  }

  const size = new Decimal(request.amount ?? 0).dividedBy(price).floor();

  if (size.isZero()) {
    throw amountTooSmall(price.toFixed(2));
  }
  if (size.greaterThan(MAX_SIZE)) {
    throw validationError([{ field: 'amount', message: 'La cantidad de acciones resultante supera el máximo admitido' }]);
  }
  return size.toNumber();
}

interface DecisionInput {
  side: OrderSide;
  type: OrderType;
  instrumentId: number;
  size: number;
  price: Decimal;
  /** Estado de cuenta del usuario antes de esta orden. */
  state: AccountState;
}

/**
 * Decide con qué estado se graba una orden bien formada.
 * Si el usuario no la puede cubrir queda `REJECTED`; si puede, `FILLED` cuando es a mercado y `NEW` cuando es límite.
 */
export function decideOrder(input: DecisionInput): OrderDecision {
  const rejectionReason = findRejectionReason(input);

  if (rejectionReason) {
    return { status: 'REJECTED', rejectionReason };
  }
  return { status: input.type === 'MARKET' ? 'FILLED' : 'NEW' };
}

function findRejectionReason({ side, instrumentId, size, price, state }: DecisionInput): RejectionReason | undefined {
  switch (side) {
    case 'BUY':
      return price.times(size).greaterThan(state.cash.available) ? 'INSUFFICIENT_FUNDS' : undefined;
    case 'CASH_OUT':
      return new Decimal(size).greaterThan(state.cash.available) ? 'INSUFFICIENT_FUNDS' : undefined;
    case 'SELL':
      return size > (state.holdings.get(instrumentId)?.available ?? 0) ? 'INSUFFICIENT_HOLDINGS' : undefined;
    case 'CASH_IN':
      return undefined;
  }
}
