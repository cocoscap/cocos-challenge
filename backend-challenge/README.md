# Cocos Challenge: Backend

API REST para consultar el portfolio de un usuario, buscar activos y enviar órdenes al mercado.

- El enunciado está en [backend-challenge.md](backend-challenge.md).
- Las decisiones de diseño y los supuestos están en [DECISIONES.md](DECISIONES.md).

## Requisitos

- Node.js 20.19 o superior. Se desarrolló con Node 24.
- Una base Postgres con las tablas y los datos de [database.sql](database.sql).

## Configuración

1. Instalar las dependencias:

   ```bash
   npm install
   ```

2. Copiar `.env.example` como `.env` y completar los datos de conexión:

   | Variable | Descripción | Por defecto |
   |---|---|---|
   | `DB_HOST` | Host de Postgres | Obligatoria |
   | `DB_PORT` | Puerto de Postgres | `5432` |
   | `DB_USER` | Usuario | Obligatoria |
   | `DB_PASSWORD` | Contraseña | Vacía |
   | `DB_NAME` | Nombre de la base | Obligatoria |
   | `DB_SSL` | `true` si el servidor exige SSL; se verifica su certificado | `false` |
   | `PORT` | Puerto de la API | `3000` |

   Si falta una variable obligatoria, la app no arranca e indica cuál es.

La API no crea ni modifica tablas: usa el schema de `database.sql` tal como está.

## Uso

En desarrollo, con recarga automática:

```bash
npm run dev
```

Compilada:

```bash
npm run build
npm start
```

La API queda disponible en `http://localhost:3000`.

## Tests

```bash
npm test
```

Hay tests unitarios, que no necesitan la base, y tests de integración, que usan la base configurada en `.env`. Cada test de integración corre dentro de una transacción que se deshace al terminar, así que no dejan datos.
