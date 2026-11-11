import request from 'supertest';
import { useTestTransaction } from './helpers/database';
import { PAMP, PGR } from './helpers/seed-orders';

describe('GET /instruments', () => {
  const ctx = useTestTransaction();

  const search = (query: Record<string, string>) => request(ctx().app).get('/instruments').query(query);
  const tickersOf = (body: { ticker: string }[]) => body.map((instrument) => instrument.ticker);

  it('devuelve los activos con su último precio y su retorno diario', async () => {
    const response = await search({ q: 'PAMP' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: PAMP,
        ticker: 'PAMP',
        name: 'Pampa Holding S.A.',
        type: 'ACCIONES',
        lastPrice: 925.85,
        dailyReturnPct: 0.44,
      },
    ]);
  });

  it('devuelve el precio y el retorno en null para un activo sin precios', async () => {
    const response = await search({ q: 'PGR' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: PGR,
        ticker: 'PGR',
        name: 'Phoenix Global Resources',
        type: 'ACCIONES',
        lastPrice: null,
        dailyReturnPct: null,
      },
    ]);
  });

  it('busca por nombre sin distinguir mayúsculas ni acentos', async () => {
    const response = await search({ q: 'compania' });

    expect(tickersOf(response.body)).toEqual(['INTR']);
  });

  it('pone primero el instrumento cuyo ticker coincide exactamente', async () => {
    const response = await search({ q: 'MOLI' });

    expect(tickersOf(response.body)).toEqual(['MOLI', 'MOLA', 'SEMI']);
  });

  it('responde 200 con una lista vacía si no hay coincidencias', async () => {
    const response = await search({ q: 'zzzzzz' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('no devuelve el peso', async () => {
    const response = await search({ q: 'ARS' });

    expect(response.body).toEqual([]);
  });

  it('devuelve hasta 20 resultados por defecto', async () => {
    const response = await search({ q: 's.a.' });

    expect(response.body).toHaveLength(20);
  });

  it('respeta el límite pedido', async () => {
    const response = await search({ q: 's.a.', limit: '5' });

    expect(response.body).toHaveLength(5);
  });

  it('responde 400 si falta q', async () => {
    const response = await request(ctx().app).get('/instruments');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual([{ field: 'q', message: expect.any(String) }]);
  });

  it('responde 400 si q solo tiene espacios', async () => {
    const response = await search({ q: '   ' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it.each(['0', '101', 'abc', '1.5'])('responde 400 si limit es %s', async (limit) => {
    const response = await search({ q: 'pamp', limit });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([{ field: 'limit', message: expect.any(String) }]);
  });
});
