# ADR-0002 — Arquitectura y patrones de dominio: hexagonal, CQRS lógico, decider de Cuenta

| | |
|---|---|
| **Estado** | PROPUESTO |
| **Autores** | Mayra Urquiza |
| **Decisores** | Mayra Urquiza |
| **Última actualización** | 17 nov 2026 |
| **Relacionado** | [RFC-001](../rfc/RFC-001-api-portfolio-busqueda-ordenes.md) · [ADR-0001](ADR-0001-stack-http-validacion-y-acceso-a-datos.md) · [ADR-0003](ADR-0003-persistencia-consistencia-y-cantidades.md) · [ADR-0004](ADR-0004-reglas-de-negocio.md) · [ADR-0005](ADR-0005-contrato-de-la-api.md) |

## Contexto

El servicio mueve dinero: valida fondos y tenencias, registra órdenes y calcula el portfolio. Hay que decidir cómo se organiza el código y cómo se modela el dominio.

## Decisiones

### 1. Arquitectura hexagonal

**Por qué:** las reglas de negocio son lo más delicado del sistema y tienen que poder testearse sin base de datos ni HTTP. Además, la forma de guardar los datos puede cambiar (tabla de saldos precalculados y, eventualmente, event sourcing [ADR-0003](ADR-0003-persistencia-consistencia-y-cantidades.md)), y esos cambios no deben tocar las reglas.

**Regla de dependencias:** `infrastructure → application → domain`.

- `domain/` no importa nada externo, salvo `decimal.js` a través del value object `Money`.
- `application/` importa solo de `domain/` y de sus puertos.
- `infrastructure/` es la única capa que conoce Fastify, Kysely y PostgreSQL ([ADR-0001](ADR-0001-stack-http-validacion-y-acceso-a-datos.md)).

### 2. CQRS lógico, sin bus

**Por qué:** la escritura valida reglas de una cuenta bajo bloqueo, y la lectura arma vistas con SQL a medida, un único modelo perjudicaría a las dos. Usar la misma base mantiene la consistencia inmediata: después de una orden, el portfolio ya la refleja. No hay bus porque el puerto inbound ya desacopla al adaptador del caso de uso, y un bus solo agregaría indirección.

| | Comandos | Queries |
|---|---|---|
| Casos de uso | `PlaceOrder`, `CancelOrder`, `TransferCash`, `FillOrder` | `GetPortfolio`, `SearchInstruments`, `GetOrder`, `ListOrders` |
| Puertos de salida | `AccountRepository`, `PriceProvider` | `PortfolioReadModel`, `InstrumentSearch`, `OrderReadModel` |
| Modelo | Agregado Cuenta y su decider | Vistas con SQL a medida, el portfolio pasa por una proyección pura |
| Base de datos | La misma PostgreSQL | La misma PostgreSQL |

El adaptador HTTP llama directamente al puerto inbound. Logging y `correlationId` van en hooks de Fastify, y la transacción y el bloqueo, en el repositorio.

### 3. Dominio: la Cuenta como agregado, escrita como decider

**Por qué:** la regla central del negocio (no gastar más pesos ni vender más acciones de las disponibles) abarca todas las órdenes del usuario. Por eso lo que se valida y se guarda de forma atómica es la **Cuenta**, no cada orden por separado ([ADR-0003](ADR-0003-persistencia-consistencia-y-cantidades.md)). Escribir sus reglas como funciones puras, sin acceso a la base, permite testearlas aisladas y hace que sigan funcionando igual si el estado pasa a obtenerse de otra fuente, como la tabla de saldos o los eventos.

**Cómo se decide un pedido:**

1. El **repositorio** bloquea la cuenta y carga sus órdenes.
2. **`buildAccountState`** calcula con esas órdenes los pesos, las tenencias y las reservas.
3. **`decide`** aplica las reglas al pedido y devuelve un evento: orden aceptada, ejecutada, rechazada o cancelada.
4. El repositorio guarda la orden y su evento juntos.

El portfolio reutiliza el paso 2 y le agrega las métricas de la vista.

| Pieza | Qué hace | Por qué así |
|---|---|---|
| **Decider** (`decide` / `evolve`) | `decide` recibe el estado y un pedido, y devuelve el evento resultante. `evolve` aplica un evento al estado, y recorriendo los eventos de una cuenta en orden, la reconstruye. | Son funciones puras. `evolve` existe desde el MVP y hoy solo se usa en la reconciliación ([ADR-0003](ADR-0003-persistencia-consistencia-y-cantidades.md)). Con event sourcing pasaría a usarse en cada pedido, ya probada contra datos reales. |
| **Estado de la cuenta** (`buildAccountState`) | Único cálculo de pesos, tenencias y reservas. Lo usan la escritura y el portfolio. | El disponible que ve el usuario tiene que ser exactamente el mismo contra el que se valida. |
| **Strategies** de tipo y de side | El tipo (`MARKET` / `LIMIT`) define el precio y el estado inicial. El side (`BUY` / `SELL` / `CASH_IN` / `CASH_OUT`) define qué se valida, qué se reserva y cómo cambian los saldos. | Esa lógica la necesitan el decider, el estado de la cuenta y `evolve`: así se escribe una sola vez, y un tipo o side nuevo sin su strategy no compila. |
| **Domain service** `FinancialValidationService` | Calcula el disponible y valida si alcanza para una orden. | La validación cruza toda la cuenta con una orden puntual, así que no pertenece a la orden. La comparten tres strategies. |
| **State machine** | Única forma de cambiar el estado de una orden (ver la tabla siguiente). | Ningún caso de uso tiene que recordar qué transiciones son válidas. |
| **Repository** `AccountRepository` | Su único método, `withAccount`, encapsula la transacción completa: bloqueo, idempotencia, carga, decisión y guardado ([ADR-0003](ADR-0003-persistencia-consistencia-y-cantidades.md)). | La aplicación no maneja transacciones, y es la única pieza que cambia si cambia la persistencia. Tiene una versión en memoria para los tests. |
| **Projection** `projectPortfolio` | Arma el portfolio a partir del estado de la cuenta y agrega costo promedio, valor de mercado, ganancia, rendimientos y avisos. | El costo promedio recorre los movimientos en orden, algo difícil de leer y de testear en SQL. |

