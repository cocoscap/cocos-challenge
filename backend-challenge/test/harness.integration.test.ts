import Decimal from 'decimal.js';
import { DataSource } from 'typeorm';
import { Order } from '../src/db/entities/order.entity';
import {
  beginTestTransaction,
  closeTestDatabase,
  connectTestDatabase,
  rollbackTestTransaction,
} from './helpers/database';

/** Orden rechazada: aunque quedara grabada, no modifica ningún saldo. */
const harmlessOrder = () => ({
  userId: 1,
  instrumentId: 47,
  side: 'BUY',
  type: 'MARKET',
  size: 1,
  price: new Decimal(1),
  status: 'REJECTED',
  datetime: new Date(),
});

describe('arnés de tests con rollback', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await connectTestDatabase();
  });

  afterAll(closeTestDatabase);

  it('no deja filas en orders aunque el código confirme una transacción propia', async () => {
    const before = await dataSource.manager.count(Order);
    const ctx = await beginTestTransaction();

    const saved = await ctx.db.transaction((manager) => manager.save(Order, harmlessOrder()));

    expect(saved.id).toBeGreaterThan(0);
    // Dentro de la transacción del test la fila existe; otra conexión no la ve.
    expect(await ctx.db.manager.count(Order)).toBe(before + 1);
    expect(await dataSource.manager.count(Order)).toBe(before);

    await rollbackTestTransaction(ctx);

    expect(await dataSource.manager.count(Order)).toBe(before);
  });

  it('deshace solo el trabajo de una transacción interna que falla', async () => {
    const ctx = await beginTestTransaction();

    try {
      const before = await ctx.db.manager.count(Order);
      await ctx.db.manager.save(Order, harmlessOrder());

      const failing = ctx.db.transaction(async (manager) => {
        await manager.save(Order, harmlessOrder());
        throw new Error('falla a propósito');
      });

      await expect(failing).rejects.toThrow('falla a propósito');
      expect(await ctx.db.manager.count(Order)).toBe(before + 1);
    } finally {
      await rollbackTestTransaction(ctx);
    }
  });
});
