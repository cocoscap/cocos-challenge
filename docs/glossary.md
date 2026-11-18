# Glosario

Términos que usan el RFC y los ADRs de este repositorio. Las definiciones explican qué significa cada término. Las reglas y decisiones de diseño están en el ADR enlazado.

## Negocio

| Término | Definición |
|---|---|
| **Instrumento** (activo) | Algo que el usuario puede tener: una acción (`ACCIONES`) o pesos argentinos (`MONEDA`). |
| **Ticker** | Código corto y único de un instrumento, por ejemplo `PAMP` o `ARS`. |
| **Pesos** (`ARS`) | El dinero del usuario, modelado como un instrumento más, con precio 1. |
| **Último precio** (`close`) | Precio de cierre del día más reciente cargado para un instrumento. Se usa para ejecutar órdenes `MARKET` y para valuar posiciones. |
| **Retorno diario** | Variación porcentual del último precio respecto del cierre anterior (`previousClose`). |
| **Orden** | Pedido del usuario sobre un instrumento: comprar, vender, ingresar o retirar pesos. La tabla `orders` guarda el estado actual de cada una. |
| **Side** | Qué pide la orden: `BUY`, `SELL`, `CASH_IN` (ingreso de pesos) o `CASH_OUT` (retiro de pesos). |
| **`MARKET` / `LIMIT`** | `MARKET` se ejecuta al instante, al último precio. `LIMIT` fija un precio y queda pendiente. |
| **Size** | Cantidad de la orden: acciones enteras, o pesos con hasta 2 decimales en `CASH_IN` y `CASH_OUT`. |
| **Compra por monto** | El usuario indica cuántos pesos quiere invertir y se calcula la mayor cantidad de acciones enteras que alcanza. |
| **Status** | Estado de la orden: `NEW` (pendiente), `FILLED` (ejecutada), `REJECTED` (rechazada, se guarda igual) o `CANCELLED` (cancelada). Solo una orden `NEW` puede cambiar de estado ([ADR-0002](adr/ADR-0002-arquitectura-y-patrones-de-dominio.md)). |
| **Motivo de rechazo** (`rejectReason`) | Por qué se rechazó una orden ([ADR-0004](adr/ADR-0004-reglas-de-negocio.md)). |
| **Movimiento** | Orden ejecutada, vista por su efecto en los pesos o las tenencias del usuario. |
| **Tenencia** (posición) | Cantidad de un instrumento que tiene el usuario, según sus compras y ventas ejecutadas. |
| **Reserva** | Pesos o acciones comprometidos por una orden `LIMIT` pendiente ([ADR-0004](adr/ADR-0004-reglas-de-negocio.md)). |
| **Disponible** | Pesos o acciones menos lo reservado. Es contra lo que se valida una orden nueva. |
| **Costo promedio** | Precio promedio que el usuario pagó por las acciones que todavía tiene ([ADR-0004](adr/ADR-0004-reglas-de-negocio.md)). |
| **Ganancia / Rendimiento total** | Diferencia entre lo que vale hoy una posición y lo que costó, en pesos y en porcentaje ([ADR-0004](adr/ADR-0004-reglas-de-negocio.md)). |
| **Valor total** | Todos los pesos del usuario, incluidos los reservados, más el valor de mercado de sus posiciones con precio. |
| **Warning** | Aviso de una anomalía en el portfolio: `NEGATIVE_QUANTITY` o `NO_MARKET_PRICE` ([ADR-0004](adr/ADR-0004-reglas-de-negocio.md)). |

## Técnico

| Término | Definición |
|---|---|
| **CI** | Integración continua: proceso que corre los tests y las verificaciones en cada cambio subido al repositorio ([ADR-0001](adr/ADR-0001-stack-http-validacion-y-acceso-a-datos.md)). |
| **ORM** | Librería que mapea tablas a objetos. No se usa: se eligió un query builder ([ADR-0001](adr/ADR-0001-stack-http-validacion-y-acceso-a-datos.md)). |
| **OpenAPI** | Especificación estándar que describe una API. Se genera desde los schemas de las rutas. |
| **p95** | Tiempo de respuesta que cumple el 95 % de los pedidos. |
| **Arquitectura hexagonal** | El dominio define interfaces (puertos), y la tecnología (HTTP, base de datos) se conecta mediante implementaciones de esas interfaces (adaptadores) ([ADR-0002](adr/ADR-0002-arquitectura-y-patrones-de-dominio.md)). |
| **CQRS lógico** | Caminos separados en el código para modificar y para consultar, sobre la misma base de datos ([ADR-0002](adr/ADR-0002-arquitectura-y-patrones-de-dominio.md)). |
| **Agregado** | Conjunto de datos que se valida y se guarda como una unidad. Acá, la Cuenta del usuario ([ADR-0002](adr/ADR-0002-arquitectura-y-patrones-de-dominio.md)). |
| **Decider** | Forma de escribir el dominio con dos funciones puras: `decide`, que devuelve el evento que produce un pedido, y `evolve`, que aplica un evento al estado ([ADR-0002](adr/ADR-0002-arquitectura-y-patrones-de-dominio.md)). |
| **Proyección** | Vista armada a partir de los movimientos, como el portfolio. |
| **Ledger** | Libro contable: el conjunto de órdenes del que se derivan los saldos. |
| **Historial contable** (`account_events`) | Registro inmutable de cada cambio en una cuenta, en el orden en que ocurrió ([ADR-0003](adr/ADR-0003-persistencia-consistencia-y-cantidades.md)). |
| **Stream / Secuencia** | Los eventos de una cuenta, y la posición de cada uno dentro de ellos. |
| **Reconciliación** | Comparación entre el estado reconstruido desde el historial y el que sale de `orders`. Tiene que dar 0 diferencias ([ADR-0003](adr/ADR-0003-persistencia-consistencia-y-cantidades.md)). |
| **Outbox** | Tabla con los eventos a publicar hacia otros sistemas, escrita en la misma transacción que el cambio. `account_events` puede cumplir ese rol. |
| **Event sourcing** | Obtener el estado reproduciendo los eventos, en lugar de guardarlo ([ADR-0003](adr/ADR-0003-persistencia-consistencia-y-cantidades.md)). |
| **Concurrencia optimista** | Detectar los conflictos al escribir y reintentar, en lugar de bloquear antes. |
| **Tabla de saldos precalculados** | Evolución prevista para no recalcular los saldos desde todas las órdenes en cada pedido ([ADR-0003](adr/ADR-0003-persistencia-consistencia-y-cantidades.md)). |
| **Clave de idempotencia** (`Idempotency-Key`) | Clave que envía el cliente para que un reintento no cree una orden duplicada ([ADR-0005](adr/ADR-0005-contrato-de-la-api.md)). |
| **Simulación de ejecución** | Ruta solo para pruebas que ejecuta una orden `LIMIT` pendiente ([ADR-0004](adr/ADR-0004-reglas-de-negocio.md)). |
