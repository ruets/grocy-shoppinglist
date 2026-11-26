import {
  effectiveTotal,
  effectiveUnitPrice,
  initPriceLink,
  priceLinkReducer as r,
} from '../priceLink';
import { formatInput, parseDecimal } from '../numbers';

describe('parseDecimal / formatInput', () => {
  it('accepts comma, spaces and the € sign', () => {
    expect(parseDecimal('1,20')).toBe(1.2);
    expect(parseDecimal(' 3.5 ')).toBe(3.5);
    expect(parseDecimal('2,5 €')).toBe(2.5);
    expect(parseDecimal(',5')).toBe(0.5);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('1,2,3')).toBeNull();
  });
  it('formats with a comma, rounded to 2 decimals', () => {
    expect(formatInput(1.2)).toBe('1,2');
    expect(formatInput(1.005)).toBe('1,01');
    expect(formatInput(3.3333)).toBe('3,33');
    expect(formatInput(null)).toBe('');
  });
});

describe('unit price ↔ total link', () => {
  it('prefills the total from the last price', () => {
    const s = initPriceLink(3, 1.2);
    expect(s).toMatchObject({ unitText: '1,2', totalText: '3,6', anchor: 'unit' });
  });

  it('typing the unit price → total recomputed', () => {
    let s = initPriceLink(2, null);
    s = r(s, { type: 'unit', text: '1,25' });
    expect(s.totalText).toBe('2,5');
    expect(effectiveUnitPrice(s)).toBe(1.25);
    expect(effectiveTotal(s)).toBe(2.5);
  });

  it('typing the total → unit price recomputed', () => {
    let s = initPriceLink(3, 1);
    s = r(s, { type: 'total', text: '3,50' });
    expect(s.anchor).toBe('total');
    expect(s.unitText).toBe('1,17');
    // full-precision unit price (4 decimals), not the rounded display
    expect(effectiveUnitPrice(s)).toBe(1.1667);
    expect(effectiveTotal(s)).toBe(3.5);
  });

  it('amount change keeps the anchor field', () => {
    let s = initPriceLink(1, 2); // anchor = unit
    s = r(s, { type: 'qty', qty: 4 });
    expect(s.unitText).toBe('2');
    expect(s.totalText).toBe('8');

    s = r(s, { type: 'total', text: '10' }); // anchor = total
    s = r(s, { type: 'qty', qty: 5 });
    expect(s.totalText).toBe('10');
    expect(s.unitText).toBe('2');
  });

  it('clearing one field clears the other', () => {
    let s = initPriceLink(2, 1);
    s = r(s, { type: 'unit', text: '' });
    expect(s.totalText).toBe('');
    expect(effectiveUnitPrice(s)).toBeNull();
    s = r(s, { type: 'total', text: '4' });
    expect(s.unitText).toBe('2');
    s = r(s, { type: 'total', text: '' });
    expect(s.unitText).toBe('');
  });

  it('amount 0 with total anchor: no division by zero', () => {
    let s = initPriceLink(2, null);
    s = r(s, { type: 'total', text: '5' });
    s = r(s, { type: 'qty', qty: 0 });
    expect(s.unitText).toBe('2,5');
    expect(effectiveUnitPrice(s)).toBeNull();
  });

  it('decimal amount', () => {
    let s = initPriceLink(1, null);
    s = r(s, { type: 'qty', qty: 0.5 });
    s = r(s, { type: 'unit', text: '12,90' });
    expect(s.totalText).toBe('6,45');
  });
});
