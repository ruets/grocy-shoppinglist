import type { GrocyClient, ShoppingLine } from '../api/grocy';
import { lineLabel } from './grouping';

/** Data entered in store, stored locally per line id. */
export interface LineLocalData {
  /** Price paid per stock unit. */
  paidUnitPrice?: number | null;
  /** Best-before date YYYY-MM-DD (null = product default). */
  bestBefore?: string | null;
  /** Already added to stock (prevents a double add if deleting the line failed). */
  stocked?: boolean;
}

export type LocalDataMap = Record<number, LineLocalData>;

/** Checked product lines without a best-before date (they block checkout). */
export function linesMissingBestBefore(
  lines: ShoppingLine[],
  getLocal: (lineId: number) => LineLocalData | undefined,
): ShoppingLine[] {
  return lines.filter((l) => l.done && l.product_id !== null && !getLocal(l.id)?.bestBefore);
}

export interface CheckoutResult {
  ok: { id: number; label: string }[];
  errors: { id: number; label: string; message: string }[];
}

export interface CheckoutDeps {
  client: GrocyClient;
  getLocal: (lineId: number) => LineLocalData | undefined;
  /** Persists a patch of the local data (e.g. stocked = true). */
  patchLocal: (lineId: number, patch: LineLocalData) => Promise<void>;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Checks out purchases: for each checked line, add to stock (unless free text
 * or already "stocked"), mark it stocked locally, then delete the line.
 * Errors are collected per item.
 */
export async function runCheckout(
  lines: ShoppingLine[],
  shoppingLocationId: number | null,
  deps: CheckoutDeps,
): Promise<CheckoutResult> {
  const checked = lines.filter((l) => l.done);
  const result: CheckoutResult = { ok: [], errors: [] };
  let i = 0;
  for (const line of checked) {
    const label = lineLabel(line);
    try {
      if (line.product_id !== null) {
        const local = deps.getLocal(line.id);
        if (!local?.stocked) {
          if (!(line.amount > 0)) throw new Error('Quantité nulle');
          await deps.client.purchase(line.product_id, {
            amount: line.amount,
            price: local?.paidUnitPrice ?? null,
            bestBeforeDate: local?.bestBefore ?? null,
            shoppingLocationId,
          });
          await deps.patchLocal(line.id, { stocked: true });
        }
      }
      await deps.client.deleteShoppingLine(line.id);
      result.ok.push({ id: line.id, label });
    } catch (e: any) {
      result.errors.push({ id: line.id, label, message: e?.message ?? String(e) });
    }
    i += 1;
    deps.onProgress?.(i, checked.length);
  }
  return result;
}
