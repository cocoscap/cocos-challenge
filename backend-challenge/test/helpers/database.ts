import 'reflect-metadata';
import { config } from 'dotenv';
import type { Express } from 'express';
import { DataSource, QueryRunner } from 'typeorm';
import { createApp } from '../../src/app';
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
  /** La app armada sobre ese `Db`, para llamarla por HTTP con supertest. */
  app: Express;
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
  const db = createQueryRunnerDb(queryRunner);
  return { queryRunner, db, app: createApp(db) };
}

/** Deshace todo lo que el test escribió y devuelve la conexión. */
export async function rollbackTestTransaction(ctx: TestContext): Promise<void> {
  while (ctx.queryRunner.isTransactionActive) {
    await ctx.queryRunner.rollbackTransaction();
  }
  await ctx.queryRunner.release();
}

/**
 * Registra los hooks de Jest para que cada test del archivo corra en su propia transacción con rollback.
 * Devuelve una función que entrega el contexto del test en curso.
 */
export function useTestTransaction(): () => TestContext {
  let current: TestContext | undefined;

  beforeEach(async () => {
    current = await beginTestTransaction();
  });

  afterEach(async () => {
    if (current) {
      await rollbackTestTransaction(current);
      current = undefined;
    }
  });

  afterAll(closeTestDatabase);

  return () => {
    if (!current) {
      throw new Error('No hay una transacción de test abierta');
    }
    return current;
  };
}
