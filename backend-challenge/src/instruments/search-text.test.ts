import { normalizeSearchText, toLikePattern } from './search-text';

describe('normalizeSearchText', () => {
  it('quita los espacios de los extremos', () => {
    expect(normalizeSearchText('  pamp  ')).toBe('pamp');
  });

  it('pasa a minúsculas', () => {
    expect(normalizeSearchText('GgAl')).toBe('ggal');
  });

  it('quita los acentos', () => {
    expect(normalizeSearchText('Zorraquín')).toBe('zorraquin');
    expect(normalizeSearchText('RÍO')).toBe('rio');
  });

  it('trata la ñ como n', () => {
    expect(normalizeSearchText('Compañía')).toBe('compania');
  });

  it('quita la diéresis', () => {
    expect(normalizeSearchText('pingüino')).toBe('pinguino');
  });

  it('conserva los espacios internos, los puntos y los números', () => {
    expect(normalizeSearchText('S.A. San 2')).toBe('s.a. san 2');
  });
});

describe('toLikePattern', () => {
  it('rodea el texto con comodines para buscar en cualquier posición', () => {
    expect(toLikePattern('pamp')).toBe('%pamp%');
  });

  it('escapa los comodines de LIKE para tratarlos como texto', () => {
    expect(toLikePattern('100%')).toBe('%100\\%%');
    expect(toLikePattern('a_b')).toBe('%a\\_b%');
  });

  it('escapa la barra invertida', () => {
    expect(toLikePattern('a\\b')).toBe('%a\\\\b%');
  });
});
