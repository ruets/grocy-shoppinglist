/** Rounds to 2 decimals (avoids 0.1+0.2 artifacts). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Parses user input: accepts a decimal comma ("1,20"), spaces and
 * the € sign. Returns null when empty or invalid.
 */
export function parseDecimal(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const cleaned = String(input)
    .replace(/[\s  €$£]/g, '')
    .replace(',', '.');
  if (cleaned === '' || cleaned === '.' || cleaned === '-') return null;
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Input-field display "1,2" / "1,25" (no thousands separator). */
export function formatInput(n: number | null | undefined, maxDecimals = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  const f = 10 ** maxDecimals;
  const r = Math.round((n + Number.EPSILON) * f) / f;
  return String(r).replace('.', ',');
}

/** Readable amount: "2", "1,5". */
export function formatAmount(n: number): string {
  return formatInput(n, 2);
}

export function makeMoneyFormatter(currency: string | null | undefined): (n: number) => string {
  const cur = (currency || 'EUR').toUpperCase();
  try {
    const nf = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur });
    nf.format(1); // validates the currency code
    return (n) => nf.format(round2(n));
  } catch {
    return (n) => `${round2(n).toFixed(2).replace('.', ',')} ${cur}`;
  }
}
