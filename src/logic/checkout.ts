import type { GrocyClient, ShoppingLine } from '../api/grocy';
import { lineLabel } from './grouping';
import { t } from '../i18n';

/** Checked product lines without a best-before date (they block checkout). */
export function linesMissingBestBefore(lines: ShoppingLine[]): ShoppingLine[] {
  return lines.filter((l) => l.done && l.product_id !== null && !l.best_before);
}

export interface CheckoutResult {
  ok: { id: number; label: string }[];
  errors: { id: number; label: string; message: string }[];
}

export interface CheckoutDeps {
  client: GrocyClient;
  /** Line already added to stock by this phone (deletion failed afterwards). */
  isStocked: (lineId: number) => boolean;
  markStocked: (lineId: number) => Promise<void>;
  /** Called once the line is deleted: its id may be reused by Grocy later. */
  clearStocked: (lineId: number) => Promise<void>;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Checks out purchases: for each checked line, add to stock (unless free text
 * or already stocked by this phone), remember it as stocked, then delete the line.
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
        if (!deps.isStocked(line.id)) {
          if (!(line.amount > 0)) throw new Error(t().errors.zeroQuantity);
          await deps.client.purchase(line.product_id, {
            amount: line.amount,
            price: line.paid_price,
            bestBeforeDate: line.best_before,
            shoppingLocationId,
          });
          await deps.markStocked(line.id);
        }
      }
      await deps.client.deleteShoppingLine(line.id);
      if (line.product_id !== null) await deps.clearStocked(line.id).catch(() => undefined);
      result.ok.push({ id: line.id, label });
    } catch (e: any) {
      result.errors.push({ id: line.id, label, message: e?.message ?? String(e) });
    }
    i += 1;
    deps.onProgress?.(i, checked.length);
  }
  return result;
}
