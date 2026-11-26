const pad = (n: number) => String(n).padStart(2, '0');

/** Convention Grocy pour « ne périme pas ». */
export const NEVER_EXPIRES = '2999-12-31';

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function build(y: number, m: number, d: number): Date | null {
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/**
 * Formats acceptés → AAAA-MM-JJ :
 * « JJ/MM/AAAA », « JJ/MM/AA », « AAAA-MM-JJ », « JJMMAAAA », « JJMMAA »,
 * et sans année « JJ/MM » ou « JJMM » : année courante, ou suivante si la date est déjà passée.
 */
export function parseUserDate(input: string, today = new Date()): string | null {
  const s = input.trim();
  if (!s) return null;
  let y: number | null = null;
  let m: number;
  let d: number;
  let match: RegExpMatchArray | null;
  if ((match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = s.match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2}|\d{4}))?$/))) {
    d = Number(match[1]);
    m = Number(match[2]);
    if (match[3]) y = Number(match[3]);
  } else if ((match = s.match(/^(\d{2})(\d{2})(\d{2}|\d{4})?$/))) {
    d = Number(match[1]);
    m = Number(match[2]);
    if (match[3]) y = Number(match[3]);
  } else {
    return null;
  }
  if (y !== null && y < 100) y += 2000;

  if (y === null) {
    const t = startOfDay(today);
    let date = build(t.getFullYear(), m, d);
    if (!date) return null;
    if (date < t) date = build(t.getFullYear() + 1, m, d);
    return date ? toIsoDate(date) : null;
  }
  const date = build(y, m, d);
  return date ? toIsoDate(date) : null;
}

/** AAAA-MM-JJ → JJ/MM/AAAA */
export function formatIsoDateFr(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Comme formatIsoDateFr, mais « jamais » pour NEVER_EXPIRES. */
export function formatBestBefore(iso: string | null | undefined): string {
  if (iso === NEVER_EXPIRES) return 'jamais';
  return formatIsoDateFr(iso);
}

export function addDays(days: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return toIsoDate(d);
}

/**
 * Date issue de la durée par défaut du produit (Grocy `default_best_before_days`) :
 * -1 → ne périme pas, > 0 → aujourd'hui + N jours, sinon null (pas de défaut utile).
 */
export function productDefaultBestBefore(days: number | null | undefined, today = new Date()): string | null {
  if (days === -1) return NEVER_EXPIRES;
  if (days !== null && days !== undefined && days > 0) return addDays(days, today);
  return null;
}
