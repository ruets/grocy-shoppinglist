import { create } from 'zustand';
import {
  GrocyClient,
  GrocyError,
  productPresets,
  type NamedEntity,
  type Product,
  type QuantityUnit,
  type ShoppingLine,
  type ShoppingList,
  type UserSettings,
} from '../api/grocy';
import { runCheckout, type CheckoutResult } from '../logic/checkout';
import {
  DEFAULT_LIST_NAME,
  evaluateCheckup,
  isBlocking,
  type CheckResult,
  type CheckupInput,
  type Fix,
} from '../logic/checkup';
import { makeMoneyFormatter } from '../logic/numbers';
import { priceLineFrom } from '../logic/priceLine';
import { loadSettings, saveSettings, type AppSettings } from '../storage/settings';
import {
  clearLegacyLineData,
  loadLastShoppingLocation,
  loadStocked,
  pruneStocked,
  saveLastShoppingLocation,
  saveStocked,
  type StockedMap,
} from '../storage/local';

export interface Meta {
  shoppingLists: ShoppingList[];
  products: Product[];
  productsById: Map<number, Product>;
  unitsById: Map<number, QuantityUnit>;
  units: QuantityUnit[];
  shoppingLocations: NamedEntity[];
  locations: NamedEntity[];
  productGroups: NamedEntity[];
  userSettings: UserSettings;
  currency: string;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'error' | 'info' | 'success';
}

export interface ItemInput {
  productId: number | null;
  amount: number;
  note: string;
  /** Off-stock items only; null clears it. */
  aisleId?: number | null;
}

export interface PurchaseInput {
  amount: number;
  unitPrice: number | null;
  bestBefore: string | null;
}

/**
 * init: loading settings; checking: startup Grocy checkup; blocked: the
 * checkup found something to fix (shown before the list); ready: list usable.
 */
export type Phase = 'init' | 'checking' | 'blocked' | 'ready';

interface State {
  phase: Phase;
  settings: AppSettings;
  client: GrocyClient | null;
  meta: Meta | null;
  lines: ShoppingLine[];
  stocked: StockedMap;
  /** Last checkup results (startup or « Grocy Doctor »). */
  checkup: CheckResult[] | null;
  lastShoppingLocationId: number | null;
  loading: boolean;
  refreshing: boolean;
  /** Number of mutations in flight (blocks auto refresh). */
  busy: number;
  loadError: string | null;
  toast: Toast | null;
  money: (n: number) => string;

  init: () => Promise<void>;
  applySettings: (s: AppSettings) => Promise<void>;
  /** Runs the checks; never changes anything in Grocy. */
  runCheckup: () => Promise<CheckResult[]>;
  /** Applies fixes the user confirmed, re-checks, and opens the list if nothing blocks. */
  applyFixes: (fixes: Fix[]) => Promise<void>;
  loadAll: () => Promise<void>;
  reloadProducts: () => Promise<void>;
  refreshLines: (opts?: { silent?: boolean; pull?: boolean }) => Promise<void>;
  /** Off-stock item = productId null; note is its name, aisleId its « Rayon (app) ». */
  addItem: (p: ItemInput) => Promise<void>;
  updateItem: (id: number, p: ItemInput) => Promise<void>;
  deleteItem: (id: number) => Promise<void>;
  markPurchased: (lineId: number, p: PurchaseInput) => Promise<void>;
  unmark: (lineId: number) => Promise<void>;
  purchaseOffList: (productId: number, p: PurchaseInput) => Promise<void>;
  /** « Autre prix »: new checked line of the same item (product or off-stock); returns its id. */
  addPriceLine: (lineId: number, p: PurchaseInput) => Promise<number>;
  createProduct: (name: string, barcode?: string) => Promise<number>;
  addBarcode: (productId: number, barcode: string) => Promise<void>;
  /** Stores a line's best-before date in Grocy; null = still to be entered. */
  setBestBefore: (lineId: number, iso: string | null) => Promise<void>;
  checkout: (shoppingLocationId: number | null, onProgress?: (d: number, t: number) => void) => Promise<CheckoutResult>;
  showToast: (text: string, kind?: Toast['kind']) => void;
  hideToast: () => void;
}

