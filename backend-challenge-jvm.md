# backend-challenge

**Resumen:**
Desarrollar una API que permita obtener la siguiente información a través de endpoints:
- **Portfolio**: La respuesta deberá devolver el valor total de la cuenta de un usuario, sus pesos disponibles para operar y el listado de activos que posee (incluyendo la cantidad de acciones, el valor total monetario de la posición ($) y el rendimiento total (%) de la posición respecto de su costo).
- **Buscar activos**: La respuesta deberá devolver el listado de activos similares a la búsqueda realizada dentro del mercado (tiene que soportar búsqueda por ticker y/o por nombre).
- **Enviar una orden al mercado**: A través de este endpoint se podrá enviar una orden de compra o venta de un activo, soportando dos tipos de órdenes: MARKET y LIMIT. Las órdenes MARKET no requieren que se envíe el precio, ya que se ejecutan con las ofertas del mercado. Por el contrario, las órdenes LIMIT requieren el envío del precio al cual el usuario quiere ejecutar la orden. La orden quedará grabada en la tabla `orders` con el estado y los valores correspondientes.

**Opcionales / Nice to have:**
- Proveer una colección de Postman, Insomnia o REST Client para la API y ejemplos de cómo invocarla.

# Consideraciones funcionales
- Los precios de los activos tienen que estar en pesos.
- NO hace falta simular el mercado.
- Cuando un usuario envía una orden, es necesario enviar la cantidad de acciones que quiere comprar o vender. Permitir al usuario enviar la cantidad exacta de acciones o un monto total de inversión en pesos (en este caso, calcular la cantidad máxima de acciones que puede enviar; no se admiten fracciones de acciones).
- Las órdenes tienen un atributo llamado `side` que describe si la orden es de compra (`BUY`) o de venta (`SELL`).
- Las órdenes tienen distintos estados (`status`):
    - `NEW` - cuando una orden límite es enviada al mercado, se envía con este estado.
    - `FILLED` - cuando una orden se ejecuta. Las órdenes MARKET se ejecutan inmediatamente al ser enviadas.
    - `REJECTED` - cuando la orden es rechazada por el mercado porque no cumple con los requerimientos, por ejemplo, cuando se envía una orden por un monto mayor al disponible.
    - `CANCELLED` - cuando la orden es cancelada por el usuario.
- Cuando un usuario envía una orden de tipo MARKET, la orden se ejecuta inmediatamente y su estado es `FILLED`.
- Cuando un usuario envía una orden de tipo LIMIT, el estado de la orden tiene que ser `NEW`.
- Solo se pueden cancelar las órdenes con estado `NEW`.
- Si la orden enviada es por un monto mayor al disponible, tiene que ser rechazada y guardarse en estado `REJECTED`. Tener en cuenta ambos casos: en la compra, validar que el usuario tenga los pesos suficientes; en la venta, validar que tenga las acciones suficientes.
- Las transferencias entrantes y salientes se pueden modelar como órdenes. Las transferencias entrantes tienen side `CASH_IN` y las salientes, side `CASH_OUT`.
- Cuando una orden es ejecutada, se tiene que actualizar el listado de posiciones del usuario.
- Para calcular la tenencia y los pesos disponibles, utilizar todos los movimientos pertinentes de la tabla `orders`, usando la columna `size`.
- El cash (ARS) está modelado como un instrumento de tipo `MONEDA`.
- En la tabla `marketdata` se encuentran los precios de los últimos 2 días de los instrumentos. `close` es el último precio de cada activo y `previousClose` es el precio de cierre del día anterior.
- Cuando se envía una orden de tipo MARKET, utilizar el último precio (`close`).
- Para calcular el valor de mercado, el rendimiento y la cantidad de acciones de cada posición, usar las órdenes en estado `FILLED` de cada activo.

# Consideraciones técnicas
- Desarrollar la aplicación utilizando Java (17 o superior) o Kotlin.
  - Para la API REST, utilizar el framework que prefieras (por ejemplo, Spring Boot, Quarkus o Micronaut).
  - Elegir alguna estrategia o librería para el acceso a datos. Es posible utilizar un ORM o ejecutar consultas directamente.
  - Utilizar Maven o Gradle como herramienta de build.
  - Utilizar cualquier librería que se crea conveniente.
- Implementar tests sobre la funcionalidad de enviar una orden, incluyendo al menos un test de integración contra la base de datos.
- NO es necesario implementar autenticación de usuarios.
- Documentá cualquier suposición o decisión de diseño que consideres relevante, junto con las instrucciones para levantar la aplicación.

# Base de datos
Como referencia, ya hemos creado una base de datos con las siguientes tablas y algunos datos (archivo `database.sql`):
- **users**: id, email, accountNumber
- **instruments**: id, ticker, name, type
- **orders**: id, instrumentId, userId, side, size, price, type, status, datetime
- **marketdata**: id, instrumentId, high, low, open, close, previousClose, datetime

La base de datos provista es un modelo funcional que sirve tal como está, aunque es una implementación básica. El candidato tiene la libertad de modificar, agregar o ajustar tablas según lo considere necesario para mejorar la performance del código, optimizar consultas o por cualquier otra razón técnica relevante. Es importante justificar adecuadamente cualquier cambio en la documentación.
