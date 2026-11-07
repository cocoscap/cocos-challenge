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

export const amountTooSmall = (price: string) =>
  new AppError(422, 'AMOUNT_TOO_SMALL', `El monto no alcanza para una acción a $${price}`);
