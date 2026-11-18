import Decimal from 'decimal.js';
import { computeAccountState } from '../account/account-state';
import { findLedgerOrders } from '../account/account.repository';
import type { Db } from '../db/db';
import { Instrument } from '../db/entities/instrument.entity';
import { Order } from '../db/entities/order.entity';
import { User } from '../db/entities/user.entity';
import { findLatestPrices } from '../market/market.repository';
import { CASH_INSTRUMENT_TYPE, CASH_TICKER, type OrderType } from '../shared/domain';
import {
  instrumentNotFound,
  instrumentNotTradable,
  noMarketPrice,
  orderNotCancellable,
  orderNotFound,
  userNotFound,
} from '../shared/errors';
import { toApiNumber } from '../shared/numbers';
import { type RejectionReason, decideOrder, resolveSize } from './order-decision';
import type { CashMovementRequest, OrderRequest, TradeOrderRequest } from './orders.schema';
import { acquireUserLock } from './user-lock';

export interface OrderResponse {
  id: number;
  userId: number;
  instrumentId: number;
  side: string;
  type: string;
  size: number;
  price: number | null;
  status: string;
  datetime: string;
  /** Solo en órdenes `REJECTED`. No se guarda: la tabla no tiene una columna para el motivo. */
  rejectionReason?: RejectionReason;
}

/** Lo que hay que definir de una orden antes de validarla contra el saldo del usuario. */
interface OrderTerms {
  instrumentId: number;
  type: OrderType;
  size: number;
  price: Decimal;
}

/**
 * Graba una orden y devuelve cómo quedó.
 * Los errores del pedido (usuario o instrumento inexistente, sin precio, monto insuficiente) cortan antes
 * de grabar; una orden bien formada que el usuario no puede cubrir se graba como `REJECTED`.
 */
export async function submitOrder(db: Db, request: OrderRequest): Promise<OrderResponse> {
  const user = await db.manager.findOneBy(User, { id: request.userId });
  if (!user) {
    throw userNotFound(request.userId);
  }

  const terms = await resolveTerms(db, request);

  return db.transaction(async (manager) => {
    // A partir de acá, ninguna otra orden del mismo usuario puede validarse hasta que esta termine.
    await acquireUserLock(manager, user.id);

    const state = computeAccountState(await findLedgerOrders(manager, user.id));
    const decision = decideOrder({ side: request.side, ...terms, state });

    const order = await manager.save(Order, {
      userId: user.id,
      instrumentId: terms.instrumentId,
      side: request.side,
      type: terms.type,
      size: terms.size,
      price: terms.price,
      status: decision.status,
      datetime: new Date(),
    });

    return toOrderResponse(order, decision.rejectionReason);
  });
}

/**
 * Cancela una orden pendiente.
 * La actualización es condicional y atómica: solo cambia la fila si sigue en `NEW`.
 */
export async function cancelOrder(db: Db, orderId: number): Promise<OrderResponse> {
  const result = await db.manager.update(Order, { id: orderId, status: 'NEW' }, { status: 'CANCELLED' });

  const order = await db.manager.findOneBy(Order, { id: orderId });
  if (!order) {
    throw orderNotFound(orderId);
  }
  if (result.affected !== 1) {
    throw orderNotCancellable(order.status);
  }
  return toOrderResponse(order);
}

function resolveTerms(db: Db, request: OrderRequest): Promise<OrderTerms> {
  if (request.side === 'CASH_IN' || request.side === 'CASH_OUT') {
    return cashTerms(db, request);
  }
  return tradeTerms(db, request);
}

/** Una compra o venta toma el precio del mercado o el precio límite, y de ahí sale la cantidad. */
async function tradeTerms(db: Db, request: TradeOrderRequest): Promise<OrderTerms> {
  const instrument = await db.manager.findOneBy(Instrument, { id: request.instrumentId });
  if (!instrument) {
    throw instrumentNotFound(request.instrumentId);
  }
  if (instrument.type === CASH_INSTRUMENT_TYPE) {
    throw instrumentNotTradable(instrument.ticker);
  }

  const price = request.type === 'MARKET' ? await marketPrice(db, instrument) : new Decimal(request.price ?? 0);

  return { instrumentId: instrument.id, type: request.type, size: resolveSize(request, price), price };
}

/** Precio de una orden a mercado: el último `close` del instrumento. */
async function marketPrice(db: Db, instrument: Instrument): Promise<Decimal> {
  const latest = (await findLatestPrices(db.manager, [instrument.id])).get(instrument.id);
  if (!latest?.close) {
    throw noMarketPrice(instrument.ticker);
  }
  return latest.close;
}

/** Un movimiento de efectivo se graba sobre el instrumento ARS, a mercado y con precio 1. */
async function cashTerms(db: Db, request: CashMovementRequest): Promise<OrderTerms> {
  const cash = await db.manager.findOneBy(Instrument, { type: CASH_INSTRUMENT_TYPE, ticker: CASH_TICKER });
  if (!cash) {
    throw new Error(`No existe el instrumento ${CASH_TICKER} de tipo ${CASH_INSTRUMENT_TYPE}`);
  }
  return { instrumentId: cash.id, type: 'MARKET', size: request.size, price: new Decimal(1) };
}

function toOrderResponse(order: Order, rejectionReason?: RejectionReason): OrderResponse {
  return {
    id: order.id,
    userId: order.userId,
    instrumentId: order.instrumentId,
    side: order.side,
    type: order.type,
    size: order.size,
    price: toApiNumber(order.price),
    status: order.status,
    datetime: order.datetime.toISOString(),
    ...(rejectionReason ? { rejectionReason } : {}),
  };
}
