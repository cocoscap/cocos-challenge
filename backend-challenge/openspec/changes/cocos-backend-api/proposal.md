# Proposal

## Why

El challenge de backend de Cocos pide una API REST para consultar el portfolio de un usuario, buscar activos y enviar órdenes al mercado sobre una base Postgres que ya existe. Hoy el proyecto solo tiene el enunciado, el SQL de referencia y las decisiones registradas en `DECISIONES.md`; no hay código.

## What Changes

- Nueva API REST en Node.js sobre la base Postgres provista, sin modificar su schema.
- `GET /users/:userId/portfolio`: valor total de la cuenta, pesos totales, reservados y disponibles, y posiciones con cantidad, valor de mercado, rendimiento total y retorno diario.
- `GET /instruments?q=`: búsqueda de activos por ticker o nombre, con último precio y retorno diario.
- `POST /orders`: envío de órdenes `BUY` y `SELL` (`MARKET` y `LIMIT`, por cantidad o por monto) y de movimientos de efectivo `CASH_IN` y `CASH_OUT`, con validación de saldo y tenencia.
- `POST /orders/:orderId/cancel`: cancelación de órdenes en estado `NEW`.
- Reglas de saldo: las órdenes `FILLED` mueven pesos y tenencias; las órdenes `NEW` reservan pesos (compras) o acciones (ventas).
- Convenciones comunes de respuesta: un único formato de error y un único formato numérico.
- Tests unitarios para los cálculos y tests funcionales por HTTP contra Postgres, cada uno dentro de una transacción que se deshace.
- Entregables de uso: README, `.env.example`, colección de Postman y archivo `.http`.

## Capabilities

### New Capabilities

- `account-balance`: cómo se derivan de la tabla `orders` los pesos (totales, reservados y disponibles) y las tenencias (en cartera, reservadas y disponibles) de un usuario.
- `portfolio`: consulta del portfolio de un usuario, con el valor de la cuenta, sus pesos y sus posiciones valuadas con rendimiento.
- `instrument-search`: búsqueda de activos operables por ticker o nombre, con su último precio y retorno diario.
- `orders`: envío de órdenes y de movimientos de efectivo, determinación de precio, cantidad y estado, y cancelación de órdenes pendientes.
- `api-responses`: convenciones comunes a todos los endpoints, es decir, el formato de los errores y el de los valores numéricos.

### Modified Capabilities

Ninguna. El proyecto no tiene specs previas.

## Impact

- **Código**: todo nuevo, dentro de `backend-challenge/` (`src/`, `test/`, configuración del proyecto).
- **Base de datos**: es provista y no se modifica. La API lee `users`, `instruments`, `marketdata` y `orders`, y solo escribe en `orders` (alta de órdenes y cambio de estado al cancelar).
- **Dependencias nuevas**: Express 5, TypeORM, `pg`, `reflect-metadata`, zod, decimal.js y dotenv; para desarrollo, TypeScript, tsx, Jest, ts-jest y supertest.
- **Configuración**: variables `DB_*` del archivo `.env`, que no se versiona.
- **Documentación**: README nuevo; `DECISIONES.md` sigue siendo el registro de decisiones y se actualiza si el desarrollo toma alguna nueva.
