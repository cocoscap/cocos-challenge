# Instrucciones para Claude

## Desarrollo con TDD

Todo cambio de comportamiento se desarrolla con TDD:

1. Escribir primero el test que describe el comportamiento y verlo fallar.
2. Escribir el código mínimo para que el test pase.
3. Mejorar el código sin romper los tests.

Al terminar cada cambio, correr la suite completa. Un cambio no está terminado, ni se commitea, si algún test falla. Si los tests no se pudieron correr, decirlo explícitamente.

## Commits

- Hacer commits a medida que avanza el desarrollo: uno por cada paso que deja los tests en verde, no uno solo al final.
- Mensajes con prefijo convencional: `feat:`, `fix:`, `test:`, `docs:`, `chore:`.
- Los commits van a nombre del usuario configurado en git, sin líneas de atribución ni de co-autoría.
- Nunca commitear `.env` ni credenciales. Antes del primer commit tiene que existir un `.gitignore` que los excluya.

## Decisiones de diseño

Las decisiones ya tomadas están en `DECISIONES.md`. Respetarlas y, si se toma una nueva, agregarla ahí con una explicación corta.
