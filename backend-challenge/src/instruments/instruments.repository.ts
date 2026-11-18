import type { EntityManager } from 'typeorm';
import { CASH_INSTRUMENT_TYPE } from '../shared/domain';
import { normalizeSearchText, toLikePattern } from './search-text';

export interface InstrumentRow {
  id: number;
  ticker: string;
  name: string;
  type: string;
}

/**
 * Expresión SQL que deja una columna de texto en minúsculas y sin acentos, igual que el texto buscado.
 * Usa `translate` para no depender de la extensión `unaccent`.
 */
const normalized = (column: string) =>
  `translate(lower(${column}), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')`;

/**
 * Busca activos operables cuyo ticker o nombre contiene el texto.
 * Devuelve primero el que coincide exactamente por ticker y después el resto, ordenado por ticker.
 */
export function searchInstruments(manager: EntityManager, text: string, limit: number): Promise<InstrumentRow[]> {
  const query = normalizeSearchText(text);

  return manager.query(
    `SELECT id, ticker, name, type
       FROM instruments
      WHERE type IS DISTINCT FROM $1
        AND (${normalized('ticker')} LIKE $2 ESCAPE '\\' OR ${normalized('name')} LIKE $2 ESCAPE '\\')
      ORDER BY (${normalized('ticker')} = $3) DESC NULLS LAST, ticker ASC
      LIMIT $4`,
    [CASH_INSTRUMENT_TYPE, toLikePattern(query), query, limit],
  );
}
