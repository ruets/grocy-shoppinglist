import { GrocyClient, GrocyError } from '../../api/grocy';
import { setLanguage } from '../../i18n';
import { APP_USERFIELDS, describeFix, evaluateCheckup } from '../checkup';
import { groupLines } from '../grouping';
import { formatBestBefore, NEVER_EXPIRES, parseBestBeforeText } from '../dates';
import { formatInput, makeMoneyFormatter, parseDecimal } from '../numbers';

describe('formats follow the language', () => {
  afterEach(() => setLanguage('fr'));

  it('French: decimal comma, euro-style money, « jamais »', () => {
    expect(formatInput(1.5)).toBe('1,5');
    expect(makeMoneyFormatter('EUR')(1.5).replace(/\s/g, ' ')).toBe('1,50 €');
    expect(formatBestBefore(NEVER_EXPIRES)).toBe('jamais');
  });

  it('English: decimal point, region money, « never »', () => {
    setLanguage('en', 'en-US');
    expect(formatInput(1.5)).toBe('1.5');
    expect(makeMoneyFormatter('USD')(1.5)).toBe('$1.50');
    expect(formatBestBefore(NEVER_EXPIRES)).toBe('never');
    expect(formatBestBefore('2027-03-12')).toBe('12/03/2027');
  });

  it('input accepts both separators in both languages', () => {
    expect(parseDecimal('1.5')).toBe(1.5);
    expect(parseDecimal('1,5')).toBe(1.5);
    setLanguage('en');
    expect(parseDecimal('1,5')).toBe(1.5);
    expect(parseDecimal('1.5')).toBe(1.5);
  });

  it('« jamais » and « never » both mean never expires', () => {
    expect(parseBestBeforeText('never')).toBe(NEVER_EXPIRES);
    setLanguage('en');
    expect(parseBestBeforeText('Jamais')).toBe(NEVER_EXPIRES);
    expect(parseBestBeforeText('1203')).toMatch(/-03-12$/);
    expect(parseBestBeforeText('zz')).toBe('invalid');
  });
});

describe('logic texts in English', () => {
  beforeEach(() => setLanguage('en'));
  afterEach(() => setLanguage('fr'));

  it('checkup labels and fixes', () => {
    expect(describeFix({ kind: 'createList' })).toBe('Create the list "Liste de courses"');
    expect(describeFix({ kind: 'createUserfields', fields: APP_USERFIELDS.slice(0, 1) })).toBe(
      'Create the field Prix payé (app)',
    );
    const r = evaluateCheckup({
      server: { ok: false, error: new GrocyError('x', 401, 'auth') },
      lists: [],
      selectedListId: null,
      userfields: [],
      locations: [],
      newProductLocationId: null,
      units: 0,
    });
    expect(r[0].label).toBe('API key rejected');
  });

  it('list section titles', () => {
    const base = { shopping_list_id: 1, amount: 1, done: false, qu_id: 1, last_price: null, paid_price: null, best_before: null, aisle_id: null };
    const s = groupLines(
      [
        { ...base, id: 1, product_id: 1, note: '', product_name: 'A', product_group_name: null },
        { ...base, id: 2, product_id: null, note: 'B', product_name: null, product_group_name: null },
      ],
      new Map(),
    );
    expect(s.map((x) => x.title)).toEqual(['No aisle', 'Off-stock items']);
  });

  it('Grocy errors', () => {
    const fetchImpl = jest.fn(async () => new Response('', { status: 401 }));
    return expect(new GrocyClient('https://g.test', 'k', fetchImpl).getSystemInfo()).rejects.toThrow(
      'Grocy rejected the API key (401).',
    );
  });
});
