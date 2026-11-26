import type { ShoppingLine } from '../api/grocy';

export type ScanDecision =
  /** Ligne non cochée trouvée : modale d'achat avec la quantité de la ligne. */
  | { kind: 'line'; line: ShoppingLine; amount: number }
  /** Déjà dans le panier : modale d'achat avec quantité + 1. */
  | { kind: 'inCart'; line: ShoppingLine; amount: number }
  /** Produit absent de la liste : achat « hors liste ». */
  | { kind: 'offList'; amount: number };

export function decideScan(productId: number, lines: ShoppingLine[]): ScanDecision {
  const forProduct = lines.filter((l) => l.product_id === productId);
  const pending = forProduct.find((l) => !l.done);
  if (pending) return { kind: 'line', line: pending, amount: pending.amount > 0 ? pending.amount : 1 };
  const inCart = forProduct.find((l) => l.done);
  if (inCart) return { kind: 'inCart', line: inCart, amount: inCart.amount + 1 };
  return { kind: 'offList', amount: 1 };
}

