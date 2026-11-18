# Spec Delta

## Purpose

Permite enviar órdenes de compra y venta al mercado y movimientos de efectivo, define con qué precio, cantidad y estado queda grabada cada orden en la tabla `orders`, y permite cancelar las órdenes que siguen pendientes.

## ADDED Requirements

### Requirement: Envío de órdenes de compra y venta
El sistema MUST exponer `POST /orders`, que recibe `userId`, `instrumentId`, `side` (`BUY` o `SELL`), `type` (`MARKET` o `LIMIT`), `size` o `amount`, y `price` cuando el tipo es `LIMIT`. Cuando la orden se graba MUST responder 201 con `id`, `userId`, `instrumentId`, `side`, `type`, `size`, `price`, `status` y `datetime`.

#### Scenario: Compra a mercado por cantidad
- **WHEN** un usuario con pesos suficientes envía `side` `BUY`, `type` `MARKET` y `size` 10 sobre PAMP
- **THEN** la respuesta es 201 y contiene la orden grabada, con su `id`, `size` 10 y `status` `FILLED`

#### Scenario: Venta límite por cantidad
- **WHEN** un usuario con 40 PAMP disponibles envía `side` `SELL`, `type` `LIMIT`, `size` 10 y `price` 950
- **THEN** la respuesta es 201 y contiene la orden grabada con `price` 950.00 y `status` `NEW`

### Requirement: Validación del pedido de una orden
El sistema MUST responder 400 con el código `VALIDATION_ERROR`, sin grabar ninguna orden, cuando el pedido no cumple estas reglas: los campos obligatorios están presentes y tienen valores permitidos; se envía exactamente uno entre `size` y `amount`; `size` es un entero positivo; `amount` y `price` son positivos con hasta dos decimales; `price` se envía si el tipo es `LIMIT` y no se envía si es `MARKET`.

#### Scenario: Cantidad y monto a la vez
- **WHEN** el pedido incluye `size` y `amount`
- **THEN** la respuesta es 400 con el código `VALIDATION_ERROR` y no se graba ninguna orden

#### Scenario: Ni cantidad ni monto
- **WHEN** el pedido no incluye `size` ni `amount`
- **THEN** la respuesta es 400 con el código `VALIDATION_ERROR`

#### Scenario: Cantidad con fracciones
- **WHEN** el pedido incluye `size` 1.5
- **THEN** la respuesta es 400 con el código `VALIDATION_ERROR`

#### Scenario: Orden límite sin precio
- **WHEN** el pedido tiene `type` `LIMIT` y no incluye `price`
- **THEN** la respuesta es 400 con el código `VALIDATION_ERROR`

#### Scenario: Orden a mercado con precio
- **WHEN** el pedido tiene `type` `MARKET` e incluye `price`
- **THEN** la respuesta es 400 con el código `VALIDATION_ERROR`

#### Scenario: Valor no permitido
- **WHEN** el pedido tiene `side` `HOLD` o `type` `STOP`
- **THEN** la respuesta es 400 con el código `VALIDATION_ERROR`

### Requirement: Usuario e instrumento existentes
El sistema MUST responder 404, sin grabar ninguna orden, cuando el `userId` o el `instrumentId` del pedido no existen, con el código `USER_NOT_FOUND` o `INSTRUMENT_NOT_FOUND` según corresponda.

#### Scenario: Usuario inexistente
- **WHEN** el pedido tiene un `userId` que no existe
- **THEN** la respuesta es 404 con el código `USER_NOT_FOUND` y no se graba ninguna orden

#### Scenario: Instrumento inexistente
- **WHEN** el pedido tiene un `instrumentId` que no existe
- **THEN** la respuesta es 404 con el código `INSTRUMENT_NOT_FOUND` y no se graba ninguna orden

### Requirement: Solo se operan activos
El sistema MUST responder 400 con el código `INSTRUMENT_NOT_TRADABLE`, sin grabar ninguna orden, cuando se envía una orden `BUY` o `SELL` sobre un instrumento de tipo `MONEDA`.

#### Scenario: Compra de pesos
- **WHEN** el pedido tiene `side` `BUY` y el `instrumentId` del instrumento ARS
- **THEN** la respuesta es 400 con el código `INSTRUMENT_NOT_TRADABLE` y no se graba ninguna orden

### Requirement: Precio de la orden
El sistema MUST grabar las órdenes `MARKET` con el `close` del registro de `marketdata` más reciente del instrumento, y las órdenes `LIMIT` con el `price` enviado. Si el instrumento de una orden `MARKET` no tiene registros en `marketdata`, MUST responder 422 con el código `NO_MARKET_PRICE` sin grabar ninguna orden.

#### Scenario: Precio de una orden a mercado
- **WHEN** se envía una orden `MARKET` sobre PAMP y el último `close` de PAMP es 925.85
- **THEN** la orden se graba con `price` 925.85

