import { Router } from 'express';
import type { Db } from '../db/db';
import { parse } from '../shared/validate';
import { orderRequestSchema } from './orders.schema';
import { submitOrder } from './orders.service';

/** Rutas bajo `/orders`. */
export function ordersRouter(db: Db): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const request = parse(orderRequestSchema, req.body);

    res.status(201).json(await submitOrder(db, request));
  });

  return router;
}
