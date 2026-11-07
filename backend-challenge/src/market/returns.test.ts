import Decimal from 'decimal.js';
import { dailyReturnPct, totalReturnPct } from './returns';

const d = (value: string | number) => new Decimal(value);

describe('totalReturnPct', () => {
  it('compara el último precio de PAMP con su precio promedio de compra', () => {
    expect(totalReturnPct(d('925.85'), d(930))?.toFixed(2)).toBe('-0.45');
  });

  it('compara el último precio de METR con su precio promedio de compra', () => {
    expect(totalReturnPct(d('229.50'), d(250))?.toFixed(2)).toBe('-8.20');
  });

  it('es positivo cuando el precio subió', () => {
    expect(totalReturnPct(d(110), d(100))?.toNumber()).toBe(10);
  });

  it('es null si no hay último precio', () => {
    expect(totalReturnPct(null, d(100))).toBeNull();
  });

  it('es null si el precio promedio es cero', () => {
    expect(totalReturnPct(d(100), d(0))).toBeNull();
  });
});

describe('dailyReturnPct', () => {
  it('compara el cierre de PAMP con su cierre anterior', () => {
    expect(dailyReturnPct(d('925.85'), d('921.80'))?.toFixed(2)).toBe('0.44');
  });

  it('compara el cierre de METR con su cierre anterior', () => {
    expect(dailyReturnPct(d('229.50'), d('232.00'))?.toFixed(2)).toBe('-1.08');
  });

  it('es cero cuando el precio no cambió', () => {
    expect(dailyReturnPct(d('20.50'), d('20.50'))?.toNumber()).toBe(0);
  });

  it('es null si falta el cierre anterior', () => {
    expect(dailyReturnPct(d(100), null)).toBeNull();
  });

  it('es null si el cierre anterior es cero', () => {
    expect(dailyReturnPct(d(100), d(0))).toBeNull();
  });

  it('es null si falta el cierre', () => {
    expect(dailyReturnPct(null, d(100))).toBeNull();
  });
});
