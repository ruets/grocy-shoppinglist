import { locale } from '../i18n';
/** Lowercase, without accents or extra whitespace. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Accent/case-insensitive search: every word of the query must be present.
 * Names that start with the query come first.
 */
export function searchByName<T extends { name: string }>(items: T[], query: string, limit = 30): T[] {
  const q = normalizeText(query);
  if (!q) return [];
  const tokens = q.split(' ');
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const n = normalizeText(item.name);
    if (!tokens.every((t) => n.includes(t))) continue;
    const score = n === q ? 0 : n.startsWith(q) ? 1 : n.split(' ').some((w) => w.startsWith(tokens[0])) ? 2 : 3;
    scored.push({ item, score });
  }
  scored.sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name, locale()));
  return scored.slice(0, limit).map((s) => s.item);
}
