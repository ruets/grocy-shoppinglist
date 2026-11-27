import type { ShoppingLine } from '../../api/grocy';
import { normalizeBaseUrl } from '../../api/grocy';
import { formatBestBefore, NEVER_EXPIRES, parseUserDate, productDefaultBestBefore } from '../dates';
import { FREE_TEXT, groupLines, NO_GROUP } from '../grouping';
import { decideScan } from '../scan';
import { searchByName } from '../text';

const line = (p: Partial<ShoppingLine>): ShoppingLine => ({
  id: 1,
  shopping_list_id: 1,
  product_id: 1,
  note: '',
  amount: 1,
  done: false,
  qu_id: 1,
  product_name: 'X',
  last_price: null,
  product_group_name: null,
  paid_price: null,
  best_before: null,
  aisle_id: null,
  ...p,
});

describe('searchByName', () => {
  const items = [{ name: 'Crème fraîche' }, { name: 'Pâtes complètes' }, { name: 'Pain de mie' }];
  it('is accent- and case-insensitive', () => {
    expect(searchByName(items, 'creme').map((i) => i.name)).toEqual(['Crème fraîche']);
    expect(searchByName(items, 'PATES').map((i) => i.name)).toEqual(['Pâtes complètes']);
    expect(searchByName(items, 'pa').map((i) => i.name)).toEqual(['Pain de mie', 'Pâtes complètes']);
    expect(searchByName(items, 'fraiche crem')).toHaveLength(1);
  });
});

describe('groupLines', () => {
  it('sorted aisles, then no aisle, then free text', () => {
    const s = groupLines([
      line({ id: 1, product_id: null, note: 'Fleurs' }),
      line({ id: 2, product_group_name: 'Fruits' }),
      line({ id: 3 }),
      line({ id: 4, product_group_name: 'Boulangerie' }),
    ]);
    expect(s.map((x) => x.title)).toEqual(['Boulangerie', 'Fruits', NO_GROUP, FREE_TEXT]);
  });
});

describe('decideScan', () => {
  it('unchecked line → its amount', () => {
    const l = line({ id: 5, product_id: 9, amount: 3 });
    expect(decideScan(9, [l])).toEqual({ kind: 'line', line: l, amount: 3 });
  });
  it('already in cart → amount + 1', () => {
    const l = line({ id: 5, product_id: 9, amount: 2, done: true });
    expect(decideScan(9, [l])).toEqual({ kind: 'inCart', line: l, amount: 3 });
  });
  it('prefers the unchecked line', () => {
    const a = line({ id: 5, product_id: 9, done: true });
    const b = line({ id: 6, product_id: 9, amount: 2 });
    expect(decideScan(9, [a, b]).kind).toBe('line');
  });
  it('missing → off-list', () => {
    expect(decideScan(9, [line({ product_id: 1 })])).toEqual({ kind: 'offList', amount: 1 });
  });
});

describe('parseUserDate', () => {
  const today = new Date(2026, 10, 26);
  it('accepted formats', () => {
    expect(parseUserDate('03/12/2026', today)).toBe('2026-12-03');
    expect(parseUserDate('3/12/26', today)).toBe('2026-12-03');
    expect(parseUserDate('3/12', today)).toBe('2026-12-03');
    expect(parseUserDate('2027-01-05', today)).toBe('2027-01-05');
    expect(parseUserDate('31/02/2026', today)).toBeNull();
    expect(parseUserDate('', today)).toBeNull();
  });
});

describe('normalizeBaseUrl', () => {
  it('cleans up the URL', () => {
    expect(normalizeBaseUrl('grocy.lan/')).toBe('https://grocy.lan');
    expect(normalizeBaseUrl('http://10.0.0.2:9283/api/')).toBe('http://10.0.0.2:9283');
  });
});

describe('quick date entry', () => {
  const today = new Date(2026, 10, 26); // 26/11/2026
  it('digits only', () => {
    expect(parseUserDate('120327', today)).toBe('2027-03-12');
    expect(parseUserDate('12032028', today)).toBe('2028-03-12');
    expect(parseUserDate('0112', today)).toBe('2026-12-01');
  });
  it('no year: next year if the date has passed, otherwise current year', () => {
    expect(parseUserDate('1203', today)).toBe('2027-03-12');
    expect(parseUserDate('12/03', today)).toBe('2027-03-12');
    expect(parseUserDate('2611', today)).toBe('2026-11-26');
    expect(parseUserDate('3011', today)).toBe('2026-11-30');
  });
  it('rejections', () => {
    expect(parseUserDate('3102', today)).toBeNull();
    expect(parseUserDate('123', today)).toBeNull();
    expect(parseUserDate('12345', today)).toBeNull();
  });
  it('never expires', () => {
    expect(NEVER_EXPIRES).toBe('2999-12-31');
    expect(formatBestBefore(NEVER_EXPIRES)).toBe('jamais');
    expect(formatBestBefore('2026-12-03')).toBe('03/12/2026');
    expect(formatBestBefore(null)).toBe('');
  });
  it('product default', () => {
    expect(productDefaultBestBefore(5, today)).toBe('2026-12-01');
    expect(productDefaultBestBefore(-1, today)).toBe(NEVER_EXPIRES);
    expect(productDefaultBestBefore(0, today)).toBeNull();
    expect(productDefaultBestBefore(null, today)).toBeNull();
  });
});
