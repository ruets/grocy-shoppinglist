import { round2 } from './numbers';

/** Minimal line data needed to compute totals. */
export interface TotalsLine {
  /** Amount in stock unit. */
  amount: number;
  done: boolean;
  /** Free-text line (no product). */
  freeText: boolean;
  /** Last known price per stock unit. */
  lastPrice: number | null;
  /** Unit price entered in store (local), if any. */
  paidUnitPrice: number | null;
}

export interface TotalsBucket {
  total: number;
  /** At least part of the total is an estimate (last price). */
  estimated: boolean;
  /** Number of items with no price at all (neither entered nor known). */
  withoutPrice: number;
  /** Number of items in the bucket. */
  count: number;
}

export interface Totals {
  cart: TotalsBucket;
  remaining: TotalsBucket;
  list: TotalsBucket;
}

const empty = (): TotalsBucket => ({ total: 0, estimated: false, withoutPrice: 0, count: 0 });

/** Line price and its kind (actual / estimated / missing). */
export function linePrice(line: TotalsLine): { value: number | null; estimated: boolean } {
  if (line.done && line.paidUnitPrice !== null && Number.isFinite(line.paidUnitPrice)) {
    return { value: line.paidUnitPrice * line.amount, estimated: false };
  }
  if (line.lastPrice !== null && Number.isFinite(line.lastPrice)) {
    return { value: line.lastPrice * line.amount, estimated: true };
  }
  return { value: null, estimated: false };
}

function addTo(bucket: TotalsBucket, line: TotalsLine) {
  bucket.count += 1;
  const p = linePrice(line);
  if (p.value === null) {
    bucket.withoutPrice += 1;
    return;
  }
  bucket.total += p.value;
  if (p.estimated) bucket.estimated = true;
}

/**
 * Cart = checked lines (entered price, otherwise last-price estimate).
 * Remaining = unchecked lines at last price (always an estimate).
 * List = Cart + Remaining.
 */
export function computeTotals(lines: TotalsLine[]): Totals {
  const cart = empty();
  const remaining = empty();
  for (const l of lines) addTo(l.done ? cart : remaining, l);

  cart.total = round2(cart.total);
  remaining.total = round2(remaining.total);

  const list: TotalsBucket = {
    total: round2(cart.total + remaining.total),
    estimated: cart.estimated || remaining.estimated,
    withoutPrice: cart.withoutPrice + remaining.withoutPrice,
    count: cart.count + remaining.count,
  };
  return { cart, remaining, list };
}

/** "~" prefix for estimates. */
export function formatBucket(b: TotalsBucket, fmt: (n: number) => string): string {
  // No item in the bucket has a price: "0,00" would be misleading.
  if (b.count > 0 && b.withoutPrice === b.count) return '—';
  return `${b.estimated ? '~' : ''}${fmt(b.total)}`;
}
