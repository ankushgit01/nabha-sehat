/**
 * i18n. To add a language: drop `<code>.json` (same keys as en.json — enforced by
 * tests/i18n.test.ts) into ./locales and add ONE entry to LANGUAGES below. No
 * component changes are needed; every screen reads strings through t().
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';
import pa from './locales/pa.json';
import type { Lang } from '../db/types';

export interface LanguageDef {
  code: Lang;
  /** Name written in its own script — recognisable before the UI language is set. */
  nativeName: string;
  /** Large glyph shown on the picker tile (script sample, not a flag: all three are Indian languages). */
  glyph: string;
  /** Spoken aloud on the picker when tapped, so non-readers can confirm. */
  spokenPrompt: string;
  fontFamily: string | undefined;
  resources: typeof en;
}

export const LANGUAGES: LanguageDef[] = [
  { code: 'pa', nativeName: 'ਪੰਜਾਬੀ', glyph: 'ੳ', spokenPrompt: 'ਪੰਜਾਬੀ', fontFamily: 'NotoSansGurmukhi', resources: pa },
  { code: 'hi', nativeName: 'हिन्दी', glyph: 'अ', spokenPrompt: 'हिन्दी', fontFamily: 'NotoSansDevanagari', resources: hi },
  { code: 'en', nativeName: 'English', glyph: 'A', spokenPrompt: 'English', fontFamily: undefined, resources: en },
];

export const DEFAULT_LANG: Lang = 'pa';

export function initI18n(lang: Lang) {
  if (i18n.isInitialized) {
    void i18n.changeLanguage(lang);
    return i18n;
  }
  void i18n.use(initReactI18next).init({
    resources: Object.fromEntries(LANGUAGES.map((l) => [l.code, { translation: l.resources }])),
    lng: lang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return i18n;
}

export function fontFor(lang: Lang) {
  return LANGUAGES.find((l) => l.code === lang)?.fontFamily;
}

export default i18n;

initI18n(DEFAULT_LANG);
