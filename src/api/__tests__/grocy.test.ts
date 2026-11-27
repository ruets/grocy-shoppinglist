import { GrocyClient, GrocyError, productPresets } from '../grocy';

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Array<{ status: number; body?: unknown }>) {
  const calls: Call[] = [];
  const impl = jest.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const r = responses.shift() ?? { status: 200, body: null };
    return new Response(r.status === 204 ? null : r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status });
  });
  return { calls, impl: impl as unknown as typeof fetch };
}

describe('GrocyClient', () => {
  it('sends the API key, encodes the list query and normalizes fields', async () => {
    const f = fakeFetch([
      {
        status: 200,
        body: [
          { id: '4', shopping_list_id: '1', product_id: '9', note: null, amount: '2', done: '1', qu_id: '3', product_name: 'Lait', price: '0.95', product_group_name: 'Frais' },
          { id: 5, shopping_list_id: 1, product_id: null, note: 'Fleurs', amount: 1, done: 0, qu_id: null, product_name: null, price: null, product_group_name: null },
          { id: 6, shopping_list_id: 1, product_id: null, note: 'Pain', amount: 1, done: 0, qu_id: null, product_name: null, price: null, product_group_name: null },
        ],
      },
      {
        status: 200,
        body: [
          { id: 5, userfields: { appprice: 'abc', appbestbefore: '2026-12-03 00:00:00', appaisle: '' } },
          { id: 4, userfields: { appprice: '1.5', appbestbefore: '2026-12-03', appaisle: '7' } },
        ],
      },
    ]);
    const c = new GrocyClient('http://grocy.lan/api/', 'KEY', f.impl);
    const lines = await c.getShoppingLines(1);
    expect(f.calls[0].url).toBe('http://grocy.lan/api/objects/uihelper_shopping_list?query%5B%5D=shopping_list_id%3D1');
    expect(f.calls[1].url).toBe('http://grocy.lan/api/objects/shopping_list?query%5B%5D=shopping_list_id%3D1');
    expect((f.calls[0].init.headers as Record<string, string>)['GROCY-API-KEY']).toBe('KEY');
    expect(lines[0]).toEqual({
      id: 4, shopping_list_id: 1, product_id: 9, note: '', amount: 2, done: true, qu_id: 3,
      product_name: 'Lait', last_price: 0.95, product_group_name: 'Frais',
      paid_price: 1.5, best_before: '2026-12-03', aisle_id: 7,
    });
    expect(lines[1]).toMatchObject({ paid_price: null, best_before: '2026-12-03', aisle_id: null });
    // Absent from the second response → no fields.
    expect(lines[2]).toMatchObject({ paid_price: null, best_before: null, aisle_id: null });
    expect(lines[1].product_id).toBeNull();
    expect(lines[1].done).toBe(false);
  });

  it('by-barcode : 400 → null', async () => {
    const f = fakeFetch([{ status: 400, body: { error_message: 'No product with barcode 123 found' } }]);
    const c = new GrocyClient('http://g', 'k', f.impl);
    await expect(c.getProductByBarcode('123')).resolves.toBeNull();
  });

  it('remonte error_message', async () => {
    const f = fakeFetch([{ status: 500, body: { error_message: 'Oups' } }]);
    const c = new GrocyClient('http://g', 'k', f.impl);
    await expect(c.deleteShoppingLine(1)).rejects.toThrow('Oups');
  });

  it('401 → API key message', async () => {
    const f = fakeFetch([{ status: 401, body: { error_message: 'x' } }]);
    const c = new GrocyClient('http://g', 'k', f.impl);
    await expect(c.getSystemInfo()).rejects.toMatchObject({ kind: 'auth' });
  });

  it('achat : corps conforme, champs optionnels omis', async () => {
    const f = fakeFetch([{ status: 200, body: [] }, { status: 200, body: [] }]);
    const c = new GrocyClient('http://g', 'k', f.impl);
    await c.purchase(9, { amount: 3, price: 1.2, bestBeforeDate: '2026-12-01', shoppingLocationId: 2 });
    await c.purchase(9, { amount: 1 });
    expect(f.calls[0].url).toBe('http://g/api/stock/products/9/add');
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual({
      amount: 3, transaction_type: 'purchase', price: 1.2, best_before_date: '2026-12-01', shopping_location_id: 2,
    });
    expect(JSON.parse(String(f.calls[1].init.body))).toEqual({ amount: 1, transaction_type: 'purchase' });
  });

  it('barcode already in use → readable message', async () => {
    const f = fakeFetch([
      {
        status: 400,
        body: { error_message: 'SQLSTATE[23000]: Integrity constraint violation: 19 UNIQUE constraint failed: product_barcodes.barcode' },
      },
    ]);
    const c = new GrocyClient('http://g', 'k', f.impl);
    await expect(c.addBarcode(7, '3017620422003')).rejects.toThrow(
      'Le code 3017620422003 est déjà associé à un autre produit dans Grocy.',
    );
  });

  it('network error → GrocyError network', async () => {
    const impl = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    const c = new GrocyClient('http://g', 'k', impl);
    const err = await c.getSystemInfo().catch((e) => e);
    expect(err).toBeInstanceOf(GrocyError);
    expect(err.kind).toBe('network');
  });

  it('setLineFields sends only the given userfields, null as empty string', async () => {
    const f = fakeFetch([{ status: 204 }, { status: 204 }]);
    const c = new GrocyClient('http://g', 'k', f.impl);
    await c.setLineFields(12, { paidPrice: 1.5 });
    expect(f.calls[0].url).toBe('http://g/api/userfields/shopping_list/12');
    expect(f.calls[0].init.method).toBe('PUT');
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual({ appprice: '1.5' });
    await c.setLineFields(12, { paidPrice: null, bestBefore: '2026-12-03', aisleId: null });
    expect(JSON.parse(String(f.calls[1].init.body))).toEqual({ appprice: '', appbestbefore: '2026-12-03', appaisle: '' });
  });

  it('createUserfield posts on shopping_list, hidden from tables', async () => {
    const f = fakeFetch([{ status: 200, body: { created_object_id: '9' } }]);
    const c = new GrocyClient('http://g', 'k', f.impl);
    await expect(c.createUserfield({ name: 'appbestbefore', caption: 'DLC (app)', type: 'date' })).resolves.toBe(9);
    expect(f.calls[0].url).toBe('http://g/api/objects/userfields');
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual({
      entity: 'shopping_list', name: 'appbestbefore', caption: 'DLC (app)', type: 'date', show_as_column_in_tables: 0,
    });
  });

  it('getUserfields normalizes rows', async () => {
    const f = fakeFetch([{ status: 200, body: [{ id: '3', entity: 'shopping_list', name: 'appprice', type: 'number-decimal', caption: 'x' }] }]);
    const c = new GrocyClient('http://g', 'k', f.impl);
    await expect(c.getUserfields()).resolves.toEqual([{ id: 3, entity: 'shopping_list', name: 'appprice', type: 'number-decimal' }]);
  });

  it('createShoppingList posts the name', async () => {
    const f = fakeFetch([{ status: 200, body: { created_object_id: 2 } }]);
    const c = new GrocyClient('http://g', 'k', f.impl);
    await expect(c.createShoppingList('Liste de courses')).resolves.toBe(2);
    expect(f.calls[0].url).toBe('http://g/api/objects/shopping_lists');
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual({ name: 'Liste de courses' });
  });
});

describe('productPresets', () => {
  const locations = [
    { id: 1, name: 'Frigo' },
    { id: 4, name: 'À ranger' },
  ];
  const units = [{ id: 2, name: 'Pièce', name_plural: null }];
  const settings = { product_presets_location_id: '1', product_presets_qu_id: '2' };

  it('uses the preferred location when it exists', () => {
    expect(productPresets(settings, locations, units, 4)).toEqual({ locationId: 4, quId: 2 });
  });
  it('preferred location gone → Grocy preset', () => {
    expect(productPresets(settings, locations, units, 99)).toEqual({ locationId: 1, quId: 2 });
  });
  it('no preferred location → Grocy preset', () => {
    expect(productPresets(settings, locations, units, null)).toEqual({ locationId: 1, quId: 2 });
    expect(productPresets({}, locations, units)).toEqual({ locationId: 1, quId: 2 });
  });
});