#### Scenario: Precio de una orden límite
- **WHEN** se envía una orden `LIMIT` con `price` 900
- **THEN** la orden se graba con `price` 900.00

#### Scenario: Orden a mercado sin precio de mercado
- **WHEN** se envía una orden `MARKET` sobre PGR, que no tiene registros en `marketdata`
- **THEN** la respuesta es 422 con el código `NO_MARKET_PRICE` y no se graba ninguna orden

### Requirement: Cantidad a partir de un monto
Cuando el pedido trae `amount` en lugar de `size`, el sistema MUST calcular la cantidad como la parte entera de `amount / precio de la orden`, tanto en compras como en ventas. Si el resultado es cero, MUST responder 422 con el código `AMOUNT_TOO_SMALL` sin grabar ninguna orden.

#### Scenario: Monto en una compra a mercado
- **WHEN** se envía una compra `MARKET` sobre PAMP con `amount` 10000 y el último `close` es 925.85
- **THEN** la orden se graba con `size` 10

#### Scenario: Monto en una orden límite
- **WHEN** se envía una orden `LIMIT` con `price` 900 y `amount` 10000
- **THEN** la orden se graba con `size` 11

#### Scenario: Monto en una venta
- **WHEN** un usuario con 40 PAMP disponibles envía una venta `MARKET` con `amount` 5000 y el último `close` es 925.85
- **THEN** la orden se graba con `size` 5

#### Scenario: Monto menor al precio de una acción
- **WHEN** se envía una compra `MARKET` sobre PAMP con `amount` 500 y el último `close` es 925.85
- **THEN** la respuesta es 422 con el código `AMOUNT_TOO_SMALL` y no se graba ninguna orden

### Requirement: Validación de fondos en las compras
El sistema MUST grabar una orden `BUY` en estado `REJECTED`, y responder 201 con `rejectionReason` `INSUFFICIENT_FUNDS`, cuando `size × price` supera los pesos disponibles del usuario según la capability `account-balance`.

#### Scenario: Compra por más de lo disponible
- **WHEN** un usuario con 1000.00 pesos disponibles envía una compra por 1500.00
- **THEN** la respuesta es 201 con `status` `REJECTED` y `rejectionReason` `INSUFFICIENT_FUNDS`, y la orden queda grabada

#### Scenario: Compra por exactamente lo disponible
- **WHEN** un usuario con 1000.00 pesos disponibles envía una compra por 1000.00
- **THEN** la orden no se rechaza

#### Scenario: Los pesos reservados no se pueden volver a usar
- **WHEN** el usuario 1 de `database.sql`, con 753000.00 pesos totales y 627500.00 disponibles, envía una compra por 700000.00
- **THEN** la orden se graba con `status` `REJECTED`

### Requirement: Validación de tenencia en las ventas
El sistema MUST grabar una orden `SELL` en estado `REJECTED`, y responder 201 con `rejectionReason` `INSUFFICIENT_HOLDINGS`, cuando `size` supera las acciones disponibles del usuario en ese instrumento según la capability `account-balance`.

#### Scenario: Venta por más de lo que tiene
- **WHEN** un usuario con 40 PAMP disponibles envía una venta de 100 PAMP
- **THEN** la respuesta es 201 con `status` `REJECTED` y `rejectionReason` `INSUFFICIENT_HOLDINGS`, y la orden queda grabada

#### Scenario: Venta de un activo que no tiene
- **WHEN** un usuario sin tenencia de GGAL envía una venta de 1 GGAL
- **THEN** la orden se graba con `status` `REJECTED`

#### Scenario: Las acciones reservadas no se pueden volver a vender
- **WHEN** un usuario con 40 PAMP y una venta `NEW` de 40 PAMP envía otra venta de 10 PAMP
- **THEN** la orden se graba con `status` `REJECTED`

### Requirement: Estado inicial de una orden aceptada
El sistema MUST grabar en estado `FILLED` las órdenes `MARKET` que pasan las validaciones y en estado `NEW` las órdenes `LIMIT` que pasan las validaciones. Una orden `LIMIT` MUST quedar en `NEW` aunque su precio permita ejecutarla al precio de mercado actual.

#### Scenario: Orden a mercado aceptada
- **WHEN** se envía una orden `MARKET` que pasa las validaciones
- **THEN** la orden se graba con `status` `FILLED`

#### Scenario: Orden límite aceptada
- **WHEN** se envía una orden `LIMIT` que pasa las validaciones
- **THEN** la orden se graba con `status` `NEW`

#### Scenario: Orden límite de compra por encima del mercado
- **WHEN** se envía una compra `LIMIT` con `price` 1000 sobre PAMP, cuyo último `close` es 925.85
- **THEN** la orden se graba con `status` `NEW`

