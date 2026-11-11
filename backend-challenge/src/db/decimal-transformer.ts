import Decimal from 'decimal.js';
import type { ValueTransformer } from 'typeorm';

/** Las columnas `NUMERIC` llegan como texto; se convierten a `Decimal` para no perder precisión. */
export const decimalTransformer: ValueTransformer = {
  to: (value: Decimal | null | undefined) => (value == null ? value : value.toString()),
  from: (value: string | null | undefined) => (value == null ? null : new Decimal(value)),
};
