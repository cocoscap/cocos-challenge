# ADR-0004 — Reglas de negocio: reservas, rendimiento, anomalías, precios, transferencias, simulación y búsqueda

| | |
|---|---|
| **Estado** | PROPUESTO |
| **Autores** | Mayra Urquiza |
| **Decisores** | Mayra Urquiza |
| **Última actualización** | 17 nov 2026 |
| **Relacionado** | [RFC-001](../rfc/RFC-001-api-portfolio-busqueda-ordenes.md) · [ADR-0002](ADR-0002-arquitectura-y-patrones-de-dominio.md) · [ADR-0003](ADR-0003-persistencia-consistencia-y-cantidades.md) · [ADR-0005](ADR-0005-contrato-de-la-api.md) |

## Contexto

El [enunciado](../../backend-challenge.md) define las reglas principales, pero deja abiertas varias que cambian los números que ve el usuario o lo que puede hacer, y los [datos semilla](../../database.sql) muestran que no son ambigüedades teóricas. Son decisiones de **interpretación del negocio**: cambiarían si producto redefine una regla, no por motivos técnicos.

## Decisiones

### 1. Las órdenes `LIMIT` pendientes reservan recursos

**Por qué:** el enunciado no dice si una orden `NEW` compromete pesos o acciones. Si no los comprometiera, el usuario podría dejar varias `LIMIT` pendientes con el mismo dinero, y si el mercado las ejecutara, sus pesos quedarían negativos. El usuario 1 tiene dos compras pendientes por 125.500 pesos.

- Una `BUY LIMIT` en `NEW` reserva `size × price` pesos, y una `SELL LIMIT` en `NEW` reserva `size` acciones.
- Toda compra, venta o retiro de pesos se valida contra lo **disponible**: pesos menos reservados, o tenencia menos acciones reservadas.
- La reserva se libera al cancelar la orden, o se convierte en movimiento real al ejecutarse.
- Los pesos reservados **siguen sumando al valor total**, porque siguen siendo del usuario.

### 2. El rendimiento se mide sobre el costo promedio ponderado

**Por qué:** el enunciado pide el "rendimiento total (%)" por posición, pero no define contra qué precio de compra se mide. El costo promedio es lo que usa el [challenge de frontend](../../frontend-challenge.md) (`avg_cost_price`) y solo requiere cantidad y promedio por instrumento.

- Los movimientos `FILLED` de cada instrumento se recorren por `(datetime, id)`:
  - Una compra recalcula el promedio con `avg_nuevo = (qty_anterior × avg_anterior + size × price) / (qty_anterior + size)`, y la cantidad pasa a `qty_anterior + size`.
  - Una venta reduce la cantidad sin cambiar el promedio, porque no cambia lo que costaron las acciones que quedan.
  - Si la cantidad llega a 0, el promedio se reinicia.
- Ejemplo: con 10 acciones a un promedio de 100, una compra de 10 a 200 deja 20 acciones a `(10 × 100 + 10 × 200) / 20 = 150`. Si después vende 5, quedan 15 a 150.
- **Ganancia** = `qty × último close − qty × avg`. **Rendimiento total** = `ganancia / (qty × avg) × 100`.
- Mide **solo lo no realizado**, es decir, las acciones que el usuario todavía tiene. Lo ganado o perdido en ventas anteriores no se incluye.
- Con tenencia negativa, costo promedio, ganancia y rendimiento quedan en `null`.
- El **retorno diario**, `(close − previousClose) / previousClose × 100`, se muestra como dato informativo.

### 3. Las anomalías se muestran con un aviso

**Por qué:** los datos semilla tienen inconsistencias reales: el usuario 1 tiene −10 BMA, y `PGR` e `IRCP` no tienen precios. Ocultarlas distorsiona el valor de la cuenta, y corregirlas reescribiría un ledger que es inmutable ([ADR-0003](ADR-0003-persistencia-consistencia-y-cantidades.md)). Con un aviso, el cliente puede advertir al usuario.

