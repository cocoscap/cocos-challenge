import Decimal from 'decimal.js';

export const ZERO = new Decimal(0);

/**
 * Convierte un monto, precio o porcentaje al formato de la API:
 * número JSON con dos decimales, redondeando el medio hacia arriba en valor absoluto.
 * Un valor que no se pudo calcular se devuelve como `null`.
 */
export function toApiNumber(value: Decimal): number;
export function toApiNumber(value: Decimal | null | undefined): number | null;
export function toApiNumber(value: Decimal | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}
