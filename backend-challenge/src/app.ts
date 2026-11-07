import express, { type Express } from 'express';
import type { Db } from './db/db';
import { portfolioRouter } from './portfolio/portfolio.routes';
import { errorHandler, notFoundHandler } from './shared/error-handler';

/** Arma la app con sus dependencias explícitas, para poder inyectar la base en los tests. */
export function createApp(db: Db): Express {
  const app = express();

  app.use(express.json());

  app.use('/users', portfolioRouter(db));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
