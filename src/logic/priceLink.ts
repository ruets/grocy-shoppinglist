import { formatInput, parseDecimal } from './numbers';

/**
 * Lien bidirectionnel prix unitaire ↔ total de ligne.
 * Le champ édité en dernier (« ancre ») est conservé quand la quantité change ;
 * l'autre est recalculé.
 */
export type PriceAnchor = 'unit' | 'total';

export interface PriceLinkState {
  qty: number;
  unitText: string;
  totalText: string;
  anchor: PriceAnchor;
}

export type PriceLinkAction =
  | { type: 'unit'; text: string }
  | { type: 'total'; text: string }
  | { type: 'qty'; qty: number }
  | { type: 'reset'; state: PriceLinkState };

export function initPriceLink(qty: number, unitPrice: number | null): PriceLinkState {
  return {
    qty,
    unitText: formatInput(unitPrice),
    totalText: unitPrice !== null ? formatInput(unitPrice * qty) : '',
    anchor: 'unit',
  };
}

function derive(state: PriceLinkState): PriceLinkState {
  if (state.anchor === 'unit') {
    const u = parseDecimal(state.unitText);
    return { ...state, totalText: u === null ? '' : formatInput(u * state.qty) };
  }
  const t = parseDecimal(state.totalText);
  if (t === null) return { ...state, unitText: '' };
  if (state.qty <= 0) return state;
  return { ...state, unitText: formatInput(t / state.qty) };
}

export function priceLinkReducer(state: PriceLinkState, action: PriceLinkAction): PriceLinkState {
  switch (action.type) {
    case 'unit':
      return derive({ ...state, unitText: action.text, anchor: 'unit' });
    case 'total':
      return derive({ ...state, totalText: action.text, anchor: 'total' });
    case 'qty':
      return derive({ ...state, qty: action.qty });
    case 'reset':
      return action.state;
  }
}

/**
 * Prix unitaire à enregistrer (pleine précision, calculé depuis l'ancre),
 * ou null si aucun prix saisi.
 */
export function effectiveUnitPrice(state: PriceLinkState): number | null {
  if (state.anchor === 'total') {
    const t = parseDecimal(state.totalText);
    if (t === null || state.qty <= 0) return null;
    return Math.round((t / state.qty) * 10000) / 10000;
  }
  return parseDecimal(state.unitText);
}

export function effectiveTotal(state: PriceLinkState): number | null {
  if (state.anchor === 'total') return parseDecimal(state.totalText);
  const u = parseDecimal(state.unitText);
  return u === null ? null : u * state.qty;
}
