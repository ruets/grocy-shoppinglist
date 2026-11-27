import type { NewShoppingLine, ShoppingLine } from '../api/grocy';

export interface PriceLineFields {
  paidPrice: number | null;
  bestBefore: string | null;
  aisleId?: number | null;
}

/**
 * « ＋ Autre prix »: the new checked line copied from `src`. A Grocy product
 * keeps its product and unit; an off-stock item keeps its name and aisle and
 * never gets a best-before date.
 */
export function priceLineFrom(
  src: ShoppingLine,
  p: { amount: number; unitPrice: number | null; bestBefore: string | null },
): { line: NewShoppingLine; fields: PriceLineFields } {
  const offStock = src.product_id === null;
  const line: NewShoppingLine = {
    shopping_list_id: src.shopping_list_id,
    product_id: src.product_id,
    amount: p.amount,
    qu_id: src.qu_id,
    note: offStock ? src.note : '',
    done: true,
  };
  const fields: PriceLineFields = offStock
    ? { paidPrice: p.unitPrice, bestBefore: null, aisleId: src.aisle_id }
    : { paidPrice: p.unitPrice, bestBefore: p.bestBefore };
  return { line, fields };
}
