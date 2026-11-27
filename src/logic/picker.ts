import type { NamedEntity, Product } from '../api/grocy';
import { locale } from '../i18n';
import { noAisleTitle } from './grouping';
import { searchByName } from './text';

export interface PickerSection {
  /** Aisle name; null for search results. */
  title: string | null;
  data: Product[];
}

/**
 * Add screen product list: without a query, every product grouped by aisle
 * (A→Z, then « Sans rayon »); with a query, the search results.
 */
export function pickerSections(products: Product[], query: string, groups: NamedEntity[]): PickerSection[] {
  if (query.trim()) {
    const found = searchByName(products, query, 30);
    return found.length ? [{ title: null, data: found }] : [];
  }
  const names = new Map(groups.map((g) => [g.id, g.name]));
  const byAisle = new Map<string, Product[]>();
  const none: Product[] = [];
  for (const p of products) {
    const name = p.product_group_id !== null ? names.get(p.product_group_id) : undefined;
    if (name) byAisle.set(name, [...(byAisle.get(name) ?? []), p]);
    else none.push(p);
  }
  const byName = (a: Product, b: Product) => a.name.localeCompare(b.name, locale());
  const sections: PickerSection[] = [...byAisle.keys()]
    .sort((a, b) => a.localeCompare(b, locale()))
    .map((title) => ({ title, data: byAisle.get(title)!.sort(byName) }));
  if (none.length) sections.push({ title: noAisleTitle(), data: none.sort(byName) });
  return sections;
}
