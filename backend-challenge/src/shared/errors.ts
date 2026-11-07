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
