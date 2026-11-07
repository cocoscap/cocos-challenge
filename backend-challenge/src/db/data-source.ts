import 'reflect-metadata';
import { DataSource } from 'typeorm';
import type { Env } from '../config/env';
import { Instrument } from './entities/instrument.entity';
import { MarketData } from './entities/market-data.entity';
import { Order } from './entities/order.entity';
import { User } from './entities/user.entity';

/**
 * Conexión a la base provista.
 * `synchronize` y las migraciones quedan desactivadas: el schema no se modifica.
 * Con `DB_SSL=true` la conexión va cifrada y se verifica el certificado del servidor.
 */
export function createDataSource(env: Env): DataSource {
  return new DataSource({
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl: env.DB_SSL,
    entities: [User, Instrument, Order, MarketData],
    synchronize: false,
    migrationsRun: false,
    logging: false,
  });
}
