import type { ShoppingLine } from '../api/grocy';

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
 * Groupe par rayon (groupe de produits) trié alphabétiquement,
 * puis « Sans rayon », puis « Texte libre ». Dans chaque groupe :
 * non cochés d'abord, puis par nom.
 */
export function groupLines(lines: ShoppingLine[]): LineSection[] {
  const groups = new Map<string, ShoppingLine[]>();
  const noGroup: ShoppingLine[] = [];
  const freeText: ShoppingLine[] = [];
  for (const l of lines) {
    if (l.product_id === null) freeText.push(l);
    else if (!l.product_group_name) noGroup.push(l);
    else {
      const arr = groups.get(l.product_group_name) ?? [];
      arr.push(l);
      groups.set(l.product_group_name, arr);
    }
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
