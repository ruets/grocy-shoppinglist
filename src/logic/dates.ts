import { t } from '../i18n';

const pad = (n: number) => String(n).padStart(2, '0');

/** Grocy convention for "never expires". */
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
 * Accepted formats → YYYY-MM-DD:
 * "DD/MM/YYYY", "DD/MM/YY", "YYYY-MM-DD", "DDMMYYYY", "DDMMYY",
 * and without a year "DD/MM" or "DDMM": current year, or next year if the date has already passed.
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

/** YYYY-MM-DD → DD/MM/YYYY */
export function formatIsoDateFr(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Like formatIsoDateFr, but « jamais » / « never » (current language) for NEVER_EXPIRES. */
export function formatBestBefore(iso: string | null | undefined): string {
  if (iso === NEVER_EXPIRES) return t().dates.never;
  return formatIsoDateFr(iso);
}

/** Words accepted for "never expires", whatever the language. */
const NEVER_WORDS = ['jamais', 'never'];

/** Typed text → ISO date (or never expires). null if empty, 'invalid' if unreadable. */
export function parseBestBeforeText(text: string): string | null | 'invalid' {
  const s = text.trim();
  if (!s) return null;
  if (NEVER_WORDS.includes(s.toLowerCase())) return NEVER_EXPIRES;
  return parseUserDate(s) ?? 'invalid';
}

export function addDays(days: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return toIsoDate(d);
}

/**
 * Date derived from the product's default shelf life (Grocy `default_best_before_days`):
 * -1 → never expires, > 0 → today + N days, otherwise null (no useful default).
 */
export function productDefaultBestBefore(days: number | null | undefined, today = new Date()): string | null {
  if (days === -1) return NEVER_EXPIRES;
  if (days !== null && days !== undefined && days > 0) return addDays(days, today);
  return null;
}
