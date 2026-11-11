# Spec Delta

## Purpose

Define cómo se calculan, a partir de las órdenes de un usuario, sus pesos y sus tenencias de cada instrumento, distinguiendo lo que tiene, lo que está reservado por órdenes pendientes y lo que queda disponible para operar.

## ADDED Requirements

### Requirement: Pesos totales derivados de órdenes ejecutadas
El sistema MUST calcular los pesos totales de un usuario únicamente con sus órdenes en estado `FILLED`: `CASH_IN` suma su `size`, `CASH_OUT` resta su `size`, `SELL` suma `size × price` y `BUY` resta `size × price`. Las órdenes en estado `NEW`, `REJECTED` o `CANCELLED` MUST NOT modificar los pesos totales.

#### Scenario: Datos de ejemplo del usuario 1
- **WHEN** se calculan los pesos totales con las once órdenes del usuario 1 de `database.sql`
- **THEN** el resultado es 753000.00

#### Scenario: Usuario sin órdenes
- **WHEN** el usuario no tiene ninguna orden
- **THEN** sus pesos totales son 0

#### Scenario: Órdenes que no se ejecutaron
- **WHEN** el usuario tiene una compra en estado `CANCELLED` y una venta en estado `REJECTED`
- **THEN** ninguna de las dos modifica sus pesos totales

### Requirement: Tenencia derivada de órdenes ejecutadas
El sistema MUST calcular la tenencia de un usuario en un instrumento como la suma de `size` de sus órdenes `BUY` en estado `FILLED` menos la suma de `size` de sus órdenes `SELL` en estado `FILLED` sobre ese instrumento.

#### Scenario: Compra y venta parcial
- **WHEN** el usuario tiene una compra `FILLED` de 50 PAMP y una venta `FILLED` de 10 PAMP
- **THEN** su tenencia de PAMP es 40

#### Scenario: Venta ejecutada mayor a lo comprado
- **WHEN** el usuario tiene una compra `FILLED` de 20 BMA y una venta `FILLED` de 30 BMA
- **THEN** su tenencia de BMA es -10

#### Scenario: Compra pendiente no suma tenencia
- **WHEN** el usuario tiene una compra de 60 BMA en estado `NEW`
- **THEN** esa orden no modifica su tenencia de BMA

### Requirement: Reserva por órdenes pendientes
El sistema MUST considerar reservados los pesos `size × price` de cada orden `BUY` en estado `NEW` y las acciones `size` de cada orden `SELL` en estado `NEW`. Una orden MUST dejar de reservar cuando sale del estado `NEW`.

#### Scenario: Compras pendientes del usuario 1
- **WHEN** se calculan los pesos reservados con las órdenes del usuario 1 de `database.sql`, que incluyen una compra `NEW` de 50 a 710 y otra de 60 a 1500
- **THEN** los pesos reservados son 125500.00

#### Scenario: Venta pendiente reserva acciones
- **WHEN** el usuario tiene una tenencia de 40 PAMP y una venta `NEW` de 15 PAMP
- **THEN** tiene 15 PAMP reservadas

#### Scenario: Orden cancelada deja de reservar
- **WHEN** una compra `NEW` de 50 a 710 pasa a estado `CANCELLED`
- **THEN** los pesos reservados bajan en 35500.00

### Requirement: Disponible para operar
El sistema MUST calcular los pesos disponibles como los pesos totales menos los pesos reservados, y las acciones disponibles de un instrumento como la tenencia menos las acciones reservadas de ese instrumento.

#### Scenario: Pesos disponibles del usuario 1
- **WHEN** se calculan los pesos disponibles con las órdenes del usuario 1 de `database.sql`
- **THEN** el resultado es 627500.00

#### Scenario: Acciones disponibles con una venta pendiente
- **WHEN** el usuario tiene una tenencia de 40 PAMP y una venta `NEW` de 15 PAMP
- **THEN** sus acciones disponibles de PAMP son 25
