import { round2 } from './numbers';

/** Données minimales d'une ligne pour le calcul des totaux. */
export interface TotalsLine {
  /** Quantité en unité de stock. */
  amount: number;
  done: boolean;
  /** Ligne « texte libre » (sans produit). */
  freeText: boolean;
  /** Dernier prix connu par unité de stock. */
  lastPrice: number | null;
  /** Prix unitaire saisi en magasin (local), si présent. */
  paidUnitPrice: number | null;
}

export interface TotalsBucket {
  total: number;
  /** Au moins une partie du total vient d'une estimation (dernier prix). */
  estimated: boolean;
  /** Nombre d'articles sans aucun prix (ni saisi ni connu). */
  withoutPrice: number;
  /** Nombre d'articles dans la catégorie. */
  count: number;
}

export interface Totals {
  cart: TotalsBucket;
  remaining: TotalsBucket;
  list: TotalsBucket;
}

const empty = (): TotalsBucket => ({ total: 0, estimated: false, withoutPrice: 0, count: 0 });

/** Prix de ligne et nature (réel / estimé / absent). */
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
 * Panier = lignes cochées (prix saisi, sinon estimation au dernier prix).
 * Reste = lignes non cochées au dernier prix (toujours une estimation).
 * Liste = Panier + Reste.
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

/** Préfixe « ~ » pour les estimations. */
export function formatBucket(b: TotalsBucket, fmt: (n: number) => string): string {
  // Aucun article de la catégorie n'a de prix : un « 0,00 » serait trompeur.
  if (b.count > 0 && b.withoutPrice === b.count) return '—';
  return `${b.estimated ? '~' : ''}${fmt(b.total)}`;
}
