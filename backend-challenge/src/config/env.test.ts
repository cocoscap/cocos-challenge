import { loadEnv } from './env';

const complete = {
  DB_HOST: 'db.example.com',
  DB_PORT: '5432',
  DB_USER: 'app',
  DB_PASSWORD: 'secret',
  DB_NAME: 'challenge',
  DB_SSL: 'true',
};

describe('loadEnv', () => {
  it('devuelve la configuración tipada cuando están todas las variables', () => {
    expect(loadEnv(complete)).toEqual({
      DB_HOST: 'db.example.com',
      DB_PORT: 5432,
      DB_USER: 'app',
      DB_PASSWORD: 'secret',
      DB_NAME: 'challenge',
      DB_SSL: true,
      PORT: 3000,
    });
  });

  it('usa los valores por defecto de DB_PORT, DB_SSL y PORT', () => {
    const { DB_PORT, DB_SSL, ...rest } = complete;

    expect(loadEnv(rest)).toMatchObject({ DB_PORT: 5432, DB_SSL: false, PORT: 3000 });
  });

  it('respeta el PORT que se envía', () => {
    expect(loadEnv({ ...complete, PORT: '8080' }).PORT).toBe(8080);
  });

  it('falla nombrando la variable que falta', () => {
    const { DB_HOST, ...rest } = complete;

    expect(() => loadEnv(rest)).toThrow(/DB_HOST/);
  });

  it('trata una variable vacía como faltante', () => {
    expect(() => loadEnv({ ...complete, DB_HOST: '' })).toThrow(/DB_HOST/);
  });

  it('nombra todas las variables con problemas', () => {
    expect(() => loadEnv({})).toThrow(/DB_HOST.*DB_USER.*DB_NAME/s);
  });

  it('rechaza un DB_SSL que no es true ni false', () => {
    expect(() => loadEnv({ ...complete, DB_SSL: 'yes' })).toThrow(/DB_SSL/);
  });
});
