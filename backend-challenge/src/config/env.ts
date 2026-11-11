import { z } from 'zod';

const envSchema = z.object({
  DB_HOST: z.string(),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string(),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string(),
  DB_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valida las variables de entorno y las devuelve tipadas.
 * Una variable vacía se trata igual que una ausente.
 */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const defined = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  );
  const result = envSchema.safeParse(defined);

  if (!result.success) {
    const variables = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Configuración inválida. Revisar en .env: ${variables.join(', ')}`);
  }

  return result.data;
}
