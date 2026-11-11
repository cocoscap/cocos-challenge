import type { DataSource, EntityManager } from 'typeorm';

/**
 * Acceso a la base que recibe la app.
 * En producción envuelve el `DataSource`; en los tests, una conexión con una transacción abierta.
 */
export interface Db {
  /** Para lecturas y escrituras de una sola sentencia. */
  readonly manager: EntityManager;
  /** Ejecuta `work` dentro de una transacción y la confirma, o la deshace si `work` falla. */
  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T>;
}

export function createDb(dataSource: DataSource): Db {
  return {
    manager: dataSource.manager,
    transaction: (work) => dataSource.transaction(work),
  };
}
