# ADR-0003 — Persistencia y consistencia: ledger derivado, historial contable, bloqueo por cuenta y cantidades decimales

| | |
|---|---|
| **Estado** | PROPUESTO |
| **Autores** | Mayra Urquiza |
| **Decisores** | Mayra Urquiza |
| **Última actualización** | 17 nov 2026 |
| **Relacionado** | [RFC-001](../rfc/RFC-001-api-portfolio-busqueda-ordenes.md) · [ADR-0001](ADR-0001-stack-http-validacion-y-acceso-a-datos.md) · [ADR-0002](ADR-0002-arquitectura-y-patrones-de-dominio.md) · [ADR-0004](ADR-0004-reglas-de-negocio.md) · [ADR-0005](ADR-0005-contrato-de-la-api.md) |

## Contexto

El modelo provisto ([database.sql](../../database.sql)) guarda todo movimiento del usuario (compras, ventas, ingresos y retiros de pesos) como una fila de `orders`. No hay tablas de saldos ni de posiciones. Hay que decidir cómo se guarda y protege ese libro contable.

## Decisión

### 1. Los saldos se derivan de `orders`

**Por qué:** el enunciado pide calcular tenencias y pesos *"utilizando todos los movimientos pertinentes que hay en la tabla `orders`, utilizando la columna `size`"*. Derivarlos, en lugar de guardarlos aparte, evita además tener dos fuentes de verdad que puedan divergir.

`orders` guarda el estado actual de cada orden. Pesos, tenencias y reservas se calculan desde sus filas en cada pedido, con el único cálculo del dominio ([ADR-0002](ADR-0002-arquitectura-y-patrones-de-dominio.md)).

### 2. Historial contable inmutable: `account_events`

**Por qué:** `orders` cambia: una orden `NEW` pasa a `CANCELLED` o a `FILLED`, y la fila pierde la historia de cómo llegó a ese estado. Separar la historia contable del estado actual garantiza trazabilidad y evita que un error al actualizar una orden altere lo que ya ocurrió. También deja la base para publicar eventos y migrar a event sourcing.

Cada cambio en `orders` inserta exactamente un evento, en la misma transacción.

| Campo | Para qué |
|---|---|
| `id` | Orden global en que se insertaron los eventos. |
| `event_id` | Identificador único (UUID), para que quien reciba los eventos pueda descartar duplicados. |
| `account_id` + `sequence` | Un stream por cuenta, con la posición de cada evento dentro de él. El par es único: ordena los eventos y frena escrituras que se salteen el bloqueo. |
| `event_type` + `event_version` | Qué pasó y con qué formato está guardado. Si el formato cambia, se incrementa la versión y los eventos viejos se convierten al leerlos, sin reescribirlos. |
| `order_id` | La orden afectada. |
| `payload` | El detalle del evento, en JSON. |
| `metadata` | De dónde vino el pedido (`source`, `correlationId`). |
| `occurred_at` | Cuándo pasó. |

| Evento | Cuándo | Payload |
|---|---|---|
| `OrderAccepted` | Una `LIMIT` válida queda `NEW` | `orderId, instrumentId, side, type, size, price` |
| `OrderFilled` | Una `MARKET` válida queda `FILLED`, o una `LIMIT` pasa a `FILLED` por la simulación | `orderId, instrumentId, side, type, size, price` |
| `OrderRejected` | Una orden o un `CASH_OUT` no cumple una regla | Lo mismo que `OrderFilled`, más `reason` (`size` y `price` pueden ser `null`) |
| `OrderCancelled` | Una orden `NEW` se cancela | `orderId` |
| `CashTransferredIn` / `CashTransferredOut` | Un `CASH_IN`, o un `CASH_OUT` con fondos, queda `FILLED` | `orderId, amount` |
| `LegacyOrderImported` | Solo al cargar los datos semilla (punto 4) | La fila completa de `orders` |

Características del historial contable:

