import type { GrocyClient, ShoppingLine } from '../../api/grocy';
import { linesMissingBestBefore, runCheckout, type LocalDataMap } from '../checkout';

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
  ...p,
});

function setup(failDeleteIds: number[] = []) {
  const purchase = jest.fn().mockResolvedValue([]);
  const deleteShoppingLine = jest.fn(async (id: number) => {
    if (failDeleteIds.includes(id)) throw new Error('boom');
  });
  const client = { purchase, deleteShoppingLine } as unknown as GrocyClient;
  const local: LocalDataMap = {};
  const deps = {
    client,
    getLocal: (id: number) => local[id],
    patchLocal: async (id: number, p: object) => {
      local[id] = { ...local[id], ...p };
    },
  };
  return { purchase, deleteShoppingLine, local, deps };
}

describe('runCheckout', () => {
  it('achète les produits cochés, supprime les textes libres, ignore les non cochés', async () => {
    const { purchase, deleteShoppingLine, local, deps } = setup();
    local[1] = { paidUnitPrice: 1.5, bestBefore: '2026-12-01' };
    const r = await runCheckout(
      [
        line({ id: 1, product_id: 10, amount: 2 }),
        line({ id: 2, product_id: null, note: 'Fleurs' }),
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

  it('ne rajoute pas au stock si la suppression avait échoué (flag stocked)', async () => {
    const { purchase, deps } = setup([1]);
    const l = line({ id: 1, product_id: 10 });
    const r1 = await runCheckout([l], null, deps);
    expect(r1.errors).toEqual([{ id: 1, label: 'P', message: 'boom' }]);
    expect(purchase).toHaveBeenCalledTimes(1);

    const ok = setup();
    // même stockage local, client qui réussit cette fois
    const r2 = await runCheckout([l], null, { ...ok.deps, getLocal: deps.getLocal, patchLocal: deps.patchLocal });
    expect(ok.purchase).not.toHaveBeenCalled();
    expect(ok.deleteShoppingLine).toHaveBeenCalledWith(1);
    expect(r2.ok).toHaveLength(1);
  });
});

describe('linesMissingBestBefore', () => {
  it('seulement les produits cochés sans date', () => {
    const local: LocalDataMap = { 2: { bestBefore: '2026-12-01' }, 3: { paidUnitPrice: 1 } };
    const r = linesMissingBestBefore(
      [
        line({ id: 1 }),
        line({ id: 2 }),
        line({ id: 3 }),
        line({ id: 4, product_id: null, note: 'x' }),
        line({ id: 5, done: false }),
      ],
      (id) => local[id],
    );
    expect(r.map((l) => l.id)).toEqual([1, 3]);
  });
});
