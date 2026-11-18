# API de Portfolio, búsqueda de activos y órdenes

Servicio en Node.js + TypeScript (Fastify, PostgreSQL) que resuelve el [backend challenge](backend-challenge.md): portfolio de un usuario, búsqueda de instrumentos, envío, consulta y cancelación de órdenes, y transferencias de pesos.

## Documentación

- [RFC-001](docs/rfc/RFC-001-api-portfolio-busqueda-ordenes.md): visión general de la solución. Qué se construye, por qué y qué queda fuera de alcance.
- ADRs: cada decisión con su justificación y las alternativas evaluadas.
  - [ADR-0001](docs/adr/ADR-0001-stack-http-validacion-y-acceso-a-datos.md): stack técnico (Fastify, TypeBox, Kysely) e integración continua.
  - [ADR-0002](docs/adr/ADR-0002-arquitectura-y-patrones-de-dominio.md): arquitectura hexagonal, CQRS lógico y modelo del dominio.
  - [ADR-0003](docs/adr/ADR-0003-persistencia-consistencia-y-cantidades.md): persistencia, historial contable, concurrencia, idempotencia y cambios al esquema.
  - [ADR-0004](docs/adr/ADR-0004-reglas-de-negocio.md): reglas de negocio que el enunciado deja abiertas.
  - [ADR-0005](docs/adr/ADR-0005-contrato-de-la-api.md): contrato de la API (rutas, errores, montos, versionado).
- [Glosario](docs/glossary.md): términos de negocio y técnicos.
