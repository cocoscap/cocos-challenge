# Decisiones de diseño

Decisiones técnicas y supuestos tomados donde el enunciado deja libertad o es ambiguo.
Los ejemplos usan al usuario 1 con los datos de `database.sql`.

## Tecnologías

| Tema | Elección | Por qué |
|---|---|---|
| Lenguaje | TypeScript en modo estricto | Tipa órdenes, estados y montos, y detecta errores antes de ejecutar |
| Framework | Express 5 | Son pocos endpoints; mantiene el código simple y a la vista |
| Acceso a datos | TypeORM | Mapea las tablas existentes a entidades con nombres legibles y maneja las transacciones |
| Validación de entrada | zod | Las reglas de cada pedido quedan en un esquema y devuelven el error 400 solas |
| Decimales | decimal.js | Evita errores de punto flotante en saldos y porcentajes |
| Tests | Jest, ts-jest y supertest | supertest llama a la API por HTTP; ts-jest maneja los decoradores de TypeORM sin configuración extra |
| Ejemplos de uso | Colección de Postman y archivo `.http` | Postman es lo más difundido; el `.http` se ejecuta desde el editor |
| Paquetes y ejecución | npm, `tsx` en desarrollo y `tsc` para compilar | Herramientas estándar con Node 24 |

### Cómo se usa TypeORM

- Las entidades mapean las cuatro tablas existentes y se usan para las escrituras simples.
- Las consultas más elaboradas, que son el último precio de cada instrumento y la búsqueda de activos, se escriben en SQL.
- `synchronize` queda desactivado y no hay migraciones, porque la base es provista y no se modifica.

### Estructura del código

- Una carpeta por funcionalidad: portfolio, búsqueda de activos y órdenes.
- Los cálculos (saldo, precio promedio, rendimiento) son funciones puras, sin acceso a la base, para poder testearlos rápido.
- La configuración sale de variables de entorno que se validan al arrancar: si falta una credencial, la app falla con un mensaje claro.

### Tests

- El test funcional es de integración: llama a la API por HTTP contra un Postgres real.
- Cada test corre dentro de una transacción que se deshace al terminar, para no dejar datos en la base provista.

## Portfolio

### Las posiciones se calculan desde `orders`

No hay una tabla de posiciones. La cantidad de acciones, el valor de cada posición y los pesos se calculan en cada consulta a partir de las órdenes.

Es lo que indica el enunciado y evita mantener dos fuentes de datos que puedan quedar desincronizadas: cuando se graba una orden ejecutada, el portfolio ya la refleja.

El cálculo es una sola función, sin acceso a la base, que recibe las órdenes ejecutadas y pendientes del usuario y devuelve sus pesos y sus tenencias. La usan tanto el portfolio como la validación de una orden nueva, así que nunca pueden dar resultados distintos.

### Las órdenes pendientes reservan saldo

Una orden LIMIT en estado `NEW` todavía no se ejecutó, pero compromete fondos:

- Una compra pendiente reserva pesos (`size × price`).
- Una venta pendiente reserva acciones.

Sin esta reserva, un usuario podría enviar órdenes pendientes por mucho más de lo que tiene.

El portfolio informa los pesos totales y los disponibles para operar. Para el usuario 1 son $753.000 totales, $125.500 reservados y $627.500 disponibles. El valor total de la cuenta usa los pesos totales, porque lo reservado sigue siendo del usuario.

### Solo se listan posiciones con cantidad mayor a cero

Los datos de ejemplo tienen una inconsistencia: la orden 11 vende 30 acciones de BMA cuando el usuario solo había comprado 20, y la posición queda en −10.

La API no permite vender más de lo que se tiene, así que se trata como un error de los datos: esa posición no se lista ni se suma al valor de la cuenta. Los datos originales no se modificaron.

### Rendimiento total y retorno diario

- **Rendimiento total (%)**: compara el último precio (`close`) con el precio promedio de compra de la posición: `(close − precio promedio) / precio promedio × 100`.
- **Retorno diario (%)**: compara `close` con `previousClose`. Se informa como un dato aparte, en las posiciones y en la búsqueda de activos.

El precio promedio es el promedio de las compras ponderado por cantidad, recorriendo las órdenes en orden cronológico. Las ventas reducen la cantidad, pero no cambian el promedio. Si la posición se cierra, el promedio vuelve a empezar con la siguiente compra.

Ejemplo: PAMP se compró a $930 y cierra a $925,85, así que su rendimiento total es −0,45 %.

### Orden y activos sin precio

- Las posiciones se devuelven ordenadas por ticker, para que la respuesta sea siempre la misma.
- Si un activo en cartera no tiene precios cargados, se lista igual, con el precio, el valor y los rendimientos vacíos, y no suma al valor de la cuenta.

## Búsqueda de activos

- Un único parámetro `q` busca a la vez en el ticker y en el nombre, sin distinguir mayúsculas ni acentos.
- Si el texto coincide exactamente con un ticker, ese resultado va primero; el resto se ordena por ticker.
- `q` es obligatorio: sin texto de búsqueda la API responde 400 en lugar de listar todos los activos.
- La cantidad de resultados tiene un límite: 20 por defecto y hasta 100 con el parámetro `limit`.
- La comparación sin acentos usa funciones estándar de Postgres, sin instalar extensiones.
- El peso (`ARS`) no aparece: es efectivo, no un activo que se pueda operar.
- PGR e IRCP no tienen precios cargados, así que aparecen con el precio vacío.

