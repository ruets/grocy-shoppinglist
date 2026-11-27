import type { ShoppingLine } from '../../api/grocy';
import { priceLineFrom } from '../priceLine';

const src = (p: Partial<ShoppingLine>): ShoppingLine => ({
  id: 5,
  shopping_list_id: 2,
  product_id: 7,
  note: 'bio',
  amount: 3,
  done: true,
  qu_id: 4,
  product_name: 'Lait',
  last_price: 1,
  product_group_name: null,
  paid_price: 1.2,
  best_before: '2026-12-01',
  aisle_id: null,
  ...p,
});

describe('priceLineFrom', () => {
  it('Grocy product → same product and unit, empty note, no aisle', () => {
    const r = priceLineFrom(src({}), { amount: 1, unitPrice: 1.5, bestBefore: '2026-12-03' });
    expect(r.line).toEqual({ shopping_list_id: 2, product_id: 7, amount: 1, qu_id: 4, note: '', done: true });
    expect(r.fields).toEqual({ paidPrice: 1.5, bestBefore: '2026-12-03' });
  });

  it('off-stock item → same name and aisle, never a best-before date', () => {
    const r = priceLineFrom(src({ product_id: null, qu_id: null, note: 'Bonbons', aisle_id: 3 }), {
      amount: 2,
      unitPrice: 0.8,
      bestBefore: '2026-12-03',
    });
    expect(r.line).toEqual({ shopping_list_id: 2, product_id: null, amount: 2, qu_id: null, note: 'Bonbons', done: true });
    expect(r.fields).toEqual({ paidPrice: 0.8, bestBefore: null, aisleId: 3 });
  });
});
