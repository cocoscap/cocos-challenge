import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource, QueryRunner } from 'typeorm';
import { loadEnv } from '../../src/config/env';
import { createDataSource } from '../../src/db/data-source';
import type { Db } from '../../src/db/db';

config({ quiet: true });

let dataSource: DataSource | undefined;

/** Abre, una sola vez por archivo de test, la conexión a la base configurada en `.env`. */
export async function connectTestDatabase(): Promise<DataSource> {
  if (!dataSource) {
    dataSource = createDataSource(loadEnv(process.env));
    await dataSource.initialize();
  }
  return dataSource;
}

export async function closeTestDatabase(): Promise<void> {
  if (dataSource?.isInitialized) {
    await dataSource.destroy();
  }
  dataSource = undefined;
}

export interface TestContext {
  queryRunner: QueryRunner;
  /** `Db` ligado a la transacción del test: nada de lo que escriba queda grabado. */
  db: Db;
}

/**
 * `Db` sobre una conexión que ya tiene una transacción abierta.
 * Cada `transaction` del código bajo prueba se vuelve un savepoint dentro de ella.
 */
export function createQueryRunnerDb(queryRunner: QueryRunner): Db {
  return {
    manager: queryRunner.manager,
    async transaction(work) {
      await queryRunner.startTransaction();
      try {
        const result = await work(queryRunner.manager);
        await queryRunner.commitTransaction();
        return result;
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      }
    },
  };
}

/** Abre la transacción que envuelve a un test. */
export async function beginTestTransaction(): Promise<TestContext> {
  const queryRunner = (await connectTestDatabase()).createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  return { queryRunner, db: createQueryRunnerDb(queryRunner) };
}

/** Deshace todo lo que el test escribió y devuelve la conexión. */
export async function rollbackTestTransaction(ctx: TestContext): Promise<void> {
  while (ctx.queryRunner.isTransactionActive) {
    await ctx.queryRunner.rollbackTransaction();
  }
  await ctx.queryRunner.release();
}
