import { z } from 'zod';
import { MAX_SIZE } from './domain';
import { type ErrorDetail, validationError } from './errors';

// Los mensajes de validación se devuelven en español, igual que el resto de la API.
z.config(z.locales.es());

/** Valida `input` contra el esquema; si no cumple, lanza un error 400 con el detalle de cada campo. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw validationError(result.error.issues.map(toDetail));
  }
  return result.data;
}

function toDetail(issue: z.core.$ZodIssue): ErrorDetail {
  if (issue.path.length > 0) {
    return { field: issue.path.map(String).join('.'), message: issue.message };
  }
  if (issue.code === 'unrecognized_keys') {
    return { field: issue.keys.join(', '), message: 'Campo no permitido' };
  }
  return { field: 'body', message: issue.message };
}

/** Identificador entero positivo recibido como texto en la ruta. */
export const idParam = z
  .string()
  .regex(/^\d+$/, 'Debe ser un entero positivo')
  .transform(Number)
  .pipe(z.number().int().positive().max(MAX_SIZE));