Las reglas concretas (cuánto se reserva, cuándo se rechaza, cómo se calcula el rendimiento) están en [ADR-0004](ADR-0004-reglas-de-negocio.md).

**Transiciones de estado de una orden:**

| Desde | Hacia | Cuándo |
|---|---|---|
| — | `NEW` | Orden `LIMIT` válida |
| — | `FILLED` | Orden `MARKET` válida, `CASH_IN`, o `CASH_OUT` con fondos |
| — | `REJECTED` | No cumple una regla de negocio |
| `NEW` | `CANCELLED` | El usuario la cancela |
| `NEW` | `FILLED` | Simulación de ejecución |

Cualquier otra transición es inválida y responde `409 ORDER_NOT_PENDING` ([ADR-0005](ADR-0005-contrato-de-la-api.md)).

### Cómo se verifica

| Mecanismo | Qué garantiza |
|---|---|
| **`dependency-cruiser` en CI** ([ADR-0001](ADR-0001-stack-http-validacion-y-acceso-a-datos.md)) | Falla si `domain/` importa de otra capa, si `application/` importa de `infrastructure/` o si un adaptador importa los mappers de otro. |
| **Exhaustividad en compilación** | Un tipo, side o estado nuevo sin su strategy o sus transiciones no compila. |
| **Un lugar por patrón** | Cada patrón vive en un único módulo del dominio. En code review se detecta lógica equivalente fuera de lugar. |

**Tests que verifican la decisiones:**

- La state machine se prueba con **todas** las combinaciones de estado y acción.
- `buildAccountState` y `projectPortfolio` reproducen el ejemplo del usuario 1: pesos 753.000, reservados 125.500, disponibles 627.500, valor total 889.756 y `NEGATIVE_QUANTITY` en BMA.
- Paridad: el estado que carga el repositorio y el que usa el portfolio son iguales, y `cash.available` coincide con `availableCash`.
- Los casos de uso se testean con el repositorio en memoria, sin base de datos ni HTTP.

## Opciones evaluadas

### Organización del código

| Opción | Veredicto | Motivo |
|---|---|---|
| **Hexagonal** | ✅ Elegida | Dominio testeable como funciones puras y cambios de persistencia acotados a un adaptador. |
| Capas tradicionales (controller → service → repository) | ❌ Descartada | Las reglas dependen de repositorios concretos, tienden a repartirse entre capas y cambiar la persistencia toca los services. |
| Clean Architecture completa | ❌ Descartada | Presenters y DTOs por caso de uso agregan capas que un servicio de 9 rutas no necesita. Hexagonal da la misma regla de dependencias con menos ceremonia. |

### Lectura y escritura

| Opción | Veredicto | Motivo |
|---|---|---|
| **CQRS lógico** | ✅ Elegida | Cada lado con su modelo, sobre la misma base y con consistencia inmediata. |
| Un único modelo | ❌ Descartada | Armar el portfolio con el agregado carga datos de más y mezcla invariantes de escritura con el formato de las vistas. |
| CQRS con almacenes separados | ❌ Descartada | Introduce consistencia eventual sin que el volumen lo justifique. |
| `CommandBus` / `QueryBus` | ❌ Descartada | Duplica la indirección que ya da el puerto inbound y empeora la navegación y el tipado. Se reconsidera si los comandos pasan a procesarse desde una cola. |

### Patrones de dominio

| Problema | Elegida | Descartadas |
|---|---|---|
| Ciclo de vida de la orden | **State machine con tabla tipada** | `status` asignado con `if` en cada caso de uso (sin ayuda del compilador al agregar estados). |
| Validaciones financieras | **Domain service sin estado** | Métodos en `Order` (no conoce la cuenta) o validación en los casos de uso (duplica reglas fuera del dominio). |
| Variación por tipo y side | **Strategies con registro exhaustivo** | `switch` repetido en decider, `evolve` y proyección o herencia (2 tipos × 4 sides = 8 subclases con lógica duplicada). |
| Estado de la cuenta | **Un único cálculo en el dominio** | Sumas en SQL compartidas (regla fuera del dominio, no testeable sin base, `evolve` la reimplementa). |
| Persistencia del agregado | **Un repository con `withAccount`** | Repositorios por tabla (permiten modificar órdenes sin pasar por la cuenta). |
| Portfolio | **Projector puro, calculado al leer** | Todo en SQL (costo promedio con ventanas recursivas, no testeable sin base) o tabla materializada desde el MVP (queda como evolución, [ADR-0003](ADR-0003-persistencia-consistencia-y-cantidades.md)). |

## Consecuencias

### Beneficios

- **Las reglas de negocio se testean como funciones puras,** sin base de datos ni HTTP.
- **Evolucionar la persistencia toca solo el repositorio:** el dominio y los casos de uso no cambian.
- **Lo que ve el usuario y lo que se valida no pueden diferir,** porque salen del mismo cálculo.

### Limitaciones aceptadas (trade-offs)

- **Más archivos e interfaces** que una arquitectura en capas: puertos por caso de uso y por dependencia, 6 strategies, state machine y domain service.
- **Curva de entrada:** hay que entender cómo encajan las piezas del dominio antes de modificarlo. Se mitiga con este ADR y con los tests.