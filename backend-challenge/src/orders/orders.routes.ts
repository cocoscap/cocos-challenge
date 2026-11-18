import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/db';
import { idParam, parse } from '../shared/validate';
import { orderRequestSchema } from './orders.schema';
import { cancelOrder, submitOrder } from './orders.service';

const cancelParamsSchema = z.object({ orderId: idParam });

/** Rutas bajo `/orders`. */
export function ordersRouter(db: Db): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const request = parse(orderRequestSchema, req.body);

    res.status(201).json(await submitOrder(db, request));
  });

  router.post('/:orderId/cancel', async (req, res) => {
    const { orderId } = parse(cancelParamsSchema, req.params);

    res.json(await cancelOrder(db, orderId));
  });

  return router;
}
