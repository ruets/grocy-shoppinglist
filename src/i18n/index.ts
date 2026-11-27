import { en } from './en';
import { fr, type Messages } from './fr';

export type Lang = 'fr' | 'en';
export type { Messages };

export interface LocaleLike {
  languageTag: string;
  languageCode: string | null;
}

const MESSAGES: Record<Lang, Messages> = { fr, en };
const DEFAULT_TAG: Record<Lang, string> = { fr: 'fr-FR', en: 'en-US' };

/** First of the phone's preferred languages the app speaks; French otherwise. */
export function pickLanguage(locales: LocaleLike[]): Lang {
  for (const l of locales) {
    if (l.languageCode === 'fr' || l.languageCode === 'en') return l.languageCode;
  }
  return 'fr';
}

/** BCP-47 tag for Intl: the phone's own variant of that language (e.g. en-GB) when it has one. */
export function localeFor(language: Lang, locales: LocaleLike[]): string {
  return locales.find((l) => l.languageCode === language)?.languageTag ?? DEFAULT_TAG[language];
}

let current: { lang: Lang; tag: string } = { lang: 'fr', tag: DEFAULT_TAG.fr };

export function setLanguage(language: Lang, tag: string = DEFAULT_TAG[language]): void {
  current = { lang: language, tag };
}

/** Messages of the current language. Read it at use time, not at module load. */
export function t(): Messages {
  return MESSAGES[current.lang];
}

export function lang(): Lang {
  return current.lang;
}

/** BCP-47 tag of the current language, for Intl and localeCompare. */
export function locale(): string {
  return current.tag;
}