## Órdenes

### Qué se graba como `REJECTED` y qué es un error

| Situación | Respuesta | ¿Se graba la orden? |
|---|---|---|
| Datos inválidos o incompletos | 400 | No |
| El usuario o el instrumento no existen | 404 | No |
| No alcanzan los pesos o las acciones disponibles | 201 con estado `REJECTED` | Sí |
| Orden MARKET válida | 201 con estado `FILLED` | Sí |
| Orden LIMIT válida | 201 con estado `NEW` | Sí |

Solo se graba como `REJECTED` una orden bien formada que el usuario no puede cubrir. Un pedido mal armado es un error de quien llama a la API, no una orden.

El precio de una orden MARKET es el último `close`; el de una LIMIT es el que se envía. Si se envía un monto en pesos en lugar de una cantidad, la cantidad es `floor(monto / precio)`.

Una orden `REJECTED` devuelve el motivo en el campo `rejectionReason` (`INSUFFICIENT_FUNDS` o `INSUFFICIENT_HOLDINGS`). El motivo viaja solo en la respuesta: la tabla no tiene dónde guardarlo y no se modifica.

La fecha y hora de la orden las asigna la API al grabarla.

### Cancelación de órdenes

Hay un endpoint para cancelar órdenes, `POST /orders/:orderId/cancel`. Solo se pueden cancelar las que están en `NEW`; en cualquier otro estado responde 409.

El enunciado no lo lista entre los endpoints, pero sin él el estado `CANCELLED` sería inalcanzable. Al cancelar, el saldo que la orden tenía reservado queda liberado.

### Depósitos y retiros

`CASH_IN` y `CASH_OUT` se envían por el mismo endpoint que las compras y las ventas, con el formato de los datos de ejemplo: instrumento `ARS`, `size` igual al monto en pesos y `price` igual a 1.

Esto permite cargar saldo a los usuarios que no tienen movimientos (2, 3 y 4) y probar la API de punta a punta.

El pedido lleva solo `userId`, `side` y `size`; el instrumento, el tipo y el precio los completa la API. Un depósito se ejecuta siempre, y un retiro por más de lo disponible se graba como `REJECTED`, igual que una compra.

### Órdenes simultáneas

Antes de validar una orden, la API toma un lock por usuario dentro de la transacción (un advisory lock de Postgres). Así dos órdenes simultáneas del mismo usuario se procesan de a una y la segunda ya ve a la primera. El lock no bloquea filas ni requiere permisos sobre las tablas.

### Otros casos

| Caso | Qué pasa |
|---|---|
| Se envían cantidad (`size`) y monto (`amount`) a la vez, o ninguno de los dos | Error 400 |
| El monto no alcanza para comprar una acción | Error 422, no se graba la orden |
| Se envía un monto en una venta | Funciona igual que en una compra |
| Se intenta comprar o vender `ARS` | Error 400 |
| Orden MARKET con precio | Error 400, para que nadie crea que se respetó ese precio |
| Orden MARKET sobre un instrumento sin precio (PGR, IRCP) | Error 422, no se graba la orden |
| Orden LIMIT que podría ejecutarse al precio actual | Queda en `NEW` igual, porque no se simula el mercado |
| Dos órdenes simultáneas del mismo usuario | Se procesan de a una, para que no gasten el mismo saldo |

## Identificación del usuario

No hay autenticación, así que el id del usuario viaja en cada pedido:

- **Portfolio**: en la ruta, `GET /users/:userId/portfolio`. El portfolio pertenece a un usuario y un `GET` no lleva body.
- **Órdenes**: en el body, como `userId`. Es un dato más de la orden, igual que el instrumento.
- **Cancelación**: alcanza con el id de la orden.

## Base de datos

Se usa el servidor Postgres provisto para el challenge, sin Docker. Las credenciales van en un archivo `.env` en la raíz del proyecto, que no debe subirse al repositorio.

### No se modifica el schema

La API funciona sobre las tablas tal como vienen: no agrega índices, constraints ni extensiones.

Se prefirió usar la base original tal como se entrega. Además, con el volumen de datos del challenge esos cambios no hacen falta, y las validaciones se hacen en la API.

### Verificación del acceso

Antes de escribir código se revisó la base provista con consultas de solo lectura:

- Es Postgres 18, con las cuatro tablas y las mismas columnas que `database.sql`.
- Los datos coinciden con `database.sql`: 4 usuarios, 66 instrumentos, 126 precios y 11 órdenes.
- El usuario de conexión puede leer y escribir en las cuatro tablas. La API solo escribe en `orders`.

Mejoras identificadas, para aplicar en una base propia:

- Índice en `orders (userid, status)`: el portfolio y cada validación recorren las órdenes del usuario.
- `UNIQUE (instrumentid, date)` en `marketdata`: acelera la búsqueda del último precio y evita dos cierres el mismo día.
- `UNIQUE (ticker)` en `instruments`: evita tickers duplicados.
