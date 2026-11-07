# Cocos Challenge: Backend

API REST para consultar el portfolio de un usuario, buscar activos y enviar órdenes al mercado.

- El enunciado está en [backend-challenge.md](backend-challenge.md).
- Las decisiones de diseño y los supuestos están en [DECISIONES.md](DECISIONES.md).

## Requisitos

- Node.js 20.19 o superior. Se desarrolló con Node 24.
- Una base Postgres con las tablas y los datos de [database.sql](database.sql).

## Configuración

1. Instalar las dependencias:

   ```bash
   npm install
   ```

2. Copiar `.env.example` como `.env` y completar los datos de conexión:

   | Variable | Descripción | Por defecto |
   |---|---|---|
   | `DB_HOST` | Host de Postgres | Obligatoria |
   | `DB_PORT` | Puerto de Postgres | `5432` |
   | `DB_USER` | Usuario | Obligatoria |
   | `DB_PASSWORD` | Contraseña | Vacía |
   | `DB_NAME` | Nombre de la base | Obligatoria |
   | `DB_SSL` | `true` si el servidor exige SSL; se verifica su certificado | `false` |
   | `PORT` | Puerto de la API | `3000` |

   Si falta una variable obligatoria, la app no arranca e indica cuál es.

La API no crea ni modifica tablas: usa el schema de `database.sql` tal como está.

## Uso

En desarrollo, con recarga automática:

```bash
npm run dev
```

Compilada:

```bash
npm run build
npm start
```

La API queda disponible en `http://localhost:3000`.

## Tests

```bash
npm test
```

Hay tests unitarios, que no necesitan la base, y tests de integración, que usan la base configurada en `.env`. Cada test de integración corre dentro de una transacción que se deshace al terminar, así que no dejan datos.

## Ejemplos de uso

- [api.http](api.http): pedidos listos para ejecutar desde VS Code (extensión REST Client) o desde un IDE de JetBrains.
- [postman/cocos-backend-api.postman_collection.json](postman/cocos-backend-api.postman_collection.json): colección para importar en Postman. La variable `baseUrl` apunta a `http://localhost:3000`.

## Endpoints

Todas las respuestas son JSON. Los montos, los precios y los porcentajes son números con dos decimales, y un valor que no se puede calcular va en `null`.

### `GET /users/:userId/portfolio`

Devuelve el valor total de la cuenta, los pesos y las posiciones de un usuario.

```bash
curl http://localhost:3000/users/1/portfolio
```

```json
{
  "userId": 1,
  "totalAccountValue": 904784,
  "cash": { "total": 753000, "reserved": 125500, "available": 627500 },
  "positions": [
    {
      "instrumentId": 54,
      "ticker": "METR",
      "name": "MetroGAS S.A.",
      "quantity": 500,
      "lastPrice": 229.5,
      "marketValue": 114750,
      "averagePrice": 250,
      "totalReturnPct": -8.2,
      "dailyReturnPct": -1.08
    },
    {
      "instrumentId": 47,
      "ticker": "PAMP",
      "name": "Pampa Holding S.A.",
      "quantity": 40,
      "lastPrice": 925.85,
      "marketValue": 37034,
      "averagePrice": 930,
      "totalReturnPct": -0.45,
      "dailyReturnPct": 0.44
    }
  ]
}
```

| Campo | Descripción |
|---|---|
| `totalAccountValue` | Pesos totales más el valor de mercado de las posiciones |
| `cash.total` | Pesos del usuario según sus órdenes ejecutadas |
| `cash.reserved` | Pesos comprometidos por compras pendientes |
| `cash.available` | Pesos disponibles para operar: `total − reserved` |
| `positions[].quantity` | Acciones en cartera |
| `positions[].lastPrice` | Último `close` del activo |
| `positions[].marketValue` | `quantity × lastPrice` |
| `positions[].averagePrice` | Precio promedio de compra |
| `positions[].totalReturnPct` | Rendimiento del último precio contra el precio promedio, en % |
| `positions[].dailyReturnPct` | Retorno del día (`close` contra `previousClose`), en % |

Solo se listan los activos con cantidad mayor a cero, ordenados por ticker.

| Error | Cuándo |
|---|---|
| `400 VALIDATION_ERROR` | `userId` no es un entero positivo |
| `404 USER_NOT_FOUND` | El usuario no existe |

### `GET /instruments?q=<texto>`

Busca activos por ticker o por nombre, sin distinguir mayúsculas ni acentos. Cada resultado trae su último precio y su retorno diario.

