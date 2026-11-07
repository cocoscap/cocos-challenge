# Tasks

Cada tarea sigue el ciclo de `CLAUDE.md`: test primero, suite completa en verde y commit.
Los tests que leen instrumentos y precios asumen los datos de `database.sql`; si la tarea 1.4 detecta diferencias, se ajustan los casos a los datos reales.

## 1. Base del proyecto

- [x] 1.1 Crear la rama `feat/backend-challenge` desde `main`, el `.gitignore` (`.env`, `.claude/settings.local.json`, `node_modules/`, `dist/`, `coverage/`) y `.env.example` con los nombres de las variables sin valores; hacer el commit inicial con los archivos que ya existen (enunciado, `database.sql`, `DECISIONES.md`, `CLAUDE.md`, `.claude/` y `openspec/`); verificar que `git branch --show-current` muestra la rama, que `git check-ignore .env` confirma que `.env` queda ignorado y que el commit no lo incluye
- [ ] 1.2 Crear `package.json` con los scripts `dev`, `build`, `start` y `test`, un `tsconfig.json` estricto con decoradores, e instalar las dependencias (express, typeorm, pg, reflect-metadata, zod, decimal.js, dotenv; para desarrollo typescript, tsx, jest, ts-jest, supertest y sus tipos); verificar que `npm run build` termina sin errores
- [ ] 1.3 Configurar Jest con ts-jest y escribir primero el test de la configuración (falta `DB_HOST` → error que nombra la variable; valores completos → configuración tipada, con `PORT` 3000 por defecto); implementar `config/env.ts` y verificar que `npm test` pasa
- [ ] 1.4 Verificar el acceso a la base provista con consultas de solo lectura: permiso `SELECT` en las cuatro tablas, `INSERT` y `UPDATE` en `orders`, y si las órdenes, los instrumentos y los precios coinciden con `database.sql`; anotar el resultado en `DECISIONES.md`. Si `.env` no tiene credenciales o falta un permiso, frenar y avisar antes de seguir
- [ ] 1.5 Escribir primero el test de integración que lee el instrumento PAMP y una orden con sus propiedades en camelCase y sus precios como decimales; implementar las cuatro entidades, `data-source.ts` con `synchronize: false` y `Db`; verificar que el test pasa
- [ ] 1.6 Escribir primero el test del arnés: un test inserta una orden usando `db.transaction` y, después del rollback, otra conexión cuenta en `orders` las mismas filas que antes; implementar `test/helpers` y verificar que pasa. Si las transacciones anidadas de TypeORM no se comportan como savepoints, implementar los savepoints a mano dentro de `Db`
- [ ] 1.7 Escribir primero los tests de `shared/numbers` (-0.4462 → -0.45, 753000 → número, valor ausente → `null`); implementarlo y verificar que pasan
- [ ] 1.8 Escribir primero los tests por HTTP del manejo de errores (ruta inexistente → 404 `NOT_FOUND`, JSON mal formado → 400 `VALIDATION_ERROR`, error no previsto → 500 `INTERNAL_ERROR` sin trazas); implementar `createApp`, `AppError` y el middleware de errores; verificar que pasan
- [ ] 1.9 Crear `README.md` con requisitos, configuración de `.env` y los comandos `npm run dev` y `npm test`; verificar, siguiendo sus pasos, que la app arranca y responde 404 `NOT_FOUND` en `/`

## 2. Estado de cuenta

