import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { loadEnv } from '../../src/config/env';
import { createDataSource } from '../../src/db/data-source';

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