- **Inmutable:** los triggers rechazan `UPDATE`, `DELETE` y `TRUNCATE`, y el usuario de base de datos de la aplicación solo tiene `INSERT` y `SELECT` sobre la tabla. Las migraciones usan otro usuario, con permisos de DDL. Como la tabla no se puede vaciar, los tests de integración recrean la base por suite.
- **Guarda lo que `orders` no:** si la orden se envió por monto, el evento agrega `requestedAmount`, así el historial conserva lo que pidió el usuario.
- **Reconciliación:** el estado reconstruido desde `account_events` tiene que coincidir con el de `orders`. Es un proceso aparte, que lee los eventos de cada cuenta, reconstruye el estado con `evolve` ([ADR-0002](ADR-0002-arquitectura-y-patrones-de-dominio.md)) y lo compara con el que sale de `orders`. Corre en los tests y como control periódico, exponiendo las diferencias como métrica, con objetivo 0. Los pedidos leen solo `orders`, y `account_events` solo se escribe.

### 3. Un pedido por cuenta a la vez

**Por qué:** la regla "no gastar más de lo disponible" abarca todas las órdenes del usuario, así que dos pedidos simultáneos no pueden validarse contra el mismo disponible. Atender de a un pedido por cuenta resuelve eso y también los reintentos: el segundo encuentra la orden que creó el primero ([ADR-0005](ADR-0005-contrato-de-la-api.md)).

Cada pedido que modifica una cuenta corre en una transacción con estos pasos:

1. Bloquea la cuenta con `SELECT … FROM users WHERE id = $1 FOR UPDATE`, sin bloquear a otros usuarios.
2. Si llegó una `Idempotency-Key` ya usada, devuelve la orden existente y termina.
3. Carga las órdenes, decide y guarda la orden y su evento, con `sequence = MAX(sequence) + 1`.

Si algo se saltea el bloqueo, hay tres barreras más en la base: `UNIQUE (account_id, sequence)` en el historial, el índice único `(userId, idempotencyKey)` en `orders`, y un `UPDATE … WHERE status = 'NEW'` en la cancelación y la ejecución simulada.

### 4. Los datos semilla se cargan en el historial tal como están

**Por qué:** las 11 órdenes existentes no tienen historial. Sin cargarlas, el historial quedaría incompleto y la reconciliación con `orders` sería imposible.

- Cada orden se importa como un único `LegacyOrderImported` con su estado final, ordenado por `(datetime, id)` y marcado con `metadata.source = "backfill"`.
- No se inventan pasos intermedios: no hay datos de cuándo se canceló la orden 3.
- La venta inconsistente de BMA no se corrige, sino que se muestra con un aviso en el portfolio ([ADR-0004](ADR-0004-reglas-de-negocio.md)).
- La carga es idempotente: no duplica eventos si se ejecuta dos veces.

### 5. `size` pasa a decimal, y la escala se decide en el dominio

**Por qué:** las acciones no se fraccionan y los pesos tienen centavos, pero `orders.size` es `INT`: hoy no se pueden registrar transferencias con centavos. Ampliar la columna corrige la causa sin cambiar qué significa `size` ni el cálculo que pide el enunciado.

`size` pasa a `NUMERIC(18,2)`, con un `CHECK` que exige valores enteros salvo en `CASH_IN` y `CASH_OUT`.

- El efectivo sigue siendo un instrumento (`ARS`, precio 1), así que `size` significa lo mismo en todas las filas: unidades del instrumento.
- Cuántos decimales admite una cantidad lo decide el dominio según el tipo de instrumento: 0 para `ACCIONES` y 2 para `MONEDA`. El `CHECK` es solo una red de seguridad en la base.

### 6. Cambios al esquema

**Por qué:** el esquema provisto es la referencia del challenge. Se puede cambiar si se justifica, siempre que no rompa los datos ni las consultas existentes.

Todos los cambios son **aditivos o ampliaciones compatibles**, y las 11 órdenes semilla cumplen todas las restricciones nuevas. Como el resto del esquema, las columnas nuevas se crean sin comillas (PostgreSQL las guarda en minúsculas).