| Parámetro | Descripción | Por defecto |
|---|---|---|
| `q` | Texto a buscar en el ticker o en el nombre | Obligatorio |
| `limit` | Cantidad máxima de resultados, entre 1 y 100 | `20` |

```bash
curl "http://localhost:3000/instruments?q=molinos"
```

```json
[
  { "id": 4, "ticker": "MOLA", "name": "Molinos Agro S.A.", "type": "ACCIONES", "lastPrice": 6640, "dailyReturnPct": 0.28 },
  { "id": 42, "ticker": "MOLI", "name": "Molinos Río de la Plata", "type": "ACCIONES", "lastPrice": 648.5, "dailyReturnPct": -1.37 },
  { "id": 17, "ticker": "SEMI", "name": "Molinos Juan Semino", "type": "ACCIONES", "lastPrice": 57.2, "dailyReturnPct": 7.52 }
]
```

- Si el texto coincide exactamente con un ticker, ese activo va primero; el resto se ordena por ticker.
- El peso (`ARS`) no aparece: es efectivo, no un activo operable.
- Un activo sin precios cargados trae `lastPrice` y `dailyReturnPct` en `null`.
- Si no hay coincidencias, responde `200` con una lista vacía.

| Error | Cuándo |
|---|---|
| `400 VALIDATION_ERROR` | Falta `q`, está vacío, o `limit` no es un entero entre 1 y 100 |

### `POST /orders`

Envía una orden de compra o de venta, o un movimiento de efectivo. La orden queda grabada en la tabla `orders`.

**Compra o venta**

| Campo | Descripción |
|---|---|
| `userId` | Id del usuario |
| `instrumentId` | Id del activo; se obtiene con la búsqueda |
| `side` | `BUY` o `SELL` |
| `type` | `MARKET` o `LIMIT` |
| `size` | Cantidad de acciones. Se envía `size` o `amount`, nunca los dos |
| `amount` | Monto en pesos. La API calcula la cantidad entera de acciones que ese monto alcanza a cubrir |
| `price` | Precio límite. Obligatorio en `LIMIT`; no se envía en `MARKET` |

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{ "userId": 2, "instrumentId": 47, "side": "BUY", "type": "MARKET", "size": 10 }'
```

```json
{
  "id": 12,
  "userId": 2,
  "instrumentId": 47,
  "side": "BUY",
  "type": "MARKET",
  "size": 10,
  "price": 925.85,
  "status": "FILLED",
  "datetime": "2024-03-01T15:04:05.000Z"
}
```

- Una orden `MARKET` usa el último `close` del activo; una `LIMIT`, el `price` enviado.
- Con `amount`, la cantidad es la parte entera de `amount / precio`. Por ejemplo, $10.000 a $925,85 son 10 acciones.

**Movimiento de efectivo**

Un depósito (`CASH_IN`) o un retiro (`CASH_OUT`) lleva solo `userId`, `side` y `size`, que es el monto en pesos sin centavos. Se graba sobre el instrumento `ARS`, con precio 1.

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{ "userId": 2, "side": "CASH_IN", "size": 100000 }'
```

**Estado de la orden**

Cuando la orden se graba, la respuesta es `201` y el campo `status` indica cómo quedó:

| `status` | Cuándo |
|---|---|
| `FILLED` | Orden `MARKET` o movimiento de efectivo aceptado: se ejecuta al instante |
| `NEW` | Orden `LIMIT` aceptada: queda pendiente y reserva los pesos (compra) o las acciones (venta) |
| `REJECTED` | El usuario no tiene pesos o acciones disponibles suficientes. La orden se graba igual |

Una orden `REJECTED` suma el campo `rejectionReason`: `INSUFFICIENT_FUNDS` si faltan pesos o `INSUFFICIENT_HOLDINGS` si faltan acciones.

**Pedidos que no se graban**

| Error | Cuándo |
|---|---|
| `400 VALIDATION_ERROR` | Faltan campos, tienen valores inválidos o no corresponden al tipo de orden |
| `400 INSTRUMENT_NOT_TRADABLE` | Se intenta comprar o vender el peso (`ARS`) |
| `404 USER_NOT_FOUND` | El usuario no existe |
| `404 INSTRUMENT_NOT_FOUND` | El instrumento no existe |
| `422 NO_MARKET_PRICE` | Orden `MARKET` sobre un activo sin precios cargados; admite `LIMIT` |
| `422 AMOUNT_TOO_SMALL` | El monto no alcanza para una acción |

### Formato de los errores

Todos los errores tienen la misma forma. Los de validación suman `details`, con el campo y el motivo de cada problema.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos enviados no son válidos",
    "details": [{ "field": "userId", "message": "Debe ser un entero positivo" }]
  }
}
```