| Aviso | Condición | Efecto |
|---|---|---|
| `NEGATIVE_QUANTITY` | La tenencia es negativa. | Se muestra tal cual y **suma al valor total**, que así refleja el ledger. Ocultarla inflaría la cuenta del usuario 1 en 15.028 pesos. |
| `NO_MARKET_PRICE` | El instrumento no tiene precios. | Precio, valor de mercado, ganancia y rendimiento en `null`. **No suma** al valor total, para no inventarle un valor. |

- Cada posición tiene su lista `warnings`, y el portfolio reúne en un `warnings` general los avisos de sus posiciones. Si incluye `NO_MARKET_PRICE`, el valor total está incompleto.
- Cada anomalía se registra también en el log.
- Una venta sobre tenencia negativa se rechaza siempre.
- Si hiciera falta corregir un dato, se haría con un movimiento compensatorio explícito, decidido por operaciones.
- Las posiciones con tenencia 0 no se listan.

### 4. Precio, cantidad y rechazos de una orden

**Por qué:** el enunciado define el último `close` como el precio de una `MARKET`, aunque los precios cargados sean de julio de 2023, y no dice qué hacer con los pedidos que no cumplen una regla, como una compra por un monto que no alcanza para una acción.

- **`MARKET`** usa el último `close` cargado, sin controlar su antigüedad.
- **`LIMIT`** usa el precio informado y **se acepta aunque el instrumento no tenga precios cargados**.
- **Por monto**, `size` es la mayor cantidad de acciones enteras que alcanza: `amount / precio`, truncado.
- **Rechazos:** la orden se guarda como `REJECTED` con su motivo ([ADR-0005](ADR-0005-contrato-de-la-api.md)). Cuando un dato no existe se guarda `NULL`, no `0`.

  | Motivo | Condición | `price` guardado | `size` guardado |
  |---|---|---|---|
  | `NO_MARKET_PRICE` | `MARKET` sobre un instrumento sin precios | `NULL` | El enviado, o `NULL` si se envió `amount` |
  | `ZERO_QUANTITY` | El `amount` no alcanza para una acción | El resuelto | `0` |
  | `INSUFFICIENT_FUNDS` | Compra: `size × precio` supera los pesos disponibles | El resuelto | El calculado |
  | `INSUFFICIENT_HOLDINGS` | Venta: `size` supera las acciones disponibles | El resuelto | El calculado |

- Operar `ARS` como orden no es un rechazo de negocio, sino un request inválido.

### 5. Las transferencias de pesos se registran por API

**Por qué:** el enunciado dice que se pueden modelar como órdenes, pero no pide cómo crearlas. Sin ellas, los usuarios 2 a 4 no tienen pesos y no pueden operar, y los tests dependerían de cargar datos directo en la base.

- Registran movimientos **ya confirmados** por el sistema de transferencias, con una ruta propia ([ADR-0005](ADR-0005-contrato-de-la-api.md)).
- Se guardan como orden sobre `ARS`, resuelto por tipo y ticker: `side = type`, `size = amount`, `price = 1`, `type = MARKET`.
- `CASH_IN` queda siempre `FILLED`.
- `CASH_OUT` queda `FILLED` si `amount` no supera los pesos disponibles. Si los supera, queda `REJECTED` con `INSUFFICIENT_FUNDS`.

### 6. La ejecución de una `LIMIT` se puede simular, solo para pruebas

**Por qué:** el enunciado no pide simular el mercado, pero sin alguna forma de ejecutar una `LIMIT` no se puede probar qué pasa cuando se ejecuta: que la reserva se convierta en gasto real y que se actualicen el portfolio y el historial.

- La simulación ([ADR-0005](ADR-0005-contrato-de-la-api.md)) pasa una orden `NEW` a `FILLED` **al precio límite y por la cantidad completa**.
- **No vuelve a validar fondos ni tenencias**, porque ya estaban reservados desde que se creó la orden.
- Queda fuera de alcance ejecutar automáticamente cuando el precio alcanza el límite, ejecutar parcialmente o a un precio mejor.