| Cambio | Motivo |
|---|---|
| Tabla `account_events`, con sus triggers y permisos | Historial contable (punto 2). |
| `orders.size` a `NUMERIC(18,2)`, con `CHECK` de acciones enteras | Transferencias con centavos (punto 5). |
| `orders.rejectReason VARCHAR(30) NULL`, con `CHECK` de valores permitidos y solo en órdenes `REJECTED` | Motivo de cada rechazo. La orden semilla rechazada queda con `NULL`. |
| `orders.idempotencyKey VARCHAR(64) NULL` y `orders.requestHash CHAR(64) NULL`, con índice único `(userId, idempotencyKey)` | Pedidos repetidos (punto 3). |
| `CHECK` de valores permitidos en `side`, `type` y `status` | Impedir valores inválidos. |
| `CHECK (size > 0 AND price > 0)` salvo en órdenes `REJECTED` | Una rechazada puede no tener precio o tener cantidad 0 ([ADR-0004](ADR-0004-reglas-de-negocio.md)). |
| Índice `orders (userId, status, instrumentId)` | Cargar rápido el estado de la cuenta. |
| Índice único `marketdata (instrumentId, date)` | Último precio por instrumento, sin duplicados por fecha. |
| Índice único `instruments (ticker)` | El ticker identifica al instrumento. |
| Extensión `unaccent` | Búsqueda que ignora tildes ([ADR-0004](ADR-0004-reglas-de-negocio.md)). |

`orders.datetime` (`TIMESTAMP` sin zona) se guarda siempre en UTC.

### 7. Evolución prevista

**Por qué:** el modelo actual alcanza para el volumen y el alcance del challenge, pero tiene límites conocidos. Dejar definido cada paso siguiente, y cuándo darlo, evita adelantarlo sin necesidad.

| Evolución | Cuándo | Qué cambia |
|---|---|---|
| **Tabla de saldos precalculados** | El envío de órdenes o el portfolio superan su objetivo de tiempo de respuesta. | Pesos, tenencias, reservas y costo promedio por cuenta, actualizados en la misma transacción que `orders`. Cambian el repositorio y la consulta del portfolio. |
| **Publicación de eventos** | Otro sistema necesita reaccionar a lo que pasa en las cuentas. | Un proceso lee `account_events` desde un cursor guardado aparte. Riesgo conocido: `BIGSERIAL` asigna el `id` al insertar y no al confirmar, así que avanzar por `id` podría saltear eventos. Se resolverá en el ADR de esa etapa. |
| **Event sourcing** | Se necesitan consultas en el tiempo o reglas que dependen del orden de los hechos, y la reconciliación da 0 de forma sostenida. | El estado se reconstruye desde el historial, con concurrencia optimista sobre `UNIQUE (account_id, sequence)`. Solo cambia el repositorio. |
| **Escala en `instruments.quantity_scale`** | Aparece un instrumento cuya escala no se deduce del tipo (bonos, cripto). | La escala pasa a una columna, con un trigger que la hace cumplir. |
| **Ledger de movimientos** | Aparecen comisiones, impuestos o multimoneda: una operación con más de un efecto en pesos. | Los efectos contables se registran aparte del libro de órdenes. |

### Cómo se verifica

- Si falla el insert del evento, no queda la orden.
- De dos órdenes simultáneas que juntas superan los fondos, una queda `REJECTED`.
- Dos reintentos simultáneos con la misma clave crean una sola orden y un solo evento.
- `UPDATE`, `DELETE` y `TRUNCATE` sobre `account_events` fallan.
- La reconciliación entre `orders` y `account_events` da 0 diferencias.
- Una orden de acciones con `size` fraccionario insertada directo en la base es rechazada por el `CHECK`.

## Opciones evaluadas

### Representación del estado

| Opción | Veredicto | Motivo |
|---|---|---|
| **Saldos derivados de `orders` + historial inmutable** | ✅ Elegida | Cumple el enunciado, tiene una sola fuente de verdad y un historial listo para publicar eventos y migrar a event sourcing. |
| Tablas de saldos como fuente de verdad | ❌ Descartada | Dos fuentes de verdad que pueden divergir, y contradice el cálculo desde `orders.size`. |
| Solo `orders`, sin historial | ❌ Descartada | Pierde la historia de cada orden y no deja base para publicar eventos ni migrar. |
| Event sourcing desde el MVP | ❌ Descartada | Reconstruir el estado desde eventos en cada pedido, sin consumidores ni requisitos que lo justifiquen. |
| Auditoría con triggers sobre `orders` | ❌ Descartada | Registra cambios de filas, no hechos de negocio: no dice quién pidió la cancelación ni guarda el motivo del rechazo como parte del hecho. |
| Outbox separado del historial | ❌ Descartada | Dos tablas casi idénticas escritas en la misma transacción. |

### Concurrencia e idempotencia

