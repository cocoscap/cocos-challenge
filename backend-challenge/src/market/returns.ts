import Decimal from 'decimal.js';

type Price = Decimal | null | undefined;

/** Variación porcentual de `current` respecto de `base`; `null` si falta un valor o la base es cero. */
function percentChange(current: Price, base: Price): Decimal | null {
  if (current == null || base == null || base.isZero()) {
    return null;
  }
  return current.minus(base).dividedBy(base).times(100);
}

/** Rendimiento de una posición: último precio contra el precio promedio de compra. */
export function totalReturnPct(lastPrice: Price, averagePrice: Price): Decimal | null {
  return percentChange(lastPrice, averagePrice);
}

/** Retorno del día: cierre contra el cierre anterior del mismo registro de mercado. */
export function dailyReturnPct(close: Price, previousClose: Price): Decimal | null {
  return percentChange(close, previousClose);
}
