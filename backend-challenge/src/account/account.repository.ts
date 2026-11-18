import { EntityManager, In } from 'typeorm';
import { Order } from '../db/entities/order.entity';

/**
 * Órdenes que definen el estado de cuenta de un usuario:
 * las ejecutadas y las pendientes, en orden cronológico.
 */
export function findLedgerOrders(manager: EntityManager, userId: number): Promise<Order[]> {
  return manager.find(Order, {
    where: { userId, status: In(['FILLED', 'NEW']) },
    order: { datetime: 'ASC', id: 'ASC' },
  });
}
