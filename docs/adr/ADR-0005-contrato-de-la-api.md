# ADR-0005 — Contrato de la API: versionado, rutas, rechazos, errores, montos e idempotencia

| | |
|---|---|
| **Estado** | PROPUESTO |
| **Autores** | Mayra Urquiza |
| **Decisores** | Mayra Urquiza |
| **Última actualización** | 17 nov 2026 |
| **Relacionado** | [RFC-001](../rfc/RFC-001-api-portfolio-busqueda-ordenes.md) · [ADR-0001](ADR-0001-stack-http-validacion-y-acceso-a-datos.md) · [ADR-0002](ADR-0002-arquitectura-y-patrones-de-dominio.md) · [ADR-0003](ADR-0003-persistencia-consistencia-y-cantidades.md) · [ADR-0004](ADR-0004-reglas-de-negocio.md) |

## Contexto

Podemos suponer que la API la consumirán aplicaciones web y móviles (el repositorio incluye los challenges de [frontend](../../frontend-challenge.md) y [react-native](../../react-native-challenge.md) como referencia). Una vez que hay clientes, cambiar el contrato es costoso, así que conviene definirlo desde el inicio.

## Decisiones

### 1. Las rutas se versionan en la URL con `/v1`

**Por qué:** la API tiene que poder evolucionar sin romper a los clientes existentes. Agregar la versión cuando ya hay clientes obliga a mantener rutas con y sin versión, mientras que hacerlo desde el inicio no cuesta nada.

- Todas las rutas de negocio llevan `/v1`, salvo `/health`, que es operativa.
- Agregar campos, valores nuevos de `warnings` o `rejectReason`, o rutas nuevas es compatible y se hace en `/v1`.
- Cambiar o quitar algo existente es incompatible y va en `/v2`, que convive con `/v1` mientras los clientes migran.
- Los clientes deben ignorar los campos y valores que no conozcan.

### 2. Un rechazo de negocio responde `201`, un request inválido responde `4xx`

**Por qué:** el enunciado pide **guardar** una orden rechazada, así que el rechazo crea un recurso y no es un error del request. Un request mal armado, en cambio, no se guarda.

| Situación | Respuesta | ¿Se guarda? |
|---|---|---|
| Orden o transferencia bien armada que no cumple una regla de negocio ([ADR-0004](ADR-0004-reglas-de-negocio.md)) | **`201`** con `status: "REJECTED"` y `rejectReason` | **Sí**, con su evento |
| Request mal armado: forma, tipos, límites o campos no declarados | `400 VALIDATION_ERROR` | No |
| Orden sobre `ARS` | `400 INSTRUMENT_NOT_TRADABLE` | No |
| Usuario, instrumento u orden inexistente, u orden de otro usuario | `404 USER_NOT_FOUND`, `INSTRUMENT_NOT_FOUND` u `ORDER_NOT_FOUND` | No |
| Cancelación o ejecución simulada de una orden que no está `NEW` | `409 ORDER_NOT_PENDING` | No |
| `Idempotency-Key` ya usada con otro request | `409 IDEMPOTENCY_KEY_REUSED` | No |
| Error inesperado | `500 INTERNAL_ERROR` | No |

### 3. Los errores tienen un `code` estable

