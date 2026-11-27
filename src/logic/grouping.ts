import type { NamedEntity, ShoppingLine } from '../api/grocy';

export const NO_GROUP = 'Sans rayon';
export const FREE_TEXT = 'Texte libre';

export interface LineSection {
  title: string;
  data: ShoppingLine[];
}

export function lineLabel(l: ShoppingLine): string {
  return l.product_id !== null ? (l.product_name ?? `Produit #${l.product_id}`) : l.note || '(sans texte)';
}

/**
 * Groups by aisle (product group) sorted alphabetically, then "no aisle",
 * then "free text". Off-stock items (no product) go into their « Rayon (app) »
 * aisle when it still exists, otherwise into "free text". Within each group:
 * unchecked first, then by name.
 */
export function groupLines(lines: ShoppingLine[], aisleNames: Map<number, string>): LineSection[] {
  const groups = new Map<string, ShoppingLine[]>();
  const noGroup: ShoppingLine[] = [];
  const freeText: ShoppingLine[] = [];
  for (const l of lines) {
    const aisle =
      l.product_id === null ? (l.aisle_id !== null ? aisleNames.get(l.aisle_id) : undefined) : l.product_group_name;
    if (aisle) {
      const arr = groups.get(aisle) ?? [];
      arr.push(l);
      groups.set(aisle, arr);
    } else if (l.product_id === null) freeText.push(l);
    else noGroup.push(l);
  }
  const sortLines = (arr: ShoppingLine[]) =>
    [...arr].sort(
      (a, b) => Number(a.done) - Number(b.done) || lineLabel(a).localeCompare(lineLabel(b), 'fr'),
    );
  const sections: LineSection[] = [...groups.keys()]
    .sort((a, b) => a.localeCompare(b, 'fr'))
    .map((title) => ({ title, data: sortLines(groups.get(title)!) }));
  if (noGroup.length) sections.push({ title: NO_GROUP, data: sortLines(noGroup) });
  if (freeText.length) sections.push({ title: FREE_TEXT, data: sortLines(freeText) });
  return sections;
}

/** Product group id → name, for off-stock aisles. */
export function aisleNameMap(meta: { productGroups: NamedEntity[] } | null): Map<number, string> {
  return new Map((meta?.productGroups ?? []).map((g) => [g.id, g.name]));
}
