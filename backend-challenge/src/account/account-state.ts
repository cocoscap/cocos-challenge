import Decimal from 'decimal.js';
import { ZERO } from '../shared/numbers';

/** Lo que el cálculo necesita saber de una orden. La entidad `Order` cumple esta forma. */
export interface LedgerOrder {
  id: number;
  instrumentId: number;
  side: string;
  size: number;
  price: Decimal | null;
  status: string;
  datetime: Date;
}

export interface CashBalance {
  /** Pesos del usuario según sus órdenes ejecutadas. */
  total: Decimal;
  /** Pesos comprometidos por compras pendientes. */
  reserved: Decimal;
  /** Pesos que puede usar en una orden nueva. */
  available: Decimal;
}

export interface Holding {
  /** Acciones en cartera según las órdenes ejecutadas. Es negativa si los datos traen una venta de más. */
  quantity: number;
  /** Acciones comprometidas por ventas pendientes. */
  reserved: number;
  /** Acciones que puede vender en una orden nueva. */
  available: number;
  /** Promedio de las compras ejecutadas, ponderado por cantidad. Las ventas no lo cambian. */
  averagePrice: Decimal;
}

export interface AccountState {
  cash: CashBalance;
  /** Tenencia por id de instrumento. Solo incluye instrumentos con compras o ventas. */
  holdings: Map<number, Holding>;
}

/**
 * Calcula el estado de cuenta de un usuario a partir de sus órdenes.
 * Solo cuentan las órdenes `FILLED` (mueven pesos y acciones) y `NEW` (reservan);
 * las `REJECTED` y `CANCELLED` se ignoran.
 */
export function computeAccountState(orders: readonly LedgerOrder[]): AccountState {
  let total = ZERO;
  let reserved = ZERO;
  const holdings = new Map<number, Holding>();

  const holdingOf = (instrumentId: number): Holding => {
    let holding = holdings.get(instrumentId);
    if (!holding) {
      holding = { quantity: 0, reserved: 0, available: 0, averagePrice: ZERO };
      holdings.set(instrumentId, holding);
    }
    return holding;
  };

  for (const order of chronological(orders)) {
    if (order.status === 'FILLED') {
      total = total.plus(filledCashEffect(order));
      if (order.side === 'BUY') {
        applyBuy(holdingOf(order.instrumentId), order);
      } else if (order.side === 'SELL') {
        holdingOf(order.instrumentId).quantity -= order.size;
      }
    } else if (order.status === 'NEW') {
      if (order.side === 'BUY') {
        reserved = reserved.plus(tradeAmount(order));
      } else if (order.side === 'SELL') {
        holdingOf(order.instrumentId).reserved += order.size;
      }
    }
  }

  for (const holding of holdings.values()) {
    holding.available = holding.quantity - holding.reserved;
  }

  return { cash: { total, reserved, available: total.minus(reserved) }, holdings };
}

/** El precio promedio depende del orden: se recorre por fecha y, a igual fecha, por id. */
function chronological(orders: readonly LedgerOrder[]): LedgerOrder[] {
  return [...orders].sort(
    (a, b) => (a.datetime?.getTime() ?? 0) - (b.datetime?.getTime() ?? 0) || a.id - b.id,
  );
}

/**
 * Suma una compra ejecutada a la tenencia y actualiza el precio promedio.
 * Si la tenencia estaba en cero o era negativa, el promedio arranca de nuevo con esta compra.
 */
function applyBuy(holding: Holding, order: LedgerOrder): void {
  const price = order.price ?? ZERO;

  holding.averagePrice =
    holding.quantity > 0
      ? holding.averagePrice
          .times(holding.quantity)
          .plus(price.times(order.size))
          .dividedBy(holding.quantity + order.size)
      : price;
  holding.quantity += order.size;
}

/** Cuánto suma o resta a los pesos una orden ejecutada. */
function filledCashEffect(order: LedgerOrder): Decimal {
  switch (order.side) {
    case 'CASH_IN':
      return new Decimal(order.size);
    case 'CASH_OUT':
      return new Decimal(order.size).negated();
    case 'SELL':
      return tradeAmount(order);
    case 'BUY':
      return tradeAmount(order).negated();
    default:
      return ZERO;
  }
}

function tradeAmount(order: LedgerOrder): Decimal {
  return (order.price ?? ZERO).times(order.size);
}