**Por qué:** los clientes necesitan distinguir los errores (usuario inexistente, orden no pendiente, validación) sin interpretar mensajes de texto que pueden cambiar.

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "code": "VALIDATION_ERROR",
  "message": "El request no es válido",
  "details": [{ "field": "price", "message": "price es obligatorio en órdenes LIMIT" }]
}
```

- `code` no cambia, mientras que `message` es para humanos y puede cambiar. Los valores posibles de `code` están en la tabla del punto 2.
- `details` solo aparece en los errores de validación.
- El formato extiende el de Fastify (`statusCode`, `error`, `message`), así que los errores del propio framework tienen la misma forma.
- Un `500` nunca expone detalles internos, que van al log con el `correlationId`.

### 4. Montos y cantidades viajan como texto, y el request tiene límites

**Por qué:** los montos son decimales exactos en la base, pero un número JSON se lee en JavaScript como double y pierde precisión. Los límites del request evitan que un valor fuera de rango llegue a la base y termine en un error interno.

- **Respuestas:** precios, montos, porcentajes y cantidades (el `size` de una orden y la `quantity` de una posición) viajan como **string decimal**: `"925.85"`, `"-0.45"`, `"40"`. Los ids viajan como enteros.
- **Requests:** `size`, `price` y `amount` se aceptan como número, con estos límites:

  | Campo | Límite |
  |---|---|
  | `size` | Entero mayor que 0. |
  | `amount` (órdenes y transferencias) | Mayor que 0, hasta 2 decimales. |
  | `price` | Mayor que 0, hasta 2 decimales y como máximo 99.999.999,99, lo que entra en la columna. Obligatorio en `LIMIT` y prohibido en `MARKET`. |
  | `size` / `amount` | Exactamente uno de los dos. |
  | `q` (búsqueda) | Mínimo 1 carácter. |
  | `limit` / `offset` | `limit` entre 1 y 100 (20 por defecto), y `offset` mayor o igual que 0. |

- **Listas paginadas** (búsqueda y listado de órdenes): `{ "items": [...], "total": n, "limit": n, "offset": n }`. El listado de órdenes va de la más nueva a la más vieja.
- **Fechas** en ISO 8601 UTC, por ejemplo `"2026-11-17T14:02:11.000Z"`.

### 5. Todo lo que pertenece a una cuenta cuelga del usuario

**Por qué:** aunque la autenticación está fuera de alcance, el contrato tiene que permitir verificar a quién pertenece cada orden, y dar permisos distintos a quien opera (el usuario) y a quien informa transferencias (el sistema de transferencias).

- Portfolio, órdenes y transferencias cuelgan de `/v1/users/{userId}`, con el `userId` en la ruta y no en el body.
- Si una orden no es del usuario de la ruta, se responde `404 ORDER_NOT_FOUND`, sin revelar que existe. Cuando haya autenticación, alcanzará con comparar el usuario del token con el de la ruta.
- Las transferencias se **crean** por una ruta propia, separada de la de órdenes, aunque se guarden como órdenes. Así los permisos se asignan por ruta, de modo que el usuario no pueda acreditarse pesos, y cada request tiene su propio schema.
- Las transferencias se **consultan** desde el listado y el detalle de órdenes, con la misma forma que cualquier orden.

### 6. Cancelar y ejecutar son acciones con nombre

**Por qué:** cancelar y ejecutar en simulación son las únicas transiciones que se piden desde afuera. Exponerlas como acciones con nombre evita que la API permita asignar cualquier estado.

- **Cancelación:** `POST /v1/users/{userId}/orders/{orderId}/cancel`. Responde `200` con la orden actualizada.
- **Ejecución simulada:** `POST /v1/simulation/orders/{orderId}/fill`. Responde `200` con la orden actualizada.
  - Vive bajo `/v1/simulation` y no bajo el usuario, porque representa al mercado.
  - Solo existe si se activa `MARKET_SIMULATION_ENABLED`, que está apagada por defecto. Apagada, la ruta responde `404`.

### 7. Los pedidos repetidos se detectan con `Idempotency-Key`

**Por qué:** si el cliente no recibe la respuesta de un `POST` (por un timeout o un corte) y reintenta, la orden o la transferencia se registraría dos veces. En una API que mueve dinero, un duplicado es un error contable.

- El envío de órdenes y las transferencias aceptan un header opcional `Idempotency-Key`, de hasta 64 caracteres, generado por el cliente. Se recomienda un UUID por intención, reutilizado en cada reintento.
- La clave es **única por usuario** y se guarda con la orden, junto con un hash del body. Se revisa con la cuenta bloqueada, así que dos reintentos simultáneos no crean dos órdenes ([ADR-0003](ADR-0003-persistencia-consistencia-y-cantidades.md)).

  | Situación | Respuesta |
  |---|---|
  | Clave nueva | Se procesa normalmente. |
  | Clave usada, mismo body | La misma respuesta que la primera vez (`201` con la orden original), sin otra orden ni otro evento. |
  | Clave usada, otro body | `409 IDEMPOTENCY_KEY_REUSED`. |
  | Sin header | Se procesa normalmente, sin protección contra duplicados. |

- Las órdenes rechazadas también guardan su clave, así que un reintento devuelve el mismo rechazo sin volver a evaluarlo.

### Rutas resultantes

| Método | Ruta | Respuestas |
|---|---|---|
| `GET` | `/v1/users/{userId}/portfolio` | `200`, `404` |
| `GET` | `/v1/instruments?q=&limit=&offset=` | `200`, `400` |
| `POST` | `/v1/users/{userId}/orders` | `201`, `400`, `404`, `409` |
| `GET` | `/v1/users/{userId}/orders?limit=&offset=` | `200`, `404` |
| `GET` | `/v1/users/{userId}/orders/{orderId}` | `200`, `404` |
| `POST` | `/v1/users/{userId}/orders/{orderId}/cancel` | `200`, `404`, `409` |
| `POST` | `/v1/users/{userId}/transfers` | `201`, `400`, `404`, `409` |
| `POST` | `/v1/simulation/orders/{orderId}/fill` (solo con `MARKET_SIMULATION_ENABLED`) | `200`, `404`, `409` |
| `GET` | `/health` | `200`, `503` |

### Cómo se verifica

- Una orden rechazada responde `201` con `REJECTED` y queda guardada.
- Un request inválido responde `400` y no guarda nada.
- Cancelar una orden de otro usuario responde `404` y no la modifica.
- Un reintento con la misma clave devuelve la orden original, y con otro body responde `409 IDEMPOTENCY_KEY_REUSED`.
- Con la simulación apagada, su ruta responde `404`.

## Opciones evaluadas

| Tema | Elegida | Descartadas |
|---|---|---|
| Versionado | **Prefijo `/v1` en la URL** | Sin versión (agregarla después obliga a mantener ambas formas). |
| Rechazo de negocio | **`201` con `status: REJECTED`** | `422` con la orden guardada (el cliente trata como error algo que creó un recurso). `400` o `422` sin guardar (contradice el enunciado). |
| Montos | **String decimal** | Número JSON: pierde precisión en clientes JavaScript. |
| Forma de las rutas | **Recursos bajo `/v1/users/{userId}`, transferencias con ruta propia** | Transferencias en `POST .../orders` (impide asignar permisos por ruta). |
| Transiciones | **Acciones `cancel` y `fill`** | `PATCH` con `status` (sugiere que se puede asignar cualquier estado). `DELETE` (la orden cancelada se conserva). `fill` bajo el usuario (la presenta como acción del usuario). |
| Pedidos repetidos | **`Idempotency-Key` opcional** | Detectar por contenido y tiempo (comprar dos veces lo mismo puede ser legítimo). Sin protección (un timeout duplica dinero). |

## Consecuencias

### Beneficios

- **La API puede crecer sin romper clientes,** con una regla clara de qué es compatible.
- **El contrato está listo para sumar autenticación,** porque la pertenencia se verifica por ruta y las transferencias tienen permisos propios.
- **Reintentar es seguro** en todas las operaciones que mueven dinero.

### Limitaciones aceptadas (trade-offs)

- **Un `201` puede ser un rechazo,** así que los clientes deben mirar `status`. Se documenta en el OpenAPI y en la colección de requests.
- **Montos y cantidades como texto** obligan al cliente a usar una librería decimal para operar con ellos.
- **El formato de error es propio,** no estándar.
- **La idempotencia depende del cliente:** sin la clave, no hay protección.
- **La ruta de simulación debe estar apagada en producción.** Se mitiga con el valor por defecto y con un test.
