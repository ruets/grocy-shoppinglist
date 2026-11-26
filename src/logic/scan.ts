import type { ShoppingLine } from '../api/grocy';

export type ScanDecision =
  /** Unchecked line found: purchase modal with the line's amount. */
  | { kind: 'line'; line: ShoppingLine; amount: number }
  /** Already in the cart: purchase modal with amount + 1. */
  | { kind: 'inCart'; line: ShoppingLine; amount: number }
  /** Product not on the list: off-list purchase. */
  | { kind: 'offList'; amount: number };

export function decideScan(productId: number, lines: ShoppingLine[]): ScanDecision {
  const forProduct = lines.filter((l) => l.product_id === productId);
  const pending = forProduct.find((l) => !l.done);
  if (pending) return { kind: 'line', line: pending, amount: pending.amount > 0 ? pending.amount : 1 };
  const inCart = forProduct.find((l) => l.done);
  if (inCart) return { kind: 'inCart', line: inCart, amount: inCart.amount + 1 };
  return { kind: 'offList', amount: 1 };
}

