# Design

## Context

Proyecto nuevo: no hay código, solo el enunciado, `database.sql` y `DECISIONES.md`. La motivación y el alcance están en `proposal.md`; el comportamiento esperado, en las specs.

Restricciones que condicionan el diseño:

- **Base provista, permisos desconocidos.** No se ejecuta DDL: ni índices, ni constraints, ni extensiones. El diseño asume el mínimo que exige el propio challenge: `SELECT` sobre las cuatro tablas, e `INSERT` y `UPDATE` sobre `orders`.
- **El contenido puede diferir de `database.sql`.** Los números del archivo sirven como casos de prueba de los cálculos, no como estado garantizado de la base.
- **Schema heredado.** Las columnas se crearon sin comillas, así que existen en minúscula: `instrumentid`, `userid`, `accountnumber`, `previousclose`. Los precios son `NUMERIC(10,2)`, `orders.size` es `INT`, `orders.datetime` es `TIMESTAMP` sin zona y `marketdata.date` es `DATE`. Ninguna columna tiene `NOT NULL` ni `CHECK`.
- **Stack ya decidido** en `DECISIONES.md`: TypeScript estricto, Express 5, TypeORM, zod, decimal.js, Jest con ts-jest y supertest.
- **Desarrollo con TDD**, según `CLAUDE.md`.

## Goals / Non-Goals

**Goals:**

- Una sola implementación de las reglas de saldo, que usan tanto el portfolio como la validación de órdenes, para que nunca den resultados distintos.
- Lógica de negocio en funciones puras, testeables sin base.
- Tests funcionales por HTTP que no dejan filas en la base provista.
- Funcionar con los permisos mínimos sobre la base.

**Non-Goals:**

- Simular el mercado o ejecutar órdenes `LIMIT`.
- Autenticación y autorización.
- Cambios de schema, migraciones o carga de datos.
- Consultar o listar órdenes: no hay `GET /orders`.
- Comisiones, horarios de mercado e idempotencia de pedidos.
- Rendimiento con grandes volúmenes de órdenes por usuario.

## Decisions

### 1. Estructura por funcionalidad, con tres capas

```
rutas (Express) --> servicios --> repositorios (TypeORM) --> Postgres
                        |
                        v
                 funciones puras
```

```
src/
  server.ts                 arranque: config, conexión y puerto
  app.ts                    createApp(db): rutas y middlewares
  config/env.ts             variables de entorno validadas
  db/
    data-source.ts          DataSource de TypeORM
    db.ts                   interfaz Db y su implementación
    entities/               User, Instrument, Order, MarketData
  shared/
    errors.ts               AppError y códigos
    error-handler.ts        middleware de errores y de ruta inexistente
    numbers.ts              Decimal, redondeo y serialización
  account/
    account-state.ts        puro: pesos y tenencias desde las órdenes
    account.repository.ts   órdenes FILLED y NEW de un usuario
  market/
    market.repository.ts    último precio por instrumento
    returns.ts              puro: retorno diario
  portfolio/                rutas, servicio y armado puro de la respuesta
  instruments/              rutas, servicio, repositorio y normalización del texto
  orders/                   rutas, esquema zod, servicio, decisión pura y lock
test/
  helpers/                  arnés con rollback y órdenes de ejemplo
  *.functional.test.ts      tests por HTTP
```

Los tests unitarios viven junto al archivo que prueban (`*.test.ts`).

- **Por qué**: las reglas del challenge (saldo, reservas, precio promedio, decisión de la orden) son cálculos sobre datos ya leídos. Separarlas del acceso a la base permite desarrollarlas con ciclos de TDD de milisegundos.
- **Alternativa**: capas globales (`controllers/`, `services/`, `repositories/`). Se descartó porque dispersa cada funcionalidad en tres carpetas.

### 2. La app recibe la base por parámetro

`createApp(db)` arma la app de Express con una dependencia explícita, sin `DataSource` global:

```ts
interface Db {
  manager: EntityManager
  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T>
}
```

