import Decimal from 'decimal.js';
import type { Express } from 'express';
import request from 'supertest';
import type { Db } from '../../src/db/db';
import { Order } from '../../src/db/entities/order.entity';

/** Usuario de `database.sql` que tiene órdenes cargadas. */
export const USER_WITH_ORDERS = 1;

/**
 * Devuelve el id de un usuario cuyo estado de cuenta está en cero dentro de la transacción del test.
 * Usa un usuario sin órdenes; si no hay ninguno, anula las del primero, y el rollback lo deshace.
 */
export async function blankUserId(db: Db): Promise<number> {
  const withoutOrders: { id: number }[] = await db.manager.query(
    `SELECT u.id FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.userid = u.id AND o.status IN ('FILLED', 'NEW'))
      ORDER BY u.id LIMIT 1`,
  );
  if (withoutOrders.length > 0) {
    return withoutOrders[0].id;
  }

  const [first]: { id: number }[] = await db.manager.query('SELECT id FROM users ORDER BY id LIMIT 1');
  await db.manager.query(
    `UPDATE orders SET status = 'CANCELLED' WHERE userid = $1 AND status IN ('FILLED', 'NEW')`,
    [first.id],
  );
  return first.id;
}

/** Envía un pedido a `POST /orders`. */
export function postOrder(app: Express, body: object) {
  return request(app).post('/orders').send(body);
}

/** Trae el portfolio de un usuario por la API. */
export async function getPortfolio(app: Express, userId: number) {
  const response = await request(app).get(`/users/${userId}/portfolio`);
  return response.body;
}

/** Deposita pesos por la API, para arrancar un test con saldo. */
export async function deposit(app: Express, userId: number, size: number): Promise<void> {
  const response = await postOrder(app, { userId, side: 'CASH_IN', size });
  if (response.status !== 201 || response.body.status !== 'FILLED') {
    throw new Error(`No se pudo depositar: ${response.status} ${JSON.stringify(response.body)}`);
  }
}

/** Cantidad total de filas en `orders`, vista desde la transacción del test. */
export function countOrders(db: Db): Promise<number> {
  return db.manager.count(Order);
}

type OrderValues = Partial<Order> & Pick<Order, 'userId' | 'instrumentId' | 'side' | 'status'>;

/** Graba una orden directamente en la tabla, para armar el escenario de un test. */
export function insertOrder(db: Db, values: OrderValues): Promise<Order> {
  return db.manager.save(Order, {
    type: 'MARKET',
    size: 1,
    price: new Decimal(1),
    datetime: new Date(),
    ...values,
  });
}
