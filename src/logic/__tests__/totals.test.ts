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
  it('utilise le prix payé pour une ligne cochée', () => {
    expect(linePrice(L({ done: true, amount: 3, paidUnitPrice: 1.2, lastPrice: 2 }))).toEqual({
      value: 3.5999999999999996,
      estimated: false,
    });
  });
  it('ignore le prix payé sur une ligne non cochée (estimation au dernier prix)', () => {
    expect(linePrice(L({ done: false, amount: 2, paidUnitPrice: 1, lastPrice: 2 }))).toEqual({
      value: 4,
      estimated: true,
    });
  });
  it('estime au dernier prix si pas de prix payé', () => {
    expect(linePrice(L({ done: true, amount: 2, lastPrice: 1.5 }))).toEqual({ value: 3, estimated: true });
  });
  it('null sans aucun prix', () => {
    expect(linePrice(L({ done: true }))).toEqual({ value: null, estimated: false });
  });
  it('un prix payé de 0 est un vrai prix', () => {
    expect(linePrice(L({ done: true, amount: 2, paidUnitPrice: 0, lastPrice: 5 }))).toEqual({
      value: 0,
      estimated: false,
    });
  });
});

describe('computeTotals', () => {
  it('liste vide', () => {
    const t = computeTotals([]);
    expect(t.cart).toEqual({ total: 0, estimated: false, withoutPrice: 0, count: 0 });
    expect(t.list.total).toBe(0);
  });

  it('sépare panier / reste et somme la liste avec arrondi à 2 décimales', () => {
    const t = computeTotals([
      L({ done: true, amount: 3, paidUnitPrice: 1.2 }), // 3.60 réel
      L({ done: true, amount: 1, paidUnitPrice: 0.1 }), // 0.10 réel
      L({ done: false, amount: 2, lastPrice: 0.1 }), // ~0.20
      L({ done: false, amount: 1, lastPrice: 0.2 }), // ~0.20
    ]);
    expect(t.cart).toEqual({ total: 3.7, estimated: false, withoutPrice: 0, count: 2 });
    expect(t.remaining).toEqual({ total: 0.4, estimated: true, withoutPrice: 0, count: 2 });
    expect(t.list).toEqual({ total: 4.1, estimated: true, withoutPrice: 0, count: 4 });
  });

  it('panier estimé si une ligne cochée n’a pas de prix saisi', () => {
    const t = computeTotals([
      L({ done: true, amount: 1, paidUnitPrice: 2 }),
      L({ done: true, amount: 2, lastPrice: 1.25 }),
    ]);
    expect(t.cart.total).toBe(4.5);
    expect(t.cart.estimated).toBe(true);
    expect(formatBucket(t.cart, fmt)).toBe('~4.50');
  });

  it('compte les articles sans prix (y compris texte libre)', () => {
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

  it('formatBucket sans « ~ » pour un total réel', () => {
    const t = computeTotals([L({ done: true, amount: 2, paidUnitPrice: 1.005 })]);
    expect(formatBucket(t.cart, fmt)).toBe('2.01');
  });
});
