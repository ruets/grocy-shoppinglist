import { computeTotals, formatBucket, linePrice, type TotalsLine } from '../totals';

const L = (p: Partial<TotalsLine>): TotalsLine => ({
  amount: 1,
  done: false,
  freeText: false,
  lastPrice: null,
  paidUnitPrice: null,
  ...p,
});

const fmt = (n: number) => n.toFixed(2);

describe('linePrice', () => {
  it('uses the paid price for a checked line', () => {
    expect(linePrice(L({ done: true, amount: 3, paidUnitPrice: 1.2, lastPrice: 2 }))).toEqual({
      value: 3.5999999999999996,
      estimated: false,
    });
  });
  it('ignores the paid price on an unchecked line (last-price estimate)', () => {
    expect(linePrice(L({ done: false, amount: 2, paidUnitPrice: 1, lastPrice: 2 }))).toEqual({
      value: 4,
      estimated: true,
    });
  });
  it('estimates with the last price when no price was paid', () => {
    expect(linePrice(L({ done: true, amount: 2, lastPrice: 1.5 }))).toEqual({ value: 3, estimated: true });
  });
  it('null without any price', () => {
    expect(linePrice(L({ done: true }))).toEqual({ value: null, estimated: false });
  });
  it('a paid price of 0 is a real price', () => {
    expect(linePrice(L({ done: true, amount: 2, paidUnitPrice: 0, lastPrice: 5 }))).toEqual({
      value: 0,
      estimated: false,
    });
  });
});

describe('computeTotals', () => {
  it('empty list', () => {
    const t = computeTotals([]);
    expect(t.cart).toEqual({ total: 0, estimated: false, withoutPrice: 0, count: 0 });
    expect(t.list.total).toBe(0);
  });

  it('splits cart / remaining and sums the list, rounded to 2 decimals', () => {
    const t = computeTotals([
      L({ done: true, amount: 3, paidUnitPrice: 1.2 }), // 3.60 actual
      L({ done: true, amount: 1, paidUnitPrice: 0.1 }), // 0.10 actual
      L({ done: false, amount: 2, lastPrice: 0.1 }), // ~0.20
      L({ done: false, amount: 1, lastPrice: 0.2 }), // ~0.20
    ]);
    expect(t.cart).toEqual({ total: 3.7, estimated: false, withoutPrice: 0, count: 2 });
    expect(t.remaining).toEqual({ total: 0.4, estimated: true, withoutPrice: 0, count: 2 });
    expect(t.list).toEqual({ total: 4.1, estimated: true, withoutPrice: 0, count: 4 });
  });

  it('cart is estimated when a checked line has no entered price', () => {
    const t = computeTotals([
      L({ done: true, amount: 1, paidUnitPrice: 2 }),
      L({ done: true, amount: 2, lastPrice: 1.25 }),
    ]);
    expect(t.cart.total).toBe(4.5);
    expect(t.cart.estimated).toBe(true);
    expect(formatBucket(t.cart, fmt)).toBe('~4.50');
  });

  it('counts unpriced items (free text included)', () => {
    const t = computeTotals([
      L({ done: true }),
      L({ done: false, freeText: true }),
      L({ done: false, lastPrice: 1 }),
    ]);
    expect(t.cart.withoutPrice).toBe(1);
    expect(t.remaining.withoutPrice).toBe(1);
    expect(t.list.withoutPrice).toBe(2);
    expect(t.list.count).toBe(3);
    expect(t.list.total).toBe(1);
  });

  it('formatBucket without "~" for an actual total', () => {
    const t = computeTotals([L({ done: true, amount: 2, paidUnitPrice: 1.005 })]);
    expect(formatBucket(t.cart, fmt)).toBe('2.01');
  });

  it('"—" when no item in the bucket has a price', () => {
    const t = computeTotals([L({ done: false }), L({ done: true, paidUnitPrice: 2 })]);
    expect(formatBucket(t.remaining, fmt)).toBe('—');
    expect(formatBucket(t.cart, fmt)).toBe('2.00');
    expect(formatBucket(computeTotals([]).cart, fmt)).toBe('0.00');
  });
});
