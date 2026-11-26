import type { GrocyClient, ShoppingLine } from '../api/grocy';
import { lineLabel } from './grouping';

/** Données saisies en magasin, stockées localement par id de ligne. */
export interface LineLocalData {
  /** Prix payé par unité de stock. */
  paidUnitPrice?: number | null;
  /** DLC AAAA-MM-JJ (null = défaut du produit). */
  bestBefore?: string | null;
  /** Déjà ajouté au stock (évite un double ajout si la suppression de ligne a échoué). */
  stocked?: boolean;
}

export type LocalDataMap = Record<number, LineLocalData>;

/** Lignes produit cochées sans date de péremption (bloquent la validation). */
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
  /** Persiste un patch des données locales (ex. stocked = true). */
  patchLocal: (lineId: number, patch: LineLocalData) => Promise<void>;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Valide les achats : pour chaque ligne cochée, ajout au stock (sauf texte libre
 * ou déjà « stocked »), marquage local stocked, puis suppression de la ligne.
 * Les erreurs sont collectées par article.
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