| Opción | Veredicto | Motivo |
|---|---|---|
| **`FOR UPDATE` sobre el usuario, con la clave revisada dentro del bloqueo** | ✅ Elegida | Predecible, valida que la cuenta exista en la misma consulta y evita que dos reintentos simultáneos pasen la revisión a la vez. |
| Aislamiento `SERIALIZABLE` | ❌ Descartada | Resuelve conflictos abortando transacciones, lo que obliga a reintentar en todos los comandos. |
| Solo concurrencia optimista | ❌ Descartada | Requiere reintentos en cada comando sin beneficio mientras el estado salga de `orders`. Queda como barrera adicional. |
| Advisory locks | ⚠️ Viable | Equivalentes en efecto, pero no bloquean una fila real ni validan que el usuario exista. |
| Tabla `idempotency_keys` con la respuesta y vencimiento | ⚠️ Viable | Es la solución general cuando la respuesta no es un recurso guardado. Acá la respuesta siempre es una orden ya guardada, así que duplicaría datos. |

### Datos semilla

| Opción | Veredicto | Motivo |
|---|---|---|
| **Un `LegacyOrderImported` por orden, con su estado final** | ✅ Elegida | Historial completo sin inventar datos. |
| Inventar los pasos intermedios | ❌ Descartada | Inventaría fechas y secuencias que no existen. |
| No cargarlos | ❌ Descartada | El historial quedaría incompleto y la reconciliación sería imposible. |

### Cantidades con centavos

| Opción | Veredicto | Motivo |
|---|---|---|
| **`size` a `NUMERIC(18,2)`, escala en el dominio** | ✅ Elegida | Corrige la causa y mantiene el significado de `size` y el cálculo del enunciado. |
| Efectivo en centavos (`price = 0.01`) | ❌ Descartada | `size` tendría dos significados según la fila, y `Σ size (CASH_IN)` dejaría de dar pesos. |
| Columna nueva `orders.amount` | ❌ Descartada | El monto quedaría en dos columnas y el efectivo dejaría de calcularse desde `size`. |
| Ledger de movimientos separado | ❌ Por ahora | Es el modelo correcto cuando una operación tiene varios efectos en pesos, pero hoy ningún caso lo requiere. |
| Escala en `instruments.quantity_scale` | ❌ Por ahora | Hoy coincide 1 a 1 con el tipo de instrumento y podría contradecirlo. |

### Esquema y evolución

| Opción | Veredicto | Motivo |
|---|---|---|
| **Cambios aditivos o ampliaciones compatibles** | ✅ Elegida | Permite corregir `size` sin romper datos ni consultas. |
| Solo cambios aditivos | ❌ Descartada | Impediría corregir `size` salvo con soluciones que dejan deuda. |
| Rediseño del esquema | ❌ Descartada | Rompe la referencia del challenge sin beneficio funcional. |
| Saldos precalculados en una vista materializada | ❌ Descartada | Se recalcula entera y cada cierto tiempo: el disponible podría quedar desactualizado. Por eso la evolución prevista es una tabla actualizada en la misma transacción. |

## Consecuencias

### Beneficios

- **Integridad del dinero:** ni doble gasto con pedidos simultáneos ni órdenes duplicadas por reintentos.
- **Historial inmutable garantizado por la base,** no por convención.
- **Transferencias con centavos** sin cambiar el modelo del enunciado.

### Limitaciones aceptadas (trade-offs)

- **Dos escrituras por pedido** (`orders` y `account_events`) que tienen que coincidir. Se mitiga con un único punto de escritura y con la reconciliación como test y métrica.
- **Los pedidos de un mismo usuario no corren en paralelo.** Se monitorea el tiempo de espera del bloqueo.
- **Cada pedido recalcula los saldos leyendo todas las órdenes del usuario,** con la cuenta bloqueada. El costo crece con el historial, y la tabla de saldos (punto 7) lo resuelve cuando haga falta.
- **Ampliar `size` reescribe la tabla con un bloqueo exclusivo.** Con los datos del challenge es instantáneo, pero con volumen habría que planificarlo.
- **Dos columnas de idempotencia** que no son datos del negocio, con claves que no vencen.
- **El `CHECK` de acciones enteras depende del side, no del instrumento.** Vale mientras solo `ARS` admita decimales.