- **En producción**, `Db` envuelve el `DataSource`: `transaction` delega en `dataSource.transaction`.
- **En los tests**, `Db` envuelve un `QueryRunner` con una transacción ya abierta: `transaction` abre un savepoint sobre esa misma conexión, y al terminar el test se hace rollback de todo.
- **Por qué**: es lo que permite que un pedido HTTP del test corra dentro de la transacción del test.
- **Alternativa**: un `DataSource` importado desde los servicios. Se descartó porque obligaría a interceptar módulos en los tests.

### 3. Entidades de TypeORM sobre el schema existente

- Cada entidad declara el nombre real de su tabla y de cada columna (`@Column({ name: 'instrumentid', type: 'int' })`) y expone propiedades en camelCase.
- Todos los decoradores llevan el tipo de columna explícito. Así no se depende de la metadata de tipos que emite TypeScript, que `tsx` no genera.
- Las columnas `NUMERIC` llegan como texto y se convierten a `Decimal` al leerlas.
- No se declaran relaciones entre entidades: los cruces se resuelven por id.
- `synchronize: false`, sin migraciones y con la lista de entidades explícita. Con `synchronize` activo, TypeORM intentaría alterar la base provista.

### 4. El estado de cuenta es una sola función pura

`computeAccountState(orders)` recibe las órdenes `FILLED` y `NEW` de un usuario, ordenadas por `datetime` e `id`, y devuelve:

- pesos totales, reservados y disponibles;
- por instrumento: tenencia, acciones reservadas, acciones disponibles y precio promedio de compra.

La usan el portfolio y la validación de órdenes. Implementa por completo la capability `account-balance`.

- **Por qué**: una única implementación de las reglas, testeable con las once órdenes de `database.sql` como caso conocido (753.000, 125.500, 627.500).
- **Alternativa**: sumar en SQL con `SUM(CASE ...)`. Se descartó porque el precio promedio exige recorrer las órdenes en orden de todas formas, y quedarían las mismas reglas escritas dos veces, una en SQL y otra en TypeScript.
- **Consecuencia**: `DECISIONES.md` dice que las consultas de saldo y posiciones se escriben en SQL. Con este diseño el SQL elaborado queda para el último precio y la búsqueda. Hay una tarea para alinear esa línea.

### 5. Precio promedio de compra

Se recorre cada orden `FILLED` del instrumento en orden cronológico:

- **Compra con tenencia mayor a cero**: `promedio = (tenencia × promedio + size × price) / (tenencia + size)`.
- **Compra con tenencia cero o negativa**: el promedio pasa a ser el precio de esa compra.
- **Venta**: baja la tenencia y no cambia el promedio.

El segundo caso cubre las posiciones cerradas y reabiertas, y también la inconsistencia de los datos de ejemplo (tenencia negativa de BMA).

### 6. Último precio por instrumento

Una consulta devuelve, para una lista de ids de instrumento, el registro de `marketdata` con la fecha más reciente de cada uno (`DISTINCT ON (instrumentid) ... ORDER BY instrumentid, date DESC, id DESC`), con `close` y `previousClose`.

- La usan el portfolio, la búsqueda y las órdenes `MARKET`.
- El retorno diario usa la columna `previousClose` de ese registro. No se calcula contra el registro del día anterior, porque en los datos no siempre coinciden.

### 7. Flujo de `POST /orders`

```
pedido
  |
  v
1. validar forma (zod) ----------------- invalido --> 400
  |
  v
2. buscar usuario e instrumento -------- no existe --> 404
   (BUY/SELL sobre MONEDA) ------------- no operable -> 400
  |
  v
3. precio: MARKET = ultimo close ------- sin precio --> 422
           LIMIT  = price enviado
           CASH   = 1
  |
  v
4. cantidad: size | floor(amount/precio) -- cero ----> 422
  |
  v
5. transaccion:
     lock del usuario
     leer sus ordenes FILLED y NEW
     computeAccountState
     decidir estado (funcion pura)
     insertar la orden
  |
  v
6. responder 201 con la orden
```

