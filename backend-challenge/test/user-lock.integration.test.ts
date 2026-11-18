import { DataSource, QueryRunner } from 'typeorm';
import { acquireUserLock } from '../src/orders/user-lock';
import { closeTestDatabase, connectTestDatabase } from './helpers/database';

/** Ids que no existen en `users`: el lock no toca ninguna fila, solo reserva una clave. */
const USER_A = 987_654_321;
const USER_B = 987_654_322;

describe('acquireUserLock', () => {
  let dataSource: DataSource;
  let first: QueryRunner;
  let second: QueryRunner;

  /** Abre una transacción que no espera un lock más de 300 ms. */
  async function beginImpatient(runner: QueryRunner): Promise<void> {
    await runner.startTransaction();
    await runner.query(`SET LOCAL lock_timeout = '300ms'`);
  }

  beforeAll(async () => {
    dataSource = await connectTestDatabase();
  });

  beforeEach(async () => {
    first = dataSource.createQueryRunner();
    second = dataSource.createQueryRunner();
    await first.connect();
    await second.connect();
  });

  afterEach(async () => {
    for (const runner of [first, second]) {
      while (runner.isTransactionActive) {
        await runner.rollbackTransaction();
      }
      await runner.release();
    }
  });

  afterAll(closeTestDatabase);

  it('no entrega el lock de un usuario a otra transacción hasta que la primera termina', async () => {
    await first.startTransaction();
    await acquireUserLock(first.manager, USER_A);

    await beginImpatient(second);
    await expect(acquireUserLock(second.manager, USER_A)).rejects.toThrow(/lock timeout/i);
    await second.rollbackTransaction();

    await first.rollbackTransaction();

    await beginImpatient(second);
    await expect(acquireUserLock(second.manager, USER_A)).resolves.toBeUndefined();
  });

  it('entrega a la vez los locks de dos usuarios distintos', async () => {
    await first.startTransaction();
    await acquireUserLock(first.manager, USER_A);

    await beginImpatient(second);
    await expect(acquireUserLock(second.manager, USER_B)).resolves.toBeUndefined();
  });

  it('se puede volver a pedir dentro de la misma transacción', async () => {
    await beginImpatient(first);
    await acquireUserLock(first.manager, USER_A);

    await expect(acquireUserLock(first.manager, USER_A)).resolves.toBeUndefined();
  });
});