- [ ] 2.1 Copiar las once órdenes del usuario 1 de `database.sql` como datos de ejemplo de los tests y escribir primero los tests de pesos: totales 753000, reservados 125500, disponibles 627500, usuario sin órdenes en 0, y órdenes `CANCELLED` y `REJECTED` ignoradas; implementar esa parte de `computeAccountState` y verificar que pasan
- [ ] 2.2 Escribir primero los tests de tenencias: PAMP 40, METR 500, BMA -10, una compra `NEW` no suma tenencia, una venta `NEW` reserva acciones y las disponibles son la tenencia menos la reserva; completar `computeAccountState` y verificar que pasan
- [ ] 2.3 Escribir primero los tests del precio promedio: dos compras a distinto precio (175), una venta que no lo cambia (930) y una posición cerrada y reabierta (200); implementarlo dentro del estado de cuenta y verificar que pasan
- [ ] 2.4 Escribir primero el test de integración del repositorio: devuelve solo las órdenes `FILLED` y `NEW` de un usuario, ordenadas por `datetime` e `id`; implementar `account.repository.ts` y verificar que pasa
- [ ] 2.5 Actualizar `DECISIONES.md`: el saldo y las posiciones se calculan en funciones puras sobre las órdenes del usuario, y el SQL elaborado queda para el último precio y la búsqueda; verificar que el documento no contradice `design.md`

## 3. Portfolio

- [ ] 3.1 Escribir primero los tests del rendimiento total y del retorno diario: PAMP -0.45 y 0.44, METR -8.20, y `previousClose` ausente o en cero → `null`; implementar `market/returns.ts` y verificar que pasan
- [ ] 3.2 Escribir primero el test de integración del último precio: para PAMP devuelve el registro con la fecha más reciente, y para un instrumento sin `marketdata` no devuelve nada; implementar `market.repository.ts` y verificar que pasa
- [ ] 3.3 Escribir primero los tests del armado del portfolio con los datos de ejemplo: valor de la cuenta 904784, METR y PAMP en ese orden con sus valores, BMA y ARS excluidos, una posición sin precio con `null` y sin sumar al total, y un usuario sin órdenes con todo en 0; implementar el armado puro y verificar que pasan
- [ ] 3.4 Escribir primero los tests funcionales de `GET /users/:userId/portfolio`: 200 con `userId`, `totalAccountValue`, `cash` y `positions`, 404 `USER_NOT_FOUND` y 400 con un id inválido; implementar la ruta y el servicio y verificar que pasan
- [ ] 3.5 Documentar el endpoint en `README.md` y agregar su pedido a `api.http` y a la colección de Postman; verificar ejecutando el pedido de `api.http` contra la app levantada que la respuesta tiene la forma documentada

## 4. Búsqueda de activos

