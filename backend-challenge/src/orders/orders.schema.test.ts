import { orderRequestSchema } from './orders.schema';

const marketBuy = { userId: 1, instrumentId: 47, side: 'BUY', type: 'MARKET', size: 10 };
const limitSell = { userId: 1, instrumentId: 47, side: 'SELL', type: 'LIMIT', size: 10, price: 950 };
const deposit = { userId: 2, side: 'CASH_IN', size: 100000 };

const without = <T extends object>(value: T, key: keyof T) => {
  const copy = { ...value };
  delete copy[key];
  return copy;
};

/** Campos con problemas; lista vacía si el pedido es válido. */
function invalidFields(input: unknown): string[] {
  const result = orderRequestSchema.safeParse(input);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) =>
    issue.code === 'unrecognized_keys' ? issue.keys.join(',') : issue.path.join('.'),
  );
}

describe('orderRequestSchema: compras y ventas', () => {
  it('acepta una orden MARKET por cantidad', () => {
    expect(orderRequestSchema.parse(marketBuy)).toEqual(marketBuy);
  });

  it('acepta una orden MARKET por monto', () => {
    const byAmount = { ...without(marketBuy, 'size'), amount: 10000.5 };

    expect(orderRequestSchema.parse(byAmount)).toEqual(byAmount);
  });

  it('acepta una orden LIMIT con precio', () => {
    expect(orderRequestSchema.parse(limitSell)).toEqual(limitSell);
  });

  it('acepta un precio con dos decimales', () => {
    expect(invalidFields({ ...limitSell, price: 900.55 })).toEqual([]);
  });

  it('rechaza cantidad y monto a la vez', () => {
    expect(invalidFields({ ...marketBuy, amount: 1000 })).toEqual(['size']);
  });

  it('rechaza un pedido sin cantidad ni monto', () => {
    expect(invalidFields(without(marketBuy, 'size'))).toEqual(['size']);
  });

  it.each([1.5, 0, -3, '10', 2147483648])('rechaza size %p', (size) => {
    expect(invalidFields({ ...marketBuy, size })).toEqual(['size']);
  });

  it('rechaza una orden LIMIT sin precio', () => {
    expect(invalidFields(without(limitSell, 'price'))).toEqual(['price']);
  });

  it('rechaza una orden MARKET con precio', () => {
    expect(invalidFields({ ...marketBuy, price: 900 })).toEqual(['price']);
  });

  it.each([0, -1, 10.123, 100000000, '900'])('rechaza price %p', (price) => {
    expect(invalidFields({ ...limitSell, price })).toEqual(['price']);
  });

  it.each([0, -5, 10.999])('rechaza amount %p', (amount) => {
    expect(invalidFields({ ...without(marketBuy, 'size'), amount })).toEqual(['amount']);
  });

  it('rechaza un side que no existe', () => {
    expect(invalidFields({ ...marketBuy, side: 'HOLD' })).toEqual(['side']);
  });

  it('rechaza un type que no existe', () => {
    expect(invalidFields({ ...marketBuy, type: 'STOP' })).toEqual(['type']);
  });

  it.each(['userId', 'instrumentId', 'side', 'type'] as const)('rechaza un pedido sin %s', (field) => {
    expect(invalidFields(without(marketBuy, field))).toEqual([field]);
  });

  it.each([0, -1, 1.5, '1'])('rechaza userId %p', (userId) => {
    expect(invalidFields({ ...marketBuy, userId })).toEqual(['userId']);
  });

  it('rechaza campos que no existen', () => {
    expect(invalidFields({ ...marketBuy, comision: 5 })).toEqual(['comision']);
  });
});

describe('orderRequestSchema: movimientos de efectivo', () => {
  it('acepta un depósito con userId, side y size', () => {
    expect(orderRequestSchema.parse(deposit)).toEqual(deposit);
  });

  it('acepta un retiro', () => {
    const withdrawal = { ...deposit, side: 'CASH_OUT' };

    expect(orderRequestSchema.parse(withdrawal)).toEqual(withdrawal);
  });

  it.each([
    ['instrumentId', 66],
    ['type', 'MARKET'],
    ['price', 1],
    ['amount', 100000],
  ])('rechaza un movimiento de efectivo con %s', (field, value) => {
    expect(invalidFields({ ...deposit, [field]: value })).toEqual([field]);
  });

  it.each([100.5, 0, -100])('rechaza un monto %p', (size) => {
    expect(invalidFields({ ...deposit, size })).toEqual(['size']);
  });

  it('rechaza un movimiento sin size', () => {
    expect(invalidFields(without(deposit, 'size'))).toEqual(['size']);
  });
});

describe('orderRequestSchema: cuerpo del pedido', () => {
  it.each([null, undefined, 'texto', 42, []])('rechaza un cuerpo que no es un objeto: %p', (body) => {
    expect(invalidFields(body).length).toBeGreaterThan(0);
  });
});
