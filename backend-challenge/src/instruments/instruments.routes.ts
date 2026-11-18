import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/db';
import { parse } from '../shared/validate';
import { searchInstrumentsWithPrices } from './instruments.service';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const querySchema = z.object({
  q: z.string().trim().min(1),
  limit: z
    .string()
    .regex(/^\d+$/, `Debe ser un entero entre 1 y ${MAX_LIMIT}`)
    .transform(Number)
    .pipe(z.number().int().min(1).max(MAX_LIMIT))
    .default(DEFAULT_LIMIT),
});

/** Rutas bajo `/instruments`. */
export function instrumentsRouter(db: Db): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { q, limit } = parse(querySchema, req.query);

    res.json(await searchInstrumentsWithPrices(db, q, limit));
  });

  return router;
}
