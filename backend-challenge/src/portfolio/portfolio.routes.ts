import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/db';
import { idParam, parse } from '../shared/validate';
import { getPortfolio } from './portfolio.service';

const paramsSchema = z.object({ userId: idParam });

/** Rutas bajo `/users`. */
export function portfolioRouter(db: Db): Router {
  const router = Router();

  router.get('/:userId/portfolio', async (req, res) => {
    const { userId } = parse(paramsSchema, req.params);

    res.json(await getPortfolio(db, userId));
  });

  return router;
}