- [ ] 4.1 Escribir primero los tests de la normalización del texto: espacios de los extremos, mayúsculas, acentos, `ñ` y comodines `%`, `_` y `\` escapados; implementar `search-text.ts` y verificar que pasan
- [ ] 4.2 Escribir primero los tests de integración del repositorio: por ticker, por nombre (`molinos` → MOLA, MOLI, SEMI), sin acentos (`compania` → INTR), tipo `MONEDA` excluido, ticker exacto primero (`MOLI` → MOLI, MOLA, SEMI) y límite; implementar `instruments.repository.ts` y verificar que pasan
- [ ] 4.3 Escribir primero los tests funcionales de `GET /instruments`: 200 con `lastPrice` y `dailyReturnPct` (PAMP con valores, PGR en `null`), lista vacía sin coincidencias, 20 resultados por defecto, 400 sin `q` o con `q` vacío y 400 con `limit` fuera de rango; implementar la ruta y el servicio y verificar que pasan
- [ ] 4.4 Documentar el endpoint en `README.md` y agregar sus pedidos a `api.http` y a la colección de Postman; verificar ejecutando los pedidos de `api.http` contra la app levantada que las respuestas tienen la forma documentada

## 5. Envío de órdenes

- [ ] 5.1 Escribir primero los tests del esquema del pedido: cada caso de validación de las órdenes `BUY` y `SELL` de la spec, los límites de `price` y `size`, y los movimientos de efectivo que solo aceptan `userId`, `side` y `size`; implementar `orders.schema.ts` y verificar que pasan
- [ ] 5.2 Escribir primero los tests de la decisión de la orden: cantidad desde un monto (10000 a 925.85 → 10, 10000 a 900 → 11, 500 a 925.85 → `AMOUNT_TOO_SMALL`), compra por exactamente lo disponible aceptada, fondos insuficientes y pesos reservados → `REJECTED` con `INSUFFICIENT_FUNDS`, tenencia insuficiente o reservada → `REJECTED` con `INSUFFICIENT_HOLDINGS`, `MARKET` → `FILLED`, `LIMIT` → `NEW` aunque supere el precio de mercado, y `CASH_IN` y `CASH_OUT`; implementar `order-decision.ts` y verificar que pasan
- [ ] 5.3 Escribir primero el test del lock por usuario: con dos conexiones en transacción, la segunda no obtiene el lock del mismo usuario hasta que la primera hace rollback, sin escribir filas; implementar `user-lock.ts` y verificar que pasa
- [ ] 5.4 Escribir primero los tests funcionales de los movimientos de efectivo en `POST /orders`: `CASH_IN` → 201 `FILLED` sobre ARS con `price` 1 y pesos totales en aumento, `CASH_OUT` → `FILLED`, y `CASH_OUT` por más de lo disponible → `REJECTED` con `INSUFFICIENT_FUNDS`; implementar la ruta y el servicio con la transacción, el lock y el alta de la orden, y verificar que pasan
- [ ] 5.5 Escribir primero los tests funcionales de las órdenes `BUY` y `SELL` (el test funcional que pide el enunciado): compra `MARKET` → 201 `FILLED` con el último `close` y reflejada en el portfolio, compra `LIMIT` → `NEW` que baja `cash.available` y no `cash.total`, compra por más de lo disponible → 201 `REJECTED` grabada y portfolio sin cambios, venta sin tenencia → `REJECTED`, y órdenes por `amount`; completar el servicio con el precio y la cantidad y verificar que pasan
- [ ] 5.6 Escribir primero los tests funcionales de los pedidos que no se graban: 400 `VALIDATION_ERROR`, 404 `USER_NOT_FOUND` e `INSTRUMENT_NOT_FOUND`, 400 `INSTRUMENT_NOT_TRADABLE`, 422 `NO_MARKET_PRICE` sobre PGR y 422 `AMOUNT_TOO_SMALL`, comprobando en cada caso que la cantidad de órdenes del usuario no cambia; completar el servicio y verificar que pasan
- [ ] 5.7 Documentar el endpoint en `README.md`, con sus códigos de error, y agregar a `api.http` y a la colección de Postman un pedido por cada caso; verificar que la colección es un JSON válido y que cada caso documentado tiene su pedido, sin ejecutar pedidos de escritura contra la base provista

## 6. Cancelación de órdenes

- [ ] 6.1 Escribir primero los tests funcionales de `POST /orders/:orderId/cancel`: orden `NEW` → 200 `CANCELLED` y `cash.available` vuelve a subir, orden `FILLED` → 409 `ORDER_NOT_CANCELLABLE` y sigue `FILLED`, orden ya cancelada → 409, orden inexistente → 404 `ORDER_NOT_FOUND` e id inválido → 400; implementar la actualización condicional y verificar que pasan
- [ ] 6.2 Documentar el endpoint en `README.md`, agregar su pedido a `api.http` y a la colección de Postman, y sumar al README la sección de limitaciones conocidas de `design.md`; verificar que la colección sigue siendo un JSON válido y que cada limitación de `design.md` figura en el README

## 7. Verificación final

- [ ] 7.1 Con `node_modules/` y `dist/` borrados, ejecutar `npm ci`, `npm run build` y `npm test`; verificar que los tres terminan sin errores
- [ ] 7.2 Contar las filas de `orders` antes y después de `npm test`; verificar que la cantidad es la misma
- [ ] 7.3 Levantar la app con `npm run dev` y ejecutar los pedidos de lectura de `api.http` (portfolio y búsquedas); verificar que las respuestas cumplen las specs. Los pedidos de escritura no se ejecutan contra la base provista
- [ ] 7.4 Leer `README.md` y `DECISIONES.md` completos contra las specs y `design.md`; verificar que no se contradicen
- [ ] 7.5 Ejecutar `openspec validate cocos-backend-api --strict`; verificar que no informa errores

## Workflow follow-up

- Archivar el change cuando la entrega esté revisada.
