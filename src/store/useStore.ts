import { create } from 'zustand';
import {
  GrocyClient,
  productPresets,
  type NamedEntity,
  type Product,
  type QuantityUnit,
  type ShoppingLine,
  type ShoppingList,
  type UserSettings,
} from '../api/grocy';
import { runCheckout, type CheckoutResult, type LineLocalData } from '../logic/checkout';
import { makeMoneyFormatter } from '../logic/numbers';
import { loadSettings, saveSettings, type AppSettings } from '../storage/settings';
import {
  loadLineData,
  loadLastShoppingLocation,
  pruneLineData,
  saveLastShoppingLocation,
  saveLineData,
  type StoredLineMap,
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

export interface PurchaseInput {
  amount: number;
  unitPrice: number | null;
  bestBefore: string | null;
}

interface State {
  ready: boolean;
  settings: AppSettings;
  client: GrocyClient | null;
  meta: Meta | null;
  lines: ShoppingLine[];
  local: StoredLineMap;
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
  loadAll: () => Promise<void>;
  reloadProducts: () => Promise<void>;
  refreshLines: (opts?: { silent?: boolean; pull?: boolean }) => Promise<void>;
  addItem: (p: { productId: number | null; amount: number; note: string }) => Promise<void>;
  updateItem: (id: number, p: { productId: number | null; amount: number; note: string }) => Promise<void>;
  deleteItem: (id: number) => Promise<void>;
  markPurchased: (lineId: number, p: PurchaseInput) => Promise<void>;
  unmark: (lineId: number) => Promise<void>;
  purchaseOffList: (productId: number, p: PurchaseInput) => Promise<void>;
  createProduct: (name: string, barcode?: string) => Promise<number>;
  addBarcode: (productId: number, barcode: string) => Promise<void>;
  /** Stores a line's best-before date locally; null = still to be entered. */
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

  async function patchLocal(lineId: number, patch: LineLocalData | null) {
    const map = { ...get().local };
    if (patch === null) delete map[lineId];
    else map[lineId] = { ...map[lineId], ...patch, updatedAt: Date.now() };
    set({ local: map });
    await saveLineData(map);
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
    ready: false,
    settings: { url: '', apiKey: '', shoppingListId: null },
    client: null,
    meta: null,
    lines: [],
    local: {},
    lastShoppingLocationId: null,
    loading: false,
    refreshing: false,
    busy: 0,
    loadError: null,
    toast: null,
    money: makeMoneyFormatter('EUR'),

    async init() {
      const [settings, local, lastLoc] = await Promise.all([
        loadSettings(),
        loadLineData(),
        loadLastShoppingLocation(),
      ]);
      const client = settings.url && settings.apiKey ? new GrocyClient(settings.url, settings.apiKey) : null;
      set({ settings, local, lastShoppingLocationId: lastLoc, client, ready: true });
      if (client) await get().loadAll();
    },

    async applySettings(s) {
      await saveSettings(s);
      const client = new GrocyClient(s.url, s.apiKey);
      set({ settings: s, client, meta: null, lines: [] });
      await get().loadAll();
    },

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
        // Default list: the first one if none is selected or it no longer exists.
        const { settings } = get();
        if (shoppingLists.length && !shoppingLists.some((l) => l.id === settings.shoppingListId)) {
          const next = { ...settings, shoppingListId: shoppingLists[0].id };
          await saveSettings(next);
          set({ settings: next });
        }
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
        const pruned = pruneLineData(get().local, new Set(lines.map((l) => l.id)));
        const changed = Object.keys(pruned).length !== Object.keys(get().local).length;
        set({ lines, loadError: null, ...(changed ? { local: pruned } : {}) });
        if (changed) await saveLineData(pruned);
      } catch (e) {
        if (!opts.silent || opts.pull) get().showToast(errMsg(e), 'error');
        else set({ loadError: errMsg(e) });
      } finally {
        if (opts.pull) set({ refreshing: false });
      }
    },

    addItem: (p) =>
      mutate(async () => {
        await requireClient().addShoppingLine({
          shopping_list_id: requireList(),
          product_id: p.productId,
          amount: p.amount,
          qu_id: stockQu(p.productId),
          note: p.note,
          done: false,
        });
        await get().refreshLines();
      }),

    updateItem: (id, p) =>
      mutate(async () => {
        await requireClient().updateShoppingLine(id, {
          product_id: p.productId,
          qu_id: stockQu(p.productId),
          amount: p.amount,
          note: p.note,
        });
        await get().refreshLines();
      }),

    deleteItem: (id) =>
      mutate(async () => {
        await requireClient().deleteShoppingLine(id);
        set({ lines: get().lines.filter((l) => l.id !== id) });
        await patchLocal(id, null);
        await get().refreshLines();
      }),

    markPurchased: (lineId, p) =>
      mutate(async () => {
        await requireClient().updateShoppingLine(lineId, { done: true, amount: p.amount });
        await patchLocal(lineId, { paidUnitPrice: p.unitPrice, bestBefore: p.bestBefore });
        set({ lines: get().lines.map((l) => (l.id === lineId ? { ...l, done: true, amount: p.amount } : l)) });
        await get().refreshLines({ silent: true });
      }),

    unmark: (lineId) =>
      mutate(async () => {
        await requireClient().updateShoppingLine(lineId, { done: false });
        // Keep the stocked flag (prevents double add), forget price and date.
        const prev = get().local[lineId];
        await patchLocal(lineId, prev?.stocked ? { paidUnitPrice: null, bestBefore: null, stocked: true } : null);
        set({ lines: get().lines.map((l) => (l.id === lineId ? { ...l, done: false } : l)) });
        await get().refreshLines({ silent: true });
      }),

    purchaseOffList: (productId, p) =>
      mutate(async () => {
        const id = await requireClient().addShoppingLine({
          shopping_list_id: requireList(),
          product_id: productId,
          amount: p.amount,
          qu_id: stockQu(productId),
          note: '',
          done: true,
        });
        await patchLocal(id, { paidUnitPrice: p.unitPrice, bestBefore: p.bestBefore });
        await get().refreshLines({ silent: true });
      }),

    createProduct: (name, barcode) =>
      mutate(async () => {
        const client = requireClient();
        const meta = get().meta;
        if (!meta) throw new Error('Données Grocy non chargées');
        const { locationId, quId } = productPresets(meta.userSettings, meta.locations, meta.units);
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

    async setBestBefore(lineId, iso) {
      await patchLocal(lineId, { bestBefore: iso });
    },

    async checkout(shoppingLocationId, onProgress) {
      set((s) => ({ busy: s.busy + 1, lastShoppingLocationId: shoppingLocationId }));
      try {
        await saveLastShoppingLocation(shoppingLocationId);
        const result = await runCheckout(get().lines, shoppingLocationId, {
          client: requireClient(),
          getLocal: (id) => get().local[id],
          patchLocal: (id, patch) => patchLocal(id, patch),
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
