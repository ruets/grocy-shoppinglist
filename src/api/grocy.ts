/**
 * Typed client for the Grocy 4.7.x API.
 * Deliberately free of React Native dependencies: usable from the app
 * as well as from the Node integration script (scripts/api-integration-test.ts).
 */

export interface ShoppingList {
  id: number;
  name: string;
}

export interface Product {
  id: number;
  name: string;
  active: number;
  qu_id_stock: number;
  qu_id_purchase: number;
  product_group_id: number | null;
  location_id: number | null;
  /** Default shelf life in days; -1 = never expires. */
  default_best_before_days: number | null;
}

export interface QuantityUnit {
  id: number;
  name: string;
  name_plural: string | null;
}

export interface NamedEntity {
  id: number;
  name: string;
}

export interface UserSettings {
  product_presets_location_id?: number | string;
  product_presets_qu_id?: number | string;
  [key: string]: unknown;
}

export interface SystemInfo {
  grocy_version?: { Version?: string; ReleaseDate?: string };
  [key: string]: unknown;
}

/** Normalized shopping list line (uihelper_shopping_list view). */
export interface ShoppingLine {
  id: number;
  shopping_list_id: number;
  product_id: number | null;
  note: string;
  /** Amount, in the product's stock unit. */
  amount: number;
  done: boolean;
  qu_id: number | null;
  product_name: string | null;
  /** Last purchase price per stock unit (null if unknown). */
  last_price: number | null;
  product_group_name: string | null;
  /** « Prix payé (app) » userfield: price paid per stock unit. */
  paid_price: number | null;
  /** « DLC (app) » userfield, YYYY-MM-DD. */
  best_before: string | null;
  /** « Rayon (app) » userfield: product group id (off-stock items). */
  aisle_id: number | null;
}

export interface Userfield {
  id: number;
  entity: string;
  name: string;
  type: string;
}

export interface BarcodeProductDetails {
  product: Product;
  last_price: number | null;
}

export interface StockEntry {
  id: number;
  product_id: number;
  amount: number;
  best_before_date: string;
  price: number | null;
  shopping_location_id: number | null;
  purchased_date?: string;
}

export interface NewShoppingLine {
  shopping_list_id: number;
  product_id: number | null;
  amount: number;
  qu_id: number | null;
  note: string;
  done: boolean;
}

export interface PurchaseParams {
  amount: number;
  /** Price per stock unit. Omitted when null/undefined. */
  price?: number | null;
  /** YYYY-MM-DD; omitted => product default date. */
  bestBeforeDate?: string | null;
  shoppingLocationId?: number | null;
}

export class GrocyError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly kind: 'network' | 'auth' | 'http' | 'timeout' = 'http',
  ) {
    super(message);
    this.name = 'GrocyError';
  }
}

type FetchLike = typeof fetch;

// ---------- normalization (Grocy/SQLite sometimes returns numbers as strings) ----------

export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toInt(v: unknown): number {
  return toNum(v) ?? 0;
}

function toBool(v: unknown): boolean {
  return v === true || v === 1 || v === '1';
}

function normProduct(p: any): Product {
  return {
    id: toInt(p.id),
    name: String(p.name ?? ''),
    active: toNum(p.active) ?? 1,
    qu_id_stock: toInt(p.qu_id_stock),
    qu_id_purchase: toInt(p.qu_id_purchase),
    product_group_id: toNum(p.product_group_id),
    location_id: toNum(p.location_id),
    default_best_before_days: toNum(p.default_best_before_days),
  };
}

function normLine(l: any): ShoppingLine {
  return {
    id: toInt(l.id),
    shopping_list_id: toInt(l.shopping_list_id),
    product_id: toNum(l.product_id),
    note: l.note ? String(l.note) : '',
    amount: toNum(l.amount) ?? 0,
    done: toBool(l.done),
    qu_id: toNum(l.qu_id),
    product_name: l.product_name ? String(l.product_name) : null,
    last_price: toNum(l.price),
    product_group_name: l.product_group_name ? String(l.product_group_name) : null,
    paid_price: null,
    best_before: null,
    aisle_id: null,
  };
}

function normDate(v: unknown): string | null {
  const m = typeof v === 'string' ? /^(\d{4}-\d{2}-\d{2})/.exec(v) : null;
  return m ? m[1] : null;
}

/** Reads the app's userfields from an `objects/shopping_list` row; bad values → null. */
function lineFields(uf: any): Pick<ShoppingLine, 'paid_price' | 'best_before' | 'aisle_id'> {
  const price = toNum(uf?.[UF.price]);
  const aisle = toNum(uf?.[UF.aisle]);
  return {
    paid_price: price !== null && price >= 0 ? price : null,
    best_before: normDate(uf?.[UF.bestBefore]),
    aisle_id: aisle !== null && Number.isInteger(aisle) ? aisle : null,
  };
}