### 7. La búsqueda ignora mayúsculas y tildes

**Por qué:** el enunciado pide buscar por ticker o nombre, sin definir cómo coinciden ni en qué orden se devuelven. Los nombres tienen tildes ("Río", "Compañía") que un usuario no siempre escribe.

- Busca el texto como parte del ticker o del nombre, **sin distinguir mayúsculas ni tildes**: "rio" encuentra "Molinos Río de la Plata".
- `%` y `_` se buscan como caracteres comunes, no como comodines.
- Primero devuelve el ticker exacto, después los tickers que empiezan con el texto y después el resto, ordenados por ticker.
- Excluye `ARS`, que no es operable. Cada resultado trae su último precio y su retorno diario, si existen.

### Cómo se verifica

- El portfolio del usuario 1 da 753.000 pesos, 125.500 reservados, 627.500 disponibles y 889.756 de valor total, con `NEGATIVE_QUANTITY` en BMA.
- Una compra que supera lo disponible, aunque no supere los pesos totales, queda `REJECTED`.
- Al ejecutar en simulación una compra `LIMIT`, los reservados bajan, los pesos bajan por el mismo monto y la tenencia sube.
- La búsqueda "rio" encuentra "Molinos Río de la Plata", y "%" no devuelve todos los instrumentos.

## Opciones evaluadas

| Tema | Elegida | Descartadas |
|---|---|---|
| Órdenes `LIMIT` pendientes | **Reservar recursos** | No reservar: permite comprometer varias veces el mismo dinero. |
| Base del rendimiento | **Costo promedio ponderado** | FIFO por lotes (más complejo de calcular y no es lo que piden las fuentes). Solo retorno diario (no dice cuánto se ganó con la posición). |
| Anomalías | **Mostrar con aviso** | Mostrar sin aviso (el cliente no puede advertir al usuario). Ocultar (infla el valor de la cuenta). Corregir (reescribe un ledger inmutable). |
| Precios viejos | **Usar el último cargado** | Rechazar órdenes con precios de más de N días: con los datos del challenge, ninguna `MARKET` podría ejecutarse. |
| Transferencias | **Registrarlas por API** | Asumirlas cargadas por otro sistema: solo el usuario 1 podría operar. |
| Ejecución de `LIMIT` | **Simulación manual, apagada por defecto** | Motor que ejecuta según el precio (exige que la API cargue precios, cambia el valor de todos los portfolios y es "simular el mercado", que el enunciado excluye). Sin simulación (el paso de `NEW` a `FILLED` queda sin probar). |
| Tildes en la búsqueda | **Ignorarlas** | Distinguirlas: "rio" no encontraría "Río". |

## Consecuencias

### Beneficios

- **Nadie puede comprometer dos veces el mismo dinero ni las mismas acciones.**
- **Los datos anómalos quedan a la vista,** sin alterar el ledger.
- **Todos los estados de una orden se pueden probar,** con cualquier cuenta.

### Limitaciones aceptadas (trade-offs)

- **El disponible es menor que el total** cuando hay `LIMIT` pendientes. El portfolio muestra `total`, `reserved` y `available` para que se entienda la diferencia.
- **El rendimiento no incluye ganancias realizadas** ni conserva el costo de cada compra.
- **Los clientes deben manejar `warnings`.** Uno que los ignore mostrará cantidades negativas o totales incompletos sin contexto.
- **Una `MARKET` puede ejecutarse a un precio de hace años,** porque no se controla la antigüedad.
- **La ruta de transferencias no verifica quién la llama.** En producción solo debería llamarla el sistema de transferencias ([ADR-0005](ADR-0005-contrato-de-la-api.md)).
- **La simulación ejecuta sin mirar el mercado.** Sirve para probar el efecto de una ejecución, no si el mercado la habría ejecutado.
