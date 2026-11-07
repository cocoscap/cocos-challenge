import type { EntityManager } from 'typeorm';

/** Primera clave del lock: distingue los locks de esta app de otros usos de advisory locks en la base. */
const USER_LOCK_NAMESPACE = 20231;

/**
 * Toma, hasta el final de la transacción en curso, el lock de un usuario.
 * Mientras una transacción lo tiene, otra que lo pida para el mismo usuario espera;
 * así dos órdenes simultáneas no se validan contra el mismo saldo.
 * Es un advisory lock: no bloquea filas ni requiere permisos sobre las tablas.
 */
export async function acquireUserLock(manager: EntityManager, userId: number): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [USER_LOCK_NAMESPACE, userId]);
}
