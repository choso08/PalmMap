import { getLocales } from 'expo-localization';

import { en } from './en';
import { pt } from './pt';

/**
 * The app's languages.
 *
 * ## How the language is chosen
 *
 * On "automatic" it follows **the phone's language**, not the country the
 * person is in. That is deliberate: a Portuguese person travelling still wants
 * the app in Portuguese, and that is what "automatic" means in any other app.
 * Anyone who wants something else picks it by hand in the settings.
 *
 * Any language other than Portuguese falls back to English. That is not
 * laziness — it is the usual rule: English is the fallback language, and
 * adding a new language is just a matter of putting a file next to `en.ts`.
 *
 * ## Why there are two ways to reach it
 *
 * Components use `useT()`, which is a hook and makes the screen re-render when
 * the language changes. **Services cannot use hooks** and still throw errors
 * with messages — for those there is `t()`, which reads the language from a
 * module variable. It is the same table, by two routes.
 *
 * ## When adding new text
 *
 * Add the key to `pt.ts` **and** to `en.ts`. `en.ts` is typed against `pt.ts`,
 * so forgetting one side is a compile error rather than a Portuguese word
 * appearing in the middle of English. It is the only automated check this
 * project has — it is worth it catching this.
 */

export type Language = 'pt' | 'en';

/** What is stored in the settings: a language, or follow the phone. */
export type LanguagePreference = 'auto' | Language;

export type Strings = typeof pt;

const TABLES: Record<Language, Strings> = { pt, en };

/** The phone's language, if it is one the app speaks. */
export function deviceLanguage(): Language {
  try {
    // `getLocales()` comes in order of preference. The first one the app speaks
    // wins: a phone in French with Portuguese second ends up in Portuguese.
    for (const locale of getLocales()) {
      const code = locale.languageCode?.toLowerCase();
      if (code === 'pt' || code === 'en') {
        return code;
      }
    }
  } catch {
    // With no information from the system, English is the least bad for
    // everyone.
  }
  return 'en';
}

/** The language to use, taking the stored preference into account. */
export function resolveLanguage(preference: LanguagePreference): Language {
  return preference === 'auto' ? deviceLanguage() : preference;
}

/**
 * The language the services speak.
 *
 * It lives in a module variable because services have no access to React's
 * context. The `SettingsProvider` sets it whenever the preference changes.
 */
let active: Language = 'pt';

export function setActiveLanguage(language: Language): void {
  active = language;
}

export function activeLanguage(): Language {
  return active;
}

/** The strings, for code that cannot use hooks. */
export function t(): Strings {
  return TABLES[active];
}

/** The strings of one specific language. */
export function stringsFor(language: Language): Strings {
  return TABLES[language];
}

/**
 * The language tag for the navigation voice.
 *
 * `expo-speech` picks the voice from this. Without it, English instructions
 * came out read with a Portuguese accent — understandable, but it sounds wrong
 * and, while driving, what matters is being understood the first time.
 */
export function speechTag(language: Language): string {
  return language === 'pt' ? 'pt-PT' : 'en-GB';
}

/**
 * The language to ask Nominatim for, in `accept-language`.
 *
 * It makes the search return names in the app's language wherever
 * OpenStreetMap has them translated — "Lisbon" instead of "Lisboa" for someone
 * using English.
 */
export function acceptLanguage(language: Language): string {
  return language === 'pt' ? 'pt-PT,pt' : 'en';
}
