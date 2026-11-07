import Decimal from 'decimal.js';
import { toApiNumber } from './numbers';

describe('toApiNumber', () => {
  it('redondea a dos decimales', () => {
    expect(toApiNumber(new Decimal('-0.4462'))).toBe(-0.45);
  });

  it('lleva el medio hacia arriba en valor absoluto', () => {
    expect(toApiNumber(new Decimal('0.125'))).toBe(0.13);
    expect(toApiNumber(new Decimal('-0.125'))).toBe(-0.13);
    expect(toApiNumber(new Decimal('1.005'))).toBe(1.01);
  });

  it('devuelve un número, no un texto', () => {
    const total = toApiNumber(new Decimal('753000'));

    expect(total).toBe(753000);
    expect(typeof total).toBe('number');
  });

  it('conserva los centavos', () => {
    expect(toApiNumber(new Decimal('9258.50'))).toBe(9258.5);
  });

  it('devuelve null cuando el valor no se puede calcular', () => {
    expect(toApiNumber(null)).toBeNull();
    expect(toApiNumber(undefined)).toBeNull();
  });
});