/** Userfield names on the `shopping_list` entity (see logic/checkup APP_USERFIELDS). */
export const UF = { price: 'appprix', bestBefore: 'appdlc', aisle: 'apprayon' } as const;

export function normalizeBaseUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/api$/i, '');
  return url;
}

export class GrocyClient {
  private readonly base: string;

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = (...args) => fetch(...args),
    private readonly timeoutMs = 15000,
  ) {
    this.base = `${normalizeBaseUrl(baseUrl)}/api`;
  }

  // ---------- low level ----------

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers: {
          'GROCY-API-KEY': this.apiKey,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        throw new GrocyError('Grocy ne répond pas (délai dépassé). Vérifiez le réseau / VPN.', null, 'timeout');
      }
      throw new GrocyError(
        "Impossible de joindre Grocy. Vérifiez l'URL et la connexion (Wi-Fi / VPN).",
        null,
        'network',
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    let data: any = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!res.ok) {
      if (res.status === 401) {
        throw new GrocyError('Clé API refusée par Grocy (401).', 401, 'auth');
      }
      const msg =
        (data && typeof data === 'object' && data.error_message) ||
        (typeof data === 'string' && data.length < 300 ? data : null) ||
        `Erreur Grocy (HTTP ${res.status})`;
      throw new GrocyError(String(msg), res.status, 'http');
    }
    return data as T;
  }

  // ---------- system ----------

  getSystemInfo(): Promise<SystemInfo> {
    return this.request('GET', '/system/info');
  }

  async getSystemConfig(): Promise<Record<string, unknown>> {
    return this.request('GET', '/system/config');
  }

  getUserSettings(): Promise<UserSettings> {
    return this.request('GET', '/user/settings');
  }

  // ---------- generic objects ----------

  async getShoppingLists(): Promise<ShoppingList[]> {
    const rows = await this.request<any[]>('GET', '/objects/shopping_lists');
    return rows.map((r) => ({ id: toInt(r.id), name: String(r.name ?? `Liste ${r.id}`) }));
  }

  async getProducts(): Promise<Product[]> {
    const rows = await this.request<any[]>('GET', '/objects/products');
    return rows.map(normProduct).filter((p) => p.active !== 0);
  }

  async getQuantityUnits(): Promise<QuantityUnit[]> {
    const rows = await this.request<any[]>('GET', '/objects/quantity_units');
    return rows.map((r) => ({
      id: toInt(r.id),
      name: String(r.name ?? ''),
      name_plural: r.name_plural ? String(r.name_plural) : null,
    }));
  }

  private async getNamed(entity: string): Promise<NamedEntity[]> {
    const rows = await this.request<any[]>('GET', `/objects/${entity}`);
    return rows.map((r) => ({ id: toInt(r.id), name: String(r.name ?? '') }));
  }

  getShoppingLocations() {
    return this.getNamed('shopping_locations');
  }
  getLocations() {
    return this.getNamed('locations');
  }
  getProductGroups() {
    return this.getNamed('product_groups');
  }

  // ---------- shopping list ----------

  async getShoppingLines(shoppingListId: number): Promise<ShoppingLine[]> {
    // query[]=shopping_list_id=<id>, URL-encoded
    const q = `query%5B%5D=shopping_list_id%3D${encodeURIComponent(String(shoppingListId))}`;
    // The uihelper view has product names/prices but no userfields; the raw
    // table has userfields only. Fetch both and merge by id.
    const [rows, raw] = await Promise.all([
      this.request<any[]>('GET', `/objects/uihelper_shopping_list?${q}`),
      this.request<any[]>('GET', `/objects/shopping_list?${q}`),
    ]);
    const fields = new Map<number, any>((raw ?? []).map((r) => [toInt(r.id), r.userfields]));
    return rows.map((r) => {
      const line = normLine(r);
      return { ...line, ...lineFields(fields.get(line.id)) };
    });
  }

  /** Sets the app's userfields on a line; only the given keys are sent, null → ''. */
  setLineFields(
    lineId: number,
    v: { paidPrice?: number | null; bestBefore?: string | null; aisleId?: number | null },
  ): Promise<void> {
    const body: Record<string, string> = {};
    const str = (x: number | string | null) => (x === null ? '' : String(x));
    if (v.paidPrice !== undefined) body[UF.price] = str(v.paidPrice);
    if (v.bestBefore !== undefined) body[UF.bestBefore] = str(v.bestBefore);
    if (v.aisleId !== undefined) body[UF.aisle] = str(v.aisleId);
    return this.request('PUT', `/userfields/shopping_list/${lineId}`, body);
  }

  async getUserfields(): Promise<Userfield[]> {
    const rows = await this.request<any[]>('GET', '/objects/userfields');
    return (rows ?? []).map((r) => ({ id: toInt(r.id), entity: String(r.entity), name: String(r.name), type: String(r.type) }));
  }

  async createUserfield(f: { name: string; caption: string; type: string }): Promise<number> {
    const res = await this.request<{ created_object_id: number | string }>('POST', '/objects/userfields', {
      entity: 'shopping_list',
      name: f.name,
      caption: f.caption,
      type: f.type,
      show_as_column_in_tables: 0,
    });
    return toInt(res.created_object_id);
  }

  async createShoppingList(name: string): Promise<number> {
    const res = await this.request<{ created_object_id: number | string }>('POST', '/objects/shopping_lists', { name });
    return toInt(res.created_object_id);
  }

  async addShoppingLine(line: NewShoppingLine): Promise<number> {
    const res = await this.request<{ created_object_id: number | string }>('POST', '/objects/shopping_list', {
      shopping_list_id: line.shopping_list_id,
      product_id: line.product_id,
      amount: line.amount,
      qu_id: line.qu_id,
      note: line.note,
      done: line.done ? 1 : 0,
    });
    return toInt(res.created_object_id);
  }

  updateShoppingLine(
    id: number,
    patch: Partial<{ amount: number; done: boolean; note: string; product_id: number | null; qu_id: number | null }>,
  ): Promise<void> {
    const body: Record<string, unknown> = { ...patch };
    if (patch.done !== undefined) body.done = patch.done ? 1 : 0;
    return this.request('PUT', `/objects/shopping_list/${id}`, body);
  }

  deleteShoppingLine(id: number): Promise<void> {
    return this.request('DELETE', `/objects/shopping_list/${id}`);
  }

  // ---------- products / barcodes ----------

  /** Returns null when Grocy does not know the barcode (HTTP 400). */
  async getProductByBarcode(barcode: string): Promise<BarcodeProductDetails | null> {
    try {
      const res = await this.request<any>('GET', `/stock/products/by-barcode/${encodeURIComponent(barcode)}`);
      return { product: normProduct(res.product), last_price: toNum(res.last_price) };
    } catch (e) {
      if (e instanceof GrocyError && (e.status === 400 || e.status === 404)) return null;
      throw e;
    }
  }

  async createProduct(params: { name: string; locationId: number; quId: number }): Promise<number> {
    const res = await this.request<{ created_object_id: number | string }>('POST', '/objects/products', {
      name: params.name,
      location_id: params.locationId,
      qu_id_purchase: params.quId,
      qu_id_stock: params.quId,
      qu_id_consume: params.quId,
      qu_id_price: params.quId,
    });
    return toInt(res.created_object_id);
  }

  async addBarcode(productId: number, barcode: string): Promise<number> {
    try {
      const res = await this.request<{ created_object_id: number | string }>('POST', '/objects/product_barcodes', {
        product_id: productId,
        barcode,
      });
      return toInt(res.created_object_id);
    } catch (e) {
      if (e instanceof GrocyError && /UNIQUE constraint failed: product_barcodes\.barcode/i.test(e.message)) {
        throw new GrocyError(`Le code ${barcode} est déjà associé à un autre produit dans Grocy.`, e.status);
      }
      throw e;
    }
  }

  // ---------- stock ----------

  purchase(productId: number, p: PurchaseParams): Promise<unknown> {
    const body: Record<string, unknown> = { amount: p.amount, transaction_type: 'purchase' };
    if (p.price !== null && p.price !== undefined) body.price = p.price;
    if (p.bestBeforeDate) body.best_before_date = p.bestBeforeDate;
    if (p.shoppingLocationId !== null && p.shoppingLocationId !== undefined) {
      body.shopping_location_id = p.shoppingLocationId;
    }
    return this.request('POST', `/stock/products/${productId}/add`, body);
  }

  async getStockEntries(productId: number): Promise<StockEntry[]> {
    const rows = await this.request<any[]>('GET', `/stock/products/${productId}/entries`);
    return rows.map((r) => ({
      id: toInt(r.id),
      product_id: toInt(r.product_id),
      amount: toNum(r.amount) ?? 0,
      best_before_date: String(r.best_before_date ?? ''),
      price: toNum(r.price),
      shopping_location_id: toNum(r.shopping_location_id),
      purchased_date: r.purchased_date ? String(r.purchased_date) : undefined,
    }));
  }
}

/** Default location / quantity unit used to create a product. */
export function productPresets(
  settings: UserSettings,
  locations: NamedEntity[],
  units: QuantityUnit[],
): { locationId: number | null; quId: number | null } {
  const loc = toNum(settings.product_presets_location_id);
  const qu = toNum(settings.product_presets_qu_id);
  return {
    locationId: loc !== null && loc !== -1 ? loc : (locations[0]?.id ?? null),
    quId: qu !== null && qu !== -1 ? qu : (units[0]?.id ?? null),
  };
}
