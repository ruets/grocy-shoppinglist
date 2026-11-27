import { getLocales } from 'expo-localization';
import { localeFor, pickLanguage, setLanguage } from '.';

/**
 * Picks the UI language from the phone settings, once at startup. Kept out of
 * `./index` so Node scripts (integration test) can use the messages without
 * native modules; they stay in English.
 */
try {
  const locales = getLocales();
  const picked = pickLanguage(locales);
  setLanguage(picked, localeFor(picked, locales));
} catch {
  setLanguage('en');
}
