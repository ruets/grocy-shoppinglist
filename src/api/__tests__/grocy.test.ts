import { GrocyClient, GrocyError } from '../grocy';

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Array<{ status: number; body?: unknown }>) {
  const calls: Call[] = [];
  const impl = jest.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const r = responses.shift() ?? { status: 200, body: null };
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status });
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
        ],
      },
    ]);
    const c = new GrocyClient('http://grocy.lan/api/', 'KEY', f.impl);
    const lines = await c.getShoppingLines(1);
    expect(f.calls[0].url).toBe('http://grocy.lan/api/objects/uihelper_shopping_list?query%5B%5D=shopping_list_id%3D1');
    expect((f.calls[0].init.headers as Record<string, string>)['GROCY-API-KEY']).toBe('KEY');
    expect(lines[0]).toEqual({
      id: 4, shopping_list_id: 1, product_id: 9, note: '', amount: 2, done: true, qu_id: 3,
      product_name: 'Lait', last_price: 0.95, product_group_name: 'Frais',
    });
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
});