- Los pasos 1 a 4 leen datos de referencia y no necesitan el lock.
- La decisión del paso 5 es una función pura: recibe lado, tipo, cantidad, precio y estado de cuenta, y devuelve `FILLED`, `NEW` o `REJECTED` con su motivo.
- El motivo del rechazo (`rejectionReason`) viaja solo en la respuesta. La tabla no tiene dónde guardarlo y no se modifica.
- Para los movimientos de efectivo, el instrumento ARS se busca por tipo `MONEDA` y ticker `ARS`, no por un id fijo.

### 8. Lock por usuario con advisory lock

Dentro de la transacción del paso 5 se ejecuta `pg_advisory_xact_lock(<constante de la app>, userId)`. El lock se libera solo al terminar la transacción.

- **Por qué**: dos órdenes simultáneas del mismo usuario no pueden validar contra el mismo saldo, y el lock no requiere ningún permiso sobre las tablas.
- **Alternativa `SELECT ... FOR UPDATE` sobre `users`**: exige permiso `UPDATE` sobre `users`, que no está garantizado.
- **Alternativa nivel `SERIALIZABLE`**: obliga a reintentar transacciones y es más difícil de razonar.

### 9. Cancelación con una actualización condicional

`UPDATE orders SET status = 'CANCELLED' WHERE id = :id AND status = 'NEW'`.

- Si actualiza una fila, la orden quedó cancelada.
- Si no actualiza ninguna, se busca la orden para distinguir "no existe" (404) de "no está en `NEW`" (409).
- La operación es atómica, así que no necesita el lock del usuario. La reserva se libera sola, porque el estado de cuenta ignora las órdenes `CANCELLED`.

### 10. Búsqueda sin extensiones

