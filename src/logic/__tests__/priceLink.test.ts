import {
  effectiveTotal,
  effectiveUnitPrice,
  initPriceLink,
  priceLinkReducer as r,
} from '../priceLink';
import { formatInput, parseDecimal } from '../numbers';

describe('parseDecimal / formatInput', () => {
  it('accepte la virgule, les espaces et le symbole €', () => {
    expect(parseDecimal('1,20')).toBe(1.2);
    expect(parseDecimal(' 3.5 ')).toBe(3.5);
    expect(parseDecimal('2,5 €')).toBe(2.5);
    expect(parseDecimal(',5')).toBe(0.5);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('1,2,3')).toBeNull();
  });
  it('affiche avec une virgule, arrondi à 2 décimales', () => {
    expect(formatInput(1.2)).toBe('1,2');
    expect(formatInput(1.005)).toBe('1,01');
    expect(formatInput(3.3333)).toBe('3,33');
    expect(formatInput(null)).toBe('');
  });
});

describe('lien prix unitaire ↔ total', () => {
  it('préremplit total depuis le dernier prix', () => {
    const s = initPriceLink(3, 1.2);
    expect(s).toMatchObject({ unitText: '1,2', totalText: '3,6', anchor: 'unit' });
  });

  it('saisie du prix unitaire → total recalculé', () => {
    let s = initPriceLink(2, null);
    s = r(s, { type: 'unit', text: '1,25' });
    expect(s.totalText).toBe('2,5');
    expect(effectiveUnitPrice(s)).toBe(1.25);
    expect(effectiveTotal(s)).toBe(2.5);
  });

  it('saisie du total → prix unitaire recalculé', () => {
    let s = initPriceLink(3, 1);
    s = r(s, { type: 'total', text: '3,50' });
    expect(s.anchor).toBe('total');
    expect(s.unitText).toBe('1,17');
    // prix unitaire en pleine précision (4 décimales), pas l'arrondi affiché
    expect(effectiveUnitPrice(s)).toBe(1.1667);
    expect(effectiveTotal(s)).toBe(3.5);
  });

  it('changement de quantité : conserve le champ ancre', () => {
    let s = initPriceLink(1, 2); // ancre = unit
    s = r(s, { type: 'qty', qty: 4 });
    expect(s.unitText).toBe('2');
    expect(s.totalText).toBe('8');

    s = r(s, { type: 'total', text: '10' }); // ancre = total
    s = r(s, { type: 'qty', qty: 5 });
    expect(s.totalText).toBe('10');
    expect(s.unitText).toBe('2');
  });

  it('vider un champ vide l’autre', () => {
    let s = initPriceLink(2, 1);
    s = r(s, { type: 'unit', text: '' });
    expect(s.totalText).toBe('');
    expect(effectiveUnitPrice(s)).toBeNull();
    s = r(s, { type: 'total', text: '4' });
    expect(s.unitText).toBe('2');
    s = r(s, { type: 'total', text: '' });
    expect(s.unitText).toBe('');
  });

  it('quantité 0 avec ancre total : pas de division par zéro', () => {
    let s = initPriceLink(2, null);
    s = r(s, { type: 'total', text: '5' });
    s = r(s, { type: 'qty', qty: 0 });
    expect(s.unitText).toBe('2,5');
    expect(effectiveUnitPrice(s)).toBeNull();
  });

  it('quantité décimale', () => {
    let s = initPriceLink(1, null);
    s = r(s, { type: 'qty', qty: 0.5 });
    s = r(s, { type: 'unit', text: '12,90' });
    expect(s.totalText).toBe('6,45');
  });
});
