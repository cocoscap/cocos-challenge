import express, { type Express } from 'express';
import type { Db } from './db/db';
import { errorHandler, notFoundHandler } from './shared/error-handler';

/** Arma la app con sus dependencias explícitas, para poder inyectar la base en los tests. */
export function createApp(_db: Db): Express {
  const app = express();

  app.use(express.json());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