- **En la app**: al texto se le quitan los espacios de los extremos, se pasa a minúsculas, se le quitan los acentos y se escapan los comodines de `LIKE` (`%`, `_` y `\`).
- **En la consulta**: se comparan `translate(lower(ticker), ...)` y `translate(lower(name), ...)` con el texto, se excluye el tipo `MONEDA`, se ordena con el ticker exacto primero y después por ticker, y se aplica el límite.
- Los precios de los resultados salen de la consulta de la decisión 6.
- **Alternativa**: la extensión `unaccent`. Se descartó porque requiere instalarla en la base.

### 11. Validación en el borde y un único manejo de errores

- Cada endpoint valida su entrada con un esquema de zod. El de `POST /orders` es una unión discriminada por `side`, con objetos estrictos: los movimientos de efectivo no aceptan campos de una orden de mercado.
- Los límites del schema también se validan ahí: `price` hasta 99.999.999,99 y `size` hasta 2.147.483.647.
- Los servicios lanzan un `AppError` con status, código y mensaje. Un solo middleware lo convierte al formato de la capability `api-responses`; cualquier otro error sale como 500 genérico.

| Status | Código | Cuándo |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Entrada inválida o JSON mal formado |
| 400 | `INSTRUMENT_NOT_TRADABLE` | `BUY` o `SELL` sobre un instrumento `MONEDA` |
| 404 | `USER_NOT_FOUND`, `INSTRUMENT_NOT_FOUND`, `ORDER_NOT_FOUND` | El recurso no existe |
| 404 | `NOT_FOUND` | Ruta inexistente |
| 409 | `ORDER_NOT_CANCELLABLE` | Cancelar una orden que no está en `NEW` |
| 422 | `NO_MARKET_PRICE` | Orden `MARKET` sobre un instrumento sin precio |
| 422 | `AMOUNT_TOO_SMALL` | El monto no alcanza para una acción |
| 500 | `INTERNAL_ERROR` | Fallo no previsto |

### 12. Dinero con decimales exactos

- Todos los cálculos usan `Decimal`. Ningún monto pasa por aritmética de `number`.
- El redondeo a dos decimales se hace una sola vez, al serializar la respuesta, con una única función.

### 13. Fecha de la orden

La app asigna `new Date()` al crear la orden. El driver escribe y lee la columna `TIMESTAMP` con la misma zona horaria del proceso, así que el valor es consistente dentro de la app.

### 14. Tests

| Tipo | Qué prueba | Toca la base |
|---|---|---|
| Unitario | Funciones puras: estado de cuenta, precio promedio, rendimientos, decisión de la orden, esquemas, normalización | No |
| Funcional | Cada endpoint por HTTP con supertest | Sí, dentro de una transacción con rollback |
| Lock | Que el lock por usuario excluye a una segunda conexión | Sí, sin escribir filas |

- **Arnés funcional**: antes de cada test abre una transacción sobre una conexión, arma la app con un `Db` ligado a esa conexión y, al terminar, hace rollback.
- **Datos de los tests funcionales**: con permisos mínimos solo se puede insertar en `orders`. Los tests usan usuarios e instrumentos que ya existen y arman su escenario con pedidos a la propia API (por ejemplo, un `CASH_IN`) dentro de la transacción. Las aserciones son relativas al estado previo, no a valores fijos de la base.
- **Test del lock**: dos conexiones abren una transacción cada una; la segunda pide el lock del mismo usuario con `lock_timeout` corto y tiene que fallar; tras el rollback de la primera, lo obtiene.
- **Ejecución en serie** (`--runInBand`): evita que dos archivos de test compitan por el lock de un mismo usuario.

### 15. Configuración

Las variables `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` y `DB_SSL` se cargan con dotenv y se validan con zod al arrancar. `PORT` es opcional y vale 3000 por defecto. `.env` no se versiona; `.env.example` sí, con los nombres y sin valores.

### 16. Qué se versiona y dónde

- El trabajo se hace en la rama `feat/backend-challenge`, creada desde `main`. La entrega es un pull request desde esa rama.
- Se versionan el código, la documentación y también las herramientas de trabajo: `.claude/`, `openspec/` y `CLAUDE.md`.
- No se versionan `.env` ni `.claude/settings.local.json`.
- Cada commit agrega los archivos de su tarea nombrándolos; no se usa `git add .`, para que nunca entre un archivo no previsto.

## Risks / Trade-offs

- [Faltan permisos mínimos sobre la base, por ejemplo `UPDATE` en `orders`] → La primera tarea que toca la base los verifica con una consulta de solo lectura. Si faltan, se frena y se avisa antes de escribir código que dependa de ellos.
- [La base tiene datos distintos a `database.sql`] → Los tests funcionales no dependen de valores fijos. Los números del archivo se usan solo en tests unitarios, con las órdenes copiadas como datos de ejemplo.
- [Las transacciones anidadas de TypeORM no se comportan como savepoints] → Se verifica en la tarea del arnés, antes de construir sobre él. Si falla, la implementación de `Db` para tests emite `SAVEPOINT` y `ROLLBACK TO SAVEPOINT` a mano; el resto del código no cambia.
- [Se leen todas las órdenes del usuario en cada pedido] → Es aceptable para el volumen del challenge. A escala se reemplazaría por sumas en SQL o por saldos precalculados; queda mencionado en el README.
- [La validación completa de dos órdenes simultáneas no tiene test de punta a punta] → Probarla exige datos confirmados en la base provista. Se cubre el mecanismo (test del lock) y la decisión (tests unitarios).
- [El rollback de los tests consume ids de la secuencia de `orders`] → No deja filas; solo quedan saltos en la numeración. Se acepta.
- [`orders.datetime` no tiene zona horaria] → El valor depende de la zona del proceso que lo escribe. Se documenta como limitación del schema.
- [`orders.size` es `INT`] → Los movimientos de efectivo no admiten centavos y tienen un tope de 2.147.483.647 pesos. Se valida en la entrada y se documenta.
- [No hay constraints en la base] → Toda la validación vive en la API. Una fila escrita por fuera de la API con un `side` o `status` desconocido se ignora en el cálculo del estado de cuenta.
- [Verificar los endpoints de escritura contra la app levantada deja órdenes reales] → La verificación en vivo se limita a los endpoints de lectura; los de escritura se cubren con los tests funcionales.
