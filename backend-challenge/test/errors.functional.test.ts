import express from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import type { Db } from '../src/db/db';
import { errorHandler } from '../src/shared/error-handler';
import { AppError, validationError } from '../src/shared/errors';

/** Estos casos no llegan a la base, así que alcanza con un `Db` vacío. */
const unusedDb = {} as Db;

function appThatThrows(error: Error) {
  const app = express();
  app.get('/falla', () => {
    throw error;
  });
  app.use(errorHandler);
  return app;
}

describe('manejo de errores', () => {
  it('responde 404 NOT_FOUND en una ruta que no existe', async () => {
    const response = await request(createApp(unusedDb)).get('/no-existe');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
  });

  it('responde 400 VALIDATION_ERROR cuando el cuerpo no es JSON válido', async () => {
    const response = await request(createApp(unusedDb))
      .post('/orders')
      .set('Content-Type', 'application/json')
      .send('{ "userId": ');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toEqual(expect.any(String));
  });

  it('responde 500 INTERNAL_ERROR sin detalles internos ante un error no previsto', async () => {
    const app = appThatThrows(new Error('password=secreto en SELECT * FROM users'));

    const response = await request(app).get('/falla');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: expect.any(String) } });
    expect(JSON.stringify(response.body)).not.toContain('secreto');
    expect(JSON.stringify(response.body)).not.toContain('SELECT');
  });

  it('convierte un AppError en su status y su código', async () => {
    const app = appThatThrows(new AppError(404, 'USER_NOT_FOUND', 'El usuario 99 no existe'));

    const response = await request(app).get('/falla');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'USER_NOT_FOUND', message: 'El usuario 99 no existe' } });
  });

  it('incluye el campo y el motivo en los errores de validación', async () => {
    const app = appThatThrows(validationError([{ field: 'size', message: 'Debe ser un entero positivo' }]));

    const response = await request(app).get('/falla');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual([{ field: 'size', message: 'Debe ser un entero positivo' }]);
  });
});
