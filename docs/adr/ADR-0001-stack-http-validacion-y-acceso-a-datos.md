# ADR-0001 — Stack técnico: Fastify, TypeBox y Kysely

| | |
|---|---|
| **Estado** | PROPUESTO |
| **Autores** | Mayra Urquiza |
| **Decisores** | Mayra Urquiza |
| **Última actualización** | 17 nov 2026 |
| **Relacionado** | [RFC-001](../rfc/RFC-001-api-portfolio-busqueda-ordenes.md) · [ADR-0002](ADR-0002-arquitectura-y-patrones-de-dominio.md) · [ADR-0003](ADR-0003-persistencia-consistencia-y-cantidades.md) · [ADR-0005](ADR-0005-contrato-de-la-api.md) |

## Contexto

El enunciado solicita Node.js y deja libre la elección del framework HTTP, la forma de validar y documentar requests y el acceso a datos.

## Decisiones

### 1. Fastify como framework HTTP

**Por qué:** valida y serializa con JSON Schema de forma nativa, no impone decoradores ni contenedores de dependencias al resto del código, es liviano y permite ejecutar la API en tests sin abrir un puerto, como conviene para el test funcional que pide el enunciado.

- Queda confinado a `infrastructure/adapters/inbound/http`. Las rutas se registran como plugin con `prefix: '/v1'`, y la ruta de simulación solo si `MARKET_SIMULATION_ENABLED` está activa ([ADR-0005](ADR-0005-contrato-de-la-api.md)).
- El OpenAPI se genera con `@fastify/swagger` desde los schemas de las rutas.
- Los tests funcionales usan `fastify.inject()`, que ejecuta requests contra la aplicación en memoria.

### 2. TypeBox para los schemas de request y response

**Por qué:** una única definición por ruta da el tipo TypeScript, la validación, la serialización y la documentación. Si fueran definiciones separadas, tarde o temprano dejarían de coincidir.

- Toda ruta declara schema de request y de response, así que solo se serializan los campos declarados.
- Se rechazan las propiedades no declaradas (`additionalProperties: false`): un `price` en una orden `MARKET` es un `400`, no un campo que se descarta en silencio.
- Las reglas cruzadas se expresan con uniones: `MARKET` sin `price` y `LIMIT` con `price`, `oneOf` entre `size` y `amount`.
- Los decimales se validan con aritmética decimal, no con `multipleOf` sobre un `double`.
- Un formateador propio lleva los errores de Ajv al formato de error de la API ([ADR-0005](ADR-0005-contrato-de-la-api.md)).
- TypeBox valida solo la forma del request, las reglas de negocio viven en el dominio ([ADR-0002](ADR-0002-arquitectura-y-patrones-de-dominio.md)).

### 3. Kysely como query builder tipado, sobre el driver `pg`

**Por qué:** al mover dinero, las escrituras necesitan transacciones y bloqueos explícitos, y las consultas necesitan SQL a medida para cada vista. Kysely da ese control con tipos, sin entidades ni guardados implícitos, y toma los tipos del esquema existente en lugar de redefinirlo.

- Solo se usa en infraestructura: adaptadores de salida, conexión y migraciones. El dominio y la aplicación dependen de puertos.
- Los tipos de las tablas se generan desde la base con `kysely-codegen`, así que reflejan el esquema real, con sus columnas en minúsculas.
- Cada adaptador tiene mappers explícitos de fila a dominio: renombran columnas (`instrumentid` → `instrumentId`) y convierten `NUMERIC`, que llega como `string`, a `Money` o `Quantity`. No se usa `CamelCasePlugin`, porque convierte `instrumentId` a `instrument_id`, que no coincide con las columnas reales.
- Las migraciones usan el `Migrator` de Kysely, con SQL explícito para DDL, triggers y `CHECK`.

### 4. Integración continua con GitHub Actions

**Por qué:** las verificaciones que protegen el diseño (tests, límites entre capas, tipos sincronizados con la base) solo sirven si corren siempre, sin depender de que alguien se acuerde de ejecutarlas.

En cada push y pull request se ejecutan:

- Todos los tests, con un PostgreSQL levantado como servicio.
- Las reglas de dependencias entre capas con `dependency-cruiser` ([ADR-0002](ADR-0002-arquitectura-y-patrones-de-dominio.md)).
- La verificación de que `schema.ts` está sincronizado con las migraciones: se regenera y falla si hay diferencias.

