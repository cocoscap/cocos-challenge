/**
 * Deja el texto de búsqueda en la forma en que se compara:
 * sin espacios en los extremos, en minúsculas y sin acentos, diéresis ni virgulilla (`ñ` queda como `n`).
 */
export function normalizeSearchText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/** Arma el patrón de `LIKE` que busca el texto en cualquier posición, escapando sus comodines. */
export function toLikePattern(normalizedText: string): string {
  return `%${normalizedText.replace(/[\\%_]/g, '\\$&')}%`;
}
