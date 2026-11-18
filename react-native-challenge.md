# cocos-challenge-react_native

**Resumen:**
Desarrollar una App que permita visualizar la informacion obtenida en los siguientes endpoints
- **/instruments**: La pantalla deberá mostrar el listado de instrumentos obtenidos por este endpoint. Mostrar ticker, nombre, ultimo precio y retorno (calculado usando el ultimo precio y el precio de cierre que devuelve el mismo endpoint)
- **/portfolio**: La pantalla deberá mostrar el listado de activos que devuelve el endpoint. Para cada uno de ellos mostrar el ticker, la cantidad de la posicion, el valor de mercado, la ganancia y rendimiento total  (user el `avg_cost_price` como valor de compra)
- **/search**: Desarrollar un buscador de activos por ticker.
- **/orders**: Al hacer click en algun instrumento mostrar un modal con un formulario para enviar una orden (el metodo es un POST). Un usuario deberia poder definir si es una orden de compra o venta (`BUY` o `SELL`), el tipo de orden es `MARKET` o `LIMIT`, la cantidad de acciones a enviar y, solo si el tipo de orden es LIMIT, el precio a enviar. La respuesta del POST va a tener un `id` y un `status`. Mostrar el id y status que devolvió. (Abajo hay un ejemplo de los parametro a enviar en el body del post)

# Consideraciones funcionales
- Los precios de los activos estan en pesos.
- Cuando un usuario envía una orden, es necesario enviar la cantidad de acciones que quiere comprar o vender. Permitir al usuario enviar la cantidad de acciones exactas o un monto total de inversión en pesos (en este caso, calcular la cantidad de acciones máximas que puede enviar utilizando el ultimos precio, no se admiten fracciones de acciones).
- Las ordenes tienen distintos estados (status):
    - **`PENDING`** - una orden `LIMIT` siempre se crea con este estado. Después puede pasar a `FILLED` o `REJECTED`; podés consultar el estado actualizado con `GET /orders`.
    - **`FILLED`** - cuando una orden se ejecuta. Las ordenes `MARKET` se ejecutan inmediatamente al último precio.
    - **`REJECTED`** - cuando el mercado rechaza una orden `LIMIT` que estaba pendiente.
- Cuando un usuario manda una orden de tipo `LIMIT`, el estado devuelto es `PENDING`.
- Cuando un usuario manda una orden de tipo `MARKET`, el estado devuelto es `FILLED`.
- Si una orden no cumple los requerimientos (por ejemplo, un monto mayor al cash disponible o vender más acciones de las que tenés), la API responde con un error HTTP 400 y un mensaje, sin `id` ni `status`. Mostrale el error al usuario.
- Para calcular el valor de mercado de una posicion del portafolio usar `quantity * last_price`. Tener en cuenta que el parametro `avg_cost_price` es el precio de compra promedio, utilizarlo para calcular la ganancia (valor absoluto $) y rendimiento (%) total.

# Consideraciones técnicas

## Production ready
- Desarrollá la aplicación como si fuera a salir a producción. Es el foco principal de la evaluación.

## Stack obligatorio
- **React Native** con **TypeScript** (modo `strict`).
- **Expo** (SDK estable más reciente). Podés usar Expo Go o un development build; aclará en el README cuál elegiste y por qué.
- **TanStack Query**.

## Testing
- **Unit tests** donde haga falta.
- Al menos un **test e2e UI-driven** corriendo en iOS Simulator o Android Emulator, con la tecnología que prefieras.
  - El test tiene que interactuar con la app solo a través de la UI, como lo haría un usuario: tocar, escribir, scrollear y leer lo que se muestra en pantalla.
  - No vale saltear pasos con deep links, llamar funciones internas, inyectar estado ni mockear la API: el test corre contra la API real.
  - Como mínimo tiene que cubrir este flujo: abrir un instrumento → completar el formulario → enviar la orden → ver el `id` y el `status` devueltos.
  - El status depende del tipo de orden, así que el test tiene que validar que se muestren un `id` y un `status`, sin depender de uno en particular.

## Entregables
- Un **README.md** con:
  - Instrucciones claras para levantar el proyecto en iOS y Android.
  - Cómo correr los unit tests y el test e2e.
  - Una sección dedicada a explicar las decisiones técnicas que tomaste.

# Datos de la api
- Las requests a `/portfolio` y `/orders` tienen que enviar el header `X-Candidate-Id: <tu-id>`. Cada candidato tiene su propio portfolio y sus propias órdenes.
- GET https://dummy-api-topaz.vercel.app/portfolio
  - Devuelve `{ cash, holdings }`. Cada candidato arranca con 1.000.000 de cash y sin posiciones.
- GET https://dummy-api-topaz.vercel.app/instruments
- GET https://dummy-api-topaz.vercel.app/search?query=DYC
- GET https://dummy-api-topaz.vercel.app/orders
  - Devuelve las órdenes enviadas por el candidato.
- POST https://dummy-api-topaz.vercel.app/orders
  ```
  Ejemplo body 1
  {
      instrument_id: 1,
      side: 'BUY',
      type: 'MARKET',
      quantity: 1234
  }
  Ejemplo body 2
  {
      instrument_id: 1,
      side: 'SELL'
      type: 'LIMIT',
      quantity: 123,
      price: 84.5
  }
  ```
