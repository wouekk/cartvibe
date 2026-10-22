/** One line of `assets/i18n/languages.json`: a language the interface offers. Adding a language adds a line here and a file. */
export interface LanguageEntry {
  /** BCP 47 style code, lower case ("en", "pl", "de", "pt-br"). Stored as is in the user's preferences. */
  code: string;
  /** The language's own name, shown in the language menu ("Polski"). There are no flags: a language is not a country. */
  label: string;
  /** The locale dates and numbers are formatted with ("pl", "en-US"). Its Angular data is registered in `locale-data.ts`. */
  locale: string;
}

/** CLDR plural categories, as `Intl.PluralRules` returns them. */
export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

/** `assets/i18n/<code>.json`. English is the key, so `en.json` is only the catalogue and is never fetched. */
export interface Dictionary {
  /** Translations keyed by the English text; `null` or `""` counts as missing and shows the English text. */
  messages: Record<string, string | null>;
  /** Noun forms keyed by the English singular, one entry per CLDR category the language's plural rule can return. */
  plurals?: Record<string, Partial<Record<PluralCategory, string | null>>>;
  /** Written by `i18n:sync`: translations whose English key was reworded, kept so they can be reused. */
  _orphaned?: Record<string, { value: string | null; closest?: string }>;
  /** Written by `i18n:sync --translate`: keys a machine translated, to be reviewed by a person. */
  _review?: string[];
}

/** The built-in fallback language, used until the registry is loaded. */
export const ENGLISH: LanguageEntry = { code: "en", label: "English", locale: "en-US" };
