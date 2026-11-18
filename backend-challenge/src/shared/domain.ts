export const ORDER_SIDES = ['BUY', 'SELL', 'CASH_IN', 'CASH_OUT'] as const;
export type OrderSide = (typeof ORDER_SIDES)[number];

export const ORDER_TYPES = ['MARKET', 'LIMIT'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_STATUSES = ['NEW', 'FILLED', 'REJECTED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** El efectivo está modelado como un instrumento de este tipo. */
export const CASH_INSTRUMENT_TYPE = 'MONEDA';
export const CASH_TICKER = 'ARS';

/** Límites que impone el schema existente: `INT` y `NUMERIC(10,2)`. */
export const MAX_SIZE = 2_147_483_647;
export const MAX_PRICE = 99_999_999.99;
