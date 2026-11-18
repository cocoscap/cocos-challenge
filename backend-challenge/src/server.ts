import 'reflect-metadata';
import { config } from 'dotenv';
import { createApp } from './app';
import { loadEnv } from './config/env';
import { createDataSource } from './db/data-source';
import { createDb } from './db/db';

config({ quiet: true });

async function main(): Promise<void> {
  const env = loadEnv(process.env);
  const dataSource = createDataSource(env);
  await dataSource.initialize();

  const app = createApp(createDb(dataSource));
  app.listen(env.PORT, () => {
    console.log(`API escuchando en http://localhost:${env.PORT}`);
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
