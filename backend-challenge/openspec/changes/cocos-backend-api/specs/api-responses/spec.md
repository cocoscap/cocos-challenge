# Spec Delta

## Purpose

Define las convenciones que comparten todos los endpoints de la API: cómo se informan los errores y cómo se representan los montos, los precios, los porcentajes y las cantidades.

## ADDED Requirements

### Requirement: Formato único de error
El sistema MUST responder todo error con un cuerpo JSON de la forma `{ "error": { "code", "message" } }`, donde `code` es un identificador estable en mayúsculas y `message` es un texto legible. En los errores de validación MUST incluir además `details`, con el campo y el motivo de cada problema.

#### Scenario: Error de validación
- **WHEN** un pedido llega con un campo inválido
- **THEN** la respuesta es 400 con `error.code` `VALIDATION_ERROR`, un `error.message` y un `error.details` que nombra el campo inválido

#### Scenario: Cuerpo que no es JSON válido
- **WHEN** se envía a `POST /orders` un cuerpo que no se puede interpretar como JSON
- **THEN** la respuesta es 400 con `error.code` `VALIDATION_ERROR`

#### Scenario: Recurso inexistente
- **WHEN** se consulta el portfolio de un usuario que no existe
- **THEN** la respuesta es 404 con `error.code` `USER_NOT_FOUND` y un `error.message`

#### Scenario: Ruta inexistente
- **WHEN** se llama a una ruta que la API no define
- **THEN** la respuesta es 404 con `error.code` `NOT_FOUND`

### Requirement: Errores inesperados sin detalles internos
El sistema MUST responder 500 con `error.code` `INTERNAL_ERROR` ante cualquier fallo no previsto, y MUST NOT incluir en la respuesta trazas, consultas SQL ni datos de conexión.

#### Scenario: Fallo no previsto
- **WHEN** ocurre un error no previsto mientras se atiende un pedido
- **THEN** la respuesta es 500 con `error.code` `INTERNAL_ERROR` y un mensaje genérico, sin trazas ni detalles internos

### Requirement: Formato de los valores numéricos
El sistema MUST devolver los montos, los precios y los porcentajes como números JSON redondeados a dos decimales, con el redondeo que lleva el medio hacia arriba en valor absoluto, y las cantidades de acciones como enteros. Un valor que no se puede calcular MUST devolverse como `null`.

#### Scenario: Redondeo de un porcentaje
- **WHEN** un rendimiento calculado es -0.4462 %
- **THEN** se devuelve -0.45

#### Scenario: Monto sin centavos
- **WHEN** los pesos totales calculados son 753000
- **THEN** se devuelve el número 753000, no un texto

#### Scenario: Valor que no se puede calcular
- **WHEN** un instrumento no tiene precio de mercado
- **THEN** su `lastPrice` se devuelve como `null`