### Cómo se verifica

- El test funcional del envío de órdenes corre con `fastify.inject()`, sin abrir un puerto.
- Un request con campos no declarados, con `size` y `amount` juntos o con más de 2 decimales responde `400`.
- Los tests de integración contra PostgreSQL convierten `NUMERIC` sin pérdida de precisión.
- CI falla si `schema.ts` no coincide con las migraciones.

## Opciones evaluadas

### Framework HTTP

| Opción | Veredicto | Motivo |
|---|---|---|
| **Fastify** | ✅ Elegida | JSON Schema nativo para validar y serializar, sin decoradores ni DI, `inject()` para tests sin red y plugins oficiales de OpenAPI. |
| NestJS | ❌ Descartada | Sus módulos, decoradores y DI por reflexión atraviesan todas las capas, en contra de hexagonal. Su `CommandBus` no se usaría ([ADR-0002](ADR-0002-arquitectura-y-patrones-de-dominio.md)) y `class-validator` duplica los tipos en DTOs. |
| Express | ❌ Descartada | Sin validación, serialización ni tipado de request integrados: habría que sumar y cablear librerías. Menor rendimiento. |

### Validación y schemas

| Opción | Veredicto | Motivo |
|---|---|---|
| **TypeBox** | ✅ Elegida | Genera JSON Schema estándar y el tipo estático desde una definición. Fastify lo usa directo para validar, serializar y documentar. Su única desventaja (mensajes de Ajv poco legibles en `oneOf`) se resuelve con un formateador. |
| Zod | ❌ Descartada | Más cómodo y con mejores mensajes, pero obliga a convertir a JSON Schema en los tres puntos donde Fastify lo usa, y reemplaza el validador y el serializador optimizados. |
| JSON Schema a mano | ❌ Descartada | Los tipos TypeScript irían aparte, sin garantía de que coincidan. |
| `class-validator` | ❌ Descartada | Requiere clases con decoradores, encaja con NestJS y no genera JSON Schema. |

### Acceso a datos

| Opción | Veredicto | Motivo |
|---|---|---|
| **Kysely** | ✅ Elegida | SQL explícito y tipado, `forUpdate()`, `distinctOn()` y `returning()` nativos, sin entidades ni `save()` implícito, tipos introspectados del esquema existente, liviano. |
| Drizzle | ⚠️ Viable | Soporta lo necesario y es liviano. Se prefiere Kysely porque es solo un query builder: Drizzle trae una API relacional que habría que evitar y propone definir el esquema en TypeScript, cuando acá ya existe en SQL. |
| Prisma | ❌ Descartada | Sin `FOR UPDATE` en su API (requiere `$queryRaw` sin tipos), con un `schema.prisma` como segunda fuente de verdad, y las lecturas a medida también terminan en SQL crudo. |
| TypeORM | ❌ Descartada | Las entidades con decoradores no pueden ser el modelo de dominio, y el Unit of Work esconde qué SQL se ejecuta justo en el flujo más crítico. |
| `pg` con SQL a mano | ❌ Descartada | Sin tipado de resultados ni herramientas de migración. El tipado es una red de seguridad valiosa en código que mueve dinero. |

## Consecuencias

### Beneficios

- **Contrato único por ruta:** el schema TypeBox define tipo, validación, serialización y OpenAPI, y no pueden divergir.
- **Seguridad por defecto:** propiedades no declaradas rechazadas en la entrada y omitidas en la salida.
- **Flujo crítico visible:** el bloqueo, los inserts y los `UPDATE` condicionales se leen en el código, con tipos.
- **Infraestructura reemplazable:** Fastify, TypeBox y Kysely no salen de `infrastructure/`.
- **Tests rápidos:** funcionales con `inject()` y de dominio sin base de datos.

### Limitaciones aceptadas (trade-offs)

- **Formateador de errores de Ajv** propio, que hay que escribir y testear.
- **Mappers a mano** en cada adaptador. Es código extra, pero concentrado y cubierto por tests de integración.
- **Tipado de compilación, no de runtime:** si la base cambia sin regenerar `schema.ts`, el compilador no lo nota. Se mitiga con la verificación en CI.
- **Sin convenciones listas:** estructura, DI y logging se definen explícitamente ([ADR-0002](ADR-0002-arquitectura-y-patrones-de-dominio.md)).
- **Requiere conocer SQL y PostgreSQL.** Es una exigencia explícita del diseño.
