import type { Product } from '../../api/grocy';
import { pickerSections } from '../picker';

const p = (id: number, name: string, group: number | null): Product => ({
  id,
  name,
  active: 1,
  qu_id_stock: 1,
  qu_id_purchase: 1,
  product_group_id: group,
  location_id: 1,
  default_best_before_days: null,
});

const products = [p(1, 'Yaourt', 2), p(2, 'Beurre', 2), p(3, 'Pain', 1), p(4, 'Éponge', null), p(5, 'Lait', 9)];
const groups = [
  { id: 2, name: 'Frais' },
  { id: 1, name: 'Boulangerie' },
];

describe('pickerSections', () => {
  it('empty query → products grouped by aisle A→Z, then « Sans rayon »', () => {
    const s = pickerSections(products, '', groups);
    expect(s.map((x) => x.title)).toEqual(['Boulangerie', 'Frais', 'Sans rayon']);
    expect(s[1].data.map((x) => x.name)).toEqual(['Beurre', 'Yaourt']);
    // Unknown group id → « Sans rayon »
    expect(s[2].data.map((x) => x.name)).toEqual(['Éponge', 'Lait']);
  });

  it('blank query behaves like empty', () => {
    expect(pickerSections(products, '   ', groups).map((x) => x.title)).toEqual(['Boulangerie', 'Frais', 'Sans rayon']);
  });

  it('query → one untitled section with search results', () => {
    const s = pickerSections(products, 'eponge', groups);
    expect(s).toEqual([{ title: null, data: [products[3]] }]);
  });

  it('no products → no section', () => {
    expect(pickerSections([], '', groups)).toEqual([]);
    expect(pickerSections(products, 'zzz', groups)).toEqual([]);
  });
});
