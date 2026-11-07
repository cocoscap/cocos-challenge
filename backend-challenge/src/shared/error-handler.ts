import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, routeNotFound, validationError } from './errors';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(routeNotFound());
};

/** Único punto donde un error se convierte en respuesta HTTP. */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const appError = toAppError(error);

  if (!appError) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(error);
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado' } });
    return;
  }

  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
    },
  });
};

function toAppError(error: unknown): AppError | undefined {
  if (error instanceof AppError) {
    return error;
  }
  if (isBodyParseError(error)) {
    return validationError(
      [{ field: 'body', message: 'No se pudo interpretar como JSON' }],
      'El cuerpo del pedido no es un JSON válido',
    );
  }
  return undefined;
}

/** Error que lanza `express.json()` cuando el cuerpo no es JSON válido. */
function isBodyParseError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { type?: unknown }).type === 'entity.parse.failed'
  );
}
