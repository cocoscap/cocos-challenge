# Spec Delta

## Purpose

Permite buscar activos operables del mercado por ticker o por nombre, y devuelve para cada resultado su último precio y su retorno diario.

## ADDED Requirements

### Requirement: Búsqueda por ticker o nombre
El sistema MUST exponer `GET /instruments?q=<texto>`, que responde 200 con la lista de instrumentos cuyo ticker o cuyo nombre contiene el texto buscado. Si no hay coincidencias MUST responder 200 con una lista vacía.

#### Scenario: Búsqueda por ticker
- **WHEN** se busca `q=PAMP`
- **THEN** la respuesta es 200 y contiene el instrumento PAMP

#### Scenario: Búsqueda por nombre
- **WHEN** se busca `q=molinos` con los datos de `database.sql`
- **THEN** la respuesta contiene MOLA, MOLI y SEMI

#### Scenario: Búsqueda por parte del ticker
- **WHEN** se busca `q=GG`
- **THEN** la respuesta contiene GGAL

#### Scenario: Sin coincidencias
- **WHEN** se busca un texto que no aparece en ningún ticker ni nombre
- **THEN** la respuesta es 200 con una lista vacía

### Requirement: Búsqueda sin distinguir mayúsculas ni acentos
El sistema MUST comparar el texto buscado con el ticker y el nombre sin distinguir mayúsculas de minúsculas ni vocales con y sin acento, y tratando la `ñ` como `n`.

#### Scenario: Minúsculas contra un ticker en mayúsculas
- **WHEN** se busca `q=ggal`
- **THEN** la respuesta contiene GGAL

#### Scenario: Texto sin acento ni eñe
- **WHEN** se busca `q=compania` con los datos de `database.sql`
- **THEN** la respuesta contiene INTR, cuyo nombre es "Compañía Introductora de Buenos Aires S.A."

#### Scenario: Texto con acento contra un nombre con acento
- **WHEN** se busca `q=zorraquín`
- **THEN** la respuesta contiene GARO

### Requirement: Orden de los resultados
El sistema MUST devolver primero el instrumento cuyo ticker coincide exactamente con el texto buscado, si existe, y después el resto de los resultados ordenados por ticker.

#### Scenario: Ticker exacto primero
- **WHEN** se busca `q=MOLI` con los datos de `database.sql`
- **THEN** los resultados son MOLI, MOLA y SEMI, en ese orden

#### Scenario: Sin ticker exacto
- **WHEN** se busca `q=molinos` con los datos de `database.sql`
- **THEN** los resultados son MOLA, MOLI y SEMI, en ese orden

### Requirement: Límite de resultados
El sistema MUST limitar la cantidad de resultados con el parámetro opcional `limit`, que por defecto vale 20 y acepta enteros entre 1 y 100. Si `limit` no es un entero dentro de ese rango, MUST responder 400.

#### Scenario: Límite por defecto
- **WHEN** se busca un texto con más de 20 coincidencias sin enviar `limit`
- **THEN** la respuesta contiene 20 resultados

#### Scenario: Límite explícito
- **WHEN** se busca un texto con más de 5 coincidencias con `limit=5`
- **THEN** la respuesta contiene 5 resultados

#### Scenario: Límite fuera de rango
- **WHEN** se busca con `limit=0` o con `limit=101`
- **THEN** la respuesta es 400

### Requirement: Solo activos operables
El sistema MUST excluir de los resultados los instrumentos de tipo `MONEDA`.

#### Scenario: Búsqueda del peso por ticker
- **WHEN** se busca `q=ARS`
- **THEN** la respuesta no contiene el instrumento ARS

#### Scenario: Búsqueda del peso por nombre
- **WHEN** se busca `q=pesos`
- **THEN** la respuesta no contiene el instrumento ARS

### Requirement: Datos de mercado en cada resultado
El sistema MUST devolver por cada resultado `id`, `ticker`, `name`, `type`, `lastPrice` y `dailyReturnPct`. `lastPrice` es el `close` del registro de `marketdata` más reciente del instrumento y `dailyReturnPct` se calcula con `close` y `previousClose` de ese registro. Si el instrumento no tiene registros en `marketdata`, ambos MUST ser `null`.

#### Scenario: Instrumento con precio
- **WHEN** se busca `q=PAMP` con los datos de `database.sql`
- **THEN** el resultado PAMP tiene `lastPrice` 925.85 y `dailyReturnPct` 0.44

#### Scenario: Instrumento sin precio
- **WHEN** se busca `q=PGR` con los datos de `database.sql`
- **THEN** el resultado PGR tiene `lastPrice` y `dailyReturnPct` en `null`

### Requirement: Texto de búsqueda obligatorio
El sistema MUST responder 400 cuando falta el parámetro `q` o cuando queda vacío después de quitarle los espacios de los extremos.

#### Scenario: Sin parámetro
- **WHEN** se llama a `GET /instruments` sin `q`
- **THEN** la respuesta es 400

#### Scenario: Solo espacios
- **WHEN** se busca con `q` formado solo por espacios
- **THEN** la respuesta es 400
