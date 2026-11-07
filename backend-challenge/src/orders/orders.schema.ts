import Decimal from 'decimal.js';
import { z } from 'zod';
import { MAX_PRICE, MAX_SIZE } from '../shared/domain';

const id = z.number().int().positive().max(MAX_SIZE);
const size = z.number().int().positive().max(MAX_SIZE);
const money = z
  .number()
  .positive()
  .max(MAX_PRICE)
  .refine((value) => new Decimal(value).decimalPlaces() <= 2, 'Admite hasta dos decimales');

/** Compra o venta de un activo. */
const tradeOrder = <Side extends 'BUY' | 'SELL'>(side: Side) =>
  z.strictObject({
    userId: id,
    instrumentId: id,
    side: z.literal(side),
    type: z.enum(['MARKET', 'LIMIT']),
    /** Cantidad de acciones. */
    size: size.optional(),
    /** Monto en pesos; alternativa a `size`. */
    amount: money.optional(),
    /** Precio límite; solo en órdenes `LIMIT`. */
    price: money.optional(),
  });

/** Depósito o retiro de pesos: `size` es el monto. No admite campos de una orden de mercado. */
const cashMovement = <Side extends 'CASH_IN' | 'CASH_OUT'>(side: Side) =>
  z.strictObject({
    userId: id,
    side: z.literal(side),
    size,
  });

export const orderRequestSchema = z
  .discriminatedUnion('side', [
    tradeOrder('BUY'),
    tradeOrder('SELL'),
    cashMovement('CASH_IN'),
    cashMovement('CASH_OUT'),
  ])
  .superRefine((order, ctx) => {
    if (order.side === 'CASH_IN' || order.side === 'CASH_OUT') {
      return;
    }
    if ((order.size === undefined) === (order.amount === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['size'], message: 'Enviar size o amount, pero no los dos' });
    }
    if (order.type === 'LIMIT' && order.price === undefined) {
      ctx.addIssue({ code: 'custom', path: ['price'], message: 'Es obligatorio en las órdenes LIMIT' });
    }
    if (order.type === 'MARKET' && order.price !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['price'], message: 'No se envía en las órdenes MARKET' });
    }
  });

export type OrderRequest = z.output<typeof orderRequestSchema>;
export type TradeOrderRequest = Extract<OrderRequest, { side: 'BUY' | 'SELL' }>;
export type CashMovementRequest = Extract<OrderRequest, { side: 'CASH_IN' | 'CASH_OUT' }>;
