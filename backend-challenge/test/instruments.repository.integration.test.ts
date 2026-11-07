import { searchInstruments } from '../src/instruments/instruments.repository';
import { useTestTransaction } from './helpers/database';
import { PAMP } from './helpers/seed-orders';

describe('searchInstruments', () => {
  const ctx = useTestTransaction();

  const tickers = async (text: string, limit = 20) =>
    (await searchInstruments(ctx().db.manager, text, limit)).map((instrument) => instrument.ticker);

  it('busca por ticker', async () => {
    expect(await tickers('PAMP')).toEqual(['PAMP']);
  });

  it('busca por parte del ticker', async () => {
    expect(await tickers('GG')).toContain('GGAL');
  });

  it('busca por nombre', async () => {
    expect(await tickers('molinos')).toEqual(['MOLA', 'MOLI', 'SEMI']);
  });

  it('no distingue mayúsculas de minúsculas', async () => {
    expect(await tickers('ggal')).toEqual(['GGAL']);
    expect(await tickers('MoLiNoS')).toEqual(['MOLA', 'MOLI', 'SEMI']);
  });

  it('no distingue acentos ni eñes', async () => {
    expect(await tickers('compania')).toEqual(['INTR']);
    expect(await tickers('COMPAÑÍA')).toEqual(['INTR']);
    expect(await tickers('zorraquin')).toEqual(['GARO']);
    expect(await tickers('zorraquín')).toEqual(['GARO']);
  });

  it('pone primero el instrumento cuyo ticker coincide exactamente', async () => {
    expect(await tickers('MOLI')).toEqual(['MOLI', 'MOLA', 'SEMI']);
    expect(await tickers('moli')).toEqual(['MOLI', 'MOLA', 'SEMI']);
  });

  it('excluye los instrumentos de tipo MONEDA', async () => {
    expect(await tickers('ARS')).toEqual([]);
    expect(await tickers('pesos')).toEqual([]);
  });

  it('respeta el límite', async () => {
    expect((await tickers('s.a.')).length).toBe(20);
    expect((await tickers('s.a.', 5)).length).toBe(5);
  });

  it('devuelve los datos del instrumento', async () => {
    const instruments = await searchInstruments(ctx().db.manager, 'pamp', 20);

    expect(instruments).toEqual([{ id: PAMP, ticker: 'PAMP', name: 'Pampa Holding S.A.', type: 'ACCIONES' }]);
  });

  it('devuelve una lista vacía cuando no hay coincidencias', async () => {
    expect(await tickers('zzzzzz')).toEqual([]);
  });

  it('trata los comodines de LIKE como texto', async () => {
    expect(await tickers('%')).toEqual([]);
    expect(await tickers('_')).toEqual([]);
  });
});
