import type { GrocyClient, ShoppingLine } from '../../api/grocy';
import { linesMissingBestBefore, runCheckout } from '../checkout';

const line = (p: Partial<ShoppingLine>): ShoppingLine => ({
  id: 1,
  shopping_list_id: 1,
  product_id: 1,
  note: '',
  amount: 1,
  done: true,
  qu_id: 1,
  product_name: 'P',
  last_price: null,
  product_group_name: null,
  paid_price: null,
  best_before: null,
  aisle_id: null,
  ...p,
});

function setup(failDeleteIds: number[] = []) {
  const purchase = jest.fn().mockResolvedValue([]);
  const deleteShoppingLine = jest.fn(async (id: number) => {
    if (failDeleteIds.includes(id)) throw new Error('boom');
  });
  const client = { purchase, deleteShoppingLine } as unknown as GrocyClient;
  const stocked = new Set<number>();
  const deps = {
    client,
    isStocked: (id: number) => stocked.has(id),
    markStocked: async (id: number) => {
      stocked.add(id);
    },
    clearStocked: async (id: number) => {
      stocked.delete(id);
    },
  };
  return { purchase, deleteShoppingLine, stocked, deps };
}

describe('runCheckout', () => {
  it('purchases checked products with their line fields, deletes free-text lines, ignores unchecked ones', async () => {
    const { purchase, deleteShoppingLine, deps } = setup();
    const r = await runCheckout(
      [
        line({ id: 1, product_id: 10, amount: 2, paid_price: 1.5, best_before: '2026-12-01' }),
        line({ id: 2, product_id: null, note: 'Fleurs', paid_price: 3 }),
        line({ id: 3, done: false }),
      ],
      7,
      deps,
    );
    expect(purchase).toHaveBeenCalledTimes(1);
    expect(purchase).toHaveBeenCalledWith(10, {
      amount: 2,
      price: 1.5,
      bestBeforeDate: '2026-12-01',
      shoppingLocationId: 7,
    });
    expect(deleteShoppingLine.mock.calls.map((c) => c[0])).toEqual([1, 2]);
    expect(r.ok).toHaveLength(2);
    expect(r.errors).toHaveLength(0);
  });

  it('forgets the stocked marker once the line is deleted (Grocy may reuse the id)', async () => {
    const { deps, stocked } = setup();
    await runCheckout([line({ id: 1, product_id: 10 })], null, deps);
    expect(stocked.has(1)).toBe(false);
  });

  it('keeps the stocked marker when the deletion fails', async () => {
    const { deps, stocked } = setup([1]);
    await runCheckout([line({ id: 1, product_id: 10 })], null, deps);
    expect(stocked.has(1)).toBe(true);
  });

  it('two lines of the same product → two stock entries with their own price', async () => {
    const { purchase, deps } = setup();
    await runCheckout(
      [
        line({ id: 1, product_id: 10, amount: 2, paid_price: 1.5, best_before: '2026-12-01' }),
        line({ id: 2, product_id: 10, amount: 1, paid_price: 3.2, best_before: '2026-12-05' }),
      ],
      null,
      deps,
    );
    expect(purchase.mock.calls.map((c) => [c[0], c[1].amount, c[1].price])).toEqual([
      [10, 2, 1.5],
      [10, 1, 3.2],
    ]);
  });

  it('does not add stock twice if the deletion had failed (stocked marker)', async () => {
    const { purchase, deps } = setup([1]);
    const l = line({ id: 1, product_id: 10 });
    const r1 = await runCheckout([l], null, deps);
    expect(r1.errors).toEqual([{ id: 1, label: 'P', message: 'boom' }]);
    expect(purchase).toHaveBeenCalledTimes(1);

    const ok = setup();
    // same stocked markers, client that succeeds this time
    const r2 = await runCheckout([l], null, { ...ok.deps, isStocked: deps.isStocked, markStocked: deps.markStocked });
    expect(ok.purchase).not.toHaveBeenCalled();
    expect(ok.deleteShoppingLine).toHaveBeenCalledWith(1);
    expect(r2.ok).toHaveLength(1);
  });
});

describe('linesMissingBestBefore', () => {
  it('only checked products without a date', () => {
    const r = linesMissingBestBefore([
      line({ id: 1 }),
      line({ id: 2, best_before: '2026-12-01' }),
      line({ id: 3, paid_price: 1 }),
      line({ id: 4, product_id: null, note: 'x' }),
      line({ id: 5, done: false }),
    ]);
    expect(r.map((l) => l.id)).toEqual([1, 3]);
  });
});
