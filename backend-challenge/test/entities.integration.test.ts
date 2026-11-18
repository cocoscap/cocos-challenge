import Decimal from 'decimal.js';
import { DataSource } from 'typeorm';
import { Instrument } from '../src/db/entities/instrument.entity';
import { MarketData } from '../src/db/entities/market-data.entity';
import { Order } from '../src/db/entities/order.entity';
import { User } from '../src/db/entities/user.entity';
import { closeTestDatabase, connectTestDatabase } from './helpers/database';

describe('entidades sobre el schema existente', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await connectTestDatabase();
  });

  afterAll(closeTestDatabase);

  it('lee un instrumento por ticker', async () => {
    const pamp = await dataSource.manager.findOneBy(Instrument, { ticker: 'PAMP' });

    expect(pamp).toMatchObject({ ticker: 'PAMP', name: 'Pampa Holding S.A.', type: 'ACCIONES' });
    expect(typeof pamp?.id).toBe('number');
  });

  it('lee un usuario con accountNumber en camelCase', async () => {
    const user = await dataSource.manager.findOneBy(User, { id: 1 });

    expect(user).toMatchObject({ id: 1, email: 'emiliano@test.com', accountNumber: '10001' });
  });

  it('lee una orden con propiedades en camelCase y el precio como decimal', async () => {
    const order = await dataSource.manager.findOneBy(Order, { id: 2 });

    expect(order).toMatchObject({
      id: 2,
      instrumentId: 47,
      userId: 1,
      size: 50,
      type: 'MARKET',
      side: 'BUY',
      status: 'FILLED',
    });
    expect(order?.price).toBeInstanceOf(Decimal);
    expect(order?.price?.toFixed(2)).toBe('930.00');
    expect(order?.datetime).toBeInstanceOf(Date);
  });

  it('lee el último precio de un instrumento con previousClose en camelCase', async () => {
    const pamp = await dataSource.manager.findOneByOrFail(Instrument, { ticker: 'PAMP' });

    const [latest] = await dataSource.manager.find(MarketData, {
      where: { instrumentId: pamp.id },
      order: { date: 'DESC' },
      take: 1,
    });

    expect(latest.date).toBe('2023-07-14');
    expect(latest.close?.toFixed(2)).toBe('925.85');
    expect(latest.previousClose?.toFixed(2)).toBe('921.80');
  });
});
