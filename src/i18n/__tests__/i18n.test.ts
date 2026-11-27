import { lang, locale, localeFor, pickLanguage, setLanguage, t } from '..';

const L = (...tags: string[]) => tags.map((tag) => ({ languageTag: tag, languageCode: tag.split('-')[0] }));

describe('pickLanguage', () => {
  it('first supported language in preference order', () => {
    expect(pickLanguage(L('de-DE', 'en-GB', 'fr-FR'))).toBe('en');
    expect(pickLanguage(L('fr-CA'))).toBe('fr');
  });
  it('nothing supported → French', () => {
    expect(pickLanguage(L('ja-JP'))).toBe('fr');
    expect(pickLanguage([])).toBe('fr');
    expect(pickLanguage([{ languageTag: 'und', languageCode: null }])).toBe('fr');
  });
});

describe('localeFor', () => {
  it('keeps the region of the matching locale', () => {
    expect(localeFor('en', L('de-DE', 'en-GB'))).toBe('en-GB');
    expect(localeFor('fr', L('fr-CA'))).toBe('fr-CA');
  });
  it('defaults when the language is not among the locales', () => {
    expect(localeFor('en', L('ja-JP'))).toBe('en-US');
    expect(localeFor('fr', [])).toBe('fr-FR');
  });
});

describe('setLanguage', () => {
  afterEach(() => setLanguage('fr'));
  it('switches messages, language and locale', () => {
    setLanguage('en', 'en-GB');
    expect(lang()).toBe('en');
    expect(locale()).toBe('en-GB');
    expect(t().common.cancel).toBe('Cancel');
    setLanguage('fr');
    expect(locale()).toBe('fr-FR');
    expect(t().common.cancel).toBe('Annuler');
  });
});