### Requirement: Efecto de la orden en el portfolio
El sistema MUST reflejar cada orden grabada en la siguiente consulta del portfolio del usuario: una orden `FILLED` modifica los pesos totales y la posición, una orden `NEW` solo modifica los pesos o las acciones disponibles, y una orden `REJECTED` no modifica nada.

#### Scenario: Compra ejecutada
- **WHEN** un usuario compra a mercado 10 PAMP a 925.85
- **THEN** en su portfolio la cantidad de PAMP aumenta en 10 y `cash.total` disminuye en 9258.50

#### Scenario: Compra pendiente
- **WHEN** un usuario envía una compra `LIMIT` de 10 acciones a 900
- **THEN** en su portfolio `cash.available` disminuye en 9000.00, `cash.total` no cambia y sus posiciones no cambian

#### Scenario: Orden rechazada
- **WHEN** una orden se graba con `status` `REJECTED`
- **THEN** el portfolio del usuario es igual al de antes de enviarla

### Requirement: Movimientos de efectivo
El sistema MUST aceptar en `POST /orders` los movimientos `CASH_IN` y `CASH_OUT`, que reciben solo `userId`, `side` y `size` (el monto en pesos, entero positivo), y grabarlos sobre el instrumento ARS con `type` `MARKET` y `price` 1. Un `CASH_IN` MUST quedar `FILLED`. Un `CASH_OUT` MUST quedar `FILLED` si `size` no supera los pesos disponibles y `REJECTED` con `rejectionReason` `INSUFFICIENT_FUNDS` si los supera.

#### Scenario: Depósito
- **WHEN** un usuario envía `side` `CASH_IN` con `size` 100000
- **THEN** la orden se graba con `status` `FILLED`, `price` 1.00 y el instrumento ARS, y sus pesos totales aumentan en 100000.00

#### Scenario: Retiro
- **WHEN** un usuario con 100000.00 pesos disponibles envía `side` `CASH_OUT` con `size` 40000
- **THEN** la orden se graba con `status` `FILLED` y sus pesos totales disminuyen en 40000.00

#### Scenario: Retiro por más de lo disponible
- **WHEN** un usuario con 100000.00 pesos disponibles envía `side` `CASH_OUT` con `size` 150000
- **THEN** la orden se graba con `status` `REJECTED` y `rejectionReason` `INSUFFICIENT_FUNDS`

#### Scenario: Movimiento de efectivo con campos de una orden de mercado
- **WHEN** un pedido con `side` `CASH_IN` incluye `instrumentId`, `type`, `price` o `amount`
- **THEN** la respuesta es 400 con el código `VALIDATION_ERROR`

### Requirement: Órdenes simultáneas de un mismo usuario
El sistema MUST procesar de a una las órdenes de un mismo usuario, de modo que la validación de cada orden tenga en cuenta todas las órdenes de ese usuario grabadas antes.

#### Scenario: Dos compras al mismo tiempo
- **WHEN** un usuario con 1000.00 pesos disponibles envía al mismo tiempo dos compras a mercado de 600.00 cada una
- **THEN** una queda `FILLED` y la otra queda `REJECTED`

### Requirement: Cancelación de órdenes pendientes
El sistema MUST exponer `POST /orders/:orderId/cancel`, que pasa a `CANCELLED` una orden en estado `NEW` y responde 200 con la orden actualizada. Si la orden está en otro estado MUST responder 409 con el código `ORDER_NOT_CANCELLABLE` sin modificarla, y si no existe MUST responder 404 con el código `ORDER_NOT_FOUND`.

#### Scenario: Cancelar una orden pendiente
- **WHEN** se cancela una orden en estado `NEW`
- **THEN** la respuesta es 200 y la orden queda con `status` `CANCELLED`

#### Scenario: La cancelación libera lo reservado
- **WHEN** se cancela una compra `NEW` de 10 acciones a 900
- **THEN** en el portfolio del usuario `cash.available` aumenta en 9000.00

#### Scenario: Cancelar una orden ejecutada
- **WHEN** se cancela una orden en estado `FILLED`
- **THEN** la respuesta es 409 con el código `ORDER_NOT_CANCELLABLE` y la orden sigue en `FILLED`

#### Scenario: Cancelar una orden ya cancelada
- **WHEN** se cancela una orden en estado `CANCELLED`
- **THEN** la respuesta es 409 con el código `ORDER_NOT_CANCELLABLE`

#### Scenario: Cancelar una orden inexistente
- **WHEN** se cancela un `orderId` que no existe
- **THEN** la respuesta es 404 con el código `ORDER_NOT_FOUND`

#### Scenario: Identificador inválido
- **WHEN** se cancela con `orderId` igual a `abc`
- **THEN** la respuesta es 400
