export interface ErrorDetail {
  field: string;
  message: string;
}

/** Error previsto de la API: lleva el status HTTP y un código estable para quien la consume. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const validationError = (details: ErrorDetail[], message = 'Los datos enviados no son válidos') =>
  new AppError(400, 'VALIDATION_ERROR', message, details);

export const routeNotFound = () => new AppError(404, 'NOT_FOUND', 'La ruta no existe');

export const userNotFound = (userId: number) =>
  new AppError(404, 'USER_NOT_FOUND', `El usuario ${userId} no existe`);

export const instrumentNotFound = (instrumentId: number) =>
  new AppError(404, 'INSTRUMENT_NOT_FOUND', `El instrumento ${instrumentId} no existe`);

export const instrumentNotTradable = (ticker: string) =>
  new AppError(400, 'INSTRUMENT_NOT_TRADABLE', `${ticker} no es un activo que se pueda comprar o vender`);

export const orderNotFound = (orderId: number) =>
  new AppError(404, 'ORDER_NOT_FOUND', `La orden ${orderId} no existe`);

export const orderNotCancellable = (status: string) =>
  new AppError(
    409,
    'ORDER_NOT_CANCELLABLE',
    `La orden está en estado ${status}; solo se pueden cancelar las que están en NEW`,
  );

export const noMarketPrice = (ticker: string) =>
  new AppError(422, 'NO_MARKET_PRICE', `${ticker} no tiene precio de mercado; solo admite órdenes LIMIT`);

export const amountTooSmall = (price: string) =>
  new AppError(422, 'AMOUNT_TOO_SMALL', `El monto no alcanza para una acción a $${price}`);
