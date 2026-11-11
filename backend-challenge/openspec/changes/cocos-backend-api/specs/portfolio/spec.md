# Spec Delta

## Purpose

Permite consultar el portfolio de un usuario: el valor total de su cuenta, sus pesos y el listado de activos que posee, cada uno con su cantidad, su valor de mercado y su rendimiento.

## ADDED Requirements

### Requirement: Consulta del portfolio de un usuario
El sistema MUST exponer `GET /users/:userId/portfolio`, que responde 200 con `userId`, `totalAccountValue`, `cash` y `positions`. Si el usuario no existe MUST responder 404 con el código `USER_NOT_FOUND`, y si `userId` no es un entero positivo MUST responder 400.

#### Scenario: Usuario existente
- **WHEN** se consulta el portfolio de un usuario que existe
- **THEN** la respuesta es 200 e incluye `userId`, `totalAccountValue`, `cash` y `positions`

#### Scenario: Usuario sin movimientos
- **WHEN** se consulta el portfolio de un usuario que existe y no tiene órdenes
- **THEN** la respuesta es 200 con `totalAccountValue` en 0, los tres valores de `cash` en 0 y `positions` vacío

#### Scenario: Usuario inexistente
- **WHEN** se consulta el portfolio de un `userId` que no existe
- **THEN** la respuesta es 404 con el código `USER_NOT_FOUND`

#### Scenario: Identificador inválido
- **WHEN** se consulta el portfolio con `userId` igual a `abc`
- **THEN** la respuesta es 400

### Requirement: Pesos del portfolio
El sistema MUST informar en `cash` los pesos totales (`total`), los reservados por órdenes pendientes (`reserved`) y los disponibles para operar (`available`), calculados según la capability `account-balance`.

#### Scenario: Pesos del usuario 1
- **WHEN** se consulta el portfolio del usuario 1 con los datos de `database.sql`
- **THEN** `cash.total` es 753000.00, `cash.reserved` es 125500.00 y `cash.available` es 627500.00

### Requirement: Listado de posiciones
El sistema MUST listar en `positions` solo los instrumentos que no son de tipo `MONEDA` y en los que el usuario tiene una tenencia mayor a cero, ordenados por ticker. Cada posición MUST incluir `instrumentId`, `ticker`, `name`, `quantity`, `lastPrice`, `marketValue`, `averagePrice`, `totalReturnPct` y `dailyReturnPct`.

#### Scenario: Posiciones del usuario 1
- **WHEN** se consulta el portfolio del usuario 1 con los datos de `database.sql`
- **THEN** `positions` contiene METR con `quantity` 500 y PAMP con `quantity` 40, en ese orden

#### Scenario: Tenencia negativa
- **WHEN** el usuario tiene una tenencia de -10 BMA
- **THEN** BMA no aparece en `positions`

#### Scenario: Posición cerrada
- **WHEN** el usuario compró 10 acciones de un instrumento y después vendió las 10
- **THEN** ese instrumento no aparece en `positions`

#### Scenario: El efectivo no es una posición
- **WHEN** el usuario tiene movimientos `CASH_IN` sobre el instrumento ARS
- **THEN** ARS no aparece en `positions`

### Requirement: Valor de mercado de una posición
El sistema MUST calcular `marketValue` como `quantity` por `lastPrice`, donde `lastPrice` es el `close` del registro de `marketdata` más reciente del instrumento. Si el instrumento no tiene registros en `marketdata`, `lastPrice`, `marketValue`, `totalReturnPct` y `dailyReturnPct` MUST ser `null`.

#### Scenario: Posición con precio
- **WHEN** el usuario tiene 40 PAMP y el último `close` de PAMP es 925.85
- **THEN** `lastPrice` es 925.85 y `marketValue` es 37034.00

#### Scenario: Posición sin precio
- **WHEN** el usuario tiene una tenencia positiva en un instrumento sin registros en `marketdata`
- **THEN** la posición se lista con `lastPrice`, `marketValue`, `totalReturnPct` y `dailyReturnPct` en `null`

### Requirement: Precio promedio de compra
El sistema MUST calcular `averagePrice` como el promedio ponderado por cantidad de las compras `FILLED` del instrumento, recorridas en orden cronológico. Las ventas MUST NOT modificar el promedio. Si la tenencia llega a cero o menos, el promedio MUST reiniciarse con la siguiente compra.

#### Scenario: Dos compras a distinto precio
- **WHEN** el usuario compró 10 acciones a 100 y después 30 acciones a 200
- **THEN** `averagePrice` es 175.00

#### Scenario: Una venta no cambia el promedio
- **WHEN** el usuario compró 50 PAMP a 930 y después vendió 10 PAMP a 940
- **THEN** `averagePrice` es 930.00

#### Scenario: Posición cerrada y reabierta
- **WHEN** el usuario compró 10 acciones a 100, vendió las 10 y después compró 5 a 200
- **THEN** `averagePrice` es 200.00

### Requirement: Rendimiento total de una posición
El sistema MUST calcular `totalReturnPct` como `(lastPrice − averagePrice) / averagePrice × 100`.

#### Scenario: Rendimiento de PAMP
- **WHEN** `averagePrice` es 930.00 y `lastPrice` es 925.85
- **THEN** `totalReturnPct` es -0.45

#### Scenario: Rendimiento de METR
- **WHEN** `averagePrice` es 250.00 y `lastPrice` es 229.50
- **THEN** `totalReturnPct` es -8.20

### Requirement: Retorno diario de una posición
El sistema MUST calcular `dailyReturnPct` como `(close − previousClose) / previousClose × 100`, con los valores del registro de `marketdata` más reciente del instrumento. Si `previousClose` falta o es cero, `dailyReturnPct` MUST ser `null`.

#### Scenario: Retorno diario de PAMP
- **WHEN** el último registro de PAMP tiene `close` 925.85 y `previousClose` 921.80
- **THEN** `dailyReturnPct` es 0.44

#### Scenario: Sin cierre anterior
- **WHEN** el último registro del instrumento no tiene `previousClose`
- **THEN** `dailyReturnPct` es `null`

### Requirement: Valor total de la cuenta
El sistema MUST calcular `totalAccountValue` como los pesos totales más la suma de `marketValue` de las posiciones listadas que tienen precio. Los pesos reservados MUST contarse dentro del valor total.

#### Scenario: Valor de la cuenta del usuario 1
- **WHEN** se consulta el portfolio del usuario 1 con los datos de `database.sql`
- **THEN** `totalAccountValue` es 904784.00

#### Scenario: Una orden pendiente no cambia el valor de la cuenta
- **WHEN** el usuario envía una compra `LIMIT` que queda en estado `NEW`
- **THEN** `totalAccountValue` no cambia y `cash.available` disminuye