let toastSeq = 0;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const useStore = create<State>((set, get) => {
  /** Runs a mutation, tracking activity and showing any error. */
  async function mutate<T>(fn: () => Promise<T>): Promise<T> {
    set((s) => ({ busy: s.busy + 1 }));
    try {
      return await fn();
    } catch (e) {
      get().showToast(errMsg(e), 'error');
      throw e;
    } finally {
      set((s) => ({ busy: s.busy - 1 }));
    }
  }

  /** Optimistic local update of a line, until the next refresh. */
  function patchLine(lineId: number, patch: Partial<ShoppingLine>) {
    set({ lines: get().lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) });
  }

  async function clearStocked(lineId: number) {
    const map = { ...get().stocked };
    delete map[lineId];
    set({ stocked: map });
    await saveStocked(map);
  }

  async function markStocked(lineId: number) {
    const map = { ...get().stocked, [lineId]: Date.now() };
    set({ stocked: map });
    await saveStocked(map);
  }

  /** Startup gate: checkup first, the list only when nothing blocks. */
  async function startup() {
    set({ phase: 'checking' });
    const results = await get().runCheckup();
    if (isBlocking(results)) {
      set({ phase: 'blocked' });
      return;
    }
    await get().loadAll();
    set({ phase: 'ready' });
  }

  function requireClient(): GrocyClient {
    const c = get().client;
    if (!c) throw new Error('Grocy non configuré');
    return c;
  }

  function requireList(): number {
    const id = get().settings.shoppingListId;
    if (id === null) throw new Error('Aucune liste de courses choisie');
    return id;
  }

  function stockQu(productId: number | null): number | null {
    if (productId === null) return null;
    return get().meta?.productsById.get(productId)?.qu_id_stock ?? null;
  }

  return {
    phase: 'init',
    settings: { url: '', apiKey: '', shoppingListId: null, newProductLocationId: null },
    client: null,
    meta: null,
    lines: [],
    stocked: {},
    checkup: null,
    lastShoppingLocationId: null,
    loading: false,
    refreshing: false,
    busy: 0,
    loadError: null,
    toast: null,
    money: makeMoneyFormatter('EUR'),

    async init() {
      const [settings, stocked, lastLoc] = await Promise.all([
        loadSettings(),
        loadStocked(),
        loadLastShoppingLocation(),
        clearLegacyLineData().catch(() => undefined),
      ]);
      const client = settings.url && settings.apiKey ? new GrocyClient(settings.url, settings.apiKey) : null;
      set({ settings, stocked: pruneStocked(stocked), lastShoppingLocationId: lastLoc, client });
      if (client) await startup();
      else set({ phase: 'ready' });
    },

    async applySettings(s) {
      await saveSettings(s);
      const client = new GrocyClient(s.url, s.apiKey);
      set({ settings: s, client, meta: null, lines: [] });
      await startup();
    },

    async runCheckup() {
      const client = requireClient();
      let input: CheckupInput;
      try {
        const info = await client.getSystemInfo();
        const [lists, userfields, locations, units] = await Promise.all([
          client.getShoppingLists(),
          client.getUserfields(),
          client.getLocations(),
          client.getQuantityUnits(),
        ]);
        input = {
          server: { ok: true, version: info.grocy_version?.Version ?? '' },
          lists,
          selectedListId: get().settings.shoppingListId,
          userfields,
          locations,
          newProductLocationId: get().settings.newProductLocationId,
          units: units.length,
        };
      } catch (e) {
        const error = e instanceof GrocyError ? e : new GrocyError(errMsg(e), null, 'http');
        input = { server: { ok: false, error }, lists: [], selectedListId: null, userfields: [], locations: [], newProductLocationId: null, units: 0 };
      }
      const results = evaluateCheckup(input);
      set({ checkup: results });
      return results;
    },

    applyFixes: (fixes) =>
      mutate(async () => {
        const client = requireClient();
        const selectList = async (id: number) => {
          const next = { ...get().settings, shoppingListId: id };
          await saveSettings(next);
          set({ settings: next });
        };
        for (const fix of fixes) {
          if (fix.kind === 'createUserfields') {
            for (const f of fix.fields) await client.createUserfield(f);
          } else if (fix.kind === 'createList') {
            await selectList(await client.createShoppingList(DEFAULT_LIST_NAME));
          } else if (fix.kind === 'selectList') {
            await selectList(fix.listId);
          }
        }
        const results = await get().runCheckup();
        if (!isBlocking(results)) {
          await get().loadAll();
          set({ phase: 'ready' });
        }
      }),

    async loadAll() {
      const client = get().client;
      if (!client) return;
      set({ loading: true, loadError: null });
      try {
        const [shoppingLists, products, units, shoppingLocations, locations, productGroups, userSettings, config] =
          await Promise.all([
            client.getShoppingLists(),
            client.getProducts(),
            client.getQuantityUnits(),
            client.getShoppingLocations(),
            client.getLocations(),
            client.getProductGroups(),
            client.getUserSettings(),
            client.getSystemConfig(),
          ]);
        const currency = typeof config.CURRENCY === 'string' && config.CURRENCY ? config.CURRENCY : 'EUR';
        set({
          meta: {
            shoppingLists,
            products,
            productsById: new Map(products.map((p) => [p.id, p])),
            units,
            unitsById: new Map(units.map((u) => [u.id, u])),
            shoppingLocations: [...shoppingLocations].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
            locations,
            productGroups,
            userSettings,
            currency,
          },
          money: makeMoneyFormatter(currency),
        });
        // No automatic list choice here: the checkup asks first.
        await get().refreshLines({ silent: true });
      } catch (e) {
        set({ loadError: errMsg(e) });
      } finally {
        set({ loading: false });
      }
    },

    async reloadProducts() {
      const client = requireClient();
      const products = await client.getProducts();
      const meta = get().meta;
      if (meta) set({ meta: { ...meta, products, productsById: new Map(products.map((p) => [p.id, p])) } });
    },

    async refreshLines(opts = {}) {
      const client = get().client;
      const listId = get().settings.shoppingListId;
      if (!client || listId === null) return;
      if (opts.pull) set({ refreshing: true });
      try {
        const lines = await client.getShoppingLines(listId);
        set({ lines, loadError: null });
      } catch (e) {
        if (!opts.silent || opts.pull) get().showToast(errMsg(e), 'error');
        else set({ loadError: errMsg(e) });
      } finally {
        if (opts.pull) set({ refreshing: false });
      }
    },

    addItem: (p) =>
      mutate(async () => {
        const client = requireClient();
        const id = await client.addShoppingLine({
          shopping_list_id: requireList(),
          product_id: p.productId,
          amount: p.amount,
          qu_id: stockQu(p.productId),
          note: p.note,
          done: false,
        });
        if (p.productId === null && p.aisleId != null) await client.setLineFields(id, { aisleId: p.aisleId });
        await get().refreshLines();
      }),

    updateItem: (id, p) =>
      mutate(async () => {
        const client = requireClient();
        await client.updateShoppingLine(id, {
          product_id: p.productId,
          qu_id: stockQu(p.productId),
          amount: p.amount,
          note: p.note,
        });
        // The aisle only applies to off-stock items; clear it when the line becomes a product.
        const aisleId = p.productId === null ? (p.aisleId ?? null) : null;
        const before = get().lines.find((l) => l.id === id)?.aisle_id ?? null;
        if (aisleId !== before) await client.setLineFields(id, { aisleId });
        await get().refreshLines();
      }),

    deleteItem: (id) =>
      mutate(async () => {
        await requireClient().deleteShoppingLine(id);
        set({ lines: get().lines.filter((l) => l.id !== id) });
        await get().refreshLines();
      }),

    markPurchased: (lineId, p) =>
      mutate(async () => {
        const client = requireClient();
        await client.updateShoppingLine(lineId, { done: true, amount: p.amount });
        patchLine(lineId, { done: true, amount: p.amount });
        await client.setLineFields(lineId, { paidPrice: p.unitPrice, bestBefore: p.bestBefore });
        patchLine(lineId, { paid_price: p.unitPrice, best_before: p.bestBefore });
        await get().refreshLines({ silent: true });
      }),

    unmark: (lineId) =>
      mutate(async () => {
        const client = requireClient();
        // The stocked marker stays (prevents a double add); price and date are cleared.
        await client.updateShoppingLine(lineId, { done: false });
        patchLine(lineId, { done: false });
        await client.setLineFields(lineId, { paidPrice: null, bestBefore: null });
        patchLine(lineId, { paid_price: null, best_before: null });
        await get().refreshLines({ silent: true });
      }),

    purchaseOffList: (productId, p) =>
      mutate(async () => {
        const client = requireClient();
        const id = await client.addShoppingLine({
          shopping_list_id: requireList(),
          product_id: productId,
          amount: p.amount,
          qu_id: stockQu(productId),
          note: '',
          done: true,
        });
        await client.setLineFields(id, { paidPrice: p.unitPrice, bestBefore: p.bestBefore });
        await get().refreshLines({ silent: true });
      }),

    addPriceLine: (lineId, p) =>
      mutate(async () => {
        const client = requireClient();
        const src = get().lines.find((l) => l.id === lineId);
        if (!src) throw new Error('Article introuvable');
        const { line, fields } = priceLineFrom(src, p);
        const id = await client.addShoppingLine(line);
        await client.setLineFields(id, fields);
        await get().refreshLines({ silent: true });
        return id;
      }),

    createProduct: (name, barcode) =>
      mutate(async () => {
        const client = requireClient();
        const meta = get().meta;
        if (!meta) throw new Error('Données Grocy non chargées');
        const { locationId, quId } = productPresets(
          meta.userSettings,
          meta.locations,
          meta.units,
          get().settings.newProductLocationId,
        );
        if (locationId === null || quId === null) {
          throw new Error('Impossible de créer le produit : aucun emplacement ou unité dans Grocy.');
        }
        const id = await client.createProduct({ name: name.trim(), locationId, quId });
        if (barcode) await client.addBarcode(id, barcode);
        await get().reloadProducts();
        return id;
      }),

    addBarcode: (productId, barcode) =>
      mutate(async () => {
        await requireClient().addBarcode(productId, barcode);
      }),

    setBestBefore: (lineId, iso) =>
      mutate(async () => {
        // Optimistic: the walkthrough and recap read it at once; a failure
        // shows a toast and the next refresh restores Grocy's value.
        patchLine(lineId, { best_before: iso });
        await requireClient().setLineFields(lineId, { bestBefore: iso });
      }),

    async checkout(shoppingLocationId, onProgress) {
      set((s) => ({ busy: s.busy + 1, lastShoppingLocationId: shoppingLocationId }));
      try {
        await saveLastShoppingLocation(shoppingLocationId);
        const result = await runCheckout(get().lines, shoppingLocationId, {
          client: requireClient(),
          isStocked: (id) => id in get().stocked,
          markStocked,
          clearStocked,
          onProgress,
        });
        await get().refreshLines({ silent: true });
        return result;
      } finally {
        set((s) => ({ busy: s.busy - 1 }));
      }
    },

    showToast(text, kind = 'info') {
      if (toastTimer) clearTimeout(toastTimer);
      set({ toast: { id: ++toastSeq, text, kind } });
      toastTimer = setTimeout(() => set({ toast: null }), kind === 'error' ? 6000 : 3000);
    },
    hideToast() {
      if (toastTimer) clearTimeout(toastTimer);
      set({ toast: null });
    },
  };
});

/** Name of a product's stock unit (plural when needed). */
export function stockUnitName(meta: Meta | null, productId: number | null, amount: number): string {
  if (!meta || productId === null) return '';
  const p = meta.productsById.get(productId);
  const u = p ? meta.unitsById.get(p.qu_id_stock) : undefined;
  if (!u) return '';
  return amount > 1 && u.name_plural ? u.name_plural : u.name;
}
